-- =====================================================================
-- Calendario: una tarea puede ser un examen (categoría 'examen') con lo
-- que entra en él:
--   examen = { legis: [topic_id], esp: [clave del tema del Específico] }
-- Inicio enseña el examen más cercano y cómo vas en esos temas.
-- Se puede aplicar más de una vez.
-- =====================================================================
set lock_timeout = '5s';

alter table public.calendario_tareas add column if not exists examen jsonb;

alter table public.calendario_tareas drop constraint if exists calendario_tareas_categoria_check,
  add constraint calendario_tareas_categoria_check
  check (categoria in ('normativas', 'legislacion', 'callejero', 'especifico', 'test', 'examen', 'fisico', 'repaso', 'otro'));
