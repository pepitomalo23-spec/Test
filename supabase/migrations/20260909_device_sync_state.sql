-- =====================================================================
-- Sincronización de "dónde me quedé" entre dispositivos (móvil / web)
-- =====================================================================
-- Hasta ahora la pantalla en la que estabas (last_screen) y el test en
-- curso (quiz_progress) solo se guardaban en localStorage del navegador,
-- así que no viajaban de un dispositivo a otro. Esta tabla guarda una
-- única fila por usuario con el último estado, para que al entrar desde
-- cualquier dispositivo se recupere lo mismo. Los resultados ya
-- finalizados de un test siguen viviendo en test_sessions, sin cambios.

create table if not exists public.device_sync_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  last_screen text,
  quiz_progress jsonb,
  updated_at timestamptz not null default now()
);

alter table public.device_sync_state enable row level security;

drop policy if exists "users can read own sync state" on public.device_sync_state;
create policy "users can read own sync state"
  on public.device_sync_state for select
  using (auth.uid() = user_id);

drop policy if exists "users can insert own sync state" on public.device_sync_state;
create policy "users can insert own sync state"
  on public.device_sync_state for insert
  with check (auth.uid() = user_id);

drop policy if exists "users can update own sync state" on public.device_sync_state;
create policy "users can update own sync state"
  on public.device_sync_state for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
