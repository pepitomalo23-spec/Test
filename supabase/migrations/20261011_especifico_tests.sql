-- =====================================================================
-- Específico: los tests de cada tema (las filas con el tick verde).
-- Los añade y quita el administrador; los ven todos los usuarios
-- aprobados y no bloqueados.
--   tema:   clave del tema en la app (js/especifico.js, p. ej. 'fuego').
--   titulo: lo que se ve tras «Test -».
--   orden:  posición dentro del tema.
-- Se puede aplicar más de una vez.
-- =====================================================================

create table if not exists public.especifico_tests (
  id uuid primary key default gen_random_uuid(),
  tema text not null check (tema ~ '^[a-z0-9-]{1,40}$'),
  titulo text not null check (char_length(btrim(titulo)) between 1 and 300),
  orden int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists especifico_tests_tema on public.especifico_tests (tema, orden);
alter table public.especifico_tests enable row level security;

drop policy if exists "especifico_tests lectura" on public.especifico_tests;
create policy "especifico_tests lectura" on public.especifico_tests
  for select to authenticated
  using (exists (select 1 from public.profiles p
                  where p.id = (select auth.uid()) and (p.approved or p.is_admin) and not coalesce(p.blocked, false)));

drop policy if exists "especifico_tests admin" on public.especifico_tests;
create policy "especifico_tests admin" on public.especifico_tests
  for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.is_admin))
  with check (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.is_admin));
