/* Específico: hacer un test (las preguntas de especifico_preguntas).
   Una pregunta cada vez: al tocar una opción se marca la correcta en verde
   (y la elegida en rojo si falla) y se puede ver la explicación. Las
   respuestas y la pregunta en la que se va se guardan en el dispositivo
   para seguir otro día. Al final, el resumen con aciertos y fallos. */
const ESPT = (function(){
  const CLAVE = 'pj_esp_test_v1:';
  let test = null, preguntas = [], i = 0, resp = {}, verExp = false, cargando = false;
  const cache = new Map();   // test_id → preguntas (para no volver a descargarlas)

  const root = () => document.getElementById('espTestRoot');
  const guardar = () => { try{ localStorage.setItem(CLAVE + test.id, JSON.stringify({ i, resp })); }catch(e){} };
  const leer = id => { try{ return JSON.parse(localStorage.getItem(CLAVE + id) || 'null'); }catch(e){ return null; } };
  // El HTML se limpió al importarlo; se vuelve a limpiar por si acaso.
  const html = h => (typeof IMP !== 'undefined' && IMP.limpiar) ? IMP.limpiar(h) : escapeHtml(h);
  const aciertos = () => preguntas.filter(p => resp[p.id] && resp[p.id] === p.correcta).length;
  const respondidas = () => preguntas.filter(p => resp[p.id]).length;

  async function abrir(t){
    test = t; preguntas = []; verExp = false;
    const g = leer(t.id) || {};
    resp = g.resp || {}; i = g.i || 0;
    showScreen('screen-esp-test');
    if(cache.has(t.id)) preguntas = cache.get(t.id);
    else{
      cargando = true; pintar();
      const { data, error } = await sb.from('especifico_preguntas').select('id,orden,enunciado,opciones,correcta,explicacion').eq('test_id', t.id).order('orden');
      cargando = false;
      if(error){ root().innerHTML = cabecera() + '<div class="esp-vacio">No se pudieron cargar las preguntas: ' + escapeHtml(error.message) + '</div>'; return; }
      preguntas = data || [];
      cache.set(t.id, preguntas);
    }
    if(i >= preguntas.length) i = 0;
    pintar();
  }

  function cabecera(){
    return '<button type="button" class="back-link espt-volver" data-espt="volver">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="11,6 5,12 11,18"/></svg> Específico</button>' +
      '<h1 class="espt-titulo">' + escapeHtml(test ? test.titulo : '') + '</h1>';
  }
  function pintar(){
    const r = root();
    if(!r || !test) return;
    if(cargando){ r.innerHTML = cabecera() + '<div class="esp-vacio">Cargando preguntas…</div>'; return; }
    if(!preguntas.length){ r.innerHTML = cabecera() + '<div class="esp-vacio">Este test todavía no tiene preguntas.</div>'; return; }
    if(i >= preguntas.length){ r.innerHTML = cabecera() + resumen(); return; }
    const p = preguntas[i], elegida = resp[p.id], n = preguntas.length;
    const ops = (p.opciones || []).map(o => {
      let cls = 'espt-op';
      if(elegida){ if(o.l === p.correcta) cls += ' bien'; else if(o.l === elegida) cls += ' mal'; else cls += ' apagada'; }
      return '<button type="button" class="' + cls + '" data-op="' + escapeHtml(o.l) + '"' + (elegida ? ' disabled' : '') + '>' +
        '<span class="espt-letra">' + escapeHtml(o.l) + '</span><span class="espt-op-txt">' + html(o.html) + '</span></button>';
    }).join('');
    r.innerHTML = cabecera() +
      '<div class="espt-progreso"><span>Pregunta <b>' + (i + 1) + '</b> de ' + n + '</span><span>' + aciertos() + ' ✓ · ' + (respondidas() - aciertos()) + ' ✗</span></div>' +
      '<div class="espt-barra"><i style="width:' + ((i + 1) / n * 100).toFixed(1) + '%"></i></div>' +
      '<div class="espt-card">' +
        '<div class="espt-enunciado">' + html(p.enunciado) + '</div>' +
        '<div class="espt-ops">' + ops + '</div>' +
        (elegida ? '<div class="espt-resultado ' + (elegida === p.correcta ? 'bien' : 'mal') + '">' + (elegida === p.correcta ? '¡Correcta!' : 'Fallada: la correcta es la ' + escapeHtml(p.correcta) + ')') + '</div>' : '') +
        (elegida && p.explicacion ? '<button type="button" class="espt-exp-btn" data-espt="exp">' + (verExp ? 'Ocultar explicación' : 'Ver explicación') + '</button>' +
          (verExp ? '<div class="espt-exp">' + html(p.explicacion) + '</div>' : '') : '') +
      '</div>' +
      '<div class="espt-nav">' +
        '<button type="button" class="espt-btn" data-espt="ant"' + (i ? '' : ' disabled') + '>‹ Anterior</button>' +
        '<button type="button" class="espt-btn primario" data-espt="sig">' + (i === n - 1 ? 'Terminar' : 'Siguiente ›') + '</button>' +
      '</div>';
  }
  function resumen(){
    const n = preguntas.length, a = aciertos(), f = respondidas() - a, sin = n - respondidas();
    const nota = n ? (a / n * 10) : 0;
    return '<div class="espt-card espt-fin">' +
      '<div class="espt-nota">' + nota.toFixed(1).replace('.', ',') + '</div>' +
      '<div class="espt-fin-sub">' + a + (a === 1 ? ' acierto' : ' aciertos') + ' · ' + f + (f === 1 ? ' fallo' : ' fallos') + (sin ? ' · ' + sin + ' sin responder' : '') + '</div>' +
      '<div class="espt-nav"><button type="button" class="espt-btn" data-espt="repasar">Repasar desde el principio</button>' +
      '<button type="button" class="espt-btn primario" data-espt="reiniciar">Volver a empezar</button></div></div>';
  }

  function onClick(e){
    const op = e.target.closest('[data-op]');
    if(op && !op.disabled){
      const p = preguntas[i];
      resp[p.id] = op.dataset.op; verExp = false;
      guardar(); pintar();
      return;
    }
    const b = e.target.closest('[data-espt]');
    if(!b) return;
    switch(b.dataset.espt){
      case 'volver': showScreen('screen-especifico'); break;
      case 'exp': verExp = !verExp; pintar(); break;
      case 'ant': if(i > 0){ i--; verExp = false; guardar(); pintar(); window.scrollTo(0, 0); } break;
      case 'sig': i++; verExp = false; guardar(); pintar(); window.scrollTo(0, 0); break;
      case 'repasar': i = 0; verExp = false; guardar(); pintar(); break;
      case 'reiniciar': i = 0; resp = {}; verExp = false; guardar(); pintar(); break;
    }
  }
  const enganchar = () => { const r = root(); if(r) r.addEventListener('click', onClick); };
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', enganchar); else enganchar();

  return { abrir };
})();
