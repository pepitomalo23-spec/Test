-- =====================================================================
-- Documentación: cambio ya aplicado en producción (Supabase)
-- =====================================================================
-- "nodo_id" en questions era NOT NULL, lo que impedía guardar preguntas
-- "generales de todo el tema" (sin título/capítulo/sección/artículo).
-- Además, sin una columna topic_id propia, esas preguntas no tenían
-- forma de saber a qué tema pertenecían y nunca habrían salido en los
-- tests. Este script documenta el cambio ya aplicado:
--   1) nodo_id pasa a ser nullable.
--   2) se añade topic_id (NOT NULL, con backfill desde el nodo).
-- =====================================================================

alter table public.questions alter column nodo_id drop not null;

alter table public.questions add column if not exists topic_id text;

update public.questions q
set topic_id = n.topic_id
from public.nodos_temario n
where q.nodo_id = n.id and q.topic_id is null;

do $$ begin
  alter table public.questions
    add constraint questions_region_topic_fkey
    foreign key (region_id, topic_id) references public.topics(region_id, id) on delete cascade;
exception when duplicate_object then null; end $$;

alter table public.questions alter column topic_id set not null;

create index if not exists questions_topic_idx on public.questions(topic_id);

-- La FK real en producción bloqueaba el borrado de nodos con preguntas
-- colgadas ("on delete: no action" en vez de "set null"), rompiendo el
-- botón de borrar en el árbol. Se corrige para que, al borrar un nodo,
-- sus preguntas se conviertan automáticamente en generales de todo el
-- tema (nodo_id = null) en lugar de bloquear el borrado.
alter table public.questions drop constraint if exists questions_nodo_id_fkey;
alter table public.questions
  add constraint questions_nodo_id_fkey
  foreign key (nodo_id) references public.nodos_temario(id) on delete set null;
