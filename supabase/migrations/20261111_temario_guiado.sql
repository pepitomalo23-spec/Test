-- =====================================================================
-- Estudio › Temario: temas explicados paso a paso (Específico y
-- Legislación), con preguntas al final para comprobar que se ha entendido.
--   temario_temas: el contenido. Lo escribe Claude desde la base de datos
--     (service_role); en la app solo se lee, y de momento solo lo ve el
--     administrador.
--   temario_progreso: por dónde va cada uno en cada tema y sus dudas
--     (Claude las lee para explicar mejor lo que no se entiende).
--   temario_intentos: cada vez que se responden las preguntas de un tema.
-- Se puede aplicar más de una vez.
-- =====================================================================
set lock_timeout = '5s';

create table if not exists public.temario_temas (
  id uuid primary key default gen_random_uuid(),
  area text not null check (area in ('especifico', 'legislacion')),
  titulo text not null check (length(btrim(titulo)) between 1 and 200),
  resumen text not null default '',
  orden integer not null default 0,
  -- [{ "titulo": "…", "html": "…" }, …]: la explicación, paso a paso.
  pasos jsonb not null default '[]'::jsonb check (jsonb_typeof(pasos) = 'array'),
  -- [{ "enunciado": "…", "opciones": ["…", …], "correcta": 0, "explicacion": "…", "paso": 0 }, …]
  preguntas jsonb not null default '[]'::jsonb check (jsonb_typeof(preguntas) = 'array'),
  publicado boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists temario_temas_area on public.temario_temas(area, orden);
alter table public.temario_temas enable row level security;

drop policy if exists "temario_temas leer admin" on public.temario_temas;
create policy "temario_temas leer admin" on public.temario_temas
  for select to authenticated
  using (publicado and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.is_admin));

revoke all on public.temario_temas from anon;
grant select on public.temario_temas to authenticated;
grant select, insert, update, delete on public.temario_temas to service_role;

create table if not exists public.temario_progreso (
  user_id uuid not null references auth.users(id) on delete cascade,
  tema_id uuid not null references public.temario_temas(id) on delete cascade,
  paso integer not null default 0,
  leido boolean not null default false,
  dudas text not null default '' check (length(dudas) <= 5000),
  updated_at timestamptz not null default now(),
  primary key (user_id, tema_id)
);
create index if not exists temario_progreso_tema on public.temario_progreso(tema_id);
alter table public.temario_progreso enable row level security;

drop policy if exists "temario_progreso propio" on public.temario_progreso;
create policy "temario_progreso propio" on public.temario_progreso
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

revoke all on public.temario_progreso from anon;
grant select, insert, update, delete on public.temario_progreso to authenticated;
grant select, insert, update, delete on public.temario_progreso to service_role;

create table if not exists public.temario_intentos (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  tema_id uuid not null references public.temario_temas(id) on delete cascade,
  aciertos integer not null check (aciertos >= 0),
  total integer not null check (total >= 0),
  -- La opción elegida en cada pregunta (índice), en el orden del tema.
  respuestas jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists temario_intentos_usuario on public.temario_intentos(user_id, tema_id, created_at desc);
create index if not exists temario_intentos_tema on public.temario_intentos(tema_id);
alter table public.temario_intentos enable row level security;

drop policy if exists "temario_intentos leer propio" on public.temario_intentos;
create policy "temario_intentos leer propio" on public.temario_intentos
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "temario_intentos crear propio" on public.temario_intentos;
create policy "temario_intentos crear propio" on public.temario_intentos
  for insert to authenticated with check (user_id = (select auth.uid()));

revoke all on public.temario_intentos from anon;
grant select, insert on public.temario_intentos to authenticated;
grant select, insert, update, delete on public.temario_intentos to service_role;
