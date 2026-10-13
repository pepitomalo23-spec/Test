-- Títulos bloqueados: los que se crearon para colocar preguntas de tutorbomberos y no estaban
-- en el temario propio. Sus preguntas no salen en los tests hasta desbloquearlos (Administración
-- › Temario, o tocando el candado al preparar un test).
alter table nodos_temario add column if not exists bloqueado boolean not null default false;
