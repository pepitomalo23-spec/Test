-- =====================================================================
-- Callejero: rondas, progreso por habilidad, profesores y tareas
-- =====================================================================
-- 1) Cada respuesta guarda de qué ronda, zona y tarea es, y un uid que
--    pone la app: si se reintenta la subida (sin conexión, dos subidas a
--    la vez), no se duplica.
-- 2) El progreso se cuenta por habilidad (nombres, localizar, cruces,
--    lugares, parque) con la misma regla que los tests: dominada si nunca
--    se ha fallado o si lleva 3 aciertos seguidos.
-- 3) Profesores: un usuario normal marcado por el administrador
--    (profiles.es_profesor) y vinculado a sus alumnos (tutorias). Ve el
--    callejero de sus alumnos y les manda tareas (calles y lugares
--    elegidos en el mapa, o una zona), con mensajes. Con «solo esto», el
--    alumno solo puede estudiar lo que le ha mandado.
-- Nada de esto da acceso a otros datos: el profesor solo lee, a través
-- de funciones, el callejero de sus alumnos.
-- =====================================================================

-- ---------- 1) Respuestas: ronda, zona y tarea ----------
alter table public.callejero_intentos
  add column if not exists uid uuid,
  add column if not exists ronda uuid,
  add column if not exists ronda_total smallint,
  add column if not exists zona text,
  add column if not exists tarea_id bigint;
create unique index if not exists callejero_intentos_uid_idx on public.callejero_intentos (uid);
create index if not exists callejero_intentos_fecha_idx on public.callejero_intentos (user_id, created_at desc);

-- ---------- 2) Profesores y alumnos ----------
alter table public.profiles add column if not exists es_profesor boolean not null default false;

-- Nadie puede crearse un perfil de profesor (solo el administrador lo marca).
create or replace function public.profiles_safe_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_caller_admin boolean;
begin
  select coalesce(bool_or(is_admin), false) into v_caller_admin from public.profiles where id = auth.uid();
  if auth.uid() is not null and not v_caller_admin then
    new.is_admin := false;
    new.approved := false;
    new.blocked := false;
    new.device_limit := 2;
    new.es_profesor := false;
    new.feature_flags := coalesce((select value from public.app_settings where key = 'default_feature_flags'), '{}'::jsonb);
  end if;
  return new;
end;
$$;

create table if not exists public.tutorias (
  profesor_id uuid not null references auth.users(id) on delete cascade,
  alumno_id uuid not null references auth.users(id) on delete cascade,
  creada_at timestamptz not null default now(),
  primary key (profesor_id, alumno_id),
  check (profesor_id <> alumno_id)
);
create index if not exists tutorias_alumno_idx on public.tutorias (alumno_id);
alter table public.tutorias enable row level security;
drop policy if exists "read tutorias" on public.tutorias;
create policy "read tutorias" on public.tutorias
  for select to authenticated
  using (profesor_id = auth.uid() or alumno_id = auth.uid()
         or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin));

-- ¿p_profesor es ahora mismo profesor de p_alumno? (sigue marcado como
-- profesor, no está bloqueado y el vínculo existe)
create or replace function public.callejero_es_tutor(p_profesor uuid, p_alumno uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.tutorias t join public.profiles p on p.id = t.profesor_id
     where t.profesor_id = p_profesor and t.alumno_id = p_alumno and p.es_profesor and not p.blocked);
$$;

-- Quién puede ver el callejero de p_user: él mismo o su profesor.
create or replace function public.callejero_puede_ver(p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and (p_user = auth.uid() or public.callejero_es_tutor(auth.uid(), p_user));
$$;

-- ---------- 3) Tareas y mensajes ----------
create table if not exists public.callejero_tareas (
  id bigserial primary key,
  profesor_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  alumno_id uuid not null references auth.users(id) on delete cascade,
  titulo text not null check (char_length(btrim(titulo)) between 1 and 120),
  mensaje text check (mensaje is null or char_length(mensaje) <= 2000),
  vias bigint[] not null default '{}',        -- vías elegidas (id_vial del CDAU)
  lugares bigint[] not null default '{}',     -- lugares elegidos (id del archivo publicado)
  zona text check (zona is null or zona in ('', 'fuera') or zona ~ '^(d|b):.+$'),  -- o una zona entera ('' = toda Córdoba)
  modos text[] not null default '{}'          -- modos que cuentan (vacío = cualquiera)
    check (modos <@ array['localiza','opciones','voz','cruces','lugares','parque']::text[]),
  rondas int not null default 3 check (rondas between 1 and 50),
  minimo int not null default 80 check (minimo between 0 and 100),   -- % de aciertos para que una ronda cuente
  solo_esto boolean not null default false,   -- mientras esté activa, el alumno solo estudia esto
  fecha_limite date,
  creada_at timestamptz not null default now(),
  vista_at timestamptz,                       -- cuando el alumno la vio por primera vez
  archivada boolean not null default false,
  check (cardinality(vias) + cardinality(lugares) > 0 or zona is not null),
  check (cardinality(vias) <= 5000 and cardinality(lugares) <= 1000)
);
create index if not exists callejero_tareas_alumno_idx on public.callejero_tareas (alumno_id, archivada);
create index if not exists callejero_tareas_profesor_idx on public.callejero_tareas (profesor_id, alumno_id);
alter table public.callejero_tareas enable row level security;
drop policy if exists "tareas select" on public.callejero_tareas;
create policy "tareas select" on public.callejero_tareas
  for select to authenticated
  using ((alumno_id = auth.uid() or profesor_id = auth.uid()) and public.callejero_es_tutor(profesor_id, alumno_id));
drop policy if exists "tareas insert" on public.callejero_tareas;
create policy "tareas insert" on public.callejero_tareas
  for insert to authenticated
  with check (profesor_id = auth.uid() and public.callejero_es_tutor(auth.uid(), alumno_id));
drop policy if exists "tareas update" on public.callejero_tareas;
create policy "tareas update" on public.callejero_tareas
  for update to authenticated
  using (profesor_id = auth.uid() and public.callejero_es_tutor(auth.uid(), alumno_id))
  with check (profesor_id = auth.uid() and public.callejero_es_tutor(auth.uid(), alumno_id));
drop policy if exists "tareas delete" on public.callejero_tareas;
create policy "tareas delete" on public.callejero_tareas
  for delete to authenticated
  using (profesor_id = auth.uid() and public.callejero_es_tutor(auth.uid(), alumno_id));

create table if not exists public.callejero_mensajes (
  id bigserial primary key,
  tarea_id bigint not null references public.callejero_tareas(id) on delete cascade,
  autor_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  texto text not null check (char_length(btrim(texto)) between 1 and 2000),
  creado_at timestamptz not null default now(),
  leido_at timestamptz
);
create index if not exists callejero_mensajes_tarea_idx on public.callejero_mensajes (tarea_id, creado_at);
alter table public.callejero_mensajes enable row level security;
drop policy if exists "mensajes select" on public.callejero_mensajes;
create policy "mensajes select" on public.callejero_mensajes
  for select to authenticated
  using (exists (select 1 from public.callejero_tareas k where k.id = tarea_id));   -- ya filtrada por su RLS
drop policy if exists "mensajes insert" on public.callejero_mensajes;
create policy "mensajes insert" on public.callejero_mensajes
  for insert to authenticated
  with check (autor_id = auth.uid() and exists (select 1 from public.callejero_tareas k where k.id = tarea_id));

-- ---------- 4) Lecturas (el alumno las suyas; el profesor, las de sus alumnos) ----------
-- Habilidad que entrena cada modo.
create or replace function public.callejero_habilidad(p_modo text)
returns text language sql immutable set search_path = public as $$
  select case p_modo
    when 'localiza' then 'localiza'
    when 'cruces' then 'cruces'
    when 'lugares' then 'lugares'
    when 'parque' then 'parque'
    else 'nombre' end;   -- ¿Cómo se llama?, Di el nombre (y el antiguo «escribe»)
$$;

-- Progreso por vía (o lugar, con id negativo) y habilidad, en un solo JSON
-- (así no le afecta el límite de filas de la API):
-- [[id, habilidad, intentos, aciertos, racha de aciertos, fallos, última vez (epoch)], ...]
create or replace function public.callejero_progreso(p_user uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_user uuid := coalesce(p_user, auth.uid());
begin
  if not public.callejero_puede_ver(v_user) then raise exception 'not authorized'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_array(r.id_vial, r.habilidad, r.intentos, r.aciertos, r.racha, r.fallos, r.ultima))
      from (
        select i.id_vial, i.habilidad,
               count(*)::int as intentos,
               count(*) filter (where i.acierto)::int as aciertos,
               (coalesce(min(i.rn) filter (where not i.acierto), count(*) + 1) - 1)::int as racha,
               count(*) filter (where not i.acierto)::int as fallos,
               extract(epoch from max(i.created_at))::bigint as ultima
          from (
            select x.id_vial, public.callejero_habilidad(x.modo) as habilidad, x.acierto, x.created_at,
                   row_number() over (partition by x.id_vial, public.callejero_habilidad(x.modo) order by x.created_at desc, x.id desc) as rn
              from public.callejero_intentos x
             where x.user_id = v_user
          ) i
         group by i.id_vial, i.habilidad
      ) r), '[]'::jsonb);
end;
$$;

-- Últimas rondas (de la más reciente a la más antigua).
create or replace function public.callejero_rondas(p_user uuid default null, p_limite int default 30)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_user uuid := coalesce(p_user, auth.uid());
begin
  if not public.callejero_puede_ver(v_user) then raise exception 'not authorized'; end if;
  return coalesce((
    select jsonb_agg(to_jsonb(r) order by r.fin desc)
      from (
        select i.ronda, min(i.modo) as modo, min(i.zona) as zona, min(i.tarea_id) as tarea_id,
               max(i.ronda_total)::int as total, count(*)::int as respondidas,
               count(*) filter (where i.acierto)::int as aciertos,
               min(i.created_at) as inicio, max(i.created_at) as fin
          from public.callejero_intentos i
         where i.user_id = v_user and i.ronda is not null
         group by i.ronda
         order by max(i.created_at) desc
         limit least(greatest(coalesce(p_limite, 30), 1), 200)
      ) r), '[]'::jsonb);
end;
$$;

-- Tareas de un alumno con cómo van. El alumno ve las de todos sus
-- profesores; el profesor, solo las que ha mandado él.
-- Una ronda cuenta si es de la tarea, de un modo que cuenta, está
-- terminada y llega al mínimo de aciertos.
create or replace function public.callejero_tareas_de(p_alumno uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_alumno uuid := coalesce(p_alumno, auth.uid());
begin
  if not public.callejero_puede_ver(v_alumno) then raise exception 'not authorized'; end if;
  return coalesce((
    select jsonb_agg(to_jsonb(x) order by x.archivada, x.creada_at desc)
      from (
        select k.*, u.email::text as profesor_email,
               (select count(*) from (
                  select i.ronda
                    from public.callejero_intentos i
                   where i.user_id = k.alumno_id and i.tarea_id = k.id and i.ronda is not null
                     and (cardinality(k.modos) = 0 or i.modo = any(k.modos))
                   group by i.ronda
                  having count(*) >= max(i.ronda_total)
                     and count(*) filter (where i.acierto) * 100 >= k.minimo * max(i.ronda_total)
                ) v)::int as rondas_validas,
               (select count(distinct i.ronda) from public.callejero_intentos i
                 where i.user_id = k.alumno_id and i.tarea_id = k.id)::int as rondas_jugadas,
               (select max(i.created_at) from public.callejero_intentos i
                 where i.user_id = k.alumno_id and i.tarea_id = k.id) as ultima_vez,
               (select count(*) from public.callejero_mensajes m where m.tarea_id = k.id)::int as mensajes,
               (select count(*) from public.callejero_mensajes m
                 where m.tarea_id = k.id and m.autor_id <> auth.uid() and m.leido_at is null)::int as sin_leer
          from public.callejero_tareas k
          join auth.users u on u.id = k.profesor_id
         where k.alumno_id = v_alumno
           and public.callejero_es_tutor(k.profesor_id, k.alumno_id)
           and (v_alumno = auth.uid() or k.profesor_id = auth.uid())
      ) x), '[]'::jsonb);
end;
$$;

-- El alumno marca una tarea como vista.
create or replace function public.callejero_tarea_vista(p_tarea bigint)
returns void language sql security definer set search_path = public as $$
  update public.callejero_tareas set vista_at = now()
   where id = p_tarea and alumno_id = auth.uid() and vista_at is null;
$$;

-- Quien abre los mensajes de una tarea marca como leídos los del otro.
create or replace function public.callejero_mensajes_leidos(p_tarea bigint)
returns void language sql security definer set search_path = public as $$
  update public.callejero_mensajes m set leido_at = now()
    from public.callejero_tareas k
   where m.tarea_id = p_tarea and k.id = m.tarea_id
     and m.autor_id <> auth.uid() and m.leido_at is null
     and (k.alumno_id = auth.uid() or k.profesor_id = auth.uid())
     and public.callejero_es_tutor(k.profesor_id, k.alumno_id);
$$;

-- Avisos para el punto de la pestaña Callejero: tareas sin ver y mensajes
-- sin leer (como alumno y, si es profesor, de sus alumnos).
create or replace function public.callejero_avisos()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'tareas_nuevas', (select count(*) from public.callejero_tareas k
                       where k.alumno_id = auth.uid() and not k.archivada and k.vista_at is null
                         and public.callejero_es_tutor(k.profesor_id, k.alumno_id)),
    'mensajes', (select count(*) from public.callejero_mensajes m join public.callejero_tareas k on k.id = m.tarea_id
                  where (k.alumno_id = auth.uid() or k.profesor_id = auth.uid())
                    and m.autor_id <> auth.uid() and m.leido_at is null
                    and public.callejero_es_tutor(k.profesor_id, k.alumno_id)));
$$;

-- Alumnos del profesor que llama, con su actividad reciente.
create or replace function public.profesor_mis_alumnos()
returns table (alumno_id uuid, email text, desde timestamptz, ultima_vez timestamptz,
               respuestas_7d int, aciertos_7d int, rondas_7d int, tareas_activas int, sin_leer int)
language sql stable security definer set search_path = public as $$
  select t.alumno_id, u.email::text, t.creada_at,
         (select max(i.created_at) from public.callejero_intentos i where i.user_id = t.alumno_id),
         (select count(*) from public.callejero_intentos i
           where i.user_id = t.alumno_id and i.created_at > now() - interval '7 days')::int,
         (select count(*) from public.callejero_intentos i
           where i.user_id = t.alumno_id and i.created_at > now() - interval '7 days' and i.acierto)::int,
         (select count(distinct i.ronda) from public.callejero_intentos i
           where i.user_id = t.alumno_id and i.created_at > now() - interval '7 days')::int,
         (select count(*) from public.callejero_tareas k
           where k.alumno_id = t.alumno_id and k.profesor_id = auth.uid() and not k.archivada)::int,
         (select count(*) from public.callejero_mensajes m join public.callejero_tareas k on k.id = m.tarea_id
           where k.alumno_id = t.alumno_id and k.profesor_id = auth.uid()
             and m.autor_id <> auth.uid() and m.leido_at is null)::int
    from public.tutorias t
    join auth.users u on u.id = t.alumno_id
   where t.profesor_id = auth.uid() and public.callejero_es_tutor(auth.uid(), t.alumno_id)
   order by u.email;
$$;

-- ---------- 5) Administración ----------
create or replace function public.admin_set_profesor(p_user_id uuid, p_es boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.profiles pp where pp.id = auth.uid() and pp.is_admin) then
    raise exception 'not authorized';
  end if;
  update public.profiles set es_profesor = coalesce(p_es, false) where id = p_user_id;
end;
$$;

create or replace function public.admin_set_tutoria(p_profesor uuid, p_alumno uuid, p_activa boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.profiles pp where pp.id = auth.uid() and pp.is_admin) then
    raise exception 'not authorized';
  end if;
  if p_activa then
    if not exists (select 1 from public.profiles p where p.id = p_profesor and p.es_profesor) then
      raise exception 'no es profesor';
    end if;
    insert into public.tutorias (profesor_id, alumno_id) values (p_profesor, p_alumno) on conflict do nothing;
  else
    delete from public.tutorias where profesor_id = p_profesor and alumno_id = p_alumno;
  end if;
end;
$$;

-- La lista de usuarios del administrador dice también quién es profesor.
drop function if exists public.admin_list_users();
create function public.admin_list_users()
returns table (id uuid, email text, created_at timestamptz, is_admin boolean, approved boolean, blocked boolean,
               device_limit integer, device_count bigint, feature_flags jsonb, es_profesor boolean)
language sql security definer set search_path = public as $$
  select
    u.id,
    u.email,
    u.created_at,
    p.is_admin,
    p.approved,
    p.blocked,
    p.device_limit,
    (select count(*) from public.user_devices d where d.user_id = u.id) as device_count,
    p.feature_flags,
    p.es_profesor
  from auth.users u
  join public.profiles p on p.id = u.id
  where exists (select 1 from public.profiles pp where pp.id = auth.uid() and pp.is_admin)
  order by (not p.approved) desc, u.created_at desc;
$$;

-- ---------- 6) Permisos de las funciones ----------
revoke all on function public.callejero_es_tutor(uuid, uuid) from public, anon;
revoke all on function public.callejero_puede_ver(uuid) from public, anon;
revoke all on function public.callejero_habilidad(text) from public, anon;
revoke all on function public.callejero_progreso(uuid) from public, anon;
revoke all on function public.callejero_rondas(uuid, int) from public, anon;
revoke all on function public.callejero_tareas_de(uuid) from public, anon;
revoke all on function public.callejero_tarea_vista(bigint) from public, anon;
revoke all on function public.callejero_mensajes_leidos(bigint) from public, anon;
revoke all on function public.callejero_avisos() from public, anon;
revoke all on function public.profesor_mis_alumnos() from public, anon;
revoke all on function public.admin_set_profesor(uuid, boolean) from public, anon;
revoke all on function public.admin_set_tutoria(uuid, uuid, boolean) from public, anon;
revoke all on function public.admin_list_users() from public, anon;
grant execute on function public.callejero_es_tutor(uuid, uuid) to authenticated;
grant execute on function public.callejero_puede_ver(uuid) to authenticated;
grant execute on function public.callejero_habilidad(text) to authenticated;
grant execute on function public.callejero_progreso(uuid) to authenticated;
grant execute on function public.callejero_rondas(uuid, int) to authenticated;
grant execute on function public.callejero_tareas_de(uuid) to authenticated;
grant execute on function public.callejero_tarea_vista(bigint) to authenticated;
grant execute on function public.callejero_mensajes_leidos(bigint) to authenticated;
grant execute on function public.callejero_avisos() to authenticated;
grant execute on function public.profesor_mis_alumnos() to authenticated;
grant execute on function public.admin_set_profesor(uuid, boolean) to authenticated;
grant execute on function public.admin_set_tutoria(uuid, uuid, boolean) to authenticated;
grant execute on function public.admin_list_users() to authenticated;
