-- =====================================================================
-- Imágenes de las notas propias: cada uno solo las suyas
-- =====================================================================
-- Las notas propias pasaron a ser privadas de cada usuario
-- (question_user_data), pero el almacén «question-notes» seguía con los
-- permisos del principio (20260908085803_question_own_notes.sql):
--   - cualquiera, incluso sin sesión, podía listar el almacén entero y
--     así encontrar y descargar las imágenes de las notas de todos;
--   - cualquier usuario con sesión podía sobrescribir o borrar las
--     imágenes de otro.
--
-- Ahora:
--   - listar, cambiar y borrar: solo los archivos propios (owner_id es
--     quien lo subió; lo pone Storage a partir de la sesión, no el
--     navegador);
--   - subir: solo cuentas aprobadas y no bloqueadas (o el admin);
--   - solo imágenes, de hasta 10 MB.
--
-- El almacén sigue siendo público para que la app muestre las imágenes
-- con su enlace (getPublicUrl), que no pasa por estas reglas: quien tenga
-- el enlace exacto de una imagen puede verla, pero ya no hay forma de
-- sacar la lista de enlaces. La app solo sube y muestra; nunca cambia ni
-- borra archivos de este almacén, así que no le afecta.
--
-- Las cuatro políticas se cambian en su sitio, con su nombre de siempre
-- (en producción postgres no es dueño de storage.objects y no puede
-- renombrarlas, y sustituirlas con «drop policy» exigía una confirmación
-- aparte). Los nombres ya no describen lo que hacen:
--   «question-notes lectura publica»        → ver (listar) los propios
--   «question-notes subir autenticado»      → subir, cuentas aprobadas
--   «question-notes actualizar autenticado» → cambiar los propios
--   «question-notes borrar autenticado»     → borrar los propios
-- Se puede aplicar más de una vez sin errores.
-- =====================================================================

alter policy "question-notes lectura publica" on storage.objects
  to authenticated
  using (bucket_id = 'question-notes' and owner_id = (select auth.uid())::text);

alter policy "question-notes subir autenticado" on storage.objects
  to authenticated
  with check (
    bucket_id = 'question-notes'
    and exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid())
        and (p.approved or p.is_admin)
        and not coalesce(p.blocked, false)
    )
  );

alter policy "question-notes actualizar autenticado" on storage.objects
  to authenticated
  using (bucket_id = 'question-notes' and owner_id = (select auth.uid())::text)
  with check (bucket_id = 'question-notes' and owner_id = (select auth.uid())::text);

alter policy "question-notes borrar autenticado" on storage.objects
  to authenticated
  using (bucket_id = 'question-notes' and owner_id = (select auth.uid())::text);

update storage.buckets
set file_size_limit = 10485760,
    allowed_mime_types = array['image/*']
where id = 'question-notes';
