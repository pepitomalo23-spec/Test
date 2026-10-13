-- =====================================================================
-- Legislación separada por fuente también en el historial y las
-- estadísticas: cada sesión de test lleva de qué fuente eran sus preguntas
-- ('pj' = pj.fire, 'tb' = tutorbomberos). Las de antes se clasifican por
-- sus respuestas (si alguna es de una pregunta de tutorbomberos, 'tb').
-- Se puede aplicar más de una vez.
-- =====================================================================

alter table public.test_sessions add column if not exists fuente text not null default 'pj';
alter table public.test_sessions drop constraint if exists test_sessions_fuente_check;
alter table public.test_sessions add constraint test_sessions_fuente_check check (fuente in ('pj', 'tb'));
create index if not exists test_sessions_user_fuente_idx on public.test_sessions (user_id, fuente, created_at desc);
update public.test_sessions s set fuente = 'tb'
where s.fuente = 'pj' and exists (
  select 1 from public.session_answers a join public.questions q on q.id = a.question_id
  where a.session_id = s.id and q.fuente = 'tb');
