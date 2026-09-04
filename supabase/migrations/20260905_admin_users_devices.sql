-- =====================================================================
-- Migración: panel "Usuarios" del admin + límite de dispositivos
-- =====================================================================
-- Ejecuta este script en Supabase → SQL Editor (proyecto de este repo).
-- No se aplica automáticamente: requiere la clave "service role" o
-- acceso al panel de Supabase, que no se comparte con el asistente.
--
-- Qué hace:
--   1. Añade un límite de dispositivos por usuario (con valor por
--      defecto global, editable individualmente desde el panel).
--   2. Crea una tabla de dispositivos conocidos por usuario.
--   3. Crea una tabla de intentos de inicio de sesión (éxito y fallo).
--   4. Crea funciones (RPC) para:
--        - registrar un dispositivo y comprobar el límite al iniciar sesión
--        - listar usuarios registrados (solo administradores)
--        - cambiar el límite de dispositivos de un usuario (solo admins)
--   5. Dosis de RLS para que solo los admins puedan leer estos datos.
-- =====================================================================

-- 0) Salvaguarda: nos aseguramos de que is_admin sea false por defecto.
--    (La columna ya existía antes de esta migración, pero su definición
--    original no estaba versionada en este repo, así que lo forzamos aquí
--    para garantizar que ningún correo nuevo se vuelva admin por accidente.)
alter table public.profiles
  alter column is_admin set default false;
update public.profiles set is_admin = false where is_admin is null;

-- 1) Límite de dispositivos por usuario (por defecto 2; cámbialo si quieres otro valor global)
alter table public.profiles
  add column if not exists device_limit integer not null default 2;

-- 2) Dispositivos conocidos por usuario
create table if not exists public.user_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  device_id text not null,
  user_agent text,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  unique (user_id, device_id)
);
alter table public.user_devices enable row level security;

drop policy if exists "users can read own devices" on public.user_devices;
create policy "users can read own devices"
  on public.user_devices for select
  using (auth.uid() = user_id);

drop policy if exists "admins can read all devices" on public.user_devices;
create policy "admins can read all devices"
  on public.user_devices for select
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin));

-- Sin políticas de insert/update para clientes: solo se gestionan vía
-- la función register_device_and_check_limit (más abajo), que corre
-- con privilegios de definidor (security definer), evitando que
-- cualquier usuario pueda insertarse dispositivos falsos manualmente.

-- 3) Intentos de inicio de sesión (éxito y fallo)
create table if not exists public.login_attempts (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  user_id uuid references auth.users(id) on delete set null,
  device_id text,
  user_agent text,
  success boolean not null,
  error_message text,
  created_at timestamptz not null default now()
);
alter table public.login_attempts enable row level security;

-- Cualquiera puede insertar su propio intento (incluidos los fallidos,
-- donde todavía no hay sesión). No se permite lectura pública.
drop policy if exists "anyone can log an attempt" on public.login_attempts;
create policy "anyone can log an attempt"
  on public.login_attempts for insert
  with check (true);

drop policy if exists "admins can read attempts" on public.login_attempts;
create policy "admins can read attempts"
  on public.login_attempts for select
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin));

-- 4) RPC: registrar dispositivo tras login correcto y comprobar límite
create or replace function public.register_device_and_check_limit(p_device_id text, p_user_agent text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_limit integer;
  v_existing_count integer;
  v_already_known boolean;
begin
  if v_user_id is null then
    return jsonb_build_object('allowed', false, 'reason', 'not_authenticated');
  end if;

  select device_limit into v_limit from public.profiles where id = v_user_id;
  if v_limit is null then v_limit := 2; end if;

  select exists(
    select 1 from public.user_devices where user_id = v_user_id and device_id = p_device_id
  ) into v_already_known;

  if v_already_known then
    update public.user_devices
      set last_seen = now(), user_agent = coalesce(p_user_agent, user_agent)
      where user_id = v_user_id and device_id = p_device_id;
    return jsonb_build_object('allowed', true, 'known_device', true);
  end if;

  select count(*) into v_existing_count from public.user_devices where user_id = v_user_id;

  if v_existing_count >= v_limit then
    return jsonb_build_object('allowed', false, 'reason', 'device_limit_reached', 'limit', v_limit, 'current', v_existing_count);
  end if;

  insert into public.user_devices (user_id, device_id, user_agent)
  values (v_user_id, p_device_id, p_user_agent);

  return jsonb_build_object('allowed', true, 'known_device', false);
end;
$$;

grant execute on function public.register_device_and_check_limit(text, text) to authenticated;

-- 5) RPC: listado de usuarios registrados (solo administradores)
create or replace function public.admin_list_users()
returns table (
  id uuid,
  email text,
  created_at timestamptz,
  is_admin boolean,
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
    p.device_limit,
    (select count(*) from public.user_devices d where d.user_id = u.id) as device_count,
    p.current_region
  from auth.users u
  join public.profiles p on p.id = u.id
  where exists (select 1 from public.profiles pp where pp.id = auth.uid() and pp.is_admin)
  order by u.created_at desc;
$$;

grant execute on function public.admin_list_users() to authenticated;

-- 6) RPC: cambiar el límite de dispositivos de un usuario (solo admins)
create or replace function public.admin_set_device_limit(p_user_id uuid, p_limit integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.profiles pp where pp.id = auth.uid() and pp.is_admin) then
    raise exception 'not authorized';
  end if;
  if p_limit < 1 then
    raise exception 'limit must be at least 1';
  end if;
  update public.profiles set device_limit = p_limit where id = p_user_id;
end;
$$;

grant execute on function public.admin_set_device_limit(uuid, integer) to authenticated;

-- 7) Asignar el rol de administrador a UNA cuenta concreta.
--    Sustituye el correo de ejemplo por el tuyo antes de ejecutar esto.
--    Los usuarios nuevos NUNCA reciben is_admin=true por defecto
--    (la columna ya existe con default false en la tabla profiles).
update public.profiles
set is_admin = true
where id = (select id from auth.users where email = 'TU_CORREO_ADMIN@ejemplo.com');
