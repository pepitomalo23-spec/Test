-- =====================================================================
-- Calendario: lo que cada alumno se apunta para estudiar cada día.
-- Privado: cada uno ve y cambia solo lo suyo.
--   categoria: de qué va (normativas, legislacion, callejero, especifico,
--              test, fisico, repaso, otro); da el color en la app.
--   serie:     las tareas creadas a la vez con «Repetir» comparten serie,
--              para poder borrar las siguientes de golpe.
-- Se puede aplicar más de una vez.
-- =====================================================================

create table if not exists public.calendario_tareas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  fecha date not null,
  titulo text not null check (char_length(btrim(titulo)) between 1 and 200),
  nota text check (nota is null or char_length(nota) <= 1000),
  categoria text not null default 'otro'
    check (categoria in ('normativas', 'legislacion', 'callejero', 'especifico', 'test', 'fisico', 'repaso', 'otro')),
  hecho boolean not null default false,
  orden int not null default 0,
  serie uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists calendario_tareas_user_fecha on public.calendario_tareas (user_id, fecha);
alter table public.calendario_tareas enable row level security;
drop policy if exists "calendario_tareas propias" on public.calendario_tareas;
create policy "calendario_tareas propias" on public.calendario_tareas
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
