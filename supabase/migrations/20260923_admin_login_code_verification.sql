-- =====================================================================
-- Migración: verificación por código en cada inicio de sesión
-- =====================================================================
-- Ejecuta este script en Supabase → SQL Editor (proyecto de este repo),
-- igual que las migraciones anteriores.
--
-- Qué hace:
--   En cada inicio de sesión de una cuenta NO administradora (incluso
--   en un dispositivo ya conocido), se genera un código numérico de 6
--   dígitos que solo puede ver un administrador desde el panel. El
--   administrador se lo transmite al usuario por fuera de la app
--   (WhatsApp, teléfono...) y el usuario debe introducirlo para poder
--   entrar. El código caduca a los 10 minutos y admite un máximo de 5
--   intentos fallidos.
--
--   Las cuentas administradoras NO pasan por este paso (igual que ya
--   están exentas del límite de dispositivos y de la aprobación
--   manual), porque son quienes deben ver y transmitir el código; si
--   solo hay un administrador, exigírselo a sí mismo le bloquearía el
--   acceso sin que nadie pudiera dárselo.
--
--   Como en el resto del panel, esto se aplica en el cliente (igual
--   que la comprobación de "approved"/"blocked"): si el código no se
--   introduce o es incorrecto, la app cierra la sesión recién iniciada
--   con auth.signOut().
-- =====================================================================

-- 1) Tabla de verificaciones pendientes.
create table if not exists public.login_verifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  device_id text,
  user_agent text,
  code text not null,
  attempts integer not null default 0,
  verified boolean not null default false,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '10 minutes')
);
alter table public.login_verifications enable row level security;

-- Sin políticas para "authenticated": todo el acceso pasa por las
-- funciones de abajo (security definer), igual que user_devices.
drop policy if exists "no direct access" on public.login_verifications;

-- Índice para que el admin liste rápido las pendientes.
create index if not exists login_verifications_pending_idx
  on public.login_verifications (verified, expires_at);

-- 2) RPC: el propio usuario pide un código nuevo al iniciar sesión.
--    Borra cualquier código anterior sin verificar de esa cuenta (para
--    que no queden códigos viejos activos a la vez) y crea uno nuevo.
--    Devuelve solo el id de la verificación, nunca el código: el
--    código solo lo puede leer un administrador.
create or replace function public.request_login_verification(p_device_id text, p_user_agent text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_email text;
  v_code text;
  v_id uuid;
begin
  if v_user_id is null then
    return null;
  end if;

  select email into v_email from auth.users where id = v_user_id;

  delete from public.login_verifications
    where user_id = v_user_id and verified = false;

  v_code := lpad(floor(random() * 1000000)::text, 6, '0');

  insert into public.login_verifications (user_id, email, device_id, user_agent, code)
  values (v_user_id, v_email, p_device_id, p_user_agent, v_code)
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.request_login_verification(text, text) to authenticated;

-- 3) RPC: el usuario introduce el código que le ha dado el admin.
create or replace function public.verify_login_code(p_verification_id uuid, p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_row public.login_verifications%rowtype;
begin
  if v_user_id is null then
    return jsonb_build_object('allowed', false, 'reason', 'not_authenticated');
  end if;

  select * into v_row
    from public.login_verifications
    where id = p_verification_id and user_id = v_user_id
    for update;

  if not found then
    return jsonb_build_object('allowed', false, 'reason', 'not_found');
  end if;

  if v_row.verified then
    return jsonb_build_object('allowed', true);
  end if;

  if now() > v_row.expires_at then
    return jsonb_build_object('allowed', false, 'reason', 'expired');
  end if;

  if v_row.attempts >= 5 then
    return jsonb_build_object('allowed', false, 'reason', 'too_many_attempts');
  end if;

  if v_row.code <> p_code then
    update public.login_verifications
      set attempts = attempts + 1
      where id = p_verification_id;
    return jsonb_build_object('allowed', false, 'reason', 'invalid_code', 'remaining_attempts', greatest(0, 5 - (v_row.attempts + 1)));
  end if;

  update public.login_verifications
    set verified = true, verified_at = now()
    where id = p_verification_id;

  return jsonb_build_object('allowed', true);
end;
$$;

grant execute on function public.verify_login_code(uuid, text) to authenticated;

-- 4) RPC: el admin ve las verificaciones pendientes (con el código).
create or replace function public.admin_list_pending_verifications()
returns table (
  id uuid,
  email text,
  device_id text,
  user_agent text,
  code text,
  attempts integer,
  created_at timestamptz,
  expires_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select v.id, v.email, v.device_id, v.user_agent, v.code, v.attempts, v.created_at, v.expires_at
  from public.login_verifications v
  where v.verified = false
    and v.expires_at > now()
    and exists (select 1 from public.profiles pp where pp.id = auth.uid() and pp.is_admin)
  order by v.created_at desc;
$$;

grant execute on function public.admin_list_pending_verifications() to authenticated;
