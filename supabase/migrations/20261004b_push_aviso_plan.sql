-- =====================================================================
-- Aviso del Plan de estudio por la noche (push-reminders)
-- =====================================================================
-- Qué día se envió por última vez a esta suscripción, para mandarlo una
-- sola vez al día. La hora y si está encendido van en plan_ajustes.reglas
-- (aviso_noche, hora_noche). Solo añade una columna: no cambia permisos.
-- =====================================================================
alter table public.push_subscriptions add column if not exists last_plan_sent_on date;
