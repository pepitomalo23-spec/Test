/* Inicio: arriba una cabecera de color con la fecha, cuántas tareas quedan
   hoy (con su anillo), los días que faltan para el examen y lo que está a
   medias. Debajo: tus exámenes del calendario en una fila que se desliza
   (cada uno con lo dominado de lo que entra y su tema más flojo; al pulsarlo,
   su detalle), lo de hoy como agenda (se marca aquí mismo; cada tarea abre su
   ventanita) y la semana con un punto por tarea y los días de examen. */
const INICIO = (function(){
  const MODOS = { estudio: 'Modo estudio', fallos: 'Fallos', inteligente: 'Test Inteligente', simulacro: 'Simulacro', examen: 'Examen' };
  const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const FLECHA = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>';
  const CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5 10 17l9-10"/></svg>';
  const ICO = {
    reanudar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="6 3 20 12 6 21 6 3"/></svg>'
  };
  const MAX_TAREAS = 5;
  const esc = s => escapeHtml(String(s == null ? '' : s));
  const datosListos = () => typeof appDataReady !== 'undefined' && appDataReady && QUESTIONS_POOL.length > 0;

  function fechaHoy(){
    const d = new Date(), f = DIAS[d.getDay()] + ', ' + d.getDate() + ' de ' + MESES[d.getMonth()];
    return f.charAt(0).toUpperCase() + f.slice(1);
  }
  const etiqueta = (txt, extra) => '<div class="ini-label"><span>' + txt + '</span>' + (extra || '') + '</div>';

  function continuar(){
    if(!quizState || !quizState.mode) return '';
    const total = (quizState.answers || []).length;
    const hechas = (quizState.answers || []).filter(a => a != null).length;
    const pct = total ? Math.round(hechas / total * 100) : 0;
    return '<button type="button" class="ini-continuar" data-ini="reanudar">' +
      '<span class="ini-continuar-ico">' + ICO.reanudar + '</span>' +
      '<span class="ini-continuar-txt"><b>Continuar ' + esc(MODOS[quizState.mode] || 'test') + '</b>' +
        '<span>' + (total ? hechas + ' de ' + total + ' respondidas' : 'Tienes un test a medias') + '</span>' +
        (total ? '<span class="ini-barra"><i style="width:' + pct + '%"></i></span>' : '') + '</span>' +
      '<span class="ini-flecha">' + FLECHA + '</span></button>';
  }

  // Una prueba de js/pruebas.js a medias (el Simulacro conjunto o un modo del Específico).
  function pruebaAMedias(){
    if(typeof PRU === 'undefined') return '';
    const m = PRU.aMedias();
    if(!m) return '';
    const pct = m.total ? Math.round(m.hechas / m.total * 100) : 0;
    return '<button type="button" class="ini-continuar" data-ini="prueba">' +
      '<span class="ini-continuar-ico">' + ICO.reanudar + '</span>' +
      '<span class="ini-continuar-txt"><b>Continuar ' + esc(m.titulo.charAt(0).toLowerCase() + m.titulo.slice(1)) + '</b><span>' + m.hechas + ' de ' + m.total + ' respondidas</span>' +
        '<span class="ini-barra"><i style="width:' + pct + '%"></i></span></span>' +
      '<span class="ini-flecha">' + FLECHA + '</span></button>';
  }

  // Un test del Específico a medias (se sigue aquí o en otro dispositivo).
  function espAMedias(){
    if(typeof ESPT === 'undefined' || !ESPT.aMedias) return '';
    const m = ESPT.aMedias();
    if(!m) return '';
    const pct = m.total ? Math.round(m.hechas / m.total * 100) : 0;
    return '<button type="button" class="ini-continuar" data-ini="esp" data-id="' + esc(m.id) + '">' +
      '<span class="ini-continuar-ico">' + ICO.reanudar + '</span>' +
      '<span class="ini-continuar-txt"><b>Continuar test del Específico</b><span>' + esc(m.titulo) + ' · ' + m.hechas + ' de ' + m.total + ' respondidas</span>' +
        '<span class="ini-barra"><i style="width:' + pct + '%"></i></span></span>' +
      '<span class="ini-flecha">' + FLECHA + '</span></button>';
  }

  // Marcadas del Específico que tocan hoy (el repaso de cada día).
  let marcadasPedidas = false;
  function marcadasHoy(){
    if(!featureEnabled('especifico') || typeof ESPT === 'undefined' || !ESPT.cuantasHoy) return '';
    const q = ESPT.cuantasHoy();
    if(!q){ if(!marcadasPedidas){ marcadasPedidas = true; ESPT.cargarMarcadas().then(pintar, () => {}); } return ''; }
    if(!q.total) return '';
    // Un botón pequeño al final de la página (no entre lo «en curso»).
    return '<button type="button" class="ini-fijo" data-ini="marcadas"><span class="ini-fijo-ico">★</span>Hacer marcadas de hoy<span class="ini-fijo-n">' + q.total + '</span></button>';
  }

  // Tarea con un test del calendario: lo que lleva y lo que falta.
  function barraTest(x){
    if(!x) return '';
    const pct = x.total ? Math.round(x.hechas / x.total * 100) : 0;
    const txt = x.tests > 1 ? x.terminados + '/' + x.tests + ' tests' : x.hechas ? x.hechas + '/' + x.total : 'Sin empezar';
    // Varios tests: un tramo por test (no se mezclan los avances).
    const barra = x.tests > 1 ? CAL.barraTramos(x.partes) : '<span class="ini-barra"><i style="width:' + pct + '%"></i></span>';
    return '<span class="ini-tarea-test">' + barra + '<span>' + txt + '</span></span>';
  }
  // Hoy, como agenda: lo primero pendiente es «Ahora», lo demás pendiente «Luego» y al final lo hecho.
  function agenda(r){
    const n = r ? r.lista.length : 0;
    const cab = etiqueta('Hoy', '<button type="button" class="ini-link" data-ini="calendario">Calendario ' + FLECHA + '</button>');
    let cuerpo;
    if(!r) cuerpo = '<div class="skel-list">' +
      '<div class="skel-row"><span class="skel skel-dot"></span><span class="skel-lines"><span class="skel skel-line" style="width:60%"></span></span></div>' +
      '<div class="skel-row"><span class="skel skel-dot"></span><span class="skel-lines"><span class="skel skel-line" style="width:45%"></span></span></div></div>';
    else if(!n) cuerpo = '<button type="button" class="ini-anadir" data-ini="nueva"><span>+</span> Apuntar algo para hoy</button>';
    else {
      const orden = r.lista.slice().sort((a, b) => a.hecho - b.hecho);
      let primera = true;
      cuerpo = '<div class="ini-agenda">' + orden.slice(0, MAX_TAREAS).map(t => {
        const fin = t.test && t.test.terminados === t.test.tests;
        const cuando = t.hecho ? 'Hecha' : primera ? 'Ahora' : 'Luego';
        if(!t.hecho) primera = false;
        const accion = t.test && !fin && !t.hecho
          ? '<button type="button" class="ini-tarea-ir" data-ini="test" data-id="' + esc(t.id) + '">' + (t.test.hechas ? 'Seguir' : t.simc ? 'Hacer' : 'Empezar') + '</button>'
          : '<button type="button" class="ini-check" data-ini="marcar" data-id="' + esc(t.id) + '" aria-label="' + (t.hecho ? 'Desmarcar' : 'Marcar como hecha') + '">' + CHECK + '</button>';
        return '<div class="ini-ag' + (t.hecho ? ' hecha' : '') + (cuando === 'Ahora' ? ' ahora' : '') + '" style="--c:' + t.color + '" role="button" tabindex="0" data-ini="ver" data-id="' + esc(t.id) + '" aria-label="Ver ' + esc(t.titulo) + '">' +
          '<span class="ini-ag-cuando">' + cuando + '</span><i class="ini-ag-punto"></i>' +
          '<span class="ini-tarea-txt"><span class="ini-tarea-t">' + esc(t.titulo) + '</span>' +
            '<span class="ini-tarea-cat">' + esc(t.cat) + (t.nota ? ' · ' + esc(t.nota) : '') + '</span>' + (t.hecho ? '' : barraTest(t.test)) + '</span>' + accion +
        '</div>';
      }).join('') + '</div>' +
      (n > MAX_TAREAS ? '<button type="button" class="ini-mas" data-ini="calendario">y ' + (n - MAX_TAREAS) + ' más en el calendario</button>' : '');
    }
    return '<section class="ini-sec">' + cab + cuerpo + '</section>';
  }

  // Sin exámenes apuntados: las cifras generales (por repasar, Legislación, Específico). Cada una abre lo suyo.
  function cifra(clave, valor, txt, clase){
    return '<button type="button" class="ini-cifra' + (clase ? ' ' + clase : '') + '" data-ini="' + clave + '"><b>' + valor + '</b><span>' + txt + '</span></button>';
  }
  const pctVerde = r => r && r.total ? Math.round(r.verde / r.total * 100) : 0;
  const skelCifra = txt => '<div class="ini-cifra"><span class="skel" style="width:44px;height:24px"></span><span>' + txt + '</span></div>';
  function cifras(){
    const out = [];
    if(featureEnabled('fallos')){
      if(!datosListos()) out.push(skelCifra('por repasar'));
      else {
        const n = QUESTIONS_POOL.filter(q => q.masteryStatus === 'red' && !q.fallosHidden).length;
        out.push(cifra('fallos', n, 'por repasar', n ? 'aviso' : ''));
      }
    }
    if(featureEnabled('estadisticas')){
      if(!datosListos()) out.push(skelCifra('Legislación'));
      else {
        const pool = QUESTIONS_POOL;
        out.push(cifra('stats-legis', pctVerde({ total: pool.length, verde: pool.filter(q => q.masteryStatus === 'green').length }) + '<small>%</small>', 'Legislación'));
      }
      if(featureEnabled('especifico') && typeof ESTE !== 'undefined'){
        const r = ESTE.resumen();
        out.push(r ? cifra('stats-esp', pctVerde(r) + '<small>%</small>', 'Específico') : skelCifra('Específico'));
      }
    }
    if(!out.length) return '';
    return '<section class="ini-sec">' + etiqueta('Cómo vas') + '<div class="ini-cifras" style="--n:' + out.length + '">' + out.join('') + '</div></section>';
  }

  /* ---------- tus exámenes (los del calendario, de hoy en adelante) ----------
     Una fila que se desliza: cada examen con lo dominado de lo que entra (su
     anillo) y su tema más flojo. Al pulsarlo, su detalle tema a tema. */
  const exas = () => typeof CAL !== 'undefined' && CAL.examenes ? CAL.examenes() : undefined;
  const enDias = d => d === 0 ? 'hoy' : d === 1 ? 'mañana' : 'en ' + d + ' días';
  const cuandoExa = x => x.dias > 1 ? x.cuando.replace(/ de [a-z]+$/, '') + ' · en ' + x.dias + ' días' : x.dias ? 'Mañana' : 'Hoy';
  const NIVELES = { bien: ['Bien preparado', 'var(--green)'], medio: ['A medio camino', 'var(--amber)'], flojo: ['Te falta', 'var(--coral)'] };
  // Cómo vas en lo que entra: cada tema { nombre, tipo, total, verde, amarillo, rojo } (o { cargando }),
  // de lo más flojo a lo mejor, el % dominado de todo y las falladas de Legislación por repasar.
  function preparacion(x){
    const temas = [];
    const pool = datosListos() ? QUESTIONS_POOL : null;
    // Una ley entera o solo un título suyo (y todo lo que cuelga de él).
    const entra = (q, l) => q.topic_id === l.id && (!l.grupo || (!!q.nodo_id && nodeIsInSelectedGroups(q.nodo_id, new Set([l.grupo]))));
    x.legis.forEach(l => {
      if(!pool) return temas.push({ nombre: l.nombre, cargando: true });
      const qs = pool.filter(q => entra(q, l)), n = st => qs.filter(q => q.masteryStatus === st).length;
      temas.push({ nombre: l.nombre, tipo: 'Legislación', total: qs.length, verde: n('green'), amarillo: n('yellow'), rojo: n('red') });
    });
    const pt = x.esp.length && typeof ESTE !== 'undefined' && ESTE.porTema ? ESTE.porTema() : null;
    x.esp.forEach(e => {
      if(!pt) return temas.push({ nombre: e.nombre, cargando: true });
      temas.push(Object.assign({ nombre: e.nombre, tipo: 'Específico' }, pt[e.id] || { total: 0, verde: 0, amarillo: 0, rojo: 0 }));
    });
    const listos = temas.filter(t => !t.cargando);
    const tot = listos.reduce((a, t) => a + t.total, 0), verde = listos.reduce((a, t) => a + t.verde, 0);
    const pct = tot ? Math.round(verde / tot * 100) : 0;
    temas.sort((a, b) => (a.cargando ? 1 : 0) - (b.cargando ? 1 : 0) || pctVerde(a) - pctVerde(b));
    return { temas, pct, listo: listos.length > 0, nivel: pct >= 80 ? 'bien' : pct >= 50 ? 'medio' : 'flojo',
      rojoLegis: pool ? pool.filter(q => q.masteryStatus === 'red' && !q.fallosHidden && x.legis.some(l => entra(q, l))).length : 0 };
  }
  function anilloExa(p, grande){
    const c = 2 * Math.PI * 15, col = NIVELES[p.nivel][1];
    return '<svg class="ini-exa-anillo' + (grande ? ' grande' : '') + '" viewBox="0 0 36 36" aria-hidden="true"><circle cx="18" cy="18" r="15" class="fondo"/>' +
      (p.listo && p.pct ? '<circle cx="18" cy="18" r="15" class="valor" style="stroke:' + col + '" stroke-dasharray="' + (c * p.pct / 100).toFixed(2) + ' ' + c.toFixed(2) + '" transform="rotate(-90 18 18)"/>' : '') +
      '<text x="18" y="21.2" text-anchor="middle">' + (p.listo ? p.pct + '%' : '…') + '</text></svg>';
  }
  function pila(t){
    const w = k => t.total ? (t[k] / t.total * 100).toFixed(1) : 0;
    return '<span class="ini-pila" aria-hidden="true"><i class="v" style="width:' + w('verde') + '%"></i><i class="a" style="width:' + w('amarillo') + '%"></i><i class="r" style="width:' + w('rojo') + '%"></i></span>';
  }
  const queEntra = x => x.legis.map(l => l.nombre).concat(x.esp.map(e => e.nombre)).join(' · ');
  function tarjetaExamen(x){
    const vacio = !x.legis.length && !x.esp.length;
    if(vacio) return '<button type="button" class="ini-exa" data-ini="exa-editar" data-id="' + esc(x.id) + '">' +
      '<span class="ini-exa-c"><span class="ini-exa-txt"><b>' + esc(cuandoExa(x)) + '</b><span>' + esc(x.titulo) + '</span></span></span>' +
      '<span class="ini-exa-falta">Elige qué entra ›</span></button>';
    const p = preparacion(x), flojo = p.temas.find(t => !t.cargando);
    return '<button type="button" class="ini-exa" data-ini="exa" data-id="' + esc(x.id) + '" style="--c:' + NIVELES[p.nivel][1] + '">' +
      '<span class="ini-exa-c">' + anilloExa(p) + '<span class="ini-exa-txt"><b>' + esc(cuandoExa(x)) + '</b><span>' + esc(queEntra(x)) + '</span></span></span>' +
      (flojo && p.temas.length > 1 ? '<span class="ini-tema"><span class="ini-tema-cab"><span>Lo más flojo: ' + esc(flojo.nombre) + '</span><b>' + pctVerde(flojo) + '%</b></span>' + pila(flojo) + '</span>'
        : flojo ? '<span class="ini-tema"><span class="ini-tema-cab"><span>' + esc(flojo.nombre) + '</span><b>' + flojo.verde + '/' + flojo.total + '</b></span>' + pila(flojo) + '</span>'
        : '<span class="ini-tema"><span class="ini-tema-cab"><span>Cargando…</span></span><span class="ini-pila"></span></span>') +
      '</button>';
  }
  function tusExamenes(){
    const xs = exas();
    if(xs === undefined || typeof CAL === 'undefined' || !CAL.nuevoExamen) return '';
    const cab = etiqueta('Tus exámenes', '<button type="button" class="ini-link" data-ini="nuevo-examen">+ Programar</button>');
    if(!xs.length) return '<section class="ini-sec">' + cab + '<button type="button" class="ini-exa-nuevo ancho" data-ini="nuevo-examen"><b>+ Programa tu próximo examen</b><span>Elige qué entra y aquí verás cómo vas en esos temas</span></button></section>';
    return '<section class="ini-sec">' + cab + '<div class="ini-carril">' + xs.map(tarjetaExamen).join('') +
      '<button type="button" class="ini-exa-nuevo" data-ini="nuevo-examen"><b>+ Programar</b><span>otro examen</span></button></div></section>';
  }
  // El detalle de un examen: todos sus temas, lo de su semana y las falladas por repasar.
  function cerrarHoja(){ const bg = document.getElementById('iniExa'); if(bg) bg.remove(); document.removeEventListener('keydown', teclaHoja, true); }
  function teclaHoja(e){ if(e.key === 'Escape'){ e.stopPropagation(); cerrarHoja(); } }
  function abrirExamen(id){
    const x = (exas() || []).find(y => y.id === id);
    if(!x) return;
    cerrarHoja();
    const p = preparacion(x), sem = x.semana;
    const filas = p.temas.map(t => {
      if(t.cargando) return '<div class="ini-tema"><div class="ini-tema-cab"><span>' + esc(t.nombre) + '</span><span class="skel" style="width:30px;height:14px"></span></div><span class="ini-pila"></span></div>';
      const sinVer = t.total - t.verde - t.amarillo - t.rojo;
      return '<div class="ini-tema"><div class="ini-tema-cab"><span>' + esc(t.nombre) + '<small>' + t.tipo + '</small></span><b>' + pctVerde(t) + '%</b></div>' + pila(t) +
        '<span class="ini-tema-n">' + t.verde + ' de ' + t.total + ' dominadas' + (t.rojo ? ' · <em>' + t.rojo + ' falladas</em>' : '') + (sinVer > 0 ? ' · ' + sinVer + ' sin ver' : '') + '</span></div>';
    }).join('');
    const bg = document.createElement('div');
    bg.className = 'cal-hoja-bg'; bg.id = 'iniExa';
    bg.innerHTML = '<div class="cal-hoja ini-exa-hoja" style="--c:#E5484D" role="dialog" aria-modal="true" aria-label="' + esc(x.titulo) + '">' +
      '<div class="cal-hoja-top"><div class="cal-hoja-asa"></div><div class="cal-hoja-cab"><div class="cal-hoja-tit"><h3>' + esc(x.titulo) + '</h3>' +
        '<div class="cal-hoja-sub">' + esc(x.cuando) + ' · ' + enDias(x.dias) + '</div></div>' +
        '<button type="button" class="cal-x" data-h="cerrar" aria-label="Cerrar">✕</button></div></div>' +
      '<div class="cal-hoja-cuerpo">' +
        '<div class="ini-exa-res">' + anilloExa(p, true) + '<div class="ini-exa-datos">' +
          (p.listo ? '<span class="ini-nivel ' + p.nivel + '">' + NIVELES[p.nivel][0] + '</span>' : '') +
          (sem.total ? '<span><b>' + sem.hechas + '/' + sem.total + '</b> tareas de la semana</span>' : '<span>Sin tareas apuntadas esa semana</span>') +
          (featureEnabled('fallos') && p.rojoLegis ? '<button type="button" class="ini-exa-fallos" data-h="fallos"><b>' + p.rojoLegis + '</b> de Legislación por repasar ›</button>' : '') +
        '</div></div>' +
        '<div class="ini-temas">' + filas + '</div>' +
        '<div class="ini-leyenda"><span><i class="v"></i>Dominadas</span><span><i class="a"></i>Afianzando</span><span><i class="r"></i>Falladas</span><span><i></i>Sin ver</span></div>' +
      '</div>' +
      '<div class="cal-hoja-pie"><button type="button" class="cal-btn" data-h="editar">Editar examen</button><button type="button" class="cal-btn primario" data-h="cerrar">Listo</button></div></div>';
    document.body.appendChild(bg);
    bg.addEventListener('click', e => {
      if(e.target === bg) return cerrarHoja();
      const b = e.target.closest('[data-h]');
      if(!b) return;
      cerrarHoja();
      if(b.dataset.h === 'editar') CAL.editar(x.id);
      if(b.dataset.h === 'fallos') openFallos();
    });
    document.addEventListener('keydown', teclaHoja, true);
    requestAnimationFrame(() => bg.classList.add('on'));
  }

  // La semana (de lunes a domingo) con un punto por tarea; los días de examen, con su aro. Cada día abre el calendario.
  function semana(){
    const s = typeof CAL !== 'undefined' ? CAL.semana() : null;
    if(!s) return '';
    return '<section class="ini-sec">' + etiqueta('Esta semana' + (s.atrasadas ? ' · <b class="ini-aviso">' + s.atrasadas + (s.atrasadas === 1 ? ' atrasada' : ' atrasadas') + '</b>' : '')) +
      '<div class="ini-semana">' + s.dias.map(d =>
        '<button type="button" class="ini-dia' + (d.hoy ? ' hoy' : '') + (d.pasado ? ' pasado' : '') + (d.examen ? ' exa' : '') + '" data-ini="dia" data-f="' + d.f + '" aria-label="' + esc(d.nombre) + ', ' + d.puntos.length + ' tareas' + (d.examen ? ', examen' : '') + '">' +
          '<span class="ini-dia-l">' + d.letra + '</span><span class="ini-dia-n">' + d.n + '</span>' +
          '<span class="ini-puntos">' + d.puntos.slice(0, 4).map(p => '<i style="background:' + p.c + '"' + (p.h ? ' class="h"' : '') + '></i>').join('') + '</span></button>').join('') +
      '</div></section>';
  }

  // Los días que faltan para el examen (js/examen.js), en una línea de la cabecera.
  function examen(){
    const x = (exas() || [])[0];
    if(x) return '<button type="button" class="ini-hero-exa" data-ini="ver" data-id="' + esc(x.id) + '">Examen <b>' + enDias(x.dias) + '</b> ›</button>';
    if(typeof EXA === 'undefined' || !currentUser) return '';
    const a = EXA.ajustes();
    if(!a.fecha) return '<button type="button" class="ini-hero-exa" data-ini="examen">Pon la fecha del examen ›</button>';
    const d = EXA.diasHasta(a.fecha);
    if(d < 0) return '';
    const txt = d > 1 ? 'Examen en <b>' + d + ' días</b>' : d === 1 ? '<b>El examen es mañana</b>' : '<b>Hoy es el examen</b>';
    return '<button type="button" class="ini-hero-exa" data-ini="examen">' + txt + ' ›</button>';
  }

  // Cabecera de color: la fecha, «Hoy», cuántas tareas quedan (con su anillo), el examen y lo que está a medias.
  function cabecera(r, enCurso){
    const n = r ? r.lista.length : 0, hechas = r ? r.hechas : 0;
    let titulo = 'Nada apuntado para hoy';
    if(!r) titulo = 'Cargando lo de hoy…';
    else if(n && hechas >= n) titulo = 'Todo hecho por hoy';
    else if(n) titulo = 'Te ' + (n - hechas === 1 ? 'queda 1 tarea' : 'quedan ' + (n - hechas) + ' tareas');
    const anilloHoy = '<svg class="ini-hero-anillo" viewBox="0 0 36 36" aria-hidden="true"><circle cx="18" cy="18" r="15" class="fondo"/>' +
      (n && hechas ? '<circle cx="18" cy="18" r="15" class="valor" stroke-dasharray="' + (2 * Math.PI * 15 * hechas / n).toFixed(2) + ' 94.25" transform="rotate(-90 18 18)"/>' : '') +
      '<text x="18" y="21.2" text-anchor="middle">' + (n ? hechas + '/' + n : '–') + '</text></svg>';
    return '<div class="ini-hero"><div class="ini-hero-top"><div><div class="ini-fecha">' + fechaHoy() + '</div><h1 class="ini-h">Hoy</h1></div></div>' +
      '<div class="ini-hero-fila">' + anilloHoy + '<div class="ini-hero-txt"><b>' + titulo + '</b>' + examen() + '</div></div>' +
      (enCurso ? '<div class="ini-encurso">' + enCurso + '</div>' : '') + '</div>';
  }

  function pintar(){
    const root = document.getElementById('inicioRoot');
    if(!root || !document.getElementById('screen-inicio').classList.contains('active') || !currentUser) return;
    const r = typeof CAL !== 'undefined' ? CAL.resumenHoy() : null;
    const enCurso = continuar() + pruebaAMedias() + espAMedias();
    const fijo = marcadasHoy();
    root.innerHTML = cabecera(r, enCurso) +
      tusExamenes() +
      '<div class="ini-cuerpo"><div class="ini-col">' + agenda(r) + '</div><div class="ini-col">' + semana() + ((exas() || []).length ? '' : cifras()) + '</div></div>' + fijo;
  }

  function onClick(e){
    const el = e.target.closest('[data-ini]');
    if(!el || el.disabled) return;
    switch(el.dataset.ini){
      case 'marcar': e.stopPropagation(); CAL.marcar(el.dataset.id); break;
      case 'test': e.stopPropagation(); CAL.seguirTest(el.dataset.id); break;
      case 'ver': CAL.verTarea(el.dataset.id); break;
      case 'exa': abrirExamen(el.dataset.id); break;
      case 'exa-editar': CAL.editar(el.dataset.id); break;
      case 'nueva': e.stopPropagation(); CAL.nueva(); break;
      case 'nuevo-examen': CAL.nuevoExamen(); break;
      case 'calendario': showScreen('screen-calendario'); break;
      case 'dia': CAL.abrirDia(el.dataset.f); break;
      case 'reanudar': resumeQuiz(); break;
      case 'esp': ESPT.continuarCurso(el.dataset.id); break;
      case 'marcadas': ESPT.abrirHoy(); break;
      case 'prueba': PRU.continuar(); break;
      case 'examen': EXA.abrir(); break;
      case 'stats': showScreen('screen-stats'); break;
      case 'fallos': openFallos(); break;
      case 'stats-legis': case 'stats-esp':
        try{ localStorage.setItem('pj_stats_pestana', el.dataset.ini === 'stats-esp' ? 'esp' : 'legis'); }catch(err){}
        showScreen('screen-stats'); break;
    }
  }

  function abrir(){
    const root = document.getElementById('inicioRoot');
    if(root && !root.dataset.listo){
      root.dataset.listo = '1';
      root.addEventListener('click', onClick);
      root.addEventListener('keydown', e => {
        if(e.key === 'Enter' && e.target.dataset && e.target.dataset.ini === 'ver') CAL.verTarea(e.target.dataset.id);
      });
    }
    if(typeof CAL !== 'undefined') CAL.asegurar();
    pintar();
  }
  return { abrir, pintar };
})();
