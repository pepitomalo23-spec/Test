/* Inicio: de un vistazo, lo que toca hoy (tareas del calendario, que se
   pueden marcar aquí mismo; tocando el recuadro se abre el calendario en
   grande para editarlo todo), el test a medias, accesos rápidos a lo
   pendiente y cómo vas. Todo se calcula con datos que ya hay en memoria. */
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
    inteligente: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/></svg>',
    fallos: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m15 7-6 6"/><path d="M20 17H6.5a1 1 0 000 5H19a1 1 0 001-1V3a1 1 0 00-1-1H6.5A2.5 2.5 0 004 4.5v15"/><path d="m9 7 6 6"/></svg>',
    fichas: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="16" x="7" y="5" rx="2"/><path d="M3 15V5a2 2 0 0 1 2-2h10"/></svg>',
    callejero: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14.106 5.553a2 2 0 0 0 1.788 0l3.659-1.83A1 1 0 0 1 21 4.619v12.764a1 1 0 0 1-.553.894l-4.553 2.277a2 2 0 0 1-1.788 0l-4.212-2.106a2 2 0 0 0-1.788 0l-3.659 1.83A1 1 0 0 1 3 19.381V6.618a1 1 0 0 1 .553-.894l4.553-2.277a2 2 0 0 1 1.788 0z"/><path d="M15 5.764v15"/><path d="M9 3.236v15"/></svg>',
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

  function hoy(){
    const r = typeof CAL !== 'undefined' ? CAL.resumenHoy() : null;
    let cuerpo;
    if(!r){
      cuerpo = '<div class="ini-hoy-cab"><div class="ini-hoy-tit">Hoy</div></div><div class="skel-list">' +
        '<div class="skel-row"><span class="skel skel-dot"></span><span class="skel-lines"><span class="skel skel-line" style="width:60%"></span></span></div>' +
        '<div class="skel-row"><span class="skel skel-dot"></span><span class="skel-lines"><span class="skel skel-line" style="width:45%"></span></span></div></div>';
    } else {
      const n = r.lista.length, pct = n ? Math.round(r.hechas / n * 100) : 0;
      const msg = !n ? 'Nada apuntado para hoy' : r.hechas === n ? '¡Todo hecho! 🎉' : 'Te queda' + (n - r.hechas === 1 ? ' 1 cosa' : 'n ' + (n - r.hechas) + ' cosas');
      // Primero lo pendiente, para que se vea lo que falta.
      const orden = r.lista.slice().sort((a, b) => a.hecho - b.hecho);
      const filas = orden.slice(0, MAX_TAREAS).map(t =>
        '<div class="ini-tarea' + (t.hecho ? ' hecha' : '') + '" style="--c:' + t.color + '">' +
          '<button type="button" class="ini-check" data-ini="marcar" data-id="' + esc(t.id) + '" aria-label="' + (t.hecho ? 'Desmarcar' : 'Marcar como hecha') + '">' + CHECK + '</button>' +
          '<span class="ini-tarea-txt"><span class="ini-tarea-t">' + esc(t.titulo) + '</span>' +
            '<span class="ini-tarea-cat">' + t.icono + ' ' + esc(t.cat) + (t.nota ? ' · ' + esc(t.nota) : '') + '</span></span>' +
        '</div>').join('');
      const chips = [
        r.racha ? '<span class="ini-chip fuego">🔥 <b>' + r.racha + '</b> ' + (r.racha === 1 ? 'día' : 'días') + ' de racha</span>' : '',
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
    return '<div class="ini-hoy" data-ini="calendario" role="button" tabindex="0" aria-label="Abrir el calendario">' + cuerpo +
      '<div class="ini-hoy-pie">Ver calendario completo ' + FLECHA + '</div></div>';
  }

  function rapido(clave, color, titulo, sub, desactivado){
    return '<button type="button" class="ini-rapido" data-ini="' + clave + '" style="--c:' + color + '"' + (desactivado ? ' disabled' : '') + '>' +
      '<span class="ini-rapido-ico">' + ICO[clave] + '</span>' +
      '<span class="ini-rapido-t">' + titulo + '</span><span class="ini-rapido-s">' + sub + '</span></button>';
  }
  function rapidos(){
    const listos = datosListos();
    const enCurso = quizState && quizState.mode;
    const tiles = [];
    if(featureEnabled('inteligente')){
      const n = listos ? smartUrgentCount() : null;
      tiles.push(rapido('inteligente', 'var(--amber)', 'Test Inteligente', n == null ? SKEL_INLINE : n + ' recomendadas', enCurso && enCurso !== 'inteligente'));
    }
    if(featureEnabled('fallos')){
      const n = listos ? QUESTIONS_POOL.filter(q => q.masteryStatus === 'red' && !q.fallosHidden).length : null;
      tiles.push(rapido('fallos', 'var(--coral)', 'Repasar fallos', n == null ? SKEL_INLINE : n ? n + ' pendientes' : 'Sin fallos 👌', (listos && !n) || (enCurso && enCurso !== 'fallos')));
    }
    if(featureEnabled('normativas') && typeof NQ !== 'undefined'){
      const n = NQ.pendientesHoy();
      tiles.push(rapido('fichas', 'var(--purple)', 'Repaso de fichas', n == null ? 'Tus fichas' : n ? n + ' para hoy' : 'Al día ✓'));
    }
    if(featureEnabled('callejero')){
      const aviso = document.getElementById('navCallejeroAviso');
      const n = aviso && !aviso.classList.contains('hidden') ? aviso.textContent : '';
      tiles.push(rapido('callejero', 'var(--teal)', 'Callejero', n ? n + ' avisos nuevos' : 'Mapa y juego'));
    }
    if(!tiles.length) return '';
    return '<div class="section-row"><div class="section-title">Para hoy</div><div class="section-rule"></div></div>' +
      '<div class="ini-rapidos">' + tiles.join('') + '</div>';
  }

  function progreso(){
    if(!featureEnabled('estadisticas')) return '';
    const cab = '<div class="section-row"><div class="section-title">Tu progreso</div><div class="section-rule"></div></div>';
    if(!datosListos()) return cab + '<div class="ini-progreso"><div class="skel-list"><div class="skel-row"><span class="skel-lines"><span class="skel skel-line" style="width:70%"></span><span class="skel skel-line" style="width:40%;opacity:.7"></span></span></div></div></div>';
    const pool = QUESTIONS_POOL, total = pool.length;
    const cuenta = st => pool.filter(q => q.masteryStatus === st).length;
    const verde = cuenta('green'), amarillo = cuenta('yellow'), rojo = cuenta('red'), vistas = total - cuenta(null);
    const p = n => (n / total * 100).toFixed(2);
    return cab + '<button type="button" class="ini-progreso" data-ini="stats">' +
      '<div class="ini-progreso-cab"><div><div class="ini-progreso-pct">' + formatPctExact(verde / total * 100) + '</div>' +
        '<div class="ini-progreso-s">del temario dominado</div></div><span class="ini-flecha">' + FLECHA + '</span></div>' +
      '<div class="ini-dominio"><i class="v" style="width:' + p(verde) + '%"></i><i class="a" style="width:' + p(amarillo) + '%"></i><i class="r" style="width:' + p(rojo) + '%"></i></div>' +
      '<div class="ini-progreso-datos"><span><b>' + vistas + '</b> de ' + total + ' preguntas vistas</span><span><b>' + verde + '</b> dominadas</span></div>' +
      '</button>';
  }

  function pintar(){
    const root = document.getElementById('inicioRoot');
    if(!root || !document.getElementById('screen-inicio').classList.contains('active') || !currentUser) return;
    root.innerHTML = saludo() + continuar() + hoy() + rapidos() + progreso();
  }

  function onClick(e){
    const el = e.target.closest('[data-ini]');
    if(!el || el.disabled) return;
    switch(el.dataset.ini){
      case 'marcar': e.stopPropagation(); CAL.marcar(el.dataset.id); break;
      case 'nueva': e.stopPropagation(); CAL.nueva(); break;
      case 'calendario': showScreen('screen-calendario'); break;
      case 'reanudar': resumeQuiz(); break;
      case 'inteligente': openInteligente(); break;
      case 'fallos': openFallos(); break;
      case 'fichas':
        showScreen('screen-normativas');
        if(NQ.pendientesHoy()) NQ.startReview();
        break;
      case 'callejero': showScreen('screen-callejero'); break;
      case 'stats': showScreen('screen-stats'); break;
    }
  }

  function abrir(){
    const root = document.getElementById('inicioRoot');
    if(root && !root.dataset.listo){
      root.dataset.listo = '1';
      root.addEventListener('click', onClick);
      root.addEventListener('keydown', e => {
        if(e.key === 'Enter' && e.target.dataset && e.target.dataset.ini === 'calendario') showScreen('screen-calendario');
      });
    }
    if(typeof CAL !== 'undefined') CAL.asegurar();
    pintar();
  }
  return { abrir, pintar };
})();
