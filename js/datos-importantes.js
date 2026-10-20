/* Datos importantes (Estudio): apartados de fichas que cada usuario se crea
   para memorizar datos (números ONU de mercancías peligrosas, NIP, teléfonos,
   cifras…). Tablas di_apartados y di_datos (privadas, cada uno lo suyo).
   Cada apartado pregunta a su manera (según su plantilla, y se puede cambiar):
     · Nº ONU ↔ materia: el número se escribe (teclado numérico); la materia se elige entre 4.
     · NIP ↔ significado: el código se escribe (33, X423…); el significado se elige entre 4.
     · Libre: dato ↔ qué es, eligiendo entre 4 (o escribiendo, si se marca).
   En un NIP cada cifra sale con su color e icono, el código se puede ver cifra a cifra (tocándolo en la
   lista, al girar la ficha o tras responder) y los códigos con significado propio llevan ⚠️. En las
   preguntas el NIP y el nº ONU salen en el panel naranja, como en el camión.
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
  /* ---------- NIP (código Kemler) ----------
     Cada cifra significa siempre lo mismo: se pinta con su color (el de la etiqueta ADR de su clase) y un
     icono que ayuda a recordarla, y cada código se puede «descifrar» cifra a cifra. Los códigos con
     significado propio (no salen de la regla) se marcan con ⚠️. */
  const CIFRAS = {
    X: { nombre: 'No echar agua', luego: '¡No echar agua! Reacciona peligrosamente con ella' },
    '2': { nombre: 'Gas', luego: 'desprende gases', muy: '' },
    '3': { nombre: 'Líquido inflamable', luego: 'inflamable', muy: 'muy inflamable' },
    '4': { nombre: 'Sólido inflamable', luego: 'sólido inflamable', muy: '' },
    '5': { nombre: 'Comburente (aviva el fuego)', luego: 'comburente', muy: 'muy comburente' },
    '6': { nombre: 'Tóxico', luego: 'tóxico', muy: 'muy tóxico' },
    '7': { nombre: 'Radiactivo', luego: 'radiactivo', muy: 'muy radiactivo' },
    '8': { nombre: 'Corrosivo', luego: 'corrosivo', muy: 'muy corrosivo' },
    '9': { nombre: 'Reacción violenta espontánea', luego: 'puede reaccionar violentamente', muy: '' },
    '0': { nombre: 'Nada más', luego: 'sin más peligros (el 0 solo rellena)' }
  };
  const ESPECIALES = {
    '22': 'Gas licuado refrigerado, asfixiante.',
    '323': 'Líquido inflamable que reacciona con el agua desprendiendo gases inflamables.',
    '333': 'Líquido pirofórico: arde solo al contacto con el aire.',
    '362': 'Líquido inflamable y tóxico que reacciona con el agua desprendiendo gases inflamables.',
    '382': 'Líquido inflamable y corrosivo que reacciona con el agua desprendiendo gases inflamables.',
    '423': 'Sólido que reacciona con el agua desprendiendo gases inflamables.',
    '43': 'Sólido que arde solo (pirofórico).',
    '44': 'Sólido inflamable que va fundido, a temperatura elevada.',
    '446': 'Sólido inflamable y tóxico que va fundido, a temperatura elevada.',
    '462': 'Sólido que reacciona con el agua desprendiendo gases tóxicos.',
    '482': 'Sólido que reacciona con el agua desprendiendo gases corrosivos.',
    '539': 'Peróxido orgánico inflamable.',
    '90': 'Peligroso para el medio ambiente, o peligros diversos.',
    '99': 'Materia peligrosa diversa que va en caliente (temperatura elevada).'
  };
  const codigo = v => String(v == null ? '' : v).trim().replace(/\s/g, '').toUpperCase();
  const esKemler = v => /^X?[2-9]\d{1,2}$/.test(codigo(v));
  const especial = v => ESPECIALES[codigo(v).replace(/^X/, '')] || null;
  // Iconos de las cifras (hechos con Higgsfield): una sola imagen de 3×3 (2-9 y X); cada cifra se recorta con CSS
  const ICONOS_NIP = 'datos/nip-iconos.webp?v=af95e83d43';
  const chip = (c, grande) => '<span class="di-chip c' + c + (grande ? ' g' : '') + '" title="' + CIFRAS[c].nombre + '"><span class="di-chip-i"></span><span class="di-chip-n">' + c + '</span></span>';
  const chips = v => '<span class="di-chips">' + [...codigo(v)].map(c => chip(c)).join('') + (especial(v) ? '<span class="di-ojo" title="Código especial: tiene significado propio">⚠️</span>' : '') + '</span>';
  // El código cifra a cifra
  function desglose(v){
    const c = codigo(v), lineas = [];
    let i = 0;
    if(c[0] === 'X'){ lineas.push(['X', '<b>' + CIFRAS.X.luego + '</b>']); i = 1; }
    for(let k = i; k < c.length; k++){
      const n = c[k], f = CIFRAS[n];
      const txt = k === i ? '<b>Peligro principal:</b> ' + f.nombre.toLowerCase()
        : n === '0' ? f.luego
        : n === c[k - 1] ? '<b>Repetida:</b> peligro más intenso' + (f.muy ? ' (' + f.muy + ')' : '')
        : '<b>Además:</b> ' + f.luego;
      lineas.push([n, txt]);
    }
    const esp = especial(v);
    return '<div class="di-dg">' + lineas.map(([n, t]) => '<div class="di-dg-l">' + chip(n, true) + '<span>' + t + '</span></div>').join('') +
      (esp ? '<div class="di-dg-ojo">⚠️ <span><b>Ojo, este código va aparte:</b> ' + esp + '</span></div>' : '') + '</div>';
  }
  // Panel naranja como el del camión: arriba el NIP, abajo el nº ONU
  const panel = (arriba, abajo) => '<span class="di-panel"><span' + (arriba ? '' : ' class="vacio"') + '>' + esc(arriba) + '</span><span' + (abajo ? '' : ' class="vacio"') + '>' + esc(abajo) + '</span></span>';
  const esNipAp = a => a.plantilla === 'nip' || /\bNIP\b|n[uú]mero de peligro|kemler/i.test(a.titulo);
  const esOnuAp = a => a.plantilla === 'onu' || (!esNipAp(a) && /\bONU\b|MMPP/i.test(a.titulo));
  // Qué cara del apartado lleva los códigos ('a', 'b' o null)
  function ladoDe(a, prueba){
    const ds = deAp(a.id), na = ds.filter(d => prueba(d.a)).length, nb = ds.filter(d => prueba(d.b)).length;
    return !na && !nb ? null : na >= nb ? 'a' : 'b';
  }
  // Cómo se pinta cada apartado: cifras de colores (NIP), panel naranja (ONU) o tal cual
  function formas(a){
    const nip = esNipAp(a) ? ladoDe(a, esKemler) : null, onu = esOnuAp(a) ? ladoDe(a, v => /^\d{4}$/.test(codigo(v))) : null;
    return {
      nip, onu,
      // En listas: el código con sus cifras de colores
      celda: (cara, v) => cara === nip && esKemler(v) ? chips(v) : cara === onu && /^\d{4}$/.test(codigo(v)) ? panel('', codigo(v)) : esc(v),
      // En preguntas y fichas: el panel naranja (sin colores, para no dar pistas)
      grande: (cara, v) => cara === nip && esKemler(v) ? panel(codigo(v), '') : cara === onu && /^\d{4}$/.test(codigo(v)) ? panel('', codigo(v)) : esc(v),
      dg: d => nip && esKemler(d[nip]) ? desglose(d[nip]) : ''
    };
  }

  /* ---------- Guía del NIP: un apartado con «Cifra 2… », «Letra X…» y listas «NIP que empiezan por 2» ----------
     Las listas se pintan juntas como un mapa de códigos y alimentan el modo Retos (preguntas cortas y
     variadas que se generan solas: ¿existe?, ¿cuál existe?, toca los que existen, completa la lista,
     ¿qué cifra es?, ¿qué icono es?, constrúyelo). */
  function guia(a){
    if(!esNipAp(a)) return null;
    const listas = {}, cifras = {};
    for(const d of deAp(a.id)){
      const m = String(d.a).match(/empiezan?\s+por\s+(?:el\s+)?([2-9])\b/i);
      if(m){
        const cods = [...new Set(String(d.b).toUpperCase().split(/[\s,;\/.]+/).map(codigo).filter(esKemler))];
        if(cods.length) listas[m[1]] = { d, cods };
        continue;
      }
      const c = String(d.a).match(/^\s*cifra\s+([0-9])\b/i);
      if(c && CIFRAS[c[1]]) cifras[d.id] = c[1];
      else if(/^\s*letra\s+x\b/i.test(d.a)) cifras[d.id] = 'X';
    }
    if(!Object.keys(listas).length) return null;
    return { listas, cifras, todos: new Set(Object.values(listas).flatMap(l => l.cods)) };
  }
  const azar = l => l[Math.floor(Math.random() * l.length)];
  // Un código que no está en las listas, con pinta de NIP (sin 1, que no se usa)
  function falso(g, pri){
    const dig = '0234567899';
    for(let k = 0; k < 300; k++){
      let c = pri || azar(Object.keys(g.listas));
      const largo = Math.random() < .7 ? 2 : 3;
      while(c.length < largo) c += c.length === 2 ? dig[1 + Math.floor(Math.random() * 9)] : azar(dig);
      if(!g.todos.has(c) && !g.todos.has('X' + c)) return c;
    }
    return '21';
  }
  // Un código dicho con palabras, siguiendo la regla: 336 → Líquido inflamable · peligro más intenso · además tóxico
  function describir(c){
    return [...c].map((n, k) => k === 0 ? CIFRAS[n].nombre : n === '0' ? 'sin más peligros' : n === c[k - 1] ? 'peligro más intenso' : 'además ' + CIFRAS[n].luego).join(' · ');
  }
  function retos(g){
    const digs = Object.keys(g.listas), todos = [...g.todos];
    const cortas = digs.filter(d => g.listas[d].cods.length >= 2 && g.listas[d].cods.length <= 8);
    const construibles = todos.filter(c => !c.startsWith('X') && !especial(c));
    const hacer = {
      existe(){ const real = Math.random() < .5, c = real ? azar(todos) : falso(g); return { tipo: 'sino', titulo: '¿Existe?', c, buena: real ? 'si' : 'no', ver: c[0] === 'X' ? c[1] : c[0] }; },
      cual(){
        const c = azar(todos), pri = c[0] === 'X' ? c[1] : c[0], ops = [c];
        while(ops.length < 4){ const f = falso(g, pri); if(!ops.includes(f)) ops.push(f); }
        return { tipo: 'cual', titulo: '¿Cuál existe?', ops: mezclar(ops), buena: c, ver: pri };
      },
      toca(){
        const d = azar(digs), reales = mezclar(g.listas[d].cods.filter(c => c[0] !== 'X')).slice(0, 5), ops = reales.slice();
        while(ops.length < 9){ const f = falso(g, d); if(!ops.includes(f)) ops.push(f); }
        return { tipo: 'toca', titulo: 'Toca los que existen', d, ops: mezclar(ops), reales: new Set(reales), ver: d };
      },
      completa(){
        if(!cortas.length) return hacer.cual();
        const d = azar(cortas), cods = g.listas[d].cods, c = azar(cods);
        return { tipo: 'escribe', titulo: 'Completa la lista', d, lista: cods, c, buena: c, ver: d };
      },
      cifra(){ const n = azar([...'23456789X']); return { tipo: 'cifra', titulo: '¿Qué cifra es?', n, buena: n }; },
      icono(){ const n = azar([...'23456789X']); return { tipo: 'escribe', titulo: '¿Qué cifra es este icono?', icono: n, buena: n }; },
      construye(){
        if(!construibles.length) return hacer.cifra();
        const c = azar(construibles);
        return { tipo: 'escribe', titulo: 'Constrúyelo', texto: describir(c), c, buena: c };
      }
    };
    return mezclar(['existe', 'existe', 'cual', 'cual', 'toca', 'completa', 'cifra', 'icono', 'construye', 'construye']).map(t => hacer[t]());
  }

  // Chuletas que salen dentro de cada plantilla
  const AYUDA = {
    nip: '<b>Cómo se lee un NIP</b> (número de peligro, arriba en el panel naranja):' +
      '<div class="di-leyenda">' + [...'23456789X0'].map(c => '<div class="di-ley">' + chip(c, true) + '<span>' + CIFRAS[c].nombre + '</span></div>').join('') + '</div>' +
      '<ul><li>La <b>1.ª cifra</b> es el peligro principal; las siguientes, peligros añadidos.</li>' +
      '<li><b>Cifra repetida</b>: el peligro es más intenso (33, 66, 88).</li>' +
      '<li>Si basta una cifra, se completa con <b>0</b> (30, 60, 80).</li>' +
      '<li><b>X</b> delante: reacciona peligrosamente con el agua.</li>' +
      '<li>⚠️ <b>Van aparte</b> (significado propio): ' + Object.keys(ESPECIALES).join(', ') + '.</li></ul>' +
      'Toca cualquier código de tu lista para verlo cifra a cifra.',
    onu: '<b>Panel naranja</b>: arriba va el NIP (número de peligro) y abajo el <b>número ONU</b>, de 4 cifras, que identifica la materia.'
  };
  const ayudaDe = a => AYUDA[a.plantilla] || (esNipAp(a) ? AYUDA.nip : esOnuAp(a) ? AYUDA.onu : null);
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
    retos: svg('<path d="M13 2 3 14h9l-1 8 10-12h-9l1-8Z"/>'),
    probar: svg('<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="m9 14 2 2 4-4"/>')
  };

  // Icono de cada apartado según de qué trata (hechos con Higgsfield, planos y en color)
  const ICO_AP = {
    onu: 'datos/di-ap-onu.webp?v=18da92bd63', rango: 'datos/di-ap-rango.webp?v=ccd9cc8b04', adr: 'datos/di-ap-adr.webp?v=c4a2255acd',
    kemler: 'datos/di-ap-kemler.webp?v=7c8272e03e', leer: 'datos/di-ap-leer.webp?v=28696238ad', libre: 'datos/di-ap-libre.webp?v=cc364ca44c'
  };
  function iconoAp(a){
    const t = a.titulo || '';
    const k = /c[oó]mo se lee|\bleer\b|lectura/i.test(t) ? 'leer'          // NIP · Cómo se leen
      : a.plantilla === 'nip' || /kemler|\bNIP\b|n[uú]mero de peligro/i.test(t) ? 'kemler'
      : a.plantilla === 'onu' || /\bONU\b|MMPP/i.test(t) ? 'onu'          // camión cisterna
      : /inflamab|explosiv/i.test(t) ? 'rango'                             // rango de inflamabilidad
      : /\bADR\b|clases?\b|etiquetas?/i.test(t) ? 'adr'                    // rombo de etiqueta
      : 'libre';
    return '<img src="' + ICO_AP[k] + '" alt="">';
  }
  let aps = [], datos = [], cargado = false, cargando = null, dueño = null;
  let vista = { v: 'lista' };     // lista | apartado | estudio
  let st = null;                  // estado del modo de estudio
  let abiertoId = null;           // el dato desplegado en la lista (uno cada vez)
  let mapaSel = null;             // el código abierto en el mapa de la guía del NIP
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
  // Cara de números o códigos (1203, 33, X423, UN 1005…): se responde escribiéndola
  const esCodigos = (apa, cara) => { const vs = deAp(apa.id).map(d => String(cara === 'a' ? d.a : d.b).trim()); return vs.length > 0 && vs.every(v => /^[A-Z]{0,3}\s?\d{1,6}[A-Z]?$/i.test(v)); };
  const escribe = (apa, cara) => (cara === 'a' ? apa.escribir_a : apa.escribir_b) || esCodigos(apa, cara);
  const soloNumeros = (apa, cara) => deAp(apa.id).every(d => /^\d+$/.test(String(cara === 'a' ? d.a : d.b).trim()));

  /* ---------- preguntas ---------- */
  // Una pregunta de un dato: qué cara se ve, cuál se responde y cómo (escribir / elegir / decir si lo sabías)
  function pregunta(d){
    const apa = ap(d.apartado_id);
    const ve = apa.sentido === 'ab' ? 'a' : apa.sentido === 'ba' ? 'b' : (Math.random() < .5 ? 'a' : 'b');
    const resp = ve === 'a' ? 'b' : 'a';
    const conTeclado = escribe(apa, resp);
    // Las opciones falsas, primero del mismo tipo que la buena: misma forma de respuesta (un código, una
    // lista de códigos o un texto) y pregunta parecida («Cifra 2» con otras cifras, «… empiezan por 2» con
    // otras listas). Así no se mezclan listas de números con significados.
    const forma = v => { const t = String(v).trim(); return /^[A-Z]{0,3}\s?\d{1,6}[A-Z]?$/i.test(t) ? 'cod' : /^[A-Z]?\d+[A-Z]?(\s*[,;\/]\s*[A-Z]?\d+[A-Z]?)+\.?$/i.test(t) ? 'lista' : 'texto'; };
    const familia = v => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[a-z]?\d+[a-z]?/g, '#').split(/[^a-z#]+/).filter(Boolean).slice(0, 3).join(' ');
    const fr = forma(d[resp]), fa = familia(d[ve]);
    const resto = mezclar(deAp(apa.id).filter(x => x.id !== d.id && normal(x[resp]) !== normal(d[resp])));
    const orden = resto.filter(x => forma(x[resp]) === fr && familia(x[ve]) === fa)
      .concat(resto.filter(x => forma(x[resp]) === fr && familia(x[ve]) !== fa), resto.filter(x => forma(x[resp]) !== fr));
    const otros = [...new Set(orden.map(x => x[resp]))];
    let tipo = conTeclado ? 'escribir' : otros.length >= 1 ? 'elegir' : 'saber';
    const opciones = tipo === 'elegir' ? mezclar([d[resp]].concat(otros.slice(0, 3))) : null;
    return { d, apa, ve, resp, tipo, opciones, numerico: tipo === 'escribir' && soloNumeros(apa, resp) };
  }
  async function apuntar(d, bien){
    d.aciertos += bien ? 1 : 0; d.fallos += bien ? 0 : 1; d.racha = bien ? d.racha + 1 : 0; d.ultima = new Date().toISOString();
    guardarCache();
    const { error } = await sb.from('di_datos').update({ aciertos: d.aciertos, fallos: d.fallos, racha: d.racha, ultima: d.ultima }).eq('id', d.id);
    if(error) console.warn('di apuntar', error);
  }

  /* ---------- ayudas de cada dato: regla mnemotécnica e imagen ---------- */
  function ayudas(d){
    if(!d.regla && !d.imagen) return '';
    return '<div class="di-ayudas">' + (d.regla ? '<div class="di-regla"><span>💡</span><span>' + esc(d.regla) + '</span></div>' : '') +
      (d.imagen ? '<img class="di-img" src="' + esc(d.imagen) + '" alt="Imagen de ' + esc(d.a) + '" data-di="img" data-url="' + esc(d.imagen) + '" loading="lazy">' : '') + '</div>';
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
        '<span class="di-ap-ico img">' + iconoAp(a) + '</span>' +
        '<span class="di-ap-txt"><b>' + esc(a.titulo) + '</b><span>' + ds.length + (ds.length === 1 ? ' dato' : ' datos') + (ds.length ? ' · ' + pct + ' % dominado' : '') + '</span>' +
        (ds.length ? '<span class="di-barra"><i style="width:' + pct + '%"></i></span>' : '') + '</span></button>';
    }).join('');
    return cabecera('Datos importantes', 'Tus apartados para memorizar datos: números ONU, NIP, teléfonos, cifras… Cada uno pregunta de la forma que mejor le va.', ['estudio', 'Estudio']) +
      (!cargado && !aps.length ? '<div class="di-vacio">Cargando…</div>' : '') +
      '<div class="di-aps">' + tarjetas +
        '<button type="button" class="di-ap di-nuevo" data-di="nuevo"><span class="di-ap-ico">' + ICO.mas + '</span><span class="di-ap-txt"><b>Añadir apartado</b><span>NIP, teléfonos, cifras…</span></span></button>' +
      '</div>';
  }
  // Dentro de un apartado, lo justo: progreso, los 3 modos, (en el NIP) la tira de cifras y la lista.
  // Añadir, la chuleta y los ajustes van en ventanitas; cada dato se despliega al tocarlo.
  function vistaApartado(a){
    const ds = deAp(a.id), dom = ds.filter(dominada).length, f = formas(a), g = guia(a), pct = ds.length ? Math.round(dom * 100 / ds.length) : 0;
    const lista = d => g && Object.values(g.listas).find(l => l.d === d);
    // En la guía del NIP: las cifras con su icono y su palabra clave; las listas, resumidas (se ven en el mapa)
    const celdas = d => {
      const n = g && g.cifras[d.id], l = lista(d);
      if(n) return '<span class="di-a di-a-ico">' + chip(n) + '<span>' + esc(d.a) + '</span></span><span class="di-b"><b class="di-clave">' + CIFRAS[n].nombre + '</b>' + esc(d.b) + '</span>';
      if(l) return '<span class="di-a">' + esc(d.a) + '</span><span class="di-b">' + l.cods.length + (l.cods.length === 1 ? ' código' : ' códigos') + ' · están en el mapa</span>';
      return '<span class="di-a">' + f.celda('a', d.a) + '</span><span class="di-b">' + f.celda('b', d.b) + '</span>';
    };
    const filas = ds.map(d => {
      const abierto = abiertoId === d.id;
      return '<div class="di-fila' + (dominada(d) ? ' dom' : '') + (abierto ? ' abierta' : '') + '" role="button" tabindex="0" data-di="fila" data-id="' + d.id + '" aria-expanded="' + abierto + '">' +
        celdas(d) +
        (dominada(d) ? '<span class="di-ok" title="Dominado">✓</span>' : '') + '<span class="di-flecha" aria-hidden="true">›</span></div>' +
        (abierto ? '<div class="di-fila-mas">' + f.dg(d) + ayudas(d) +
          '<div class="di-fila-btns"><button type="button" class="di-btn sec" data-di="editar" data-id="' + d.id + '">✎ Editar</button>' +
          '<button type="button" class="di-btn peligro" data-di="quitar" data-id="' + d.id + '">Borrar</button></div></div>' : '');
    }).join('');
    const pocos = ds.length < 2;
    const modo = (k, nombre, sub) => '<button type="button" class="di-modo" data-di="modo" data-m="' + k + '" title="' + sub + '"' + (pocos && k !== 'retos' ? ' disabled' : '') + '><span class="di-modo-ico">' + ICO[k] + '</span><b>' + nombre + '</b></button>';
    const cifras = f.nip ? '<button type="button" class="di-cifras" data-di="chuleta"><span class="di-cifras-t"><b>Las cifras</b><span>Ver reglas ›</span></span>' +
      '<span class="di-cifras-fila">' + [...'23456789X'].map(c => chip(c)).join('') + '</span></button>' : '';
    return '<span class="back-link" role="button" tabindex="0" data-di="lista">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="11,6 5,12 11,18"/></svg>Datos importantes</span>' +
      '<div class="di-cab"><h1>' + esc(a.titulo) + '</h1><button type="button" class="di-ico-btn di-cab-aj" data-di="ajustes" aria-label="Ajustes">' + ICO.ajustes + '</button></div>' +
      (ds.length ? '<div class="di-prog"><span class="di-barra"><i style="width:' + pct + '%"></i></span><span>' + dom + ' de ' + ds.length + ' dominados</span></div>' : '') +
      '<div class="di-modos' + (g ? ' cuatro' : '') + '">' + modo('fichas', 'Fichas', 'Girar y repasar') + modo('aprender', 'Aprender', 'Hasta que salgan todas') + modo('probar', 'Probar', PRUEBA + ' preguntas con nota') +
        (g ? modo('retos', 'Retos', 'Preguntas cortas y variadas') : '') + '</div>' +
      (g ? mapa(g) : cifras) +
      '<div class="di-sec"><b>Tus datos</b>' + (ayudaDe(a) && !f.nip ? '<button type="button" class="di-link" data-di="chuleta">Chuleta</button>' : '') +
        '<button type="button" class="di-btn di-mas" data-di="anadir">' + ICO.mas + ' Añadir</button></div>' +
      (pocos && ds.length ? '<div class="di-vacio">Añade al menos 2 datos para estudiar.</div>' : '') +
      '<div class="di-lista">' + (filas || '<div class="di-vacio">Aún no hay datos. Pulsa <b>Añadir</b> para escribir uno o pegar una lista entera.</div>') + '</div>';
  }
  // Todas las listas juntas: una fila por cifra, cada código una ficha; al tocarlo se lee cifra a cifra
  function mapa(g){
    const filas = Object.keys(g.listas).sort().map(d => {
      const cods = g.listas[d].cods, sel = cods.includes(mapaSel) ? mapaSel : null;
      return '<div class="di-mapa-f">' + chip(d) + '<div class="di-mapa-cods">' + cods.map(c =>
          '<button type="button" class="di-pill' + (c[0] === 'X' ? ' x' : '') + (especial(c) ? ' esp' : '') + (c === sel ? ' sel' : '') + '" data-di="mapacod" data-c="' + esc(c) + '">' + esc(c) + '</button>').join('') + '</div></div>' +
        (sel ? '<div class="di-mapa-dg">' + desglose(sel) + '</div>' : '');
    }).join('');
    return '<div class="di-mapa"><div class="di-mapa-t"><b>Mapa de los NIP</b><span>' + g.todos.size + ' códigos · toca uno para leerlo</span></div>' + filas +
      '<div class="di-mapa-ley"><span class="di-pill x">X</span> reacciona con el agua <span class="di-pill esp">⚠️</span> va aparte</div></div>';
  }
  function chuleta(){
    hoja('Chuleta', '<div class="di-ayuda">' + ayudaDe(ap(vista.id)) + '</div><div class="di-hoja-btns"><button type="button" class="di-btn" data-cerrar>Entendido</button></div>', () => {});
  }
  // Añadir datos de uno en uno (la ventanita se queda abierta para el siguiente) o pegar una lista
  function anadir(){
    const apa = ap(vista.id);
    const bg = hoja('Añadir datos',
      '<label class="di-campo">' + esc(apa.nombre_a) + '<input name="a" autocomplete="off" required maxlength="200"' + (apa.plantilla !== 'libre' ? ' inputmode="' + (apa.plantilla === 'onu' ? 'numeric' : 'text') + '"' : '') + '></label>' +
      '<label class="di-campo">' + esc(apa.nombre_b) + '<input name="b" autocomplete="off" required maxlength="1000"></label>' +
      '<div class="di-hoja-btns"><button type="button" class="di-link" data-pegar>Pegar una lista</button><span></span><button type="button" class="di-btn sec" data-cerrar>Cerrar</button><button type="submit" class="di-btn">Añadir</button></div>',
      async (fd, bg) => {
        const a = String(fd.get('a') || '').trim(), b = String(fd.get('b') || '').trim();
        if(!a || !b) return false;
        if(!(await añadir(a, b))) return false;
        pintar(); uiToast('Añadido: ' + a, 'success');
        const form = bg.querySelector('form'); form.reset(); form.a.focus();
        return false;   // se queda abierta para añadir otro
      });
    bg.querySelector('[data-pegar]').addEventListener('click', () => { bg.remove(); pegar(); });
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
    if(modo === 'retos'){ st = { modo, a, qs: retos(guia(a)), i: 0, res: null, sel: new Set(), bien: 0, mal: [] }; pintar(); arriba(); return; }
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
  /* ---------- Retos (guía del NIP) ---------- */
  function resumen(q){
    switch(q.tipo){
      case 'sino': return q.buena === 'si' ? 'El ' + q.c + ' sí existe' : 'El ' + q.c + ' no existe';
      case 'cual': return 'El que existe es el ' + q.buena;
      case 'toca': return 'Existían: ' + [...q.reales].join(', ');
      case 'cifra': return CIFRAS[q.n].nombre + ' es el ' + q.n;
      default: return q.lista ? 'Faltaba el ' + q.c : q.icono ? 'Es el ' + q.icono + ': ' + CIFRAS[q.icono].nombre : q.texto + ' → ' + q.c;
    }
  }
  function responderReto(v){
    if(!st || st.res) return;
    const q = st.qs[st.i];
    const bien = q.tipo === 'toca' ? q.ops.every(c => q.reales.has(c) === st.sel.has(c)) : q.tipo === 'escribe' ? igual(v, q.buena) : v === q.buena;
    st.res = { bien, dada: v };
    if(bien) st.bien++; else st.mal.push(q);
    pintar();
  }
  function sigReto(){ if(!st || !st.res) return; st.i++; st.res = null; st.sel = new Set(); pintar(); arriba(); }
  function vistaRetos(){
    const a = st.a, g = guia(a);
    const cab = '<div class="di-est-cab"><button type="button" class="di-link" data-di="salir">✕ Salir</button><b>Retos · ' + esc(a.titulo) + '</b></div>';
    if(st.i >= st.qs.length){
      const total = st.qs.length, nota = Math.round(st.bien * 100 / total) / 10;
      const mal = st.mal.map(q => '<div class="di-fila"><span class="di-a">' + esc(q.titulo) + '</span><span class="di-b">' + esc(resumen(q)) + '</span></div>').join('');
      return cab + '<div class="di-fin"><div class="di-fin-n' + (nota >= 5 ? ' ok' : '') + '">' + String(nota).replace('.', ',') + '</div><b>' + st.bien + ' de ' + total + ' bien</b>' +
        (mal ? '<span>Para repasar:</span><div class="di-lista">' + mal + '</div>' : '<span>¡Todos bien!</span>') +
        '<div class="di-fin-btns"><button type="button" class="di-btn" data-di="modo" data-m="retos">Otros retos</button><button type="button" class="di-btn sec" data-di="salir">Volver</button></div></div>';
    }
    const q = st.qs[st.i], r = st.res;
    const op = (v, html, cls) => {
      let c = 'di-op' + (cls ? ' ' + cls : '');
      if(r){ if(v === q.buena) c += ' bien'; else if(r.dada === v) c += ' mal'; }
      return '<button type="button" class="' + c + '" data-di="reto-op" data-v="' + esc(v) + '"' + (r ? ' disabled' : '') + '>' + html + '</button>';
    };
    const escribe = ph => '<form class="di-escribe" data-di-form="reto"><input class="di-resp-input' + (r ? (r.bien ? ' bien' : ' mal') : '') + '" name="r" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="' + ph + '"' +
      (r ? ' disabled value="' + esc(r.dada || '') + '"' : '') + '>' + (r ? '' : '<button type="submit" class="di-btn">Comprobar</button>') + '</form>';
    const grande = t => '<div class="di-reto-txt">' + t + '</div>';
    let enun = '', cuerpo = '';
    if(q.tipo === 'sino'){
      enun = '¿Existe este NIP?' + grande(panel(q.c, ''));
      cuerpo = '<div class="di-ops dos">' + op('si', 'Sí, existe') + op('no', 'No existe') + '</div>';
    } else if(q.tipo === 'cual'){
      enun = 'Solo uno de estos NIP existe. ¿Cuál?';
      cuerpo = '<div class="di-ops dos">' + q.ops.map(c => op(c, esc(c), 'cod')).join('') + '</div>';
    } else if(q.tipo === 'toca'){
      enun = '<span class="di-reto-con">Toca todos los que existen de los que empiezan por ' + chip(q.d) + '</span>';
      cuerpo = '<div class="di-ops tres">' + q.ops.map(c => {
        let cl = 'di-op cod';
        if(r){ cl += q.reales.has(c) ? (st.sel.has(c) ? ' bien' : ' falta') : (st.sel.has(c) ? ' mal' : ' nada'); }
        else if(st.sel.has(c)) cl += ' marcada';
        return '<button type="button" class="' + cl + '" data-di="reto-toca" data-v="' + esc(c) + '"' + (r ? ' disabled' : '') + '>' + esc(c) + '</button>';
      }).join('') + '</div>' + (r ? '' : '<button type="button" class="di-btn di-reto-comp" data-di="reto-comprobar">Comprobar</button>');
    } else if(q.tipo === 'cifra'){
      enun = '¿Qué cifra significa…?' + grande(CIFRAS[q.n].nombre);
      cuerpo = '<div class="di-ops cifras">' + [...'23456789X'].map(c => op(c, chip(c, true), 'ico')).join('') + '</div>';
    } else if(q.lista){
      enun = 'Falta uno de los NIP que empiezan por ' + q.d + '. ¿Cuál?' + '<div class="di-reto-pills">' + q.lista.map(c => c === q.c ? '<span class="di-pill hueco">?</span>' : '<span class="di-pill">' + esc(c) + '</span>').join('') + '</div>';
      cuerpo = escribe('El que falta');
    } else if(q.icono){
      enun = '¿Qué cifra es este icono?' + grande('<span class="di-chip c' + q.icono + ' xl"><span class="di-chip-i"></span></span>');
      cuerpo = escribe('Cifra (o X)');
    } else {
      enun = 'Escribe el NIP que significa:' + grande('<span class="di-reto-frase">' + esc(q.texto) + '</span>');
      cuerpo = escribe('NIP');
    }
    let extra = '';
    if(r){
      const real = q.tipo === 'cual' ? q.buena : q.c && g.todos.has(q.c) ? q.c : null;
      if(real) extra += desglose(real);
      if(q.tipo === 'cifra' || q.icono){ const n = q.n || q.icono; extra += '<div class="di-dg"><div class="di-dg-l">' + chip(n, true) + '<span><b>' + CIFRAS[n].nombre + '</b></span></div></div>'; }
      const d = q.ver && g.listas[q.ver];
      if(d && (q.tipo === 'toca' || q.tipo === 'cual' || (q.tipo === 'sino' && !real)))
        extra += '<div class="di-reto-lista"><span>Los que empiezan por ' + q.ver + ':</span><div class="di-reto-pills">' + d.cods.map(c => '<span class="di-pill' + (c[0] === 'X' ? ' x' : '') + (especial(c) ? ' esp' : '') + '">' + esc(c) + '</span>').join('') + '</div></div>';
    }
    const veredicto = r ? '<div class="di-ver ' + (r.bien ? 'bien' : 'mal') + '"><b>' + (r.bien ? '¡Bien!' : esc(resumen(q))) + '</b><button type="button" class="di-btn" data-di="reto-seguir">Continuar</button></div>' + extra : '';
    return cab + '<div class="di-paso">' + (st.i + 1) + ' de ' + st.qs.length + '</div><div class="di-barra grande"><i style="width:' + (st.i * 100 / st.qs.length) + '%"></i></div>' +
      '<div class="di-preg di-reto"><small>' + esc(q.titulo) + '</small><div class="di-reto-enun">' + enun + '</div></div>' + cuerpo + veredicto;
  }
  function vistaEstudio(){
    if(st.modo === 'retos') return vistaRetos();
    const a = st.a, titulo = { fichas: 'Fichas', aprender: 'Aprender', probar: 'Probar' }[st.modo], f = formas(a);
    const cab = '<div class="di-est-cab"><button type="button" class="di-link" data-di="salir">✕ Salir</button><b>' + titulo + ' · ' + esc(a.titulo) + '</b></div>';
    if(st.modo === 'fichas'){
      const d = st.cartas[st.i], cara = st.girada ? (st.cara === 'a' ? 'b' : 'a') : st.cara;
      const nombre = cara === 'a' ? a.nombre_a : a.nombre_b;
      return cab + '<div class="di-paso">' + (st.i + 1) + ' de ' + st.cartas.length + '</div>' +
        '<button type="button" class="di-ficha' + (st.girada ? ' girada' : '') + (cara === 'a' ? ' cara-a' : '') + '" data-di="girar"><small>' + esc(nombre) + '</small><span>' + f.grande(cara, d[cara]) + '</span><em>Toca para girar</em></button>' + (st.girada ? f.dg(d) + ayudas(d) : '') +
        '<div class="di-ficha-nav"><button type="button" class="di-btn sec" data-di="ant"' + (st.i ? '' : ' disabled') + '>‹ Anterior</button>' +
          '<button type="button" class="di-btn sec" data-di="barajar">Barajar</button><button type="button" class="di-btn sec" data-di="cara">Empezar por ' + esc(st.cara === 'a' ? a.nombre_b : a.nombre_a) + '</button>' +
          '<button type="button" class="di-btn" data-di="sig"' + (st.i + 1 < st.cartas.length ? '' : ' disabled') + '>Siguiente ›</button></div>';
    }
    // Final
    if(!st.q){
      if(st.modo === 'aprender') return cab + '<div class="di-fin"><div class="di-fin-n">✓</div><b>¡Tanda hecha!</b><span>' + st.total + ' datos respondidos bien.</span>' +
        '<div class="di-fin-btns"><button type="button" class="di-btn" data-di="modo" data-m="aprender">Otra tanda</button><button type="button" class="di-btn sec" data-di="salir">Volver</button></div></div>';
      const bien = st.hechas.filter(h => h.bien).length, nota = st.total ? Math.round(bien * 100 / st.total) / 10 : 0;
      const mal = st.hechas.filter(h => !h.bien).map(h => '<div class="di-fila"><span class="di-a">' + f.celda('a', h.q.d.a) + '</span><span class="di-b">' + f.celda('b', h.q.d.b) + '</span></div>').join('');
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
      (st.modo === 'aprender' && !r.bien ? '<span>Te la vuelvo a preguntar en un momento.</span>' : '') + '<button type="button" class="di-btn" data-di="seguir">Continuar</button></div>' + f.dg(q.d) + ayudas(q.d) : '';
    return cab + '<div class="di-paso">' + prog + '</div><div class="di-barra grande"><i style="width:' + pct + '%"></i></div>' +
      '<div class="di-preg"><small>' + esc(preg) + '</small><div class="di-preg-txt">' + f.grande(q.ve, q.d[q.ve]) + '</div><span class="di-preg-pide">¿' + esc(resp) + '?</span></div>' +
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
  // Añadir un apartado: solo el nombre (y, si se quiere, cómo se llama cada cara). Cómo se pregunta
  // lo decide solo: lo que son números o códigos se escribe; lo demás se elige entre 4.
  function nuevo(){
    hoja('Añadir apartado',
      '<label class="di-campo">Nombre<input name="t" maxlength="80" placeholder="Por ejemplo: NIP, Teléfonos, Rango de inflamabilidad…" required></label>' +
      '<div class="di-dos"><label class="di-campo">Qué apuntas (opcional)<input name="na" maxlength="40" placeholder="Dato (p. ej. Nº ONU)"></label>' +
        '<label class="di-campo">Y su respuesta (opcional)<input name="nb" maxlength="40" placeholder="Qué es (p. ej. Materia)"></label></div>' +
      '<div class="di-hoja-btns"><button type="button" class="di-btn sec" data-cerrar>Cancelar</button><button type="submit" class="di-btn">Añadir</button></div>',
      async fd => {
        const t = String(fd.get('t') || '').trim();
        const fila = { titulo: t || 'Datos', plantilla: 'libre', nombre_a: String(fd.get('na') || '').trim() || 'Dato', nombre_b: String(fd.get('nb') || '').trim() || 'Qué es',
          escribir_a: false, escribir_b: false, sentido: 'ambos', orden: aps.length };
        const { data, error } = await sb.from('di_apartados').insert(fila).select('*').single();
        if(error){ uiToast('No se pudo añadir: ' + error.message, 'error'); return false; }
        aps.push(data); guardarCache(); vista = { v: 'apartado', id: data.id }; pintar(); arriba();
      });
  }
  function ajustes(){
    const a = ap(vista.id);
    const radio = (n, v, t, on) => '<label class="di-opt"><input type="radio" name="' + n + '" value="' + v + '"' + (on ? ' checked' : '') + '>' + t + '</label>';
    hoja('Ajustes del apartado',
      '<label class="di-campo">Nombre<input name="t" maxlength="80" value="' + esc(a.titulo) + '" required></label>' +
      '<div class="di-dos"><label class="di-campo">Cara A<input name="na" maxlength="40" value="' + esc(a.nombre_a) + '" required></label><label class="di-campo">Cara B<input name="nb" maxlength="40" value="' + esc(a.nombre_b) + '" required></label></div>' +
      '<div class="di-campo">Qué se pregunta' + radio('s', 'ambos', 'Los dos sentidos', a.sentido === 'ambos') + radio('s', 'ab', 'Ves A, respondes B', a.sentido === 'ab') + radio('s', 'ba', 'Ves B, respondes A', a.sentido === 'ba') + '</div>' +
      '<div class="di-campo">Cuando hay que responder la cara A' + radio('ea', '1', 'Escribiéndola', a.escribir_a) + radio('ea', '0', 'Eligiendo entre 4 (o escribiendo, si son números o códigos)', !a.escribir_a) + '</div>' +
      '<div class="di-campo">Cuando hay que responder la cara B' + radio('eb', '1', 'Escribiéndola', a.escribir_b) + radio('eb', '0', 'Eligiendo entre 4 (o escribiendo, si son números o códigos)', !a.escribir_b) + '</div>' +
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
      '<label class="di-campo">💡 Regla mnemotécnica (opcional)<textarea name="r" rows="2" maxlength="1000" placeholder="Lo que te ayuda a acordarte">' + esc(d.regla || '') + '</textarea></label>' +
      '<div class="di-campo">🖼️ Imagen (opcional)' +
        (d.imagen ? '<div class="di-img-act"><img src="' + esc(d.imagen) + '" alt=""><label class="di-opt"><input type="checkbox" name="sinimg"> Quitar la imagen</label></div>' : '') +
        '<input type="file" name="img" accept="image/*"></div>' +
      '<div class="di-hoja-btns"><button type="button" class="di-btn sec" data-cerrar>Cancelar</button><button type="submit" class="di-btn">Guardar</button></div>',
      async fd => {
        const cambio = { a: String(fd.get('a')).trim(), b: String(fd.get('b')).trim(), regla: String(fd.get('r') || '').trim() || null };
        const archivo = fd.get('img');
        if(archivo && archivo.size){
          try{ cambio.imagen = await uploadOwnNoteImage('datos-' + currentUser.id, archivo); }
          catch(e){ uiToast('No se pudo subir la imagen: ' + e.message, 'error'); return false; }
        } else if(fd.get('sinimg')) cambio.imagen = null;
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
      case 'img': if(typeof openImageLightbox === 'function') openImageLightbox(el.dataset.url); break;
      case 'lista': vista = { v: 'lista' }; pintar(); arriba(); break;
      case 'abrir': vista = { v: 'apartado', id: el.dataset.id }; pintar(); arriba(); break;
      case 'nuevo': nuevo(); break;
      case 'ajustes': ajustes(); break;
      case 'pegar': pegar(); break;
      case 'editar': editar(el.dataset.id); break;
      case 'quitar': quitar(el.dataset.id); break;
      case 'mapacod': mapaSel = mapaSel === el.dataset.c ? null : el.dataset.c; pintar(); break;
      case 'reto-op': responderReto(el.dataset.v); break;
      case 'reto-toca': if(!st.res){ st.sel.has(el.dataset.v) ? st.sel.delete(el.dataset.v) : st.sel.add(el.dataset.v); pintar(); } break;
      case 'reto-comprobar': responderReto(null); break;
      case 'reto-seguir': sigReto(); break;
      case 'fila': abiertoId = abiertoId === el.dataset.id ? null : el.dataset.id; pintar(); break;
      case 'chuleta': chuleta(); break;
      case 'anadir': anadir(); break;
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
    if(f.dataset.diForm === 'reto'){ responderReto(f.r.value); return; }
  }
  // Teclado: Intro para continuar; 1-4 para elegir; espacio para girar la ficha
  function onKey(e){
    if(!st || !document.getElementById('screen-datos').classList.contains('active') || document.querySelector('.di-hoja-bg')) return;
    if(e.target.matches && e.target.matches('input, textarea') && !st.res) return;
    if(st.modo === 'retos'){ if(st.res && e.key === 'Enter'){ e.preventDefault(); sigReto(); } return; }
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
      // En <html>, para que también la vean las ventanitas; absoluta: si no, se leería desde css/
      document.documentElement.style.setProperty('--nip-iconos', 'url("' + new URL(ICONOS_NIP, location.href).href + '")');
      r.addEventListener('click', onClick);
      r.addEventListener('submit', onSubmit);
      r.addEventListener('keydown', e => { if((e.key === 'Enter' || e.key === ' ') && e.target.matches('.back-link, .di-fila')){ e.preventDefault(); onClick(e); } });
      document.addEventListener('keydown', onKey);
    }
    if(currentUser && dueño !== currentUser.id){ dueño = currentUser.id; aps = []; datos = []; cargado = false; leerCache(); }
    if(vista.v === 'apartado' && !ap(vista.id)) vista = { v: 'lista' };
    pintar();
    cargar();
  }
  return { abrir };
})();
