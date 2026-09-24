-- =====================================================================
-- Registro de errores de la app (lado del navegador)
-- =====================================================================
-- La app apunta aquí los fallos que sufren los usuarios (errores de
-- JavaScript, promesas sin capturar, cargas que se quedan colgadas...)
-- para que el admin se entere sin esperar a que se lo cuenten. Cualquiera
-- puede registrar un error (también antes de iniciar sesión), pero solo
-- el admin puede leerlos, marcarlos como vistos o borrarlos.
-- =====================================================================

create table if not exists public.client_errors (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  user_id uuid default auth.uid() references auth.users(id) on delete set null,
  email text,
  kind text not null default 'error',
  message text not null,
  stack text,
  url text,
  user_agent text,
  app_version text,
  seen boolean not null default false,
  constraint client_errors_sizes check (
    length(kind) <= 40 and length(message) <= 1000 and length(coalesce(stack, '')) <= 4000
    and length(coalesce(url, '')) <= 500 and length(coalesce(user_agent, '')) <= 400
    and length(coalesce(app_version, '')) <= 40 and length(coalesce(email, '')) <= 200
  )
);

create index if not exists client_errors_created_idx on public.client_errors(created_at desc);
create index if not exists client_errors_unseen_idx on public.client_errors(seen) where not seen;

alter table public.client_errors enable row level security;

drop policy if exists "anyone insert client_errors" on public.client_errors;
create policy "anyone insert client_errors" on public.client_errors
  for insert to anon, authenticated
  with check (user_id is null or user_id = auth.uid());

drop policy if exists "admin read client_errors" on public.client_errors;
create policy "admin read client_errors" on public.client_errors
  for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin));

drop policy if exists "admin update client_errors" on public.client_errors;
create policy "admin update client_errors" on public.client_errors
  for update to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin));

drop policy if exists "admin delete client_errors" on public.client_errors;
create policy "admin delete client_errors" on public.client_errors
  for delete to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin));

grant insert on public.client_errors to anon, authenticated;
grant select, update, delete on public.client_errors to authenticated;
