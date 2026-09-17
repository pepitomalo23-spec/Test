ALTER TABLE public.test_sessions
  ADD COLUMN IF NOT EXISTS pending_question_ids jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.test_sessions.pending_question_ids IS
  'ids de las preguntas que quedaron sin ver/responder al finalizar el test antes de tiempo, para poder "Retomar" desde el Historial.';
