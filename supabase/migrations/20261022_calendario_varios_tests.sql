-- =====================================================================
-- Calendario: una tarea puede llevar varios tests del Específico (por
-- ejemplo, todos los de un tema). test_ids es la lista, en orden; test_id
-- se queda con el primero (tareas de antes). El avance va por test:
--   progreso = { porTest: { test_id: { resp, sesion, total } } }
-- (las tareas de antes, con un solo test, guardaban { resp, sesion, total }).
-- Se puede aplicar más de una vez.
-- =====================================================================

alter table public.calendario_tareas add column if not exists test_ids uuid[];
update public.calendario_tareas set test_ids = array[test_id] where test_id is not null and test_ids is null;
