/* ============================================================
   CALLEJERO · Córdoba
   Las vías salen del Callejero Digital de Andalucía Unificado (CDAU,
   IECA — Junta de Andalucía, CC BY 4.0). La función callejero-sync las
   mantiene al día y publica un archivo compacto (almacén «callejero»);
   su ruta está en la tabla callejero_publicado. El archivo se descarga
   solo al abrir esta pantalla, y el service worker lo guarda para
   poder jugar sin conexión.
   Leaflet (el mapa) también se carga solo al abrir la pantalla.
   Tres estilos de mapa, a elegir con el botón de arriba a la derecha (se
   recuerda en el dispositivo). Ninguno tiene nombres que den pistas:
     - Sencillo: solo el trazado de las vías y el Guadalquivir, con los
       colores del tema. Funciona sin conexión.
     - Plano: el mismo trazado con colores de plano (calles blancas con
       borde, avenidas y carreteras en amarillo, río azul).
     - Satélite: ortofotos del PNOA (Instituto Geográfico Nacional,
       CC BY 4.0) con las vías encima, finas. Necesita conexión. Encima va
       la del último vuelo (servicio de ortofotos provisionales: 2025 en
       Córdoba), que tarda más en llegar; debajo, la de «máxima
       actualidad» (2022 en Córdoba), que sale al instante y cubre
       cualquier hueco o caída del servicio provisional.

   Modo «Localiza la calle»: se da el nombre de una vía y hay que
   tocarla en el mapa. Cuenta como acierto si el toque cae a menos de
   la tolerancia (lo que sea mayor: 35 m o 22 píxeles de pantalla) de
   cualquier vía con ese mismo nombre (hay nombres repetidos en
   distintas pedanías). Cada respuesta se guarda en callejero_intentos.

   Modo estudio: el mismo mapa, libre. Al tocar una vía se ve su nombre
   (y cuántas veces la has acertado), y se puede buscar cualquier vía por
   su nombre para que el mapa vaya hasta ella. No guarda nada.
   ============================================================ */
const CJ = (function(){
  const LEAFLET_JS = 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js';
  const LEAFLET_JS_SRI = 'sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=';
  const LEAFLET_CSS = 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css';
  const LEAFLET_CSS_SRI = 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=';
  const ATRIBUCION = 'Callejero: <a href="https://www.callejerodeandalucia.es/" target="_blank" rel="noopener">CDAU</a> · Río: DERA · IECA, Junta de Andalucía (CC BY 4.0)';
  const PNOA = 'https://www.ign.es/wmts/pnoa-ma?service=WMTS&request=GetTile&version=1.0.0&Format=image/jpeg&layer=OI.OrthoimageCoverage&style=default&tilematrixset=GoogleMapsCompatible&TileMatrix={z}&TileRow={y}&TileCol={x}';
  const PNOA_RECIENTE = 'https://wms-pnoa.idee.es/pnoa-provisionales';
  const ATRIBUCION_PNOA = 'Ortofoto: <a href="https://pnoa.ign.es/" target="_blank" rel="noopener">PNOA</a> (vuelo más reciente) © Instituto Geográfico Nacional (CC BY 4.0)';
  const ESTILOS = { sencillo: 'Sencillo', plano: 'Plano', satelite: 'Satélite' };
  const ESTILO_KEY = 'cj_estilo_mapa';
  // En el estilo Plano estas vías se pintan como las principales (amarillas).
  const TIPOS_PRINCIPALES = new Set(['AVENIDA', 'CARRETERA', 'AUTOVIA', 'RONDA', 'PASEO', 'BULEVAR', 'VIA', 'ENLACE']);
  const CENTRO = [37.8845, -4.7796];
  const PREGUNTAS_POR_RONDA = 20;
  const TOLERANCIA_M = 35;
  const TOLERANCIA_PX = 22;
  const PENDIENTES_KEY = 'cj_intentos_pendientes';

  let datos = null;          // { version, vias: [...], porNombre: Map, jugables: [...] }
  let cargando = null;       // promesa de carga en curso
  let progreso = new Map();  // id_vial -> { intentos, aciertos, ultimo_acierto }
  let mapa = null, capaMarcas = null, capaRio = null, capaFoto = null;
  // Vías en dos grupos (resto / principales), cada uno con su borde y su relleno.
  let capas = null;          // { restoBorde, resto, princBorde, princ }
  let estilo = 'sencillo';
  try{ if(ESTILOS[localStorage.getItem(ESTILO_KEY)]) estilo = localStorage.getItem(ESTILO_KEY); }catch(e){}
  let ronda = null;          // { preguntas, i, aciertos, fallos: [], respondida }
  let modo = null;           // 'localiza' | 'estudio' (con el mapa abierto)
  let sugerencias = [];      // resultados de la búsqueda del modo estudio

  /* ---------- carga perezosa de Leaflet ---------- */
  let leafletPromise = null;
  function cargarLeaflet(){
    if(window.L) return Promise.resolve();
    if(leafletPromise) return leafletPromise;
    leafletPromise = new Promise((resolve, reject) => {
      const css = document.createElement('link');
      css.rel = 'stylesheet'; css.href = LEAFLET_CSS; css.integrity = LEAFLET_CSS_SRI; css.crossOrigin = 'anonymous';
      document.head.appendChild(css);
      const js = document.createElement('script');
      js.src = LEAFLET_JS; js.integrity = LEAFLET_JS_SRI; js.crossOrigin = 'anonymous';
      js.onload = () => resolve();
      js.onerror = () => { leafletPromise = null; reject(new Error('No se pudo cargar el mapa')); };
      document.head.appendChild(js);
    });
    return leafletPromise;
  }

  /* ---------- datos ---------- */
  // Cada vía del archivo: [id_vial, nombre, tipo, jugable (1/0), líneas]
  // y cada línea son enteros (grados × 100 000) con diferencias entre
  // puntos consecutivos. Se pasan a [lat, lng] para Leaflet.
  function decodificarLineas(lineas){
    return lineas.map(l => {
      const pts = [];
      let x = 0, y = 0;
      for(let k = 0; k < l.length; k += 2){ x += l[k]; y += l[k + 1]; pts.push([y / 1e5, x / 1e5]); }
      return pts;
    });
  }
  // Sin tildes ni mayúsculas, para buscar «avenida del aeropuerto» igual
  // que «Avenida del Aeropuerto».
  function normalizar(t){ return String(t).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }
  function cajaDe(lineas){
    const c = { s: 90, n: -90, o: 180, e: -180 };
    lineas.forEach(l => l.forEach(([la, ln]) => {
      if(la < c.s) c.s = la; if(la > c.n) c.n = la;
      if(ln < c.o) c.o = ln; if(ln > c.e) c.e = ln;
    }));
    return c;
  }
  function decodificar(doc){
    const vias = doc.vias.map(([id, nombre, tipo, jugable, lineas]) => {
      const l = decodificarLineas(lineas);
      return { id, nombre, tipo, jugable: jugable === 1, lineas: l, caja: cajaDe(l), clave: normalizar(nombre) };
    });
    const porNombre = new Map();
    vias.forEach(v => {
      const k = v.nombre.toLowerCase();
      if(!porNombre.has(k)) porNombre.set(k, []);
      porNombre.get(k).push(v);
    });
    return { version: doc.version, vias, porNombre, jugables: vias.filter(v => v.jugable), rio: decodificarLineas(doc.rio || []) };
  }

  async function cargarDatos(){
    if(datos) return datos;
    if(cargando) return cargando;
    cargando = (async () => {
      const { data: pub, error } = await sb.from('callejero_publicado').select('version, archivo').eq('id', 1).maybeSingle();
      if(error) throw new Error(error.message);
      if(!pub) throw new Error('El callejero todavía no está publicado.');
      const url = sb.storage.from('callejero').getPublicUrl(pub.archivo).data.publicUrl;
      const resp = await fetch(url);
      if(!resp.ok) throw new Error('No se pudo descargar el callejero (' + resp.status + ')');
      datos = decodificar(await resp.json());
      return datos;
    })();
    try{ return await cargando; }
    finally{ cargando = null; }
  }

  async function cargarProgreso(){
    const { data, error } = await sb.rpc('callejero_mi_progreso');
    if(error) return;
    progreso = new Map((data || []).map(r => [Number(r.id_vial), r]));
    pendientes().forEach(p => {
      const r = progreso.get(p.id_vial) || { intentos: 0, aciertos: 0 };
      progreso.set(p.id_vial, { intentos: r.intentos + 1, aciertos: r.aciertos + (p.acierto ? 1 : 0), ultimo_acierto: p.acierto });
    });
  }

  /* ---------- intentos (con cola si no hay conexión) ---------- */
  function pendientes(){
    try{ return JSON.parse(localStorage.getItem(PENDIENTES_KEY)) || []; }catch(e){ return []; }
  }
  function guardarPendientes(lista){
    try{ localStorage.setItem(PENDIENTES_KEY, JSON.stringify(lista.slice(-500))); }catch(e){}
  }
  async function subirPendientes(){
    const lista = pendientes();
    if(!lista.length || !currentUser) return;
    const { error } = await sb.from('callejero_intentos').insert(lista);
    if(!error) guardarPendientes([]);
  }
  function anotarIntento(via, acierto, distancia){
    const r = progreso.get(via.id) || { intentos: 0, aciertos: 0 };
    progreso.set(via.id, { intentos: r.intentos + 1, aciertos: r.aciertos + (acierto ? 1 : 0), ultimo_acierto: acierto });
    guardarPendientes(pendientes().concat([{ id_vial: via.id, modo: 'localiza', acierto, distancia_m: Math.round(distancia), created_at: new Date().toISOString() }]));
    subirPendientes();
  }
  window.addEventListener('online', () => { subirPendientes(); });

  /* ---------- geometría ---------- */
  // Distancia en metros de un punto a una vía (aproximación plana local,
  // exacta a efectos prácticos dentro de una ciudad).
  function distanciaAVia(lat, lng, via){
    const kx = 111320 * Math.cos(lat * Math.PI / 180), ky = 110540;
    let min = Infinity;
    via.lineas.forEach(l => {
      for(let k = 0; k < l.length - 1; k++){
        const ax = (l[k][1] - lng) * kx, ay = (l[k][0] - lat) * ky;
        const bx = (l[k + 1][1] - lng) * kx, by = (l[k + 1][0] - lat) * ky;
        const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
        const t = L ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / L)) : 0;
        const d = Math.hypot(ax + t * dx, ay + t * dy);
        if(d < min) min = d;
      }
    });
    return min;
  }
  function limitesDe(vias){
    return L.latLngBounds(vias.flatMap(v => v.lineas.flat()));
  }

  /* ---------- mapa ---------- */
  function temaActual(){ return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark'; }
  function colorCalles(){ return temaActual() === 'light' ? '#9aa0ab' : '#5d636d'; }
  function colorRio(){ return temaActual() === 'light' ? '#a9cdef' : '#1f4e7a'; }

  function crearMapa(){
    const el = document.getElementById('cjMapa');
    if(mapa){ mapa.invalidateSize(); return; }
    mapa = L.map(el, { zoomControl: true, attributionControl: true, preferCanvas: true, minZoom: 11, maxZoom: 19, zoomSnap: 0.5 });
    mapa.attributionControl.setPrefix(false);
    mapa.attributionControl.addAttribution(ATRIBUCION);
    capaFoto = L.layerGroup([
      L.tileLayer(PNOA, { maxZoom: 19, attribution: ATRIBUCION_PNOA, zIndex: 1 }),
      // Trozos de 512 px: la mitad de peticiones a un servicio lento.
      L.tileLayer.wms(PNOA_RECIENTE, { layers: 'OrtoimagenRapida', format: 'image/jpeg', version: '1.3.0', tileSize: 512, maxZoom: 19, zIndex: 2 })
    ]);
    const renderer = L.canvas({ padding: 0.3, tolerance: 4 });
    const linea = lineas => L.polyline(lineas, { renderer, interactive: false, lineCap: 'round', lineJoin: 'round' });
    if(datos.rio.length) capaRio = linea(datos.rio);
    const princ = datos.vias.filter(v => TIPOS_PRINCIPALES.has(v.tipo)).flatMap(v => v.lineas);
    const resto = datos.vias.filter(v => !TIPOS_PRINCIPALES.has(v.tipo)).flatMap(v => v.lineas);
    capas = { restoBorde: linea(resto), resto: linea(resto), princBorde: linea(princ), princ: linea(princ) };
    capaMarcas = L.layerGroup();
    aplicarEstilo();
    mapa.addControl(crearControlEstilo());
    mapa.setMaxBounds(limitesDe(datos.vias).pad(0.15));
    mapa.setView(CENTRO, 14);
    mapa.on('click', e => { if(modo === 'estudio') tocarEstudio(e.latlng); else responder(e.latlng); });
  }

  // Qué capas se ven y con qué colores en cada estilo.
  function aplicarEstilo(){
    if(!mapa) return;
    const S = {
      sencillo: {
        fondo: null, foto: false,
        rio: { color: colorRio(), weight: 9, opacity: 1 },
        restoBorde: null, resto: { color: colorCalles(), weight: 2, opacity: 0.9 },
        princBorde: null, princ: { color: colorCalles(), weight: 2, opacity: 0.9 }
      },
      plano: {
        fondo: '#efe9dc', foto: false,
        rio: { color: '#9ccbeb', weight: 11, opacity: 1 },
        restoBorde: { color: '#cbc2b0', weight: 5, opacity: 1 }, resto: { color: '#ffffff', weight: 3, opacity: 1 },
        princBorde: { color: '#d9a93a', weight: 7, opacity: 1 }, princ: { color: '#fbd96b', weight: 4.5, opacity: 1 }
      },
      satelite: {
        fondo: '#1b1d1a', foto: true, rio: null,
        restoBorde: null, resto: { color: '#ffffff', weight: 1.5, opacity: 0.5 },
        princBorde: null, princ: { color: '#ffe38a', weight: 2, opacity: 0.6 }
      }
    }[estilo];
    const poner = (capa, st) => {
      if(!capa) return;
      if(st){ capa.setStyle(st); if(!mapa.hasLayer(capa)) capa.addTo(mapa); }
      else if(mapa.hasLayer(capa)) mapa.removeLayer(capa);
    };
    if(S.foto){ if(!mapa.hasLayer(capaFoto)) capaFoto.addTo(mapa); }
    else if(mapa.hasLayer(capaFoto)) mapa.removeLayer(capaFoto);
    // Orden de abajo arriba: río, bordes, rellenos y, encima de todo, las marcas.
    [capaRio, capas.restoBorde, capas.princBorde, capas.resto, capas.princ, capaMarcas].forEach(c => { if(c && mapa.hasLayer(c)) mapa.removeLayer(c); });
    poner(capaRio, S.rio);
    poner(capas.restoBorde, S.restoBorde);
    poner(capas.princBorde, S.princBorde);
    poner(capas.resto, S.resto);
    poner(capas.princ, S.princ);
    capaMarcas.addTo(mapa);
    const cont = mapa.getContainer();
    cont.style.background = S.fondo || '';
    document.querySelectorAll('.cj-estilo-opcion').forEach(b => b.classList.toggle('activa', b.dataset.estilo === estilo));
    const actual = document.querySelector('.cj-estilo-actual');
    if(actual) actual.textContent = ESTILOS[estilo];
  }

  function cambiarEstilo(nuevo){
    if(!ESTILOS[nuevo]) return;
    estilo = nuevo;
    try{ localStorage.setItem(ESTILO_KEY, nuevo); }catch(e){}
    aplicarEstilo();
    const menu = document.querySelector('.cj-estilo-menu');
    if(menu) menu.classList.add('hidden');
  }

  // Botón «Mapa: …» arriba a la derecha, con el menú de estilos.
  function crearControlEstilo(){
    const Control = L.Control.extend({
      options: { position: 'topright' },
      onAdd: function(){
        const div = L.DomUtil.create('div', 'cj-estilo');
        div.innerHTML =
          '<button type="button" class="cj-estilo-boton" aria-label="Estilo del mapa">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/><path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65"/><path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65"/></svg>' +
            '<span class="cj-estilo-actual">' + ESTILOS[estilo] + '</span>' +
          '</button>' +
          '<div class="cj-estilo-menu hidden">' +
            Object.keys(ESTILOS).map(k => '<button type="button" class="cj-estilo-opcion' + (k === estilo ? ' activa' : '') + '" data-estilo="' + k + '">' + ESTILOS[k] + '</button>').join('') +
          '</div>';
        L.DomEvent.disableClickPropagation(div);
        div.querySelector('.cj-estilo-boton').addEventListener('click', () => div.querySelector('.cj-estilo-menu').classList.toggle('hidden'));
        div.querySelectorAll('.cj-estilo-opcion').forEach(b => b.addEventListener('click', () => cambiarEstilo(b.dataset.estilo)));
        return div;
      }
    });
    return new Control();
  }

  function refrescarTema(){ aplicarEstilo(); }

  /* ---------- pantalla principal ---------- */
  function el(id){ return document.getElementById(id); }

  function pintarInicio(){
    const root = el('cjInicio');
    if(!root) return;
    if(!datos){ root.innerHTML = '<div class="cj-card">' + skelList(3) + '</div>'; return; }
    const total = datos.jugables.length;
    let dominadas = 0, vistas = 0, fallos = 0;
    datos.jugables.forEach(v => {
      const p = progreso.get(v.id);
      if(!p) return;
      vistas++;
      if(p.ultimo_acierto) dominadas++; else fallos++;
    });
    const pct = total ? Math.round(dominadas * 100 / total) : 0;
    root.innerHTML =
      '<div class="cj-card">' +
        '<div class="cj-card-title">Tu callejero</div>' +
        '<div class="cj-pct"><span>' + pct + '%</span> dominado</div>' +
        '<div class="cj-bar"><div class="cj-bar-fill" style="width:' + pct + '%"></div></div>' +
        '<div class="cj-stats">' +
          '<div><b>' + dominadas + '</b><span>acertadas</span></div>' +
          '<div><b>' + fallos + '</b><span>por repasar</span></div>' +
          '<div><b>' + (total - vistas) + '</b><span>sin ver</span></div>' +
        '</div>' +
      '</div>' +
      '<button type="button" class="cj-mode" onclick="CJ.empezar()">' +
        '<div class="cj-mode-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 4.99-5.54 10.19-7.4 11.8a1 1 0 0 1-1.2 0C9.54 20.19 4 14.99 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/></svg></div>' +
        '<div class="cj-mode-text"><div class="cj-mode-title">Localiza la calle</div>' +
        '<div class="cj-mode-desc">Te damos el nombre de una vía y la tocas en el mapa. ' + PREGUNTAS_POR_RONDA + ' preguntas; primero las que fallaste.</div></div>' +
      '</button>' +
      '<button type="button" class="cj-mode" onclick="CJ.estudio()">' +
        '<div class="cj-mode-icon cj-mode-icon-estudio"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 7v14"/><path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"/></svg></div>' +
        '<div class="cj-mode-text"><div class="cj-mode-title">Modo estudio</div>' +
        '<div class="cj-mode-desc">Explora el mapa a tu aire: toca cualquier calle para ver cómo se llama, o búscala por su nombre y te lleva hasta ella.</div></div>' +
      '</button>' +
      '<div class="cj-fuente">' + total.toLocaleString('es-ES') + ' vías de Córdoba del callejero oficial de la Junta de Andalucía (CDAU), actualizado cada semana.</div>';
  }

  async function abrir(){
    const root = el('cjInicio');
    // Se vuelve a la ronda o al modo estudio tal cual se dejaron.
    if(modo){ if(mapa) setTimeout(() => mapa.invalidateSize(), 0); return; }
    mostrarVista('inicio');
    pintarInicio();
    try{
      await cargarDatos();
      await cargarProgreso();
      pintarInicio();
      subirPendientes();
    }catch(e){
      if(root) root.innerHTML = '<div class="cj-card cj-error">No se ha podido cargar el callejero: ' + escapeHtml(e.message) +
        '<br><button type="button" class="btn btn-light" onclick="CJ.abrir()">Reintentar</button></div>';
    }
  }

  function mostrarVista(v){
    el('cjInicio').classList.toggle('hidden', v !== 'inicio');
    el('cjJuego').classList.toggle('hidden', v !== 'juego');
    el('cjFin').classList.toggle('hidden', v !== 'fin');
    document.getElementById('screen-callejero').classList.toggle('cj-jugando', v === 'juego');
  }

  /* ---------- ronda de «Localiza la calle» ---------- */
  function barajar(a){ return shuffleArray(a); }
  function elegirPreguntas(){
    const falladas = [], nuevas = [], acertadas = [];
    datos.jugables.forEach(v => {
      const p = progreso.get(v.id);
      if(!p) nuevas.push(v);
      else if(!p.ultimo_acierto) falladas.push(v);
      else acertadas.push(v);
    });
    const n = PREGUNTAS_POR_RONDA;
    const out = barajar(falladas).slice(0, Math.ceil(n * 0.4));
    const usados = new Set(out.map(v => v.nombre));
    for(const v of barajar(nuevas).concat(barajar(acertadas))){
      if(out.length >= n) break;
      if(usados.has(v.nombre)) continue;
      usados.add(v.nombre);
      out.push(v);
    }
    return barajar(out);
  }

  async function empezar(){
    try{
      await Promise.all([cargarLeaflet(), cargarDatos()]);
    }catch(e){
      uiToast(e.message, 'error');
      return;
    }
    ronda = { preguntas: elegirPreguntas(), i: 0, aciertos: 0, fallos: [], respondida: false };
    modo = 'localiza';
    mostrarVista('juego');
    ponerInterfaz();
    crearMapa();
    siguientePregunta(true);
  }

  // Lo que se ve encima y dentro del mapa depende del modo.
  function ponerInterfaz(){
    const estudio = modo === 'estudio';
    el('cjContador').classList.toggle('hidden', estudio);
    el('cjAciertos').classList.toggle('hidden', estudio);
    el('cjBarraTitulo').classList.toggle('hidden', !estudio);
    el('cjPreguntaWrap').classList.toggle('hidden', estudio);
    el('cjBuscarWrap').classList.toggle('hidden', !estudio);
    el('cjPista').textContent = 'Toca una calle para ver cómo se llama';
    el('cjPista').classList.toggle('hidden', !estudio);
    el('cjInfo').classList.add('hidden');
    el('cjResultado').className = 'cj-resultado hidden';
    el('cjSugerencias').classList.add('hidden');
    el('cjBuscar').value = '';
  }

  /* ---------- modo estudio ---------- */
  async function estudio(){
    try{
      await Promise.all([cargarLeaflet(), cargarDatos()]);
    }catch(e){
      uiToast(e.message, 'error');
      return;
    }
    ronda = null;
    modo = 'estudio';
    mostrarVista('juego');
    ponerInterfaz();
    crearMapa();
    capaMarcas.clearLayers();
    mapa.setView(CENTRO, 14);
  }

  // Vías a menos de ~20 píxeles del toque, de la más cercana a la más
  // lejana. Si el toque cae en un cruce, las que se cruzan ahí quedan casi
  // a la misma distancia (se muestran como «cruce con…»).
  function viasCercanas(latlng){
    const tol = Math.max(15, mapa.distance(mapa.containerPointToLatLng([0, 0]), mapa.containerPointToLatLng([20, 0])));
    const dLat = tol / 110540, dLng = tol / (111320 * Math.cos(latlng.lat * Math.PI / 180));
    const out = [];
    for(const v of datos.vias){
      const c = v.caja;
      if(latlng.lat < c.s - dLat || latlng.lat > c.n + dLat || latlng.lng < c.o - dLng || latlng.lng > c.e + dLng) continue;
      const d = distanciaAVia(latlng.lat, latlng.lng, v);
      if(d <= tol) out.push({ v, d });
    }
    return out.sort((a, b) => a.d - b.d);
  }

  function tocarEstudio(latlng){
    const cerca = viasCercanas(latlng);
    const v = cerca.length ? cerca[0].v : null;
    if(!v){
      capaMarcas.clearLayers();
      el('cjInfo').classList.add('hidden');
      el('cjPista').textContent = 'Ahí no hay ninguna calle: toca justo encima de una';
      el('cjPista').classList.remove('hidden');
      return;
    }
    const cruce = [];
    cerca.slice(1).forEach(c => {
      if(c.d <= cerca[0].d + 4 && c.v.nombre !== v.nombre && !cruce.includes(c.v.nombre)) cruce.push(c.v.nombre);
    });
    seleccionar(v, false, cruce);
  }

  function tipoBonito(t){ return t ? t.charAt(0) + t.slice(1).toLowerCase() : ''; }

  function seleccionar(v, centrar, cruce){
    const iguales = datos.porNombre.get(v.nombre.toLowerCase()) || [v];
    capaMarcas.clearLayers();
    iguales.forEach(o => {
      const principal = o === v;
      L.polyline(o.lineas, { color: '#F2665C', weight: principal ? 10 : 7, opacity: principal ? 0.3 : 0.18, interactive: false }).addTo(capaMarcas);
      L.polyline(o.lineas, { color: '#F2665C', weight: principal ? 4 : 3, opacity: principal ? 1 : 0.6, interactive: false }).addTo(capaMarcas);
    });
    if(centrar) mapa.flyToBounds(limitesDe(iguales), { padding: [70, 70], maxZoom: 17, duration: 0.7 });

    const p = progreso.get(v.id);
    let extra = '';
    if(!v.jugable) extra = 'No entra en las preguntas del juego.';
    else if(!p) extra = 'Todavía no te ha salido en «Localiza la calle».';
    else extra = 'La has acertado ' + p.aciertos + ' de ' + p.intentos + (p.intentos === 1 ? ' vez' : ' veces') + (p.ultimo_acierto ? ' (la última, bien).' : ' (la última, mal).');
    el('cjInfo').innerHTML =
      '<div class="cj-info-tipo">' + escapeHtml(tipoBonito(v.tipo)) + '</div>' +
      '<div class="cj-info-nombre">' + escapeHtml(v.nombre) + '</div>' +
      (cruce && cruce.length ? '<div class="cj-info-cruce">En el cruce con ' + cruce.map(escapeHtml).join(' y ') + '</div>' : '') +
      (iguales.length > 1 ? '<div class="cj-info-extra">Hay ' + iguales.length + ' vías con este nombre (todas marcadas en el mapa).</div>' : '') +
      '<div class="cj-info-extra">' + escapeHtml(extra) + '</div>';
    el('cjInfo').classList.remove('hidden');
    el('cjPista').classList.add('hidden');
  }

  function buscar(texto){
    const q = normalizar(texto.trim());
    const caja = el('cjSugerencias');
    if(q.length < 2){ sugerencias = []; caja.classList.add('hidden'); return; }
    const vistos = new Set();
    const empiezan = [], contienen = [];
    for(const v of datos.vias){
      if(vistos.has(v.clave) || !v.clave.includes(q)) continue;
      vistos.add(v.clave);
      // «calle feria» también encuentra «Calle Feria»; «feria» prioriza
      // las que tienen esa palabra al principio del nombre sin el tipo.
      const sinTipo = v.clave.replace(/^\S+\s+/, '');
      (v.clave.startsWith(q) || sinTipo.startsWith(q) ? empiezan : contienen).push(v);
    }
    const orden = (a, b) => a.nombre.localeCompare(b.nombre, 'es');
    sugerencias = empiezan.sort(orden).concat(contienen.sort(orden)).slice(0, 8);
    caja.innerHTML = sugerencias.length
      ? sugerencias.map((v, i) => '<button type="button" class="cj-sugerencia" onclick="CJ.elegir(' + i + ')">' + escapeHtml(v.nombre) + '</button>').join('')
      : '<div class="cj-sugerencia-vacia">Ninguna vía con ese nombre</div>';
    caja.classList.remove('hidden');
  }

  function elegir(i){
    const v = sugerencias[i];
    if(!v) return;
    el('cjBuscar').value = v.nombre;
    el('cjBuscar').blur();
    el('cjSugerencias').classList.add('hidden');
    seleccionar(v, true);
  }

  function textoAciertos(){ return ronda.aciertos + (ronda.aciertos === 1 ? ' acierto' : ' aciertos'); }
  function pintarCabecera(){
    const q = ronda.preguntas[ronda.i];
    el('cjContador').textContent = (ronda.i + 1) + ' / ' + ronda.preguntas.length;
    el('cjAciertos').textContent = textoAciertos();
    el('cjPregunta').textContent = q.nombre;
  }

  function siguientePregunta(primera){
    if(!primera) ronda.i++;
    if(ronda.i >= ronda.preguntas.length){ terminar(); return; }
    ronda.respondida = false;
    capaMarcas.clearLayers();
    el('cjResultado').classList.add('hidden');
    el('cjResultado').className = 'cj-resultado hidden';
    pintarCabecera();
    mapa.invalidateSize();
    if(!primera) mapa.flyTo(CENTRO, 14, { duration: 0.6 });
  }

  function responder(latlng){
    if(!ronda || ronda.respondida) return;
    ronda.respondida = true;
    const q = ronda.preguntas[ronda.i];
    const candidatas = datos.porNombre.get(q.nombre.toLowerCase()) || [q];
    let mejor = q, dist = Infinity;
    candidatas.forEach(v => {
      const d = distanciaAVia(latlng.lat, latlng.lng, v);
      if(d < dist){ dist = d; mejor = v; }
    });
    const pxEnMetros = mapa.distance(mapa.containerPointToLatLng([0, 0]), mapa.containerPointToLatLng([TOLERANCIA_PX, 0]));
    const acierto = dist <= Math.max(TOLERANCIA_M, pxEnMetros);
    if(acierto) ronda.aciertos++; else ronda.fallos.push(q);
    anotarIntento(q, acierto, dist);

    const color = acierto ? '#34D399' : '#F2665C';
    L.circleMarker(latlng, { radius: 7, color: '#fff', weight: 2, fillColor: color, fillOpacity: 1, interactive: false }).addTo(capaMarcas);
    const correctas = acierto ? [mejor] : candidatas;
    correctas.forEach(v => {
      L.polyline(v.lineas, { color: '#34D399', weight: 9, opacity: 0.35, interactive: false }).addTo(capaMarcas);
      L.polyline(v.lineas, { color: '#34D399', weight: 4, opacity: 1, interactive: false }).addTo(capaMarcas);
    });
    if(!acierto){
      mapa.flyToBounds(limitesDe(correctas).extend(latlng), { padding: [60, 60], maxZoom: 17, duration: 0.7 });
    }

    const res = el('cjResultado');
    res.className = 'cj-resultado ' + (acierto ? 'ok' : 'ko');
    el('cjResultadoTexto').innerHTML = acierto
      ? '<b>¡Correcto!</b> ' + escapeHtml(q.nombre)
      : '<b>Fallo.</b> Te has quedado a ' + formatearDistancia(dist) + '. En verde, dónde está.';
    el('cjAciertos').textContent = textoAciertos();
    el('cjSiguiente').textContent = ronda.i + 1 >= ronda.preguntas.length ? 'Ver resultado' : 'Siguiente';
  }
  function formatearDistancia(m){
    return m >= 1000 ? (m / 1000).toFixed(1).replace('.', ',') + ' km' : Math.round(m) + ' m';
  }

  function terminar(){
    const total = ronda.preguntas.length;
    const fallos = ronda.fallos;
    el('cjFin').innerHTML =
      '<div class="cj-card cj-fin">' +
        '<div class="cj-card-title">Resultado</div>' +
        '<div class="cj-pct"><span>' + ronda.aciertos + '</span> de ' + total + '</div>' +
        (fallos.length
          ? '<div class="cj-fin-sub">Para repasar (saldrán primero la próxima vez):</div><ul class="cj-fallos">' +
            fallos.map(v => '<li>' + escapeHtml(v.nombre) + '</li>').join('') + '</ul>'
          : '<div class="cj-fin-sub">¡Todas bien!</div>') +
        '<div class="cj-fin-actions">' +
          '<button type="button" class="btn btn-primary btn-light" onclick="CJ.empezar()">Otra ronda</button>' +
          '<button type="button" class="btn btn-ghost" onclick="CJ.salir()">Volver</button>' +
        '</div>' +
      '</div>';
    ronda = null;
    modo = null;
    mostrarVista('fin');
  }

  function salir(){
    ronda = null;
    modo = null;
    mostrarVista('inicio');
    pintarInicio();
  }
  async function confirmarSalir(){
    if(modo === 'localiza' && ronda && ronda.i > 0 && !(await uiConfirm('¿Salir de la ronda? Lo que ya has respondido queda guardado.'))) return;
    salir();
  }

  return { abrir, empezar, estudio, buscar, elegir, salir, confirmarSalir, siguiente: () => siguientePregunta(false), refrescarTema };
})();
