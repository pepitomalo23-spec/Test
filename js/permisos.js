/* Permisos por función de cada usuario (feature_flags). */

/* ---------- Permisos por función (control individual por usuario) ----------
   El administrador puede activar/desactivar, para cada usuario concreto,
   el acceso a ciertas funciones de la app. Si una clave no está presente
   en feature_flags para ese usuario, se trata como ACTIVADA (para no
   quitarle a nadie algo que ya venía usando el día que se despliega esto).
   El administrador siempre ve todo, tenga lo que tenga en su propio
   feature_flags. */
const FEATURES = {
  normativas: 'Normativas (y Repaso diario)',
  estadisticas: 'Estadísticas',
  stats_avanzadas: 'Estadísticas avanzadas',
  historial: 'Historial',
  fallos: 'Fallos',
  inteligente: 'Test Inteligente',
  simulacro: 'Simulacro',
  examen: 'Examen',
  notas_ia: 'Notas y explicaciones con IA',
  boe: 'Cambios BOE'
};
// Pantallas que dependen de una función: si está desactivada, se va a Inicio.
const SCREEN_FEATURE = {
  'screen-normativas': 'normativas',
  'screen-stats': 'estadisticas',
  'screen-articulo-preguntas': 'estadisticas',
  'screen-streak-full': 'estadisticas',
  'screen-my-additions': 'notas_ia',
  'screen-my-addition-detail': 'notas_ia',
  'screen-notas-todas': 'notas_ia',
  'screen-boe-cambios': 'boe',
  'screen-boe-detalle': 'boe',
  'screen-historial-todo': 'historial',
  'screen-fallos': 'fallos',
  'screen-inteligente': 'inteligente'
};
let myFeatureFlags = {};
function featureEnabled(key){
  if(currentUserIsAdmin) return true;
  return myFeatureFlags[key] !== false;
}
function applyFeatureVisibility(){
  const navNormativas = document.getElementById('navNormativas');
  if(navNormativas) navNormativas.classList.toggle('hidden', !featureEnabled('normativas'));

  const modeCardInteligente = document.getElementById('modeCardInteligente');
  if(modeCardInteligente) modeCardInteligente.classList.toggle('hidden', !featureEnabled('inteligente'));

  const headerMyAdditionsBtn = document.getElementById('headerMyAdditionsBtn');
  if(headerMyAdditionsBtn) headerMyAdditionsBtn.classList.toggle('hidden', !featureEnabled('notas_ia'));

  const statsAdvancedWrap = document.getElementById('statsAdvancedWrap');
  if(statsAdvancedWrap) statsAdvancedWrap.classList.toggle('hidden', !featureEnabled('stats_avanzadas'));

  const historySection = document.getElementById('historySection');
  if(historySection) historySection.classList.toggle('hidden', !featureEnabled('historial'));

  const toggleId = (id, key) => { const el = document.getElementById(id); if(el) el.classList.toggle('hidden', !featureEnabled(key)); };
  toggleId('navStats', 'estadisticas');
  toggleId('modeCardFallos', 'fallos');
  toggleId('modeCardSimulacro', 'simulacro');
  toggleId('modeCardExamen', 'examen');
  toggleId('headerBoeBtn', 'boe');
  // Separadores de la barra de navegación: solo entre elementos visibles.
  const nav = document.querySelector('.header-nav');
  if(nav){
    const kids = [...nav.children];
    kids.forEach((el, i) => {
      if(!el.classList.contains('nav-dot')) return;
      const prevVisible = kids.slice(0, i).some(k => !k.classList.contains('nav-dot') && !k.classList.contains('hidden'));
      const nextVisible = kids.slice(i + 1).some(k => !k.classList.contains('nav-dot') && !k.classList.contains('hidden'));
      const nextItem = kids.slice(i + 1).find(k => !k.classList.contains('nav-dot'));
      el.classList.toggle('hidden', !(prevVisible && nextVisible && nextItem && !nextItem.classList.contains('hidden')));
    });
  }
  // Si está en una pantalla que ya no tiene permitida, a Inicio.
  const active = document.querySelector('.screen.active');
  if(active && SCREEN_FEATURE[active.id] && !featureEnabled(SCREEN_FEATURE[active.id])) showScreen('screen-home');
}

/* Los permisos se vuelven a leer al volver a la app y cada minuto: así, si
   el admin quita (o da) una función, el cambio llega aunque el alumno
   tenga la app abierta desde hace días, sin tener que cerrarla. */
let permsCheckTimer = null;
async function refreshMyPermissions(){
  if(!currentUser || currentUserIsAdmin) return;
  try{
    const { data, error } = await sb.from('profiles').select('feature_flags, blocked, approved').eq('id', currentUser.id).maybeSingle();
    if(error || !data) return;
    if(data.blocked || !data.approved){
      await sb.auth.signOut();
      showAuthError(data.blocked ? 'Tu cuenta ha sido bloqueada por un administrador. Contacta con el administrador si crees que es un error.' : 'Tu cuenta está pendiente de confirmación por un administrador.');
      return;
    }
    const next = data.feature_flags || {};
    if(JSON.stringify(next) !== JSON.stringify(myFeatureFlags)){
      myFeatureFlags = next;
      applyFeatureVisibility();
      if(typeof NQ !== 'undefined') NQ.load();
    }
  }catch(e){}
}
function startPermissionsWatch(){
  if(permsCheckTimer) clearInterval(permsCheckTimer);
  permsCheckTimer = setInterval(refreshMyPermissions, 60000);
}
document.addEventListener('visibilitychange', () => { if(document.visibilityState === 'visible') refreshMyPermissions(); });
