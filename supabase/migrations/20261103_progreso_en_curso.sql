-- Seguir en otro dispositivo: lo que cada uno tiene a medias (un test de
-- Legislación, un simulacro, un test del Específico, cómo repasa el
-- callejero…). Una fila por cosa; `at` es cuándo cambió (ms, del
-- dispositivo): gana lo más nuevo. `datos` null = ya no hay nada a medias.
set lock_timeout = '5s';

create table if not exists public.progreso_en_curso (
  user_id uuid not null references auth.users(id) on delete cascade,
  clave text not null check (char_length(clave) between 1 and 60),
  datos jsonb check (datos is null or pg_column_size(datos) < 3000000),
  at bigint not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, clave)
);

alter table public.progreso_en_curso enable row level security;

create policy "en curso select" on public.progreso_en_curso
  for select to authenticated using (user_id = (select auth.uid()));
create policy "en curso insert" on public.progreso_en_curso
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "en curso update" on public.progreso_en_curso
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "en curso delete" on public.progreso_en_curso
  for delete to authenticated using (user_id = (select auth.uid()));
