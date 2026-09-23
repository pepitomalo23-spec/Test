-- Segundo nivel "genérico" en el árbol de temario: además de "libre" (sin
-- prefijo, nombre tal cual lo escriba el admin, añadido en
-- 20260923_add_libre_node_type), se añade "estructura", que se comporta
-- igual que título/capítulo/sección/artículo en cuanto a prefijo
-- ("Estructura N") pero, como "libre", puede colgar de cualquier nivel y
-- admite cualquier tipo debajo (nivel 0 en NODE_TYPE_LEVEL, frontend).
--
-- Ya aplicada directamente sobre la base de datos; este archivo solo deja
-- constancia en el repositorio, como las migraciones anteriores.
ALTER TYPE tipo_nodo ADD VALUE IF NOT EXISTS 'estructura';
