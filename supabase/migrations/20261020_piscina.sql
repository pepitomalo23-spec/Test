-- =====================================================================
-- Piscina: reservas de la piscina de IMDECO que se dejan programadas
-- desde la app (pantalla «Piscina», solo administradores). El robot de
-- GitHub Actions (reserva-piscina/reservar.mjs) las lee cada noche y
-- apunta cómo fue.
--   estado: programada (esperando a su noche), reservada (hecha),
--           fallida (no se pudo; detalle dice por qué).
-- El robot no inicia sesión: llama a las dos funciones de abajo con una
-- clave (secreto PISCINA_CLAVE de GitHub) cuyo SHA-256 está en
-- piscina_robot. Esa tabla no es visible desde la API.
-- Se puede aplicar más de una vez.
-- =====================================================================

create table if not exists public.piscina_reservas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  fecha date not null,
  hora text not null check (hora in ('08:00', '09:00', '13:00', '14:00', '15:00', '22:00')),
  estado text not null default 'programada' check (estado in ('programada', 'reservada', 'fallida')),
  detalle text check (detalle is null or char_length(detalle) <= 500),
  calle text check (calle is null or char_length(calle) <= 60),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, fecha)
);
alter table public.piscina_reservas enable row level security;
drop policy if exists piscina_reservas_admin on public.piscina_reservas;
create policy piscina_reservas_admin on public.piscina_reservas
  for all to authenticated
  using (user_id = (select auth.uid()) and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.is_admin))
  with check (user_id = (select auth.uid()) and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.is_admin));

create table if not exists public.piscina_robot (
  id int primary key default 1 check (id = 1),
  clave_sha256 text not null
);
alter table public.piscina_robot enable row level security;
revoke all on public.piscina_robot from anon, authenticated;

create or replace function public.piscina_robot_ok(p_clave text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.piscina_robot where clave_sha256 = encode(sha256(convert_to(coalesce(p_clave, ''), 'UTF8')), 'hex'));
$$;
revoke all on function public.piscina_robot_ok(text) from public, anon, authenticated;

-- Lo programado para un día (lo que el robot tiene que reservar esa noche)
create or replace function public.piscina_robot_pendiente(p_clave text, p_fecha date)
returns table (id uuid, hora text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.piscina_robot_ok(p_clave) then raise exception 'clave incorrecta'; end if;
  return query select r.id, r.hora from public.piscina_reservas r
    where r.fecha = p_fecha and r.estado = 'programada' order by r.created_at limit 1;
end $$;

-- Cómo fue
create or replace function public.piscina_robot_resultado(p_clave text, p_id uuid, p_estado text, p_detalle text, p_calle text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.piscina_robot_ok(p_clave) then raise exception 'clave incorrecta'; end if;
  if p_estado not in ('reservada', 'fallida') then raise exception 'estado no válido'; end if;
  update public.piscina_reservas
    set estado = p_estado, detalle = left(p_detalle, 500), calle = left(p_calle, 60), updated_at = now()
    where id = p_id;
end $$;

revoke all on function public.piscina_robot_pendiente(text, date) from public, authenticated;
revoke all on function public.piscina_robot_resultado(text, uuid, text, text, text) from public, authenticated;
grant execute on function public.piscina_robot_pendiente(text, date) to anon;
grant execute on function public.piscina_robot_resultado(text, uuid, text, text, text) to anon;

-- Copiar las reservas reales de IMDECO (reserva-piscina/sincronizar.mjs): las activas quedan como
-- «reservada» (con detalle «Asistido» si fue); las reservadas futuras que ya no están en IMDECO
-- (anuladas allí) se quitan. Lo programado que aún no se ha reservado no se toca.
alter table public.piscina_robot add column if not exists user_id uuid references auth.users(id);
create or replace function public.piscina_robot_sincronizar(p_clave text, p_reservas jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_user uuid; v_n int := 0; v_q int := 0; r jsonb; v_activas date[] := '{}';
begin
  if not public.piscina_robot_ok(p_clave) then raise exception 'clave incorrecta'; end if;
  select user_id into v_user from public.piscina_robot where id = 1;
  if v_user is null then raise exception 'falta el usuario en piscina_robot'; end if;
  for r in select * from jsonb_array_elements(coalesce(p_reservas, '[]'::jsonb)) loop
    continue when coalesce((r->>'anulado')::boolean, false) or (r->>'fecha') is null
      or (r->>'hora') not in ('08:00', '09:00', '13:00', '14:00', '15:00', '22:00');
    v_activas := v_activas || (r->>'fecha')::date;
    insert into public.piscina_reservas (user_id, fecha, hora, estado, calle, detalle, updated_at)
    values (v_user, (r->>'fecha')::date, r->>'hora', 'reservada', left(r->>'calle', 60),
            case when coalesce((r->>'asistido')::boolean, false) then 'Asistido' end, now())
    on conflict (user_id, fecha) do update
      set hora = excluded.hora, estado = 'reservada', calle = excluded.calle, detalle = excluded.detalle, updated_at = now();
    v_n := v_n + 1;
  end loop;
  if jsonb_array_length(coalesce(p_reservas, '[]'::jsonb)) > 0 then
    delete from public.piscina_reservas
      where user_id = v_user and estado = 'reservada' and fecha >= current_date and not (fecha = any (v_activas));
    get diagnostics v_q = row_count;
  end if;
  return jsonb_build_object('copiadas', v_n, 'quitadas', v_q);
end $$;
revoke all on function public.piscina_robot_sincronizar(text, jsonb) from public, authenticated;
grant execute on function public.piscina_robot_sincronizar(text, jsonb) to anon;

-- La clave y de quién son las reservas: insert into public.piscina_robot (id, clave_sha256) values (1, '<sha256 en hex de PISCINA_CLAVE>')
--   on conflict (id) do update set clave_sha256 = excluded.clave_sha256;
-- update public.piscina_robot set user_id = '<id del administrador>' where id = 1;

-- «Cogerla si se libera» (reserva-piscina/vigilar.mjs): la hora que se quiere ese día. Si ya hay
-- reserva a otra hora, el robot la cambia (anula la vieja y coge la nueva) cuando se libera.
alter table public.piscina_reservas add column if not exists quiere_hora text
  check (quiere_hora is null or quiere_hora in ('08:00', '09:00', '13:00', '14:00', '15:00', '22:00'));
create or replace function public.piscina_robot_vigilar(p_clave text)
returns table (id uuid, fecha date, hora text, estado text, quiere_hora text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.piscina_robot_ok(p_clave) then raise exception 'clave incorrecta'; end if;
  return query select r.id, r.fecha, r.hora, r.estado, r.quiere_hora from public.piscina_reservas r
    where r.quiere_hora is not null and r.fecha >= (now() at time zone 'Europe/Madrid')::date order by r.fecha;
end $$;
-- Con p_hora: ya reservada a esa hora (se quita quiere_hora). Sin p_hora: solo una nota en detalle.
create or replace function public.piscina_robot_cambiado(p_clave text, p_id uuid, p_hora text, p_calle text, p_detalle text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.piscina_robot_ok(p_clave) then raise exception 'clave incorrecta'; end if;
  if p_hora is null then
    update public.piscina_reservas set detalle = left(p_detalle, 500), updated_at = now() where id = p_id;
  else
    update public.piscina_reservas set hora = p_hora, calle = coalesce(left(p_calle, 60), calle), estado = 'reservada',
      quiere_hora = null, detalle = left(p_detalle, 500), updated_at = now() where id = p_id;
  end if;
end $$;
revoke all on function public.piscina_robot_vigilar(text) from public, authenticated;
revoke all on function public.piscina_robot_cambiado(text, uuid, text, text, text) from public, authenticated;
grant execute on function public.piscina_robot_vigilar(text) to anon;
grant execute on function public.piscina_robot_cambiado(text, uuid, text, text, text) to anon;
