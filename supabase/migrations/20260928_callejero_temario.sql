-- =====================================================================
-- Callejero: temario de la academia (fichas General y por distrito)
-- =====================================================================
-- El temario va en la app (datos/callejero-temario.json): cada elemento
-- (una plaza, un colegio, un recorrido, un dato...) tiene un id fijo a
-- partir de 5 000 000 000 000, así que sus respuestas se guardan en
-- callejero_intentos como las de las vías (id_vial), con el modo
-- «temario» y su propia habilidad.
-- El profesor puede mandar fichas o apartados del temario
-- («centro» = toda la ficha, «centro/plazas» = un apartado).
-- =====================================================================

-- Habilidad del modo «temario».
create or replace function public.callejero_habilidad(p_modo text)
returns text language sql immutable set search_path = public as $$
  select case p_modo
    when 'localiza' then 'localiza'
    when 'cruces' then 'cruces'
    when 'lugares' then 'lugares'
    when 'parque' then 'parque'
    when 'temario' then 'temario'
    else 'nombre' end;   -- ¿Cómo se llama?, Di el nombre (y el antiguo «escribe»)
$$;

-- Tareas con fichas del temario.
alter table public.callejero_tareas add column if not exists fichas text[] not null default '{}';

alter table public.callejero_tareas drop constraint if exists callejero_tareas_check;
alter table public.callejero_tareas add constraint callejero_tareas_check
  check (cardinality(vias) + cardinality(lugares) > 0 or zona is not null or cardinality(fichas) > 0);

alter table public.callejero_tareas drop constraint if exists callejero_tareas_fichas_check;
alter table public.callejero_tareas add constraint callejero_tareas_fichas_check
  check (cardinality(fichas) <= 200
         and array_to_string(fichas, '|') ~ '^([a-z0-9-]+(/[a-z0-9-]+)?(\|[a-z0-9-]+(/[a-z0-9-]+)?)*)?$');

alter table public.callejero_tareas drop constraint if exists callejero_tareas_modos_check;
alter table public.callejero_tareas add constraint callejero_tareas_modos_check
  check (modos <@ array['localiza','opciones','voz','cruces','lugares','parque','temario']::text[]);
