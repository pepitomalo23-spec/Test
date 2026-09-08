-- =====================================================================
-- Arreglo: questions.id es bigint, no uuid
-- =====================================================================
-- Las funciones set_question_ai_explain / clear_question_ai_explain
-- (20260906_questions_ai_explain.sql) y set_question_own_note /
-- clear_question_own_note (20260908085803_question_own_notes.sql) se
-- crearon con el parámetro p_question_id de tipo uuid, pero la columna
-- questions.id es en realidad bigint. Esto hacía que las cuatro
-- funciones fallaran siempre al guardar/quitar con un error del tipo
-- "invalid input syntax for type uuid: '110'" en cuanto se les pasaba
-- un id real.
--
-- Se eliminan las versiones con uuid y se recrean idénticas mas con
-- p_question_id bigint.
-- =====================================================================

drop function if exists public.set_question_ai_explain(uuid, jsonb);
drop function if exists public.clear_question_ai_explain(uuid);
drop function if exists public.set_question_own_note(uuid, text, text);
drop function if exists public.clear_question_own_note(uuid);

create or replace function public.set_question_ai_explain(p_question_id bigint, p_explain jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesión para guardar una explicación.';
  end if;

  update public.questions
  set ai_explain = p_explain
  where id = p_question_id;
end;
$$;

create or replace function public.clear_question_ai_explain(p_question_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesión para quitar una explicación.';
  end if;

  update public.questions
  set ai_explain = null
  where id = p_question_id;
end;
$$;

create or replace function public.set_question_own_note(p_question_id bigint, p_text text, p_image_url text)
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

create or replace function public.clear_question_own_note(p_question_id bigint)
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

grant execute on function public.set_question_ai_explain(bigint, jsonb) to authenticated;
grant execute on function public.clear_question_ai_explain(bigint) to authenticated;
grant execute on function public.set_question_own_note(bigint, text, text) to authenticated;
grant execute on function public.clear_question_own_note(bigint) to authenticated;
