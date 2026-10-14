-- Tareas propias: el alumno se manda a sí mismo lo que quiere estudiar
-- (profesor_id = alumno_id = él). Salen en «Lo que te ha mandado» como las
-- del profesor. Las del profesor siguen igual (callejero_es_tutor).
set lock_timeout = '5s';

alter policy "tareas select" on public.callejero_tareas
  using ((alumno_id = (select auth.uid()) or profesor_id = (select auth.uid()))
         and (profesor_id = alumno_id or public.callejero_es_tutor(profesor_id, alumno_id)));

alter policy "tareas insert" on public.callejero_tareas
  with check (profesor_id = (select auth.uid())
              and (alumno_id = (select auth.uid()) or public.callejero_es_tutor((select auth.uid()), alumno_id)));

alter policy "tareas update" on public.callejero_tareas
  using (profesor_id = (select auth.uid())
         and (alumno_id = (select auth.uid()) or public.callejero_es_tutor((select auth.uid()), alumno_id)))
  with check (profesor_id = (select auth.uid())
              and (alumno_id = (select auth.uid()) or public.callejero_es_tutor((select auth.uid()), alumno_id)));

alter policy "tareas delete" on public.callejero_tareas
  using (profesor_id = (select auth.uid())
         and (alumno_id = (select auth.uid()) or public.callejero_es_tutor((select auth.uid()), alumno_id)));

-- Las tareas del alumno: las de sus profesores y las suyas propias.
create or replace function public.callejero_tareas_de(p_alumno uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_alumno uuid := coalesce(p_alumno, auth.uid());
begin
  if not public.callejero_puede_ver(v_alumno) then raise exception 'not authorized'; end if;
  return coalesce((
    select jsonb_agg(to_jsonb(x) order by x.archivada, x.creada_at desc)
      from (
        select k.*, u.email::text as profesor_email,
               (select count(*) from (
                  select i.ronda
                    from public.callejero_intentos i
                   where i.user_id = k.alumno_id and i.tarea_id = k.id and i.ronda is not null
                     and (cardinality(k.modos) = 0 or i.modo = any(k.modos))
                   group by i.ronda
                  having count(*) >= max(i.ronda_total)
                     and count(*) filter (where i.acierto) * 100 >= k.minimo * max(i.ronda_total)
                ) v)::int as rondas_validas,
               (select count(distinct i.ronda) from public.callejero_intentos i
                 where i.user_id = k.alumno_id and i.tarea_id = k.id)::int as rondas_jugadas,
               (select max(i.created_at) from public.callejero_intentos i
                 where i.user_id = k.alumno_id and i.tarea_id = k.id) as ultima_vez,
               (select count(*) from public.callejero_mensajes m where m.tarea_id = k.id)::int as mensajes,
               (select count(*) from public.callejero_mensajes m
                 where m.tarea_id = k.id and m.autor_id <> auth.uid() and m.leido_at is null)::int as sin_leer
          from public.callejero_tareas k
          join auth.users u on u.id = k.profesor_id
         where k.alumno_id = v_alumno
           and (k.profesor_id = k.alumno_id or public.callejero_es_tutor(k.profesor_id, k.alumno_id))
           and (v_alumno = auth.uid() or k.profesor_id = auth.uid())
      ) x), '[]'::jsonb);
end;
$$;
