-- =====================================================================
-- Callejero: vueltas del repaso, en la cuenta (no solo en el dispositivo)
-- =====================================================================
-- En Repasar, las calles del profesor van por vueltas: en cada forma de
-- preguntar (modo) salen todas antes de repetir. Lo ya visto en la vuelta
-- se guarda aquí para que siga igual en el iPad, el móvil o el ordenador.
-- «vistas»: nombres de las calles ya vistas en la vuelta de ese modo.
-- Cada uno, las suyas. Se puede aplicar más de una vez.
-- =====================================================================
create table if not exists public.callejero_vueltas (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  modo text not null check (modo in ('opciones','localiza','voz','cruces','parque')),
  vistas text[] not null default '{}' check (cardinality(vistas) <= 20000),
  updated_at timestamptz not null default now(),
  primary key (user_id, modo)
);
alter table public.callejero_vueltas enable row level security;
drop policy if exists "callejero_vueltas propias" on public.callejero_vueltas;
create policy "callejero_vueltas propias" on public.callejero_vueltas
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
