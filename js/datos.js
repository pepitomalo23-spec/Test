/* Datos en memoria de la app (temas, preguntas, historial, opciones de los
   tests), utilidades comunes y guardado local del test en curso. */

const SAMPLE_QUESTIONS = [
  { art:"Art. 81.2", general:false, failCount:3, avgTime:"8s", difficulty:"media",
    q:"Según el artículo 81.2, ¿qué naturaleza tienen los convenios interadministrativos por defecto?",
    options:["Indefinida", "4 años prorrogables", "1 año renovable tácitamente", "Coincide con la legislatura"],
    correct:1,
    explain:"El art. 81.2 fija una duración determinada de <b>4 años</b>, prorrogable por acuerdo expreso, salvo que la ley específica del convenio prevea otra cosa." },
  { art:"General", general:true, failCount:1, avgTime:"5s", difficulty:"facil",
    q:"¿Qué principio NO figura entre los principios generales de actuación de las Administraciones Públicas?",
    options:["Buena fe y confianza legítima", "Responsabilidad por la gestión pública", "Beneficio económico del órgano actuante", "Racionalización y agilidad de procedimientos"],
    correct:2,
    explain:"El <b>beneficio económico del órgano actuante</b> no es un principio recogido en la norma; los demás sí aparecen listados expresamente." },
  { art:"Art. 47.1.b", general:false, failCount:6, avgTime:"11s", difficulty:"dificil",
    q:"Un acto administrativo dictado prescindiendo total y absolutamente del procedimiento es:",
    options:["Anulable", "Nulo de pleno derecho", "Válido si no se recurre", "Rectificable de oficio sin más trámite"],
    correct:1,
    explain:"El art. 47.1.b califica estos actos como <b>nulos de pleno derecho</b>, a diferencia de otros vicios que solo generan anulabilidad." },
  { art:"Art. 3.1", general:false, failCount:0, avgTime:"4s", difficulty:"facil",
    q:"¿Cuál de estos es un principio de actuación recogido en el artículo 3.1?",
    options:["Confidencialidad absoluta", "Servicio efectivo a los ciudadanos", "Centralización total de competencias", "Prioridad presupuestaria sobre la legalidad"],
    correct:1,
    explain:"El <b>servicio efectivo a los ciudadanos</b> encabeza la lista de principios generales del art. 3.1." }
];

/* La lista de temas del test ya no se agrupa en categorías fijas
   ("Normativa específica" / "Conocimientos generales"): esas dos
   categorías estaban escritas a mano en el código, así que cualquier
   tema cuyo campo "Categoría" del admin no coincidiera exactamente con
   ellas (o la dejara vacía) desaparecía sin más de esta pantalla. Ahora
   se listan siempre TODOS los temas activos, en el mismo orden en que
   están en el panel de administración.
   El campo "Categoría" del admin sigue existiendo (útil como etiqueta
   interna), simplemente ya no filtra ni agrupa esta lista. */

/* ---------- data now lives in Supabase; these fill in at runtime ---------- */
let TOPICS = [];                // topics, with live `fails` count from DB
let TOPIC_GROUPS = {};          // { [topicId]: [{id,label}] } — grupos raíz (títulos u otro nivel), nunca artículos
let NODES_BY_ID = {};           // { [nodeId]: fila de nodos_temario } del árbol de temario
let QUESTIONS_POOL = [];        // all questions (DB rows mapped to quiz shape)
// Intentos "en crudo" (session_answers ya ordenados cronológicamente) de la
// última llamada a computeQuestionMastery(), indexados por question_id. Se
// reutiliza para calcular rachas a nivel de ARTÍCULO (varias preguntas a la
// vez) sin tener que volver a consultar Supabase — ver computeArticleTrailingStreak().
let RAW_ATTEMPTS_BY_QUESTION = {};

const COUNT_OPTIONS = [10, 20, 30, 40];
const TIME_OPTIONS = [15, 30, 45, 60];
const MINUTOS_OPTIONS = [null, 10, 20, 30, 45, 60];
const PREGUNTAS_OPTIONS = [null, 10, 20, 30, 40];
const DIFICULTAD_OPTIONS = ["aleatoria", "facil", "media", "dificil"];
const DIFICULTAD_LABELS = { aleatoria:"Aleatoria", facil:"Fácil", media:"Media", dificil:"Difícil" };
const AYUDA_OPTIONS = ["ocultar", "mostrar"];
const AYUDA_LABELS = { ocultar:"Ocultar tema", mostrar:"Mostrar tema" };
// "Vuelta": prioriza las preguntas menos vistas del tema (ver buildVueltaPool).
// "Normal": todas las preguntas del tema, sin ningún orden ni filtro especial.
const REPASO_OPTIONS = ["normal", "vuelta"];
const REPASO_LABELS = { normal:"Normal", vuelta:"Vuelta" };

let HISTORY = [];
// El Test Inteligente tiene su propio historial, separado del Historial
// general: son repasos rápidos y espontáneos (a veces de 1 o 2 preguntas)
// y no tiene sentido que ensucien el Historial de Examen/Estudio/Simulacro.
// Se muestran aparte, dentro de la propia pantalla de Test Inteligente.
let SMART_HISTORY = [];
let lastFinishedReviewId = null;

/* ---------- small helpers ---------- */
function formatRelativeDate(iso){
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  const mins = Math.floor(diffMs / 60000);
  if(mins < 1) return "Ahora mismo";
  if(mins < 60) return "Hace " + mins + (mins === 1 ? " minuto" : " minutos");
  const hours = Math.floor(mins / 60);
  if(hours < 24) return "Hace " + hours + (hours === 1 ? " hora" : " horas");
  const days = Math.floor(hours / 24);
  if(days < 30) return "Hace " + days + (days === 1 ? " día" : " días");
  return d.toLocaleDateString('es-ES');
}
function formatNota(n){
  return (Number(n) || 0).toFixed(2).replace('.', ',');
}
// Porcentaje EXACTO (sin redondear a entero): se muestran los decimales
// que hagan falta (hasta 2), quitando ceros sobrantes. Ej: 66.666...% -> "66,67%"
// solo redondea al 2º decimal para no mostrar infinitos decimales, nunca al entero.
function formatPctExact(n){
  if(n === null || n === undefined || isNaN(n)) return '—';
  const rounded = Math.round(n * 100) / 100; // redondeo a 2 decimales, no a entero
  const str = (Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2).replace(/0+$/,'').replace(/\.$/,''));
  return str.replace('.', ',') + '%';
}
function formatMMSS(totalSeconds){
  const s = Math.max(0, Math.round(totalSeconds || 0));
  const m = Math.floor(s / 60), sec = s % 60;
  return String(m).padStart(2,'0') + ':' + String(sec).padStart(2,'0');
}
function mapDbQuestionToQuiz(row){
  const node = row.nodo_id ? NODES_BY_ID[row.nodo_id] : null;
  return {
    id: row.id,
    topic_id: row.topic_id || (node ? node.topic_id : null),
    nodo_id: row.nodo_id || null,
    art: node ? nodeFullPath(row.nodo_id) : null,
    general: !node || node.tipo !== 'articulo',
    difficulty: row.difficulty,
    q: row.question,
    options: row.options,
    correct: row.correct_index,
    explain: row.explain,
    ai_explain: row.ai_explain || null,
    own_note: row.own_note || null,
    failCount: row._failCount || 0,
    timesSeen: row._timesSeen || 0,
    masteryStatus: row._status || null, // 'green' | 'yellow' | 'red' | null (nunca respondida)
    // true si el usuario la "descartó" de Fallos y no la ha vuelto a fallar
    // desde entonces. NO afecta a masteryStatus ni a las Estadísticas: solo
    // se usa para decidir si aparece en la pantalla/repaso de Fallos.
    fallosHidden: row._fallosHidden || false,
    avgTime: row._avgTime || "—",
    // fecha del intento más reciente (da igual acierto o fallo). null si
    // nunca se ha respondido. La usa el Test Inteligente para saber cuánto
    // tiempo lleva "dormida" una pregunta ya dominada.
    lastAttemptAt: row._lastAttemptAt || null
  };
}

/* Calcula, para cada pregunta, su estado real a partir de session_answers
   (no de un contador aparte): cuántas veces se ha visto, cuántas se ha
   fallado, y el color de dominio actual. Como se apoya directamente en
   session_answers/test_sessions, si el usuario borra un test del historial
   (deleteHistoryItem borra sus session_answers), esas respuestas dejan de
   contar aquí automáticamente — no hay ningún contador que se pueda quedar
   desincronizado.
   Estado:
   - 'red'    → el intento más reciente de esa pregunta fue un fallo.
   - 'yellow' → se ha fallado alguna vez Y también acertado, pero todavía
                con menos de 3 aciertos seguidos (racha de recuperación
                en progreso).
   - 'green'  → nunca se ha fallado, o se falló alguna vez pero ya hay
                3 o más aciertos seguidos (pregunta dominada). */
async function computeQuestionMastery(questionIds){
  const stats = {};
  if(!currentUser || !questionIds || !questionIds.length) return stats;
  const { data, error } = await sb
    .from('session_answers')
    .select('question_id, is_correct, answer_order, test_sessions!inner(created_at)')
    .eq('user_id', currentUser.id)
    .in('question_id', questionIds);
  if(error){ console.error('Error calculando el dominio de preguntas', error); return stats; }

  const byQuestion = {};
  (data || []).forEach(row => {
    if(!row.test_sessions) return; // por seguridad: sin sesión asociada (ya borrada)
    (byQuestion[row.question_id] = byQuestion[row.question_id] || []).push(row);
  });

  RAW_ATTEMPTS_BY_QUESTION = {}; // se recalcula entero en cada llamada (ver arriba)
  Object.keys(byQuestion).forEach(qid => {
    const attempts = byQuestion[qid].slice().sort((a, b) => {
      const diff = new Date(a.test_sessions.created_at) - new Date(b.test_sessions.created_at);
      return diff !== 0 ? diff : (a.answer_order - b.answer_order);
    });
    RAW_ATTEMPTS_BY_QUESTION[qid] = attempts; // guardado para rachas a nivel de artículo
    let streak = 0;
    for(let i = attempts.length - 1; i >= 0; i--){
      if(attempts[i].is_correct) streak++; else break;
    }
    const failCount = attempts.filter(a => !a.is_correct).length;
    let status;
    if(failCount === 0) status = 'green';           // nunca ha fallado
    else if(streak >= 3) status = 'green';           // falló antes, ahora dominada
    else if(streak >= 1) status = 'yellow';          // falló y acertó, racha corta aún
    else status = 'red';                             // el último intento fue un fallo
    // Fecha del intento más reciente (da igual acierto o fallo): sirve para
    // saber si una pregunta "descartada" de Fallos se ha vuelto a fallar
    // después del descarte (ver dismissed_fails / _fallosHidden).
    const lastAttemptAt = attempts[attempts.length - 1].test_sessions.created_at;
    stats[qid] = { timesSeen: attempts.length, failCount, streak, status, lastAttemptAt };
  });
  return stats;
}
/* Junta los intentos "en crudo" (RAW_ATTEMPTS_BY_QUESTION) de varias preguntas
   —todas las de un mismo artículo— en una única línea temporal y calcula la
   racha de aciertos seguidos al final de esa línea (desde el último fallo,
   contando cualquier pregunta del artículo, no solo una). También devuelve
   cuántas preguntas DISTINTAS del artículo caen dentro de esa racha, para
   saber si se han acertado todas sin fallar ninguna entre medias.
   Requiere que computeQuestionMastery() se haya ejecutado antes (loadAppData
   la llama siempre al cargar los datos del usuario). */
function computeArticleTrailingStreak(questionIds){
  let all = [];
  (questionIds || []).forEach(qid => {
    (RAW_ATTEMPTS_BY_QUESTION[qid] || []).forEach(a => {
      all.push({ qid: qid, correct: a.is_correct, at: a.test_sessions.created_at, order: a.answer_order });
    });
  });
  all.sort((a, b) => {
    const diff = new Date(a.at) - new Date(b.at);
    return diff !== 0 ? diff : (a.order - b.order);
  });
  let streak = 0;
  const covered = new Set();
  for(let i = all.length - 1; i >= 0; i--){
    if(!all[i].correct) break;
    streak++;
    covered.add(all[i].qid);
  }
  return { streak, coveredCount: covered.size };
}
/* Para preguntas generales, si tienen un nodo (Tema/Título/Capítulo/Sección) mostramos
   también ese ámbito junto al sello "General"; si son de todo el tema (sin nodo), solo "General". */
function generalTagText(q){
  return q.art ? ('General · ' + q.art) : 'General';
}
function generalCiteText(q){
  return q.art ? ('General · ' + q.art) : 'Sin artículo asociado';
}

const ICONS = {
  spinner: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 3a9 9 0 1 0 9 9"/></svg>',
  estudio: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 7v14"/><path d="M16 12h2"/><path d="M16 8h2"/><path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"/><path d="M6 12h2"/><path d="M6 8h2"/></svg>',
  fallos: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="m15 7-6 6"/><path d="M20 17H6.5a1 1 0 000 5H19a1 1 0 001-1V3a1 1 0 00-1-1H6.5A2.5 2.5 0 004 4.5v15"/><path d="m9 7 6 6"/></svg>',
  examen: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M13.4 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7.4"/><path d="M2 6h4"/><path d="M2 10h4"/><path d="M2 14h4"/><path d="M2 18h4"/><path d="M21.378 5.626a1 1 0 1 0-3.004-3.004l-5.01 5.012a2 2 0 0 0-.506.854l-.837 2.87a.5.5 0 0 0 .62.62l2.87-.837a2 2 0 0 0 .854-.506z"/></svg>',
  simulacro: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M16 22h2a2 2 0 0 0 2-2V8a2.4 2.4 0 0 0-.706-1.706l-3.588-3.588A2.4 2.4 0 0 0 14 2H6a2 2 0 0 0-2 2v2.85"/><path d="M14 2v5a1 1 0 0 0 1 1h5"/><path d="M8 14v2.2l1.6 1"/><circle cx="8" cy="16" r="6"/></svg>',
  inteligente: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="6.5" y="6.5" width="11" height="11" rx="1"/><path d="m17.5 15.5-1.888-.755a1 1 0 00-1.078.221l-1.827 1.827a.5.5 0 01-.848-.283l-.21-1.473a2 2 0 00-1.086-1.506l-2.169-1.084a.5.5 0 010-.894l2.169-1.084a2 2 0 001.085-1.506L12 6.5"/><path d="m17.5 8.5-2.328.388a1 1 0 01-1.022-.472L13 6.5"/></svg>',
  clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8"/><line x1="12" y1="12" x2="12" y2="7.8"/><line x1="12" y1="12" x2="15" y2="13.5"/></svg>',
  ok: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8"/><polyline points="8.3,12.5 11,15.2 16,9.3"/></svg>',
  bad: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8"/><line x1="9.3" y1="9.3" x2="14.7" y2="14.7"/><line x1="14.7" y1="9.3" x2="9.3" y2="14.7"/></svg>',
  pending: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-dasharray="2.8 3.2"><circle cx="12" cy="12" r="8"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="5,13 10,18 19,6"/></svg>',
  cross: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/></svg>',
  seal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="7.2"/><circle cx="12" cy="12" r="3"/></svg>',
  warn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 2 21h20L12 3Z"/><line x1="12" y1="9.5" x2="12" y2="14"/><circle cx="12" cy="17" r="0.9" fill="currentColor" stroke="none"/></svg>',
  timer: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><line x1="10" y1="2" x2="14" y2="2"/><line x1="12" y1="2" x2="12" y2="5"/><circle cx="12" cy="13.5" r="8"/><line x1="12" y1="13.5" x2="12" y2="9"/><line x1="12" y1="13.5" x2="15" y2="14.8"/></svg>',
  doc: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3.5h9L20 8v12.5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-16a1 1 0 0 1 1-1Z"/><path d="M14.5 3.5V8H19"/><line x1="8" y1="12.5" x2="16" y2="12.5"/><line x1="8" y1="16" x2="16" y2="16"/></svg>',
  chart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="20" x2="19" y2="20"/><rect x="6" y="14" width="3.4" height="6"/><rect x="10.3" y="9.5" width="3.4" height="10.5"/><rect x="14.6" y="5" width="3.4" height="15"/></svg>',
  info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8"/><line x1="12" y1="11" x2="12" y2="16"/><circle cx="12" cy="8" r="0.9" fill="currentColor" stroke="none"/></svg>',
  brain: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="7" cy="6.5" r="2.1"/><circle cx="17" cy="6.5" r="2.1"/><circle cx="7" cy="17.5" r="2.1"/><circle cx="17" cy="17.5" r="2.1"/><circle cx="12" cy="12" r="2.1"/><line x1="8.7" y1="7.6" x2="10.4" y2="10.6"/><line x1="15.3" y1="7.6" x2="13.6" y2="10.6"/><line x1="8.7" y1="16.4" x2="10.4" y2="13.4"/><line x1="15.3" y1="16.4" x2="13.6" y2="13.4"/></svg>',
  chevron: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="9,6 15,12 9,18"/></svg>',
  pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-7-6.1-7-11.2A7 7 0 0 1 19 9.8C19 14.9 12 21 12 21Z"/><circle cx="12" cy="9.5" r="2.4"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
  move: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><polyline points="5,9 2,12 5,15"/><polyline points="9,5 12,2 15,5"/><polyline points="15,19 12,22 9,19"/><polyline points="19,9 22,12 19,15"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="12" y1="2" x2="12" y2="22"/></svg>',
  kebab: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="12" cy="19" r="1.7"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>',
  bulb: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.2 1 2.3h6c0-1.1.4-1.8 1-2.3A7 7 0 0 0 12 2Z"/></svg>',
  smile: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>',
  graduation: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M22 10 12 5 2 10l10 5 10-5Z"/><path d="M6 12.5V17c0 1.5 2.7 3 6 3s6-1.5 6-3v-4.5"/><path d="M22 10v6"/></svg>',
  book: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5V5a2 2 0 0 1 2-2h13.5v15H6a2 2 0 0 0-2 2Z"/><path d="M19.5 18H6a2 2 0 0 0-2 2"/><path d="M8 7h8"/><path d="M8 10.5h8"/></svg>',
  pencil: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>',
  image: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9.5" r="1.5"/><path d="M21 15l-5-5L5 20"/></svg>'
};

let quizState = { mode:null, index:0, correctCount:0, answered:false };
let ACTIVE_QUESTIONS = SAMPLE_QUESTIONS;
let configState = { mode:null, topics:new Set(), nodeSelections:{}, count:20, time:30, minutos:null, preguntas:null, dificultad:'aleatoria', ayuda:'ocultar', repaso:'normal' };
let timerInterval = null;

/* ---------- persistencia local del test en curso ----------
   Guarda en localStorage el test que se está haciendo (preguntas
   barajadas, respuestas dadas, pregunta por la que vas...) para que, si
   se cierra la app/el navegador o se apaga el móvil a medias de un test,
   al volver a abrir se pueda seguir exactamente por donde se dejó, en
   vez de reiniciar en la pantalla de inicio. Va aparte del guardado en
   Supabase, que solo ocurre al FINALIZAR el test. */
function quizProgressKey(){
  return 'legis_quiz_progress_' + (currentUser ? currentUser.id : 'anon');
}
function saveQuizProgress(){
  try{
    if(!quizState || !quizState.mode){
      localStorage.removeItem(quizProgressKey());
      return;
    }
    localStorage.setItem(quizProgressKey(), JSON.stringify({
      quizState, activeQuestions: ACTIVE_QUESTIONS, quizSecondsLeft, savedAt: Date.now()
    }));
  }catch(e){ /* localStorage no disponible: seguimos sin persistir */ }
}
function clearQuizProgress(){
  try{ localStorage.removeItem(quizProgressKey()); }catch(e){}
}
/* Se llama una vez al arrancar/loguearse: si hay un test guardado del
   usuario actual, lo recupera en memoria (no cambia de pantalla; el
   usuario lo retoma pulsando "Reanudar" en la tarjeta correspondiente,
   igual que ya podía hacer sin cerrar la app). */
function restoreQuizProgress(){
  try{
    const raw = localStorage.getItem(quizProgressKey());
    if(!raw) return;
    const saved = JSON.parse(raw);
    if(!saved || !saved.quizState || !saved.quizState.mode || !saved.activeQuestions) return;
    quizState = saved.quizState;
    ACTIVE_QUESTIONS = saved.activeQuestions;
    quizSecondsLeft = (typeof saved.quizSecondsLeft === 'number') ? saved.quizSecondsLeft : null;
    // Si el test tenía tiempo límite, descontamos el tiempo que ha pasado
    // realmente mientras la app estaba cerrada, no solo lo que marcaba el
    // contador al guardar.
    if(quizState.timeMinutes && quizState.startedAt){
      const elapsed = Math.floor((Date.now() - quizState.startedAt) / 1000);
      const secondsLeft = (quizState.timeMinutes * 60) - elapsed;
      quizSecondsLeft = secondsLeft;
      if(secondsLeft <= 0){
        // el tiempo ya se agotó mientras el usuario no estaba: no hay
        // nada que reanudar, se descarta el test guardado.
        quizState = { mode:null, index:0, correctCount:0, answered:false };
        ACTIVE_QUESTIONS = SAMPLE_QUESTIONS;
        quizSecondsLeft = null;
        clearQuizProgress();
      }
    }
  }catch(e){ /* si el dato guardado está corrupto, se ignora sin romper la app */ }
}

function esc(s){ return (s == null ? '' : String(s)).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

function formatDateTime(iso){
  if(!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('es-ES', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });
}
