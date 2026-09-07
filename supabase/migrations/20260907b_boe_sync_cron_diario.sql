-- =====================================================================
-- Documentación: cambio ya aplicado en producción (Supabase)
-- =====================================================================
-- Comprobación diaria automática de cambios legislativos (BOE)
-- =====================================================================
-- Se ejecuta todos los días a las 06:00 UTC (~07:00/08:00 hora de
-- España según horario de verano/invierno). El secreto compartido se
-- lee de app_secrets en el momento de ejecutarse el cron, así que
-- nunca queda escrito en este archivo versionado en git.
--
-- Requiere que ya exista la fila app_secrets con name='boe_sync_secret'
-- (ver 20260907_boe_seguimiento_cambios_legislativos.sql) insertada a
-- mano, nunca desde este archivo.
-- =====================================================================

select cron.schedule(
  'boe-sync-diario',
  '0 6 * * *',
  $$
  select net.http_post(
    url := 'https://tsjaaqkvncgxqtpmlugv.supabase.co/functions/v1/boe-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-boe-sync-secret', (select value from public.app_secrets where name = 'boe_sync_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);
