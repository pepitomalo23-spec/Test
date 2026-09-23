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

-- Tema de ejemplo: Forestales (solo si todavía no hay ningún tema).
do $$
declare v_set uuid;
begin
  if not exists (select 1 from public.nq_sets) then
    insert into public.nq_sets (title, orden) values ('Forestales', 0) returning id into v_set;
    insert into public.nq_cards (set_id, term, definition, orden) values
      (v_set, 'Plan de emergencias por incendios forestales de Andalucía (Plan INFOCA)', 'RD 371/2010 del 14 de septiembre', 0),
      (v_set, 'Directriz básica de planificaciones contra incendios forestales', 'RD 893/2013 del 15 de noviembre', 1),
      (v_set, 'Normativa para traje para rescate técnico', 'UNE EN 16689', 2),
      (v_set, 'Normativa para cascos de rescate técnico', 'UNE EN 16473', 3),
      (v_set, 'Normativa para cascos para industrias', 'UNE EN 397', 4),
      (v_set, 'Normativa para cascos de bomberos', 'UNE EN 443', 5),
      (v_set, 'Normativa de botas de los bomberos', 'UNE EN 15090', 6),
      (v_set, 'Normativa de los trajes forestales', 'UNE EN ISO 15384', 7),
      (v_set, 'Normativa de los cascos forestales', 'UNE EN 16471', 8),
      (v_set, 'Normativa de las motobombas portátiles', 'UNE EN 14466', 9);
  end if;
end $$;
