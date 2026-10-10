-- =====================================================================
-- Específico: preguntas quitadas de Fallos («Quitar de Fallos» del panel
-- de pj.fire, js/pruebas.js), como dismissed_fails en Legislación. Una
-- pregunta quitada no sale en Fallos hasta que se vuelve a fallar después
-- de quitarla; en Estadísticas sigue contando igual. Privada de cada uno.
-- Se puede aplicar más de una vez.
-- =====================================================================

create table if not exists public.especifico_descartadas (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  pregunta_id uuid not null references public.especifico_preguntas(id) on delete cascade,
  descartada_at timestamptz not null default now(),
  primary key (user_id, pregunta_id)
);
create index if not exists especifico_descartadas_pregunta on public.especifico_descartadas (pregunta_id);
alter table public.especifico_descartadas enable row level security;
drop policy if exists "especifico_descartadas propias" on public.especifico_descartadas;
create policy "especifico_descartadas propias" on public.especifico_descartadas
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
