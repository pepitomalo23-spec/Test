-- =====================================================================
-- Normativas · temas de fichas estilo Quizlet
-- =====================================================================
-- Cada tema (nq_sets) tiene sus tarjetas (nq_cards: término + normativa).
-- Los crea y edita solo el administrador; cualquier usuario con sesión
-- iniciada puede leerlos y estudiarlos. El avance de estudio de cada
-- usuario se guarda en su dispositivo (localStorage), no aquí.
-- =====================================================================

create table if not exists public.nq_sets (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  orden integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.nq_cards (
  id uuid primary key default gen_random_uuid(),
  set_id uuid not null references public.nq_sets(id) on delete cascade,
  term text not null,
  definition text not null,
  orden integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists nq_cards_set_idx on public.nq_cards(set_id, orden);

alter table public.nq_sets enable row level security;
alter table public.nq_cards enable row level security;

drop policy if exists "read nq_sets" on public.nq_sets;
create policy "read nq_sets" on public.nq_sets
  for select to authenticated using (true);

drop policy if exists "admin write nq_sets" on public.nq_sets;
create policy "admin write nq_sets" on public.nq_sets
  for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin));

drop policy if exists "read nq_cards" on public.nq_cards;
create policy "read nq_cards" on public.nq_cards
  for select to authenticated using (true);

drop policy if exists "admin write nq_cards" on public.nq_cards;
create policy "admin write nq_cards" on public.nq_cards
  for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin));
