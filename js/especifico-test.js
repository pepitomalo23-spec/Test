/* Específico: hacer un test (preguntas de especifico_preguntas), con el
   diseño del aula virtual de tutorbomberos: cabecera naranja con el tema y
   la descripción y todas las preguntas seguidas. Al tocar una opción sale
   ✓ si es la correcta o ✗ si no (se puede volver a intentar hasta dar con
   ella); el «?» verde abre la explicación y el botón rojo marca la pregunta
   con una estrella. La franja de la izquierda es verde, o amarilla si esa
   pregunta se ha fallado alguna vez. Todo se guarda en el dispositivo. */
const ESPT = (function(){
  const CLAVE = 'pj_esp_test_v2:';
  // Por test: { r: {pregunta: [letras tocadas]}, f: {pregunta: 1 si se falló alguna vez}, m: {pregunta: 1 si marcada} }
  let test = null, preguntas = [], est = { r: {}, f: {}, m: {} }, abiertas = new Set(), cargando = false;
  const cache = new Map();   // test_id → preguntas (para no volver a descargarlas)

  const root = () => document.getElementById('espTestRoot');
  const arriba = () => { const a = document.getElementById('app'); (a || window).scrollTo(0, 0); };   // #app es el que se desplaza
  const guardar = () => { try{ localStorage.setItem(CLAVE + test.id, JSON.stringify(est)); }catch(e){} };
  const leer = id => { try{ return JSON.parse(localStorage.getItem(CLAVE + id) || 'null'); }catch(e){ return null; } };
  // El HTML se limpió al importarlo; se vuelve a limpiar por si acaso.
  const html = h => (typeof IMP !== 'undefined' && IMP.limpiar) ? IMP.limpiar(h) : escapeHtml(h);
  const ICO = {
    exp: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="#5cb85c"/><path d="M9.2 9.3a2.9 2.9 0 0 1 5.6 1c0 1.9-2.8 2.4-2.8 4" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/><circle cx="12" cy="17.6" r="1.3" fill="#fff"/></svg>',
    marca: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="#e8574b"/><path d="m12 5.6 1.9 3.9 4.3.6-3.1 3 .7 4.3L12 15.4l-3.8 2 .7-4.3-3.1-3 4.3-.6z" fill="#fff"/></svg>',
    estrella: '<svg viewBox="0 0 24 24"><path d="m12 2.5 2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5L2.5 9.4l6.6-.9z" fill="#f5c518"/></svg>'
  };

  async function abrir(t){
    test = t; preguntas = []; abiertas = new Set();
    est = Object.assign({ r: {}, f: {}, m: {} }, leer(t.id) || {});
    showScreen('screen-esp-test');
    arriba();
    if(cache.has(t.id)) preguntas = cache.get(t.id);
    else{
      cargando = true; pintar();
      const { data, error } = await sb.from('especifico_preguntas').select('id,orden,enunciado,opciones,correcta,explicacion').eq('test_id', t.id).order('orden');
      cargando = false;
      if(error){ root().innerHTML = cabecera() + '<div class="esp-vacio">No se pudieron cargar las preguntas: ' + escapeHtml(error.message) + '</div>'; return; }
      preguntas = data || [];
      cache.set(t.id, preguntas);
    }
    pintar();
  }

  function cabecera(){
    const tema = test ? (ESP.temas().find(x => x.clave === test.tema) || {}).titulo || '' : '';
    return '<nav class="espt-migas"><button type="button" data-espt="volver">Específico</button> <span>›</span> <b>Preguntas</b></nav>' +
      '<h2 class="espt-h">Preguntas del test</h2>' +
      '<div class="espt-cab">' +
        '<div class="espt-etiqueta">Tema:</div><div class="espt-campo">' + escapeHtml(tema) + '</div>' +
        '<div class="espt-etiqueta">Descripción:</div><div class="espt-campo">' + escapeHtml(test ? test.titulo : '') + '</div>' +
      '</div>';
  }
  function tarjeta(p){
    const tocadas = est.r[p.id] || [], acertada = tocadas.includes(p.correcta);
    const ops = (p.opciones || []).map(o => {
      const marca = tocadas.includes(o.l) ? (o.l === p.correcta ? '<span class="espt-tick bien">✓</span>' : '<span class="espt-tick mal">✗</span>') : '<span class="espt-tick"></span>';
      return '<button type="button" class="espt-op" data-p="' + p.id + '" data-op="' + escapeHtml(o.l) + '"' + (acertada ? ' disabled' : '') + '>' + marca +
        '<span class="espt-letra">' + escapeHtml(o.l) + '</span><span class="espt-op-txt">' + html(o.html) + '</span></button>';
    }).join('');
    return '<article class="espt-preg' + (est.f[p.id] ? ' fallada' : '') + '" id="espt-' + p.id + '">' +
      (est.m[p.id] ? '<span class="espt-estrella" title="Marcada">' + ICO.estrella + '</span>' : '') +
      '<div class="espt-iconos">' +
        (p.explicacion ? '<button type="button" data-espt="exp" data-p="' + p.id + '" title="Ver explicación" aria-label="Ver explicación">' + ICO.exp + '</button>' : '') +
        '<button type="button" data-espt="marca" data-p="' + p.id + '" title="' + (est.m[p.id] ? 'Quitar marca' : 'Marcar pregunta') + '" aria-label="Marcar pregunta">' + ICO.marca + '</button>' +
      '</div>' +
      '<div class="espt-enunciado">' + html(p.enunciado) + '</div>' +
      '<div class="espt-ops">' + ops + '</div>' +
      (abiertas.has(p.id) ? '<div class="espt-exp">' + html(p.explicacion) + '</div>' : '') +
      '</article>';
  }
  function pie(){
    const n = preguntas.length, hechas = preguntas.filter(p => (est.r[p.id] || []).length).length;
    const bien = preguntas.filter(p => { const t = est.r[p.id] || []; return t.length && t[0] === p.correcta; }).length;
    return '<div class="espt-pie"><span>' + hechas + ' de ' + n + ' respondidas · ' + bien + ' a la primera</span>' +
      (hechas ? '<button type="button" data-espt="reiniciar">Borrar respuestas</button>' : '') + '</div>';
  }
  function pintar(){
    const r = root();
    if(!r || !test) return;
    if(cargando){ r.innerHTML = cabecera() + '<div class="esp-vacio">Cargando preguntas…</div>'; return; }
    if(!preguntas.length){ r.innerHTML = cabecera() + '<div class="esp-vacio">Este test todavía no tiene preguntas.</div>'; return; }
    r.innerHTML = cabecera() + '<div class="espt-lista">' + preguntas.map(tarjeta).join('') + '</div>' + pie();
  }
  // Solo se repinta la pregunta tocada (y el pie), para no saltar de sitio.
  function repintar(id){
    const p = preguntas.find(x => x.id === id), el = document.getElementById('espt-' + id);
    if(!p || !el) return pintar();
    el.outerHTML = tarjeta(p);
    const pieEl = root().querySelector('.espt-pie');
    if(pieEl) pieEl.outerHTML = pie();
  }

  function onClick(e){
    const op = e.target.closest('[data-op]');
    if(op && !op.disabled){
      const p = preguntas.find(x => x.id === op.dataset.p);
      if(!p) return;
      const t = est.r[p.id] || (est.r[p.id] = []);
      if(!t.includes(op.dataset.op)) t.push(op.dataset.op);
      if(op.dataset.op !== p.correcta) est.f[p.id] = 1;
      guardar(); repintar(p.id);
      return;
    }
    const b = e.target.closest('[data-espt]');
    if(!b) return;
    const id = b.dataset.p;
    switch(b.dataset.espt){
      case 'volver': showScreen('screen-especifico'); break;
      case 'exp': abiertas.has(id) ? abiertas.delete(id) : abiertas.add(id); repintar(id); break;
      case 'marca': if(est.m[id]) delete est.m[id]; else est.m[id] = 1; guardar(); repintar(id); break;
      case 'reiniciar':
        uiConfirm('¿Borrar tus respuestas de este test? Las marcas con estrella se mantienen.', { ok: 'Borrar' }).then(ok => {
          if(!ok) return;
          est.r = {}; est.f = {}; abiertas = new Set(); guardar(); pintar(); arriba();
        });
        break;
    }
  }
  const enganchar = () => { const r = root(); if(r) r.addEventListener('click', onClick); };
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', enganchar); else enganchar();

  return { abrir };
})();
