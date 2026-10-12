-- =====================================================================
-- Ajustes del examen de cada alumno: la fecha (para la cuenta atrás de
-- Inicio) y el formato del Simulacro oficial: cuántas preguntas, minutos,
-- cuánto resta cada fallo (null = 1/(opciones-1)) y el % de Legislación
-- (el resto, Específico). El Simulacro oficial va al historial de pruebas
-- con modo 'oficial'.
-- Se puede aplicar más de una vez.
-- =====================================================================

create table if not exists public.examen_ajustes (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  fecha date,
  preguntas int not null default 100 check (preguntas between 5 and 400),
  minutos int not null default 120 check (minutos between 5 and 600),
  penalizacion numeric check (penalizacion is null or (penalizacion >= 0 and penalizacion <= 1)),
  pct_legis int not null default 50 check (pct_legis between 0 and 100),
  updated_at timestamptz not null default now()
);
alter table public.examen_ajustes enable row level security;
drop policy if exists "examen_ajustes propios" on public.examen_ajustes;
create policy "examen_ajustes propios" on public.examen_ajustes for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

alter table public.historial_pruebas drop constraint if exists historial_pruebas_modo_check,
  add constraint historial_pruebas_modo_check
  check (modo in ('conjunto', 'esp-estudio', 'esp-fallos', 'esp-simulacro', 'esp-examen', 'esp-tb', 'oficial'));
