/* ============================================================
   CALLEJERO · Profesor y mensajes
   El profesor es un usuario normal que el administrador marca como
   profesor y vincula con sus alumnos (Administración → Usuarios; tablas
   profiles.es_profesor y tutorias). En Callejero ve dos pestañas,
   «Alumnos» y «Temario» (y el enlace «Mi callejero», para estudiar él):
     - Alumnos: con un semáforo (verde si estudió en los 2 últimos días,
       ámbar en la semana, rojo si hace más), rondas y aciertos de la
       semana, tareas activas y mensajes sin leer.
     - Página de un alumno, en pestañas: Tareas, Progreso (temario, calles
       en la zona que elija y últimas rondas), Fallos (lo que más falla,
       con botón para mandárselo) y Mensajes; «Mandar tarea» siempre a
       mano. Solo lee, con funciones que comprueban que es su alumno.
     - Temario: lo ve entero y, desde la propia ficha, manda a un alumno
       la ficha, un apartado o cosas sueltas (CJP.mandarTemario abre la
       tarea ya rellena).
     - Tareas, en dos pasos: qué estudiar (calles y lugares elegidos en el mapa, con
       CJ.seleccionar, una zona entera o fichas y apartados del temario de
       la academia, js/callejero-temario.js), qué modos cuentan, cuántas
       rondas y con qué mínimo de aciertos, fecha límite, mensaje y «solo
       esto» (mientras esté activa, el alumno solo puede estudiar sus
       tareas); lo que no es título, alumnos ni mensaje va plegado en «Más
       opciones». Una tarea nueva se puede mandar a varios alumnos a la vez.
   Mensajes: cada tarea tiene su conversación profesor ↔ alumno; la usan
   los dos (CJP.abrirMensajes). Al mandar una tarea o un mensaje se avisa
   al otro con una notificación (push-reminders) si las tiene activadas.
   La lista se pinta en «Alumnos» (dentro de #cjInicio, la llama
   CJ.pintarInicio) y lo demás en #cjPanel.
   ============================================================ */
const CJP = (function(){
  let alumnos = null;        // profesor_mis_alumnos()
  let alumnosAt = 0;
  let cargandoAlumnos = null;
  let ficha = null;          // { alumno, filas, progreso, rondas, tareas, zona, verRondas, falladas }
  let borrador = null;       // tarea que se está creando o editando
  let hilo = null;           // { id, tarea, mensajes, volver: 'ficha' | 'inicio' }
  const MINIMOS = [50, 60, 70, 80, 90, 100];
  const HAB_TXT = { nombre: 'nombre', localiza: 'situarla', cruces: 'cruces', lugares: 'situarlo', parque: 'parque que acude', temario: 'temario' };
  const ID_TEMARIO = 5000000000000;   // desde aquí, los ids son del temario (js/callejero-temario.js)

  function el(id){ return document.getElementById(id); }
  function panel(html){
    el('cjPanel').innerHTML = html;
    CJ.mostrarVista('panel');
    const app = el('app');   // la página se desplaza dentro de #app
    if(app) app.scrollTop = 0; else window.scrollTo(0, 0);
  }
  function cabecera(titulo, volver){
    return '<div class="cjp-cab">' +
      '<button type="button" class="cj-salir" onclick="' + volver + '" aria-label="Volver">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>' +
      '</button><h2>' + escapeHtml(titulo) + '</h2></div>';
  }
  function tarjetaError(texto, reintentar){
    return '<div class="cj-card cj-error">' + escapeHtml(texto) +
      (reintentar ? '<br><button type="button" class="btn btn-light" onclick="' + reintentar + '">Reintentar</button>' : '') + '</div>';
  }
  function hace(iso){ return formatRelativeDate(iso).toLowerCase(); }
  // Notificación al otro (tarea nueva o mensaje); si falla, no pasa nada.
  function avisar(aviso, id){
    try{ sb.functions.invoke('push-reminders', { body: { aviso, id } }).catch(() => {}); }catch(e){}
  }

  /* ---------- lista de alumnos ---------- */
  async function cargarAlumnos(forzar){
    if(!forzar && alumnos && Date.now() - alumnosAt < 20000) return alumnos;
    if(cargandoAlumnos) return cargandoAlumnos;
    cargandoAlumnos = (async () => {
      const { data, error } = await sb.rpc('profesor_mis_alumnos');
      if(error) throw new Error(error.message);
      alumnos = data || [];
      alumnosAt = Date.now();
      return alumnos;
    })();
    try{ return await cargandoAlumnos; }
    finally{ cargandoAlumnos = null; }
  }
  async function pintarAlumnos(caja){
    if(!caja) return;
    caja.innerHTML = alumnos ? htmlAlumnos() : '<div class="cj-card">' + skelList(3) + '</div>';
    try{ await cargarAlumnos(); }
    catch(e){
      if(caja.isConnected) caja.innerHTML = tarjetaError('No se ha podido cargar la lista de alumnos: ' + e.message, 'CJ.volver()');
      return;
    }
    if(caja.isConnected) caja.innerHTML = htmlAlumnos();
  }
  // Semáforo: verde si estudió en los 2 últimos días, ámbar en la última semana, rojo si hace más o nunca.
  function semaforo(a){
    if(!a.ultima_vez) return { color: 'rojo', texto: 'Todavía no ha estudiado' };
    const dias = (Date.now() - new Date(a.ultima_vez).getTime()) / 864e5;
    return { color: dias <= 2 ? 'verde' : dias <= 7 ? 'ambar' : 'rojo', texto: 'Estudió ' + hace(a.ultima_vez) };
  }
  function semanaTxt(a){
    const pct = a.respuestas_7d ? Math.round(a.aciertos_7d * 100 / a.respuestas_7d) : 0;
    return a.rondas_7d + (a.rondas_7d === 1 ? ' ronda' : ' rondas') + ' esta semana' + (a.respuestas_7d ? ' (' + pct + '% bien)' : '');
  }
  const FLECHA = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>';
  function htmlAlumnos(){
    if(!alumnos.length){
      return '<div class="cj-card"><div class="cj-hab-det">Todavía no tienes alumnos. El administrador te los asigna desde Administración → Usuarios.</div></div>';
    }
    return '<div class="cj-card cjt-filas">' + alumnos.map(a => {
      const s = semaforo(a);
      return '<button type="button" class="cjt-accion cjp-alumno" onclick="CJP.abrirAlumno(\'' + a.alumno_id + '\')">' +
        '<i class="cjp-luz ' + s.color + '" title="' + escapeHtml(s.texto) + '"></i>' +
        '<span class="cjt-accion-txt"><b>' + escapeHtml(a.email || '(sin correo)') + '</b>' +
          '<small>' + escapeHtml(s.texto) + ' · ' + escapeHtml(semanaTxt(a)) +
            (a.tareas_activas ? ' · ' + a.tareas_activas + (a.tareas_activas === 1 ? ' tarea' : ' tareas') : '') + '</small></span>' +
        (a.sin_leer ? '<span class="cj-num" title="Mensajes sin leer">' + a.sin_leer + '</span>' : '') +
        '<span class="cjp-flecha">' + FLECHA + '</span>' +
      '</button>';
    }).join('') + '</div>' +
    '<div class="cj-leyenda cjp-leyenda"><span><i class="cjp-luz verde"></i>Estudió en los 2 últimos días</span><span><i class="cjp-luz ambar"></i>Esta semana</span><span><i class="cjp-luz rojo"></i>Hace más o nunca</span></div>' +
    (alumnos.length > 1 ? '<button type="button" class="btn btn-ghost cjp-varios" onclick="CJP.nuevaTarea()">Mandar una tarea a varios alumnos</button>' : '');
  }
  function volverALista(){
    ficha = null;
    alumnosAt = 0;
    CJ.volver();
  }

  /* ---------- página de un alumno: Tareas · Progreso · Fallos · Mensajes ---------- */
  async function abrirAlumno(id){
    try{ await cargarAlumnos(); }catch(e){}
    const a = (alumnos || []).find(x => x.alumno_id === id);
    if(!a){ volverALista(); return; }
    const mismo = ficha && ficha.alumno.alumno_id === id;
    ficha = { alumno: a, filas: [], progreso: new Map(), rondas: [], tareas: [], zona: mismo ? ficha.zona : '', verRondas: false, falladas: [],
      pestana: mismo ? ficha.pestana : 'tareas' };
    panel(cabeceraAlumno(a) + '<div class="cj-card">' + skelList(4) + '</div>');
    try{
      await Promise.all([CJ.cargarDatos(), CJT.cargar().catch(() => {})]);
      const [p, r, t] = await Promise.all([
        sb.rpc('callejero_progreso', { p_user: id }),
        sb.rpc('callejero_rondas', { p_user: id, p_limite: 50 }),
        sb.rpc('callejero_tareas_de', { p_alumno: id })
      ]);
      const error = p.error || r.error || t.error;
      if(error) throw new Error(error.message);
      if(!ficha || ficha.alumno.alumno_id !== id) return;   // se ha ido a otra parte mientras cargaba
      ficha.filas = p.data || [];
      ficha.progreso = CJ.progresoDesdeFilas(ficha.filas);
      ficha.rondas = r.data || [];
      ficha.tareas = CJ.prepararTareas(t.data);
      pintarFicha();
    }catch(e){
      panel(cabeceraAlumno(a) + tarjetaError('No se ha podido cargar su callejero: ' + e.message, 'CJP.abrirAlumno(\'' + id + '\')'));
    }
  }
  function cabeceraAlumno(a){
    const s = semaforo(a);
    return cabecera(a.email, 'CJP.volverALista()') +
      '<div class="cjp-estado"><i class="cjp-luz ' + s.color + '"></i>' + escapeHtml(s.texto) + ' · ' + escapeHtml(semanaTxt(a)) + '</div>';
  }
  function pintarFicha(){
    const f = ficha;
    const p = f.pestana;
    const sinLeer = f.tareas.reduce((n, t) => n + (t.sin_leer || 0), 0);
    const b = (k, texto, n) => '<button type="button" role="tab" aria-selected="' + (p === k) + '"' + (p === k ? ' class="activo"' : '') +
      ' onclick="CJP.cambiarPestana(\'' + k + '\')">' + texto + (n ? ' <span class="cj-num">' + n + '</span>' : '') + '</button>';
    panel(cabeceraAlumno(f.alumno) +
      '<div class="cj-segmento cj-pestanas" role="tablist">' + b('tareas', 'Tareas') + b('progreso', 'Progreso') + b('fallos', 'Fallos') + b('mensajes', 'Mensajes', sinLeer) + '</div>' +
      (p === 'progreso' ? htmlProgreso() : p === 'fallos' ? htmlFallos() : p === 'mensajes' ? htmlMensajes() : htmlTareas()) +
      '<div class="cjp-fijo"><button type="button" class="btn btn-primary btn-light" id="cjpMandar" onclick="CJP.nuevaTarea(\'' + f.alumno.alumno_id + '\')">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14"/><path d="M5 12h14"/></svg>Mandar tarea</button></div>');
  }
  function cambiarPestana(p){ if(ficha){ ficha.pestana = p; pintarFicha(); } }
  function htmlTareas(){
    const activas = ficha.tareas.filter(t => !t.archivada), archivadas = ficha.tareas.filter(t => t.archivada);
    return (activas.length ? activas.map(tarjetaTarea).join('') : '<div class="cj-card"><div class="cj-hab-det">No le has mandado ninguna tarea activa.</div></div>') +
      (archivadas.length ? '<details class="cj-hechas"><summary>Archivadas (' + archivadas.length + ')</summary>' + archivadas.map(tarjetaTarea).join('') + '</details>' : '');
  }
  function selectorZona(){
    return '<div class="cj-card cj-zona"><select class="cj-zona-select" onchange="CJP.cambiarZonaFicha(this.value)" aria-label="Zona de las calles">' + CJ.opcionesZona(ficha.zona) + '</select></div>';
  }
  function htmlProgreso(){
    const f = ficha;
    return '<div class="cj-seccion">Temario</div>' + CJT.tarjetaProgresoAlumno(f.progreso) +
      '<div class="cj-seccion">Calles</div>' + selectorZona() +
      CJ.tarjetaProgreso(f.progreso, CJ.filtroDe(f.zona), CJ.nombreZonaDe(f.zona)) +
      '<div class="cj-seccion">Últimas rondas</div>' +
      '<div class="cj-card cj-rondas">' + CJ.rondasHtml(f.rondas, f.tareas, f.verRondas ? 50 : 8) +
        (f.rondas.length > 8 ? '<button type="button" class="cj-ver-mas" onclick="CJP.alternarRondas()">' + (f.verRondas ? 'Ver menos' : 'Ver más') + '</button>' : '') +
      '</div>';
  }
  function htmlFallos(){
    return '<div class="cj-hab-det cjp-nota">Lo que la última vez falló, o falló y aún no domina: todo el temario y las calles de la zona que elijas.</div>' +
      selectorZona() + htmlFalladas(CJ.filtroDe(ficha.zona));
  }
  // Cada tarea tiene su conversación.
  function htmlMensajes(){
    const ts = ficha.tareas.slice().sort((a, b) => (b.sin_leer || 0) - (a.sin_leer || 0) || (b.mensajes || 0) - (a.mensajes || 0) || a.archivada - b.archivada);
    if(!ts.length) return '<div class="cj-card"><div class="cj-hab-det">Cada tarea tiene su conversación. Mándale una tarea para poder escribirle.</div></div>';
    return '<div class="cj-card cjt-filas">' + ts.map(t =>
      '<button type="button" class="cjt-accion" onclick="CJP.abrirMensajes(' + t.id + ')">' +
        '<span class="cjt-accion-txt"><b>' + escapeHtml(t.titulo) + '</b><small>' +
          (t.mensajes ? t.mensajes + (t.mensajes === 1 ? ' mensaje' : ' mensajes') : 'Sin mensajes todavía') + (t.archivada ? ' · archivada' : '') + '</small></span>' +
        (t.sin_leer ? '<span class="cj-num">' + t.sin_leer + '</span>' : '') +
        '<span class="cjp-flecha">' + FLECHA + '</span></button>').join('') + '</div>';
  }
  function cambiarZonaFicha(z){ if(ficha){ ficha.zona = z || ''; pintarFicha(); } }
  function alternarRondas(){ if(ficha){ ficha.verRondas = !ficha.verRondas; pintarFicha(); } }

  // Vías y lugares que falla (la última vez mal, o fallados y aún sin dominar), de la zona elegida,
  // y lo del temario que falla (sea cual sea la zona).
  function htmlFalladas(filtro){
    const datos = CJ.datos();
    const filas = ficha.filas.map(([id, hab, intentos, aciertos, racha, fallos, ultima]) => {
      id = Number(id);
      const temario = id >= ID_TEMARIO;
      const x = temario ? CJT.nombreItem(id) : id > 0 ? datos.viaPorId.get(id) : datos.lugarPorId.get(-id);
      return { id, hab, intentos, aciertos, racha, fallos, ultima, x, temario };
    }).filter(r => r.x && r.fallos > 0 && CJ.estadoDe(r) !== 'dominada' && (r.temario || (r.id > 0 ? filtro.via(r.x) : filtro.lugar(r.x))))
      .sort((a, b) => (a.racha === 0 ? 0 : 1) - (b.racha === 0 ? 0 : 1) || b.fallos - a.fallos || b.ultima - a.ultima)
      .slice(0, 15);
    ficha.falladas = filas;
    if(!filas.length) return '<div class="cj-card"><div class="cj-hab-det">Nada por repasar' + (ficha.zona ? ' en esta zona' : '') + '.</div></div>';
    return '<div class="cj-card">' + filas.map(r =>
      '<div class="cj-ronda"><div class="cj-ronda-txt">' +
        '<div class="cj-ronda-modo">' + escapeHtml(r.x.nombre) + '</div>' +
        '<div class="cj-ronda-zona">' + escapeHtml(r.temario ? r.x.donde : HAB_TXT[r.hab] || r.hab) + ' · ' + r.aciertos + ' de ' + r.intentos + ' bien' +
          (r.racha === 0 ? ' · la última, mal' : ' · recuperándola') + '</div>' +
      '</div><b class="ko">' + r.fallos + (r.fallos === 1 ? ' fallo' : ' fallos') + '</b></div>').join('') +
      (filas.some(r => !r.temario) ? '<button type="button" class="cj-ver-mas" onclick="CJP.tareaConFalladas()">Mandarle una tarea con estas calles y lugares</button>' : '') +
      (filas.some(r => r.temario) ? '<button type="button" class="cj-ver-mas" onclick="CJP.tareaConFalladas(true)">Mandarle una tarea con esos apartados del temario</button>' : '') +
      '</div>';
  }
  function tareaConFalladas(temario){
    if(!ficha || !ficha.falladas.length) return;
    if(temario){
      // Justo lo que falla: cada cosa suelta (clave del apartado + su id).
      const fichas = [...new Set(ficha.falladas.filter(r => r.temario).map(r => CJT.claveDeItem(r.id) && CJT.claveDeItem(r.id) + '/' + r.id).filter(Boolean))];
      nuevaTarea(ficha.alumno.alumno_id, { titulo: 'Repaso del temario', tipo: 'temario', fichas });
      return;
    }
    const vias = [...new Set(ficha.falladas.filter(r => !r.temario && r.id > 0).map(r => r.id))];
    const lugares = [...new Set(ficha.falladas.filter(r => r.id < 0).map(r => -r.id))];
    nuevaTarea(ficha.alumno.alumno_id, { titulo: 'Repaso de lo que fallas', tipo: 'lista', vias, lugares });
  }

  function tarjetaTarea(t){
    const { que, modos } = CJ.describirTarea(t);
    const hecha = CJ.tareaHecha(t);
    const temario = CJ.esTemario(t);
    const pct = Math.min(100, Math.round(t.rondas_validas * 100 / t.rondas));
    const estado = t.archivada ? 'Archivada' : hecha ? '✓ Hecha' : t.vista_at ? 'Vista' : 'Sin ver todavía';
    return '<div class="cj-card cj-tarea' + (hecha ? ' hecha' : '') + '">' +
      '<div class="cj-tarea-cab"><span class="cj-tarea-etq">' + estado + '</span>' +
        (t.solo_esto && !t.archivada ? '<span class="cj-tarea-solo">Solo esto</span>' : '') +
        (t.fecha_limite ? '<span class="cj-tarea-fecha">Hasta el ' + CJ.fechaCorta(t.fecha_limite) + '</span>' : '') +
      '</div>' +
      '<div class="cj-tarea-titulo">' + escapeHtml(t.titulo) + '</div>' +
      '<div class="cj-tarea-que">' + escapeHtml(que) + '</div>' +
      '<div class="cj-tarea-barra"><div class="cj-bar"><div class="cj-bar-fill" style="width:' + pct + '%"></div></div>' +
        '<b>' + Math.min(t.rondas_validas, t.rondas) + '/' + t.rondas + '</b></div>' +
      '<div class="cj-tarea-prog">' + t.rondas + (t.rondas === 1 ? ' ronda' : ' rondas') + (temario ? '' : ' de ' + escapeHtml(modos)) + ' con un ' + t.minimo + '% o más' +
        (t.rondas_jugadas > t.rondas_validas ? ' · ' + (t.rondas_jugadas - t.rondas_validas) + ' no cuentan' : '') +
        (t.ultima_vez ? ' · última ronda ' + escapeHtml(hace(t.ultima_vez)) : '') + '</div>' +
      '<div class="cj-tarea-acciones">' +
        '<button type="button" class="btn btn-ghost" onclick="CJP.abrirMensajes(' + t.id + ')">Mensajes' +
          (t.sin_leer ? ' <span class="cj-num">' + t.sin_leer + '</span>' : (t.mensajes ? ' (' + t.mensajes + ')' : '')) + '</button>' +
        '<button type="button" class="btn btn-ghost" onclick="CJP.editarTarea(' + t.id + ')">Editar</button>' +
        '<details class="cjp-mas"><summary class="btn btn-ghost" aria-label="Más acciones">···</summary><div class="cjp-mas-menu">' +
          '<button type="button" onclick="CJP.archivarTarea(' + t.id + ', ' + !t.archivada + ')">' + (t.archivada ? 'Recuperar' : 'Archivar (el alumno deja de verla)') + '</button>' +
          '<button type="button" class="cjp-borrar" onclick="CJP.borrarTarea(' + t.id + ')">Borrar</button>' +
        '</div></details>' +
      '</div>' +
    '</div>';
  }
  async function archivarTarea(id, archivar){
    const { error } = await sb.from('callejero_tareas').update({ archivada: archivar }).eq('id', id);
    if(error){ uiToast('No se ha podido guardar: ' + error.message, 'error'); return; }
    uiToast(archivar ? 'Tarea archivada: el alumno ya no la ve.' : 'Tarea recuperada.', 'info');
    if(ficha) abrirAlumno(ficha.alumno.alumno_id);
  }
  async function borrarTarea(id){
    if(!(await uiConfirm('¿Borrar esta tarea? Se borran también sus mensajes. Las rondas que hizo el alumno se quedan en su historial.'))) return;
    const { error } = await sb.from('callejero_tareas').delete().eq('id', id);
    if(error){ uiToast('No se ha podido borrar: ' + error.message, 'error'); return; }
    if(ficha) abrirAlumno(ficha.alumno.alumno_id);
  }

  /* ---------- crear y editar tareas (en dos pasos) ---------- */
  // Paso 1: qué tiene que estudiar. Paso 2: para quién, título, mensaje y,
  // plegadas, las demás opciones (rondas, mínimo, fecha, modos y «solo esto»).
  const POR_DEFECTO = { rondas: 3, minimo: 80 };
  function nuevaTarea(alumnoId, inicial){
    borrador = Object.assign({
      id: null, alumnos: new Set(alumnoId ? [alumnoId] : []), titulo: '', mensaje: '', tipo: 'temario', vias: [], lugares: [], zona: '', fichas: [],
      modos: new Set(), rondas: POR_DEFECTO.rondas, minimo: POR_DEFECTO.minimo, fecha: '', solo_esto: false, volverA: alumnoId || null,
      paso: inicial ? 2 : 1
    }, inicial || {});
    // Lo elegido del temario se describe con el temario cargado.
    if(borrador.tipo === 'temario' && !CJT.listo()) CJT.cargar().then(() => { if(borrador){ leerFormulario(); pintarFormulario(); } }, () => {});
    pintarFormulario();
  }
  // Desde el temario: manda una ficha, un apartado o lo elegido. Con un solo
  // alumno ya sale marcado; al acabar (o cancelar) se vuelve al temario.
  async function mandarTemario(claves, titulo){
    try{ await cargarAlumnos(); }catch(e){}
    const unico = alumnos && alumnos.length === 1 ? alumnos[0].alumno_id : null;
    nuevaTarea(unico, { tipo: 'temario', fichas: claves.slice(), titulo: (titulo || '').slice(0, 120), volverA: null, volverTemario: true });
  }
  function volverAlTemario(){ CJ.mostrarVista('temario'); CJT.repintar(); }
  function editarTarea(id){
    const t = ficha && ficha.tareas.find(x => x.id === id);
    if(!t) return;
    const lista = t.vias.length + t.lugares.length > 0;
    const temario = t.fichas.length > 0;
    borrador = {
      id: t.id, alumnos: new Set([t.alumno_id]), titulo: t.titulo, mensaje: t.mensaje || '', tipo: temario ? 'temario' : lista ? 'lista' : 'zona',
      vias: t.vias.slice(), lugares: t.lugares.slice(), zona: lista || temario ? '' : (t.zona || ''), fichas: t.fichas.slice(),
      modos: new Set(temario ? [] : t.modos), rondas: t.rondas,
      minimo: t.minimo, fecha: t.fecha_limite || '', solo_esto: t.solo_esto, volverA: t.alumno_id, paso: 2
    };
    pintarFormulario();
  }
  const TIPOS = [
    ['temario', 'Temario de la academia', 'Fichas enteras, apartados o cosas sueltas'],
    ['lista', 'Calles y lugares del mapa', 'Elegidos uno a uno, o barrios enteros'],
    ['zona', 'Una zona entera', 'Toda Córdoba, un distrito o un barrio']
  ];
  const n = (k, uno, varios) => k + ' ' + (k === 1 ? uno : varios);
  // Lo elegido, en una línea (paso 2).
  function resumenQue(b){
    if(b.tipo === 'temario') return n(CJT.contarElegidas(b.fichas), 'cosa elegida', 'cosas elegidas') + ': ' + CJT.describirFichas(b.fichas);
    if(b.tipo === 'lista') return n(b.vias.length, 'calle', 'calles') + ' y ' + n(b.lugares.length, 'lugar', 'lugares') + ' elegidos en el mapa';
    return CJ.nombreZonaDe(b.zona);
  }
  function pasos(b){
    return '<div class="cjp-pasos"><span class="' + (b.paso === 1 ? 'activo' : 'hecho') + '"><b>1</b> Qué</span><i></i>' +
      '<span class="' + (b.paso === 2 ? 'activo' : '') + '"><b>2</b> Para quién y cómo</span></div>';
  }
  function pintarFormulario(){
    const b = borrador;
    const titulo = b.id ? 'Editar tarea' : 'Nueva tarea';
    if(b.paso !== 2){ pintarPaso1(titulo); return; }
    pintarPaso2(titulo);
  }
  function pintarPaso1(titulo){
    const b = borrador;
    const datos = CJ.datos();
    const nombres = b.vias.map(id => datos && datos.viaPorId.get(id)).filter(Boolean).map(v => v.nombre)
      .concat(b.lugares.map(id => datos && datos.lugarPorId.get(id)).filter(Boolean).map(l => l.nombre))
      .sort((x, y) => x.localeCompare(y, 'es'));
    panel(cabecera(titulo, 'CJP.cancelarFormulario()') + pasos(b) +
      '<div class="cj-card cjt-filas cjp-tipos">' + TIPOS.map(([k, t, d]) =>
        '<button type="button" class="cjt-accion cjp-tipo' + (b.tipo === k ? ' activo' : '') + '" onclick="CJP.cambiarTipo(\'' + k + '\')" aria-pressed="' + (b.tipo === k) + '">' +
          '<span class="cjp-radio"></span><span class="cjt-accion-txt"><b>' + t + '</b><small>' + d + '</small></span></button>').join('') + '</div>' +
      '<div class="cj-card cjp-form">' +
        (b.tipo === 'temario'
          ? '<div class="cjp-eleccion"><b>' + (b.fichas.length ? n(CJT.contarElegidas(b.fichas), 'cosa elegida', 'cosas elegidas') : 'Nada elegido todavía') + '</b>' +
              '<button type="button" class="btn ' + (b.fichas.length ? 'btn-ghost' : 'btn-primary btn-light') + '" onclick="CJP.elegirEnTemario()">' + (b.fichas.length ? 'Cambiar en el temario' : 'Elegir en el temario') + '</button></div>' +
            (b.fichas.length ? '<div class="cjp-nombres">' + escapeHtml(CJT.describirFichas(b.fichas)) + '</div>' : '') +
            '<div class="cj-hab-det">Se abre el temario (documento, mapas y listas) para marcar lo que quieras. Al alumno le sale como «Estúdiate esto».</div>'
          : b.tipo === 'lista'
          ? '<div class="cjp-eleccion"><b>' + n(b.vias.length, 'calle', 'calles') + ' y ' + n(b.lugares.length, 'lugar', 'lugares') + '</b>' +
              '<button type="button" class="btn ' + (b.vias.length + b.lugares.length ? 'btn-ghost' : 'btn-primary btn-light') + '" onclick="CJP.elegirEnMapa()">' + (b.vias.length + b.lugares.length ? 'Cambiar en el mapa' : 'Elegir en el mapa') + '</button></div>' +
            (nombres.length ? '<details class="cjp-nombres"><summary>Ver la lista</summary>' + nombres.map(x => '<div>' + escapeHtml(x) + '</div>').join('') + '</details>' : '') +
            '<div class="cj-hab-det">En las rondas de la tarea solo le saldrá esto.</div>'
          : '<select id="cjpZona" class="cj-zona-select" aria-label="Zona">' + (datos ? CJ.opcionesZona(b.zona) : '') + '</select>') +
      '</div>' +
      '<div class="admin-form-actions">' +
        '<button type="button" class="btn btn-ghost" onclick="CJP.cancelarFormulario()">Cancelar</button>' +
        '<button type="button" class="btn btn-primary btn-light" id="cjpSiguiente" onclick="CJP.irAlPaso(2)">Siguiente</button>' +
      '</div>');
  }
  function pintarPaso2(titulo){
    const b = borrador;
    const para = b.id
      ? '<div class="cjp-para">' + escapeHtml(((alumnos || []).find(a => a.alumno_id === [...b.alumnos][0]) || {}).email || '') + '</div>'
      : (alumnos || []).map(a => '<label class="cjp-check"><input type="checkbox" value="' + a.alumno_id + '" class="cjp-alumno-check"' +
          (b.alumnos.has(a.alumno_id) ? ' checked' : '') + '> ' + escapeHtml(a.email) + '</label>').join('');
    const temario = b.tipo === 'temario';
    // «Más opciones» se abre sola si algo no está como viene.
    const cambiadas = b.rondas !== POR_DEFECTO.rondas || b.minimo !== POR_DEFECTO.minimo || !!b.fecha || b.solo_esto || b.modos.size > 0;
    const resumenOp = n(b.rondas, 'ronda', 'rondas') + ' · ' + b.minimo + '% · ' + (b.fecha ? 'hasta el ' + CJ.fechaCorta(b.fecha) : 'sin fecha') + (b.solo_esto ? ' · solo esto' : '');
    panel(cabecera(titulo, 'CJP.cancelarFormulario()') + pasos(b) +
      '<div class="cj-card cjp-que"><div class="cjp-que-txt"><small>Qué</small><b>' + escapeHtml(resumenQue(b)) + '</b></div>' +
        '<button type="button" class="btn btn-ghost" onclick="CJP.irAlPaso(1)">Cambiar</button></div>' +
      '<div class="admin-form cjp-form">' +
        '<label>Para</label>' + (para || '<div class="cj-hab-det">No tienes alumnos.</div>') +
        '<label for="cjpTitulo">Título</label>' +
        '<input id="cjpTitulo" maxlength="120" placeholder="Por ejemplo: Casco histórico, semana 1" value="' + escapeHtml(b.titulo) + '">' +
        '<label for="cjpMensaje">Mensaje (opcional)</label>' +
        '<textarea id="cjpMensaje" maxlength="2000" placeholder="Explícale qué quieres que haga, en qué fijarse…">' + escapeHtml(b.mensaje) + '</textarea>' +
        '<details class="cjp-opciones"' + (cambiadas ? ' open' : '') + '><summary>Más opciones <small>' + escapeHtml(resumenOp) + '</small></summary>' +
          '<div class="cjp-fila">' +
            '<div><label for="cjpRondas">Rondas</label><input id="cjpRondas" type="number" min="1" max="50" value="' + b.rondas + '"></div>' +
            '<div><label for="cjpMinimo">Aciertos mínimos</label><select id="cjpMinimo">' +
              MINIMOS.map(v => '<option value="' + v + '"' + (v === b.minimo ? ' selected' : '') + '>' + v + '%</option>').join('') + '</select></div>' +
          '</div>' +
          '<label for="cjpFecha">Fecha límite</label>' +
          '<input id="cjpFecha" type="date" value="' + escapeHtml(b.fecha) + '">' +
          (temario ? '' :
            '<label>Modos que cuentan <small>(si no marcas ninguno, vale cualquiera)</small></label>' +
            '<div class="cjp-modos">' + Object.keys(CJ.MODOS).filter(m => m !== 'temario').map(m => '<label class="cjp-check"><input type="checkbox" class="cjp-modo" value="' + m + '"' +
              (b.modos.has(m) ? ' checked' : '') + '> ' + escapeHtml(CJ.MODOS[m].titulo) + '</label>').join('') + '</div>') +
          '<label class="cjp-check cjp-solo"><input type="checkbox" id="cjpSolo"' + (b.solo_esto ? ' checked' : '') + '> ' +
            '<span><b>Solo esto.</b> Mientras la tarea esté activa, el alumno solo puede estudiar tus tareas. Se quita al archivarla o al desmarcarlo.</span></label>' +
        '</details>' +
        '<div class="admin-form-actions">' +
          (b.id ? '<button type="button" class="btn btn-ghost" onclick="CJP.cancelarFormulario()">Cancelar</button>'
                : '<button type="button" class="btn btn-ghost" onclick="CJP.irAlPaso(1)">Atrás</button>') +
          '<button type="button" class="btn btn-primary btn-light" id="cjpGuardar" onclick="CJP.guardarTarea()">' + (b.id ? 'Guardar' : 'Mandar tarea') + '</button>' +
        '</div>' +
      '</div>');
  }
  // Lo escrito en el formulario pasa al borrador (antes de cambiar de paso, irse al mapa o guardar).
  function leerFormulario(){
    const b = borrador;
    if(!b) return;
    if(el('cjpTitulo')) b.titulo = el('cjpTitulo').value.trim();
    if(!b.id && el('cjpTitulo')) b.alumnos = new Set([...document.querySelectorAll('.cjp-alumno-check')].filter(c => c.checked).map(c => c.value));
    if(el('cjpZona')) b.zona = el('cjpZona').value;
    if(document.querySelector('.cjp-modo')) b.modos = new Set([...document.querySelectorAll('.cjp-modo')].filter(c => c.checked).map(c => c.value));
    if(el('cjpRondas')) b.rondas = Math.max(1, Math.min(50, parseInt(el('cjpRondas').value, 10) || 1));
    if(el('cjpMinimo')) b.minimo = parseInt(el('cjpMinimo').value, 10) || 80;
    if(el('cjpFecha')) b.fecha = el('cjpFecha').value || '';
    if(el('cjpSolo')) b.solo_esto = el('cjpSolo').checked;
    if(el('cjpMensaje')) b.mensaje = el('cjpMensaje').value.trim();
  }
  function irAlPaso(p){
    leerFormulario();
    const b = borrador;
    if(p === 2){
      if(b.tipo === 'lista' && !(b.vias.length + b.lugares.length)){ uiToast('Elige en el mapa las calles o los lugares que tiene que estudiar.', 'info'); return; }
      if(b.tipo === 'temario' && !b.fichas.length){ uiToast('Elige en el temario lo que tiene que estudiar.', 'info'); return; }
      // Un título de partida, si no tiene.
      if(!b.titulo && b.tipo === 'temario') b.titulo = CJT.describirFichas(b.fichas).slice(0, 120);
      if(!b.titulo && b.tipo === 'zona') b.titulo = CJ.nombreZonaDe(b.zona).slice(0, 120);
    }
    b.paso = p;
    pintarFormulario();
  }
  async function cambiarTipo(tipo){
    leerFormulario();
    borrador.tipo = tipo;
    pintarFormulario();
    if(tipo === 'temario' && !CJT.listo()){
      try{ await CJT.cargar(); }catch(e){ uiToast(e.message, 'error'); }
      if(borrador && borrador.tipo === 'temario'){ leerFormulario(); pintarFormulario(); }
    }
  }
  async function elegirEnMapa(){
    leerFormulario();
    let r = null;
    try{ r = await CJ.seleccionar({ vias: borrador.vias, lugares: borrador.lugares }); }
    catch(e){ uiToast('No se ha podido abrir el mapa: ' + e.message, 'error'); }
    if(r){ borrador.vias = r.vias; borrador.lugares = r.lugares; }
    pintarFormulario();
  }
  // El temario se abre para elegir (CJT.seleccionar) y se vuelve aquí con lo elegido.
  async function elegirEnTemario(){
    leerFormulario();
    let r = null;
    try{ r = await CJT.seleccionar(borrador.fichas); }
    catch(e){ uiToast('No se ha podido abrir el temario: ' + e.message, 'error'); }
    if(r && borrador) borrador.fichas = r;
    if(borrador) pintarFormulario();
  }
  async function cancelarFormulario(){
    const b = borrador;
    leerFormulario();
    const escrito = b && !b.id && (b.titulo || b.mensaje || b.vias.length || b.lugares.length || b.fichas.length);
    if(escrito && !(await uiConfirm('¿Salir sin mandar la tarea?'))) return;
    borrador = null;
    if(b && b.volverTemario) volverAlTemario();
    else if(b && b.volverA && ficha) pintarFicha();
    else volverALista();
  }
  async function guardarTarea(){
    leerFormulario();
    const b = borrador;
    if(!b.titulo){ uiToast('Ponle un título a la tarea.', 'info'); return; }
    if(!b.alumnos.size){ uiToast('Elige al menos un alumno.', 'info'); return; }
    if(b.tipo === 'lista' && !(b.vias.length + b.lugares.length)){ uiToast('Elige en el mapa las calles o los lugares que tiene que estudiar.', 'info'); return; }
    if(b.tipo === 'temario' && !b.fichas.length){ uiToast('Elige al menos una ficha o un apartado del temario.', 'info'); return; }
    const temario = b.tipo === 'temario';
    const fila = {
      titulo: b.titulo, mensaje: b.mensaje || null,
      vias: b.tipo === 'lista' ? b.vias : [], lugares: b.tipo === 'lista' ? b.lugares : [], zona: b.tipo === 'zona' ? b.zona : null,
      fichas: temario ? b.fichas : [], modos: temario ? ['temario'] : [...b.modos],
      rondas: b.rondas, minimo: b.minimo, fecha_limite: b.fecha || null, solo_esto: b.solo_esto
    };
    const boton = el('cjpGuardar');
    if(boton){ boton.disabled = true; boton.textContent = 'Guardando…'; }
    let error;
    if(b.id){
      ({ error } = await sb.from('callejero_tareas').update(fila).eq('id', b.id));
    }else{
      const res = await sb.from('callejero_tareas').insert([...b.alumnos].map(a => Object.assign({ alumno_id: a }, fila))).select('id');
      error = res.error;
      if(!error) (res.data || []).forEach(t => avisar('tarea', t.id));
    }
    if(error){
      if(boton){ boton.disabled = false; boton.textContent = b.id ? 'Guardar' : 'Mandar tarea'; }
      uiToast('No se ha podido guardar la tarea: ' + error.message, 'error');
      return;
    }
    uiToast(b.id ? 'Tarea guardada.' : (b.alumnos.size > 1 ? 'Tarea mandada a ' + b.alumnos.size + ' alumnos.' : 'Tarea mandada.'), 'success');
    borrador = null;
    alumnosAt = 0;
    if(b.volverTemario){ volverAlTemario(); return; }
    const volverA = b.volverA || (b.alumnos.size === 1 ? [...b.alumnos][0] : null);
    if(ficha) ficha.pestana = 'tareas';   // para ver la tarea que se acaba de mandar
    if(volverA) abrirAlumno(volverA); else volverALista();
  }

  /* ---------- mensajes de una tarea (profesor y alumno) ---------- */
  async function abrirMensajes(id){
    const enTemario = !el('cjTemario').classList.contains('hidden');
    hilo = { id, tarea: null, mensajes: [], volver: ficha && ficha.tareas.some(t => t.id === id) ? 'ficha' : enTemario ? 'temario' : 'inicio' };
    panel(cabecera('Mensajes', 'CJP.cerrarMensajes()') + '<div class="cj-card">' + skelList(3) + '</div>');
    const [t, m] = await Promise.all([
      sb.from('callejero_tareas').select('id, titulo, mensaje, alumno_id, profesor_id, creada_at').eq('id', id).maybeSingle(),
      sb.from('callejero_mensajes').select('*').eq('tarea_id', id).order('creado_at')
    ]);
    if(!hilo || hilo.id !== id) return;
    if(t.error || m.error || !t.data){
      panel(cabecera('Mensajes', 'CJP.cerrarMensajes()') + tarjetaError('No se han podido cargar los mensajes.', 'CJP.abrirMensajes(' + id + ')'));
      return;
    }
    hilo.tarea = t.data;
    hilo.mensajes = m.data || [];
    pintarHilo();
    sb.rpc('callejero_mensajes_leidos', { p_tarea: id }).then(() => CJ.comprobarAvisos(true), () => {});
  }
  function pintarHilo(){
    const yo = currentUser && currentUser.id;
    const t = hilo.tarea;
    const soyProfesor = t.profesor_id === yo;
    const burbuja = (texto, mio, quien, fecha) => '<div class="cjp-msg' + (mio ? ' mio' : '') + '">' +
      '<div class="cjp-msg-txt">' + escapeHtml(texto) + '</div>' +
      '<div class="cjp-msg-fecha">' + escapeHtml(quien) + ' · ' + escapeHtml(formatDateTime(fecha)) + '</div></div>';
    const otro = soyProfesor ? 'Tu alumno' : 'Tu profesor';
    panel(cabecera(t.titulo, 'CJP.cerrarMensajes()') +
      '<div class="cjp-hilo">' +
        (t.mensaje ? burbuja(t.mensaje, soyProfesor, (soyProfesor ? 'Tú' : 'Tu profesor') + ', al mandar la tarea', t.creada_at) : '') +
        hilo.mensajes.map(x => burbuja(x.texto, x.autor_id === yo, x.autor_id === yo ? 'Tú' : otro, x.creado_at)).join('') +
        (!t.mensaje && !hilo.mensajes.length ? '<div class="cj-hab-det">Todavía no hay mensajes. ' +
          (soyProfesor ? 'Escríbele lo que quieras sobre esta tarea.' : 'Pregunta una duda, comenta algo o avisa de que la has terminado.') + '</div>' : '') +
      '</div>' +
      '<div class="cjp-escribir">' +
        '<textarea id="cjpTexto" maxlength="2000" placeholder="Escribe un mensaje…"></textarea>' +
        '<button type="button" class="btn btn-primary btn-light" id="cjpEnviar" onclick="CJP.enviarMensaje()">Enviar</button>' +
      '</div>');
  }
  async function enviarMensaje(){
    const caja = el('cjpTexto');
    const texto = caja ? caja.value.trim() : '';
    if(!texto || !hilo) return;
    const boton = el('cjpEnviar');
    if(boton) boton.disabled = true;
    const { data, error } = await sb.from('callejero_mensajes').insert({ tarea_id: hilo.id, texto }).select().single();
    if(error){
      if(boton) boton.disabled = false;
      uiToast('No se ha podido enviar: ' + error.message, 'error');
      return;
    }
    hilo.mensajes.push(data);
    pintarHilo();
    avisar('mensaje', data.id);
  }
  function cerrarMensajes(){
    const volver = hilo ? hilo.volver : 'inicio';
    hilo = null;
    if(volver === 'ficha' && ficha){ abrirAlumno(ficha.alumno.alumno_id); return; }
    if(volver === 'temario'){ CJ.mostrarVista('temario'); CJT.repintar(); CJ.recargarTareas(); return; }
    CJ.volver();
    CJ.recargarTareas();
  }

  function reiniciar(){ alumnos = null; alumnosAt = 0; ficha = null; borrador = null; hilo = null; }

  return { pintarAlumnos, abrirAlumno, volverALista, cambiarPestana, cambiarZonaFicha, alternarRondas, tareaConFalladas,
    nuevaTarea, editarTarea, irAlPaso, cambiarTipo, elegirEnMapa, elegirEnTemario, mandarTemario, cancelarFormulario, guardarTarea, archivarTarea, borrarTarea,
    abrirMensajes, enviarMensaje, cerrarMensajes, reiniciar };
})();
