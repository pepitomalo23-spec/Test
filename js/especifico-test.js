/* Específico: hacer un test (preguntas de especifico_preguntas) y ver las
   preguntas marcadas, con el diseño del aula virtual de tutorbomberos:
   cabecera naranja y todas las preguntas seguidas.
   - Un test a medias se sigue donde se dejó (aquí o en otro dispositivo:
     js/sincro.js); «Empezar de cero» lo vacía. Lo que se responde va
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
    const { data, error: e } = await sb.from('especifico_marcadas').select('pregunta_id, escalon, proxima, ultima, sabida_at');
    if(e) return;
    const filas = data || [];
    marcadas = new Set(filas.filter(r => !r.sabida_at).map(r => r.pregunta_id));
    plan = new Map(filas.map(r => [r.pregunta_id, { escalon: r.escalon || 0, proxima: r.proxima || hoyISO(), ultima: r.ultima || null, sabida: !!r.sabida_at }]));
    marcadasCargadas = true;
  }
  async function alternarMarca(id){
    const poner = !marcadas.has(id);
    if(poner) marcadas.add(id); else marcadas.delete(id);
    const antes = plan.get(id);
    if(poner) plan.set(id, { escalon: 0, proxima: hoyISO(), ultima: null, sabida: false }); else plan.delete(id);
    repintar(id);
    // Marcarla (también una que ya te sabías): empieza desde el principio, para mañana… o para hoy.
    const q = poner ? sb.from('especifico_marcadas').upsert({ pregunta_id: id, escalon: 0, proxima: hoyISO(), ultima: null, sabida_at: null }, { onConflict: 'user_id,pregunta_id' })
                    : sb.from('especifico_marcadas').delete().eq('pregunta_id', id);
    const { error: e } = await q;
    if(e){
      if(poner) marcadas.delete(id); else marcadas.add(id);
      if(antes) plan.set(id, antes); else plan.delete(id);
      repintar(id);
      uiToast('No se pudo ' + (poner ? 'marcar' : 'desmarcar') + ': ' + e.message, 'error');
    } else if(poner) uiToast('Guardada en Preguntas marcadas', 'success', { duration: 1800 });
  }
  function numMarcadas(){ return marcadasCargadas ? marcadas.size : null; }

  /* ---------- Marcadas de hoy: el repaso de cada día ----------
     Solo las que tú marcas. Cada una sube por escalones y vuelve a salir
     cada vez más tarde: 1, 3, 7, 15, 30 y 60 días (unos 4 meses en total).
       · Acertada sin dudar: sube un escalón.
       · «Dudé» (solo sale aquí): se queda en su escalón.
       · Fallada: vuelve al principio (sale mañana).
       · Acertada en el último escalón: ya te la sabes y deja de salir
         (sale en «Ya te las sabes» y se puede volver a marcar).
     Todos los temas mezclados. Las que ya llevas empezadas salen todas las
     que toquen; las nuevas, como mucho 30 al día (para que no se junten).
     Una vez al día como mucho: lo que se hace en «Hacer todas juntas» o por
     tema es práctica y no las mueve. Las opciones salen en otro orden cada
     vez (con su letra de siempre), para no aprenderse «era la de arriba». */
  const DIAS = [1, 3, 7, 15, 30, 60];
  const NUEVAS_DIA = 30;
  let plan = new Map();    // pregunta_id → { escalon, proxima ('AAAA-MM-DD'), ultima, sabida }
  let hoyRep = null;       // en el repaso de hoy: { antes: Map(id → plan de antes), dudadas: Set, mas: n.º de tandas extra de nuevas }
  function hoyISO(dias){
    const d = new Date(); d.setHours(12, 0, 0, 0); if(dias) d.setDate(d.getDate() + dias);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  // Lo que toca hoy: las empezadas que tocan y hasta 30 nuevas (las primeras que marcaste).
  function deHoy(extra){
    const hoy = hoyISO(), toca = [...marcadas].filter(id => { const x = plan.get(id); return x && x.proxima <= hoy; });
    const empezadas = toca.filter(id => plan.get(id).ultima), nuevas = toca.filter(id => !plan.get(id).ultima);
    const cupo = Math.max(0, NUEVAS_DIA * (1 + (extra || 0)) - nuevasHechas());
    return { empezadas, nuevas: nuevas.slice(0, cupo), quedanNuevas: Math.max(0, nuevas.length - cupo) };
  }
  // Cuántas nuevas se han empezado hoy (en este dispositivo y en la cuenta: js/sincro.js).
  const claveNuevas = () => currentUser ? 'pj_esp_nuevas:' + currentUser.id : null;
  function nuevasHechas(){ try{ const x = JSON.parse(localStorage.getItem(claveNuevas()) || 'null'); return x && x.dia === hoyISO() ? x.n : 0; }catch(e){ return 0; } }
  function sumarNueva(){
    try{ localStorage.setItem(claveNuevas(), JSON.stringify({ dia: hoyISO(), n: nuevasHechas() + 1 })); SINC.cambiado('esp-nuevas'); }catch(e){}
  }
  SINC.registrar('esp-nuevas', claveNuevas);
  // Para Inicio y el índice: cuántas tocan hoy (null mientras se cargan).
  function cuantasHoy(){
    if(!marcadasCargadas) return null;
    const d = deHoy();
    return { total: d.empezadas.length + d.nuevas.length, quedanNuevas: d.quedanNuevas, marcadas: marcadas.size, sabidas: [...plan.values()].filter(x => x.sabida).length };
  }
  // El escalón que queda tras responder (desde el de antes de hoy).
  function siguiente(antes, como){
    const e = antes.escalon || 0;
    if(como === 'mal') return { escalon: 0, proxima: hoyISO(1), sabida: false };
    if(como === 'dude') return { escalon: e, proxima: hoyISO(e ? DIAS[e - 1] : 1), sabida: false };
    if(e >= DIAS.length) return { escalon: e, proxima: hoyISO(DIAS[DIAS.length - 1]), sabida: true };
    return { escalon: e + 1, proxima: hoyISO(DIAS[e]), sabida: false };
  }
  async function apuntarRepaso(id, como){
    const antes = hoyRep.antes.get(id);
    if(!antes) return;
    const n = siguiente(antes, como), hoy = hoyISO();
    const yaHoy = (plan.get(id) || {}).ultima === hoy;
    plan.set(id, { escalon: n.escalon, proxima: n.proxima, ultima: hoy, sabida: n.sabida, como });
    if(!antes.ultima && !yaHoy) sumarNueva();
    if(n.sabida) marcadas.delete(id); else marcadas.add(id);
    const { error: e } = await sb.from('especifico_marcadas').update({ escalon: n.escalon, proxima: n.proxima, ultima: hoy, sabida_at: n.sabida ? new Date().toISOString() : null }).eq('pregunta_id', id);
    if(e) uiToast('No se pudo guardar el repaso: ' + e.message, 'error');
  }
  function dude(id){
    const p = preguntas.find(x => x.id === id);
    if(!hoyRep || !p || resp[id] !== p.correcta) return;
    if(hoyRep.dudadas.has(id)){ hoyRep.dudadas.delete(id); apuntarRepaso(id, 'bien'); }
    else { hoyRep.dudadas.add(id); apuntarRepaso(id, 'dude'); }
    repintar(id);
  }
  const barajarOps = p => {
    const ops = (p.opciones || []).slice();
    for(let i = ops.length - 1; i > 0; i--){ const j = Math.floor(Math.random() * (i + 1)); [ops[i], ops[j]] = [ops[j], ops[i]]; }
    return Object.assign({}, p, { opciones: ops, _ops: p.opciones });
  };
  async function abrirHoy(mas){
    const extra = hoyRep && mas ? hoyRep.mas + 1 : 0;
    empezar('hoy'); test = null; filtro = null;
    cargarNotas().then(() => { if(modo === 'hoy') pintar(); });
    cargando = true; pintar();
    if(!marcadasCargadas || !todasMarcadas.length){
      await cargarMarcadas();
      const { data, error: e } = await sb.from('especifico_marcadas')
        .select('especifico_preguntas(id,orden,enunciado,opciones,correcta,tiene_explicacion,dificultad,test_id,especifico_tests(id,titulo,tema,orden))');
      if(e){ cargando = false; error = e.message; pintar(); return; }
      todasMarcadas = (data || []).map(r => r.especifico_preguntas).filter(p => p && p.especifico_tests);
    }
    cargando = false;
    let d = deHoy(extra), mas2 = extra;
    // Hecho lo de hoy pero quedan nuevas: «Hacer más» (otra tanda).
    while(!d.empezadas.length && !d.nuevas.length && d.quedanNuevas && mas2 < 50) d = deHoy(++mas2);
    const ids = new Set(d.empezadas.concat(d.nuevas));
    const lista = todasMarcadas.filter(p => ids.has(p.id));
    hoyRep = { antes: new Map(lista.map(p => [p.id, Object.assign({}, plan.get(p.id))])), dudadas: new Set(), mas: mas2, quedanNuevas: d.quedanNuevas };
    // Todos los temas mezclados.
    preguntas = shuffleArray(lista).map(barajarOps);
    pintar(); arriba();
  }
  // Las que ya te sabes (para verlas o volver a marcarlas).
  async function abrirSabidas(){
    if(!todasMarcadas.length) await abrirMarcadas();
    modo = 'marcadas'; filtro = 'sabidas'; resp = {}; abiertas = new Set(); sesion = null;
    const ids = new Set([...plan].filter(([, x]) => x.sabida).map(([id]) => id));
    preguntas = todasMarcadas.filter(p => ids.has(p.id));
    pintar(); arriba();
  }
  const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  function fechaCorta(iso){ const [a, m, d] = iso.split('-').map(Number); return d + ' ' + MESES[m - 1]; }
  // Bajo cada marcada: su escalón (●●○○○○) y cuándo vuelve.
  function escalonHtml(id){
    const x = plan.get(id);
    if(!x || (!marcadas.has(id) && !x.sabida)) return '';
    const e = Math.min(x.escalon, DIAS.length);
    const puntos = DIAS.map((d, i) => '<i' + (i < e ? ' class="on"' : '') + '></i>').join('');
    const cuando = x.sabida ? 'Ya te la sabes' : x.proxima <= hoyISO() ? 'Toca hoy' : 'Vuelve el ' + fechaCorta(x.proxima);
    return '<div class="espm-escalon" title="Escalón ' + e + ' de ' + DIAS.length + '"><span class="espm-puntos">' + puntos + '</span>' + cuando + '</div>';
  }

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

  /* ---------- tests a medias (para seguir aquí o en otro dispositivo) ----------
     De cada test sin terminar: lo respondido, la prueba del historial y la
     última respondida. En el dispositivo y en la cuenta (js/sincro.js). Los
     de una tarea del calendario van con la tarea, como siempre. */
  const CURSO = 'pj_esp_curso:';
  const claveCurso = () => currentUser ? CURSO + currentUser.id : null;
  function leerCurso(){ try{ return JSON.parse(localStorage.getItem(claveCurso()) || '{}') || {}; }catch(e){ return {}; } }
  function escribirCurso(c){
    if(!claveCurso()) return;
    // Los 15 más recientes bastan.
    const ids = Object.keys(c).sort((a, b) => (c[b].at || 0) - (c[a].at || 0));
    ids.slice(15).forEach(id => delete c[id]);
    try{ Object.keys(c).length ? localStorage.setItem(claveCurso(), JSON.stringify(c)) : localStorage.removeItem(claveCurso()); }catch(e){}
    SINC.cambiado('esp');
  }
  function guardarCurso(){
    if(modo !== 'test' || tarea || !test || !preguntas.length) return;
    const c = leerCurso(), n = Object.keys(resp).length;
    if(!n || n >= preguntas.length) delete c[test.id];   // sin empezar o ya terminado: nada a medias
    else c[test.id] = { test: { id: test.id, titulo: test.titulo, tema: test.tema }, resp: Object.assign({}, resp), sesion, ultima, total: preguntas.length, at: Date.now() };
    escribirCurso(c);
  }
  // Para Inicio: el test a medias más reciente.
  function aMedias(){
    const c = leerCurso(), x = Object.values(c).sort((a, b) => (b.at || 0) - (a.at || 0))[0];
    return x ? { id: x.test.id, titulo: x.test.titulo, hechas: Object.keys(x.resp || {}).length, total: x.total || 0 } : null;
  }
  function continuarCurso(id){
    const x = leerCurso()[id];
    if(x) abrir(x.test, null, 'screen-inicio');
  }
  function empezarDeCero(){
    if(!test) return;
    uiConfirm('Se borra lo que llevas de este test (lo ya respondido sigue en tu historial y en Estadísticas).', { title: '¿Empezar de cero?', ok: 'Empezar de cero', danger: true }).then(ok => {
      if(!ok) return;
      resp = {}; sesion = null; ultima = null; reanudado = false;
      const c = leerCurso(); delete c[test.id]; escribirCurso(c);
      pintar(); arriba();
    });
  }
  let reanudado = false;   // se ha seguido un test a medias (sale «Empezar de cero»)
  // Llega de otro dispositivo algo más nuevo: si se está con ese test, se coge lo de allí.
  SINC.registrar('esp', claveCurso, () => {
    const enTest = modo === 'test' && test && !tarea && SINC.enPantalla('screen-esp-test');
    if(enTest){
      const x = leerCurso()[test.id];
      if(x){ resp = Object.assign({}, x.resp); sesion = x.sesion || sesion; ultima = x.ultima || null; reanudado = true; pintar(); irAPendiente(); }
    }
    if(typeof INICIO !== 'undefined') INICIO.pintar();
  });

  /* ---------- abrir ---------- */
  function empezar(m){
    modo = m; preguntas = []; resp = {}; abiertas = new Set(); error = ''; sesion = null; tarea = null; volverA = null; ultima = null; reanudado = false;
    if(m !== 'hoy') hoyRep = null;
    enviarRespuestas();   // las que quedaran pendientes de otra vez
    showScreen('screen-esp-test');
    arriba();
  }
  // op (desde el calendario): { tarea, progreso, volver } para seguir por donde se dejó.
  async function abrir(t, op, volver){
    empezar('test'); test = t;
    if(volver) volverA = volver;
    cargarNotas().then(() => { if(modo === 'test' && test === t) pintar(); });
    if(op && op.tarea){
      tarea = op.tarea; volverA = op.volver || null;
      const p = op.progreso || {};
      resp = Object.assign({}, p.resp); sesion = p.sesion || null; ultima = p.ultima || null;
    }else{
      // Sin tarea: si se dejó a medias (aquí o en otro dispositivo), se sigue.
      const x = leerCurso()[t.id];
      if(x){ resp = Object.assign({}, x.resp); sesion = x.sesion || null; ultima = x.ultima || null; reanudado = true; }
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
    if(reanudado){
      // Solo cuentan las que siguen en el test.
      Object.keys(resp).forEach(id => { if(!preguntas.some(p => p.id === id)) delete resp[id]; });
      if(!Object.keys(resp).length) reanudado = false;
    }
    pintar();
    if(tarea || reanudado) irAPendiente();
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
    const [{ data, error: e }] = await Promise.all([sb.from('especifico_marcadas')
      .select('created_at, especifico_preguntas(id,orden,enunciado,opciones,correcta,tiene_explicacion,dificultad,test_id,especifico_tests(id,titulo,tema,orden))'), cargarMarcadas()]);
    cargando = false;
    if(e){ error = e.message; pintar(); return; }
    const filas = (data || []).map(r => r.especifico_preguntas).filter(p => p && p.especifico_tests);
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
    const q = cuantasHoy(), sab = q ? q.sabidas : 0;
    const hoy = q ? '<button type="button" class="espm-todas espm-hoy" data-espt="hoy"' + (q.total || q.quedanNuevas ? '' : ' disabled') + '><span class="espm-todas-txt"><b>Marcadas de hoy' + (q.total ? ' · ' + q.total : '') + '</b>' +
        '<span>' + (q.total ? 'Todos los temas mezclados' + (q.quedanNuevas ? ' · ' + q.quedanNuevas + ' nuevas esperan a otro día' : '') : q.quedanNuevas ? '¡Hecho por hoy! Si quieres, ' + Math.min(NUEVAS_DIA, q.quedanNuevas) + ' nuevas más' : '¡Nada por hoy! Vuelven cuando les toque') + '</span></span><span class="espm-flecha">›</span></button>' : '';
    return hoy + '<h3 class="espm-sub">Practicar (no mueve los escalones)</h3>' + '<button type="button" class="espm-todas" data-espt="filtro" data-f="todas"><span class="espm-todas-txt"><b>Hacer todas juntas</b>' +
        '<span>' + vivas.length + (vivas.length === 1 ? ' pregunta' : ' preguntas') + ' de ' + temas.length + (temas.length === 1 ? ' tema' : ' temas') + ', ordenadas por tema</span></span><span class="espm-flecha">›</span></button>' +
      '<h3 class="espm-sub">Por tema</h3>' +
      '<div class="espm-lista">' + temas.map(t => fila(t.clave, t.icono, escapeHtml(t.titulo), 'Tema ' + t.num, n[t.clave])).join('') + '</div>' +
      (sab ? '<button type="button" class="espm-sabidas" data-espt="sabidas">🎉 Ya te las sabes · ' + sab + ' <span class="espm-flecha">›</span></button>' : '');
  }

  /* ---------- pintar ---------- */
  function cabecera(){
    if(modo === 'hoy') return '<nav class="espt-migas"><button type="button" data-espt="volver">' + ({ 'screen-inicio': 'Inicio' }[volverA] || 'Específico') + '</button> <span>›</span> <button type="button" data-espt="marcadas">Preguntas marcadas</button> <span>›</span> <b>De hoy</b></nav>' +
      '<h2 class="espt-h">Marcadas de hoy</h2>' +
      '<div class="espt-cab"><div class="espt-etiqueta">Todos los temas, mezclados</div>' +
      '<div class="espt-cab-txt">Aciertas sin dudar: sube un escalón y vuelve más tarde (1, 3, 7, 15, 30 y 60 días). Si dudas, tócalo: se queda. Si fallas, vuelve a empezar. Tras el último escalón, se quita sola.</div></div>';
    if(modo === 'marcadas' && filtro === 'sabidas') return '<nav class="espt-migas"><button type="button" data-espt="volver">Específico</button> <span>›</span> <button type="button" data-espt="marcadas">Preguntas marcadas</button> <span>›</span> <b>Ya te las sabes</b></nav>' +
      '<h2 class="espt-h">Ya te las sabes</h2>' +
      '<div class="espt-cab"><div class="espt-cab-txt">Las que pasaron todos los escalones. Si una se te olvida, márcala otra vez con la estrella y vuelve a empezar.</div></div>';
    if(modo === 'marcadas'){
      if(filtro == null) return '<nav class="espt-migas"><button type="button" data-espt="volver">Específico</button> <span>›</span> <b>Preguntas marcadas</b></nav>' +
        '<h2 class="espt-h">Preguntas marcadas</h2>' +
        '<div class="espt-cab"><div class="espt-etiqueta">Tus preguntas guardadas</div>' +
        '<div class="espt-cab-txt">Cada día, «Marcadas de hoy»: se van espaciando y se quitan solas cuando ya te las sabes. Abajo, para practicar todas o por tema (no cuenta para los escalones).</div></div>';
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
      '</div>' +
      (reanudado && !tarea && Object.keys(resp).length ? '<div class="espt-sigue">Sigues donde lo dejaste: ' + Object.keys(resp).length + ' de ' + preguntas.length + ' respondidas.' +
        ' <button type="button" data-espt="cero">Empezar de cero</button></div>' : '');
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
      // Repaso de hoy: tras acertar, «Dudé» (se queda en su escalón en vez de subir).
      (modo === 'hoy' && elegida === p.correcta ? '<button type="button" class="espm-dude' + (hoyRep && hoyRep.dudadas.has(p.id) ? ' on' : '') + '" data-espt="dude" data-p="' + p.id + '">' +
        (hoyRep && hoyRep.dudadas.has(p.id) ? '✓ Dudé: se queda en su escalón' : '¿Dudaste? Toca aquí') + '</button>' : '') +
      (modo === 'hoy' && elegida ? resultadoHoy(p.id) : modo === 'marcadas' ? escalonHtml(p.id) : '') +
      // La explicación (al pulsar el «?») y, dentro, tu nota.
      (abiertas.has(p.id) ? '<div class="espt-exp">' + (!p.tiene_explicacion ? '' : expl.has(p.id) ? html(expl.get(p.id)) : '<span class="espt-cargando">Cargando explicación…</span>') + notaHtml(p.id) + '</div>' : '') +
      '</article>';
  }
  // Qué ha pasado con esa pregunta (tras responderla en el repaso de hoy).
  function resultadoHoy(id){
    const x = plan.get(id);
    if(!x || !hoyRep || !hoyRep.antes.has(id)) return '';
    const t = x.sabida ? '🎉 Ya te la sabes: deja de salir' : x.como === 'mal' ? 'Vuelve al principio: sale mañana'
      : x.como === 'dude' ? (x.escalon ? 'Se queda en el escalón ' + x.escalon + ': vuelve el ' + fechaCorta(x.proxima) : 'Se queda al principio: sale mañana')
      : 'Sube al escalón ' + x.escalon + ' de ' + DIAS.length + ': vuelve el ' + fechaCorta(x.proxima);
    return '<div class="espm-res ' + (x.sabida ? 'sabida' : x.como || '') + '">' + t + '</div>';
  }
  function pie(){
    if(modo === 'hoy' && hoyRep){
      const hechas = preguntas.filter(p => resp[p.id]), n = preguntas.length;
      const c = k => hechas.filter(p => (plan.get(p.id) || {}).como === k && !(plan.get(p.id) || {}).sabida).length;
      const sab = hechas.filter(p => (plan.get(p.id) || {}).sabida).length;
      const fin = hechas.length >= n;
      return '<div class="espt-pie espm-pie"><span>' + hechas.length + ' de ' + n + ' hechas · ' + c('bien') + ' suben · ' + c('dude') + ' dudadas · ' + c('mal') + ' al principio' +
        (sab ? ' · ' + sab + ' ya te las sabes' : '') + '</span>' +
        (fin ? '<div class="espm-fin">' + (hoyRep.quedanNuevas ? '¡Hecho por hoy! Quedan ' + hoyRep.quedanNuevas + ' marcadas nuevas sin empezar. <button type="button" data-espt="mas">Hacer ' + Math.min(NUEVAS_DIA, hoyRep.quedanNuevas) + ' más</button>' : '¡Hecho por hoy! Mañana, las que toquen.') +
          ' <button type="button" data-espt="marcadas">Ver mis marcadas</button></div>' : '') + '</div>';
    }
    const n = preguntas.length, hechas = preguntas.filter(p => resp[p.id]).length;
    const bien = preguntas.filter(p => resp[p.id] && resp[p.id] === p.correcta).length;
    // Sin «Volver a empezar»: de un toque se perdía todo lo respondido (también el avance de la tarea del calendario).
    return '<div class="espt-pie"><span>' + hechas + ' de ' + n + ' respondidas · ' + bien + (bien === 1 ? ' acierto' : ' aciertos') + ' · ' + (hechas - bien) + (hechas - bien === 1 ? ' fallo' : ' fallos') + '</span></div>';
  }
  function lista(){
    if(modo !== 'marcadas' || filtro === 'sabidas') return '<div class="espt-lista">' + preguntas.map(tarjeta).join('') + '</div>';
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
    if(modo === 'marcadas' && filtro == null && todasMarcadas.some(p => marcadas.has(p.id) || (plan.get(p.id) || {}).sabida)){ r.innerHTML = cabecera() + indiceMarcadas(); return; }
    if(!preguntas.length && modo === 'hoy'){
      const q = cuantasHoy();
      r.innerHTML = cabecera() + '<div class="esp-vacio">' + (q && q.marcadas ? '¡Nada por hoy! Tus marcadas vuelven cuando les toque.' : 'Todavía no has marcado ninguna pregunta. En un test, pulsa el botón rojo de la estrella para guardarla aquí.') +
        ' <button type="button" class="espm-link" data-espt="marcadas">Ver mis marcadas</button></div>';
      return;
    }
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
    guardarCurso();
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
      resumen: { todo, l: { total: 0, bien: 0, mal: 0, blanco: 0, nota: 0 }, e: todo, titulo: modo === 'hoy' ? 'Marcadas de hoy' : modo === 'marcadas' ? 'Preguntas marcadas · ' + nombreFiltro() : (test ? test.titulo : '') },
      preguntas: hechas.map(p => ({ k: 'e', id: p.id })), respuestas: hechas.map(p => (p._ops || p.opciones || []).findIndex(o => o.l === resp[p.id])) });
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
      if(modo === 'hoy' && hoyRep) apuntarRepaso(p.id, op.dataset.op === p.correcta ? 'bien' : 'mal');
      // Al fallar (aquí), la explicación abierta.
      if(modo === 'hoy' && op.dataset.op !== p.correcta && !abiertas.has(p.id) && (p.tiene_explicacion || notas.has(p.id))){
        abiertas.add(p.id);
        if(!expl.has(p.id) && p.tiene_explicacion) explicacion(p.id).then(() => { if(abiertas.has(p.id)) repintar(p.id); });
      }
      repintar(p.id);
      return;
    }
    const b = e.target.closest('[data-espt]');
    if(!b) return;
    const id = b.dataset.p;
    switch(b.dataset.espt){
      case 'volver': showScreen(volverA || 'screen-especifico'); break;
      case 'filtro': elegirMarcadas(b.dataset.f || null); break;
      case 'cero': empezarDeCero(); break;
      case 'dude': dude(id); break;
      case 'hoy': abrirHoy(); break;
      case 'mas': abrirHoy(true); break;
      case 'sabidas': abrirSabidas(); break;
      case 'marcadas': abrirMarcadas(); break;
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
  return { cargarNotas, notaHtml, abrirNota, onNotaClick, tieneNota: id => notas.has(id), estaMarcada: id => marcadas.has(id), alternarMarca: alternarMarcaDesde, abrir, abrirMarcadas, numMarcadas, cargarMarcadas, reiniciar, enviarRespuestas, registrar, olvidarPrueba, explicacion, aMedias, continuarCurso, cuantasHoy, abrirHoy: () => { abrirHoy(); volverA = 'screen-inicio'; } };
})();
