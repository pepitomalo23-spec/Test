-- =====================================================================
-- Específico:
--  1) dificultad de cada pregunta (la franja de color de tutorbomberos):
--     'facil' (verde), 'media' (amarilla), 'dificil' (roja); '' si no se
--     sabe. La recoge el marcador al importar.
--  2) preguntas marcadas con la estrella: de cada usuario y privadas.
--     Se borran solas si se borra la pregunta.
-- Se puede aplicar más de una vez.
-- =====================================================================

alter table public.especifico_preguntas
  add column if not exists dificultad text not null default ''
  check (dificultad in ('', 'facil', 'media', 'dificil'));

create table if not exists public.especifico_marcadas (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  pregunta_id uuid not null references public.especifico_preguntas(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, pregunta_id)
);
create index if not exists especifico_marcadas_pregunta on public.especifico_marcadas (pregunta_id);
alter table public.especifico_marcadas enable row level security;
drop policy if exists "especifico_marcadas propias" on public.especifico_marcadas;
create policy "especifico_marcadas propias" on public.especifico_marcadas
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
