-- =====================================================================
-- Documentación: estructura en árbol ya aplicada en producción
-- =====================================================================
-- Este script NO hace falta ejecutarlo si tu proyecto de Supabase ya
-- tiene la tabla "nodos_temario" (puedes comprobarlo en Table Editor).
-- Se añade al repo en modo "if not exists" únicamente para que quede
-- documentado el esquema real que usa la app, por si en el futuro
-- provisionas un proyecto de Supabase nuevo desde cero.
--
-- Árbol libre por tema: Título / Capítulo / Sección / Artículo, con
-- niveles opcionales (puedes colgar un Artículo directamente del tema
-- si esa ley no tiene Títulos, etc).
-- =====================================================================

do $$ begin
  create type public.tipo_nodo as enum ('titulo','capitulo','seccion','articulo');
exception when duplicate_object then null; end $$;

create table if not exists public.nodos_temario (
  id uuid primary key default gen_random_uuid(),
  region_id text not null,
  topic_id text not null,
  padre_id uuid references public.nodos_temario(id) on delete cascade,
  tipo public.tipo_nodo not null,
  numero text,
  nombre text,
  orden integer not null default 0,
  created_at timestamptz not null default now(),
  foreign key (region_id, topic_id) references public.topics(region_id, id) on delete cascade
);

create index if not exists nodos_temario_topic_idx on public.nodos_temario(topic_id);
create index if not exists nodos_temario_padre_idx on public.nodos_temario(padre_id);

alter table public.nodos_temario enable row level security;

drop policy if exists "public read nodos_temario" on public.nodos_temario;
create policy "public read nodos_temario"
  on public.nodos_temario for select
  using (true);

drop policy if exists "admin_insert_nodos_temario" on public.nodos_temario;
create policy "admin_insert_nodos_temario"
  on public.nodos_temario for insert
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin));

drop policy if exists "admin_update_nodos_temario" on public.nodos_temario;
create policy "admin_update_nodos_temario"
  on public.nodos_temario for update
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin));

drop policy if exists "admin_delete_nodos_temario" on public.nodos_temario;
create policy "admin_delete_nodos_temario"
  on public.nodos_temario for delete
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin));

-- Cada pregunta cuelga (opcionalmente) de un nodo del árbol. Si nodo_id
-- es NULL, la app la trata como pregunta "general" (sin artículo
-- asociado), aunque hoy el panel de admin exige elegir siempre una
-- ubicación al crear una pregunta.
alter table public.questions
  add column if not exists nodo_id uuid references public.nodos_temario(id) on delete set null;
-- =====================================================================
