-- =====================================================================
-- Rendimiento (avisos de Supabase):
-- 1. Reglas de RLS: auth.uid() pasa a (select auth.uid()), que se calcula
--    una vez por consulta en vez de una vez por fila. Lo que permiten no
--    cambia nada.
-- 2. Índices de las claves ajenas que no tenían.
-- Se puede aplicar más de una vez.
-- =====================================================================

alter policy "admin app_settings" on public.app_settings using ((exists (select 1 from profiles p where ((p.id = (select auth.uid())) and p.is_admin)))) with check ((exists (select 1 from profiles p where ((p.id = (select auth.uid())) and p.is_admin))));
alter policy "admin read callejero_cambios" on public.callejero_cambios using ((exists (select 1 from profiles p where ((p.id = (select auth.uid())) and p.is_admin))));
alter policy "own callejero_intentos insert" on public.callejero_intentos with check ((user_id = (select auth.uid())));
alter policy "own callejero_intentos select" on public.callejero_intentos using ((user_id = (select auth.uid())));
alter policy "mensajes insert" on public.callejero_mensajes with check (((autor_id = (select auth.uid())) and (exists (select 1 from callejero_tareas k where (k.id = callejero_mensajes.tarea_id)))));
alter policy "admin read callejero_sync_log" on public.callejero_sync_log using ((exists (select 1 from profiles p where ((p.id = (select auth.uid())) and p.is_admin))));
alter policy "tareas delete" on public.callejero_tareas using (((profesor_id = (select auth.uid())) and callejero_es_tutor((select auth.uid()), alumno_id)));
alter policy "tareas insert" on public.callejero_tareas with check (((profesor_id = (select auth.uid())) and callejero_es_tutor((select auth.uid()), alumno_id)));
alter policy "tareas select" on public.callejero_tareas using ((((alumno_id = (select auth.uid())) or (profesor_id = (select auth.uid()))) and callejero_es_tutor(profesor_id, alumno_id)));
alter policy "tareas update" on public.callejero_tareas using (((profesor_id = (select auth.uid())) and callejero_es_tutor((select auth.uid()), alumno_id))) with check (((profesor_id = (select auth.uid())) and callejero_es_tutor((select auth.uid()), alumno_id)));
alter policy "admin read callejero_vias" on public.callejero_vias using ((exists (select 1 from profiles p where ((p.id = (select auth.uid())) and p.is_admin))));
alter policy "admin delete client_errors" on public.client_errors using ((exists (select 1 from profiles p where ((p.id = (select auth.uid())) and p.is_admin))));
alter policy "admin read client_errors" on public.client_errors using ((exists (select 1 from profiles p where ((p.id = (select auth.uid())) and p.is_admin))));
alter policy "admin update client_errors" on public.client_errors using ((exists (select 1 from profiles p where ((p.id = (select auth.uid())) and p.is_admin)))) with check ((exists (select 1 from profiles p where ((p.id = (select auth.uid())) and p.is_admin))));
alter policy "anyone insert client_errors" on public.client_errors with check (((user_id is null) or (user_id = (select auth.uid()))));
alter policy "users can insert own sync state" on public.device_sync_state with check (((select auth.uid()) = user_id));
alter policy "users can read own sync state" on public.device_sync_state using (((select auth.uid()) = user_id));
alter policy "users can update own sync state" on public.device_sync_state using (((select auth.uid()) = user_id)) with check (((select auth.uid()) = user_id));
alter policy "users can delete own dismissed fails" on public.dismissed_fails using (((select auth.uid()) = user_id));
alter policy "users can insert own dismissed fails" on public.dismissed_fails with check (((select auth.uid()) = user_id));
alter policy "users can read own dismissed fails" on public.dismissed_fails using (((select auth.uid()) = user_id));
alter policy "users can update own dismissed fails" on public.dismissed_fails using (((select auth.uid()) = user_id)) with check (((select auth.uid()) = user_id));
alter policy "admins can read attempts" on public.login_attempts using ((exists (select 1 from profiles p where ((p.id = (select auth.uid())) and p.is_admin))));
alter policy admin_delete_nodos_temario on public.nodos_temario using ((exists (select 1 from profiles p where ((p.id = (select auth.uid())) and (p.is_admin = true)))));
alter policy admin_insert_nodos_temario on public.nodos_temario with check ((exists (select 1 from profiles p where ((p.id = (select auth.uid())) and (p.is_admin = true)))));
alter policy admin_update_nodos_temario on public.nodos_temario using ((exists (select 1 from profiles p where ((p.id = (select auth.uid())) and (p.is_admin = true))))) with check ((exists (select 1 from profiles p where ((p.id = (select auth.uid())) and (p.is_admin = true)))));
alter policy "admin write nq_cards" on public.nq_cards using ((exists (select 1 from profiles p where ((p.id = (select auth.uid())) and p.is_admin)))) with check ((exists (select 1 from profiles p where ((p.id = (select auth.uid())) and p.is_admin))));
alter policy "admin write nq_sets" on public.nq_sets using ((exists (select 1 from profiles p where ((p.id = (select auth.uid())) and p.is_admin)))) with check ((exists (select 1 from profiles p where ((p.id = (select auth.uid())) and p.is_admin))));
alter policy "own nq_user_progress" on public.nq_user_progress using ((user_id = (select auth.uid()))) with check ((user_id = (select auth.uid())));
alter policy "profile insert own" on public.profiles with check (((select auth.uid()) = id));
alter policy "profile select own" on public.profiles using (((select auth.uid()) = id));
alter policy "own push_subscriptions" on public.push_subscriptions using ((user_id = (select auth.uid()))) with check ((user_id = (select auth.uid())));
alter policy "delete own question_user_data" on public.question_user_data using (((select auth.uid()) = user_id));
alter policy "insert own question_user_data" on public.question_user_data with check (((select auth.uid()) = user_id));
alter policy "select own question_user_data" on public.question_user_data using (((select auth.uid()) = user_id));
alter policy "update own question_user_data" on public.question_user_data using (((select auth.uid()) = user_id)) with check (((select auth.uid()) = user_id));
alter policy admin_delete_questions on public.questions using ((exists (select 1 from profiles p where ((p.id = (select auth.uid())) and (p.is_admin = true)))));
alter policy admin_insert_questions on public.questions with check ((exists (select 1 from profiles p where ((p.id = (select auth.uid())) and (p.is_admin = true)))));
alter policy admin_update_questions on public.questions using ((exists (select 1 from profiles p where ((p.id = (select auth.uid())) and (p.is_admin = true))))) with check ((exists (select 1 from profiles p where ((p.id = (select auth.uid())) and (p.is_admin = true)))));
alter policy "answers delete own" on public.session_answers using (((select auth.uid()) = user_id));
alter policy "answers insert own" on public.session_answers with check (((select auth.uid()) = user_id));
alter policy "answers select own" on public.session_answers using (((select auth.uid()) = user_id));
alter policy "sessions delete own" on public.test_sessions using (((select auth.uid()) = user_id));
alter policy "sessions insert own" on public.test_sessions with check (((select auth.uid()) = user_id));
alter policy "sessions select own" on public.test_sessions using (((select auth.uid()) = user_id));
alter policy admin_delete_topics on public.topics using ((exists (select 1 from profiles p where ((p.id = (select auth.uid())) and (p.is_admin = true)))));
alter policy admin_insert_topics on public.topics with check ((exists (select 1 from profiles p where ((p.id = (select auth.uid())) and (p.is_admin = true)))));
alter policy admin_update_topics on public.topics using ((exists (select 1 from profiles p where ((p.id = (select auth.uid())) and (p.is_admin = true))))) with check ((exists (select 1 from profiles p where ((p.id = (select auth.uid())) and (p.is_admin = true)))));
alter policy "read tutorias" on public.tutorias using (((profesor_id = (select auth.uid())) or (alumno_id = (select auth.uid())) or (exists (select 1 from profiles p where ((p.id = (select auth.uid())) and p.is_admin)))));
alter policy "admins can read activity" on public.user_activity_sessions using ((exists (select 1 from profiles p where ((p.id = (select auth.uid())) and p.is_admin))));
alter policy "users can delete own app state" on public.user_app_state using (((select auth.uid()) = user_id));
alter policy "users can insert own app state" on public.user_app_state with check (((select auth.uid()) = user_id));
alter policy "users can read own app state" on public.user_app_state using (((select auth.uid()) = user_id));
alter policy "users can update own app state" on public.user_app_state using (((select auth.uid()) = user_id)) with check (((select auth.uid()) = user_id));
alter policy "admins can read all devices" on public.user_devices using ((exists (select 1 from profiles p where ((p.id = (select auth.uid())) and p.is_admin))));
alter policy own_delete_devices on public.user_devices using (((select auth.uid()) = user_id));
alter policy own_insert_devices on public.user_devices with check (((select auth.uid()) = user_id));
alter policy own_select_devices on public.user_devices using (((select auth.uid()) = user_id));
alter policy own_update_devices on public.user_devices using (((select auth.uid()) = user_id)) with check (((select auth.uid()) = user_id));

create index if not exists boe_bloques_seguimiento_nodo on public.boe_bloques_seguimiento (nodo_id);
create index if not exists calendario_tareas_test on public.calendario_tareas (test_id);
create index if not exists callejero_cambios_revisado_por on public.callejero_cambios (revisado_por);
create index if not exists callejero_mensajes_autor on public.callejero_mensajes (autor_id);
create index if not exists callejero_tareas_hechas_tarea on public.callejero_tareas_hechas (tarea_id);
create index if not exists callejero_temario_preguntas_autor on public.callejero_temario_preguntas (autor);
create index if not exists client_errors_usuario on public.client_errors (user_id);
create index if not exists dismissed_fails_pregunta on public.dismissed_fails (question_id);
create index if not exists especifico_notas_pregunta on public.especifico_notas (pregunta_id);
create index if not exists login_verifications_usuario on public.login_verifications (user_id);
create index if not exists nodos_temario_tema on public.nodos_temario (topic_id);
create index if not exists plan_preguntas_usuario_tema on public.plan_preguntas (user_id, tema_id);
create index if not exists plan_resultados_usuario_tarea on public.plan_resultados (user_id, tarea_id);
create index if not exists plan_resultados_usuario_test on public.plan_resultados (user_id, test_id);
create index if not exists question_user_data_pregunta on public.question_user_data (question_id);
create index if not exists questions_nodo on public.questions (nodo_id);
create index if not exists session_answers_pregunta on public.session_answers (question_id);
create index if not exists session_answers_usuario on public.session_answers (user_id);
