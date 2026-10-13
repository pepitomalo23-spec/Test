-- =====================================================================
-- Legislación: de dónde es cada pregunta. 'pj' = las de pj.fire (todas las
-- de antes); 'tb' = las de tutorbomberos (se importan con el marcador).
-- En la app van siempre separadas: arriba de Legislación se elige la
-- fuente y todo (tests, fallos, estadísticas) usa solo las suyas.
-- origen_test: el test de tutorbomberos del que salió (para actualizarla
-- al volver a pasar el marcador, sin duplicar).
-- Se puede aplicar más de una vez.
-- =====================================================================

alter table public.questions add column if not exists fuente text not null default 'pj';
alter table public.questions drop constraint if exists questions_fuente_check;
alter table public.questions add constraint questions_fuente_check check (fuente in ('pj', 'tb'));
alter table public.questions add column if not exists origen_test text;
create index if not exists questions_topic_fuente_idx on public.questions (topic_id, fuente);
