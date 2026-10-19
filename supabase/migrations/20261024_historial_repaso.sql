-- Historial de pruebas: el modo «repaso» (Inicio › semana del examen: repetir las
-- falladas o hacer las que faltan de un tema, js/pruebas.js PRU.repasar).
alter table public.historial_pruebas drop constraint if exists historial_pruebas_modo_check;
alter table public.historial_pruebas add constraint historial_pruebas_modo_check
  check (modo = any (array['conjunto','esp-estudio','esp-fallos','esp-simulacro','esp-examen','esp-tb','oficial','examen','repaso']));
