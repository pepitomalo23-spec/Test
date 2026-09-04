-- =====================================================================
-- Migración (2/2): el administrador tiene dispositivos ilimitados
-- =====================================================================
-- Ejecuta esto en Supabase → SQL Editor DESPUÉS de haber ejecutado
-- 20260905_admin_users_devices.sql.
--
-- Sustituye la función register_device_and_check_limit para que, si el
-- usuario es administrador (profiles.is_admin = true), nunca se le
-- bloquee por límite de dispositivos: se sigue registrando el
-- dispositivo (para que salga en el listado), pero jamás se rechaza.
-- =====================================================================

create or replace function public.register_device_and_check_limit(p_device_id text, p_user_agent text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_is_admin boolean;
  v_limit integer;
  v_existing_count integer;
  v_already_known boolean;
begin
  if v_user_id is null then
    return jsonb_build_object('allowed', false, 'reason', 'not_authenticated');
  end if;

  select is_admin, device_limit into v_is_admin, v_limit
  from public.profiles where id = v_user_id;

  if v_limit is null then v_limit := 2; end if;

  select exists(
    select 1 from public.user_devices where user_id = v_user_id and device_id = p_device_id
  ) into v_already_known;

  if v_already_known then
    update public.user_devices
      set last_seen = now(), user_agent = coalesce(p_user_agent, user_agent)
      where user_id = v_user_id and device_id = p_device_id;
    return jsonb_build_object('allowed', true, 'known_device', true, 'unlimited', coalesce(v_is_admin, false));
  end if;

  -- Los administradores nunca se bloquean por límite de dispositivos,
  -- pero seguimos registrando el dispositivo para que aparezca en el
  -- listado de "Usuarios" del panel de administración.
  if coalesce(v_is_admin, false) then
    insert into public.user_devices (user_id, device_id, user_agent)
    values (v_user_id, p_device_id, p_user_agent);
    return jsonb_build_object('allowed', true, 'known_device', false, 'unlimited', true);
  end if;

  select count(*) into v_existing_count from public.user_devices where user_id = v_user_id;

  if v_existing_count >= v_limit then
    return jsonb_build_object('allowed', false, 'reason', 'device_limit_reached', 'limit', v_limit, 'current', v_existing_count);
  end if;

  insert into public.user_devices (user_id, device_id, user_agent)
  values (v_user_id, p_device_id, p_user_agent);

  return jsonb_build_object('allowed', true, 'known_device', false, 'unlimited', false);
end;
$$;
