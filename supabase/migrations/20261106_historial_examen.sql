-- =====================================================================
-- Historial de pruebas: el examen del calendario (modo 'examen'). Es el
-- examen de un día (js/pruebas.js): solo lo que entra en él, con el formato
-- de «Tu examen», reloj que no se para, sin decir de qué tema es cada
-- pregunta y un solo intento.
-- Se puede aplicar más de una vez.
-- =====================================================================
set lock_timeout = '5s';

alter table public.historial_pruebas drop constraint if exists historial_pruebas_modo_check,
  add constraint historial_pruebas_modo_check
  check (modo in ('conjunto', 'esp-estudio', 'esp-fallos', 'esp-simulacro', 'esp-examen', 'esp-tb', 'oficial', 'examen'));
