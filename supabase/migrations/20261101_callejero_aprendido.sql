-- =====================================================================
-- Callejero: lo que el alumno marca como aprendido («Me lo sé» en Aprender)
-- =====================================================================
-- Cada paso de Aprender ('distritos', 'barrios:<distrito>', 'grandes',
-- 'plazas', 'barrio:<barrio>') se marca cuando uno ya se lo sabe y entonces
-- pasa a Repasar. Cada uno, las suyas. Se puede aplicar más de una vez.
-- =====================================================================
create table if not exists public.callejero_aprendido (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  clave text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, clave)
);
alter table public.callejero_aprendido enable row level security;
drop policy if exists "callejero_aprendido propias" on public.callejero_aprendido;
create policy "callejero_aprendido propias" on public.callejero_aprendido
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
