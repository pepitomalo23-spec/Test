/* Pruebas con preguntas del Específico (y de Legislación en el conjunto):
   - Simulacro conjunto (Inicio): Legislación + Específico, con el % de cada
     parte, los temas de cada una, cuántas preguntas, tiempo y cuántas de cada
     dificultad del Específico (verde fácil, amarilla media, roja difícil).
   - Panel de pj.fire del Específico (Estudio › Específico, vista «pj.fire»):
     Estudio y Fallos (una a una, corrección al momento) y Simulacro y Examen
     (todas seguidas, con tiempo y corrección al final), como en Legislación.
   La puntuación es la de los simulacros (acierto +1, fallo −1/(opciones−1),
   en blanco 0). Al terminar, cada parte se guarda en su sitio, sin mezclar:
   Legislación como sesión «conjunto» (sus estadísticas, Fallos y Repaso), el
   Específico en especifico_respuestas (ESPT.registrar) y la prueba entera en
   historial_pruebas, que es el historial propio de cada una. Una prueba a
   medias se guarda en el dispositivo y se continúa desde donde se empezó. */
const PRU = (function(){
  const N_SIM = [20, 30, 40, 50, 60, 80, 100];
  // Cada modo del Específico se configura igual que su gemelo de Legislación
  // (js/configuracion-test.js): Estudio y Simulacro con filas de ajustes que
  // abren la hoja de opciones; Examen con botones de preguntas y tiempo; Fallos
  // con la pantalla de «N preguntas falladas» y «Quitar de Fallos».
  const MODOS = {
    'conjunto':      { titulo: 'Simulacro conjunto', corto: 'Simulacro conjunto', largo: 'Simulacro conjunto', legis: true, vista: 'lista', temas: true, flags: ['especifico', 'simulacro'], volver: 'screen-inicio',
                       cuantas: N_SIM, minutos: [15, 30, 45, 60, 90, 120], def: [40, 60] },
    'esp-estudio':   { titulo: 'Estudio', corto: 'Estudio', largo: 'Estudio del Específico', vista: 'tarjeta', temas: true, flags: ['especifico'], volver: 'screen-especifico',
                       cuantas: PREGUNTAS_OPTIONS.map(v => v || 0), minutos: MINUTOS_OPTIONS.map(v => v || 0), def: [0, 0] },
    'esp-fallos':    { titulo: 'Fallos', corto: 'Fallos', largo: 'Fallos del Específico', vista: 'tarjeta', falladas: true, flags: ['especifico', 'fallos'], volver: 'screen-especifico', cuantas: [0], minutos: [0], def: [0, 0] },
    'esp-simulacro': { titulo: 'Configura tu simulacro', corto: 'Simulacro', largo: 'Simulacro del Específico', vista: 'lista', flags: ['especifico', 'simulacro'], volver: 'screen-especifico',
                       sub: 'Preguntas de todo el Específico. Elige cuántas quieres y de cuánto tiempo dispones.',
                       cuantas: COUNT_OPTIONS.concat([60, 80, 100]), minutos: TIME_OPTIONS.concat([90, 120]), def: [COUNT_OPTIONS[1] || 20, TIME_OPTIONS[1] || 30] },
    // Los tests de la vista de tutorbomberos (js/especifico-test.js): solo historial.
    'esp-tb':        { titulo: 'Test de tutorbomberos', corto: 'Test de tutorbomberos', largo: 'Test de tutorbomberos', vista: 'lista', soloHistorial: true, flags: ['especifico'], volver: 'screen-especifico',
                       cuantas: [0], minutos: [0], def: [0, 0] },
    'esp-examen':    { titulo: 'Configura tu examen', corto: 'Examen', largo: 'Examen del Específico', vista: 'lista', temas: true, flags: ['especifico', 'examen'], volver: 'screen-especifico',
                       sub: 'Elige los temas, cuántas preguntas quieres y de cuánto tiempo dispones.',
                       cuantas: COUNT_OPTIONS.concat([60, 80, 100]), minutos: TIME_OPTIONS.concat([90, 120]), def: [COUNT_OPTIONS[1] || 20, TIME_OPTIONS[1] || 30] }
  };
  const DIFS = [['facil', 'Fácil', 'verde'], ['media', 'Media', 'amarilla'], ['dificil', 'Difícil', 'roja']];
  const PLURAL = { facil: ['fácil', 'fáciles'], media: ['media', 'medias'], dificil: ['difícil', 'difíciles'] };
  const LETRAS = ['A', 'B', 'C', 'D', 'E', 'F'];
  // dif: 'aleatoria' | 'facil' | 'media' | 'dificil' (como en Legislación) | 'elegir' (% de cada color)
  const cfg = { modo: 'conjunto', legis: new Set(), esp: new Set(), cuantas: 40, minutos: 60, pct: 50, dif: 'aleatoria', difPct: { facil: 40, media: 40, dificil: 20 } };
  let meta = null;          // { tests: {id: {tema, titulo}}, preg: [{id, test_id, tema, dif}], estado: {id: 'green'|'yellow'|'red'} }
  let est = null;           // prueba en curso o en revisión
  let reloj = null, filtro = 'todas';
  let historial = null;     // filas de historial_pruebas
  const abiertos = new Set();   // listas de temas desplegadas en el Simulacro conjunto
  const $ = id => document.getElementById(id);
  const clave = () => currentUser ? 'pj_prueba:' + currentUser.id : null;
  const espHtml = h => (typeof IMP !== 'undefined' && IMP.limpiar) ? IMP.limpiar(h) : escapeHtml(h);
  const barajar = a => shuffleArray(a);
  const temaEsp = k => { const i = ESP.temas().findIndex(x => x.clave === k); return i >= 0 ? (i + 1) + '. ' + ESP.temas()[i].titulo : ''; };
  const permitido = modo => !!currentUser && MODOS[modo].flags.every(f => featureEnabled(f));
  const nuevoId = () => (self.crypto && crypto.randomUUID) ? crypto.randomUUID() :
    'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); });
  const el = (t, html) => { const d = document.createElement(t); d.innerHTML = html; return d; };

  /* ---------- datos del Específico ---------- */
  // Qué preguntas hay (sin el texto) y cómo las llevas (mismas reglas que Estadísticas).
  async function cargarMeta(){
    const [rt, preg, resp, desc] = await Promise.all([
      sb.from('especifico_tests').select('id,tema,titulo'),
      supabaseTodas(o => sb.from('especifico_preguntas').select('id,test_id,dificultad', o).order('id')),
      supabaseTodas(o => sb.from('especifico_respuestas').select('pregunta_id,acierto,created_at', o).eq('user_id', currentUser.id).order('id')),
      supabaseTodas(o => sb.from('especifico_descartadas').select('pregunta_id,descartada_at', o).eq('user_id', currentUser.id).order('pregunta_id'))
    ]);
    if(rt.error) throw rt.error;
    const tests = {};
    (rt.data || []).forEach(t => { tests[t.id] = { tema: t.tema, titulo: t.titulo }; });
    const intentos = {}, ultimo = {}, quitada = {};
    resp.forEach(r => { (intentos[r.pregunta_id] = intentos[r.pregunta_id] || []).push(r.acierto); ultimo[r.pregunta_id] = r.created_at; });
    desc.forEach(d => { quitada[d.pregunta_id] = d.descartada_at; });
    const estado = {};
    Object.keys(intentos).forEach(id => {
      const a = intentos[id];
      let racha = 0;
      for(let i = a.length - 1; i >= 0 && a[i]; i--) racha++;
      estado[id] = (!a.some(x => !x) || racha >= 3) ? 'green' : racha >= 1 ? 'yellow' : 'red';
    });
    // En Fallos: las rojas, menos las quitadas que no se han vuelto a fallar después.
    const fallos = {};
    Object.keys(intentos).forEach(id => { fallos[id] = intentos[id].filter(x => !x).length; });
    const enFallosIds = Object.keys(estado).filter(id => estado[id] === 'red' && !(quitada[id] && (!ultimo[id] || new Date(quitada[id]) >= new Date(ultimo[id]))));
    meta = armarMeta({
      t: Date.now(), tests, estado, fallos, enFallos: enFallosIds,
      preg: preg.filter(p => tests[p.test_id]).map(p => [p.id, p.test_id, p.dificultad || ''])
    });
    try{ localStorage.setItem(claveMeta(), JSON.stringify(meta.crudo)); }catch(e){}
    return meta;
  }
  /* Lo de arriba tarda (miles de preguntas), así que se guarda en el
     dispositivo: al abrir una configuración se pinta al momento con lo
     último que había y se actualiza por detrás. */
  const claveMeta = () => 'pj_esp_meta_v1:' + (currentUser ? currentUser.id : '');
  function armarMeta(c){
    const set = new Set(c.enFallos);
    return {
      crudo: c, t: c.t, tests: c.tests, estado: c.estado, fallos: c.fallos, enFallos: id => set.has(id),
      preg: c.preg.filter(p => c.tests[p[1]]).map(p => ({ id: p[0], test_id: p[1], tema: c.tests[p[1]].tema, dif: p[2] }))
    };
  }
  function metaYa(){
    if(meta) return meta;
    try{
      const c = JSON.parse(localStorage.getItem(claveMeta()) || 'null');
      if(c && c.preg && c.tests) meta = armarMeta(c);
    }catch(e){}
    return meta;
  }
  let cargandoMeta = null;
  function refrescarMeta(){
    if(!cargandoMeta) cargandoMeta = cargarMeta().finally(() => { cargandoMeta = null; });
    return cargandoMeta;
  }
  // Se precarga al entrar en el Específico o en Inicio, para que al pulsar ya esté.
  function precargar(){
    if(!currentUser || !featureEnabled('especifico')) return;
    metaYa();
    if(!meta || Date.now() - meta.t > 120000) refrescarMeta().catch(() => {});
  }
  async function preguntasEsp(ids){
    const out = [];
    for(let i = 0; i < ids.length; i += 100){
      const { data, error } = await sb.from('especifico_preguntas').select('id,test_id,enunciado,opciones,correcta,tiene_explicacion,dificultad').in('id', ids.slice(i, i + 100));
      if(error) throw error;
      out.push(...(data || []));
    }
    const orden = new Map(ids.map((id, i) => [id, i]));
    return out.sort((a, b) => orden.get(a.id) - orden.get(b.id));
  }

  /* ---------- configuración ---------- */
  function legisTemas(){
    const n = {};
    QUESTIONS_POOL.forEach(q => { if(q.topic_id) n[q.topic_id] = (n[q.topic_id] || 0) + 1; });
    return TOPICS.filter(t => t.enabled && n[t.id]).map(t => ({ id: t.id, nombre: t.name, n: n[t.id] }));
  }
  const m = () => MODOS[cfg.modo];
  const difDe = p => DIFS.some(([d]) => d === p.dif) ? p.dif : '';
  // Preguntas del Específico que entran con la configuración actual.
  function poolEsp(){
    if(!meta) return [];
    return meta.preg.filter(p => (!m().temas || cfg.esp.has(p.tema)) && (!m().falladas || meta.enFallos(p.id)) &&
      (!DIFS.some(([d]) => d === cfg.dif) || difDe(p) === cfg.dif));
  }
  function espTemas(){
    if(!meta) return [];
    const n = {};
    meta.preg.forEach(p => { n[p.tema] = (n[p.tema] || 0) + 1; });
    return ESP.temas().map((t, i) => ({ id: t.clave, nombre: (i + 1) + '. ' + t.titulo, n: n[t.clave] || 0 })).filter(t => t.n);
  }
  // Cuántas de cada dificultad, según los % elegidos y lo que hay. Lo que no
  // llega de un color sale de los demás (primero de las que no tienen dato).
  function repartoDif(n, pool){
    if(cfg.dif !== 'elegir') return null;
    const hay = { facil: 0, media: 0, dificil: 0, '': 0 };
    pool.forEach(p => { hay[difDe(p)]++; });
    const r = { facil: 0, media: 0, dificil: 0, '': 0 };
    DIFS.forEach(([k]) => { r[k] = Math.min(hay[k], Math.round(n * cfg.difPct[k] / 100)); });
    let quedan = n - r.facil - r.media - r.dificil;
    if(quedan < 0){ r.facil += quedan; quedan = 0; }   // por el redondeo
    const rellenar = k => { const x = Math.min(quedan, hay[k] - r[k]); r[k] += x; quedan -= x; };
    rellenar(''); DIFS.forEach(([k]) => rellenar(k));
    return r;
  }
  function plan(){
    const pe = poolEsp();
    const pl = m().legis ? QUESTIONS_POOL.filter(q => cfg.legis.has(q.topic_id)) : [];
    const ne = pe.length, nl = pl.length;
    const total = cfg.cuantas || (ne + nl);
    let l = m().legis ? (nl && ne ? Math.round(total * cfg.pct / 100) : nl ? total : 0) : 0;
    let e = total - l;
    if(l > nl){ e += l - nl; l = nl; }
    if(e > ne){ l = Math.min(nl, l + e - ne); e = ne; }
    return { l, e, nl, ne, pe, pl, dif: repartoDif(e, pe) };
  }
  async function abrirConfig(modo){
    modo = modo || 'conjunto';
    if(!permitido(modo)) return;
    // Solo una prueba a medias a la vez: la misma se continúa; otra, solo si se descarta la anterior.
    const g = guardado();
    if(g){
      if(g.modo === modo){ continuar(); return; }
      if(!(await uiConfirm('Tienes un «' + MODOS[g.modo].corto + '» a medias.\n\n¿Lo descartas para empezar este? Si no, puedes seguirlo desde «Continuar».', { ok: 'Descartar y empezar', danger: true }))) return;
      borrarGuardado();
    }
    if(cfg.modo !== modo){ [cfg.cuantas, cfg.minutos] = MODOS[modo].def; }
    cfg.modo = modo;
    if(MODOS[modo].legis && whenAppDataReady(() => abrirConfig(modo))) return;
    const ov = $('screen-pru-config');
    ov.dataset.mode = modo;
    $('pruTitulo').textContent = MODOS[modo].titulo;
    $('pruConfig').innerHTML = '<div class="simc-cargando">Cargando…</div>';
    $('pruQuitar').classList.add('hidden');
    pintarPie();
    openOverlay('screen-pru-config');
    // Al momento con lo que ya hay (memoria o dispositivo) y, por detrás, lo último.
    const habia = !!metaYa();
    const sigue = () => $('screen-pru-config').classList.contains('active') && cfg.modo === modo;
    if(habia) pintarConfig();
    if(modo === 'conjunto') cargarHistorial().then(() => { if(sigue()) pintarConfig(); }).catch(() => {});
    try{
      // Si falló la precarga (p. ej. se cortó la conexión), se vuelve a intentar una vez.
      if(!habia || Date.now() - meta.t > 15000) await refrescarMeta().catch(() => refrescarMeta());
      if(sigue()) pintarConfig();
    }catch(e){
      if(!habia) $('pruConfig').innerHTML = '<div class="tree-empty">No se pudieron cargar las preguntas del Específico: ' + escapeHtml(e.message || String(e)) + '</div>';
    }
  }
  function cerrarConfig(){ $('screen-pru-config').classList.remove('active'); }

  // Piezas con el mismo HTML que la configuración de Legislación.
  const fila = (sel, id, nombre, n, parte) =>
    '<div class="topic-row' + (sel ? ' selected' : '') + '" role="checkbox" aria-checked="' + sel + '" tabindex="0" data-pru-tema="' + parte + '" data-id="' + escapeHtml(id) + '">' +
      '<span class="topic-check">' + ICONS.check + '</span>' +
      '<span class="topic-text"><span class="topic-name">' + escapeHtml(nombre) + '</span></span>' + (n != null ? '<span class="simc-n">' + n + '</span>' : '') + '</div>';
  const todosBtn = (parte, lista, txt) => {
    const on = lista.length && lista.every(t => cfg[parte].has(t.id));
    return '<span class="switch-row" role="button" tabindex="0" data-pru-todos="' + parte + '"><span class="switch' + (on ? ' on' : '') + '"><span class="knob"></span></span><span class="switch-label">' + txt + '</span></span>';
  };
  const chips = (que, lista, fmt) => '<div class="param-options">' + lista.map(v =>
    '<span class="param-opt' + (String(cfg[que]) === String(v) ? ' selected' : '') + '" role="button" tabindex="0" data-pru-opt="' + que + '" data-v="' + v + '">' + fmt(v) + '</span>').join('') + '</div>';
  const bloque = (label, cuerpo, extra) => '<div class="config-block"><div class="config-block-head"><div class="config-block-label">' + label + '</div>' + (extra || '') + '</div>' + cuerpo + '</div>';
  const paso = (que, txt, v, clase) =>
    '<div class="pru-paso ' + (clase || '') + '"><span class="pru-paso-txt">' + txt + '</span>' +
      '<button type="button" class="pru-paso-btn" data-pru-paso="' + que + '" data-d="-1" aria-label="Menos">−</button>' +
      '<span class="pru-paso-v">' + v + '%</span>' +
      '<button type="button" class="pru-paso-btn" data-pru-paso="' + que + '" data-d="1" aria-label="Más">+</button></div>';
  const OPC = {
    minutos: () => m().minutos.map(v => ({ value: v, label: v ? v + ' min' : 'Sin límite' })),
    cuantas: () => m().cuantas.map(v => ({ value: v, label: v ? v + ' preguntas' : 'Sin límite' })),
    dif: () => DIFICULTAD_OPTIONS.map(v => ({ value: v, label: DIFICULTAD_LABELS[v] })).concat([{ value: 'elegir', label: 'Por colores (elegir %)' }])
  };
  const ROTULO = { minutos: 'Minutos', cuantas: 'Preguntas', dif: 'Dificultad' };
  const ICONO = { minutos: () => ICONS.timer, cuantas: () => ICONS.doc, dif: () => ICONS.chart };
  function filaAjuste(k){
    const o = OPC[k]().find(x => String(x.value) === String(cfg[k]));
    return '<div class="settings-row" role="button" tabindex="0" data-pru-ajuste="' + k + '">' +
      '<span class="settings-row-icon">' + ICONO[k]() + '</span><span class="settings-row-label">' + ROTULO[k] + '</span>' +
      '<span class="settings-row-value">' + (o ? o.label : '') + '</span><span class="settings-row-chevron">' + ICONS.chevron + '</span></div>';
  }
  // La hoja de opciones de abajo, la misma de Legislación (#sheetOverlay).
  function hoja(k){
    $('sheetTitle').textContent = ROTULO[k];
    const cont = $('sheetOptions');
    cont.innerHTML = '';
    OPC[k]().forEach(o => {
      const row = document.createElement('div');
      row.className = 'sheet-option' + (String(cfg[k]) === String(o.value) ? ' selected' : '');
      row.setAttribute('role', 'button'); row.setAttribute('tabindex', '0');
      row.innerHTML = '<span>' + o.label + '</span><span class="sheet-check">' + ICONS.check + '</span>';
      row.onclick = () => { cfg[k] = o.value; closeSettingSheet(); pintarConfig(); };
      cont.appendChild(row);
    });
    $('sheetOverlay').classList.add('show');
  }
  function difPasos(p){
    if(cfg.dif !== 'elegir') return '';
    return '<div class="pru-difs">' + DIFS.map(([k, t, c]) => paso(k, '<span class="pru-dot ' + k + '"></span>' + t + ' <span class="pru-dif-c">(' + c + ')</span>', cfg.difPct[k], k)).join('') +
      (p.dif ? '<div class="pru-dif-plan">Saldrán ' + DIFS.map(([k]) => '<b>' + p.dif[k] + '</b> ' + PLURAL[k][p.dif[k] === 1 ? 0 : 1]).join(', ') + (p.dif[''] ? ' y <b>' + p.dif[''] + '</b> sin dato' : '') + '.</div>' : '') + '</div>';
  }
  /* ---------- Simulacro conjunto: resumen arriba y ajustes en tarjetas ---------- */
  // Botones de una fila que ocupan todo el ancho (preguntas, minutos, dificultad).
  const segmentos = (attr, lista, actual) => '<div class="sc-seg">' + lista.map(([v, t]) =>
    '<button type="button" class="sc-seg-op' + (String(actual) === String(v) ? ' on' : '') + '" ' + attr + '="' + v + '">' + t + '</button>').join('') + '</div>';
  const tarjeta = (titulo, cuerpo, extra) => '<section class="sc-tarjeta"><div class="sc-tarjeta-cab"><h3>' + titulo + '</h3>' + (extra || '') + '</div>' + cuerpo + '</section>';
  function resumenConjunto(p){
    const n = p.l + p.e, pl = n ? p.l / n * 100 : 0;
    return '<div class="sc-resumen">' +
      '<div class="sc-resumen-cifras"><div><b data-sc="n">' + n + '</b><span>preguntas</span></div><div><b>' + cfg.minutos + '</b><span>minutos</span></div></div>' +
      '<div class="sc-barra"><i class="legis" data-sc="bl" style="width:' + pl.toFixed(1) + '%"></i><i class="esp" style="flex:1"></i></div>' +
      '<div class="sc-leyenda"><span><i class="legis"></i>Legislación <b data-sc="l">' + p.l + '</b></span><span><i class="esp"></i>Específico <b data-sc="e">' + p.e + '</b></span></div></div>';
  }
  function temasConjunto(parte, nombre, lista){
    const sel = lista.filter(t => cfg[parte].has(t.id)), abierto = abiertos.has(parte);
    const npreg = sel.reduce((a, t) => a + t.n, 0);
    const sub = !lista.length ? 'Sin preguntas' : !sel.length ? 'Ningún tema elegido' :
      (sel.length === lista.length ? 'Todos los temas' : sel.length + ' de ' + lista.length + ' temas') + ' · ' + npreg + ' preguntas';
    return '<div class="sc-temas' + (abierto ? ' abierto' : '') + '">' +
      '<div class="sc-temas-cab"><button type="button" class="sc-temas-abrir" data-pru-abrir="' + parte + '" aria-expanded="' + abierto + '">' +
          '<span class="sc-punto ' + parte + '"></span><span class="sc-temas-txt"><b>' + nombre + '</b><span>' + sub + '</span></span>' +
          '<span class="sc-chev">' + ICONS.chevron + '</span></button>' +
        (lista.length ? todosBtn(parte, lista, 'Todos').replace('role="button"', 'role="button" aria-label="Todos los temas de ' + nombre + '"') : '') + '</div>' +
      (abierto && lista.length ? '<div class="sc-temas-lista">' + lista.map(t => fila(cfg[parte].has(t.id), t.id, t.nombre, t.n, parte)).join('') + '</div>' : '') +
      '</div>';
  }
  function conjuntoHtml(p){
    const M = m();
    const ambos = p.nl && p.ne;
    const reparto = '<div class="sc-reparto' + (ambos ? '' : ' apagado') + '">' +
        '<div class="sc-reparto-pct"><span class="legis"><b data-sc="pl">' + cfg.pct + '%</b> Legislación</span><span class="esp">Específico <b data-sc="pe">' + (100 - cfg.pct) + '%</b></span></div>' +
        '<input type="range" class="sc-rango" min="0" max="100" step="10" value="' + cfg.pct + '" style="--p:' + cfg.pct + '%" data-pru-rango aria-label="Porcentaje de Legislación"' + (ambos ? '' : ' disabled') + '>' +
        '<div class="sc-atajos">' + [[50, '50 / 50'], [70, '70 / 30'], [30, '30 / 70'], ['prop', 'Proporcional']].map(([v, t]) =>
          '<button type="button" class="sc-atajo' + (String(cfg.pct) === String(v) ? ' on' : '') + '" data-pru-pct="' + v + '"' + (ambos ? '' : ' disabled') + '>' + t + '</button>').join('') + '</div>' +
        (ambos ? '' : '<div class="sc-nota">Elige temas de las dos partes para repartirlas.</div>') + '</div>';
    const difs = [['aleatoria', 'Al azar'], ['facil', 'Fácil'], ['media', 'Media'], ['dificil', 'Difícil'], ['elegir', 'Colores']];
    const colores = cfg.dif !== 'elegir' ? '' : '<div class="sc-colores">' + DIFS.map(([k, t]) =>
        '<div class="sc-color ' + k + '"><span class="sc-color-nom"><span class="pru-dot ' + k + '"></span>' + t + '</span>' +
          '<div class="sc-color-ctrl"><button type="button" data-pru-paso="' + k + '" data-d="-1" aria-label="Menos ' + t + '">−</button><b>' + cfg.difPct[k] + '%</b>' +
          '<button type="button" data-pru-paso="' + k + '" data-d="1" aria-label="Más ' + t + '">+</button></div>' +
          (p.dif ? '<span class="sc-color-n">' + p.dif[k] + ' ' + (p.dif[k] === 1 ? 'pregunta' : 'preguntas') + '</span>' : '') + '</div>').join('') + '</div>';
    return resumenConjunto(p) +
      tarjeta('Temas', temasConjunto('legis', 'Legislación', legisTemas()) + temasConjunto('esp', 'Específico', espTemas())) +
      tarjeta('Preguntas', segmentos('data-pru-opt="cuantas" data-v', M.cuantas.map(v => [v, v]), cfg.cuantas)) +
      tarjeta('Tiempo', segmentos('data-pru-opt="minutos" data-v', M.minutos.map(v => [v, v + '′']), cfg.minutos)) +
      tarjeta('Reparto', reparto) +
      tarjeta('Dificultad del Específico', segmentos('data-pru-dif', difs, cfg.dif) + colores);
  }
  // Mientras se arrastra el reparto solo cambian las cifras (repintar cortaría el arrastre).
  function moverRango(r){
    cfg.pct = Number(r.value);
    r.style.setProperty('--p', cfg.pct + '%');
    const p = plan(), n = p.l + p.e, c = $('pruConfig');
    const pon = (k, v) => { const x = c.querySelector('[data-sc="' + k + '"]'); if(x) x.textContent = v; };
    pon('pl', cfg.pct + '%'); pon('pe', (100 - cfg.pct) + '%'); pon('l', p.l); pon('e', p.e); pon('n', n);
    const b = c.querySelector('[data-sc="bl"]'); if(b) b.style.width = (n ? p.l / n * 100 : 0).toFixed(1) + '%';
    c.querySelectorAll('.sc-atajo').forEach(a => a.classList.toggle('on', a.dataset.pruPct === String(cfg.pct)));
    pintarPie();
  }
  function pintarConfig(){
    const M = m(), modo = cfg.modo, p = plan();
    if(M.falladas){ pintarFallos(p); return; }
    if(modo === 'conjunto'){ $('pruConfig').innerHTML = conjuntoHtml(p) + historialHtml(['conjunto']); pintarPie(); return; }
    let h = M.sub ? '<div class="config-sub">' + M.sub + '</div>' : '';
    if(modo === 'esp-estudio' || modo === 'esp-simulacro'){
      // Como Estudio y Simulacro de Legislación: filas que abren la hoja de opciones.
      h += '<div class="config-block"><div class="settings-list">' + ['minutos', 'cuantas', 'dif'].map(filaAjuste).join('') + '</div>' + difPasos(p) + '</div>';
    } else {
      // Como Examen de Legislación: botones de número de preguntas y tiempo.
      h += bloque('Número de preguntas', chips('cuantas', M.cuantas, v => v + ' preguntas')) + bloque('Tiempo', chips('minutos', M.minutos, v => v + ' min'));
      if(M.legis){
        h += bloque('Cuánto de cada parte', '<div class="pru-reparto"><div class="pru-barra"><i class="legis" style="width:' + cfg.pct + '%"></i><i class="esp" style="width:' + (100 - cfg.pct) + '%"></i></div>' +
          paso('pct', 'Legislación', cfg.pct, 'legis') +
          '<div class="pru-paso esp"><span class="pru-paso-txt">Específico</span><span class="pru-paso-v solo">' + (100 - cfg.pct) + '%</span></div>' +
          '<div class="param-options pru-atajos">' + [[50, 'Mitad y mitad'], [70, '70 / 30'], [30, '30 / 70'], ['prop', 'Según las preguntas de cada parte']].map(([v, t]) =>
            '<span class="param-opt" role="button" tabindex="0" data-pru-pct="' + v + '">' + t + '</span>').join('') + '</div></div>');
      }
      h += '<div class="config-block">' + (M.legis ? '<div class="config-block-head"><div class="config-block-label">Dificultad del Específico</div></div>' : '') +
        '<div class="settings-list">' + filaAjuste('dif') + '</div>' + difPasos(p) + '</div>';
    }
    if(M.legis){
      const lt = legisTemas();
      h += bloque('Temas de Legislación', lt.length ? '<div class="topics-card">' + lt.map(t => fila(cfg.legis.has(t.id), t.id, t.nombre, t.n, 'legis')).join('') + '</div>' : '<div class="tree-empty">No hay temas de Legislación con preguntas.</div>', todosBtn('legis', lt, 'Todos'));
    }
    if(M.temas){
      const et = espTemas();
      h += bloque(M.legis ? 'Temas del Específico' : 'Temas',
        et.length ? '<div class="topics-card">' + et.map(t => fila(cfg.esp.has(t.id), t.id, t.nombre, M.legis ? t.n : null, 'esp')).join('') + '</div>'
          : '<div class="tree-empty">Todavía no hay preguntas en el Específico.</div>',
        todosBtn('esp', et, M.legis ? 'Todos' : 'Seleccionar todo'));
    }
    if(modo === 'conjunto') h += historialHtml(['conjunto']);
    $('pruConfig').innerHTML = h;
    pintarPie();
  }
  // Fallos: igual que el de Legislación (cuántas, por tema, «Comenzar repaso» y «Quitar de Fallos»).
  function pintarFallos(p){
    const n = {};
    p.pe.forEach(x => { n[x.tema] = (n[x.tema] || 0) + 1; });
    $('pruConfig').innerHTML =
      '<div class="fallos-hero"><div class="fallos-icon">' + ICONS.fallos + '</div>' +
        '<div class="fallos-count"><span>' + p.pe.length + '</span></div><div class="fallos-label">preguntas falladas pendientes de repaso</div></div>' +
      '<div class="fallos-breakdown">' + ESP.temas().filter(t => n[t.clave]).map(t =>
        '<div class="fallos-row"><span class="fallos-row-name">' + escapeHtml(temaEsp(t.clave)) + '</span><span class="fallos-row-count">' + n[t.clave] + ' falladas</span></div>').join('') + '</div>';
    $('pruQuitar').classList.toggle('hidden', !p.pe.length);
    pintarPie();
  }
  async function quitarFallos(){
    const ids = plan().pe.map(x => x.id);
    if(!ids.length) return;
    const n = ids.length;
    if(!(await uiConfirm('Vas a quitar estas ' + n + ' pregunta' + (n === 1 ? '' : 's') + ' fallada' + (n === 1 ? '' : 's') + ' de Fallos.\n\n' +
      'Seguirán contando como falladas en Estadísticas. Si vuelves a fallar alguna más adelante, reaparecerá aquí automáticamente.\n\n¿Continuar?'))) return;
    const b = $('pruQuitar');
    b.disabled = true;
    try{
      const ahora = new Date().toISOString();
      for(let i = 0; i < ids.length; i += 500){
        const { error } = await sb.from('especifico_descartadas').upsert(ids.slice(i, i + 500).map(id => ({ pregunta_id: id, descartada_at: ahora })), { onConflict: 'user_id,pregunta_id' });
        if(error) throw error;
      }
      uiToast('Quitadas de Fallos', 'success');
      cerrarConfig();
      cargarPanel();
    }catch(e){ uiToast('No se ha podido completar la operación. Inténtalo de nuevo.', 'error'); }
    b.disabled = false;
  }
  function pintarPie(){
    const b = $('pruEmpezar');
    if(!b) return;
    if(!meta){ b.disabled = true; b.textContent = 'Cargando…'; return; }
    const p = plan(), n = p.l + p.e, modo = cfg.modo;
    b.disabled = !n;
    if(modo === 'esp-fallos'){ b.textContent = 'Comenzar repaso'; return; }
    if(modo === 'esp-estudio'){ b.textContent = n ? 'Iniciar test' : 'Selecciona un tema'; return; }
    if(modo === 'esp-examen' && !cfg.esp.size){ b.textContent = 'Selecciona un tema'; return; }
    if(!n){ b.textContent = m().legis ? 'Elige temas de Legislación o del Específico' : 'No hay preguntas con esa selección'; return; }
    if(modo === 'conjunto'){ b.textContent = 'Comenzar simulacro · ' + n + ' preguntas'; return; }
    b.textContent = (modo === 'esp-examen' ? 'Comenzar examen (' : 'Comenzar simulacro (') +
      (m().legis ? p.l + ' de Legislación + ' + p.e + ' del Específico' : n + ' preguntas') + ', ' + cfg.minutos + ' min)';
  }
  function cambiarPaso(que, d){
    if(que === 'pct'){ cfg.pct = Math.max(0, Math.min(100, cfg.pct + d * 10)); return; }
    // Dificultad: lo que sube un color lo pierden los otros (siempre suman 100).
    const v = Math.max(0, Math.min(100, cfg.difPct[que] + d * 10));
    let resto = v - cfg.difPct[que];
    cfg.difPct[que] = v;
    const otros = DIFS.map(([k]) => k).filter(k => k !== que);
    while(resto !== 0){
      const k = resto > 0 ? otros.filter(x => cfg.difPct[x] > 0).sort((a, b) => cfg.difPct[b] - cfg.difPct[a])[0]
                          : otros.sort((a, b) => cfg.difPct[a] - cfg.difPct[b])[0];
      if(!k) break;
      const x = resto > 0 ? -Math.min(10, cfg.difPct[k], resto) : Math.min(10, -resto);
      cfg.difPct[k] += x; resto += x;
    }
  }
  function onConfigClick(e){
    const t = e.target.closest('[data-pru-tema],[data-pru-todos],[data-pru-opt],[data-pru-paso],[data-pru-pct],[data-pru-hist],[data-pru-borrar],[data-pru-ajuste],[data-pru-abrir],[data-pru-dif]');
    if(!t || t.disabled) return;
    if(t.dataset.pruAbrir){ const k = t.dataset.pruAbrir; abiertos.has(k) ? abiertos.delete(k) : abiertos.add(k); pintarConfig(); return; }
    if(t.dataset.pruDif){ cfg.dif = t.dataset.pruDif; pintarConfig(); return; }
    if(t.dataset.pruBorrar){ e.stopPropagation(); borrarHistorial(t.dataset.pruBorrar); return; }
    if(t.dataset.pruHist){ revisarHistorial(t.dataset.pruHist); return; }
    if(t.dataset.pruAjuste){ hoja(t.dataset.pruAjuste); return; }
    if(t.dataset.pruTema){
      const s = cfg[t.dataset.pruTema], id = t.dataset.id;
      s.has(id) ? s.delete(id) : s.add(id);
    } else if(t.dataset.pruTodos){
      const parte = t.dataset.pruTodos, s = cfg[parte];
      const ids = (parte === 'legis' ? legisTemas() : espTemas()).map(x => x.id);
      const on = ids.length && ids.every(id => s.has(id));
      ids.forEach(id => on ? s.delete(id) : s.add(id));
    } else if(t.dataset.pruPaso){
      cambiarPaso(t.dataset.pruPaso, Number(t.dataset.d));
    } else if(t.dataset.pruPct){
      if(t.dataset.pruPct === 'prop'){
        const p = plan();
        cfg.pct = p.nl + p.ne ? Math.round(p.nl / (p.nl + p.ne) * 100) : 50;
      } else cfg.pct = Number(t.dataset.pruPct);
    } else {
      cfg[t.dataset.pruOpt] = Number(t.dataset.v);
    }
    pintarConfig();
  }

  /* ---------- preparar la prueba ---------- */
  function itemLegis(q, orden){
    const b = orden ? Object.assign({}, q, { options: orden.map(i => q.options[i]), correct: orden.indexOf(q.correct), _optionOrder: orden }) : shuffleQuestionOptions(q);
    const tema = TOPICS.find(t => t.id === q.topic_id);
    return { k: 'l', id: q.id, texto: q.q, opciones: b.options, correcta: b.correct, orden: b._optionOrder || null,
      tema: tema ? tema.name : '', art: q.art || '', explicacion: q.explain || '' };
  }
  // Las preguntas de tutorbomberos empiezan por su número en el test («<b>44ª- …»):
  // aquí salen mezcladas, así que ese número se quita (en sus tests sí se ve).
  const sinNumero = h => String(h || '').replace(/^(\s*<b>)?\s*\d+\s*[ªº]\s*[-–]\s*/, '$1');
  function itemEsp(p, tests){
    // Las del Específico no se barajan: muchas dicen «a y b son correctas».
    const ops = p.opciones || [], t = tests[p.test_id];
    const nt = t ? ESP.temas().findIndex(x => x.clave === t.tema) + 1 : 0;
    return { k: 'e', id: p.id, html: sinNumero(p.enunciado), etiquetaTema: t ? 'Tema ' + nt + ' › ' + t.titulo : '', opciones: ops.map(o => o.html), correcta: ops.findIndex(o => o.l === p.correcta),
      tema: t ? temaEsp(t.tema).replace(/^\d+\.\s*/, '') + ' · ' + t.titulo : '', dif: p.dificultad || '', fallos: meta && meta.fallos ? meta.fallos[p.id] || 0 : 0, explicacion: p.tiene_explicacion ? null : '' };   // null: se pide al abrirla (ESPT.explicacion)
  }
  // Elige al azar del Específico respetando cuántas de cada dificultad.
  function elegirEsp(pool, n, dif){
    if(!dif) return barajar(pool).slice(0, n);
    const out = [];
    ['facil', 'media', 'dificil', ''].forEach(k => {
      out.push(...barajar(pool.filter(p => (DIFS.some(([d]) => d === p.dif) ? p.dif : '') === k)).slice(0, dif[k]));
    });
    return out;
  }
  async function empezar(){
    const b = $('pruEmpezar');
    const p = plan();
    if(!p.l && !p.e) return;
    b.disabled = true; b.textContent = 'Preparando…';
    try{
      const legis = barajar(p.pl).slice(0, p.l);
      const ids = elegirEsp(p.pe, p.e, p.dif).map(x => x.id);
      const esp = ids.length ? await preguntasEsp(ids) : [];
      let items = legis.map(q => itemLegis(q)).concat(esp.filter(x => (x.opciones || []).length).map(x => itemEsp(x, meta.tests)));
      items = barajar(items);
      est = { modo: cfg.modo, items, resp: new Array(items.length).fill(null), vistas: new Array(items.length).fill(false), i: 0,
        inicio: Date.now(), fin: cfg.minutos ? Date.now() + cfg.minutos * 60000 : null, terminado: false };
      guardar();
      cerrarConfig();
      mostrar();
    }catch(e){
      uiToast('No se pudo preparar: ' + (e.message || e), 'error');
      pintarPie();
    }
  }

  /* ---------- prueba a medias (en el dispositivo) ---------- */
  function guardar(){
    if(!clave() || !est || est.terminado || est.revision) return;
    try{
      localStorage.setItem(clave(), JSON.stringify({ v: 2, modo: est.modo, inicio: est.inicio, fin: est.fin, i: est.i, resp: est.resp, vistas: est.vistas, blancas: est.blancas || null,
        items: est.items.map(it => it.k === 'l' ? { k: 'l', id: it.id, orden: it.orden } : { k: 'e', id: it.id }) }));
    }catch(e){}
  }
  function guardado(){
    try{
      const g = clave() ? JSON.parse(localStorage.getItem(clave()) || 'null') : null;
      return g && MODOS[g.modo] ? g : null;
    }catch(e){ return null; }
  }
  function borrarGuardado(){ try{ if(clave()) localStorage.removeItem(clave()); }catch(e){} }
  // Rehace las preguntas a partir de sus ids (para continuar o revisar).
  async function rehacer(lista){
    const ids = lista.filter(x => x.k === 'e').map(x => x.id);
    let esp = [], tests = meta ? meta.tests : null;
    if(ids.length){
      if(!tests){
        const { data, error } = await sb.from('especifico_tests').select('id,tema,titulo');
        if(error) throw error;
        tests = {};
        (data || []).forEach(t => { tests[t.id] = { tema: t.tema, titulo: t.titulo }; });
      }
      esp = await preguntasEsp(ids);
    }
    return lista.map(x => {
      if(x.k === 'l'){ const q = QUESTIONS_POOL.find(y => y.id === x.id); return q ? itemLegis(q, x.orden) : null; }
      const p = esp.find(y => y.id === x.id);
      return p ? itemEsp(p, tests) : null;
    });
  }
  async function continuar(){
    const g = guardado();
    if(!g) return;
    if(est && !est.terminado && !est.revision && est.modo === g.modo){ mostrar(); return; }
    if(g.items.some(x => x.k === 'l') && whenAppDataReady(continuar)) return;
    try{
      const rehechos = await rehacer(g.items);
      const keep = rehechos.map((it, i) => it ? i : -1).filter(i => i >= 0);   // las que ya no existen se quitan
      if(!keep.length){ borrarGuardado(); uiToast('Las preguntas de esa prueba ya no existen.', 'info'); return; }
      est = { modo: g.modo, items: keep.map(i => rehechos[i]), resp: keep.map(i => g.resp[i] == null ? null : g.resp[i]),
        vistas: keep.map(i => !!(g.vistas && g.vistas[i])), blancas: keep.map(i => !!(g.blancas && g.blancas[i])), i: Math.min(g.i || 0, keep.length - 1), inicio: g.inicio, fin: g.fin, terminado: false };
      mostrar();
      if(est.fin && Date.now() >= est.fin) terminar(true);
    }catch(e){ uiToast('No se pudo recuperar: ' + (e.message || e), 'error'); }
  }
  function aMedias(modos){
    const g = guardado();
    if(!g || !permitido(g.modo) || (modos && !modos.includes(g.modo))) return null;
    return { modo: g.modo, titulo: MODOS[g.modo].largo, hechas: (g.resp || []).filter(r => r != null).length, total: (g.items || []).length };
  }

  /* ---------- hacer la prueba ---------- */
  function etiqueta(it){
    return '<div class="simc-etiqueta ' + (it.k === 'l' ? 'legis' : 'esp') + '">' + (it.k === 'l' ? 'Legislación' : 'Específico') +
      (it.dif ? '<i class="pru-dot ' + it.dif + '" title="Dificultad ' + it.dif + '"></i>' : '') +
      (it.tema ? '<span> · ' + escapeHtml(it.tema) + '</span>' : '') + '</div>';
  }
  const enunciado = it => it.k === 'l' ? escapeHtml(it.texto) : espHtml(it.html);
  const opcion = (it, j) => it.k === 'l' ? escapeHtml(it.opciones[j]) : espHtml(it.opciones[j]);
  // Las del Específico llegan sin explicación (pesa mucho): se pide al mostrarla.
  function explicacion(it){
    if(it.k === 'e' && it.explicacion == null){
      ESPT.explicacion(it.id).then(t => {
        it.explicacion = t;
        document.querySelectorAll('[data-exp-id="' + it.id + '"]').forEach(x => { x.innerHTML = espHtml(t) || 'Sin explicación.'; });
      });
      return '<span class="pru-cargando" data-exp-id="' + it.id + '">Cargando explicación…</span>';
    }
    return it.explicacion ? (it.k === 'l' ? escapeHtml(it.explicacion) : espHtml(it.explicacion)) : '';
  }
  function mostrar(){
    showScreen('screen-pru');
    $('pruCabecera').classList.remove('hidden');
    $('pruTiempo').classList.toggle('hidden', !est.fin);
    $('pruCabecera').querySelector('[data-pru="terminar"]').classList.remove('ready');
    if(MODOS[est.modo].vista === 'tarjeta') pintarTarjeta();
    else {
      $('pruCuerpo').innerHTML = est.items.map((it, i) =>
        '<div class="quiz-list-item simc-item" data-i="' + i + '">' + (MODOS[est.modo].legis ? etiqueta(it) : '') +
          '<div class="question">' + (i + 1) + '. ' + enunciado(it) + '</div>' +
          '<div class="options">' + it.opciones.map((_, j) =>
            '<div class="option' + (est.resp[i] === j ? ' selected' : '') + '" role="button" tabindex="0" data-pru-r="' + i + '" data-j="' + j + '">' +
              '<span class="opt-badge">' + LETRAS[j] + '</span><span class="opt-text">' + opcion(it, j) + '</span><span class="opt-result"></span></div>').join('') +
          '</div></div>').join('') +
        '<div class="quiz-list-footer"><button class="btn btn-primary" data-pru="terminar">Finalizar</button></div>';
      arriba();
    }
    contador();
    arrancarReloj();
    if(typeof observeActiveQuizHead === 'function') observeActiveQuizHead();   // hueco de la cabecera fija
  }
  function arriba(){ const a = $('app'); if(a) a.scrollTop = 0; }
  // Estudio y Fallos: una a una, igual que en Legislación (js/test.js,
  // renderQuestion): al responder se marca bien/mal; «En blanco» la da por no
  // sabida; la explicación queda plegada hasta «Mostrar explicación»; para
  // seguir hay que responder; en la última se ilumina «Finalizar».
  const FLECHA_IZQ = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15,6 9,12 15,18"/></svg>';
  const FLECHA_DER = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9,6 15,12 9,18"/></svg>';
  function metaExplicacion(it, falladaAhora){
    const tag = it.k === 'l' ? (it.art || it.tema) : (it.etiquetaTema || it.tema);
    const n = (it.fallos || 0) + (falladaAhora ? 1 : 0);
    return '<div class="explain-meta">' +
        '<div class="article-tag">' + ICONS.seal + '<span>' + escapeHtml(tag || 'Específico') + '</span>' +
          (it.dif ? '<i class="pru-dot ' + it.dif + '" title="Dificultad ' + it.dif + '"></i>' : '') + '</div>' +
        '<div class="fail-history-toggle pru-fallada"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12a8 8 0 1 1 2.3 5.6"/><polyline points="4,17 4,12 9,12"/></svg>' +
          '<span>Fallada <b>' + n + '</b> ' + (n === 1 ? 'vez' : 'veces') + '</span></div>' +
      '</div><hr class="explain-divider">';
  }
  function cuerpoExplicacion(it){
    return '<div class="explain-body"><div class="explain-section-head"><div class="explain-section-label"><span class="explain-icon-badge">' + ICONS.bulb + '</span><span>Explicación</span></div></div>' +
      '<div class="explain-text">' + (explicacion(it) || 'Sin explicación.') + '</div></div>';
  }
  function pintarTarjeta(){
    const i = est.i, it = est.items[i], n = est.items.length;
    if(!est.blancas) est.blancas = new Array(n).fill(false);
    const r = est.resp[i], blanco = !!est.blancas[i], hecha = r != null || blanco, ultima = i === n - 1;
    est.vistas[i] = true;
    $('pruCuerpo').innerHTML =
      '<div class="pru-card-view">' +
        '<div class="quiz-card">' + (MODOS[est.modo].legis ? etiqueta(it) : '') +
          '<div class="question">' + enunciado(it) + '</div>' +
          '<div class="options">' + it.opciones.map((_, j) => {
            const cls = !hecha ? '' : j === it.correcta ? ' correct' + (blanco ? ' blank-correct' : '') : j === r ? ' incorrect' : '';
            return '<div class="option' + cls + '" role="button" tabindex="0"' + (hecha ? '' : ' data-pru-r="' + i + '" data-j="' + j + '"') + '>' +
              '<span class="opt-badge">' + LETRAS[j] + '</span><span class="opt-text">' + opcion(it, j) + '</span><span class="opt-result">' +
              (hecha && j === it.correcta ? ICONS.check : hecha && j === r ? ICONS.cross : '') + '</span></div>';
          }).join('') + '</div></div>' +
        '<div class="explain' + (hecha && est.expAbierta ? ' show' : '') + '">' + (hecha ? metaExplicacion(it, r !== it.correcta) + cuerpoExplicacion(it) : '') + '</div>' +
        '<div class="quiz-bottombar">' +
          '<button class="quiz-nav-btn pru-ant" data-pru="ant" aria-label="Anterior"' + (i ? '' : ' disabled') + '>' + FLECHA_IZQ + '</button>' +
          (hecha
            ? '<span class="quiz-pill clickable' + (est.expAbierta ? ' open' : '') + '" role="button" tabindex="0" data-pru="exp">' + (est.expAbierta ? 'Ocultar explicación' : 'Mostrar explicación') + '<span class="chev">' + ICONS.chevron + '</span></span>'
            : '<span class="quiz-pill clickable" role="button" tabindex="0" data-pru="blanco">En blanco</span>') +
          (ultima ? '' : '<button class="quiz-nav-btn pru-sig" data-pru="sig" aria-label="Siguiente"' + (hecha ? '' : ' disabled') + '>' + FLECHA_DER + '</button>') +
        '</div>' +
      '</div>';
    $('pruContador').textContent = (i + 1) + ' / ' + n;
    $('pruCabecera').querySelector('[data-pru="terminar"]').classList.toggle('ready', ultima && hecha);
    guardar();
  }
  function contador(){
    if(MODOS[est.modo].vista === 'tarjeta'){ $('pruContador').textContent = (est.i + 1) + ' / ' + est.items.length; return; }
    $('pruContador').textContent = est.resp.filter(r => r != null).length + ' / ' + est.items.length;
  }
  function arrancarReloj(){
    clearInterval(reloj);
    if(!est.fin) return;
    const tic = () => {
      if(!est || est.terminado || est.revision){ clearInterval(reloj); return; }
      const s = Math.max(0, Math.round((est.fin - Date.now()) / 1000));
      $('pruReloj').textContent = String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
      $('pruTiempo').classList.toggle('urgent', s <= 60);
      if(!s){ clearInterval(reloj); terminar(true); }
    };
    tic();
    reloj = setInterval(tic, 1000);
  }
  function responder(i, j){
    if(!est || est.terminado || est.revision) return;
    if(MODOS[est.modo].vista === 'tarjeta'){
      if(est.resp[i] != null || (est.blancas && est.blancas[i])) return;   // una sola respuesta
      est.resp[i] = j;
      est.expAbierta = false;
      pintarTarjeta();
    } else {
      est.resp[i] = est.resp[i] === j ? null : j;   // tocar otra vez la elegida la deja en blanco
      document.querySelectorAll('[data-pru-r="' + i + '"]').forEach(x => x.classList.toggle('selected', Number(x.dataset.j) === est.resp[i]));
      guardar();
    }
    contador();
  }
  async function pedirTerminar(){
    const tarjeta = MODOS[est.modo].vista === 'tarjeta';
    const quedan = tarjeta ? est.items.filter((_, i) => est.resp[i] == null && !(est.blancas && est.blancas[i])).length : est.resp.filter(r => r == null).length;
    const ok = await uiConfirm(!quedan ? '¿Terminar?' : tarjeta
      ? 'Te quedan ' + quedan + (quedan === 1 ? ' pregunta' : ' preguntas') + ' por responder. ¿Terminar ya?\n\nSolo cuentan las que has visto.'
      : 'Te quedan ' + quedan + (quedan === 1 ? ' pregunta en blanco' : ' preguntas en blanco') + '. ¿Finalizar?', { ok: 'Terminar' });
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
    // En Estudio y Fallos solo cuentan las que se han llegado a ver.
    if(MODOS[est.modo].vista === 'tarjeta'){
      const k = est.items.map((_, i) => i).filter(i => est.vistas[i] || est.resp[i] != null);
      est.items = k.map(i => est.items[i]); est.resp = k.map(i => est.resp[i]);
    }
    const segundos = Math.round((Math.min(Date.now(), est.fin || Date.now()) - est.inicio) / 1000);
    const parte = k => { const idx = est.items.map((_, i) => i).filter(i => est.items[i].k === k); return { items: idx.map(i => est.items[i]), resp: idx.map(i => est.resp[i]) }; };
    const L = parte('l'), E = parte('e');
    est.res = { todo: puntos(est.items, est.resp), l: puntos(L.items, L.resp), e: puntos(E.items, E.resp), segundos };
    if(porTiempo) uiToast('Se acabó el tiempo: corregido.', 'info');
    filtro = 'todas';
    pintarResultado();
    if(!est.items.length) return;
    // Todo lo que guarda la prueba lleva su id, para que al borrarla del historial se vaya con ella.
    const pid = nuevoId();
    // Específico: a sus estadísticas (en blanco cuenta como fallada, igual que en Legislación).
    if(E.items.length) ESPT.registrar(E.items.map((it, j) => ({ pregunta_id: it.id, acierto: E.resp[j] === it.correcta, prueba_id: pid })));
    if(typeof ESTE !== 'undefined') ESTE.invalidar();
    if(meta) meta.t = 0;
    guardarHistorial({ id: pid, modo: est.modo, nota: Number(est.res.todo.nota.toFixed(2)), segundos,
      resumen: { todo: est.res.todo, l: est.res.l, e: est.res.e },
      preguntas: est.items.map(it => it.k === 'l' ? { k: 'l', id: it.id, orden: it.orden } : { k: 'e', id: it.id }), respuestas: est.resp });
    // Legislación: una sesión «conjunto» con solo sus preguntas (para sus estadísticas y Fallos).
    if(L.items.length && currentUser) await guardarLegis(L, est.res.l, segundos, pid);
  }
  async function guardarLegis(L, r, segundos, pid){
    const sesion = { user_id: currentUser.id, prueba_id: pid, mode: 'conjunto', score: Number(r.nota.toFixed(2)), total: r.total, ok: r.bien, bad: r.mal, pending: r.blanco, time_seconds: segundos };
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
        try{ reportClientError('pruebas', 'No se pudo guardar: ' + (err && (err.message || err))); }catch(e){}
      }
      return;
    }
    try{ await loadAppData(); await refreshGlobalStats(); }catch(e){}
  }

  /* ---------- historial propio ---------- */
  const PENDIENTES = 'pj_historial_pruebas_pendientes:';
  function leerPend(){ try{ return JSON.parse(localStorage.getItem(PENDIENTES + currentUser.id) || '[]'); }catch(e){ return []; } }
  function escribirPend(l){ try{ l.length ? localStorage.setItem(PENDIENTES + currentUser.id, JSON.stringify(l)) : localStorage.removeItem(PENDIENTES + currentUser.id); }catch(e){} }
  // Una prueba de la vista de tutorbomberos: se guarda (o se actualiza) con cada respuesta.
  function guardarSesion(fila){
    if(!currentUser) return;
    const l = leerPend(), i = l.findIndex(f => f.id === fila.id);
    if(i >= 0) l[i] = fila; else l.push(fila);
    escribirPend(l);
    if(historial){ const j = historial.findIndex(h => h.id === fila.id); if(j >= 0) historial[j] = Object.assign({}, fila); else historial.unshift(Object.assign({}, fila)); }
    clearTimeout(guardarSesion.t);
    guardarSesion.t = setTimeout(subirPendientes, 1500);
  }
  function repintarListas(){
    if($('screen-pru-config') && $('screen-pru-config').classList.contains('active')) pintarConfig();
    if(typeof ESP !== 'undefined' && $('screen-especifico') && $('screen-especifico').classList.contains('active')) ESP.repintar();
  }
  async function guardarHistorial(fila){
    fila.created_at = new Date().toISOString();
    if(historial) historial.unshift(Object.assign({}, fila));
    escribirPend(leerPend().concat([fila]));
    await subirPendientes();
  }
  let subiendo = false;
  async function subirPendientes(){
    if(subiendo || !currentUser) return;
    const l = leerPend();
    if(!l.length) return;
    subiendo = true;
    try{
      const { error } = await sb.from('historial_pruebas').upsert(l, { onConflict: 'id' });
      if(!error){
        const subido = new Map(l.map(f => [f.id, JSON.stringify(f)]));
        const quedan = leerPend().filter(f => subido.get(f.id) !== JSON.stringify(f));
        escribirPend(quedan); subiendo = false;
        if(quedan.length) subirPendientes(); else cargarHistorial().then(repintarListas).catch(() => {});
        return;
      }
    }catch(e){}
    subiendo = false;
  }
  addEventListener('online', () => { subirPendientes(); });
  async function cargarHistorial(){
    await subirPendientes();
    const { data, error } = await sb.from('historial_pruebas').select('id,modo,nota,segundos,resumen,created_at').eq('user_id', currentUser.id).order('created_at', { ascending: false }).limit(60);
    if(error) throw error;
    // Las que aún no se han podido subir, también.
    const pend = leerPend().map((f, i) => Object.assign({ id: 'local-' + i, pendiente: true }, f));
    const ids = new Set(pend.map(f => f.id));
    historial = pend.reverse().concat((data || []).filter(h => !ids.has(h.id)));
    return historial;
  }
  function historialHtml(modos, limite){
    if(!featureEnabled('historial')) return '';
    modos = modos || (cfg.modo === 'conjunto' ? ['conjunto'] : [cfg.modo]);
    const lista = (historial || []).filter(h => modos.includes(h.modo));
    const cab = '<div class="section-row pru-hist-cab"><div class="section-title">' + (modos.length > 1 ? 'Historial' : 'Tu historial de ' + MODOS[modos[0]].corto.toLowerCase()) + '</div><div class="section-rule"></div></div>';
    if(!historial) return cab + '<div class="skel-list"><div class="skel-row"><span class="skel skel-dot"></span><span class="skel-lines"><span class="skel skel-line" style="width:60%"></span></span></div></div>';
    if(!lista.length) return cab + '<div class="tree-empty">Todavía no has hecho ninguno.</div>';
    return cab + '<div class="history">' + lista.slice(0, limite || 20).map(h => {
      const r = h.resumen || {}, t = r.todo || {};
      const partes = h.modo === 'esp-tb' && r.titulo ? '<span class="pru-hist-partes">' + escapeHtml(r.titulo) + '</span>' : h.modo === 'conjunto' ? '<span class="pru-hist-partes">Legislación <b>' + formatNota((r.l || {}).nota || 0) + '</b> · Específico <b>' + formatNota((r.e || {}).nota || 0) + '</b></span>' : '';
      return '<div class="hist-date">' + escapeHtml(formatRelativeDate(h.created_at)) + '</div>' +
        '<div class="hist-item t-' + (h.modo === 'conjunto' || h.modo === 'esp-simulacro' ? 'simulacro' : h.modo === 'esp-tb' ? 'estudio' : h.modo.replace('esp-', '')) + '" role="button" tabindex="0" data-pru-hist="' + h.id + '">' +
          '<div class="hist-icon">' + (ICONS[h.modo === 'conjunto' ? 'simulacro' : h.modo === 'esp-tb' ? 'doc' : h.modo.replace('esp-', '')] || ICONS.simulacro) + '</div>' +
          '<div class="hist-content"><div class="hist-top"><div class="hist-title">' + MODOS[h.modo].corto + partes + '</div>' +
            '<div class="hist-top-right"><div class="hist-score">Nota <b>' + formatNota(Number(h.nota)) + '</b></div>' +
            (String(h.id).startsWith('local-') ? '' : '<button class="hist-delete-btn" type="button" aria-label="Borrar" title="Borrar" data-pru-borrar="' + h.id + '">' + ICONS.trash + '</button>') + '</div></div>' +
          '<div class="hist-bottom"><div class="hist-meta">' + ICONS.clock + formatMMSS(h.segundos) + '</div>' +
            '<div class="hist-counts"><span class="c-ok">' + ICONS.ok + (t.bien || 0) + '</span><span class="c-bad">' + ICONS.bad + (t.mal || 0) + '</span><span class="c-pending">' + ICONS.pending + (t.blanco || 0) + '</span></div></div>' +
          '</div></div>';
    }).join('') + '</div>';
  }
  async function revisarHistorial(id){
    if(String(id).startsWith('local-') || leerPend().some(f => f.id === id)){ uiToast('Esta aún se está guardando; podrás revisarla en cuanto se suba.', 'info'); return; }
    try{
      const { data, error } = await sb.from('historial_pruebas').select('*').eq('id', id).single();
      if(error) throw error;
      if((data.preguntas || []).some(x => x.k === 'l') && whenAppDataReady(() => revisarHistorial(id))) return;
      const rehechos = await rehacer(data.preguntas || []);
      const keep = rehechos.map((it, i) => it ? i : -1).filter(i => i >= 0);
      est = { modo: data.modo, items: keep.map(i => rehechos[i]), resp: keep.map(i => (data.respuestas || [])[i] ?? null), terminado: true, revision: true,
        res: Object.assign({}, data.resumen, { segundos: data.segundos }), fecha: data.created_at };
      if(keep.length < rehechos.length) uiToast((rehechos.length - keep.length) + ' preguntas ya no existen y no se muestran.', 'info');
      cerrarConfig();
      filtro = 'todas';
      pintarResultado();
    }catch(e){ uiToast('No se pudo abrir: ' + (e.message || e), 'error'); }
  }
  // Borrar una prueba quita todo lo que metió: sus respuestas del Específico
  // (Estadísticas y Fallos) y la sesión de su parte de Legislación.
  async function borrarHistorial(id){
    if(!(await uiConfirm('¿Borrar esta prueba de tu historial?\n\nTambién se quitarán sus respuestas de Estadísticas y de Fallos. No se puede deshacer.', { ok: 'Borrar', danger: true }))) return;
    const yo = currentUser.id;
    try{
      ESPT.olvidarPrueba(id);
      escribirPend(leerPend().filter(f => f.id !== id));
      let r = await sb.from('especifico_respuestas').delete().eq('user_id', yo).eq('prueba_id', id);
      if(r.error) throw r.error;
      r = await sb.from('test_sessions').select('id').eq('user_id', yo).eq('prueba_id', id);
      if(r.error) throw r.error;
      const ses = (r.data || []).map(x => x.id);
      if(ses.length){
        r = await sb.from('session_answers').delete().eq('user_id', yo).in('session_id', ses);
        if(r.error) throw r.error;
        r = await sb.from('test_sessions').delete().eq('user_id', yo).in('id', ses);
        if(r.error) throw r.error;
      }
      r = await sb.from('historial_pruebas').delete().eq('user_id', yo).eq('id', id);
      if(r.error) throw r.error;
      if(ses.length) try{ await loadAppData(); await refreshGlobalStats(); }catch(e){}
    }catch(e){ uiToast('No se pudo borrar: ' + (e.message || e), 'error'); return; }
    if(typeof ESTE !== 'undefined') ESTE.invalidar();
    if(meta) meta.t = 0;
    historial = (historial || []).filter(h => h.id !== id);
    if($('screen-pru-config').classList.contains('active')) pintarConfig();
    if(typeof ESP !== 'undefined' && $('screen-especifico').classList.contains('active')) ESP.repintar();
  }

  function pintarResultado(){
    showScreen('screen-pru');
    $('pruCabecera').classList.add('hidden');
    if(typeof updateQuizHeadHeightVar === 'function') updateQuizHeadHeightVar();
    const r = est.res, M = MODOS[est.modo];
    const caja = (tit, x, clase) => x && x.total ? '<div class="simc-parte ' + clase + '"><div class="simc-parte-tit">' + tit + '</div>' +
      '<div class="simc-parte-nota">' + formatNota(x.nota) + '</div>' +
      '<div class="simc-parte-datos"><span class="ok">' + x.bien + ' bien</span><span class="mal">' + x.mal + ' mal</span><span>' + x.blanco + ' en blanco</span><span>de ' + x.total + '</span></div></div>' : '';
    const todo = r.todo || { total: 0, bien: 0, mal: 0, blanco: 0, nota: 0 };
    const filtros = [['todas', 'Todas'], ['mal', 'Falladas'], ['blanco', 'En blanco']].concat(M.legis ? [['legis', 'Legislación'], ['esp', 'Específico']] : []);
    $('pruCuerpo').innerHTML =
      '<div class="result-hero"><div class="result-label">' + M.largo + ' · ' + (est.fecha ? escapeHtml(formatRelativeDate(est.fecha)) + ' · ' : '') + formatMMSS(r.segundos || 0) + '</div>' +
        '<div class="result-score">' + formatNota(todo.nota) + '<span>/10</span></div>' +
        '<div class="simc-sub">' + todo.bien + ' aciertos · ' + todo.mal + ' fallos · ' + todo.blanco + ' en blanco</div></div>' +
      (M.legis ? '<div class="simc-partes">' + caja('Legislación', r.l, 'legis') + caja('Específico', r.e, 'esp') + '</div>' : '') +
      (est.items.length ? '<div class="simc-filtros">' + filtros.map(([k, t]) =>
        '<button type="button" class="admin-tab' + (filtro === k ? ' active' : '') + '" data-pru-filtro="' + k + '">' + t + '</button>').join('') + '</div>' +
        '<div>' + revision() + '</div>' : '<div class="tree-empty">No llegaste a ver ninguna pregunta: no se guarda nada.</div>') +
      '<div class="simc-botones"><button class="btn btn-ghost" data-pru="volver">' + (M.volver === 'screen-inicio' ? 'Volver al inicio' : 'Volver al Específico') + '</button>' +
        (permitido(est.modo) && !MODOS[est.modo].soloHistorial ? '<button class="btn btn-primary" data-pru="otro">' + (est.revision ? 'Hacer otro' : 'Otro igual') + '</button>' : '') + '</div>';
    arriba();
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
        (it.explicacion !== '' ? '<details class="simc-exp" data-i="' + i + '"><summary>Explicación</summary><div class="simc-exp-cuerpo"></div></details>' : '') +
        (it.k === 'l' && it.art ? '<div class="simc-art">' + escapeHtml(it.art) + '</div>' : '') +
      '</div>').join('');
  }

  /* ---------- panel de pj.fire del Específico (lo pinta ESP) ---------- */
  const ICO_MODO = { 'esp-estudio': 'estudio', 'esp-fallos': 'fallos', 'esp-simulacro': 'simulacro', 'esp-examen': 'examen' };
  let panelMeta = null;
  function panelHtml(){
    const nFallos = panelMeta ? panelMeta.preg.filter(p => panelMeta.enFallos(p.id)).length : null;
    const sub = { 'esp-estudio': 'Elige tus temas', 'esp-fallos': nFallos == null ? '<span class="skel skel-inline"></span>' : nFallos ? nFallos + ' pendientes' : 'Sin fallos',
      'esp-simulacro': 'Tiempo y preguntas', 'esp-examen': 'Temas, tiempo y preguntas' };
    const cards = Object.keys(ICO_MODO).filter(permitido).map(k =>
      '<div class="mode-card ' + ICO_MODO[k] + (k === 'esp-fallos' && nFallos === 0 ? ' disabled' : '') + '" role="button" tabindex="0" data-pru-modo="' + k + '">' +
        '<div class="mode-emblem">' + ICONS[ICO_MODO[k]] + '</div>' +
        '<div><div class="m-name">' + (k === 'esp-estudio' ? 'Modo estudio' : MODOS[k].corto) + '</div><div class="m-sub">' + sub[k] + '</div></div></div>').join('');
    const g = aMedias(Object.keys(ICO_MODO));
    const nm = typeof ESPT !== 'undefined' ? ESPT.numMarcadas() : null;
    return (g ? '<button type="button" class="ini-continuar" data-pru="continuar"><span class="ini-continuar-txt"><b>Continuar ' + escapeHtml(MODOS[g.modo].corto.toLowerCase()) + '</b><span>' + g.hechas + ' de ' + g.total + ' respondidas</span></span><span class="ini-flecha">›</span></button>' : '') +
      '<div class="modes pru-modos">' + cards + '</div>' +
      '<button type="button" class="esp-marcadas pru-marcadas" data-marcadas="1"><span class="esp-marcadas-ico"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2.5l2.9 6 6.6.8-4.9 4.5 1.3 6.5L12 17l-5.9 3.3 1.3-6.5L2.5 9.3l6.6-.8z"/></svg></span><span class="esp-marcadas-txt"><b>Preguntas marcadas</b><span>' +
        (nm == null ? 'Las que guardas con la estrella' : nm ? nm + (nm === 1 ? ' pregunta guardada' : ' preguntas guardadas') : 'Todavía no has guardado ninguna') + '</span></span><span class="esp-marcadas-flecha">›</span></button>' +
      historialHtml(Object.keys(ICO_MODO).concat('esp-tb'), 10);
  }
  async function cargarPanel(){
    if(!currentUser) return;
    try{
      if(metaYa()){ panelMeta = meta; if(typeof ESP !== 'undefined') ESP.repintar(); }
      await Promise.all([refrescarMeta().then(x => { panelMeta = x; }), cargarHistorial()]);
    }catch(e){}
    if(typeof ESP !== 'undefined') ESP.repintar();
  }
  function onPanelClick(e){
    const t = e.target.closest('[data-pru-modo],[data-pru-hist],[data-pru-borrar],[data-pru="continuar"]');
    if(!t) return false;
    if(t.dataset.pruBorrar){ e.stopPropagation(); borrarHistorial(t.dataset.pruBorrar); return true; }
    if(t.dataset.pruHist){ revisarHistorial(t.dataset.pruHist); return true; }
    if(t.dataset.pru === 'continuar'){ continuar(); return true; }
    if(t.classList.contains('disabled')) return true;
    abrirConfig(t.dataset.pruModo);
    return true;
  }

  function onClick(e){
    const r = e.target.closest('[data-pru-r]');
    if(r){ responder(Number(r.dataset.pruR), Number(r.dataset.j)); return; }
    const f = e.target.closest('[data-pru-filtro]');
    if(f){ filtro = f.dataset.pruFiltro; pintarResultado(); return; }
    const b = e.target.closest('[data-pru]');
    if(!b || b.disabled) return;
    const M = est ? MODOS[est.modo] : MODOS.conjunto;
    switch(b.dataset.pru){
      case 'terminar': pedirTerminar(); break;
      case 'ant': if(est.i > 0){ est.i--; est.expAbierta = false; pintarTarjeta(); arriba(); } break;
      case 'sig': if(est.i < est.items.length - 1){ est.i++; est.expAbierta = false; pintarTarjeta(); arriba(); } break;
      case 'exp': est.expAbierta = !est.expAbierta; pintarTarjeta(); break;
      case 'blanco':
        if(!est.blancas) est.blancas = new Array(est.items.length).fill(false);
        est.blancas[est.i] = true; est.expAbierta = false; pintarTarjeta(); contador(); break;
      case 'salir': showScreen(M.volver); break;   // queda guardada: se sigue después
      case 'volver': { const v = M.volver; est = null; showScreen(v); break; }
      case 'otro': { const modo = est.modo, v = M.volver; est = null; showScreen(v); abrirConfig(modo); break; }
    }
  }
  function onKey(e){
    if(e.key !== 'Enter' && e.key !== ' ') return;
    const r = e.target.closest('[data-pru-r],[data-pru-tema],[data-pru-todos],[data-pru-opt],[data-pru-hist],[data-pru-modo]');
    if(r){ e.preventDefault(); r.click(); }
  }
  function enganchar(){
    const s = $('screen-pru'), c = $('screen-pru-config');
    if(s){ s.addEventListener('click', onClick); s.addEventListener('keydown', onKey); }
    // En la corrección, la explicación se pinta (y se descarga, si es del Específico) al abrirla.
    if(s) s.addEventListener('toggle', e => {
      const d = e.target;
      if(!d.matches || !d.matches('details.simc-exp') || !d.open || !est) return;
      const cuerpo = d.querySelector('.simc-exp-cuerpo'), it = est.items[Number(d.dataset.i)];
      if(cuerpo && it && !cuerpo.dataset.listo){ cuerpo.dataset.listo = '1'; cuerpo.innerHTML = explicacion(it) || 'Sin explicación.'; }
    }, true);
    if(c){
      c.addEventListener('click', onConfigClick); c.addEventListener('keydown', onKey);
      c.addEventListener('input', e => { if(e.target.matches('[data-pru-rango]')) moverRango(e.target); });
      c.addEventListener('change', e => { if(e.target.matches('[data-pru-rango]')) pintarConfig(); });
    }
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', enganchar); else enganchar();
  document.addEventListener('visibilitychange', () => {
    if(!document.hidden && est && !est.terminado && est.fin && Date.now() >= est.fin) terminar(true);
  });
  function reiniciar(){ clearInterval(reloj); est = null; meta = null; cargandoMeta = null; panelMeta = null; historial = null; cfg.legis.clear(); cfg.esp.clear(); }
  return {
    conjuntoDisponible: () => permitido('conjunto'),
    abrirConfig, cerrarConfig, empezar, quitarFallos, continuar, aMedias, reiniciar, precargar,
    guardarSesion, historialHtml, nuevoId, cargarHistorialTb: () => cargarHistorial().then(repintarListas).catch(() => {}),
    panelHtml, cargarPanel, onPanelClick, onKey
  };
})();
