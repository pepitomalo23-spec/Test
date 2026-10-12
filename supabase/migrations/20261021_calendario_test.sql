-- =====================================================================
-- Calendario: una tarea puede llevar un test del Específico (js/calendario.js).
-- Desde la tarea se abre el test, y lo respondido se guarda en la propia
-- tarea (progreso) para seguir por donde se dejó, en cualquier dispositivo:
--   progreso = { resp: { pregunta_id: letra }, sesion: { id, inicio, created_at }, total }
-- sesion.id es la prueba del historial (historial_pruebas, modo 'esp-tb').
-- Si el administrador borra el test, la tarea se queda sin él.
-- Se puede aplicar más de una vez.
-- =====================================================================

alter table public.calendario_tareas add column if not exists test_id uuid references public.especifico_tests(id) on delete set null;
alter table public.calendario_tareas add column if not exists progreso jsonb;
