/* Simulacro conjunto: preguntas de Legislación y del Específico en un mismo
   simulacro, con los temas que se elijan de cada parte, número de preguntas
   y tiempo. Se abre desde Inicio (solo con el Específico y el Simulacro
   activados). Todas las preguntas seguidas y corrección al final, con la
   misma puntuación que el simulacro de Legislación (acierto +1, fallo
   −1/(opciones−1), en blanco 0).
   Al terminar, cada parte se guarda en su sitio, sin mezclar: lo de
   Legislación como una sesión «conjunto» (test_sessions/session_answers, así
   cuenta en sus estadísticas, Fallos e historial) y lo del Específico en
   especifico_respuestas (ESPT.registrar). Un simulacro a medias se guarda en
   el dispositivo y se puede continuar desde Inicio. */
const SIMC = (function(){
  const CUANTAS = [20, 30, 40, 50, 60, 80, 100];
  const MINUTOS = [15, 30, 45, 60, 90, 120];
  const REPARTOS = { mitad: 'Mitad y mitad', proporcional: 'Según las preguntas de cada parte' };
  const LETRAS = ['A', 'B', 'C', 'D', 'E', 'F'];
  const clave = () => currentUser ? 'pj_simulacro_conjunto:' + currentUser.id : null;
  const cfg = { legis: new Set(), esp: new Set(), cuantas: 40, minutos: 60, reparto: 'mitad' };
  let espTemas = null;      // [{ clave, titulo, n, tests: [id…] }]
  let est = null;           // simulacro en curso o terminado
  let reloj = null;
  const $ = id => document.getElementById(id);
  const espHtml = h => (typeof IMP !== 'undefined' && IMP.limpiar) ? IMP.limpiar(h) : escapeHtml(h);

  function disponible(){
    return !!currentUser && featureEnabled('especifico') && featureEnabled('simulacro');
  }

  /* ---------- configuración ---------- */
  async function cargarEspTemas(){
    const [rt, n] = await Promise.all([sb.from('especifico_tests').select('id,tema'), ESP.contarPreguntas()]);
    if(rt.error) throw rt.error;
    espTemas = ESP.temas().map(t => {
      const tests = (rt.data || []).filter(x => x.tema === t.clave).map(x => x.id);
      return { clave: t.clave, titulo: t.titulo, tests, n: tests.reduce((s, id) => s + (n[id] || 0), 0) };
    }).filter(t => t.n > 0);
  }
  function legisTemas(){
    const n = {};
    QUESTIONS_POOL.forEach(q => { if(q.topic_id) n[q.topic_id] = (n[q.topic_id] || 0) + 1; });
    return TOPICS.filter(t => t.enabled && n[t.id]).map(t => ({ id: t.id, nombre: t.name, n: n[t.id] }));
  }
  function abrirConfig(){
    if(!disponible()) return;
    if(guardado()){ continuar(); return; }
    if(whenAppDataReady(abrirConfig)) return;
    $('simcConfig').innerHTML = '<div class="simc-cargando">Cargando temas…</div>';
    pintarPie();
    openOverlay('screen-simc-config');
    cargarEspTemas()   // cada vez: por si se han importado preguntas nuevas
      .then(pintarConfig)
      .catch(e => { $('simcConfig').innerHTML = '<div class="tree-empty">No se pudieron cargar los temas del Específico: ' + escapeHtml(e.message || String(e)) + '</div>'; });
  }
  function cerrarConfig(){ $('screen-simc-config').classList.remove('active'); }
  const fila = (sel, id, nombre, n, parte) =>
    '<div class="topic-row' + (sel ? ' selected' : '') + '" role="checkbox" aria-checked="' + sel + '" tabindex="0" data-simc-tema="' + parte + '" data-id="' + escapeHtml(id) + '">' +
      '<span class="topic-check">' + ICONS.check + '</span>' +
      '<span class="topic-text"><span class="topic-name">' + escapeHtml(nombre) + '</span></span><span class="simc-n">' + n + '</span></div>';
  const todos = (parte, lista) => {
    const on = lista.length && lista.every(t => cfg[parte].has(t.id || t.clave));
    return '<span class="switch-row" role="button" tabindex="0" data-simc-todos="' + parte + '"><span class="switch' + (on ? ' on' : '') + '"><span class="knob"></span></span><span class="switch-label">Todos</span></span>';
  };
  const opciones = (que, lista, fmt) => '<div class="param-options">' + lista.map(v =>
    '<span class="param-opt' + (cfg[que] === v ? ' selected' : '') + '" role="button" tabindex="0" data-simc-opt="' + que + '" data-v="' + v + '">' + fmt(v) + '</span>').join('') + '</div>';
  function pintarConfig(){
    const lt = legisTemas(), et = espTemas || [];
    $('simcConfig').innerHTML =
      '<div class="config-block"><div class="config-block-head"><div class="config-block-label">Preguntas</div></div>' + opciones('cuantas', CUANTAS, v => v + ' preguntas') + '</div>' +
      '<div class="config-block"><div class="config-block-head"><div class="config-block-label">Tiempo</div></div>' + opciones('minutos', MINUTOS, v => v + ' min') + '</div>' +
      '<div class="config-block"><div class="config-block-head"><div class="config-block-label">Reparto</div></div>' + opciones('reparto', Object.keys(REPARTOS), v => REPARTOS[v]) + '</div>' +
      '<div class="config-block"><div class="config-block-head"><div class="config-block-label">Legislación</div>' + todos('legis', lt) + '</div>' +
        (lt.length ? '<div class="topics-card">' + lt.map(t => fila(cfg.legis.has(t.id), t.id, t.nombre, t.n, 'legis')).join('') + '</div>' : '<div class="tree-empty">No hay temas de Legislación con preguntas.</div>') + '</div>' +
      '<div class="config-block"><div class="config-block-head"><div class="config-block-label">Específico</div>' + todos('esp', et.map(t => ({ id: t.clave }))) + '</div>' +
        (et.length ? '<div class="topics-card">' + et.map((t, i) => fila(cfg.esp.has(t.clave), t.clave, (ESP.temas().findIndex(x => x.clave === t.clave) + 1) + '. ' + t.titulo, t.n, 'esp')).join('') + '</div>' : '<div class="tree-empty">Todavía no hay preguntas en el Específico.</div>') + '</div>';
    pintarPie();
  }
  // Cuántas de cada parte con la configuración actual.
  function plan(){
    const nl = QUESTIONS_POOL.filter(q => cfg.legis.has(q.topic_id)).length;
    const ne = (espTemas || []).filter(t => cfg.esp.has(t.clave)).reduce((s, t) => s + t.n, 0);
    const total = cfg.cuantas;
    let l = 0;
    if(nl && ne) l = cfg.reparto === 'proporcional' ? Math.round(total * nl / (nl + ne)) : Math.round(total / 2);
    else if(nl) l = total;
    let e = total - l;
    // Si una parte no da para tanto, lo que falta sale de la otra.
    if(l > nl){ e += l - nl; l = nl; }
    if(e > ne){ l = Math.min(nl, l + e - ne); e = ne; }
    return { l, e, nl, ne };
  }
  function pintarPie(){
    const b = $('simcEmpezar');
    if(!b) return;
    const p = espTemas ? plan() : { l: 0, e: 0 };
    const n = p.l + p.e;
    b.disabled = !n;
    b.textContent = !n ? 'Elige temas de Legislación o del Específico'
      : 'Comenzar (' + p.l + ' de Legislación + ' + p.e + ' del Específico, ' + cfg.minutos + ' min)';
  }
  function onConfigClick(e){
    const t = e.target.closest('[data-simc-tema],[data-simc-todos],[data-simc-opt]');
    if(!t) return;
    if(t.dataset.simcTema){
      const s = cfg[t.dataset.simcTema], id = t.dataset.id;
      s.has(id) ? s.delete(id) : s.add(id);
    } else if(t.dataset.simcTodos){
      const parte = t.dataset.simcTodos, s = cfg[parte];
      const ids = parte === 'legis' ? legisTemas().map(x => x.id) : (espTemas || []).map(x => x.clave);
      const on = ids.length && ids.every(id => s.has(id));
      ids.forEach(id => on ? s.delete(id) : s.add(id));
    } else {
      const q = t.dataset.simcOpt;
      cfg[q] = q === 'reparto' ? t.dataset.v : Number(t.dataset.v);
    }
    pintarConfig();
  }

  /* ---------- preparar el simulacro ---------- */
  const barajar = a => (typeof shuffleArray === 'function') ? shuffleArray(a) : a.slice().sort(() => Math.random() - 0.5);
  function itemLegis(q, orden){
    // Mismo barajado de opciones que en Legislación (no en las del tipo «A y B son correctas»).
    const b = orden ? Object.assign({}, q, { options: orden.map(i => q.options[i]), correct: orden.indexOf(q.correct), _optionOrder: orden }) : shuffleQuestionOptions(q);
    const tema = TOPICS.find(t => t.id === q.topic_id);
    return { k: 'l', id: q.id, q: b, texto: q.q, opciones: b.options, correcta: b.correct, orden: b._optionOrder || null,
      tema: tema ? tema.name : '', art: q.art || '', explicacion: q.explain || '' };
  }
  function itemEsp(p, temaDe){
    // Las del Específico no se barajan: muchas dicen «a y b son correctas».
    const ops = (p.opciones || []);
    return { k: 'e', id: p.id, html: p.enunciado, opciones: ops.map(o => o.html), letras: ops.map(o => o.l),
      correcta: ops.findIndex(o => o.l === p.correcta), tema: temaDe[p.test_id] || '', explicacion: p.explicacion || '' };
  }
  async function preguntasEsp(ids){
    const out = [];
    for(let i = 0; i < ids.length; i += 100){
      const { data, error } = await sb.from('especifico_preguntas').select('id,test_id,enunciado,opciones,correcta,explicacion').in('id', ids.slice(i, i + 100));
      if(error) throw error;
      out.push(...(data || []));
    }
    return out;
  }
  async function temaDeTests(){
    const { data, error } = await sb.from('especifico_tests').select('id,tema,titulo');
    if(error) throw error;
    const m = {};
    (data || []).forEach(t => { const tm = ESP.temas().find(x => x.clave === t.tema); m[t.id] = (tm ? tm.titulo : '') + ' · ' + t.titulo; });
    return m;
  }
  async function empezar(){
    const b = $('simcEmpezar');
    const p = plan();
    if(!p.l && !p.e) return;
    b.disabled = true; b.textContent = 'Preparando el simulacro…';
    try{
      const legis = barajar(QUESTIONS_POOL.filter(q => cfg.legis.has(q.topic_id))).slice(0, p.l);
      let esp = [], temaDe = {};
      if(p.e){
        const tests = (espTemas || []).filter(t => cfg.esp.has(t.clave)).reduce((a, t) => a.concat(t.tests), []);
        let ids = [];
        for(let i = 0; i < tests.length; i += 80){
          for(let desde = 0; ; desde += 1000){
            const { data, error } = await sb.from('especifico_preguntas').select('id').in('test_id', tests.slice(i, i + 80)).order('id').range(desde, desde + 999);
            if(error) throw error;
            ids = ids.concat((data || []).map(r => r.id));
            if(!data || data.length < 1000) break;
          }
        }
        [esp, temaDe] = await Promise.all([preguntasEsp(barajar(ids).slice(0, p.e)), temaDeTests()]);
      }
      const items = barajar(legis.map(q => itemLegis(q)).concat(esp.filter(x => (x.opciones || []).length).map(x => itemEsp(x, temaDe))));
      est = { items, resp: new Array(items.length).fill(null), inicio: Date.now(), fin: Date.now() + cfg.minutos * 60000, minutos: cfg.minutos, terminado: false };
      guardar();
      cerrarConfig();
      mostrarTest();
    }catch(e){
      uiToast('No se pudo preparar el simulacro: ' + (e.message || e), 'error');
      pintarPie();
    }
  }

  /* ---------- simulacro a medias (en el dispositivo) ---------- */
  function guardar(){
    if(!clave() || !est || est.terminado) return;
    try{
      localStorage.setItem(clave(), JSON.stringify({
        v: 1, inicio: est.inicio, fin: est.fin, minutos: est.minutos, resp: est.resp,
        items: est.items.map(it => it.k === 'l' ? { k: 'l', id: it.id, orden: it.orden } : { k: 'e', id: it.id })
      }));
    }catch(e){}
  }
  function guardado(){ try{ return clave() ? JSON.parse(localStorage.getItem(clave()) || 'null') : null; }catch(e){ return null; } }
  function borrarGuardado(){ try{ if(clave()) localStorage.removeItem(clave()); }catch(e){} }
  async function continuar(){
    const g = guardado();
    if(!g){ abrirConfig(); return; }
    if(est && !est.terminado){ mostrarTest(); return; }
    if(whenAppDataReady(continuar)) return;
    try{
      const ids = g.items.filter(x => x.k === 'e').map(x => x.id);
      const [esp, temaDe] = ids.length ? await Promise.all([preguntasEsp(ids), temaDeTests()]) : [[], {}];
      const items = [], resp = [];
      g.items.forEach((x, i) => {
        let it = null;
        if(x.k === 'l'){ const q = QUESTIONS_POOL.find(y => y.id === x.id); if(q) it = itemLegis(q, x.orden); }
        else { const p = esp.find(y => y.id === x.id); if(p) it = itemEsp(p, temaDe); }
        if(it){ items.push(it); resp.push(g.resp[i] == null ? null : g.resp[i]); }   // las que ya no existen se quitan
      });
      if(!items.length){ borrarGuardado(); abrirConfig(); return; }
      est = { items, resp, inicio: g.inicio, fin: g.fin, minutos: g.minutos, terminado: false };
      mostrarTest();
      if(Date.now() >= est.fin) terminar(true);
    }catch(e){ uiToast('No se pudo recuperar el simulacro: ' + (e.message || e), 'error'); }
  }
  function aMedias(){
    const g = guardado();
    if(!g || !disponible()) return null;
    return { hechas: (g.resp || []).filter(r => r != null).length, total: (g.items || []).length };
  }

  /* ---------- el test ---------- */
  function etiqueta(it){
    return '<div class="simc-etiqueta ' + (it.k === 'l' ? 'legis' : 'esp') + '">' + (it.k === 'l' ? 'Legislación' : 'Específico') +
      (it.tema ? '<span> · ' + escapeHtml(it.tema) + '</span>' : '') + '</div>';
  }
  const enunciado = it => it.k === 'l' ? escapeHtml(it.texto) : espHtml(it.html);
  const opcion = (it, j) => it.k === 'l' ? escapeHtml(it.opciones[j]) : espHtml(it.opciones[j]);
  function mostrarTest(){
    showScreen('screen-simc');
    $('simcCabecera').classList.remove('hidden');
    $('simcCuerpo').innerHTML = est.items.map((it, i) =>
      '<div class="quiz-list-item simc-item" data-i="' + i + '">' + etiqueta(it) +
        '<div class="question">' + (i + 1) + '. ' + enunciado(it) + '</div>' +
        '<div class="options">' + it.opciones.map((_, j) =>
          '<div class="option' + (est.resp[i] === j ? ' selected' : '') + '" role="button" tabindex="0" data-simc-r="' + i + '" data-j="' + j + '">' +
            '<span class="opt-badge">' + LETRAS[j] + '</span><span class="opt-text">' + opcion(it, j) + '</span><span class="opt-result"></span></div>').join('') +
        '</div></div>').join('') +
      '<div class="quiz-list-footer"><button class="btn btn-primary" data-simc="terminar">Finalizar</button></div>';
    contador();
    arrancarReloj();
    window.scrollTo && document.getElementById('app') && (document.getElementById('app').scrollTop = 0);
  }
  function contador(){
    $('simcContador').textContent = est.resp.filter(r => r != null).length + ' / ' + est.items.length;
  }
  function arrancarReloj(){
    clearInterval(reloj);
    const tic = () => {
      if(!est || est.terminado){ clearInterval(reloj); return; }
      const s = Math.max(0, Math.round((est.fin - Date.now()) / 1000));
      $('simcReloj').textContent = String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
      $('simcRelojCaja').classList.toggle('urgent', s <= 60);
      if(!s){ clearInterval(reloj); terminar(true); }
    };
    tic();
    reloj = setInterval(tic, 1000);
  }
  function responder(i, j){
    if(!est || est.terminado) return;
    est.resp[i] = est.resp[i] === j ? null : j;   // tocar otra vez la elegida la deja en blanco
    document.querySelectorAll('[data-simc-r="' + i + '"]').forEach(el => el.classList.toggle('selected', Number(el.dataset.j) === est.resp[i]));
    contador();
    guardar();
  }
  async function pedirTerminar(){
    const blancas = est.resp.filter(r => r == null).length;
    const ok = await uiConfirm(blancas
      ? 'Te quedan ' + blancas + (blancas === 1 ? ' pregunta en blanco' : ' preguntas en blanco') + '. ¿Finalizar el simulacro?'
      : '¿Finalizar el simulacro?', { ok: 'Finalizar' });
    if(ok) terminar(false);
  }

  /* ---------- corrección y guardado ---------- */
  function puntos(items, resp){
    let p = 0, bien = 0, mal = 0, blanco = 0;
    items.forEach((it, i) => {
      const r = resp[i];
      if(r == null){ blanco++; return; }
      if(r === it.correcta){ bien++; p += 1; }
      else { mal++; const n = it.opciones.length || 4; p -= n > 1 ? 1 / (n - 1) : 0; }
    });
    return { total: items.length, bien, mal, blanco, nota: items.length ? Math.max(0, p / items.length * 10) : 0 };
  }
  async function terminar(porTiempo){
    if(!est || est.terminado) return;
    est.terminado = true;
    clearInterval(reloj);
    borrarGuardado();
    const segundos = Math.round((Math.min(Date.now(), est.fin) - est.inicio) / 1000);
    const parte = k => { const idx = est.items.map((it, i) => i).filter(i => est.items[i].k === k); return { items: idx.map(i => est.items[i]), resp: idx.map(i => est.resp[i]) }; };
    const L = parte('l'), E = parte('e');
    est.res = { todo: puntos(est.items, est.resp), l: puntos(L.items, L.resp), e: puntos(E.items, E.resp), segundos };
    if(porTiempo) uiToast('Se acabó el tiempo: simulacro corregido.', 'info');
    pintarResultado();
    // Específico: a sus estadísticas (en blanco cuenta como fallada, igual que en Legislación).
    if(E.items.length && typeof ESPT !== 'undefined') ESPT.registrar(E.items.map((it, j) => ({ pregunta_id: it.id, acierto: E.resp[j] === it.correcta })));
    // Legislación: una sesión «conjunto» con solo sus preguntas.
    if(L.items.length && currentUser) await guardarLegis(L, est.res.l, segundos);
  }
  async function guardarLegis(L, r, segundos){
    const sesion = { user_id: currentUser.id, mode: 'conjunto', score: Number(r.nota.toFixed(2)), total: r.total, ok: r.bien, bad: r.mal, pending: r.blanco, time_seconds: segundos };
    const filas = sid => L.items.map((it, j) => {
      const a = L.resp[j];
      return { session_id: sid, user_id: currentUser.id, question_id: it.id,
        selected_index: a == null ? null : (it.orden ? it.orden[a] : a), is_correct: a === it.correcta, answer_order: j };
    });
    try{
      if(typeof NQ !== 'undefined' && NQ.addFailedQuestion) L.items.forEach((it, j) => { if(L.resp[j] !== it.correcta) NQ.addFailedQuestion(it.id); });
    }catch(e){}
    let sid = null;
    try{
      if(!navigator.onLine) throw new Error('offline');
      const { data, error } = await sb.from('test_sessions').insert(sesion).select('id').single();
      if(error) throw error;
      sid = data.id;
      const { error: e2 } = await sb.from('session_answers').insert(filas(sid));
      if(e2) throw e2;
    }catch(err){
      const red = !navigator.onLine || /offline|fetch|network|load failed|conexi|timeout/i.test(String(err && (err.message || err)));
      if(red){
        queuePendingResult(sid ? { sessionId: sid, answers: filas(sid) } : { session: sesion, answers: filas(null) });
        uiToast('Sin conexión: la parte de Legislación se guardará en cuanto vuelva internet.', 'info');
      } else {
        uiToast('No se pudo guardar la parte de Legislación: ' + (err.message || err), 'error');
        try{ reportClientError('simulacro-conjunto', 'No se pudo guardar: ' + (err && (err.message || err))); }catch(e){}
      }
      return;
    }
    try{ await loadAppData(); await loadHistory(); await refreshGlobalStats(); }catch(e){}
  }
  let filtro = 'todas';
  function pintarResultado(){
    showScreen('screen-simc');
    $('simcCabecera').classList.add('hidden');
    const r = est.res;
    const caja = (tit, x, clase) => x.total ? '<div class="simc-parte ' + clase + '"><div class="simc-parte-tit">' + tit + '</div>' +
      '<div class="simc-parte-nota">' + formatNota(x.nota) + '</div>' +
      '<div class="simc-parte-datos"><span class="ok">' + x.bien + ' bien</span><span class="mal">' + x.mal + ' mal</span><span>' + x.blanco + ' en blanco</span><span>de ' + x.total + '</span></div></div>' : '';
    $('simcCuerpo').innerHTML =
      '<div class="result-hero"><div class="result-label">Simulacro conjunto · ' + formatMMSS(r.segundos) + '</div>' +
        '<div class="result-score">' + formatNota(r.todo.nota) + '<span>/10</span></div>' +
        '<div class="simc-sub">' + r.todo.bien + ' aciertos · ' + r.todo.mal + ' fallos · ' + r.todo.blanco + ' en blanco</div></div>' +
      '<div class="simc-partes">' + caja('Legislación', r.l, 'legis') + caja('Específico', r.e, 'esp') + '</div>' +
      '<div class="simc-filtros">' + [['todas', 'Todas'], ['mal', 'Falladas'], ['blanco', 'En blanco'], ['legis', 'Legislación'], ['esp', 'Específico']].map(([k, t]) =>
        '<button type="button" class="admin-tab' + (filtro === k ? ' active' : '') + '" data-simc-filtro="' + k + '">' + t + '</button>').join('') + '</div>' +
      '<div id="simcRevision">' + revision() + '</div>' +
      '<div class="simc-botones"><button class="btn btn-ghost" data-simc="inicio">Volver al inicio</button><button class="btn btn-primary" data-simc="otro">Otro simulacro</button></div>';
    const app = document.getElementById('app');
    if(app) app.scrollTop = 0;
  }
  function revision(){
    const lista = est.items.map((it, i) => ({ it, i, r: est.resp[i] })).filter(({ it, r }) =>
      filtro === 'todas' || (filtro === 'mal' && r != null && r !== it.correcta) || (filtro === 'blanco' && r == null) ||
      (filtro === 'legis' && it.k === 'l') || (filtro === 'esp' && it.k === 'e'));
    if(!lista.length) return '<div class="tree-empty">No hay preguntas con este filtro.</div>';
    return lista.map(({ it, i, r }) =>
      '<div class="quiz-list-item simc-item">' + etiqueta(it) +
        '<div class="question">' + (i + 1) + '. ' + enunciado(it) + '</div>' +
        '<div class="options">' + it.opciones.map((_, j) => {
          const cls = j === it.correcta ? ' correct' + (r == null ? ' blank-correct' : '') : j === r ? ' incorrect' : '';
          return '<div class="option' + cls + '"><span class="opt-badge">' + LETRAS[j] + '</span><span class="opt-text">' + opcion(it, j) + '</span><span class="opt-result">' +
            (j === it.correcta ? ICONS.check : j === r ? ICONS.cross : '') + '</span></div>';
        }).join('') + '</div>' +
        (r == null ? '<div class="simc-blanco">En blanco</div>' : '') +
        (it.explicacion ? '<details class="simc-exp"><summary>Explicación</summary><div>' + (it.k === 'l' ? escapeHtml(it.explicacion) : espHtml(it.explicacion)) + '</div></details>' : '') +
        (it.k === 'l' && it.art ? '<div class="simc-art">' + escapeHtml(it.art) + '</div>' : '') +
      '</div>').join('');
  }
  function onClick(e){
    const r = e.target.closest('[data-simc-r]');
    if(r){ responder(Number(r.dataset.simcR), Number(r.dataset.j)); return; }
    const f = e.target.closest('[data-simc-filtro]');
    if(f){ filtro = f.dataset.simcFiltro; pintarResultado(); return; }
    const b = e.target.closest('[data-simc]');
    if(!b) return;
    switch(b.dataset.simc){
      case 'terminar': pedirTerminar(); break;
      case 'salir': showScreen('screen-inicio'); break;   // queda guardado: se sigue desde Inicio
      case 'inicio': est = null; showScreen('screen-inicio'); break;
      case 'otro': est = null; filtro = 'todas'; showScreen('screen-inicio'); abrirConfig(); break;
    }
  }
  function onKey(e){
    if(e.key !== 'Enter' && e.key !== ' ') return;
    const r = e.target.closest('[data-simc-r],[data-simc-tema],[data-simc-todos],[data-simc-opt]');
    if(r){ e.preventDefault(); r.click(); }
  }
  function enganchar(){
    const s = $('screen-simc'), c = $('screen-simc-config');
    if(s){ s.addEventListener('click', onClick); s.addEventListener('keydown', onKey); }
    if(c){ c.addEventListener('click', onConfigClick); c.addEventListener('keydown', onKey); }
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', enganchar); else enganchar();

  // Al volver a la pestaña tras un rato, el reloj sigue donde toca (cuenta hasta una hora fija).
  document.addEventListener('visibilitychange', () => {
    if(!document.hidden && est && !est.terminado && Date.now() >= est.fin) terminar(true);
  });
  // Al cambiar de cuenta, nada de la anterior.
  function reiniciar(){ clearInterval(reloj); est = null; espTemas = null; cfg.legis.clear(); cfg.esp.clear(); }
  return { disponible, abrirConfig, cerrarConfig, empezar, continuar, aMedias, reiniciar };
})();
