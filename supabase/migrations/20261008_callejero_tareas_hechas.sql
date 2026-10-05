-- =====================================================================
-- Callejero: tareas que el alumno da por vistas («Ya la he visto»)
-- =====================================================================
-- Hasta que el alumno marca una tarea, se queda en «Lo que te ha mandado»
-- y nada de ella sale en Repasar; al marcarla, sus calles y su temario
-- pasan a Repasar. Cada uno, las suyas. Se puede aplicar más de una vez.
-- =====================================================================
create table if not exists public.callejero_tareas_hechas (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  tarea_id bigint not null references public.callejero_tareas(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, tarea_id)
);
alter table public.callejero_tareas_hechas enable row level security;
drop policy if exists "callejero_tareas_hechas propias" on public.callejero_tareas_hechas;
create policy "callejero_tareas_hechas propias" on public.callejero_tareas_hechas
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
