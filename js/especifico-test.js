/* Específico: hacer un test (preguntas de especifico_preguntas) y ver las
   preguntas marcadas, con el diseño del aula virtual de tutorbomberos:
   cabecera naranja y todas las preguntas seguidas.
   - Cada vez que se entra, el test empieza de cero. Lo que se responde va
     a Estadísticas y, como una prueba más, al historial del Específico
     (modo 'esp-tb' de js/pruebas.js), desde donde se revisa o se borra.
   - Una sola respuesta por pregunta: queda fija, con ✓ si es la correcta o
     ✗ y, además, la correcta señalada.
   - La franja de la izquierda es la dificultad: verde (fácil), amarilla
     (media) o roja (difícil); gris si no se sabe.
   - El «?» verde abre la explicación; el botón rojo guarda la pregunta en
     «Preguntas marcadas» (tabla especifico_marcadas, de cada usuario). */
const ESPT = (function(){
  let modo = 'test', test = null, preguntas = [], resp = {}, abiertas = new Set(), cargando = false, error = '';
  let marcadas = new Set(), marcadasCargadas = false;
  let todasMarcadas = [], filtro = null;   // Preguntas marcadas: todas las cargadas y lo elegido ('todas' o un tema; null = elegir)
  let sesion = null;         // la prueba de historial de esta vez: { id, inicio, created_at }
  const cache = new Map();   // test_id → preguntas (para no volver a descargarlas)
  const DIF = { facil: 'Fácil', media: 'Media', dificil: 'Difícil' };

  const root = () => document.getElementById('espTestRoot');
  const arriba = () => { const a = document.getElementById('app'); (a || window).scrollTo(0, 0); };   // #app es el que se desplaza
  // El HTML se limpió al importarlo; se vuelve a limpiar por si acaso.
  const html = h => (typeof IMP !== 'undefined' && IMP.limpiar) ? IMP.limpiar(h) : escapeHtml(h);
  const temaDe = clave => (ESP.temas().find(x => x.clave === clave) || {}).titulo || '';
  const ICO = {
    exp: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="#5cb85c"/><path d="M9.2 9.3a2.9 2.9 0 0 1 5.6 1c0 1.9-2.8 2.4-2.8 4" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/><circle cx="12" cy="17.6" r="1.3" fill="#fff"/></svg>',
    marca: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="#e8574b"/><path d="m12 5.6 1.9 3.9 4.3.6-3.1 3 .7 4.3L12 15.4l-3.8 2 .7-4.3-3.1-3 4.3-.6z" fill="#fff"/></svg>',
    estrella: '<svg viewBox="0 0 24 24"><path d="m12 2.5 2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5L2.5 9.4l6.6-.9z" fill="#f5c518"/></svg>'
  };

  /* ---------- marcadas (de este usuario) ---------- */
  async function cargarMarcadas(){
    const { data, error: e } = await sb.from('especifico_marcadas').select('pregunta_id');
    if(!e){ marcadas = new Set((data || []).map(r => r.pregunta_id)); marcadasCargadas = true; }
  }
  async function alternarMarca(id){
    const poner = !marcadas.has(id);
    if(poner) marcadas.add(id); else marcadas.delete(id);
    repintar(id);
    const q = poner ? sb.from('especifico_marcadas').insert({ pregunta_id: id })
                    : sb.from('especifico_marcadas').delete().eq('pregunta_id', id);
    const { error: e } = await q;
    if(e){
      if(poner) marcadas.delete(id); else marcadas.add(id);
      repintar(id);
      uiToast('No se pudo ' + (poner ? 'marcar' : 'desmarcar') + ': ' + e.message, 'error');
    } else if(poner) uiToast('Guardada en Preguntas marcadas', 'success', { duration: 1800 });
  }
  function numMarcadas(){ return marcadasCargadas ? marcadas.size : null; }

  /* ---------- abrir ---------- */
  function empezar(m){
    modo = m; preguntas = []; resp = {}; abiertas = new Set(); error = ''; sesion = null;
    enviarRespuestas();   // las que quedaran pendientes de otra vez
    showScreen('screen-esp-test');
    arriba();
  }
  async function abrir(t){
    empezar('test'); test = t;
    if(cache.has(t.id)) preguntas = cache.get(t.id);
    else{
      cargando = true; pintar();
      const [r] = await Promise.all([
        sb.from('especifico_preguntas').select('id,orden,enunciado,opciones,correcta,tiene_explicacion,dificultad').eq('test_id', t.id).order('orden'),
        marcadasCargadas ? null : cargarMarcadas()
      ]);
      cargando = false;
      if(r.error) error = r.error.message;
      else{ preguntas = r.data || []; cache.set(t.id, preguntas); }
    }
    if(!marcadasCargadas) await cargarMarcadas();
    pintar();
  }
  async function abrirMarcadas(){
    empezar('marcadas'); test = null; filtro = null; todasMarcadas = [];
    cargando = true; pintar();
    const { data, error: e } = await sb.from('especifico_marcadas')
      .select('created_at, especifico_preguntas(id,orden,enunciado,opciones,correcta,tiene_explicacion,dificultad,test_id,especifico_tests(id,titulo,tema,orden))');
    cargando = false;
    if(e){ error = e.message; pintar(); return; }
    const filas = (data || []).map(r => r.especifico_preguntas).filter(p => p && p.especifico_tests);
    marcadas = new Set(filas.map(p => p.id)); marcadasCargadas = true;
    // Ordenadas por tema (como en la lista), test y número de pregunta.
    const posTema = k => ESP.temas().findIndex(x => x.clave === k);
    filas.sort((a, b) => posTema(a.especifico_tests.tema) - posTema(b.especifico_tests.tema)
      || a.especifico_tests.orden - b.especifico_tests.orden
      || String(a.especifico_tests.titulo).localeCompare(String(b.especifico_tests.titulo))
      || a.orden - b.orden);
    todasMarcadas = filas; filtro = null; preguntas = [];
    pintar();
  }
  // Dentro de Preguntas marcadas: todas juntas o solo las de un tema. Cada vez es una prueba nueva.
  function elegirMarcadas(f){
    filtro = f; resp = {}; abiertas = new Set(); sesion = null;
    preguntas = f == null ? [] : todasMarcadas.filter(p => marcadas.has(p.id) && (f === 'todas' || p.especifico_tests.tema === f));
    pintar(); arriba();
  }
  const nombreFiltro = () => filtro === 'todas' ? 'Todas juntas' : temaDe(filtro);
  // El índice: «Todas juntas» y un recuadro por tema con cuántas tiene.
  function indiceMarcadas(){
    const vivas = todasMarcadas.filter(p => marcadas.has(p.id));
    const n = {};
    vivas.forEach(p => { n[p.especifico_tests.tema] = (n[p.especifico_tests.tema] || 0) + 1; });
    const temas = ESP.temas().map((t, i) => Object.assign({ num: i + 1 }, t)).filter(t => n[t.clave]);
    const fila = (f, ico, titulo, sub, cant) => '<button type="button" class="espm-fila" data-espt="filtro" data-f="' + f + '">' +
      '<span class="espm-ico">' + ico + '</span><span class="espm-txt"><b>' + titulo + '</b>' + (sub ? '<span>' + sub + '</span>' : '') + '</span>' +
      '<span class="espm-n">' + cant + '</span><span class="espm-flecha">›</span></button>';
    return '<button type="button" class="espm-todas" data-espt="filtro" data-f="todas"><span class="espm-todas-txt"><b>Hacer todas juntas</b>' +
        '<span>' + vivas.length + (vivas.length === 1 ? ' pregunta' : ' preguntas') + ' de ' + temas.length + (temas.length === 1 ? ' tema' : ' temas') + ', ordenadas por tema</span></span><span class="espm-flecha">›</span></button>' +
      '<h3 class="espm-sub">Por tema</h3>' +
      '<div class="espm-lista">' + temas.map(t => fila(t.clave, t.icono, escapeHtml(t.titulo), 'Tema ' + t.num, n[t.clave])).join('') + '</div>';
  }

  /* ---------- pintar ---------- */
  function cabecera(){
    if(modo === 'marcadas'){
      if(filtro == null) return '<nav class="espt-migas"><button type="button" data-espt="volver">Específico</button> <span>›</span> <b>Preguntas marcadas</b></nav>' +
        '<h2 class="espt-h">Preguntas marcadas</h2>' +
        '<div class="espt-cab"><div class="espt-etiqueta">Tus preguntas guardadas</div>' +
        '<div class="espt-cab-txt">Hazlas todas juntas o elige un tema. Quita la marca cuando ya te las sepas.</div></div>';
      return '<nav class="espt-migas"><button type="button" data-espt="volver">Específico</button> <span>›</span> <button type="button" data-espt="filtro" data-f="">Preguntas marcadas</button> <span>›</span> <b>' + escapeHtml(nombreFiltro()) + '</b></nav>' +
        '<h2 class="espt-h">Preguntas marcadas</h2>' +
        '<div class="espt-cab"><div class="espt-etiqueta">' + (filtro === 'todas' ? 'Todas juntas' : 'Tema:') + '</div>' +
        (filtro === 'todas' ? '<div class="espt-cab-txt">Todas tus preguntas marcadas, ordenadas por tema y test.</div>' : '<div class="espt-campo">' + escapeHtml(temaDe(filtro)) + '</div>') + '</div>';
    }
    return '<nav class="espt-migas"><button type="button" data-espt="volver">Específico</button> <span>›</span> <b>Preguntas</b></nav>' +
      '<h2 class="espt-h">Preguntas del test</h2>' +
      '<div class="espt-cab">' +
        '<div class="espt-etiqueta">Tema:</div><div class="espt-campo">' + escapeHtml(test ? temaDe(test.tema) : '') + '</div>' +
        '<div class="espt-etiqueta">Descripción:</div><div class="espt-campo">' + escapeHtml(test ? test.titulo : '') + '</div>' +
      '</div>';
  }
  function tarjeta(p){
    const elegida = resp[p.id];
    const ops = (p.opciones || []).map(o => {
      let tick = '<span class="espt-tick"></span>', cls = 'espt-op';
      if(elegida){
        if(o.l === p.correcta){ tick = '<span class="espt-tick bien">✓</span>'; cls += elegida === p.correcta ? ' acierto' : ' era'; }
        else if(o.l === elegida){ tick = '<span class="espt-tick mal">✗</span>'; cls += ' fallo'; }
      }
      return '<button type="button" class="' + cls + '" data-p="' + p.id + '" data-op="' + escapeHtml(o.l) + '"' + (elegida ? ' disabled' : '') + '>' +
        tick +
        '<span class="espt-letra">' + escapeHtml(o.l) + '</span><span class="espt-op-txt">' + html(o.html) + '</span></button>';
    }).join('');
    const dif = DIF[p.dificultad] ? p.dificultad : 'nd';
    return '<article class="espt-preg dif-' + dif + '" id="espt-' + p.id + '" title="Dificultad: ' + (DIF[p.dificultad] || 'sin dato') + '">' +
      (marcadas.has(p.id) ? '<span class="espt-estrella" title="Marcada">' + ICO.estrella + '</span>' : '') +
      '<div class="espt-iconos">' +
        (p.tiene_explicacion ? '<button type="button" data-espt="exp" data-p="' + p.id + '" title="Ver explicación" aria-label="Ver explicación">' + ICO.exp + '</button>' : '') +
        '<button type="button" data-espt="marca" data-p="' + p.id + '" title="' + (marcadas.has(p.id) ? 'Quitar de Preguntas marcadas' : 'Guardar en Preguntas marcadas') + '" aria-label="Marcar pregunta">' + ICO.marca + '</button>' +
      '</div>' +
      '<div class="espt-enunciado">' + html(p.enunciado) + '</div>' +
      '<div class="espt-ops">' + ops + '</div>' +
      (elegida && elegida !== p.correcta ? '<div class="espt-correcta">La correcta es la <b>' + escapeHtml(p.correcta) + ')</b></div>' : '') +
      (abiertas.has(p.id) ? '<div class="espt-exp">' + (expl.has(p.id) ? html(expl.get(p.id)) : '<span class="espt-cargando">Cargando explicación…</span>') + '</div>' : '') +
      '</article>';
  }
  function pie(){
    const n = preguntas.length, hechas = preguntas.filter(p => resp[p.id]).length;
    const bien = preguntas.filter(p => resp[p.id] && resp[p.id] === p.correcta).length;
    return '<div class="espt-pie"><span>' + hechas + ' de ' + n + ' respondidas · ' + bien + (bien === 1 ? ' acierto' : ' aciertos') + ' · ' + (hechas - bien) + (hechas - bien === 1 ? ' fallo' : ' fallos') + '</span>' +
      (hechas ? '<button type="button" data-espt="reiniciar">Volver a empezar</button>' : '') + '</div>';
  }
  function lista(){
    if(modo !== 'marcadas') return '<div class="espt-lista">' + preguntas.map(tarjeta).join('') + '</div>';
    // Marcadas: con el tema y el test encima de cada grupo.
    let out = '', tema = null, testId = null;
    preguntas.forEach(p => {
      const t = p.especifico_tests;
      let g = '';
      if(t.tema !== tema){ tema = t.tema; testId = null; if(filtro === 'todas') g += '<h3 class="espt-grupo-tema">' + escapeHtml(temaDe(t.tema)) + '</h3>'; }
      if(t.id !== testId){ testId = t.id; g += '<div class="espt-grupo-test">Test - <b>' + escapeHtml(t.titulo) + '</b></div>'; }
      if(g) out += '<div class="espt-grupo">' + g + '</div>';
      out += tarjeta(p);
    });
    return '<div class="espt-lista">' + out + '</div>';
  }
  function pintar(){
    const r = root();
    if(!r) return;
    if(cargando){ r.innerHTML = cabecera() + '<div class="esp-vacio">Cargando preguntas…</div>'; return; }
    if(error){ r.innerHTML = cabecera() + '<div class="esp-vacio">No se pudieron cargar las preguntas: ' + escapeHtml(error) + '</div>'; return; }
    if(modo === 'marcadas' && filtro == null && todasMarcadas.some(p => marcadas.has(p.id))){ r.innerHTML = cabecera() + indiceMarcadas(); return; }
    if(!preguntas.length){
      r.innerHTML = cabecera() + '<div class="esp-vacio">' + (modo === 'marcadas'
        ? 'Todavía no has marcado ninguna pregunta. En un test, pulsa el botón rojo de la estrella para guardarla aquí.'
        : 'Este test todavía no tiene preguntas.') + '</div>';
      return;
    }
    r.innerHTML = cabecera() + lista() + pie();
  }
  // Solo se repinta la pregunta tocada (y el pie), para no saltar de sitio.
  function repintar(id){
    const p = preguntas.find(x => x.id === id), el = document.getElementById('espt-' + id);
    if(!p || !el) return pintar();
    el.outerHTML = tarjeta(p);
    const pieEl = root().querySelector('.espt-pie');
    if(pieEl) pieEl.outerHTML = pie();
  }

  /* Cada respuesta se guarda para Estadísticas › Específico (tabla
     especifico_respuestas). Primero va a una cola en el dispositivo y de ahí
     a Supabase: sin conexión no se pierde, se envía en cuanto se pueda. */
  const COLA = 'pj_esp_respuestas_pendientes:';
  const claveCola = () => currentUser ? COLA + currentUser.id : null;
  function leerCola(){ try{ return JSON.parse(localStorage.getItem(claveCola()) || '[]'); }catch(e){ return []; } }
  function escribirCola(c){
    try{ c.length ? localStorage.setItem(claveCola(), JSON.stringify(c.slice(-5000))) : localStorage.removeItem(claveCola()); }catch(e){}
  }
  let enviando = false;
  async function enviarRespuestas(){
    if(enviando || !currentUser) return;
    const c = leerCola();
    if(!c.length) return;
    enviando = true;
    try{
      const { error } = await sb.from('especifico_respuestas').insert(c);
      // Si alguna pregunta ya no existe (la borró el administrador), esa tanda no vale: se descarta.
      if(!error || error.code === '23503'){
        escribirCola(leerCola().slice(c.length));
        if(typeof ESTE !== 'undefined') ESTE.invalidar();
      }
    }catch(e){}
    enviando = false;
  }
  function guardarRespuesta(id, acierto){
    const pru = typeof PRU !== 'undefined';
    if(pru && !sesion) sesion = { id: PRU.nuevoId(), inicio: Date.now(), created_at: new Date().toISOString() };
    registrar([{ pregunta_id: id, acierto, prueba_id: sesion ? sesion.id : null }]);
    if(pru) guardarSesion();
  }
  // El historial: las respondidas, en el orden del test, con su nota (como en las pruebas).
  function guardarSesion(){
    const hechas = preguntas.filter(p => resp[p.id]);
    let pts = 0, bien = 0, mal = 0;
    hechas.forEach(p => {
      if(resp[p.id] === p.correcta){ bien++; pts++; }
      else { mal++; const n = (p.opciones || []).length || 4; pts -= n > 1 ? 1 / (n - 1) : 0; }
    });
    const n = hechas.length, nota = n ? Math.max(0, pts / n * 10) : 0;
    const todo = { total: n, bien, mal, blanco: 0, nota };
    PRU.guardarSesion({ id: sesion.id, modo: 'esp-tb', nota: Number(nota.toFixed(2)), segundos: Math.round((Date.now() - sesion.inicio) / 1000), created_at: sesion.created_at,
      resumen: { todo, l: { total: 0, bien: 0, mal: 0, blanco: 0, nota: 0 }, e: todo, titulo: modo === 'marcadas' ? 'Preguntas marcadas · ' + nombreFiltro() : (test ? test.titulo : '') },
      preguntas: hechas.map(p => ({ k: 'e', id: p.id })), respuestas: hechas.map(p => (p.opciones || []).findIndex(o => o.l === resp[p.id])) });
  }
  // También las usan las pruebas de js/pruebas.js (Simulacro conjunto y modos del Específico).
  function registrar(lista){
    if(!claveCola() || !lista.length) return;
    const c = leerCola(), ahora = new Date().toISOString();
    // prueba_id: la prueba de js/pruebas.js de la que salen (para poder borrarlas con ella).
    lista.forEach(r => c.push({ pregunta_id: r.pregunta_id, acierto: !!r.acierto, created_at: ahora, prueba_id: r.prueba_id || null }));
    escribirCola(c);
    enviarRespuestas();
  }
  // Las de una prueba que se borra y aún no habían salido del dispositivo.
  function olvidarPrueba(id){ escribirCola(leerCola().filter(r => r.prueba_id !== id)); }
  addEventListener('online', enviarRespuestas);

  /* Las explicaciones (con sus imágenes) son casi todo el peso de las
     preguntas: no se descargan con el test, sino al abrir cada una, y se
     guardan en memoria mientras dure la sesión. Las usan también las
     pruebas de js/pruebas.js. */
  const expl = new Map(), pidiendo = new Map();
  function explicacion(id){
    if(expl.has(id)) return Promise.resolve(expl.get(id));
    if(pidiendo.has(id)) return pidiendo.get(id);
    const pr = sb.from('especifico_preguntas').select('explicacion').eq('id', id).single()
      .then(({ data, error }) => { if(error) throw error; expl.set(id, (data && data.explicacion) || ''); return expl.get(id); })
      .catch(() => { pidiendo.delete(id); return 'No se pudo cargar la explicación. Comprueba la conexión y vuelve a abrirla.'; })
      .finally(() => pidiendo.delete(id));
    pidiendo.set(id, pr);
    return pr;
  }

  function onClick(e){
    const op = e.target.closest('[data-op]');
    if(op && !op.disabled){
      const p = preguntas.find(x => x.id === op.dataset.p);
      if(!p || resp[p.id]) return;   // una sola respuesta: no se cambia
      resp[p.id] = op.dataset.op;
      guardarRespuesta(p.id, op.dataset.op === p.correcta);
      repintar(p.id);
      return;
    }
    const b = e.target.closest('[data-espt]');
    if(!b) return;
    const id = b.dataset.p;
    switch(b.dataset.espt){
      case 'volver': showScreen('screen-especifico'); break;
      case 'filtro': elegirMarcadas(b.dataset.f || null); break;
      case 'exp':
        if(abiertas.has(id)){ abiertas.delete(id); repintar(id); break; }
        abiertas.add(id); repintar(id);
        if(!expl.has(id)) explicacion(id).then(() => { if(abiertas.has(id)) repintar(id); });
        break;
      case 'marca': alternarMarca(id); break;
      case 'reiniciar': resp = {}; abiertas = new Set(); sesion = null; pintar(); arriba(); break;
    }
  }
  const enganchar = () => { const r = root(); if(r) r.addEventListener('click', onClick); };
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', enganchar); else enganchar();

  // Al cambiar de cuenta, nada de la anterior.
  function reiniciar(){ marcadas = new Set(); marcadasCargadas = false; cache.clear(); expl.clear(); }
  return { abrir, abrirMarcadas, numMarcadas, cargarMarcadas, reiniciar, enviarRespuestas, registrar, olvidarPrueba, explicacion };
})();
