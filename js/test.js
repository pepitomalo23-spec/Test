/* Test en curso: empezar, reanudar, temporizador, pintar la pregunta,
   responder y moverse entre preguntas. */

/* ---------- quiz ---------- */
const QUIZ_LIST_MODES = ['examen', 'simulacro']; // estas modalidades muestran todas las preguntas seguidas, sin corrección inmediata
function startQuiz(mode, questions, timeMinutes){
  const base = (questions && questions.length) ? questions : QUESTIONS_POOL;
  ACTIVE_QUESTIONS = shuffleArray(base).map(shuffleQuestionOptions); // el orden de las preguntas Y de sus opciones A/B/C/D es aleatorio en cada intento (salvo preguntas del tipo "A y B son correctas")
  const viewMode = QUIZ_LIST_MODES.includes(mode) ? 'list' : 'card';
  // "visited" marca qué preguntas ha llegado a ver realmente el usuario (se
  // rellena en renderQuestion). Es clave en modo tarjeta (estudio/fallos):
  // si se finaliza el test antes de llegar al final, las preguntas
  // posteriores que nunca se mostraron no deben contar en absoluto (ni
  // como falladas ni como pendientes) en las Estadísticas.
  quizState = { mode, viewMode, index:0, answered:false, answers:new Array(ACTIVE_QUESTIONS.length).fill(null), blanked:new Array(ACTIVE_QUESTIONS.length).fill(false), visited:new Array(ACTIVE_QUESTIONS.length).fill(false), startedAt:Date.now(), timeMinutes };
  saveQuizProgress();
  showScreen('screen-quiz');
  document.getElementById('quizCardView').style.display = (viewMode === 'card') ? 'block' : 'none';
  document.getElementById('quizListView').style.display = (viewMode === 'list') ? 'block' : 'none';
  // el contador de progreso ahora se muestra en todos los modos, incluido
  // el modo tarjeta (estudio / fallos / inteligente)
  document.getElementById('quizCount').style.display = '';
  // el botón "Finalizar" de la esquina es propio de la vista tarjeta: en
  // examen/simulacro (vista lista) ya existe su propio botón "Finalizar"
  // al final del listado.
  document.getElementById('quizFinishTopBtn').style.display = '';
  startTimer(timeMinutes);
  if(viewMode === 'card'){
    renderQuestion();
  } else {
    renderQuizList();
  }
}

/* ---------- reanudar un test dejado a medias (desde la tarjeta bloqueada de home) ---------- */
function resumeQuiz(){
  if(!quizState || !quizState.mode) return;
  showScreen('screen-quiz');
  document.getElementById('quizCardView').style.display = (quizState.viewMode === 'card') ? 'block' : 'none';
  document.getElementById('quizListView').style.display = (quizState.viewMode === 'list') ? 'block' : 'none';
  document.getElementById('quizCount').style.display = '';
  document.getElementById('quizFinishTopBtn').style.display = '';
  if(quizState.viewMode === 'card'){
    renderQuestion();
  } else {
    renderQuizList();
  }
  // continúa la cuenta atrás desde donde se quedó en vez de reiniciarla desde el total
  if(quizState.timeMinutes){
    startTimer(quizState.timeMinutes, quizSecondsLeft != null ? quizSecondsLeft : undefined);
  } else {
    startTimer(null);
  }
}

let quizSecondsLeft = null;
function startTimer(minutes, resumeSeconds){
  clearInterval(timerInterval);
  const timerEl = document.getElementById('quizTimer');
  if(!minutes){
    timerEl.style.display = 'none';
    return;
  }
  timerEl.style.display = 'flex';
  timerEl.classList.remove('urgent');
  let secondsLeft = (typeof resumeSeconds === 'number') ? resumeSeconds : minutes * 60;
  quizSecondsLeft = secondsLeft;
  updateTimerDisplay(secondsLeft);
  if(secondsLeft <= 60) timerEl.classList.add('urgent');
  timerInterval = setInterval(() => {
    secondsLeft--;
    quizSecondsLeft = secondsLeft;
    if(secondsLeft <= 0){
      clearInterval(timerInterval);
      updateTimerDisplay(0);
      finishQuiz();
      return;
    }
    if(secondsLeft <= 60) timerEl.classList.add('urgent');
    updateTimerDisplay(secondsLeft);
  }, 1000);
}

function updateTimerDisplay(s){
  const m = Math.floor(s / 60);
  const sec = s % 60;
  document.getElementById('quizTimerText').textContent = String(m).padStart(2,'0') + ':' + String(sec).padStart(2,'0');
}

/* Bloque "ubicación (azul) + panel de veces fallada" que se muestra como lo
   primero dentro de la explicación, no como cabecera fija de la pregunta.
   nowCorrect (opcional) es el resultado de la respuesta que se ACABA de dar
   en el test que se está haciendo ahora mismo (true = acierto, false =
   fallo/en blanco), que todavía no está guardado en Supabase (eso se hace
   al terminar el test, en finishQuiz). Si se pasa, el contador de "Fallada
   X veces" y el panel de historial (ver toggleFailHistory) lo tienen en
   cuenta al momento, marcado como "Ahora". Si no se pasa (undefined/null),
   se usa solo lo que ya había guardado antes de empezar este test — es el
   caso de las pantallas de repaso/consulta fuera de un test en curso. */
function explainMetaHtml(q, nowCorrect){
  const liveFail = (nowCorrect === false) ? 1 : 0;
  const shownFailCount = (q.failCount || 0) + liveFail;
  const nowArg = (nowCorrect === true || nowCorrect === false) ? nowCorrect : 'null';
  return '<div class="explain-meta">' +
    '<div class="article-tag' + (q.general ? ' general' : '') + '">' +
      ICONS.seal + '<span>' + (q.general ? generalTagText(q) : q.art) + '</span>' +
    '</div>' +
    '<div class="fail-history-toggle" role="button" tabindex="0" ' +
      'onclick="toggleFailHistory(\'' + q.id + '\', this, ' + nowArg + ')" ' +
      'onkeydown="if(event.key===\'Enter\'||event.key===\' \'){event.preventDefault();this.click();}">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12a8 8 0 1 1 2.3 5.6"/><polyline points="4,17 4,12 9,12"/></svg>' +
      '<span>Fallada <b>' + shownFailCount + '</b> veces</span>' +
      '<span class="chev">' + ICONS.chevron + '</span>' +
    '</div>' +
    '<div class="fail-history-panel"></div>' +
    '</div>' +
    '<hr class="explain-divider">';
}

/* Abre/cierra el panel con el historial de intentos de una pregunta (más
   reciente primero), con un check o una X roja según acertaras o fallaras
   ese día. Se carga una sola vez de Supabase y se guarda en el propio panel.
   nowCorrect (opcional, true/false): si la pregunta se acaba de responder
   en el test actual, añade una fila extra arriba del todo con "Ahora" en
   vez de fecha, aunque ese intento todavía no esté en Supabase (se guarda
   al terminar el test). */
async function toggleFailHistory(questionId, toggleEl, nowCorrect){
  const panel = toggleEl.nextElementSibling;
  if(!panel || !panel.classList.contains('fail-history-panel')) return;

  const isOpen = panel.classList.contains('open');
  if(isOpen){
    panel.classList.remove('open');
    toggleEl.classList.remove('open');
    return;
  }
  toggleEl.classList.add('open');
  panel.classList.add('open');

  if(panel.dataset.loaded === '1') return; // ya se cargó antes, no repetir la consulta

  const hasNow = (nowCorrect === true || nowCorrect === false);
  const nowRowHtml = hasNow
    ? ('<div class="fail-history-row fh-now">' +
        (nowCorrect
          ? '<span class="fh-ok"><span class="fh-badge">' + ICONS.check + '</span></span>'
          : '<span class="fh-bad"><span class="fh-badge">' + ICONS.cross + '</span></span>') +
        '<span class="fh-now-label">Ahora</span>' +
      '</div>')
    : '';

  if(!currentUser){
    panel.innerHTML = nowRowHtml || '<div class="fail-history-empty">Inicia sesión para ver tu historial de intentos.</div>';
    if(hasNow) panel.dataset.loaded = '1';
    return;
  }

  panel.innerHTML = nowRowHtml + '<div class="fail-history-loading">' + skelList(2, false) + '</div>';
  try{
    const { data, error } = await sb
      .from('session_answers')
      .select('is_correct, test_sessions!inner(created_at)')
      .eq('user_id', currentUser.id)
      .eq('question_id', questionId);
    if(error) throw error;

    const rows = (data || [])
      .filter(r => r.test_sessions && r.test_sessions.created_at)
      .sort((a, b) => new Date(b.test_sessions.created_at) - new Date(a.test_sessions.created_at));

    if(!rows.length && !hasNow){
      panel.innerHTML = '<div class="fail-history-empty">Todavía no has respondido esta pregunta en ningún test.</div>';
    } else {
      const rowsHtml = rows.map(r => {
        const d = new Date(r.test_sessions.created_at);
        const dateStr = d.toLocaleDateString('es-ES', { day:'2-digit', month:'short', year:'numeric' });
        const icon = r.is_correct
          ? '<span class="fh-ok"><span class="fh-badge">' + ICONS.check + '</span></span>'
          : '<span class="fh-bad"><span class="fh-badge">' + ICONS.cross + '</span></span>';
        return '<div class="fail-history-row">' + icon + '<span>' + dateStr + '</span></div>';
      }).join('');
      // "Ahora" va siempre el primero: es más reciente que cualquier fecha guardada.
      panel.innerHTML = nowRowHtml + rowsHtml;
    }
    panel.dataset.loaded = '1';
  } catch(err){
    console.error('Error cargando el historial de intentos', err);
    panel.innerHTML = nowRowHtml + '<div class="fail-history-empty">No se ha podido cargar el historial. Inténtalo de nuevo.</div>';
  }
}

/* Cuerpo de la explicación: el texto guardado + un botón "IA" en la esquina
   que, al pulsarlo, pide a Gemini una explicación más completa y la añade
   debajo de todo. Usa la clave única configurada por el administrador en
   el servidor (Cambios BOE → Administración), vía la Edge Function
   gemini-proxy: nunca hace falta que el usuario tenga su propia clave. */
function noteBtnHtml(questionId){
  return '<button type="button" class="own-note-btn" onclick="event.stopPropagation();openOwnNoteEditor(\'' + questionId + '\', this)" title="Escribir vuestra propia explicación">' +
      ICONS.pencil + '<span>Nota</span>' +
    '</button>';
}
/* Sigue qué preguntas tienen una subida de imagen en curso (por id), para
   poder mostrar el spinner correspondiente tanto si el usuario se queda
   en esa pregunta como si navega a otras mientras se sube en segundo
   plano, y para poder repintar el botón cuando termine sin depender de
   un elemento del DOM que pueda haber quedado obsoleto tras navegar. */
const pendingNoteImageUploads = {};

/* Bandeja global de miniaturas "subiendo…" en la cabecera del test. Es
   independiente de qué pregunta o pantalla se esté viendo: mientras el
   test siga abierto (aunque se haya salido a Inicio) las subidas siguen
   en marcha y esta bandeja, si el elemento existe en pantalla, refleja
   el estado real en cada momento. */
let uploadTrayItems = [];
function addUploadTrayItem(file){
  const id = 'up_' + Date.now() + '_' + Math.random().toString(36).slice(2,8);
  uploadTrayItems.push({ id, url: URL.createObjectURL(file) });
  renderUploadTray();
  return id;
}
function removeUploadTrayItem(id){
  const item = uploadTrayItems.find(it => it.id === id);
  if(item) URL.revokeObjectURL(item.url);
  uploadTrayItems = uploadTrayItems.filter(it => it.id !== id);
  renderUploadTray();
}
function renderUploadTray(){
  const el = document.getElementById('quizUploadTray');
  if(!el) return;
  el.innerHTML = uploadTrayItems.map(it =>
    '<span class="quiz-upload-thumb"><img src="' + it.url + '" alt=""></span>'
  ).join('');
}

function quickImageBtnInnerHtml(questionId){
  const inputId = 'quickImg_' + questionId;
  if(pendingNoteImageUploads[questionId]){
    return '<button type="button" class="own-note-image-btn loading" disabled title="Subiendo imagen…">' + ICONS.spinner + '</button>';
  }
  return '<button type="button" class="own-note-image-btn" onclick="event.stopPropagation();document.getElementById(\'' + inputId + '\').click()" title="Añadir una imagen (se guarda al instante)">' +
      ICONS.image +
    '</button>' +
    '<input type="file" accept="image/*" multiple id="' + inputId + '" class="own-note-quick-image-input" style="display:none" onchange="event.stopPropagation();quickAddOwnNoteImages(\'' + questionId + '\', this)">';
}
/* Botón redondo, solo icono, para añadir una imagen al momento sin pasar
   por el editor de texto: al elegir el archivo se sube y se guarda ya,
   sin tener que pulsar "Guardar" aparte. Mientras se sube (aquí o ya en
   segundo plano si se cambió de pregunta) muestra un spinner de carga. */
function quickImageBtnHtml(questionId){
  return '<span class="own-note-image-wrap-btn" id="qimgWrap_' + questionId + '">' + quickImageBtnInnerHtml(questionId) + '</span>';
}
/* Repinta el botón de imagen de una pregunta si está actualmente visible
   en pantalla (si el usuario ha navegado a otra pregunta, no hay nada que
   repintar: la próxima vez que se vuelva a esa pregunta se pintará ya con
   el estado correcto, porque explainBodyHtml consulta pendingNoteImageUploads). */
function refreshQuickImageBtnUI(questionId){
  const wrap = document.getElementById('qimgWrap_' + questionId);
  if(wrap) wrap.innerHTML = quickImageBtnInnerHtml(questionId);
}
function explainBodyHtml(q){
  const generateBtn = '<button type="button" class="ia-explain-btn" onclick="event.stopPropagation();generateIAExplain(\'' + q.id + '\', this)" title="Pedir una explicación más completa con IA">' +
      ICONS.brain + '<span>IA</span>' +
    '</button>';
  return '<div class="explain-body" data-qid="' + q.id + '">' +
    '<div class="explain-section-head">' +
      '<div class="explain-section-label"><span class="explain-icon-badge">' + ICONS.bulb + '</span><span>Explicación</span></div>' +
      '<div class="explain-section-actions">' +
        (!featureEnabled('notas_ia') ? '' : (q.ai_explain ? '' : generateBtn)) +
        (!featureEnabled('notas_ia') ? '' : quickImageBtnHtml(q.id)) +
        (!featureEnabled('notas_ia') ? '' : (q.own_note ? '' : noteBtnHtml(q.id))) +
      '</div>' +
    '</div>' +
    '<div class="explain-text">' + q.explain + '</div>' +
    '<div class="own-note-editor-slot"></div>' +
    '<div class="own-note-result' + (q.own_note ? ' show' : '') + '">' +
      (q.own_note ? ownNoteCardHtml(q.own_note, q.id) : '') +
    '</div>' +
    '<div class="ia-explain-result' + (q.ai_explain ? ' show' : '') + '"' + (q.ai_explain ? ' data-loaded="1"' : '') + '>' +
      (q.ai_explain ? aiExplainCardHtml(q.ai_explain, q.id) : '') +
    '</div>' +
  '</div>';
}

/* Devuelve la lista de URLs de imagen de una nota propia, sin importar si
   viene en el formato nuevo (image_urls: array, hasta 5) o en el formato
   antiguo (image_url: una sola cadena) de notas guardadas antes del cambio
   a múltiples imágenes. */
function ownNoteImageUrls(note){
  if(!note) return [];
  if(Array.isArray(note.image_urls)) return note.image_urls.filter(Boolean);
  if(note.image_url) return [note.image_url];
  return [];
}

function renderQuestion(){
  // defensivo: si el quizState viene de una versión antigua sin "visited"
  // (p. ej. un test dejado a medias antes de este cambio), se crea aquí.
  if(!quizState.visited) quizState.visited = new Array(ACTIVE_QUESTIONS.length).fill(false);
  quizState.visited[quizState.index] = true;
  const q = ACTIVE_QUESTIONS[quizState.index];
  const existingAnswer = quizState.answers[quizState.index];
  const isBlanked = !!(quizState.blanked && quizState.blanked[quizState.index]);
  const isAnswered = (existingAnswer !== null && existingAnswer !== undefined) || isBlanked;
  quizState.answered = isAnswered;

  document.getElementById('quizCount').textContent = (quizState.index+1) + ' / ' + ACTIVE_QUESTIONS.length;
  document.getElementById('quizQuestion').textContent = q.q;

  const optsEl = document.getElementById('quizOptions');
  optsEl.innerHTML = '';
  const letters = ['A','B','C','D'];
  q.options.forEach((opt,i) => {
    const div = document.createElement('div');
    div.className = 'option';
    div.setAttribute('role','button');
    div.setAttribute('tabindex','0');
    div.innerHTML = '<span class="opt-badge">' + letters[i] + '</span><span class="opt-text">' + opt + '</span><span class="opt-result"></span>';
    if(isAnswered){
      if(i === q.correct){
        div.classList.add('correct');
        if(isBlanked) div.classList.add('blank-correct');
        div.querySelector('.opt-result').innerHTML = ICONS.check;
      } else if(i === existingAnswer){
        div.classList.add('incorrect');
        div.querySelector('.opt-result').innerHTML = ICONS.cross;
      }
    } else {
      div.onclick = () => selectOption(i);
    }
    optsEl.appendChild(div);
  });

  // la explicación siempre arranca colapsada al entrar/volver a una pregunta
  const explainEl = document.getElementById('quizExplain');
  explainEl.classList.remove('show');
  // Si ya está respondida (aunque sea al volver atrás con "Anterior"), sigue
  // siendo "ahora": el intento pertenece a este mismo test todavía sin
  // guardar en Supabase, así que el historial también debe marcarlo así.
  const nowCorrect = isAnswered ? (isBlanked ? false : (existingAnswer === q.correct)) : null;
  explainEl.innerHTML = isAnswered
    ? (explainMetaHtml(q, nowCorrect) + explainBodyHtml(q))
    : '';

  renderQuizPill();
  document.getElementById('quizPrevBtn').disabled = quizState.index === 0;
  const isLastQuestion = quizState.index === ACTIVE_QUESTIONS.length - 1;
  // En la última pregunta, "siguiente" ya no sirve para nada (no hay más
  // preguntas): en vez de dejarlo deshabilitado/grisáceo, se quita del
  // todo de la barra inferior. Para terminar el test hay que usar el
  // botón "Finalizar" de la esquina superior derecha, que se ilumina en
  // blanco (clase .ready) para indicar que ya se puede pulsar.
  const nextBtn = document.getElementById('quizNextBtn');
  if(isLastQuestion){
    nextBtn.style.display = 'none';
  } else {
    nextBtn.style.display = '';
    nextBtn.disabled = !isAnswered;
  }
  nextBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9,6 15,12 9,18"/></svg>';
  const finishTopBtn = document.getElementById('quizFinishTopBtn');
  if(finishTopBtn) finishTopBtn.classList.toggle('ready', isLastQuestion && isAnswered);
}

function renderQuizPill(){
  const pill = document.getElementById('quizPill');
  const explainOpen = document.getElementById('quizExplain').classList.contains('show');
  if(!quizState.answered){
    pill.className = 'quiz-pill clickable';
    pill.onclick = markBlank;
    pill.innerHTML = 'En blanco';
  } else {
    pill.className = 'quiz-pill clickable' + (explainOpen ? ' open' : '');
    pill.onclick = toggleExplain;
    pill.innerHTML = (explainOpen ? 'Ocultar explicación' : 'Mostrar explicación') + '<span class="chev">' + ICONS.chevron + '</span>';
  }
}

function toggleExplain(){
  document.getElementById('quizExplain').classList.toggle('show');
  renderQuizPill();
}

function selectOption(i){
  if(quizState.answered) return;
  quizState.answered = true;
  quizState.answers[quizState.index] = i;
  const q = ACTIVE_QUESTIONS[quizState.index];
  document.querySelectorAll('#quizOptions .option').forEach((el,idx) => {
    el.onclick = null;
    if(idx === q.correct){
      el.classList.add('correct');
      el.querySelector('.opt-result').innerHTML = ICONS.check;
    } else if(idx === i){
      el.classList.add('incorrect');
      el.querySelector('.opt-result').innerHTML = ICONS.cross;
    }
  });
  const explainEl = document.getElementById('quizExplain');
  explainEl.innerHTML = explainMetaHtml(q, i === q.correct) + explainBodyHtml(q);
  explainEl.classList.remove('show'); // queda oculta hasta que se pulse "Mostrar explicación"
  renderQuizPill();
  document.getElementById('quizNextBtn').disabled = false;
  saveQuizProgress();
}

/* "En blanco": deja la pregunta sin respuesta seleccionada pero revela la solución y permite avanzar */
function markBlank(){
  if(quizState.answered) return;
  quizState.answered = true;
  if(!quizState.blanked) quizState.blanked = new Array(ACTIVE_QUESTIONS.length).fill(false);
  quizState.blanked[quizState.index] = true;
  const q = ACTIVE_QUESTIONS[quizState.index];
  document.querySelectorAll('#quizOptions .option').forEach((el,idx) => {
    el.onclick = null;
    if(idx === q.correct){
      el.classList.add('correct', 'blank-correct');
      el.querySelector('.opt-result').innerHTML = ICONS.check;
    }
  });
  const explainEl = document.getElementById('quizExplain');
  // En blanco cuenta como fallo (igual que al guardar en session_answers).
  explainEl.innerHTML = explainMetaHtml(q, false) + explainBodyHtml(q);
  explainEl.classList.remove('show'); // queda oculta hasta que se pulse "Mostrar explicación"
  renderQuizPill();
  document.getElementById('quizNextBtn').disabled = false;
  saveQuizProgress();
}

function prevQuestion(){
  if(quizState.index > 0){
    quizState.index--;
    renderQuestion();
    saveQuizProgress();
  }
}

function nextQuestion(){
  if(quizState.index < ACTIVE_QUESTIONS.length - 1){
    quizState.index++;
    renderQuestion();
    saveQuizProgress();
  }
  // en la última pregunta no se hace nada más aquí: el botón queda
  // deshabilitado/grisáceo y para terminar hay que usar "Finalizar"
  // (esquina superior derecha).
}
