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
  let sesion = null;
  let tarea = null, volverA = null, ultima = null;   // ultima: la última pregunta respondida   // si viene de una tarea del calendario: su id y adónde se vuelve         // la prueba de historial de esta vez: { id, inicio, created_at }
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
    nota: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="#3a8ee6"/><path d="M7.6 16.4l.7-2.9 5.9-5.9 2.2 2.2-5.9 5.9z" fill="#fff"/><path d="M7.4 17.6h9.2" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/></svg>',
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

  /* ---------- nota propia de cada pregunta (tabla especifico_notas) ----------
     Texto y hasta 5 imágenes, aparte de la explicación fija; solo de quien la
     escribe. Se ve bajo la pregunta una vez respondida y se escribe o cambia
     en una ventanita (botón del lápiz). La usan también las pruebas de
     js/pruebas.js. */
  let notas = new Map(), notasDe = null, cargandoNotas = null;
  const MAX_IMG = 5;
  function cargarNotas(){
    if(!currentUser) return Promise.resolve();
    if(notasDe === currentUser.id) return Promise.resolve();
    if(cargandoNotas) return cargandoNotas;
    cargandoNotas = sb.from('especifico_notas').select('pregunta_id,texto,imagenes').then(({ data, error }) => {
      if(!error){ notas = new Map((data || []).map(r => [r.pregunta_id, r])); notasDe = currentUser.id; }
    }).finally(() => { cargandoNotas = null; });
    return cargandoNotas;
  }
  function notaHtml(id){
    const n = notas.get(id);
    if(!n) return '';
    return '<div class="espn-nota"><div class="espn-nota-cab"><span>Tu nota</span><button type="button" data-espn-editar="' + id + '">Editar</button></div>' +
      (n.texto ? '<div class="espn-nota-txt">' + escapeHtml(n.texto) + '</div>' : '') +
      ((n.imagenes || []).length ? '<div class="espn-nota-imgs">' + n.imagenes.map(u => '<img src="' + escapeHtml(u) + '" alt="Imagen de tu nota" data-espn-img="' + escapeHtml(u) + '">').join('') + '</div>' : '') +
      '</div>';
  }
  // Clics de la nota que se ve dentro de una pregunta (aquí y en js/pruebas.js).
  function onNotaClick(e, alCambiar){
    const ed = e.target.closest('[data-espn-editar]');
    if(ed){ const id = ed.dataset.espnEditar; abrirNota(id, () => alCambiar && alCambiar(id)); return true; }
    const im = e.target.closest('[data-espn-img]');
    if(im){ if(typeof openImageLightbox === 'function') openImageLightbox(im.dataset.espnImg); return true; }
    return false;
  }
  function cerrarNota(){ const v = document.getElementById('espnHoja'); if(v) v.remove(); document.removeEventListener('keydown', teclaNota, true); }
  function teclaNota(e){ if(e.key === 'Escape'){ e.stopPropagation(); cerrarNota(); } }
  async function abrirNota(id, alCambiar){
    await cargarNotas();
    cerrarNota();
    const prev = notas.get(id) || { texto: '', imagenes: [] };
    const st = { imagenes: [...(prev.imagenes || [])], nuevas: [] };   // nuevas: archivos aún sin subir
    const bg = document.createElement('div');
    bg.className = 'espn-bg'; bg.id = 'espnHoja';
    bg.innerHTML = '<div class="espn-hoja" role="dialog" aria-modal="true" aria-label="Tu nota">' +
      '<div class="espn-cab"><h3>Tu nota</h3><button type="button" class="espn-x" data-n="cerrar" aria-label="Cerrar">✕</button></div>' +
      '<div class="espn-sub">Lo que quieras añadir a esta pregunta, aparte de la explicación. Solo la ves tú.</div>' +
      '<textarea class="espn-texto" maxlength="4000" placeholder="Escribe aquí con tus palabras…">' + escapeHtml(prev.texto || '') + '</textarea>' +
      '<div class="espn-imgs" data-imgs></div>' +
      '<label class="espn-anadir"><input type="file" accept="image/*" multiple hidden><span>+ Añadir imágenes</span></label>' +
      '<div class="espn-estado" data-estado></div>' +
      '<div class="espn-pie">' + (notas.has(id) ? '<button type="button" class="espn-btn peligro" data-n="borrar">Borrar nota</button>' : '') +
        '<button type="button" class="espn-btn primario" data-n="guardar">Guardar</button></div></div>';
    document.body.appendChild(bg);
    const pintaImgs = () => {
      const urls = st.imagenes.map((u, i) => ({ u, k: 'g' + i })).concat(st.nuevas.map((f, i) => ({ u: f.url, k: 'n' + i })));
      bg.querySelector('[data-imgs]').innerHTML = urls.map(x => '<div class="espn-img"><img src="' + escapeHtml(x.u) + '" alt=""><button type="button" data-quitar="' + x.k + '" aria-label="Quitar imagen">✕</button></div>').join('');
      bg.querySelector('.espn-anadir').classList.toggle('hidden', urls.length >= MAX_IMG);
    };
    pintaImgs();
    const estado = t => { bg.querySelector('[data-estado]').textContent = t || ''; };
    bg.querySelector('input[type=file]').addEventListener('change', e => {
      const fs = Array.from(e.target.files || []);
      const caben = MAX_IMG - st.imagenes.length - st.nuevas.length;
      if(fs.length > caben) uiToast('Caben ' + Math.max(0, caben) + ' imágenes más (máximo ' + MAX_IMG + ').', 'info');
      fs.slice(0, Math.max(0, caben)).forEach(f => st.nuevas.push({ f, url: URL.createObjectURL(f) }));
      e.target.value = '';
      pintaImgs();
    });
    const acabar = () => { cerrarNota(); if(alCambiar) alCambiar(); };
    bg.addEventListener('click', async e => {
      if(e.target === bg) return cerrarNota();
      const q = e.target.closest('[data-quitar]');
      if(q){ const k = q.dataset.quitar; if(k[0] === 'g') st.imagenes.splice(+k.slice(1), 1); else st.nuevas.splice(+k.slice(1), 1); pintaImgs(); return; }
      const b = e.target.closest('[data-n]');
      if(!b || b.disabled) return;
      if(b.dataset.n === 'cerrar') return cerrarNota();
      if(b.dataset.n === 'borrar'){
        if(!(await uiConfirm('¿Borrar tu nota de esta pregunta?', { ok: 'Borrar', danger: true }))) return;
        const { error } = await sb.from('especifico_notas').delete().eq('user_id', currentUser.id).eq('pregunta_id', id);
        if(error) return uiToast('No se pudo borrar: ' + error.message, 'error');
        notas.delete(id); uiToast('Nota borrada', 'success'); return acabar();
      }
      // Guardar: primero se suben las imágenes nuevas.
      const texto = bg.querySelector('.espn-texto').value.trim();
      bg.querySelectorAll('[data-n]').forEach(x => { x.disabled = true; });
      try{
        const urls = [...st.imagenes];
        for(let i = 0; i < st.nuevas.length; i++){
          estado('Subiendo imagen ' + (i + 1) + ' de ' + st.nuevas.length + '…');
          urls.push(await uploadOwnNoteImage('esp-' + id, st.nuevas[i].f));
        }
        estado('Guardando…');
        if(!texto && !urls.length){
          if(notas.has(id)){ const { error } = await sb.from('especifico_notas').delete().eq('user_id', currentUser.id).eq('pregunta_id', id); if(error) throw error; }
          notas.delete(id);
        } else {
          const fila = { pregunta_id: id, texto: texto || null, imagenes: urls, updated_at: new Date().toISOString() };
          const { error } = await sb.from('especifico_notas').upsert(fila, { onConflict: 'user_id,pregunta_id' });
          if(error) throw error;
          notas.set(id, fila);
        }
        uiToast('Nota guardada', 'success');
        acabar();
      }catch(err){
        estado('');
        bg.querySelectorAll('[data-n]').forEach(x => { x.disabled = false; });
        uiToast('No se pudo guardar la nota: ' + (typeof friendlyUploadErrorMessage === 'function' ? friendlyUploadErrorMessage(err) : (err.message || err)), 'error');
      }
    });
    document.addEventListener('keydown', teclaNota, true);
    if(!notas.has(id) && matchMedia('(hover: hover)').matches) setTimeout(() => bg.querySelector('.espn-texto').focus(), 50);
  }

  /* ---------- abrir ---------- */
  function empezar(m){
    modo = m; preguntas = []; resp = {}; abiertas = new Set(); error = ''; sesion = null; tarea = null; volverA = null; ultima = null;
    enviarRespuestas();   // las que quedaran pendientes de otra vez
    showScreen('screen-esp-test');
    arriba();
  }
  // op (desde el calendario): { tarea, progreso, volver } para seguir por donde se dejó.
  async function abrir(t, op){
    empezar('test'); test = t;
    cargarNotas().then(() => { if(modo === 'test' && test === t) pintar(); });
    if(op && op.tarea){
      tarea = op.tarea; volverA = op.volver || null;
      const p = op.progreso || {};
      resp = Object.assign({}, p.resp); sesion = p.sesion || null; ultima = p.ultima || null;
    }
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
    if(tarea && !error){
      // Solo cuentan las preguntas que siguen en el test. Al abrir no se guarda nada
      // (salvo que el test haya cambiado): solo se guarda al responder.
      const antes = Object.keys(resp).length;
      Object.keys(resp).forEach(id => { if(!preguntas.some(p => p.id === id)) delete resp[id]; });
      if(Object.keys(resp).length !== antes || ((op && op.progreso) || {}).total !== preguntas.length) avisarTarea();
    }
    pintar();
    if(tarea) irAPendiente();
  }
  // Para la tarea del calendario: lo respondido, cuántas tiene y si ya está todo.
  function avisarTarea(){
    if(!tarea || typeof CAL === 'undefined' || !preguntas.length) return;
    CAL.guardarProgreso(tarea, test.id, { resp: Object.assign({}, resp), sesion, total: preguntas.length, ultima });
  }
  // Al seguir un test a medias, a la primera pregunta sin responder.
  // Justo donde se dejó: la siguiente a la última respondida (o la primera sin responder).
  function irAPendiente(){
    if(!Object.keys(resp).length) return;
    const i = preguntas.findIndex(x => x.id === ultima);
    const p = (i >= 0 && preguntas.slice(i + 1).find(x => !resp[x.id])) || preguntas.find(x => !resp[x.id]) || preguntas[i];
    if(!p) return;
    // Se busca la pregunta cada vez (la lista se puede volver a pintar al llegar
    // las notas) y se repite un poco, por si las imágenes de arriba cambian el alto.
    const app = document.getElementById('app');
    let tocado = false;
    const mano = () => { tocado = true; };
    if(app){ app.addEventListener('touchstart', mano, { once: true, passive: true }); app.addEventListener('wheel', mano, { once: true, passive: true }); }
    const ir = () => { const el = !tocado && document.getElementById('espt-' + p.id); if(el) el.scrollIntoView({ block: 'center' }); };
    requestAnimationFrame(ir); [250, 700, 1500].forEach(t => setTimeout(ir, t));
  }
  async function abrirMarcadas(){
    empezar('marcadas'); test = null; filtro = null; todasMarcadas = [];
    cargarNotas().then(() => { if(modo === 'marcadas' && filtro != null) pintar(); });
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
    const origen = { 'screen-calendario': 'Calendario', 'screen-inicio': 'Inicio' }[volverA] || 'Específico';
    return '<nav class="espt-migas"><button type="button" data-espt="volver">' + origen + '</button> <span>›</span> <b>Preguntas</b></nav>' +
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
        (p.tiene_explicacion || notas.has(p.id) ? '<button type="button" data-espt="exp" data-p="' + p.id + '" title="Ver explicación" aria-label="Ver explicación">' + ICO.exp + '</button>' : '') +
        '<button type="button" data-espt="marca" data-p="' + p.id + '" title="' + (marcadas.has(p.id) ? 'Quitar de Preguntas marcadas' : 'Guardar en Preguntas marcadas') + '" aria-label="Marcar pregunta">' + ICO.marca + '</button>' +
        '<button type="button" data-espt="nota" data-p="' + p.id + '" title="' + (notas.has(p.id) ? 'Ver o cambiar tu nota' : 'Añadir tu nota (texto o imágenes)') + '" aria-label="Tu nota">' + ICO.nota + '</button>' +
      '</div>' +
      '<div class="espt-enunciado">' + html(p.enunciado) + '</div>' +
      '<div class="espt-ops">' + ops + '</div>' +
      (elegida && elegida !== p.correcta ? '<div class="espt-correcta">La correcta es la <b>' + escapeHtml(p.correcta) + ')</b></div>' : '') +
      // La explicación (al pulsar el «?») y, dentro, tu nota.
      (abiertas.has(p.id) ? '<div class="espt-exp">' + (!p.tiene_explicacion ? '' : expl.has(p.id) ? html(expl.get(p.id)) : '<span class="espt-cargando">Cargando explicación…</span>') + notaHtml(p.id) + '</div>' : '') +
      '</article>';
  }
  function pie(){
    const n = preguntas.length, hechas = preguntas.filter(p => resp[p.id]).length;
    const bien = preguntas.filter(p => resp[p.id] && resp[p.id] === p.correcta).length;
    // Sin «Volver a empezar»: de un toque se perdía todo lo respondido (también el avance de la tarea del calendario).
    return '<div class="espt-pie"><span>' + hechas + ' de ' + n + ' respondidas · ' + bien + (bien === 1 ? ' acierto' : ' aciertos') + ' · ' + (hechas - bien) + (hechas - bien === 1 ? ' fallo' : ' fallos') + '</span></div>';
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
    avisarTarea();
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
    if(onNotaClick(e, id => repintar(id))) return;
    const op = e.target.closest('[data-op]');
    if(op && !op.disabled){
      const p = preguntas.find(x => x.id === op.dataset.p);
      if(!p || resp[p.id]) return;   // una sola respuesta: no se cambia
      resp[p.id] = op.dataset.op; ultima = p.id;
      guardarRespuesta(p.id, op.dataset.op === p.correcta);
      repintar(p.id);
      return;
    }
    const b = e.target.closest('[data-espt]');
    if(!b) return;
    const id = b.dataset.p;
    switch(b.dataset.espt){
      case 'volver': showScreen(volverA || 'screen-especifico'); break;
      case 'filtro': elegirMarcadas(b.dataset.f || null); break;
      case 'exp':
        if(abiertas.has(id)){ abiertas.delete(id); repintar(id); break; }
        abiertas.add(id); repintar(id);
        if(!expl.has(id) && (preguntas.find(x => x.id === id) || {}).tiene_explicacion) explicacion(id).then(() => { if(abiertas.has(id)) repintar(id); });
        break;
      case 'marca': alternarMarca(id); break;
      case 'nota': abrirNota(id, () => {
        // Al guardarla se abre la explicación, que es donde se ve la nota.
        if(notas.has(id)){
          abiertas.add(id);
          if(!expl.has(id) && (preguntas.find(x => x.id === id) || {}).tiene_explicacion) explicacion(id).then(() => { if(abiertas.has(id)) repintar(id); });
        }
        repintar(id);
      }); break;
    }
  }
  const enganchar = () => { const r = root(); if(r) r.addEventListener('click', onClick); };
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', enganchar); else enganchar();

  // Al cambiar de cuenta, nada de la anterior.
  function reiniciar(){ notas = new Map(); notasDe = null; marcadas = new Set(); marcadasCargadas = false; cache.clear(); expl.clear(); }
  // También las usa el diseño de tutorbomberos de js/pruebas.js.
  async function alternarMarcaDesde(id){ if(!marcadasCargadas) await cargarMarcadas(); return alternarMarca(id); }
  return { cargarNotas, notaHtml, abrirNota, onNotaClick, tieneNota: id => notas.has(id), estaMarcada: id => marcadas.has(id), alternarMarca: alternarMarcaDesde, abrir, abrirMarcadas, numMarcadas, cargarMarcadas, reiniciar, enviarRespuestas, registrar, olvidarPrueba, explicacion };
})();
