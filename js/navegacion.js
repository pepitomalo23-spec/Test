/* Navegación entre pantallas y bloqueo de tarjetas con un test a medias. */

/* ---------- navigation ---------- */
const TOP_LEVEL_SCREENS = ['screen-normativas', 'screen-home', 'screen-callejero', 'screen-stats'];
const LAST_SCREEN_KEY = 'legis_last_screen';
// Pantallas de "detalle" o de proceso (un artículo concreto, el
// configurador de un test, la revisión de un test ya hecho...) no se
// pueden reabrir tal cual tras recargar la app, porque el dato concreto
// que mostraban (qué artículo, qué test) vive solo en memoria y se
// pierde. En vez de mandar siempre a Inicio, cada una cae en la pantalla
// "padre" desde la que se llegó a ella, que sí es segura de reabrir.
const SCREEN_RESTORE_TARGET = {
  'screen-normativas': 'screen-normativas',
  'screen-home': 'screen-home',
  'screen-stats': 'screen-stats',
  'screen-callejero': 'screen-callejero',
  'screen-boe-cambios': 'screen-boe-cambios',
  'screen-my-additions': 'screen-my-additions',
  'screen-notas-todas': 'screen-my-additions',
  'screen-historial-todo': 'screen-home',
  'screen-admin': 'screen-admin',
  'screen-boe-detalle': 'screen-boe-cambios',
  'screen-my-addition-detail': 'screen-my-additions',
  'screen-articulo-preguntas': 'screen-stats',
  'screen-streak-full': 'screen-stats',
  'screen-review': 'screen-home',
  'screen-config': 'screen-home',
  'screen-quiz': 'screen-home',
  'screen-result': 'screen-home'
};
function getLastScreen(){
  try{
    const saved = localStorage.getItem(LAST_SCREEN_KEY);
    const target = saved && SCREEN_RESTORE_TARGET[saved];
    if(target) return target;
  }catch(e){}
  return 'screen-home';
}
function showScreen(id){
  if(SCREEN_FEATURE[id] && !featureEnabled(SCREEN_FEATURE[id])) id = 'screen-home';
  if(id !== 'screen-quiz'){ clearInterval(timerInterval); }
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  document.getElementById('navNormativas').classList.toggle('active', id === 'screen-normativas');
  document.getElementById('navHome').classList.toggle('active', id === 'screen-home');
  document.getElementById('navStats').classList.toggle('active', id === 'screen-stats');
  document.getElementById('navCallejero').classList.toggle('active', id === 'screen-callejero');
  const isTopLevel = TOP_LEVEL_SCREENS.includes(id);
  // Recordamos la última pantalla visitada, para poder volver a ella (o a
  // su pantalla padre, ver SCREEN_RESTORE_TARGET) si la app se recarga
  // (p. ej. tras dejarla en segundo plano y que el sistema la "mate"),
  // en vez de aterrizar siempre en Inicio.
  if(SCREEN_RESTORE_TARGET[id]){
    try{ localStorage.setItem(LAST_SCREEN_KEY, id); }catch(e){}
  }
  const headerNav = document.querySelector('.header-nav');
  if(headerNav) headerNav.classList.toggle('hidden', !isTopLevel);
  const headerUser = document.getElementById('headerUser');
  if(headerUser) headerUser.classList.toggle('hidden', id === 'screen-quiz' || id === 'screen-review');
  if(id === 'screen-quiz' || id === 'screen-review'){
    if(typeof observeActiveQuizHead === 'function') observeActiveQuizHead();
  } else if(quizHeadObserver){
    quizHeadObserver.disconnect();
    quizHeadObserver = null;
  }
  if(id === 'screen-home'){ updateModeCardsLockState(); renderHistory(); }
  if(id === 'screen-boe-cambios') loadNormativas();
  if(id === 'screen-normativas' && typeof NQ !== 'undefined') NQ.load();
  if(id === 'screen-my-additions'){ renderMyAdditionsList(); }
  if(id === 'screen-callejero' && typeof CJ !== 'undefined') CJ.abrir();
}
function showHome(){ showScreen('screen-home'); }

/* ---------- bloqueo visual de las tarjetas de home cuando hay un test a medias ---------- */
function updateModeCardsLockState(){
  const activeMode = (quizState && quizState.mode) ? quizState.mode : null;
  const cards = {
    estudio: document.getElementById('modeCardEstudio'),
    fallos: document.getElementById('modeCardFallos'),
    inteligente: document.getElementById('modeCardInteligente'),
    simulacro: document.getElementById('modeCardSimulacro'),
    examen: document.getElementById('modeCardExamen')
  };
  Object.keys(cards).forEach(mode => {
    const card = cards[mode];
    if(!card) return;
    const resumeBtn = card.querySelector('.mode-resume-btn');
    if(activeMode && mode === activeMode){
      card.classList.remove('locked');
      card.classList.add('active-test');
      if(resumeBtn) resumeBtn.classList.remove('hidden');
    } else if(activeMode){
      card.classList.add('locked');
      card.classList.remove('active-test');
      if(resumeBtn) resumeBtn.classList.add('hidden');
    } else {
      card.classList.remove('locked', 'active-test');
      if(resumeBtn) resumeBtn.classList.add('hidden');
    }
  });
}
function openOverlay(id){
  document.getElementById(id).classList.add('active');
}
