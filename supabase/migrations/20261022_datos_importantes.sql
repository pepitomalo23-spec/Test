-- =====================================================================
-- Datos importantes (Estudio): apartados de fichas que cada usuario se
-- crea para memorizar datos (números ONU de mercancías peligrosas, NIP,
-- teléfonos, cifras…). Privado: cada uno ve y cambia solo lo suyo.
--   di_apartados: cada apartado. plantilla ('onu', 'nip' o 'libre') dice
--     cómo se pregunta por defecto; nombre_a / nombre_b son los nombres de
--     las dos caras (p. ej. «Nº ONU» y «Materia»); escribir_a / escribir_b:
--     si al preguntar esa cara se responde escribiendo (si no, eligiendo
--     entre 4); sentido: 'ab' (se ve A, se responde B), 'ba' o 'ambos'.
--   di_datos: cada ficha (a, b) con su avance: aciertos, fallos y racha
--     (dominada con 3 seguidas).
-- Se puede aplicar más de una vez.
-- =====================================================================

create table if not exists public.di_apartados (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  titulo text not null check (char_length(btrim(titulo)) between 1 and 80),
  plantilla text not null default 'libre' check (plantilla in ('onu', 'nip', 'libre')),
  nombre_a text not null default 'Dato' check (char_length(nombre_a) between 1 and 40),
  nombre_b text not null default 'Qué es' check (char_length(nombre_b) between 1 and 40),
  escribir_a boolean not null default false,
  escribir_b boolean not null default false,
  sentido text not null default 'ambos' check (sentido in ('ab', 'ba', 'ambos')),
  orden int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists di_apartados_user on public.di_apartados (user_id, orden);
alter table public.di_apartados enable row level security;
drop policy if exists di_apartados_propios on public.di_apartados;
create policy di_apartados_propios on public.di_apartados for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create table if not exists public.di_datos (
  id uuid primary key default gen_random_uuid(),
  apartado_id uuid not null references public.di_apartados(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  a text not null check (char_length(btrim(a)) between 1 and 200),
  b text not null check (char_length(btrim(b)) between 1 and 1000),
  aciertos int not null default 0,
  fallos int not null default 0,
  racha int not null default 0,
  ultima timestamptz,
  orden int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists di_datos_apartado on public.di_datos (apartado_id, orden);
create index if not exists di_datos_user on public.di_datos (user_id);
alter table public.di_datos enable row level security;
drop policy if exists di_datos_propios on public.di_datos;
create policy di_datos_propios on public.di_datos for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
