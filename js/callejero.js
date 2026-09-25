/* ============================================================
   CALLEJERO · Córdoba
   Las vías salen del Callejero Digital de Andalucía Unificado (CDAU,
   IECA — Junta de Andalucía, CC BY 4.0). La función callejero-sync las
   mantiene al día y publica un archivo compacto (almacén «callejero»);
   su ruta está en la tabla callejero_publicado. El archivo se descarga
   solo al abrir esta pantalla, y el service worker lo guarda para
   poder jugar sin conexión.
   Leaflet (el mapa) también se carga solo al abrir la pantalla. No hay
   mapa de fondo: el propio trazado de las vías (y el Guadalquivir) es el
   mapa, así que no hay ningún nombre que dé pistas, no depende de
   ningún servicio externo y funciona sin conexión.

   Modo «Localiza la calle»: se da el nombre de una vía y hay que
   tocarla en el mapa. Cuenta como acierto si el toque cae a menos de
   la tolerancia (lo que sea mayor: 35 m o 22 píxeles de pantalla) de
   cualquier vía con ese mismo nombre (hay nombres repetidos en
   distintas pedanías). Cada respuesta se guarda en callejero_intentos.
   ============================================================ */
const CJ = (function(){
  const LEAFLET_JS = 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js';
  const LEAFLET_JS_SRI = 'sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=';
  const LEAFLET_CSS = 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css';
  const LEAFLET_CSS_SRI = 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=';
  const ATRIBUCION = 'Callejero: <a href="https://www.callejerodeandalucia.es/" target="_blank" rel="noopener">CDAU</a> · Río: DERA · IECA, Junta de Andalucía (CC BY 4.0)';
  const CENTRO = [37.8845, -4.7796];
  const PREGUNTAS_POR_RONDA = 20;
  const TOLERANCIA_M = 35;
  const TOLERANCIA_PX = 22;
  const PENDIENTES_KEY = 'cj_intentos_pendientes';

  let datos = null;          // { version, vias: [...], porNombre: Map, jugables: [...] }
  let cargando = null;       // promesa de carga en curso
  let progreso = new Map();  // id_vial -> { intentos, aciertos, ultimo_acierto }
  let mapa = null, capaCalles = null, capaMarcas = null, capaRio = null;
  let ronda = null;          // { preguntas, i, aciertos, fallos: [], respondida }

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
  function decodificar(doc){
    const vias = doc.vias.map(([id, nombre, tipo, jugable, lineas]) => ({
      id, nombre, tipo, jugable: jugable === 1, lineas: decodificarLineas(lineas)
    }));
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
    const renderer = L.canvas({ padding: 0.3, tolerance: 4 });
    if(datos.rio.length) capaRio = L.polyline(datos.rio, { renderer, color: colorRio(), weight: 9, opacity: 1, lineCap: 'round', interactive: false }).addTo(mapa);
    capaCalles = L.polyline(datos.vias.flatMap(v => v.lineas), { renderer, color: colorCalles(), weight: 2, opacity: 0.9, interactive: false }).addTo(mapa);
    capaMarcas = L.layerGroup().addTo(mapa);
    mapa.setMaxBounds(limitesDe(datos.vias).pad(0.15));
    mapa.setView(CENTRO, 14);
    mapa.on('click', e => responder(e.latlng));
  }
  function refrescarTema(){
    if(!mapa) return;
    capaCalles.setStyle({ color: colorCalles() });
    if(capaRio) capaRio.setStyle({ color: colorRio() });
  }

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
      '<div class="cj-fuente">' + total.toLocaleString('es-ES') + ' vías de Córdoba del callejero oficial de la Junta de Andalucía (CDAU), actualizado cada semana.</div>';
  }

  async function abrir(){
    const root = el('cjInicio');
    if(ronda) return; // se vuelve a una ronda en curso tal cual
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
    mostrarVista('juego');
    crearMapa();
    siguientePregunta(true);
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
    mostrarVista('fin');
  }

  function salir(){
    ronda = null;
    mostrarVista('inicio');
    pintarInicio();
  }
  async function confirmarSalir(){
    if(ronda && ronda.i > 0 && !(await uiConfirm('¿Salir de la ronda? Lo que ya has respondido queda guardado.'))) return;
    salir();
  }

  return { abrir, empezar, salir, confirmarSalir, siguiente: () => siguientePregunta(false), refrescarTema };
})();
