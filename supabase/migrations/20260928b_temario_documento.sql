-- =====================================================================
-- Callejero: el documento original del temario y tareas cosa por cosa
-- =====================================================================
-- 1) Las páginas de la documentación de la academia (con sus mapas) se
--    guardan en el almacén «temario», que NO es público: solo las ven los
--    usuarios aprobados y no bloqueados. (El repositorio es público: las
--    páginas no van en él.) Rutas: v1/<documento>/<página, 2 cifras>.webp.
-- 2) Las tareas del temario pueden llevar, además de fichas enteras
--    («centro») y apartados («centro/plazas»), elementos sueltos
--    («centro/plazas/5003814547792»).
-- =====================================================================

insert into storage.buckets (id, name, public)
values ('temario', 'temario', false)
on conflict (id) do update set public = false;

drop policy if exists "temario lectura" on storage.objects;
create policy "temario lectura" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'temario'
    and exists (select 1 from public.profiles p
                 where p.id = auth.uid() and (p.approved or p.is_admin) and not coalesce(p.blocked, false))
  );

alter table public.callejero_tareas drop constraint if exists callejero_tareas_fichas_check;
alter table public.callejero_tareas add constraint callejero_tareas_fichas_check
  check (cardinality(fichas) <= 2000
         and array_to_string(fichas, '|') ~ '^([a-z0-9-]+(/[a-z0-9-]+(/[0-9]+)?)?(\|[a-z0-9-]+(/[a-z0-9-]+(/[0-9]+)?)?)*)?$');
