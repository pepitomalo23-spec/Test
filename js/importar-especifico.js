/* Importar preguntas del Específico desde el marcador de tutorbomberos.es
   (scripts/marcador/tutorbomberos.js, o el de «Extraer todo»,
   scripts/marcador/tutorbomberos-todo.js). El marcador abre esta web con
   #importar-especifico; esta pestaña le avisa de que está lista
   («pjfire-listo») y él le pasa las preguntas por postMessage. Si el
   navegador no deja hablar a las dos pestañas, el marcador las dejó en el
   portapapeles y aquí se pegan con un botón. Después se elige en qué test
   del Específico se guardan (solo el administrador). */
const IMP = (function(){
  const MARCA = 'PJFIRE-PREGUNTAS:';
  const origenValido = o => /^https:\/\/([a-z0-9-]+\.)*tutorbomberos\.es$/.test(o);
  let paquete = null, abierto = false;

  /* ---------- HTML de las preguntas: solo <br>, <b>, <i>, <u>, <sub>, <sup> e <img> ---------- */
  function limpiar(html){
    const doc = new DOMParser().parseFromString('<body>' + String(html || '') + '</body>', 'text/html');
    let out = '';
    const walk = n => {
      for(const c of n.childNodes){
        if(c.nodeType === 3){ out += escapeHtml(c.textContent); continue; }
        if(c.nodeType !== 1) continue;
        const t = c.tagName;
        if(t === 'BR'){ out += '<br>'; }
        else if(t === 'IMG'){
          const src = c.getAttribute('src') || '';
          if(/^data:image\/(png|jpe?g|gif|webp);base64,[a-z0-9+/=]+$/i.test(src) || /^https:\/\//.test(src)) out += '<img src="' + escapeHtml(src) + '">';
        }
        else if(t === 'SCRIPT' || t === 'STYLE') {}
        else {
          const tg = (t === 'B' || t === 'STRONG') ? 'b' : (t === 'I' || t === 'EM') ? 'i' : (t === 'U' || t === 'SUB' || t === 'SUP') ? t.toLowerCase() : '';
          if(tg) out += '<' + tg + '>';
          walk(c);
          if(tg) out += '</' + tg + '>';
        }
      }
    };
    walk(doc.body);
    return out.replace(/^(\s*<br>)+/, '').replace(/(<br>\s*)+$/, '').trim();
  }
  function normalizar(p){
    if(!p || p.tipo !== 'pjfire-preguntas' || !Array.isArray(p.preguntas)) return null;
    const preguntas = p.preguntas.map(q => ({
      enunciado: limpiar(q.enunciado) || 'Pregunta',
      opciones: (Array.isArray(q.opciones) ? q.opciones : [])
        .filter(o => o && /^[a-z]$/i.test(o.l))
        .map(o => ({ l: o.l.toLowerCase(), html: limpiar(o.html) })),
      correcta: /^[a-z]$/i.test(q.correcta || '') ? q.correcta.toLowerCase() : '',
      confirmada: q.confirmada !== false,
      explicacion: limpiar(q.explicacion),
      dificultad: ['facil', 'media', 'dificil'].includes(q.dificultad) ? q.dificultad : ''
    })).filter(q => q.opciones.length);
    if(!preguntas.length) return null;
    return { titulo: String(p.titulo || '').slice(0, 200), origen: String(p.origen || '').slice(0, 500), preguntas };
  }

  /* Tests y cuántas preguntas tiene cada uno (en tests y cuentas). */
  let tests = [], cuentas = {};
  async function cargarTests(cuerpo){
    try{
      const [rt, n] = await Promise.all([sb.from('especifico_tests').select('id,tema,titulo,orden').order('orden'), ESP.contarPreguntas()]);
      if(rt.error) throw rt.error;
      tests = rt.data || [];
      cuentas = n;
      return true;
    }catch(e){
      cuerpo.innerHTML = '<p>No se pudieron cargar los tests: ' + escapeHtml(e.message || String(e)) + '</p><div class="imp-botones"><button type="button" class="imp-btn" data-imp="cerrar">Cerrar</button></div>';
      return false;
    }
  }

  /* ---------- ventana para elegir el test ---------- */
  function cerrar(){ const bg = document.getElementById('impBg'); if(bg) bg.remove(); abierto = false; }
  async function mostrar(){
    if(abierto) return;
    abierto = true;
    const bg = document.createElement('div');
    bg.className = 'imp-bg';
    bg.id = 'impBg';
    bg.innerHTML = '<div class="imp-panel" role="dialog" aria-modal="true" aria-labelledby="impTit"><h2 id="impTit">Importar preguntas</h2><div class="imp-cuerpo">' +
      (paquete ? '<div class="cal-cargando">Cargando tus tests…</div>'
        : '<p>No han llegado las preguntas directamente desde tutorbomberos. El marcador las ha copiado: pulsa <b>Pegar preguntas</b>.</p>' +
          '<div class="imp-botones"><button type="button" class="imp-btn" data-imp="cerrar">Cancelar</button><button type="button" class="imp-btn primario" data-imp="pegar">Pegar preguntas</button></div>') +
      '</div></div>';
    document.body.appendChild(bg);
    bg.addEventListener('click', onClick);
    bg.addEventListener('change', e => { if(e.target.name === 'test') pintarSustituir(bg); });
    if(paquete) await elegir(bg);
  }
  async function elegir(bg){
    const cuerpo = bg.querySelector('.imp-cuerpo');
    if(!(await cargarTests(cuerpo))) return;
    const n = paquete.preguntas.length, sinConfirmar = paquete.preguntas.filter(q => !q.confirmada).length;
    const grupos = ESP.temas().map((t, i) => {
      const ts = tests.filter(x => x.tema === t.clave);
      if(!ts.length) return '';
      return '<optgroup label="' + escapeHtml((i + 1) + '. ' + t.titulo) + '">' +
        ts.map(x => '<option value="' + x.id + '">' + escapeHtml(x.titulo) + (cuentas[x.id] ? ' (' + cuentas[x.id] + ' preguntas)' : '') + '</option>').join('') + '</optgroup>';
    }).join('');
    cuerpo.innerHTML =
      '<p><b>' + n + (n === 1 ? ' pregunta' : ' preguntas') + '</b>' + (paquete.titulo ? ' de «' + escapeHtml(paquete.titulo) + '»' : '') + '.' +
        (sinConfirmar ? ' <span class="imp-aviso">En ' + sinConfirmar + ' la web no confirmó la correcta.</span>' : '') + '</p>' +
      (grupos
        ? '<label class="imp-label" for="impTest">¿En qué test las meto?</label><select id="impTest" name="test">' + grupos + '</select>' +
          '<label class="imp-check hidden" id="impSustituirFila"><input type="checkbox" id="impSustituir" checked> <span></span></label>' +
          '<div class="imp-botones"><button type="button" class="imp-btn" data-imp="cerrar">Cancelar</button><button type="button" class="imp-btn primario" data-imp="guardar">Guardar</button></div>'
        : '<p>Todavía no tienes tests en el Específico. Créalos en Administración › Específico y vuelve a enviar las preguntas.</p>' +
          '<div class="imp-botones"><button type="button" class="imp-btn" data-imp="cerrar">Cerrar</button></div>');
    pintarSustituir(bg);
  }
  function pintarSustituir(bg){
    const sel = bg.querySelector('#impTest'), fila = bg.querySelector('#impSustituirFila');
    if(!sel || !fila) return;
    const n = cuentas[sel.value] || 0;
    fila.classList.toggle('hidden', !n);
    fila.querySelector('span').textContent = 'Sustituir las ' + n + ' preguntas que ya tiene (si no, se añaden detrás)';
  }
  /* Imágenes que el marcador no pudo incrustar (de otras webs, sin permiso
     para leerlas desde tutorbomberos): las descarga el servidor
     (supabase/functions/imagen-externa) y se meten en el texto. Sin esto no
     se verían: la CSP de pj.fire no deja cargar imágenes de fuera.
     Devuelve cuántas no se pudieron incrustar. */
  const RE_EXT = /src="(https:[^"]+)"/g;
  async function incrustarExternas(preguntas, aviso){
    const campos = q => [q.enunciado, q.explicacion, ...q.opciones.map(o => o.html)];
    const urls = new Set();
    preguntas.forEach(q => campos(q).forEach(h => { for(const m of String(h || '').matchAll(RE_EXT)) urls.add(m[1]); }));
    if(!urls.size) return 0;
    const lista = [...urls], datos = {};
    const desc = h => h.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
    for(let i = 0; i < lista.length; i += 10){
      if(aviso) aviso('Descargando imágenes ' + Math.min(i + 10, lista.length) + ' de ' + lista.length + '…');
      const trozo = lista.slice(i, i + 10);
      try{
        const { data, error } = await sb.functions.invoke('imagen-externa', { body: { urls: trozo.map(desc) } });
        if(!error && data && data.imagenes) trozo.forEach(u => {
          const d = data.imagenes[desc(u)];
          if(typeof d === 'string' && /^data:image\/(png|jpeg|gif|webp);base64,[a-z0-9+/=]+$/i.test(d)) datos[u] = d;
        });
      }catch(e){}
    }
    const cambiar = h => String(h || '').replace(RE_EXT, (m, u) => datos[u] ? 'src="' + datos[u] + '"' : m);
    preguntas.forEach(q => {
      q.enunciado = cambiar(q.enunciado);
      q.explicacion = cambiar(q.explicacion);
      q.opciones.forEach(o => { o.html = cambiar(o.html); });
    });
    return lista.filter(u => !datos[u]).length;
  }

  /* Guarda unas preguntas ya normalizadas en un test. Con «sustituir» se
     actualizan en su sitio las que ya estaban (mismo enunciado): así no se
     pierden las estrellas que les hayan puesto los alumnos; las que ya no
     vienen se borran. Si no, se añaden detrás. */
  async function volcar(testId, preguntas, origen, sustituir){
    const fila = (q, orden) => ({ test_id: testId, orden, enunciado: q.enunciado, opciones: q.opciones, correcta: q.correcta,
      confirmada: q.confirmada, explicacion: q.explicacion, dificultad: q.dificultad, origen: origen || null });
    let nuevas = [], cambiadas = [], sobran = [];
    if(sustituir){
      const { data, error } = await sb.from('especifico_preguntas').select('id,enunciado').eq('test_id', testId);
      if(error) throw error;
      const clave = claveTexto;
      const libres = new Map();
      (data || []).forEach(r => { const k = clave(r.enunciado); if(!libres.has(k)) libres.set(k, []); libres.get(k).push(r.id); });
      preguntas.forEach((q, i) => {
        const ids = libres.get(clave(q.enunciado));
        if(ids && ids.length) cambiadas.push({ id: ids.shift(), fila: fila(q, i) });
        else nuevas.push(fila(q, i));
      });
      libres.forEach(ids => { sobran.push(...ids); });
    } else {
      const { data, error } = await sb.from('especifico_preguntas').select('orden').eq('test_id', testId).order('orden', { ascending: false }).limit(1);
      if(error) throw error;
      const orden = data && data.length ? data[0].orden + 1 : 0;
      nuevas = preguntas.map((q, i) => fila(q, orden + i));
    }
    if(sobran.length){
      const { error } = await sb.from('especifico_preguntas').delete().in('id', sobran);
      if(error) throw error;
    }
    for(let k = 0; k < cambiadas.length; k += 5){
      const rs = await Promise.all(cambiadas.slice(k, k + 5).map(c => sb.from('especifico_preguntas').update(c.fila).eq('id', c.id)));
      const r = rs.find(x => x.error);
      if(r) throw r.error;
    }
    // En tandas de como mucho ~1,5 MB (las imágenes van dentro del texto).
    let tanda = [], peso = 0;
    const enviar = async () => {
      if(!tanda.length) return;
      const { error } = await sb.from('especifico_preguntas').insert(tanda);
      if(error) throw error;
      tanda = []; peso = 0;
    };
    for(const f of nuevas){
      const p = JSON.stringify(f).length;
      if(tanda.length && peso + p > 1500000) await enviar();
      tanda.push(f); peso += p;
    }
    await enviar();
  }
  async function guardar(bg){
    const sel = bg.querySelector('#impTest');
    if(!sel) return;
    const testId = sel.value, sustituir = !!(cuentas[testId] && bg.querySelector('#impSustituir').checked);
    const btn = bg.querySelector('[data-imp="guardar"]');
    btn.disabled = true; btn.textContent = 'Guardando…';
    try{
      const sinImg = await incrustarExternas(paquete.preguntas, t => { btn.textContent = t; });
      btn.textContent = 'Guardando…';
      await volcar(testId, paquete.preguntas, paquete.origen, sustituir);
      const t = tests.find(x => x.id === testId);
      uiToast(paquete.preguntas.length + ' preguntas guardadas en «' + (t ? t.titulo : 'el test') + '»' +
        (sinImg ? '. ' + sinImg + (sinImg === 1 ? ' imagen no se pudo' : ' imágenes no se pudieron') + ' descargar.' : ''), sinImg ? 'info' : 'success');
      paquete = null;
      cerrar();
      showScreen('screen-especifico');
    }catch(e){
      uiToast('No se pudieron guardar: ' + (e.message || e), 'error');
      btn.disabled = false; btn.textContent = 'Guardar';
    }
  }
  async function pegar(bg){
    let txt = '';
    try{ txt = await navigator.clipboard.readText(); }catch(e){}
    const i = txt.indexOf(MARCA);
    let p = null;
    if(i >= 0){ try{ p = normalizar(JSON.parse(txt.slice(i + MARCA.length))); }catch(e){} }
    if(!p){ uiToast('En el portapapeles no hay preguntas del marcador. Vuelve a pulsar «Enviar a pj.fire» en tutorbomberos.', 'error'); return; }
    paquete = p;
    bg.querySelector('.imp-cuerpo').innerHTML = '<div class="cal-cargando">Cargando tus tests…</div>';
    await elegir(bg);
  }
  function onClick(e){
    const bg = document.getElementById('impBg');
    if(e.target === bg){ if(!guardando) cerrar(); return; }
    const b = e.target.closest('[data-imp]');
    if(!b) return;
    if(b.dataset.imp === 'cerrar') cerrar();
    else if(b.dataset.imp === 'guardar') guardar(bg);
    else if(b.dataset.imp === 'pegar') pegar(bg);
    else if(b.dataset.imp === 'lote'){ b.disabled = true; guardarLote(bg); }
    else if(b.dataset.imp === 'aplicar'){ b.disabled = true; aplicarRevision(bg); }
  }

  /* ---------- «Extraer todo» (scripts/marcador/tutorbomberos-todo.js) ----------
     Llegan todos los tests de tutorbomberos de golpe. Cada uno va a su tema
     (por el id de tema de tutorbomberos) y al test que ya tenga ese mismo
     título, o se crea al final del tema. Los de temas que no hay en pj.fire
     se dejan fuera. */
  const TEMAS_TB = { 3: 'fuego', 4: 'extintores', 5: 'sistemas', 6: 'utiles', 7: 'epi', 8: 'vehiculos', 9: 'fisica',
    10: 'hidraulica', 11: 'gases', 12: 'electricidad', 13: 'mercancias', 14: 'radio', 15: 'socorrismo', 16: 'forestales',
    17: 'intervenciones', 18: 'construccion', 19: 'cte', 800: 'rseiei', 20: 'prl', 21: 'ascensores', 419: 'himenopteros' };
  let lote = null, plan = null, guardando = false;
  const claveTitulo = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/^\s*test\s*-\s*/i, '').replace(/\s+/g, ' ').trim().toLowerCase();
  function normalizarLote(p){
    if(!p || p.tipo !== 'pjfire-lote' || !Array.isArray(p.tests)) return null;
    const origen = String(p.origen || '').slice(0, 500);
    const ts = p.tests.map(t => {
      const n = t && normalizar({ tipo: 'pjfire-preguntas', preguntas: t.preguntas });
      const llegan = t && Array.isArray(t.preguntas) ? t.preguntas.length : 0, quedan = n ? n.preguntas.length : 0;
      const avisos = (t && Array.isArray(t.avisos) ? t.avisos : []).map(a => String(a).slice(0, 200)).slice(0, 10);
      if(quedan < llegan) avisos.push((llegan - quedan) + ' sin opciones (no se guardan)');
      return {
        clave: TEMAS_TB[String(t && t.temaId)] || '',
        temaTb: String((t && t.tema) || 'Tema ' + (t && t.temaId)).slice(0, 200),
        titulo: String((t && t.titulo) || '').replace(/^\s*test\s*-\s*/i, '').trim().slice(0, 200),
        avisos,
        preguntas: n ? n.preguntas : []
      };
    }).filter(t => t.titulo && t.preguntas.length);
    const total = Number.isInteger(p.total) ? p.total : p.tests.length;
    return ts.length ? { origen, total, modo: p.modo === 'revisar' ? 'revisar' : 'todo', tests: ts } : null;
  }
  function ventana(titulo){
    abierto = true;
    const bg = document.createElement('div');
    bg.className = 'imp-bg';
    bg.id = 'impBg';
    bg.innerHTML = '<div class="imp-panel" role="dialog" aria-modal="true" aria-labelledby="impTit"><h2 id="impTit">' + titulo + '</h2><div class="imp-cuerpo"><div class="cal-cargando">Cargando tus tests…</div></div></div>';
    document.body.appendChild(bg);
    bg.addEventListener('click', onClick);
    return bg;
  }
  // Cada test que llega se empareja con uno que ya exista (mismo tema y título; cada uno una vez).
  function emparejar(){
    const usados = new Set();
    plan = lote.tests.filter(t => t.clave).map(t => {
      const ya = tests.find(x => x.tema === t.clave && !usados.has(x.id) && claveTitulo(x.titulo) === claveTitulo(t.titulo));
      if(ya) usados.add(ya.id);
      return Object.assign({ id: ya ? ya.id : null }, t);
    });
    const fuera = {};
    lote.tests.filter(t => !t.clave).forEach(t => { fuera[t.temaTb] = (fuera[t.temaTb] || 0) + 1; });
    return { fuera, usados };
  }
  // Temas que se dejan fuera, tests que no llegaron y avisos del marcador.
  function notasLote(fuera){
    const omitidos = Object.keys(fuera), conAvisos = plan.filter(t => t.avisos.length);
    return (omitidos.length ? '<p class="imp-nota">Se dejan fuera (ese tema no está en pj.fire): ' + omitidos.map(k => '«' + escapeHtml(k) + '» (' + fuera[k] + ')').join(', ') + '.</p>' : '') +
      (lote.total > lote.tests.length ? '<p class="imp-aviso">Faltan ' + (lote.total - lote.tests.length) + ' de los ' + lote.total + ' tests de tutorbomberos (no se pudieron sacar o se paró antes): vuelve a pasar el marcador después.</p>' : '') +
      (conAvisos.length ? '<details class="imp-detalles"><summary>Revisa ' + conAvisos.length + (conAvisos.length === 1 ? ' test' : ' tests') + '</summary><ul class="imp-resumen">' +
        conAvisos.map(t => '<li><b>' + escapeHtml(t.titulo) + '</b>: ' + escapeHtml(t.avisos.join(', ')) + '</li>').join('') + '</ul></details>' : '');
  }
  async function mostrarLote(){
    if(abierto) return;
    const bg = ventana('Importar todo');
    const cuerpo = bg.querySelector('.imp-cuerpo');
    if(!(await cargarTests(cuerpo))) return;
    const { fuera } = emparejar();
    const nPreg = plan.reduce((n, t) => n + t.preguntas.length, 0);
    const filas = ESP.temas().map((tm, i) => {
      const ts = plan.filter(t => t.clave === tm.clave);
      if(!ts.length) return '';
      const nuevos = ts.filter(t => !t.id).length;
      return '<li><b>' + (i + 1) + '. ' + escapeHtml(tm.titulo) + '</b>: ' + ts.length + (ts.length === 1 ? ' test' : ' tests') +
        (nuevos ? ' <span class="imp-nuevo">(' + (nuevos === ts.length ? (nuevos === 1 ? 'nuevo' : 'todos nuevos') : nuevos + (nuevos === 1 ? ' nuevo' : ' nuevos')) + ')</span>' : '') + '</li>';
    }).join('');
    cuerpo.innerHTML = plan.length
      ? '<p><b>' + plan.length + ' tests</b> con <b>' + nPreg + ' preguntas</b>.</p>' +
        '<ul class="imp-resumen">' + filas + '</ul>' +
        '<p class="imp-nota">Los tests que ya tienes con el mismo título se actualizan (sin perder las preguntas marcadas); los demás se crean al final de su tema.</p>' +
        notasLote(fuera) +
        '<div class="imp-botones"><button type="button" class="imp-btn" data-imp="cerrar">Cancelar</button><button type="button" class="imp-btn primario" data-imp="lote">Importar todo</button></div>'
      : '<p>Ninguno de los tests es de un tema de pj.fire.</p><div class="imp-botones"><button type="button" class="imp-btn" data-imp="cerrar">Cerrar</button></div>';
  }
  async function guardarLote(bg){
    const cuerpo = bg.querySelector('.imp-cuerpo');
    const fallos = [];
    let hechos = 0, nPreg = 0;
    guardando = true;
    const todas = plan.reduce((a, t) => a.concat(t.preguntas), []);
    const sinImg = await incrustarExternas(todas, txt => { cuerpo.innerHTML = '<p>' + escapeHtml(txt) + '</p><p class="imp-nota">No cierres esta pestaña.</p>'; });
    for(let i = 0; i < plan.length; i++){
      const t = plan[i];
      cuerpo.innerHTML = '<p>Guardando ' + (i + 1) + ' de ' + plan.length + '…</p><p class="imp-nota">' + escapeHtml(t.titulo) + '</p>' +
        '<div class="imp-barra"><span style="width:' + Math.round(i / plan.length * 100) + '%"></span></div><p class="imp-nota">No cierres esta pestaña.</p>';
      try{
        if(!t.id){
          const orden = tests.filter(x => x.tema === t.clave).reduce((m, x) => Math.max(m, x.orden + 1), 0);
          const { data, error } = await sb.from('especifico_tests').insert({ tema: t.clave, titulo: t.titulo, orden }).select('id,tema,titulo,orden').single();
          if(error) throw error;
          tests.push(data);
          t.id = data.id;
        }
        await volcar(t.id, t.preguntas, lote.origen, true);   // actualiza las que ya estén, sin duplicar
        hechos++; nPreg += t.preguntas.length;
      }catch(e){ fallos.push('«' + t.titulo + '»: ' + (e.message || e)); }
    }
    lote = null;
    guardando = false;
    if(fallos.length || sinImg){
      cuerpo.innerHTML = '<p>Guardados ' + hechos + ' de ' + plan.length + ' tests (' + nPreg + ' preguntas).' +
          (fallos.length ? ' <span class="imp-aviso">Fallaron ' + fallos.length + ':</span>' : '') + '</p>' +
        (fallos.length ? '<ul class="imp-resumen">' + fallos.map(f => '<li>' + escapeHtml(f) + '</li>').join('') + '</ul>' +
          '<p class="imp-nota">Vuelve a pasar el marcador para reintentarlos: los que ya estén se actualizan, no se duplican.</p>' : '') +
        (sinImg ? '<p class="imp-aviso">' + sinImg + (sinImg === 1 ? ' imagen no se pudo descargar' : ' imágenes no se pudieron descargar') + ' (la web de origen no responde).</p>' : '') +
        '<div class="imp-botones"><button type="button" class="imp-btn primario" data-imp="cerrar">Cerrar</button></div>';
    } else {
      uiToast(hechos + ' tests y ' + nPreg + ' preguntas guardados', 'success');
      cerrar();
    }
    plan = null;
    showScreen('screen-especifico');
  }

  /* ---------- «Revisar cambios» (mismo marcador con modo «revisar») ----------
     Compara cada test de tutorbomberos con el que ya hay en pj.fire y enseña
     qué es nuevo, qué ha cambiado y qué ya no está, antes de tocar nada. Al
     aplicar solo se escribe lo que cambia; las preguntas que ya no están
     solo se borran si se marca la casilla. Nunca se borra un dato que ya
     tienes porque en tutorbomberos venga vacío (puede ser un fallo al leerlo). */
  const textoPlano = h => String(h || '').replace(/<\/?(b|i|u|sub|sup)>/g, '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
  const claveTexto = h => textoPlano(h).toLowerCase();
  // Para comparar: las imágenes incrustadas por una huella; las que aún son
  // un enlace (se incrustan al aplicar) valen como cualquier imagen.
  function comparable(h, laxo){
    return String(h || '').replace(/<img src="([^"]*)">/g, (m, src) => laxo ? '[img]' : '[img:' + src.length + ':' + src.slice(-40) + ']').replace(/\s+/g, ' ').trim();
  }
  function difPregunta(viejo, q){
    const campos = [];
    const igual = (a, b) => { const laxo = /src="https:/.test(a + b); return comparable(a, laxo) === comparable(b, laxo); };
    if(!igual(viejo.enunciado, q.enunciado)) campos.push('enunciado');
    const ops = o => (o || []).map(x => x.l + ')' + x.html);
    if(!igual(ops(viejo.opciones).join('|'), ops(q.opciones).join('|'))) campos.push('opciones');
    if(q.correcta && q.correcta !== viejo.correcta) campos.push('correcta');
    if(q.explicacion && !igual(viejo.explicacion, q.explicacion)) campos.push('explicación');
    if(q.dificultad && q.dificultad !== viejo.dificultad) campos.push('dificultad');
    return campos;
  }
  function compararTest(viejas, nuevas){
    const r = { nuevas: [], cambiadas: [], quitadas: [], orden: [] };
    const libres = new Map(), sinPar = [];
    viejas.forEach(v => { const k = claveTexto(v.enunciado); if(!libres.has(k)) libres.set(k, []); libres.get(k).push(v); });
    const pares = new Array(nuevas.length).fill(null);
    nuevas.forEach((q, i) => { const vs = libres.get(claveTexto(q.enunciado)); if(vs && vs.length) pares[i] = vs.shift(); });
    // Las que no casan por el enunciado: misma pregunta con el enunciado retocado si sus opciones son iguales.
    const resto = [];
    libres.forEach(vs => resto.push(...vs));
    const huella = q => (q.opciones || []).map(o => claveTexto(o.html)).join('|');
    nuevas.forEach((q, i) => {
      if(pares[i]) return;
      const h = huella(q), k = h.replace(/\|/g, '') ? resto.findIndex(v => huella(v) === h) : -1;
      if(k >= 0) pares[i] = resto.splice(k, 1)[0];
    });
    nuevas.forEach((q, i) => {
      const v = pares[i];
      if(!v){ r.nuevas.push(i); return; }
      const campos = difPregunta(v, q);
      if(campos.length) r.cambiadas.push({ i, v, campos });
      else if(v.orden !== i) r.orden.push({ id: v.id, orden: i });
    });
    r.quitadas = resto;
    return r;
  }
  async function mostrarRevision(){
    if(abierto) return;
    const bg = ventana('Revisar cambios');
    const cuerpo = bg.querySelector('.imp-cuerpo');
    if(!(await cargarTests(cuerpo))) return;
    const { fuera, usados } = emparejar();
    const conTest = plan.filter(t => t.id);
    try{
      for(let i = 0; i < conTest.length; i++){
        const t = conTest[i];
        cuerpo.innerHTML = '<p>Comparando ' + (i + 1) + ' de ' + conTest.length + '…</p><p class="imp-nota">' + escapeHtml(t.titulo) + '</p>' +
          '<div class="imp-barra"><span style="width:' + Math.round(i / conTest.length * 100) + '%"></span></div>';
        const { data, error } = await sb.from('especifico_preguntas').select('id,orden,enunciado,opciones,correcta,explicacion,dificultad').eq('test_id', t.id).order('orden').range(0, 4999);
        if(error) throw error;
        t.cambios = compararTest(data || [], t.preguntas);
      }
    }catch(e){
      cuerpo.innerHTML = '<p>No se pudo comparar: ' + escapeHtml(e.message || String(e)) + '</p><div class="imp-botones"><button type="button" class="imp-btn" data-imp="cerrar">Cerrar</button></div>';
      return;
    }
    const nuevosTests = plan.filter(t => !t.id);
    const suma = k => conTest.reduce((n, t) => n + t.cambios[k].length, 0);
    const nNuevas = suma('nuevas'), nCambiadas = suma('cambiadas'), nQuitadas = suma('quitadas'), nOrden = suma('orden');
    const corto = h => { const t = textoPlano(h); return t.length > 110 ? t.slice(0, 107) + '…' : t || '(con imagen)'; };
    const temaDe = k => { const i = ESP.temas().findIndex(x => x.clave === k); return i >= 0 ? (i + 1) + '. ' + ESP.temas()[i].titulo : k; };
    // En pj.fire pero no en tutorbomberos (solo si llegaron todos los tests).
    const temasLote = new Set(plan.map(t => t.clave));
    const desaparecidos = lote.total === lote.tests.length ? tests.filter(x => temasLote.has(x.tema) && !usados.has(x.id)) : [];
    const detalle = [];
    nuevosTests.forEach(t => detalle.push('<details class="imp-detalles"><summary><span class="imp-nuevo">Test nuevo</span> · ' + escapeHtml(t.titulo) + ' (' + t.preguntas.length + ' preguntas)</summary><p class="imp-nota">' + escapeHtml(temaDe(t.clave)) + '</p></details>'));
    conTest.filter(t => t.cambios.nuevas.length || t.cambios.cambiadas.length || t.cambios.quitadas.length).forEach(t => {
      const c = t.cambios, partes = [];
      if(c.nuevas.length) partes.push(c.nuevas.length + (c.nuevas.length === 1 ? ' nueva' : ' nuevas'));
      if(c.cambiadas.length) partes.push(c.cambiadas.length + (c.cambiadas.length === 1 ? ' cambiada' : ' cambiadas'));
      if(c.quitadas.length) partes.push(c.quitadas.length + ' ya no ' + (c.quitadas.length === 1 ? 'está' : 'están'));
      detalle.push('<details class="imp-detalles"><summary>' + escapeHtml(t.titulo) + ' · ' + partes.join(', ') + '</summary><p class="imp-nota">' + escapeHtml(temaDe(t.clave)) + '</p><ul class="imp-resumen">' +
        c.nuevas.map(i => '<li><span class="imp-nuevo">Nueva:</span> ' + escapeHtml(corto(t.preguntas[i].enunciado)) + '</li>').join('') +
        c.cambiadas.map(x => '<li><b>Cambia ' + escapeHtml(x.campos.join(', ')) + ':</b> ' + escapeHtml(corto(t.preguntas[x.i].enunciado)) + '</li>').join('') +
        c.quitadas.map(v => '<li><span class="imp-aviso">Ya no está:</span> ' + escapeHtml(corto(v.enunciado)) + '</li>').join('') +
        '</ul></details>');
    });
    const hay = nuevosTests.length || nNuevas || nCambiadas || nQuitadas || nOrden;
    const nPregs = n => n + (n === 1 ? ' pregunta' : ' preguntas');
    const cifra = (n, uno, varios) => '<b>' + n + '</b> ' + (n === 1 ? uno : varios);
    cuerpo.innerHTML =
      '<p>' + plan.length + ' tests de tutorbomberos comparados con pj.fire.</p>' +
      (hay ? '<ul class="imp-resumen">' +
          (nuevosTests.length ? '<li>' + cifra(nuevosTests.length, 'test nuevo', 'tests nuevos') + ' (' + nPregs(nuevosTests.reduce((n, t) => n + t.preguntas.length, 0)) + ')</li>' : '') +
          (nNuevas ? '<li>' + cifra(nNuevas, 'pregunta nueva', 'preguntas nuevas') + ' en tests que ya tienes</li>' : '') +
          (nCambiadas ? '<li>' + cifra(nCambiadas, 'pregunta cambiada', 'preguntas cambiadas') + '</li>' : '') +
          (nQuitadas ? '<li>' + cifra(nQuitadas, 'pregunta ya no está', 'preguntas ya no están') + ' en tutorbomberos</li>' : '') +
          (nOrden ? '<li>' + cifra(nOrden, 'pregunta cambia', 'preguntas cambian') + ' solo de orden</li>' : '') +
        '</ul>' + detalle.join('')
        : '<p class="imp-ok">✓ Todo está al día: no hay nada nuevo ni cambiado.</p>') +
      (desaparecidos.length ? '<details class="imp-detalles"><summary>' + desaparecidos.length + (desaparecidos.length === 1 ? ' test tuyo ya no está' : ' tests tuyos ya no están') + ' en tutorbomberos</summary><ul class="imp-resumen">' +
        desaparecidos.map(x => '<li>' + escapeHtml(x.titulo) + ' <span class="imp-nota">(' + escapeHtml(temaDe(x.tema)) + ')</span></li>').join('') + '</ul><p class="imp-nota">No se tocan: si quieres quitarlos, hazlo en Administración › Específico.</p></details>' : '') +
      notasLote(fuera) +
      (nQuitadas ? '<label class="imp-check"><input type="checkbox" id="impBorrarQuitadas"> <span>Borrar también de pj.fire ' + (nQuitadas === 1 ? 'la pregunta que ya no está' : 'las ' + nQuitadas + ' preguntas que ya no están') + ' en tutorbomberos</span></label>' : '') +
      '<div class="imp-botones"><button type="button" class="imp-btn" data-imp="cerrar">' + (hay ? 'Cancelar' : 'Cerrar') + '</button>' +
        (hay ? '<button type="button" class="imp-btn primario" data-imp="aplicar">Aplicar cambios</button>' : '') + '</div>';
  }
  async function aplicarRevision(bg){
    const cuerpo = bg.querySelector('.imp-cuerpo');
    const borrar = !!(bg.querySelector('#impBorrarQuitadas') || {}).checked;
    const fallos = [];
    let hechos = 0;
    guardando = true;
    // Solo se descargan las imágenes de lo que se va a escribir.
    const escribir = [];
    plan.forEach(t => {
      if(!t.id) escribir.push(...t.preguntas);
      else { t.cambios.nuevas.forEach(i => escribir.push(t.preguntas[i])); t.cambios.cambiadas.forEach(x => escribir.push(t.preguntas[x.i])); }
    });
    const sinImg = await incrustarExternas(escribir, txt => { cuerpo.innerHTML = '<p>' + escapeHtml(txt) + '</p><p class="imp-nota">No cierres esta pestaña.</p>'; });
    const conCambios = plan.filter(t => !t.id || t.cambios.nuevas.length || t.cambios.cambiadas.length || t.cambios.orden.length || (borrar && t.cambios.quitadas.length));
    for(let k = 0; k < conCambios.length; k++){
      const t = conCambios[k];
      cuerpo.innerHTML = '<p>Aplicando ' + (k + 1) + ' de ' + conCambios.length + '…</p><p class="imp-nota">' + escapeHtml(t.titulo) + '</p>' +
        '<div class="imp-barra"><span style="width:' + Math.round(k / conCambios.length * 100) + '%"></span></div><p class="imp-nota">No cierres esta pestaña.</p>';
      try{
        if(!t.id){
          const orden = tests.filter(x => x.tema === t.clave).reduce((m, x) => Math.max(m, x.orden + 1), 0);
          const { data, error } = await sb.from('especifico_tests').insert({ tema: t.clave, titulo: t.titulo, orden }).select('id,tema,titulo,orden').single();
          if(error) throw error;
          tests.push(data);
          t.id = data.id;
          await volcar(t.id, t.preguntas, lote.origen, true);
        } else {
          const c = t.cambios;
          if(borrar && c.quitadas.length){
            const { error } = await sb.from('especifico_preguntas').delete().in('id', c.quitadas.map(v => v.id));
            if(error) throw error;
          }
          // Lo que en tutorbomberos llega vacío no pisa lo que ya hay.
          const fila = (q, i, v) => ({ orden: i, enunciado: q.enunciado, opciones: q.opciones,
            correcta: q.correcta || (v && v.correcta) || '', confirmada: q.correcta ? q.confirmada : !!(v && v.correcta),
            explicacion: q.explicacion || (v && v.explicacion) || '', dificultad: q.dificultad || (v && v.dificultad) || '' });
          const updates = c.cambiadas.map(x => ({ id: x.v.id, cambio: fila(t.preguntas[x.i], x.i, x.v) }))
            .concat(c.orden.map(o => ({ id: o.id, cambio: { orden: o.orden } })));
          for(let j = 0; j < updates.length; j += 5){
            const rs = await Promise.all(updates.slice(j, j + 5).map(u => sb.from('especifico_preguntas').update(u.cambio).eq('id', u.id)));
            const r = rs.find(x => x.error);
            if(r) throw r.error;
          }
          let tanda = [], peso = 0;
          const enviar = async () => {
            if(!tanda.length) return;
            const { error } = await sb.from('especifico_preguntas').insert(tanda);
            if(error) throw error;
            tanda = []; peso = 0;
          };
          for(const i of c.nuevas){
            const f = Object.assign({ test_id: t.id, origen: lote.origen || null }, fila(t.preguntas[i], i, null));
            const p = JSON.stringify(f).length;
            if(tanda.length && peso + p > 1500000) await enviar();
            tanda.push(f); peso += p;
          }
          await enviar();
        }
        hechos++;
      }catch(e){ fallos.push('«' + t.titulo + '»: ' + (e.message || e)); }
    }
    lote = null;
    guardando = false;
    if(fallos.length || sinImg){
      cuerpo.innerHTML = '<p>Aplicados los cambios de ' + hechos + ' de ' + conCambios.length + ' tests.' + (fallos.length ? ' <span class="imp-aviso">Fallaron ' + fallos.length + ':</span>' : '') + '</p>' +
        (fallos.length ? '<ul class="imp-resumen">' + fallos.map(f => '<li>' + escapeHtml(f) + '</li>').join('') + '</ul><p class="imp-nota">Vuelve a pasar el marcador «Revisar cambios» para terminar.</p>' : '') +
        (sinImg ? '<p class="imp-aviso">' + sinImg + (sinImg === 1 ? ' imagen no se pudo descargar' : ' imágenes no se pudieron descargar') + ' (la web de origen no responde).</p>' : '') +
        '<div class="imp-botones"><button type="button" class="imp-btn primario" data-imp="cerrar">Cerrar</button></div>';
    } else {
      uiToast('Cambios aplicados en ' + hechos + (hechos === 1 ? ' test' : ' tests'), 'success');
      cerrar();
    }
    plan = null;
    showScreen('screen-especifico');
  }

  /* ---------- esperar a que haya sesión de administrador ---------- */
  function cuandoAdmin(fn){
    let avisado = false;
    const t = setInterval(() => {
      if(typeof currentUser === 'undefined' || !currentUser) return;   // aún entrando
      clearInterval(t);
      if(!currentUserIsAdmin){ if(!avisado){ avisado = true; uiToast('Solo el administrador puede importar preguntas.', 'error'); } return; }
      fn();
    }, 400);
  }

  if(location.hash === '#importar-especifico'){
    try{ history.replaceState(null, '', location.pathname + location.search); }catch(e){}
    addEventListener('message', e => {
      if(!origenValido(e.origin) || !e.data || paquete || lote) return;
      if(e.data.tipo === 'pjfire-lote'){
        const l = normalizarLote(e.data);
        if(!l) return;
        lote = l;
        try{ e.source.postMessage({ tipo: 'pjfire-recibido' }, e.origin); }catch(err){}
        cerrar();   // por si estaba abierta la ventana de «Pegar»
        cuandoAdmin(lote.modo === 'revisar' ? mostrarRevision : mostrarLote);
        return;
      }
      if(e.data.tipo !== 'pjfire-preguntas') return;
      const p = normalizar(e.data);
      if(!p) return;
      paquete = p;
      try{ e.source.postMessage({ tipo: 'pjfire-recibido' }, e.origin); }catch(err){}
      // Si ya estaba abierta la ventana de «Pegar», se pasa a elegir el test.
      const bg = document.getElementById('impBg');
      if(bg){ bg.querySelector('.imp-cuerpo').innerHTML = '<div class="cal-cargando">Cargando tus tests…</div>'; elegir(bg); }
      else cuandoAdmin(mostrar);
    });
    // Aviso a la pestaña de tutorbomberos (cada medio segundo, hasta 15 s).
    // Sin pestaña de origen (el navegador la desconectó) no llegará nada: a pegar.
    let n = window.opener ? 0 : 30;
    const aviso = setInterval(() => {
      if(paquete || lote || ++n > 30){
        clearInterval(aviso);
        if(!paquete && !lote) cuandoAdmin(mostrar);   // no llegó nada: se ofrece pegarlas
        return;
      }
      try{ if(window.opener) window.opener.postMessage({ tipo: 'pjfire-listo' }, '*'); }catch(e){}
    }, 500);
  }
  return { limpiar, normalizar };
})();
