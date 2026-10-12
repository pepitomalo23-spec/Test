-- =====================================================================
-- Específico: nota propia de cada pregunta (texto y hasta 5 imágenes),
-- aparte de la explicación fija. Botón del lápiz junto a la estrella en
-- los tests (js/especifico-test.js). Privada de cada uno. Las imágenes van
-- al almacén «question-notes» (carpeta esp-<pregunta>), como las notas de
-- Legislación. Se borra sola si se borra la pregunta.
-- Se puede aplicar más de una vez.
-- =====================================================================

create table if not exists public.especifico_notas (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  pregunta_id uuid not null references public.especifico_preguntas(id) on delete cascade,
  texto text,
  imagenes text[] not null default '{}',
  updated_at timestamptz not null default now(),
  primary key (user_id, pregunta_id)
);
alter table public.especifico_notas enable row level security;
drop policy if exists "especifico_notas propias" on public.especifico_notas;
create policy "especifico_notas propias" on public.especifico_notas
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
