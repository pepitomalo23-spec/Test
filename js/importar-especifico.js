/* Importar preguntas del Específico desde el marcador de tutorbomberos.es
   (scripts/marcador/tutorbomberos.js). El marcador abre esta web con
   #importar-especifico; esta pestaña le avisa de que está lista
   («pjfire-listo») y él le pasa las preguntas por postMessage. Si el
   navegador no deja hablar a las dos pestañas, el marcador las dejó en el
   portapapeles y aquí se pegan con un botón. Después se elige en qué test
   del Específico se guardan (solo el administrador). */
const IMP = (function(){
  const MARCA = 'PJFIRE-PREGUNTAS:';
  const origenValido = o => /^https:\/\/([a-z0-9-]+\.)*tutorbomberos\.es$/.test(o);
  let paquete = null, abierto = false;

  /* ---------- HTML de las preguntas: solo <br>, <b>, <i> e <img> ---------- */
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
          const tg = (t === 'B' || t === 'STRONG') ? 'b' : (t === 'I' || t === 'EM') ? 'i' : '';
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
  let tests = [], cuentas = {};
  async function elegir(bg){
    const cuerpo = bg.querySelector('.imp-cuerpo');
    const [rt, rp] = await Promise.all([
      sb.from('especifico_tests').select('id,tema,titulo,orden').order('orden'),
      sb.from('especifico_preguntas').select('test_id')
    ]);
    if(rt.error || rp.error){ cuerpo.innerHTML = '<p>No se pudieron cargar los tests: ' + escapeHtml((rt.error || rp.error).message) + '</p><div class="imp-botones"><button type="button" class="imp-btn" data-imp="cerrar">Cerrar</button></div>'; return; }
    tests = rt.data || [];
    cuentas = {};
    (rp.data || []).forEach(r => { cuentas[r.test_id] = (cuentas[r.test_id] || 0) + 1; });
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
  async function guardar(bg){
    const sel = bg.querySelector('#impTest');
    if(!sel) return;
    const testId = sel.value, sustituir = !!(cuentas[testId] && bg.querySelector('#impSustituir').checked);
    const btn = bg.querySelector('[data-imp="guardar"]');
    btn.disabled = true; btn.textContent = 'Guardando…';
    try{
      const fila = (q, orden) => ({ test_id: testId, orden, enunciado: q.enunciado, opciones: q.opciones, correcta: q.correcta,
        confirmada: q.confirmada, explicacion: q.explicacion, dificultad: q.dificultad, origen: paquete.origen || null });
      let nuevas = [], cambiadas = [], sobran = [];
      if(sustituir){
        // Se actualizan en su sitio las que ya estaban (mismo enunciado): así no
        // se pierden las estrellas que les hayan puesto los alumnos.
        const { data, error } = await sb.from('especifico_preguntas').select('id,enunciado').eq('test_id', testId);
        if(error) throw error;
        const clave = h => String(h || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
        const libres = new Map();
        (data || []).forEach(r => { const k = clave(r.enunciado); if(!libres.has(k)) libres.set(k, []); libres.get(k).push(r.id); });
        paquete.preguntas.forEach((q, i) => {
          const ids = libres.get(clave(q.enunciado));
          if(ids && ids.length) cambiadas.push({ id: ids.shift(), fila: fila(q, i) });
          else nuevas.push(fila(q, i));
        });
        libres.forEach(ids => { sobran.push(...ids); });
      } else {
        let orden = 0;
        if(cuentas[testId]){
          const { data, error } = await sb.from('especifico_preguntas').select('orden').eq('test_id', testId).order('orden', { ascending: false }).limit(1);
          if(error) throw error;
          orden = data && data.length ? data[0].orden + 1 : 0;
        }
        nuevas = paquete.preguntas.map((q, i) => fila(q, orden + i));
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
      const filas = paquete.preguntas;
      const t = tests.find(x => x.id === testId);
      uiToast(filas.length + ' preguntas guardadas en «' + (t ? t.titulo : 'el test') + '»', 'success');
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
    if(e.target === bg) return cerrar();
    const b = e.target.closest('[data-imp]');
    if(!b) return;
    if(b.dataset.imp === 'cerrar') cerrar();
    else if(b.dataset.imp === 'guardar') guardar(bg);
    else if(b.dataset.imp === 'pegar') pegar(bg);
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
      if(!origenValido(e.origin) || !e.data || e.data.tipo !== 'pjfire-preguntas' || paquete) return;
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
      if(paquete || ++n > 30){
        clearInterval(aviso);
        if(!paquete) cuandoAdmin(mostrar);   // no llegó nada: se ofrece pegarlas
        return;
      }
      try{ if(window.opener) window.opener.postMessage({ tipo: 'pjfire-listo' }, '*'); }catch(e){}
    }, 500);
  }
  return { limpiar, normalizar };
})();
