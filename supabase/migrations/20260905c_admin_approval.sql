-- =====================================================================
-- Migración: aprobación manual de cuentas por el administrador
-- =====================================================================
-- Sustituye la confirmación por correo electrónico por una aprobación
-- manual: cuando alguien crea una cuenta, un administrador ve un aviso
-- en el panel y pulsa "Confirmar" para darle acceso.
--
-- IMPORTANTE — paso manual obligatorio en el panel de Supabase:
--   Ve a Authentication → Sign In / Providers → Email y DESACTIVA la
--   opción "Confirm email". Esa opción vive solo en la configuración
--   del proyecto (no en SQL), así que esta migración no puede
--   cambiarla por ti. Si la dejas activada, Supabase seguirá exigiendo
--   el correo de confirmación ANTES de que la cuenta pueda iniciar
--   sesión, y el paso de aprobación del admin se sumaría después,
--   duplicando el bloqueo en vez de sustituirlo.
--
-- Qué hace este script:
--   1. Añade la columna "approved" a profiles (false por defecto).
--   2. Aprueba automáticamente a las cuentas que ya existían antes de
--      este cambio, para no dejar a nadie fuera por sorpresa.
--   3. Los administradores quedan siempre aprobados.
--   4. Crea admin_set_approved / admin_approve_user (solo admins) para
--      aprobar o revocar el acceso de una cuenta.
--   5. Actualiza admin_list_users para incluir el estado "approved" y
--      mostrar primero las cuentas pendientes.
-- =====================================================================

-- 1) Nueva columna: aprobación pendiente por defecto.
alter table public.profiles
  add column if not exists approved boolean not null default false;

-- 2) Cuentas ya existentes: se dan por aprobadas (ya habían pasado por
--    la confirmación por correo con el sistema anterior).
update public.profiles set approved = true where approved is false;

-- 3) Los administradores siempre están aprobados.
update public.profiles set approved = true where is_admin = true;

-- 4) RPC: aprobar o revocar el acceso de una cuenta (solo admins).
create or replace function public.admin_set_approved(p_user_id uuid, p_approved boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.profiles pp where pp.id = auth.uid() and pp.is_admin) then
    raise exception 'not authorized';
  end if;
  update public.profiles set approved = p_approved where id = p_user_id;
end;
$$;

grant execute on function public.admin_set_approved(uuid, boolean) to authenticated;

-- Atajo cómodo para el botón "Confirmar" del panel.
create or replace function public.admin_approve_user(p_user_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  select public.admin_set_approved(p_user_id, true);
$$;

grant execute on function public.admin_approve_user(uuid) to authenticated;

-- 5) admin_list_users: añadimos "approved" y ordenamos con las
--    cuentas pendientes primero.
create or replace function public.admin_list_users()
returns table (
  id uuid,
  email text,
  created_at timestamptz,
  is_admin boolean,
  approved boolean,
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
    p.device_limit,
    (select count(*) from public.user_devices d where d.user_id = u.id) as device_count,
    p.current_region
  from auth.users u
  join public.profiles p on p.id = u.id
  where exists (select 1 from public.profiles pp where pp.id = auth.uid() and pp.is_admin)
  order by (not p.approved) desc, u.created_at desc;
$$;

grant execute on function public.admin_list_users() to authenticated;
