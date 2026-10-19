/* Inicio: arriba una cabecera de color con la fecha, cuántas tareas quedan
   hoy (con su anillo), los días que faltan para el examen y lo que está a
   medias. Debajo: lo de hoy en pequeño (cuántas van y lo siguiente; al
   pulsarlo, la lista entera para marcar) y el examen de esta semana del
   calendario con lo dominado de lo que entra y su tema más flojo (al
   pulsarlo, su detalle tema a tema). */
const INICIO = (function(){
  const MODOS = { estudio: 'Modo estudio', fallos: 'Fallos', inteligente: 'Test Inteligente', simulacro: 'Simulacro', examen: 'Examen' };
  const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const FLECHA = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>';
  const CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5 10 17l9-10"/></svg>';
  const ICO = {
    reanudar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="6 3 20 12 6 21 6 3"/></svg>',
    piscina: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 8c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/><path d="M2 15c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/></svg>'
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

  // Piscina (solo administradores): acceso a programar reservas, con la próxima.
  function piscina(){
    if(!currentUserIsAdmin || typeof PISCINA === 'undefined') return '';
    const r = PISCINA.proxima();
    return '<button type="button" class="ini-continuar ini-piscina" data-ini="piscina">' +
      '<span class="ini-continuar-ico">' + ICO.piscina + '</span>' +
      '<span class="ini-continuar-txt"><b>Piscina</b><span>' + esc(PISCINA.textoProxima(r)) + '</span></span>' +
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
    // Con lo que está a medias y con el mismo aspecto (estrella azul).
    return '<button type="button" class="ini-continuar ini-marcadas" data-ini="marcadas">' +
      '<span class="ini-continuar-ico">★</span>' +
      '<span class="ini-continuar-txt"><b>Marcadas de hoy</b><span>' + q.total + (q.total === 1 ? ' pregunta para repasar' : ' preguntas para repasar') + '</span></span>' +
      '<span class="ini-flecha">' + FLECHA + '</span></button>';
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
  // Las tareas de hoy, pendientes primero (lo primero pendiente es «Ahora»). Para la hoja «Hoy».
  function filasHoy(r){
    const orden = r.lista.slice().sort((a, b) => a.hecho - b.hecho);
    let primera = true;
    return '<div class="ini-agenda">' + orden.map(t => {
      const fin = t.test && t.test.terminados === t.test.tests;
      const cuando = t.hecho ? 'Hecha' : primera ? 'Ahora' : 'Luego';
      if(!t.hecho) primera = false;
      const accion = t.test && !fin && !t.hecho
        ? '<button type="button" class="ini-tarea-ir" data-h="test" data-id="' + esc(t.id) + '">' + (t.test.hechas ? 'Seguir' : t.simc ? 'Hacer' : 'Empezar') + '</button>'
        : '<button type="button" class="ini-check" data-h="marcar" data-id="' + esc(t.id) + '" aria-label="' + (t.hecho ? 'Desmarcar' : 'Marcar como hecha') + '">' + CHECK + '</button>';
      return '<div class="ini-ag' + (t.hecho ? ' hecha' : '') + (cuando === 'Ahora' ? ' ahora' : '') + '" style="--c:' + t.color + '" role="button" tabindex="0" data-h="ver" data-id="' + esc(t.id) + '" aria-label="Ver ' + esc(t.titulo) + '">' +
        '<span class="ini-ag-cuando">' + cuando + '</span><i class="ini-ag-punto"></i>' +
        '<span class="ini-tarea-txt"><span class="ini-tarea-t">' + esc(t.titulo) + '</span>' +
          '<span class="ini-tarea-cat">' + esc(t.cat) + (t.nota ? ' · ' + esc(t.nota) : '') + '</span>' + (t.hecho ? '' : barraTest(t.test)) + '</span>' + accion +
      '</div>';
    }).join('') + '</div>';
  }
  // Hoy, en pequeño: cuántas van (un punto por tarea) y lo siguiente que toca con su botón. Al pulsarlo, la lista entera.
  function hoyCompacto(r){
    if(!r) return '<div class="ini-hoy"><span class="skel" style="width:60%;height:16px"></span></div>';
    const n = r.lista.length;
    if(!n) return '<button type="button" class="ini-hoy vacio" data-ini="nueva"><span class="ini-hoy-l">Hoy</span><span class="ini-hoy-t">+ Apuntar algo para hoy</span></button>';
    const sig = r.lista.find(t => !t.hecho);
    const puntos = '<span class="ini-hoy-puntos" aria-hidden="true">' + r.lista.slice().sort((a, b) => b.hecho - a.hecho).map(t => '<i style="--c:' + t.color + '"' + (t.hecho ? ' class="h"' : '') + '></i>').join('') + '</span>';
    const fin = sig && sig.test && sig.test.terminados === sig.test.tests;
    const accion = sig && sig.test && !fin ? '<button type="button" class="ini-tarea-ir" data-ini="test" data-id="' + esc(sig.id) + '">' + (sig.test.hechas ? 'Seguir' : sig.simc ? 'Hacer' : 'Empezar') + '</button>' : '';
    return '<div class="ini-hoy" role="button" tabindex="0" data-ini="hoy" aria-label="Ver las tareas de hoy">' +
      '<span class="ini-hoy-cab"><span class="ini-hoy-l">Hoy · <b>' + r.hechas + ' de ' + n + '</b></span>' + puntos + '<span class="ini-hoy-mas">Ver todo ' + FLECHA + '</span></span>' +
      (sig ? '<span class="ini-hoy-sig" style="--c:' + sig.color + '"><i></i><span class="ini-hoy-t">' + esc(sig.titulo) + '</span>' + accion + '</span>'
        : '<span class="ini-hoy-sig hecho"><span class="ini-hoy-t">Todo hecho por hoy ✓</span></span>') +
      '</div>';
  }
  function abrirHoy(){
    const r = typeof CAL !== 'undefined' ? CAL.resumenHoy() : null;
    if(!r) return;
    const cuerpo = () => (r.lista.length ? filasHoy(CAL.resumenHoy() || r) : '') + '<button type="button" class="ini-anadir" data-h="nueva"><span>+</span> Apuntar algo para hoy</button>';
    hoja('Hoy', fechaHoy() + ' · ' + r.hechas + ' de ' + r.lista.length + ' hechas', cuerpo(),
      '<button type="button" class="cal-btn" data-h="calendario">Calendario</button><button type="button" class="cal-btn primario" data-h="cerrar">Listo</button>',
      (b, cerrar, poner) => {
        const id = b.dataset.id;
        switch(b.dataset.h){
          case 'marcar': CAL.marcar(id); { const r2 = CAL.resumenHoy(); poner(cuerpo(), fechaHoy() + ' · ' + r2.hechas + ' de ' + r2.lista.length + ' hechas'); } break;
          case 'test': cerrar(); CAL.seguirTest(id); break;
          case 'ver': cerrar(); CAL.verTarea(id); break;
          case 'nueva': cerrar(); CAL.nueva(); break;
          case 'calendario': cerrar(); showScreen('screen-calendario'); break;
        }
      });
  }
  // Una hoja que sube desde abajo (como las del calendario). alPulsar(botón, cerrar, poner(cuerpo, sub)).
  function cerrarHoja(){ const bg = document.getElementById('iniHoja'); if(bg) bg.remove(); document.removeEventListener('keydown', teclaHoja, true); }
  function teclaHoja(e){ if(e.key === 'Escape'){ e.stopPropagation(); cerrarHoja(); } }
  function hoja(titulo, sub, cuerpo, pie, alPulsar, clase){
    cerrarHoja();
    const bg = document.createElement('div');
    bg.className = 'cal-hoja-bg'; bg.id = 'iniHoja';
    bg.innerHTML = '<div class="cal-hoja ini-hoja' + (clase ? ' ' + clase : '') + '" style="--c: var(--coral)" role="dialog" aria-modal="true" aria-label="' + esc(titulo) + '">' +
      '<div class="cal-hoja-top"><div class="cal-hoja-asa"></div><div class="cal-hoja-cab"><div class="cal-hoja-tit"><h3>' + esc(titulo) + '</h3>' +
        '<div class="cal-hoja-sub" data-sub>' + esc(sub) + '</div></div>' +
        '<button type="button" class="cal-x" data-h="cerrar" aria-label="Cerrar">✕</button></div></div>' +
      '<div class="cal-hoja-cuerpo" data-cuerpo>' + cuerpo + '</div>' +
      '<div class="cal-hoja-pie">' + pie + '</div></div>';
    document.body.appendChild(bg);
    const poner = (html, s2) => { bg.querySelector('[data-cuerpo]').innerHTML = html; if(s2) bg.querySelector('[data-sub]').textContent = s2; };
    bg.addEventListener('click', e => {
      if(e.target === bg) return cerrarHoja();
      const b = e.target.closest('[data-h]');
      if(!b) return;
      e.stopPropagation();
      if(b.dataset.h === 'cerrar') return cerrarHoja();
      alPulsar(b, cerrarHoja, poner);
    });
    bg.addEventListener('keydown', e => { if(e.key === 'Enter' && e.target.dataset && e.target.dataset.h === 'ver'){ cerrarHoja(); CAL.verTarea(e.target.dataset.id); } });
    document.addEventListener('keydown', teclaHoja, true);
    requestAnimationFrame(() => bg.classList.add('on'));
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
      if(!pool) return temas.push({ nombre: l.nombre, de: l, tipo: 'Legislación', cargando: true });
      const qs = pool.filter(q => entra(q, l)), n = st => qs.filter(q => q.masteryStatus === st).length;
      temas.push({ nombre: l.nombre, de: l, tipo: 'Legislación', total: qs.length, verde: n('green'), amarillo: n('yellow'), rojo: n('red') });
    });
    const pt = x.esp.length && typeof ESTE !== 'undefined' && ESTE.porTema ? ESTE.porTema() : null;
    x.esp.forEach(e => {
      if(!pt) return temas.push({ nombre: e.nombre, de: e, tipo: 'Específico', cargando: true });
      temas.push(Object.assign({ nombre: e.nombre, de: e, tipo: 'Específico' }, pt[e.id] || { total: 0, verde: 0, amarillo: 0, rojo: 0 }));
    });
    const listos = temas.filter(t => !t.cargando);
    const tot = listos.reduce((a, t) => a + t.total, 0), verde = listos.reduce((a, t) => a + t.verde, 0);
    const pct = tot ? Math.round(verde / tot * 100) : 0;
    const enOrden = temas.slice();   // como entran en el examen (para el detalle)
    temas.sort((a, b) => (a.cargando ? 1 : 0) - (b.cargando ? 1 : 0) || pctVerde(a) - pctVerde(b));
    return { temas, enOrden, tot, verde, pct, listo: listos.length > 0, nivel: pct >= 80 ? 'bien' : pct >= 50 ? 'medio' : 'flojo',
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
    if(x.dias === 0) return tarjetaDia(x);
    const p = preparacion(x), flojo = p.temas.find(t => !t.cargando);
    return '<button type="button" class="ini-exa" data-ini="exa" data-id="' + esc(x.id) + '" style="--c:' + NIVELES[p.nivel][1] + '">' +
      '<span class="ini-exa-c">' + anilloExa(p) + '<span class="ini-exa-txt"><b>' + esc(cuandoExa(x)) + '</b><span>' + esc(queEntra(x)) + '</span></span></span>' +
      (flojo && p.temas.length > 1 ? '<span class="ini-tema"><span class="ini-tema-cab"><span>Lo más flojo: ' + esc(flojo.nombre) + '</span><b>' + pctVerde(flojo) + '%</b></span>' + pila(flojo) + '</span>'
        : flojo ? '<span class="ini-tema"><span class="ini-tema-cab"><span>' + esc(flojo.nombre) + '</span><b>' + flojo.verde + '/' + flojo.total + '</b></span>' + pila(flojo) + '</span>'
        : '<span class="ini-tema"><span class="ini-tema-cab"><span>Cargando…</span></span><span class="ini-pila"></span></span>') +
      '</button>';
  }
  /* ---------- el día del examen ----------
     La tarjeta entera de color con «Entrar al examen». Al entrar, las
     instrucciones (cuántas preguntas, el tiempo, que el reloj no se para…) y
     luego el examen (js/pruebas.js, modo 'examen'). Hecho, su nota. */
  const notaTxt = n => (Math.round(Number(n) * 100) / 100).toFixed(2).replace('.', ',');
  function tarjetaDia(x){
    if(x.resultado) return '<button type="button" class="ini-exa ini-exa-hecho ' + (x.resultado.nota >= 5 ? 'ok' : 'mal') + '" data-ini="exa" data-id="' + esc(x.id) + '">' +
      '<span class="ini-exa-dia-l">Examen hecho</span><span class="ini-exa-nota">' + notaTxt(x.resultado.nota) + '<small>/10</small></span>' +
      '<span class="ini-exa-dia-sub">' + (x.resultado.nota >= 5 ? 'Aprobado' : 'Suspenso') + ' · ' + esc(queEntra(x)) + '</span></button>';
    const enCurso = typeof PRU !== 'undefined' && PRU.aMedias(['examen']);
    return '<div class="ini-exa ini-exa-dia">' +
      '<span class="ini-exa-dia-t">Hoy es el examen</span>' +
      '<span class="ini-exa-dia-sub">' + esc(queEntra(x)) + '</span>' +
      '<span class="ini-exa-dia-bot">' +
        (enCurso ? '<button type="button" class="ini-exa-entrar" data-ini="prueba">Seguir con el examen · ' + enCurso.hechas + '/' + enCurso.total + '</button>'
          : '<button type="button" class="ini-exa-entrar" data-ini="exa-entrar" data-id="' + esc(x.id) + '">Entrar al examen</button>') +
        '<button type="button" class="ini-exa-ver" data-ini="exa" data-id="' + esc(x.id) + '">Qué entra ›</button></span>' +
      '</div>';
  }
  const ICO_I = {
    reloj: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5"/><path d="M10 2h4"/></svg>',
    mezcla: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 18h1.4c1.3 0 2.5-.6 3.3-1.7l6.1-8.6c.7-1.1 2-1.7 3.3-1.7H22"/><path d="m18 2 4 4-4 4"/><path d="M2 6h1.9c1.5 0 2.9.9 3.6 2.2"/><path d="M22 18h-5.9c-1.3 0-2.6-.7-3.3-1.8l-.5-.8"/><path d="m18 14 4 4-4 4"/></svg>',
    menos: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M8 12h8"/></svg>',
    lapiz: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>',
    uno: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/><path d="m9 12 2 2 4-4"/></svg>'
  };
  function entrarExamen(id){
    const x = (exas() || []).find(y => y.id === id);
    if(!x || typeof PRU === 'undefined') return;
    // Mandado a varios: el formato y las preguntas son los que se eligieron al mandarlo.
    const a = x.fijo ? { preguntas: x.fijo.preguntas.length, minutos: x.fijo.minutos, penalizacion: x.fijo.pen, pct_legis: 50 }
      : typeof EXA !== 'undefined' ? EXA.ajustes() : { preguntas: 50, minutos: 60, penalizacion: null, pct_legis: 50 };
    const r = PRU.planExamen(x, a), n = r ? r.l + r.e : a.preguntas;
    const pen = PRU.textoPen(a.penalizacion);
    const regla = (ico, b, txt) => '<li><span class="ini-instr-ico">' + ico + '</span><span><b>' + b + '</b>' + txt + '</span></li>';
    const cuerpo =
      '<div class="ini-instr-cifras"><div><b>' + n + '</b><span>preguntas</span></div><div><b>' + a.minutos + '</b><span>minutos</span></div></div>' +
      '<ul class="ini-instr">' +
        regla(ICO_I.reloj, 'El tiempo no se para. ', 'Empieza al pulsar «Empezar examen» y sigue corriendo aunque salgas de la app. Cuando llega a cero, el examen se corrige solo.') +
        regla(ICO_I.mezcla, 'Preguntas mezcladas. ', 'Salen de todo lo que entra, sin decir de qué ley o tema es cada una.') +
        regla(ICO_I.menos, pen.charAt(0).toUpperCase() + pen.slice(1) + '. ', 'Las que dejes en blanco no restan.') +
        regla(ICO_I.lapiz, 'Puedes cambiar tus respuestas ', 'hasta que pulses «Finalizar».') +
        regla(ICO_I.uno, 'Un solo intento. ', 'Al terminar verás tu nota y la corrección.') +
        (x.fijo ? regla(ICO_I.mezcla, 'El mismo examen para todos. ', 'Las mismas preguntas que a ' + (x.de ? 'quien te lo mandó y a los demás' : 'las personas a las que lo mandaste') + '.') : '') +
      '</ul>' +
      (typeof EXA !== 'undefined' && !x.fijo ? '<button type="button" class="ini-instr-formato" data-h="formato">Cambiar preguntas, tiempo o penalización ›</button>' : '');
    hoja('Antes de empezar', x.titulo, cuerpo,
      '<button type="button" class="cal-btn" data-h="cerrar">Ahora no</button><button type="button" class="cal-btn primario" data-h="empezar">Empezar examen</button>',
      (b, cerrar) => { cerrar(); if(b.dataset.h === 'empezar') PRU.empezarExamen(x, a); if(b.dataset.h === 'formato') EXA.abrir(); }, 'ini-instr-hoja');
  }
  // Solo el examen de esta semana (de hoy a 7 días); si no hay, una invitación a programarlo.
  const exaSemana = () => { const xs = exas(); return xs === undefined ? undefined : xs.find(x => x.dias <= 7) || null; };
  function examenSemana(){
    const x = exaSemana();
    if(x === undefined || typeof CAL === 'undefined' || !CAL.nuevoExamen) return '';
    const cab = etiqueta(x && x.dias === 0 ? 'Examen de hoy' : 'Examen de esta semana', '<button type="button" class="ini-link" data-ini="nuevo-examen">+ Programar</button>');
    if(!x) return '<section class="ini-sec">' + cab + '<button type="button" class="ini-exa-nuevo ancho" data-ini="nuevo-examen"><b>Sin examen esta semana</b><span>Prográmalo y elige qué entra: aquí verás cómo vas en esos temas</span></button></section>';
    return '<section class="ini-sec">' + cab + tarjetaExamen(x) + '</section>';
  }
  // El detalle de un examen: qué entra, con los nombres completos (cada ley con
  // sus títulos, y los temas del Específico con su número), y cómo vas en cada cosa.
  // Lo que entra en el examen: cómo vas en total (una tarjeta del color de cómo vas) y
  // una línea por tema (un anillo pequeño, el nombre corto y su %). Nada más.
  function abrirExamen(id){
    const x = (exas() || []).find(y => y.id === id);
    if(!x) return;
    const p = preparacion(x);
    const C = 2 * Math.PI * 15;
    const aro = pct => '<svg class="ini-aro" viewBox="0 0 36 36" aria-hidden="true"><circle cx="18" cy="18" r="15" class="fondo"/>' +
      (pct ? '<circle cx="18" cy="18" r="15" class="valor" stroke-dasharray="' + (C * pct / 100).toFixed(2) + ' ' + C.toFixed(2) + '" transform="rotate(-90 18 18)"/>' : '') + '</svg>';
    const fila = t => {
      if(t.cargando) return '<li class="ini-entra">' + aro(0) + '<span class="ini-entra-n">' + esc(t.nombre) + '</span><span class="skel" style="width:34px;height:16px"></span></li>';
      const pct = pctVerde(t), col = pct >= 80 ? 'bien' : pct >= 50 ? 'medio' : 'flojo';
      return '<li class="ini-entra ' + col + '">' + aro(pct) + '<span class="ini-entra-n">' + esc(t.nombre) + '</span><b class="ini-entra-pct">' + pct + '%</b></li>';
    };
    const cuerpo =
      (p.listo ? '<div class="ini-exa-total ' + p.nivel + '"><b>' + p.pct + '<small>%</small></b><span>' + NIVELES[p.nivel][0] + '</span>' +
        '<i class="ini-exa-total-barra"><i style="width:' + p.pct + '%"></i></i></div>' : '') +
      '<ul class="ini-entra-lista">' + p.enOrden.map(fila).join('') + '</ul>' +
      (x.de || x.para ? '<div class="ini-exa-gente" data-gente><div class="ini-exa-gente-t">' + (x.de ? 'Te lo ha mandado ' + esc(x.de) : 'Mandado a ' + x.para + (x.para === 1 ? ' persona' : ' personas')) + '</div>' +
        '<span class="skel" style="width:60%;height:14px"></span></div>' : '');
    if(x.de || x.para) notasExamen(x);
    hoja('Examen', x.dias > 1 ? x.cuando + ' · en ' + x.dias + ' días' : x.dias ? 'Mañana' : 'Hoy', cuerpo,
      (x.de ? '' : '<button type="button" class="cal-btn" data-h="editar">Editar</button>') + '<button type="button" class="cal-btn primario" data-h="cerrar">Listo</button>',
      (b, cerrar) => { cerrar(); if(b.dataset.h === 'editar') CAL.editar(x.id); }, 'ini-exa-hoja');
  }

  // Examen compartido: quién lo tiene y la nota de cada uno (o si aún no lo ha hecho).
  async function notasExamen(x){
    const { data, error } = await sb.rpc('calendario_notas_examen', { p_id: x.id });
    const el = document.querySelector('#iniHoja [data-gente]');
    if(!el) return;
    const sk = el.querySelector('.skel');
    if(error || !data){ if(sk) sk.remove(); return; }
    const nombre = r => r.yo ? 'Tú' : esc(String(r.email || '').split('@')[0]);
    if(sk) sk.outerHTML = '<ul class="ini-exa-notas">' + data.map(r => '<li' + (r.yo ? ' class="yo"' : '') + '><span>' + nombre(r) + '</span>' +
      (r.nota != null ? '<b class="' + (r.nota >= 5 ? 'ok' : 'mal') + '">' + notaTxt(r.nota) + '</b>' : '<i>' + (r.hecho ? 'Hecho' : 'Sin hacer') + '</i>') + '</li>').join('') + '</ul>';
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

  /* ---------- pantalla grande: la cabecera ancha con lo de hoy dentro ----------
     A la izquierda la fecha, «Hoy», cuántas van y el examen; a la derecha las
     tareas de hoy, cada una con a qué pertenece. La primera pendiente, en blanco.
     Al lado, lo que está a medias (en tarjeta de contraste) y el examen. */
  function cabeceraGrande(r){
    const n = r ? r.lista.length : 0, hechas = r ? r.hechas : 0;
    let lista;
    if(!r) lista = '<div class="ini-ht"><span class="skel" style="width:60%;height:16px"></span></div>';
    else if(!n) lista = '<button type="button" class="ini-ht ini-ht-nueva" data-ini="nueva">+ Apuntar algo para hoy</button>';
    else {
      const orden = r.lista.slice().sort((a, b) => a.hecho - b.hecho);
      let primera = true;
      lista = orden.slice(0, MAX_TAREAS).map(t => {
        const fin = t.test && t.test.terminados === t.test.tests;
        const ya = !t.hecho && primera;
        if(!t.hecho) primera = false;
        const accion = t.test && !fin && !t.hecho
          ? '<button type="button" class="ini-ht-ir" data-ini="test" data-id="' + esc(t.id) + '">' + (t.test.hechas ? 'Seguir' : t.simc ? 'Hacer' : 'Empezar') + '</button>'
          : '<button type="button" class="ini-ht-check" data-ini="marcar" data-id="' + esc(t.id) + '" aria-label="' + (t.hecho ? 'Desmarcar' : 'Marcar como hecha') + '">' + CHECK + '</button>';
        return '<div class="ini-ht' + (ya ? ' ya' : '') + (t.hecho ? ' hecha' : '') + '" role="button" tabindex="0" data-ini="ver" data-id="' + esc(t.id) + '" aria-label="Ver ' + esc(t.titulo) + '">' +
          '<span class="ini-ht-txt"><b>' + esc(t.titulo) + '</b><span>' + esc(t.cat) + '</span></span>' + accion + '</div>';
      }).join('') + (n > MAX_TAREAS ? '<button type="button" class="ini-ht-mas" data-ini="calendario">y ' + (n - MAX_TAREAS) + ' más en el calendario ›</button>' : '');
    }
    const d = new Date(), dia = DIAS[d.getDay()];
    return '<div class="ini-heropc"><div class="ini-heropc-izq"><div class="ini-fecha">' + dia.charAt(0).toUpperCase() + dia.slice(1) + '</div>' +
        '<h1 class="ini-h ini-heropc-dia">' + d.getDate() + '</h1><div class="ini-heropc-mes">' + MESES[d.getMonth()] + '</div>' +
        (n ? '<div class="ini-heropc-n"><b>' + hechas + ' de ' + n + '</b><span>' + (n === 1 ? 'tarea hecha' : 'tareas hechas') + '</span></div>' : '') + examen() +
        '<button type="button" class="ini-heropc-add" data-ini="nueva">+ Añadir tarea</button></div>' +
      '<div class="ini-heropc-tareas">' + lista + '</div></div>';
  }

  function pintar(){
    const root = document.getElementById('inicioRoot');
    if(!root || !document.getElementById('screen-inicio').classList.contains('active') || !currentUser) return;
    const r = typeof CAL !== 'undefined' ? CAL.resumenHoy() : null;
    const enCurso = continuar() + pruebaAMedias() + espAMedias() + marcadasHoy() + piscina();
    const lado = examenSemana() + (exaSemana() ? '' : cifras());
    // Móvil y pantalla grande: se pintan los dos y el CSS enseña el que toca.
    root.innerHTML = '<div class="ini-movil">' + cabecera(r, enCurso) +
        '<div class="ini-cuerpo"><div class="ini-col">' + hoyCompacto(r) + '</div><div class="ini-col">' + lado + '</div></div></div>' +
      '<div class="ini-pc">' + cabeceraGrande(r) + panelSeguir(enCurso) + comoVasGrande() + '</div>';
  }

  // Pantalla grande: al lado del recuadro, un panel «Para seguir» con una fila por cosa:
  // lo que está a medias, las marcadas de hoy y el examen de la semana.
  function filaExamen(){
    const x = exaSemana();
    if(x === undefined || typeof CAL === 'undefined' || !CAL.nuevoExamen) return '';
    const fila = (attrs, ico, tit, sub, clase) => '<button type="button" class="ini-continuar ini-fila-exa' + (clase ? ' ' + clase : '') + '" ' + attrs + '>' +
      '<span class="ini-continuar-ico">' + ico + '</span><span class="ini-continuar-txt"><b>' + tit + '</b><span>' + sub + '</span></span><span class="ini-flecha">' + FLECHA + '</span></button>';
    if(!x) return fila('data-ini="nuevo-examen"', '+', 'Programar examen', 'Sin examen esta semana');
    if(x.dias === 0 && x.resultado) return fila('data-ini="exa" data-id="' + esc(x.id) + '"', '✓', 'Examen hecho', 'Nota ' + notaTxt(x.resultado.nota));
    if(x.dias === 0) return fila('data-ini="exa-entrar" data-id="' + esc(x.id) + '"', '!', 'Hoy es el examen', 'Entrar al examen', 'hoy');
    if(!x.legis.length && !x.esp.length) return fila('data-ini="exa-editar" data-id="' + esc(x.id) + '"', '◎', 'Examen · ' + esc(cuandoExa(x)), 'Elige qué entra');
    const p = preparacion(x), flojo = p.temas.find(t => !t.cargando);
    return fila('data-ini="exa" data-id="' + esc(x.id) + '" style="--c:' + NIVELES[p.nivel][1] + '"', anilloExa(p), 'Examen · ' + esc(cuandoExa(x)),
      p.listo ? p.pct + ' % dominado' + (flojo && p.temas.length > 1 ? ' · flojo: ' + esc(flojo.nombre) : '') : 'Cargando…', 'con-anillo');
  }
  function panelSeguir(enCurso){
    const filas = enCurso + filaExamen();
    return '<div class="ini-panel"><div class="ini-panel-t">Para seguir</div>' +
      (filas || '<div class="ini-panel-vacio">Nada a medias. ¡Al día!</div>') + '</div>';
  }
  // Debajo, a todo el ancho: cómo vas en general, con cifras grandes y su barra (llena la pantalla con algo útil).
  function comoVasGrande(){
    const out = [];
    const C = 2 * Math.PI * 42;
    const n = x => Number(x).toLocaleString('es-ES');
    // Un anillo grande con el % (o la cifra) dentro y, al lado, el nombre y en pequeño las preguntas.
    const col = (clave, dentro, pct, color, tit, lineas, clase) => '<button type="button" class="ini-cv' + (clase ? ' ' + clase : '') + '" data-ini="' + clave + '" style="--c:' + color + '">' +
      '<span class="ini-cv-aro"><svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="42" class="fondo"/>' +
        (pct ? '<circle cx="50" cy="50" r="42" class="valor" stroke-dasharray="' + (C * Math.min(100, pct) / 100).toFixed(1) + ' ' + C.toFixed(1) + '" transform="rotate(-90 50 50)"/>' : '') +
        '</svg><b>' + dentro + '</b></span>' +
      '<span class="ini-cv-txt"><span class="ini-cv-t">' + tit + '</span>' + lineas.map(l => '<span>' + l + '</span>').join('') + '</span></button>';
    // Con examen esta semana: un anillo por cada tema que entra (su % dominado y, en pequeño, sus preguntas).
    const x = exaSemana();
    if(x && (x.legis.length || x.esp.length)){
      const p = preparacion(x);
      const temas = p.enOrden.map(t => {
        if(t.cargando) return col('exa', '…', 0, 'var(--line)', esc(t.nombre), ['Cargando…']);
        const pct = pctVerde(t), color = pct >= 80 ? 'var(--green)' : pct >= 50 ? 'var(--amber)' : 'var(--coral)';
        const vistas = t.verde + t.amarillo + t.rojo;
        return col('exa', pct + '<small>%</small>', pct, color, esc(t.nombre),
          ['<strong>' + n(t.verde) + '</strong> dominadas de ' + n(t.total), '<strong>' + n(vistas) + '</strong> vistas']).replace('data-ini="exa"', 'data-ini="exa" data-id="' + esc(x.id) + '"');
      });
      return '<div class="ini-cvg ini-cvg-exa"><div class="ini-cvg-t">Examen · ' + esc(cuandoExa(x)) + '<span>' + (p.listo ? p.pct + ' % dominado en total' : '') + '</span></div>' +
        '<div class="ini-cvg-temas">' + temas.join('') + '</div></div>';
    }
    const pool = datosListos() ? QUESTIONS_POOL : null;
    if(featureEnabled('fallos') && pool){
      const f = pool.filter(q => q.masteryStatus === 'red' && !q.fallosHidden).length;
      out.push(col('fallos', n(f), f ? 100 : 0, 'var(--coral)', 'Por repasar', [f === 1 ? 'pregunta fallada' : 'preguntas falladas', '<em>Repasar ›</em>'], f ? 'aviso' : ''));
    }
    if(featureEnabled('estadisticas')){
      const fila = (clave, tit, r, color) => {
        const pct = r.total ? Math.round(r.verde / r.total * 100) : 0;
        const vistas = r.vistas != null ? r.vistas : r.verde + (r.amarillo || 0) + (r.rojo || 0);
        out.push(col(clave, pct + '<small>%</small>', pct, color, tit, ['<strong>' + n(r.verde) + '</strong> dominadas', '<strong>' + n(vistas) + '</strong> vistas de ' + n(r.total)]));
      };
      if(pool){
        const c = st => pool.filter(q => q.masteryStatus === st).length;
        const r = { total: pool.length, verde: c('green') };
        r.vistas = r.verde + c('yellow') + c('red');
        fila('stats-legis', 'Legislación', r, 'var(--green)');
      }
      if(featureEnabled('especifico') && typeof ESTE !== 'undefined'){
        const r = ESTE.resumen();
        if(r) fila('stats-esp', 'Específico', r, 'var(--orange)');
      }
    }
    if(!out.length) return '';
    return '<div class="ini-cvg" style="--n:' + out.length + '">' + out.join('') + '</div>';
  }

  function onClick(e){
    const el = e.target.closest('[data-ini]');
    if(!el || el.disabled) return;
    switch(el.dataset.ini){
      case 'marcar': e.stopPropagation(); CAL.marcar(el.dataset.id); break;
      case 'test': e.stopPropagation(); CAL.seguirTest(el.dataset.id); break;
      case 'ver': CAL.verTarea(el.dataset.id); break;
      case 'exa': abrirExamen(el.dataset.id); break;
      case 'exa-entrar': entrarExamen(el.dataset.id); break;
      case 'hoy': abrirHoy(); break;
      case 'exa-editar': CAL.editar(el.dataset.id); break;
      case 'nueva': e.stopPropagation(); CAL.nueva(); break;
      case 'nuevo-examen': CAL.nuevoExamen(); break;
      case 'calendario': showScreen('screen-calendario'); break;
      case 'piscina': showScreen('screen-piscina'); break;
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
        if(e.key === 'Enter' && e.target.dataset && e.target.dataset.ini === 'hoy') abrirHoy();
      });
    }
    if(typeof CAL !== 'undefined') CAL.asegurar();
    pintar();
  }
  return { abrir, pintar };
})();
