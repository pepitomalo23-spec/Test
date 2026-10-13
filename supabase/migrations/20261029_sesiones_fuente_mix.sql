-- =====================================================================
-- Legislación vuelve a ser una sola: la fuente (pj.fire / tutorbomberos) se
-- elige al preparar cada test («Preguntas de»: Todas, pj.fire o
-- Tutorbombero). Un test con preguntas de las dos lleva fuente 'mix'.
-- Se puede aplicar más de una vez.
-- =====================================================================

alter table public.test_sessions drop constraint if exists test_sessions_fuente_check;
alter table public.test_sessions add constraint test_sessions_fuente_check check (fuente in ('pj', 'tb', 'mix'));
