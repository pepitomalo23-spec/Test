-- =====================================================================
-- Plan de estudio: temas, tests, tareas, resultados, actividad y
-- preguntas propias
-- =====================================================================
-- El gestor personal de estudio (pantalla «Plan»): qué test toca cada
-- día, de qué plataforma (Tutor Bombero, los tests de pj.fire u otra),
-- qué se ha abierto, qué se ha terminado y con qué resultado.
--
-- Es PRIVADO por usuario: cada uno solo ve y toca sus filas (RLS), ni el
-- administrador ve las de los demás desde la app, y anon no tiene acceso
-- (la copia de seguridad diaria, hecha con la clave de servicio y que solo
-- descarga el administrador, sí las incluye). Además hay
-- que tener el permiso «plan», que a diferencia de los demás está
-- APAGADO salvo que se active a mano (feature_flags.plan = true) o se
-- sea administrador: ver plan_permitido().
--
-- Nada de aquí se conecta con Tutor Bombero: no se guardan sus
-- credenciales ni su contenido. Sus resultados los apunta (o confirma) el
-- propio usuario. Los ids los pone la app (uuid): reintentar una subida
-- sin conexión no duplica nada.
--
-- Las referencias entre tablas llevan también el user_id (claves
-- foráneas compuestas): nadie puede colgar una fila suya de un tema, un
-- test o una tarea de otro usuario aunque conozca su id.
--
-- En producción se aplicó por partes (plan_estudio,
-- plan_estudio_2_politicas y plan_estudio_3_<tabla>), sin los «drop … if
-- exists», que allí no hacían falta; el esquema resultante es idéntico al
-- de este archivo (comprobado comparando el catálogo).
-- =====================================================================

-- ---------- 0) Quién puede usar el Plan ----------
create or replace function public.plan_permitido()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((
    select p.is_admin
        or (p.approved and not p.blocked and coalesce(p.feature_flags -> 'plan' = 'true'::jsonb, false))
      from public.profiles p where p.id = auth.uid()), false);
$$;
revoke all on function public.plan_permitido() from public, anon;
grant execute on function public.plan_permitido() to authenticated;

-- updated_at lo pone siempre el servidor.
create or replace function public.plan_tocar_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function public.plan_tocar_updated_at() from public, anon, authenticated;

-- ---------- 1) Ajustes: límite diario, días de estudio y reglas ----------
create table if not exists public.plan_ajustes (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  limite_diario smallint not null default 3 check (limite_diario between 1 and 20),
  dias_estudio smallint[] not null default '{1,2,3,4,5,6}'
    check (cardinality(dias_estudio) between 1 and 7 and dias_estudio <@ '{1,2,3,4,5,6,7}'::smallint[]),
  reglas jsonb not null default '{}'::jsonb
    check (jsonb_typeof(reglas) = 'object' and pg_column_size(reglas) <= 4000),
  updated_at timestamptz not null default now()
);

-- ---------- 2) Temas de la oposición ----------
-- topic_ids: los temas del banco de pj.fire que corresponden a este tema
-- (para los tests de pj.fire, los exámenes y las estadísticas).
create table if not exists public.plan_temas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  numero smallint check (numero between 0 and 999),
  nombre text not null check (char_length(btrim(nombre)) between 1 and 160),
  bloque text check (char_length(bloque) <= 80),
  topic_ids text[] not null default '{}' check (cardinality(topic_ids) <= 40),
  archivado boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id)
);
create unique index if not exists plan_temas_nombre_idx on public.plan_temas (user_id, lower(btrim(nombre)));

-- ---------- 3) Tests (el catálogo) ----------
-- plataforma: 'tutor_bombero' (se abre su web en otra pestaña), 'pjfire'
-- (un test del banco de esta app, config = {modo, topic_ids, n, minutos})
-- u 'otra'. referencia: cómo se llama o se encuentra en la plataforma.
-- clave evita tener dos veces el mismo test de la misma plataforma.
create table if not exists public.plan_tests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  tema_id uuid,
  plataforma text not null check (plataforma in ('tutor_bombero', 'pjfire', 'otra')),
  nombre text not null check (char_length(btrim(nombre)) between 1 and 160),
  referencia text check (char_length(referencia) <= 160),
  url text check (url is null or (url ~* '^https?://[^[:space:]]+$' and char_length(url) <= 500)),
  num_preguntas smallint check (num_preguntas between 1 and 500),
  config jsonb not null default '{}'::jsonb
    check (jsonb_typeof(config) = 'object' and pg_column_size(config) <= 4000),
  notas text check (char_length(notas) <= 1000),
  archivado boolean not null default false,
  clave text generated always as (lower(btrim(coalesce(nullif(btrim(referencia), ''), nombre)))) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id),
  unique (user_id, plataforma, clave),
  foreign key (user_id, tema_id) references public.plan_temas (user_id, id) on delete set null (tema_id)
);
create index if not exists plan_tests_tema_idx on public.plan_tests (user_id, tema_id);

-- ---------- 4) Tareas: un test programado para un día ----------
-- estado: pendiente → en_curso (abierto desde el panel) → completado
-- (solo cuando el usuario lo confirma o lo registra un test de pj.fire);
-- aplazado = movido a otro día (fecha ya es la nueva).
-- origen: 'plan' (lo puso el usuario), 'auto' (planificación automática),
-- 'repaso' (propuesto por malos resultados), 'excepcion' (añadido por
-- encima del límite o fuera del plan, autorizado por el usuario).
create table if not exists public.plan_tareas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  test_id uuid not null,
  fecha date not null,
  orden smallint not null default 0,
  prioridad smallint not null default 2 check (prioridad between 1 and 3),
  estado text not null default 'pendiente' check (estado in ('pendiente', 'en_curso', 'completado', 'aplazado')),
  origen text not null default 'plan' check (origen in ('plan', 'auto', 'repaso', 'excepcion')),
  veces_aplazada smallint not null default 0 check (veces_aplazada between 0 and 999),
  abierta_at timestamptz,
  completada_at timestamptz,
  resultado_id uuid,
  nota text check (char_length(nota) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (estado <> 'completado' or completada_at is not null),
  unique (user_id, id),
  unique (user_id, test_id, fecha),
  foreign key (user_id, test_id) references public.plan_tests (user_id, id) on delete cascade
);
create index if not exists plan_tareas_fecha_idx on public.plan_tareas (user_id, fecha);

-- ---------- 5) Resultados ----------
-- fuente: 'manual' (apuntado por el usuario: Tutor Bombero u otra web),
-- 'pjfire' (test del banco lanzado desde el Plan, se registra solo) o
-- 'examen' (examen combinado del Plan). test_id es null en los exámenes.
-- session_id: el test_sessions del banco, si lo hay (sin clave foránea:
-- puede subirse más tarde). detalle: una entrada por pregunta,
-- {k:'b:<id>'|'p:<uuid>', t:<tema>|null, f:<fuente>, ok:true|false|null}.
-- duracion_medida: true si la midió la app; false si la escribió el
-- usuario.
create table if not exists public.plan_resultados (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  test_id uuid,
  tarea_id uuid,
  fuente text not null check (fuente in ('manual', 'pjfire', 'examen')),
  realizado_at timestamptz not null default now(),
  aciertos smallint check (aciertos between 0 and 1000),
  fallos smallint check (fallos between 0 and 1000),
  blancos smallint check (blancos between 0 and 1000),
  total smallint check (total between 1 and 1000),
  nota numeric(4,2) check (nota between 0 and 10),
  duracion_seg integer check (duracion_seg between 0 and 86400),
  duracion_medida boolean not null default false,
  session_id uuid,
  titulo text check (char_length(titulo) <= 160),
  detalle jsonb check (detalle is null or (jsonb_typeof(detalle) = 'array' and jsonb_array_length(detalle) <= 300)),
  notas text check (char_length(notas) <= 1000),
  created_at timestamptz not null default now(),
  check (aciertos is not null or nota is not null),
  check (total is null or coalesce(aciertos, 0) + coalesce(fallos, 0) + coalesce(blancos, 0) <= total),
  foreign key (user_id, test_id) references public.plan_tests (user_id, id) on delete set null (test_id),
  foreign key (user_id, tarea_id) references public.plan_tareas (user_id, id) on delete set null (tarea_id)
);
create index if not exists plan_resultados_fecha_idx on public.plan_resultados (user_id, realizado_at desc);
-- Un test de pj.fire no se registra dos veces.
create unique index if not exists plan_resultados_sesion_idx on public.plan_resultados (user_id, session_id) where session_id is not null;

-- ---------- 6) Actividad: abrir no es terminar ----------
-- Registro de lo que pasa: test abierto desde el panel, completado,
-- aplazado, avisos por salirse del plan y excepciones autorizadas.
-- Sin claves foráneas: se conserva aunque se borre la tarea o el test.
create table if not exists public.plan_eventos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  tipo text not null check (tipo in ('abierto', 'completado', 'reabierto', 'aplazado', 'cancelado',
    'aviso_fuera_plan', 'aviso_repetido', 'aviso_limite', 'excepcion')),
  tarea_id uuid,
  test_id uuid,
  at timestamptz not null default now(),
  datos jsonb not null default '{}'::jsonb
    check (jsonb_typeof(datos) = 'object' and pg_column_size(datos) <= 2000)
);
create index if not exists plan_eventos_fecha_idx on public.plan_eventos (user_id, at desc);

-- ---------- 7) Preguntas propias (para los exámenes combinados) ----------
-- Las escribe el usuario, una a una. fuente dice de dónde salen
-- ('propia', 'tutor_bombero' = apuntada a mano para repasar, 'otra').
-- huella evita guardar dos veces el mismo enunciado.
create table if not exists public.plan_preguntas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  tema_id uuid,
  fuente text not null default 'propia' check (fuente in ('propia', 'tutor_bombero', 'otra')),
  referencia text check (char_length(referencia) <= 160),
  enunciado text not null check (char_length(btrim(enunciado)) between 3 and 2000),
  opciones jsonb not null check (jsonb_typeof(opciones) = 'array' and jsonb_array_length(opciones) between 2 and 4),
  correcta smallint not null check (correcta between 0 and 3),
  explicacion text check (char_length(explicacion) <= 4000),
  huella text generated always as (md5(lower(regexp_replace(btrim(enunciado), '\s+', ' ', 'g')))) stored,
  archivada boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (correcta < jsonb_array_length(opciones)),
  unique (user_id, huella),
  foreign key (user_id, tema_id) references public.plan_temas (user_id, id) on delete set null (tema_id)
);

-- ---------- 8) updated_at ----------
drop trigger if exists plan_ajustes_tocar on public.plan_ajustes;
create trigger plan_ajustes_tocar before update on public.plan_ajustes for each row execute function public.plan_tocar_updated_at();
drop trigger if exists plan_temas_tocar on public.plan_temas;
create trigger plan_temas_tocar before update on public.plan_temas for each row execute function public.plan_tocar_updated_at();
drop trigger if exists plan_tests_tocar on public.plan_tests;
create trigger plan_tests_tocar before update on public.plan_tests for each row execute function public.plan_tocar_updated_at();
drop trigger if exists plan_tareas_tocar on public.plan_tareas;
create trigger plan_tareas_tocar before update on public.plan_tareas for each row execute function public.plan_tocar_updated_at();
drop trigger if exists plan_preguntas_tocar on public.plan_preguntas;
create trigger plan_preguntas_tocar before update on public.plan_preguntas for each row execute function public.plan_tocar_updated_at();

-- ---------- 9) Acceso: cada uno lo suyo, con el permiso «plan» ----------
alter table public.plan_ajustes enable row level security;
alter table public.plan_temas enable row level security;
alter table public.plan_tests enable row level security;
alter table public.plan_tareas enable row level security;
alter table public.plan_resultados enable row level security;
alter table public.plan_eventos enable row level security;
alter table public.plan_preguntas enable row level security;

revoke all on public.plan_ajustes, public.plan_temas, public.plan_tests, public.plan_tareas,
  public.plan_resultados, public.plan_eventos, public.plan_preguntas from anon;

drop policy if exists "own plan_ajustes" on public.plan_ajustes;
create policy "own plan_ajustes" on public.plan_ajustes for all to authenticated
  using (user_id = (select auth.uid()) and (select public.plan_permitido()))
  with check (user_id = (select auth.uid()) and (select public.plan_permitido()));

drop policy if exists "own plan_temas" on public.plan_temas;
create policy "own plan_temas" on public.plan_temas for all to authenticated
  using (user_id = (select auth.uid()) and (select public.plan_permitido()))
  with check (user_id = (select auth.uid()) and (select public.plan_permitido()));

drop policy if exists "own plan_tests" on public.plan_tests;
create policy "own plan_tests" on public.plan_tests for all to authenticated
  using (user_id = (select auth.uid()) and (select public.plan_permitido()))
  with check (user_id = (select auth.uid()) and (select public.plan_permitido()));

drop policy if exists "own plan_tareas" on public.plan_tareas;
create policy "own plan_tareas" on public.plan_tareas for all to authenticated
  using (user_id = (select auth.uid()) and (select public.plan_permitido()))
  with check (user_id = (select auth.uid()) and (select public.plan_permitido()));

drop policy if exists "own plan_resultados" on public.plan_resultados;
create policy "own plan_resultados" on public.plan_resultados for all to authenticated
  using (user_id = (select auth.uid()) and (select public.plan_permitido()))
  with check (user_id = (select auth.uid()) and (select public.plan_permitido()));

drop policy if exists "own plan_eventos" on public.plan_eventos;
create policy "own plan_eventos" on public.plan_eventos for all to authenticated
  using (user_id = (select auth.uid()) and (select public.plan_permitido()))
  with check (user_id = (select auth.uid()) and (select public.plan_permitido()));

drop policy if exists "own plan_preguntas" on public.plan_preguntas;
create policy "own plan_preguntas" on public.plan_preguntas for all to authenticated
  using (user_id = (select auth.uid()) and (select public.plan_permitido()))
  with check (user_id = (select auth.uid()) and (select public.plan_permitido()));
