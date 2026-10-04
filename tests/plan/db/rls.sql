-- =====================================================================
-- Pruebas de la base de datos del Plan de estudio
-- =====================================================================
-- RLS (cada uno lo suyo, y solo con el permiso «plan»), permisos de
-- anon, claves foráneas compuestas, restricciones, borrados, updated_at
-- y upserts. Las lanza tests/plan/db/run.sh sobre una base de datos
-- temporal que ya tiene supabase_base.sql y la migración
-- 20261003c_plan_estudio.sql.
--
-- Cada prueba es un bloque DO: si algo no es como debe, lanza una
-- excepción «FALLO: …» (y psql, con ON_ERROR_STOP=1, se para); si va
-- bien, deja un NOTICE «OK: …». Los usuarios se simulan como lo hace
-- PostgREST: dentro de una transacción, set local role authenticated (o
-- anon) y request.jwt.claims con su sub (ver pruebas.como). Las pruebas
-- que cambian datos terminan con rollback: no se pisan unas a otras.
-- =====================================================================
\set ON_ERROR_STOP 1
\set SHOW_CONTEXT errors

-- ---------- 0) Utilidades de prueba (esquema «pruebas», solo aquí) ----------
set client_min_messages = warning;
drop schema if exists pruebas cascade;
set client_min_messages = notice;
create schema pruebas;
grant usage on schema pruebas to anon, authenticated;

-- Usuarios de prueba.
create table pruebas.usuarios (
  nombre text primary key,
  id uuid not null unique,
  descripcion text not null
);
insert into pruebas.usuarios (nombre, id, descripcion) values
  ('admin', '00000000-0000-4000-8000-0000000000ad', 'administrador, sin el permiso plan'),
  ('A',     '00000000-0000-4000-8000-00000000000a', 'aprobado, plan: true'),
  ('B',     '00000000-0000-4000-8000-00000000000b', 'aprobado, plan: true'),
  ('C',     '00000000-0000-4000-8000-00000000000c', 'aprobado, sin el permiso plan'),
  ('D',     '00000000-0000-4000-8000-00000000000d', 'aprobado y bloqueado, plan: true'),
  ('E',     '00000000-0000-4000-8000-00000000000e', 'sin aprobar, plan: true'),
  ('F',     '00000000-0000-4000-8000-00000000000f', 'aprobado, plan: "true" (texto, no booleano)'),
  ('G',     '00000000-0000-4000-8000-000000000010', 'sin fila en profiles');

-- Ids de las filas de partida de cada usuario (los pone la «app», como en el Plan).
create table pruebas.filas (
  nombre text primary key,
  id uuid not null default gen_random_uuid()
);
insert into pruebas.filas (nombre)
  select u.nombre || '.' || k
    from pruebas.usuarios u,
         unnest(array['tema', 'test', 'tarea', 'resultado', 'evento', 'pregunta']) k;

-- Las 7 tablas del Plan: una fila mínima válida (sin user_id: lo pone
-- auth.uid()), un cambio inocente para probar updates y qué fila de
-- pruebas.filas es la suya (null en plan_ajustes, cuya clave es user_id).
create table pruebas.tablas (
  orden int primary key,
  tabla text not null unique,
  fila text,
  columnas text not null,
  valores text not null,
  cambio text not null
);
insert into pruebas.tablas (orden, tabla, fila, columnas, valores, cambio) values
  (1, 'plan_ajustes',    null,        'limite_diario',                 '5',                                         'limite_diario = 9'),
  (2, 'plan_temas',      'tema',      'nombre',                        $v$'Tema intruso'$v$,                        $v$bloque = 'Cambiado'$v$),
  (3, 'plan_tests',      'test',      'plataforma, nombre',            $v$'otra', 'Test intruso'$v$,                $v$notas = 'Cambiado'$v$),
  (4, 'plan_tareas',     'tarea',     'test_id, fecha',                $v$gen_random_uuid(), date '2026-10-20'$v$,  $v$nota = 'Cambiado'$v$),
  (5, 'plan_resultados', 'resultado', 'fuente, aciertos',              $v$'manual', 1$v$,                           $v$notas = 'Cambiado'$v$),
  (6, 'plan_eventos',    'evento',    'tipo',                          $v$'abierto'$v$,                             $v$datos = '{"cambiado": true}'$v$),
  (7, 'plan_preguntas',  'pregunta',  'enunciado, opciones, correcta', $v$'¿Pregunta intrusa?', '["a", "b"]', 0$v$,  $v$explicacion = 'Cambiado'$v$);

grant select on all tables in schema pruebas to anon, authenticated;

-- Id de un usuario de prueba.
create function pruebas.u(p_nombre text) returns uuid language sql stable as $$
  select id from pruebas.usuarios where nombre = p_nombre
$$;

-- Id de una fila de partida ('A.tema', 'B.test'…).
create function pruebas.f(p_nombre text) returns uuid language plpgsql stable as $$
declare
  v uuid;
begin
  select id into v from pruebas.filas where nombre = p_nombre;
  if v is null then raise exception 'FALLO: no existe la fila de prueba %', p_nombre; end if;
  return v;
end;
$$;

-- Actúa como alguien hasta el final de la transacción, igual que
-- PostgREST: request.jwt.claims (auth.uid() lee su sub) y set local role.
--   pruebas.como('A')              authenticated con el sub de A
--   pruebas.como('anon')           anon, sin sub (visitante sin sesión)
--   pruebas.como('A', 'anon')      anon con el sub de A (JWT falsificado)
--   pruebas.como('nadie')          authenticated sin sub
--   pruebas.como('C', 'postgres')  superusuario con el sub de C (para crear sus datos saltándose la RLS)
--   pruebas.como('postgres')       vuelve al superusuario, sin claims
create function pruebas.como(p_quien text, p_rol text default 'authenticated') returns void
language plpgsql as $$
declare
  v_sub uuid;
begin
  if p_quien = 'postgres' then
    perform set_config('request.jwt.claims', '', true);
    set local role none;
    return;
  end if;
  if p_quien = 'anon' then
    p_rol := 'anon';
  elsif p_quien <> 'nadie' then
    v_sub := pruebas.u(p_quien);
    if v_sub is null then raise exception 'FALLO: usuario de prueba desconocido: %', p_quien; end if;
  end if;
  perform set_config('request.jwt.claims',
    jsonb_strip_nulls(jsonb_build_object('sub', v_sub, 'role', nullif(p_rol, 'postgres')))::text, true);
  if p_rol = 'authenticated' then
    set local role authenticated;
  elsif p_rol = 'anon' then
    set local role anon;
  elsif p_rol = 'postgres' then
    set local role none;
  else
    raise exception 'FALLO: rol de prueba desconocido: %', p_rol;
  end if;
end;
$$;

-- Comprueba una condición.
create function pruebas.cierto(p_cond boolean, p_que text) returns void language plpgsql as $$
begin
  if p_cond is not true then raise exception 'FALLO: %', p_que; end if;
end;
$$;

-- Deja constancia de una prueba superada.
create function pruebas.ok(p_que text) returns void language plpgsql as $$
begin
  raise notice 'OK: %', p_que;
end;
$$;

-- Ejecuta p_sql y comprueba que falla con el código p_codigo (SQLSTATE).
create function pruebas.falla(p_sql text, p_codigo text, p_que text) returns void language plpgsql as $$
declare
  v_estado text;
  v_mensaje text;
begin
  begin
    execute p_sql;
  exception when others then
    get stacked diagnostics v_estado = returned_sqlstate, v_mensaje = message_text;
  end;
  if v_estado is null then
    raise exception 'FALLO: % — tenía que dar el error % y no dio ninguno. SQL: %', p_que, p_codigo, p_sql;
  elsif v_estado <> p_codigo then
    raise exception 'FALLO: % — esperaba el error % y dio % («%»). SQL: %', p_que, p_codigo, v_estado, v_mensaje, p_sql;
  end if;
end;
$$;

-- Lo mismo, y si va bien deja su «OK: …».
create function pruebas.rechaza(p_sql text, p_codigo text, p_que text) returns void language plpgsql as $$
begin
  perform pruebas.falla(p_sql, p_codigo, 'se rechaza ' || p_que);
  perform pruebas.ok('se rechaza ' || p_que || ' (' || p_codigo || ')');
end;
$$;

-- Ejecuta p_sql, que NO debe fallar.
create function pruebas.vale(p_sql text, p_que text) returns void language plpgsql as $$
declare
  v_estado text;
  v_mensaje text;
begin
  execute p_sql;
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_mensaje = message_text;
  raise exception 'FALLO: % — no tenía que fallar y dio % («%»). SQL: %', p_que, v_estado, v_mensaje, p_sql;
end;
$$;

-- Ejecuta un insert/update/delete y devuelve cuántas filas ha tocado.
create function pruebas.afectadas(p_sql text) returns bigint language plpgsql as $$
declare
  n bigint;
begin
  execute p_sql;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- Cuántas filas devuelve una consulta (con la RLS de quien la lanza).
create function pruebas.contar(p_sql text) returns bigint language plpgsql as $$
declare
  n bigint;
begin
  execute 'select count(*) from (' || p_sql || ') s' into n;
  return n;
end;
$$;

-- «where» que señala la fila de partida de alguien en una tabla.
create function pruebas.su_fila(p_tabla text, p_quien text) returns text language plpgsql stable as $$
declare
  v_fila text;
begin
  select fila into v_fila from pruebas.tablas where tabla = p_tabla;
  if v_fila is null then
    return format('user_id = %L', pruebas.u(p_quien));
  end if;
  return format('id = %L', pruebas.f(p_quien || '.' || v_fila));
end;
$$;

-- Lo que hay DE VERDAD en la base de datos (sin RLS: security definer del
-- superusuario), para comprobar que nadie ha tocado lo ajeno.
create function pruebas.filas_de(p_tabla text, p_user uuid) returns bigint
language plpgsql security definer set search_path = public, pruebas as $$
declare
  n bigint;
begin
  execute format('select count(*) from public.%I where user_id = $1', p_tabla) into n using p_user;
  return n;
end;
$$;

-- Huella de todas las filas de un usuario en las 7 tablas.
create function pruebas.huella(p_user uuid) returns text
language plpgsql security definer set search_path = public, pruebas as $$
declare
  t record;
  v text;
  v_todo text := '';
begin
  for t in select tabla from pruebas.tablas order by orden loop
    execute format('select coalesce(string_agg(x::text, %L order by x::text), %L) from public.%I x where x.user_id = $1',
                   '|', '', t.tabla) into v using p_user;
    v_todo := v_todo || t.tabla || '=' || v || ';';
  end loop;
  return md5(v_todo);
end;
$$;

-- Crea las filas de partida del usuario actual (auth.uid()) en las 7 tablas.
create function pruebas.crear_datos(p_quien text) returns void language plpgsql as $$
declare
  p text := p_quien || '.';
  n bigint;
begin
  insert into public.plan_ajustes (limite_diario, dias_estudio, reglas)
    values (3, '{1,2,3,4,5}', '{"umbral_repaso": 60}');
  insert into public.plan_temas (id, numero, nombre, bloque, topic_ids)
    values (pruebas.f(p || 'tema'), 1, 'Incendios', 'Específico', '{t-incendios}');
  insert into public.plan_tests (id, tema_id, plataforma, nombre, referencia, url, num_preguntas)
    values (pruebas.f(p || 'test'), pruebas.f(p || 'tema'), 'tutor_bombero', 'Test 1', 'TB-T1-01',
            'https://tutorbomberos.es/TEST/index.jsp', 30);
  insert into public.plan_tareas (id, test_id, fecha, prioridad)
    values (pruebas.f(p || 'tarea'), pruebas.f(p || 'test'), date '2026-10-05', 1);
  insert into public.plan_resultados (id, test_id, tarea_id, fuente, aciertos, fallos, blancos, total, nota,
                                      duracion_seg, detalle)
    values (pruebas.f(p || 'resultado'), pruebas.f(p || 'test'), pruebas.f(p || 'tarea'), 'manual', 18, 7, 5, 30, 5.17,
            1500, '[{"k": "b:101", "t": null, "f": "pjfire", "ok": true}]');
  update public.plan_tareas
     set estado = 'completado', completada_at = now(), resultado_id = pruebas.f(p || 'resultado')
   where id = pruebas.f(p || 'tarea');
  get diagnostics n = row_count;
  perform pruebas.cierto(n = 1, p_quien || ' no puede completar su propia tarea');
  insert into public.plan_eventos (id, tipo, tarea_id, test_id, datos)
    values (pruebas.f(p || 'evento'), 'completado', pruebas.f(p || 'tarea'), pruebas.f(p || 'test'), '{"nota": 5.17}');
  insert into public.plan_preguntas (id, tema_id, fuente, enunciado, opciones, correcta, explicacion)
    values (pruebas.f(p || 'pregunta'), pruebas.f(p || 'tema'), 'propia',
            '¿Qué presión mínima debe tener una BIE de 25 mm?', '["2 bar", "3,5 bar", "5 bar"]', 0,
            'Pregunta inventada para las pruebas.');
end;
$$;


-- =====================================================================
-- 1) Catálogo: RLS, políticas, permisos y funciones
-- =====================================================================
do $$
declare
  r record;
  n int;
begin
  select count(*) into n from pg_tables where schemaname = 'public' and tablename like 'plan\_%';
  perform pruebas.cierto(n = 7, format('hay %s tablas plan_* y se esperaban 7', n));
  for r in
    select c.relname, c.relrowsecurity
      from pg_class c join pg_namespace s on s.oid = c.relnamespace
     where s.nspname = 'public' and c.relkind = 'r' and c.relname like 'plan\_%'
  loop
    perform pruebas.cierto(r.relrowsecurity, r.relname || ' no tiene la RLS activada');
    perform pruebas.cierto(exists (select 1 from pruebas.tablas t where t.tabla = r.relname),
      r.relname || ' no está cubierta por estas pruebas (añádela a pruebas.tablas)');
  end loop;
  perform pruebas.ok('las 7 tablas plan_* existen y tienen la RLS activada');
end $$;

do $$
declare
  t record;
  r record;
begin
  for t in select tabla from pruebas.tablas order by orden loop
    perform pruebas.cierto(exists (select 1 from pg_policies where schemaname = 'public' and tablename = t.tabla),
      t.tabla || ' no tiene ninguna política');
  end loop;
  for r in select * from pg_policies where schemaname = 'public' and tablename like 'plan\_%' loop
    perform pruebas.cierto(r.roles = array['authenticated']::name[],
      format('la política «%s» de %s es para %s, no solo «to authenticated»', r.policyname, r.tablename, r.roles));
    perform pruebas.cierto(r.qual like '%auth.uid()%' and r.qual like '%plan_permitido()%',
      format('el using de «%s» no exige auth.uid() y plan_permitido(): %s', r.policyname, r.qual));
    perform pruebas.cierto(r.cmd in ('SELECT', 'DELETE')
        or (r.with_check like '%auth.uid()%' and r.with_check like '%plan_permitido()%'),
      format('el with check de «%s» no exige auth.uid() y plan_permitido(): %s', r.policyname, r.with_check));
  end loop;
  perform pruebas.ok('todas las políticas de plan_* son «to authenticated» y exigen user_id = auth.uid() y plan_permitido()');
end $$;

do $$
declare
  t record;
  p text;
begin
  for t in select tabla from pruebas.tablas order by orden loop
    foreach p in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'] loop
      perform pruebas.cierto(not has_table_privilege('anon', 'public.' || t.tabla, p),
        format('anon tiene %s sobre %s', p, t.tabla));
    end loop;
    perform pruebas.cierto(not has_any_column_privilege('anon', 'public.' || t.tabla, 'SELECT, INSERT, UPDATE, REFERENCES'),
      format('anon tiene permisos de columna sobre %s', t.tabla));
    foreach p in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE'] loop
      perform pruebas.cierto(has_table_privilege('authenticated', 'public.' || t.tabla, p),
        format('authenticated no tiene %s sobre %s (la app no podría usarla)', p, t.tabla));
    end loop;
  end loop;
  perform pruebas.ok('anon no tiene ningún permiso sobre las tablas plan_* y authenticated tiene los que la app necesita');
end $$;

do $$
declare
  r record;
  n int := 0;
begin
  perform pruebas.cierto(to_regprocedure('public.plan_permitido()') is not null, 'no existe plan_permitido()');
  perform pruebas.cierto(to_regprocedure('public.plan_tocar_updated_at()') is not null, 'no existe plan_tocar_updated_at()');
  -- supabase_base.sql no crea funciones en public: todas las de public son de las migraciones.
  for r in
    select p.oid, p.oid::regprocedure as firma, p.prosecdef, p.proconfig
      from pg_proc p join pg_namespace s on s.oid = p.pronamespace
     where s.nspname = 'public'
  loop
    n := n + 1;
    perform pruebas.cierto(not has_function_privilege('anon', r.oid, 'EXECUTE'),
      format('anon puede ejecutar %s', r.firma));
    if r.prosecdef then
      perform pruebas.cierto(exists (select 1 from unnest(r.proconfig) c where c like 'search_path=%'),
        format('%s es security definer y no fija search_path', r.firma));
    end if;
  end loop;
  perform pruebas.cierto(n >= 2, 'no se han encontrado las funciones del Plan en public');
  perform pruebas.cierto(has_function_privilege('authenticated', 'public.plan_permitido()', 'EXECUTE'),
    'authenticated no puede ejecutar plan_permitido() (las políticas lo necesitan)');
  perform pruebas.cierto(not has_function_privilege('authenticated', 'public.plan_tocar_updated_at()', 'EXECUTE'),
    'authenticated puede ejecutar plan_tocar_updated_at() a mano (solo la deben usar los triggers)');
  select count(*) into n
    from pg_trigger g join pg_class c on c.oid = g.tgrelid
   where not g.tgisinternal and g.tgenabled <> 'D'
     and g.tgfoid = 'public.plan_tocar_updated_at()'::regprocedure;
  perform pruebas.cierto(n = 5, format('hay %s triggers de updated_at y se esperaban 5', n));
  perform pruebas.ok('ninguna función de public es ejecutable por anon; plan_permitido() sí por authenticated; 5 triggers de updated_at');
end $$;


-- =====================================================================
-- 2) Usuarios y datos de partida
-- =====================================================================
delete from auth.users where id in (select id from pruebas.usuarios);
insert into auth.users (id, email) select id, lower(nombre) || '@pruebas.invalid' from pruebas.usuarios;
insert into public.profiles (id, is_admin, approved, blocked, feature_flags) values
  (pruebas.u('admin'), true,  true,  false, '{}'),
  (pruebas.u('A'),     false, true,  false, '{"plan": true}'),
  (pruebas.u('B'),     false, true,  false, '{"plan": true, "normativas": true}'),
  (pruebas.u('C'),     false, true,  false, '{"normativas": true}'),
  (pruebas.u('D'),     false, true,  true,  '{"plan": true}'),
  (pruebas.u('E'),     false, false, false, '{"plan": true}'),
  (pruebas.u('F'),     false, true,  false, '{"plan": "true"}');
-- G: sin fila en profiles.

-- A, B y el admin crean sus filas ellos mismos (a través de la RLS).
begin;
do $$
declare
  t record;
begin
  perform pruebas.como('A');
  perform pruebas.cierto(public.plan_permitido(), 'plan_permitido() es false para A');
  perform pruebas.crear_datos('A');
  for t in select tabla from pruebas.tablas order by orden loop
    perform pruebas.cierto(pruebas.filas_de(t.tabla, pruebas.u('A')) = 1,
      format('la fila de A en %s no tiene user_id = A', t.tabla));
  end loop;
  perform pruebas.ok('A (plan: true) crea sus filas en las 7 tablas y user_id lo pone auth.uid()');
end $$;
commit;

begin;
do $$
begin
  perform pruebas.como('B');
  perform pruebas.crear_datos('B');
  perform pruebas.ok('B crea las mismas filas que A (mismo nombre, referencia y enunciado): lo único es por usuario');
end $$;
commit;

begin;
do $$
begin
  perform pruebas.como('admin');
  perform pruebas.cierto(public.plan_permitido(), 'plan_permitido() es false para el admin');
  perform pruebas.crear_datos('admin');
  perform pruebas.ok('el admin, sin el permiso plan, crea sus filas (el opt-in no le afecta)');
end $$;
commit;

-- C, D, E, F y G no pueden crearlas: se crean saltándose la RLS para
-- comprobar después que ni siquiera ven las suyas.
begin;
do $$
declare
  q text;
begin
  foreach q in array array['C', 'D', 'E', 'F', 'G'] loop
    perform pruebas.como(q, 'postgres');
    perform pruebas.crear_datos(q);
  end loop;
end $$;
commit;


-- =====================================================================
-- 3) A y B: cada uno lo suyo
-- =====================================================================
begin;
do $$
declare
  t record;
  n bigint;
  vA uuid := pruebas.u('A');
  vB uuid := pruebas.u('B');
  h text := pruebas.huella(pruebas.u('B'));
begin
  perform pruebas.como('A');
  for t in select * from pruebas.tablas order by orden loop
    n := pruebas.contar(format('select 1 from public.%I', t.tabla));
    perform pruebas.cierto(n = 1, format('A debería ver solo su fila de %s y ve %s', t.tabla, n));
    n := pruebas.contar(format('select 1 from public.%I where user_id <> %L', t.tabla, vA));
    perform pruebas.cierto(n = 0, format('A ve %s filas ajenas en %s', n, t.tabla));
    n := pruebas.contar(format('select 1 from public.%I where %s', t.tabla, pruebas.su_fila(t.tabla, 'B')));
    perform pruebas.cierto(n = 0, format('A ve la fila de B en %s aunque sabe su id', t.tabla));
  end loop;
  perform pruebas.ok('A solo ve sus filas en las 7 tablas, ni siquiera las de B buscándolas por id');

  for t in select * from pruebas.tablas order by orden loop
    perform pruebas.falla(format('insert into public.%I (user_id, %s) values (%L, %s)', t.tabla, t.columnas, vB, t.valores),
      '42501', format('A inserta en %s a nombre de B', t.tabla));
  end loop;
  perform pruebas.ok('A no puede insertar filas a nombre de B en ninguna de las 7 tablas (42501)');

  for t in select * from pruebas.tablas order by orden loop
    n := pruebas.afectadas(format('update public.%I set %s where %s', t.tabla, t.cambio, pruebas.su_fila(t.tabla, 'B')));
    perform pruebas.cierto(n = 0, format('A ha modificado %s filas de B en %s', n, t.tabla));
    n := pruebas.afectadas(format('update public.%I set %s where user_id = %L', t.tabla, t.cambio, vB));
    perform pruebas.cierto(n = 0, format('A ha modificado %s filas de B en %s', n, t.tabla));
    n := pruebas.afectadas(format('delete from public.%I where %s', t.tabla, pruebas.su_fila(t.tabla, 'B')));
    perform pruebas.cierto(n = 0, format('A ha borrado %s filas de B en %s', n, t.tabla));
    n := pruebas.afectadas(format('delete from public.%I where user_id = %L', t.tabla, vB));
    perform pruebas.cierto(n = 0, format('A ha borrado %s filas de B en %s', n, t.tabla));
  end loop;
  perform pruebas.cierto(pruebas.huella(vB) = h, 'las filas de B han cambiado');
  perform pruebas.ok('A no puede modificar ni borrar filas de B en ninguna de las 7 tablas (0 filas y B intacto)');

  for t in select * from pruebas.tablas order by orden loop
    perform pruebas.falla(format('update public.%I set user_id = %L where user_id = %L', t.tabla, vB, vA),
      '42501', format('A le pasa a B su fila de %s', t.tabla));
  end loop;
  perform pruebas.ok('A no puede pasarle a B una fila suya (update de user_id, 42501)');

  -- Upsert (lo que hace PostgREST) con el id de una fila de B.
  for t in select * from pruebas.tablas where fila is not null order by orden loop
    perform pruebas.falla(format('insert into public.%I (id, %s) values (%L, %s) on conflict (id) do update set %s',
        t.tabla, t.columnas, pruebas.f('B.' || t.fila), t.valores, t.cambio),
      '42501', format('A hace upsert sobre la fila de B en %s', t.tabla));
    n := pruebas.afectadas(format('insert into public.%I (id, %s) values (%L, %s) on conflict (id) do nothing',
        t.tabla, t.columnas, pruebas.f('B.' || t.fila), t.valores));
    perform pruebas.cierto(n = 0, format('el upsert de A con el id de B ha insertado en %s', t.tabla));
  end loop;
  perform pruebas.falla(format('insert into public.plan_ajustes (user_id, limite_diario) values (%L, 5) on conflict (user_id) do update set limite_diario = 9', vB),
    '42501', 'A hace upsert sobre los ajustes de B');
  perform pruebas.cierto(pruebas.huella(vB) = h, 'las filas de B han cambiado');
  perform pruebas.ok('A no puede pisar filas de B con un upsert que use sus ids (on conflict do update → 42501; do nothing → nada)');
end $$;
rollback;

begin;
do $$
declare
  t record;
  n bigint;
begin
  perform pruebas.como('B');
  for t in select * from pruebas.tablas order by orden loop
    n := pruebas.contar(format('select 1 from public.%I where user_id <> %L', t.tabla, pruebas.u('B')));
    perform pruebas.cierto(n = 0, format('B ve %s filas ajenas en %s', n, t.tabla));
    n := pruebas.contar(format('select 1 from public.%I', t.tabla));
    perform pruebas.cierto(n = 1, format('B debería ver su fila de %s y ve %s', t.tabla, n));
  end loop;
  perform pruebas.ok('y al revés: B solo ve las suyas, no las de A');
end $$;
rollback;


-- =====================================================================
-- 4) anon y sesiones sin sub
-- =====================================================================
begin;
do $$
declare
  t record;
begin
  perform pruebas.como('anon');
  for t in select * from pruebas.tablas order by orden loop
    perform pruebas.falla(format('select * from public.%I', t.tabla), '42501', format('anon lee %s', t.tabla));
    perform pruebas.falla(format('insert into public.%I (%s) values (%s)', t.tabla, t.columnas, t.valores),
      '42501', format('anon inserta en %s', t.tabla));
    perform pruebas.falla(format('update public.%I set %s', t.tabla, t.cambio), '42501', format('anon modifica %s', t.tabla));
    perform pruebas.falla(format('delete from public.%I', t.tabla), '42501', format('anon borra en %s', t.tabla));
  end loop;
  perform pruebas.falla('select public.plan_permitido()', '42501', 'anon ejecuta plan_permitido()');
  perform pruebas.ok('anon no puede leer, insertar, modificar ni borrar en las 7 tablas, ni ejecutar plan_permitido() (sin permisos: 42501)');
end $$;
rollback;

-- Aunque alguien diera por error permisos de tabla a anon, la RLS sigue
-- cerrando el paso: las políticas son solo «to authenticated». Y aunque
-- el JWT de anon lleve el sub de A.
begin;
do $$
declare
  t record;
  n bigint;
  h text := pruebas.huella(pruebas.u('A'));
begin
  for t in select tabla from pruebas.tablas loop
    execute format('grant select, insert, update, delete on public.%I to anon', t.tabla);
  end loop;
  perform pruebas.como('A', 'anon');
  for t in select * from pruebas.tablas order by orden loop
    n := pruebas.contar(format('select 1 from public.%I', t.tabla));
    perform pruebas.cierto(n = 0, format('anon (con permisos y el sub de A) ve %s filas de %s', n, t.tabla));
    perform pruebas.falla(format('insert into public.%I (%s) values (%s)', t.tabla, t.columnas, t.valores),
      '42501', format('anon (con permisos y el sub de A) inserta en %s', t.tabla));
    n := pruebas.afectadas(format('update public.%I set %s', t.tabla, t.cambio));
    perform pruebas.cierto(n = 0, format('anon (con permisos y el sub de A) modifica %s filas de %s', n, t.tabla));
    n := pruebas.afectadas(format('delete from public.%I', t.tabla));
    perform pruebas.cierto(n = 0, format('anon (con permisos y el sub de A) borra %s filas de %s', n, t.tabla));
  end loop;
  perform pruebas.cierto(pruebas.huella(pruebas.u('A')) = h, 'las filas de A han cambiado');
  perform pruebas.ok('aunque anon tuviera permisos de tabla y el sub de A, la RLS no le deja ver ni tocar nada');
end $$;
rollback;

begin;
do $$
declare
  t record;
  n bigint;
begin
  perform pruebas.como('nadie');
  perform pruebas.cierto(not public.plan_permitido(), 'plan_permitido() es true sin sub');
  for t in select * from pruebas.tablas order by orden loop
    n := pruebas.contar(format('select 1 from public.%I', t.tabla));
    perform pruebas.cierto(n = 0, format('authenticated sin sub ve %s filas de %s', n, t.tabla));
    perform pruebas.falla(format('insert into public.%I (%s) values (%s)', t.tabla, t.columnas, t.valores),
      '42501', format('authenticated sin sub inserta en %s', t.tabla));
  end loop;
  perform pruebas.ok('authenticated sin sub (sin usuario) no ve ni inserta nada');
end $$;
rollback;


-- =====================================================================
-- 5) El permiso «plan» (opt-in): sin él no hay nada, salvo el admin
-- =====================================================================
begin;
do $$
declare
  q record;
  t record;
  n bigint;
  h text;
begin
  for q in select * from pruebas.usuarios where nombre in ('C', 'D', 'E', 'F', 'G') order by nombre loop
    h := pruebas.huella(q.id);
    perform pruebas.como(q.nombre);
    perform pruebas.cierto(not public.plan_permitido(), format('plan_permitido() es true para %s (%s)', q.nombre, q.descripcion));
    for t in select * from pruebas.tablas order by orden loop
      perform pruebas.cierto(pruebas.filas_de(t.tabla, q.id) = 1, format('a %s le falta su fila de partida en %s', q.nombre, t.tabla));
      n := pruebas.contar(format('select 1 from public.%I', t.tabla));
      perform pruebas.cierto(n = 0, format('%s (%s) ve %s filas de %s', q.nombre, q.descripcion, n, t.tabla));
      perform pruebas.falla(format('insert into public.%I (%s) values (%s)', t.tabla, t.columnas, t.valores),
        '42501', format('%s (%s) inserta en %s', q.nombre, q.descripcion, t.tabla));
      n := pruebas.afectadas(format('update public.%I set %s where user_id = %L', t.tabla, t.cambio, q.id));
      perform pruebas.cierto(n = 0, format('%s (%s) modifica %s filas suyas de %s', q.nombre, q.descripcion, n, t.tabla));
      n := pruebas.afectadas(format('delete from public.%I where user_id = %L', t.tabla, q.id));
      perform pruebas.cierto(n = 0, format('%s (%s) borra %s filas suyas de %s', q.nombre, q.descripcion, n, t.tabla));
    end loop;
    perform pruebas.cierto(pruebas.huella(q.id) = h, format('las filas de %s han cambiado', q.nombre));
    perform pruebas.ok(format('%s (%s) no puede leer ni escribir en ninguna tabla plan_*, ni siquiera sus propias filas', q.nombre, q.descripcion));
  end loop;
end $$;
rollback;

begin;
do $$
declare
  t record;
  n bigint;
  hA text := pruebas.huella(pruebas.u('A'));
  hB text := pruebas.huella(pruebas.u('B'));
begin
  perform pruebas.como('admin');
  for t in select * from pruebas.tablas order by orden loop
    n := pruebas.contar(format('select 1 from public.%I', t.tabla));
    perform pruebas.cierto(n = 1, format('el admin debería ver solo su fila de %s y ve %s', t.tabla, n));
    n := pruebas.contar(format('select 1 from public.%I where user_id in (%L, %L)', t.tabla, pruebas.u('A'), pruebas.u('B')));
    perform pruebas.cierto(n = 0, format('el admin ve %s filas de A o B en %s', n, t.tabla));
    n := pruebas.afectadas(format('update public.%I set %s where %s', t.tabla, t.cambio, pruebas.su_fila(t.tabla, 'admin')));
    perform pruebas.cierto(n = 1, format('el admin no puede modificar su fila de %s', t.tabla));
    n := pruebas.afectadas(format('update public.%I set %s where user_id = %L', t.tabla, t.cambio, pruebas.u('A')));
    perform pruebas.cierto(n = 0, format('el admin modifica %s filas de A en %s', n, t.tabla));
    n := pruebas.afectadas(format('delete from public.%I where user_id = %L', t.tabla, pruebas.u('A')));
    perform pruebas.cierto(n = 0, format('el admin borra %s filas de A en %s', n, t.tabla));
    perform pruebas.falla(format('insert into public.%I (user_id, %s) values (%L, %s)', t.tabla, t.columnas, pruebas.u('A'), t.valores),
      '42501', format('el admin inserta en %s a nombre de A', t.tabla));
  end loop;
  perform pruebas.vale($q$insert into public.plan_temas (nombre) values ('Segundo tema del admin')$q$, 'el admin crea un tema');
  for t in select * from pruebas.tablas order by orden desc loop
    n := pruebas.afectadas(format('delete from public.%I where %s', t.tabla, pruebas.su_fila(t.tabla, 'admin')));
    perform pruebas.cierto(n = 1, format('el admin no puede borrar su fila de %s', t.tabla));
  end loop;
  perform pruebas.cierto(pruebas.huella(pruebas.u('A')) = hA and pruebas.huella(pruebas.u('B')) = hB, 'las filas de A o B han cambiado');
  perform pruebas.ok('el admin, sin el permiso plan, lee, crea, modifica y borra las suyas, pero no ve ni toca las de A ni las de B');
end $$;
rollback;

-- Si a A le quitan el permiso, lo bloquean o le retiran la aprobación,
-- deja de ver sus datos en ese momento (y no se borran).
begin;
do $$
declare
  t record;
  n bigint;
  caso record;
  h text := pruebas.huella(pruebas.u('A'));
begin
  for caso in
    select * from (values
      ('sin el permiso plan', '{}'::jsonb, true, false),
      ('con plan: false', '{"plan": false}'::jsonb, true, false),
      ('bloqueado', '{"plan": true}'::jsonb, true, true),
      ('sin aprobar', '{"plan": true}'::jsonb, false, false)
    ) v(que, flags, aprobado, bloqueado)
  loop
    perform pruebas.como('postgres');
    update public.profiles set feature_flags = caso.flags, approved = caso.aprobado, blocked = caso.bloqueado
     where id = pruebas.u('A');
    perform pruebas.como('A');
    for t in select * from pruebas.tablas order by orden loop
      n := pruebas.contar(format('select 1 from public.%I', t.tabla));
      perform pruebas.cierto(n = 0, format('A %s sigue viendo %s filas de %s', caso.que, n, t.tabla));
    end loop;
    perform pruebas.falla($q$insert into public.plan_temas (nombre) values ('Tema nuevo')$q$, '42501',
      format('A %s crea un tema', caso.que));
  end loop;
  perform pruebas.como('postgres');
  update public.profiles set feature_flags = '{"plan": true}', approved = true, blocked = false where id = pruebas.u('A');
  perform pruebas.como('A');
  n := pruebas.contar('select 1 from public.plan_temas');
  perform pruebas.cierto(n = 1, 'A no recupera sus datos al devolverle el permiso');
  perform pruebas.cierto(pruebas.huella(pruebas.u('A')) = h, 'las filas de A han cambiado');
  perform pruebas.ok('si a A le quitan el permiso (o plan: false), lo bloquean o le retiran la aprobación, deja de ver sus datos al momento, y al devolvérselo vuelven intactos');
end $$;
rollback;


-- =====================================================================
-- 6) Claves foráneas compuestas: nada se cuelga de lo de otro
-- =====================================================================
begin;
do $$
begin
  perform pruebas.como('A');
  perform pruebas.rechaza(format($q$insert into public.plan_tests (plataforma, nombre, tema_id) values ('otra', 'Test colgado', %L)$q$,
      pruebas.f('B.tema')), '23503', 'que A cree un test con el tema_id de B');
  perform pruebas.rechaza(format($q$update public.plan_tests set tema_id = %L where id = %L$q$,
      pruebas.f('B.tema'), pruebas.f('A.test')), '23503', 'que A cambie el tema de su test por el de B');
  perform pruebas.rechaza(format($q$insert into public.plan_tareas (test_id, fecha) values (%L, '2026-10-20')$q$,
      pruebas.f('B.test')), '23503', 'que A cree una tarea con el test_id de B');
  perform pruebas.rechaza(format($q$update public.plan_tareas set test_id = %L where id = %L$q$,
      pruebas.f('B.test'), pruebas.f('A.tarea')), '23503', 'que A cambie el test de su tarea por el de B');
  perform pruebas.rechaza(format($q$insert into public.plan_resultados (fuente, aciertos, tarea_id) values ('manual', 1, %L)$q$,
      pruebas.f('B.tarea')), '23503', 'que A cree un resultado con el tarea_id de B');
  perform pruebas.rechaza(format($q$insert into public.plan_resultados (fuente, aciertos, test_id) values ('manual', 1, %L)$q$,
      pruebas.f('B.test')), '23503', 'que A cree un resultado con el test_id de B');
  perform pruebas.rechaza(format($q$update public.plan_resultados set tarea_id = %L where id = %L$q$,
      pruebas.f('B.tarea'), pruebas.f('A.resultado')), '23503', 'que A cuelgue su resultado de la tarea de B');
  perform pruebas.rechaza(format($q$insert into public.plan_preguntas (enunciado, opciones, correcta, tema_id) values ('¿Colgada del tema de B?', '["a", "b"]', 0, %L)$q$,
      pruebas.f('B.tema')), '23503', 'que A cree una pregunta con el tema_id de B');
  perform pruebas.rechaza(format($q$insert into public.plan_tareas (test_id, fecha) values (%L, '2026-10-20')$q$,
      gen_random_uuid()), '23503', 'una tarea con un test que no existe');
  perform pruebas.vale(format($q$insert into public.plan_tests (plataforma, nombre, tema_id) values ('otra', 'Test de mi tema', %L)$q$,
      pruebas.f('A.tema')), 'A crea un test con su propio tema');
end $$;
rollback;


-- =====================================================================
-- 7) Restricciones
-- =====================================================================
begin;
do $$
declare
  vA_test uuid := pruebas.f('A.test');
  vA_tarea uuid := pruebas.f('A.tarea');
  v_sesion uuid := gen_random_uuid();
begin
  perform pruebas.como('A');

  -- Ajustes
  perform pruebas.rechaza('update public.plan_ajustes set limite_diario = 0', '23514', 'un límite diario de 0');
  perform pruebas.rechaza('update public.plan_ajustes set limite_diario = 21', '23514', 'un límite diario de 21');
  perform pruebas.rechaza($q$update public.plan_ajustes set dias_estudio = '{}'$q$, '23514', 'ningún día de estudio');
  perform pruebas.rechaza($q$update public.plan_ajustes set dias_estudio = '{0,1}'$q$, '23514', 'un día de estudio 0');
  perform pruebas.rechaza($q$update public.plan_ajustes set dias_estudio = '{7,8}'$q$, '23514', 'un día de estudio 8');
  perform pruebas.rechaza($q$update public.plan_ajustes set reglas = '[]'$q$, '23514', 'reglas que no son un objeto');

  -- Temas
  perform pruebas.rechaza($q$insert into public.plan_temas (nombre) values ('  INCENDIOS ')$q$, '23505',
    'dos temas con el mismo nombre (cambiando mayúsculas y espacios)');
  perform pruebas.rechaza($q$insert into public.plan_temas (nombre) values ('   ')$q$, '23514', 'un tema sin nombre');
  perform pruebas.rechaza($q$insert into public.plan_temas (nombre, numero) values ('Tema mil', 1000)$q$, '23514', 'un tema con número 1000');

  -- Tests
  perform pruebas.rechaza($q$insert into public.plan_tests (plataforma, nombre, referencia) values ('tutor_bombero', 'Otro nombre', '  tb-t1-01 ')$q$,
    '23505', 'dos tests de la misma plataforma con la misma referencia (cambiando mayúsculas y espacios)');
  perform pruebas.vale($q$insert into public.plan_tests (plataforma, nombre, referencia) values ('otra', 'Otro nombre', 'TB-T1-01')$q$,
    'la misma referencia en otra plataforma');
  perform pruebas.vale($q$insert into public.plan_tests (plataforma, nombre) values ('pjfire', 'Test 7')$q$, 'un test de pj.fire sin referencia');
  perform pruebas.rechaza($q$insert into public.plan_tests (plataforma, nombre, referencia) values ('pjfire', '  TEST 7 ', '')$q$,
    '23505', 'dos tests sin referencia con el mismo nombre (referencia vacía = sin referencia)');
  perform pruebas.rechaza($q$insert into public.plan_tests (plataforma, nombre, url) values ('otra', 'Test con script', 'javascript:alert(1)')$q$,
    '23514', 'la url javascript:alert(1)');
  perform pruebas.rechaza(format($q$update public.plan_tests set url = 'JavaScript:alert(1)//https://x' where id = %L$q$, vA_test),
    '23514', 'cambiar la url por JavaScript:alert(1)//https://x');
  perform pruebas.rechaza($q$insert into public.plan_tests (plataforma, nombre, url) values ('otra', 'Test data', 'data:text/html,<script>alert(1)</script>')$q$,
    '23514', 'una url data:');
  perform pruebas.rechaza($q$insert into public.plan_tests (plataforma, nombre, url) values ('otra', 'Test con espacio', 'https://tutorbomberos.es/x onclick=alert(1)')$q$,
    '23514', 'una url con espacios');
  perform pruebas.vale($q$insert into public.plan_tests (plataforma, nombre, url) values ('otra', 'Test con url', 'HTTPS://tutorbomberos.es/TEST/index.jsp')$q$,
    'una url https');
  perform pruebas.rechaza($q$insert into public.plan_tests (plataforma, nombre, clave) values ('otra', 'Test con clave', 'test con clave')$q$,
    '428C9', 'enviar un valor a la columna generada clave');
  perform pruebas.rechaza(format($q$update public.plan_tests set clave = 'otra cosa' where id = %L$q$, vA_test),
    '428C9', 'cambiar la columna generada clave');
  perform pruebas.rechaza($q$insert into public.plan_tests (plataforma, nombre) values ('tutorbomberos', 'Test raro')$q$,
    '23514', 'una plataforma desconocida');
  perform pruebas.rechaza($q$insert into public.plan_tests (plataforma, nombre, config) values ('pjfire', 'Test config', '[]')$q$,
    '23514', 'un config que no es un objeto');

  -- Tareas
  perform pruebas.rechaza(format($q$insert into public.plan_tareas (test_id, fecha, estado) values (%L, '2026-10-07', 'completado')$q$, vA_test),
    '23514', 'una tarea «completado» sin completada_at');
  perform pruebas.rechaza(format($q$update public.plan_tareas set completada_at = null where id = %L$q$, vA_tarea),
    '23514', 'quitarle completada_at a una tarea completada');
  perform pruebas.rechaza(format($q$insert into public.plan_tareas (test_id, fecha) values (%L, '2026-10-05')$q$, vA_test),
    '23505', 'dos tareas del mismo test el mismo día');
  perform pruebas.vale(format($q$insert into public.plan_tareas (test_id, fecha) values (%L, '2026-10-06')$q$, vA_test),
    'el mismo test otro día');
  perform pruebas.rechaza($q$insert into public.plan_tareas (fecha) values ('2026-10-07')$q$, '23502', 'una tarea sin test');
  perform pruebas.rechaza(format($q$insert into public.plan_tareas (test_id, fecha, estado) values (%L, '2026-10-08', 'hecho')$q$, vA_test),
    '23514', 'un estado de tarea desconocido');
  perform pruebas.rechaza(format($q$insert into public.plan_tareas (test_id, fecha, prioridad) values (%L, '2026-10-08', 4)$q$, vA_test),
    '23514', 'una prioridad 4');
  perform pruebas.rechaza(format($q$insert into public.plan_tareas (test_id, fecha, origen) values (%L, '2026-10-08', 'manual')$q$, vA_test),
    '23514', 'un origen de tarea desconocido');

  -- Resultados
  perform pruebas.rechaza($q$insert into public.plan_resultados (fuente) values ('manual')$q$, '23514', 'un resultado sin aciertos ni nota');
  perform pruebas.vale($q$insert into public.plan_resultados (fuente, nota) values ('manual', 6.5)$q$, 'un resultado con solo la nota');
  perform pruebas.vale($q$insert into public.plan_resultados (fuente, aciertos) values ('manual', 12)$q$, 'un resultado con solo los aciertos');
  perform pruebas.rechaza($q$insert into public.plan_resultados (fuente, aciertos, fallos, blancos, total) values ('manual', 20, 8, 3, 30)$q$,
    '23514', 'aciertos + fallos + blancos > total');
  perform pruebas.vale($q$insert into public.plan_resultados (fuente, aciertos, fallos, blancos, total) values ('manual', 20, 7, 3, 30)$q$,
    'aciertos + fallos + blancos = total');
  perform pruebas.rechaza($q$insert into public.plan_resultados (fuente, nota) values ('manual', 10.5)$q$, '23514', 'una nota de 10,5');
  perform pruebas.rechaza($q$insert into public.plan_resultados (fuente, aciertos, total) values ('manual', 0, 0)$q$, '23514', 'un total de 0');
  perform pruebas.rechaza($q$insert into public.plan_resultados (fuente, aciertos) values ('tutor_bombero', 3)$q$, '23514', 'una fuente de resultado desconocida');
  perform pruebas.rechaza($q$insert into public.plan_resultados (fuente, aciertos, detalle) values ('examen', 3, '{"k": "b:1"}')$q$,
    '23514', 'un detalle que no es una lista');
  perform pruebas.vale(format($q$insert into public.plan_resultados (fuente, aciertos, session_id) values ('pjfire', 10, %L)$q$, v_sesion),
    'un resultado de pj.fire con su session_id');
  perform pruebas.rechaza(format($q$insert into public.plan_resultados (fuente, aciertos, session_id) values ('pjfire', 11, %L)$q$, v_sesion),
    '23505', 'dos resultados con el mismo session_id');
  perform pruebas.vale($q$insert into public.plan_resultados (fuente, aciertos) values ('manual', 9)$q$,
    'varios resultados sin session_id');

  -- Actividad
  perform pruebas.rechaza($q$insert into public.plan_eventos (tipo) values ('visto')$q$, '23514', 'un tipo de evento desconocido');
  perform pruebas.rechaza(format($q$insert into public.plan_eventos (tipo, datos) values ('abierto', %L)$q$,
      jsonb_build_object('relleno', repeat('x', 3000))), '23514', 'un evento con más de 2 KB de datos');
  perform pruebas.rechaza($q$insert into public.plan_eventos (tipo, datos) values ('abierto', '[1, 2]')$q$, '23514', 'unos datos de evento que no son un objeto');

  -- Preguntas propias
  perform pruebas.rechaza($q$insert into public.plan_preguntas (enunciado, opciones, correcta) values ('  ¿Qué presión mínima   DEBE TENER una bie de 25 MM?  ', '["a", "b"]', 1)$q$,
    '23505', 'dos preguntas con el mismo enunciado (cambiando espacios y mayúsculas)');
  perform pruebas.rechaza($q$insert into public.plan_preguntas (enunciado, opciones, correcta) values ('¿Dos opciones y la correcta es la tercera?', '["a", "b"]', 2)$q$,
    '23514', 'correcta = 2 con 2 opciones');
  perform pruebas.rechaza($q$insert into public.plan_preguntas (enunciado, opciones, correcta) values ('¿Tres opciones y la correcta es la cuarta?', '["a", "b", "c"]', 3)$q$,
    '23514', 'correcta = 3 con 3 opciones');
  perform pruebas.vale($q$insert into public.plan_preguntas (enunciado, opciones, correcta) values ('¿Cuatro opciones y la correcta es la cuarta?', '["a", "b", "c", "d"]', 3)$q$,
    'correcta = 3 con 4 opciones');
  perform pruebas.rechaza($q$insert into public.plan_preguntas (enunciado, opciones, correcta) values ('¿Una sola opción?', '["a"]', 0)$q$,
    '23514', 'una pregunta con una sola opción');
  perform pruebas.rechaza($q$insert into public.plan_preguntas (enunciado, opciones, correcta) values ('¿Cinco opciones?', '["a", "b", "c", "d", "e"]', 0)$q$,
    '23514', 'una pregunta con cinco opciones');
  perform pruebas.rechaza($q$insert into public.plan_preguntas (enunciado, opciones, correcta) values ('ab', '["a", "b"]', 0)$q$,
    '23514', 'un enunciado de menos de 3 letras');
  perform pruebas.rechaza($q$insert into public.plan_preguntas (enunciado, opciones, correcta, fuente) values ('¿Fuente rara?', '["a", "b"]', 0, 'pjfire')$q$,
    '23514', 'una fuente de pregunta desconocida');
  perform pruebas.rechaza($q$insert into public.plan_preguntas (enunciado, opciones, correcta, huella) values ('¿Con huella?', '["a", "b"]', 0, 'x')$q$,
    '428C9', 'enviar un valor a la columna generada huella');
  perform pruebas.rechaza(format($q$update public.plan_preguntas set huella = 'x' where id = %L$q$, pruebas.f('A.pregunta')),
    '428C9', 'cambiar la columna generada huella');
end $$;
rollback;


-- =====================================================================
-- 8) Borrados
-- =====================================================================
begin;
do $$
declare
  r record;
  n bigint;
begin
  perform pruebas.como('A');
  n := pruebas.afectadas(format('delete from public.plan_temas where id = %L', pruebas.f('A.tema')));
  perform pruebas.cierto(n = 1, 'A no puede borrar su tema');
  select tema_id, user_id into r from public.plan_tests where id = pruebas.f('A.test');
  perform pruebas.cierto(found, 'al borrar el tema se ha borrado su test');
  perform pruebas.cierto(r.tema_id is null and r.user_id = pruebas.u('A'),
    format('al borrar el tema, su test queda con tema_id %s y user_id %s', r.tema_id, r.user_id));
  select tema_id, user_id into r from public.plan_preguntas where id = pruebas.f('A.pregunta');
  perform pruebas.cierto(found, 'al borrar el tema se ha borrado su pregunta');
  perform pruebas.cierto(r.tema_id is null and r.user_id = pruebas.u('A'),
    format('al borrar el tema, su pregunta queda con tema_id %s y user_id %s', r.tema_id, r.user_id));
  perform pruebas.cierto(pruebas.filas_de('plan_temas', pruebas.u('B')) = 1, 'se ha borrado el tema de B');
  perform pruebas.ok('borrar un tema deja sus tests y preguntas sin tema (tema_id null) y conserva su user_id');
end $$;
rollback;

begin;
do $$
declare
  r record;
  n bigint;
begin
  perform pruebas.como('A');
  n := pruebas.afectadas(format('delete from public.plan_tests where id = %L', pruebas.f('A.test')));
  perform pruebas.cierto(n = 1, 'A no puede borrar su test');
  n := pruebas.contar(format('select 1 from public.plan_tareas where id = %L', pruebas.f('A.tarea')));
  perform pruebas.cierto(n = 0, 'al borrar el test no se ha borrado su tarea');
  select test_id, tarea_id, user_id into r from public.plan_resultados where id = pruebas.f('A.resultado');
  perform pruebas.cierto(found, 'al borrar el test se ha borrado su resultado');
  perform pruebas.cierto(r.test_id is null and r.tarea_id is null and r.user_id = pruebas.u('A'),
    format('al borrar el test, su resultado queda con test_id %s, tarea_id %s y user_id %s', r.test_id, r.tarea_id, r.user_id));
  n := pruebas.contar(format('select 1 from public.plan_eventos where id = %L', pruebas.f('A.evento')));
  perform pruebas.cierto(n = 1, 'al borrar el test se ha borrado su actividad');
  perform pruebas.cierto(pruebas.filas_de('plan_tareas', pruebas.u('B')) = 1, 'se ha borrado la tarea de B');
  perform pruebas.ok('borrar un test borra sus tareas y deja sus resultados sin test ni tarea (se conservan, igual que la actividad)');
end $$;
rollback;

begin;
do $$
declare
  r record;
  n bigint;
begin
  perform pruebas.como('A');
  n := pruebas.afectadas(format('delete from public.plan_tareas where id = %L', pruebas.f('A.tarea')));
  perform pruebas.cierto(n = 1, 'A no puede borrar su tarea');
  select test_id, tarea_id, user_id into r from public.plan_resultados where id = pruebas.f('A.resultado');
  perform pruebas.cierto(found, 'al borrar la tarea se ha borrado su resultado');
  perform pruebas.cierto(r.tarea_id is null and r.test_id = pruebas.f('A.test') and r.user_id = pruebas.u('A'),
    format('al borrar la tarea, su resultado queda con tarea_id %s, test_id %s y user_id %s', r.tarea_id, r.test_id, r.user_id));
  perform pruebas.ok('borrar una tarea deja su resultado sin tarea (tarea_id null), con su test');
end $$;
rollback;


-- =====================================================================
-- 9) updated_at lo pone el servidor
-- =====================================================================
begin;
do $$
declare
  viejo constant timestamptz := '2000-01-01 00:00:00+00';
  x_tema uuid := gen_random_uuid();
  x_test uuid := gen_random_uuid();
  x_tarea uuid := gen_random_uuid();
  x_pregunta uuid := gen_random_uuid();
  r record;
  v timestamptz;
begin
  perform pruebas.como('A');
  -- Filas con un updated_at antiguo, para que se note el cambio.
  delete from public.plan_ajustes;
  insert into public.plan_ajustes (updated_at) values (viejo);
  insert into public.plan_temas (id, nombre, updated_at) values (x_tema, 'Tema de updated_at', viejo);
  insert into public.plan_tests (id, plataforma, nombre, updated_at) values (x_test, 'otra', 'Test de updated_at', viejo);
  insert into public.plan_tareas (id, test_id, fecha, updated_at) values (x_tarea, x_test, '2026-10-21', viejo);
  insert into public.plan_preguntas (id, enunciado, opciones, correcta, updated_at)
    values (x_pregunta, '¿Pregunta de updated_at?', '["sí", "no"]', 0, viejo);
  for r in
    select * from (values
      ('plan_ajustes',   format('user_id = %L', pruebas.u('A')), 'limite_diario = 4'),
      ('plan_temas',     format('id = %L', x_tema),              $q$bloque = 'Común'$q$),
      ('plan_tests',     format('id = %L', x_test),              $q$notas = 'Hecho en papel'$q$),
      ('plan_tareas',    format('id = %L', x_tarea),             'prioridad = 3'),
      ('plan_preguntas', format('id = %L', x_pregunta),          $q$explicacion = 'Porque sí'$q$)
    ) v(tabla, donde, cambio)
  loop
    execute format('select updated_at from public.%I where %s', r.tabla, r.donde) into v;
    perform pruebas.cierto(v = viejo, format('no se ha podido preparar la prueba de updated_at en %s', r.tabla));
    execute format('update public.%I set %s where %s', r.tabla, r.cambio, r.donde);
    execute format('select updated_at from public.%I where %s', r.tabla, r.donde) into v;
    perform pruebas.cierto(v = now(), format('el update en %s no ha cambiado updated_at (%s)', r.tabla, v));
    execute format('update public.%I set updated_at = %L where %s', r.tabla, viejo, r.donde);
    execute format('select updated_at from public.%I where %s', r.tabla, r.donde) into v;
    perform pruebas.cierto(v = now(), format('en %s el cliente ha podido fijar updated_at a %s', r.tabla, v));
  end loop;
  perform pruebas.ok('el trigger pone updated_at = now() en cada update de las 5 tablas que lo tienen, aunque el cliente mande otro');
end $$;
rollback;


-- =====================================================================
-- 10) Upsert idempotente (reintentar una subida no duplica)
-- =====================================================================
begin;
do $$
declare
  x uuid;
  i int;
  n bigint;
  v text;
  s uuid := gen_random_uuid();
begin
  perform pruebas.como('A');
  -- Como PostgREST con upsert(fila, {onConflict: 'id'}): insert … on conflict (id) do update.
  x := gen_random_uuid();
  for i in 1..2 loop
    insert into public.plan_temas (id, nombre, numero) values (x, 'Tema reintentado', i)
      on conflict (id) do update set nombre = excluded.nombre, numero = excluded.numero;
  end loop;
  select count(*), max(numero)::text into n, v from public.plan_temas where id = x;
  perform pruebas.cierto(n = 1 and v = '2', format('plan_temas: %s filas tras dos upserts (numero %s)', n, v));

  x := gen_random_uuid();
  for i in 1..2 loop
    insert into public.plan_tests (id, plataforma, nombre, referencia, num_preguntas) values (x, 'tutor_bombero', 'Test reintentado', 'TB-R-01', 10 * i)
      on conflict (id) do update set plataforma = excluded.plataforma, nombre = excluded.nombre,
        referencia = excluded.referencia, num_preguntas = excluded.num_preguntas;
  end loop;
  select count(*), max(num_preguntas)::text into n, v from public.plan_tests where id = x;
  perform pruebas.cierto(n = 1 and v = '20', format('plan_tests: %s filas tras dos upserts (num_preguntas %s)', n, v));

  x := gen_random_uuid();
  for i in 1..2 loop
    insert into public.plan_tareas (id, test_id, fecha, prioridad) values (x, pruebas.f('A.test'), '2026-10-22', i)
      on conflict (id) do update set test_id = excluded.test_id, fecha = excluded.fecha, prioridad = excluded.prioridad;
  end loop;
  select count(*), max(prioridad)::text into n, v from public.plan_tareas where id = x;
  perform pruebas.cierto(n = 1 and v = '2', format('plan_tareas: %s filas tras dos upserts (prioridad %s)', n, v));

  x := gen_random_uuid();
  for i in 1..2 loop
    insert into public.plan_resultados (id, test_id, fuente, aciertos, fallos, total, session_id, duracion_seg, duracion_medida)
      values (x, pruebas.f('A.test'), 'pjfire', 8, 2, 10, s, 300 + i, true)
      on conflict (id) do update set test_id = excluded.test_id, fuente = excluded.fuente, aciertos = excluded.aciertos,
        fallos = excluded.fallos, total = excluded.total, session_id = excluded.session_id,
        duracion_seg = excluded.duracion_seg, duracion_medida = excluded.duracion_medida;
  end loop;
  select count(*), max(duracion_seg)::text into n, v from public.plan_resultados where id = x;
  perform pruebas.cierto(n = 1 and v = '302', format('plan_resultados: %s filas tras dos upserts (duracion_seg %s)', n, v));

  x := gen_random_uuid();
  for i in 1..2 loop
    insert into public.plan_preguntas (id, enunciado, opciones, correcta) values (x, '¿Pregunta reintentada?', '["a", "b"]', i - 1)
      on conflict (id) do update set enunciado = excluded.enunciado, opciones = excluded.opciones, correcta = excluded.correcta;
  end loop;
  select count(*), max(correcta)::text into n, v from public.plan_preguntas where id = x;
  perform pruebas.cierto(n = 1 and v = '1', format('plan_preguntas: %s filas tras dos upserts (correcta %s)', n, v));

  -- Eventos: upsert con ignoreDuplicates (on conflict do nothing).
  x := gen_random_uuid();
  for i in 1..2 loop
    insert into public.plan_eventos (id, tipo, test_id) values (x, 'abierto', pruebas.f('A.test'))
      on conflict (id) do nothing;
  end loop;
  select count(*) into n from public.plan_eventos where id = x;
  perform pruebas.cierto(n = 1, format('plan_eventos: %s filas tras dos upserts', n));

  -- Ajustes: la clave es user_id.
  for i in 1..2 loop
    insert into public.plan_ajustes (limite_diario) values (4 + i)
      on conflict (user_id) do update set limite_diario = excluded.limite_diario;
  end loop;
  select count(*), max(limite_diario)::text into n, v from public.plan_ajustes;
  perform pruebas.cierto(n = 1 and v = '6', format('plan_ajustes: %s filas tras dos upserts (limite_diario %s)', n, v));

  perform pruebas.ok('upsert con el mismo id dos veces → una sola fila, con los últimos datos, en las 7 tablas');
end $$;
rollback;

do $$
begin
  raise notice 'FIN: todas las pruebas de la base de datos del Plan han pasado.';
end $$;

-- Limpieza (por si se lanza contra una base de datos que no es temporal).
set client_min_messages = warning;
drop schema pruebas cascade;
delete from auth.users where email like '%@pruebas.invalid';
