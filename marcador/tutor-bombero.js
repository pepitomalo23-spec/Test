/* ============================================================
   Marcador de pj.fire para Tutor Bombero
   ------------------------------------------------------------
   Lo carga un favorito de Safari (el «marcador» que se instala desde
   Plan › Ajustes › Tutor Bombero) cuando TÚ lo tocas estando en
   tutorbomberos.es. Lee la página que tienes delante:
     - en una lista de tests: los nombres de los tests y su tema;
     - en la pantalla de resultados: solo las líneas con tus números
       (aciertos, fallos, en blanco, nota…), nunca las preguntas.
   Te enseña lo que ha encontrado y, solo si pulsas «Copiar», lo copia
   al portapapeles para pegarlo en pj.fire (Plan › «Pegar de Tutor
   Bombero»).

   Lo que NO hace: no envía nada a ningún sitio (ni a pj.fire ni a
   nadie: no hay ninguna petición de red), no lee cookies, contraseñas
   ni formularios, no pulsa nada en la página y no guarda nada fuera de
   esta pestaña (la lista que juntas de varias páginas va en
   sessionStorage y se borra al cerrarla).

   El formato de lo copiado lo lee PLANL.leerMarcadorTB (js/plan-logica.js).
   Se prueba en Node (las funciones de texto, por el module.exports del
   final) y de punta a punta en tests/plan/e2e (páginas de Tutor Bombero
   simuladas).
   ============================================================ */
(function(){
  'use strict';

  const VERSION = 1;
  const CABECERA = 'pj.fire · Tutor Bombero (marcador)';
  const CLAVE_LISTA = 'pjfire_tb_lista_v1';
  const MAX_TESTS = 2000;
  const MAX_LINEAS = 40;

  // ---------- Texto (funciones puras) ----------
  function limpiar(s){
    return String(s == null ? '' : s).replace(/[  -​ 　]/g, ' ').replace(/\s+/g, ' ').trim();
  }
  function sinTildes(s){
    return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '');
  }
  function corto(s, n){ s = limpiar(s); return s.length > n ? s.slice(0, n - 1) + '…' : s; }
  // «TEMA 5.- LA CONSTITUCIÓN» → «La constitución» (solo si viene todo en mayúsculas).
  function suavizarMayusculas(s){
    if(!s || /[a-záéíóúñü]/.test(s) || !/[A-ZÁÉÍÓÚÑÜ]{4}/.test(s)) return s;
    const l = s.toLowerCase();
    return l.charAt(0).toUpperCase() + l.slice(1);
  }

  // «Tema 5», «TEMA 05.- La Constitución», «Tema 12: Incendios» → { numero, nombre }.
  const RE_TEMA = /^\s*tema\s*n?[º°ª.]?\s*(\d{1,3})\b\s*[.:\-–—)]*\s*[.:\-–—]?\s*(.*)$/i;
  // «Tests del tema 5», «Simulacros del Tema 12: Incendios» también son títulos de tema.
  const RE_TEMA_TITULO = /^\s*(?:tests?|simulacros?|ex[aá]menes|preguntas)\s+(?:del?|de la|sobre el)\s+tema\s*n?[º°ª.]?\s*(\d{1,3})\b\s*[.:\-–—)]*\s*(.*)$/i;
  function esTema(texto){
    const t = limpiar(texto);
    if(!t || t.length > 140) return null;
    const m = RE_TEMA.exec(t) || RE_TEMA_TITULO.exec(t);
    if(!m) return null;
    const numero = Number(m[1]);
    if(!(numero >= 0 && numero <= 999)) return null;
    const resto = limpiar(m[2]);
    // «Tema 5 - Test 3» no es un tema: es un test del tema 5.
    if(RE_TEST.test(resto)) return null;
    return { numero, nombre: corto(suavizarMayusculas(resto), 150) || null };
  }

  // Un test: «Test 3», «TEST 03», «Test nº 12», «Simulacro 2», «Examen 2019 (Madrid)»,
  // «Tema 5 - Test 3»… Tiene que nombrar test/simulacro/examen/bloque y llevar un número.
  const RE_TEST = /\b(test|tests|simulacro|simulacros|examen|examenes|exámenes|bloque|prueba)\b/i;
  const RE_NO_TEST = /\b(acierto|aciertos|fallo|fallos|puntuaci[oó]n|calificaci[oó]n|nota media|historial|estad[ií]sticas?|configura|configurar|crear|nuevo test|mis tests)\b/i;
  // Cabeceras como «Tests realizados (12)» o «Simulacros disponibles: 4».
  const RE_CABECERA = /^\s*(?:tests?|simulacros?|ex[aá]menes|pruebas)\s+(?:realizad|pendient|hech|complet|disponibl|total|nuevos)/i;
  function esTest(texto){
    const t = limpiar(texto);
    if(t.length < 3 || t.length > 120) return false;
    if(!RE_TEST.test(t) || !/\d/.test(t)) return false;
    if(RE_NO_TEST.test(t) || RE_CABECERA.test(t) || RE_TEMA_TITULO.test(t)) return false;
    if(/^\d+([.,]\d+)?\s*%?$/.test(t)) return false;
    return true;
  }
  // Nombre limpio del test y, si lo dice, cuántas preguntas tiene.
  function nombreTest(texto){
    let t = limpiar(String(texto == null ? '' : texto).split(/\n/)[0]);
    let preguntas = null;
    const m = /\(?\b(\d{1,3})\s*preguntas\b\)?/i.exec(t);
    if(m){
      const n = Number(m[1]);
      if(n >= 1 && n <= 500) preguntas = n;
      t = limpiar(t.replace(m[0], ' '));
    }
    // Lo que va pegado al nombre y no es el nombre: estado, nota, fecha, marcas.
    t = t.replace(/\s*[-–—|·(\[,]?\s*nota\s*:?\s*\d.*$/i, '')
      .replace(/\s*[-–—|·(\[,]?\s*\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}.*$/, '')
      .replace(/\s*[-–—|·(\[,]?\s*(?:realizad[oa]|no realizad[oa]|pendiente|hecho|completad[oa]|nuevo|sin hacer)\s*[)\]]?\s*$/i, '')
      .replace(/[✓✔✗✘★☆]+/g, ' ');
    t = limpiar(t).replace(/[\s.:\-–—|·,;]+$/, '').replace(/^[\s.:\-–—|·,;>»]+/, '');
    return { nombre: corto(suavizarMayusculas(t), 160), preguntas };
  }

  // Líneas de un texto que hablan del resultado: tienen una palabra de
  // resultado y un número, o son la fila de títulos de una tabla
  // («Aciertos  Fallos  Nota») con la fila de números justo debajo.
  const RE_PALABRA_RES = /(acierto|correct|fallo|error|incorrect|en blanco|blanco|sin contestar|sin responder|no contestad|no respondid|omitid|nota|puntuaci|calificaci|total|preguntas|resultado|tiempo)/i;
  const RE_PALABRA_FUERTE = /(acierto|correct|fallo|incorrect|en blanco|sin contestar|no contestad|nota|puntuaci|calificaci)/i;
  function lineasResultado(texto){
    const lineas = String(texto == null ? '' : texto).replace(/\r\n?/g, '\n').split('\n')
      .map(l => l.replace(/[  -​ 　]/g, ' ').replace(/[ ]{2,}/g, '  ').trim())
      .filter(Boolean);
    const out = [];
    for(let i = 0; i < lineas.length && out.length < MAX_LINEAS; i++){
      const l = lineas[i];
      // Ni líneas largas ni preguntas (¿…?) ni la corrección pregunta a pregunta.
      if(l.length > 100 || /[¿?]/.test(l) || /^(?:pregunta|preg\.?|p)\s*\d+/i.test(l) || /^\d+\s*[.)\-–]\s*\D/.test(l)) continue;
      if(esTest(l) && !/(acierto|fallo|blanco|contestad)/i.test(l)) continue;   // «Test 1 · 30 preguntas» es un test, no un resultado
      const tieneNum = /\d/.test(l);
      if(tieneNum && RE_PALABRA_RES.test(l)){ out.push(l); continue; }
      // Fila de títulos de una tabla: varias palabras de resultado y ningún número.
      const palabras = (l.match(new RegExp(RE_PALABRA_RES.source, 'gi')) || []).length;
      if(!tieneNum && palabras >= 2 && i + 1 < lineas.length){
        const sig = lineas[i + 1];
        const digitos = (sig.match(/[\d.,%/\s\t]/g) || []).length;
        if(/\d/.test(sig) && digitos >= sig.length * 0.6){ out.push(l, sig); i++; }
      }
    }
    // Un resultado nombra al menos dos cosas distintas: aciertos, fallos, en blanco o nota.
    const todo = sinTildes(out.join('\n')).toLowerCase();
    const tipos = [/acierto|correct/, /fallo|incorrect|error/, /blanco|sin contestar|sin responder|no contestad|no respondid|omitid/, /nota|puntuaci|calificaci/].filter(re => re.test(todo)).length;
    return tipos >= 2 ? out : [];
  }
  // El título del test en la pantalla de resultados: la primera línea que
  // nombra un test (o un tema) y no es una línea de números.
  function tituloResultado(texto, tituloDoc){
    const lineas = String(texto == null ? '' : texto).split(/\n/).map(limpiar).filter(Boolean);
    for(const l of lineas.slice(0, 80)){
      if(l.length > 120 || RE_PALABRA_FUERTE.test(l)) continue;
      if(esTest(l) || (/\btema\s*\d/i.test(l) && l.length <= 100)) return corto(l, 160);
    }
    const t = limpiar(tituloDoc);
    return t && t.length <= 120 && (RE_TEST.test(t) || /\btema\s*\d/i.test(t)) ? corto(t, 160) : null;
  }

  // Junta tests por tema sin repetir (mismo tema y mismo nombre).
  function agrupar(items, previos){
    const temas = [];
    const porClave = new Map();
    const vistos = new Set();
    let total = 0;
    const claveTema = t => t ? (t.numero != null ? 'n' + t.numero : 'x' + sinTildes(String(t.nombre || '')).toLowerCase()) : '-';
    const meter = (tema, test) => {
      if(total >= MAX_TESTS || !test || !test.nombre) return;
      const kt = claveTema(tema);
      const k = kt + '|' + sinTildes(test.nombre).toLowerCase();
      if(vistos.has(k)) return;
      vistos.add(k);
      let g = porClave.get(kt);
      if(!g){
        g = { numero: tema && tema.numero != null ? tema.numero : null, nombre: tema ? (tema.nombre || null) : null, tests: [] };
        porClave.set(kt, g);
        temas.push(g);
      } else if(tema && tema.nombre && !g.nombre) g.nombre = tema.nombre;
      g.tests.push({ nombre: test.nombre, preguntas: test.preguntas || null });
      total++;
    };
    (previos || []).forEach(g => (g.tests || []).forEach(t => meter(g.numero != null || g.nombre ? { numero: g.numero, nombre: g.nombre } : null, t)));
    (items || []).forEach(it => meter(it.tema, it.test));
    return { temas, total };
  }

  function sinSesion(ruta){
    return String(ruta || '').replace(/;jsessionid=[^?#/]*/gi, '').replace(/[?#].*$/, '').slice(0, 200);
  }
  function texto(tipo, datos){
    const p = Object.assign({ pjfire: 'tutor_bombero', v: VERSION, tipo }, datos, { at: new Date().toISOString() });
    return CABECERA + '\n' + JSON.stringify(p);
  }

  // ---------- Página (DOM) ----------
  const SALTAR = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'SVG', 'CANVAS', 'IFRAME', 'FRAME', 'OBJECT', 'TEXTAREA']);
  const EN_LINEA = new Set(['B', 'STRONG', 'I', 'EM', 'SPAN', 'SMALL', 'BR', 'SUP', 'SUB', 'IMG', 'FONT', 'U', 'MARK', 'ABBR', 'LABEL', 'WBR']);
  const ID_PANEL = 'pjfire-marcador-tb';

  function documentos(){
    const docs = [document];
    // Marcos de la misma web (las aplicaciones JSP antiguas a veces los usan).
    try{
      Array.from(document.querySelectorAll('iframe, frame')).forEach(f => {
        try{ if(f.contentDocument && f.contentDocument.body) docs.push(f.contentDocument); }catch(e){}
      });
    }catch(e){}
    return docs;
  }
  // Texto «propio» de un elemento que no tiene bloques dentro (un enlace,
  // un botón, una celda, un título…). null si tiene bloques dentro.
  function textoHoja(el){
    if(el.tagName === 'INPUT') return /^(button|submit)$/i.test(el.type) ? el.value : null;
    if(el.tagName === 'OPTION') return el.text;
    for(const h of el.children){ if(!EN_LINEA.has(h.tagName)) return null; }
    const t = el.innerText != null ? el.innerText : el.textContent;
    return t && t.length <= 300 ? t : null;
  }
  function buscarTests(){
    const items = [];
    documentos().forEach(doc => {
      if(!doc.body) return;
      // El tema vale hasta el siguiente título de sección que no sea un tema
      // (un h3 «Simulacros» después del «Tema 3» cierra el tema 3).
      let temaActual = null, nivelTema = 99;
      const w = doc.createTreeWalker(doc.body, NodeFilter.SHOW_ELEMENT, {
        acceptNode: n => (SALTAR.has(n.tagName) || n.id === ID_PANEL) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT
      });
      for(let el = w.nextNode(); el; el = w.nextNode()){
        if(el.tagName === 'INPUT' && !/^(button|submit)$/i.test(el.type)) continue;
        const t = textoHoja(el);
        // Sin mirar si se ve: los tests de un tema plegado (acordeón) también cuentan.
        if(t == null) continue;
        const tx = limpiar(t);
        if(!tx) continue;
        if(el.tagName === 'OPTION'){
          const og = el.parentElement && el.parentElement.tagName === 'OPTGROUP' ? esTema(el.parentElement.label) : null;
          const tm = esTema(tx);
          if(tm){ if(el.selected){ temaActual = tm; nivelTema = 99; } continue; }   // un desplegable de temas: vale el elegido
          if(esTest(tx)) items.push({ tema: og || temaDeTexto(tx) || temaActual, test: nombreTest(tx) });
          continue;
        }
        const nivel = /^H[1-6]$/.test(el.tagName) ? Number(el.tagName.charAt(1)) : 99;
        const tm = esTema(tx);
        if(tm){ temaActual = tm; nivelTema = nivel; continue; }
        if(esTest(tx)){ items.push({ tema: temaDeTexto(tx) || temaActual, test: nombreTest(tx) }); continue; }
        if(nivel < 99 && nivel <= nivelTema){ temaActual = null; nivelTema = 99; }
      }
    });
    return items;
  }
  // «Tema 5 - Test 3» → tema 5.
  function temaDeTexto(t){
    const m = /\btema\s*n?[º°ª.]?\s*(\d{1,3})\b/i.exec(t);
    return m ? { numero: Number(m[1]), nombre: null } : null;
  }
  function textoPagina(){
    return documentos().map(doc => {
      if(!doc.body) return '';
      const panel = doc.getElementById(ID_PANEL);
      if(panel) panel.style.display = 'none';
      const t = doc.body.innerText || doc.body.textContent || '';
      if(panel) panel.style.display = '';
      return t;
    }).join('\n');
  }
  function seleccion(){
    try{ const s = window.getSelection && window.getSelection(); return s ? String(s) : ''; }catch(e){ return ''; }
  }
  // Para mejorar el marcador cuando no reconoce una página: la estructura
  // (etiquetas, clases y textos cortos de títulos y botones), sin valores
  // de formularios, sin cookies y sin enlaces con parámetros.
  function diagnostico(){
    const out = ['pj.fire · diagnóstico del marcador v' + VERSION, 'página: ' + sinSesion(location.pathname), 'título: ' + corto(document.title, 80)];
    let n = 0;
    documentos().forEach((doc, i) => {
      if(i) out.push('— marco ' + i);
      if(!doc.body) return;
      doc.body.querySelectorAll('h1,h2,h3,h4,h5,h6,a,button,input[type=submit],input[type=button],select,option,optgroup,th,td,li,label,legend,form,table,frame,iframe').forEach(el => {
        if(n >= 250 || (el.closest && el.closest('#' + ID_PANEL))) return;
        let t = el.tagName === 'INPUT' ? el.value : el.tagName === 'OPTGROUP' ? el.label : el.tagName === 'SELECT' || el.tagName === 'FORM' || el.tagName === 'TABLE' ? '' : (el.innerText || el.textContent || '');
        // Sin datos personales: ni correos ni números largos (DNI, teléfono…).
        t = corto(t, 50).replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, '[correo]').replace(/\d{6,}[A-Za-z]?/g, '[número]');
        const cls = (typeof el.className === 'string' ? el.className : '').trim().split(/\s+/).filter(Boolean).slice(0, 2).join('.');
        const prof = Math.min(12, (function(e){ let p = 0; while(e && e.parentElement && p < 40){ e = e.parentElement; p++; } return p; })(el));
        out.push(' '.repeat(Math.max(0, prof - 2)) + el.tagName.toLowerCase() + (el.id ? '#' + corto(el.id, 30) : '') + (cls ? '.' + cls : '') + (el.name ? '[name=' + corto(el.name, 20) + ']' : '') + (t ? ' «' + t + '»' : ''));
        n++;
      });
    });
    return out.join('\n');
  }

  // ---------- Lista juntada de varias páginas (solo esta pestaña) ----------
  function leerLista(){
    try{ const v = JSON.parse(sessionStorage.getItem(CLAVE_LISTA)); return v && Array.isArray(v.temas) ? v.temas : []; }catch(e){ return []; }
  }
  function guardarLista(temas){
    try{ if(temas && temas.length) sessionStorage.setItem(CLAVE_LISTA, JSON.stringify({ temas })); else sessionStorage.removeItem(CLAVE_LISTA); }catch(e){}
  }

  // ---------- Panel ----------
  const CSS = ':host{all:initial}' +
    '.p{position:fixed;left:50%;bottom:12px;transform:translateX(-50%);width:min(560px,calc(100vw - 16px));max-height:min(78vh,720px);overflow:auto;' +
    'background:#fff;color:#1d1d1f;border:1px solid rgba(0,0,0,.12);border-radius:16px;box-shadow:0 12px 40px rgba(0,0,0,.28);' +
    'font:15px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;z-index:2147483647;padding:14px 16px 16px;box-sizing:border-box}' +
    '.cab{display:flex;align-items:center;gap:8px;margin-bottom:6px}.cab b{font-size:16px;flex:1}.marca{background:#e8452c;color:#fff;border-radius:6px;padding:1px 7px;font-size:12px;font-weight:700}' +
    '.x{border:0;background:transparent;font-size:24px;line-height:1;color:inherit;cursor:pointer;padding:4px 8px}' +
    '.s{border-top:1px solid rgba(0,0,0,.1);margin-top:10px;padding-top:10px}.s h3{margin:0 0 6px;font-size:15px}' +
    '.suave{opacity:.72;font-size:13px}.lin{font:13px/1.4 ui-monospace,Menlo,monospace;background:rgba(0,0,0,.05);border-radius:8px;padding:8px;white-space:pre-wrap;word-break:break-word;margin:6px 0}' +
    'ul{margin:6px 0;padding-left:0;list-style:none}li{margin:3px 0}li label{display:flex;gap:8px;align-items:flex-start;cursor:pointer}li input{margin-top:3px;width:18px;height:18px;flex:none}' +
    '.bt{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}button.b{border:0;border-radius:10px;padding:10px 14px;font:600 15px -apple-system,BlinkMacSystemFont,sans-serif;cursor:pointer;background:rgba(0,0,0,.07);color:inherit}' +
    'button.b.pri{background:#e8452c;color:#fff}.ok{color:#1a7f37;font-weight:600}.mal{color:#c62828;font-weight:600}' +
    'textarea{width:100%;box-sizing:border-box;min-height:90px;font:12px ui-monospace,Menlo,monospace;margin-top:6px;border-radius:8px;border:1px solid rgba(0,0,0,.2);padding:6px}' +
    '@media (prefers-color-scheme:dark){.p{background:#1c1c1e;color:#f2f2f7;border-color:rgba(255,255,255,.14)}.s{border-color:rgba(255,255,255,.14)}.lin{background:rgba(255,255,255,.08)}button.b{background:rgba(255,255,255,.12)}textarea{background:#2c2c2e;color:#f2f2f7;border-color:rgba(255,255,255,.2)}.ok{color:#4ade80}.mal{color:#f87171}}';

  function el(tag, props, hijos){
    const e = document.createElement(tag);
    if(props) Object.keys(props).forEach(k => {
      if(k === 'texto') e.textContent = props[k];
      else if(k === 'clase') e.className = props[k];
      else if(k.startsWith('on')) e.addEventListener(k.slice(2), props[k]);
      else e.setAttribute(k, props[k]);
    });
    (hijos || []).forEach(h => { if(h) e.appendChild(typeof h === 'string' ? document.createTextNode(h) : h); });
    return e;
  }

  async function copiar(textoACopiar, aviso, caja){
    let hecho = false;
    try{ if(navigator.clipboard && navigator.clipboard.writeText){ await navigator.clipboard.writeText(textoACopiar); hecho = true; } }catch(e){}
    if(!hecho){
      // Sin permiso para el portapapeles: se deja seleccionado para copiarlo a mano.
      const ta = el('textarea', { readonly: 'readonly', 'aria-label': 'Texto para pj.fire' });
      ta.value = textoACopiar;
      caja.appendChild(ta);
      ta.focus();
      ta.select();
      try{ hecho = document.execCommand && document.execCommand('copy'); }catch(e){}
    }
    aviso.className = hecho ? 'ok' : 'mal';
    aviso.textContent = hecho ? 'Copiado. Vuelve a pj.fire y pulsa «Pegar de Tutor Bombero».' : 'No he podido copiarlo solo: mantén pulsado el texto de arriba, «Seleccionar todo» y «Copiar».';
    return hecho;
  }

  function cerrarPanel(){
    const viejo = document.getElementById(ID_PANEL);
    if(viejo) viejo.remove();
  }
  function abrirPanel(){
    cerrarPanel();
    const host = el('div', { id: ID_PANEL });
    const raiz = host.attachShadow ? host.attachShadow({ mode: 'open' }) : host;
    raiz.appendChild(el('style', { texto: CSS }));
    const p = el('div', { clase: 'p', role: 'dialog', 'aria-label': 'pj.fire' });
    p.appendChild(el('div', { clase: 'cab' }, [el('span', { clase: 'marca', texto: 'pj.fire' }), el('b', { texto: 'Tutor Bombero' }),
      el('button', { clase: 'x', type: 'button', 'aria-label': 'Cerrar', texto: '×', onclick: cerrarPanel })]));
    raiz.appendChild(p);
    (document.body || document.documentElement).appendChild(host);
    return p;
  }

  function seccionResultado(p, lineas, titulo){
    const s = el('div', { clase: 's' });
    s.appendChild(el('h3', { texto: 'Resultado' + (titulo ? ': ' + titulo : '') }));
    s.appendChild(el('div', { clase: 'suave', texto: 'Se copian solo estas líneas (tus números), no las preguntas:' }));
    s.appendChild(el('div', { clase: 'lin', texto: lineas.join('\n') }));
    const aviso = el('div', { 'aria-live': 'polite' });
    s.appendChild(el('div', { clase: 'bt' }, [el('button', { clase: 'b pri', type: 'button', texto: 'Copiar resultado para pj.fire',
      onclick: () => copiar(texto('resultado', { titulo: titulo || null, lineas, pagina: sinSesion(location.pathname) }), aviso, s) })]));
    s.appendChild(aviso);
    p.appendChild(s);
  }

  function seccionTests(p, items){
    const previos = leerLista();
    const actual = agrupar(items);
    const s = el('div', { clase: 's' });
    const nombreGrupo = g => g.numero != null ? 'Tema ' + g.numero + (g.nombre ? ' · ' + g.nombre : '') : (g.nombre || 'Sin tema');
    s.appendChild(el('h3', { texto: 'Tests en esta página: ' + actual.total }));
    const lista = el('ul');
    const marcados = new Map();
    actual.temas.forEach((g, i) => {
      const cb = el('input', { type: 'checkbox' });
      cb.checked = true;
      marcados.set(i, cb);
      const ej = g.tests.slice(0, 4).map(t => t.nombre).join(', ') + (g.tests.length > 4 ? '…' : '');
      lista.appendChild(el('li', null, [el('label', null, [cb, el('span', null, [el('b', { texto: nombreGrupo(g) }), ' · ' + g.tests.length + ' ', el('span', { clase: 'suave', texto: ej })])])]));
    });
    s.appendChild(lista);
    const prev = agrupar([], previos);
    if(prev.total) s.appendChild(el('div', { clase: 'suave', texto: 'Ya tenías juntados ' + prev.total + ' tests de otras páginas: se copian con estos.' }));
    const elegidos = () => actual.temas.filter((g, i) => marcados.get(i).checked);
    const aviso = el('div', { 'aria-live': 'polite' });
    s.appendChild(el('div', { clase: 'bt' }, [
      el('button', { clase: 'b pri', type: 'button', texto: 'Copiar para pj.fire', onclick: async () => {
        const todo = agrupar([], previos.concat(elegidos()));
        if(!todo.total){ aviso.className = 'mal'; aviso.textContent = 'No hay ningún tema marcado.'; return; }
        if(await copiar(texto('tests', { temas: todo.temas, pagina: sinSesion(location.pathname) }), aviso, s)) guardarLista(null);
      } }),
      el('button', { clase: 'b', type: 'button', texto: 'Juntar y seguir en otra página', onclick: () => {
        const todo = agrupar([], previos.concat(elegidos()));
        guardarLista(todo.temas);
        aviso.className = 'ok';
        aviso.textContent = 'Juntados ' + todo.total + ' tests. Ve a otra página de tests y vuelve a tocar el marcador; al final, «Copiar para pj.fire».';
      } }),
      prev.total ? el('button', { clase: 'b', type: 'button', texto: 'Vaciar lo juntado', onclick: () => { guardarLista(null); aviso.className = 'ok'; aviso.textContent = 'Vaciado.'; } }) : null
    ]));
    s.appendChild(aviso);
    p.appendChild(s);
  }

  function seccionNada(p){
    const s = el('div', { clase: 's' });
    s.appendChild(el('p', { texto: 'En esta página no encuentro ni tests ni un resultado.' }));
    s.appendChild(el('ul', null, [
      el('li', { texto: '• Abre la página donde salen tus tests (por temas) o la pantalla de resultados al terminar un test, y vuelve a tocar el marcador.' }),
      el('li', { texto: '• Si el resultado está ahí pero no lo encuentro, selecciona con el dedo la zona de los números y toca el marcador otra vez.' }),
      el('li', { texto: '• Si aun así no va, copia el diagnóstico y pégaselo a quien te mantiene pj.fire: lleva la estructura de la página (títulos y botones), no tus datos.' })
    ]));
    const aviso = el('div', { 'aria-live': 'polite' });
    s.appendChild(el('div', { clase: 'bt' }, [el('button', { clase: 'b', type: 'button', texto: 'Copiar diagnóstico', onclick: () => copiar(diagnostico(), aviso, s) })]));
    s.appendChild(aviso);
    p.appendChild(s);
  }

  function principal(){
    const p = abrirPanel();
    if(!/(^|\.)tutorbomberos\.es$/i.test(location.hostname)){
      p.appendChild(el('p', { texto: 'Este marcador es para la web de Tutor Bombero (tutorbomberos.es). Ábrela, entra con tu usuario y tócalo allí.' }));
      return;
    }
    const sel = limpiar(seleccion()) ? seleccion() : '';
    const pagina = textoPagina();
    let lineas = lineasResultado(sel || pagina);
    if(sel && !lineas.length) lineas = lineasResultado(pagina);
    const items = sel ? [] : buscarTests();
    if(lineas.length) seccionResultado(p, lineas, tituloResultado(pagina, document.title));
    // En la pantalla de resultados, el título del test no es una lista de tests.
    if(items.length > (lineas.length ? 1 : 0)) seccionTests(p, items);
    if(!lineas.length && !items.length){
      const previos = agrupar([], leerLista());
      if(previos.total) seccionTests(p, []);
      else seccionNada(p);
    }
    p.appendChild(el('p', { clase: 'suave', texto: 'Nada sale de esta página hasta que pulsas «Copiar»: se copia a tu portapapeles, no se envía a ningún sitio.' }));
  }

  const API = { limpiar, esTema, esTest, nombreTest, lineasResultado, tituloResultado, agrupar, sinSesion, texto, CABECERA, VERSION };
  if(typeof module !== 'undefined' && module.exports){ module.exports = API; return; }
  try{ principal(); }catch(e){
    try{ alert('pj.fire: el marcador ha fallado en esta página (' + (e && e.message ? e.message : e) + ').'); }catch(x){}
  }
})();
