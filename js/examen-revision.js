/* Vista lista (Examen / Simulacro), finalizar el test y corrección. */

/* ---------- vista lista (examen / simulacro) ---------- */
function renderQuizList(){
  const body = document.getElementById('quizListBody');
  const letters = ['A','B','C','D'];
  document.getElementById('quizCount').textContent = countAnsweredList() + ' / ' + ACTIVE_QUESTIONS.length;
  body.innerHTML = ACTIVE_QUESTIONS.map((q, qi) => {
    const optsHtml = q.options.map((opt, i) => {
      const selected = quizState.answers[qi] === i;
      return '<div class="option' + (selected ? ' selected' : '') + '" role="button" tabindex="0" onclick="selectListOption(' + qi + ',' + i + ')">' +
        '<span class="opt-badge">' + letters[i] + '</span><span class="opt-text">' + esc(opt) + '</span><span class="opt-result"></span>' +
      '</div>';
    }).join('');
    return (
      '<div class="quiz-list-item" data-qi="' + qi + '">' +
        '<div class="question">' + (qi + 1) + '. ' + esc(q.q) + '</div>' +
        '<div class="options">' + optsHtml + '</div>' +
      '</div>'
    );
  }).join('');
}
function countAnsweredList(){
  return quizState.answers.filter(a => a !== null && a !== undefined).length;
}
function selectListOption(qi, i){
  quizState.answers[qi] = i;
  const item = document.querySelector('.quiz-list-item[data-qi="' + qi + '"]');
  item.querySelectorAll('.option').forEach((el, idx) => el.classList.toggle('selected', idx === i));
  document.getElementById('quizCount').textContent = countAnsweredList() + ' / ' + ACTIVE_QUESTIONS.length;
  saveQuizProgress();
}
const QUIZ_FINISH_LABELS = { examen:'examen', simulacro:'simulacro', estudio:'test de estudio', fallos:'repaso de fallos', inteligente:'test inteligente' };
function askFinishConfirm(blank, label){
  return new Promise(resolve => {
    const ov = document.getElementById('finConfirmOverlay');
    document.getElementById('finConfirmMsg').textContent =
      'Tienes ' + blank + ' pregunta' + (blank === 1 ? '' : 's') + ' sin responder. ¿Quieres finalizar el ' + label + ' igualmente?';
    const yes = document.getElementById('finConfirmYes');
    const no = document.getElementById('finConfirmNo');
    const done = (val) => {
      ov.classList.remove('show');
      yes.onclick = null; no.onclick = null; ov.onclick = null;
      resolve(val);
    };
    yes.onclick = () => done(true);
    no.onclick = () => done(false);
    ov.onclick = (e) => { if(e.target === ov) done(false); };
    ov.classList.add('show');
  });
}
async function confirmFinishQuiz(){
  if(!quizState || !quizState.mode || quizState.finishing) return;
  const label = QUIZ_FINISH_LABELS[quizState.mode] || 'test';
  let blank;
  if(quizState.viewMode === 'card'){
    // En tarjeta (estudio/fallos), las preguntas que nunca se han llegado a
    // ver NO cuentan como "sin responder": solo se avisa por las vistas sin
    // responder ni marcar "en blanco".
    const visited = quizState.visited || [];
    const visitedIndices = ACTIVE_QUESTIONS.map((_, i) => i).filter(i => visited[i]);
    const answeredOrBlanked = visitedIndices.reduce((acc, i) => {
      const a = quizState.answers[i];
      const isBlanked = !!(quizState.blanked && quizState.blanked[i]);
      return acc + (((a !== null && a !== undefined) || isBlanked) ? 1 : 0);
    }, 0);
    blank = visitedIndices.length - answeredOrBlanked;
  } else {
    blank = ACTIVE_QUESTIONS.length - countAnsweredList();
  }
  // Se puede finalizar en cualquier momento, con las preguntas que sean sin
  // responder (cuentan como en blanco). Solo se pide una confirmación.
  if(blank > 0){
    const ok = await askFinishConfirm(blank, label);
    if(!ok) return;
  }
  finishQuiz();
}

async function finishQuiz(){
  const qs = quizState;
  try{
    await finishQuizInner();
  }catch(err){
    console.error('Error al finalizar el test', err);
    if(qs && qs.mode){
      qs.finishing = false;
      ['quizFinishBtn','quizFinishTopBtn','quizNextBtn'].forEach(id => {
        const el = document.getElementById(id); if(el) el.disabled = false;
      });
    }
  }
}
async function finishQuizInner(){
  // Si finishQuiz() ya está en marcha (p. ej. el usuario ha pulsado "Finalizar"
  // varias veces mientras se guardaba en Supabase), ignoramos las llamadas
  // repetidas: sin esto, cada clic de más creaba una sesión duplicada en el
  // historial.
  if(quizState.finishing) return;
  quizState.finishing = true;
  const finishBtn = document.getElementById('quizFinishBtn');
  if(finishBtn) finishBtn.disabled = true;
  const nextBtn = document.getElementById('quizNextBtn');
  if(nextBtn) nextBtn.disabled = true;

  clearInterval(timerInterval);

  // En modo tarjeta (estudio/fallos), si se finaliza antes de tiempo, las
  // preguntas posteriores que nunca se llegaron a ver (quizState.visited)
  // no forman parte de esta sesión: no cuentan como falladas, ni como
  // pendientes, ni en el total. Es como si el test hubiera tenido desde el
  // principio solo las preguntas que de verdad se han visto. En modo lista
  // (examen/simulacro) no cambia nada: ahí todas las preguntas están
  // visibles desde el principio.
  const visited = quizState.visited;
  const sessionIndices = (quizState.viewMode === 'card' && visited)
    ? ACTIVE_QUESTIONS.map((_, i) => i).filter(i => visited[i])
    : ACTIVE_QUESTIONS.map((_, i) => i);
  const SESSION_QUESTIONS = sessionIndices.map(i => ACTIVE_QUESTIONS[i]);
  const SESSION_ANSWERS = sessionIndices.map(i => quizState.answers[i]);

  const total = SESSION_QUESTIONS.length;
  const correctCount = SESSION_QUESTIONS.reduce((acc, q, j) => acc + (SESSION_ANSWERS[j] === q.correct ? 1 : 0), 0);
  quizState.correctCount = correctCount;
  document.getElementById('resultScore').textContent = correctCount;
  document.getElementById('resultTotal').textContent = total;

  const blank = SESSION_ANSWERS.filter(a => a === null || a === undefined).length;
  const bad = total - correctCount - blank;
  // Sistema de puntuación tipo oposición: acertar suma 1 punto, fallar
  // resta 1/(nº de opciones de esa pregunta - 1) —es decir, lo que en
  // media "cuesta" un fallo si se responde al azar—, y dejar en blanco
  // ("no me la juego") no suma ni resta nada. La nota nunca baja de 0.
  let earnedPoints = 0;
  SESSION_QUESTIONS.forEach((q, j) => {
    const a = SESSION_ANSWERS[j];
    if(a === null || a === undefined) return; // en blanco: no cuenta
    if(a === q.correct){
      earnedPoints += 1;
    } else {
      const numOptions = (q.options && q.options.length) || 4;
      const penalty = numOptions > 1 ? 1 / (numOptions - 1) : 0;
      earnedPoints -= penalty;
    }
  });
  const notaNum = total ? Math.max(0, (earnedPoints / total) * 10) : 0;
  const elapsedSec = quizState.startedAt ? Math.round((Date.now() - quizState.startedAt) / 1000) : 0;
  const MODE_LABELS = HISTORY_MODE_LABELS;

  let sessionId = 'r' + Date.now();

  const sessionPayload = {
    user_id: currentUser ? currentUser.id : null,
    mode: quizState.mode,
    score: Number(notaNum.toFixed(2)),
    total, ok: quizState.correctCount, bad, pending: blank,
    time_seconds: elapsedSec
  };
  // Las falladas (o en blanco) pasan al Repaso diario.
  try{
    if(typeof NQ !== 'undefined' && NQ.addFailedQuestion){
      SESSION_QUESTIONS.forEach((q, j) => { if(SESSION_ANSWERS[j] !== q.correct) NQ.addFailedQuestion(q.id); });
    }
  }catch(e){}
  const answerRowsFor = sid => SESSION_QUESTIONS.map((q, j) => {
    const a = SESSION_ANSWERS[j];
    // Si esta pregunta se barajó para este intento (q._optionOrder),
    // lo que se guarda es el índice de la opción en su orden
    // ORIGINAL de la base de datos, no la posición en la que se
    // mostró aquí. Así, si más adelante se revisa este test desde el
    // historial (p. ej. tras recargar la página, cuando la pregunta
    // se vuelve a pedir a la BD en su orden canónico), la corrección
    // sigue siendo exacta.
    const canonicalIndex = (a === null || a === undefined)
      ? null
      : (q._optionOrder ? q._optionOrder[a] : a);
    // En blanco (a === null/undefined) cuenta como fallada: se guarda
    // is_correct = false, igual que una respuesta incorrecta. Así entra
    // en Fallos y en Test Inteligente como cualquier otro fallo.
    return {
      session_id: sid, user_id: currentUser.id, question_id: q.id,
      selected_index: canonicalIndex,
      is_correct: a === q.correct, answer_order: j
    };
  });

  if(currentUser && !navigator.onLine){
    // Sin conexión: el resultado se guarda en el dispositivo y se sube solo
    // en cuanto vuelva la conexión (ver flushPendingResults).
    queuePendingResult({ session: sessionPayload, answers: answerRowsFor(null) });
    uiToast('Estás sin conexión: el resultado se guardará en cuanto vuelva internet.', 'info');
  } else if(currentUser){
    let savedSessionId = null, answersSaved = false;
    await Promise.race([ (async () => {
    try{
      const { data: sessionRow, error: sErr } = await sb.from('test_sessions').insert(sessionPayload).select().single();
      if(sErr) throw sErr;
      sessionId = sessionRow.id;
      savedSessionId = sessionRow.id;

      const answerRows = answerRowsFor(sessionId);
      if(answerRows.length){
        const { error: aErr } = await sb.from('session_answers').insert(answerRows);
        if(aErr) throw aErr;
      }
      answersSaved = true;

      // El estado de cada pregunta (fallada / en progreso / dominada) ya no
      // se guarda aparte: loadAppData() lo recalcula del tirón a partir de
      // session_answers, que es lo que se acaba de insertar arriba.
      await loadAppData();
      await refreshGlobalStats();
    } catch(err){
      console.error('Error guardando la sesión en Supabase', err);
      // Si falló por la red, no se pierde: se guarda para subirlo después.
      if(answersSaved){
        // El test ya está guardado; solo falló refrescar los datos después.
      } else if(!navigator.onLine || /fetch|network|load failed|conexi|timeout/i.test(String(err && (err.message || err)))){
        queuePendingResult(savedSessionId
          ? { sessionId: savedSessionId, answers: answerRowsFor(savedSessionId) }
          : { session: sessionPayload, answers: answerRowsFor(null) });
        uiToast('No hay conexión: el resultado se guardará en cuanto vuelva internet.', 'info');
      } else {
        reportClientError('guardar-test', 'No se pudo guardar un test: ' + (err && (err.message || err)));
      }
    }
    })(), new Promise(res => setTimeout(res, 15000)) ]);
  }

  const entry = {
    id: sessionId,
    date: 'Ahora mismo',
    type: quizState.mode,
    title: MODE_LABELS[quizState.mode] || 'Test',
    nota: formatNota(notaNum),
    time: formatMMSS(elapsedSec),
    ok: quizState.correctCount,
    bad: bad,
    pending: blank,
    review: { questions: SESSION_QUESTIONS.slice(), answers: SESSION_ANSWERS.slice() }
  };
  // El Test Inteligente va a su propio historial (dentro de su pantalla),
  // no al Historial general de Examen/Estudio/Simulacro/Fallos.
  if(quizState.mode === 'inteligente'){ SMART_HISTORY.unshift(entry); renderSmartHistory(); }
  else { HISTORY.unshift(entry); renderHistory(); }
  lastFinishedReviewId = entry.id;

  // el test ya ha terminado: se libera el bloqueo de las demás tarjetas de home
  quizState.mode = null;
  quizSecondsLeft = null;
  clearQuizProgress();

  showScreen('screen-result');
}
function openLastReview(){
  const entry = HISTORY.find(h => h.id === lastFinishedReviewId) || SMART_HISTORY.find(h => h.id === lastFinishedReviewId);
  if(entry && entry.review) openReview(entry.review, entry.title + ' · Nota ' + entry.nota);
}

/* ---------- review / corrección ---------- */
let currentReview = null;
let reviewFilter = 'todas';

function computeReviewCounts(review){
  let correct = 0, bad = 0, blank = 0;
  review.questions.forEach((q, i) => {
    const a = review.answers[i];
    if(a === null || a === undefined) blank++;
    else if(a === q.correct) correct++;
    else bad++;
  });
  return { total: review.questions.length, correct, bad, blank };
}
function reviewFilteredIndexes(){
  const idxs = [];
  currentReview.questions.forEach((q, i) => {
    const a = currentReview.answers[i];
    const isBlank = (a === null || a === undefined);
    const isCorrect = !isBlank && a === q.correct;
    if(reviewFilter === 'todas') idxs.push(i);
    else if(reviewFilter === 'correctas' && isCorrect) idxs.push(i);
    else if(reviewFilter === 'incorrectas' && !isBlank && !isCorrect) idxs.push(i);
    else if(reviewFilter === 'blanco' && isBlank) idxs.push(i);
  });
  return idxs;
}
function openReview(review, title){
  currentReview = review;
  reviewFilter = 'todas';
  document.getElementById('reviewTitle').textContent = title || 'Corrección';
  renderReviewFilters();
  renderReviewList();
  showScreen('screen-review');
}
function renderReviewFilters(){
  const c = computeReviewCounts(currentReview);
  const wrap = document.getElementById('reviewFilters');
  const defs = [
    { id:'todas', label:'Todas', count:c.total },
    { id:'correctas', label:'Correctas', count:c.correct },
    { id:'incorrectas', label:'Incorrectas', count:c.bad },
    { id:'blanco', label:'En blanco', count:c.blank }
  ];
  wrap.innerHTML = '';
  defs.forEach(d => {
    const el = document.createElement('div');
    el.className = 'param-opt' + (reviewFilter === d.id ? ' selected' : '');
    el.setAttribute('role','button'); el.setAttribute('tabindex','0');
    el.textContent = d.label + ' · ' + d.count;
    el.onclick = () => { reviewFilter = d.id; renderReviewFilters(); renderReviewList(); };
    el.onkeydown = (e) => { if(e.key === 'Enter') el.onclick(); };
    wrap.appendChild(el);
  });
}
/* Pinta TODAS las preguntas del filtro seguidas, una tarjeta debajo de otra
   (igual que la vista de lista de examen/simulacro), en vez de tener que
   pasarlas de una en una con "Anterior/Siguiente". */
function renderReviewList(){
  const idxs = reviewFilteredIndexes();
  const body = document.getElementById('reviewBody');
  if(idxs.length === 0){
    body.innerHTML = '<div class="empty">No hay preguntas en este filtro.</div>';
    return;
  }
  const showExplain = document.getElementById('reviewExplainToggle').classList.contains('on');
  const letters = ['A','B','C','D'];

  body.innerHTML = idxs.map(qi => {
    const q = currentReview.questions[qi];
    const userAnswer = currentReview.answers[qi];

    let html = '<div class="quiz-list-item">';
    html += '<div class="review-report" role="button" tabindex="0" onclick="reportReviewQuestion(' + qi + ')">' + ICONS.warn + ' Impugnar</div>';
    html += '<div class="question">' + (qi + 1) + '. ' + q.q + '</div>';
    html += '<div class="options">';
    q.options.forEach((opt, i) => {
      let cls = 'option', icon = '';
      if(i === q.correct){ cls += ' correct' + ((userAnswer === null || userAnswer === undefined) ? ' blank-correct' : ''); icon = '<span class="opt-result" style="display:block">' + ICONS.check + '</span>'; }
      else if(i === userAnswer){ cls += ' incorrect'; icon = '<span class="opt-result" style="display:block">' + ICONS.cross + '</span>'; }
      html += '<div class="' + cls + '"><span class="opt-badge">' + letters[i] + '</span><span class="opt-text">' + opt + '</span>' + icon + '</div>';
    });
    html += '</div>';
    if(userAnswer === null || userAnswer === undefined){
      html += '<div style="font-size:12.5px; color:var(--muted-2); margin-top:12px;">No respondiste esta pregunta.</div>';
    }
    if(showExplain){
      html += '<div class="explain show">' + explainMetaHtml(q) + explainBodyHtml(q) + '</div>';
    }
    html += '</div>';
    return html;
  }).join('');
}
function toggleReviewExplain(){
  document.getElementById('reviewExplainToggle').classList.toggle('on');
  renderReviewList();
}
function reportReviewQuestion(qi){
  uiToast('Gracias, hemos recibido tu impugnación de esta pregunta.');
}

document.addEventListener('keydown', function(e){
  if(e.key === 'Escape'){
    closeSettingSheet();
    closeTopicDetail();
  }
  if(e.key === 'Enter' || e.key === ' '){
    const el = e.target;
    if(el && el.matches && el.matches('[role="button"]')){
      e.preventDefault();
      el.click();
    }
  }
});
