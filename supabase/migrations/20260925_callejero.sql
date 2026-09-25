-- =====================================================================
-- Callejero de Córdoba
-- =====================================================================
-- Las vías salen del Callejero Digital de Andalucía Unificado (CDAU,
-- IECA — Junta de Andalucía, licencia CC BY 4.0). La función
-- callejero-sync las descarga, las valida y las guarda aquí:
--   - Vía nueva en el CDAU        → se añade sola (queda anotada).
--   - Cambio de trazado           → se aplica solo (queda anotado).
--   - Cambio de nombre o de tipo  → NO se aplica: queda pendiente de que
--                                   un administrador lo apruebe.
--   - Vía que ya no está          → NO se retira: queda pendiente de que
--                                   un administrador lo apruebe.
-- Después publica un archivo compacto (almacén público «callejero») con
-- las vías activas, que es lo que descarga la app.
--
-- El secreto del cron vive en app_secrets ('callejero_sync_secret'),
-- generado en la base de datos, nunca escrito en este archivo.
-- =====================================================================

-- ---------- Vías ----------
create table if not exists public.callejero_vias (
  id_vial bigint primary key,                 -- identificador oficial del CDAU
  tipo text not null,                         -- CALLE, PLAZA, AVENIDA…
  nombre_oficial text not null,               -- nom_via del CDAU (en mayúsculas)
  nombre text not null,                       -- nom_normalizado: «Calle San Agustín»
  sobrenombre text,
  acceso text,
  competencia text,
  fuente text,
  geom jsonb not null,                        -- coordenadas MultiLineString (lon, lat)
  geom_hash text not null,                    -- para detectar cambios de trazado
  jugable boolean not null default true,      -- sale en las preguntas
  activa boolean not null default true,       -- false = retirada (ya no está en el CDAU)
  alta_at timestamptz not null default now(),
  actualizada_at timestamptz not null default now()
);

alter table public.callejero_vias enable row level security;
drop policy if exists "admin read callejero_vias" on public.callejero_vias;
create policy "admin read callejero_vias" on public.callejero_vias
  for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin));

-- ---------- Cambios detectados en cada sincronización ----------
create table if not exists public.callejero_cambios (
  id bigserial primary key,
  id_vial bigint not null,
  tipo_cambio text not null check (tipo_cambio in ('nueva', 'renombrada', 'desaparecida', 'reaparecida', 'trazado')),
  antes jsonb,
  despues jsonb,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'aplicado', 'rechazado', 'automatico')),
  detectado_at timestamptz not null default now(),
  revisado_at timestamptz,
  revisado_por uuid references auth.users(id) on delete set null
);
create index if not exists callejero_cambios_estado_idx on public.callejero_cambios (estado, detectado_at desc);

alter table public.callejero_cambios enable row level security;
drop policy if exists "admin read callejero_cambios" on public.callejero_cambios;
create policy "admin read callejero_cambios" on public.callejero_cambios
  for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin));

-- ---------- Registro de sincronizaciones ----------
create table if not exists public.callejero_sync_log (
  id bigserial primary key,
  empezada_at timestamptz not null default now(),
  terminada_at timestamptz,
  ok boolean,
  origen text,                                -- 'cron' | 'admin'
  resumen jsonb,
  error text
);
alter table public.callejero_sync_log enable row level security;
drop policy if exists "admin read callejero_sync_log" on public.callejero_sync_log;
create policy "admin read callejero_sync_log" on public.callejero_sync_log
  for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin));

-- ---------- Versión publicada (la lee la app) ----------
create table if not exists public.callejero_publicado (
  id int primary key default 1 check (id = 1),
  version text not null,
  archivo text not null,                      -- ruta dentro del almacén «callejero»
  total_vias int not null,
  jugables int not null,
  publicado_at timestamptz not null default now()
);
alter table public.callejero_publicado enable row level security;
drop policy if exists "read callejero_publicado" on public.callejero_publicado;
create policy "read callejero_publicado" on public.callejero_publicado
  for select to authenticated using (true);

-- ---------- Intentos de cada alumno ----------
create table if not exists public.callejero_intentos (
  id bigserial primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id_vial bigint not null,
  modo text not null default 'localiza',
  acierto boolean not null,
  distancia_m int,
  created_at timestamptz not null default now()
);
create index if not exists callejero_intentos_user_idx on public.callejero_intentos (user_id, id_vial, created_at desc);

alter table public.callejero_intentos enable row level security;
drop policy if exists "own callejero_intentos select" on public.callejero_intentos;
create policy "own callejero_intentos select" on public.callejero_intentos
  for select to authenticated using (user_id = auth.uid());
drop policy if exists "own callejero_intentos insert" on public.callejero_intentos;
create policy "own callejero_intentos insert" on public.callejero_intentos
  for insert to authenticated with check (user_id = auth.uid());

-- Resumen por vía del alumno que llama (se respeta su RLS).
create or replace function public.callejero_mi_progreso()
returns table (id_vial bigint, intentos int, aciertos int, ultimo_acierto boolean, ultima_vez timestamptz)
language sql
stable
security invoker
set search_path = public
as $$
  select i.id_vial,
         count(*)::int,
         count(*) filter (where i.acierto)::int,
         (array_agg(i.acierto order by i.created_at desc))[1],
         max(i.created_at)
    from public.callejero_intentos i
   where i.user_id = auth.uid()
   group by i.id_vial;
$$;
revoke execute on function public.callejero_mi_progreso() from public, anon;
grant execute on function public.callejero_mi_progreso() to authenticated;

-- ---------- Almacén público con el archivo que descarga la app ----------
-- Solo lo escribe la función (service role); leerlo es libre: son datos
-- abiertos del CDAU.
insert into storage.buckets (id, name, public)
values ('callejero', 'callejero', true)
on conflict (id) do nothing;

-- ---------- Secreto del cron (se genera aquí, nunca viaja por git) ----------
insert into public.app_secrets (name, value)
select 'callejero_sync_secret', encode(extensions.gen_random_bytes(32), 'hex')
where not exists (select 1 from public.app_secrets where name = 'callejero_sync_secret');

-- ---------- Comprobación semanal: lunes 04:15 UTC ----------
select cron.unschedule('callejero-sync-semanal')
where exists (select 1 from cron.job where jobname = 'callejero-sync-semanal');
select cron.schedule(
  'callejero-sync-semanal',
  '15 4 * * 1',
  $$
  select net.http_post(
    url := 'https://tsjaaqkvncgxqtpmlugv.supabase.co/functions/v1/callejero-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-callejero-secret', (select value from public.app_secrets where name = 'callejero_sync_secret')
    ),
    body := '{"accion":"sincronizar"}'::jsonb,
    timeout_milliseconds := 150000
  );
  $$
);
