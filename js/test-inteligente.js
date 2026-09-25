/* Test Inteligente (repaso adaptativo tipo Anki). */

/* ---------- Test Inteligente (repaso adaptativo tipo Anki) ----------
   No guarda nada nuevo en Supabase: se apoya en los mismos datos que ya
   calcula computeQuestionMastery() (masteryStatus, failCount, timesSeen,
   lastAttemptAt). Solo entran preguntas que TOCAN hoy, en 3 grupos reales
   (los mismos que usa el resto de la app para masteryStatus):
   - Fallos: el último intento fue un fallo.
   - Progreso: falladas antes y ahora en racha de recuperación (aciertos
     seguidos, pero todavía menos de 3).
   - Acertadas: ya dominadas (nunca falladas, o recuperadas del todo), pero
     ya ha pasado su intervalo de repaso (como el intervalo de Anki: crece
     con cada vez que se ven, hasta 90 días) y toca repasarlas de memoria.
   Las preguntas nunca respondidas NO entran aquí (para eso está "Modo
   estudio"), y las dominadas que aún no tocan repasar tampoco. No hay
   ningún tope ni relleno artificial: el test de hoy es exactamente el
   número de preguntas que de verdad tocan hoy, ni una más ni una menos. */
let smartTestPicked = []; // últimas preguntas calculadas (se usan al pulsar "Empezar")

function smartDaysSince(iso){
  if(!iso) return null;
  return (Date.now() - new Date(iso).getTime()) / 86400000;
}
// ¿"iso" cae en el mismo día de calendario (hora local) que ahora mismo?
// Se usa para las preguntas en "Progreso": tras acertar, aunque no lleven
// los 3 aciertos seguidos necesarios para darlas por recuperadas, no
// vuelven a salir en Test Inteligente hasta que cambie el día.
function smartIsToday(iso){
  if(!iso) return false;
  const d = new Date(iso);
  const now = new Date();
  return d.toDateString() === now.toDateString();
}
// Cuántos días "debería" aguantar una pregunta dominada sin considerarse
// en riesgo de olvido, según cuántas veces se ha visto ya. Crece con cada
// repaso (como el intervalo de Anki), con un tope de 90 días.
function smartReviewInterval(q){
  const seen = Math.max(1, q.timesSeen || 1);
  return Math.min(90, 4 * Math.pow(1.7, seen - 1));
}
function smartDifficultyWeight(q){
  if(q.difficulty === 'dificil') return 1.15;
  if(q.difficulty === 'facil') return 0.9;
  return 1;
}
// Categoría real de cada pregunta para HOY. Devuelve null si hoy no le toca
// (nunca vista, o dominada pero su intervalo de repaso aún no ha vencido):
// esas quedan fuera del Test Inteligente por completo.
function smartClassify(q){
  if(q.masteryStatus === 'red') return 'red';
  if(q.masteryStatus === 'yellow'){
    // Está en racha de recuperación (ya acertó al menos una vez tras
    // fallarla, pero todavía no lleva los 3 aciertos seguidos). Si ese
    // último acierto fue HOY, descansa hasta mañana: no vuelve a salir
    // en Test Inteligente el mismo día en que se acaba de acertar.
    if(smartIsToday(q.lastAttemptAt)) return null;
    return 'yellow';
  }
  if(q.masteryStatus === 'green'){
    const days = smartDaysSince(q.lastAttemptAt);
    const interval = smartReviewInterval(q);
    return (days !== null && days >= interval) ? 'memory' : null;
  }
  return null; // nunca respondida: no entra en Test Inteligente
}
function smartScore(q, cat){
  const w = smartDifficultyWeight(q);
  if(cat === 'red') return 100 * w;
  if(cat === 'yellow') return 60 * w;
  // 'memory': cuanto más se haya pasado del intervalo esperado, más urge
  const days = smartDaysSince(q.lastAttemptAt);
  const interval = smartReviewInterval(q);
  const ratio = interval > 0 ? (days / interval) : 1;
  return Math.min(55, 25 * ratio) * w;
}
// Arma el test de HOY: solo preguntas que realmente tocan (fallos, en
// progreso, o dominadas cuyo repaso ya venció), ordenadas por urgencia.
// Sin cupos, sin relleno, sin tamaño fijo: el total es el que es.
function buildSmartTest(){
  const byCat = { red: [], yellow: [], memory: [] };
  QUESTIONS_POOL.forEach(q => {
    const cat = smartClassify(q);
    if(cat) byCat[cat].push({ q, cat, score: smartScore(q, cat) });
  });
  Object.values(byCat).forEach(arr => arr.sort((a, b) => b.score - a.score));
  const picked = [...byCat.red, ...byCat.yellow, ...byCat.memory];
  const counts = { red: byCat.red.length, yellow: byCat.yellow.length, memory: byCat.memory.length };
  return { questions: picked.map(s => s.q), counts };
}
function smartUrgentCount(){
  // "urgentes" = todo lo que hoy toca en el Test Inteligente (fallos +
  // progreso + memoria vencida). Es lo que se muestra como aviso en la
  // tarjeta de home.
  return QUESTIONS_POOL.filter(q => !!smartClassify(q)).length;
}
const SMART_CAT_LABELS = {
  red: '🔴 Fallos', yellow: '🟠 Progreso', memory: '🟢 Acertadas'
};
function renderSmartIntro(){
  if(!currentUser || !QUESTIONS_POOL.length) return;
  const result = buildSmartTest();
  smartTestPicked = result.questions;
  const totalEl = document.getElementById('smartTotal');
  if(totalEl) totalEl.textContent = smartTestPicked.length;
  const el = document.getElementById('smartBreakdown');
  if(el){
    el.innerHTML = '';
    ['red', 'yellow', 'memory'].forEach(cat => {
      const n = result.counts[cat] || 0;
      if(n === 0) return; // no mostrar grupos vacíos: solo lo que hay hoy
      const row = document.createElement('div');
      row.className = 'fallos-row';
      row.innerHTML = '<span class="fallos-row-name">' + SMART_CAT_LABELS[cat] + '</span><span class="fallos-row-count">' + n + '</span>';
      el.appendChild(row);
    });
  }
  const startBtn = document.getElementById('smartStartBtn');
  if(startBtn) startBtn.disabled = smartTestPicked.length === 0;
}
function openInteligente(){
  if(whenAppDataReady(openInteligente)) return;
  if(!featureEnabled('inteligente')) return; // el administrador ha desactivado esta función para este usuario
  if(quizState && quizState.mode && quizState.mode !== 'inteligente') return; // hay un test en curso en otro apartado
  if(!QUESTIONS_POOL.length) return;
  renderSmartIntro();
  renderSmartHistory();
  showScreen('screen-home');
  openOverlay('screen-inteligente');
}
function startSmartTest(){
  if(!currentUser || !smartTestPicked.length) return;
  startQuiz('inteligente', smartTestPicked, null);
}
