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
    test: svg('<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="m9 14 2 2 4-4"/>'),
    fisico: svg('<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>'),
    repaso: svg('<path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M8 16H3v5"/>'),
    otro: svg('<circle cx="12" cy="12" r="3.5"/>')
  };
  const LLAMA = ICONO.especifico.replace('cal-ico', 'cal-ico llama');
  const CALEND = svg('<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h18"/>');
  const LAPIZ = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>';
  const CAT = Object.fromEntries(CATS.map(([k, n, c]) => [k, { n, c }]));
  // Desde la tarea se puede saltar a su apartado.
  const IR = { normativas: 'screen-normativas', legislacion: 'screen-home', callejero: 'screen-callejero', especifico: 'screen-especifico', test: 'screen-home' };
  const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const FRASES = ['Día libre. Si te apetece, apunta algo.', 'Nada apuntado para este día.', 'Hueco libre: buen momento para un repaso.'];

  let tareas = [], cargado = false, cargando = null, dueño = null;
  let mes = null, elegido = null;

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
        const { data, error } = await sb.from('calendario_tareas').select('id,fecha,titulo,nota,categoria,hecho,orden,serie,created_at,test_id,test_ids,progreso')
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
  function anillo(hechas, total){
    const r = 34, c = 2 * Math.PI * r, p = total ? hechas / total : 0;
    return '<svg class="cal-anillo" viewBox="0 0 80 80" aria-hidden="true"><defs><linearGradient id="calGrad" x1="0" y1="0" x2="1" y2="1">' +
      '<stop offset="0" stop-color="var(--coral)"/><stop offset="1" stop-color="var(--amber)"/></linearGradient></defs>' +
      '<circle cx="40" cy="40" r="' + r + '" class="cal-anillo-fondo"/>' +
      '<circle cx="40" cy="40" r="' + r + '" class="cal-anillo-barra" stroke-dasharray="' + c.toFixed(1) + '" stroke-dashoffset="' + (c * (1 - p)).toFixed(1) + '"/></svg>' +
      '<div class="cal-anillo-txt">' + (total ? Math.round(p * 100) + '%' : '—') + '</div>';
  }
  function cabecera(){
    const h = hoy(), lista = delDia(h), hechas = lista.filter(t => t.hecho).length, r = racha();
    const proximas = tareas.filter(t => t.fecha > h && t.fecha <= masDias(h, 7) && !t.hecho).length;
    const msg = !lista.length ? 'Hoy no tienes nada apuntado.'
      : hechas === lista.length ? '¡Todo hecho por hoy!'
      : 'Te queda' + (lista.length - hechas === 1 ? ' 1 cosa' : 'n ' + (lista.length - hechas) + ' cosas') + ' por hacer.';
    return '<div class="cal-hero">' +
      '<div class="cal-hero-anillo">' + anillo(hechas, lista.length) + '</div>' +
      '<div class="cal-hero-txt"><div class="cal-hero-fecha">' + esc(nombreDia(h)) + '</div>' +
        '<div class="cal-hero-msg">' + msg + '</div>' +
        '<div class="cal-hero-chips">' +
          '<span class="cal-chip-dato"><b>' + hechas + '/' + lista.length + '</b> hoy</span>' +
          '<span class="cal-chip-dato' + (r ? ' fuego' : '') + '">' + LLAMA + '<b>' + r + '</b> ' + (r === 1 ? 'día' : 'días') + ' de racha</span>' +
          '<span class="cal-chip-dato"><b>' + proximas + '</b> en 7 días</span>' +
        '</div></div></div>';
  }
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
        '<span class="cal-num">' + d + '</span>' + (todo ? '<span class="cal-ok">✓</span>' : '') + '<span class="cal-puntos">' + puntos + '</span></button>';
    }
    const esteMes = (() => { const n = new Date(); return n.getFullYear() === a && n.getMonth() === m; })();
    return '<div class="cal-mes">' +
      '<div class="cal-mes-cab"><button class="cal-flecha" data-cal="mes" data-d="-1" aria-label="Mes anterior">‹</button>' +
        '<div class="cal-mes-nombre">' + MESES[m].charAt(0).toUpperCase() + MESES[m].slice(1) + ' <span>' + a + '</span></div>' +
        '<button class="cal-flecha" data-cal="mes" data-d="1" aria-label="Mes siguiente">›</button>' +
        (esteMes && elegido === h ? '' : '<button class="cal-hoy-btn" data-cal="hoy">Hoy</button>') + '</div>' +
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
    const xs = ids.map(id => avance(t, id));
    // partes: lo hecho de cada test (0 a 1), en su orden, para la barra por tramos.
    return { tests: ids.length, terminados: xs.filter(terminado).length, hechas: xs.reduce((n, a) => n + a.hechas, 0), total: xs.reduce((n, a) => n + a.total, 0),
      partes: xs.map(a => a.total ? Math.min(1, a.hechas / a.total) : 0) };
  }
  function filaTest(t, x, solo){
    const a = avance(t, x.id), pct = a.total ? Math.round(a.hechas / a.total * 100) : 0;
    const accion = terminado(a) ? 'Repasar' : a.hechas ? 'Continuar' : 'Empezar';
    return '<button type="button" class="cal-test' + (solo ? '' : ' en-lista') + (terminado(a) ? ' acabado' : '') + '" data-cal="test" data-id="' + t.id + '" data-test="' + x.id + '">' +
      '<span class="cal-test-cab"><span class="cal-test-t">Test - <b>' + esc(x.titulo) + '</b></span><span class="cal-test-accion">' + accion + ' ›</span></span>' +
      '<span class="cal-test-barra"><i style="width:' + pct + '%"></i></span>' +
      '<span class="cal-test-n">' + (terminado(a) ? 'Terminado · ' + a.total + ' preguntas' : a.hechas ? a.hechas + ' de ' + a.total + ' respondidas · faltan ' + (a.total - a.hechas) : 'Sin empezar') + '</span>' +
      '</button>';
  }
  // Lo que se ve en la tarea: un test, o la lista con cuántos van terminados.
  function bloqueTest(t){
    const xs = testsDe(t);
    if(!xs.length) return '';
    if(xs.length === 1) return filaTest(t, xs[0], true);
    const a = avanceTotal(t);
    return '<div class="cal-tests"><div class="cal-tests-cab"><span>' + xs.length + ' tests</span><span>' + a.terminados + ' de ' + xs.length + ' terminados</span></div>' + barraTramos(a.partes) +
      xs.map(x => filaTest(t, x)).join('') + '</div>';
  }
  // Una barra con un tramo por test: se va llenando test a test, cada uno en su sitio.
  function barraTramos(partes){
    return '<span class="cal-tramos">' + partes.map(x => '<i><b style="width:' + Math.round(x * 100) + '%"></b></i>').join('') + '</span>';
  }
  function hacerTest(t, id){
    if(!conTests()) return;
    id = id || (t.test_ids || [])[0];
    if(!id) return;
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
    pt[testId] = prog;
    t.progreso = { porTest: pt };
    const todo = (t.test_ids || []).length && t.test_ids.every(x => terminado(avance(t, x)));
    const marca = todo && !t.hecho;
    if(marca){ t.hecho = true; uiToast(t.test_ids.length > 1 ? 'Todos los tests terminados: tarea hecha' : 'Test terminado: tarea hecha', 'success'); }
    else if(!antes && terminado(avance(t, testId)) && t.test_ids.length > 1) { const q = t.test_ids.filter(x => !terminado(avance(t, x))).length; uiToast('Test terminado. ' + (q === 1 ? 'Te queda 1 test' : 'Te quedan ' + q + ' tests') + ' de esta tarea', 'info'); }
    guardarCache();
    clearTimeout(guardarProgreso.t);
    const enviarYa = () => sb.from('calendario_tareas').update(Object.assign({ progreso: t.progreso, updated_at: new Date().toISOString() }, t.hecho && marca ? { hecho: true } : {}))
      .eq('id', id).then(({ error }) => { if(error) console.warn('No se pudo guardar el avance del test', error); });
    if(marca) enviarYa(); else guardarProgreso.t = setTimeout(enviarYa, 800);
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
      const tests = testsDe(t);
      bg.innerHTML = '<div class="cal-hoja cal-ver' + (t.hecho ? ' hecha' : '') + '" style="--c:' + c.c + '" role="dialog" aria-modal="true" aria-label="' + esc(t.titulo) + '">' +
        '<div class="cal-hoja-top"><div class="cal-hoja-asa"></div>' +
          '<div class="cal-hoja-cab"><span class="cal-hoja-ico">' + ICONO[t.categoria] + '</span><div class="cal-hoja-tit"><h3>' + esc(t.titulo) + '</h3>' +
            '<div class="cal-hoja-sub">' + esc(c.n) + ' · ' + esc(nombreDia(t.fecha)) + (t.hecho ? ' · Hecha' : '') + '</div></div>' +
          '<button type="button" class="cal-x" data-v="cerrar" aria-label="Cerrar">✕</button></div></div>' +
        '<div class="cal-hoja-cuerpo">' +
          (t.nota ? '<div class="cal-ver-nota">' + esc(t.nota) + '</div>' : '') +
          (tests.length ? '<div class="cal-ver-tests">' + bloqueTest(t) + '</div>'
            : IR[t.categoria] ? '<button type="button" class="cal-ver-ir" data-v="ir">Ir a ' + esc(c.n) + ' ›</button>' : '') +
          (!t.nota && !tests.length && !IR[t.categoria] ? '<div class="cal-ver-nota vacia">Sin más detalles.</div>' : '') +
        '</div>' +
        '<div class="cal-hoja-pie"><button type="button" class="cal-btn" data-v="editar">Editar</button>' +
          '<button type="button" class="cal-btn primario" data-v="hecho">' + (t.hecho ? 'Desmarcar' : 'Marcar como hecha') + '</button></div></div>';
    };
    pinta();
    document.body.appendChild(bg);
    bg.addEventListener('click', e => {
      if(e.target === bg) return cerrarVer();
      const b = e.target.closest('[data-v],[data-cal="test"]');
      if(!b) return;
      if(b.dataset.cal === 'test') return hacerTest(t, b.dataset.test);
      switch(b.dataset.v){
        case 'cerrar': cerrarVer(); break;
        case 'hecho': marcar(t); pinta(); break;
        case 'editar': cerrarVer(); abrirHoja(t); break;
        case 'ir': cerrarVer(); showScreen(IR[t.categoria]); break;
      }
    });
    document.addEventListener('keydown', teclaVer, true);
    requestAnimationFrame(() => bg.classList.add('on'));
  }
  function tarjeta(t, conFecha){
    const c = CAT[t.categoria];
    return '<div class="cal-tarea' + (t.hecho ? ' hecha' : '') + (testsDe(t).length ? ' con-test' : '') + '" style="--c:' + c.c + '">' +
      '<button class="cal-check" data-cal="hecho" data-id="' + t.id + '" aria-label="' + (t.hecho ? 'Desmarcar' : 'Marcar como hecha') + '">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5 10 17l9-10"/></svg></button>' +
      '<button class="cal-tarea-main" data-cal="editar" data-id="' + t.id + '">' +
        '<span class="cal-tarea-t">' + esc(t.titulo) + '</span>' +
        (t.nota ? '<span class="cal-tarea-n">' + esc(t.nota) + '</span>' : '') +
        '<span class="cal-tarea-meta"><span class="cal-cat">' + esc(c.n) + '</span>' + (conFecha ? '<span class="cal-tarea-f">' + esc(nombreDia(t.fecha, true)) + '</span>' : '') + (t.serie ? '<span class="cal-rep" title="Se repite">↻</span>' : '') + '</span>' +
      '</button>' +
      (conFecha ? '<button class="cal-mini" data-cal="a-hoy" data-id="' + t.id + '">A hoy</button>'
        : (IR[t.categoria] && !t.hecho && !testsDe(t).length ? '<button class="cal-ir" data-cal="ir" data-k="' + t.categoria + '" aria-label="Ir a ' + esc(c.n) + '">›</button>' : '') +
          '<button class="cal-ir cal-lapiz" data-cal="editar" data-id="' + t.id + '" aria-label="Editar">' + LAPIZ + '</button>') +
      bloqueTest(t) +
      '</div>';
  }
  function dia(){
    const lista = delDia(elegido), hechas = lista.filter(t => t.hecho).length;
    const frase = FRASES[deIso(elegido).getDate() % FRASES.length];
    return '<div class="cal-dia-cab"><div><h2>' + esc(nombreDia(elegido)) + '</h2>' +
        '<div class="cal-dia-sub">' + (lista.length ? hechas + ' de ' + lista.length + ' hechas' : 'Sin tareas') + '</div></div>' +
        '<button class="cal-anadir" data-cal="nueva"><span>+</span> Añadir</button></div>' +
      (lista.length ? '<div class="cal-lista">' + lista.map(t => tarjeta(t)).join('') + '</div>'
        : '<button class="cal-vacio" data-cal="nueva"><span class="cal-vacio-ico">' + CALEND + '</span><span>' + frase + '</span><b>Toca para añadir</b></button>');
  }
  function bloqueAtrasadas(){
    const at = atrasadas();
    if(!at.length) return '';
    return '<details class="cal-atras"' + (at.length <= 3 ? ' open' : '') + '><summary><span class="cal-atras-n">' + at.length + '</span> ' +
        (at.length === 1 ? 'Tarea atrasada' : 'Tareas atrasadas') + '<button class="cal-mini" data-cal="todas-a-hoy">Pasar todas a hoy</button></summary>' +
      '<div class="cal-lista">' + at.slice(-30).reverse().map(t => tarjeta(t, true)).join('') + '</div></details>';
  }
  function pintar(){
    if(typeof INICIO !== 'undefined') INICIO.pintar();
    const root = document.getElementById('calRoot');
    if(!root || !document.getElementById('screen-calendario').classList.contains('active')) return;
    if(!elegido) elegido = hoy();
    if(!mes){ const d = deIso(elegido); mes = [d.getFullYear(), d.getMonth()]; }
    if(!cargado && !tareas.length && cargando){ root.innerHTML = '<div class="cal-cargando">Cargando tu calendario…</div>'; return; }
    root.innerHTML = cabecera() + '<div class="cal-cuerpo"><div class="cal-col">' + rejilla() + '</div><div class="cal-col">' + dia() + bloqueAtrasadas() + '</div></div>';
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

  function abrirHoja(t){
    cerrarHoja();
    const nueva = !t;
    const base = t || { titulo: '', nota: '', categoria: ultimaCat, fecha: elegido };
    const serie = t && t.serie ? repDeSerie(t) : null;
    h = { t, cat: base.categoria, fecha: base.fecha, rep: serie ? serie.rep : '', hasta: serie ? serie.hasta : masDias(base.fecha, 27),
          alcance: 'una', repIni: serie ? serie.rep : '', hastaIni: serie ? serie.hasta : null,
          tests: t ? [...(t.test_ids || [])] : [], eligiendo: false, temaTest: '' };
    if(conTests()) ESP.cargarTests();
    const bg = document.createElement('div');
    bg.className = 'cal-hoja-bg';
    bg.id = 'calHoja';
    bg.innerHTML = '<form class="cal-hoja" autocomplete="off" novalidate>' +
      '<div class="cal-hoja-top"><div class="cal-hoja-asa"></div>' +
        '<div class="cal-hoja-cab"><span class="cal-hoja-ico" data-ico></span><div class="cal-hoja-tit"><h3>' + (nueva ? 'Nueva tarea' : 'Editar tarea') + '</h3><div class="cal-hoja-sub" data-sub></div></div>' +
        '<button type="button" class="cal-x" data-h="cerrar" aria-label="Cerrar">✕</button></div></div>' +
      '<div class="cal-hoja-cuerpo">' +
        '<input class="cal-titulo" name="titulo" maxlength="200" placeholder="¿Qué toca estudiar?" value="' + esc(base.titulo) + '">' +
        '<div class="cal-campo"><div class="cal-campo-t">Categoría</div><div class="cal-cats">' +
          CATS.map(([k, n, c]) => '<button type="button" class="cal-cat-op" data-cat="' + k + '" style="--c:' + c + '"><span>' + ICONO[k] + '</span>' + n + '</button>').join('') + '</div></div>' +
        (conTests() ? '<div class="cal-campo"><div class="cal-campo-t">Test del Específico</div><div data-test-campo></div></div>' : '') +
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
    pintarHoja(f);
    bg.addEventListener('click', e => {
      if(e.target === bg) return cerrarHoja();
      const b = e.target.closest('button');
      if(!b) return;
      if(b.dataset.cat){ h.cat = b.dataset.cat; ultimaCat = h.cat; }
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
    test_id: d.test_id || null, test_ids: d.test_ids || [], progreso: null,
    hecho: !!hecho, serie, orden: delDia(fecha).length, created_at: ahora() });
  const sinMeta = r => { const { created_at, ...x } = r; return x; };
  function recortar(p, ids){
    const pt = {};
    Object.entries((p || {}).porTest || {}).forEach(([k, v]) => { if(ids.includes(k)) pt[k] = v; });
    return Object.keys(pt).length ? { porTest: pt } : null;
  }
  function irA(fecha){ elegido = fecha; const d = deIso(fecha); mes = [d.getFullYear(), d.getMonth()]; }

  async function guardar(f){
    const titulo = f.titulo.value.trim();
    if(!titulo){ f.titulo.classList.add('mal'); f.titulo.focus(); setTimeout(() => f.titulo.classList.remove('mal'), 600); return; }
    const d = { titulo, nota: f.nota.value.trim() || null, categoria: h.cat };
    if(conTests()){ d.test_ids = [...h.tests]; d.test_id = h.tests[0] || null; }
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
        Object.assign(x, d, { progreso: prog }); if(delta) x.fecha = masDias(x.fecha, delta);
        ops.push(sb.from('calendario_tareas').update({ ...d, progreso: prog, fecha: x.fecha, serie: x.serie, updated_at: ahora() }).eq('id', x.id));
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
      Object.assign(t, d, { fecha, serie });
      const nuevas = fechas.slice(1).map(x => fila(x, d, serie, hechas.has(x)));
      tareas.push(...nuevas);
      if(ids.size) ops.push(sb.from('calendario_tareas').delete().in('id', [...ids]));
      ops.push(sb.from('calendario_tareas').update({ ...d, fecha, serie, updated_at: ahora() }).eq('id', t.id));
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
        irA(el.dataset.f); pintar();
        break;
      }
      case 'mes': { const d = new Date(mes[0], mes[1] + Number(el.dataset.d), 1); mes = [d.getFullYear(), d.getMonth()]; pintar(); break; }
      case 'hoy': { elegido = hoy(); const d = deIso(elegido); mes = [d.getFullYear(), d.getMonth()]; pintar(); break; }
      case 'nueva': abrirHoja(); break;
      case 'editar': if(t) abrirHoja(t); break;
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
      case 'test': if(t) hacerTest(t, el.dataset.test); break;
    }
  }

  function abrir(){
    const root = document.getElementById('calRoot');
    if(root && !root.dataset.listo){ root.dataset.listo = '1'; root.addEventListener('click', onClick); }
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
        test: testsDe(t).length ? avanceTotal(t) : null })),
      hechas: lista.filter(t => t.hecho).length,
      racha: racha(),
      atrasadas: atrasadas().length,
      manana: delDia(masDias(h, 1)).length
    };
  }
  function marcarId(id){ marcar(tareas.find(x => x.id === id)); }
  // Desde Inicio: directo al primer test sin terminar de la tarea.
  function seguirTest(id){
    const t = tareas.find(x => x.id === id);
    if(!t) return;
    hacerTest(t, (t.test_ids || []).find(x => !terminado(avance(t, x))) || (t.test_ids || [])[0]);
  }
  return { barraTramos, abrir, recargar: cargar, asegurar, resumenHoy, marcar: marcarId, guardarProgreso, verTarea, seguirTest, nueva: () => { elegido = hoy(); mes = null; abrirHoja(); } };
})();
