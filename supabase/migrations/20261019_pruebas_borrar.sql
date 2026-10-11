-- =====================================================================
-- Borrar una prueba del historial (js/pruebas.js) quita también lo que
-- metió en Estadísticas y Fallos: sus respuestas del Específico y la
-- sesión «conjunto» de su parte de Legislación. Para saber cuáles son,
-- llevan el id de la prueba (historial_pruebas.id, que pone el cliente).
-- Se puede aplicar más de una vez.
-- =====================================================================

alter table public.especifico_respuestas add column if not exists prueba_id uuid;
create index if not exists especifico_respuestas_prueba on public.especifico_respuestas (user_id, prueba_id) where prueba_id is not null;
drop policy if exists "especifico_respuestas borrar propias" on public.especifico_respuestas;
create policy "especifico_respuestas borrar propias" on public.especifico_respuestas
  for delete to authenticated using (user_id = (select auth.uid()));

alter table public.test_sessions add column if not exists prueba_id uuid;
create index if not exists test_sessions_prueba on public.test_sessions (user_id, prueba_id) where prueba_id is not null;
