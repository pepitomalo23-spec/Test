-- =====================================================================
-- Migración: estructura en árbol (libre) dentro de cada tema
-- =====================================================================
-- Sustituye la lista plana de "articles" por un árbol de niveles libres:
-- Título / Capítulo / Sección / Artículo. Puedes saltarte niveles (p.ej.
-- colgar un Artículo directamente del Tema si esa ley no tiene Títulos).
--
-- No borra la tabla "articles" existente: la migramos a "topic_nodes"
-- para no perder datos, pero a partir de ahora el admin gestiona todo
-- desde la nueva tabla.
-- =====================================================================

-- 1) Tabla de nodos del árbol.
create table if not exists public.topic_nodes (
  id uuid primary key default gen_random_uuid(),
  region_id text not null,
  topic_id text not null references public.topics(id) on delete cascade,
  parent_id uuid references public.topic_nodes(id) on delete cascade,
  node_type text not null check (node_type in ('titulo','capitulo','seccion','articulo')),
  name text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists topic_nodes_topic_idx on public.topic_nodes(topic_id);
create index if not exists topic_nodes_parent_idx on public.topic_nodes(parent_id);

alter table public.topic_nodes enable row level security;

-- Lectura: igual que topics/articles (público autenticado puede leer).
drop policy if exists "anyone can read topic_nodes" on public.topic_nodes;
create policy "anyone can read topic_nodes"
  on public.topic_nodes for select
  using (true);

-- Escritura: solo administradores.
drop policy if exists "admins can write topic_nodes" on public.topic_nodes;
create policy "admins can write topic_nodes"
  on public.topic_nodes for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin));

-- 2) Migrar los artículos existentes como nodos de tipo 'articulo' en la raíz
--    del tema (mismo id, para no romper referencias por etiqueta).
insert into public.topic_nodes (id, region_id, topic_id, parent_id, node_type, name, sort_order)
select a.id, a.region_id, a.topic_id, null, 'articulo', a.label, a.sort_order
from public.articles a
where not exists (select 1 from public.topic_nodes n where n.id = a.id);

-- 3) Vincular preguntas a un nodo del árbol (opcional; una pregunta puede
--    no tener ubicación específica, igual que antes).
alter table public.questions
  add column if not exists node_id uuid references public.topic_nodes(id) on delete set null;

-- 4) Enlazar preguntas ya existentes con su nodo migrado, cuando el texto
--    de article_label coincide exactamente con la etiqueta del artículo.
update public.questions q
set node_id = n.id
from public.topic_nodes n
where q.node_id is null
  and q.topic_id = n.topic_id
  and n.node_type = 'articulo'
  and q.article_label is not null
  and q.article_label = n.name;
-- =====================================================================
