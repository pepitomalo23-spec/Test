-- =====================================================================
-- Callejero: modos «Barrios y distritos», «¿En qué barrio está?» y
-- «Nombra las calles»
-- =====================================================================
-- Sus respuestas se guardan en callejero_intentos como las demás:
--   - «barrios»: id_vial es el del barrio (6 000 000 000 000 + un resumen
--     de su nombre) o el del distrito (6 100 000 000 000 + …);
--   - «enbarrio»: id_vial es el de la calle marcada;
--   - «nombrar»: id_vial es el de la calle dicha (o la que faltó).
-- Los dos primeros entrenan su propia habilidad, «barrios»; el último,
-- «memoria» (así una calle que no se ha sabido nombrar de memoria no
-- cuenta como fallo de «¿Cómo se llama?»).
-- =====================================================================

create or replace function public.callejero_habilidad(p_modo text)
returns text language sql immutable set search_path = public as $$
  select case p_modo
    when 'localiza' then 'localiza'
    when 'cruces' then 'cruces'
    when 'lugares' then 'lugares'
    when 'parque' then 'parque'
    when 'temario' then 'temario'
    when 'barrios' then 'barrios'
    when 'enbarrio' then 'barrios'
    when 'nombrar' then 'memoria'
    else 'nombre' end;   -- ¿Cómo se llama?, Di el nombre (y el antiguo «escribe»)
$$;
