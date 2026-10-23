/* Estudio › Temario: temas explicados paso a paso, en dos apartados
   (Específico y Legislación), con preguntas al final para comprobar que
   se ha entendido. De momento solo lo ve el administrador.

   El contenido (tabla temario_temas) lo escribe Claude desde la base de
   datos; aquí solo se lee. Cada tema:
     pasos:     [{ titulo, html }]  la explicación, un paso cada vez
     preguntas: [{ enunciado, opciones: [...], correcta: índice, explicacion, paso }]
                (paso: el paso que hay que repasar si se falla)
   En el html de los pasos se pueden usar, además de p, h3, ul, ol, b,
   table…, estos recuadros (css/temario-guiado.css):
     <div class="tg-clave">   idea clave
     <div class="tg-ojo">     ojo, trampa de examen
     <div class="tg-truco">   truco para recordarlo
     <div class="tg-ejemplo"> ejemplo práctico
     <figure class="tg-figura"><svg…> o <img…><figcaption>…</figcaption></figure>
     <div class="tg-video"><iframe src="https://www.youtube-nocookie.com/embed/…"></iframe></div>
     <div class="tg-tabla"><table>…</table></div>
     <ol class="tg-secuencia"> pasos numerados
     <details class="tg-mas"><summary>Para saber más</summary>…</details>
   Lo que hace cada uno (temario_progreso: por dónde va y sus dudas;
   temario_intentos: sus respuestas) lo lee Claude para explicar mejor lo
   que no se entiende. */
const TG = (function(){
  const AREAS = { especifico: 'Específico', legislacion: 'Legislación' };
  const AREA_KEY = 'pj_temario_area';
  const CACHE = 'pj_temario_v1:';
  let area = 'especifico';
  try{ if(AREAS[localStorage.getItem(AREA_KEY)]) area = localStorage.getItem(AREA_KEY); }catch(e){}
  const temas = {};             // area → [tema]
  const progreso = new Map();   // tema_id → { paso, leido, dudas }
  const ultimo = new Map();     // tema_id → { aciertos, total }
  let tema = null, paso = 0;
  let quiz = null;              // { orden: [índices], i, respuestas: [], elegida }
  let guardarPasoT = null;

  const esc = t => escapeHtml(t == null ? '' : String(t));
  const raiz = () => document.getElementById('tgRoot');
  const raizTema = () => document.getElementById('tgTemaRoot');
  const FLECHA = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="11,6 5,12 11,18"/></svg>';

  function leerCache(a){
    try{ const x = JSON.parse(localStorage.getItem(CACHE + a) || 'null'); return Array.isArray(x) ? x : null; }catch(e){ return null; }
  }
  function guardarCache(a, lista){
    try{ localStorage.setItem(CACHE + a, JSON.stringify(lista)); }catch(e){}   // si no cabe, no pasa nada
  }

  async function cargar(a){
    const { data, error } = await sb.from('temario_temas').select('id,area,titulo,resumen,orden,pasos,preguntas,updated_at')
      .eq('area', a).order('orden').order('created_at');
    if(error) throw error;
    temas[a] = data || [];
    guardarCache(a, temas[a]);
    const ids = temas[a].map(t => t.id);
    if(!ids.length || !currentUser) return;
    const [rp, ri] = await Promise.all([
      sb.from('temario_progreso').select('tema_id,paso,leido,dudas').eq('user_id', currentUser.id).in('tema_id', ids),
      sb.from('temario_intentos').select('tema_id,aciertos,total,created_at').eq('user_id', currentUser.id).in('tema_id', ids).order('created_at', { ascending: false })
    ]);
    (rp.data || []).forEach(r => progreso.set(r.tema_id, r));
    (ri.data || []).forEach(r => { if(!ultimo.has(r.tema_id)) ultimo.set(r.tema_id, r); });
  }

  /* ---------- lista de temas ---------- */
  async function abrir(){
    if(!temas[area]){ const c = leerCache(area); if(c) temas[area] = c; }
    pintarLista();
    try{ await cargar(area); pintarLista(); }
    catch(e){ if(!temas[area]) pintarLista('No se pudieron cargar los temas: ' + (e.message || e)); }
  }
  function cambiarArea(a){
    if(!AREAS[a] || a === area) return;
    area = a;
    try{ localStorage.setItem(AREA_KEY, a); }catch(e){}
    abrir();
  }
  function estadoDe(t){
    const p = progreso.get(t.id), u = ultimo.get(t.id), n = (t.pasos || []).length;
    if(u && u.total) return { clase: u.aciertos === u.total ? 'bien' : 'medio', txt: 'Preguntas: ' + u.aciertos + ' de ' + u.total };
    if(p && p.leido) return { clase: 'medio', txt: 'Leído · falta responder' };
    if(p && p.paso > 0) return { clase: 'curso', txt: 'Paso ' + Math.min(p.paso + 1, n) + ' de ' + n };
    return { clase: 'nuevo', txt: 'Nuevo' };
  }
  function pintarLista(error){
    const el = raiz();
    if(!el) return;
    const lista = temas[area];
    let cuerpo;
    if(error) cuerpo = '<div class="tg-vacio">' + esc(error) + '</div>';
    else if(!lista) cuerpo = skelList(3);
    else if(!lista.length) cuerpo = '<div class="tg-vacio"><b>Aún no hay temas de ' + esc(AREAS[area]) + '.</b><br>Pásale a Claude el tema que te cuesta y lo irá añadiendo aquí, explicado paso a paso.</div>';
    else cuerpo = '<div class="tg-lista">' + lista.map(t => {
      const e = estadoDe(t), n = (t.pasos || []).length, q = (t.preguntas || []).length;
      return '<div class="tg-tema-card" role="button" tabindex="0" data-tg-tema="' + esc(t.id) + '">' +
        '<div class="tg-tema-txt"><div class="tg-tema-titulo">' + esc(t.titulo) + '</div>' +
        (t.resumen ? '<div class="tg-tema-resumen">' + esc(t.resumen) + '</div>' : '') +
        '<div class="tg-tema-meta"><span class="tg-estado ' + e.clase + '">' + esc(e.txt) + '</span>' +
        '<span>' + n + (n === 1 ? ' paso' : ' pasos') + (q ? ' · ' + q + (q === 1 ? ' pregunta' : ' preguntas') : '') + '</span></div></div>' +
        '<svg class="estudio-card-flecha" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg></div>';
    }).join('') + '</div>';
    el.innerHTML = '<span class="back-link" role="button" tabindex="0" data-tg="estudio">' + FLECHA + 'Estudio</span>' +
      '<h1>Temario</h1>' +
      '<p class="tg-intro">Los temas que más te cuestan, explicados poco a poco. Cuando lo entiendas, responde las preguntas del final.</p>' +
      '<div class="tg-areas" role="tablist">' + Object.keys(AREAS).map(a =>
        '<button type="button" role="tab" class="tg-area' + (a === area ? ' activa' : '') + '" aria-selected="' + (a === area) + '" data-tg-area="' + a + '">' + AREAS[a] + '</button>').join('') + '</div>' +
      cuerpo;
  }

  /* ---------- un tema: la explicación paso a paso ---------- */
  function abrirTema(id, enPaso){
    const t = (temas[area] || []).find(x => x.id === id);
    if(!t) return;
    tema = t;
    quiz = null;
    const p = progreso.get(t.id);
    const n = (t.pasos || []).length;
    paso = Math.max(0, Math.min(enPaso != null ? enPaso : (p ? p.paso : 0), Math.max(0, n - 1)));
    showScreen('screen-temario-tema');
    pintarPaso();
  }
  function guardarProgreso(cambio){
    if(!tema || !currentUser) return Promise.resolve();
    const prev = progreso.get(tema.id) || { paso: 0, leido: false, dudas: '' };
    const fila = Object.assign({}, prev, cambio);
    progreso.set(tema.id, fila);
    return sb.from('temario_progreso').upsert({ user_id: currentUser.id, tema_id: tema.id, paso: fila.paso, leido: fila.leido, dudas: fila.dudas || '', updated_at: new Date().toISOString() })
      .then(({ error }) => { if(error) throw error; });
  }
  function irAPaso(i){
    const n = (tema.pasos || []).length;
    paso = Math.max(0, Math.min(i, n - 1));
    pintarPaso();
    window.scrollTo(0, 0);
    clearTimeout(guardarPasoT);
    const leido = paso === n - 1 ? true : undefined;
    guardarPasoT = setTimeout(() => guardarProgreso(leido ? { paso, leido } : { paso }).catch(() => {}), 600);
  }
  function cabeceraTema(){
    return '<span class="back-link" role="button" tabindex="0" data-tg="lista">' + FLECHA + 'Temario · ' + esc(AREAS[tema.area] || '') + '</span>' +
      '<h1 class="tg-h1">' + esc(tema.titulo) + '</h1>';
  }
  function pintarPaso(){
    const el = raizTema();
    if(!el || !tema) return;
    const pasos = tema.pasos || [], n = pasos.length, q = (tema.preguntas || []).length;
    if(!n){ el.innerHTML = cabeceraTema() + '<div class="tg-vacio">Este tema aún no tiene explicación.</div>'; return; }
    const ps = pasos[paso] || {};
    const ultimoPaso = paso === n - 1;
    const dudas = (progreso.get(tema.id) || {}).dudas || '';
    el.innerHTML = cabeceraTema() +
      '<div class="tg-progreso"><div class="tg-progreso-txt">Paso ' + (paso + 1) + ' de ' + n + '</div>' +
        '<div class="tg-barra"><span style="width:' + Math.round((paso + 1) / n * 100) + '%"></span></div></div>' +
      (n > 1 ? '<div class="tg-chips">' + pasos.map((x, i) =>
        '<button type="button" class="tg-chip' + (i === paso ? ' activo' : '') + (i < paso ? ' hecho' : '') + '" data-tg-paso="' + i + '" title="' + esc(x.titulo || ('Paso ' + (i + 1))) + '">' + (i + 1) + '</button>').join('') + '</div>' : '') +
      '<article class="tg-contenido">' + (ps.titulo ? '<h2>' + esc(ps.titulo) + '</h2>' : '') + (ps.html || '') + '</article>' +
      '<div class="tg-nav">' +
        '<button type="button" class="btn btn-ghost" data-tg="anterior"' + (paso === 0 ? ' disabled' : '') + '>Anterior</button>' +
        (ultimoPaso
          ? (q ? '<button type="button" class="btn btn-light" data-tg="preguntas">Ya lo entiendo: pregúntame</button>' : '<button type="button" class="btn btn-light" data-tg="lista">Terminar</button>')
          : '<button type="button" class="btn btn-light" data-tg="siguiente">Siguiente</button>') +
      '</div>' +
      '<details class="tg-dudas"' + (dudas ? ' open' : '') + '><summary>¿Algo no te ha quedado claro?</summary>' +
        '<p>Escríbelo aquí. Claude lo lee y te lo explica mejor (o lo añade al tema).</p>' +
        '<textarea class="cal-in" id="tgDudas" rows="4" maxlength="5000" placeholder="Por ejemplo: no entiendo la diferencia entre…">' + esc(dudas) + '</textarea>' +
        '<button type="button" class="btn btn-ghost" data-tg="dudas">Guardar duda</button></details>';
  }
  async function guardarDudas(){
    const ta = document.getElementById('tgDudas');
    if(!ta) return;
    try{ await guardarProgreso({ dudas: ta.value.trim() }); uiToast('Duda guardada. Díselo a Claude cuando quieras.', 'success'); }
    catch(e){ uiToast('No se pudo guardar: ' + (e.message || e), 'error'); }
  }

  /* ---------- las preguntas ---------- */
  function empezarPreguntas(){
    const qs = tema.preguntas || [];
    if(!qs.length) return;
    const orden = qs.map((_, i) => i);
    for(let i = orden.length - 1; i > 0; i--){ const j = Math.floor(Math.random() * (i + 1)); [orden[i], orden[j]] = [orden[j], orden[i]]; }
    quiz = { orden, i: 0, respuestas: qs.map(() => null), elegida: null };
    clearTimeout(guardarPasoT);
    guardarProgreso({ paso: Math.max(0, (tema.pasos || []).length - 1), leido: true }).catch(() => {});
    pintarPregunta();
    window.scrollTo(0, 0);
  }
  function pintarPregunta(){
    const el = raizTema();
    const qs = tema.preguntas, k = quiz.orden[quiz.i], q = qs[k], total = qs.length;
    const r = quiz.respuestas[k];
    const respondida = r != null;
    el.innerHTML = cabeceraTema() +
      '<div class="tg-progreso"><div class="tg-progreso-txt">Pregunta ' + (quiz.i + 1) + ' de ' + total + '</div>' +
        '<div class="tg-barra preguntas"><span style="width:' + Math.round((quiz.i + (respondida ? 1 : 0)) / total * 100) + '%"></span></div></div>' +
      '<div class="tg-pregunta"><div class="tg-enunciado">' + (q.enunciado || '') + '</div>' +
      '<div class="tg-opciones">' + (q.opciones || []).map((o, i) => {
        let c = '';
        if(respondida){ if(i === q.correcta) c = ' correcta'; else if(i === r) c = ' fallada'; }
        return '<button type="button" class="tg-opcion' + c + '" data-tg-op="' + i + '"' + (respondida ? ' disabled' : '') + '><span class="tg-letra">' + String.fromCharCode(97 + i) + '</span><span>' + o + '</span></button>';
      }).join('') + '</div>' +
      (respondida ? '<div class="tg-feedback ' + (r === q.correcta ? 'bien' : 'mal') + '"><b>' + (r === q.correcta ? '¡Bien!' : 'No es esa.') + '</b>' +
        (q.explicacion ? '<div>' + q.explicacion + '</div>' : '') +
        (r !== q.correcta && Number.isInteger(q.paso) && tema.pasos[q.paso] ? '<button type="button" class="tg-link" data-tg-repasar="' + q.paso + '">Repasar «' + esc(tema.pasos[q.paso].titulo || ('Paso ' + (q.paso + 1))) + '»</button>' : '') +
        '</div>' : '') + '</div>' +
      '<div class="tg-nav"><button type="button" class="btn btn-ghost" data-tg="salir-preguntas">Volver a la explicación</button>' +
        (respondida ? '<button type="button" class="btn btn-light" data-tg="siguiente-pregunta">' + (quiz.i === total - 1 ? 'Ver resultado' : 'Siguiente') + '</button>' : '') + '</div>';
  }
  function responder(i){
    const k = quiz.orden[quiz.i];
    if(quiz.respuestas[k] != null) return;
    quiz.respuestas[k] = i;
    pintarPregunta();
  }
  async function terminar(){
    const qs = tema.preguntas;
    const aciertos = qs.reduce((n, q, i) => n + (quiz.respuestas[i] === q.correcta ? 1 : 0), 0);
    const total = qs.length;
    ultimo.set(tema.id, { aciertos, total });
    pintarResultado(aciertos, total);
    window.scrollTo(0, 0);
    if(currentUser){
      const { error } = await sb.from('temario_intentos').insert({ user_id: currentUser.id, tema_id: tema.id, aciertos, total, respuestas: quiz.respuestas });
      if(error) uiToast('No se pudo guardar el resultado: ' + error.message, 'error');
    }
  }
  function pintarResultado(aciertos, total){
    const el = raizTema();
    const qs = tema.preguntas;
    const fallos = qs.map((q, i) => ({ q, i })).filter(x => quiz.respuestas[x.i] !== x.q.correcta);
    const pct = total ? aciertos / total : 0;
    const msg = pct === 1 ? '¡Perfecto! Este tema ya lo tienes.' : pct >= 0.7 ? 'Muy bien. Repasa lo que has fallado y vuelve a intentarlo.' : 'Aún cuesta un poco: repasa la explicación con calma y vuelve a probar. Si algo no se entiende, apúntalo en las dudas.';
    el.innerHTML = cabeceraTema() +
      '<div class="tg-resultado"><div class="tg-nota ' + (pct === 1 ? 'bien' : pct >= 0.7 ? 'medio' : 'mal') + '">' + aciertos + '<small> / ' + total + '</small></div><p>' + msg + '</p></div>' +
      (fallos.length ? '<h3 class="tg-h3">Lo que has fallado</h3><div class="tg-fallos">' + fallos.map(({ q }) =>
        '<div class="tg-fallo"><div class="tg-enunciado">' + (q.enunciado || '') + '</div>' +
        '<div class="tg-fallo-ok">Correcta: <b>' + ((q.opciones || [])[q.correcta] || '') + '</b></div>' +
        (q.explicacion ? '<div class="tg-fallo-exp">' + q.explicacion + '</div>' : '') +
        (Number.isInteger(q.paso) && tema.pasos[q.paso] ? '<button type="button" class="tg-link" data-tg-repasar="' + q.paso + '">Repasar «' + esc(tema.pasos[q.paso].titulo || ('Paso ' + (q.paso + 1))) + '»</button>' : '') +
        '</div>').join('') + '</div>' : '') +
      '<div class="tg-nav">' +
        '<button type="button" class="btn btn-ghost" data-tg="repasar-todo">Repasar la explicación</button>' +
        '<button type="button" class="btn btn-light" data-tg="preguntas">Repetir preguntas</button></div>' +
      '<div class="tg-nav"><button type="button" class="btn btn-ghost" data-tg="lista">Volver al temario</button></div>';
  }

  /* ---------- clics ---------- */
  function alClicar(e){
    const t = e.target.closest('[data-tg],[data-tg-area],[data-tg-tema],[data-tg-paso],[data-tg-op],[data-tg-repasar]');
    if(!t) return;
    if(t.dataset.tgArea) return cambiarArea(t.dataset.tgArea);
    if(t.dataset.tgTema) return abrirTema(t.dataset.tgTema);
    if(t.dataset.tgPaso != null) return irAPaso(+t.dataset.tgPaso);
    if(t.dataset.tgOp != null) return responder(+t.dataset.tgOp);
    if(t.dataset.tgRepasar != null){ quiz = null; return irAPaso(+t.dataset.tgRepasar); }
    switch(t.dataset.tg){
      case 'estudio': return showScreen('screen-estudio');
      case 'lista': tema = null; quiz = null; return showScreen('screen-temario');
      case 'anterior': return irAPaso(paso - 1);
      case 'siguiente': return irAPaso(paso + 1);
      case 'preguntas': return empezarPreguntas();
      case 'salir-preguntas': quiz = null; return pintarPaso();
      case 'repasar-todo': quiz = null; return irAPaso(0);
      case 'siguiente-pregunta':
        if(quiz.i < tema.preguntas.length - 1){ quiz.i++; pintarPregunta(); window.scrollTo(0, 0); }
        else terminar();
        return;
      case 'dudas': return guardarDudas();
    }
  }
  function alTeclear(e){
    if(e.key !== 'Enter' || !e.target.matches('[role="button"]')) return;
    e.preventDefault();
    alClicar(e);
  }
  // Las dos pantallas ya están en el HTML (este archivo va al final de la página).
  ['screen-temario', 'screen-temario-tema'].forEach(id => {
    const s = document.getElementById(id);
    if(s){ s.addEventListener('click', alClicar); s.addEventListener('keydown', alTeclear); }
  });

  // El recuadro de Estudio: solo para el administrador.
  function visibilidad(){
    const c = document.getElementById('estudioCardTemario');
    if(c) c.classList.toggle('hidden', !currentUserIsAdmin);
  }
  // Al recargar estando dentro de un tema, se vuelve a su lista.
  function abrirPantallaTema(){ if(!tema) setTimeout(() => showScreen('screen-temario'), 0); }

  return { abrir, visibilidad, abrirPantallaTema, olvidar(){ Object.keys(temas).forEach(k => delete temas[k]); progreso.clear(); ultimo.clear(); tema = null; quiz = null; } };
})();
