-- =====================================================================
-- Callejero: «Restablecer» lo fallado
-- =====================================================================
-- En Repasar, «Lo fallado» junta lo que la última vez se respondió mal.
-- «Restablecer» lo vacía: desde esa fecha solo cuenta lo que se vuelva a
-- fallar. Una fila por alumno (la suya). Se puede aplicar más de una vez.
-- =====================================================================
create table if not exists public.callejero_fallos_reinicio (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  desde timestamptz not null default now()
);
alter table public.callejero_fallos_reinicio enable row level security;
drop policy if exists "callejero_fallos_reinicio propio" on public.callejero_fallos_reinicio;
create policy "callejero_fallos_reinicio propio" on public.callejero_fallos_reinicio
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
