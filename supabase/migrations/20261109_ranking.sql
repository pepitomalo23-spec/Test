-- =====================================================================
-- Mini ranking de Estadística: quién va ganando en los exámenes.
--   ranking_participantes: quién sale y con qué nombre (lo decide el
--   administrador). Cuentan el Simulacro oficial y el Examen
--   (historial_pruebas, modos 'oficial' y 'examen').
-- Se puede aplicar más de una vez.
-- =====================================================================
set lock_timeout = '5s';

create table if not exists public.ranking_participantes (
  user_id uuid primary key references auth.users(id) on delete cascade,
  nombre text not null check (length(btrim(nombre)) between 1 and 40),
  created_at timestamptz not null default now()
);
alter table public.ranking_participantes enable row level security;

-- Todos los que han entrado ven quién sale; solo el administrador lo cambia.
drop policy if exists "ranking_participantes leer" on public.ranking_participantes;
create policy "ranking_participantes leer" on public.ranking_participantes
  for select to authenticated using (true);
drop policy if exists "ranking_participantes admin" on public.ranking_participantes;
create policy "ranking_participantes admin" on public.ranking_participantes
  for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.is_admin))
  with check (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.is_admin));

revoke all on public.ranking_participantes from anon;
grant select, insert, update, delete on public.ranking_participantes to authenticated;
grant select, insert, update, delete on public.ranking_participantes to service_role;

-- Las notas de los que salen (solo eso: nada de sus preguntas ni respuestas).
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
  left join public.historial_pruebas h on h.user_id = r.user_id and h.modo in ('oficial', 'examen')
  where (select auth.uid()) is not null
  group by r.user_id, r.nombre;
$$;
revoke all on function public.ranking_examenes() from public, anon;
grant execute on function public.ranking_examenes() to authenticated;
