-- =====================================================================
-- Normativas · opciones "trampa" generadas con IA
-- =====================================================================
-- Para cada tarjeta se guardan (una sola vez, compartidas por todos) unas
-- cuantas respuestas incorrectas MUY parecidas a la normativa correcta,
-- generadas con Gemini: se usan en Aprender/Probar cuando el usuario ya
-- se sabe bastante bien el término.
--
-- Solo el admin puede editar tarjetas, pero cualquier usuario que estudie
-- puede ser el primero en generarlas; por eso se guardan a través de esta
-- función, que solo permite rellenar el campo si todavía está vacío (el
-- admin puede sobrescribirlo para regenerarlas) y valida el formato.
-- =====================================================================

alter table public.nq_cards add column if not exists trampas jsonb;

create or replace function public.nq_set_trampas(p_card uuid, p_trampas jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Hace falta iniciar sesión';
  end if;
  if jsonb_typeof(p_trampas) <> 'array'
     or jsonb_array_length(p_trampas) < 3
     or jsonb_array_length(p_trampas) > 10
     or exists (
       select 1 from jsonb_array_elements(p_trampas) e
       where jsonb_typeof(e) <> 'string' or length(e #>> '{}') = 0 or length(e #>> '{}') > 150
     ) then
    raise exception 'Formato de opciones no válido';
  end if;
  update public.nq_cards
     set trampas = p_trampas
   where id = p_card
     and (trampas is null
          or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin));
end;
$$;

revoke all on function public.nq_set_trampas(uuid, jsonb) from public, anon;
grant execute on function public.nq_set_trampas(uuid, jsonb) to authenticated;
