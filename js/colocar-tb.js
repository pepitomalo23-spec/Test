/* Colocar en el temario las preguntas de Legislación de tutorbomberos.
   Llegan por ley entera (sin título ni artículo). Cada una se lleva a su
   sitio del árbol de la ley (nodos_temario), como las de pj.fire:
     1. Si su explicación (o el enunciado) cita un artículo de esa ley
        («Artículo 103.1: …», «art. 14 CE»), a ese artículo; si ese
        artículo no está en el árbol, al título o capítulo que lo abarca
        (por los artículos que ya cuelgan de cada uno). Las citas de otra
        ley («Ley Orgánica 2/1979: Artículo 9.4») no cuentan.
     2. Si pregunta por cómo está organizada la ley («¿cuántos títulos…?»),
        a «Estructura».
     3. Si no, al sitio de la pregunta de pj.fire más parecida de esa ley
        (si se parece lo bastante).
     4. Si nada encaja, se queda en la ley en general.
   Lo usa el importador (js/importar-especifico.js) y la revisión de
   Administración (COLOCAR.revisar), donde se ven una a una y se cambian. */
const COLOCAR = (function(){
  const sinTildes = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const VACIAS = new Set(('de del la las los el en y o a al un una unos unas que se por para con sin su sus es son lo le les como mas mas ' +
    'cual cuales cuando donde quien quienes este esta estos estas ese esa eso entre sobre ante segun sera seran ser ha han hay ' +
    'no si ni pero tambien ya muy segun dicha dicho dichas dichos otra otro otras otros correcta correcto incorrecta respuesta ' +
    'siguiente siguientes opcion opciones verdadera falsa todas ninguna anteriores').split(/\s+/));
  const palabras = t => new Set(sinTildes(t).replace(/[^a-z0-9ñ ]+/g, ' ').split(/\s+/).filter(w => w.length > 2 && !VACIAS.has(w)));
  const numArt = s => { const m = String(s || '').match(/^\s*(\d+)/); return m ? Number(m[1]) : null; };

  // Cómo se nombra la propia ley: sus números («7/1985») y, la Constitución, «constitución» o «CE».
  function propios(topicId, nombre){
    const t = sinTildes(nombre + ' ' + topicId), c = CONOCIDAS.find(x => x.re.test(t));
    // Siglas entre paréntesis del nombre (T.R.E.B.E.P → trebep, B.R.L → brl): también la nombran.
    const siglas = (t.match(/\(([^)]+)\)/g) || []).map(x => x.replace(/[^a-z]/g, '')).filter(x => x.length >= 2);
    return { nums: t.match(/\d+\/\d{4}/g) || [], ce: /constitucion/.test(t), siglas, titulos: c ? c.titulos : null };
  }
  // Los artículos que cita un texto, de esta ley (en orden).
  function citados(texto, p){
    const out = [], re = /\b(?:art[ií]culos?|arts?\.)\s*(\d+)/gi;
    let m;
    while((m = re.exec(texto))){
      const antes = sinTildes(texto.slice(Math.max(0, m.index - 90), m.index));
      const despues = sinTildes(texto.slice(m.index + m[0].length, m.index + m[0].length + 30));
      const propia = p.nums.some(x => antes.includes(x) || despues.includes(x)) ||
        (p.ce && (/(constitucion|\bce\b)/.test(antes.slice(-40)) || /^[\d.\s,]*(\bce\b|de la constitucion|constitucion)/.test(despues)));
      const otra = (antes.match(/\d+\/\d{4}/g) || []).some(x => !p.nums.includes(x)) ||
        /\b(organica|real decreto|reglamento|decreto|l\.o\.|lo \d)/.test(antes) || (p.ce && /\bley\b/.test(antes));
      if(propia || !otra) out.push(Number(m[1]));
    }
    return out;
  }
  // Árbol de una ley preparado para colocar: artículos por número y, de cada
  // título/capítulo/sección, qué artículos cuelgan de él (para los rangos).
  function arbol(nodos){
    const hijos = new Map(), porNum = new Map();
    nodos.forEach(n => { if(n.padre_id){ if(!hijos.has(n.padre_id)) hijos.set(n.padre_id, []); hijos.get(n.padre_id).push(n); } });
    nodos.forEach(n => { if(n.tipo === 'articulo'){ const k = numArt(n.numero); if(k != null && !porNum.has(k)) porNum.set(k, n); } });
    const prof = n => { let d = 0, c = n; while(c && c.padre_id){ d++; c = nodos.find(x => x.id === c.padre_id); } return d; };
    const contenedores = nodos.filter(n => n.tipo !== 'articulo' && n.tipo !== 'estructura').map(n => {
      const nums = [], pila = [...(hijos.get(n.id) || [])];
      while(pila.length){ const h = pila.pop(); if(h.tipo === 'articulo'){ const k = numArt(h.numero); if(k != null) nums.push(k); } pila.push(...(hijos.get(h.id) || [])); }
      return nums.length ? { n, min: Math.min(...nums), max: Math.max(...nums), prof: prof(n), raiz: !n.padre_id } : null;
    }).filter(Boolean);
    return { porNum, contenedores, estructura: nodos.find(n => n.tipo === 'estructura') || null,
      titulos: nodos.filter(n => n.tipo === 'titulo' && !n.padre_id) };
  }
  // Títulos de las leyes cuya estructura se conoce (número de título y sus
  // artículos): si una pregunta cita un artículo que aún no está en el árbol,
  // va a su título (y, si ese título no está, se crea). Las demás leyes, solo
  // con lo que ya tenga su árbol.
  const CONOCIDAS = [
    { re: /constitucion/, titulos: [['Preliminar', 1, 9], ['1', 10, 55], ['2', 56, 65], ['3', 66, 96], ['4', 97, 107], ['5', 108, 116],
      ['6', 117, 127], ['7', 128, 136], ['8', 137, 158], ['9', 159, 165], ['10', 166, 169]] },
    { re: /7\/1985/, titulos: [['1', 1, 10], ['2', 11, 30], ['3', 31, 41], ['4', 42, 45], ['5', 46, 77], ['6', 78, 88], ['7', 89, 104],
      ['8', 105, 116], ['9', 117, 120], ['10', 121, 138], ['11', 139, 141]] },
    { re: /5\/2015|trebep|estatuto basico del empleado/, titulos: [['1', 1, 7], ['2', 8, 13], ['3', 14, 54], ['4', 55, 68], ['5', 69, 84],
      ['6', 85, 92], ['7', 93, 98], ['8', 99, 100]] },
    // Ley 12/2007 de igualdad de género en Andalucía (texto consolidado, BOE-A-2008-2492).
    { re: /12\/2007/, titulos: [['Preliminar', 1, 4], ['1', 5, 13], ['2', 14, 58], ['3', 59, 63], ['4', 64, 72], ['5', 73, 86]] }
  ];
  const mismoNumero = (a, b) => sinTildes(a).replace(/^0+/, '') === sinTildes(b).replace(/^0+/, '');
  const ESTRUCTURA = /(cuant[oa]s (titulos|capitulos|articulos|secciones|disposiciones)|consta de|se (divide|estructura|compone)|estructura|disposicion(es)? (adicional|transitoria|derogatoria|final))/;

  // ctx: { arbol, propios, pj: [{ nodo_id, palabras }] }. Devuelve { nodo, motivo } (nodo null: la ley en general).
  // La pregunta habla de otra ley (otro nº de ley, una orgánica…) y no nombra la suya: se queda en la ley en general.
  function deOtraLey(pregunta, p){
    const t = sinTildes(pregunta);
    const otra = (t.match(/\d+\/\d{4}/g) || []).some(x => !p.nums.includes(x)) || /\b(ley organica|l\.?o\.?) ?\d/.test(t);
    const suya = p.nums.some(x => t.includes(x)) || (p.ce && /(constitucion|\bce\b)/.test(t)) || (p.siglas || []).some(x => new RegExp('\\b' + x + '\\b').test(t));
    return otra && !suya;
  }
  function colocarCon(q, ctx){
    if(deOtraLey(q.question || '', ctx.propios)) return { nodo: null, motivo: 'otra ley' };
    const texto = (q.explain || '') + ' \n ' + (q.question || '');
    const arts = citados(texto, ctx.propios);
    for(const k of arts) if(ctx.arbol.porNum.has(k)) return { nodo: ctx.arbol.porNum.get(k).id, motivo: 'artículo ' + k };
    if(arts.length){
      const k = arts[0], dentro = ctx.arbol.contenedores.filter(c => c.min <= k && k <= c.max).sort((a, b) => b.prof - a.prof);
      // Ley de estructura conocida: su título (el del árbol o, si falta, uno nuevo).
      const t = ctx.propios.titulos && ctx.propios.titulos.find(([, a, b]) => a <= k && k <= b);
      if(t){
        if(dentro.length && dentro.every(c => { let r = c.n; while(r.padre_id){ const p = ctx.arbol.titulos.find(x => x.id === r.padre_id); if(!p) break; r = p; } return r.tipo !== 'titulo' || mismoNumero(r.numero, t[0]); }))
          return { nodo: dentro[0].n.id, motivo: 'artículo ' + k };
        const ya = ctx.arbol.titulos.find(n => mismoNumero(n.numero, t[0]));
        return ya ? { nodo: ya.id, motivo: 'artículo ' + k } : { nodo: null, crear: { tipo: 'titulo', numero: t[0] }, motivo: 'artículo ' + k };
      }
      if(dentro.length) return { nodo: dentro[0].n.id, motivo: 'artículo ' + k };
    }
    if(ctx.arbol.estructura && ESTRUCTURA.test(sinTildes(q.question || ''))) return { nodo: ctx.arbol.estructura.id, motivo: 'estructura' };
    const w = palabras(q.question || '');
    if(w.size >= 3){
      let mejor = null, punt = 0;
      ctx.pj.forEach(p => {
        let comun = 0;
        w.forEach(x => { if(p.palabras.has(x)) comun++; });
        const j = comun / (w.size + p.palabras.size - comun);
        if(j > punt){ punt = j; mejor = p; }
      });
      if(mejor && punt >= 0.45) return { nodo: mejor.nodo_id, motivo: 'parecida' };
    }
    return { nodo: null, motivo: '' };
  }
  // Con los datos cargados en la app (NODES_BY_ID, QUESTIONS_ALL), por ley.
  const ctxs = new Map();
  function contexto(topicId){
    if(ctxs.has(topicId)) return ctxs.get(topicId);
    const nodos = Object.values(typeof NODES_BY_ID !== 'undefined' ? NODES_BY_ID : {}).filter(n => n.topic_id === topicId);
    const t = (typeof TOPICS_DATA !== 'undefined' ? TOPICS_DATA : []).find(x => x.id === topicId);
    const pj = (typeof QUESTIONS_ALL !== 'undefined' ? QUESTIONS_ALL : []).filter(q => q.topic_id === topicId && q.nodo_id && (q.fuente || 'pj') === 'pj')
      .map(q => ({ nodo_id: q.nodo_id, palabras: palabras(q.q) }));
    const c = { arbol: arbol(nodos), propios: propios(topicId, t ? t.name : ''), pj };
    ctxs.set(topicId, c);
    return c;
  }
  function colocar(q, topicId){ return colocarCon(q, contexto(topicId)); }
  function olvidar(){ ctxs.clear(); }

  /* ---------- crear un título que falta (leyes de estructura conocida) ---------- */
  const creando = new Map();
  function tituloNuevo(topicId, numero){
    const ya = Object.values(NODES_BY_ID).find(n => n.topic_id === topicId && n.tipo === 'titulo' && !n.padre_id && mismoNumero(n.numero, numero));
    if(ya) return Promise.resolve(ya.id);
    const k = topicId + '|' + numero;
    if(!creando.has(k)) creando.set(k, sb.from('nodos_temario').insert({ topic_id: topicId, tipo: 'titulo', numero, orden: 0 }).select('*').single()
      .then(({ data, error }) => { if(error) throw error; NODES_BY_ID[data.id] = data; olvidar(); return data.id; })
      .finally(() => creando.delete(k)));
    return creando.get(k);
  }
  // El sitio de una pregunta ya decidido: el nodo (creando su título si hace falta) o null.
  async function nodoDe(res, topicId){
    if(res.nodo) return res.nodo;
    if(res.crear) return tituloNuevo(topicId, res.crear.numero);
    return null;
  }

  /* ---------- Administración: revisar una a una dónde está cada pregunta de tutorbomberos ---------- */
  let rv = null;   // { ley, solo, cambios: Map(id → valor), motivos: Map(id → texto) }
  const leyesTb = () => [...new Set(QUESTIONS_ALL.filter(q => q.fuente === 'tb').map(q => q.topic_id))];
  const nombreLey = id => { const t = (typeof TOPICS_DATA !== 'undefined' ? TOPICS_DATA : []).find(x => x.id === id); return t ? t.name : id; };
  // Los sitios posibles de una ley: en general, estructura, títulos, capítulos… (y los títulos que se pueden crear).
  function sitios(ley){
    const ns = Object.values(NODES_BY_ID).filter(n => n.topic_id === ley && n.tipo !== 'articulo').sort((a, b) => nodeFullPath(a.id).localeCompare(nodeFullPath(b.id), 'es', { numeric: true }));
    const out = [['', 'La ley en general']].concat(ns.map(n => [n.id, nodeFullPath(n.id)]));
    const p = propios(ley, nombreLey(ley));
    (p.titulos || []).forEach(([num]) => { if(!ns.some(n => n.tipo === 'titulo' && !n.padre_id && mismoNumero(n.numero, num))) out.push(['nuevo:' + num, 'Título ' + (num === 'Preliminar' ? 'Preliminar' : num) + ' (se creará)']); });
    return out;
  }
  const valorDe = q => q.nodo_id || '';
  function revisar(){
    const leyes = leyesTb();
    if(!leyes.length){ uiToast('No hay preguntas de Tutorbombero todavía.', 'info'); return; }
    rv = { ley: rv && leyes.includes(rv.ley) ? rv.ley : leyes[0], solo: true, cambios: new Map(), motivos: new Map() };
    const bg = document.createElement('div');
    bg.className = 'imp-bg'; bg.id = 'colBg';
    bg.innerHTML = '<div class="imp-panel col-panel" role="dialog" aria-modal="true" aria-labelledby="colTit"><h2 id="colTit">Preguntas de Tutorbombero</h2><div class="imp-cuerpo"></div></div>';
    document.body.appendChild(bg);
    bg.addEventListener('click', e => {
      if(e.target === bg) return cerrarRevision();
      const b = e.target.closest('[data-col]');
      if(!b) return;
      if(b.dataset.col === 'cerrar') cerrarRevision();
      else if(b.dataset.col === 'proponer') proponer();
      else if(b.dataset.col === 'guardar'){ b.disabled = true; guardarRevision(); }
      else if(b.dataset.col === 'solo'){ rv.solo = !rv.solo; pintarRevision(); }
    });
    bg.addEventListener('change', e => {
      if(e.target.name === 'colLey'){ if(rv.cambios.size && !confirm('Hay cambios sin guardar en esta ley. ¿Cambiar de ley y perderlos?')){ e.target.value = rv.ley; return; } rv.ley = e.target.value; rv.cambios.clear(); rv.motivos.clear(); pintarRevision(); }
      else if(e.target.dataset.colQ){ const q = QUESTIONS_ALL.find(x => String(x.id) === e.target.dataset.colQ); if(!q) return;
        if(e.target.value === valorDe(q)) rv.cambios.delete(q.id); else rv.cambios.set(q.id, e.target.value); rv.motivos.delete(q.id); pintarPie(); }
    });
    pintarRevision();
  }
  function cerrarRevision(){ const bg = document.getElementById('colBg'); if(bg) bg.remove(); }
  function pintarRevision(){
    const bg = document.getElementById('colBg');
    if(!bg) return;
    const qs = QUESTIONS_ALL.filter(q => q.fuente === 'tb' && q.topic_id === rv.ley);
    const sinSitio = qs.filter(q => !q.nodo_id).length;
    const lista = rv.solo ? qs.filter(q => !q.nodo_id || rv.cambios.has(q.id)) : qs;
    const ops = sitios(rv.ley);
    bg.querySelector('.imp-cuerpo').innerHTML =
      '<div class="col-cab"><select class="cal-in" name="colLey">' + leyesTb().map(l => '<option value="' + escapeHtml(l) + '"' + (l === rv.ley ? ' selected' : '') + '>' + escapeHtml(nombreLey(l)) + '</option>').join('') + '</select>' +
        '<p class="imp-nota">' + qs.length + ' preguntas · <b>' + sinSitio + '</b> en la ley en general (sin título). ' +
          '«Colocar» propone el sitio de cada una por el artículo que cita, por su parecido con las tuyas o si es de estructura; revísalo y guarda.</p>' +
        '<div class="col-acciones"><button type="button" class="imp-btn" data-col="proponer">Colocar automáticamente</button>' +
          '<button type="button" class="imp-btn" data-col="solo">' + (rv.solo ? 'Ver todas' : 'Ver solo sin título') + '</button></div></div>' +
      (lista.length ? '<ol class="col-lista">' + lista.map(q => {
        const v = rv.cambios.has(q.id) ? rv.cambios.get(q.id) : valorDe(q), mot = rv.motivos.get(q.id);
        const extra = [...new Set([valorDe(q), v])].filter(id => id && NODES_BY_ID[id] && !ops.some(o => o[0] === id)).map(id => [id, nodeFullPath(id)]);
        return '<li class="col-q' + (rv.cambios.has(q.id) ? ' cambiada' : '') + '"><div class="col-texto">' + escapeHtml(String(q.q).replace(/^\s*\d+\s*[ªº]\s*-\s*/, '')) + '</div>' +
          (q.explain ? '<div class="col-exp">' + escapeHtml(String(q.explain).slice(0, 220)) + (String(q.explain).length > 220 ? '…' : '') + '</div>' : '') +
          '<div class="col-sitio"><select class="cal-in" data-col-q="' + escapeHtml(String(q.id)) + '">' + extra.concat(ops).map(([id, t]) => '<option value="' + escapeHtml(id) + '"' + (id === v ? ' selected' : '') + '>' + escapeHtml(t) + '</option>').join('') + '</select>' +
            (mot ? '<span class="col-motivo">' + escapeHtml(mot) + '</span>' : '') + '</div></li>';
      }).join('') + '</ol>' : '<p class="imp-nota">' + (rv.solo ? 'Todas las preguntas de esta ley tienen ya su sitio.' : 'No hay preguntas.') + '</p>') +
      '<div class="imp-botones col-pie"></div>';
    pintarPie();
  }
  function pintarPie(){
    const pie = document.querySelector('#colBg .col-pie');
    if(!pie) return;
    const n = rv.cambios.size;
    pie.innerHTML = '<button type="button" class="imp-btn" data-col="cerrar">Cerrar</button><button type="button" class="imp-btn primario" data-col="guardar"' + (n ? '' : ' disabled') + '>' +
      (n ? 'Guardar ' + n + (n === 1 ? ' cambio' : ' cambios') : 'Sin cambios') + '</button>';
    document.querySelectorAll('#colBg .col-q').forEach(li => { const sel = li.querySelector('select'); li.classList.toggle('cambiada', !!sel && rv.cambios.has(QUESTIONS_ALL.find(x => String(x.id) === sel.dataset.colQ)?.id)); });
  }
  // Propone el sitio de las que están en la ley en general.
  function proponer(){
    olvidar();
    let n = 0;
    QUESTIONS_ALL.filter(q => q.fuente === 'tb' && q.topic_id === rv.ley && !q.nodo_id).forEach(q => {
      const r = colocar({ question: q.q, explain: q.explain }, rv.ley);
      const v = r.nodo || (r.crear ? 'nuevo:' + r.crear.numero : '');
      if(!v) return;
      rv.cambios.set(q.id, v); n++;
      rv.motivos.set(q.id, r.motivo === 'parecida' ? 'parecida a una tuya' : r.motivo === 'estructura' ? 'pregunta de estructura' : 'por el ' + r.motivo);
    });
    rv.solo = true;
    pintarRevision();
    uiToast(n ? n + ' colocadas: revísalas y pulsa Guardar' : 'No se ha podido colocar ninguna más', n ? 'success' : 'info');
  }
  async function guardarRevision(){
    const cambios = [...rv.cambios];
    try{
      for(let i = 0; i < cambios.length; i += 20){
        const trozo = await Promise.all(cambios.slice(i, i + 20).map(async ([id, v]) => {
          const nodo = v.startsWith('nuevo:') ? await tituloNuevo(rv.ley, v.slice(6)) : (v || null);
          return sb.from('questions').update({ nodo_id: nodo, updated_at: new Date().toISOString() }).eq('id', id);
        }));
        const mal = trozo.find(r => r.error);
        if(mal) throw mal.error;
      }
    }catch(e){ uiToast('No se pudo guardar: ' + (e.message || e), 'error'); pintarPie(); return; }
    uiToast(cambios.length + (cambios.length === 1 ? ' pregunta colocada' : ' preguntas colocadas'), 'success');
    rv.cambios.clear(); rv.motivos.clear();
    try{ await loadAppData(); if(typeof refreshGlobalStats === 'function') await refreshGlobalStats(); }catch(e){}
    olvidar();
    pintarRevision();
  }
  return { colocar, colocarCon, nodoDe, arbol, propios, palabras, olvidar, mismoNumero, revisar };
})();
if(typeof module !== 'undefined') module.exports = COLOCAR;
