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

   Zona de estudio: toda Córdoba, un distrito, un barrio (barrios urbanos
   de DERA, con su distrito) o las afueras y pedanías (vías que no están en
   ningún barrio). Filtra las preguntas, el progreso y la lista de calles
   del modo estudio, y se dibuja su contorno en el mapa. Se recuerda en el
   dispositivo.

   Modos de juego (todos con rondas de hasta 20 preguntas de la zona
   elegida; primero las que se fallaron):
     - localiza: se da el nombre de una vía y hay que tocarla en el mapa.
     - opciones: se marca una vía y se elige su nombre entre 4 cercanas.
     - voz:      se marca una vía y hay que decir su nombre en voz alta.
                 Con reconocimiento de voz (Chrome, Safari) la app lo
                 comprueba sola (se perdonan tildes, el tipo de vía y
                 pequeños errores; si entiende mal, «Lo dije bien»). Sin él,
                 o con «Ver respuesta», uno mismo marca ✓ o ✗.
     - cruces:   «¿Cuál cruza con X?» o «¿Cuál es paralela a X?», con 4
                 opciones. Los cruces y las paralelas se calculan con el
                 trazado oficial (ver crucesDe y paralelasDe).
     - lugares:  se da un lugar importante (hospital, colegio...) y hay
                 que tocarlo en el mapa.
     - parque:   «¿Qué parque de bomberos acude?», Central o Granadal,
                 para vías y lugares (la línea viene en el archivo; lo que
                 está a menos de 150 m de ella no se pregunta).

   Modo estudio: el mismo mapa, libre. Al tocar una vía se ve su nombre
   (y cuántas veces la has acertado), y se puede buscar cualquier vía por
   su nombre para que el mapa vaya hasta ella. No guarda nada.
   ============================================================ */
const CJ = (function(){
  const LEAFLET_JS = 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js';
  const LEAFLET_JS_SRI = 'sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=';
  const LEAFLET_CSS = 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css';
  const LEAFLET_CSS_SRI = 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=';
  const ATRIBUCION = 'Callejero: <a href="https://www.callejerodeandalucia.es/" target="_blank" rel="noopener">CDAU</a> · Río y lugares: DERA · IECA, Junta de Andalucía (CC BY 4.0) · Otros lugares y vías: © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>';
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
  const TOLERANCIA_LUGAR_M = 60;
  const PARQUES = { 1: 'Parque Central', 2: 'Parque del Granadal' };
  // Qué pide cada modo y cómo se responde (tocar el mapa, elegir o escribir).
  const MODOS = {
    localiza: { titulo: 'Localiza la calle', respuesta: 'toque' },
    opciones: { titulo: '¿Cómo se llama?', respuesta: 'opciones' },
    voz: { titulo: 'Dilo en voz alta', respuesta: 'voz' },
    cruces: { titulo: 'Cruces y paralelas', respuesta: 'opciones' },
    lugares: { titulo: 'Lugares importantes', respuesta: 'toque' },
    parque: { titulo: '¿Qué parque acude?', respuesta: 'opciones' }
  };
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
  let capaZona = null;       // contorno de la zona elegida
  const ZONA_KEY = 'cj_zona';
  // '' = toda Córdoba · 'd:<distrito>' · 'b:<barrio>' · 'fuera' = afueras y pedanías
  let zona = '';
  try{ zona = localStorage.getItem(ZONA_KEY) || ''; }catch(e){}

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
    const barrios = ((doc.zonas && doc.zonas.barrios) || []).map(([nombre, distrito, anillos]) => ({ nombre, distrito, anillos: decodificarLineas(anillos) }));
    const vias = doc.vias.map(([id, nombre, tipo, jugable, lineas, enBarrios, parque]) => {
      const l = decodificarLineas(lineas);
      return { id, nombre, tipo, jugable: jugable === 1, lineas: l, caja: cajaDe(l), clave: normalizar(nombre), barrios: (enBarrios || []).map(i => barrios[i]).filter(Boolean), parque: parque || 0 };
    });
    // [id, nombre, categoría, dirección, x, y (×100 000), barrios, parque, radio, fuente]
    // radio: metros alrededor del punto que son el propio lugar (un parque, un polígono).
    const lugares = (doc.lugares || []).map(([id, nombre, categoria, direccion, x, y, enBarrios, parque, radio]) => ({
      id, nombre, categoria, direccion, lat: y / 1e5, lng: x / 1e5,
      barrios: (enBarrios || []).map(i => barrios[i]).filter(Boolean), parque: parque || 0, radio: radio || 0
    }));
    const lineaParques = doc.parques && doc.parques.linea ? decodificarLineas([doc.parques.linea])[0] : null;
    const porNombre = new Map();
    vias.forEach(v => {
      const k = v.nombre.toLowerCase();
      if(!porNombre.has(k)) porNombre.set(k, []);
      porNombre.get(k).push(v);
    });
    const distritos = [...new Set(barrios.map(b => b.distrito).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
    return { version: doc.version, vias, porNombre, jugables: vias.filter(v => v.jugable), rio: decodificarLineas(doc.rio || []), barrios, distritos, lugares, lineaParques };
  }

  /* ---------- zonas ---------- */
  function zonaValida(z){
    if(!z || !datos) return !z;
    if(z === 'fuera') return datos.barrios.length > 0;
    if(z.startsWith('d:')) return datos.distritos.includes(z.slice(2));
    if(z.startsWith('b:')) return datos.barrios.some(b => b.nombre === z.slice(2));
    return false;
  }
  function enZona(v){
    if(!zona) return true;
    if(zona === 'fuera') return v.barrios.length === 0;
    if(zona.startsWith('d:')) return v.barrios.some(b => b.distrito === zona.slice(2));
    return v.barrios.some(b => b.nombre === zona.slice(2));
  }
  function nombreZona(){
    if(!zona) return 'Toda Córdoba';
    if(zona === 'fuera') return 'Afueras y pedanías';
    if(zona.startsWith('d:')) return 'Distrito ' + zona.slice(2);
    return zona.slice(2);
  }
  function barriosDeZona(){
    if(!zona || zona === 'fuera') return [];
    if(zona.startsWith('d:')) return datos.barrios.filter(b => b.distrito === zona.slice(2));
    return datos.barrios.filter(b => b.nombre === zona.slice(2));
  }
  function cambiarZona(z){
    zona = z || '';
    try{ localStorage.setItem(ZONA_KEY, zona); }catch(e){}
    pintarInicio();
  }
  function selectorZona(){
    if(!datos.barrios.length) return '';
    const op = (v, t) => '<option value="' + escapeHtml(v) + '"' + (v === zona ? ' selected' : '') + '>' + escapeHtml(t) + '</option>';
    let html = '<select class="cj-zona-select" id="cjZona" onchange="CJ.cambiarZona(this.value)" aria-label="Zona de estudio">' + op('', 'Toda Córdoba');
    html += '<optgroup label="Distritos">' + datos.distritos.map(d => op('d:' + d, 'Distrito ' + d)).join('') + '</optgroup>';
    datos.distritos.forEach(d => {
      html += '<optgroup label="Barrios · ' + escapeHtml(d) + '">' +
        datos.barrios.filter(b => b.distrito === d).map(b => op('b:' + b.nombre, b.nombre)).join('') + '</optgroup>';
    });
    html += '<optgroup label="Fuera de los barrios">' + op('fuera', 'Afueras y pedanías') + '</optgroup></select>';
    return html;
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
  // id: el de la vía, o el de un lugar en negativo (así no se mezclan).
  function anotarIntento(id, modoIntento, acierto, distancia){
    const r = progreso.get(id) || { intentos: 0, aciertos: 0 };
    progreso.set(id, { intentos: r.intentos + 1, aciertos: r.aciertos + (acierto ? 1 : 0), ultimo_acierto: acierto });
    const fila = { id_vial: id, modo: modoIntento, acierto, created_at: new Date().toISOString() };
    if(distancia != null) fila.distancia_m = Math.round(distancia);
    guardarPendientes(pendientes().concat([fila]));
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
    capaZona = L.layerGroup().addTo(mapa);
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

  // Dibuja el contorno de la zona elegida y centra el mapa en ella.
  function pintarZona(){
    capaZona.clearLayers();
    barriosDeZona().forEach(b => {
      L.polyline(b.anillos, { color: '#F2665C', weight: 2.5, opacity: 0.9, dashArray: '6 6', interactive: false }).addTo(capaZona);
    });
  }
  function irAZona(animado){
    const vias = zona ? datos.vias.filter(enZona) : [];
    if(!vias.length){ animado ? mapa.flyTo(CENTRO, 14, { duration: 0.6 }) : mapa.setView(CENTRO, 14); return; }
    const b = limitesDe(vias);
    animado ? mapa.flyToBounds(b, { padding: [30, 30], maxZoom: 16, duration: 0.6 }) : mapa.fitBounds(b, { padding: [30, 30], maxZoom: 16 });
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
    if(!zonaValida(zona)) zona = '';
    const jugables = datos.jugables.filter(enZona);
    const total = jugables.length;
    let dominadas = 0, vistas = 0, fallos = 0;
    jugables.forEach(v => {
      const p = progreso.get(v.id);
      if(!p) return;
      vistas++;
      if(p.ultimo_acierto) dominadas++; else fallos++;
    });
    const pct = total ? Math.round(dominadas * 100 / total) : 0;
    const nombresZona = new Set(jugables.map(v => v.nombre)).size;
    root.innerHTML =
      (datos.barrios.length
        ? '<div class="cj-card cj-zona">' +
            '<div class="cj-card-title">Qué estudiar</div>' +
            selectorZona() +
            '<div class="cj-zona-info">' + nombresZona.toLocaleString('es-ES') + ' calles en ' + escapeHtml(nombreZona()) + '</div>' +
          '</div>'
        : '') +
      '<div class="cj-card">' +
        '<div class="cj-card-title">Tu callejero' + (zona ? ' · ' + escapeHtml(nombreZona()) : '') + '</div>' +
        '<div class="cj-pct"><span>' + pct + '%</span> dominado</div>' +
        '<div class="cj-bar"><div class="cj-bar-fill" style="width:' + pct + '%"></div></div>' +
        '<div class="cj-stats">' +
          '<div><b>' + dominadas + '</b><span>acertadas</span></div>' +
          '<div><b>' + fallos + '</b><span>por repasar</span></div>' +
          '<div><b>' + (total - vistas) + '</b><span>sin ver</span></div>' +
        '</div>' +
      '</div>' +
      '<div class="cj-seccion">Modos de juego</div>' +
      tarjetaModo('localiza', 'M20 10c0 4.99-5.54 10.19-7.4 11.8a1 1 0 0 1-1.2 0C9.54 20.19 4 14.99 4 10a8 8 0 0 1 16 0|circle:12,10,3',
        'Te damos el nombre de una vía y la tocas en el mapa.') +
      tarjetaModo('opciones', 'M9 11l3 3L22 4|M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11',
        'Te marcamos una calle en el mapa y eliges su nombre entre 4 calles cercanas.') +
      tarjetaModo('voz', 'M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z|M19 10v2a7 7 0 0 1-14 0v-2|M12 19v3',
        'Te marcamos una calle y dices en voz alta cómo se llama. Si aciertas, ✓; si no, ✗.') +
      tarjetaModo('cruces', 'M12 3v18|M3 12h18|M8 3v4|M16 17v4',
        '¿Qué calle cruza con esta? ¿Cuál es su paralela? Elige entre 4.') +
      (datos.lugares.length ? tarjetaModo('lugares', 'M3 21h18|M5 21V7l8-4v18|M19 21V11l-6-4|M9 9v.01|M9 12v.01|M9 15v.01|M9 18v.01',
        datos.lugares.length.toLocaleString('es-ES') + ' sitios: hospitales, colegios, monumentos, parques, polígonos... te damos el nombre y lo tocas en el mapa.') : '') +
      (datos.lineaParques ? tarjetaModo('parque', 'M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.43-2.29 1-3a2.5 2.5 0 0 0 2.5 2.5z',
        'Parque Central o Parque del Granadal, calle a calle y lugar a lugar (tema 48).') : '') +
      '<div class="cj-seccion">Estudiar</div>' +
      '<button type="button" class="cj-mode" onclick="CJ.estudio()">' +
        '<div class="cj-mode-icon cj-mode-icon-estudio"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 7v14"/><path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"/></svg></div>' +
        '<div class="cj-mode-text"><div class="cj-mode-title">Modo estudio</div>' +
        '<div class="cj-mode-desc">Explora el mapa a tu aire: toca cualquier calle para ver cómo se llama, o búscala por su nombre y te lleva hasta ella.</div></div>' +
      '</button>' +
      '<div class="cj-fuente">' + total.toLocaleString('es-ES') + ' vías de Córdoba del callejero oficial de la Junta de Andalucía (CDAU), revisado cada semana y cruzado con el callejero del INE. ' +
        'Rondas de hasta ' + PREGUNTAS_POR_RONDA + ' preguntas' + (zona ? ' de ' + escapeHtml(nombreZona()) : '') + '; primero salen las que fallaste.' +
        (datos.lineaParques ? ' Zonas de los parques según el documento oficial del S.E.I.S.; lo que está pegado a la línea no se pregunta.' : '') + '</div>';
  }

  // Tarjeta de un modo de juego. `icono`: trazados SVG separados por «|»
  // («circle:cx,cy,r» para un círculo).
  function tarjetaModo(m, icono, desc){
    const svg = icono.split('|').map(d => d.startsWith('circle:')
      ? '<circle cx="' + d.slice(7).split(',')[0] + '" cy="' + d.slice(7).split(',')[1] + '" r="' + d.slice(7).split(',')[2] + '"/>'
      : '<path d="' + d + '"/>').join('');
    return '<button type="button" class="cj-mode" onclick="CJ.empezar(\'' + m + '\')">' +
      '<div class="cj-mode-icon cj-mode-icon-' + m + '"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + svg + '</svg></div>' +
      '<div class="cj-mode-text"><div class="cj-mode-title">' + escapeHtml(MODOS[m].titulo) + '</div>' +
      '<div class="cj-mode-desc">' + desc + '</div></div>' +
    '</button>';
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

  /* ---------- cruces y paralelas (calculados con el trazado) ---------- */
  // Índice de todos los tramos de todas las vías en celdas de ~100 m, para
  // no comparar cada vía con las 3.600 restantes.
  const CELDA = 0.001;
  let indiceTramos = null;
  function celdasDe(a, b, margen){
    const out = [];
    const x0 = Math.floor((Math.min(a[1], b[1]) - margen) / CELDA), x1 = Math.floor((Math.max(a[1], b[1]) + margen) / CELDA);
    const y0 = Math.floor((Math.min(a[0], b[0]) - margen) / CELDA), y1 = Math.floor((Math.max(a[0], b[0]) + margen) / CELDA);
    for(let x = x0; x <= x1; x++) for(let y = y0; y <= y1; y++) out.push(x + '|' + y);
    return out;
  }
  function prepararIndice(){
    if(indiceTramos) return indiceTramos;
    indiceTramos = new Map();
    datos.vias.forEach(v => v.lineas.forEach(l => {
      for(let k = 0; k < l.length - 1; k++){
        const t = { v, a: l[k], b: l[k + 1], extA: k === 0, extB: k === l.length - 2 };
        celdasDe(t.a, t.b, 0).forEach(c => { if(!indiceTramos.has(c)) indiceTramos.set(c, []); indiceTramos.get(c).push(t); });
      }
    }));
    return indiceTramos;
  }
  // Metros entre un punto y un tramo (aproximación plana local).
  function distPuntoTramo(p, a, b){
    const kx = 111320 * Math.cos(p[0] * Math.PI / 180), ky = 110540;
    const ax = (a[1] - p[1]) * kx, ay = (a[0] - p[0]) * ky, bx = (b[1] - p[1]) * kx, by = (b[0] - p[0]) * ky;
    const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
    const t = L ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / L)) : 0;
    return Math.hypot(ax + t * dx, ay + t * dy);
  }
  function puntoMasCercano(p, a, b){
    const kx = Math.cos(p[0] * Math.PI / 180);
    const dx = (b[1] - a[1]) * kx, dy = b[0] - a[0], L = dx * dx + dy * dy;
    const t = L ? Math.max(0, Math.min(1, ((p[1] - a[1]) * kx * dx + (p[0] - a[0]) * dy) / L)) : 0;
    return [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
  }
  function seCortan(a, b, c, d){
    const o = (p, q, r) => Math.sign((q[1] - p[1]) * (r[0] - p[0]) - (q[0] - p[0]) * (r[1] - p[1]));
    return o(a, b, c) !== o(a, b, d) && o(c, d, a) !== o(c, d, b);
  }
  // Vías que cortan a v o que empiezan o acaban pegadas a ella (a menos de
  // 5 m: los cruces en T del trazado no siempre se tocan del todo).
  const cacheCruces = new Map();
  function crucesDe(v){
    if(cacheCruces.has(v.id)) return cacheCruces.get(v.id);
    const indice = prepararIndice();
    const out = new Set();
    v.lineas.forEach(l => {
      for(let k = 0; k < l.length - 1; k++){
        const a = l[k], b = l[k + 1], extA = k === 0, extB = k === l.length - 2;
        celdasDe(a, b, 0.00006).forEach(c => (indice.get(c) || []).forEach(t => {
          if(t.v === v || t.v.nombre === v.nombre || out.has(t.v)) return;
          if(seCortan(a, b, t.a, t.b) ||
             (t.extA && distPuntoTramo(t.a, a, b) < 5) || (t.extB && distPuntoTramo(t.b, a, b) < 5) ||
             (extA && distPuntoTramo(a, t.a, t.b) < 5) || (extB && distPuntoTramo(b, t.a, t.b) < 5)) out.add(t.v);
        }));
      }
    });
    cacheCruces.set(v.id, out);
    return out;
  }
  // Rumbo, longitud y rectitud del tramo más largo de una vía.
  function forma(v){
    if(v._forma) return v._forma;
    const kx = 111320 * Math.cos(37.88 * Math.PI / 180), ky = 110540;
    let mejor = null;
    v.lineas.forEach(l => {
      let largo = 0;
      for(let k = 0; k < l.length - 1; k++) largo += Math.hypot((l[k + 1][1] - l[k][1]) * kx, (l[k + 1][0] - l[k][0]) * ky);
      if(!mejor || largo > mejor.largo) mejor = { l, largo };
    });
    const a = mejor.l[0], b = mejor.l[mejor.l.length - 1];
    const dx = (b[1] - a[1]) * kx, dy = (b[0] - a[0]) * ky, cuerda = Math.hypot(dx, dy);
    v._forma = { a, b, largo: mejor.largo, recta: mejor.largo ? cuerda / mejor.largo : 0, ux: cuerda ? dx / cuerda : 0, uy: cuerda ? dy / cuerda : 0, kx, ky };
    return v._forma;
  }
  function anguloEntre(f, g){ return Math.acos(Math.min(1, Math.abs(f.ux * g.ux + f.uy * g.uy))) * 180 / Math.PI; }
  // Paralelas de v: vías rectas, de más de 120 m, casi con el mismo rumbo
  // (menos de 12°), que no la cruzan, a entre 25 y 250 m y que corren a su
  // lado al menos la mitad de la más corta. De la más cercana a la más lejana.
  function paralelasDe(v){
    const f = forma(v);
    if(f.largo < 120 || f.recta < 0.9) return [];
    const cruza = crucesDe(v);
    const out = [];
    const cerca = datos.vias.filter(w => w !== v && w.nombre !== v.nombre && !cruza.has(w) &&
      w.caja.s < v.caja.n + 0.003 && w.caja.n > v.caja.s - 0.003 && w.caja.o < v.caja.e + 0.003 && w.caja.e > v.caja.o - 0.003);
    for(const w of cerca){
      const g = forma(w);
      if(g.largo < 120 || g.recta < 0.9 || anguloEntre(f, g) > 12) continue;
      const pos = p => { const x = (p[1] - f.a[1]) * f.kx, y = (p[0] - f.a[0]) * f.ky; return { a: x * f.ux + y * f.uy, d: Math.abs(-x * f.uy + y * f.ux) }; };
      const pa = pos(g.a), pb = pos(g.b), m = pos([(g.a[0] + g.b[0]) / 2, (g.a[1] + g.b[1]) / 2]);
      if(m.d < 25 || m.d > 250) continue;
      const solape = Math.min(f.largo, Math.max(pa.a, pb.a)) - Math.max(0, Math.min(pa.a, pb.a));
      if(solape < 0.5 * Math.min(f.largo, g.largo)) continue;
      out.push({ w, d: m.d });
    }
    return out.sort((x, y) => x.d - y.d).map(x => x.w);
  }
  // Vías jugables cercanas a v, de la más cercana a la más lejana.
  function viasCercanasA(v, cuantas){
    const c = [(v.caja.s + v.caja.n) / 2, (v.caja.o + v.caja.e) / 2];
    return datos.jugables.filter(w => w.nombre !== v.nombre)
      .map(w => ({ w, d: Math.hypot((w.caja.s + w.caja.n) / 2 - c[0], ((w.caja.o + w.caja.e) / 2 - c[1]) * 0.79) }))
      .sort((a, b) => a.d - b.d).slice(0, cuantas).map(x => x.w);
  }

  /* ---------- preguntas de cada modo ---------- */
  function barajar(a){ return shuffleArray(a); }
  // Orden de las preguntas: primero las falladas (hasta el 40 %), luego las
  // que no han salido nunca y luego las ya acertadas; sin repetir nombre.
  function ordenarPorRepaso(items, idDe){
    const falladas = [], nuevas = [], acertadas = [];
    items.forEach(x => {
      const p = progreso.get(idDe(x));
      if(!p) nuevas.push(x);
      else if(!p.ultimo_acierto) falladas.push(x);
      else acertadas.push(x);
    });
    const out = barajar(falladas).slice(0, Math.ceil(PREGUNTAS_POR_RONDA * 0.4));
    return out.concat(barajar(nuevas), barajar(acertadas), barajar(falladas).slice(out.length));
  }
  function sinRepetirNombre(items, n, crear){
    const usados = new Set(), out = [];
    for(const x of items){
      if(out.length >= n) break;
      if(usados.has(x.nombre)) continue;
      const q = crear(x);
      if(!q) continue;
      usados.add(x.nombre);
      out.push(q);
    }
    return barajar(out);
  }
  function opcionesCon(correcta, otras){
    const lista = barajar([correcta].concat(otras.slice(0, 3)));
    return { opciones: lista, correcta: lista.indexOf(correcta) };
  }
  function crearPreguntas(m){
    const n = PREGUNTAS_POR_RONDA;
    const vias = datos.jugables.filter(enZona);
    if(m === 'localiza'){
      return sinRepetirNombre(ordenarPorRepaso(vias, v => v.id), n, v => ({ via: v, id: v.id, etiqueta: 'Localiza', texto: v.nombre, nombre: v.nombre }));
    }
    if(m === 'opciones'){
      return sinRepetirNombre(ordenarPorRepaso(vias, v => v.id), n, v => {
        const otras = [...new Set(viasCercanasA(v, 12).map(w => w.nombre))].slice(0, 3);
        if(otras.length < 3) return null;
        return Object.assign({ via: v, id: v.id, etiqueta: '¿Cómo se llama la calle marcada?', texto: '', nombre: v.nombre }, opcionesCon(v.nombre, otras));
      });
    }
    if(m === 'voz'){
      return sinRepetirNombre(ordenarPorRepaso(vias, v => v.id), n, v => ({ via: v, id: v.id, etiqueta: 'Di el nombre de la calle marcada', texto: '', nombre: v.nombre }));
    }
    if(m === 'cruces'){
      let turno = 0;
      return sinRepetirNombre(ordenarPorRepaso(vias, v => v.id), n, v => {
        const cruza = crucesDe(v);
        const nombresCruce = new Set([...cruza].map(w => w.nombre));
        // Se alternan: cruces, cruces, paralela... Si a esta vía no se le
        // encuentra paralela, sale de cruce y la paralela se intenta con la siguiente.
        const quierePar = (turno % 3) === 2;
        if(quierePar){
          const par = paralelasDe(v).filter(w => w.jugable);
          if(par.length){
            // Opciones falsas: primero calles que la cruzan en perpendicular y,
            // si no hay bastantes, calles cercanas que no le van paralelas.
            const nombresPar = new Set(paralelasDe(v).map(w => w.nombre));
            const valeFalsa = w => w.jugable && !nombresPar.has(w.nombre) && anguloEntre(forma(v), forma(w)) > 35;
            const perp = barajar([...new Set([...cruza].filter(valeFalsa).map(w => w.nombre))]);
            const cerca = viasCercanasA(v, 30).filter(valeFalsa).map(w => w.nombre);
            const otras = [...new Set(perp.concat(cerca))];
            if(otras.length >= 3){
              turno++;
              return Object.assign({ via: v, id: v.id, etiqueta: '¿Cuál de estas calles es paralela a…?', texto: v.nombre, nombre: v.nombre, tipoCruce: 'paralela', solucion: par[0] },
                opcionesCon(par[0].nombre, otras));
            }
          }
        }
        const cruces = [...cruza].filter(w => w.jugable);
        if(!cruces.length) return null;
        const sol = cruces[Math.floor(Math.random() * cruces.length)];
        const otras = [...new Set(viasCercanasA(v, 30).filter(w => !nombresCruce.has(w.nombre) && !cruza.has(w)).map(w => w.nombre))];
        if(otras.length < 3) return null;
        if(!quierePar) turno++;
        return Object.assign({ via: v, id: v.id, etiqueta: '¿Cuál de estas calles cruza con…?', texto: v.nombre, nombre: v.nombre, tipoCruce: 'cruce', solucion: sol },
          opcionesCon(sol.nombre, barajar(otras.slice(0, 8))));
      });
    }
    if(m === 'lugares'){
      const lugares = datos.lugares.filter(enZona);
      return sinRepetirNombre(ordenarPorRepaso(lugares, l => -l.id), n, l => ({ lugar: l, id: -l.id, etiqueta: 'Localiza · ' + l.categoria, texto: l.nombre, nombre: l.nombre }));
    }
    if(m === 'parque'){
      const items = vias.filter(v => v.parque).map(v => ({ via: v, nombre: v.nombre, id: v.id, parque: v.parque }))
        .concat(datos.lugares.filter(l => l.parque && enZona(l)).map(l => ({ lugar: l, nombre: l.nombre, id: -l.id, parque: l.parque })));
      return sinRepetirNombre(ordenarPorRepaso(items, x => x.id), n, x => Object.assign({}, x, {
        etiqueta: '¿Qué parque de bomberos acude?', texto: x.nombre + (x.lugar ? ' · ' + x.lugar.categoria : ''),
        opciones: [PARQUES[1], PARQUES[2]], correcta: x.parque - 1
      }));
    }
    return [];
  }

  async function empezar(m){
    m = MODOS[m] ? m : 'localiza';
    try{
      await Promise.all([cargarLeaflet(), cargarDatos()]);
    }catch(e){
      uiToast(e.message, 'error');
      return;
    }
    if(m === 'lugares' && !datos.lugares.length){ uiToast('Todavía no hay lugares importantes publicados.', 'info'); return; }
    if(m === 'parque' && !datos.lineaParques){ uiToast('Todavía no está publicada la zona de cada parque.', 'info'); return; }
    const preguntas = crearPreguntas(m);
    if(!preguntas.length){ uiToast('No hay preguntas de este tipo en esta zona.', 'info'); return; }
    ronda = { preguntas, i: 0, aciertos: 0, fallos: [], respondida: false };
    modo = m;
    mostrarVista('juego');
    ponerInterfaz();
    crearMapa();
    pintarZona();
    irAZona(false);
    siguientePregunta(true);
  }

  // Lo que se ve encima y dentro del mapa depende del modo.
  function ponerInterfaz(){
    const estudio = modo === 'estudio';
    const respuesta = estudio ? null : MODOS[modo].respuesta;
    el('cjOpciones').classList.toggle('hidden', respuesta !== 'opciones');
    el('cjOpciones').innerHTML = '';
    el('cjVoz').classList.toggle('hidden', respuesta !== 'voz');
    // Con botones debajo de la pregunta, el mapa se hace más bajo.
    document.getElementById('screen-callejero').classList.toggle('cj-con-respuesta', respuesta === 'opciones' || respuesta === 'voz');
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
    el('cjLista').classList.add('hidden');
    const boton = el('cjListaBoton');
    if(estudio && zona){
      const n = new Set(datos.vias.filter(enZona).map(v => v.nombre)).size;
      boton.textContent = 'Calles de ' + nombreZona() + ' (' + n + ')';
      boton.classList.remove('hidden');
    }else boton.classList.add('hidden');
  }

  // Lista alfabética de las calles de la zona, sobre el mapa.
  let listaZona = [];
  function alternarLista(){
    const caja = el('cjLista');
    if(!caja.classList.contains('hidden')){ caja.classList.add('hidden'); return; }
    const vistos = new Set();
    listaZona = datos.vias.filter(enZona).filter(v => !vistos.has(v.clave) && vistos.add(v.clave))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
    caja.innerHTML = listaZona.map((v, i) => '<button type="button" class="cj-lista-item" onclick="CJ.elegirDeLista(' + i + ')">' + escapeHtml(v.nombre) + '</button>').join('');
    caja.scrollTop = 0;
    caja.classList.remove('hidden');
  }
  function elegirDeLista(i){
    const v = listaZona[i];
    if(!v) return;
    el('cjLista').classList.add('hidden');
    seleccionar(v, true);
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
    pintarZona();
    irAZona(false);
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
    el('cjPreguntaLabel').textContent = q.etiqueta;
    el('cjPregunta').textContent = q.texto;
    el('cjPregunta').classList.toggle('hidden', !q.texto);
  }

  // Dibuja una vía resaltada (borde suave + línea) en la capa de marcas.
  function resaltar(v, color, fuerte){
    L.polyline(v.lineas, { color, weight: fuerte ? 10 : 8, opacity: 0.3, interactive: false }).addTo(capaMarcas);
    L.polyline(v.lineas, { color, weight: fuerte ? 4.5 : 3.5, opacity: 1, interactive: false }).addTo(capaMarcas);
  }
  function verVias(vias, extra){
    const b = limitesDe(vias);
    if(extra) b.extend(extra);
    mapa.flyToBounds(b, { paddingTopLeft: [50, 50], paddingBottomRight: [50, 120], maxZoom: 17, duration: 0.6 });
  }

  function siguientePregunta(primera){
    if(!primera) ronda.i++;
    if(ronda.i >= ronda.preguntas.length){ terminar(); return; }
    ronda.respondida = false;
    capaMarcas.clearLayers();
    el('cjResultado').className = 'cj-resultado hidden';
    pintarCabecera();
    const q = ronda.preguntas[ronda.i];
    // Opciones o botones de voz
    const tipo = MODOS[modo].respuesta;
    const caja = el('cjOpciones');
    if(tipo === 'opciones'){
      caja.innerHTML = q.opciones.map((o, i) => '<button type="button" class="cj-opcion" onclick="CJ.responderOpcion(' + i + ')">' + escapeHtml(o) + '</button>').join('');
      caja.classList.toggle('cj-opciones-dos', q.opciones.length === 2);
    }
    if(tipo === 'voz') prepararVoz();
    mapa.invalidateSize();
    // Lo que se ve en el mapa antes de responder
    if(q.via && (modo === 'opciones' || modo === 'voz')){
      resaltar(q.via, '#F2665C', true);
      verVias([q.via]);
    }else if(modo === 'cruces'){
      resaltar(q.via, '#4E9BF7', true);
      verVias([q.via]);
    }else if(!primera){
      irAZona(true);
    }
  }

  function marcarRespondida(acierto, textoHtml, distancia, modoIntento){
    ronda.respondida = true;
    const q = ronda.preguntas[ronda.i];
    if(acierto) ronda.aciertos++; else ronda.fallos.push(q);
    anotarIntento(q.id, modoIntento || modo, acierto, distancia);
    el('cjResultado').className = 'cj-resultado ' + (acierto ? 'ok' : 'ko');
    el('cjResultadoTexto').innerHTML = textoHtml;
    el('cjAciertos').textContent = textoAciertos();
    el('cjSiguiente').textContent = ronda.i + 1 >= ronda.preguntas.length ? 'Ver resultado' : 'Siguiente';
  }

  // Modos en los que se toca el mapa: localiza (vía) y lugares (punto).
  function responder(latlng){
    if(!ronda || ronda.respondida || MODOS[modo].respuesta !== 'toque') return;
    const q = ronda.preguntas[ronda.i];
    const pxEnMetros = mapa.distance(mapa.containerPointToLatLng([0, 0]), mapa.containerPointToLatLng([TOLERANCIA_PX, 0]));
    if(q.lugar){
      const l = q.lugar;
      // En los lugares grandes (un parque, el aeropuerto) vale tocar dentro;
      // la distancia del fallo se cuenta hasta su borde.
      const dist = Math.max(0, mapa.distance(latlng, [l.lat, l.lng]) - l.radio);
      const acierto = dist <= Math.max(TOLERANCIA_LUGAR_M, pxEnMetros);
      L.circleMarker(latlng, { radius: 7, color: '#fff', weight: 2, fillColor: acierto ? '#34D399' : '#F2665C', fillOpacity: 1, interactive: false }).addTo(capaMarcas);
      if(l.radio > 20) L.circle([l.lat, l.lng], { radius: l.radio, color: '#34D399', weight: 3, fillColor: '#34D399', fillOpacity: 0.2, interactive: false }).addTo(capaMarcas);
      else L.circleMarker([l.lat, l.lng], { radius: 11, color: '#34D399', weight: 3, fillColor: '#34D399', fillOpacity: 0.35, interactive: false }).addTo(capaMarcas);
      if(!acierto) mapa.flyToBounds(L.latLngBounds([latlng, [l.lat, l.lng]]), { paddingTopLeft: [60, 60], paddingBottomRight: [60, 130], maxZoom: 17, duration: 0.7 });
      const dir = l.direccion ? ' <span class="cj-dir">' + escapeHtml(l.direccion) + '</span>' : '';
      marcarRespondida(acierto, acierto
        ? '<b>¡Correcto!</b> ' + escapeHtml(l.nombre) + '.' + dir
        : '<b>Fallo.</b> Te has quedado a ' + formatearDistancia(dist) + '. En verde, dónde está.' + dir, dist);
      return;
    }
    const candidatas = datos.porNombre.get(q.via.nombre.toLowerCase()) || [q.via];
    let mejor = q.via, dist = Infinity;
    candidatas.forEach(v => {
      const d = distanciaAVia(latlng.lat, latlng.lng, v);
      if(d < dist){ dist = d; mejor = v; }
    });
    const acierto = dist <= Math.max(TOLERANCIA_M, pxEnMetros);
    L.circleMarker(latlng, { radius: 7, color: '#fff', weight: 2, fillColor: acierto ? '#34D399' : '#F2665C', fillOpacity: 1, interactive: false }).addTo(capaMarcas);
    (acierto ? [mejor] : candidatas).forEach(v => resaltar(v, '#34D399'));
    if(!acierto) verVias(candidatas, latlng);
    marcarRespondida(acierto, acierto
      ? '<b>¡Correcto!</b> ' + escapeHtml(q.via.nombre)
      : '<b>Fallo.</b> Te has quedado a ' + formatearDistancia(dist) + '. En verde, dónde está.', dist);
  }

  function responderOpcion(i){
    if(!ronda || ronda.respondida) return;
    const q = ronda.preguntas[ronda.i];
    const acierto = i === q.correcta;
    document.querySelectorAll('#cjOpciones .cj-opcion').forEach((b, k) => {
      b.disabled = true;
      if(k === q.correcta) b.classList.add('correcta');
      else if(k === i) b.classList.add('incorrecta');
    });
    let texto;
    if(modo === 'opciones'){
      texto = acierto ? '<b>¡Correcto!</b> Es ' + escapeHtml(q.via.nombre) + '.' : '<b>Fallo.</b> Es ' + escapeHtml(q.via.nombre) + '.';
    }else if(modo === 'cruces'){
      // Se ve la vía de la pregunta (azul), la solución (verde) y, si se falló, la elegida (rojo).
      capaMarcas.clearLayers();
      resaltar(q.via, '#4E9BF7', true);
      resaltar(q.solucion, '#34D399');
      // (solo los trozos a menos de ~2 km: hay nombres repetidos en otras barriadas)
      const cerca = w => Math.abs((w.caja.s + w.caja.n) - (q.via.caja.s + q.via.caja.n)) / 2 < 0.02 && Math.abs((w.caja.o + w.caja.e) - (q.via.caja.o + q.via.caja.e)) / 2 < 0.025;
      const elegidas = !acierto ? (datos.porNombre.get(q.opciones[i].toLowerCase()) || []).filter(cerca) : [];
      elegidas.forEach(w => resaltar(w, '#F2665C'));
      verVias([q.via, q.solucion].concat(elegidas));
      const rel = q.tipoCruce === 'paralela' ? 'es paralela a' : 'cruza con';
      texto = (acierto ? '<b>¡Correcto!</b> ' : '<b>Fallo.</b> ') + escapeHtml(q.solucion.nombre) + ' ' + rel + ' ' + escapeHtml(q.via.nombre) + '.';
    }else if(modo === 'parque'){
      // Se ve la línea divisoria y dónde está lo preguntado.
      capaMarcas.clearLayers();
      L.polyline(datos.lineaParques, { color: '#A855F7', weight: 4.5, opacity: 0.95, dashArray: '10 8', interactive: false }).addTo(capaMarcas);
      let centro;
      if(q.via){ resaltar(q.via, '#34D399', true); centro = [(q.via.caja.s + q.via.caja.n) / 2, (q.via.caja.o + q.via.caja.e) / 2]; }
      else{
        L.circleMarker([q.lugar.lat, q.lugar.lng], { radius: 11, color: '#34D399', weight: 3, fillColor: '#34D399', fillOpacity: 0.35, interactive: false }).addTo(capaMarcas);
        centro = [q.lugar.lat, q.lugar.lng];
      }
      // Encuadre con lo preguntado y el trozo de línea más cercano, para ver a qué lado cae.
      let cerca = datos.lineaParques[0], dMin = Infinity;
      for(let k = 0; k < datos.lineaParques.length - 1; k++){
        const a = datos.lineaParques[k], b = datos.lineaParques[k + 1];
        const d = distPuntoTramo(centro, a, b);
        if(d < dMin){ dMin = d; cerca = puntoMasCercano(centro, a, b); }
      }
      const caja = q.via ? limitesDe([q.via]) : L.latLngBounds([centro, centro]);
      mapa.flyToBounds(caja.extend(cerca), { paddingTopLeft: [40, 40], paddingBottomRight: [40, 130], maxZoom: 16, duration: 0.6 });
      const lado = q.parque === 2 ? 'al este' : 'al oeste';
      texto = (acierto ? '<b>¡Correcto!</b> ' : '<b>Fallo.</b> ') + 'Acude el ' + PARQUES[q.parque] + ': está ' + lado + ' de la línea (en morado).';
    }
    marcarRespondida(acierto, texto, null);
  }

  /* ---------- modo «Dilo en voz alta» ---------- */
  // «calle san agustín», «San Agustin» o «avenida del gran capitan» valen
  // para «Calle San Agustín» / «Avenida del Gran Capitán».
  function distanciaEdicion(a, b){
    const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
    for(let j = 1; j <= b.length; j++) d[0][j] = j;
    for(let i = 1; i <= a.length; i++) for(let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return d[a.length][b.length];
  }
  function limpiarNombre(t){ return normalizar(t).replace(/[^a-z0-9ñ ]/g, ' ').replace(/\s+/g, ' ').trim(); }
  // Tipos de vía (y sus abreviaturas) y artículos que se pueden omitir.
  const TIPOS_OMITIBLES = /^(calle|c|cl|avenida|avda|av|plaza|pza|pl|paseo|p|po|glorieta|gta|ronda|rda|carretera|ctra|camino|cm|pasaje|pje|calleja|travesia|trv|urbanizacion|urb|barriada|bda|callejon|cjon|plazuela|puente|bulevar|via|vereda|sendero|parque|jardines|jardin|grupo|poligono|pol|enlace|autovia|acceso|carril|huerta|prolongacion|ramal|zona|lugar|aldea)\s+/;
  const ARTICULOS = /^(de los|de las|de la|del|de|los|las|la|el)\s+/;
  function nucleo(t){ return limpiarNombre(t).replace(TIPOS_OMITIBLES, '').replace(ARTICULOS, ''); }
  function nombreCorrecto(dicho, v){
    const e = limpiarNombre(dicho);
    if(!e) return false;
    const parecido = (a, b) => distanciaEdicion(a, b) <= (b.length <= 6 ? 0 : b.length <= 12 ? 1 : 2);
    // Lo que va entre paréntesis («Calle Mirtos (Córdoba la Vieja)») solo
    // distingue nombres repetidos: se puede decir o no.
    const formas = [v.nombre, v.nombre.replace(/\s*\([^)]*\)/g, '')];
    return formas.some(n => parecido(e, limpiarNombre(n)) || (nucleo(n).length > 0 && parecido(nucleo(dicho), nucleo(n))));
  }

  const Reconocedor = window.SpeechRecognition || window.webkitSpeechRecognition;
  let reconocedor = null;
  let sinMicro = false;      // se denegó el micrófono: solo «Ver respuesta»
  function hayMicro(){ return !!Reconocedor && !sinMicro; }
  // Botones de la pregunta: micrófono y «Ver respuesta»; tras ver la
  // respuesta (o si la voz entendió otra cosa), ✓ y ✗.
  function prepararVoz(){
    pararEscucha();
    ronda.vozPendiente = false;
    const mic = el('cjVozMic');
    mic.classList.toggle('hidden', !hayMicro());
    mic.classList.remove('escuchando');
    mic.disabled = false;
    el('cjVozMicTexto').textContent = 'Pulsa y di el nombre';
    el('cjVozVer').classList.remove('hidden');
    el('cjVozVer').textContent = hayMicro() ? 'Ver respuesta' : 'Dilo en voz alta y pulsa aquí para ver la respuesta';
    el('cjVozSi').classList.add('hidden');
    el('cjVozNo').classList.add('hidden');
  }
  function pararEscucha(){
    if(!reconocedor) return;
    const r = reconocedor;
    reconocedor = null;
    r.onresult = r.onerror = r.onend = null;
    try{ r.abort(); }catch(e){}
  }
  function revelarNombre(){
    const q = ronda.preguntas[ronda.i];
    el('cjPregunta').textContent = q.via.nombre;
    el('cjPregunta').classList.remove('hidden');
  }
  function escuchar(){
    if(!ronda || ronda.respondida || ronda.vozPendiente || !hayMicro()) return;
    if(reconocedor){ pararEscucha(); prepararVoz(); return; }
    const q = ronda.preguntas[ronda.i];
    const r = new Reconocedor();
    r.lang = 'es-ES';
    r.interimResults = true;
    r.maxAlternatives = 5;
    r.continuous = false;
    const oidos = [];
    const mic = el('cjVozMic');
    mic.classList.add('escuchando');
    el('cjVozMicTexto').textContent = 'Te escucho…';
    r.onresult = ev => {
      let provisional = '';
      for(let k = ev.resultIndex; k < ev.results.length; k++){
        const res = ev.results[k];
        if(res.isFinal) for(let a = 0; a < res.length; a++) oidos.push(res[a].transcript);
        else provisional += res[0].transcript;
      }
      if(provisional) el('cjVozMicTexto').textContent = '«' + provisional.trim() + '…»';
    };
    r.onerror = ev => {
      if(ev.error === 'not-allowed' || ev.error === 'service-not-allowed'){
        sinMicro = true;
        uiToast('Sin permiso para el micrófono: di el nombre en voz alta y pulsa «Ver respuesta».', 'info');
      }else if(ev.error === 'network'){
        uiToast('El reconocimiento de voz necesita conexión. Puedes usar «Ver respuesta».', 'info');
      }
    };
    r.onend = () => {
      if(reconocedor !== r) return;
      reconocedor = null;
      if(!ronda || ronda.respondida || ronda.preguntas[ronda.i] !== q) return;
      if(!oidos.length){
        prepararVoz();
        if(hayMicro()) uiToast('No te he oído. Pulsa el micrófono y dilo otra vez.', 'info');
        return;
      }
      const acierto = oidos.some(t => nombreCorrecto(t, q.via));
      const dicho = (acierto ? oidos.find(t => nombreCorrecto(t, q.via)) : oidos[0]).trim();
      revelarNombre();
      mic.classList.remove('escuchando');
      mic.classList.add('hidden');
      el('cjVozVer').classList.add('hidden');
      if(acierto){
        marcarRespondida(true, '<span class="cj-marca ok">✓</span> <b>¡Correcto!</b> ' + escapeHtml(q.via.nombre) + '. <span class="cj-dir">He oído «' + escapeHtml(dicho) + '».</span>', null);
        return;
      }
      // Puede que la voz entendiera mal: se enseña lo oído y se deja
      // corregir. Si se pasa a la siguiente, cuenta como fallo.
      ronda.vozPendiente = true;
      el('cjVozSi').textContent = '✓ Lo dije bien';
      el('cjVozSi').classList.remove('hidden');
      el('cjResultado').className = 'cj-resultado ko';
      el('cjResultadoTexto').innerHTML = '<span class="cj-marca ko">✗</span> He oído «' + escapeHtml(dicho) + '». Es <b>' + escapeHtml(q.via.nombre) + '</b>.';
      el('cjSiguiente').textContent = ronda.i + 1 >= ronda.preguntas.length ? 'Ver resultado' : 'Siguiente';
    };
    reconocedor = r;
    try{ r.start(); }catch(e){ reconocedor = null; prepararVoz(); }
  }
  // Sin voz (o para comprobarlo uno mismo): se ve el nombre y se marca ✓ o ✗.
  function verRespuesta(){
    if(!ronda || ronda.respondida || ronda.vozPendiente) return;
    pararEscucha();
    ronda.vozPendiente = true;
    revelarNombre();
    el('cjVozMic').classList.add('hidden');
    el('cjVozVer').classList.add('hidden');
    el('cjVozSi').textContent = '✓ Acertada';
    el('cjVozSi').classList.remove('hidden');
    el('cjVozNo').classList.remove('hidden');
  }
  function autoevaluar(acierto){
    if(!ronda || ronda.respondida || !ronda.vozPendiente) return;
    const q = ronda.preguntas[ronda.i];
    ronda.vozPendiente = false;
    el('cjVozSi').classList.add('hidden');
    el('cjVozNo').classList.add('hidden');
    marcarRespondida(acierto, acierto
      ? '<span class="cj-marca ok">✓</span> <b>¡Correcto!</b> ' + escapeHtml(q.via.nombre) + '.'
      : '<span class="cj-marca ko">✗</span> <b>Fallo.</b> Es ' + escapeHtml(q.via.nombre) + '.', null);
  }
  function siguiente(){
    if(ronda && !ronda.respondida){
      if(!ronda.vozPendiente) return;
      autoevaluar(false);
    }
    siguientePregunta(false);
  }

  function formatearDistancia(m){
    return m >= 1000 ? (m / 1000).toFixed(1).replace('.', ',') + ' km' : Math.round(m) + ' m';
  }

  function terminar(){
    pararEscucha();
    const total = ronda.preguntas.length;
    const fallos = ronda.fallos;
    const m = modo;
    el('cjFin').innerHTML =
      '<div class="cj-card cj-fin">' +
        '<div class="cj-card-title">' + escapeHtml(MODOS[m].titulo) + ' · Resultado</div>' +
        '<div class="cj-pct"><span>' + ronda.aciertos + '</span> de ' + total + '</div>' +
        (fallos.length
          ? '<div class="cj-fin-sub">Para repasar (saldrán primero la próxima vez):</div><ul class="cj-fallos">' +
            fallos.map(q => '<li>' + escapeHtml(q.nombre) + (m === 'parque' ? ' <span class="cj-dir">· ' + escapeHtml(PARQUES[q.parque]) + '</span>' : '') + '</li>').join('') + '</ul>'
          : '<div class="cj-fin-sub">¡Todas bien!</div>') +
        '<div class="cj-fin-actions">' +
          '<button type="button" class="btn btn-primary btn-light" onclick="CJ.empezar(\'' + m + '\')">Otra ronda</button>' +
          '<button type="button" class="btn btn-ghost" onclick="CJ.salir()">Volver</button>' +
        '</div>' +
      '</div>';
    ronda = null;
    modo = null;
    mostrarVista('fin');
  }

  function salir(){
    pararEscucha();
    ronda = null;
    modo = null;
    mostrarVista('inicio');
    pintarInicio();
  }
  async function confirmarSalir(){
    if(modo !== 'estudio' && ronda && ronda.i > 0 && !(await uiConfirm('¿Salir de la ronda? Lo que ya has respondido queda guardado.'))) return;
    salir();
  }

  return { abrir, empezar, estudio, buscar, elegir, salir, cambiarZona, alternarLista, elegirDeLista, confirmarSalir,
    responderOpcion, escuchar, verRespuesta, autoevaluar, siguiente, refrescarTema };
})();
