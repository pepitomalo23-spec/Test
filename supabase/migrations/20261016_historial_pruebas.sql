-- =====================================================================
-- Historial propio del Simulacro conjunto (Legislación + Específico) y de
-- los modos del Específico con el panel de pj.fire (Estudio, Fallos,
-- Simulacro, Examen); los usa js/pruebas.js. Una fila por prueba
-- terminada: nota, tiempo, resumen por parte y qué preguntas salieron y qué
-- se respondió (para poder revisarla después). Privado de cada usuario.
-- Se puede aplicar más de una vez.
-- =====================================================================

create table if not exists public.historial_pruebas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  modo text not null check (modo in ('conjunto', 'esp-estudio', 'esp-fallos', 'esp-simulacro', 'esp-examen')),
  nota numeric(5, 2) not null default 0,
  segundos integer not null default 0,
  resumen jsonb not null default '{}'::jsonb,      -- { todo: {total, bien, mal, blanco, nota}, l: {…}, e: {…} }
  preguntas jsonb not null default '[]'::jsonb,    -- [{ k: 'l'|'e', id, orden? }]
  respuestas jsonb not null default '[]'::jsonb,   -- índice elegido de cada una (null = en blanco)
  created_at timestamptz not null default now()
);
create index if not exists historial_pruebas_usuario on public.historial_pruebas (user_id, created_at desc);
alter table public.historial_pruebas enable row level security;
drop policy if exists "historial_pruebas propias" on public.historial_pruebas;
create policy "historial_pruebas propias" on public.historial_pruebas
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
