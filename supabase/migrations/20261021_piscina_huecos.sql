-- =====================================================================
-- Piscina: huecos ahora en IMDECO (función piscina-huecos).
--   piscina_huecos:    la última foto de hoy, mañana y pasado (calles libres
--                      por hora). Solo la función la lee y la escribe.
--   piscina_liberados: cada calle que estaba ocupada y pasa a libre (alguien
--                      anuló), con cuándo se vio.
-- La función se ejecuta cada 5 minutos (pg_cron) con la cabecera
-- x-piscina-secret = app_secrets.piscina_cron_secret, y desde la app con la
-- sesión de un administrador.
-- Se puede aplicar más de una vez.
-- =====================================================================

create table if not exists public.piscina_huecos (
  id int primary key default 1 check (id = 1),
  datos jsonb not null,
  actualizado timestamptz not null default now()
);
alter table public.piscina_huecos enable row level security;

create table if not exists public.piscina_liberados (
  id bigint generated always as identity primary key,
  fecha date not null,
  hora text not null,
  calle text not null,
  visto timestamptz not null default now()
);
alter table public.piscina_liberados enable row level security;

-- El secreto del cron (un valor aleatorio; no va en el repo):
-- insert into public.app_secrets (name, value) values ('piscina_cron_secret', '<aleatorio>')
--   on conflict (name) do update set value = excluded.value;

select cron.unschedule('piscina-huecos-5min') where exists (select 1 from cron.job where jobname = 'piscina-huecos-5min');
select cron.schedule(
  'piscina-huecos-5min',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://tsjaaqkvncgxqtpmlugv.supabase.co/functions/v1/piscina-huecos',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-piscina-secret', (select value from public.app_secrets where name = 'piscina_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);
