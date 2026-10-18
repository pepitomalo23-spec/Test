-- =====================================================================
-- Examen compartido, sin copias: quien lo recibe ve el examen del que lo
-- manda (solo lectura) y su nota va a examen_resultados.
--   examen.para: a quién se manda (ids). Solo cuenta si quien lo manda es
--                administrador, o profesor de esa persona.
--   examen.fijo: las preguntas, iguales para todos.
--   examen.de:   el correo de quien lo manda (para enseñarlo).
-- Como no es suyo, quien lo recibe no lo puede mover, cambiar ni borrar
-- (la política de calendario_tareas «propias» sigue igual para escribir).
-- Las columnas origen y enviado_por de 20261107 se quedan sin usar.
-- Se puede aplicar más de una vez.
-- =====================================================================
set lock_timeout = '5s';

-- ¿Puede «quien» poner exámenes a «a»? (administrador, o su profesor)
create or replace function public.puede_mandar_examen(quien uuid, a uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.profiles p where p.id = quien and p.is_admin)
      or exists (select 1 from public.tutorias t where t.profesor_id = quien and t.alumno_id = a);
$$;
revoke all on function public.puede_mandar_examen(uuid, uuid) from public, anon;
grant execute on function public.puede_mandar_examen(uuid, uuid) to authenticated;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'calendario_tareas' and policyname = 'calendario_tareas examen mandado') then
    create policy "calendario_tareas examen mandado" on public.calendario_tareas
      for select to authenticated
      using (categoria = 'examen' and examen -> 'para' ? (select auth.uid())::text
             and public.puede_mandar_examen(user_id, (select auth.uid())));
  end if;
end $$;

-- La nota de cada uno en un examen que le han mandado. Un solo intento:
-- se escribe una vez y no se cambia.
create table if not exists public.examen_resultados (
  tarea_id uuid not null references public.calendario_tareas(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nota numeric,
  at timestamptz not null default now(),
  primary key (tarea_id, user_id)
);
alter table public.examen_resultados enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'examen_resultados' and policyname = 'examen_resultados ver los mios') then
    create policy "examen_resultados ver los mios" on public.examen_resultados
      for select to authenticated using (user_id = (select auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'examen_resultados' and policyname = 'examen_resultados poner el mio') then
    create policy "examen_resultados poner el mio" on public.examen_resultados
      for insert to authenticated
      with check (user_id = (select auth.uid()) and exists (select 1 from public.calendario_tareas t where t.id = tarea_id));
  end if;
end $$;

-- Las notas de todos los que tienen ese examen: quien lo puso y a quienes se lo mandó.
create or replace function public.calendario_notas_examen(p_id uuid)
returns table (email text, nota numeric, hecho boolean, yo boolean, manda boolean)
language sql stable security definer set search_path = public
as $$
  with t as (
    select * from public.calendario_tareas c
    where c.id = p_id and c.categoria = 'examen'
      and (c.user_id = auth.uid() or (c.examen -> 'para' ? auth.uid()::text and public.puede_mandar_examen(c.user_id, auth.uid())))
  ), todos as (
    select u.email::text as email, (t.examen -> 'resultado' ->> 'nota')::numeric as nota, t.hecho, t.user_id = auth.uid() as yo, true as manda
    from t join auth.users u on u.id = t.user_id
    union all
    select u.email::text, r.nota, r.tarea_id is not null, u.id = auth.uid(), false
    from t cross join lateral jsonb_array_elements_text(coalesce(t.examen -> 'para', '[]'::jsonb)) p(id)
    join auth.users u on u.id::text = p.id
    left join public.examen_resultados r on r.tarea_id = t.id and r.user_id = u.id
  )
  select * from todos order by nota desc nulls last, email;
$$;
revoke all on function public.calendario_notas_examen(uuid) from public, anon;
grant execute on function public.calendario_notas_examen(uuid) to authenticated;
