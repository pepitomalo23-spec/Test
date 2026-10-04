/* ============================================================
   PLANX · Exámenes combinados del Plan de estudio
   - Generador: temas, nº de preguntas, fuentes (el banco de pj.fire y
     las preguntas propias), «priorizar mis fallos» y tiempo.
   - Ejecución en #screen-plan-examen: todas las preguntas en lista, con
     su fuente; el progreso se guarda en el dispositivo (se puede salir y
     seguir), y el tiempo es el ACTIVO (no cuenta con la app en segundo
     plano).
   - Corrección y guardado: el resultado completo va al Plan
     (plan_resultados, fuente 'examen', con el detalle de cada pregunta);
     la parte del banco va además al historial de Legislación
     (guardarSesionBanco), para que cuente en Fallos y Estadísticas.
   - Errores recurrentes y exámenes de repaso con los fallos.
   - «Mis preguntas»: alta, edición y aviso de duplicados. Las de Tutor
     Bombero se apuntan a mano, sueltas, para el repaso personal: no hay
     importación masiva.
   Todo texto (del banco o del usuario) se pinta escapado.
   ============================================================ */
const PLANX = (function(){
  'use strict';

  const FUENTES = { pjfire: 'Banco pj.fire', propia: 'Mis preguntas', tutor_bombero: 'Tutor Bombero', otra: 'Otra' };
  const LETRAS = ['A', 'B', 'C', 'D'];
  const MAX_PREGUNTAS = 200;

  let vista = 'inicio';             // 'inicio' | 'preguntas'
  let conf = { temas: null, n: 20, banco: true, propias: true, fallos: false, minutos: 0 };
  let examen = null;                // el que se está haciendo (también en localStorage)
  let corregido = null;             // la última corrección, para pintarla
  let reloj = null;
  let filtroP = { tema: '', fuente: '', texto: '' };

  function yo(){ return currentUser ? currentUser.id : null; }
  function claveExamen(){ return 'plan_examen_v1_' + yo(); }
  function D(){ return PLAN.datos(); }
  function plural(n, a, b){ return n + ' ' + (n === 1 ? a : b); }
  function idAttr(x){ return /^[0-9a-f-]{36}$/i.test(String(x || '')) ? x : ''; }
  function etiquetaFuente(f, ref){
    const cls = f === 'pjfire' ? 'pj' : f === 'tutor_bombero' ? 'tb' : f === 'propia' ? 'propia' : 'otra';
    return '<span class="pl-plat ' + cls + '">' + esc(FUENTES[f] || 'Otra') + (ref ? ' · ' + esc(ref) : '') + '</span>';
  }

  /* ---------- examen en curso (persistencia) ---------- */
  function guardarProgreso(){
    if(!examen || !yo()) return;
    try{ localStorage.setItem(claveExamen(), JSON.stringify(examen)); }catch(e){}
  }
  function leerProgreso(){
    if(!yo()) return null;
    try{
      const e = JSON.parse(localStorage.getItem(claveExamen()));
      return e && Array.isArray(e.preguntas) && e.preguntas.length ? e : null;
    }catch(e){ return null; }
  }
  function borrarProgreso(){ try{ localStorage.removeItem(claveExamen()); }catch(e){} }

  /* ---------- el «pool» de preguntas ---------- */
  // Banco: las de QUESTIONS_POOL cuyos temas del banco estén vinculados a un tema del plan.
  function poolBanco(mapa){
    return (QUESTIONS_POOL || []).filter(q => mapa[q.topic_id] && Array.isArray(q.options) && q.options.length >= 2)
      .map(q => ({ k: 'b:' + q.id, id: q.id, f: 'pjfire', t: mapa[q.topic_id], q: q.q, options: q.options, correct: q.correct, explain: q.explain || '' }));
  }
  function poolPropias(){
    return D().preguntas.filter(p => !p.archivada && Array.isArray(p.opciones))
      .map(p => ({ k: 'p:' + p.id, id: p.id, f: p.fuente || 'propia', t: p.tema_id || null, q: p.enunciado, options: p.opciones, correct: p.correcta, explain: p.explicacion || '', ref: p.referencia || '' }));
  }
  function preguntaDeClave(k, mapa){
    if(typeof k !== 'string') return null;
    if(k.startsWith('b:')){
      const id = Number(k.slice(2));
      const q = (QUESTIONS_POOL || []).find(x => x.id === id);
      return q ? { k, id, f: 'pjfire', t: mapa[q.topic_id] || null, q: q.q, options: q.options, correct: q.correct, explain: q.explain || '' } : null;
    }
    if(k.startsWith('p:')){
      const p = D().preguntas.find(x => x.id === k.slice(2));
      return p ? { k, id: p.id, f: p.fuente || 'propia', t: p.tema_id || null, q: p.enunciado, options: p.opciones, correct: p.correcta, explain: p.explicacion || '', ref: p.referencia || '' } : null;
    }
    return null;
  }
  // Fallos por pregunta: los del Plan (exámenes y tests de pj.fire) y, del banco, las que están en rojo.
  function fallosPorClave(){
    const m = {};
    PLANL.erroresRecurrentes(D().resultados, 1).forEach(e => { m[e.k] = e.fallos; });
    (QUESTIONS_POOL || []).forEach(q => { if(q.masteryStatus === 'red') m['b:' + q.id] = (m['b:' + q.id] || 0) + 1; });
    return m;
  }

  /* ============================================================
     PESTAÑA «EXÁMENES»
     ============================================================ */
  function render(el){
    if(!el) return;
    if(vista === 'preguntas'){ renderPreguntas(el); return; }
    const d = D();
    const mapa = PLAN.mapaTopicTema();
    const temas = PLAN.temasOrdenados(false);
    const enCurso = leerProgreso();
    let html = '';
    if(enCurso){
      const resp = enCurso.respuestas.filter(r => r !== null && r !== undefined).length;
      html += '<div class="pl-card plx-encurso"><div><b>Tienes un examen a medias</b><span class="pl-suave">' + esc(enCurso.titulo) + ' · ' + resp + ' de ' + enCurso.preguntas.length + ' respondidas</span></div>' +
        '<div class="pl-acciones"><button type="button" class="btn btn-primary" onclick="PLANX.continuar()">Continuar</button><button type="button" class="btn btn-ghost" onclick="PLANX.descartar()">Descartar</button></div></div>';
    }
    // Generador
    const sinVinculo = temas.filter(t => !(t.topic_ids || []).length);
    html += '<section class="pl-card"><h2 class="pl-seccion">Nuevo examen</h2>' +
      '<div class="pl-campo"><span>Temas</span><div class="pl-chips" role="group" aria-label="Temas">' +
      '<button type="button" class="pl-chip' + (!conf.temas ? ' on' : '') + '" aria-pressed="' + !conf.temas + '" onclick="PLANX.tema(\'todos\')">Todos</button>' +
      temas.map(t => '<button type="button" class="pl-chip' + (conf.temas && conf.temas.includes(t.id) ? ' on' : '') + '" aria-pressed="' + !!(conf.temas && conf.temas.includes(t.id)) + '" onclick="PLANX.tema(\'' + idAttr(t.id) + '\')">' + esc(t.numero != null ? t.numero + '. ' + t.nombre : t.nombre) + '</button>').join('') +
      '</div></div>' +
      '<div class="pl-campo"><span>Preguntas</span><div class="pl-chips" role="radiogroup" aria-label="Número de preguntas">' +
      [10, 20, 30, 40, 60].map(n => '<button type="button" role="radio" aria-checked="' + (conf.n === n) + '" class="pl-chip' + (conf.n === n ? ' on' : '') + '" onclick="PLANX.num(' + n + ')">' + n + '</button>').join('') + '</div></div>' +
      '<div class="pl-campo"><span>Fuentes</span><div class="pl-chips" role="group" aria-label="Fuentes">' +
      '<button type="button" class="pl-chip' + (conf.banco ? ' on' : '') + '" aria-pressed="' + conf.banco + '" onclick="PLANX.fuente(\'banco\')">Banco de pj.fire</button>' +
      '<button type="button" class="pl-chip' + (conf.propias ? ' on' : '') + '" aria-pressed="' + conf.propias + '" onclick="PLANX.fuente(\'propias\')">Mis preguntas (' + d.preguntas.filter(p => !p.archivada).length + ')</button></div></div>' +
      '<div class="pl-campo"><span>Tiempo</span><div class="pl-chips" role="radiogroup" aria-label="Tiempo">' +
      [0, 15, 30, 45, 60].map(m => '<button type="button" role="radio" aria-checked="' + (conf.minutos === m) + '" class="pl-chip' + (conf.minutos === m ? ' on' : '') + '" onclick="PLANX.minutos(' + m + ')">' + (m ? m + ' min' : 'Sin límite') + '</button>').join('') + '</div></div>' +
      '<div class="pl-ajuste-fila"><div><b>Priorizar mis fallos</b><span class="pl-suave">Primero las preguntas que más has fallado.</span></div>' +
      '<button type="button" class="switch' + (conf.fallos ? ' on' : '') + '" role="switch" aria-checked="' + conf.fallos + '" aria-label="Priorizar mis fallos" onclick="PLANX.alternarFallos()"><span class="knob"></span></button></div>' +
      (conf.banco && temas.length && sinVinculo.length === temas.length ? '<p class="pl-aviso-linea">Ninguno de tus temas está vinculado con tu banco de pj.fire, así que no saldrán preguntas del banco. <button type="button" class="pl-enlace" onclick="PLAN.irA(\'ajustes\')">Vincúlalos en Ajustes › Temas</button>.</p>' : '') +
      (!temas.length ? '<p class="pl-aviso-linea">Crea tus temas en Ajustes para poder elegir de qué temas es el examen.</p>' : '') +
      '<div class="pl-acciones"><button type="button" class="btn btn-primary" onclick="PLANX.generar()">Generar examen</button></div></section>';

    // Errores recurrentes
    const errores = PLANL.erroresRecurrentes(d.resultados).slice(0, 40);
    html += '<section class="pl-card"><h2 class="pl-seccion">Errores recurrentes <span class="pl-num gris">' + errores.length + '</span></h2>';
    if(errores.length){
      html += errores.slice(0, 8).map(e => {
        const p = preguntaDeClave(e.k, mapa);
        return '<div class="pl-fila"><div class="pl-fila-txt"><b class="plx-corta">' + esc(p ? p.q : 'Pregunta ya no disponible') + '</b><span>' +
          plural(e.fallos, 'fallo', 'fallos') + ' · ' + plural(e.aciertos, 'acierto', 'aciertos') + (p ? ' · ' + esc(FUENTES[p.f] || '') : '') + '</span></div></div>';
      }).join('') +
        (errores.length > 8 ? '<p class="pl-pie">Y ' + (errores.length - 8) + ' más.</p>' : '') +
        '<div class="pl-acciones"><button type="button" class="btn btn-primary" onclick="PLANX.repasoErrores()">Examen de repaso con estos fallos</button></div>';
    } else {
      html += '<p class="pl-suave plx-txt">Aquí aparecerán las preguntas que falles dos o más veces en los exámenes del plan y en los tests de pj.fire lanzados desde el plan.</p>';
    }
    html += '</section>';

    // Mis preguntas
    const porFuente = {};
    d.preguntas.filter(p => !p.archivada).forEach(p => { porFuente[p.fuente] = (porFuente[p.fuente] || 0) + 1; });
    html += '<section class="pl-card"><h2 class="pl-seccion">Mis preguntas</h2><p class="plx-txt">' +
      (Object.keys(porFuente).length ? Object.keys(porFuente).map(f => plural(porFuente[f], 'pregunta', 'preguntas') + ' de ' + (FUENTES[f] || f).toLowerCase()).join(' · ') : 'Aún no has añadido preguntas tuyas.') +
      '</p><p class="pl-suave plx-txt">Escribe aquí las preguntas que quieras repasar (tuyas, o una pregunta suelta de Tutor Bombero que te cueste) y saldrán mezcladas con las del banco, con su fuente.</p>' +
      '<div class="pl-acciones"><button type="button" class="btn btn-ghost" onclick="PLANX.verPreguntas()">Ver y editar</button><button type="button" class="btn btn-ghost" onclick="PLANX.editarPregunta()">+ Nueva pregunta</button></div></section>';

    // Últimos exámenes
    const hechos = d.resultados.filter(r => r.fuente === 'examen').sort((a, b) => String(b.realizado_at).localeCompare(String(a.realizado_at))).slice(0, 8);
    if(hechos.length){
      html += '<section class="pl-card"><h2 class="pl-seccion">Últimos exámenes</h2>' + hechos.map(r =>
        '<button type="button" class="pl-mini" onclick="PLANX.verExamen(\'' + idAttr(r.id) + '\')"><span class="pl-mini-txt"><b>' + esc(r.titulo || 'Examen') + '</b><small>' +
        esc(PLANL.fechaCorta(PLANL.hoy(new Date(Date.parse(r.realizado_at) || Date.now())))) + ' · nota ' + esc(r.nota == null ? '—' : formatNota(r.nota)) + ' · ' + (Number(r.aciertos) || 0) + ' ✓ ' + (Number(r.fallos) || 0) + ' ✗</small></span></button>').join('') + '</section>';
    }
    el.innerHTML = html;
  }

  function tema(id){
    const temas = PLAN.temasOrdenados(false).map(t => t.id);
    if(id === 'todos'){ conf.temas = null; }
    else if(temas.includes(id)){
      let l = conf.temas ? conf.temas.slice() : [];
      l = l.includes(id) ? l.filter(x => x !== id) : l.concat([id]);
      conf.temas = l.length ? l : null;
    }
    PLAN.repintar();
  }
  function num(n){ conf.n = n; PLAN.repintar(); }
  function minutos(m){ conf.minutos = m; PLAN.repintar(); }
  function fuente(f){
    if(f === 'banco') conf.banco = !conf.banco;
    if(f === 'propias') conf.propias = !conf.propias;
    if(!conf.banco && !conf.propias){ conf[f === 'banco' ? 'banco' : 'propias'] = true; uiToast('Elige al menos una fuente.', 'error'); }
    PLAN.repintar();
  }
  function alternarFallos(){ conf.fallos = !conf.fallos; PLAN.repintar(); }

  /* ---------- generar ---------- */
  function generar(){
    if(conf.banco && whenAppDataReady(generar)) return;
    if(leerProgreso()){ uiToast('Termina o descarta antes el examen que tienes a medias.', 'error'); return; }
    const mapa = PLAN.mapaTopicTema();
    const pool = (conf.banco ? poolBanco(mapa) : []).concat(conf.propias ? poolPropias() : []);
    const r = PLANL.generarExamen({ pool, n: Math.min(conf.n, MAX_PREGUNTAS), temaIds: conf.temas, priorizarFallos: conf.fallos, fallosPorClave: conf.fallos ? fallosPorClave() : {}, semilla: Date.now() });
    if(!r.preguntas.length){
      uiToast(pool.length ? 'No hay preguntas de esos temas con esas fuentes.' : 'No hay preguntas disponibles: vincula tus temas con el banco o añade preguntas tuyas.', 'error');
      return;
    }
    const titulo = conf.temas ? (conf.temas.length === 1 ? 'Examen · ' + PLAN.nombreTema(conf.temas[0]) : 'Examen de ' + conf.temas.length + ' temas') : 'Examen de todos los temas';
    previa(r, titulo, conf.minutos);
  }
  function previa(r, titulo, mins){
    const fuentes = Object.keys(r.porFuente).map(f => plural(r.porFuente[f], 'de ' + (FUENTES[f] || f).toLowerCase(), 'de ' + (FUENTES[f] || f).toLowerCase())).join(', ');
    const temas = Object.keys(r.porTema).map(t => esc(t === 'sin_tema' ? 'Sin tema' : PLAN.nombreTema(t)) + ': ' + r.porTema[t]).join(' · ');
    PLAN.hoja({ titulo: titulo,
      html: '<p class="pl-hoja-txt"><b>' + plural(r.preguntas.length, 'pregunta', 'preguntas') + '</b>: ' + esc(fuentes) + '.</p>' +
        '<p class="pl-hoja-txt pl-suave">' + temas + '</p>' +
        (r.preguntas.length < conf.n ? '<p class="pl-hoja-txt pl-suave">Solo había ' + r.disponibles + ' disponibles.</p>' : '') +
        (r.duplicadas ? '<p class="pl-hoja-txt pl-suave">' + plural(r.duplicadas, 'pregunta repetida descartada', 'preguntas repetidas descartadas') + ' (la misma en dos fuentes).</p>' : '') +
        '<p class="pl-hoja-txt pl-suave">' + (mins ? 'Tiempo: ' + mins + ' minutos.' : 'Sin límite de tiempo.') + ' Cada fallo resta ⅓ de acierto (½ si la pregunta tiene 3 opciones).</p>',
      botones: [{ texto: 'Empezar', clase: 'primario', accion: () => { empezar(r.preguntas, titulo, mins); } }, { texto: 'Cancelar' }] });
  }
  function empezar(preguntas, titulo, mins){
    examen = {
      id: PLAN.uid(), titulo: String(titulo).slice(0, 160), minutos: mins || 0, creado: Date.now(), activoSeg: 0,
      preguntas: preguntas.map(p => ({ k: p.k, id: p.id, f: p.f, t: p.t, q: p.q, options: p.options, correct: p.correct, explain: p.explain, ref: p.ref || '' })),
      respuestas: preguntas.map(() => null)
    };
    corregido = null;
    guardarProgreso();
    abrirEjecucion();
  }
  function continuar(){
    examen = leerProgreso();
    if(!examen){ PLAN.repintar(); return; }
    corregido = null;
    abrirEjecucion();
  }
  async function descartar(){
    if(!await uiConfirm('¿Descartar el examen a medias?\n\nNo se guardará nada de él.', { ok: 'Descartar', danger: true })) return;
    borrarProgreso();
    examen = null;
    PLAN.repintar();
  }

  /* ============================================================
     EJECUCIÓN (#screen-plan-examen)
     ============================================================ */
  function abrirEjecucion(){
    showScreen('screen-plan-examen');
    pintarEjecucion();
    arrancarReloj();
    window.scrollTo(0, 0);
  }
  function raiz(){ return document.getElementById('planExamenRaiz'); }
  function respondidas(){ return examen ? examen.respuestas.filter(r => r !== null && r !== undefined).length : 0; }
  function textoTiempo(){
    if(!examen) return '';
    const s = examen.minutos ? Math.max(0, examen.minutos * 60 - examen.activoSeg) : examen.activoSeg;
    return formatMMSS(s);
  }
  function pintarEjecucion(){
    const el = raiz();
    if(!el || !examen) return;
    el.innerHTML = '<div class="plx-barra">' +
      '<button type="button" class="btn btn-ghost" onclick="PLANX.salir()">Salir</button>' +
      '<div class="plx-progreso"><b id="plxCuenta">' + respondidas() + ' / ' + examen.preguntas.length + '</b><span>respondidas</span></div>' +
      '<div class="plx-tiempo' + (examen.minutos ? ' cuenta-atras' : '') + '" id="plxTiempo" aria-label="' + (examen.minutos ? 'Tiempo restante' : 'Tiempo') + '">' + textoTiempo() + '</div>' +
      '<button type="button" class="btn btn-primary" onclick="PLANX.terminar()">Terminar</button></div>' +
      '<h1 class="plx-titulo">' + esc(examen.titulo) + '</h1>' +
      '<div class="plx-lista">' + examen.preguntas.map((p, i) => {
        return '<article class="plx-preg" id="plxP' + i + '"><div class="plx-preg-cab"><span class="plx-n">' + (i + 1) + '</span>' + etiquetaFuente(p.f, p.ref) +
          '<span class="pl-suave plx-tema">' + esc(p.t ? PLAN.nombreTema(p.t) : 'Sin tema') + '</span></div>' +
          '<div class="plx-enunciado">' + esc(p.q) + '</div><div class="plx-opciones" role="radiogroup" aria-label="Respuestas de la pregunta ' + (i + 1) + '">' +
          p.options.map((o, j) => '<button type="button" role="radio" class="plx-op' + (examen.respuestas[i] === j ? ' on' : '') + '" aria-checked="' + (examen.respuestas[i] === j) + '" data-p="' + i + '" data-o="' + j + '">' +
            '<span class="plx-letra">' + LETRAS[j] + '</span><span class="plx-op-txt">' + esc(o) + '</span></button>').join('') + '</div></article>';
      }).join('') + '</div>' +
      '<div class="plx-fin"><button type="button" class="btn btn-primary btn-block" onclick="PLANX.terminar()">Terminar y corregir</button>' +
      '<p class="pl-suave">Tocar una respuesta elegida la deja en blanco. Las preguntas en blanco no restan.</p></div>';
    el.querySelector('.plx-lista').addEventListener('click', ev => {
      const b = ev.target.closest('.plx-op');
      if(!b || !examen) return;
      const i = Number(b.dataset.p), j = Number(b.dataset.o);
      examen.respuestas[i] = examen.respuestas[i] === j ? null : j;
      b.parentElement.querySelectorAll('.plx-op').forEach(x => { const on = Number(x.dataset.o) === examen.respuestas[i]; x.classList.toggle('on', on); x.setAttribute('aria-checked', on); });
      const c = document.getElementById('plxCuenta');
      if(c) c.textContent = respondidas() + ' / ' + examen.preguntas.length;
      guardarProgreso();
    });
  }
  // Tiempo activo: solo suma con la pantalla del examen visible y la app en primer plano.
  function arrancarReloj(){
    pararReloj();
    let marca = Date.now();
    reloj = setInterval(() => {
      const ahora = Date.now();
      const activo = examen && document.visibilityState === 'visible' && document.querySelector('#screen-plan-examen.active');
      if(activo){
        examen.activoSeg += Math.min(5, Math.max(0, Math.round((ahora - marca) / 1000)));
        const t = document.getElementById('plxTiempo');
        if(t) t.textContent = textoTiempo();
        if(examen.activoSeg % 10 === 0) guardarProgreso();
        if(examen.minutos && examen.activoSeg >= examen.minutos * 60){
          pararReloj();
          uiToast('Se ha acabado el tiempo: se corrige el examen.', 'info');
          terminar(true);
        }
      }
      marca = ahora;
    }, 1000);
  }
  function pararReloj(){ if(reloj){ clearInterval(reloj); reloj = null; } }
  function salir(){
    guardarProgreso();
    pararReloj();
    examen = null;
    showScreen('screen-plan');
    PLAN.irA('examenes');
  }
  async function terminar(sinPreguntar){
    if(!examen || examen.terminando) return;
    const blancas = examen.preguntas.length - respondidas();
    if(!sinPreguntar && blancas){
      const ok = await uiConfirm('Te quedan ' + plural(blancas, 'pregunta', 'preguntas') + ' en blanco\n\nLas preguntas en blanco no restan, pero tampoco suman. ¿Corregir ya?', { ok: 'Corregir', title: '¿Terminar el examen?' });
      if(!ok || !examen) return;
    }
    examen.terminando = true;
    pararReloj();
    const ex = examen;
    const c = PLANL.corregir(ex.preguntas, ex.respuestas);
    const detalle = c.detalle.map((x, i) => ({ k: x.k, t: x.t, f: x.f, ok: x.ok, s: ex.respuestas[i] == null ? null : ex.respuestas[i] }));
    const res = {
      id: ex.id, test_id: null, tarea_id: null, fuente: 'examen', titulo: ex.titulo, realizado_at: new Date().toISOString(),
      aciertos: c.aciertos, fallos: c.fallos, blancos: c.blancos, total: c.total, nota: c.nota == null ? 0 : c.nota,
      duracion_seg: Math.min(86400, ex.activoSeg), duracion_medida: true, detalle: detalle.slice(0, 300), session_id: null
    };
    PLAN.guardar('plan_resultados', res);
    PLAN.evento('completado', { datos: { fuente: 'examen', nota: res.nota, preguntas: res.total } });
    borrarProgreso();
    examen = null;
    corregido = { titulo: ex.titulo, preguntas: ex.preguntas, respuestas: ex.respuestas, c, resultadoId: res.id };
    pintarCorreccion();
    window.scrollTo(0, 0);
    // La parte del banco, al historial de Legislación (Fallos, Estadísticas…).
    const banco = ex.preguntas.map((p, i) => ({ p, r: ex.respuestas[i] })).filter(x => typeof x.p.k === 'string' && x.p.k.startsWith('b:'));
    if(banco.length && typeof guardarSesionBanco === 'function'){
      try{
        const sid = await guardarSesionBanco({ mode: 'examen', preguntas: banco.map(x => ({ id: x.p.id, correct: x.p.correct, options: x.p.options })), respuestas: banco.map(x => x.r) }, res.duracion_seg);
        if(sid) PLAN.cambiar('plan_resultados', res.id, { session_id: sid });
      }catch(e){ reportClientError('plan-examen', 'No se pudo guardar la parte del banco: ' + (e && (e.message || e))); }
    }
  }

  /* ---------- corrección ---------- */
  function pintarCorreccion(){
    const el = raiz();
    if(!el || !corregido) return;
    const { c, preguntas, respuestas } = corregido;
    const fallosK = preguntas.filter((p, i) => c.detalle[i].ok !== true).map(p => p.k);
    el.innerHTML = '<div class="plx-barra"><button type="button" class="btn btn-ghost" onclick="PLANX.volver()">Volver al plan</button>' +
      '<div class="plx-progreso"><b>Corrección</b></div></div>' +
      '<h1 class="plx-titulo">' + esc(corregido.titulo) + '</h1>' +
      '<div class="plx-resumen"><div class="plx-nota"><span>Nota</span><b>' + formatNota(c.nota || 0) + '</b></div>' +
      '<div class="plx-cuentas"><span class="c-ok">' + (Number(c.aciertos) || 0) + ' aciertos</span><span class="c-bad">' + (Number(c.fallos) || 0) + ' fallos</span><span class="c-pending">' + (Number(c.blancos) || 0) + ' en blanco</span></div></div>' +
      '<p class="pl-suave">Guardado en tu plan' + (preguntas.some(p => String(p.k).startsWith('b:')) ? '; las del banco cuentan también en Legislación (Fallos y Estadísticas)' : '') + '.</p>' +
      (fallosK.length ? '<div class="pl-acciones"><button type="button" class="btn btn-primary" onclick="PLANX.repasarFallosCorreccion()">Repasar estos ' + fallosK.length + ' fallos</button></div>' : '') +
      '<div class="plx-lista">' + preguntas.map((p, i) => htmlCorregida(p, respuestas[i], c.detalle[i].ok, i)).join('') + '</div>' +
      '<div class="plx-fin"><button type="button" class="btn btn-ghost btn-block" onclick="PLANX.volver()">Volver al plan</button></div>';
  }
  function htmlCorregida(p, r, ok, i){
    const estado = ok === true ? 'bien' : ok === false ? 'mal' : 'blanco';
    return '<article class="plx-preg ' + estado + '"><div class="plx-preg-cab"><span class="plx-n">' + (i + 1) + '</span>' + etiquetaFuente(p.f, p.ref) +
      '<span class="plx-veredicto ' + estado + '">' + (ok === true ? 'Bien' : ok === false ? 'Mal' : 'En blanco') + '</span></div>' +
      '<div class="plx-enunciado">' + esc(p.q) + '</div><div class="plx-opciones">' +
      (p.options || []).map((o, j) => {
        const cls = j === Number(p.correct) ? ' correcta' : (j === r ? ' elegida' : '');
        return '<div class="plx-op fija' + cls + '"><span class="plx-letra">' + LETRAS[j] + '</span><span class="plx-op-txt">' + esc(o) + '</span>' +
          (j === Number(p.correct) ? '<span class="plx-marca">Correcta</span>' : j === r ? '<span class="plx-marca">Tu respuesta</span>' : '') + '</div>';
      }).join('') + '</div>' +
      (p.explain ? '<details class="plx-explica"><summary>Explicación</summary><div>' + esc(p.explain) + '</div></details>' : '') + '</article>';
  }
  function volver(){
    corregido = null;
    showScreen('screen-plan');
    PLAN.irA('examenes');
  }
  function repasarFallosCorreccion(){
    if(!corregido) return;
    const ps = corregido.preguntas.filter((p, i) => corregido.c.detalle[i].ok !== true);
    if(!ps.length) return;
    empezar(PLANL.generarExamen({ pool: ps, n: ps.length, semilla: Date.now() }).preguntas, 'Repaso de fallos · ' + corregido.titulo, 0);
  }
  // Repaso con los errores recurrentes (de todos los temas y fuentes).
  function repasoErrores(){
    if(whenAppDataReady(repasoErrores)) return;
    if(leerProgreso()){ uiToast('Termina o descarta antes el examen que tienes a medias.', 'error'); return; }
    const mapa = PLAN.mapaTopicTema();
    const errores = PLANL.erroresRecurrentes(D().resultados);
    const pool = errores.map(e => preguntaDeClave(e.k, mapa)).filter(Boolean);
    if(!pool.length){ uiToast('Esas preguntas ya no están disponibles.', 'error'); return; }
    const r = PLANL.generarExamen({ pool, n: Math.min(40, pool.length), semilla: Date.now() });
    previa(r, 'Repaso de errores recurrentes', 0);
  }
  // Ver un examen ya hecho (con el detalle guardado).
  function verExamen(id){
    const r = D().resultados.find(x => x.id === id);
    if(!r) return;
    if(whenAppDataReady(() => verExamen(id))) return;
    const mapa = PLAN.mapaTopicTema();
    const det = Array.isArray(r.detalle) ? r.detalle : [];
    const preguntas = [], respuestas = [], dets = [];
    let perdidas = 0;
    det.forEach(x => {
      const p = preguntaDeClave(x.k, mapa);
      if(!p){ perdidas++; return; }
      preguntas.push(p); respuestas.push(Number.isInteger(x.s) ? x.s : null); dets.push({ ok: x.ok === true ? true : x.ok === false ? false : null });
    });
    corregido = { titulo: (r.titulo || 'Examen') + ' · ' + PLANL.fechaCorta(PLANL.hoy(new Date(Date.parse(r.realizado_at) || Date.now()))), preguntas, respuestas,
      c: { aciertos: Number(r.aciertos) || 0, fallos: Number(r.fallos) || 0, blancos: Number(r.blancos) || 0, nota: Number(r.nota) || 0, detalle: dets }, resultadoId: r.id };
    showScreen('screen-plan-examen');
    pintarCorreccion();
    if(perdidas) uiToast(plural(perdidas, 'pregunta ya no existe', 'preguntas ya no existen') + ' y no se muestra' + (perdidas === 1 ? '' : 'n') + '.', 'info');
    window.scrollTo(0, 0);
  }

  /* ============================================================
     MIS PREGUNTAS
     ============================================================ */
  function verPreguntas(){ vista = 'preguntas'; PLAN.repintar(); }
  function renderPreguntas(el){
    el.innerHTML = '<button type="button" class="pl-enlace pl-volver" onclick="PLANX.volverInicio()">‹ Volver a Exámenes</button>' +
      '<h2 class="pl-h2">Mis preguntas</h2>' +
      '<div class="pl-barra-tests"><input class="pl-input" type="search" id="plxBuscar" placeholder="Buscar…" value="' + esc(filtroP.texto) + '" aria-label="Buscar en mis preguntas" autocomplete="off">' +
      '<select class="pl-input plx-sel" id="plxTema" aria-label="Tema"><option value="">Todos los temas</option><option value="sin"' + (filtroP.tema === 'sin' ? ' selected' : '') + '>Sin tema</option>' +
      PLAN.temasOrdenados(true).map(t => '<option value="' + idAttr(t.id) + '"' + (filtroP.tema === t.id ? ' selected' : '') + '>' + esc(PLAN.nombreTema(t.id)) + '</option>').join('') + '</select>' +
      '<select class="pl-input plx-sel" id="plxFuente" aria-label="Fuente"><option value="">Todas las fuentes</option>' +
      ['propia', 'tutor_bombero', 'otra'].map(f => '<option value="' + f + '"' + (filtroP.fuente === f ? ' selected' : '') + '>' + esc(FUENTES[f]) + '</option>').join('') +
      '<option value="archivadas"' + (filtroP.fuente === 'archivadas' ? ' selected' : '') + '>Archivadas</option></select>' +
      '<button type="button" class="btn btn-primary" onclick="PLANX.editarPregunta()">+ Nueva pregunta</button></div><div id="plxListaP"></div>';
    const lista = el.querySelector('#plxListaP');
    el.querySelector('#plxBuscar').addEventListener('input', ev => { filtroP.texto = ev.target.value.slice(0, 100); listaPreguntas(lista); });
    el.querySelector('#plxTema').addEventListener('change', ev => { filtroP.tema = ev.target.value; listaPreguntas(lista); });
    el.querySelector('#plxFuente').addEventListener('change', ev => { filtroP.fuente = ev.target.value; listaPreguntas(lista); });
    listaPreguntas(lista);
  }
  function listaPreguntas(el){
    const d = D();
    const q = PLANL.normalizar(filtroP.texto);
    const lista = d.preguntas.filter(p => !p.archivada || filtroP.fuente === 'archivadas')
      .filter(p => filtroP.fuente === 'archivadas' ? p.archivada : (!filtroP.fuente || p.fuente === filtroP.fuente))
      .filter(p => !filtroP.tema || (filtroP.tema === 'sin' ? !p.tema_id : p.tema_id === filtroP.tema))
      .filter(p => !q || PLANL.normalizar(p.enunciado + ' ' + (p.referencia || '')).includes(q))
      .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
    el.innerHTML = (lista.length ? lista.map(p => '<div class="pl-fila"><div class="pl-fila-txt"><b class="plx-corta">' + esc(p.enunciado) + '</b><span>' + etiquetaFuente(p.fuente, p.referencia) + ' · ' +
        esc(PLAN.nombreTema(p.tema_id)) + '</span></div><button type="button" class="btn btn-ghost" onclick="PLANX.editarPregunta(\'' + idAttr(p.id) + '\')">Editar</button></div>').join('')
        : '<div class="pl-vacio">' + (d.preguntas.length ? 'Ninguna pregunta coincide.' : 'Aún no tienes preguntas propias.') + '</div>');
  }
  function volverInicio(){ vista = 'inicio'; PLAN.repintar(); }

  function editarPregunta(id){
    const p0 = id ? D().preguntas.find(p => p.id === id) : null;
    const p = Object.assign({ fuente: 'propia', opciones: ['', '', '', ''], correcta: 0 }, p0 || {});
    const ops = (p.opciones || []).concat(['', '', '', '']).slice(0, 4);
    let avisadoBanco = false;
    PLAN.hoja({ titulo: p0 ? 'Editar pregunta' : 'Nueva pregunta', ancha: true,
      html: '<div class="pl-campo"><span>Fuente</span><div class="pl-chips" role="radiogroup" aria-label="Fuente">' +
        ['propia', 'tutor_bombero', 'otra'].map(f => '<button type="button" role="radio" aria-checked="' + (p.fuente === f) + '" class="pl-chip' + (p.fuente === f ? ' on' : '') + '" data-fuente="' + f + '">' + esc(f === 'propia' ? 'Propia' : FUENTES[f]) + '</button>').join('') + '</div></div>' +
        '<p class="pl-aviso-linea plx-aviso-tb hidden">Apunta solo preguntas sueltas para tu repaso personal; no copies tests enteros de Tutor Bombero.</p>' +
        '<div class="pl-rejilla dos"><label class="pl-campo"><span>Tema</span><select class="pl-input" name="tema"><option value="">Sin tema</option>' +
        PLAN.temasOrdenados(true).map(t => '<option value="' + idAttr(t.id) + '"' + (t.id === p.tema_id ? ' selected' : '') + '>' + esc(PLAN.nombreTema(t.id)) + '</option>').join('') + '</select></label>' +
        '<label class="pl-campo"><span>Referencia (opcional)</span><input class="pl-input" name="referencia" maxlength="160" value="' + esc(p.referencia || '') + '" placeholder="Test, pregunta, artículo…"></label></div>' +
        '<label class="pl-campo"><span>Enunciado *</span><textarea class="pl-input" name="enunciado" rows="3" maxlength="2000" autofocus>' + esc(p.enunciado || '') + '</textarea></label>' +
        '<div class="pl-campo"><span>Respuestas (marca la correcta) · al menos 2</span>' + ops.map((o, j) =>
          '<div class="plx-op-edit"><label class="plx-radio"><input type="radio" name="correcta" value="' + j + '"' + (Number(p.correcta) === j ? ' checked' : '') + ' aria-label="La ' + LETRAS[j] + ' es la correcta"><span>' + LETRAS[j] + '</span></label>' +
          '<input class="pl-input" name="op' + j + '" maxlength="500" value="' + esc(o || '') + '" placeholder="Respuesta ' + LETRAS[j] + (j > 1 ? ' (opcional)' : '') + '"></div>').join('') + '</div>' +
        '<label class="pl-campo"><span>Explicación (opcional)</span><textarea class="pl-input" name="explicacion" rows="3" maxlength="4000">' + esc(p.explicacion || '') + '</textarea></label>' +
        (p0 ? '<label class="pl-check"><input type="checkbox" name="archivada"' + (p0.archivada ? ' checked' : '') + '><span>Archivada (no sale en los exámenes)</span></label>' : '') +
        '<p class="pl-error-form" role="alert"></p>',
      botones: [{ texto: 'Guardar', clase: 'primario', accion: api => {
        const panel = api.el;
        const err = panel.querySelector('.pl-error-form');
        const enunciado = panel.querySelector('[name="enunciado"]').value.trim();
        const valores = [0, 1, 2, 3].map(j => panel.querySelector('[name="op' + j + '"]').value.trim());
        const marcada = Number((panel.querySelector('[name="correcta"]:checked') || {}).value);
        if(enunciado.length < 3){ err.textContent = 'Escribe el enunciado.'; return false; }
        // Solo las respuestas escritas, sin huecos; la correcta se recoloca.
        const usadas = valores.map((v, j) => ({ v, j })).filter(x => x.v);
        if(usadas.length < 2){ err.textContent = 'Escribe al menos dos respuestas.'; return false; }
        const correcta = usadas.findIndex(x => x.j === marcada);
        if(correcta < 0){ err.textContent = 'Marca cuál es la respuesta correcta (y que no esté vacía).'; return false; }
        const n = PLANL.normalizar(enunciado);
        const dup = D().preguntas.find(x => x.id !== (p0 && p0.id) && PLANL.normalizar(x.enunciado) === n);
        if(dup){ err.textContent = 'Ya tienes esta pregunta' + (dup.archivada ? ' (archivada)' : '') + '.'; return false; }
        if(!avisadoBanco && (QUESTIONS_POOL || []).some(q => PLANL.normalizar(q.q) === n)){
          avisadoBanco = true;
          err.textContent = 'Esta pregunta ya está en tu banco de pj.fire. Pulsa «Guardar» otra vez si quieres tenerla también aquí.';
          return false;
        }
        const fila = Object.assign({}, p0 || {}, {
          id: p0 ? p0.id : PLAN.uid(), tema_id: panel.querySelector('[name="tema"]').value || null, fuente: panel.dataset.fuente || 'propia',
          referencia: panel.querySelector('[name="referencia"]').value.trim() || null, enunciado, opciones: usadas.map(x => x.v), correcta,
          explicacion: panel.querySelector('[name="explicacion"]').value.trim() || null,
          archivada: p0 ? !!(panel.querySelector('[name="archivada"]') || {}).checked : false
        });
        delete fila.huella;
        PLAN.guardar('plan_preguntas', fila);
        uiToast(p0 ? 'Pregunta guardada.' : 'Pregunta añadida.', 'success');
        PLAN.repintar();
      } }].concat(p0 ? [{ texto: 'Borrar', clase: 'peligro', accion: async () => {
        if(!await uiConfirm('¿Borrar esta pregunta?\n\nSi solo quieres que no salga en los exámenes, archívala.')) return;
        PLAN.borrar('plan_preguntas', p0.id);
        PLAN.repintar();
      } }] : []).concat([{ texto: 'Cancelar' }]),
      alAbrir: panel => {
        const setF = f => {
          panel.dataset.fuente = f;
          panel.querySelectorAll('[data-fuente]').forEach(b => { const on = b.dataset.fuente === f; b.classList.toggle('on', on); b.setAttribute('aria-checked', on); });
          panel.querySelector('.plx-aviso-tb').classList.toggle('hidden', f !== 'tutor_bombero');
        };
        panel.querySelectorAll('[data-fuente]').forEach(b => b.addEventListener('click', () => setF(b.dataset.fuente)));
        setF(p.fuente);
        panel.querySelector('[name="enunciado"]').addEventListener('input', () => { avisadoBanco = false; });
      } });
  }

  function reiniciar(){
    pararReloj();
    examen = null; corregido = null; vista = 'inicio';
    conf = { temas: null, n: 20, banco: true, propias: true, fallos: false, minutos: 0 };
    filtroP = { tema: '', fuente: '', texto: '' };
    const el = raiz();
    if(el) el.innerHTML = '';
  }

  // Si se recarga la app estando en el examen, la pantalla vuelve al plan
  // (SCREEN_RESTORE_TARGET) y el examen se sigue desde «Continuar».
  return {
    render, reiniciar, tema, num, minutos, fuente, alternarFallos, generar, continuar, descartar, salir, terminar, volver,
    repasarFallosCorreccion, repasoErrores, verExamen, verPreguntas, volverInicio, editarPregunta
  };
})();
