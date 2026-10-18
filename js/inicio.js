/* Inicio: arriba una cabecera de color con la fecha, cuántas tareas quedan
   hoy (con su anillo), los días que faltan para el examen y lo que está a
   medias. Debajo, sin recuadros: las tareas de hoy del calendario (se marcan
   aquí mismo; cada una abre su ventanita) con lo próximo apuntado, una fila
   de cifras (por repasar, Legislación y Específico) y la semana con un
   punto por tarea (cada día abre el calendario). */
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
  // Las tareas de hoy del calendario, como lista (sin recuadro).
  function hoy(r){
    const n = r ? r.lista.length : 0;
    const cab = etiqueta('Tareas de hoy', '<button type="button" class="ini-link" data-ini="calendario">Calendario ' + FLECHA + '</button>');
    let cuerpo;
    if(!r) cuerpo = '<div class="skel-list">' +
      '<div class="skel-row"><span class="skel skel-dot"></span><span class="skel-lines"><span class="skel skel-line" style="width:60%"></span></span></div>' +
      '<div class="skel-row"><span class="skel skel-dot"></span><span class="skel-lines"><span class="skel skel-line" style="width:45%"></span></span></div></div>';
    else if(!n) cuerpo = '<button type="button" class="ini-anadir" data-ini="nueva"><span>+</span> Apuntar algo para hoy</button>';
    else {
      // Primero lo pendiente, para que se vea lo que falta.
      const orden = r.lista.slice().sort((a, b) => a.hecho - b.hecho);
      cuerpo = '<div class="ini-tareas">' + orden.slice(0, MAX_TAREAS).map(t => {
        const fin = t.test && t.test.terminados === t.test.tests;
        return '<div class="ini-tarea' + (t.hecho ? ' hecha' : '') + '" style="--c:' + t.color + '" role="button" tabindex="0" data-ini="ver" data-id="' + esc(t.id) + '" aria-label="Ver ' + esc(t.titulo) + '">' +
          '<button type="button" class="ini-check" data-ini="marcar" data-id="' + esc(t.id) + '" aria-label="' + (t.hecho ? 'Desmarcar' : 'Marcar como hecha') + '">' + CHECK + '</button>' +
          '<span class="ini-tarea-txt"><span class="ini-tarea-t">' + esc(t.titulo) + '</span>' +
            '<span class="ini-tarea-cat">' + esc(t.cat) + (t.nota ? ' · ' + esc(t.nota) : '') + '</span>' + barraTest(t.test) + '</span>' +
          (t.test ? (fin ? '<span class="ini-tarea-ir hecho">Hecho ✓</span>'
            : '<button type="button" class="ini-tarea-ir" data-ini="test" data-id="' + esc(t.id) + '">' + (t.test.hechas ? 'Seguir' : t.simc ? 'Hacer' : 'Empezar') + '</button>') : '') +
        '</div>';
      }).join('') + '</div>' +
      (n > MAX_TAREAS ? '<button type="button" class="ini-mas" data-ini="calendario">y ' + (n - MAX_TAREAS) + ' más en el calendario</button>' : '');
    }
    return '<section class="ini-sec">' + cab + cuerpo + proximo() + '</section>';
  }

  // Lo próximo que hay apuntado en el calendario (después de hoy): una línea debajo de las tareas.
  function proximo(){
    const x = typeof CAL !== 'undefined' ? CAL.proxima() : undefined;
    if(!x) return '';
    return '<button type="button" class="ini-prox" data-ini="dia" data-f="' + x.f + '" style="--c:' + x.color + '">' +
      '<span class="ini-prox-l">Próximo</span><span class="ini-prox-t">' + esc(x.titulo) + '</span>' +
      '<span class="ini-prox-f">' + esc(x.cuando) + (x.mas ? ' · +' + x.mas : '') + '</span></button>';
  }

  // Cómo vas: una fila de cifras (por repasar, Legislación, Específico). Cada una abre lo suyo.
  function cifra(clave, valor, txt, clase){
    return '<button type="button" class="ini-cifra' + (clase ? ' ' + clase : '') + '" data-ini="' + clave + '"><b>' + valor + '</b><span>' + txt + '</span></button>';
  }
  const pctDe = r => r && r.total ? Math.round(r.verde / r.total * 100) : 0;
  const skelCifra = txt => '<div class="ini-cifra"><span class="skel" style="width:44px;height:24px"></span><span>' + txt + '</span></div>';
  function cifras(){
    const out = [];
    if(featureEnabled('fallos')){
      if(!datosListos()) out.push(skelCifra('por repasar'));
      else {
        const n = QUESTIONS_POOL.filter(q => q.masteryStatus === 'red' && !q.fallosHidden).length;
        out.push(cifra('fallos', n, 'por repasar', n ? 'aviso' : ''));
      }
    } else {
      const s = typeof CAL !== 'undefined' ? CAL.semana() : null;
      if(s){
        const tot = s.dias.reduce((a, d) => a + d.puntos.length, 0), hechas = s.dias.reduce((a, d) => a + d.puntos.filter(p => p.h).length, 0);
        out.push(cifra('calendario', hechas + '<small>/' + tot + '</small>', 'tareas esta semana'));
      }
    }
    if(featureEnabled('estadisticas')){
      if(!datosListos()) out.push(skelCifra('Legislación'));
      else {
        const pool = QUESTIONS_POOL;
        out.push(cifra('stats-legis', pctDe({ total: pool.length, verde: pool.filter(q => q.masteryStatus === 'green').length }) + '<small>%</small>', 'Legislación'));
      }
      if(featureEnabled('especifico') && typeof ESTE !== 'undefined'){
        const r = ESTE.resumen();
        out.push(r ? cifra('stats-esp', pctDe(r) + '<small>%</small>', 'Específico') : skelCifra('Específico'));
      }
    }
    if(!out.length) return '';
    return '<section class="ini-sec">' + etiqueta('Cómo vas') + '<div class="ini-cifras" style="--n:' + out.length + '">' + out.join('') + '</div></section>';
  }

  // La semana (de lunes a domingo) con un punto por tarea: cada día abre el calendario en ese día.
  function semana(){
    const s = typeof CAL !== 'undefined' ? CAL.semana() : null;
    if(!s) return '';
    return '<section class="ini-sec">' + etiqueta('Esta semana' + (s.atrasadas ? ' · <b class="ini-aviso">' + s.atrasadas + (s.atrasadas === 1 ? ' atrasada' : ' atrasadas') + '</b>' : '')) +
      '<div class="ini-semana">' + s.dias.map(d =>
        '<button type="button" class="ini-dia' + (d.hoy ? ' hoy' : '') + (d.pasado ? ' pasado' : '') + '" data-ini="dia" data-f="' + d.f + '" aria-label="' + esc(d.nombre) + ', ' + d.puntos.length + ' tareas">' +
          '<span class="ini-dia-l">' + d.letra + '</span><span class="ini-dia-n">' + d.n + '</span>' +
          '<span class="ini-puntos">' + d.puntos.slice(0, 4).map(p => '<i style="background:' + p.c + '"' + (p.h ? ' class="h"' : '') + '></i>').join('') + '</span></button>').join('') +
      '</div></section>';
  }

  // Los días que faltan para el examen (js/examen.js), en una línea de la cabecera.
  function examen(){
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
      '<div class="ini-cuerpo"><div class="ini-col">' + hoy(r) + '</div><div class="ini-col">' + cifras() + semana() + '</div></div>' + fijo;
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
