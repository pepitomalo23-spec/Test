/* Pantalla de entrada y Estadísticas: dominio, artículos peor y mejor
   dominados, rueda de dominio y ranking de temas. */

/* ---------- landing ---------- */
function enterApp(screenId){
  const landing = document.getElementById('landingScreen');
  if(landing) landing.classList.add('hidden');
  showScreen(screenId);
}
function backToLanding(){
  const landing = document.getElementById('landingScreen');
  if(landing) landing.classList.remove('hidden');
}

/* ---------- barra de dominio (verde/amarillo/rojo/azul) de la pantalla Estadísticas ---------- */
/* Muestra/oculta la mini explicación de qué significa cada color en
   "Dominio de preguntas" (verde/amarillo/rojo/azul). */
function toggleMasteryInfo(){
  const box = document.getElementById('masteryInfoBox');
  const btn = document.getElementById('masteryInfoBtn');
  if(!box) return;
  box.classList.toggle('show');
  if(btn) btn.classList.toggle('active', box.classList.contains('show'));
}

/* Versión genérica de toggleMasteryInfo, para las cajas de ayuda de
   "Artículos que más fallas" y "Mejor progreso" (Estadísticas). */
function toggleInfoBox(boxId, btnId){
  const box = document.getElementById(boxId);
  const btn = document.getElementById(btnId);
  if(!box) return;
  box.classList.toggle('show');
  if(btn) btn.classList.toggle('active', box.classList.contains('show'));
}

/* ---------- artículos "peor de lo peor" y "extremos" (Estadísticas) ----------
   Agrupa QUESTIONS_POOL por artículo real (nodo de tipo 'articulo'; las
   preguntas "generales" sin artículo concreto se ignoran aquí) y suma,
   para cada artículo, los fallos y aciertos de TODAS sus preguntas
   (Q.failCount / Q.timesSeen, ya calculados en loadAppData a partir de
   session_answers).
   - "Artículos que más fallas": ranking por nº total de fallos, a partir
     de ARTICLE_FAIL_MIN fallos acumulados, EXCEPTO los artículos que ya
     se consideran "recuperados" (ver isArticleRecovered): un artículo
     puede haber acumulado 5+ fallos en el pasado, pero si el alumno ya
     ha encadenado la racha de aciertos necesaria, desaparece de aquí.
   - "Mejor progreso": todos los artículos "recuperados" (isArticleRecovered),
     ya sea porque nunca se han fallado (con ARTICLE_MASTERED_MIN+ aciertos)
     o porque se han recuperado tras fallar (racha de aciertos seguidos). */
const ARTICLE_FAIL_MIN = 5;
const ARTICLE_MASTERED_MIN = 5;
// Aciertos seguidos necesarios para dar un artículo por recuperado cuando
// tiene pocas preguntas (1 o 2): basta una racha "a secas".
const ARTICLE_RECOVERY_STREAK_SMALL = 5;
// Margen extra de aciertos que se exige, por encima de haber acertado ya
// TODAS las preguntas del artículo sin fallar ninguna entre medias, cuando
// el artículo tiene 3 preguntas o más.
const ARTICLE_RECOVERY_EXTRA = 3;
/* Un artículo se considera "recuperado" (no debe salir en "más fallas", y sí
   puede salir en "Mejor progreso") cuando:
   - Nunca se ha fallado ninguna de sus preguntas: con ARTICLE_MASTERED_MIN
     o más aciertos ya vale (regla de siempre).
   - Se ha fallado alguna vez, pero desde el último fallo el alumno ha
     encadenado una racha de aciertos que:
       · si el artículo tiene 1 o 2 preguntas: llega a
         ARTICLE_RECOVERY_STREAK_SMALL aciertos seguidos.
       · si el artículo tiene 3 o más: cubre TODAS las preguntas del
         artículo (las ha acertado todas sin fallar ninguna entre medias)
         y además suma ARTICLE_RECOVERY_EXTRA aciertos de margen por encima
         de esa vuelta completa. */
function isArticleRecovered(g){
  if(g.fails === 0) return g.corrects >= ARTICLE_MASTERED_MIN;
  const numQ = g.questionIds.length;
  const { streak, coveredCount } = computeArticleTrailingStreak(g.questionIds);
  if(numQ <= 2) return streak >= ARTICLE_RECOVERY_STREAK_SMALL;
  return coveredCount >= numQ && streak >= (numQ + ARTICLE_RECOVERY_EXTRA);
}
function computeArticleStreakStats(){
  const groups = {};
  QUESTIONS_POOL.forEach(q => {
    if(!q.nodo_id) return;
    const node = NODES_BY_ID[q.nodo_id];
    if(!node || node.tipo !== 'articulo') return; // solo artículos reales
    if(!q.timesSeen) return; // nunca respondida: no cuenta
    const g = groups[q.nodo_id] || (groups[q.nodo_id] = {
      nodoId: q.nodo_id, node: node, topicId: q.topic_id,
      name: articleShortLabel(node), lawName: topicTitle(q.topic_id),
      fails: 0, corrects: 0, questionIds: []
    });
    g.fails += (q.failCount || 0);
    g.corrects += (q.timesSeen - (q.failCount || 0));
    g.questionIds.push(q.id);
  });
  const all = Object.values(groups);
  const mostFailed = all
    .filter(g => g.fails >= ARTICLE_FAIL_MIN && !isArticleRecovered(g))
    .sort((a, b) => b.fails - a.fails);
  const mastered = all
    .filter(g => isArticleRecovered(g))
    .sort((a, b) => b.corrects - a.corrects);
  return { mostFailed, mastered };
}
/* Solo "Artículo N" (número), sin el nombre/descripción del artículo. */
function articleShortLabel(node){
  return node.numero ? (NODE_TYPE_LABEL[node.tipo] + ' ' + node.numero) : nodeDisplayName(node);
}
function streakRowHtml(g, i, kind, returnScreen){
  const count = kind === 'fail' ? g.fails : g.corrects;
  const label = kind === 'fail' ? 'fallos' : 'aciertos';
  const badgeClass = kind === 'fail' ? 'coral' : 'green';
  return (
    '<button type="button" class="streak-row" onclick="openArticuloPreguntas(\'' + g.nodoId + '\',\'' + kind + '\',\'' + (returnScreen || 'screen-stats') + '\')">' +
      '<div class="streak-pos">' + (i + 1) + '</div>' +
      '<div class="streak-body">' +
        '<div class="streak-name">' + escapeHtml(g.name) + '</div>' +
        '<div class="streak-meta">' + escapeHtml(g.lawName) + '</div>' +
      '</div>' +
      '<div class="streak-count ' + badgeClass + '">' + count + ' ' + label + '</div>' +
      '<svg class="streak-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="9,6 15,12 9,18"/></svg>' +
    '</button>'
  );
}
function renderStreakStats(){
  const worstEl = document.getElementById('worstArticlesList');
  if(!worstEl) return;

  const { mostFailed } = computeArticleStreakStats();
  worstEl.innerHTML = streakListHtml(mostFailed, 'fail', 'ningún artículo con 5 o más fallos. ¡Bien!');
}
/* Muestra solo un resumen (STREAK_PREVIEW_COUNT filas); si hay más,
/* Pantalla con el ranking completo (todos los artículos, no solo el
   resumen de 3), a la que se llega desde el botón "Ver todos". Permite
   reordenar: por nº de fallos/aciertos (por defecto), agrupado por
   tema, o por nº de artículo. */
let streakFullKind = 'fail';
let streakFullSort = 'count';
const STREAK_SORT_OPTIONS = [
  { id: 'count', label: 'Más fallos' }, // el texto se ajusta según kind en renderStreakFullSortTabs()
  { id: 'topic', label: 'Por tema' },
  { id: 'numero', label: 'Nº de artículo' }
];
function openStreakFull(kind){
  streakFullKind = kind;
  streakFullSort = 'count';
  const title = document.getElementById('streakFullTitle');
  const sub = document.getElementById('streakFullSub');
  if(title) title.textContent = kind === 'fail' ? 'Artículos que más fallas' : 'Mejor progreso';
  if(sub) sub.textContent = kind === 'fail' ? 'A partir de 5 fallos' : 'Nunca fallas, o ya recuperado';
  renderStreakFullSortTabs();
  renderStreakFullList();
  showScreen('screen-streak-full');
}
function renderStreakFullSortTabs(){
  const el = document.getElementById('streakFullSortTabs');
  if(!el) return;
  const countLabel = streakFullKind === 'fail' ? 'Más fallos' : 'Más aciertos';
  el.innerHTML = STREAK_SORT_OPTIONS.map(opt => (
    '<button type="button" class="admin-tab' + (streakFullSort === opt.id ? ' active' : '') + '" onclick="setStreakFullSort(\'' + opt.id + '\')">' +
      (opt.id === 'count' ? countLabel : opt.label) +
    '</button>'
  )).join('');
}
function setStreakFullSort(sort){
  streakFullSort = sort;
  renderStreakFullSortTabs();
  renderStreakFullList();
}
function renderStreakFullList(){
  const list = document.getElementById('streakFullList');
  if(!list) return;
  const { mostFailed, mastered } = computeArticleStreakStats();
  const items = (streakFullKind === 'fail' ? mostFailed : mastered).slice();

  if(streakFullSort === 'numero'){
    items.sort((a, b) => compareNodes(a.node, b.node));
    list.innerHTML = items.map((g, i) => streakRowHtml(g, i, streakFullKind, 'screen-streak-full')).join('');
    return;
  }
  if(streakFullSort === 'topic'){
    const byTopic = {};
    items.forEach(g => { (byTopic[g.topicId] = byTopic[g.topicId] || []).push(g); });
    const topicGroups = Object.values(byTopic).sort((a, b) => a[0].lawName.localeCompare(b[0].lawName, 'es', { sensitivity:'base' }));
    list.innerHTML = topicGroups.map(groupItems => {
      groupItems.sort((a, b) => compareNodes(a.node, b.node));
      return (
        '<div class="streak-group-header">' + escapeHtml(groupItems[0].lawName) + '</div>' +
        groupItems.map((g, i) => streakRowHtml(g, i, streakFullKind, 'screen-streak-full')).join('')
      );
    }).join('');
    return;
  }
  // 'count' (por defecto): ya vienen ordenados de más a menos.
  list.innerHTML = items.map((g, i) => streakRowHtml(g, i, streakFullKind, 'screen-streak-full')).join('');
}
/* Compatibilidad: streakListHtml sigue usando STREAK_PREVIEW_COUNT para
   el resumen de 3 filas en Estadísticas. */
const STREAK_PREVIEW_COUNT = 3;
function streakListHtml(items, kind, emptyMsg){
  if(!items.length) return '<div class="streak-empty">Todavía no hay ' + emptyMsg + '</div>';
  let html = items.slice(0, STREAK_PREVIEW_COUNT).map((g, i) => streakRowHtml(g, i, kind)).join('');
  if(items.length > STREAK_PREVIEW_COUNT){
    html += (
      '<button type="button" class="streak-toggle" onclick="openStreakFull(\'' + kind + '\')">' +
        'Ver todos (' + items.length + ')' +
        '<svg class="streak-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="9,6 15,12 9,18"/></svg>' +
      '</button>'
    );
  }
  return html;
}


/* Pantalla de detalle: preguntas de un artículo concreto, a la que se
   llega pulsando una fila en "Artículos que más fallas" o "Mejor
   progreso" (desde el resumen en Estadísticas o desde su ranking
   completo). Reutiliza openMyAddition para ver cada pregunta individual
   (opciones, correcta marcada y explicación), pasando esta pantalla
   como "volver". Si mode==='fail' solo se listan las preguntas que se
   han fallado alguna vez (para revisar justo lo que falla); si no,
   se listan todas las preguntas del artículo. El botón de cerrar de
   esta pantalla vuelve a returnScreen (screen-stats o screen-streak-full
   según desde dónde se haya abierto). */
let articuloPreguntasReturn = 'screen-stats';
function openArticuloPreguntas(nodoId, mode, returnScreen){
  articuloPreguntasReturn = returnScreen || 'screen-stats';
  const node = NODES_BY_ID[nodoId];
  const title = document.getElementById('articuloPreguntasTitle');
  const sub = document.getElementById('articuloPreguntasSub');
  const list = document.getElementById('articuloPreguntasList');
  if(!list) return;
  if(title) title.textContent = node ? nodeDisplayName(node) : 'Artículo';

  const topicName = node ? topicTitle(node.topic_id) : '';
  let questions = QUESTIONS_POOL.filter(q => q.nodo_id === nodoId);
  if(mode === 'fail') questions = questions.filter(q => (q.failCount || 0) > 0);

  if(sub) sub.textContent =
    'Tema: ' + topicName + ' · ' +
    (questions.length === 1
      ? (mode === 'fail' ? 'la pregunta que has fallado.' : 'esta es su pregunta.')
      : (mode === 'fail' ? 'las ' + questions.length + ' preguntas que has fallado.' : 'sus ' + questions.length + ' preguntas.'));

  list.innerHTML = questions.length
    ? questions.map(q => {
        const result = q.timesSeen
          ? (q.failCount === q.timesSeen ? 'coral' : (q.failCount === 0 ? 'green' : ''))
          : '';
        const metaCount = q.timesSeen
          ? (q.failCount + ' fallos · ' + (q.timesSeen - q.failCount) + ' aciertos')
          : 'Todavía sin responder';
        return (
          '<div class="admin-card" role="button" tabindex="0" onclick="openMyAddition(\'' + q.id + '\',\'screen-articulo-preguntas\')" onkeydown="if(event.key===\'Enter\')openMyAddition(\'' + q.id + '\',\'screen-articulo-preguntas\')">' +
            '<div class="admin-card-row">' +
              '<div>' +
                '<div class="admin-card-title">' + esc(q.q) + '</div>' +
                '<div class="admin-card-meta">' + metaCount + '</div>' +
              '</div>' +
              (result ? '<div class="admin-card-actions"><span class="streak-count ' + result + '" style="font-size:11.5px;">' + (result === 'coral' ? 'Siempre falla' : 'Siempre acierta') + '</span></div>' : '') +
            '</div>' +
          '</div>'
        );
      }).join('')
    : '<div class="empty">No se han encontrado preguntas para este artículo.</div>';

  showScreen('screen-articulo-preguntas');
}

/* Construye el path SVG de un segmento de "donut" (anillo) entre dos
   ángulos, sobre la mitad superior de un círculo (de 180° en el punto
   izquierdo a 0° en el punto derecho, pasando por arriba). */
function masteryDonutSegPath(cx, cy, rOuter, rInner, startAngle, endAngle){
  const toXY = (r, angleDeg) => {
    const rad = angleDeg * Math.PI / 180;
    return { x: cx + r * Math.cos(rad), y: cy - r * Math.sin(rad) };
  };
  const largeArc = (startAngle - endAngle) > 180 ? 1 : 0;
  const oStart = toXY(rOuter, startAngle);
  const oEnd = toXY(rOuter, endAngle);
  const iEnd = toXY(rInner, endAngle);
  const iStart = toXY(rInner, startAngle);
  return 'M ' + oStart.x.toFixed(2) + ' ' + oStart.y.toFixed(2) +
    ' A ' + rOuter + ' ' + rOuter + ' 0 ' + largeArc + ' 1 ' + oEnd.x.toFixed(2) + ' ' + oEnd.y.toFixed(2) +
    ' L ' + iEnd.x.toFixed(2) + ' ' + iEnd.y.toFixed(2) +
    ' A ' + rInner + ' ' + rInner + ' 0 ' + largeArc + ' 0 ' + iStart.x.toFixed(2) + ' ' + iStart.y.toFixed(2) +
    ' Z';
}

/* Dibuja "Dominio de preguntas" como un medio-donut (media pizza, media
   esfera vista de perfil) en vez de la barra horizontal de antes: un
   segmento de color por cada estado (verde/amarillo/rojo/azul), con su
   porcentaje, más el porcentaje de dominadas en grande en el centro. */
function renderMasteryBar(){
  const pool = QUESTIONS_POOL;
  const total = pool.length;
  const green = pool.filter(q => q.masteryStatus === 'green').length;
  const yellow = pool.filter(q => q.masteryStatus === 'yellow').length;
  const red = pool.filter(q => q.masteryStatus === 'red').length;
  const notSeen = pool.filter(q => q.masteryStatus === null).length;
  const pct = n => total ? (n / total * 100) : 0; // valor exacto, sin redondear a entero

  const elTotal = document.getElementById('masteryTotal');
  const elGreen = document.getElementById('masteryGreenCount');
  const elYellow = document.getElementById('masteryYellowCount');
  const elRed = document.getElementById('masteryRedCount');
  const elBlue = document.getElementById('masteryBlueCount');
  const elGreenPct = document.getElementById('masteryGreenPct');
  const elYellowPct = document.getElementById('masteryYellowPct');
  const elRedPct = document.getElementById('masteryRedPct');
  const elBluePct = document.getElementById('masteryBluePct');
  const elDonutPct = document.getElementById('masteryDonutPct');
  const svg = document.getElementById('masteryDonut');

  if(elTotal) elTotal.textContent = total;
  if(elGreen) elGreen.textContent = green;
  if(elYellow) elYellow.textContent = yellow;
  if(elRed) elRed.textContent = red;
  if(elBlue) elBlue.textContent = notSeen;
  if(elGreenPct) elGreenPct.textContent = total ? '(' + formatPctExact(pct(green)) + ')' : '';
  if(elYellowPct) elYellowPct.textContent = total ? '(' + formatPctExact(pct(yellow)) + ')' : '';
  if(elRedPct) elRedPct.textContent = total ? '(' + formatPctExact(pct(red)) + ')' : '';
  if(elBluePct) elBluePct.textContent = total ? '(' + formatPctExact(pct(notSeen)) + ')' : '';
  if(elDonutPct) elDonutPct.textContent = total ? formatPctExact(pct(green)) : formatPctExact(0);

  if(!svg) return;
  if(!total){
    svg.innerHTML = '<path d="' + masteryDonutSegPath(110, 110, 100, 62, 180, 0) + '" fill="#1E1E1E"></path>';
    return;
  }

  const segments = [
    { value: green, color: '#34D399' },
    { value: yellow, color: '#F5C043' },
    { value: red, color: '#F2665C' },
    { value: notSeen, color: '#4E9BF7' }
  ];

  const cx = 110, cy = 110, rOuter = 100, rInner = 62;
  let cumAngle = 180; // arranca en el punto izquierdo y avanza hacia la derecha por arriba
  let html = '';
  segments.forEach(seg => {
    if(seg.value <= 0) return;
    const sweep = (seg.value / total) * 180;
    const startAngle = cumAngle;
    const endAngle = cumAngle - sweep;
    cumAngle = endAngle;
    const midAngle = (startAngle + endAngle) / 2;
    const path = masteryDonutSegPath(cx, cy, rOuter, rInner, startAngle, endAngle);
    html += '<path class="mastery-donut-seg" d="' + path + '" fill="' + seg.color + '"></path>';
    // porcentaje sobre el propio segmento, solo si hay hueco suficiente para que se lea
    if(sweep >= 18){
      const midRad = midAngle * Math.PI / 180;
      const labelR = (rOuter + rInner) / 2;
      const lx = (cx + labelR * Math.cos(midRad)).toFixed(2);
      const ly = (cy - labelR * Math.sin(midRad)).toFixed(2);
      html += '<text class="mastery-donut-pctlabel" x="' + lx + '" y="' + ly + '" text-anchor="middle" dominant-baseline="middle">' + formatPctExact(seg.value / total * 100) + '</text>';
    }
  });
  svg.innerHTML = html;
}

function escapeHtml(str){
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/* ---------- ranking de temas (mejor a peor, % real de dominio por tema) ---------- */
function renderTopicRanking(){
  const list = document.getElementById('topicRankingList');
  if(!list) return;

  // Mismo criterio que el "Nivel general": de todas las preguntas de un tema
  // (incluidas las que aún no se han hecho), qué % está realmente dominado (verde).
  const ranking = TOPICS.map(t => {
    const topicQuestions = QUESTIONS_POOL.filter(q => q.topic_id === t.id);
    const total = topicQuestions.length;
    const green = topicQuestions.filter(q => q.masteryStatus === 'green').length;
    const pct = total ? (green / total * 100) : null; // valor exacto, sin redondear a entero
    return { name: t.name, pct };
  }).filter(r => r.pct !== null);

  ranking.sort((a, b) => b.pct - a.pct);

  if(!ranking.length){
    list.innerHTML = '<div class="ranking-empty">Todavía no hay datos suficientes para calcular tu ranking de temas.</div>';
    return;
  }

  const colorFor = pct => pct >= 70 ? 'var(--green)' : (pct >= 40 ? 'var(--amber)' : 'var(--coral)');

  list.innerHTML = ranking.map((r, i) => {
    const color = colorFor(r.pct);
    return (
      '<div class="ranking-row">' +
        '<div class="ranking-pos">' + (i + 1) + '</div>' +
        '<div class="ranking-body">' +
          '<div class="ranking-name">' + escapeHtml(r.name) + '</div>' +
          '<div class="ranking-track"><div class="ranking-fill" style="width:' + r.pct + '%; background:' + color + '"></div></div>' +
        '</div>' +
        '<div class="ranking-pct" style="color:' + color + '">' + formatPctExact(r.pct) + '</div>' +
      '</div>'
    );
  }).join('');
}

/* ---------- global stats screen ---------- */
// Tras CUALQUIER alta/edición/borrado/movimiento de preguntas o nodos desde
// el panel de administración, el QUESTIONS_POOL y TOPICS que usa el alumno
// (ranking de temas, rueda de dominio, "Nivel general", etc.) se quedaban
// desfasados hasta el siguiente login o el siguiente test. Esta función
// recarga ese pool y vuelve a pintar las estadísticas al momento, para que
// los porcentajes sean siempre fiables sin depender de recargar la página.
async function adminRefreshStudentStats(){
  try{
    await loadAppData();
    await refreshGlobalStats();
  } catch(err){
    console.error('Error refrescando estadísticas de alumno tras cambio de admin', err);
  }
}
async function refreshGlobalStats(sessionsPromise){
  if(!currentUser) return;
  // Admite recibir la consulta ya lanzada (ver onLoggedIn) para que ese
  // viaje de ida y vuelta a Supabase se solape con loadAppData()/loadHistory()
  // en vez de esperar a que terminen para empezarlo.
  const { data: sessions } = await (sessionsPromise || sb.from('test_sessions').select('score, total, created_at').eq('user_id', currentUser.id));
  const list = sessions || [];
  const questionsDone = list.reduce((s,r) => s + (r.total || 0), 0);

  // "Pendientes" (aviso del modo Fallos en el home) se sigue calculando en
  // caliente a partir del historial real, no de ningún contador aparte.
  const fallosPending = QUESTIONS_POOL.filter(q => q.masteryStatus === 'red' && !q.fallosHidden).length;
  const modeCardFallos = document.getElementById('modeCardFallos');
  if(modeCardFallos) modeCardFallos.classList.toggle('disabled', fallosPending === 0);

  // Test Inteligente: se deshabilita solo si no hay ni una sola pregunta
  // en todo el banco (nada que recomendar). El aviso de la tarjeta muestra
  // cuántas preguntas conviene repasar ya (rojas + amarillas + memoria vencida).
  const modeCardInteligente = document.getElementById('modeCardInteligente');
  if(modeCardInteligente) modeCardInteligente.classList.toggle('disabled', QUESTIONS_POOL.length === 0);
  const elSmartLabel = document.getElementById('smartPendingLabel');
  if(elSmartLabel) elSmartLabel.textContent = QUESTIONS_POOL.length ? (smartUrgentCount() + ' recomendadas hoy') : 'Sin preguntas';

  // Nota y nivel general: sobre TODO el temario (preguntas sin hacer
  // incluidas), no solo sobre los tests que ya has hecho. Las falladas y
  // las que aún no se han hecho restan por igual, no puntúan: es la nota
  // que tendrías ahora mismo si te examinaran de todo.
  const totalQuestions = QUESTIONS_POOL.length;
  const greenCount = QUESTIONS_POOL.filter(q => q.masteryStatus === 'green').length;
  // Porcentaje exacto (sin redondear al entero) para que "Nivel general"
  // refleje el dato real, no una aproximación.
  const levelPct = totalQuestions ? (greenCount / totalQuestions) * 100 : null;
  const notaGeneral = totalQuestions ? (greenCount / totalQuestions) * 10 : null;

  const elDone = document.getElementById('statQuestionsDone');
  const elTotal = document.getElementById('statQuestionsTotal');
  const elAvg = document.getElementById('statAvgScore');
  const elLevel = document.getElementById('statLevelPct');
  const elFallosLabel = document.getElementById('fallosPendingLabel');
  if(elDone) elDone.textContent = questionsDone;
  if(elTotal) elTotal.textContent = totalQuestions;
  if(elAvg) elAvg.textContent = (notaGeneral === null) ? '—' : formatNota(notaGeneral);
  if(elLevel) elLevel.textContent = formatPctExact(levelPct);
  if(elFallosLabel) elFallosLabel.textContent = fallosPending + ' pendientes';

  renderMasteryBar();
  renderTopicRanking();
  renderStreakStats();
}
