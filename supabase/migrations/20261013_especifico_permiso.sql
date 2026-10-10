-- =====================================================================
-- Específico: permiso por usuario (feature_flags.especifico).
-- Si el administrador se lo quita a un usuario, la base de datos tampoco
-- le deja leer los tests ni las preguntas del Específico (no basta con
-- que la app lo oculte). Si la clave no está, se entiende permitido, igual
-- que el resto de permisos.
-- Se puede aplicar más de una vez.
-- =====================================================================

alter policy "especifico_tests lectura" on public.especifico_tests
  using (exists (select 1 from public.profiles p
                  where p.id = (select auth.uid())
                    and (p.is_admin or (p.approved and not coalesce(p.blocked, false)
                         and coalesce(p.feature_flags->>'especifico', 'true') <> 'false'))));

alter policy "especifico_preguntas lectura" on public.especifico_preguntas
  using (exists (select 1 from public.profiles p
                  where p.id = (select auth.uid())
                    and (p.is_admin or (p.approved and not coalesce(p.blocked, false)
                         and coalesce(p.feature_flags->>'especifico', 'true') <> 'false'))));
