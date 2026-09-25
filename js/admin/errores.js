/* Administración: errores, avisos pendientes e intentos de acceso. */

/* ---------- Administración → Errores ---------- */
function timeAgoShort(iso){
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if(s < 60) return 'hace un momento';
  if(s < 3600) return 'hace ' + Math.round(s / 60) + ' min';
  if(s < 86400) return 'hace ' + Math.round(s / 3600) + ' h';
  return 'hace ' + Math.round(s / 86400) + ' d';
}
function shortUA(ua){
  ua = ua || '';
  const dev = /iPad/.test(ua) ? 'iPad' : /iPhone/.test(ua) ? 'iPhone' : /Android/.test(ua) ? 'Android' : /Mac/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : 'Otro';
  const br = /CriOS|Chrome/.test(ua) && !/Edg/.test(ua) ? 'Chrome' : /Edg/.test(ua) ? 'Edge' : /Firefox|FxiOS/.test(ua) ? 'Firefox' : /Safari/.test(ua) ? 'Safari' : '';
  return dev + (br ? ' · ' + br : '');
}
async function adminLoadErrors(){
  const el = document.getElementById('adminList-errors');
  if(!el) return;
  el.innerHTML = skelList(4);
  const { data, error } = await sb.from('client_errors').select('*').order('created_at', { ascending: false }).limit(150);
  if(error){ el.innerHTML = '<div class="admin-empty">No se pudieron cargar los errores: ' + escapeHtml(error.message) + '</div>'; return; }
  if(!data || !data.length){ el.innerHTML = '<div class="admin-empty">Ningún error registrado. ¡Todo en orden! ✨</div>'; return; }
  el.innerHTML = data.map(r =>
    '<div class="admin-card err-card' + (r.seen ? '' : ' unseen') + '">' +
      '<div class="err-head"><span class="admin-badge' + (r.kind === 'atasco' ? ' over' : '') + '">' + escapeHtml(r.kind) + '</span>' +
        (r.seen ? '' : '<span class="err-new">Nuevo</span>') +
        '<span class="err-meta">' + timeAgoShort(r.created_at) + ' · ' + escapeHtml(r.email || 'sin sesión') + ' · ' + escapeHtml(shortUA(r.user_agent)) + (r.url ? ' · ' + escapeHtml(r.url) : '') + '</span></div>' +
      '<div class="err-msg">' + escapeHtml(r.message) + '</div>' +
      (r.stack ? '<details class="err-stack"><summary>Detalles técnicos</summary><pre>' + escapeHtml(r.stack) + '</pre></details>' : '') +
    '</div>'
  ).join('');
}
async function adminMarkErrorsSeen(){
  const { error } = await sb.from('client_errors').update({ seen: true }).eq('seen', false);
  if(error){ uiToast('No se pudieron marcar: ' + error.message, 'error'); return; }
  uiToast('Errores marcados como vistos', 'success');
  adminLoadErrors();
  refreshAdminPendingBadge();
}
async function adminDeleteSeenErrors(){
  if(!await uiConfirm('¿Borrar los errores ya vistos?\n\nLos nuevos (sin ver) se conservan.')) return;
  const { error } = await sb.from('client_errors').delete().eq('seen', true);
  if(error){ uiToast('No se pudieron borrar: ' + error.message, 'error'); return; }
  uiToast('Errores vistos borrados', 'success');
  adminLoadErrors();
}

async function refreshAdminPendingBadge(){
  if(!currentUserIsAdmin) return;
  const { data, error } = await sb.rpc('admin_list_users');
  if(error){ console.error(error); return; }
  adminData.users = data || [];
  const pendingApprovals = adminData.users.filter(u => !u.is_admin && !u.approved).length;

  let pendingCodes = 0;
  try{
    const vres = await sb.rpc('admin_list_pending_verifications');
    if(!vres.error){
      adminData.verifications = vres.data || [];
      pendingCodes = adminData.verifications.length;
    }
  }catch(e){ /* un fallo aquí no debe romper el resto del indicador */ }

  let unseenErrors = 0;
  try{
    const eres = await sb.from('client_errors').select('id', { count: 'exact', head: true }).eq('seen', false);
    if(!eres.error) unseenErrors = eres.count || 0;
  }catch(e){}
  const errCountEl = document.getElementById('adminErrorsCount');
  if(errCountEl){
    errCountEl.textContent = unseenErrors > 99 ? '99+' : String(unseenErrors);
    errCountEl.classList.toggle('hidden', unseenErrors === 0);
  }

  const pendingCount = pendingApprovals + pendingCodes + unseenErrors;

  const dot = document.getElementById('headerPendingDot');
  if(dot){
    dot.textContent = pendingCount > 9 ? '9+' : String(pendingCount);
    dot.classList.toggle('hidden', pendingCount === 0);
  }
  const countEl = document.getElementById('headerAdminPendingCount');
  if(countEl){
    countEl.textContent = pendingCount > 9 ? '9+' : String(pendingCount);
    countEl.classList.toggle('hidden', pendingCount === 0);
  }
  // Si el panel de usuarios ya está en pantalla, lo refrescamos también.
  const usersSection = document.getElementById('adminSection-users');
  if(usersSection && usersSection.classList.contains('active')){
    adminRenderUsers();
    adminRenderVerifications();
  }
}
async function adminSaveDeviceLimit(userId){
  const input = document.getElementById('deviceLimit-'+userId);
  const statusEl = document.getElementById('adminStatus-deviceLimit-'+userId);
  const limit = parseInt(input.value, 10);
  if(!limit || limit < 1){
    statusEl.textContent = 'Introduce un número válido (mínimo 1).';
    statusEl.className = 'admin-status err';
    return;
  }
  const { error } = await sb.rpc('admin_set_device_limit', { p_user_id: userId, p_limit: limit });
  if(error){
    statusEl.textContent = 'No se pudo guardar: ' + error.message;
    statusEl.className = 'admin-status err';
    return;
  }
  statusEl.textContent = 'Límite actualizado.';
  statusEl.className = 'admin-status ok';
  await adminLoadUsers();
}
async function adminLoadLoginAttempts(){
  const el = document.getElementById('adminList-loginAttempts');
  el.innerHTML = skelList(4);
  const { data, error } = await sb.from('login_attempts').select('*').order('created_at', { ascending:false }).limit(200);
  if(error){ el.innerHTML = '<div class="admin-empty">No se pudieron cargar los intentos de acceso.</div>'; console.error(error); return; }
  adminData.loginAttempts = data || [];
  adminRenderLoginAttempts();
}
function adminRenderLoginAttempts(){
  const el = document.getElementById('adminList-loginAttempts');
  if(!adminData.loginAttempts || !adminData.loginAttempts.length){ el.innerHTML = '<div class="admin-empty">Todavía no hay intentos de acceso registrados.</div>'; return; }
  el.innerHTML = adminData.loginAttempts.map(a => {
    const okClass = a.success ? 'admin-attempt-ok' : 'admin-attempt-fail';
    const label = a.success ? 'Correcto' : 'Fallido';
    return (
      '<div class="admin-card">' +
        '<div class="admin-attempt-row">' +
          '<div>' +
            '<div class="admin-card-title">'+esc(a.email || '(desconocido)')+' — <span class="'+okClass+'">'+label+'</span></div>' +
            '<div class="admin-card-meta">'+formatDateTime(a.created_at)+'</div>' +
            '<div class="admin-card-meta">Dispositivo: '+esc(a.device_id || '—')+'</div>' +
            '<div class="admin-card-meta">'+esc(a.user_agent || '')+'</div>' +
            (a.error_message ? '<div class="admin-card-meta">Motivo: '+esc(a.error_message)+'</div>' : '') +
          '</div>' +
        '</div>' +
      '</div>'
    );
  }).join('');
}
