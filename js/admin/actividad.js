/* Administración: actividad y tiempo conectado. */

/* ==================== ACTIVIDAD / TIEMPO CONECTADO ==================== */
/* Latido: mientras la app está abierta y visible, cada 30 s se avisa a
   Supabase (heartbeat_activity). El administrador ve con ello quién está
   conectado, desde qué hora y cuánto lleva. */
const ACTIVITY_HEARTBEAT_MS = 30000;
let activityHeartbeatTimer = null;
function sendActivityHeartbeat(){
  if(!currentUser || document.visibilityState === 'hidden') return;
  try{
    sb.rpc('heartbeat_activity', { p_device_id: getDeviceId() }).then(r => {
      if(r && r.error) console.warn('heartbeat_activity', r.error.message);
    }, () => {});
  }catch(e){}
}
function onActivityVisibility(){
  if(document.visibilityState === 'visible') sendActivityHeartbeat();
}
function startActivityHeartbeat(){
  stopActivityHeartbeat();
  sendActivityHeartbeat();
  activityHeartbeatTimer = setInterval(sendActivityHeartbeat, ACTIVITY_HEARTBEAT_MS);
  document.addEventListener('visibilitychange', onActivityVisibility);
}
function stopActivityHeartbeat(){
  if(activityHeartbeatTimer){ clearInterval(activityHeartbeatTimer); activityHeartbeatTimer = null; }
  document.removeEventListener('visibilitychange', onActivityVisibility);
}

/* Panel del administrador: se consulta cada 10 s y, entre consulta y
   consulta, los contadores de quien está conectado avanzan cada segundo. */
let activityPollTimer = null, activityTickTimer = null;
let activityRows = [], activityFetchedAt = 0, activityServerOffset = 0;
const activityHistoryOpen = {};

function fmtDuration(sec){
  sec = Math.max(0, Math.floor(sec || 0));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  if(h > 0) return h + ' h ' + String(m).padStart(2,'0') + ' min';
  if(m > 0) return m + ' min ' + String(s).padStart(2,'0') + ' s';
  return s + ' s';
}
function fmtClock(iso){
  if(!iso) return '—';
  return new Date(iso).toLocaleTimeString('es-ES', { hour:'2-digit', minute:'2-digit' });
}
function fmtAgo(iso){
  if(!iso) return 'nunca';
  const sec = (Date.now() + activityServerOffset - new Date(iso).getTime()) / 1000;
  if(sec < 60) return 'hace un momento';
  if(sec < 3600) return 'hace ' + Math.floor(sec/60) + ' min';
  if(sec < 86400) return 'hace ' + Math.floor(sec/3600) + ' h';
  return formatDateTime(iso);
}
function activityScreenVisible(){
  const sc = document.getElementById('screen-admin');
  const sec = document.getElementById('adminSection-activity');
  return !!(currentUserIsAdmin && sc && sc.classList.contains('active') && sec && sec.classList.contains('active'));
}
async function adminLoadActivity(){
  if(!activityScreenVisible()) return;
  const { data, error } = await sb.rpc('admin_list_activity');
  const info = document.getElementById('activityLiveInfo');
  const el = document.getElementById('adminList-activity');
  if(error){
    console.error(error);
    if(!activityRows.length) el.innerHTML = '<div class="admin-empty">No se pudo cargar la actividad.</div>';
    return;
  }
  activityRows = data || [];
  activityFetchedAt = Date.now();
  if(activityRows.length && activityRows[0].server_now){
    activityServerOffset = new Date(activityRows[0].server_now).getTime() - activityFetchedAt;
  }
  const online = activityRows.filter(r => r.is_online).length;
  if(info) info.textContent = online + ' conectado' + (online === 1 ? '' : 's') + ' ahora · actualizado a las ' + new Date().toLocaleTimeString('es-ES');
  renderActivity();
}
function renderActivity(){
  const el = document.getElementById('adminList-activity');
  if(!el) return;
  if(!activityRows.length){ el.innerHTML = '<div class="admin-empty">No hay usuarios todavía.</div>'; return; }
  el.innerHTML = activityRows.map(r => {
    const on = !!r.is_online;
    const badges = (r.is_admin ? '<span class="admin-badge admin">Admin</span>' : '') +
      (on ? '<span class="admin-badge" style="color:var(--teal); border-color:var(--teal);">Conectado</span>'
          : '<span class="admin-badge">Desconectado</span>');
    const statNow = on
      ? '<div class="activity-stat"><div class="activity-stat-label">Conectado desde</div><div class="activity-stat-value">' + fmtClock(r.current_started_at) + '</div></div>' +
        '<div class="activity-stat"><div class="activity-stat-label">Lleva conectado</div><div class="activity-stat-value" data-act-live="' + esc(r.user_id) + '">' + fmtDuration((Date.now() + activityServerOffset - new Date(r.current_started_at).getTime())/1000) + '</div></div>'
      : '<div class="activity-stat"><div class="activity-stat-label">Última conexión</div><div class="activity-stat-value">' + (r.last_seen ? fmtAgo(r.last_seen) : 'nunca') + '</div></div>';
    const statToday =
      '<div class="activity-stat"><div class="activity-stat-label">Primera hora hoy</div><div class="activity-stat-value">' + fmtClock(r.first_start_today) + '</div></div>' +
      '<div class="activity-stat"><div class="activity-stat-label">Tiempo total hoy</div><div class="activity-stat-value" data-act-today="' + esc(r.user_id) + '">' + fmtDuration(r.seconds_today) + '</div></div>' +
      '<div class="activity-stat"><div class="activity-stat-label">Sesiones hoy</div><div class="activity-stat-value">' + (r.sessions_today || 0) + '</div></div>';
    const open = !!activityHistoryOpen[r.user_id];
    return '<div class="admin-card">' +
      '<div class="admin-user-row"><div style="min-width:0;">' +
        '<div class="activity-name"><span class="activity-dot' + (on ? ' on' : '') + '"></span>' + esc(r.email || r.user_id) + '</div>' +
        '<div class="admin-user-badges">' + badges + '</div>' +
      '</div></div>' +
      '<div class="activity-stats">' + statNow + statToday + '</div>' +
      '<span class="admin-devices-toggle" onclick="toggleActivityHistory(\'' + r.user_id + '\')">' + (open ? 'Ocultar' : 'Ver') + ' últimas sesiones</span>' +
      '<div class="admin-devices-list" id="activityHistory-' + esc(r.user_id) + '" style="' + (open ? '' : 'display:none;') + '"></div>' +
    '</div>';
  }).join('');
  activityRows.forEach(r => { if(activityHistoryOpen[r.user_id]) loadActivityHistory(r.user_id); });
}
function tickActivity(){
  if(!activityScreenVisible()) return;
  const nowSrv = Date.now() + activityServerOffset;
  const sinceFetch = (Date.now() - activityFetchedAt) / 1000;
  activityRows.forEach(r => {
    if(!r.is_online) return;
    const live = document.querySelector('[data-act-live="' + r.user_id + '"]');
    if(live) live.textContent = fmtDuration((nowSrv - new Date(r.current_started_at).getTime()) / 1000);
    const today = document.querySelector('[data-act-today="' + r.user_id + '"]');
    if(today) today.textContent = fmtDuration((r.seconds_today || 0) + sinceFetch);
  });
}
async function loadActivityHistory(userId){
  const box = document.getElementById('activityHistory-' + userId);
  if(!box) return;
  const { data, error } = await sb.rpc('admin_list_user_activity', { p_user_id: userId, p_limit: 15 });
  if(error){ box.innerHTML = '<div class="admin-empty" style="padding:10px 0;">No se pudo cargar el historial.</div>'; console.error(error); return; }
  if(!data || !data.length){ box.innerHTML = '<div class="admin-empty" style="padding:10px 0;">Sin sesiones registradas.</div>'; return; }
  box.innerHTML = data.map(d =>
    '<div class="admin-device-row"><div>' +
      '<div class="admin-device-name">' + formatDateTime(d.started_at) + ' → ' + fmtClock(d.last_seen) + '</div>' +
      '<div class="admin-card-meta">' + esc(d.user_agent ? describeUserAgent(d.user_agent) : 'Dispositivo desconocido') + '</div>' +
    '</div><span class="admin-badge">' + fmtDuration(d.seconds) + '</span></div>'
  ).join('');
}
function toggleActivityHistory(userId){
  activityHistoryOpen[userId] = !activityHistoryOpen[userId];
  renderActivity();
}
function startActivityLive(){
  stopActivityLive();
  adminLoadActivity();
  activityPollTimer = setInterval(adminLoadActivity, 10000);
  activityTickTimer = setInterval(tickActivity, 1000);
}
function stopActivityLive(){
  if(activityPollTimer){ clearInterval(activityPollTimer); activityPollTimer = null; }
  if(activityTickTimer){ clearInterval(activityTickTimer); activityTickTimer = null; }
}
