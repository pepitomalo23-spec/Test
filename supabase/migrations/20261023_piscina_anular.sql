-- =====================================================================
-- Piscina: anular desde la app. La app marca anular = true en una reserva
-- hecha; el vigilante (reserva-piscina/vigilar.mjs) las pide con
-- piscina_robot_por_anular, las anula en IMDECO y lo apunta con
-- piscina_robot_anulada.
-- Se puede aplicar más de una vez.
-- =====================================================================

alter table public.piscina_reservas add column if not exists anular boolean not null default false;

-- Las que hay que anular (de hoy en adelante)
create or replace function public.piscina_robot_por_anular(p_clave text)
returns table (id uuid, fecha date, hora text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.piscina_robot_ok(p_clave) then raise exception 'clave incorrecta'; end if;
  return query select r.id, r.fecha, r.hora from public.piscina_reservas r
    where r.anular and r.estado = 'reservada' and r.fecha >= (now() at time zone 'Europe/Madrid')::date order by r.fecha;
end $$;
revoke all on function public.piscina_robot_por_anular(text) from public, authenticated;
grant execute on function public.piscina_robot_por_anular(text) to anon;

-- Anulada en IMDECO: se queda en la lista como «Anulada» (no vuelve a salir como reservada)
create or replace function public.piscina_robot_anulada(p_clave text, p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.piscina_robot_ok(p_clave) then raise exception 'clave incorrecta'; end if;
  update public.piscina_reservas set estado = 'fallida', anular = false, quiere_hora = null, calle = null,
    detalle = 'Anulada', updated_at = now() where id = p_id and anular;
end $$;
revoke all on function public.piscina_robot_anulada(text, uuid) from public, authenticated;
grant execute on function public.piscina_robot_anulada(text, uuid) to anon;
