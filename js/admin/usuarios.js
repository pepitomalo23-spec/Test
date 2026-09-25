/* Administración: usuarios, dispositivos, permisos y verificaciones. */

/* ---------- USERS (registrados, dispositivos, intentos) ---------- */

/* ---------- Administración → plantilla de funciones para cuentas nuevas ---------- */
let adminDefaultFlags = null;
async function adminLoadDefaultFlags(){
  const el = document.getElementById('defaultFlagsList');
  if(!el) return;
  if(!adminDefaultFlags){
    el.innerHTML = skelList(2, false);
    const { data } = await sb.from('app_settings').select('value').eq('key', 'default_feature_flags').maybeSingle();
    adminDefaultFlags = (data && data.value) || {};
  }
  el.innerHTML = Object.keys(FEATURES).map(key => {
    const on = adminDefaultFlags[key] !== false;
    return '<div class="admin-user-row" style="justify-content:space-between; margin:6px 0;"><span style="font-size:13px;">' + escapeHtml(FEATURES[key]) + '</span>' +
      '<span class="switch' + (on ? ' on' : '') + '" role="button" tabindex="0" onclick="adminToggleDefaultFlag(\'' + key + '\')" onkeydown="if(event.key===\'Enter\')adminToggleDefaultFlag(\'' + key + '\')"><span class="knob"></span></span></div>';
  }).join('');
}
async function adminToggleDefaultFlag(key){
  const prev = Object.assign({}, adminDefaultFlags);
  adminDefaultFlags[key] = adminDefaultFlags[key] === false;
  adminLoadDefaultFlags();
  const { error } = await sb.rpc('admin_set_default_feature_flags', { p_flags: adminDefaultFlags });
  if(error){ adminDefaultFlags = prev; adminLoadDefaultFlags(); uiToast('No se pudo guardar: ' + error.message, 'error'); }
}

async function adminLoadUsers(){
  const el = document.getElementById('adminList-users');
  el.innerHTML = skelList(4);
  const { data, error } = await sb.rpc('admin_list_users');
  if(error){ el.innerHTML = '<div class="admin-empty">No se pudo cargar la lista de usuarios.</div>'; console.error(error); return; }
  adminData.users = data || [];
  adminRenderUsers();
}
function adminRenderUsers(){
  const el = document.getElementById('adminList-users');
  if(!adminData.users || !adminData.users.length){ el.innerHTML = '<div class="admin-empty">No hay usuarios registrados todavía.</div>'; return; }
  el.innerHTML = adminData.users.map(u => {
    const over = !u.is_admin && (u.device_count || 0) > (u.device_limit || 0);
    const pending = !u.is_admin && !u.approved;
    const limitControl = u.is_admin
      ? '<span class="admin-badge admin">Sin límite</span>'
      : ('<div class="admin-device-limit">' +
          '<input type="number" min="1" id="deviceLimit-'+esc(u.id)+'" value="'+(u.device_limit!=null?u.device_limit:2)+'">' +
          '<button class="btn btn-ghost" style="padding:8px 12px; font-size:12.5px;" onclick="adminSaveDeviceLimit(\''+u.id+'\')">Guardar</button>' +
        '</div>');
    const deviceBadge = u.is_admin
      ? '<span class="admin-badge">'+(u.device_count||0)+' dispositivos (ilimitado)</span>'
      : '<span class="admin-badge'+(over ? ' over' : '')+'">'+(u.device_count||0)+' / '+(u.device_limit||0)+' dispositivos</span>';
    const pendingRow = pending
      ? ('<div class="admin-user-row" style="margin-top:10px;">' +
          '<div class="admin-card-meta" style="color:var(--coral);">Cuenta nueva, pendiente de confirmación.</div>' +
          '<button class="btn btn-confirm" style="padding:8px 14px; font-size:12.5px;" onclick="adminApproveUser(\''+u.id+'\')">Confirmar</button>' +
        '</div>')
      : '';
    const blockedBadge = (!u.is_admin && u.blocked) ? '<span class="admin-badge over">Bloqueada</span>' : '';
    const featureTogglesRow = u.is_admin ? '' : (
      '<div class="admin-user-row" style="margin-top:10px; flex-direction:column; align-items:stretch; gap:8px;">' +
        '<div class="admin-card-meta">Funciones visibles para esta cuenta:</div>' +
        Object.keys(FEATURES).map(key => {
          const flags = u.feature_flags || {};
          const on = flags[key] !== false;
          return '<div class="admin-user-row" style="justify-content:space-between;">' +
              '<span style="font-size:13px;">' + esc(FEATURES[key]) + '</span>' +
              '<span class="switch' + (on ? ' on' : '') + '" role="button" tabindex="0" ' +
                'onclick="adminSetFeatureFlag(\'' + u.id + '\', \'' + key + '\', ' + !on + ', this)" ' +
                'onkeydown="if(event.key===\'Enter\')adminSetFeatureFlag(\'' + u.id + '\', \'' + key + '\', ' + !on + ', this)">' +
                '<span class="knob"></span>' +
              '</span>' +
            '</div>';
        }).join('') +
      '</div>'
    );
    const manageRow = u.is_admin
      ? ''
      : ('<div class="admin-user-row" style="margin-top:10px; gap:8px;">' +
          '<button class="btn btn-ghost" style="padding:8px 12px; font-size:12.5px;" onclick="adminToggleBlocked(\''+u.id+'\', '+(!!u.blocked)+')">'+
            (u.blocked ? 'Desbloquear' : 'Bloquear') +
          '</button>' +
          '<button class="btn btn-ghost" style="padding:8px 12px; font-size:12.5px;" onclick="adminResetDevices(\''+u.id+'\')">Restablecer dispositivos</button>' +
          '<button class="btn btn-ghost" style="padding:8px 12px; font-size:12.5px; color: var(--coral); border-color: var(--coral);" onclick="adminDeleteUser(\''+u.id+'\', \''+esc(u.email || '')+'\')">Eliminar cuenta</button>' +
        '</div>');
    return (
      '<div class="admin-card">' +
        '<div class="admin-user-row">' +
          '<div>' +
            '<div class="admin-card-title">'+esc(u.email || '(sin correo)')+'</div>' +
            '<div class="admin-card-meta">Registrado: '+formatDateTime(u.created_at)+'</div>' +
            '<div class="admin-user-badges">' +
              (u.is_admin ? '<span class="admin-badge admin">Administrador</span>' : '') +
              (pending ? '<span class="admin-badge pending">Pendiente</span>' : '') +
              blockedBadge +
              deviceBadge +
            '</div>' +
          '</div>' +
          (pending ? '' : limitControl) +
        '</div>' +
        pendingRow +
        manageRow +
        featureTogglesRow +
        '<div class="admin-status" id="adminStatus-deviceLimit-'+esc(u.id)+'"></div>' +
        '<div class="admin-status" id="adminStatus-manage-'+esc(u.id)+'"></div>' +
        '<div class="admin-status" id="adminStatus-features-'+esc(u.id)+'"></div>' +
        '<div class="admin-devices-toggle" role="button" tabindex="0" onclick="adminToggleDevices(\''+u.id+'\')">Ver dispositivos</div>' +
        '<div class="admin-devices-list" id="adminDevices-'+esc(u.id)+'" style="display:none;"></div>' +
      '</div>'
    );
  }).join('');
}
async function adminToggleBlocked(userId, currentlyBlocked){
  const nextBlocked = !currentlyBlocked;
  const statusEl = document.getElementById('adminStatus-manage-'+userId);
  if(nextBlocked && !await uiConfirm('¿Bloquear esta cuenta? No podrá iniciar sesión hasta que la desbloquees.')) return;
  if(statusEl) statusEl.textContent = 'Guardando…';
  const { error } = await sb.rpc('admin_set_blocked', { p_user_id: userId, p_blocked: nextBlocked });
  if(error){
    if(statusEl){ statusEl.textContent = 'No se pudo actualizar: ' + error.message; statusEl.className = 'admin-status err'; }
    return;
  }
  if(statusEl){ statusEl.textContent = ''; }
  await adminLoadUsers();
}
async function adminSetFeatureFlag(userId, featureKey, nextEnabled, switchEl){
  if(switchEl) switchEl.classList.toggle('on', nextEnabled); // respuesta visual inmediata
  const statusEl = document.getElementById('adminStatus-features-'+userId);
  if(statusEl){ statusEl.textContent = 'Guardando…'; statusEl.className = 'admin-status'; }
  const { error } = await sb.rpc('admin_set_feature_flag', { p_user_id: userId, p_feature: featureKey, p_enabled: nextEnabled });
  if(error){
    if(switchEl) switchEl.classList.toggle('on', !nextEnabled); // revertimos si falla
    if(statusEl){ statusEl.textContent = 'No se pudo actualizar: ' + error.message; statusEl.className = 'admin-status err'; }
    return;
  }
  if(statusEl) statusEl.textContent = '';
  const u = (adminData.users || []).find(x => x.id === userId);
  if(u){ u.feature_flags = Object.assign({}, u.feature_flags || {}, { [featureKey]: nextEnabled }); }
}
async function adminResetDevices(userId){
  if(!await uiConfirm('¿Borrar todos los dispositivos registrados de esta cuenta? La próxima vez que inicie sesión en cada uno, se volverán a registrar desde cero.')) return;
  const statusEl = document.getElementById('adminStatus-manage-'+userId);
  if(statusEl){ statusEl.textContent = 'Restableciendo…'; statusEl.className = 'admin-status'; }
  const { error } = await sb.rpc('admin_reset_user_devices', { p_user_id: userId });
  if(error){
    if(statusEl){ statusEl.textContent = 'No se pudo restablecer: ' + error.message; statusEl.className = 'admin-status err'; }
    return;
  }
  if(statusEl) statusEl.textContent = '';
  await adminLoadUsers();
}
async function adminDeleteUser(userId, email){
  const confirmText = email || 'esta cuenta';
  if(!await uiConfirm('¿Eliminar definitivamente ' + confirmText + '? Esta acción no se puede deshacer: se borrará la cuenta, su historial y sus dispositivos.')) return;
  const statusEl = document.getElementById('adminStatus-manage-'+userId);
  if(statusEl){ statusEl.textContent = 'Eliminando…'; statusEl.className = 'admin-status'; }
  const { data, error } = await sb.functions.invoke('admin-delete-user', { body: { user_id: userId } });
  if(error || (data && data.error)){
    const msg = (data && data.message) || (error && error.message) || 'Error desconocido.';
    if(statusEl){ statusEl.textContent = 'No se pudo eliminar: ' + msg; statusEl.className = 'admin-status err'; }
    return;
  }
  await adminLoadUsers();
}
function describeUserAgent(ua){
  if(!ua) return 'Dispositivo desconocido';
  let os = 'Dispositivo desconocido';
  if(/iPhone/i.test(ua)) os = 'iPhone';
  else if(/iPad/i.test(ua)) os = 'iPad';
  else if(/Android/i.test(ua)) os = 'Android';
  else if(/Macintosh|Mac OS X/i.test(ua)) os = 'Mac';
  else if(/Windows/i.test(ua)) os = 'Windows';
  else if(/Linux/i.test(ua)) os = 'Linux';
  let browser = '';
  if(/Edg\//i.test(ua)) browser = 'Edge';
  else if(/OPR\/|Opera/i.test(ua)) browser = 'Opera';
  else if(/CriOS|Chrome\//i.test(ua)) browser = 'Chrome';
  else if(/FxiOS|Firefox\//i.test(ua)) browser = 'Firefox';
  else if(/Safari\//i.test(ua) && !/Chrome/i.test(ua)) browser = 'Safari';
  return browser ? (os + ' · ' + browser) : os;
}
async function adminToggleDevices(userId){
  const box = document.getElementById('adminDevices-'+userId);
  if(!box) return;
  if(box.style.display !== 'none'){ box.style.display = 'none'; return; }
  box.style.display = 'block';
  box.innerHTML = '<div style="padding:10px 0;">' + skelList(2, false) + '</div>';
  const { data, error } = await sb.rpc('admin_list_user_devices', { target_user_id: userId });
  if(error){ box.innerHTML = '<div class="admin-empty" style="padding:10px 0;">No se pudo cargar los dispositivos.</div>'; console.error(error); return; }
  if(!data || !data.length){ box.innerHTML = '<div class="admin-empty" style="padding:10px 0;">Sin dispositivos registrados.</div>'; return; }
  const ips = data.map(d => d.ip_address).filter(Boolean);
  const uniqueIps = [...new Set(ips)];
  box.innerHTML = data.map(d => {
    const differs = d.ip_address && uniqueIps.length > 1;
    return (
      '<div class="admin-device-row'+(differs ? ' admin-device-warn' : '')+'">' +
        '<div>' +
          '<div class="admin-device-name">'+esc(describeUserAgent(d.user_agent))+'</div>' +
          '<div class="admin-card-meta">Primera vez: '+formatDateTime(d.first_seen)+' · Última vez: '+formatDateTime(d.last_seen)+'</div>' +
        '</div>' +
        (differs ? '<span class="admin-badge over">IP distinta</span>' : '') +
      '</div>'
    );
  }).join('') + (uniqueIps.length > 1
      ? '<div class="admin-card-meta" style="color:var(--coral); margin-top:6px;">Estos dispositivos se han conectado desde direcciones IP distintas. Revisa si todos son realmente suyos.</div>'
      : (uniqueIps.length === 1 ? '<div class="admin-card-meta" style="margin-top:6px;">Todos los dispositivos se han conectado desde la misma dirección IP.</div>' : ''));
}
async function adminApproveUser(userId){
  const { error } = await sb.rpc('admin_approve_user', { p_user_id: userId });
  if(error){ console.error(error); uiToast('No se pudo confirmar la cuenta: ' + error.message); return; }
  await adminLoadUsers();
  await refreshAdminPendingBadge();
}
async function adminLoadVerifications(){
  const el = document.getElementById('adminList-verifications');
  if(!el) return;
  const { data, error } = await sb.rpc('admin_list_pending_verifications');
  if(error){ el.innerHTML = '<div class="admin-empty">No se pudo cargar los códigos pendientes.</div>'; console.error(error); return; }
  adminData.verifications = data || [];
  adminRenderVerifications();
}
function adminRenderVerifications(){
  const el = document.getElementById('adminList-verifications');
  if(!el) return;
  if(!adminData.verifications || !adminData.verifications.length){
    el.innerHTML = '<div class="admin-empty">No hay nadie esperando un código ahora mismo.</div>';
    return;
  }
  el.innerHTML = adminData.verifications.map(v => {
    const secondsLeft = Math.max(0, Math.round((new Date(v.expires_at).getTime() - Date.now()) / 1000));
    return (
      '<div class="admin-card">' +
        '<div class="admin-user-row">' +
          '<div>' +
            '<div class="admin-card-title">'+esc(v.email || '(sin correo)')+'</div>' +
            '<div class="admin-card-meta">Pedido: '+formatDateTime(v.created_at)+' · Caduca en '+Math.max(1, Math.floor(secondsLeft/60))+' min</div>' +
            (v.attempts ? '<div class="admin-card-meta" style="color:var(--coral);">Intentos fallidos: '+esc(v.attempts)+'</div>' : '') +
          '</div>' +
          '<div style="font-size:28px; font-weight:800; letter-spacing:4px; font-family:monospace;">'+esc(v.code)+'</div>' +
        '</div>' +
      '</div>'
    );
  }).join('');
}
