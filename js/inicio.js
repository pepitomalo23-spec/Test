/* Inicio: de un vistazo, lo que toca hoy (tareas del calendario, que se
   pueden marcar aquí mismo; cada una abre su ventanita), la semana con sus
   puntos (lleva al calendario), la cuenta atrás del examen (js/examen.js),
   el test a medias, cómo vas en Legislación y en el Específico y el
   Simulacro conjunto. Diseño sobrio: listas con líneas finas en vez de
   tarjetas dentro de tarjetas, y el color solo para la categoría y lo
   importante. En ordenador, dos columnas. */
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
  const etiqueta = (txt, enlace) => '<div class="ini-label"><span>' + txt + '</span>' + (enlace || '') + '</div>';

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

  // Tarea con un test del calendario: lo que lleva y lo que falta.
  function barraTest(x){
    if(!x) return '';
    const pct = x.total ? Math.round(x.hechas / x.total * 100) : 0;
    const txt = x.tests > 1 ? x.terminados + '/' + x.tests + ' tests' : x.hechas ? x.hechas + '/' + x.total : 'Sin empezar';
    // Varios tests: un tramo por test (no se mezclan los avances).
    const barra = x.tests > 1 ? CAL.barraTramos(x.partes) : '<span class="ini-barra"><i style="width:' + pct + '%"></i></span>';
    return '<span class="ini-tarea-test">' + barra + '<span>' + txt + '</span></span>';
  }
  function hoy(){
    const r = typeof CAL !== 'undefined' ? CAL.resumenHoy() : null;
    const n = r ? r.lista.length : 0;
    const cab = '<div class="ini-cab"><div><div class="ini-fecha">' + fechaHoy() + '</div><h1 class="ini-h">Hoy</h1></div>' +
      (n ? '<div class="ini-cuenta"><b>' + r.hechas + '</b> de ' + n + (r.hechas === n ? ' · todo hecho' : ' hechas') + '</div>' : '') + '</div>';
    if(!r) return cab + '<div class="skel-list">' +
      '<div class="skel-row"><span class="skel skel-dot"></span><span class="skel-lines"><span class="skel skel-line" style="width:60%"></span></span></div>' +
      '<div class="skel-row"><span class="skel skel-dot"></span><span class="skel-lines"><span class="skel skel-line" style="width:45%"></span></span></div></div>';
    if(!n) return cab + '<button type="button" class="ini-anadir" data-ini="nueva"><span>+</span> Apuntar algo para hoy</button>';
    // Primero lo pendiente, para que se vea lo que falta.
    const orden = r.lista.slice().sort((a, b) => a.hecho - b.hecho);
    const filas = orden.slice(0, MAX_TAREAS).map(t => {
      const fin = t.test && t.test.terminados === t.test.tests;
      return '<div class="ini-tarea' + (t.hecho ? ' hecha' : '') + '" style="--c:' + t.color + '" role="button" tabindex="0" data-ini="ver" data-id="' + esc(t.id) + '" aria-label="Ver ' + esc(t.titulo) + '">' +
        '<button type="button" class="ini-check" data-ini="marcar" data-id="' + esc(t.id) + '" aria-label="' + (t.hecho ? 'Desmarcar' : 'Marcar como hecha') + '">' + CHECK + '</button>' +
        '<span class="ini-tarea-txt"><span class="ini-tarea-t">' + esc(t.titulo) + '</span>' +
          '<span class="ini-tarea-cat"><i class="ini-punto"></i>' + esc(t.cat) + (t.nota ? ' · ' + esc(t.nota) : '') + '</span>' + barraTest(t.test) + '</span>' +
        (t.test ? (fin ? '<span class="ini-tarea-ir hecho">Completado</span>'
          : '<button type="button" class="ini-tarea-ir' + (t.hecho ? '' : ' pri') + '" data-ini="test" data-id="' + esc(t.id) + '">' + (t.test.hechas ? 'Continuar' : 'Empezar') + '</button>') : '') +
      '</div>';
    }).join('');
    return cab + '<div class="ini-tareas">' + filas + '</div>' +
      (n > MAX_TAREAS ? '<button type="button" class="ini-mas" data-ini="calendario">y ' + (n - MAX_TAREAS) + ' más en el calendario</button>' : '');
  }

  // La semana (de lunes a domingo) con un punto por tarea: cada día abre el calendario en ese día.
  function semana(){
    const s = typeof CAL !== 'undefined' ? CAL.semana() : null;
    if(!s) return '';
    const extra = (s.racha ? ' · racha de ' + s.racha + (s.racha === 1 ? ' día' : ' días') : '') +
      (s.atrasadas ? ' · <b class="ini-aviso">' + s.atrasadas + (s.atrasadas === 1 ? ' atrasada' : ' atrasadas') + '</b>' : '');
    return '<div class="ini-bloque">' + etiqueta('Esta semana' + extra, '<button type="button" class="ini-link" data-ini="calendario">Calendario ' + FLECHA + '</button>') +
      '<div class="ini-semana">' + s.dias.map(d =>
        '<button type="button" class="ini-dia' + (d.hoy ? ' hoy' : '') + (d.pasado ? ' pasado' : '') + '" data-ini="dia" data-f="' + d.f + '" aria-label="' + esc(d.nombre) + ', ' + d.puntos.length + ' tareas">' +
          '<span class="ini-dia-l">' + d.letra + '</span><span class="ini-dia-n">' + d.n + '</span>' +
          '<span class="ini-puntos">' + d.puntos.slice(0, 4).map(p => '<i style="background:' + p.c + '"' + (p.h ? ' class="h"' : '') + '></i>').join('') + '</span></button>').join('') +
      '</div></div>';
  }

  // El Simulacro conjunto (Legislación + Específico): una fila más.
  function conjunto(){
    if(typeof PRU === 'undefined' || !PRU.conjuntoDisponible()) return '';
    return '<div class="ini-bloque">' + etiqueta('Practicar') +
      '<button type="button" class="ini-fila" data-ini="conjunto"><span class="ini-fila-txt"><b>Simulacro conjunto</b><span>Legislación y Específico, con las preguntas y el tiempo que elijas</span></span>' +
        '<span class="ini-flecha">' + FLECHA + '</span></button></div>';
  }

  // Cómo vas: Legislación y, si lo tienes, el Específico, cada uno con su barra
  // de dominio (verde dominadas, amarillo a medias, rojo falladas; el resto, sin ver). Pulsar abre su pestaña de Estadísticas.
  function filaProgreso(clave, nombre, r){
    if(!r) return '<div class="ini-prog-fila"><div class="ini-prog-cab"><span class="ini-prog-nombre">' + nombre + '</span></div>' +
      '<div class="skel-list"><div class="skel-row"><span class="skel-lines"><span class="skel skel-line" style="width:70%"></span></span></div></div></div>';
    const p = n => r.total ? (n / r.total * 100).toFixed(2) : 0;
    return '<button type="button" class="ini-prog-fila" data-ini="' + clave + '">' +
      '<div class="ini-prog-cab"><span class="ini-prog-nombre">' + nombre + '</span>' +
        '<span class="ini-prog-pct">' + formatPctExact(r.total ? r.verde / r.total * 100 : 0) + '</span><span class="ini-flecha">' + FLECHA + '</span></div>' +
      '<div class="ini-dominio">' + [['v', r.verde], ['a', r.amarillo], ['r', r.rojo]].filter(([, n]) => n).map(([k, n]) => '<i class="' + k + '" style="width:' + p(n) + '%"></i>').join('') + '</div>' +
      '<div class="ini-progreso-datos"><span><b>' + r.verde + '</b> dominadas</span>' + (r.rojo ? '<span><b>' + r.rojo + '</b> falladas</span>' : '') +
        '<span><b>' + r.vistas + '</b> de ' + r.total + ' vistas</span></div>' +
      '</button>';
  }
  function progreso(){
    if(!featureEnabled('estadisticas')) return '';
    let legis = null;
    if(datosListos()){
      const pool = QUESTIONS_POOL, cuenta = st => pool.filter(q => q.masteryStatus === st).length;
      legis = { total: pool.length, verde: cuenta('green'), amarillo: cuenta('yellow'), rojo: cuenta('red') };
      legis.vistas = legis.verde + legis.amarillo + legis.rojo;
    }
    const conEsp = featureEnabled('especifico') && typeof ESTE !== 'undefined';
    return '<div class="ini-bloque">' + etiqueta('Progreso') + '<div class="ini-progreso">' + filaProgreso('stats-legis', 'Legislación', legis) +
      (conEsp ? filaProgreso('stats-esp', 'Específico', ESTE.resumen()) : '') + '</div></div>';
  }

  function pintar(){
    const root = document.getElementById('inicioRoot');
    if(!root || !document.getElementById('screen-inicio').classList.contains('active') || !currentUser) return;
    // Izquierda: lo de hoy y la semana. Derecha (debajo en el móvil): examen, progreso y práctica.
    const examen = typeof EXA !== 'undefined' ? EXA.tarjeta() : '';
    root.innerHTML = '<div class="ini-grid"><div class="ini-col">' + hoy() + continuar() + pruebaAMedias() + semana() + '</div>' +
      '<div class="ini-col">' + (examen ? '<div class="ini-bloque">' + etiqueta('Examen') + examen + '</div>' : '') + progreso() + conjunto() + '</div></div>';
    if(typeof PRU !== 'undefined' && PRU.conjuntoDisponible()) PRU.precargar();   // que el Simulacro conjunto abra al momento
  }

  function onClick(e){
    const el = e.target.closest('[data-ini]');
    if(!el || el.disabled) return;
    switch(el.dataset.ini){
      case 'marcar': e.stopPropagation(); CAL.marcar(el.dataset.id); break;
      case 'test': e.stopPropagation(); CAL.seguirTest(el.dataset.id); break;
      case 'ver': CAL.verTarea(el.dataset.id); break;
      case 'nueva': e.stopPropagation(); CAL.nueva(); break;
      case 'calendario': showScreen('screen-calendario'); break;
      case 'dia': CAL.abrirDia(el.dataset.f); break;
      case 'reanudar': resumeQuiz(); break;
      case 'conjunto': PRU.abrirConfig('conjunto'); break;
      case 'prueba': PRU.continuar(); break;
      case 'examen': EXA.abrir(); break;
      case 'oficial': e.stopPropagation(); EXA.simulacro(); break;
      case 'stats': showScreen('screen-stats'); break;
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
        if(e.key === 'Enter' && e.target.dataset && e.target.dataset.ini === 'examen') EXA.abrir();
      });
    }
    if(typeof CAL !== 'undefined') CAL.asegurar();
    pintar();
  }
  return { abrir, pintar };
})();
