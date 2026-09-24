-- =====================================================================
-- Copias de seguridad diarias
-- =====================================================================
-- Almacén privado "backups" (Supabase Storage) donde la función backup-db
-- deja cada noche una copia comprimida de las tablas importantes
-- (se guardan los últimos 14 días). Solo los administradores pueden ver y
-- descargar las copias desde el panel.
--
-- El secreto del cron vive en app_secrets ('backup_cron_secret'),
-- insertado a mano, nunca desde este archivo.
-- =====================================================================

insert into storage.buckets (id, name, public)
values ('backups', 'backups', false)
on conflict (id) do nothing;

drop policy if exists "admin read backups" on storage.objects;
create policy "admin read backups" on storage.objects
  for select to authenticated
  using (bucket_id = 'backups'
         and exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin));

-- Todas las noches a las 03:30 UTC (~04:30/05:30 en España).
select cron.schedule(
  'backup-db-diario',
  '30 3 * * *',
  $$
  select net.http_post(
    url := 'https://tsjaaqkvncgxqtpmlugv.supabase.co/functions/v1/backup-db',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-backup-secret', (select value from public.app_secrets where name = 'backup_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);
