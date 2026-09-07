-- =====================================================================
-- Migración: "Quitar de Fallos" sin tocar el historial ni las Estadísticas
-- =====================================================================
-- Ejecuta este script en Supabase → SQL Editor (proyecto de este repo).
-- No se aplica automáticamente: requiere acceso al panel de Supabase,
-- que no se comparte con el asistente.
--
-- Contexto:
--   El botón "Eliminar preguntas que hay aquí" de la pantalla Fallos
--   borraba las respuestas (session_answers) de esas preguntas, lo que
--   las hacía desaparecer también de las Estadísticas (quedaban "sin
--   hacer"). Eso ya no es lo que se quiere: el botón debe quitar esas
--   preguntas de la pantalla de Fallos, pero sin tocar nada más — en
--   Estadísticas deben seguir contando como falladas.
--
--   Para eso hace falta guardar, por usuario y pregunta, cuándo se
--   "descartó" de Fallos. No se borra ni se resetea nada: en el
--   cliente (index.html) se compara esta fecha con la del último
--   intento real de esa pregunta (que ya se calcula en caliente en
--   computeQuestionMastery, a partir de session_answers). Si el
--   usuario vuelve a fallar la pregunta más adelante, ese nuevo
--   intento es más reciente que la fecha de descarte y la pregunta
--   reaparece sola en Fallos, sin ninguna acción manual.
-- =====================================================================

create table if not exists public.dismissed_fails (
  user_id uuid not null references auth.users(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete cascade,
  dismissed_at timestamptz not null default now(),
  primary key (user_id, question_id)
);

alter table public.dismissed_fails enable row level security;

drop policy if exists "users can read own dismissed fails" on public.dismissed_fails;
create policy "users can read own dismissed fails"
  on public.dismissed_fails for select
  using (auth.uid() = user_id);

drop policy if exists "users can insert own dismissed fails" on public.dismissed_fails;
create policy "users can insert own dismissed fails"
  on public.dismissed_fails for insert
  with check (auth.uid() = user_id);

-- Permite volver a "descartar" la misma pregunta más adelante (upsert desde
-- el cliente), actualizando solo la fecha.
drop policy if exists "users can update own dismissed fails" on public.dismissed_fails;
create policy "users can update own dismissed fails"
  on public.dismissed_fails for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "users can delete own dismissed fails" on public.dismissed_fails;
create policy "users can delete own dismissed fails"
  on public.dismissed_fails for delete
  using (auth.uid() = user_id);
