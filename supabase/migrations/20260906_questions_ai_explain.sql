-- =====================================================================
-- Explicación ampliada con IA: persistencia permanente por pregunta
-- =====================================================================
-- Hasta ahora, la explicación generada con el botón "IA" solo vivía en
-- memoria del navegador: se perdía al recargar la página o volver a
-- entrar en el test. A partir de esta migración se guarda en la propia
-- pregunta (columna ai_explain, JSON con la explicación fácil, la
-- técnica y un pequeño glosario) para que quede disponible para
-- siempre, hasta que alguien la borre expresamente con el botón "X".
--
-- En vez de dar permiso de UPDATE directo sobre toda la tabla
-- "questions" a cualquier usuario logueado (lo que permitiría cambiar
-- también el enunciado, las opciones o la respuesta correcta), se
-- exponen dos funciones RPC "security definer" que solo pueden tocar
-- la columna ai_explain. Sigue el mismo patrón que el resto de RPCs
-- del proyecto (admin_set_device_limit, admin_approve_user, etc.).
-- =====================================================================

alter table public.questions add column if not exists ai_explain jsonb;

create or replace function public.set_question_ai_explain(p_question_id uuid, p_explain jsonb)
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

create or replace function public.clear_question_ai_explain(p_question_id uuid)
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

grant execute on function public.set_question_ai_explain(uuid, jsonb) to authenticated;
grant execute on function public.clear_question_ai_explain(uuid) to authenticated;
