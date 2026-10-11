-- =====================================================================
-- Los tests hechos en la vista de tutorbomberos (js/especifico-test.js)
-- también van al historial (modo 'esp-tb'): cada vez que se entra a un
-- test o a «Preguntas marcadas» y se responde algo es una prueba, que se
-- puede revisar y borrar (y al borrarla se van sus respuestas).
-- Se puede aplicar más de una vez.
-- =====================================================================

alter table public.historial_pruebas drop constraint if exists historial_pruebas_modo_check,
  add constraint historial_pruebas_modo_check
  check (modo in ('conjunto', 'esp-estudio', 'esp-fallos', 'esp-simulacro', 'esp-examen', 'esp-tb'));
