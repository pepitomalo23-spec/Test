/* Específico: hacer un test (preguntas de especifico_preguntas) y ver las
   preguntas marcadas, con el diseño del aula virtual de tutorbomberos:
   cabecera naranja y todas las preguntas seguidas.
   - Cada vez que se entra, el test empieza de cero (las respuestas no se
     guardan).
   - Una sola respuesta por pregunta: queda fija, con ✓ si es la correcta o
     ✗ y, además, la correcta señalada.
   - La franja de la izquierda es la dificultad: verde (fácil), amarilla
     (media) o roja (difícil); gris si no se sabe.
   - El «?» verde abre la explicación; el botón rojo guarda la pregunta en
     «Preguntas marcadas» (tabla especifico_marcadas, de cada usuario). */
const ESPT = (function(){
  let modo = 'test', test = null, preguntas = [], resp = {}, abiertas = new Set(), cargando = false, error = '';
  let marcadas = new Set(), marcadasCargadas = false;
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
    modo = m; preguntas = []; resp = {}; abiertas = new Set(); error = '';
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
        sb.from('especifico_preguntas').select('id,orden,enunciado,opciones,correcta,explicacion,dificultad').eq('test_id', t.id).order('orden'),
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
    empezar('marcadas'); test = null;
    cargando = true; pintar();
    const { data, error: e } = await sb.from('especifico_marcadas')
      .select('created_at, especifico_preguntas(id,orden,enunciado,opciones,correcta,explicacion,dificultad,test_id,especifico_tests(id,titulo,tema,orden))');
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
    preguntas = filas;
    pintar();
  }

  /* ---------- pintar ---------- */
  function cabecera(){
    if(modo === 'marcadas'){
      return '<nav class="espt-migas"><button type="button" data-espt="volver">Específico</button> <span>›</span> <b>Preguntas marcadas</b></nav>' +
        '<h2 class="espt-h">Preguntas marcadas</h2>' +
        '<div class="espt-cab"><div class="espt-etiqueta">Tus preguntas guardadas</div>' +
        '<div class="espt-cab-txt">Las que has marcado con la estrella, ordenadas por tema y test. Quita la marca cuando ya te las sepas.</div></div>';
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
        (p.explicacion ? '<button type="button" data-espt="exp" data-p="' + p.id + '" title="Ver explicación" aria-label="Ver explicación">' + ICO.exp + '</button>' : '') +
        '<button type="button" data-espt="marca" data-p="' + p.id + '" title="' + (marcadas.has(p.id) ? 'Quitar de Preguntas marcadas' : 'Guardar en Preguntas marcadas') + '" aria-label="Marcar pregunta">' + ICO.marca + '</button>' +
      '</div>' +
      '<div class="espt-enunciado">' + html(p.enunciado) + '</div>' +
      '<div class="espt-ops">' + ops + '</div>' +
      (elegida && elegida !== p.correcta ? '<div class="espt-correcta">La correcta es la <b>' + escapeHtml(p.correcta) + ')</b></div>' : '') +
      (abiertas.has(p.id) ? '<div class="espt-exp">' + html(p.explicacion) + '</div>' : '') +
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
      if(t.tema !== tema){ tema = t.tema; testId = null; g += '<h3 class="espt-grupo-tema">' + escapeHtml(temaDe(t.tema)) + '</h3>'; }
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
    if(!claveCola()) return;
    const c = leerCola();
    c.push({ pregunta_id: id, acierto, created_at: new Date().toISOString() });
    escribirCola(c);
    enviarRespuestas();
  }
  addEventListener('online', enviarRespuestas);

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
      case 'exp': abiertas.has(id) ? abiertas.delete(id) : abiertas.add(id); repintar(id); break;
      case 'marca': alternarMarca(id); break;
      case 'reiniciar': resp = {}; abiertas = new Set(); pintar(); arriba(); break;
    }
  }
  const enganchar = () => { const r = root(); if(r) r.addEventListener('click', onClick); };
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', enganchar); else enganchar();

  // Al cambiar de cuenta, nada de la anterior.
  function reiniciar(){ marcadas = new Set(); marcadasCargadas = false; cache.clear(); }
  return { abrir, abrirMarcadas, numMarcadas, cargarMarcadas, reiniciar, enviarRespuestas };
})();
