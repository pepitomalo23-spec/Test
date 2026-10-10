-- =====================================================================
-- Específico: las explicaciones (con sus imágenes) son casi todo el peso
-- de las preguntas (161 de 163 MB). Al abrir un test ya no se descargan:
-- basta con saber si la pregunta tiene explicación, y la explicación se
-- pide solo cuando se abre (js/especifico-test.js, ESPT.explicacion).
-- Se puede aplicar más de una vez.
-- =====================================================================

alter table public.especifico_preguntas
  add column if not exists tiene_explicacion boolean generated always as (explicacion <> '') stored;
