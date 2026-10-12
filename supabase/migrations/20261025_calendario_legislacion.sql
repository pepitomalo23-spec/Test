-- =====================================================================
-- Calendario: una tarea puede llevar un test de Legislación.
--   legis = { temas: [topic_id], modo: 'estudio'|'examen', cuantas: n|null,
--             run: { ids, ord, answers, blanked, visited, index,
--                    hechas, total, at, fin, nota } | null }
-- run es el intento en curso (preguntas elegidas, orden de sus opciones y
-- respuestas), para seguir por donde se dejó en cualquier dispositivo.
-- Se puede aplicar más de una vez.
-- =====================================================================

alter table public.calendario_tareas add column if not exists legis jsonb;
