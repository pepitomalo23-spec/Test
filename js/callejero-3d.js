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
   Lo usa js/callejero.js (modo «calle3d»); aquí no se guarda nada.
   ===================================================================== */
const CJ3D = (function(){
  const ML_JS = 'https://cdn.jsdelivr.net/npm/maplibre-gl@5.24.0/dist/maplibre-gl.js';
  const ML_JS_SRI = 'sha384-5+cfbwT0iiub6VsQAdn6yz16nr6sDiQoHx6tm4O8OVYXHYOxcffFmCJBL0dgdvGp';
  const ML_CSS = 'https://cdn.jsdelivr.net/npm/maplibre-gl@5.24.0/dist/maplibre-gl.css';
  const ML_CSS_SRI = 'sha384-uTttxo/aOKbdE5RlD/SPzSDoDmNvGlUYPjONi2MN/b7c9HPSvW07OIuyP7uL6jxK';
  const EDIFICIOS = 'https://tiles.openfreemap.org/planet';
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

  /* ---------- carga perezosa de MapLibre ---------- */
  function cargar(){
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
  // ¿Puede el navegador dibujar en 3D (WebGL)?
  function puede(){
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
  // Crea el mapa (una vez por ronda). false si este navegador no puede.
  function abrir(){
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
    arrastre = null; cam = null; revelado = false; marcas = VACIO;
    velo++;
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
    if(!abrir()) return false;
    revelado = false;
    const c = camino(linea);
    const s = c.largo * (0.3 + Math.random() * 0.4);
    const p = puntoEn(c, s);
    cam = { camino: c, s, lat: p.lat, lng: p.lng, rumbo: (p.rumbo + (c.largo - s >= s ? 0 : 180)) % 360, abajo: ALTURAS[altura].abajo };
    ponerMarcas(VACIO);
    el('cj3d').classList.remove('revelado');
    pintarAlturas();
    colocar(false);
    cargando();
    if(!pistaVista) aviso('Arrastra para mirar alrededor', 6000);
    return true;
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
  // (rojas), vistas desde arriba; en azul, dónde se estaba.
  function revelar(verdes, rojas){
    if(!mapa || !cam) return;
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
    if(!o) return;
    mapa.flyTo({ center: o.center, zoom: Math.min(o.zoom, 18), bearing: cam.rumbo, pitch: 35, duration: 1400 });
  }

  return { cargar, puede, abrir, cerrar, ver, revelar, andar, darVuelta, altura: ponerAltura };
})();
