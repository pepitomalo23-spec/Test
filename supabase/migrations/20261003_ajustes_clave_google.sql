-- =====================================================================
-- Clave de Google Maps (Street View del modo «A pie de calle»)
-- =====================================================================
-- El repositorio es público, así que la clave no va en el código: se
-- guarda aquí, en una tabla sin acceso directo (RLS sin políticas), y la
-- app la pide con callejero_clave_google(), que solo la da con la sesión
-- de un usuario aprobado y no bloqueado (o de un administrador).
-- La clave se pone a mano (no está en el repositorio):
--   insert into public.ajustes_privados (clave, valor) values ('google_maps', 'AIza…')
--   on conflict (clave) do update set valor = excluded.valor, actualizado = now();
-- =====================================================================

create table if not exists public.ajustes_privados (
  clave text primary key,
  valor text not null,
  actualizado timestamptz not null default now()
);
alter table public.ajustes_privados enable row level security;
revoke all on public.ajustes_privados from anon, authenticated;

create or replace function public.callejero_clave_google()
returns text language sql stable security definer set search_path = public as $$
  select a.valor from public.ajustes_privados a
   where a.clave = 'google_maps'
     and exists (select 1 from public.profiles p
                  where p.id = auth.uid() and ((p.approved and not p.blocked) or p.is_admin));
$$;
revoke all on function public.callejero_clave_google() from public, anon;
grant execute on function public.callejero_clave_google() to authenticated;
