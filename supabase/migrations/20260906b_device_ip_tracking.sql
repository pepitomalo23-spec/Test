-- Añade seguimiento de IP por dispositivo para que el administrador pueda ver
-- desde qué dispositivo y (aproximadamente) desde qué red/ubicación ha entrado
-- cada usuario, y detectar si varios dispositivos de la misma cuenta usan IPs
-- distintas (posible indicio de que no ha sido el mismo usuario).
--
-- NOTA: esta migración ya se aplicó directamente en la base de datos de
-- producción (proyecto Supabase "Test") el 2026-09-06. Este archivo deja
-- constancia en el repositorio para mantener el histórico sincronizado.
--
-- CORRECCIÓN POSTERIOR (mismo día): la primera versión de
-- admin_list_user_devices tenía una columna de salida llamada "id" que
-- chocaba con profiles.id dentro del cuerpo de la función ("column reference
-- \"id\" is ambiguous"), haciendo que la llamada fallara siempre con error.
-- Se corrigió cualificando la comparación como "pp.id = auth.uid()".

ALTER TABLE public.user_devices ADD COLUMN IF NOT EXISTS ip_address text;

-- register_device_and_check_limit: ahora captura la IP del cliente a partir
-- de las cabeceras de la petición (x-forwarded-for / x-real-ip) y la guarda
-- en cada registro/actualización de dispositivo.
CREATE OR REPLACE FUNCTION public.register_device_and_check_limit(p_device_id text, p_user_agent text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_is_admin boolean;
  v_limit integer;
  v_existing_count integer;
  v_already_known boolean;
  v_ip text;
begin
  if v_user_id is null then
    return jsonb_build_object('allowed', false, 'reason', 'not_authenticated');
  end if;

  begin
    v_ip := split_part(coalesce(
      (current_setting('request.headers', true)::json->>'x-forwarded-for'),
      (current_setting('request.headers', true)::json->>'x-real-ip')
    ), ',', 1);
  exception when others then
    v_ip := null;
  end;

  select is_admin, device_limit into v_is_admin, v_limit
  from public.profiles where id = v_user_id;

  if v_limit is null then v_limit := 2; end if;

  select exists(
    select 1 from public.user_devices where user_id = v_user_id and device_id = p_device_id
  ) into v_already_known;

  if v_already_known then
    update public.user_devices
      set last_seen = now(), user_agent = coalesce(p_user_agent, user_agent),
          ip_address = coalesce(v_ip, ip_address)
      where user_id = v_user_id and device_id = p_device_id;
    return jsonb_build_object('allowed', true, 'known_device', true, 'unlimited', coalesce(v_is_admin, false));
  end if;

  if coalesce(v_is_admin, false) then
    insert into public.user_devices (user_id, device_id, user_agent, ip_address)
    values (v_user_id, p_device_id, p_user_agent, v_ip);
    return jsonb_build_object('allowed', true, 'known_device', false, 'unlimited', true);
  end if;

  select count(*) into v_existing_count from public.user_devices where user_id = v_user_id;

  if v_existing_count >= v_limit then
    return jsonb_build_object('allowed', false, 'reason', 'device_limit_reached', 'limit', v_limit, 'current', v_existing_count);
  end if;

  insert into public.user_devices (user_id, device_id, user_agent, ip_address)
  values (v_user_id, p_device_id, p_user_agent, v_ip);

  return jsonb_build_object('allowed', true, 'known_device', false, 'unlimited', false);
end;
$function$;

-- admin_list_user_devices: función ya existente en la base de datos (huérfana,
-- no conectada al frontend) que se actualiza para incluir ip_address y se
-- conecta ahora al panel de administración (botón "Ver dispositivos" por usuario).
DROP FUNCTION IF EXISTS public.admin_list_user_devices(uuid);

CREATE OR REPLACE FUNCTION public.admin_list_user_devices(target_user_id uuid)
RETURNS TABLE(id bigint, device_id text, user_agent text, ip_address text, first_seen timestamptz, last_seen timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
begin
  if not exists (select 1 from public.profiles pp where pp.id = auth.uid() and pp.is_admin = true) then
    raise exception 'NOT_AUTHORIZED';
  end if;
  return query
    select d.id, d.device_id, d.user_agent, d.ip_address, d.first_seen, d.last_seen
    from public.user_devices d
    where d.user_id = target_user_id
    order by d.last_seen desc;
end;
$function$;

GRANT EXECUTE ON FUNCTION public.admin_list_user_devices(uuid) TO authenticated;
