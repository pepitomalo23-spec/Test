-- =====================================================================
-- Permisos por función: plantilla para cuentas nuevas, datos protegidos
-- y perfil a prueba de manipulaciones
-- =====================================================================
-- 1) SEGURIDAD: hasta ahora cada usuario podía modificar su propia fila
--    de profiles (incluidos is_admin, approved, blocked y feature_flags)
--    y crearla con los valores que quisiera. La app nunca lo necesita
--    (todo cambio lo hace el admin con funciones security definer), así
--    que se elimina esa política y, al crear el perfil, se fuerzan los
--    valores seguros.
-- 2) Las cuentas nuevas reciben los permisos de una plantilla que el
--    admin decide desde el panel (app_settings 'default_feature_flags').
-- 3) Normativas protegida también en la base de datos: quien la tenga
--    desactivada no puede leer temas ni tarjetas.
-- =====================================================================

-- ---- 1) Perfil seguro ----
drop policy if exists "profile update own" on public.profiles;

create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.app_settings enable row level security;
drop policy if exists "admin app_settings" on public.app_settings;
create policy "admin app_settings" on public.app_settings
  for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin));

insert into public.app_settings(key, value) values ('default_feature_flags', '{
  "normativas": false, "inteligente": false, "notas_ia": false, "stats_avanzadas": false, "boe": false,
  "estadisticas": true, "historial": true, "fallos": true, "simulacro": true, "examen": true
}'::jsonb)
on conflict (key) do nothing;

create or replace function public.profiles_safe_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_caller_admin boolean;
begin
  select coalesce(bool_or(is_admin), false) into v_caller_admin from public.profiles where id = auth.uid();
  -- Solo un admin (o el propio servidor, sin auth.uid()) puede crear perfiles con otros valores.
  if auth.uid() is not null and not v_caller_admin then
    new.is_admin := false;
    new.approved := false;
    new.blocked := false;
    new.device_limit := 2;
    new.feature_flags := coalesce((select value from public.app_settings where key = 'default_feature_flags'), '{}'::jsonb);
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_safe_insert on public.profiles;
create trigger profiles_safe_insert
  before insert on public.profiles
  for each row execute function public.profiles_safe_insert();

-- ---- 2) Plantilla editable por el admin ----
create or replace function public.admin_set_default_feature_flags(p_flags jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.profiles pp where pp.id = auth.uid() and pp.is_admin) then
    raise exception 'not authorized';
  end if;
  if jsonb_typeof(p_flags) <> 'object' then raise exception 'formato'; end if;
  insert into public.app_settings(key, value, updated_at) values ('default_feature_flags', p_flags, now())
  on conflict (key) do update set value = excluded.value, updated_at = now();
end;
$$;
revoke all on function public.admin_set_default_feature_flags(jsonb) from public, anon;
grant execute on function public.admin_set_default_feature_flags(jsonb) to authenticated;

-- ---- 3) Normativas protegida en la base de datos ----
create or replace function public.my_feature_enabled(p_feature text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    (select p.is_admin or coalesce((p.feature_flags ->> p_feature)::boolean, true)
       from public.profiles p where p.id = auth.uid()),
    false);
$$;
revoke all on function public.my_feature_enabled(text) from public, anon;
grant execute on function public.my_feature_enabled(text) to authenticated;

drop policy if exists "read nq_sets" on public.nq_sets;
create policy "read nq_sets" on public.nq_sets
  for select to authenticated using (public.my_feature_enabled('normativas'));

drop policy if exists "read nq_cards" on public.nq_cards;
create policy "read nq_cards" on public.nq_cards
  for select to authenticated using (public.my_feature_enabled('normativas'));
