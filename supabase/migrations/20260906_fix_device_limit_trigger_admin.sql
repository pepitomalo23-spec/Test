-- El trigger trg_enforce_device_limit (función enforce_device_limit) se creó
-- ANTES de introducir la exención de dispositivos ilimitados para administradores
-- (ver 20260905b_admin_unlimited_devices.sql) y nunca se actualizó.
--
-- Como resultado, aunque la función RPC register_device_and_check_limit ya
-- exime a los administradores del límite, este trigger de la tabla
-- user_devices seguía lanzando la excepción 'DEVICE_LIMIT_REACHED' en cada
-- inserción de un dispositivo nuevo, incluso para cuentas con is_admin = true.
-- Esto provocaba que el administrador siguiera viendo el bloqueo por límite
-- de dispositivos al iniciar sesión desde un dispositivo nuevo.
--
-- Esta migración corrige la función del trigger para que también respete
-- la exención de administrador.
--
-- NOTA: esta corrección ya se aplicó directamente en la base de datos de
-- producción (proyecto Supabase "Test") el 2026-09-06. Este archivo deja
-- constancia en el repositorio para mantener el histórico de migraciones
-- sincronizado con el estado real de la base de datos.

CREATE OR REPLACE FUNCTION public.enforce_device_limit()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
declare
  existing_count int;
  max_allowed int;
  is_admin_user boolean;
begin
  if exists (select 1 from public.user_devices where user_id = new.user_id and device_id = new.device_id) then
    return new;
  end if;

  select is_admin into is_admin_user from public.profiles where id = new.user_id;
  if coalesce(is_admin_user, false) then
    return new;
  end if;

  select device_limit into max_allowed from public.profiles where id = new.user_id;
  if max_allowed is null then max_allowed := 2; end if;
  select count(*) into existing_count from public.user_devices where user_id = new.user_id;
  if existing_count >= max_allowed then
    raise exception 'DEVICE_LIMIT_REACHED';
  end if;
  return new;
end;
$function$;
