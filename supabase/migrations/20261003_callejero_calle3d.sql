-- =====================================================================
-- Callejero: modo «A pie de calle» (en 3D) y modos de las tareas
-- =====================================================================
-- «calle3d»: se ve una calle en 3D, como si se estuviera en ella, y se
-- elige su nombre. id_vial es el de la calle y entrena su propia
-- habilidad, «calle3d».
--
-- Las tareas solo aceptaban los modos de antes de «Barrios y
-- distritos», «¿En qué barrio está?» y «Nombra las calles»: el profesor
-- ya los ve para marcarlos, así que ahora también se pueden guardar.
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
    when 'calle3d' then 'calle3d'
    else 'nombre' end;   -- ¿Cómo se llama?, Di el nombre (y el antiguo «escribe»)
$$;

alter table public.callejero_tareas drop constraint if exists callejero_tareas_modos_check;
alter table public.callejero_tareas add constraint callejero_tareas_modos_check
  check (modos <@ array['localiza','opciones','voz','cruces','lugares','parque','temario',
                        'barrios','enbarrio','nombrar','calle3d']::text[]);
