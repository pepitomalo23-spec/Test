-- =====================================================================
-- Examen compartido: quien pone un examen en su calendario puede mandarlo
-- a otras personas. A cada una le sale una copia en su calendario (mismo
-- día, mismo título y lo mismo que entra) con las mismas preguntas para
-- todos (examen.fijo, que se elige al mandarlo).
--   origen:      en la copia, el examen del que sale (si se borra, se
--                borran las copias).
--   enviado_por: en la copia, el correo de quien lo mandó.
--   examen.para: en el original, a quién se mandó.
-- Mandan: el administrador (a cualquier cuenta confirmada) y el profesor
-- (a sus alumnos).
-- Se puede aplicar más de una vez.
-- =====================================================================
set lock_timeout = '5s';

alter table public.calendario_tareas
  add column if not exists origen uuid references public.calendario_tareas(id) on delete cascade,
  add column if not exists enviado_por text;
create unique index if not exists calendario_tareas_origen_user on public.calendario_tareas (origen, user_id) where origen is not null;

-- A quién puedo mandar un examen.
create or replace function public.calendario_destinatarios()
returns table (id uuid, email text)
language sql stable security definer set search_path = public
as $$
  select u.id, u.email::text
  from auth.users u join public.profiles p on p.id = u.id
  where u.id <> auth.uid() and p.approved and not coalesce(p.blocked, false)
    and (
      exists (select 1 from public.profiles me where me.id = auth.uid() and me.is_admin)
      or exists (select 1 from public.tutorias t where t.profesor_id = auth.uid() and t.alumno_id = u.id)
    )
  order by u.email;
$$;
revoke all on function public.calendario_destinatarios() from public, anon;
grant execute on function public.calendario_destinatarios() to authenticated;

-- Manda (o pone al día) el examen p_id a p_users: crea o actualiza sus
-- copias y quita las de quien ya no está. Lo que cada uno ya hizo (hecho y
-- su nota) se conserva. Devuelve a cuántos se ha mandado.
create or replace function public.calendario_enviar_examen(p_id uuid, p_users uuid[])
returns int
language plpgsql security definer set search_path = public
as $$
declare
  v_t public.calendario_tareas;
  v_para uuid[];
  v_email text;
  v_examen jsonb;
begin
  select * into v_t from public.calendario_tareas where id = p_id and user_id = auth.uid() and origen is null;
  if not found then raise exception 'Ese examen no es tuyo'; end if;
  if v_t.categoria <> 'examen' then p_users := '{}'; end if;

  select coalesce(array_agg(d.id), '{}') into v_para
  from public.calendario_destinatarios() d where d.id = any(coalesce(p_users, '{}'));

  delete from public.calendario_tareas where origen = p_id and not (user_id = any(v_para));
  if cardinality(v_para) = 0 then return 0; end if;

  select email into v_email from auth.users where id = auth.uid();
  v_examen := coalesce(v_t.examen, '{}'::jsonb) - 'para' - 'resultado';

  insert into public.calendario_tareas (user_id, fecha, titulo, nota, categoria, examen, origen, enviado_por, orden)
  select u, v_t.fecha, v_t.titulo, v_t.nota, 'examen', v_examen, p_id, v_email, 0
  from unnest(v_para) u
  on conflict (origen, user_id) where origen is not null do update set
    fecha = excluded.fecha, titulo = excluded.titulo, nota = excluded.nota, categoria = 'examen',
    enviado_por = excluded.enviado_por, updated_at = now(),
    examen = excluded.examen || case when calendario_tareas.examen ? 'resultado'
      then jsonb_build_object('resultado', calendario_tareas.examen -> 'resultado') else '{}'::jsonb end;
  return cardinality(v_para);
end;
$$;
revoke all on function public.calendario_enviar_examen(uuid, uuid[]) from public, anon;
grant execute on function public.calendario_enviar_examen(uuid, uuid[]) to authenticated;

-- Las notas de todos los que tienen ese examen (el original y sus copias).
-- Solo lo ve quien tiene el examen en su calendario.
create or replace function public.calendario_notas_examen(p_id uuid)
returns table (email text, nota numeric, hecho boolean, yo boolean, manda boolean)
language sql stable security definer set search_path = public
as $$
  with mio as (
    select coalesce(origen, id) as raiz from public.calendario_tareas where id = p_id and user_id = auth.uid()
  )
  select u.email::text, (t.examen -> 'resultado' ->> 'nota')::numeric, t.hecho, t.user_id = auth.uid(), t.origen is null
  from mio join public.calendario_tareas t on t.id = mio.raiz or t.origen = mio.raiz
  join auth.users u on u.id = t.user_id
  order by (t.examen -> 'resultado' ->> 'nota')::numeric desc nulls last, u.email;
$$;
revoke all on function public.calendario_notas_examen(uuid) from public, anon;
grant execute on function public.calendario_notas_examen(uuid) to authenticated;
