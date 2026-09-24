-- =====================================================================
-- Descarga incremental de preguntas
-- =====================================================================
-- Antes, cada entrada a la app descargaba el banco completo de preguntas
-- (~2,5 MB). Ahora la app las guarda en el dispositivo y solo pide:
--   - las preguntas con updated_at posterior a su última descarga, y
--   - los id borrados desde entonces (tabla questions_deleted).
-- Así se ahorra transferencia de Supabase y la app arranca más rápido.
-- =====================================================================

alter table public.questions add column if not exists updated_at timestamptz not null default now();
create index if not exists questions_updated_at_idx on public.questions(updated_at);

create or replace function public.questions_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists questions_touch_updated_at on public.questions;
create trigger questions_touch_updated_at
  before update on public.questions
  for each row execute function public.questions_touch_updated_at();

create table if not exists public.questions_deleted (
  id bigint primary key,
  deleted_at timestamptz not null default now()
);
create index if not exists questions_deleted_at_idx on public.questions_deleted(deleted_at);

alter table public.questions_deleted enable row level security;
drop policy if exists "read questions_deleted" on public.questions_deleted;
create policy "read questions_deleted" on public.questions_deleted
  for select to authenticated using (true);

create or replace function public.questions_log_delete()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.questions_deleted(id, deleted_at) values (old.id, now())
  on conflict (id) do update set deleted_at = excluded.deleted_at;
  return old;
end;
$$;

drop trigger if exists questions_log_delete on public.questions;
create trigger questions_log_delete
  after delete on public.questions
  for each row execute function public.questions_log_delete();

-- Si un id borrado vuelve a usarse, deja de contar como borrado.
create or replace function public.questions_unlog_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from public.questions_deleted where id = new.id;
  return new;
end;
$$;

drop trigger if exists questions_unlog_insert on public.questions;
create trigger questions_unlog_insert
  after insert on public.questions
  for each row execute function public.questions_unlog_insert();
