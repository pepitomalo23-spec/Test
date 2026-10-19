/* Datos importantes (Estudio): apartados de fichas que cada usuario se crea
   para memorizar datos (números ONU de mercancías peligrosas, NIP, teléfonos,
   cifras…). Tablas di_apartados y di_datos (privadas, cada uno lo suyo).
   Cada apartado pregunta a su manera (según su plantilla, y se puede cambiar):
     · Nº ONU ↔ materia: el número se escribe (teclado numérico); la materia se elige entre 4.
     · NIP ↔ significado: el código se escribe (33, X423…); el significado se elige entre 4.
     · Libre: dato ↔ qué es, eligiendo entre 4 (o escribiendo, si se marca).
   Modos: Fichas (girar), Aprender (las que fallas vuelven hasta que salen; dominada
   con 3 aciertos seguidos) y Probar (10 preguntas con nota). Copia en el
   dispositivo para pintar al momento. */
const DI = (function(){
  const CACHE = 'pj_datos_v1:';
  const DOMINADA = 3, RONDA = 10, PRUEBA = 10;
  const PLANTILLAS = {
    onu: { titulo: 'MMPP · Nº ONU', nombre_a: 'Nº ONU', nombre_b: 'Materia', escribir_a: true, escribir_b: false, sentido: 'ambos',
      sub: 'Número ONU ↔ materia. El número lo escribes; la materia la eliges entre 4.', ejemplo: ['1203', 'Gasolina'] },
    nip: { titulo: 'NIP · Nº de peligro', nombre_a: 'Nº de peligro', nombre_b: 'Significado', escribir_a: true, escribir_b: false, sentido: 'ambos',
      sub: 'Código de peligro ↔ qué significa. El código lo escribes (33, X423…); el significado lo eliges entre 4.', ejemplo: ['33', 'Materia líquida muy inflamable'] },
    libre: { titulo: '', nombre_a: 'Dato', nombre_b: 'Qué es', escribir_a: false, escribir_b: false, sentido: 'ambos',
      sub: 'Cualquier otra cosa: teléfonos, cifras, siglas… Eliges entre 4 (o escribes, si lo cambias).', ejemplo: ['112', 'Teléfono único de emergencias'] }
  };
  // Chuletas que salen dentro de cada plantilla
  const AYUDA = {
    nip: '<b>Cómo se lee un NIP</b> (número de identificación de peligro, arriba en el panel naranja):<ul>' +
      '<li><b>2</b> emanación de gases (por presión o reacción química)</li><li><b>3</b> inflamabilidad de líquidos (vapores) y gases</li>' +
      '<li><b>4</b> inflamabilidad de sólidos</li><li><b>5</b> comburente (favorece el incendio)</li><li><b>6</b> toxicidad o peligro de infección</li>' +
      '<li><b>7</b> radiactividad</li><li><b>8</b> corrosividad</li><li><b>9</b> peligro de reacción violenta espontánea</li></ul>' +
      'Cifra repetida: el peligro es más intenso (33, 66, 88). Si basta una cifra, se completa con 0 (30, 60, 80). <b>X</b> delante: reacciona peligrosamente con el agua.',
    onu: '<b>Panel naranja</b>: arriba va el NIP (número de peligro) y abajo el <b>número ONU</b>, de 4 cifras, que identifica la materia.'
  };
  const svg = d => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + '</svg>';
  const ICO = {
    onu: svg('<rect x="3" y="6" width="18" height="12" rx="1.5"/><path d="M3 12h18"/>'),
    nip: svg('<path d="M12 3 2 20h20Z"/><path d="M12 10v4"/><path d="M12 17h.01"/>'),
    libre: svg('<path d="M4 4h16v16H4z"/><path d="M8 9h8"/><path d="M8 13h8"/><path d="M8 17h5"/>'),
    mas: svg('<path d="M12 5v14"/><path d="M5 12h14"/>'),
    ajustes: svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>'),
    borrar: svg('<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/>'),
    fichas: svg('<rect x="2" y="6" width="16" height="12" rx="2"/><path d="M6 6V4h16v12h-4"/>'),
    aprender: svg('<path d="M2 10 12 5l10 5-10 5Z"/><path d="M6 12v5c3 2 9 2 12 0v-5"/>'),
    probar: svg('<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="m9 14 2 2 4-4"/>')
  };

  let aps = [], datos = [], cargado = false, cargando = null, dueño = null;
  let vista = { v: 'lista' };     // lista | apartado | estudio
  let st = null;                  // estado del modo de estudio
  const root = () => document.getElementById('datosRoot');
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const arriba = () => { const a = document.getElementById('app'); (a || window).scrollTo(0, 0); };
  const ap = id => aps.find(x => x.id === id);
  const deAp = id => datos.filter(d => d.apartado_id === id);
  const dominada = d => d.racha >= DOMINADA;
  const mezclar = a => { a = a.slice(); for(let i = a.length - 1; i > 0; i--){ const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

  /* ---------- datos ---------- */
  function leerCache(){ try{ const c = JSON.parse(localStorage.getItem(CACHE + currentUser.id) || 'null'); if(c){ aps = c.aps || []; datos = c.datos || []; } }catch(e){} }
  function guardarCache(){ try{ localStorage.setItem(CACHE + currentUser.id, JSON.stringify({ aps, datos })); }catch(e){} }
  function cargar(){
    if(!currentUser) return Promise.resolve();
    if(dueño !== currentUser.id){ dueño = currentUser.id; aps = []; datos = []; cargado = false; leerCache(); }
    if(!cargando) cargando = Promise.all([
      sb.from('di_apartados').select('*').order('orden').order('created_at'),
      sb.from('di_datos').select('*').order('orden').order('created_at')
    ]).then(([r1, r2]) => {
      if(r1.error) throw r1.error; if(r2.error) throw r2.error;
      aps = r1.data || []; datos = r2.data || []; cargado = true; guardarCache();
    }).catch(e => { if(!aps.length) uiToast('No se pudieron cargar tus datos: ' + e.message, 'error'); })
      .finally(() => { cargando = null; if(!st) pintar(); });
    return cargando;
  }

  /* ---------- comparar respuestas escritas ---------- */
  const normal = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/^(UN|ONU)\s*(?=\d)/, '').replace(/[\s.\-–·,]/g, '');
  const igual = (dada, buena) => normal(dada) !== '' && normal(dada) === normal(buena);
  // ¿Se escribe con números? (para el teclado del móvil)
  const soloNumeros = (apa, cara) => deAp(apa.id).every(d => /^\d+$/.test(String(cara === 'a' ? d.a : d.b).trim()));

  /* ---------- preguntas ---------- */
  // Una pregunta de un dato: qué cara se ve, cuál se responde y cómo (escribir / elegir / decir si lo sabías)
  function pregunta(d){
    const apa = ap(d.apartado_id);
    const ve = apa.sentido === 'ab' ? 'a' : apa.sentido === 'ba' ? 'b' : (Math.random() < .5 ? 'a' : 'b');
    const resp = ve === 'a' ? 'b' : 'a';
    const escribe = resp === 'a' ? apa.escribir_a : apa.escribir_b;
    const otros = [...new Set(deAp(apa.id).filter(x => x.id !== d.id).map(x => x[resp]).filter(v => normal(v) !== normal(d[resp])))];
    let tipo = escribe ? 'escribir' : otros.length >= 1 ? 'elegir' : 'saber';
    const opciones = tipo === 'elegir' ? mezclar([d[resp]].concat(mezclar(otros).slice(0, 3))) : null;
    return { d, apa, ve, resp, tipo, opciones, numerico: tipo === 'escribir' && soloNumeros(apa, resp) };
  }
  async function apuntar(d, bien){
    d.aciertos += bien ? 1 : 0; d.fallos += bien ? 0 : 1; d.racha = bien ? d.racha + 1 : 0; d.ultima = new Date().toISOString();
    guardarCache();
    const { error } = await sb.from('di_datos').update({ aciertos: d.aciertos, fallos: d.fallos, racha: d.racha, ultima: d.ultima }).eq('id', d.id);
    if(error) console.warn('di apuntar', error);
  }

  /* ---------- pintar ---------- */
  function cabecera(titulo, sub, volver){
    return '<span class="back-link" role="button" tabindex="0" data-di="' + volver[0] + '">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="11,6 5,12 11,18"/></svg>' +
      esc(volver[1]) + '</span><h1>' + esc(titulo) + '</h1>' + (sub ? '<p class="di-sub">' + sub + '</p>' : '');
  }
  function lista(){
    const tarjetas = aps.map(a => {
      const ds = deAp(a.id), dom = ds.filter(dominada).length, pct = ds.length ? Math.round(dom * 100 / ds.length) : 0;
      return '<button type="button" class="di-ap di-' + a.plantilla + '" data-di="abrir" data-id="' + a.id + '">' +
        '<span class="di-ap-ico">' + ICO[a.plantilla] + '</span>' +
        '<span class="di-ap-txt"><b>' + esc(a.titulo) + '</b><span>' + ds.length + (ds.length === 1 ? ' dato' : ' datos') + (ds.length ? ' · ' + pct + ' % dominado' : '') + '</span>' +
        (ds.length ? '<span class="di-barra"><i style="width:' + pct + '%"></i></span>' : '') + '</span></button>';
    }).join('');
    return cabecera('Datos importantes', 'Tus apartados para memorizar datos: números ONU, NIP, teléfonos, cifras… Cada uno pregunta de la forma que mejor le va.', ['estudio', 'Estudio']) +
      (!cargado && !aps.length ? '<div class="di-vacio">Cargando…</div>' : '') +
      '<div class="di-aps">' + tarjetas +
        '<button type="button" class="di-ap di-nuevo" data-di="nuevo"><span class="di-ap-ico">' + ICO.mas + '</span><span class="di-ap-txt"><b>Nuevo apartado</b><span>MMPP (Nº ONU), NIP u otro</span></span></button>' +
      '</div>';
  }
  function vistaApartado(a){
    const ds = deAp(a.id), dom = ds.filter(dominada).length;
    const filas = ds.map(d => '<div class="di-fila' + (dominada(d) ? ' dom' : '') + '"><span class="di-a">' + esc(d.a) + '</span><span class="di-b">' + esc(d.b) + '</span>' +
      '<button type="button" class="di-ico-btn" data-di="editar" data-id="' + d.id + '" aria-label="Editar">✎</button>' +
      '<button type="button" class="di-ico-btn" data-di="quitar" data-id="' + d.id + '" aria-label="Borrar">' + ICO.borrar + '</button></div>').join('');
    const pocos = ds.length < 2;
    const modo = (k, nombre, sub) => '<button type="button" class="di-modo" data-di="modo" data-m="' + k + '"' + (pocos ? ' disabled' : '') + '><span class="di-modo-ico">' + ICO[k] + '</span><b>' + nombre + '</b><span>' + sub + '</span></button>';
    const como = c => (c === 'a' ? a.escribir_a : a.escribir_b) ? 'escribiendo' : 'eligiendo entre 4';
    return cabecera(a.titulo, ds.length + (ds.length === 1 ? ' dato' : ' datos') + (ds.length ? ' · ' + dom + ' dominados' : '') +
        ' · <button type="button" class="di-link" data-di="ajustes">' + ICO.ajustes + ' Ajustes</button>', ['lista', 'Datos importantes']) +
      '<div class="di-modos">' + modo('fichas', 'Fichas', 'Girar y repasar') + modo('aprender', 'Aprender', 'Hasta que salgan todas') + modo('probar', 'Probar', PRUEBA + ' preguntas con nota') + '</div>' +
      (pocos ? '<div class="di-vacio">Añade al menos 2 datos para estudiar.</div>' : '') +
      '<div class="di-como">Pregunta ' + ({ ab: esc(a.nombre_a) + ' → ' + esc(a.nombre_b), ba: esc(a.nombre_b) + ' → ' + esc(a.nombre_a), ambos: 'en los dos sentidos' }[a.sentido]) +
        '; ' + esc(a.nombre_a) + ' se responde ' + como('a') + ' y ' + esc(a.nombre_b) + ', ' + como('b') + '.</div>' +
      (AYUDA[a.plantilla] ? '<details class="di-ayuda"><summary>Chuleta</summary><div>' + AYUDA[a.plantilla] + '</div></details>' : '') +
      '<form class="di-add" data-di-form="add"><input name="a" placeholder="' + esc(a.nombre_a) + '" autocomplete="off" required maxlength="200"' + (a.plantilla !== 'libre' ? ' inputmode="' + (a.plantilla === 'onu' ? 'numeric' : 'text') + '"' : '') + '>' +
        '<input name="b" placeholder="' + esc(a.nombre_b) + '" autocomplete="off" required maxlength="1000"><button type="submit" class="di-btn">Añadir</button></form>' +
      '<button type="button" class="di-link di-pegar" data-di="pegar">Pegar una lista entera</button>' +
      '<div class="di-lista">' + (filas || '<div class="di-vacio">Aún no hay datos. Ejemplo: «' + esc(PLANTILLAS[a.plantilla].ejemplo[0]) + '» → «' + esc(PLANTILLAS[a.plantilla].ejemplo[1]) + '».</div>') + '</div>';
  }
  function pintar(){
    const r = root();
    if(!r || !document.getElementById('screen-datos').classList.contains('active')) return;
    if(st){ r.innerHTML = vistaEstudio(); enfocar(); return; }
    const a = vista.v === 'apartado' && ap(vista.id);
    r.innerHTML = a ? vistaApartado(a) : lista();
  }
  function enfocar(){ const i = root() && root().querySelector('.di-resp-input'); if(i && matchMedia('(hover: hover)').matches) i.focus(); }

  /* ---------- estudio ---------- */
  function empezar(modo){
    const a = ap(vista.id), ds = deAp(a.id);
    if(modo === 'fichas') st = { modo, a, cartas: ds.slice(), i: 0, girada: false, cara: a.sentido === 'ba' ? 'b' : 'a' };
    else if(modo === 'aprender'){
      // Primero las no dominadas, las más falladas antes; tandas de 10
      const orden = ds.slice().sort((x, y) => (dominada(x) - dominada(y)) || (y.fallos - y.aciertos) - (x.fallos - x.aciertos) || Math.random() - .5);
      const tanda = orden.slice(0, RONDA);
      st = { modo, a, cola: mezclar(tanda), total: tanda.length, bien: new Set(), q: null, res: null };
      siguiente();
    } else {
      const tanda = mezclar(ds).slice(0, PRUEBA);
      st = { modo, a, cola: tanda, total: tanda.length, hechas: [], q: null, res: null };
      siguiente();
    }
    pintar(); arriba();
  }
  function siguiente(){ st.res = null; st.q = st.cola.length ? pregunta(st.cola[0]) : null; }
  function responder(dada){
    if(!st || !st.q || st.res) return;
    const q = st.q, buena = q.d[q.resp];
    const bien = q.tipo === 'saber' ? dada === true : igual(dada, buena);
    st.res = { bien, dada: q.tipo === 'saber' ? null : dada };
    apuntar(q.d, bien);
    if(st.modo === 'probar') st.hechas.push({ q, bien, dada: st.res.dada });
    pintar();
  }
  function seguir(){
    if(!st || !st.res) return;
    const d = st.cola.shift();
    if(st.modo === 'aprender'){ if(st.res.bien) st.bien.add(d.id); else st.cola.splice(Math.min(st.cola.length, 3), 0, d); }   // la fallada vuelve un poco después
    siguiente(); pintar();
  }
  function vistaEstudio(){
    const a = st.a, titulo = { fichas: 'Fichas', aprender: 'Aprender', probar: 'Probar' }[st.modo];
    const cab = '<div class="di-est-cab"><button type="button" class="di-link" data-di="salir">✕ Salir</button><b>' + titulo + ' · ' + esc(a.titulo) + '</b></div>';
    if(st.modo === 'fichas'){
      const d = st.cartas[st.i], cara = st.girada ? (st.cara === 'a' ? 'b' : 'a') : st.cara;
      const nombre = cara === 'a' ? a.nombre_a : a.nombre_b;
      return cab + '<div class="di-paso">' + (st.i + 1) + ' de ' + st.cartas.length + '</div>' +
        '<button type="button" class="di-ficha' + (st.girada ? ' girada' : '') + (cara === 'a' ? ' cara-a' : '') + '" data-di="girar"><small>' + esc(nombre) + '</small><span>' + esc(d[cara]) + '</span><em>Toca para girar</em></button>' +
        '<div class="di-ficha-nav"><button type="button" class="di-btn sec" data-di="ant"' + (st.i ? '' : ' disabled') + '>‹ Anterior</button>' +
          '<button type="button" class="di-btn sec" data-di="barajar">Barajar</button><button type="button" class="di-btn sec" data-di="cara">Empezar por ' + esc(st.cara === 'a' ? a.nombre_b : a.nombre_a) + '</button>' +
          '<button type="button" class="di-btn" data-di="sig"' + (st.i + 1 < st.cartas.length ? '' : ' disabled') + '>Siguiente ›</button></div>';
    }
    // Final
    if(!st.q){
      if(st.modo === 'aprender') return cab + '<div class="di-fin"><div class="di-fin-n">✓</div><b>¡Tanda hecha!</b><span>' + st.total + ' datos respondidos bien.</span>' +
        '<div class="di-fin-btns"><button type="button" class="di-btn" data-di="modo" data-m="aprender">Otra tanda</button><button type="button" class="di-btn sec" data-di="salir">Volver</button></div></div>';
      const bien = st.hechas.filter(h => h.bien).length, nota = st.total ? Math.round(bien * 100 / st.total) / 10 : 0;
      const mal = st.hechas.filter(h => !h.bien).map(h => '<div class="di-fila"><span class="di-a">' + esc(h.q.d.a) + '</span><span class="di-b">' + esc(h.q.d.b) + '</span></div>').join('');
      return cab + '<div class="di-fin"><div class="di-fin-n' + (nota >= 5 ? ' ok' : '') + '">' + String(nota).replace('.', ',') + '</div><b>' + bien + ' de ' + st.total + ' bien</b>' +
        (mal ? '<span>Para repasar:</span><div class="di-lista">' + mal + '</div>' : '<span>¡Todas bien!</span>') +
        '<div class="di-fin-btns"><button type="button" class="di-btn" data-di="modo" data-m="probar">Otra prueba</button><button type="button" class="di-btn sec" data-di="salir">Volver</button></div></div>';
    }
    const q = st.q, preg = q.ve === 'a' ? a.nombre_a : a.nombre_b, resp = q.resp === 'a' ? a.nombre_a : a.nombre_b;
    const prog = st.modo === 'aprender' ? st.bien.size + ' de ' + st.total + ' bien' : (st.hechas.length + (st.res ? 0 : 1)) + ' de ' + st.total;
    const pct = st.modo === 'aprender' ? st.bien.size * 100 / st.total : st.hechas.length * 100 / st.total;
    let cuerpo = '';
    const r = st.res, buena = q.d[q.resp];
    if(q.tipo === 'elegir') cuerpo = '<div class="di-ops">' + q.opciones.map(o => {
      let c = 'di-op';
      if(r){ if(normal(o) === normal(buena)) c += ' bien'; else if(r.dada === o) c += ' mal'; }
      return '<button type="button" class="' + c + '" data-di="op" data-v="' + esc(o) + '"' + (r ? ' disabled' : '') + '>' + esc(o) + '</button>';
    }).join('') + '</div>';
    else if(q.tipo === 'escribir') cuerpo = '<form class="di-escribe" data-di-form="resp"><input class="di-resp-input' + (r ? (r.bien ? ' bien' : ' mal') : '') + '" name="r" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="Escribe ' + esc(resp.toLowerCase()) + '"' +
        (q.numerico ? ' inputmode="numeric" pattern="[0-9]*"' : '') + (r ? ' disabled value="' + esc(r.dada) + '"' : '') + '>' + (r ? '' : '<button type="submit" class="di-btn">Comprobar</button>') + '</form>' +
        (r ? '' : '<button type="button" class="di-link" data-di="nolose">No lo sé</button>');
    else cuerpo = r ? '' : '<div class="di-ops"><button type="button" class="di-op" data-di="saber" data-v="1">Lo sabía</button><button type="button" class="di-op" data-di="saber" data-v="0">No lo sabía</button></div>';
    const veredicto = r ? '<div class="di-ver ' + (r.bien ? 'bien' : 'mal') + '"><b>' + (r.bien ? '¡Bien!' : 'Era: ' + esc(buena)) + '</b>' +
      (st.modo === 'aprender' && !r.bien ? '<span>Te la vuelvo a preguntar en un momento.</span>' : '') + '<button type="button" class="di-btn" data-di="seguir">Continuar</button></div>' : '';
    return cab + '<div class="di-paso">' + prog + '</div><div class="di-barra grande"><i style="width:' + pct + '%"></i></div>' +
      '<div class="di-preg"><small>' + esc(preg) + '</small><div class="di-preg-txt">' + esc(q.d[q.ve]) + '</div><span class="di-preg-pide">¿' + esc(resp) + '?</span></div>' +
      cuerpo + veredicto;
  }

  /* ---------- crear, editar, borrar ---------- */
  function hoja(titulo, cuerpo, alGuardar){
    const bg = document.createElement('div');
    bg.className = 'di-hoja-bg';
    bg.innerHTML = '<form class="di-hoja" role="dialog" aria-label="' + esc(titulo) + '"><div class="di-hoja-t">' + esc(titulo) + '</div>' + cuerpo + '</form>';
    document.body.appendChild(bg);
    const cerrar = () => bg.remove();
    bg.addEventListener('click', e => { if(e.target === bg || e.target.closest('[data-cerrar]')) cerrar(); });
    bg.querySelector('form').addEventListener('submit', async e => {
      e.preventDefault();
      const b = e.submitter; if(b) b.disabled = true;
      const ok = await alGuardar(new FormData(e.target), bg);
      if(ok !== false) cerrar(); else if(b) b.disabled = false;
    });
    const f = bg.querySelector('input, textarea'); if(f) setTimeout(() => f.focus(), 50);
    return bg;
  }
  function nuevo(){
    const op = k => '<label class="di-plant"><input type="radio" name="p" value="' + k + '"' + (k === 'onu' ? ' checked' : '') + '><span class="di-ap-ico">' + ICO[k] + '</span><span><b>' +
      ({ onu: 'MMPP · Nº ONU', nip: 'NIP · Nº de peligro', libre: 'Otro' }[k]) + '</b><small>' + PLANTILLAS[k].sub + '</small></span></label>';
    const bg = hoja('Nuevo apartado', op('onu') + op('nip') + op('libre') +
      '<label class="di-campo">Nombre<input name="t" maxlength="80" value="' + esc(PLANTILLAS.onu.titulo) + '" required></label>' +
      '<div class="di-hoja-btns"><button type="button" class="di-btn sec" data-cerrar>Cancelar</button><button type="submit" class="di-btn">Crear</button></div>',
      async fd => {
        const p = PLANTILLAS[fd.get('p')] || PLANTILLAS.libre;
        const fila = { titulo: String(fd.get('t') || '').trim() || 'Datos', plantilla: fd.get('p'), nombre_a: p.nombre_a, nombre_b: p.nombre_b, escribir_a: p.escribir_a, escribir_b: p.escribir_b, sentido: p.sentido, orden: aps.length };
        const { data, error } = await sb.from('di_apartados').insert(fila).select('*').single();
        if(error){ uiToast('No se pudo crear: ' + error.message, 'error'); return false; }
        aps.push(data); guardarCache(); vista = { v: 'apartado', id: data.id }; pintar(); arriba();
      });
    // Al cambiar de plantilla, el nombre propuesto
    bg.querySelectorAll('input[name=p]').forEach(r => r.addEventListener('change', () => {
      const t = bg.querySelector('input[name=t]');
      if(!t.dataset.tocado) t.value = PLANTILLAS[r.value].titulo;
    }));
    bg.querySelector('input[name=t]').addEventListener('input', e => { e.target.dataset.tocado = '1'; });
  }
  function ajustes(){
    const a = ap(vista.id);
    const radio = (n, v, t, on) => '<label class="di-opt"><input type="radio" name="' + n + '" value="' + v + '"' + (on ? ' checked' : '') + '>' + t + '</label>';
    hoja('Ajustes del apartado',
      '<label class="di-campo">Nombre<input name="t" maxlength="80" value="' + esc(a.titulo) + '" required></label>' +
      '<div class="di-dos"><label class="di-campo">Cara A<input name="na" maxlength="40" value="' + esc(a.nombre_a) + '" required></label><label class="di-campo">Cara B<input name="nb" maxlength="40" value="' + esc(a.nombre_b) + '" required></label></div>' +
      '<div class="di-campo">Qué se pregunta' + radio('s', 'ambos', 'Los dos sentidos', a.sentido === 'ambos') + radio('s', 'ab', 'Ves A, respondes B', a.sentido === 'ab') + radio('s', 'ba', 'Ves B, respondes A', a.sentido === 'ba') + '</div>' +
      '<div class="di-campo">Cuando hay que responder la cara A' + radio('ea', '1', 'Escribiéndola', a.escribir_a) + radio('ea', '0', 'Eligiendo entre 4', !a.escribir_a) + '</div>' +
      '<div class="di-campo">Cuando hay que responder la cara B' + radio('eb', '1', 'Escribiéndola', a.escribir_b) + radio('eb', '0', 'Eligiendo entre 4', !a.escribir_b) + '</div>' +
      '<div class="di-hoja-btns"><button type="button" class="di-btn peligro" data-di-borrar-ap>Borrar apartado</button><span></span><button type="button" class="di-btn sec" data-cerrar>Cancelar</button><button type="submit" class="di-btn">Guardar</button></div>',
      async fd => {
        const cambio = { titulo: String(fd.get('t')).trim(), nombre_a: String(fd.get('na')).trim(), nombre_b: String(fd.get('nb')).trim(), sentido: fd.get('s'), escribir_a: fd.get('ea') === '1', escribir_b: fd.get('eb') === '1' };
        const { error } = await sb.from('di_apartados').update(cambio).eq('id', a.id);
        if(error){ uiToast('No se pudo guardar: ' + error.message, 'error'); return false; }
        Object.assign(a, cambio); guardarCache(); pintar();
      }).querySelector('[data-di-borrar-ap]').addEventListener('click', async e => {
        const ok = await uiConfirm('¿Borrar «' + a.titulo + '»?\n\nSe borran también sus ' + deAp(a.id).length + ' datos.', { ok: 'Borrar', danger: true });
        if(!ok) return;
        const { error } = await sb.from('di_apartados').delete().eq('id', a.id);
        if(error){ uiToast('No se pudo borrar: ' + error.message, 'error'); return; }
        e.target.closest('.di-hoja-bg').remove();
        aps = aps.filter(x => x.id !== a.id); datos = datos.filter(x => x.apartado_id !== a.id); guardarCache();
        vista = { v: 'lista' }; pintar();
      });
  }
  async function añadir(a, b){
    const apa = ap(vista.id);
    const { data, error } = await sb.from('di_datos').insert({ apartado_id: apa.id, a, b, orden: deAp(apa.id).length }).select('*').single();
    if(error){ uiToast('No se pudo añadir: ' + error.message, 'error'); return false; }
    datos.push(data); guardarCache(); return true;
  }
  // Una línea de una lista pegada: «1203; Gasolina», «1203 - Gasolina», «1203<tab>Gasolina» o «1203 Gasolina»
  function partir(l){
    l = l.trim(); if(!l) return null;
    for(const sep of ['\t', ';', ' – ', ' — ', ' - ', ': ', ' = ']){
      const i = l.indexOf(sep);
      if(i > 0) return [l.slice(0, i).trim(), l.slice(i + sep.length).trim()];
    }
    const m = l.match(/^(X?\d+[A-Z]?)\s+(.+)$/i);
    return m ? [m[1], m[2].trim()] : null;
  }
  function pegar(){
    const apa = ap(vista.id);
    hoja('Pegar una lista',
      '<p class="di-hoja-txt">Una línea por dato: <b>' + esc(apa.nombre_a) + '</b> y luego <b>' + esc(apa.nombre_b) + '</b>, separados por punto y coma, guion, tabulador o un espacio (si lo primero es un número). Por ejemplo:<br><code>' +
        esc(PLANTILLAS[apa.plantilla].ejemplo.join(' ; ')) + '</code></p><textarea name="l" rows="9" required></textarea>' +
      '<div class="di-hoja-btns"><button type="button" class="di-btn sec" data-cerrar>Cancelar</button><button type="submit" class="di-btn">Añadir</button></div>',
      async fd => {
        const lineas = String(fd.get('l')).split(/\r?\n/).map(partir);
        const buenas = lineas.filter(x => x && x[0] && x[1]), malas = String(fd.get('l')).split(/\r?\n/).filter(l => l.trim()).length - buenas.length;
        if(!buenas.length){ uiToast('No he entendido ninguna línea. Sepáralas con «;»', 'error'); return false; }
        const base = deAp(apa.id).length;
        const { data, error } = await sb.from('di_datos').insert(buenas.map(([a, b], i) => ({ apartado_id: apa.id, a: a.slice(0, 200), b: b.slice(0, 1000), orden: base + i }))).select('*');
        if(error){ uiToast('No se pudo añadir: ' + error.message, 'error'); return false; }
        datos.push(...(data || [])); guardarCache(); pintar();
        uiToast((buenas.length === 1 ? 'Añadido 1 dato' : 'Añadidos ' + buenas.length + ' datos') + (malas ? ' (' + (malas === 1 ? '1 línea no se entendió' : malas + ' líneas no se entendieron') + ')' : ''), malas ? 'info' : 'success');
      });
  }
  function editar(id){
    const d = datos.find(x => x.id === id), apa = ap(d.apartado_id);
    hoja('Editar dato',
      '<label class="di-campo">' + esc(apa.nombre_a) + '<input name="a" maxlength="200" value="' + esc(d.a) + '" required></label>' +
      '<label class="di-campo">' + esc(apa.nombre_b) + '<textarea name="b" rows="3" maxlength="1000" required>' + esc(d.b) + '</textarea></label>' +
      '<div class="di-hoja-btns"><button type="button" class="di-btn sec" data-cerrar>Cancelar</button><button type="submit" class="di-btn">Guardar</button></div>',
      async fd => {
        const cambio = { a: String(fd.get('a')).trim(), b: String(fd.get('b')).trim() };
        const { error } = await sb.from('di_datos').update(cambio).eq('id', id);
        if(error){ uiToast('No se pudo guardar: ' + error.message, 'error'); return false; }
        Object.assign(d, cambio); guardarCache(); pintar();
      });
  }
  async function quitar(id){
    const d = datos.find(x => x.id === id);
    const ok = await uiConfirm('¿Borrar «' + d.a + '»?', { ok: 'Borrar', danger: true });
    if(!ok) return;
    const { error } = await sb.from('di_datos').delete().eq('id', id);
    if(error){ uiToast('No se pudo borrar: ' + error.message, 'error'); return; }
    datos = datos.filter(x => x.id !== id); guardarCache(); pintar();
  }

  /* ---------- eventos ---------- */
  function onClick(e){
    const el = e.target.closest('[data-di]');
    if(!el || el.disabled) return;
    switch(el.dataset.di){
      case 'estudio': showScreen('screen-estudio'); break;
      case 'lista': vista = { v: 'lista' }; pintar(); arriba(); break;
      case 'abrir': vista = { v: 'apartado', id: el.dataset.id }; pintar(); arriba(); break;
      case 'nuevo': nuevo(); break;
      case 'ajustes': ajustes(); break;
      case 'pegar': pegar(); break;
      case 'editar': editar(el.dataset.id); break;
      case 'quitar': quitar(el.dataset.id); break;
      case 'modo': empezar(el.dataset.m); break;
      case 'salir': st = null; pintar(); arriba(); break;
      case 'op': responder(el.dataset.v); break;
      case 'saber': responder(el.dataset.v === '1'); break;
      case 'nolose': responder(''); break;
      case 'seguir': seguir(); break;
      case 'girar': st.girada = !st.girada; pintar(); break;
      case 'sig': if(st.i + 1 < st.cartas.length){ st.i++; st.girada = false; pintar(); } break;
      case 'ant': if(st.i){ st.i--; st.girada = false; pintar(); } break;
      case 'barajar': st.cartas = mezclar(st.cartas); st.i = 0; st.girada = false; pintar(); break;
      case 'cara': st.cara = st.cara === 'a' ? 'b' : 'a'; st.girada = false; pintar(); break;
    }
  }
  async function onSubmit(e){
    const f = e.target.closest('[data-di-form]');
    if(!f) return;
    e.preventDefault();
    if(f.dataset.diForm === 'resp'){ responder(f.r.value); return; }
    if(f.dataset.diForm === 'add'){
      const a = f.a.value.trim(), b = f.b.value.trim();
      if(!a || !b) return;
      f.querySelector('button').disabled = true;
      const ok = await añadir(a, b);
      f.querySelector('button').disabled = false;
      if(ok){ pintar(); const nf = root().querySelector('[data-di-form="add"] input[name=a]'); if(nf) nf.focus(); }
    }
  }
  // Teclado: Intro para continuar; 1-4 para elegir; espacio para girar la ficha
  function onKey(e){
    if(!st || !document.getElementById('screen-datos').classList.contains('active') || document.querySelector('.di-hoja-bg')) return;
    if(e.target.matches && e.target.matches('input, textarea') && !st.res) return;
    if(st.modo === 'fichas'){
      if(e.key === ' ' || e.key === 'Enter'){ e.preventDefault(); st.girada = !st.girada; pintar(); }
      else if(e.key === 'ArrowRight'){ onClick({ target: root().querySelector('[data-di="sig"]') }); }
      else if(e.key === 'ArrowLeft'){ onClick({ target: root().querySelector('[data-di="ant"]') }); }
      return;
    }
    if(st.res && e.key === 'Enter'){ e.preventDefault(); seguir(); return; }
    if(!st.res && st.q && st.q.tipo === 'elegir' && /^[1-4]$/.test(e.key)){ const o = st.q.opciones[Number(e.key) - 1]; if(o != null) responder(o); }
  }

  function abrir(){
    const r = root();
    if(r && !r.dataset.listo){
      r.dataset.listo = '1';
      r.addEventListener('click', onClick);
      r.addEventListener('submit', onSubmit);
      r.addEventListener('keydown', e => { if(e.key === 'Enter' && e.target.classList.contains('back-link')) onClick(e); });
      document.addEventListener('keydown', onKey);
    }
    if(currentUser && dueño !== currentUser.id){ dueño = currentUser.id; aps = []; datos = []; cargado = false; leerCache(); }
    if(vista.v === 'apartado' && !ap(vista.id)) vista = { v: 'lista' };
    pintar();
    cargar();
  }
  return { abrir };
})();
