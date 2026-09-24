-- =====================================================================
-- Endurecimiento de funciones (avisos del analizador de seguridad)
-- =====================================================================
-- Todas las funciones security definer ya comprueban quién las llama,
-- pero ninguna necesita poder ejecutarse sin iniciar sesión: se retira
-- el permiso a 'anon'. Las funciones de trigger no deben llamarse como
-- RPC por nadie. Y se fija el search_path de la que no lo tenía.
-- =====================================================================
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig, p.prorettype = 'trigger'::regtype as is_trigger
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prosecdef
  loop
    execute format('revoke execute on function %s from public, anon', r.sig);
    if r.is_trigger then
      execute format('revoke execute on function %s from authenticated', r.sig);
    end if;
  end loop;
end $$;

alter function public.questions_touch_updated_at() set search_path = public;
