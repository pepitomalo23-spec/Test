-- =====================================================================
-- Recordatorio diario por notificación push (y avisos de errores al admin)
-- =====================================================================
-- Cada dispositivo en el que el usuario activa el recordatorio guarda
-- aquí su suscripción push (Web Push estándar) y la hora a la que lo
-- quiere, en su zona horaria. La función push-reminders se ejecuta cada
-- hora (pg_cron) y avisa a quien le toque:
--   - «Tienes N tarjetas para repasar hoy» (Repaso diario de Normativas),
--   - y, a los administradores, si ha habido errores nuevos en la app.
--
-- Las claves VAPID y el secreto del cron viven en app_secrets
-- ('vapid_private_jwk', 'vapid_public_key', 'push_cron_secret'),
-- insertados a mano, nunca desde este archivo.
-- =====================================================================

create table if not exists public.push_subscriptions (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  remind_hour smallint not null default 19 check (remind_hour between 0 and 23),
  tz text not null default 'Europe/Madrid',
  last_sent_on date,
  last_error_alert_at timestamptz,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists push_subscriptions_user_idx on public.push_subscriptions(user_id);

alter table public.push_subscriptions enable row level security;

drop policy if exists "own push_subscriptions" on public.push_subscriptions;
create policy "own push_subscriptions" on public.push_subscriptions
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Cada hora, en punto.
select cron.schedule(
  'push-reminders-hourly',
  '0 * * * *',
  $$
  select net.http_post(
    url := 'https://tsjaaqkvncgxqtpmlugv.supabase.co/functions/v1/push-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-push-secret', (select value from public.app_secrets where name = 'push_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);
