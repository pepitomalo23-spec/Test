-- =====================================================================
-- Callejero: notas propias de cada calle y preguntas del temario editables
-- =====================================================================
-- 1) callejero_notas: lo que cada alumno apunta de una calle o un lugar
--    (texto y una foto) para verlo al responder. Privado: cada uno las
--    suyas. «clave»: 'v:<nombre normalizado>' (una calle, todos sus tramos)
--    o 'l:<id del lugar>'. La foto va en el almacén «question-notes»
--    (callejero/<usuario>/...), como las de las notas de las preguntas.
--
-- 2) callejero_temario_preguntas: cambios en las preguntas del temario
--    del callejero, iguales para todos los alumnos. Los hacen el admin y
--    los profesores; los leen las cuentas aprobadas.
--      - tipo 'oculta': una pregunta generada que no debe salir
--        (item_id + generador).
--      - tipo 'propia': una pregunta escrita a mano, de un elemento
--        (item_id) o de un apartado entero (seccion, 'ficha/apartado').
--    Editar una generada = ocultarla y escribir una propia en su lugar.
-- Se puede aplicar más de una vez.
-- =====================================================================

create table if not exists public.callejero_notas (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  clave text not null check (clave ~ '^(v|l):.{1,200}$'),
  texto text check (texto is null or char_length(texto) <= 2000),
  imagen text check (imagen is null or char_length(imagen) <= 1000),
  updated_at timestamptz not null default now(),
  primary key (user_id, clave)
);
alter table public.callejero_notas enable row level security;
drop policy if exists "callejero_notas propias" on public.callejero_notas;
create policy "callejero_notas propias" on public.callejero_notas
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ¿Puede cambiar las preguntas del temario? (admin o profesor, sin bloquear)
create or replace function public.callejero_edita_temario()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p
                  where p.id = auth.uid() and (p.is_admin or p.es_profesor) and not coalesce(p.blocked, false));
$$;
revoke all on function public.callejero_edita_temario() from public, anon;
grant execute on function public.callejero_edita_temario() to authenticated;

create table if not exists public.callejero_temario_preguntas (
  id bigserial primary key,
  tipo text not null check (tipo in ('oculta', 'propia')),
  item_id bigint,                       -- elemento del temario (datos/callejero-temario.json)
  seccion text check (seccion is null or seccion ~ '^[a-z0-9-]+/[a-z0-9-]+$'),
  generador text check (generador is null or generador ~ '^[A-Za-z0-9_]{1,60}$'),
  pregunta text check (pregunta is null or char_length(btrim(pregunta)) between 1 and 1000),
  opciones jsonb check (opciones is null or (jsonb_typeof(opciones) = 'array' and jsonb_array_length(opciones) between 2 and 8)),
  correcta int check (correcta is null or correcta >= 0),
  explicacion text check (explicacion is null or char_length(explicacion) <= 2000),
  autor uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (tipo <> 'oculta' or (item_id is not null and generador is not null)),
  check (tipo <> 'propia' or (pregunta is not null and opciones is not null and correcta is not null
                              and correcta < jsonb_array_length(opciones)
                              and (item_id is not null or seccion is not null)))
);
create unique index if not exists callejero_temario_oculta_uq
  on public.callejero_temario_preguntas (item_id, generador) where tipo = 'oculta';
alter table public.callejero_temario_preguntas enable row level security;
drop policy if exists "callejero_temario_preguntas leer" on public.callejero_temario_preguntas;
create policy "callejero_temario_preguntas leer" on public.callejero_temario_preguntas
  for select to authenticated
  using (exists (select 1 from public.profiles p
                  where p.id = (select auth.uid()) and (p.approved or p.is_admin) and not coalesce(p.blocked, false)));
drop policy if exists "callejero_temario_preguntas cambiar" on public.callejero_temario_preguntas;
create policy "callejero_temario_preguntas cambiar" on public.callejero_temario_preguntas
  for all to authenticated
  using ((select public.callejero_edita_temario()))
  with check ((select public.callejero_edita_temario()));
