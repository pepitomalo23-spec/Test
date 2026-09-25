/* Preparar un test: configuración, ajustes, elección de temas, repaso
   «Vuelta», barajado de opciones y pantalla de Fallos. */

/* ---------- config screen (estudio / examen / simulacro) ---------- */
function openConfig(mode){
  if((mode === 'simulacro' || mode === 'examen') && !featureEnabled(mode)) return;
  if(whenAppDataReady(() => openConfig(mode))) return;
  if(quizState && quizState.mode && quizState.mode !== mode) return; // hay un test en curso en otro apartado
  configState.mode = mode;
  // Antes se marcaban todos los temas por defecto al abrir esta pantalla
  // por primera vez. Ahora "Seleccionar todo" y cada tema individual se
  // quedan desactivados salvo que el usuario los active él mismo.
  document.getElementById('screen-config').setAttribute('data-mode', mode);

  const titles = {
    estudio: 'Estudio',
    examen: 'Configura tu examen',
    simulacro: 'Configura tu simulacro'
  };
  const subs = {
    estudio: 'Selecciona uno o varios temas. El test se generará solo con preguntas de la legislación elegida.',
    examen: 'Elige los temas, cuántas preguntas quieres y de cuánto tiempo dispones.',
    simulacro: 'Preguntas de toda la legislación. Elige cuántas quieres y de cuánto tiempo dispones.'
  };
  document.getElementById('configTitle').textContent = titles[mode];
  document.getElementById('configSub').textContent = subs[mode];

  document.getElementById('configTopicsBlock').style.display = (mode === 'estudio' || mode === 'examen') ? 'block' : 'none';
  document.getElementById('configParamsBlock').style.display = (mode === 'examen') ? 'block' : 'none';
  document.getElementById('configTimeBlock').style.display = (mode === 'examen') ? 'block' : 'none';
  document.getElementById('configSettingsBlock').style.display = (mode === 'estudio' || mode === 'simulacro') ? 'block' : 'none';
  document.getElementById('configSub').style.display = (mode === 'estudio') ? 'none' : 'block';

  renderSettings();
  renderTemas();
  renderParamOptions();
  showScreen('screen-home');
  openOverlay('screen-config');
}

/* ---------- ajustes (minutos / preguntas / dificultad / ayuda / repaso) ---------- */
function renderSettings(){
  if(configState.mode === 'simulacro'){
    const simRows = [
      { key:'time', icon: ICONS.timer, label:'Minutos',
        options: TIME_OPTIONS.map(v => ({ value:v, label: v + ' min' })) },
      { key:'count', icon: ICONS.doc, label:'Preguntas',
        options: COUNT_OPTIONS.map(v => ({ value:v, label: v + ' preguntas' })) }
    ];
    const simEl = document.getElementById('settingsList');
    simEl.innerHTML = '';
    simRows.forEach(r => {
      const current = r.options.find(o => o.value === configState[r.key]);
      const row = document.createElement('div');
      row.className = 'settings-row';
      row.setAttribute('role','button'); row.setAttribute('tabindex','0');
      row.innerHTML =
        '<span class="settings-row-icon">' + r.icon + '</span>' +
        '<span class="settings-row-label">' + r.label + '</span>' +
        '<span class="settings-row-value">' + (current ? current.label : '') + '</span>' +
        '<span class="settings-row-chevron">' + ICONS.chevron + '</span>';
      row.onclick = () => openSettingSheet(r.key, r.label, r.options);
      simEl.appendChild(row);
    });
    updateConfigFooter();
    return;
  }
  if(configState.mode !== 'estudio') return;
  const rows = [
    { key:'minutos', icon: ICONS.timer, label:'Minutos',
      options: MINUTOS_OPTIONS.map(v => ({ value:v, label: v ? (v + ' min') : 'Sin límite' })) },
    { key:'preguntas', icon: ICONS.doc, label:'Preguntas',
      options: PREGUNTAS_OPTIONS.map(v => ({ value:v, label: v ? (v + ' preguntas') : 'Sin límite' })) },
    { key:'dificultad', icon: ICONS.chart, label:'Dificultad',
      options: DIFICULTAD_OPTIONS.map(v => ({ value:v, label: DIFICULTAD_LABELS[v] })) },
    { key:'ayuda', icon: ICONS.info, label:'Ayuda',
      options: AYUDA_OPTIONS.map(v => ({ value:v, label: AYUDA_LABELS[v] })) },
    { key:'repaso', icon: ICONS.brain, label:'Repaso Inteligente',
      options: REPASO_OPTIONS.map(v => ({ value:v, label: REPASO_LABELS[v] })) }
  ];
  const el = document.getElementById('settingsList');
  el.innerHTML = '';
  rows.forEach(r => {
    const current = r.options.find(o => o.value === configState[r.key]);
    const row = document.createElement('div');
    row.className = 'settings-row';
    row.setAttribute('role','button'); row.setAttribute('tabindex','0');
    row.innerHTML =
      '<span class="settings-row-icon">' + r.icon + '</span>' +
      '<span class="settings-row-label">' + r.label + '</span>' +
      '<span class="settings-row-value">' + (current ? current.label : '') + '</span>' +
      '<span class="settings-row-chevron">' + ICONS.chevron + '</span>';
    row.onclick = () => openSettingSheet(r.key, r.label, r.options);
    el.appendChild(row);
  });
}

/* ---------- hoja de selección (Minutos / Preguntas / Dificultad / Ayuda / Repaso) ---------- */
function openSettingSheet(key, label, options){
  document.getElementById('sheetTitle').textContent = label;
  const el = document.getElementById('sheetOptions');
  el.innerHTML = '';
  options.forEach(opt => {
    const row = document.createElement('div');
    const isSelected = configState[key] === opt.value;
    row.className = 'sheet-option' + (isSelected ? ' selected' : '');
    row.setAttribute('role','button'); row.setAttribute('tabindex','0');
    row.innerHTML = '<span>' + opt.label + '</span><span class="sheet-check">' + ICONS.check + '</span>';
    row.onclick = () => { configState[key] = opt.value; closeSettingSheet(); renderSettings(); };
    el.appendChild(row);
  });
  document.getElementById('sheetOverlay').classList.add('show');
}
function closeSettingSheet(){
  document.getElementById('sheetOverlay').classList.remove('show');
}

/* ---------- detalle de tema (elegir Títulos, nunca Artículos sueltos) — recuadro en la misma página ---------- */
function nodeIsInSelectedGroups(nodeId, selectedSet){
  let cur = NODES_BY_ID[nodeId];
  while(cur){
    if(selectedSet.has(cur.id)) return true;
    cur = cur.padre_id ? NODES_BY_ID[cur.padre_id] : null;
  }
  return false;
}
const NODE_TYPE_PLURAL = { titulo:'Títulos', capitulo:'Capítulos', seccion:'Secciones', articulo:'Artículos', libre:'Niveles', estructura:'Estructuras' };
function topicGroupTypeLabel(topicId){
  const groups = TOPIC_GROUPS[topicId] || [];
  if(!groups.length) return 'Títulos';
  const first = NODES_BY_ID[groups[0].id];
  return (first && NODE_TYPE_PLURAL[first.tipo]) || 'Títulos';
}
let expandedTopicIds = new Set(); // temas cuyo desplegable de títulos/capítulos/etc. está abierto (en línea, no en modal)
function toggleTopicDetail(topicId, event){
  if(event) event.stopPropagation();
  if(expandedTopicIds.has(topicId)) expandedTopicIds.delete(topicId); else expandedTopicIds.add(topicId);
  renderTemas();
}
function closeTopicDetail(){
  if(expandedTopicIds.size){ expandedTopicIds.clear(); renderTemas(); }
}
function renderTopicGroupList(topicId, topicSelected){
  const groups = TOPIC_GROUPS[topicId] || [];
  // Solo lectura, sin grabar nada en configState solo por pintarse. Si no
  // hay restricción guardada, no hay NINGÚN título marcado (aunque todas
  // sus preguntas cuenten igualmente): el marcado morado solo aparece
  // cuando el usuario ha tocado títulos concretos a mano.
  const selected = configState.nodeSelections[topicId] || new Set();
  return '<div class="article-list">' + groups.map(g => {
    // El marcado de cada título es independiente de si el tema está
    // encendido o apagado: se ve igual en ambos casos (el check del tema
    // solo decide si el tema entra o no en el test, no toca esto).
    const isSel = selected.has(g.id);
    return '<div class="article-row' + (isSel ? ' selected' : '') + '" role="checkbox" aria-checked="' + isSel + '" tabindex="0" ' +
      'onclick="toggleTopicGroup(\'' + topicId + '\', \'' + g.id + '\')" ' +
      'onkeydown="if(event.key===\'Enter\'||event.key===\' \'){event.preventDefault();toggleTopicGroup(\'' + topicId + '\', \'' + g.id + '\');}">' +
      '<span class="article-check">' + ICONS.check + '</span><span class="article-name">' + esc(g.label) + '</span>' +
    '</div>';
  }).join('') + '</div>';
}
function toggleTopicGroup(topicId, groupId){
  // Tocar un título enciende el tema automáticamente si estaba apagado, para
  // que la acción tenga efecto inmediato y visible. A partir de aquí, tema y
  // títulos van cada uno por su lado: el check del tema (toggleTopic) nunca
  // toca esta selección, y esta selección nunca fuerza el check del tema.
  if(!configState.topics.has(topicId)) configState.topics.add(topicId);
  const groups = TOPIC_GROUPS[topicId] || [];
  // Sin restricción previa = estaban TODOS incluidos sin que ninguno
  // apareciera marcado. Tocar un título aquí siempre significa "quiero
  // elegir a mano": se empieza de una selección vacía y se añade solo el
  // que se acaba de tocar (nunca "todos menos ese").
  if(!configState.nodeSelections[topicId]) configState.nodeSelections[topicId] = new Set();
  const selected = configState.nodeSelections[topicId];
  if(selected.has(groupId)) selected.delete(groupId); else selected.add(groupId);
  // Si se marcan todos los títulos a mano, es lo mismo que "sin restricción"
  // (todos incluidos): se limpia la restricción para no dejar un estado
  // redundante. Si se desmarcan todos, se deja en 0 a propósito (el badge
  // mostrará "0/N" y ese tema no aportará preguntas mientras esté así).
  if(selected.size === groups.length) delete configState.nodeSelections[topicId];
  renderTemas();
}

function renderTemas(){
  const el = document.getElementById('temasList');
  el.innerHTML = '';
  const enabledTopics = TOPICS.filter(t => t.enabled);
  if(!enabledTopics.length){
    el.innerHTML = '<div class="tree-empty">Todavía no hay temas creados. Créalos desde el panel de administración → pestaña "Temas".</div>';
    updateConfigFooter();
    return;
  }
  const card = document.createElement('div');
  card.className = 'topics-card';
  enabledTopics.forEach((t, idx) => {
    const groups = TOPIC_GROUPS[t.id] || [];
    const hasGroups = groups.length > 0;
    const isOpen = expandedTopicIds.has(t.id);
    const row = document.createElement('div');
    row.className = 'topic-row' + (configState.topics.has(t.id) ? ' selected' : '');
    row.setAttribute('role','checkbox');
    row.setAttribute('aria-checked', configState.topics.has(t.id) ? 'true' : 'false');
    row.setAttribute('tabindex','0');
    // Si el tema tiene subtemas, tocar la fila abre/cierra el panel (no marca/desmarca);
    // solo el cuadradito de check hace eso. Si no tiene subtemas, la fila entera marca/desmarca,
    // ya que no hay ningún panel que abrir.
    row.onclick = hasGroups ? ((e) => toggleTopicDetail(t.id, e)) : (() => toggleTopic(t.id));
    const topicSelected = configState.topics.has(t.id);
    const restriction = configState.nodeSelections[t.id];
    const badge = (topicSelected && restriction) ? ' <span class="topic-node-badge">' + restriction.size + '/' + groups.length + ' ' + topicGroupTypeLabel(t.id).toLowerCase() + '</span>' : '';
    const isPartial = !!(topicSelected && restriction && restriction.size < groups.length);
    row.innerHTML =
      '<span class="topic-check' + (isPartial ? ' indeterminate' : '') + '">' + ICONS.check + '</span>' +
      '<span class="topic-text"><span class="topic-name">' + esc(t.name) + badge + '</span></span>' +
      (hasGroups ? '<span class="topic-row-chevron' + (isOpen ? ' open' : '') + '">' + ICONS.chevron + '</span>' : '');
    row.querySelector('.topic-check').onclick = (e) => { e.stopPropagation(); toggleTopic(t.id); };
    if(hasGroups){
      row.querySelector('.topic-row-chevron').onclick = (e) => toggleTopicDetail(t.id, e);
    }
    card.appendChild(row);
    if(hasGroups && isOpen){
      const detail = document.createElement('div');
      detail.className = 'topic-detail-inline' + (topicSelected ? '' : ' inactive');
      detail.innerHTML = renderTopicGroupList(t.id, topicSelected);
      card.appendChild(detail);
    }
  });
  el.appendChild(card);
  updateConfigFooter();
}

function toggleTopic(id){
  // El check del tema principal solo enciende/apaga el tema entero: la
  // restricción de títulos de dentro (si la hay) se conserva tal cual,
  // tanto al apagar como al volver a encender, como ya decía el texto del
  // panel ("tu selección de aquí se conserva"). Antes esta función borraba
  // configState.nodeSelections[id] en cada toque, así que esa frase era
  // falsa: apagar y reencender un tema hacía perder la selección de
  // títulos sin ningún aviso.
  if(configState.topics.has(id)) configState.topics.delete(id); else configState.topics.add(id);
  renderTemas();
}

function toggleAllTopics(){
  const enabledIds = TOPICS.filter(t => t.enabled).map(t => t.id);
  const allSelected = enabledIds.length > 0 && enabledIds.every(id => configState.topics.has(id));
  enabledIds.forEach(id => allSelected ? configState.topics.delete(id) : configState.topics.add(id));
  renderTemas();
}

function renderParamOptions(){
  const countEl = document.getElementById('countOptions');
  countEl.innerHTML = '';
  COUNT_OPTIONS.forEach(n => {
    const b = document.createElement('span');
    b.className = 'param-opt' + (configState.count === n ? ' selected' : '');
    b.setAttribute('role','button'); b.setAttribute('tabindex','0');
    b.textContent = n + ' preguntas';
    b.onclick = () => { configState.count = n; renderParamOptions(); };
    countEl.appendChild(b);
  });

  const timeEl = document.getElementById('timeOptions');
  timeEl.innerHTML = '';
  TIME_OPTIONS.forEach(m => {
    const b = document.createElement('span');
    b.className = 'param-opt' + (configState.time === m ? ' selected' : '');
    b.setAttribute('role','button'); b.setAttribute('tabindex','0');
    b.textContent = m + ' min';
    b.onclick = () => { configState.time = m; renderParamOptions(); };
    timeEl.appendChild(b);
  });
  updateConfigFooter();
}

function updateConfigFooter(){
  const mode = configState.mode;
  const btn = document.getElementById('startConfigBtn');
  const needsTopics = (mode === 'estudio' || mode === 'examen');
  const topicsChosen = TOPICS.filter(t => configState.topics.has(t.id));

  if(needsTopics && topicsChosen.length === 0){
    btn.disabled = true;
    btn.textContent = mode === 'estudio' ? 'Iniciar test' : 'Selecciona un tema';
  }else{
    btn.disabled = false;
    if(mode === 'estudio'){
      const candidates = buildQuestionsFromTopics(configState.topics);
      btn.disabled = candidates.length === 0;
      if(configState.repaso === 'vuelta' && candidates.length > 0){
        const pool = buildVueltaPool(candidates);
        btn.textContent = 'Iniciar test (' + pool.length + ' sin ver en esta vuelta)';
      } else {
        btn.textContent = 'Iniciar test';
      }
    } else if(mode === 'examen'){
      const totalQ = buildQuestionsFromTopics(configState.topics).length;
      btn.disabled = totalQ === 0;
      btn.textContent = totalQ === 0 ? 'No hay preguntas con esa selección' : ('Comenzar examen (' + configState.count + ' preguntas, ' + configState.time + ' min)');
    } else if(mode === 'simulacro'){
      btn.textContent = 'Comenzar simulacro (' + configState.count + ' preguntas, ' + configState.time + ' min)';
    }
  }

  if(mode === 'estudio' || mode === 'examen'){
    const enabledIds = TOPICS.filter(t => t.enabled).map(t => t.id);
    const allSelected = enabledIds.length > 0 && enabledIds.every(id => configState.topics.has(id));
    const sw = document.getElementById('selectAllSwitch');
    if(sw) sw.classList.toggle('on', allSelected);
    const selAllBtn = document.getElementById('selectAllBtn');
    if(selAllBtn) selAllBtn.setAttribute('aria-checked', allSelected ? 'true' : 'false');
  }
}

function buildQuestionsFromTopics(topicIdSet){
  return QUESTIONS_POOL.filter(q => {
    if(!q.topic_id || !topicIdSet.has(q.topic_id)) return false;
    const sel = configState.nodeSelections[q.topic_id];
    if(!sel) return true; // sin restricción de títulos: todas las preguntas del tema
    if(!q.nodo_id) return false; // pregunta "general de todo el tema": no pertenece a ningún título concreto
    return nodeIsInSelectedGroups(q.nodo_id, sel);
  });
}

/* ---------- Repaso "Vuelta": ofrece primero las preguntas menos vistas ----------
   Cada pregunta trae q.timesSeen: el nº de veces que ha aparecido en CUALQUIER
   test ya finalizado (se recalcula en loadAppData()/computeQuestionMastery()
   a partir de session_answers, así que se actualiza solo, sin ningún contador
   aparte que se pueda desincronizar).

   En modo "Vuelta", en vez de ofrecer siempre el tema entero, se calcula cuál
   es el nº mínimo de veces vista entre las preguntas candidatas y solo se
   entregan esas: las que van "más atrasadas". Ejemplo: un tema con 169
   preguntas, todas con timesSeen 0 la primera vez. Si el alumno responde 60
   y sale ("Finalizar"), esas 60 quedan con timesSeen >= 1 (aunque estén en
   blanco, cuentan como vistas) y las otras 109 siguen en 0. La próxima vez
   que entre en "Vuelta" sobre ese mismo tema, el mínimo sigue siendo 0 y el
   test se genera solo con esas 109.

   Cuando TODAS las preguntas del tema ya se han visto al menos una vez, el
   mínimo sube solo (de 0 a 1, de 1 a 2...) y la "vuelta" vuelve a empezar
   automáticamente por las que llevan más tiempo sin repasarse — no hace
   falta ningún botón de "reiniciar". */
function buildVueltaPool(candidates){
  if(!candidates.length) return candidates;
  const minSeen = candidates.reduce((min, q) => Math.min(min, q.timesSeen || 0), Infinity);
  return candidates.filter(q => (q.timesSeen || 0) === minSeen);
}

/* Baraja un array sin modificar el original (Fisher–Yates). */
function shuffleArray(arr){
  const a = arr.slice();
  for(let i = a.length - 1; i > 0; i--){
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* ---------- Barajado de las opciones (A/B/C/D) por intento ----------
   Objetivo: que memorizar "la respuesta es la B" no sirva de nada. En
   cada intento se reordena al azar la posición de las opciones de cada
   pregunta — el contenido que es correcto sigue siendo el mismo, solo
   cambia qué letra le toca esta vez.

   Se detectan (de forma heurística, por el texto) las preguntas cuyo
   enunciado o cuyas opciones dependen de la posición/letra —del tipo
   "A y B son correctas", "todas las anteriores", "solo la C es
   correcta"— y esas NO se barajan: reordenarlas rompería el sentido de
   la pregunta. */
const LETTER_DEPENDENT_PATTERNS = [
  /todas\s+las\s+anteriores/i,
  /ninguna\s+(de\s+las\s+)?anteriores/i,
  /todas\s+(ellas\s+)?(son|resultan)\s+correctas?/i,
  /ninguna\s+(de\s+ellas\s+)?(es|resulta)\s+correcta/i,
  /\b(opci[oó]n(es)?|respuesta(s)?|letra(s)?|apartado(s)?)\b/i,
  /\b(solo|s[oó]lo|salvo|excepto|menos)\s+la\s+[a-dA-D]\b/i,
  // Dos (o más) letras mayúsculas sueltas unidas por "y"/"o"/comas, del
  // tipo "A y B", "B, C y D": en prosa normal en español no aparecen
  // letras mayúsculas sueltas así, por lo que es una señal fiable de que
  // el texto está referenciando otras opciones por su letra.
  /\b[A-D]\s*(?:,\s*[A-D]\s*)*(?:y|o)\s*[A-D]\b/
];
function isLetterDependentQuestion(q){
  const text = [q.q || '', ...((q.options || []))].join(' \n ');
  return LETTER_DEPENDENT_PATTERNS.some(re => re.test(text));
}
function shuffleQuestionOptions(q){
  if(!q.options || q.options.length < 2) return q;
  if(isLetterDependentQuestion(q)) return q; // se deja tal cual: no se puede reordenar sin romper el sentido
  const order = shuffleArray(q.options.map((_, i) => i)); // order[posición mostrada] = índice original en la BD
  const newOptions = order.map(i => q.options[i]);
  const newCorrect = order.indexOf(q.correct);
  if(newCorrect === -1) return q; // por seguridad: si algo no cuadra, no se toca
  // _optionOrder se guarda en la propia pregunta para poder "deshacer" el
  // barajado al guardar la respuesta en la base de datos (ver finishQuiz):
  // así el histórico sigue siendo correcto aunque se recargue la página.
  return Object.assign({}, q, { options: newOptions, correct: newCorrect, _optionOrder: order });
}
function buildQuestionSet(pool, count){
  if(!pool.length) return [];
  const shuffledPool = shuffleArray(pool);
  const out = [];
  for(let i = 0; i < count; i++){ out.push(shuffledPool[i % shuffledPool.length]); }
  return shuffleArray(out); // vuelve a barajar por si count > pool.length (evita bloques repetidos en el mismo orden)
}

function startFromConfig(){
  const mode = configState.mode;
  if(mode === 'estudio'){
    let questions = buildQuestionsFromTopics(configState.topics);
    // "Vuelta": antes de aplicar el límite de "Preguntas", nos quedamos solo
    // con las menos vistas del tema (ver buildVueltaPool). "Normal": todas,
    // tal cual, sin ningún filtro.
    if(configState.repaso === 'vuelta'){
      questions = buildVueltaPool(questions);
    }
    // Respeta el ajuste "Preguntas" (10/20/30/40 o "Sin límite"); antes se
    // ignoraba y siempre entraban todas las preguntas del tema.
    if(configState.preguntas){
      questions = shuffleArray(questions).slice(0, configState.preguntas);
    }
    startQuiz('estudio', questions, null);
  } else if(mode === 'examen'){
    const pool = buildQuestionsFromTopics(configState.topics);
    const questions = buildQuestionSet(pool, configState.count);
    startQuiz('examen', questions, configState.time);
  } else if(mode === 'simulacro'){
    const questions = buildQuestionSet(QUESTIONS_POOL, configState.count);
    startQuiz('simulacro', questions, configState.time);
  }
}

/* ---------- fallos intro screen ---------- */
function openFallos(){
  if(!featureEnabled('fallos')) return;
  if(whenAppDataReady(openFallos)) return;
  if(quizState && quizState.mode && quizState.mode !== 'fallos') return; // hay un test en curso en otro apartado
  const total = TOPICS.filter(t => t.enabled).reduce((s,t) => s + t.fails, 0);
  if(total === 0) return; // no hay fallos: no se puede abrir el repaso
  document.getElementById('fallosTotal').textContent = total;
  const el = document.getElementById('fallosBreakdown');
  el.innerHTML = '';
  TOPICS.filter(t => t.enabled).forEach(t => {
    const row = document.createElement('div');
    row.className = 'fallos-row';
    row.innerHTML = '<span class="fallos-row-name">' + t.name + '</span><span class="fallos-row-count">' + t.fails + ' falladas</span>';
    el.appendChild(row);
  });
  const startBtn = document.getElementById('fallosStartBtn');
  if(startBtn) startBtn.disabled = false;
  showScreen('screen-home');
  openOverlay('screen-fallos');
}

function startFallosReview(){
  if(!currentUser) return;
  // Las preguntas "en rojo" salen siempre de QUESTIONS_POOL, ya calculado con
  // computeQuestionMastery() sobre el historial actual: no hace falta ninguna
  // consulta ni tabla aparte que se pueda quedar desactualizada. Las
  // descartadas de Fallos (fallosHidden) no entran en el repaso, aunque
  // sigan contando como falladas en Estadísticas.
  const questions = QUESTIONS_POOL.filter(q => q.masteryStatus === 'red' && !q.fallosHidden);
  if(!questions.length) return; // sin fallos pendientes no se puede iniciar el repaso
  startQuiz('fallos', questions, null);
}

// "Quitar de Fallos": NO borra nada del historial ni de session_answers, y
// NO afecta a las Estadísticas (esas preguntas siguen contando como
// falladas allí, tal cual). Lo único que hace es guardar en dismissed_fails
// la fecha de "descarte" de cada pregunta que en este momento aparece en
// Fallos. computeQuestionMastery()/loadAppData() comparan esa fecha con la
// del intento más reciente de cada pregunta: si en el futuro vuelves a
// fallarla, ese nuevo intento es más reciente que el descarte y la pregunta
// reaparece sola en Fallos, sin ninguna acción manual.
async function eliminarFallosPendientes(){
  if(!currentUser) return;
  const questions = QUESTIONS_POOL.filter(q => q.masteryStatus === 'red' && !q.fallosHidden);
  if(!questions.length) return;

  const n = questions.length;
  const aviso = 'Vas a quitar estas ' + n + ' pregunta' + (n === 1 ? '' : 's') + ' fallada' + (n === 1 ? '' : 's') + ' de Fallos.\n\n' +
    'Seguirán contando como falladas en Estadísticas. Si vuelves a fallar alguna más adelante, reaparecerá aquí automáticamente.\n\n' +
    '¿Continuar?';
  if(!await uiConfirm(aviso)) return;

  const btn = document.getElementById('fallosDeleteBtn');
  if(btn) btn.disabled = true;

  try{
    const nowIso = new Date().toISOString();
    const rows = questions.map(q => ({ user_id: currentUser.id, question_id: q.id, dismissed_at: nowIso }));
    const { error } = await sb.from('dismissed_fails').upsert(rows, { onConflict: 'user_id,question_id' });
    if(error) throw error;
  } catch(err){
    console.error('Error quitando las preguntas de Fallos', err);
    uiToast('No se ha podido completar la operación. Inténtalo de nuevo.');
    if(btn) btn.disabled = false;
    return;
  }

  await loadAppData();
  await refreshGlobalStats();
  if(btn) btn.disabled = false;
  showHome();
}
