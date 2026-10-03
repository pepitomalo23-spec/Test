/* =====================================================================
   Callejero en 3D: el modo «A pie de calle»
   =====================================================================
   Una vista en 3D, como si se estuviera en la calle, para adivinar cuál
   es. Todo gratis y sin claves:
   - el suelo es la ortofoto del PNOA, la misma del satélite del mapa
     (el vuelo más reciente y, si ese trozo falla, el PNOA de siempre);
   - los edificios, en relieve con su altura, son los de OpenStreetMap
     (en Córdoba vienen del Catastro), en los trozos de OpenFreeMap.
   MapLibre GL (el mapa en 3D) se carga solo al empezar el modo, de
   cdn.jsdelivr.net con SRI, como Leaflet en js/callejero.js.
   La cámara está en un punto de la calle, a la altura elegida (a pie,
   en un balcón o en un dron), y mira hacia donde se arrastre; «Avanzar»
   y «Atrás» la mueven por la calle (su tramo más largo). Al responder
   sube y se ve la calle en verde (la elegida, si se ha fallado, en rojo)
   y, en azul, dónde se estaba.
   Con la clave de Google, lo primero es Street View: la
   imagen de 360° del coche de Google, por la que se mira arrastrando y se
   avanza con las flechas, sin nombres de calles ni dirección. Se busca la
   imagen del coche más cercana a la calle (si no hay, esa pregunta va en
   3D) y se usa un solo panorama, que se cambia de sitio en cada pregunta
   (Google cobra cada panorama que se crea; los 5.000 primeros del mes son
   gratis). Al responder se ve en el mapa (js/callejero.js). Si la clave no
   vale o no hay conexión con Google, todo en 3D.
   Lo usa js/callejero.js (modo «calle3d»); aquí no se guarda nada.
   ===================================================================== */
const CJ3D = (function(){
  const ML_JS = 'https://cdn.jsdelivr.net/npm/maplibre-gl@5.24.0/dist/maplibre-gl.js';
  const ML_JS_SRI = 'sha384-5+cfbwT0iiub6VsQAdn6yz16nr6sDiQoHx6tm4O8OVYXHYOxcffFmCJBL0dgdvGp';
  const ML_CSS = 'https://cdn.jsdelivr.net/npm/maplibre-gl@5.24.0/dist/maplibre-gl.css';
  const ML_CSS_SRI = 'sha384-uTttxo/aOKbdE5RlD/SPzSDoDmNvGlUYPjONi2MN/b7c9HPSvW07OIuyP7uL6jxK';
  const EDIFICIOS = 'https://tiles.openfreemap.org/planet';
  const GOOGLE_JS = 'https://maps.googleapis.com/maps/api/js';
  const PNOA_RECIENTE = 'https://wms-pnoa.idee.es/pnoa-provisionales';
  const PNOA_WMS = 'https://www.ign.es/wms-inspire/pnoa-ma';
  // Altura de los ojos (m), cuánto se mira hacia abajo al llegar y hasta
  // dónde se puede bajar la vista (grados bajo el horizonte).
  const ALTURAS = {
    pie: { m: 1.7, abajo: 4, max: 55 },
    balcon: { m: 12, abajo: 14, max: 75 },
    dron: { m: 45, abajo: 30, max: 80 }
  };
  const ALTURA_KEY = 'cj_3d_altura';
  const CAMPO = 60;           // campo de visión vertical (grados)
  const PASO = 15;            // metros por «Avanzar»
  const RAD = Math.PI / 180;
  const KX = 111320 * Math.cos(37.88 * RAD), KY = 110540;   // metros por grado en Córdoba
  const VACIO = { type: 'FeatureCollection', features: [] };

  let promesa = null;         // carga de MapLibre en curso
  let promesaGoogle = null;   // carga de Street View en curso
  let SV = null;              // la librería de Street View de Google, ya cargada
  let googleMal = false;      // la clave no vale aquí (Google lo avisa): todo en 3D
  // La clave de navegador de Google Maps está en la base de datos y no en el
  // código, porque el repositorio es público (callejero_clave_google(), solo
  // con sesión). null: aún sin pedir; '': no hay (o no se ha podido pedir).
  let claveGoogle = null;
  let servicio = null, panorama = null;
  let enCalle = false;        // la pregunta de ahora va en Street View
  let turnoVer = 0;           // para no enseñar una calle que llega tarde
  let escuchandoCalle = false;
  let mapa = null;
  let cam = null;             // { camino, s, lat, lng, rumbo, abajo }
  let revelado = false;       // ya respondida: la cámara está arriba
  let arrastre = null, pendiente = false, escuchando = false;
  let marcas = VACIO;         // lo que se ve al responder
  let velo = 0;               // turno del «Cargando…» (para no quitar uno nuevo con un aviso viejo)
  let pistaVista = false, avisoTimer = null;
  let altura = 'pie';
  try{ if(ALTURAS[localStorage.getItem(ALTURA_KEY)]) altura = localStorage.getItem(ALTURA_KEY); }catch(e){}
  const el = id => document.getElementById(id);

  /* ---------- carga perezosa de Street View y de MapLibre ---------- */
  const usaGoogle = () => !!SV && !googleMal;
  // Lo que hace falta para empezar: Street View (con clave y conexión) o, si no, el 3D.
  async function cargar(){
    if(!googleMal && navigator.onLine !== false && await pedirClave()){
      try{ await cargarGoogle(); return; }catch(e){ /* sin Google: el 3D */ }
    }
    if(!webgl()) throw new Error('Este navegador no puede mostrar las calles en 3D.');
    await cargarMapLibre();
  }
  async function pedirClave(){
    if(claveGoogle !== null) return claveGoogle;
    try{
      const { data, error } = await sb.rpc('callejero_clave_google');
      if(error) return '';   // (sin conexión: se vuelve a pedir la próxima vez)
      claveGoogle = typeof data === 'string' && /^AIza[\w-]{30,}$/.test(data) ? data : '';
    }catch(e){ return ''; }
    return claveGoogle;
  }
  function cargarGoogle(){
    if(SV) return Promise.resolve();
    if(promesaGoogle) return promesaGoogle;
    promesaGoogle = new Promise((resolve, reject) => {
      const listo = '__cjGoogleListo';
      const fallo = e => { promesaGoogle = null; reject(e); };
      window[listo] = async () => {
        try{
          SV = await google.maps.importLibrary('streetView');
          servicio = new SV.StreetViewService();
          resolve();
        }catch(e){ fallo(e); }
      };
      // Google llama a esto si la clave no vale (o no vale desde esta web).
      window.gm_authFailure = () => { googleMal = true; if(enCalle && cam && !revelado) pasarA3d(turnoVer); };
      const js = document.createElement('script');
      js.src = GOOGLE_JS + '?key=' + encodeURIComponent(claveGoogle) + '&v=weekly&language=es&region=ES&loading=async&callback=' + listo;
      js.async = true;
      js.onerror = () => { js.remove(); fallo(new Error('Sin Street View')); };
      document.head.appendChild(js);
      setTimeout(() => { if(!SV) fallo(new Error('Street View tarda demasiado')); }, 15000);
    });
    return promesaGoogle;
  }
  function cargarMapLibre(){
    if(window.maplibregl) return Promise.resolve();
    if(promesa) return promesa;
    promesa = new Promise((resolve, reject) => {
      const css = document.createElement('link');
      css.rel = 'stylesheet'; css.href = ML_CSS; css.integrity = ML_CSS_SRI; css.crossOrigin = 'anonymous';
      document.head.appendChild(css);
      const js = document.createElement('script');
      js.src = ML_JS; js.integrity = ML_JS_SRI; js.crossOrigin = 'anonymous';
      js.onload = () => { protocolo(); resolve(); };
      js.onerror = () => { promesa = null; js.remove(); reject(new Error('No se pudo cargar la vista en 3D. Comprueba la conexión.')); };
      document.head.appendChild(js);
    });
    return promesa;
  }
  // ¿Se puede jugar? Con WebGL, siempre (el 3D); sin él, solo si puede haber Street View.
  function puede(){ return webgl() || (claveGoogle !== '' && !googleMal); }
  function webgl(){
    try{
      const gl = document.createElement('canvas').getContext('webgl2') || document.createElement('canvas').getContext('webgl');
      if(!gl) return false;
      const x = gl.getExtension('WEBGL_lose_context');
      if(x) x.loseContext();
      return true;
    }catch(e){ return false; }
  }
  // Los trozos de ortofoto: «cjfoto://pnoa/<bbox>» se pide al vuelo más
  // reciente y, si falla, al PNOA de siempre (con fetch: el service worker
  // los guarda como los del mapa).
  function protocolo(){
    maplibregl.addProtocol('cjfoto', async (params, abortController) => {
      const bbox = params.url.split('/').pop();
      if(!/^[-0-9.,e]+$/i.test(bbox)) throw new Error('Trozo no válido');
      const pedir = (base, capa) => fetch(base + '?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0&LAYERS=' + capa +
        '&STYLES=&FORMAT=image%2Fjpeg&CRS=EPSG%3A3857&WIDTH=512&HEIGHT=512&BBOX=' + bbox, { signal: abortController.signal, mode: 'cors' });
      let r = null;
      try{ r = await pedir(PNOA_RECIENTE, 'OrtoimagenRapida'); }catch(e){ if(abortController.signal.aborted) throw e; }
      if(!r || !r.ok || !/^image\//.test(r.headers.get('content-type') || '')) r = await pedir(PNOA_WMS, 'OI.OrthoimageCoverage');
      if(!r.ok) throw new Error('Ortofoto: ' + r.status);
      return { data: await r.arrayBuffer() };
    });
  }

  /* ---------- el mapa ---------- */
  function estilo(){
    const alto = ['coalesce', ['get', 'render_height'], 0];
    return {
      version: 8,
      sources: {
        foto: { type: 'raster', tiles: ['cjfoto://pnoa/{bbox-epsg-3857}'], tileSize: 512, maxzoom: 19 },
        edificios: { type: 'vector', url: EDIFICIOS },
        marcas: { type: 'geojson', data: marcas }
      },
      sky: { 'sky-color': '#8fbfe8', 'horizon-color': '#e4eef5', 'fog-color': '#e4eef5', 'sky-horizon-blend': 0.5, 'horizon-fog-blend': 0.6, 'fog-ground-blend': 0.9, 'atmosphere-blend': 0 },
      light: { anchor: 'map', position: [1.3, 210, 35], intensity: 0.35, color: '#ffffff' },
      layers: [
        { id: 'fondo', type: 'background', paint: { 'background-color': '#c9c3b6' } },
        { id: 'foto', type: 'raster', source: 'foto', paint: { 'raster-fade-duration': 0 } },
        // Fachadas claras, de tonos distintos para que se distinga cada edificio.
        { id: 'edificios', type: 'fill-extrusion', source: 'edificios', 'source-layer': 'building', minzoom: 13, paint: {
          'fill-extrusion-color': ['match', ['%', ['round', alto], 5], 0, '#f1ebe0', 1, '#e6d9c2', 2, '#f5f0e7', 3, '#e0d0b4', '#ebe1cd'],
          'fill-extrusion-height': ['max', alto, 3],
          'fill-extrusion-base': ['min', ['coalesce', ['get', 'render_min_height'], 0], ['max', alto, 3]],
          'fill-extrusion-vertical-gradient': true
        } },
        // Al responder, por encima de los edificios: la calle y dónde se estaba.
        { id: 'marcas-borde', type: 'line', source: 'marcas', filter: ['==', ['geometry-type'], 'LineString'], layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-color': '#ffffff', 'line-width': ['interpolate', ['linear'], ['zoom'], 13, 5, 18, 12] } },
        { id: 'marcas-linea', type: 'line', source: 'marcas', filter: ['==', ['geometry-type'], 'LineString'], layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-color': ['get', 'color'], 'line-width': ['interpolate', ['linear'], ['zoom'], 13, 3, 18, 8] } },
        { id: 'marcas-yo', type: 'circle', source: 'marcas', filter: ['==', ['geometry-type'], 'Point'],
          paint: { 'circle-radius': 8, 'circle-color': '#4E9BF7', 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 3, 'circle-pitch-alignment': 'map' } }
      ]
    };
  }
  // Lista para enseñar calles: con Street View, sí; si no, crea el mapa 3D
  // (una vez por ronda). false si este navegador no puede.
  function abrir(){ return usaGoogle() || abrir3d(); }
  function abrir3d(){
    if(mapa) return true;
    if(!window.maplibregl) return false;
    const caja = el('cj3dLienzo');
    try{
      mapa = new maplibregl.Map({
        container: caja, style: estilo(), interactive: false, attributionControl: false,
        maxPitch: 89, maxZoom: 25, fadeDuration: 0, pixelRatio: Math.min(2, window.devicePixelRatio || 1),
        canvasContextAttributes: { antialias: true }, center: [-4.7796, 37.8845], zoom: 16
      });
    }catch(e){ mapa = null; return false; }
    if(mapa.setVerticalFieldOfView) mapa.setVerticalFieldOfView(CAMPO);
    mapa.on('error', () => {});   // un trozo que no llega no es para avisar
    mapa.on('resize', () => colocar(false));
    escuchar(caja);
    return true;
  }
  function cerrar(){
    arrastre = null; cam = null; revelado = false; marcas = VACIO; enCalle = false;
    velo++; turnoVer++;
    // El panorama de Google se guarda para la próxima ronda (cada uno nuevo cuenta).
    if(panorama) panorama.setVisible(false);
    if(mapa){ try{ mapa.remove(); }catch(e){} mapa = null; }
  }
  function ponerMarcas(datos){
    marcas = datos;
    const fuente = mapa && mapa.getSource('marcas');
    if(fuente) fuente.setData(datos);
    else if(mapa) mapa.once('load', () => { const f = mapa && mapa.getSource('marcas'); if(f) f.setData(marcas); });
  }

  /* ---------- la cámara ---------- */
  function difAngulo(a, b){ return Math.abs(((a - b) % 360 + 540) % 360 - 180); }
  // El camino: un tramo de la calle, con lo que se lleva andado en cada punto.
  function camino(linea){
    const acum = [0];
    for(let i = 1; i < linea.length; i++) acum.push(acum[i - 1] + Math.hypot((linea[i][1] - linea[i - 1][1]) * KX, (linea[i][0] - linea[i - 1][0]) * KY));
    return { pts: linea, acum, largo: acum[acum.length - 1] };
  }
  // Punto y rumbo del camino a s metros de su principio.
  function puntoEn(c, s){
    s = Math.max(0, Math.min(c.largo, s));
    let i = 1;
    while(i < c.pts.length - 1 && c.acum[i] < s) i++;
    const a = c.pts[i - 1], b = c.pts[i], tramo = c.acum[i] - c.acum[i - 1];
    const t = tramo ? (s - c.acum[i - 1]) / tramo : 0;
    return { lat: a[0] + (b[0] - a[0]) * t, lng: a[1] + (b[1] - a[1]) * t, rumbo: (Math.atan2((b[1] - a[1]) * KX, (b[0] - a[0]) * KY) / RAD + 360) % 360 };
  }
  // Cámara en el punto, a la altura elegida, mirando a donde la vista corta el suelo.
  function opcionesCamara(){
    const a = ALTURAS[altura];
    cam.abajo = Math.min(a.max, Math.max(1.5, cam.abajo));
    const d = a.m / Math.tan(cam.abajo * RAD), r = cam.rumbo * RAD;
    const hacia = new maplibregl.LngLat(cam.lng + d * Math.sin(r) / KX, cam.lat + d * Math.cos(r) / KY);
    return mapa.calculateCameraOptionsFromTo(new maplibregl.LngLat(cam.lng, cam.lat), a.m, hacia, 0);
  }
  function colocar(anim){
    if(!mapa || !cam || revelado) return;
    const o = opcionesCamara();
    if(anim) mapa.easeTo(Object.assign(o, { duration: 450 }));
    else mapa.jumpTo(o);
  }

  // Una calle nueva: en un punto de su tramo más largo, mirando a lo largo,
  // hacia donde queda más calle. linea: [[lat, lng], ...]
  function ver(linea){
    const turno = ++turnoVer;
    revelado = false;
    const c = camino(linea);
    const s = c.largo * (0.3 + Math.random() * 0.4);
    const p = puntoEn(c, s);
    cam = { camino: c, s, lat: p.lat, lng: p.lng, rumbo: rumboHacia(c, s, p.rumbo), abajo: ALTURAS[altura].abajo };
    el('cj3d').classList.remove('revelado', 'oculto');
    if(usaGoogle()){ verCalle(turno); return true; }
    return ver3d();
  }
  // Mirando a lo largo de la calle, hacia donde queda más.
  function rumboHacia(c, s, rumbo){ return (rumbo + (c.largo - s >= s ? 0 : 180)) % 360; }
  function vista(calle){
    enCalle = calle;
    el('cj3d').classList.toggle('en-calle', calle);
    if(panorama) panorama.setVisible(calle);
  }
  function ver3d(){
    vista(false);
    if(!abrir3d()) return false;
    ponerMarcas(VACIO);
    pintarAlturas();
    colocar(false);
    cargando();
    if(!pistaVista) aviso('Arrastra para mirar alrededor', 6000);
    return true;
  }
  // Sin Street View en esta calle (o sin Google): esta pregunta en 3D.
  async function pasarA3d(turno){
    try{ await cargarMapLibre(); }catch(e){
      if(turno === turnoVer){ el('cj3dCargando').classList.add('hidden'); aviso('No se ha podido cargar esta calle. Responde lo que creas.', 0); }
      return;
    }
    if(turno !== turnoVer || revelado) return;
    if(!ver3d()){ el('cj3dCargando').classList.add('hidden'); aviso('No se ha podido cargar esta calle. Responde lo que creas.', 0); }
  }

  /* ---------- Street View ---------- */
  async function verCalle(turno){
    vista(true);
    const v = el('cj3dCargando');
    v.classList.remove('hidden');
    const pano = await buscarPano();
    if(turno !== turnoVer) return;
    if(!pano || googleMal){ pasarA3d(turno); return; }
    Object.assign(cam, { lat: pano.lat, lng: pano.lng, s: pano.s, rumbo: pano.rumbo });
    if(!escuchandoCalle){
      escuchandoCalle = true;
      el('cj3dCalle').addEventListener('pointerdown', () => { if(!pistaVista){ pistaVista = true; aviso('', 0); } }, true);
    }
    if(!panorama){
      panorama = new SV.StreetViewPanorama(el('cj3dCalle'), {
        disableDefaultUI: true, linksControl: true, clickToGo: true, scrollwheel: true,
        // Sin nada que diga dónde se está: ni la dirección ni los nombres de las calles.
        addressControl: false, showRoadLabels: false,
        fullscreenControl: false, enableCloseButton: false, motionTracking: false, motionTrackingControl: false
      });
    }
    panorama.setPano(pano.id);
    panorama.setPov({ heading: pano.rumbo, pitch: 0 });
    panorama.setZoom(0);
    panorama.setVisible(true);
    setTimeout(() => { if(turno === turnoVer) v.classList.add('hidden'); }, 900);
    if(!pistaVista) aviso('Arrastra para mirar y toca las flechas para avanzar', 6000);
  }
  // La imagen del coche de Google más cercana a la calle: en el punto
  // elegido y, si no hay, en la mitad. Vale si está en la calle (a menos de
  // 15 m de su trazado), no en una de al lado.
  async function buscarPano(){
    const c = cam.camino;
    for(const s0 of [cam.s, c.largo / 2]){
      const p = puntoEn(c, s0);
      let r;
      try{
        r = await servicio.getPanorama({ location: { lat: p.lat, lng: p.lng }, radius: 40,
          preference: SV.StreetViewPreference.NEAREST, sources: [SV.StreetViewSource.GOOGLE] });
      }catch(e){ continue; }   // (sin imagen por aquí)
      const loc = r && r.data && r.data.location;
      if(!loc || !loc.pano || !loc.latLng) continue;
      const lat = loc.latLng.lat(), lng = loc.latLng.lng();
      const cerca = masCercano(c, lat, lng);
      if(cerca.d > 15) continue;
      return { id: loc.pano, lat, lng, s: cerca.s, rumbo: rumboHacia(c, cerca.s, puntoEn(c, cerca.s).rumbo) };
    }
    return null;
  }
  // Punto del camino más cercano a (lat, lng): a qué distancia (m) y en qué s.
  function masCercano(c, lat, lng){
    let mejor = { d: Infinity, s: 0 };
    for(let i = 1; i < c.pts.length; i++){
      const ax = (c.pts[i - 1][1] - lng) * KX, ay = (c.pts[i - 1][0] - lat) * KY, bx = (c.pts[i][1] - lng) * KX, by = (c.pts[i][0] - lat) * KY;
      const dx = bx - ax, dy = by - ay, t = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / ((dx * dx + dy * dy) || 1)));
      const d = Math.hypot(ax + t * dx, ay + t * dy);
      if(d < mejor.d) mejor = { d, s: c.acum[i - 1] + t * (c.acum[i] - c.acum[i - 1]) };
    }
    return mejor;
  }
  // «Cargando la calle…» hasta que estén los trozos (como mucho 3 s).
  function cargando(){
    const turno = ++velo, v = el('cj3dCargando');
    v.classList.remove('hidden');
    const quitar = () => { if(turno === velo) v.classList.add('hidden'); };
    mapa.once('idle', quitar);
    setTimeout(quitar, 3000);
  }

  /* ---------- mirar, andar y subir ---------- */
  function escuchar(caja){
    if(escuchando) return;
    escuchando = true;
    caja.addEventListener('pointerdown', e => {
      if(!mapa || !cam || revelado || (e.pointerType === 'mouse' && e.button !== 0)) return;
      arrastre = { id: e.pointerId, x: e.clientX, y: e.clientY, rumbo: cam.rumbo, abajo: cam.abajo };
      try{ caja.setPointerCapture(e.pointerId); }catch(_){}
      if(!pistaVista){ pistaVista = true; aviso('', 0); }
    });
    caja.addEventListener('pointermove', e => {
      if(!arrastre || e.pointerId !== arrastre.id || !cam) return;
      const ancho = caja.clientWidth || 1, alto = caja.clientHeight || 1;
      const campoH = 2 * Math.atan(Math.tan(CAMPO / 2 * RAD) * ancho / alto) / RAD;
      // Se arrastra la vista: a la derecha se mira a la izquierda; hacia abajo, hacia arriba.
      cam.rumbo = ((arrastre.rumbo - (e.clientX - arrastre.x) * campoH / ancho) % 360 + 360) % 360;
      cam.abajo = arrastre.abajo - (e.clientY - arrastre.y) * CAMPO / alto;
      if(!pendiente){ pendiente = true; requestAnimationFrame(() => { pendiente = false; colocar(false); }); }
    });
    const soltar = e => { if(arrastre && e.pointerId === arrastre.id) arrastre = null; };
    caja.addEventListener('pointerup', soltar);
    caja.addEventListener('pointercancel', soltar);
  }
  // Andar por la calle: sentido 1 hacia donde se mira, -1 hacia atrás.
  function andar(sentido){
    if(!mapa || !cam || revelado) return;
    const c = cam.camino, aqui = puntoEn(c, cam.s);
    const dif = difAngulo(cam.rumbo, aqui.rumbo);
    const s = Math.max(0, Math.min(c.largo, cam.s + PASO * sentido * (dif <= 90 ? 1 : -1)));
    if(Math.abs(s - cam.s) < 0.5){ aviso('Hasta aquí llega esta calle', 1800); return; }
    const p = puntoEn(c, s);
    // Mirando a lo largo de la calle, se sigue mirando a lo largo (en las curvas).
    if(dif < 35) cam.rumbo = p.rumbo;
    else if(dif > 145) cam.rumbo = (p.rumbo + 180) % 360;
    Object.assign(cam, { s, lat: p.lat, lng: p.lng });
    colocar(true);
  }
  function darVuelta(){
    if(!cam || revelado) return;
    cam.rumbo = (cam.rumbo + 180) % 360;
    colocar(true);
  }
  function ponerAltura(k){
    if(!ALTURAS[k]) return;
    altura = k;
    try{ localStorage.setItem(ALTURA_KEY, k); }catch(e){}
    pintarAlturas();
    if(cam){ cam.abajo = ALTURAS[k].abajo; colocar(true); }
  }
  function pintarAlturas(){
    document.querySelectorAll('#cj3d [data-altura]').forEach(b => b.setAttribute('aria-pressed', b.dataset.altura === altura ? 'true' : 'false'));
  }
  // Un aviso corto sobre la vista (vacío: quitarlo).
  function aviso(texto, ms){
    const a = el('cj3dPista');
    clearTimeout(avisoTimer);
    a.textContent = texto;
    a.classList.toggle('hidden', !texto);
    if(texto && ms) avisoTimer = setTimeout(() => a.classList.add('hidden'), ms);
  }

  /* ---------- al responder ---------- */
  // La calle en verde (verdes) y la elegida, si se ha fallado, en rojo
  // (rojas), vistas desde arriba; en azul, dónde se estaba. Con Street View
  // se quita la vista y devuelve false: lo enseña el mapa de debajo.
  function revelar(verdes, rojas){
    if(!cam) return true;
    turnoVer++;   // (una calle que aún estaba cargando ya no se pone)
    if(enCalle || !mapa){
      revelado = true;
      aviso('', 0);
      el('cj3dCargando').classList.add('hidden');
      el('cj3d').classList.add('revelado', 'oculto');
      if(panorama) panorama.setVisible(false);
      return false;
    }
    revelado = true;
    arrastre = null;
    aviso('', 0);
    el('cj3d').classList.add('revelado');
    const lineas = (ls, color) => ls.map(l => ({ type: 'Feature', properties: { color }, geometry: { type: 'LineString', coordinates: l.map(p => [p[1], p[0]]) } }));
    ponerMarcas({ type: 'FeatureCollection', features: lineas(rojas, '#F2665C').concat(lineas(verdes, '#34D399'),
      [{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [cam.lng, cam.lat] } }]) });
    const caja = new maplibregl.LngLatBounds([cam.lng, cam.lat], [cam.lng, cam.lat]);
    verdes.concat(rojas).forEach(l => l.forEach(p => caja.extend([p[1], p[0]])));
    // Que no tape nada el recuadro de arriba (a pantalla completa) ni el resultado.
    const lienzo = el('cj3dLienzo').getBoundingClientRect();
    const cabeza = document.querySelector('#cjJuego .cj-cabeza');
    const tapa = cabeza ? Math.max(0, cabeza.getBoundingClientRect().bottom - lienzo.top) : 0;
    const arriba = Math.min(lienzo.height * 0.45, tapa + 30), abajo = Math.min(lienzo.height * 0.3, 110);
    const o = mapa.cameraForBounds(caja, { padding: { top: arriba, bottom: abajo, left: 40, right: 40 }, bearing: cam.rumbo });
    if(o) mapa.flyTo({ center: o.center, zoom: Math.min(o.zoom, 18), bearing: cam.rumbo, pitch: 35, duration: 1400 });
    return true;
  }
  // Dónde se estaba (para marcarlo en el mapa).
  function donde(){ return cam ? { lat: cam.lat, lng: cam.lng } : null; }

  return { cargar, puede, abrir, cerrar, ver, revelar, donde, andar, darVuelta, altura: ponerAltura };
})();
