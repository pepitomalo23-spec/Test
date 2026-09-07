-- =====================================================================
-- Documentación: cambio ya aplicado en producción (Supabase)
-- =====================================================================
-- Seguimiento automático de cambios legislativos vía API del BOE
-- (Legislación Consolidada: /datosabiertos/api/legislacion-consolidada)
-- =====================================================================
-- Cada "topic" de esta app representa una ley concreta (p.ej. "2/2002 -
-- ley de Gestión de Emergencias en Andalucía"). Esta migración añade:
--
--  1) boe_normas_seguimiento: qué identificador BOE corresponde a cada
--     topic, y el estado de la última comprobación.
--  2) boe_bloques_seguimiento: última versión conocida de cada bloque
--     (artículo) de la norma, para poder detectar diffs sin tener que
--     releer todo el texto en cada comprobación.
--  3) boe_cambios: histórico de cambios detectados (el "antes" / "ahora"
--     de cada artículo, quién lo modifica, cuándo entra en vigor, y una
--     explicación en lenguaje sencillo generada por IA -a partir del
--     diff real, nunca inventada-).
--  4) app_secrets: almacén mínimo de secretos de servidor (clave de
--     Gemini para las explicaciones, secreto compartido para que el
--     cron pueda invocar la Edge Function). Bloqueado con RLS sin
--     políticas: solo el rol de servicio (usado por la Edge Function y
--     por las funciones "security definer" de este archivo) puede
--     leerlo o escribirlo. Los valores se insertan siempre a mano
--     desde el panel de admin o por SQL directo, NUNCA desde este
--     archivo versionado en git.
--  5) RPCs de administración para gestionar todo lo anterior desde el
--     panel de admin, siguiendo el mismo patrón "security definer" que
--     el resto del proyecto (set_question_ai_explain, etc).
--
-- IMPORTANTE: tras aplicar este script en un proyecto nuevo hace falta
-- insertar a mano (nunca en git) el secreto del cron:
--   insert into public.app_secrets(name, value)
--   values ('boe_sync_secret', '<valor aleatorio largo>');
-- y, opcionalmente, la clave de Gemini vía el panel de admin.
-- =====================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- ---------------------------------------------------------------------
-- 1) Normas BOE seguidas, una por topic (una ley = un topic en esta app)
-- ---------------------------------------------------------------------
create table if not exists public.boe_normas_seguimiento (
  topic_id text primary key references public.topics(id) on delete cascade,
  boe_id text not null,                 -- p.ej. 'BOE-A-2002-24156'
  titulo text,                          -- cache del título oficial
  url_html text,                        -- enlace BOE para el usuario
  activo boolean not null default true, -- el admin puede pausar el seguimiento
  fecha_actualizacion_boe text,         -- último valor visto de <fecha_actualizacion>
  ultima_comprobacion timestamptz,
  ultimo_error text,
  created_at timestamptz not null default now()
);

alter table public.boe_normas_seguimiento enable row level security;

drop policy if exists "public read boe_normas_seguimiento" on public.boe_normas_seguimiento;
create policy "public read boe_normas_seguimiento"
  on public.boe_normas_seguimiento for select
  using (true);
-- Sin políticas de insert/update/delete: solo el service_role (Edge
-- Function) y las RPCs "security definer" de más abajo pueden escribir.

-- ---------------------------------------------------------------------
-- 2) Último estado visto de cada bloque (artículo) de cada norma
-- ---------------------------------------------------------------------
create table if not exists public.boe_bloques_seguimiento (
  topic_id text not null references public.topics(id) on delete cascade,
  bloque_id text not null,              -- id del bloque en la API del BOE (p.ej. 'a39')
  nodo_id uuid references public.nodos_temario(id) on delete set null,
  numero_articulo text,
  titulo_bloque text,
  fecha_actualizacion_bloque text,      -- último valor visto de fecha_actualizacion del bloque
  updated_at timestamptz not null default now(),
  primary key (topic_id, bloque_id)
);

alter table public.boe_bloques_seguimiento enable row level security;
-- Tabla puramente interna de trabajo: sin políticas públicas.

-- ---------------------------------------------------------------------
-- 3) Cambios legislativos detectados (lo que se muestra en la app)
-- ---------------------------------------------------------------------
create table if not exists public.boe_cambios (
  id uuid primary key default gen_random_uuid(),
  topic_id text not null references public.topics(id) on delete cascade,
  nodo_id uuid references public.nodos_temario(id) on delete set null,
  bloque_id text not null,
  numero_articulo text,
  titulo_bloque text,
  texto_antes_html text,
  texto_ahora_html text,
  norma_modificadora_id text,
  norma_modificadora_titulo text,
  fecha_publicacion date,
  fecha_vigencia date,
  resumen_oficial text,        -- texto literal del análisis del BOE (relación "SE MODIFICA...")
  resumen_ia jsonb,            -- { simple, tecnica, afecta } generado por IA a partir del diff real
  fuente_url text,
  estado text not null default 'nuevo' check (estado in ('nuevo','revisado')),
  created_at timestamptz not null default now()
);

create index if not exists boe_cambios_topic_idx on public.boe_cambios(topic_id);
create index if not exists boe_cambios_nodo_idx on public.boe_cambios(nodo_id);
create index if not exists boe_cambios_created_idx on public.boe_cambios(created_at desc);

alter table public.boe_cambios enable row level security;

drop policy if exists "public read boe_cambios" on public.boe_cambios;
create policy "public read boe_cambios"
  on public.boe_cambios for select
  using (true);
-- Sin políticas de insert/update/delete de escritura directa: se escribe
-- desde la Edge Function (service_role) y se marca "revisado" mediante
-- la RPC admin_marcar_cambio_revisado de más abajo.

-- ---------------------------------------------------------------------
-- 4) Secretos de servidor (nunca expuestos por RPC de lectura)
-- ---------------------------------------------------------------------
create table if not exists public.app_secrets (
  name text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

alter table public.app_secrets enable row level security;
-- Sin ninguna política: ni siquiera un admin autenticado puede hacer
-- select/insert directo desde el cliente. Solo accesible por
-- service_role (Edge Function) y por las funciones de abajo.

-- ---------------------------------------------------------------------
-- 5) RPCs de administración
-- ---------------------------------------------------------------------

-- Alta/edición de la norma BOE asociada a un topic
create or replace function public.admin_upsert_boe_norma(p_topic_id text, p_boe_id text, p_titulo text, p_url_html text, p_activo boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin) then
    raise exception 'Solo un administrador puede configurar el seguimiento del BOE.';
  end if;

  insert into public.boe_normas_seguimiento (topic_id, boe_id, titulo, url_html, activo)
  values (p_topic_id, p_boe_id, p_titulo, p_url_html, coalesce(p_activo, true))
  on conflict (topic_id) do update
    set boe_id = excluded.boe_id,
        titulo = excluded.titulo,
        url_html = excluded.url_html,
        activo = excluded.activo;
end;
$$;
grant execute on function public.admin_upsert_boe_norma(text, text, text, text, boolean) to authenticated;

-- Pausar/reactivar o borrar el seguimiento de una norma
create or replace function public.admin_set_boe_norma_activo(p_topic_id text, p_activo boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin) then
    raise exception 'Solo un administrador puede modificar el seguimiento del BOE.';
  end if;
  update public.boe_normas_seguimiento set activo = p_activo where topic_id = p_topic_id;
end;
$$;
grant execute on function public.admin_set_boe_norma_activo(text, boolean) to authenticated;

create or replace function public.admin_delete_boe_norma(p_topic_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin) then
    raise exception 'Solo un administrador puede borrar el seguimiento del BOE.';
  end if;
  delete from public.boe_normas_seguimiento where topic_id = p_topic_id;
  delete from public.boe_bloques_seguimiento where topic_id = p_topic_id;
end;
$$;
grant execute on function public.admin_delete_boe_norma(text) to authenticated;

-- Marcar un cambio como revisado (para quitarlo del contador de "nuevos")
create or replace function public.admin_marcar_cambio_revisado(p_cambio_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin) then
    raise exception 'Solo un administrador puede marcar cambios como revisados.';
  end if;
  update public.boe_cambios set estado = 'revisado' where id = p_cambio_id;
end;
$$;
grant execute on function public.admin_marcar_cambio_revisado(uuid) to authenticated;

-- Guardar/actualizar un secreto de servidor (nunca se puede leer el valor por RPC)
create or replace function public.admin_set_app_secret(p_name text, p_value text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin) then
    raise exception 'Solo un administrador puede configurar secretos de la aplicación.';
  end if;
  insert into public.app_secrets(name, value, updated_at)
  values (p_name, p_value, now())
  on conflict (name) do update set value = excluded.value, updated_at = now();
end;
$$;
grant execute on function public.admin_set_app_secret(text, text) to authenticated;

-- Saber si un secreto está configurado, SIN revelar su valor
create or replace function public.admin_app_secret_status(p_name text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin) then
    raise exception 'Solo un administrador puede consultar esto.';
  end if;
  return exists (select 1 from public.app_secrets where name = p_name and length(value) > 0);
end;
$$;
grant execute on function public.admin_app_secret_status(text) to authenticated;

-- Disparar manualmente una comprobación ("Comprobar ahora" en el panel admin).
-- Usa pg_net para invocar la Edge Function con el secreto compartido, sin
-- exponer nunca ese secreto al cliente.
--
-- OJO: la URL de la función lleva embebida la referencia de ESTE proyecto
-- de Supabase (tsjaaqkvncgxqtpmlugv). Si alguna vez migras a otro
-- proyecto, actualiza esta URL.
create or replace function public.admin_trigger_boe_sync()
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_secret text;
begin
  if not exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin) then
    raise exception 'Solo un administrador puede lanzar una comprobación manual.';
  end if;

  select value into v_secret from public.app_secrets where name = 'boe_sync_secret';
  if v_secret is null then
    raise exception 'Falta configurar el secreto de sincronización (boe_sync_secret).';
  end if;

  perform net.http_post(
    url := 'https://tsjaaqkvncgxqtpmlugv.supabase.co/functions/v1/boe-sync',
    headers := jsonb_build_object('Content-Type','application/json','x-boe-sync-secret', v_secret),
    body := '{}'::jsonb
  );
end;
$$;
grant execute on function public.admin_trigger_boe_sync() to authenticated;
-- =====================================================================
