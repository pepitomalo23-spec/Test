-- =====================================================================
-- Específico: respuestas de cada alumno (para Estadísticas › Específico).
-- Una fila por pregunta contestada en un test o en «Preguntas marcadas».
-- Cada uno ve y escribe solo las suyas. Se borran solas si se borra la
-- pregunta (o su test, que borra sus preguntas).
-- Se puede aplicar más de una vez.
-- =====================================================================

create table if not exists public.especifico_respuestas (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  pregunta_id uuid not null references public.especifico_preguntas(id) on delete cascade,
  acierto boolean not null,
  created_at timestamptz not null default now()
);
create index if not exists especifico_respuestas_usuario on public.especifico_respuestas (user_id, id);
create index if not exists especifico_respuestas_pregunta on public.especifico_respuestas (pregunta_id);
alter table public.especifico_respuestas enable row level security;
drop policy if exists "especifico_respuestas leer propias" on public.especifico_respuestas;
create policy "especifico_respuestas leer propias" on public.especifico_respuestas
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "especifico_respuestas escribir propias" on public.especifico_respuestas;
create policy "especifico_respuestas escribir propias" on public.especifico_respuestas
  for insert to authenticated with check (user_id = (select auth.uid()));
