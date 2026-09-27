/* ============================================================
   CALLEJERO · Profesor y mensajes
   El profesor es un usuario normal que el administrador marca como
   profesor y vincula con sus alumnos (Administración → Usuarios; tablas
   profiles.es_profesor y tutorias). En Callejero ve «Mis alumnos»:
     - Lista: cuándo estudió cada uno por última vez, rondas y aciertos
       de la semana, tareas activas y mensajes sin leer.
     - Ficha de un alumno: sus tareas, su progreso por habilidad (en la
       zona que elija), lo que más falla y sus últimas rondas. Solo lee,
       con funciones que comprueban que es su alumno.
     - Tareas: qué estudiar (calles y lugares elegidos en el mapa, con
       CJ.seleccionar, o una zona entera), qué modos cuentan, cuántas
       rondas y con qué mínimo de aciertos, fecha límite, mensaje y «solo
       esto» (mientras esté activa, el alumno solo puede estudiar sus
       tareas). Una tarea nueva se puede mandar a varios alumnos a la vez.
   Mensajes: cada tarea tiene su conversación profesor ↔ alumno; la usan
   los dos (CJP.abrirMensajes). Al mandar una tarea o un mensaje se avisa
   al otro con una notificación (push-reminders) si las tiene activadas.
   La lista se pinta en «Mis alumnos» (dentro de #cjInicio, la llama
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
  const HAB_TXT = { nombre: 'nombre', localiza: 'situarla', cruces: 'cruces', lugares: 'situarlo', parque: 'parque que acude' };

  function el(id){ return document.getElementById(id); }
  function panel(html){
    el('cjPanel').innerHTML = html;
    CJ.mostrarVista('panel');
    window.scrollTo(0, 0);
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
  function htmlAlumnos(){
    if(!alumnos.length){
      return '<div class="cj-card"><div class="cj-card-title">Mis alumnos</div>' +
        '<div class="cj-hab-det">Todavía no tienes alumnos. El administrador te los asigna desde Administración → Usuarios.</div></div>';
    }
    return '<div class="cj-seccion">Mis alumnos</div>' + alumnos.map(a => {
      const pct = a.respuestas_7d ? Math.round(a.aciertos_7d * 100 / a.respuestas_7d) : 0;
      return '<button type="button" class="cj-mode cjp-alumno" onclick="CJP.abrirAlumno(\'' + a.alumno_id + '\')">' +
        '<div class="cj-mode-icon cjp-inicial">' + escapeHtml((a.email || '?').charAt(0).toUpperCase()) + '</div>' +
        '<div class="cj-mode-text">' +
          '<div class="cj-mode-title">' + escapeHtml(a.email || '(sin correo)') + (a.sin_leer ? ' <span class="cj-num">' + a.sin_leer + '</span>' : '') + '</div>' +
          '<div class="cj-mode-desc">' + (a.ultima_vez ? 'Estudió por última vez ' + escapeHtml(hace(a.ultima_vez)) : 'Todavía no ha estudiado el callejero') + '<br>' +
            'Esta semana: ' + a.rondas_7d + (a.rondas_7d === 1 ? ' ronda' : ' rondas') + ', ' + a.respuestas_7d + ' respuestas' + (a.respuestas_7d ? ' (' + pct + '% bien)' : '') +
            ' · ' + a.tareas_activas + (a.tareas_activas === 1 ? ' tarea activa' : ' tareas activas') + '</div>' +
        '</div>' +
      '</button>';
    }).join('') +
    (alumnos.length > 1 ? '<button type="button" class="btn btn-ghost cjp-varios" onclick="CJP.nuevaTarea()">Nueva tarea para varios alumnos</button>' : '');
  }
  function volverALista(){
    ficha = null;
    alumnosAt = 0;
    CJ.volver();
  }

  /* ---------- ficha de un alumno ---------- */
  async function abrirAlumno(id){
    try{ await cargarAlumnos(); }catch(e){}
    const a = (alumnos || []).find(x => x.alumno_id === id);
    if(!a){ volverALista(); return; }
    const zona = ficha && ficha.alumno.alumno_id === id ? ficha.zona : '';
    ficha = { alumno: a, filas: [], progreso: new Map(), rondas: [], tareas: [], zona, verRondas: false, falladas: [] };
    panel(cabecera(a.email, 'CJP.volverALista()') + '<div class="cj-card">' + skelList(4) + '</div>');
    try{
      await CJ.cargarDatos();
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
      panel(cabecera(a.email, 'CJP.volverALista()') + tarjetaError('No se ha podido cargar su callejero: ' + e.message, 'CJP.abrirAlumno(\'' + id + '\')'));
    }
  }
  function pintarFicha(){
    const f = ficha;
    const filtro = CJ.filtroDe(f.zona);
    const activas = f.tareas.filter(t => !t.archivada), archivadas = f.tareas.filter(t => t.archivada);
    panel(cabecera(f.alumno.email, 'CJP.volverALista()') +
      '<div class="cjp-acciones"><button type="button" class="btn btn-primary btn-light" onclick="CJP.nuevaTarea(\'' + f.alumno.alumno_id + '\')">Mandarle una tarea</button></div>' +
      '<div class="cj-seccion">Tareas</div>' +
      (activas.length ? activas.map(tarjetaTarea).join('') : '<div class="cj-card"><div class="cj-hab-det">No le has mandado ninguna tarea activa.</div></div>') +
      (archivadas.length ? '<details class="cj-hechas"><summary>Archivadas (' + archivadas.length + ')</summary>' + archivadas.map(tarjetaTarea).join('') + '</details>' : '') +
      '<div class="cj-seccion">Progreso</div>' +
      '<div class="cj-card cj-zona"><div class="cj-card-title">Zona</div>' +
        '<select class="cj-zona-select" onchange="CJP.cambiarZonaFicha(this.value)" aria-label="Zona">' + CJ.opcionesZona(f.zona) + '</select></div>' +
      CJ.tarjetaProgreso(f.progreso, filtro, 'Su progreso' + (f.zona ? ' · ' + CJ.nombreZonaDe(f.zona) : '')) +
      '<div class="cj-seccion">Lo que más falla</div>' + htmlFalladas(filtro) +
      '<div class="cj-seccion">Últimas rondas</div>' +
      '<div class="cj-card cj-rondas">' + CJ.rondasHtml(f.rondas, f.tareas, f.verRondas ? 50 : 8) +
        (f.rondas.length > 8 ? '<button type="button" class="cj-ver-mas" onclick="CJP.alternarRondas()">' + (f.verRondas ? 'Ver menos' : 'Ver más') + '</button>' : '') +
      '</div>');
  }
  function cambiarZonaFicha(z){ if(ficha){ ficha.zona = z || ''; pintarFicha(); } }
  function alternarRondas(){ if(ficha){ ficha.verRondas = !ficha.verRondas; pintarFicha(); } }

  // Vías y lugares que falla (la última vez mal, o fallados y aún sin dominar), de la zona elegida.
  function htmlFalladas(filtro){
    const datos = CJ.datos();
    const filas = ficha.filas.map(([id, hab, intentos, aciertos, racha, fallos, ultima]) => {
      id = Number(id);
      const x = id > 0 ? datos.viaPorId.get(id) : datos.lugarPorId.get(-id);
      return { id, hab, intentos, aciertos, racha, fallos, ultima, x };
    }).filter(r => r.x && r.fallos > 0 && CJ.estadoDe(r) !== 'dominada' && (r.id > 0 ? filtro.via(r.x) : filtro.lugar(r.x)))
      .sort((a, b) => (a.racha === 0 ? 0 : 1) - (b.racha === 0 ? 0 : 1) || b.fallos - a.fallos || b.ultima - a.ultima)
      .slice(0, 15);
    ficha.falladas = filas;
    if(!filas.length) return '<div class="cj-card"><div class="cj-hab-det">Nada por repasar' + (ficha.zona ? ' en esta zona' : '') + '.</div></div>';
    return '<div class="cj-card">' + filas.map(r =>
      '<div class="cj-ronda"><div class="cj-ronda-txt">' +
        '<div class="cj-ronda-modo">' + escapeHtml(r.x.nombre) + '</div>' +
        '<div class="cj-ronda-zona">' + escapeHtml(HAB_TXT[r.hab] || r.hab) + ' · ' + r.aciertos + ' de ' + r.intentos + ' bien' +
          (r.racha === 0 ? ' · la última, mal' : ' · recuperándola') + '</div>' +
      '</div><b class="ko">' + r.fallos + (r.fallos === 1 ? ' fallo' : ' fallos') + '</b></div>').join('') +
      '<button type="button" class="cj-ver-mas" onclick="CJP.tareaConFalladas()">Mandarle una tarea con estas</button></div>';
  }
  function tareaConFalladas(){
    if(!ficha || !ficha.falladas.length) return;
    const vias = [...new Set(ficha.falladas.filter(r => r.id > 0).map(r => r.id))];
    const lugares = [...new Set(ficha.falladas.filter(r => r.id < 0).map(r => -r.id))];
    nuevaTarea(ficha.alumno.alumno_id, { titulo: 'Repaso de lo que fallas', tipo: 'lista', vias, lugares });
  }

  function tarjetaTarea(t){
    const { que, modos } = CJ.describirTarea(t);
    const hecha = CJ.tareaHecha(t);
    const pct = Math.min(100, Math.round(t.rondas_validas * 100 / t.rondas));
    const estado = t.archivada ? 'Archivada' : hecha ? '✓ Hecha' : t.vista_at ? 'Vista' : 'Sin ver todavía';
    return '<div class="cj-card cj-tarea' + (hecha ? ' hecha' : '') + '">' +
      '<div class="cj-tarea-cab"><span class="cj-tarea-etq">' + estado + '</span>' +
        (t.solo_esto && !t.archivada ? '<span class="cj-tarea-solo">Solo esto</span>' : '') +
        (t.fecha_limite ? '<span class="cj-tarea-fecha">Hasta el ' + CJ.fechaCorta(t.fecha_limite) + '</span>' : '') +
      '</div>' +
      '<div class="cj-tarea-titulo">' + escapeHtml(t.titulo) + '</div>' +
      '<div class="cj-tarea-que">' + escapeHtml(que) + ' · ' + t.rondas + (t.rondas === 1 ? ' ronda' : ' rondas') + ' de ' + escapeHtml(modos) + ' con al menos un ' + t.minimo + '% de aciertos</div>' +
      '<div class="cj-bar"><div class="cj-bar-fill" style="width:' + pct + '%"></div></div>' +
      '<div class="cj-tarea-prog">Lleva ' + Math.min(t.rondas_validas, t.rondas) + ' de ' + t.rondas +
        (t.rondas_jugadas > t.rondas_validas ? ' · ' + (t.rondas_jugadas - t.rondas_validas) + ' sin contar' : '') +
        (t.ultima_vez ? ' · última ronda ' + escapeHtml(hace(t.ultima_vez)) : '') + '</div>' +
      '<div class="cj-tarea-acciones">' +
        '<button type="button" class="btn btn-ghost" onclick="CJP.abrirMensajes(' + t.id + ')">Mensajes' +
          (t.sin_leer ? ' <span class="cj-num">' + t.sin_leer + '</span>' : (t.mensajes ? ' (' + t.mensajes + ')' : '')) + '</button>' +
        '<button type="button" class="btn btn-ghost" onclick="CJP.editarTarea(' + t.id + ')">Editar</button>' +
        '<button type="button" class="btn btn-ghost" onclick="CJP.archivarTarea(' + t.id + ', ' + !t.archivada + ')">' + (t.archivada ? 'Recuperar' : 'Archivar') + '</button>' +
        '<button type="button" class="btn btn-ghost cjp-borrar" onclick="CJP.borrarTarea(' + t.id + ')">Borrar</button>' +
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

  /* ---------- crear y editar tareas ---------- */
  function nuevaTarea(alumnoId, inicial){
    borrador = Object.assign({
      id: null, alumnos: new Set(alumnoId ? [alumnoId] : []), titulo: '', mensaje: '', tipo: 'lista', vias: [], lugares: [], zona: '',
      modos: new Set(), rondas: 3, minimo: 80, fecha: '', solo_esto: false, volverA: alumnoId || null
    }, inicial || {});
    pintarFormulario();
  }
  function editarTarea(id){
    const t = ficha && ficha.tareas.find(x => x.id === id);
    if(!t) return;
    const lista = t.vias.length + t.lugares.length > 0;
    borrador = {
      id: t.id, alumnos: new Set([t.alumno_id]), titulo: t.titulo, mensaje: t.mensaje || '', tipo: lista ? 'lista' : 'zona',
      vias: t.vias.slice(), lugares: t.lugares.slice(), zona: lista ? '' : (t.zona || ''), modos: new Set(t.modos), rondas: t.rondas,
      minimo: t.minimo, fecha: t.fecha_limite || '', solo_esto: t.solo_esto, volverA: t.alumno_id
    };
    pintarFormulario();
  }
  function pintarFormulario(){
    const b = borrador;
    const datos = CJ.datos();
    const n = (k, uno, varios) => k + ' ' + (k === 1 ? uno : varios);
    const nombres = b.vias.map(id => datos && datos.viaPorId.get(id)).filter(Boolean).map(v => v.nombre)
      .concat(b.lugares.map(id => datos && datos.lugarPorId.get(id)).filter(Boolean).map(l => l.nombre))
      .sort((x, y) => x.localeCompare(y, 'es'));
    const para = b.id
      ? '<div class="cjp-para">' + escapeHtml(((alumnos || []).find(a => a.alumno_id === [...b.alumnos][0]) || {}).email || '') + '</div>'
      : (alumnos || []).map(a => '<label class="cjp-check"><input type="checkbox" value="' + a.alumno_id + '" class="cjp-alumno-check"' +
          (b.alumnos.has(a.alumno_id) ? ' checked' : '') + '> ' + escapeHtml(a.email) + '</label>').join('');
    panel(cabecera(b.id ? 'Editar tarea' : 'Nueva tarea', 'CJP.cancelarFormulario()') +
      '<div class="admin-form cjp-form">' +
        '<label for="cjpTitulo">Título</label>' +
        '<input id="cjpTitulo" maxlength="120" placeholder="Por ejemplo: Casco histórico, semana 1" value="' + escapeHtml(b.titulo) + '">' +
        '<label>Para</label>' + (para || '<div class="cj-hab-det">No tienes alumnos.</div>') +
        '<label>Qué tiene que estudiar</label>' +
        '<div class="cj-segmento">' +
          '<button type="button" class="' + (b.tipo === 'lista' ? 'activo' : '') + '" onclick="CJP.cambiarTipo(\'lista\')">Calles y lugares elegidos</button>' +
          '<button type="button" class="' + (b.tipo === 'zona' ? 'activo' : '') + '" onclick="CJP.cambiarTipo(\'zona\')">Una zona entera</button>' +
        '</div>' +
        (b.tipo === 'lista'
          ? '<div class="cjp-eleccion"><b>' + n(b.vias.length, 'calle', 'calles') + ' y ' + n(b.lugares.length, 'lugar', 'lugares') + '</b>' +
              '<button type="button" class="btn btn-ghost" onclick="CJP.elegirEnMapa()">' + (b.vias.length + b.lugares.length ? 'Cambiar en el mapa' : 'Elegir en el mapa') + '</button></div>' +
            (nombres.length ? '<details class="cjp-nombres"><summary>Ver la lista</summary>' + nombres.map(x => '<div>' + escapeHtml(x) + '</div>').join('') + '</details>' : '') +
            '<div class="cj-hab-det">Al alumno solo le saldrá esto: en las rondas de la tarea no aparece ninguna otra calle ni lugar.</div>'
          : '<select id="cjpZona" aria-label="Zona">' + (datos ? CJ.opcionesZona(b.zona) : '') + '</select>') +
        '<label>Modos que cuentan</label>' +
        '<div class="cjp-modos">' + Object.keys(CJ.MODOS).map(m => '<label class="cjp-check"><input type="checkbox" class="cjp-modo" value="' + m + '"' +
          (b.modos.has(m) ? ' checked' : '') + '> ' + escapeHtml(CJ.MODOS[m].titulo) + '</label>').join('') + '</div>' +
        '<div class="cj-hab-det">Si no marcas ninguno, vale cualquiera.</div>' +
        '<div class="cjp-fila">' +
          '<div><label for="cjpRondas">Rondas</label><input id="cjpRondas" type="number" min="1" max="50" value="' + b.rondas + '"></div>' +
          '<div><label for="cjpMinimo">Aciertos mínimos</label><select id="cjpMinimo">' +
            MINIMOS.map(v => '<option value="' + v + '"' + (v === b.minimo ? ' selected' : '') + '>' + v + '%</option>').join('') + '</select></div>' +
        '</div>' +
        '<label for="cjpFecha">Fecha límite (opcional)</label>' +
        '<input id="cjpFecha" type="date" value="' + escapeHtml(b.fecha) + '">' +
        '<label class="cjp-check cjp-solo"><input type="checkbox" id="cjpSolo"' + (b.solo_esto ? ' checked' : '') + '> ' +
          '<span><b>Solo esto.</b> Mientras la tarea esté activa, el alumno solo puede estudiar tus tareas (no puede elegir otras zonas). Se quita al archivarla o al desmarcarlo.</span></label>' +
        '<label for="cjpMensaje">Mensaje (opcional)</label>' +
        '<textarea id="cjpMensaje" maxlength="2000" placeholder="Explícale qué quieres que haga, en qué fijarse…">' + escapeHtml(b.mensaje) + '</textarea>' +
        '<div class="admin-form-actions">' +
          '<button type="button" class="btn btn-ghost" onclick="CJP.cancelarFormulario()">Cancelar</button>' +
          '<button type="button" class="btn btn-primary btn-light" id="cjpGuardar" onclick="CJP.guardarTarea()">' + (b.id ? 'Guardar' : 'Mandar tarea') + '</button>' +
        '</div>' +
      '</div>');
  }
  // Lo escrito en el formulario pasa al borrador (antes de irse al mapa o de guardar).
  function leerFormulario(){
    const b = borrador;
    if(!b || !el('cjpTitulo')) return;
    b.titulo = el('cjpTitulo').value.trim();
    if(!b.id) b.alumnos = new Set([...document.querySelectorAll('.cjp-alumno-check')].filter(c => c.checked).map(c => c.value));
    if(el('cjpZona')) b.zona = el('cjpZona').value;
    b.modos = new Set([...document.querySelectorAll('.cjp-modo')].filter(c => c.checked).map(c => c.value));
    b.rondas = Math.max(1, Math.min(50, parseInt(el('cjpRondas').value, 10) || 1));
    b.minimo = parseInt(el('cjpMinimo').value, 10) || 80;
    b.fecha = el('cjpFecha').value || '';
    b.solo_esto = el('cjpSolo').checked;
    b.mensaje = el('cjpMensaje').value.trim();
  }
  function cambiarTipo(tipo){ leerFormulario(); borrador.tipo = tipo; pintarFormulario(); }
  async function elegirEnMapa(){
    leerFormulario();
    let r = null;
    try{ r = await CJ.seleccionar({ vias: borrador.vias, lugares: borrador.lugares }); }
    catch(e){ uiToast('No se ha podido abrir el mapa: ' + e.message, 'error'); }
    if(r){ borrador.vias = r.vias; borrador.lugares = r.lugares; }
    pintarFormulario();
  }
  async function cancelarFormulario(){
    const b = borrador;
    const escrito = b && !b.id && ((el('cjpTitulo') && el('cjpTitulo').value.trim()) || b.vias.length || b.lugares.length);
    if(escrito && !(await uiConfirm('¿Salir sin mandar la tarea?'))) return;
    borrador = null;
    if(b && b.volverA && ficha) pintarFicha();
    else volverALista();
  }
  async function guardarTarea(){
    leerFormulario();
    const b = borrador;
    if(!b.titulo){ uiToast('Ponle un título a la tarea.', 'info'); return; }
    if(!b.alumnos.size){ uiToast('Elige al menos un alumno.', 'info'); return; }
    if(b.tipo === 'lista' && !(b.vias.length + b.lugares.length)){ uiToast('Elige en el mapa las calles o los lugares que tiene que estudiar.', 'info'); return; }
    const fila = {
      titulo: b.titulo, mensaje: b.mensaje || null,
      vias: b.tipo === 'lista' ? b.vias : [], lugares: b.tipo === 'lista' ? b.lugares : [], zona: b.tipo === 'zona' ? b.zona : null,
      modos: [...b.modos], rondas: b.rondas, minimo: b.minimo, fecha_limite: b.fecha || null, solo_esto: b.solo_esto
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
    const volverA = b.volverA || (b.alumnos.size === 1 ? [...b.alumnos][0] : null);
    if(volverA) abrirAlumno(volverA); else volverALista();
  }

  /* ---------- mensajes de una tarea (profesor y alumno) ---------- */
  async function abrirMensajes(id){
    hilo = { id, tarea: null, mensajes: [], volver: ficha && ficha.tareas.some(t => t.id === id) ? 'ficha' : 'inicio' };
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
    CJ.volver();
    CJ.recargarTareas();
  }

  function reiniciar(){ alumnos = null; alumnosAt = 0; ficha = null; borrador = null; hilo = null; }

  return { pintarAlumnos, abrirAlumno, volverALista, cambiarZonaFicha, alternarRondas, tareaConFalladas,
    nuevaTarea, editarTarea, cambiarTipo, elegirEnMapa, cancelarFormulario, guardarTarea, archivarTarea, borrarTarea,
    abrirMensajes, enviarMensaje, cerrarMensajes, reiniciar };
})();
