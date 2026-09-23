-- =====================================================================
-- Normativas · avance de estudio sincronizado entre dispositivos
-- =====================================================================
-- Un documento JSON por usuario con su avance en las fichas de
-- Normativas (estado de cada tarjeta, calendario del repaso, destacadas,
-- opciones...). La app lo fusiona con el que tiene en el dispositivo
-- (gana lo más reciente de cada tarjeta) y lo vuelve a subir.
-- =====================================================================

create table if not exists public.nq_user_progress (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.nq_user_progress enable row level security;

drop policy if exists "own nq_user_progress" on public.nq_user_progress;
create policy "own nq_user_progress" on public.nq_user_progress
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
