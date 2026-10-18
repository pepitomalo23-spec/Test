/* Calendario: lo que cada alumno se apunta para estudiar cada día
   (tabla calendario_tareas, privada). Mes con puntos de colores por
   categoría, el día elegido con sus tareas para marcar, lo atrasado para
   pasarlo a hoy y la racha de días cumplidos. Se guarda una copia en el
   dispositivo para pintar al momento y sin conexión; los cambios se ven
   antes de que llegue la respuesta del servidor. */
const CAL = (function(){
  const CACHE = 'pj_calendario_v1:';
  const CATS = [
    ['normativas', 'Normativas', 'var(--coral)'],
    ['legislacion', 'Legislación', 'var(--purple)'],
    ['callejero', 'Callejero', 'var(--teal)'],
    ['especifico', 'Específico', 'var(--blue)'],
    ['test', 'Test / simulacro', 'var(--orange)'],
    ['examen', 'Examen', '#E5484D'],
    ['fisico', 'Físico', 'var(--green)'],
    ['repaso', 'Repaso', 'var(--amber)'],
    ['otro', 'Otro', 'var(--muted)']
  ];
  // Iconos dibujados (mismo trazo que el resto de la app), en el color de su categoría.
  const svg = d => '<svg class="cal-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + '</svg>';
  const ICONO = {
    normativas: svg('<path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/>'),
    legislacion: svg('<path d="M12 3v18"/><path d="M7 21h10"/><path d="M3 7h18"/><path d="m6 7-3 7a3 3 0 0 0 6 0Z"/><path d="m18 7-3 7a3 3 0 0 0 6 0Z"/>'),
    callejero: svg('<path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2Z"/><path d="M9 4v14"/><path d="M15 6v14"/>'),
    especifico: svg('<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.43-2.29 1-3a2.5 2.5 0 0 0 2.5 2.5Z"/>'),
    examen: svg('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>'),
    test: svg('<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="m9 14 2 2 4-4"/>'),
    fisico: svg('<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>'),
    repaso: svg('<path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M8 16H3v5"/>'),
    otro: svg('<circle cx="12" cy="12" r="3.5"/>')
  };
  const CALEND = svg('<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h18"/>');
  const LAPIZ = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>';
  const CAT = Object.fromEntries(CATS.map(([k, n, c]) => [k, { n, c }]));
  // Desde la tarea se puede saltar a su apartado.
  const IR = { normativas: 'screen-normativas', legislacion: 'screen-home', callejero: 'screen-callejero', especifico: 'screen-especifico', test: 'screen-home' };
  const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const FRASES = ['Nada apuntado para este día.', 'Día libre.', 'Sin tareas este día.'];

  let tareas = [], cargado = false, cargando = null, dueño = null;
  let mes = null, elegido = null;
  let menuDia = false, opcionesDe = null;   // menú «Mover» del día abierto; tarea con sus opciones rápidas abiertas

  /* ---------- fechas (siempre en hora local, como 'AAAA-MM-DD') ---------- */
  const dos = n => String(n).padStart(2, '0');
  const iso = d => d.getFullYear() + '-' + dos(d.getMonth() + 1) + '-' + dos(d.getDate());
  const deIso = s => { const [a, m, d] = s.split('-').map(Number); return new Date(a, m - 1, d); };
  const hoy = () => iso(new Date());
  const masDias = (s, n) => { const d = deIso(s); d.setDate(d.getDate() + n); return iso(d); };
  function nombreDia(s, corto){
    const d = deIso(s), h = hoy();
    const rel = s === h ? 'Hoy' : s === masDias(h, 1) ? 'Mañana' : s === masDias(h, -1) ? 'Ayer' : null;
    const largo = DIAS[d.getDay()] + ' ' + d.getDate() + ' de ' + MESES[d.getMonth()];
    if(corto) return rel || largo.charAt(0).toUpperCase() + largo.slice(1);
    return rel ? rel + ', ' + largo : largo.charAt(0).toUpperCase() + largo.slice(1);
  }
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* ---------- datos ---------- */
  const yo = () => (typeof currentUser !== 'undefined' && currentUser) ? currentUser.id : null;
  function leerCache(){ try{ return JSON.parse(localStorage.getItem(CACHE + yo()) || 'null'); }catch(e){ return null; } }
  function guardarCache(){ try{ localStorage.setItem(CACHE + yo(), JSON.stringify(tareas)); }catch(e){} }
  const ordenar = () => tareas.sort((a, b) => a.fecha.localeCompare(b.fecha) || (a.orden - b.orden) || String(a.created_at).localeCompare(String(b.created_at)));
  const delDia = f => tareas.filter(t => t.fecha === f);

  async function cargar(){
    if(!yo()) return;
    if(dueño !== yo()){ dueño = yo(); cargado = false; tareas = (leerCache() || []).map(normalizar); ordenar(); }
    if(cargando) return cargando;
    cargando = (async () => {
      const filas = [];
      for(let desde = 0; ; desde += 1000){
        const { data, error } = await sb.from('calendario_tareas').select('id,fecha,titulo,nota,categoria,hecho,orden,serie,created_at,test_id,test_ids,progreso,legis,simulacro,examen')
          .eq('user_id', yo()).order('fecha').order('orden').range(desde, desde + 999);
        if(error) throw error;
        filas.push(...data);
        if(data.length < 1000) break;
      }
      tareas = filas.map(normalizar); ordenar(); cargado = true; guardarCache();
      // Los nombres de los tests salen de la lista del Específico.
      if(tareas.some(t => t.test_ids.length) && conTests() && !ESP.tests().length) ESP.cargarTests().then(() => pintar());
    })().catch(e => { if(!cargado) uiToast('No se pudo cargar el calendario: ' + (e.message || e), 'error'); })
      .finally(() => { cargando = null; pintar(); });
    return cargando;
  }
  // Cambio optimista: se ve ya y, si falla, se vuelve a cargar lo del servidor.
  async function enviar(promesa, msgError){
    guardarCache(); pintar();
    const { error } = await promesa;
    if(error){ uiToast(msgError + ': ' + error.message, 'error'); await cargar(); }
  }

  /* ---------- cálculos ---------- */
  function racha(){
    // Días seguidos (hacia atrás) en los que se hizo todo lo apuntado; los
    // días sin nada apuntado no cortan la racha, y hoy solo cuenta si ya está.
    const porDia = new Map();
    tareas.forEach(t => { const d = porDia.get(t.fecha) || [0, 0]; d[0]++; if(t.hecho) d[1]++; porDia.set(t.fecha, d); });
    let n = 0, f = hoy();
    const t0 = porDia.get(f);
    if(t0 && t0[0] === t0[1]) n++;
    for(let i = 0; i < 400; i++){
      f = masDias(f, -1);
      const d = porDia.get(f);
      if(!d) continue;
      if(d[0] !== d[1]) break;
      n++;
    }
    return n;
  }
  const atrasadas = () => { const h = hoy(); return tareas.filter(t => !t.hecho && t.fecha < h); };

  /* ---------- pintar ---------- */
  function rejilla(){
    const [a, m] = mes, primero = new Date(a, m, 1), h = hoy();
    const hueco = (primero.getDay() + 6) % 7;            // la semana empieza en lunes
    const diasMes = new Date(a, m + 1, 0).getDate();
    const porDia = new Map();
    tareas.forEach(t => { if(!porDia.has(t.fecha)) porDia.set(t.fecha, []); porDia.get(t.fecha).push(t); });
    let celdas = '';
    for(let i = 0; i < hueco; i++) celdas += '<div class="cal-dia vacio"></div>';
    for(let d = 1; d <= diasMes; d++){
      const f = a + '-' + dos(m + 1) + '-' + dos(d), ts = porDia.get(f) || [];
      const todo = ts.length && ts.every(t => t.hecho), falta = ts.length && f < h && !todo;
      const cls = ['cal-dia', f === h ? 'hoy' : '', f === elegido ? 'sel' : '', todo ? 'ok' : '', falta ? 'falta' : '', f < h ? 'pasado' : ''].filter(Boolean).join(' ');
      const puntos = ts.slice(0, 4).map(t => '<i style="background:' + CAT[t.categoria].c + '"' + (t.hecho ? ' class="h"' : '') + '></i>').join('') + (ts.length > 4 ? '<em>+' + (ts.length - 4) + '</em>' : '');
      celdas += '<button class="' + cls + '" data-cal="dia" data-f="' + f + '" aria-label="' + esc(nombreDia(f)) + ', ' + ts.length + ' tareas">' +
        '<span class="cal-num">' + d + '</span><span class="cal-puntos">' + puntos + '</span></button>';
    }
    const esteMes = (() => { const n = new Date(); return n.getFullYear() === a && n.getMonth() === m; })();
    return '<div class="cal-mes">' +
      '<div class="cal-mes-cab"><div class="cal-mes-nombre">' + MESES[m].charAt(0).toUpperCase() + MESES[m].slice(1) + ' <span>' + a + '</span></div>' +
        '<div class="cal-mes-nav"><button class="cal-btn-s" data-cal="hoy"' + (esteMes && elegido === h ? ' disabled' : '') + '>Hoy</button>' +
        '<button class="cal-btn-s cal-flecha" data-cal="mes" data-d="-1" aria-label="Mes anterior">‹</button>' +
        '<button class="cal-btn-s cal-flecha" data-cal="mes" data-d="1" aria-label="Mes siguiente">›</button></div></div>' +
      '<div class="cal-semana">' + ['L', 'M', 'X', 'J', 'V', 'S', 'D'].map(x => '<span>' + x + '</span>').join('') + '</div>' +
      '<div class="cal-rejilla">' + celdas + '</div></div>';
  }
  /* ---------- tests del Específico en una tarea ----------
     Una tarea puede llevar uno o varios tests (p. ej. todos los de un tema).
     Cada uno con su barra de lo hecho y lo que falta; al pulsarlo se abre ese
     test por donde se dejó. El avance va en la tarea: progreso.porTest[id]. */
  const conTests = () => typeof ESP !== 'undefined' && typeof ESPT !== 'undefined' && featureEnabled('especifico');
  // Las tareas de antes (un solo test) se pasan a la forma de ahora.
  function normalizar(t){
    if(!t.test_ids) t.test_ids = t.test_id ? [t.test_id] : [];
    const p = t.progreso;
    if(p && !p.porTest) t.progreso = p.resp && t.test_ids[0] ? { porTest: { [t.test_ids[0]]: p } } : null;
    return t;
  }
  const datosTest = id => (conTests() && ESP.tests().find(x => x.id === id)) || { id, titulo: 'Test', tema: '' };
  const testsDe = t => conTests() ? (t.test_ids || []).map(datosTest) : [];
  // Cuánto lleva un test: { hechas, total } (total 0 si nunca se ha abierto).
  function avance(t, id){
    const p = ((t.progreso || {}).porTest || {})[id] || {};
    return { hechas: Object.keys(p.resp || {}).length, total: p.total || 0 };
  }
  const terminado = a => a.total > 0 && a.hechas >= a.total;
  function avanceTotal(t){
    const ids = t.test_ids || [];
    const xs = ids.map(id => avance(t, id)).concat(t.legis ? [avanceLegis(t)] : [], t.simulacro ? [avanceSimc(t)] : []);
    // partes: lo hecho de cada test (0 a 1), en su orden, para la barra por tramos.
    return { tests: xs.length, terminados: xs.filter(terminado).length, hechas: xs.reduce((n, a) => n + a.hechas, 0), total: xs.reduce((n, a) => n + a.total, 0),
      partes: xs.map(a => a.total ? Math.min(1, a.hechas / a.total) : 0) };
  }
  // Un test terminado sale como «Completado» y ya no se abre (así no se puede
  // empezar de nuevo sin querer y perder lo hecho).
  function filaTest(t, x, solo){
    const a = avance(t, x.id), pct = a.total ? Math.round(a.hechas / a.total * 100) : 0, fin = terminado(a);
    const accion = fin ? 'Completado ✓' : a.hechas ? 'Continuar ›' : 'Empezar ›';
    return '<' + (fin ? 'div' : 'button type="button"') + ' class="cal-test' + (solo ? '' : ' en-lista') + (fin ? ' acabado' : '') + '"' + (fin ? '' : ' data-cal="test" data-id="' + t.id + '" data-test="' + x.id + '"') + '>' +
      '<span class="cal-test-cab"><span class="cal-test-t">Test - <b>' + esc(x.titulo) + '</b></span><span class="cal-test-accion">' + accion + '</span></span>' +
      '<span class="cal-test-barra"><i style="width:' + pct + '%"></i></span>' +
      '<span class="cal-test-n">' + (fin ? 'Terminado · ' + a.total + ' preguntas' : a.hechas ? a.hechas + ' de ' + a.total + ' respondidas · faltan ' + (a.total - a.hechas) : 'Sin empezar') + '</span>' +
      '</' + (fin ? 'div' : 'button') + '>';
  }
  // Lo que se ve en la tarea: un test, o la lista con cuántos van terminados.
  function bloqueTest(t){
    const xs = testsDe(t), n = xs.length + (t.legis ? 1 : 0) + (t.simulacro ? 1 : 0);
    if(!n) return '';
    if(n === 1) return xs.length ? filaTest(t, xs[0], true) : t.legis ? filaLegis(t, true) : filaSimc(t, true);
    const a = avanceTotal(t);
    return '<div class="cal-tests"><div class="cal-tests-cab"><span>' + n + ' tests</span><span>' + a.terminados + ' de ' + n + ' terminados</span></div>' + barraTramos(a.partes) +
      xs.map(x => filaTest(t, x)).join('') + (t.legis ? filaLegis(t) : '') + (t.simulacro ? filaSimc(t) : '') + '</div>';
  }
  const conTareaTest = t => !!(testsDe(t).length || t.legis || t.simulacro);
  // Todo lo que lleva la tarea, terminado (los del Específico y el de Legislación).
  const todoTerminado = t => conTareaTest(t) && (t.test_ids || []).every(x => terminado(avance(t, x))) && (!t.legis || terminado(avanceLegis(t))) && (!t.simulacro || terminado(avanceSimc(t)));
  // Una barra con un tramo por test: se va llenando test a test, cada uno en su sitio.
  function barraTramos(partes){
    return '<span class="cal-tramos">' + partes.map(x => '<i><b style="width:' + Math.round(x * 100) + '%"></b></i>').join('') + '</span>';
  }
  // Antes de abrir un test de la tarea, su avance de verdad (el del servidor): el
  // de este dispositivo puede estar atrasado (se hizo en otro, o se recuperó) y
  // abrir el test con él lo guardaría encima. Sin conexión, el que haya.
  async function refrescarTarea(t){
    try{
      const { data, error } = await Promise.race([sb.from('calendario_tareas').select('progreso,legis,hecho').eq('id', t.id).maybeSingle(), new Promise(r => setTimeout(() => r({ error: 'tarde' }), 6000))]);
      if(error || !data) return;
      Object.assign(t, { progreso: data.progreso, legis: data.legis, hecho: data.hecho });
      normalizar(t); guardarCache(); pintar();
    }catch(e){}
  }
  async function hacerTest(t, id){
    if(!conTests()) return;
    id = id || (t.test_ids || [])[0];
    if(!id) return;
    await refrescarTarea(t);
    if(terminado(avance(t, id))){ uiToast('Este test ya está completado', 'info'); return; }
    cerrarVer();
    const volver = (document.querySelector('.screen.active:not(.overlay)') || {}).id || 'screen-calendario';
    ESPT.abrir(datosTest(id), { tarea: t.id, progreso: ((t.progreso || {}).porTest || {})[id], volver });
  }
  // Lo guarda el test (js/especifico-test.js) con cada respuesta. Cuando están todos los tests terminados, la tarea queda hecha.
  function guardarProgreso(id, testId, prog){
    const t = tareas.find(x => x.id === id);
    if(!t) return;
    const antes = terminado(avance(t, testId));
    const pt = Object.assign({}, (t.progreso || {}).porTest);
    // Las respuestas no se deshacen: lo que ya estaba guardado se queda (por si este dispositivo iba atrasado).
    const viejo = pt[testId] || {};
    pt[testId] = Object.assign({}, prog, { resp: Object.assign({}, viejo.resp, prog.resp), sesion: prog.sesion || viejo.sesion || null, ultima: prog.ultima || viejo.ultima || null });
    t.progreso = { porTest: pt };
    const marca = todoTerminado(t) && !t.hecho;
    if(marca){ t.hecho = true; uiToast(avanceTotal(t).tests > 1 ? 'Todos los tests terminados: tarea hecha' : 'Test terminado: tarea hecha', 'success'); }
    else if(!antes && terminado(avance(t, testId)) && avanceTotal(t).tests > 1) avisarQuedan(t);
    guardarCache();
    clearTimeout(guardarProgreso.t);
    const enviarYa = () => sb.from('calendario_tareas').update(Object.assign({ progreso: t.progreso, updated_at: new Date().toISOString() }, t.hecho && marca ? { hecho: true } : {}))
      .eq('id', id).then(({ error }) => { if(error) console.warn('No se pudo guardar el avance del test', error); });
    if(marca) enviarYa(); else guardarProgreso.t = setTimeout(enviarYa, 800);
  }

  function avisarQuedan(t){
    const a = avanceTotal(t), q = a.tests - a.terminados;
    uiToast('Test terminado. ' + (q === 1 ? 'Te queda 1 test' : 'Te quedan ' + q + ' tests') + ' de esta tarea', 'info');
  }

  /* ---------- test de Legislación en una tarea ----------
     t.legis = { temas: [topic_id], modo: 'estudio'|'examen', cuantas, run }.
     Se hace con el test de siempre (js/test.js), sin reloj. run es el intento
     en curso: las preguntas que salieron, el orden de sus opciones y lo
     respondido, para seguir en la misma pregunta también desde otro
     dispositivo. Al finalizar el test, la tarea queda hecha. */
  const conLegis = () => typeof QUESTIONS_POOL !== 'undefined' && typeof startQuiz === 'function';
  const LEGIS_MODOS = { estudio: 'Estudio', examen: 'Examen' };
  const LEGIS_CUANTAS = [[10, '10'], [20, '20'], [30, '30'], [50, '50'], [0, 'Todas']];
  const leyes = () => (typeof TOPICS !== 'undefined' ? TOPICS : []).filter(x => x.enabled);
  function nombreLey(id){
    const x = leyes().find(y => y.id === id), n = String(x ? x.name : id).trim();
    const m = n.match(/^(\d+\/\d{4})/);
    const c = m ? 'Ley ' + m[1] : n.replace(/\s*(→|->).*$/, '');
    return c.charAt(0).toUpperCase() + c.slice(1);
  }
  function resumenLeyes(temas){
    const ns = (temas || []).map(nombreLey);
    if(ns.length > 2 && ns.length === leyes().length) return 'todas las leyes';
    return ns.length <= 1 ? (ns[0] || '') : ns.length === 2 ? ns[0] + ' y ' + ns[1] : ns[0] + ' y ' + (ns.length - 1) + ' más';
  }
  // De qué fuente (Todas / pj.fire / Tutorbombero) y qué títulos de cada ley (L.titulos[ley]: sin elegir, la ley entera).
  const fuenteLegis = L => L.fuente && L.fuente !== 'todas' && hayTutorbombero() ? L.fuente : 'todas';
  const titulosDe = (L, ley) => ((L.titulos || {})[ley] || []).filter(id => gruposDe(ley).some(g => g.id === id));
  // Cuántas preguntas tiene cada ley de cada fuente; con una fuente elegida solo salen las leyes que tienen de ella.
  function cuentasLeyes(){
    const out = {};
    QUESTIONS_POOL.forEach(q => { const c = out[q.topic_id] = out[q.topic_id] || { pj: 0, tb: 0 }; c[fuenteDe(q) === 'tb' ? 'tb' : 'pj']++; });
    return out;
  }
  const leyesDe = L => { const f = fuenteLegis(L), c = cuentasLeyes(); return leyes().filter(x => f === 'todas' || (c[x.id] && c[x.id][f])); };
  const nTitulos = L => L.temas.reduce((n, k) => n + titulosDe(L, k).length, 0);
  function preguntasLegis(L){
    const f = fuenteLegis(L);
    return QUESTIONS_POOL.filter(q => {
      if(!L.temas.includes(q.topic_id) || !deFuente(q, f)) return false;
      const ts = titulosDe(L, q.topic_id);
      return !ts.length || (!!q.nodo_id && nodeIsInSelectedGroups(q.nodo_id, new Set(ts)));
    });
  }
  const tituloLegis = L => LEGIS_MODOS[L.modo] + ' · ' + resumenLeyes(L.temas) + (nTitulos(L) ? ' (' + nTitulos(L) + (nTitulos(L) === 1 ? ' título)' : ' títulos)') : '') +
    (fuenteLegis(L) !== 'todas' ? ' · ' + FUENTES_LEGIS[fuenteLegis(L)] : '');
  const claveTit = L => L.temas.map(k => k + ':' + titulosDe(L, k).slice().sort().join(',')).sort().join('|');
  const mismoLegis = (a, b) => !!a && !!b && a.modo === b.modo && (a.cuantas || 0) === (b.cuantas || 0) && [...a.temas].sort().join('|') === [...b.temas].sort().join('|') &&
    (a.fuente || 'todas') === (b.fuente || 'todas') && claveTit(a) === claveTit(b);
  const copiaLegis = L => ({ temas: [...L.temas], modo: L.modo, cuantas: L.cuantas || 0, fuente: L.fuente || 'todas',
    titulos: Object.fromEntries(L.temas.map(k => [k, titulosDe(L, k)]).filter(([, v]) => v.length)) });
  function avanceLegis(t){
    const r = (t.legis || {}).run;
    if(!r) return { hechas: 0, total: 0 };
    return { hechas: r.fin ? r.total : r.hechas || 0, total: r.total || 0 };
  }
  function filaLegis(t, solo){
    const L = t.legis, r = L.run, a = avanceLegis(t), fin = !!(r && r.fin);
    const pct = a.total ? Math.round(a.hechas / a.total * 100) : 0;
    const accion = fin ? 'Completado ✓' : a.hechas ? 'Continuar ›' : 'Empezar ›';
    const nota = fin && r.nota != null ? ' · nota ' + String(Math.round(r.nota * 100) / 100).replace('.', ',') : '';
    return '<' + (fin ? 'div' : 'button type="button"') + ' class="cal-test cal-test-legis' + (solo ? '' : ' en-lista') + (fin ? ' acabado' : '') + '"' + (fin ? '' : ' data-cal="legis" data-id="' + t.id + '"') + '>' +
      '<span class="cal-test-cab"><span class="cal-test-t">Legislación - <b>' + esc(tituloLegis(L)) + '</b></span><span class="cal-test-accion">' + accion + '</span></span>' +
      '<span class="cal-test-barra"><i style="width:' + pct + '%"></i></span>' +
      '<span class="cal-test-n">' + (fin ? 'Terminado · ' + (r.hechas && r.hechas < a.total ? r.hechas + ' de ' + a.total + ' respondidas' : a.total + ' preguntas') + nota : a.hechas ? a.hechas + ' de ' + a.total + ' respondidas · faltan ' + (a.total - a.hechas)
        : 'Sin empezar · ' + (L.cuantas ? L.cuantas + ' preguntas' : 'todas las preguntas')) + '</span>' +
      '</' + (fin ? 'div' : 'button') + '>';
  }
  // Las preguntas del intento guardado, con sus opciones en el mismo orden que salieron.
  function preguntasDe(run){
    const porId = new Map(QUESTIONS_POOL.map(q => [String(q.id), q]));
    const out = [];
    run.ids.forEach((id, i) => {
      const q = porId.get(String(id));
      if(!q) return;   // pregunta borrada desde entonces: fuera
      const ord = (run.ord || [])[i];
      const ok = ord && ord.length === q.options.length && ord.indexOf(q.correct) !== -1;
      out.push({ i, q: ok ? Object.assign({}, q, { options: ord.map(k => q.options[k]), correct: ord.indexOf(q.correct), _optionOrder: ord }) : q });
    });
    return out;
  }
  async function hacerLegis(t){
    if(!conLegis() || !t.legis) return;
    if(whenAppDataReady(() => hacerLegis(t))) return;
    await refrescarTarea(t);
    if(!t.legis) return;
    if(t.legis.run && t.legis.run.fin){ uiToast('Este test ya está completado', 'info'); return; }
    const volver = (document.querySelector('.screen.active:not(.overlay)') || {}).id || 'screen-calendario';
    const L = t.legis, r = L.run && !L.run.fin ? L.run : null;
    const enCurso = quizState && quizState.mode;
    if(enCurso && quizState.tarea !== t.id){
      const ok = await uiConfirm('Tienes otro test de Legislación a medias.\n\nSi empiezas este, aquel se descarta.', { ok: 'Empezar este', cancel: 'Cancelar', danger: true });
      if(!ok) return;
    }
    cerrarVer();
    // Ya abierto en este dispositivo (y no va más adelantado en otro): se sigue tal cual.
    if(enCurso && quizState.tarea === t.id && (!L.run || (r && (quizState.tareaAt || 0) >= (r.at || 0)))){
      quizState.volver = volver;
      return resumeQuiz();
    }
    if(r){
      const xs = preguntasDe(r);
      if(xs.length){
        const sel = k => xs.map(x => (r[k] || [])[x.i]);
        ACTIVE_QUESTIONS = xs.map(x => x.q);
        const viewMode = QUIZ_LIST_MODES.includes(L.modo) ? 'list' : 'card';
        const answers = sel('answers').map(a => a == null ? null : a);
        const k = xs.findIndex(x => x.i >= (r.index || 0));
        quizState = { mode: L.modo, viewMode, index: k < 0 ? xs.length - 1 : k, answered: false,
          answers, blanked: sel('blanked').map(Boolean), visited: sel('visited').map(Boolean),
          startedAt: Date.now() - (r.seg || 0) * 1000, timeMinutes: null, tarea: t.id, tareaAt: r.at || 0, volver };
        quizSecondsLeft = null;
        saveQuizProgress();
        return resumeQuiz();
      }
    }
    let qs = preguntasLegis(L);
    if(!qs.length) return uiToast('No hay preguntas de ' + (L.temas.length > 1 ? 'esas leyes' : 'esa ley') + (nTitulos(L) || fuenteLegis(L) !== 'todas' ? ' con lo que elegiste' : '') + ' todavía', 'error');
    if(L.cuantas) qs = shuffleArray(qs).slice(0, L.cuantas);
    startQuiz(L.modo, qs, null);
    quizState.tarea = t.id; quizState.volver = volver;
    saveQuizProgress();
  }
  // Lo llama saveQuizProgress (js/datos.js) con cada paso del test.
  function avanceTestLegis(id){
    const t = tareas.find(x => x.id === id);
    if(!t || !t.legis || !quizState || quizState.tarea !== id) return;
    const n = ACTIVE_QUESTIONS.length, bl = quizState.blanked || [];
    const hechas = quizState.answers.filter((a, i) => a != null || (quizState.viewMode === 'card' && bl[i])).length;
    const at = Date.now();
    quizState.tareaAt = at;
    t.legis = Object.assign({}, t.legis, { run: { ids: ACTIVE_QUESTIONS.map(q => q.id), ord: ACTIVE_QUESTIONS.map(q => q._optionOrder || null),
      answers: quizState.answers.slice(), blanked: bl.slice(), visited: (quizState.visited || []).slice(), index: quizState.index,
      hechas, total: n, at, seg: Math.round((at - (quizState.startedAt || at)) / 1000) } });
    guardarCache();
    clearTimeout(avanceTestLegis.t);
    avanceTestLegis.t = setTimeout(() => sb.from('calendario_tareas').update({ legis: t.legis, updated_at: new Date().toISOString() }).eq('id', id)
      .then(({ error }) => { if(error) console.warn('No se pudo guardar el avance del test', error); }), 800);
  }
  // Lo llama finishQuizInner (js/examen-revision.js) al finalizar el test.
  function terminarTestLegis(id, nota){
    const t = tareas.find(x => x.id === id);
    if(!t || !t.legis) return;
    clearTimeout(avanceTestLegis.t);
    const r = t.legis.run || {};
    t.legis = Object.assign({}, t.legis, { run: { fin: true, nota, total: r.total || ACTIVE_QUESTIONS.length, hechas: r.hechas || 0, at: Date.now() } });
    const marca = todoTerminado(t) && !t.hecho;
    if(marca){ t.hecho = true; uiToast(avanceTotal(t).tests > 1 ? 'Todos los tests terminados: tarea hecha' : 'Test terminado: tarea hecha', 'success'); }
    else if(avanceTotal(t).tests > 1) avisarQuedan(t);
    guardarCache();
    sb.from('calendario_tareas').update(Object.assign({ legis: t.legis, updated_at: new Date().toISOString() }, marca ? { hecho: true } : {})).eq('id', id)
      .then(({ error }) => { if(error) console.warn('No se pudo guardar el test terminado', error); });
  }

  /* ---------- Simulacro conjunto en una tarea ----------
     t.simulacro = { fin, nota }. Ese día sale con «Hacer»: abre el Simulacro
     conjunto de siempre (js/pruebas.js), donde se eligen las preguntas y el
     tiempo. Al terminarlo, pruebas.js avisa (terminarSimulacro) y la tarea
     queda hecha. Qué tarea lo abrió se guarda en el dispositivo, así vale
     también si se deja a medias y se sigue después. */
  const SIMC_TAREA = 'pj_cal_simc';
  const conSimc = () => typeof PRU !== 'undefined' && PRU.conjuntoDisponible();
  const avanceSimc = t => ({ hechas: t.simulacro && t.simulacro.fin ? 1 : 0, total: 1 });
  function filaSimc(t, solo){
    const S = t.simulacro || {}, fin = !!S.fin;
    const nota = fin && S.nota != null ? ' · nota ' + String(Math.round(S.nota * 100) / 100).replace('.', ',') : '';
    return '<' + (fin ? 'div' : 'button type="button"') + ' class="cal-test cal-test-simc' + (solo ? '' : ' en-lista') + (fin ? ' acabado' : '') + '"' + (fin ? '' : ' data-cal="simc" data-id="' + t.id + '"') + '>' +
      '<span class="cal-test-cab"><span class="cal-test-t"><b>Simulacro conjunto</b> · Legislación y Específico</span><span class="cal-test-accion">' + (fin ? 'Completado ✓' : 'Hacer ›') + '</span></span>' +
      '<span class="cal-test-n">' + (fin ? 'Terminado' + nota : 'Eliges las preguntas y el tiempo al empezar') + '</span>' +
      '</' + (fin ? 'div' : 'button') + '>';
  }
  function hacerSimc(t){
    if(!conSimc() || !t || !t.simulacro) return;
    if(t.simulacro.fin){ uiToast('Este simulacro ya está hecho', 'info'); return; }
    try{ localStorage.setItem(SIMC_TAREA, t.id); }catch(e){}
    cerrarVer();
    PRU.abrirConfig('conjunto');
  }
  // Lo llama js/pruebas.js al terminar un Simulacro conjunto.
  function terminarSimulacro(nota){
    let id = null;
    try{ id = localStorage.getItem(SIMC_TAREA); localStorage.removeItem(SIMC_TAREA); }catch(e){}
    const t = id && tareas.find(x => x.id === id);
    if(!t || !t.simulacro) return;
    t.simulacro = { fin: true, nota: nota == null ? null : Number(nota) };
    const marca = todoTerminado(t) && !t.hecho;
    if(marca){ t.hecho = true; uiToast('Simulacro hecho: tarea completada', 'success'); }
    enviar(sb.from('calendario_tareas').update(Object.assign({ simulacro: t.simulacro, updated_at: new Date().toISOString() }, marca ? { hecho: true } : {})).eq('id', t.id), 'No se pudo guardar el simulacro');
  }

  /* ---------- ventanita de una tarea (desde fuera del calendario) ---------- */
  function cerrarVer(){ const v = document.getElementById('calVer'); if(v) v.remove(); document.removeEventListener('keydown', teclaVer, true); }
  function teclaVer(e){ if(e.key === 'Escape'){ e.stopPropagation(); cerrarVer(); } }
  function verTarea(id){
    const t = tareas.find(x => x.id === id);
    if(!t) return;
    cerrarVer();
    const c = CAT[t.categoria];
    const bg = document.createElement('div');
    bg.className = 'cal-hoja-bg'; bg.id = 'calVer';
    const pinta = () => {
      const tests = conTareaTest(t);
      bg.innerHTML = '<div class="cal-hoja cal-ver' + (t.hecho ? ' hecha' : '') + '" style="--c:' + c.c + '" role="dialog" aria-modal="true" aria-label="' + esc(t.titulo) + '">' +
        '<div class="cal-hoja-top"><div class="cal-hoja-asa"></div>' +
          '<div class="cal-hoja-cab"><span class="cal-hoja-ico">' + ICONO[t.categoria] + '</span><div class="cal-hoja-tit"><h3>' + esc(t.titulo) + '</h3>' +
            '<div class="cal-hoja-sub">' + esc(c.n) + ' · ' + esc(nombreDia(t.fecha)) + (t.hecho ? ' · Hecha' : '') + '</div></div>' +
          '<button type="button" class="cal-x" data-v="cerrar" aria-label="Cerrar">✕</button></div></div>' +
        '<div class="cal-hoja-cuerpo">' +
          (t.nota ? '<div class="cal-ver-nota">' + esc(t.nota) + '</div>' : '') +
          (tests ? '<div class="cal-ver-tests">' + bloqueTest(t) + '</div>'
            : IR[t.categoria] ? '<button type="button" class="cal-ver-ir" data-v="ir">Ir a ' + esc(c.n) + ' ›</button>' : '') +
          (!t.nota && !tests && !IR[t.categoria] ? '<div class="cal-ver-nota vacia">Sin más detalles.</div>' : '') +
        '</div>' +
        '<div class="cal-hoja-pie"><button type="button" class="cal-btn" data-v="editar">Editar</button>' +
          (t.hecho ? '' : '<button type="button" class="cal-btn" data-v="siguiente">Al día siguiente</button>') +
          '<button type="button" class="cal-btn primario" data-v="hecho">' + (t.hecho ? 'Desmarcar' : 'Marcar como hecha') + '</button></div></div>';
    };
    pinta();
    document.body.appendChild(bg);
    bg.addEventListener('click', e => {
      if(e.target === bg) return cerrarVer();
      const b = e.target.closest('[data-v],[data-cal="test"],[data-cal="legis"],[data-cal="simc"]');
      if(!b) return;
      if(b.dataset.cal === 'test') return hacerTest(t, b.dataset.test);
      if(b.dataset.cal === 'legis') return hacerLegis(t);
      if(b.dataset.cal === 'simc') return hacerSimc(t);
      switch(b.dataset.v){
        case 'cerrar': cerrarVer(); break;
        case 'hecho': marcar(t); pinta(); break;
        case 'editar': cerrarVer(); abrirHoja(t); break;
        case 'siguiente': cerrarVer(); moverUna(t, masDias(t.fecha, 1)); break;
        case 'ir': cerrarVer(); showScreen(IR[t.categoria]); break;
      }
    });
    document.addEventListener('keydown', teclaVer, true);
    requestAnimationFrame(() => bg.classList.add('on'));
  }
  function tarjeta(t, conFecha){
    const c = CAT[t.categoria];
    const abierta = !conFecha && opcionesDe === t.id;
    return '<div class="cal-tarea' + (t.hecho ? ' hecha' : '') + (conTareaTest(t) ? ' con-test' : '') + (abierta ? ' con-opciones' : '') + '" style="--c:' + c.c + '"' + (conFecha ? '' : ' draggable="true" data-arrastra="' + t.id + '"') + '>' +
      '<button class="cal-check" data-cal="hecho" data-id="' + t.id + '" aria-label="' + (t.hecho ? 'Desmarcar' : 'Marcar como hecha') + '">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5 10 17l9-10"/></svg></button>' +
      '<button class="cal-tarea-main" data-cal="editar" data-id="' + t.id + '">' +
        '<span class="cal-tarea-t">' + esc(t.titulo) + '</span>' +
        '<span class="cal-tarea-meta"><i class="cal-punto"></i><span class="cal-cat">' + esc(c.n) + '</span>' + (conFecha ? '<span class="cal-tarea-f">' + esc(nombreDia(t.fecha, true)) + '</span>' : '') + (t.serie ? '<span class="cal-rep" title="Se repite">↻ se repite</span>' : '') + '</span>' +
        (t.nota ? '<span class="cal-tarea-n">' + esc(t.nota) + '</span>' : '') +
      '</button>' +
      (conFecha ? '<button class="cal-mini" data-cal="a-hoy" data-id="' + t.id + '">A hoy</button>'
        : (IR[t.categoria] && !t.hecho && !conTareaTest(t) ? '<button class="cal-ir" data-cal="ir" data-k="' + t.categoria + '" aria-label="Ir a ' + esc(c.n) + '">›</button>' : '') +
          '<button class="cal-ir cal-mas' + (abierta ? ' on' : '') + '" data-cal="opciones" data-id="' + t.id + '" aria-label="Mover o editar" aria-expanded="' + abierta + '">⋯</button>') +
      (abierta ? opcionesTarea(t) : '') +
      bloqueTest(t) +
      '</div>';
  }
  /* ---------- mover tareas rápido ----------
     Todo con un toque y con «Deshacer»: el día entero (lo pendiente a otro día,
     o todo el plan desde ese día unos días más tarde), una tarea suelta (⋯) o,
     en ordenador, arrastrándola a otro día del mes. */
  const FLECHA_D = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m13 6 6 6-6 6"/></svg>';
  function menuMover(){
    const pend = delDia(elegido).filter(t => !t.hecho).length;
    const desde = tareas.filter(t => t.fecha > elegido || (t.fecha === elegido && !t.hecho)).length;
    const op = (attrs, t, sub, on) => '<button class="cal-mover-op"' + (on ? '' : ' disabled') + ' ' + attrs + '><b>' + t + '</b><span>' + sub + '</span></button>';
    return '<div class="cal-mover-menu">' +
      op('data-cal="pend-sig"', 'Lo pendiente, al día siguiente', pend ? (pend === 1 ? 'Pasa 1 tarea ' : 'Pasan ' + pend + ' tareas ') + esc(aDia(masDias(elegido, 1))) : 'No queda nada pendiente', pend) +
      '<div class="cal-mover-todo"><b>Retrasar todo desde este día</b><span>' + (desde ? desde + (desde === 1 ? ' tarea se mueve' : ' tareas se mueven') + '; lo ya hecho de este día se queda' : 'No hay tareas que mover') + '</span>' +
        '<div class="cal-mover-chips">' + [[1, '1 día'], [2, '2 días'], [7, '1 semana']].map(([n, txt]) => '<button class="cal-chip" data-cal="todo-mas" data-n="' + n + '"' + (desde ? '' : ' disabled') + '>+ ' + txt + '</button>').join('') + '</div></div>' +
    '</div>';
  }
  function opcionesTarea(t){
    return '<div class="cal-opciones">' +
      [[1, 'Día siguiente'], [2, '+2 días'], [7, '+1 semana']].map(([n, txt]) => '<button class="cal-chip" data-cal="mover" data-id="' + t.id + '" data-n="' + n + '">' + txt + '</button>').join('') +
      '<label class="cal-chip cal-chip-fecha">' + CALEND + ' Elegir día<input type="date" data-mover-fecha="' + t.id + '" value="' + t.fecha + '"></label>' +
      '<button class="cal-chip" data-cal="editar" data-id="' + t.id + '">' + LAPIZ + ' Editar</button></div>';
  }
  // Mueve las tareas (cambio = { tarea: fecha nueva }) y avisa con «Deshacer».
  function moverA(lista, nuevaFecha, msg){
    if(!lista.length){ uiToast('No hay nada que mover', 'info'); return; }
    const antes = lista.map(t => [t, t.fecha]);
    lista.forEach(t => { t.fecha = nuevaFecha(t); });
    menuDia = false; opcionesDe = null;
    ordenar();
    guardarFechas(lista);
    uiToast(msg, 'success', { action: 'Deshacer', duration: 7000, onAction: () => {
      antes.forEach(([t, f]) => { t.fecha = f; });
      ordenar(); guardarFechas(lista);
    } });
  }
  // Una consulta por fecha de destino (no una por tarea).
  function guardarFechas(lista){
    const porFecha = new Map();
    lista.forEach(t => { if(!porFecha.has(t.fecha)) porFecha.set(t.fecha, []); porFecha.get(t.fecha).push(t.id); });
    const ops = [...porFecha].map(([f, ids]) => sb.from('calendario_tareas').update({ fecha: f, updated_at: new Date().toISOString() }).in('id', ids));
    return enviar(Promise.all(ops).then(rs => rs.find(r => r.error) || {}), 'No se pudo mover');
  }
  const cuantas = n => n === 1 ? '1 tarea' : n + ' tareas';
  // «a mañana» / «al jueves 15 de octubre»
  function aDia(f){ const n = nombreDia(f, true); return /^(Hoy|Mañana|Ayer)$/.test(n) ? 'a ' + n.toLowerCase() : 'al ' + n.toLowerCase(); }
  function moverUna(t, f){
    if(!t || !f || f === t.fecha) return;
    moverA([t], () => f, '«' + t.titulo + '» pasa ' + aDia(f));
  }

  function dia(){
    const lista = delDia(elegido), hechas = lista.filter(t => t.hecho).length;
    const frase = FRASES[deIso(elegido).getDate() % FRASES.length];
    return '<div class="cal-dia-cab"><div><h2>' + esc(nombreDia(elegido)) + '</h2>' +
        '<div class="cal-dia-sub">' + (lista.length ? hechas + ' de ' + lista.length + ' hechas' : 'Sin tareas') + '</div></div>' +
        '<div class="cal-dia-btns">' + (lista.length || tareas.some(t => t.fecha > elegido) ? '<button class="cal-mover' + (menuDia ? ' on' : '') + '" data-cal="menu-dia" aria-expanded="' + menuDia + '">' + FLECHA_D + ' Mover</button>' : '') +
        '<button class="cal-anadir" data-cal="nueva"><span>+</span> Añadir</button></div></div>' +
      (menuDia ? menuMover() : '') +
      (lista.length ? '<div class="cal-lista">' + lista.map(t => tarjeta(t)).join('') + '</div>'
        : '<button class="cal-vacio" data-cal="nueva"><span>' + frase + '</span><b>Añadir tarea</b></button>');
  }
  // El examen: cuántos días quedan; abre sus ajustes (fecha, formato y Simulacro oficial).
  function bloqueExamen(){
    if(typeof EXA === 'undefined') return '';
    const a = EXA.ajustes(), d = a.fecha ? EXA.diasHasta(a.fecha) : null;
    const cifra = d == null ? '<span class="cal-big apagado">—</span>' : d >= 0 ? '<span class="cal-big">' + d + '<small>' + (d === 1 ? ' día' : ' días') + '</small></span>' : '<span class="cal-big apagado">✓</span>';
    const sub = d == null ? 'Sin fecha · Ponerla ›' : d >= 0 ? EXA.fechaLarga(a.fecha) : 'Ya pasó · Poner otra ›';
    return '<button type="button" class="cal-tile cal-tile-btn cal-a-exa" data-cal="examen"><span class="cal-tile-t">Examen</span>' + cifra + '<span class="cal-tile-sub">' + esc(sub) + '</span></button>';
  }
  function bloqueAtras(){
    const n = atrasadas().length;
    return '<div class="cal-tile cal-a-atr"><span class="cal-tile-t">Atrasadas</span><span class="cal-big' + (n ? ' aviso' : '') + '">' + n + '</span>' +
      (n ? '<button type="button" class="cal-tile-sub cal-tile-link" data-cal="todas-a-hoy">Pasar todas a hoy ›</button>' : '<span class="cal-tile-sub">Todo al día</span>') + '</div>';
  }
  function bloqueAtrasadas(){
    const at = atrasadas();
    if(!at.length) return '';
    return '<details class="cal-atras"' + (at.length <= 3 ? ' open' : '') + '><summary><span class="cal-atras-n">' + at.length + '</span> ' +
        (at.length === 1 ? 'Tarea atrasada' : 'Tareas atrasadas') + '</summary>' +
      '<div class="cal-lista">' + at.slice(-30).reverse().map(t => tarjeta(t, true)).join('') + '</div></details>';
  }
  function pintar(){
    if(typeof INICIO !== 'undefined') INICIO.pintar();
    const root = document.getElementById('calRoot');
    if(!root || !document.getElementById('screen-calendario').classList.contains('active')) return;
    if(!elegido) elegido = hoy();
    if(!mes){ const d = deIso(elegido); mes = [d.getFullYear(), d.getMonth()]; }
    if(!cargado && !tareas.length && cargando){ root.innerHTML = '<div class="cal-cargando">Cargando tu calendario…</div>'; return; }
    // Panel por bloques: el mes, el día elegido, el examen y lo atrasado.
    root.innerHTML = '<div class="cal-bento"><div class="cal-tile cal-a-mes">' + rejilla() + '</div>' +
      '<div class="cal-tile cal-a-dia">' + dia() + bloqueAtrasadas() + '</div>' + bloqueExamen() + bloqueAtras() + '</div>';
  }

  /* ---------- hoja para añadir o editar ---------- */
  // h: estado de la hoja abierta. En una tarea que se repite (serie), los
  // cambios pueden ir solo a ella o a ella y las siguientes.
  let h = null, ultimaCat = 'normativas';
  const REPS = [['', 'No'], ['1', 'Cada día'], ['lab', 'L a V'], ['7', 'Semanal']];
  function repDeSerie(t){
    const fs = tareas.filter(x => x.serie === t.serie).map(x => x.fecha).sort();
    if(fs.length < 2) return { rep: '', hasta: t.fecha };
    const salto = fs.slice(1).map((f, k) => Math.round((deIso(f) - deIso(fs[k])) / 864e5));
    const rep = salto.every(x => x === 7) ? '7' : salto.every(x => x === 1) ? '1' : 'lab';
    return { rep, hasta: fs[fs.length - 1] };
  }
  function siguientes(t){ return t.serie ? tareas.filter(x => x.serie === t.serie && x.fecha > t.fecha) : []; }

  function abrirHoja(t, cat){
    cerrarHoja();
    const nueva = !t;
    const base = t || { titulo: '', nota: '', categoria: cat || ultimaCat, fecha: elegido };
    const serie = t && t.serie ? repDeSerie(t) : null;
    h = { t, cat: base.categoria, fecha: base.fecha, rep: serie ? serie.rep : '', hasta: serie ? serie.hasta : masDias(base.fecha, 27),
          alcance: 'una', repIni: serie ? serie.rep : '', hastaIni: serie ? serie.hasta : null,
          tests: t ? [...(t.test_ids || [])] : [], eligiendo: false, temaTest: '',
          legis: t && t.legis ? copiaLegis(t.legis) : null, simc: !!(t && t.simulacro), examen: copiaExamen(t && t.examen) };
    if(conTests()) ESP.cargarTests();
    const bg = document.createElement('div');
    bg.className = 'cal-hoja-bg';
    bg.id = 'calHoja';
    bg.innerHTML = '<form class="cal-hoja" autocomplete="off" novalidate>' +
      '<div class="cal-hoja-top"><div class="cal-hoja-asa"></div>' +
        '<div class="cal-hoja-cab"><span class="cal-hoja-ico" data-ico></span><div class="cal-hoja-tit"><h3>' + (nueva ? (base.categoria === 'examen' ? 'Nuevo examen' : 'Nueva tarea') : 'Editar tarea') + '</h3><div class="cal-hoja-sub" data-sub></div></div>' +
        '<button type="button" class="cal-x" data-h="cerrar" aria-label="Cerrar">✕</button></div></div>' +
      '<div class="cal-hoja-cuerpo">' +
        '<input class="cal-titulo" name="titulo" maxlength="200" placeholder="¿Qué toca estudiar?" value="' + esc(base.titulo) + '">' +
        '<div class="cal-campo"><div class="cal-campo-t">Categoría</div><div class="cal-cats">' +
          CATS.map(([k, n, c]) => '<button type="button" class="cal-cat-op" data-cat="' + k + '" style="--c:' + c + '"><span>' + ICONO[k] + '</span>' + n + '</button>').join('') + '</div></div>' +
        '<div class="cal-campo" data-exa-campo><div class="cal-campo-t">Qué entra en el examen</div><div data-exa></div></div>' +
        (conTests() ? '<div class="cal-campo"><div class="cal-campo-t">Test del Específico</div><div data-test-campo></div></div>' : '') +
        (conLegis() ? '<div class="cal-campo"><div class="cal-campo-t">Test de Legislación</div><div data-legis-campo></div></div>' : '') +
        (conSimc() ? '<div class="cal-campo"><div class="cal-campo-t">Simulacro conjunto</div><div data-simc-campo></div></div>' : '') +
        '<div class="cal-campo"><div class="cal-campo-t">Día</div><div class="cal-segs" data-dias></div></div>' +
        '<div class="cal-campo"><div class="cal-campo-t">Nota</div><textarea class="cal-in" name="nota" rows="2" maxlength="1000" placeholder="Páginas, artículos, cuántos tests…">' + esc(base.nota || '') + '</textarea></div>' +
        (t && t.serie && siguientes(t).length ? '<div class="cal-campo"><div class="cal-campo-t">Aplicar los cambios a</div><div class="cal-segs cal-segs-full" data-alcance></div></div>' : '') +
        '<div class="cal-campo" data-rep-campo><div class="cal-campo-t">Repetir</div><div class="cal-segs cal-segs-full" data-rep></div>' +
          '<div class="cal-hasta" data-hasta></div></div>' +
      '</div>' +
      '<div class="cal-hoja-pie">' + (nueva ? '' : '<button type="button" class="cal-btn peligro" data-h="borrar">Borrar</button>') +
        '<button type="submit" class="cal-btn primario cal-guardar">' + (nueva ? 'Añadir tarea' : 'Guardar cambios') + '</button></div></form>';
    document.body.appendChild(bg);
    const f = bg.querySelector('form');
    f.titulo.addEventListener('input', () => { delete f.titulo.dataset.auto; });
    if(nueva && h.cat === 'examen') autoTituloExamen(f);
    pintarHoja(f);
    bg.addEventListener('click', e => {
      if(e.target === bg) return cerrarHoja();
      const b = e.target.closest('button');
      if(!b) return;
      if(b.dataset.cat){ h.cat = b.dataset.cat; ultimaCat = h.cat; if(h.cat === 'examen') autoTituloExamen(f); }
      else if(b.dataset.dia){ h.fecha = b.dataset.dia; }
      else if(b.dataset.rep != null){ h.rep = b.dataset.rep; }
      else if(b.dataset.hastaN){ h.hasta = masDias(h.fecha, +b.dataset.hastaN); }
      else if(b.dataset.alc){ h.alcance = b.dataset.alc; }
      else if(b.dataset.tst === 'elegir'){ h.eligiendo = true; }
      else if(b.dataset.tst === 'listo'){ h.eligiendo = false; }
      else if(b.dataset.tst === 'quitar'){ h.tests = h.tests.filter(x => x !== b.dataset.t); }
      else if(b.dataset.tst === 'uno'){ const k = b.dataset.t; h.tests = h.tests.includes(k) ? h.tests.filter(x => x !== k) : h.tests.concat(k); autoTitulo(f); }
      else if(b.dataset.tst === 'todos'){
        const ids = testsTema(h.temaTest).map(x => x.id), todos = ids.every(x => h.tests.includes(x));
        h.tests = todos ? h.tests.filter(x => !ids.includes(x)) : h.tests.concat(ids.filter(x => !h.tests.includes(x)));
        autoTitulo(f);
      }
      else if(b.dataset.sc === 'anadir'){
        h.simc = true;
        if(!f.titulo.value.trim() || f.titulo.dataset.auto){ f.titulo.value = 'Simulacro conjunto'; f.titulo.dataset.auto = '1'; h.cat = 'test'; }
      }
      else if(b.dataset.sc === 'quitar'){ h.simc = false; }
      else if(b.dataset.lg === 'anadir'){ h.legis = { temas: [], modo: 'estudio', cuantas: 20, fuente: 'todas', titulos: {} }; }
      else if(b.dataset.lg === 'quitar'){ h.legis = null; }
      else if(b.dataset.lg === 'ley'){ const k = b.dataset.t, L = h.legis; L.temas = L.temas.includes(k) ? L.temas.filter(x => x !== k) : L.temas.concat(k); autoTituloLegis(f); }
      else if(b.dataset.lg === 'todas'){ const ids = leyesDe(h.legis).map(x => x.id); h.legis.temas = ids.every(x => h.legis.temas.includes(x)) ? [] : ids; autoTituloLegis(f); }
      else if(b.dataset.lg === 'modo'){ h.legis.modo = b.dataset.m; autoTituloLegis(f); }
      else if(b.dataset.lg === 'cuantas'){ h.legis.cuantas = +b.dataset.n; }
      else if(b.dataset.lg === 'fuente'){
        h.legis.fuente = b.dataset.f;
        // Las leyes elegidas que no tienen preguntas de esa fuente se quitan (ya no salen).
        const ids = leyesDe(h.legis).map(x => x.id);
        h.legis.temas = h.legis.temas.filter(x => ids.includes(x));
        autoTituloLegis(f);
      }
      else if(b.dataset.lg === 'titulo'){
        const L = h.legis, k = b.dataset.t, id = b.dataset.n, ts = (L.titulos = L.titulos || {})[k] = titulosDe(L, k);
        L.titulos[k] = ts.includes(id) ? ts.filter(x => x !== id) : ts.concat(id);
        // Todos marcados es lo mismo que la ley entera.
        if(L.titulos[k].length === gruposDe(k).length) L.titulos[k] = [];
        autoTituloLegis(f);
      }
      else if(b.dataset.ex === 'titulo'){
        const E = h.examen, k = b.dataset.t, id = b.dataset.n, ts = titulosExamen(E, k);
        E.titulos[k] = ts.includes(id) ? ts.filter(x => x !== id) : ts.concat(id);
        // Todos marcados es lo mismo que la ley entera.
        if(!E.titulos[k].length || E.titulos[k].length === gruposDe(k).length) delete E.titulos[k];
        autoTituloExamen(f);
      }
      else if(b.dataset.ex){
        const k = b.dataset.ex, id = b.dataset.t, xs = h.examen[k];
        h.examen[k] = xs.includes(id) ? xs.filter(x => x !== id) : xs.concat(id);
        if(k === 'legis' && !h.examen.legis.includes(id)) delete h.examen.titulos[id];
        autoTituloExamen(f);
      }
      else if(b.dataset.h === 'cerrar') return cerrarHoja();
      else if(b.dataset.h === 'borrar') return borrar(t);
      else return;
      pintarHoja(f);
    });
    bg.addEventListener('change', e => {
      if(e.target.name === 'otroDia' && e.target.value){ h.fecha = e.target.value; pintarHoja(f); }
      if(e.target.name === 'hasta' && e.target.value){ h.hasta = e.target.value; pintarHoja(f); }
      if(e.target.name === 'temaTest'){ h.temaTest = e.target.value; pintarHoja(f); }
    });
    f.addEventListener('submit', e => { e.preventDefault(); guardar(f); });
    document.addEventListener('keydown', teclaHoja, true);
    requestAnimationFrame(() => bg.classList.add('on'));
    if(nueva && matchMedia('(hover: hover)').matches) setTimeout(() => f.titulo.focus(), 60);
  }
  function pintarHoja(f){
    const c = CAT[h.cat], hh = hoy();
    f.style.setProperty('--c', c.c);
    f.querySelector('[data-ico]').innerHTML = ICONO[h.cat];
    f.querySelector('[data-sub]').textContent = c.n + ' · ' + nombreDia(h.fecha);
    const ct = f.querySelector('[data-test-campo]');
    if(ct) ct.innerHTML = campoTest();
    const cl = f.querySelector('[data-legis-campo]');
    if(cl) cl.innerHTML = campoLegis();
    const ce = f.querySelector('[data-exa-campo]');
    ce.classList.toggle('hidden', h.cat !== 'examen');
    if(h.cat === 'examen') ce.querySelector('[data-exa]').innerHTML = campoExamen();
    const cs = f.querySelector('[data-simc-campo]');
    if(cs) cs.innerHTML = h.simc
      ? '<div class="cal-legis"><div class="cal-hasta-res">Ese día te sale con su botón «Hacer»: eliges cuántas preguntas de Legislación y del Específico y el tiempo al empezar. Al terminarlo, la tarea queda hecha.</div>' +
        '<button type="button" class="cal-chip" data-sc="quitar">Quitar el simulacro</button></div>'
      : '<button type="button" class="cal-test-anadir" data-sc="anadir"><span>+</span> Añadir el Simulacro conjunto</button>';
    f.querySelectorAll('.cal-cat-op').forEach(b => b.classList.toggle('on', b.dataset.cat === h.cat));
    const rapidos = [[hh, 'Hoy'], [masDias(hh, 1), 'Mañana'], [masDias(hh, 2), 'Pasado']];
    const otro = !rapidos.some(r => r[0] === h.fecha);
    f.querySelector('[data-dias]').innerHTML = rapidos.map(([d, n]) => '<button type="button" class="cal-seg' + (d === h.fecha ? ' on' : '') + '" data-dia="' + d + '">' + n + '</button>').join('') +
      '<label class="cal-seg cal-seg-fecha' + (otro ? ' on' : '') + '">' + CALEND + ' ' + (otro ? esc(nombreDia(h.fecha, true)) : 'Otro día') + '<input type="date" name="otroDia" value="' + h.fecha + '"></label>';
    const alc = f.querySelector('[data-alcance]');
    if(alc){
      const n = siguientes(h.t).length;
      alc.innerHTML = '<button type="button" class="cal-seg' + (h.alcance === 'una' ? ' on' : '') + '" data-alc="una">Solo esta</button>' +
        '<button type="button" class="cal-seg' + (h.alcance === 'serie' ? ' on' : '') + '" data-alc="serie">Esta y las ' + n + ' siguientes</button>';
    }
    // La repetición se cambia en una tarea suelta o en toda la serie (no en una sola de la serie).
    const verRep = !h.t || !h.t.serie || h.alcance === 'serie' || !alc;
    f.querySelector('[data-rep-campo]').classList.toggle('hidden', !verRep);
    f.querySelector('[data-rep]').innerHTML = REPS.map(([k, n]) => '<button type="button" class="cal-seg' + (k === h.rep ? ' on' : '') + '" data-rep="' + k + '">' + n + '</button>').join('');
    if(h.hasta < h.fecha) h.hasta = masDias(h.fecha, 27);
    const fechas = fechasRepetidas(h.fecha, h.rep, h.hasta);
    f.querySelector('[data-hasta]').innerHTML = h.rep ?
      '<div class="cal-hasta-fila"><span>Hasta</span>' + [[6, '1 semana'], [13, '2 semanas'], [27, '4 semanas']].map(([n, txt]) =>
        '<button type="button" class="cal-chip' + (h.hasta === masDias(h.fecha, n) ? ' on' : '') + '" data-hasta-n="' + n + '">' + txt + '</button>').join('') +
        '<label class="cal-chip cal-chip-fecha">' + CALEND + ' ' + esc(nombreDia(h.hasta, true)) + '<input type="date" name="hasta" value="' + h.hasta + '" min="' + h.fecha + '"></label></div>' +
      '<div class="cal-hasta-res">Se apuntará en <b>' + fechas.length + '</b> ' + (fechas.length === 1 ? 'día' : 'días') + '</div>' : '';
  }
  const testsTema = k => ESP.tests().filter(y => y.tema === k).sort((a, b) => a.orden - b.orden);
  // Sin título aún: el del test (o el del tema, si son varios) y la categoría Específico.
  function autoTitulo(f){
    if(!h.tests.length || (f.titulo.value.trim() && !f.titulo.dataset.auto)) return;
    const xs = h.tests.map(datosTest), tema = ESP.temas().find(x => x.clave === xs[0].tema);
    const mismoTema = xs.every(x => x.tema === xs[0].tema);
    f.titulo.value = xs.length === 1 ? 'Test: ' + xs[0].titulo : mismoTema && tema ? 'Tests: ' + tema.titulo : xs.length + ' tests del Específico';
    f.titulo.dataset.auto = '1';
    h.cat = 'especifico';
  }
  function campoTest(){
    const elegidos = h.tests.map(datosTest);
    const lista = elegidos.length ? '<div class="cal-test-elegidos">' + elegidos.map(x => '<div class="cal-test-elegido"><span class="cal-test-elegido-txt"><b>' + esc(x.titulo) + '</b>' +
        '<span>' + esc((ESP.temas().find(y => y.clave === x.tema) || {}).titulo || '') + '</span></span>' +
        '<button type="button" class="cal-x" data-tst="quitar" data-t="' + x.id + '" aria-label="Quitar ' + esc(x.titulo) + '">✕</button></div>').join('') + '</div>' : '';
    if(!h.eligiendo) return lista + '<button type="button" class="cal-test-anadir" data-tst="elegir"><span>+</span> ' + (elegidos.length ? 'Añadir más tests' : 'Añadir tests para hacer desde aquí') + '</button>';
    const todos = ESP.tests();
    const temas = ESP.temas().map((x, i) => Object.assign({ n: i + 1 }, x)).filter(x => todos.some(y => y.tema === x.clave));
    if(!temas.length) return lista + '<div class="cal-hasta-res">Cargando los tests…</div>';
    const delTema = h.temaTest ? testsTema(h.temaTest) : [];
    const todosDentro = delTema.length && delTema.every(x => h.tests.includes(x.id));
    return lista + '<div class="cal-test-elegir">' +
      '<select class="cal-in" name="temaTest" aria-label="Tema"><option value="">Elige el tema…</option>' +
        temas.map(x => '<option value="' + x.clave + '"' + (x.clave === h.temaTest ? ' selected' : '') + '>' + x.n + '. ' + esc(x.titulo) + '</option>').join('') + '</select>' +
      (h.temaTest ? '<div class="cal-test-opciones">' +
          '<button type="button" class="cal-test-op todos' + (todosDentro ? ' on' : '') + '" data-tst="todos"><span class="cal-test-caja"></span>Todos los tests del tema (' + delTema.length + ')</button>' +
          delTema.map(y => '<button type="button" class="cal-test-op' + (h.tests.includes(y.id) ? ' on' : '') + '" data-tst="uno" data-t="' + y.id + '"><span class="cal-test-caja"></span>' + esc(y.titulo) + '</button>').join('') +
        '</div>' : '') +
      '<button type="button" class="cal-chip" data-tst="listo">Listo</button></div>';
  }
  // Sin título aún (o con el puesto solo): el del test de Legislación y su categoría.
  function autoTituloLegis(f){
    if(!h.legis || !h.legis.temas.length || h.tests.length || (f.titulo.value.trim() && !f.titulo.dataset.auto)) return;
    f.titulo.value = tituloLegis(h.legis);
    f.titulo.dataset.auto = '1';
    h.cat = 'legislacion';
  }
  function campoLegis(){
    if(!h.legis) return '<button type="button" class="cal-test-anadir" data-lg="anadir"><span>+</span> Añadir un test de Legislación</button>';
    const L = h.legis;
    if(!leyes().length) return '<div class="cal-hasta-res">Cargando las leyes…</div>';
    const ls = leyesDe(L), cl = cuentasLeyes(), tb = hayTutorbombero();
    const todas = ls.length > 0 && ls.every(x => L.temas.includes(x.id));
    const f = fuenteLegis(L), n = preguntasLegis(L).length;
    // Lo que tiene cada ley: de la fuente elegida o, con «Todas», de cada una por separado.
    const cuentaLey = (c, f) => { c = c || { pj: 0, tb: 0 }; const n = x => x.toLocaleString('es-ES');
      return f === 'todas' ? n(c.pj) + ' ' + FUENTES_LEGIS.pj + ' · ' + n(c.tb) + ' ' + FUENTES_LEGIS.tb : n(c[f]) + ' preguntas de ' + FUENTES_LEGIS[f]; };
    const seg = (on, attrs, txt) => '<button type="button" class="cal-seg' + (on ? ' on' : '') + '" ' + attrs + '>' + txt + '</button>';
    // Debajo de cada ley elegida, sus títulos (con cuántas preguntas tiene cada uno de la fuente elegida): sin marcar ninguno, la ley entera.
    const titulosLey = k => {
      const gs = gruposDe(k);
      if(!gs.length) return '';
      const cuenta = {}, por = {};
      QUESTIONS_POOL.forEach(q => {
        if(q.topic_id !== k || !q.nodo_id || !deFuente(q, f)) return;
        const g = gs.find(g => nodeIsInSelectedGroups(q.nodo_id, new Set([g.id])));
        if(!g) return;
        cuenta[g.id] = (cuenta[g.id] || 0) + 1;
        const p = por[g.id] = por[g.id] || { pj: 0, tb: 0 };
        p[fuenteDe(q) === 'tb' ? 'tb' : 'pj']++;
      });
      // Con «Todas», cada título dice las de cada fuente por separado.
      const num = id => { const p = por[id] || { pj: 0, tb: 0 }; return tb && f === 'todas' ? p.pj + ' pj · ' + p.tb + ' tb' : String(cuenta[id] || 0); };
      const ts = titulosDe(L, k), vis = gs.filter(g => cuenta[g.id] || ts.includes(g.id));
      if(!vis.length) return '';
      return '<div class="cal-legis-tits"><span class="cal-legis-tits-t">' + (ts.length ? ts.length + ' de ' + gs.length + ' títulos' : 'Toda la ley · o elige títulos:') + '</span>' +
        vis.map(g => '<button type="button" class="cal-chip cal-tit' + (ts.includes(g.id) ? ' on' : '') + '" data-lg="titulo" data-t="' + esc(k) + '" data-n="' + esc(g.id) + '">' +
          esc(g.label.replace(/\s+–\s+.*$/, '')) + ' <small>' + num(g.id) + '</small></button>').join('') + '</div>';
    };
    return '<div class="cal-legis">' +
      (hayTutorbombero() ? '<div class="cal-legis-fila"><span>Preguntas de</span><div class="cal-segs cal-segs-full">' +
        [['todas', 'Todas'], ['pj', FUENTES_LEGIS.pj], ['tb', FUENTES_LEGIS.tb]].map(([k, t]) => seg(f === k, 'data-lg="fuente" data-f="' + k + '"', t)).join('') + '</div></div>' : '') +
      '<div class="cal-test-opciones">' +
        '<button type="button" class="cal-test-op todos' + (todas ? ' on' : '') + '" data-lg="todas"><span class="cal-test-caja"></span>Todas las leyes (' + ls.length + ')</button>' +
        ls.map(x => '<button type="button" class="cal-test-op' + (L.temas.includes(x.id) ? ' on' : '') + '" data-lg="ley" data-t="' + esc(x.id) + '"><span class="cal-test-caja"></span>' +
          '<span class="cal-ley-txt">' + esc(x.name) + (tb ? '<small>' + cuentaLey(cl[x.id], f) + '</small>' : '') + '</span></button>' +
          (L.temas.includes(x.id) ? titulosLey(x.id) : '')).join('') +
      '</div>' +
      '<div class="cal-legis-fila"><span>Modo</span><div class="cal-segs cal-segs-full">' +
        seg(L.modo === 'estudio', 'data-lg="modo" data-m="estudio"', 'Estudio') + seg(L.modo === 'examen', 'data-lg="modo" data-m="examen"', 'Examen') + '</div></div>' +
      '<div class="cal-legis-fila"><span>Preguntas</span><div class="cal-segs cal-segs-full">' +
        LEGIS_CUANTAS.map(([k, txt]) => seg((L.cuantas || 0) === k, 'data-lg="cuantas" data-n="' + k + '"', txt)).join('') + '</div></div>' +
      '<div class="cal-hasta-res">' + (L.temas.length ? (L.modo === 'examen' ? 'Corrección al final' : 'Corrección al momento') + ' · sin reloj · ' + n + ' preguntas' + (nTitulos(L) || f !== 'todas' ? ' con lo elegido' : ' en ' + (L.temas.length === 1 ? 'esa ley' : 'esas leyes'))
        : 'Elige al menos una ley') + '</div>' +
      '<button type="button" class="cal-chip" data-lg="quitar">Quitar el test</button></div>';
  }
  /* ---------- examen: qué leyes (o qué títulos de cada una) y temas entran ----------
     t.examen = { legis: [topic_id], titulos: { topic_id: [nodo] }, esp: [clave del tema] }.
     Una ley sin títulos elegidos entra entera. Con eso, Inicio dice cómo vas
     para el examen más cercano (CAL.proximoExamen). */
  const titulosExamen = (E, ley) => (((E && E.titulos) || {})[ley] || []).filter(id => gruposDe(ley).some(g => g.id === id));
  const copiaExamen = x => {
    const legis = [...((x && x.legis) || [])];
    const titulos = Object.fromEntries(legis.map(k => [k, [...(((x && x.titulos) || {})[k] || [])]]).filter(([, v]) => v.length));
    return { legis, titulos, esp: [...((x && x.esp) || [])] };
  };
  const nombreTitulo = (ley, id) => { const g = gruposDe(ley).find(x => x.id === id); return g ? g.label.replace(/\s+–\s+.*$/, '') : 'Título'; };
  const temasEsp = () => typeof ESP !== 'undefined' && featureEnabled('especifico') ? ESP.temas() : [];
  // «Sistemas de extinción de incendios. Extintores…» → «Sistemas de extinción de incendios»
  const nombreTemaEsp = k => { const x = temasEsp().find(y => y.clave === k); return x ? x.titulo.split('. ')[0] : k; };
  function nombresExamen(E){
    return (E.legis || []).map(k => { const ts = titulosExamen(E, k); return nombreLey(k) + (ts.length ? ' (' + (ts.length === 1 ? nombreTitulo(k, ts[0]) : ts.length + ' títulos') + ')' : ''); })
      .concat((E.esp || []).map(nombreTemaEsp));
  }
  function autoTituloExamen(f){
    if(h.cat !== 'examen' || (f.titulo.value.trim() && !f.titulo.dataset.auto)) return;
    const ns = nombresExamen(h.examen);
    f.titulo.value = !ns.length ? 'Examen' : 'Examen: ' + (ns.length <= 2 ? ns.join(' y ') : ns[0] + ' y ' + (ns.length - 1) + ' más');
    f.titulo.dataset.auto = '1';
  }
  function campoExamen(){
    const E = h.examen, ls = leyes(), ts = temasEsp();
    const op = (k, id, txt, on) => '<button type="button" class="cal-test-op' + (on ? ' on' : '') + '" data-ex="' + k + '" data-t="' + esc(id) + '"><span class="cal-test-caja"></span><span class="cal-ley-txt">' + esc(txt) + '</span></button>';
    if(!ls.length && !ts.length) return '<div class="cal-hasta-res">Cargando las leyes…</div>';
    const n = E.legis.length + E.esp.length;
    // Debajo de cada ley elegida, sus títulos: sin marcar ninguno, entra la ley entera.
    const tits = k => {
      const gs = gruposDe(k);
      if(!gs.length) return '';
      const ts = titulosExamen(E, k);
      return '<div class="cal-legis-tits"><span class="cal-legis-tits-t">' + (ts.length ? 'Entran ' + ts.length + ' de ' + gs.length + ' títulos' : 'Entra toda la ley · o elige títulos:') + '</span>' +
        gs.map(g => '<button type="button" class="cal-chip cal-tit' + (ts.includes(g.id) ? ' on' : '') + '" data-ex="titulo" data-t="' + esc(k) + '" data-n="' + esc(g.id) + '">' + esc(g.label.replace(/\s+–\s+.*$/, '')) + '</button>').join('') + '</div>';
    };
    return '<div class="cal-legis">' +
      (ls.length ? '<div class="cal-exa-grupo">Legislación</div><div class="cal-test-opciones">' + ls.map(x => op('legis', x.id, x.name, E.legis.includes(x.id)) + (E.legis.includes(x.id) ? tits(x.id) : '')).join('') + '</div>' : '') +
      (ts.length ? '<div class="cal-exa-grupo">Específico</div><div class="cal-test-opciones">' + ts.map((x, i) => op('esp', x.clave, (i + 1) + '. ' + x.titulo, E.esp.includes(x.clave))).join('') + '</div>' : '') +
      '<div class="cal-hasta-res">' + (n ? 'Entran ' + n + (n === 1 ? ' tema' : ' temas') + '. En Inicio verás cómo vas en ellos.' : 'Elige lo que entra para ver en Inicio cómo vas para este examen') + '</div></div>';
  }
  function teclaHoja(e){ if(e.key === 'Escape'){ e.stopPropagation(); cerrarHoja(); } }
  function cerrarHoja(){
    const bg = document.getElementById('calHoja');
    document.removeEventListener('keydown', teclaHoja, true);
    if(bg) bg.remove();
  }
  function fechasRepetidas(desde, rep, hasta){
    if(!rep || !hasta || hasta < desde) return [desde];
    const out = [];
    for(let f = desde, i = 0; f <= hasta && i < 366; f = masDias(f, rep === '7' ? 7 : 1), i++){
      const wd = deIso(f).getDay();
      if(rep === 'lab' && (wd === 0 || wd === 6)) continue;
      out.push(f);
    }
    return out.length ? out : [desde];
  }
  const ahora = () => new Date().toISOString();
  const fila = (fecha, d, serie, hecho) => ({ id: crypto.randomUUID(), user_id: yo(), fecha, titulo: d.titulo, nota: d.nota, categoria: d.categoria,
    test_id: d.test_id || null, test_ids: d.test_ids || [], progreso: null, legis: d.legis || null, simulacro: d.simulacro || null, examen: d.examen || null,
    hecho: !!hecho, serie, orden: delDia(fecha).length, created_at: ahora() });
  const sinMeta = r => { const { created_at, ...x } = r; return x; };
  function recortar(p, ids){
    const pt = {};
    Object.entries((p || {}).porTest || {}).forEach(([k, v]) => { if(ids.includes(k)) pt[k] = v; });
    return Object.keys(pt).length ? { porTest: pt } : null;
  }
  // El test de Legislación de una tarea con el de la hoja: si no ha cambiado, sigue con su intento.
  const conRun = (x, cfg) => cfg && mismoLegis(x.legis, cfg) ? Object.assign({}, cfg, { run: x.legis.run || null }) : cfg;
  function irA(fecha){ elegido = fecha; const d = deIso(fecha); mes = [d.getFullYear(), d.getMonth()]; }

  async function guardar(f){
    const titulo = f.titulo.value.trim();
    if(!titulo){ f.titulo.classList.add('mal'); f.titulo.focus(); setTimeout(() => f.titulo.classList.remove('mal'), 600); return; }
    const d = { titulo, nota: f.nota.value.trim() || null, categoria: h.cat };
    if(conTests()){ d.test_ids = [...h.tests]; d.test_id = h.tests[0] || null; }
    if(conLegis()){
      if(h.legis && !h.legis.temas.length){ uiToast('Elige al menos una ley para el test de Legislación', 'error'); return; }
      d.legis = h.legis ? Object.assign(copiaLegis(h.legis), { cuantas: h.legis.cuantas || null, run: null }) : null;
    }
    if(conSimc()) d.simulacro = h.simc ? { fin: false, nota: null } : null;
    d.examen = h.cat === 'examen' ? copiaExamen(h.examen) : null;
    const { t, fecha, rep, hasta } = h;
    const alcance = t && t.serie && siguientes(t).length ? h.alcance : 'serie';
    cerrarHoja();
    irA(fecha);
    if(!t){
      const fechas = fechasRepetidas(fecha, rep, hasta), serie = fechas.length > 1 ? crypto.randomUUID() : null;
      const filas = fechas.map(x => fila(x, d, serie));
      tareas.push(...filas); ordenar();
      if(fechas.length > 1) uiToast('Añadida en ' + fechas.length + ' días', 'success');
      return enviar(sb.from('calendario_tareas').insert(filas.map(sinMeta)), 'No se pudo añadir');
    }
    const ops = [];
    const cambiaRep = rep !== h.repIni || (rep && hasta !== h.hastaIni) || (rep && fecha !== t.fecha);
    if(alcance === 'una' || !cambiaRep){
      // Mismos días: se cambian los datos (y, en la serie, también en las siguientes).
      const delta = Math.round((deIso(fecha) - deIso(t.fecha)) / 864e5);
      const grupo = alcance === 'serie' && t.serie ? [t, ...siguientes(t)] : [t];
      grupo.forEach(x => {
        // De los tests que se quitan, fuera su avance (el de los que siguen se guarda).
        const prog = 'test_ids' in d ? recortar(x.progreso, d.test_ids) : x.progreso;
        const lg = 'legis' in d ? conRun(x, d.legis) : x.legis;
        const sm = 'simulacro' in d ? (d.simulacro ? x.simulacro || d.simulacro : null) : x.simulacro;
        Object.assign(x, d, { progreso: prog, legis: lg, simulacro: sm }); if(delta) x.fecha = masDias(x.fecha, delta);
        ops.push(sb.from('calendario_tareas').update({ ...d, progreso: prog, legis: lg, simulacro: sm, fecha: x.fecha, serie: x.serie, updated_at: ahora() }).eq('id', x.id));
      });
      if(alcance === 'una' && t.serie && rep !== h.repIni) t.serie = null;
    } else {
      // Cambia la repetición: se rehacen las siguientes desde el nuevo día
      // (las que ya estaban hechas en un día que sigue, siguen hechas).
      const viejas = siguientes(t), hechas = new Set(viejas.filter(x => x.hecho).map(x => x.fecha));
      const ids = new Set(viejas.map(x => x.id));
      tareas = tareas.filter(x => !ids.has(x.id));
      const fechas = fechasRepetidas(fecha, rep, hasta), serie = fechas.length > 1 ? (t.serie || crypto.randomUUID()) : null;
      if('test_ids' in d) d.progreso = recortar(t.progreso, d.test_ids);
      const lgT = 'legis' in d ? conRun(t, d.legis) : t.legis;
      if('simulacro' in d && d.simulacro && t.simulacro) d.simulacro = t.simulacro;
      Object.assign(t, d, { fecha, serie, legis: lgT });
      const nuevas = fechas.slice(1).map(x => fila(x, d, serie, hechas.has(x)));
      tareas.push(...nuevas);
      if(ids.size) ops.push(sb.from('calendario_tareas').delete().in('id', [...ids]));
      ops.push(sb.from('calendario_tareas').update({ ...d, legis: lgT, fecha, serie, updated_at: ahora() }).eq('id', t.id));
      if(nuevas.length) ops.push(sb.from('calendario_tareas').insert(nuevas.map(sinMeta)));
      if(nuevas.length || ids.size) uiToast(serie ? 'Ahora se repite en ' + fechas.length + ' días' : 'Ya no se repite', 'success');
    }
    ordenar();
    return enviar(Promise.all(ops).then(rs => rs.find(r => r.error) || {}), 'No se pudo guardar');
  }
  async function borrar(t){
    cerrarHoja();
    let todas = false;
    const sig = siguientes(t).length;
    if(sig) todas = await uiConfirm('¿Borrar también las siguientes?\n\nEsta tarea se repite: hay ' + sig + ' más después de este día.', { ok: 'Borrar todas', cancel: 'Solo esta', danger: true });
    const fuera = todas ? [t, ...siguientes(t)] : [t];
    const ids = new Set(fuera.map(x => x.id));
    tareas = tareas.filter(x => !ids.has(x.id));
    uiToast(fuera.length > 1 ? 'Borradas ' + fuera.length + ' tareas' : 'Tarea borrada', 'success', {
      action: 'Deshacer', onAction: () => { tareas.push(...fuera); ordenar(); enviar(sb.from('calendario_tareas').insert(fuera.map(sinMeta)), 'No se pudo recuperar'); }
    });
    return enviar(sb.from('calendario_tareas').delete().in('id', [...ids]), 'No se pudo borrar');
  }

  /* ---------- acciones ---------- */
  function marcar(t){
    if(!t) return;
    t.hecho = !t.hecho;
    if(t.hecho && t.fecha === hoy() && delDia(t.fecha).every(x => x.hecho)) uiToast('¡Todo hecho por hoy!', 'success');
    enviar(sb.from('calendario_tareas').update({ hecho: t.hecho, updated_at: new Date().toISOString() }).eq('id', t.id), 'No se pudo marcar');
  }
  function onClick(e){
    const el = e.target.closest('[data-cal]');
    if(!el) return;
    const t = el.dataset.id ? tareas.find(x => x.id === el.dataset.id) : null;
    switch(el.dataset.cal){
      case 'dia': {
        menuDia = false; opcionesDe = null;
        irA(el.dataset.f); pintar();
        break;
      }
      case 'mes': { const d = new Date(mes[0], mes[1] + Number(el.dataset.d), 1); mes = [d.getFullYear(), d.getMonth()]; pintar(); break; }
      case 'hoy': { elegido = hoy(); const d = deIso(elegido); mes = [d.getFullYear(), d.getMonth()]; pintar(); break; }
      case 'nueva': abrirHoja(); break;
      case 'editar': if(t) abrirHoja(t); break;
      case 'menu-dia': menuDia = !menuDia; opcionesDe = null; pintar(); break;
      case 'opciones': opcionesDe = opcionesDe === el.dataset.id ? null : el.dataset.id; menuDia = false; pintar(); break;
      case 'mover': if(t) moverUna(t, masDias(t.fecha, Number(el.dataset.n))); break;
      case 'pend-sig': {
        const lista = delDia(elegido).filter(x => !x.hecho), sig = masDias(elegido, 1);
        moverA(lista, () => sig, cuantas(lista.length) + ' ' + aDia(sig));
        break;
      }
      case 'todo-mas': {
        const n = Number(el.dataset.n), lista = tareas.filter(x => x.fecha > elegido || (x.fecha === elegido && !x.hecho));
        moverA(lista, x => masDias(x.fecha, n), cuantas(lista.length) + ' retrasadas ' + (n === 7 ? '1 semana' : n === 1 ? '1 día' : n + ' días'));
        break;
      }
      case 'hecho': marcar(t); break;
      case 'a-hoy': if(t){ t.fecha = hoy(); ordenar(); enviar(sb.from('calendario_tareas').update({ fecha: t.fecha, updated_at: new Date().toISOString() }).eq('id', t.id), 'No se pudo mover'); } break;
      case 'todas-a-hoy': {
        e.preventDefault();
        const at = atrasadas(), h = hoy();
        at.forEach(x => { x.fecha = h; });
        ordenar(); elegido = h;
        enviar(sb.from('calendario_tareas').update({ fecha: h, updated_at: new Date().toISOString() }).in('id', at.map(x => x.id)), 'No se pudieron mover');
        break;
      }
      case 'ir': if(IR[el.dataset.k]) showScreen(IR[el.dataset.k]); break;
      case 'examen': if(typeof EXA !== 'undefined') EXA.abrir(); break;
      case 'test': if(t) hacerTest(t, el.dataset.test); break;
      case 'legis': if(t) hacerLegis(t); break;
      case 'simc': if(t) hacerSimc(t); break;
    }
  }

  function abrir(){
    const root = document.getElementById('calRoot');
    if(root && !root.dataset.listo){
      root.dataset.listo = '1';
      root.addEventListener('click', onClick);
      root.addEventListener('change', e => {
        const id = e.target.dataset && e.target.dataset.moverFecha;
        if(id && e.target.value) moverUna(tareas.find(x => x.id === id), e.target.value);
      });
      // En ordenador: arrastrar una tarea a un día del mes.
      root.addEventListener('dragstart', e => {
        const el = e.target.closest && e.target.closest('[data-arrastra]');
        if(!el) return;
        e.dataTransfer.setData('text/plain', el.dataset.arrastra);
        e.dataTransfer.effectAllowed = 'move';
        root.classList.add('arrastrando');
      });
      root.addEventListener('dragend', () => { root.classList.remove('arrastrando'); root.querySelectorAll('.cal-dia.soltar').forEach(x => x.classList.remove('soltar')); });
      root.addEventListener('dragover', e => {
        const d = e.target.closest && e.target.closest('.cal-dia[data-f]');
        if(!d) return;
        e.preventDefault();
        root.querySelectorAll('.cal-dia.soltar').forEach(x => { if(x !== d) x.classList.remove('soltar'); });
        d.classList.add('soltar');
      });
      root.addEventListener('drop', e => {
        const d = e.target.closest && e.target.closest('.cal-dia[data-f]');
        if(!d) return;
        e.preventDefault();
        root.classList.remove('arrastrando');
        moverUna(tareas.find(x => x.id === e.dataTransfer.getData('text/plain')), d.dataset.f);
      });
    }
    // Al volver a la pestaña otro día, se parte de hoy.
    if(abrir.dia !== hoy()){ abrir.dia = hoy(); elegido = hoy(); mes = null; }
    if(dueño !== yo()){ tareas = []; cargado = false; }
    pintar();
    cargar();
  }
  /* ---------- resumen para la pantalla de Inicio ---------- */
  // Carga las tareas si aún no están (sin abrir el calendario).
  function asegurar(){
    if(dueño !== yo()){ tareas = []; cargado = false; }
    if(!cargado && !cargando) cargar();
  }
  // null mientras no hay nada que enseñar (cargando por primera vez).
  function resumenHoy(){
    if(!yo() || dueño !== yo() || (!cargado && !tareas.length && cargando)) return null;
    const h = hoy(), lista = delDia(h);
    return {
      lista: lista.map(t => ({ id: t.id, titulo: t.titulo, nota: t.nota, hecho: t.hecho, cat: CAT[t.categoria].n, color: CAT[t.categoria].c, icono: ICONO[t.categoria],
        test: conTareaTest(t) ? avanceTotal(t) : null, simc: !!t.simulacro })),
      hechas: lista.filter(t => t.hecho).length,
      racha: racha(),
      atrasadas: atrasadas().length,
      manana: delDia(masDias(h, 1)).length
    };
  }
  // La semana de hoy (lunes a domingo) para Inicio: un punto por tarea, y la racha y lo atrasado.
  function semana(){
    if(!yo() || dueño !== yo() || (!cargado && !tareas.length && cargando)) return null;
    const h = hoy(), lunes = masDias(h, -((deIso(h).getDay() + 6) % 7));
    const dias = ['L', 'M', 'X', 'J', 'V', 'S', 'D'].map((letra, i) => {
      const f = masDias(lunes, i);
      return { f, letra, n: deIso(f).getDate(), nombre: nombreDia(f), hoy: f === h, pasado: f < h,
        examen: delDia(f).some(t => t.categoria === 'examen'),
        puntos: delDia(f).map(t => ({ c: CAT[t.categoria].c, h: t.hecho })) };
    });
    return { dias, racha: racha(), atrasadas: atrasadas().length };
  }
  // Lo próximo apuntado después de hoy (sin hacer): undefined mientras carga, null si no hay nada.
  function proxima(){
    if(!yo() || dueño !== yo() || (!cargado && !tareas.length && cargando)) return undefined;
    const h = hoy(), t = tareas.find(x => x.fecha > h && !x.hecho);
    if(!t) return null;
    const d = deIso(t.fecha), rel = t.fecha === masDias(h, 1) ? 'Mañana' : null;
    const dia = DIAS[d.getDay()];
    return { f: t.fecha, titulo: t.titulo, color: CAT[t.categoria].c,
      cuando: rel || dia.charAt(0).toUpperCase() + dia.slice(1) + ' ' + d.getDate(),
      mas: delDia(t.fecha).filter(x => !x.hecho).length - 1 };
  }
  // Los exámenes de hoy en adelante para Inicio (como mucho n): qué entra,
  // cuántos días faltan y las tareas de su semana (desde el día después del
  // examen anterior, como mucho 7 días antes). undefined mientras carga.
  function examenes(n){
    if(!yo() || dueño !== yo() || (!cargado && !tareas.length && cargando)) return undefined;
    const h = hoy();
    return tareas.filter(x => x.categoria === 'examen' && x.fecha >= h).slice(0, n || 8).map(datosExamen);
  }
  // El más cercano: undefined mientras carga; null si no hay.
  function proximoExamen(){ const xs = examenes(1); return xs && (xs[0] || null); }
  function datosExamen(t){
    const h = hoy();
    const antes = tareas.filter(x => x.categoria === 'examen' && x.fecha < t.fecha).pop();
    let desde = masDias(t.fecha, -7);
    if(antes && antes.fecha >= desde) desde = masDias(antes.fecha, 1);
    const semana = tareas.filter(x => x.categoria !== 'examen' && x.fecha >= desde && x.fecha < t.fecha);
    const E = copiaExamen(t.examen);
    return { id: t.id, titulo: t.titulo, fecha: t.fecha, dias: Math.round((deIso(t.fecha) - deIso(h)) / 864e5), cuando: nombreDia(t.fecha, true),
      legis: E.legis.flatMap(id => { const ts = titulosExamen(E, id);
        // ley y parte: los nombres completos (la ley como está en el temario y el título con su nombre), para el detalle.
        const ley = (leyes().find(x => x.id === id) || {}).name || nombreLey(id);
        return ts.length ? ts.map(g => ({ id, grupo: g, nombre: nombreLey(id) + ' · ' + nombreTitulo(id, g), ley, parte: (gruposDe(id).find(x => x.id === g) || {}).label || nombreTitulo(id, g) }))
          : [{ id, nombre: nombreLey(id), ley, parte: null }]; }),
      esp: E.esp.map(k => { const i = temasEsp().findIndex(y => y.clave === k), x = temasEsp()[i];
        return { id: k, nombre: nombreTemaEsp(k), completo: x ? x.titulo : k, n: i + 1 }; }),
      semana: { hechas: semana.filter(x => x.hecho).length, total: semana.length } };
  }
  // Desde Inicio: el calendario abierto en ese día.
  function abrirDia(f){ abrir.dia = hoy(); irA(f); showScreen('screen-calendario'); }
  function marcarId(id){ marcar(tareas.find(x => x.id === id)); }
  // Desde Inicio: directo al primer test sin terminar de la tarea.
  function seguirTest(id){
    const t = tareas.find(x => x.id === id);
    if(!t) return;
    const ids = t.test_ids || [], pend = ids.find(x => !terminado(avance(t, x)));
    if(pend) return hacerTest(t, pend);
    if(t.legis && !terminado(avanceLegis(t))) return hacerLegis(t);
    if(t.simulacro && !t.simulacro.fin) return hacerSimc(t);
    uiToast(avanceTotal(t).tests > 1 ? 'Todos los tests de esta tarea están completados' : 'Este test ya está completado', 'info');
  }
  return { avanceTestLegis, terminarTestLegis, terminarSimulacro, barraTramos, abrir, recargar: cargar, asegurar, resumenHoy, semana, proxima, proximoExamen, examenes, abrirDia, pintar, marcar: marcarId, guardarProgreso, verTarea, seguirTest, nueva: () => { elegido = hoy(); mes = null; abrirHoja(); },
    editar: id => { const t = tareas.find(x => x.id === id); if(t) abrirHoja(t); },
    // Desde Inicio: una tarea nueva ya como examen (el sábado que viene, que se puede cambiar).
    nuevoExamen: () => { const h = hoy(), d = deIso(h).getDay(); elegido = masDias(h, d === 6 ? 7 : 6 - d); mes = null; abrirHoja(null, 'examen'); } };
})();
