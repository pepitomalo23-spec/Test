-- Simulacro conjunto como tarea del calendario: { fin, nota }. Ese día sale con «Hacer» y,
-- al terminarlo (js/pruebas.js → CAL.terminarSimulacro), la tarea queda hecha.
alter table calendario_tareas add column if not exists simulacro jsonb;
