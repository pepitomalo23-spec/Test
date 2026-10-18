-- =====================================================================
-- Examen compartido (primer paso; lo sigue 20261108, que lo hace sin copias):
-- a quién se puede mandar un examen (calendario_destinatarios: el
-- administrador, a cualquier cuenta confirmada; el profesor, a sus alumnos).
-- Las columnas origen y enviado_por eran para copias y se quedan sin usar.
-- calendario_notas_examen se rehace en 20261108.
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
