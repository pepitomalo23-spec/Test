-- Específico › Preguntas marcadas: el repaso de cada día (js/especifico-test.js).
-- Cada marcada sube por escalones; cada uno vuelve a salir más tarde
-- (1, 3, 7, 15, 30 y 60 días). Acertarla sin dudar la sube; «Dudé» la deja
-- igual; fallarla la devuelve al principio. Acertada en el último escalón,
-- ya te la sabes: deja de salir (sabida_at) y se puede volver a marcar.
set lock_timeout = '5s';

alter table public.especifico_marcadas
  add column if not exists escalon smallint not null default 0 check (escalon between 0 and 6),
  add column if not exists proxima date not null default current_date,
  add column if not exists ultima date,
  add column if not exists sabida_at timestamptz;

create index if not exists especifico_marcadas_proxima on public.especifico_marcadas (user_id, proxima) where sabida_at is null;
