-- =====================================================================
-- Actividad en vivo de los usuarios (para el panel de administración)
-- =====================================================================
-- Cada dispositivo con la app abierta y visible envía un "latido"
-- (heartbeat_activity) cada ~30 s. Un latido dentro de los 3 minutos
-- posteriores al anterior alarga la sesión de actividad existente; si
-- pasa más tiempo, empieza una sesión nueva. Así se sabe desde qué hora
-- está conectado alguien y cuánto rato lleva.
--
-- Solo los administradores pueden leer los datos (vía funciones RPC).
-- =====================================================================

create table if not exists public.user_activity_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  device_id text,
  started_at timestamptz not null default now(),
  last_seen timestamptz not null default now()
);

create index if not exists user_activity_sessions_user_last_idx
  on public.user_activity_sessions (user_id, last_seen desc);
create index if not exists user_activity_sessions_last_idx
  on public.user_activity_sessions (last_seen desc);

alter table public.user_activity_sessions enable row level security;

drop policy if exists "admins can read activity" on public.user_activity_sessions;
create policy "admins can read activity"
  on public.user_activity_sessions for select
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin));
-- Sin políticas de insert/update/delete para clientes: solo se escribe
-- mediante heartbeat_activity (security definer).

-- 1) Latido: registra/alarga la sesión de actividad del usuario actual
create or replace function public.heartbeat_activity(p_device_id text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
begin
  if v_uid is null then return; end if;

  select s.id into v_id
  from public.user_activity_sessions s
  where s.user_id = v_uid
    and coalesce(s.device_id, '') = coalesce(p_device_id, '')
    and s.last_seen > now() - interval '3 minutes'
  order by s.last_seen desc
  limit 1;

  if v_id is not null then
    update public.user_activity_sessions set last_seen = now() where id = v_id;
  else
    insert into public.user_activity_sessions (user_id, device_id) values (v_uid, p_device_id);
  end if;
end;
$$;

revoke all on function public.heartbeat_activity(text) from public, anon;
grant execute on function public.heartbeat_activity(text) to authenticated;

-- 2) Resumen por usuario (solo administradores)
create or replace function public.admin_list_activity()
returns table (
  user_id uuid,
  email text,
  is_admin boolean,
  is_online boolean,
  current_started_at timestamptz,
  last_seen timestamptz,
  first_start_today timestamptz,
  seconds_today bigint,
  sessions_today bigint,
  server_now timestamptz
)
language sql
security definer
set search_path = public
as $$
  with day as (
    select (date_trunc('day', now() at time zone 'Europe/Madrid') at time zone 'Europe/Madrid') as d0
  ),
  last_s as (
    select distinct on (s.user_id) s.user_id, s.started_at, s.last_seen
    from public.user_activity_sessions s
    order by s.user_id, s.last_seen desc
  ),
  today as (
    select
      s.user_id,
      min(s.started_at) filter (where s.started_at >= d.d0) as first_start,
      sum(extract(epoch from (s.last_seen - greatest(s.started_at, d.d0))))::bigint as secs,
      count(*) as n
    from public.user_activity_sessions s
    cross join day d
    where s.last_seen >= d.d0
    group by s.user_id
  )
  select
    u.id,
    u.email::text,
    coalesce(p.is_admin, false),
    (l.last_seen is not null and l.last_seen > now() - interval '90 seconds'),
    l.started_at,
    l.last_seen,
    t.first_start,
    coalesce(t.secs, 0),
    coalesce(t.n, 0),
    now()
  from auth.users u
  left join public.profiles p on p.id = u.id
  left join last_s l on l.user_id = u.id
  left join today t on t.user_id = u.id
  where exists (select 1 from public.profiles pp where pp.id = auth.uid() and pp.is_admin)
  order by
    (l.last_seen is not null and l.last_seen > now() - interval '90 seconds') desc,
    l.last_seen desc nulls last,
    u.email;
$$;

revoke all on function public.admin_list_activity() from public, anon;
grant execute on function public.admin_list_activity() to authenticated;

-- 3) Últimas sesiones de un usuario (solo administradores)
create or replace function public.admin_list_user_activity(p_user_id uuid, p_limit integer default 15)
returns table (
  started_at timestamptz,
  last_seen timestamptz,
  seconds bigint,
  device_id text,
  user_agent text
)
language sql
security definer
set search_path = public
as $$
  select
    s.started_at,
    s.last_seen,
    extract(epoch from (s.last_seen - s.started_at))::bigint,
    s.device_id,
    d.user_agent
  from public.user_activity_sessions s
  left join public.user_devices d on d.user_id = s.user_id and d.device_id = s.device_id
  where s.user_id = p_user_id
    and exists (select 1 from public.profiles pp where pp.id = auth.uid() and pp.is_admin)
  order by s.started_at desc
  limit greatest(1, least(coalesce(p_limit, 15), 100));
$$;

revoke all on function public.admin_list_user_activity(uuid, integer) from public, anon;
grant execute on function public.admin_list_user_activity(uuid, integer) to authenticated;
