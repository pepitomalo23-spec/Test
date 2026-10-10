-- =====================================================================
-- Específico: las preguntas de cada test (las que trae el marcador de
-- tutorbomberos.es y se guardan en Administración › importar).
-- Las escribe el administrador; las leen los usuarios aprobados.
--   enunciado/explicacion: HTML ya limpio (solo <br>, <b>, <i> e <img>).
--   opciones: [{ "l": "a", "html": "…" }, …]
--   correcta: letra de la correcta ('' si la web no la confirmó).
--   confirmada: la web de origen confirmó cuál es la correcta.
-- Al borrar un test se borran sus preguntas.
-- Se puede aplicar más de una vez.
-- =====================================================================

create table if not exists public.especifico_preguntas (
  id uuid primary key default gen_random_uuid(),
  test_id uuid not null references public.especifico_tests(id) on delete cascade,
  orden int not null default 0,
  enunciado text not null check (char_length(enunciado) between 1 and 2000000),
  opciones jsonb not null default '[]'::jsonb check (jsonb_typeof(opciones) = 'array'),
  correcta text not null default '' check (correcta ~ '^[a-z]?$'),
  confirmada boolean not null default true,
  explicacion text not null default '' check (char_length(explicacion) <= 2000000),
  origen text,
  created_at timestamptz not null default now()
);
create index if not exists especifico_preguntas_test on public.especifico_preguntas (test_id, orden);
alter table public.especifico_preguntas enable row level security;

drop policy if exists "especifico_preguntas lectura" on public.especifico_preguntas;
create policy "especifico_preguntas lectura" on public.especifico_preguntas
  for select to authenticated
  using (exists (select 1 from public.profiles p
                  where p.id = (select auth.uid()) and (p.approved or p.is_admin) and not coalesce(p.blocked, false)));

drop policy if exists "especifico_preguntas admin" on public.especifico_preguntas;
create policy "especifico_preguntas admin" on public.especifico_preguntas
  for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.is_admin))
  with check (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.is_admin));
