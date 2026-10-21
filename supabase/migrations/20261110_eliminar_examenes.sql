-- =====================================================================
-- Eliminar exámenes del ranking (y que el administrador los pueda devolver).
--   historial_pruebas.borrado_at: el examen está eliminado (no cuenta en el
--   ranking ni sale en el historial), pero sigue ahí para poder devolverlo.
--   borrar_examen(id):        cada uno, solo los suyos (Simulacro oficial y Examen).
--   restaurar_examen(id):     solo el administrador.
--   admin_examenes_borrados(): la lista, solo para el administrador.
--   ranking_examenes():        ya no cuenta los eliminados.
-- (La tabla examenes_borrados se creó en una primera versión y no se usa.)
-- Se puede aplicar más de una vez.
-- =====================================================================
set lock_timeout = '5s';

alter table public.historial_pruebas add column if not exists borrado_at timestamptz;

create or replace function public.borrar_examen(p_id uuid)
returns boolean
language sql volatile security definer set search_path = public
as $$
  with h as (
    update public.historial_pruebas set borrado_at = now()
    where id = p_id and user_id = auth.uid() and modo in ('oficial', 'examen') and borrado_at is null
    returning 1)
  select exists (select 1 from h);
$$;
revoke all on function public.borrar_examen(uuid) from public, anon;
grant execute on function public.borrar_examen(uuid) to authenticated;

create or replace function public.restaurar_examen(p_id uuid)
returns boolean
language sql volatile security definer set search_path = public
as $$
  with h as (
    update public.historial_pruebas set borrado_at = null
    where id = p_id and borrado_at is not null
      and exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
    returning 1)
  select exists (select 1 from h);
$$;
revoke all on function public.restaurar_examen(uuid) from public, anon;
grant execute on function public.restaurar_examen(uuid) to authenticated;

create or replace function public.admin_examenes_borrados()
returns table (id uuid, user_id uuid, email text, modo text, nota numeric, created_at timestamptz, borrado_at timestamptz)
language sql stable security definer set search_path = public
as $$
  select h.id, h.user_id, u.email::text, h.modo, h.nota, h.created_at, h.borrado_at
  from public.historial_pruebas h join auth.users u on u.id = h.user_id
  where h.borrado_at is not null
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
  order by h.borrado_at desc;
$$;
revoke all on function public.admin_examenes_borrados() from public, anon;
grant execute on function public.admin_examenes_borrados() to authenticated;

create or replace function public.ranking_examenes()
returns table (user_id uuid, nombre text, examenes integer, media numeric, mejor numeric, ultima numeric, ultima_fecha timestamptz)
language sql stable security definer set search_path = public
as $$
  select r.user_id, r.nombre,
         count(h.id)::integer,
         round(avg(h.nota), 2),
         max(h.nota),
         (array_agg(h.nota order by h.created_at desc) filter (where h.id is not null))[1],
         max(h.created_at)
  from public.ranking_participantes r
  left join public.historial_pruebas h on h.user_id = r.user_id and h.modo in ('oficial', 'examen') and h.borrado_at is null
  where (select auth.uid()) is not null
  group by r.user_id, r.nombre;
$$;
