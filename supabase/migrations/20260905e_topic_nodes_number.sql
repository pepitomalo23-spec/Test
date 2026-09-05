-- =====================================================================
-- Migración: separar "número" y "nombre" en cada nivel del árbol
-- =====================================================================
-- Antes solo había un campo "name" (ej. "Título 3"). Ahora se guarda por
-- separado el número/identificador (ej. "3", "I", "34.2") y el nombre
-- descriptivo (ej. "De la protección civil"), para poder mostrar ambos
-- ("Título 3 – De la protección civil") y para poder crear un nivel
-- solo con número o solo con nombre si hace falta.
-- =====================================================================

alter table public.topic_nodes
  add column if not exists number text;

-- Ahora "name" es opcional: un nivel puede tener solo número (ej. un
-- Artículo "34.2" sin título propio) o solo nombre, o ambos.
alter table public.topic_nodes
  alter column name drop not null;

-- Migramos lo que ya hubiera en "name": si ya tenía el patrón típico
-- ("Título 3", "Capítulo II", "Art. 34.2", "Sección 1")... lo dejamos tal
-- cual en name (no lo separamos automáticamente, para no adivinar mal);
-- a partir de ahora el admin puede rellenar "number" y "name" por separado
-- en los nodos nuevos o al editar los existentes.
