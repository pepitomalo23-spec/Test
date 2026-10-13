/* Inicio: un panel por bloques. Arriba la fecha; luego el test a medias si
   lo hay, las tareas de hoy del calendario (se marcan aquí mismo; cada una
   abre su ventanita), lo que hay por repasar (Fallos), lo próximo apuntado
   en el calendario, el progreso de Legislación y del Específico con su
   círculo, y la semana con un punto por tarea (cada día abre el
   calendario). El Simulacro conjunto y el examen ya no están aquí: el
   simulacro se apunta en el calendario como una tarea más. */
const INICIO = (function(){
  const MODOS = { estudio: 'Modo estudio', fallos: 'Fallos', inteligente: 'Test Inteligente', simulacro: 'Simulacro', examen: 'Examen' };
  const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const FLECHA = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>';
  const CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5 10 17l9-10"/></svg>';
  const ICO = {
    llama: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.43-2.29 1-3a2.5 2.5 0 0 0 2.5 2.5Z"/></svg>',
    repaso: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>',
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
  // Un círculo de progreso (0 a 100) con el porcentaje dentro.
  function anillo(pct, color){
    const r = 15, c = 2 * Math.PI * r, v = Math.max(0, Math.min(100, pct));
    return '<svg class="ini-anillo" viewBox="0 0 36 36" aria-hidden="true"><circle cx="18" cy="18" r="' + r + '" class="fondo"/>' +
      (v > 0 ? '<circle cx="18" cy="18" r="' + r + '" class="valor" style="stroke:' + color + '" stroke-dasharray="' + (c * v / 100).toFixed(2) + ' ' + c.toFixed(2) + '" transform="rotate(-90 18 18)"/>' : '') +
      '<text x="18" y="21.2" text-anchor="middle">' + Math.round(v) + '%</text></svg>';
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
    const n = r ? r.lista.length : 0;
    const cab = etiqueta('Tareas de hoy', n ? '<span class="ini-cuenta"><b>' + r.hechas + '</b> de ' + n + '</span>' : '');
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
    return '<div class="ini-tile span2">' + cab + cuerpo + '</div>';
  }

  // Lo que hay por repasar: las preguntas falladas (las de Fallos). Sin el permiso de Fallos, cómo va la semana.
  function repasar(){
    if(featureEnabled('fallos')){
      if(!datosListos()) return '<div class="ini-tile">' + etiqueta('Por repasar') + '<span class="ini-big skel" style="width:40px;height:28px"></span></div>';
      const n = QUESTIONS_POOL.filter(q => q.masteryStatus === 'red' && !q.fallosHidden).length;
      return '<button type="button" class="ini-tile ini-tile-btn" data-ini="fallos">' + etiqueta('Por repasar') +
        '<span class="ini-big-fila"><span class="ini-big-ico' + (n ? ' aviso' : '') + '">' + ICO.repaso + '</span><span class="ini-big' + (n ? ' aviso' : '') + '">' + n + '</span></span>' +
        '<span class="ini-sub">' + (n ? (n === 1 ? 'fallada' : 'falladas') + ' · <b class="ini-acento">Repasar ›</b>' : 'Ninguna fallada') + '</span></button>';
    }
    const s = typeof CAL !== 'undefined' ? CAL.semana() : null;
    const tot = s ? s.dias.reduce((a, d) => a + d.puntos.length, 0) : 0, hechas = s ? s.dias.reduce((a, d) => a + d.puntos.filter(p => p.h).length, 0) : 0;
    return '<div class="ini-tile">' + etiqueta('Esta semana') + '<span class="ini-big">' + hechas + '<small>/' + tot + '</small></span><span class="ini-sub">tareas hechas</span></div>';
  }

  // Lo próximo que hay apuntado en el calendario (después de hoy).
  function proximo(){
    const x = typeof CAL !== 'undefined' ? CAL.proxima() : undefined;
    if(x === undefined) return '<div class="ini-tile">' + etiqueta('Próximo') + '</div>';
    if(!x) return '<button type="button" class="ini-tile ini-tile-btn" data-ini="nueva">' + etiqueta('Próximo') + '<span class="ini-prox-t">Nada apuntado</span><span class="ini-sub ini-acento">+ Apuntar algo</span></button>';
    return '<button type="button" class="ini-tile ini-tile-btn" data-ini="dia" data-f="' + x.f + '" style="--c:' + x.color + '">' + etiqueta('Próximo') +
      '<span class="ini-prox-t">' + esc(x.titulo) + '</span><span class="ini-prox-f">' + esc(x.cuando) + (x.mas ? ' · y ' + x.mas + ' más' : '') + '</span></button>';
  }

  // Cómo vas: Legislación y, si lo tienes, el Específico, cada uno con su círculo. Pulsar abre su pestaña de Estadísticas.
  function bloqueProgreso(clave, nombre, r, color){
    if(!r) return '<div class="ini-tile">' + etiqueta(nombre) + '<span class="skel" style="width:58px;height:58px;border-radius:50%"></span></div>';
    const pct = r.total ? r.verde / r.total * 100 : 0;
    return '<button type="button" class="ini-tile ini-tile-btn" data-ini="' + clave + '">' + etiqueta(nombre) +
      '<span class="ini-prog">' + anillo(pct, color) + '<span class="ini-prog-datos"><span><b>' + r.verde + '</b> dominadas</span>' +
        (r.rojo ? '<span><b>' + r.rojo + '</b> falladas</span>' : '') + '<span><b>' + r.vistas + '</b> de ' + r.total + '</span></span></span></button>';
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
    if(!conEsp) return bloqueProgreso('stats-legis', 'Legislación', legis, 'var(--green)').replace('class="ini-tile', 'class="ini-tile span2');
    return bloqueProgreso('stats-legis', 'Legislación', legis, 'var(--green)') + bloqueProgreso('stats-esp', 'Específico', ESTE.resumen(), 'var(--orange)');
  }

  // La semana (de lunes a domingo) con un punto por tarea: cada día abre el calendario en ese día.
  function semana(){
    const s = typeof CAL !== 'undefined' ? CAL.semana() : null;
    if(!s) return '';
    return '<div class="ini-tile span2">' + etiqueta('Esta semana' + (s.atrasadas ? ' · <b class="ini-aviso">' + s.atrasadas + (s.atrasadas === 1 ? ' atrasada' : ' atrasadas') + '</b>' : ''),
        '<button type="button" class="ini-link" data-ini="calendario">Calendario ' + FLECHA + '</button>') +
      '<div class="ini-semana">' + s.dias.map(d =>
        '<button type="button" class="ini-dia' + (d.hoy ? ' hoy' : '') + (d.pasado ? ' pasado' : '') + '" data-ini="dia" data-f="' + d.f + '" aria-label="' + esc(d.nombre) + ', ' + d.puntos.length + ' tareas">' +
          '<span class="ini-dia-l">' + d.letra + '</span><span class="ini-dia-n">' + d.n + '</span>' +
          '<span class="ini-puntos">' + d.puntos.slice(0, 4).map(p => '<i style="background:' + p.c + '"' + (p.h ? ' class="h"' : '') + '></i>').join('') + '</span></button>').join('') +
      '</div></div>';
  }

  function pintar(){
    const root = document.getElementById('inicioRoot');
    if(!root || !document.getElementById('screen-inicio').classList.contains('active') || !currentUser) return;
    const enCurso = continuar() + pruebaAMedias();
    root.innerHTML = '<div class="ini-cab"><div class="ini-fecha">' + fechaHoy() + '</div><h1 class="ini-h">Hoy</h1></div>' +
      (enCurso ? '<div class="ini-encurso">' + enCurso + '</div>' : '') +
      '<div class="ini-bento">' + hoy() + repasar() + proximo() + progreso() + semana() + '</div>';
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
      case 'prueba': PRU.continuar(); break;
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
