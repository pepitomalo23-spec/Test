-- =====================================================================
-- Migración: bloquear / desbloquear cuentas desde el panel de admin
-- =====================================================================
-- Ejecuta este script en Supabase → SQL Editor (proyecto de este repo),
-- igual que las migraciones anteriores.
--
-- Qué hace:
--   1. Añade la columna "blocked" a profiles (false por defecto). Es
--      independiente de "approved": una cuenta puede estar aprobada y
--      luego ser bloqueada por el admin sin perder ese historial.
--   2. Crea admin_set_blocked (solo admins) para bloquear/desbloquear.
--   3. Actualiza admin_list_users para devolver también "blocked".
--   4. Un usuario bloqueado no puede iniciar sesión (se comprueba en
--      el cliente al hacer login, con un mensaje distinto al de
--      "pendiente de confirmación").
-- =====================================================================

-- 1) Nueva columna.
alter table public.profiles
  add column if not exists blocked boolean not null default false;

-- Los administradores nunca quedan bloqueados por accidente.
update public.profiles set blocked = false where is_admin = true;

-- 2) RPC: bloquear o desbloquear una cuenta (solo admins).
create or replace function public.admin_set_blocked(p_user_id uuid, p_blocked boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.profiles pp where pp.id = auth.uid() and pp.is_admin) then
    raise exception 'not authorized';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'cannot block yourself';
  end if;
  if exists (select 1 from public.profiles pp where pp.id = p_user_id and pp.is_admin) then
    raise exception 'cannot block an admin account';
  end if;
  update public.profiles set blocked = p_blocked where id = p_user_id;
end;
$$;

grant execute on function public.admin_set_blocked(uuid, boolean) to authenticated;

-- 3) admin_list_users: añadimos "blocked".
create or replace function public.admin_list_users()
returns table (
  id uuid,
  email text,
  created_at timestamptz,
  is_admin boolean,
  approved boolean,
  blocked boolean,
  device_limit integer,
  device_count bigint,
  current_region text
)
language sql
security definer
set search_path = public
as $$
  select
    u.id,
    u.email,
    u.created_at,
    p.is_admin,
    p.approved,
    p.blocked,
    p.device_limit,
    (select count(*) from public.user_devices d where d.user_id = u.id) as device_count,
    p.current_region
  from auth.users u
  join public.profiles p on p.id = u.id
  where exists (select 1 from public.profiles pp where pp.id = auth.uid() and pp.is_admin)
  order by (not p.approved) desc, u.created_at desc;
$$;

grant execute on function public.admin_list_users() to authenticated;
