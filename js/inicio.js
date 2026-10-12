/* Inicio: de un vistazo, lo que toca hoy (tareas del calendario, que se
   pueden marcar aquí mismo; tocando el recuadro se abre el calendario en
   grande para editarlo todo), la cuenta atrás del examen (js/examen.js), el test a medias, el Simulacro conjunto y cómo
   vas en Legislación y en el Específico. */
const INICIO = (function(){
  const MODOS = { estudio: 'Modo estudio', fallos: 'Fallos', inteligente: 'Test Inteligente', simulacro: 'Simulacro', examen: 'Examen' };
  const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const FRASES = [
    'Poco a poco se llega lejos.',
    'Un rato cada día vale más que un atracón.',
    'Lo que repasas hoy, no lo olvidas mañana.',
    'Constancia antes que intensidad.',
    'Cada pregunta acertada cuenta.',
    'Hoy un poco mejor que ayer.',
    'El examen se aprueba día a día.'
  ];
  const FLECHA = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>';
  const CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5 10 17l9-10"/></svg>';
  const ICO = {
    conjunto: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M16 22h2a2 2 0 0 0 2-2V8a2.4 2.4 0 0 0-.706-1.706l-3.588-3.588A2.4 2.4 0 0 0 14 2H6a2 2 0 0 0-2 2v2.85"/><path d="M14 2v5a1 1 0 0 0 1 1h5"/><path d="M8 14v2.2l1.6 1"/><circle cx="8" cy="16" r="6"/></svg>',
    llama: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.43-2.29 1-3a2.5 2.5 0 0 0 2.5 2.5Z"/></svg>',
    reanudar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="6 3 20 12 6 21 6 3"/></svg>'
  };
  const MAX_TAREAS = 5;
  const esc = s => escapeHtml(String(s == null ? '' : s));
  const datosListos = () => typeof appDataReady !== 'undefined' && appDataReady && QUESTIONS_POOL.length > 0;

  function saludo(){
    const d = new Date(), h = d.getHours();
    const hola = h < 6 ? 'Buenas noches' : h < 14 ? 'Buenos días' : h < 21 ? 'Buenas tardes' : 'Buenas noches';
    const fecha = DIAS[d.getDay()] + ', ' + d.getDate() + ' de ' + MESES[d.getMonth()];
    const frase = FRASES[Math.floor(d.getTime() / 864e5) % FRASES.length];
    return '<div class="ini-saludo"><h1>' + hola + '</h1>' +
      '<div class="ini-fecha">' + fecha.charAt(0).toUpperCase() + fecha.slice(1) + ' · ' + frase + '</div></div>';
  }

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
    let cuerpo;
    if(!r){
      cuerpo = '<div class="ini-hoy-cab"><div class="ini-hoy-tit">Hoy</div></div><div class="skel-list">' +
        '<div class="skel-row"><span class="skel skel-dot"></span><span class="skel-lines"><span class="skel skel-line" style="width:60%"></span></span></div>' +
        '<div class="skel-row"><span class="skel skel-dot"></span><span class="skel-lines"><span class="skel skel-line" style="width:45%"></span></span></div></div>';
    } else {
      const n = r.lista.length, pct = n ? Math.round(r.hechas / n * 100) : 0;
      const msg = !n ? 'Nada apuntado para hoy' : r.hechas === n ? '¡Todo hecho!' : 'Te queda' + (n - r.hechas === 1 ? ' 1 cosa' : 'n ' + (n - r.hechas) + ' cosas');
      // Primero lo pendiente, para que se vea lo que falta.
      const orden = r.lista.slice().sort((a, b) => a.hecho - b.hecho);
      const filas = orden.slice(0, MAX_TAREAS).map(t =>
        '<div class="ini-tarea' + (t.hecho ? ' hecha' : '') + '" style="--c:' + t.color + '" role="button" tabindex="0" data-ini="ver" data-id="' + esc(t.id) + '" aria-label="Ver ' + esc(t.titulo) + '">' +
          '<button type="button" class="ini-check" data-ini="marcar" data-id="' + esc(t.id) + '" aria-label="' + (t.hecho ? 'Desmarcar' : 'Marcar como hecha') + '">' + CHECK + '</button>' +
          '<span class="ini-tarea-txt"><span class="ini-tarea-t">' + esc(t.titulo) + '</span>' +
            '<span class="ini-tarea-cat">' + t.icono + esc(t.cat) + (t.nota ? ' · ' + esc(t.nota) : '') + '</span>' + barraTest(t.test) + '</span>' +
          (t.test ? '<button type="button" class="ini-tarea-ir" data-ini="test" data-id="' + esc(t.id) + '">' + (t.test.terminados === t.test.tests ? 'Repasar' : t.test.hechas ? 'Continuar' : 'Empezar') + '</button>' : '') +
        '</div>').join('');
      const chips = [
        r.racha ? '<span class="ini-chip fuego">' + ICO.llama + '<b>' + r.racha + '</b> ' + (r.racha === 1 ? 'día' : 'días') + ' de racha</span>' : '',
        r.atrasadas ? '<span class="ini-chip aviso"><b>' + r.atrasadas + '</b> ' + (r.atrasadas === 1 ? 'atrasada' : 'atrasadas') + '</span>' : '',
        '<span class="ini-chip">Mañana: <b>' + r.manana + '</b></span>'
      ].join('');
      cuerpo = '<div class="ini-hoy-cab"><div><div class="ini-hoy-tit">Hoy</div><div class="ini-hoy-msg">' + msg + '</div></div>' +
          (n ? '<div class="ini-hoy-num"><b>' + r.hechas + '</b>/' + n + '</div>' : '') + '</div>' +
        (n ? '<span class="ini-barra ini-barra-hoy"><i style="width:' + pct + '%"></i></span>' : '') +
        (n ? '<div class="ini-tareas">' + filas + '</div>' + (n > MAX_TAREAS ? '<div class="ini-mas">y ' + (n - MAX_TAREAS) + ' más…</div>' : '')
           : '<button type="button" class="ini-anadir" data-ini="nueva"><span>+</span> Apuntar algo para hoy</button>') +
        '<div class="ini-chips">' + chips + '</div>';
    }
    // Cada tarea abre su ventanita; al calendario se va con su botón.
    return '<div class="ini-hoy">' + cuerpo +
      '<div class="ini-hoy-pie"><button type="button" data-ini="calendario">Ver calendario completo ' + FLECHA + '</button></div></div>';
  }


  // El Simulacro conjunto (Legislación + Específico): una fila con el mismo estilo que «Tu progreso».
  function conjunto(){
    if(typeof PRU === 'undefined' || !PRU.conjuntoDisponible()) return '';
    return '<div class="section-row"><div class="section-title">Practicar</div><div class="section-rule"></div></div>' +
      '<div class="ini-progreso"><button type="button" class="ini-prog-fila ini-conjunto" data-ini="conjunto">' +
        '<span class="ini-conjunto-ico">' + ICO.conjunto + '</span>' +
        '<span class="ini-conjunto-txt"><b>Simulacro conjunto</b><span>Legislación + Específico, a tu medida</span></span>' +
        '<span class="ini-flecha">' + FLECHA + '</span></button></div>';
  }

  // Cómo vas: Legislación y, si lo tienes, el Específico, cada uno con su barra
  // de dominio (verde, amarillo, rojo; azul lo no visto). Pulsar abre su pestaña de Estadísticas.
  function filaProgreso(clave, nombre, r){
    if(!r) return '<div class="ini-prog-fila"><div class="ini-prog-cab"><span class="ini-prog-nombre">' + nombre + '</span></div>' +
      '<div class="skel-list"><div class="skel-row"><span class="skel-lines"><span class="skel skel-line" style="width:70%"></span></span></div></div></div>';
    const p = n => r.total ? (n / r.total * 100).toFixed(2) : 0;
    return '<button type="button" class="ini-prog-fila" data-ini="' + clave + '">' +
      '<div class="ini-prog-cab"><span class="ini-prog-nombre">' + nombre + '</span>' +
        '<span class="ini-prog-pct">' + formatPctExact(r.total ? r.verde / r.total * 100 : 0) + '</span><span class="ini-flecha">' + FLECHA + '</span></div>' +
      '<div class="ini-dominio"><i class="v" style="width:' + p(r.verde) + '%"></i><i class="a" style="width:' + p(r.amarillo) + '%"></i><i class="r" style="width:' + p(r.rojo) + '%"></i></div>' +
      '<div class="ini-progreso-datos"><span><b>' + r.vistas + '</b> de ' + r.total + ' vistas</span><span><b>' + r.verde + '</b> dominadas</span></div>' +
      '</button>';
  }
  function progreso(){
    if(!featureEnabled('estadisticas')) return '';
    const cab = '<div class="section-row"><div class="section-title">Tu progreso</div><div class="section-rule"></div></div>';
    let legis = null;
    if(datosListos()){
      const pool = QUESTIONS_POOL, cuenta = st => pool.filter(q => q.masteryStatus === st).length;
      legis = { total: pool.length, verde: cuenta('green'), amarillo: cuenta('yellow'), rojo: cuenta('red') };
      legis.vistas = legis.verde + legis.amarillo + legis.rojo;
    }
    const conEsp = featureEnabled('especifico') && typeof ESTE !== 'undefined';
    return cab + '<div class="ini-progreso">' + filaProgreso('stats-legis', 'Legislación', legis) +
      (conEsp ? filaProgreso('stats-esp', 'Específico', ESTE.resumen()) : '') + '</div>';
  }

  function pintar(){
    const root = document.getElementById('inicioRoot');
    if(!root || !document.getElementById('screen-inicio').classList.contains('active') || !currentUser) return;
    root.innerHTML = saludo() + continuar() + pruebaAMedias() + (typeof EXA !== 'undefined' ? EXA.tarjeta() : '') + hoy() + conjunto() + progreso();
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
