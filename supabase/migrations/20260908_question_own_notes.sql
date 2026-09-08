-- =====================================================================
-- Nota propia por pregunta: texto e imagen añadidos a mano por vosotros
-- =====================================================================
-- Además de la explicación guardada y de la explicación ampliada con IA
-- (ai_explain), ahora se puede añadir, directamente desde la tarjeta de
-- estudio, vuestra propia explicación: un texto libre y/o una imagen.
-- En cuanto se escribe algo o se sube una imagen, aparece un botón
-- "Nota" en la explicación (junto al de "IA") que muestra ese contenido
-- de forma permanente para quien haga esa pregunta, hasta que alguien
-- lo quite con el aspa.
--
-- Sigue el mismo patrón que 20260906_questions_ai_explain.sql:
--   - Columna own_note (jsonb) en questions, con forma
--     { "text": string|null, "image_url": string|null, "updated_at": ... }
--   - Dos RPCs "security definer" que solo tocan esa columna, para no
--     dar permiso de UPDATE directo sobre toda la tabla.
--   - Las imágenes se guardan en un bucket de Storage público
--     "question-notes" (lectura pública para que se puedan mostrar sin
--     complicaciones; solo los usuarios autenticados pueden subir,
--     actualizar o borrar archivos).
-- =====================================================================

alter table public.questions add column if not exists own_note jsonb;

create or replace function public.set_question_own_note(p_question_id uuid, p_text text, p_image_url text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesión para guardar una nota.';
  end if;

  update public.questions
  set own_note = jsonb_build_object(
    'text', p_text,
    'image_url', p_image_url,
    'updated_at', now()
  )
  where id = p_question_id;
end;
$$;

create or replace function public.clear_question_own_note(p_question_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesión para quitar una nota.';
  end if;

  update public.questions
  set own_note = null
  where id = p_question_id;
end;
$$;

grant execute on function public.set_question_own_note(uuid, text, text) to authenticated;
grant execute on function public.clear_question_own_note(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- Bucket de Storage para las imágenes de las notas propias.
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('question-notes', 'question-notes', true)
on conflict (id) do nothing;

drop policy if exists "question-notes lectura publica" on storage.objects;
create policy "question-notes lectura publica"
on storage.objects for select
using (bucket_id = 'question-notes');

drop policy if exists "question-notes subir autenticado" on storage.objects;
create policy "question-notes subir autenticado"
on storage.objects for insert
to authenticated
with check (bucket_id = 'question-notes');

drop policy if exists "question-notes actualizar autenticado" on storage.objects;
create policy "question-notes actualizar autenticado"
on storage.objects for update
to authenticated
using (bucket_id = 'question-notes');

drop policy if exists "question-notes borrar autenticado" on storage.objects;
create policy "question-notes borrar autenticado"
on storage.objects for delete
to authenticated
using (bucket_id = 'question-notes');
