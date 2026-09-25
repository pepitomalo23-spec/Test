/* App instalable: service worker (modo sin conexión), aviso de versión
   nueva, recordatorio diario por notificación y enlaces desde notificaciones. */

/* =====================================================================
   Modo sin conexión (service worker), aviso de versión nueva,
   recordatorio diario por notificación y enlaces desde notificaciones.
   ===================================================================== */
const VAPID_PUBLIC_KEY = 'BKdFYjINaQQTY1u_yBh2H6cvdy2oatVDKoQZwi3pMGiGrnn1Jaj9r9nKvV3zkAciPqEQDL-w4hiMJ-pS9y7s3Hw';
let updateToastShown = false;
if('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')){
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(e => console.warn('Service worker no registrado', e));
  });
  navigator.serviceWorker.addEventListener('message', e => {
    const msg = e.data || {};
    if(msg.type === 'update-available' && !updateToastShown){
      updateToastShown = true;
      uiToast('Hay una versión nueva de la app.', 'info', { action: 'Actualizar', duration: 0, onAction: () => location.reload() });
    }
    if(msg.type === 'open' && msg.url) handleDeepLink(msg.url);
  });
}

// Enlaces que abren las notificaciones: ?repaso=1 → Repaso diario,
// ?admin=errores → Administración › Errores.
function handleDeepLink(href){
  let url;
  try{ url = new URL(href, location.href); }catch(e){ return; }
  if(!currentUser) return;
  if(url.searchParams.get('repaso') && featureEnabled('normativas')){
    showScreen('screen-normativas');
    // Las tarjetas pueden estar aún cargando: se reintenta unos segundos.
    let tries = 0;
    const tryStart = () => {
      if(typeof NQ !== 'undefined' && NQ.startReview && NQ.startReview()) return;
      if(++tries < 12) setTimeout(tryStart, 500);
    };
    setTimeout(tryStart, 300);
  } else if(url.searchParams.get('admin') === 'errores' && currentUserIsAdmin){
    openAdminPanel().then(() => switchAdminTab('errors'));
  }
  if(url.search && url.href === location.href){
    try{ history.replaceState(null, '', location.pathname + location.hash); }catch(e){}
  }
}

function pushSupported(){ return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window; }
function isIOSDevice(){ return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); }
function isStandaloneApp(){ return (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true; }
function urlB64ToUint8(b64){
  const pad = '='.repeat((4 - b64.length % 4) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, c => c.charCodeAt(0));
}
async function getPushRegistration(){
  if(!pushSupported()) return null;
  return Promise.race([navigator.serviceWorker.ready, new Promise(r => setTimeout(() => r(null), 5000))]);
}
async function getPushSubscription(){
  const reg = await getPushRegistration();
  return reg ? reg.pushManager.getSubscription() : null;
}
async function currentReminderRow(){
  const sub = await getPushSubscription();
  if(!sub || !currentUser) return null;
  const { data } = await sb.from('push_subscriptions').select('remind_hour').eq('endpoint', sub.endpoint).maybeSingle();
  return data || null;
}
async function refreshReminderMenuState(){
  const el = document.getElementById('reminderMenuState');
  if(!el) return;
  try{
    const row = await currentReminderRow();
    el.textContent = row ? String(row.remind_hour).padStart(2, '0') + ':00' : 'No';
  }catch(e){ el.textContent = ''; }
}
async function enableReminder(hour){
  const perm = await Notification.requestPermission();
  if(perm !== 'granted') throw new Error('permiso');
  const reg = await getPushRegistration();
  if(!reg) throw new Error('sin-sw');
  let sub = await reg.pushManager.getSubscription();
  if(!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8(VAPID_PUBLIC_KEY) });
  const j = sub.toJSON();
  let tz = 'Europe/Madrid';
  try{ tz = Intl.DateTimeFormat().resolvedOptions().timeZone || tz; }catch(e){}
  const { error } = await sb.from('push_subscriptions').upsert({
    user_id: currentUser.id, endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth,
    remind_hour: hour, tz, user_agent: String(navigator.userAgent).slice(0, 300)
  }, { onConflict: 'endpoint' });
  if(error) throw error;
}
async function disableReminder(){
  const sub = await getPushSubscription();
  if(!sub) return;
  await sb.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
  try{ await sub.unsubscribe(); }catch(e){}
}
async function openReminderSheet(){
  const bg = document.createElement('div');
  bg.className = 'ui-confirm-bg';
  const close = () => { bg.remove(); document.removeEventListener('keydown', onKey, true); refreshReminderMenuState(); };
  const onKey = e => { if(e.key === 'Escape'){ e.preventDefault(); close(); } };
  document.addEventListener('keydown', onKey, true);
  bg.addEventListener('click', e => { if(e.target === bg) close(); });
  document.body.appendChild(bg);

  const render = async () => {
    let body = '', actions = '';
    const hourSelect = sel => '<select class="reminder-hour" id="reminderHour">' +
      Array.from({ length: 24 }, (_, h) => '<option value="' + h + '"' + (h === sel ? ' selected' : '') + '>' + String(h).padStart(2, '0') + ':00</option>').join('') + '</select>';
    if(!pushSupported() && isIOSDevice() && !isStandaloneApp()){
      body = '<p>En iPhone y iPad las notificaciones solo funcionan con la app instalada:</p>' +
        '<ol class="reminder-steps"><li>Pulsa el botón <b>Compartir</b> de Safari.</li><li>Elige <b>Añadir a pantalla de inicio</b>.</li><li>Abre la app desde el icono nuevo y vuelve aquí.</li></ol>';
      actions = '<button type="button" class="ui-confirm-ok" data-r="close">Entendido</button>';
    } else if(!pushSupported()){
      body = '<p>Este navegador no admite notificaciones. Prueba con Chrome, Edge, Firefox o Safari actualizados.</p>';
      actions = '<button type="button" class="ui-confirm-ok" data-r="close">Entendido</button>';
    } else if(Notification.permission === 'denied'){
      body = '<p>Tienes las notificaciones bloqueadas para esta app. Actívalas en los ajustes del navegador (o del móvil, en Notificaciones) y vuelve a intentarlo.</p>';
      actions = '<button type="button" class="ui-confirm-ok" data-r="close">Entendido</button>';
    } else {
      let row = null;
      try{ row = await currentReminderRow(); }catch(e){}
      if(row){
        body = '<p>Activado en este dispositivo. Te avisaremos cada día a la hora elegida' + (currentUserIsAdmin ? ', y como admin también cuando haya errores nuevos en la app' : '') + '.</p>' +
          '<label class="reminder-row"><span>Hora del aviso</span>' + hourSelect(row.remind_hour) + '</label>';
        actions = '<button type="button" class="ui-confirm-cancel" data-r="off">Desactivar</button><button type="button" class="ui-confirm-ok" data-r="save">Guardar</button>';
        body += '<button type="button" class="reminder-test" data-r="test">Enviar una notificación de prueba</button>';
      } else {
        body = '<p>Recibe cada día un aviso con las tarjetas que te tocan repasar' + (currentUserIsAdmin ? ' (y, como admin, cuando haya errores nuevos en la app)' : '') + '.</p>' +
          '<label class="reminder-row"><span>Hora del aviso</span>' + hourSelect(19) + '</label>';
        actions = '<button type="button" class="ui-confirm-cancel" data-r="close">Ahora no</button><button type="button" class="ui-confirm-ok" data-r="on">Activar</button>';
      }
    }
    bg.innerHTML = '<div class="ui-confirm" role="dialog" aria-modal="true" aria-label="Recordatorio diario"><h3>🔔 Recordatorio diario</h3>' + body +
      '<div class="ui-confirm-actions">' + actions + '</div></div>';
  };
  bg.addEventListener('click', async e => {
    const b = e.target.closest('[data-r]');
    if(!b) return;
    const r = b.dataset.r;
    const hourEl = bg.querySelector('#reminderHour');
    const hour = hourEl ? +hourEl.value : 19;
    if(r === 'close'){ close(); return; }
    b.disabled = true;
    try{
      if(r === 'on' || r === 'save'){
        await enableReminder(hour);
        uiToast(r === 'on' ? 'Recordatorio activado a las ' + String(hour).padStart(2, '0') + ':00' : 'Hora guardada', 'success');
        close();
      } else if(r === 'off'){
        await disableReminder();
        uiToast('Recordatorio desactivado', 'success');
        close();
      } else if(r === 'test'){
        const { data, error } = await sb.functions.invoke('push-reminders', { body: { test: true } });
        if(error || !data || !data.sent) throw new Error('prueba');
        uiToast('Notificación de prueba enviada', 'success');
        b.disabled = false;
      }
    }catch(err){
      b.disabled = false;
      if(err && err.message === 'permiso'){ uiToast('Sin permiso para enviar notificaciones. Acepta el aviso del navegador para activarlo.', 'error'); await render(); }
      else { uiToast('No se ha podido completar. Inténtalo de nuevo en un momento.', 'error'); reportClientError('recordatorio', 'Fallo en el recordatorio (' + r + '): ' + (err && (err.message || err))); }
    }
  });
  await render();
}
