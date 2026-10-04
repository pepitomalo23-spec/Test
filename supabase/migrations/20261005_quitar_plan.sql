-- =====================================================================
-- Quitar el Plan de estudio
-- =====================================================================
-- El Plan de estudio (antes en 20261003c_plan_estudio.sql) y su aviso por
-- la noche (20261004b_push_aviso_plan.sql) se quitaron de la app a
-- petición del usuario. Esto borra sus tablas (estaban vacías), sus
-- funciones y la columna del aviso. Se puede aplicar más de una vez.
-- =====================================================================
drop table if exists public.plan_eventos, public.plan_resultados, public.plan_preguntas,
  public.plan_tareas, public.plan_tests, public.plan_temas, public.plan_ajustes;
drop function if exists public.plan_permitido();
drop function if exists public.plan_tocar_updated_at();
alter table public.push_subscriptions drop column if exists last_plan_sent_on;
