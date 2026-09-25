/* Inicio de sesión, registro, entrada en la app y menú de la cuenta. */

// Marca fiable de "esto es un login que el usuario acaba de pedir de verdad"
// (pulsar Iniciar sesión / Crear cuenta / enlace mágico), independiente de
// qué eventos dispare internamente la librería de Supabase al restaurar una
// sesión guardada (que en la práctica no siempre se distinguen de un login
// real con el nombre del evento). Solo si esta marca está presente y es
// reciente (menos de 5 min) se pedirá el código de verificación.
function markFreshLoginIntent(){
  try{ localStorage.setItem('pjfire_fresh_login_at', String(Date.now())); }catch(e){}
}
function consumeFreshLoginIntent(){
  try{
    const t = localStorage.getItem('pjfire_fresh_login_at');
    if(!t) return false;
    localStorage.removeItem('pjfire_fresh_login_at');
    return (Date.now() - Number(t)) < 5*60*1000;
  }catch(e){ return false; }
}

/* ==================== AUTH ==================== */
function setAuthBusy(busy){
  ['authLoginBtn','authSignupBtn','authMagicBtn'].forEach(id => {
    const b = document.getElementById(id);
    if(b) b.disabled = busy;
  });
}
function showAuthError(msg){
  const el = document.getElementById('authError');
  if(el) el.textContent = msg || '';
}
function showAuthStatus(msg){
  const el = document.getElementById('authStatus');
  if(el) el.textContent = msg || '';
}
function getAuthFields(){
  return {
    email: (document.getElementById('authEmail').value || '').trim(),
    password: document.getElementById('authPassword').value || ''
  };
}
async function handleLogin(){
  const { email, password } = getAuthFields();
  showAuthError(''); showAuthStatus('');
  if(!email || !password){ showAuthError('Introduce tu correo y contraseña.'); return; }
  setAuthBusy(true);
  markFreshLoginIntent();
  const { error } = await sb.auth.signInWithPassword({ email, password });
  setAuthBusy(false);
  if(error){
    showAuthError(error.message);
    await logLoginAttempt(email, false, error.message, null);
  }
}
// Evita que se puedan disparar varios registros seguidos para el mismo
// correo: cada nuevo registro genera un enlace de confirmación nuevo que
// invalida el anterior, así que si el usuario pulsa "Crear cuenta" varias
// veces (por ejemplo, porque no ve respuesta inmediata) puede terminar
// haciendo clic en un enlace de un correo antiguo ya inválido.
let signupCooldownUntil = 0;
function formatCooldownMsg(seconds){
  const s = Math.max(1, Math.ceil(seconds));
  return 'Ya te hemos enviado un correo de confirmación. Espera ' + s + ' segundo' + (s === 1 ? '' : 's') + ' antes de volver a intentarlo, y usa el enlace del ÚLTIMO correo que recibas (los anteriores dejan de funcionar).';
}
async function handleSignup(){
  const { email, password } = getAuthFields();
  showAuthError(''); showAuthStatus('');
  if(!email || !password){ showAuthError('Introduce tu correo y contraseña.'); return; }
  if(password.length < 6){ showAuthError('La contraseña debe tener al menos 6 caracteres.'); return; }
  const remaining = (signupCooldownUntil - Date.now()) / 1000;
  if(remaining > 0){ showAuthError(formatCooldownMsg(remaining)); return; }
  setAuthBusy(true);
  markFreshLoginIntent();
  const { data, error } = await sb.auth.signUp({ email, password, options: { emailRedirectTo: window.location.href } });
  setAuthBusy(false);
  if(error){
    // Supabase limita el envío de correos de confirmación; en vez de mostrar
    // el mensaje en inglés, damos una explicación clara en español y
    // bloqueamos el botón durante ese tiempo para que no se pueda reintentar.
    const match = /after (\d+) seconds?/i.exec(error.message || '');
    if(error.status === 429 || /rate limit/i.test(error.message || '')){
      const waitSeconds = match ? parseInt(match[1], 10) : 60;
      signupCooldownUntil = Date.now() + waitSeconds * 1000;
      showAuthError(formatCooldownMsg(waitSeconds));
      return;
    }
    showAuthError(error.message);
    return;
  }
  if(!data.session){
    // Cada envío exitoso invalida el enlace de confirmación anterior, así
    // que fijamos también aquí un margen mínimo antes de permitir reenviar.
    signupCooldownUntil = Date.now() + 30000;
    showAuthStatus('Cuenta creada. Revisa tu correo y haz clic en el enlace del ÚLTIMO mensaje de confirmación que recibas (si pides el registro más de una vez, los enlaces anteriores dejan de funcionar). Después, un administrador debe confirmarla antes de que puedas iniciar sesión.');
  }
}
async function handleMagicLink(){
  const email = (document.getElementById('authEmail').value || '').trim();
  showAuthError(''); showAuthStatus('');
  if(!email){ showAuthError('Introduce tu correo para enviarte el enlace.'); return; }
  setAuthBusy(true);
  markFreshLoginIntent();
  const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.href } });
  setAuthBusy(false);
  if(error){ showAuthError(error.message); return; }
  showAuthStatus('Te hemos enviado un enlace mágico a ' + email + '. Ábrelo para iniciar sesión.');
}
async function handleLogout(){
  // Este dispositivo deja de recibir los recordatorios de esta cuenta.
  try{
    const sub = await getPushSubscription();
    if(sub){
      await sb.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
      await sub.unsubscribe();
    }
  }catch(e){}
  await sb.auth.signOut();
}

async function onLoggedIn(user, isFreshSignIn){
  currentUser = user;

  // Si había un test a medias guardado localmente (p. ej. se cerró la
  // app, se apagó el móvil o se perdió la sesión con el test empezado),
  // lo recuperamos aquí en memoria. No cambia de pantalla por sí solo:
  // simplemente hace que la tarjeta correspondiente en inicio aparezca
  // como "en curso" con su botón "Reanudar", igual que si nunca se
  // hubiera cerrado la app.
  restoreQuizProgress();

  // Cargamos el perfil primero para saber si la cuenta ya está
  // aprobada por un administrador (sustituye a la confirmación por
  // correo electrónico).
  let { data: profile } = await sb.from('profiles').select('*').eq('id', user.id).maybeSingle();
  if(!profile){
    const { data: created } = await sb.from('profiles').insert({ id: user.id }).select().maybeSingle();
    profile = created;
  }
  currentUserIsAdmin = !!(profile && profile.is_admin);
  myFeatureFlags = (profile && profile.feature_flags) || {};
  applyFeatureVisibility();
  startPermissionsWatch();
  // Los temas de Normativas dependen de la sesión (RLS) y de si es admin.
  if(typeof NQ !== 'undefined') NQ.load();

  if(!currentUserIsAdmin && !(profile && profile.approved)){
    currentUser = null;
    await sb.auth.signOut();
    showAuthError('Tu cuenta está pendiente de confirmación por un administrador. Vuelve a intentarlo cuando te avisen.');
    return;
  }

  if(!currentUserIsAdmin && profile && profile.blocked){
    currentUser = null;
    await sb.auth.signOut();
    showAuthError('Tu cuenta ha sido bloqueada por un administrador. Contacta con el administrador si crees que es un error.');
    return;
  }

  // Comprobar el límite de dispositivos antes de dar acceso a la app.
  const deviceId = getDeviceId();
  let deviceCheck = null, deviceCheckError = null;
  try{
    const res = await sb.rpc('register_device_and_check_limit', {
      p_device_id: deviceId,
      p_user_agent: navigator.userAgent
    });
    deviceCheck = res.data; deviceCheckError = res.error;
  }catch(e){ deviceCheckError = e; }

  const blocked = !!deviceCheckError || !deviceCheck || deviceCheck.allowed === false;
  // No se espera esta llamada: es solo un registro de auditoría y no debe
  // retrasar la entrada del alumno a la app (antes bloqueaba con await).
  logLoginAttempt(
    user.email,
    !blocked,
    blocked ? ((deviceCheck && deviceCheck.reason) || (deviceCheckError && deviceCheckError.message) || 'device_check_failed') : null,
    user.id
  );

  if(blocked){
    currentUser = null;
    await sb.auth.signOut();
    const reason = (deviceCheck && deviceCheck.reason) || (deviceCheckError && (deviceCheckError.message || deviceCheckError.code)) || 'unknown';
    if(reason === 'device_limit_reached'){
      showAuthError('Has alcanzado el número máximo de dispositivos permitidos para esta cuenta. Cierra sesión en otro dispositivo o contacta con el administrador para ampliar el límite.');
    } else {
      showAuthError('No se ha podido verificar el dispositivo (motivo: ' + reason + '). Vuelve a intentarlo; si persiste, contacta con el administrador.');
    }
    return;
  }

  // Verificación por código: "isFreshSignIn" viene de una marca propia
  // (markFreshLoginIntent/consumeFreshLoginIntent) puesta justo al pulsar
  // Iniciar sesión / Crear cuenta / enlace mágico, en vez de fiarnos del
  // nombre del evento que dispare la librería de Supabase (en la práctica
  // no siempre distingue de forma fiable un login real de una simple
  // restauración de sesión guardada). Si la app solo restaura una sesión ya
  // abierta (recargar, cerrar y volver a abrir la pestaña…) no se pide
  // nada, hasta que se cierre sesión o se inicie sesión de nuevo. Los
  // administradores quedan exentos (son
  // quienes deben ver y transmitir el código; si solo hay uno, exigírselo
  // a sí mismo le dejaría fuera sin nadie que pudiera dárselo).
  if(!currentUserIsAdmin && isFreshSignIn){
    let verifyId = null, verifyError = null;
    try{
      const vres = await sb.rpc('request_login_verification', {
        p_device_id: deviceId,
        p_user_agent: navigator.userAgent
      });
      verifyId = vres.data; verifyError = vres.error;
    }catch(e){ verifyError = e; }

    if(verifyError || !verifyId){
      currentUser = null;
      await sb.auth.signOut();
      showAuthError('No se ha podido iniciar la verificación de acceso. Inténtalo de nuevo o contacta con el administrador.');
      return;
    }

    const verified = await waitForLoginCodeVerification(verifyId);
    if(!verified){
      currentUser = null;
      await sb.auth.signOut();
      return; // el motivo (cancelado, código agotado, etc.) ya se ha mostrado
    }
  }

  document.getElementById('authOverlay').classList.add('hidden');
  startActivityHeartbeat();
  const emailEl = document.getElementById('headerUserEmail');
  if(emailEl) emailEl.textContent = user.email || '';

  // Se ve la pantalla de Inicio antes de que lleguen los datos (para no
  // esperar con una pantalla en blanco), así que mientras se cargan se
  // muestra un estado de "Cargando…" en vez de dejar el texto de la
  // sesión anterior (o el placeholder final) congelado en pantalla.
  const fallosLabelEl = document.getElementById('fallosPendingLabel');
  if(fallosLabelEl) fallosLabelEl.innerHTML = SKEL_INLINE;
  const smartLabelEl = document.getElementById('smartPendingLabel');
  if(smartLabelEl) smartLabelEl.innerHTML = SKEL_INLINE;
  const historyListEl = document.getElementById('historyList');
  if(historyListEl) historyListEl.innerHTML = '<div id="historyLoadingPlaceholder">' + skelList(3) + '</div>';

  const adminBtn = document.getElementById('headerAdminBtn');
  if(adminBtn) adminBtn.classList.toggle('hidden', !currentUserIsAdmin);
  if(currentUserIsAdmin){
    refreshAdminPendingBadge();
    if(adminPollInterval) clearInterval(adminPollInterval);
    // Sondeo cada pocos segundos para que el admin vea enseguida el
    // código en cuanto alguien intenta iniciar sesión, esté o no con el
    // panel abierto.
    adminPollInterval = setInterval(refreshAdminPendingBadge, 6000);
  }

  // loadHistory() no depende de nada que calcule loadAppData() (solo de
  // currentUser), así que se lanzan en paralelo en vez de uno detrás de
  // otro: eso ahorra un viaje de ida y vuelta completo a Supabase en cada
  // entrada. refreshGlobalStats() sí depende de QUESTIONS_POOL (que llena
  // loadAppData()) para pintar en pantalla, pero su propia consulta a
  // test_sessions no depende de nada de eso, así que se lanza ya mismo
  // (en paralelo con lo anterior) y se le pasa lista a refreshGlobalStats().
  // Se entra ya en la app (con esqueletos de carga) sin esperar a las
  // preguntas, el historial y las estadísticas: antes la pantalla de carga
  // esperaba a todo eso y con datos móviles podía pasar de 12 s.
  const lastScreen = getLastScreen();
  if(lastScreen === 'screen-admin' && currentUserIsAdmin){
    openAdminPanel(); // carga sus datos por detrás
  } else {
    showScreen(lastScreen);
  }
  // showScreen() pinta el historial con lo que haya (aún nada): se vuelve
  // a dejar el esqueleto hasta que lleguen los datos.
  if(historyListEl) historyListEl.innerHTML = '<div id="historyLoadingPlaceholder">' + skelList(3) + '</div>';
  if(fallosLabelEl) fallosLabelEl.innerHTML = SKEL_INLINE;
  if(smartLabelEl) smartLabelEl.innerHTML = SKEL_INLINE;
  finishSplash();
  handleDeepLink(location.href);

  const globalStatsSessionsPromise = sb.from('test_sessions').select('score, total, created_at').eq('user_id', currentUser.id);
  let startupDone = false;
  const startupWatch = setTimeout(() => {
    if(!startupDone) reportClientError('atasco', 'Los datos de Inicio (preguntas/historial) seguían sin cargar 20 s después de entrar.');
  }, 20000);
  appDataReady = false;
  appDataPromise = Promise.all([loadAppData(), loadHistory()]);
  try{ await appDataPromise; }
  finally{ appDataReady = true; }
  startupDone = true;
  clearTimeout(startupWatch);
  flushPendingResults();
  if(typeof NQ !== 'undefined'){ try{ NQ.seedFailed(); NQ.render(); }catch(e){} }
  await refreshGlobalStats(globalStatsSessionsPromise);
  // Si ya se estaba en Estadísticas, se vuelve a pintar con los datos reales.
  const active = document.querySelector('.screen.active');
  if(active && active.id === 'screen-stats') showScreen('screen-stats');
}

/* Mientras llegan las preguntas (justo al entrar), los modos de test
   esperan a que terminen en vez de abrirse vacíos. */
let appDataReady = false;
let appDataPromise = Promise.resolve();
function whenAppDataReady(fn){
  if(appDataReady) return false;
  uiToast('Un momento, cargando las preguntas…', 'info', { duration: 2500 });
  appDataPromise.then(fn, fn);
  return true;
}
function waitForLoginCodeVerification(verifyId){
  return new Promise(resolve => {
    const overlay = document.getElementById('verifyOverlay');
    const input = document.getElementById('verifyCodeInput');
    const errorEl = document.getElementById('verifyError');
    const submitBtn = document.getElementById('verifySubmitBtn');
    const cancelBtn = document.getElementById('verifyCancelBtn');
    if(!overlay || !input || !submitBtn || !cancelBtn){ resolve(false); return; }

    let settled = false;
    input.value = '';
    if(errorEl) errorEl.textContent = '';
    overlay.classList.remove('hidden');
    setTimeout(() => input.focus(), 50);

    function setBusy(busy){
      submitBtn.disabled = busy;
      cancelBtn.disabled = busy;
      input.disabled = busy;
    }
    function finish(result, message){
      if(settled) return;
      settled = true;
      submitBtn.onclick = null;
      cancelBtn.onclick = null;
      input.onkeydown = null;
      overlay.classList.add('hidden');
      if(!result && message) showAuthError(message);
      resolve(result);
    }
    async function onSubmit(){
      const code = (input.value || '').trim();
      if(!/^[0-9]{6}$/.test(code)){
        if(errorEl) errorEl.textContent = 'Introduce el código de 6 dígitos que te ha dado el administrador.';
        return;
      }
      setBusy(true);
      let data = null, error = null;
      try{
        const r = await sb.rpc('verify_login_code', { p_verification_id: verifyId, p_code: code });
        data = r.data; error = r.error;
      }catch(e){ error = e; }
      setBusy(false);
      if(error || !data){
        if(errorEl) errorEl.textContent = 'No se ha podido comprobar el código. Inténtalo de nuevo.';
        return;
      }
      if(data.allowed){ finish(true); return; }
      const reasons = {
        invalid_code: 'Código incorrecto' + (data.remaining_attempts != null ? ' (te quedan ' + data.remaining_attempts + ' intentos)' : '') + '.',
        expired: 'El código ha caducado. Vuelve a iniciar sesión para pedir uno nuevo.',
        too_many_attempts: 'Has agotado los intentos. Vuelve a iniciar sesión para pedir un código nuevo.',
        not_found: 'No se encuentra la verificación. Vuelve a iniciar sesión.'
      };
      if(errorEl) errorEl.textContent = reasons[data.reason] || ('No se ha podido verificar (' + (data.reason || 'motivo desconocido') + ').');
      if(data.reason === 'expired' || data.reason === 'too_many_attempts'){
        finish(false, reasons[data.reason]);
      }
    }
    submitBtn.onclick = onSubmit;
    cancelBtn.onclick = () => finish(false, 'Inicio de sesión cancelado: no se introdujo el código de verificación.');
    input.onkeydown = (e) => { if(e.key === 'Enter') onSubmit(); };
  });
}
function onLoggedOut(){
  stopActivityHeartbeat();
  if(permsCheckTimer){ clearInterval(permsCheckTimer); permsCheckTimer = null; }
  myFeatureFlags = {};
  stopActivityLive();
  currentUser = null;
  currentUserIsAdmin = false;
  if(adminPollInterval){ clearInterval(adminPollInterval); adminPollInterval = null; }
  const adminBtn = document.getElementById('headerAdminBtn');
  if(adminBtn) adminBtn.classList.add('hidden');
  const dot = document.getElementById('headerPendingDot');
  if(dot) dot.classList.add('hidden');
  const countEl = document.getElementById('headerAdminPendingCount');
  if(countEl) countEl.classList.add('hidden');
  HISTORY = [];
  SMART_HISTORY = [];
  TOPICS = [];
  QUESTIONS_POOL = [];
  quizState = { mode:null, index:0, correctCount:0, answered:false };
  quizSecondsLeft = null;
  renderHistory();
  renderSmartHistory();
  document.getElementById('authOverlay').classList.remove('hidden');
  // Los datos guardados para usar sin conexión eran de esta cuenta: fuera.
  try{ if(navigator.serviceWorker && navigator.serviceWorker.controller) navigator.serviceWorker.controller.postMessage({ type: 'clear-data' }); }catch(e){}
  finishSplash();
  showAuthError(''); showAuthStatus('');
  const emailEl = document.getElementById('headerUserEmail');
  if(emailEl) emailEl.textContent = '';
  closeUserMenu();
}
function toggleUserMenu(){
  const overlay = document.getElementById('profileSheetOverlay');
  if(overlay) overlay.classList.toggle('show');
  syncThemeSwitch();
  refreshReminderMenuState();
}
function closeUserMenu(){
  const overlay = document.getElementById('profileSheetOverlay');
  if(overlay) overlay.classList.remove('show');
}
