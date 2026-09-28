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
     - voz:      se marca una vía, uno dice su nombre para sí, pulsa
                 «Resolver» y marca él mismo si lo ha dicho bien (✓) o mal (✗).
     - cruces:   «¿Cuál cruza con X?» o «¿Cuál es paralela a X?», con 4
                 opciones. Los cruces y las paralelas se calculan con el
                 trazado oficial (ver crucesDe y paralelasDe).
     - lugares:  se da un lugar importante (hospital, colegio...) y hay
                 que tocarlo en el mapa.
     - parque:   «¿Qué parque de bomberos acude?», Central o Granadal,
                 para vías y lugares (la línea viene en el archivo; lo que
                 está a menos de 150 m de ella no se pregunta).

   Modo estudio: el mismo mapa, libre. Al tocar una vía se ve su nombre
   (y cuántas veces la has acertado), y se puede buscar cualquier vía o
   lugar por su nombre para que el mapa vaya hasta él. No guarda nada.

   Progreso: por habilidad (nombres, situar calles, cruces, lugares y
   parque), con la regla de los tests: dominada si nunca se ha fallado o
   si lleva 3 aciertos seguidos (callejero_progreso). Cada respuesta lleva
   un uid, la ronda, la zona y la tarea; la cola sin conexión no duplica
   ni pierde respuestas.

   Tareas del profesor (js/callejero-profesor.js): salen en «Hoy» y cada una
   es también una zona («t:<id>»): sus calles y lugares elegidos o la zona
   que mandó. Con «solo esto», el alumno solo puede elegir sus tareas.
   Modo selección: el profesor elige en este mismo mapa las calles y los
   lugares de una tarea (CJ.seleccionar).

   Pantalla principal, en tres pestañas: «Hoy» (las tareas y lo que más
   conviene hacer ahora: repasar lo fallado o seguir con la última ficha),
   «Estudiar» (las fichas del temario y las calles: zona y modos en
   baldosas) y «Progreso» (temario, lo que más falla, calles y rondas).

   Temario de la academia (js/callejero-temario.js): sus rondas son del
   modo «temario» y cada pregunta dice cómo se responde (q.respuesta:
   'opciones', 'toque' en el mapa o 'plano'); su «En el mapa» es el modo
   estudio con lo del apartado marcado (CJ.estudio({ titulo, items })).
   Las tareas con fichas del temario no son zonas: se ven y se preguntan
   desde su pantalla.
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
    voz: { titulo: 'Di el nombre', respuesta: 'voz' },
    cruces: { titulo: 'Cruces y paralelas', respuesta: 'opciones' },
    lugares: { titulo: 'Lugares importantes', respuesta: 'toque' },
    parque: { titulo: '¿Qué parque acude?', respuesta: 'opciones' },
    // Temario de la academia: cada pregunta trae su forma de responder.
    temario: { titulo: 'Temario', respuesta: 'variable' }
  };
  const PENDIENTES_KEY = 'cj_intentos_pendientes';
  // Habilidad que entrena cada modo: el progreso se cuenta por habilidad
  // («escribe» es un modo antiguo que ya no existe, pero tiene respuestas).
  const HABILIDAD = { localiza: 'localiza', opciones: 'nombre', voz: 'nombre', escribe: 'nombre', cruces: 'cruces', lugares: 'lugares', parque: 'parque', temario: 'temario' };
  const HABILIDADES = [
    { k: 'nombre', titulo: 'Nombres', desc: '¿Cómo se llama? y Di el nombre' },
    { k: 'localiza', titulo: 'Situar calles', desc: 'Localiza la calle' },
    { k: 'cruces', titulo: 'Cruces y paralelas', desc: '' },
    { k: 'lugares', titulo: 'Lugares importantes', desc: '' },
    { k: 'parque', titulo: 'Parque que acude', desc: '' }
  ];

  let datos = null;          // { version, vias: [...], porNombre: Map, jugables: [...] }
  let cargando = null;       // promesa de carga en curso
  let progreso = new Map();  // 'habilidad|id' -> { intentos, aciertos, racha, fallos }
  let mapa = null, capaMarcas = null, capaRio = null, capaFoto = null, capaPuntos = null;
  // Vías en dos grupos (resto / principales), cada uno con su borde y su relleno.
  let capas = null;          // { restoBorde, resto, princBorde, princ }
  let estilo = 'sencillo';
  try{ if(ESTILOS[localStorage.getItem(ESTILO_KEY)]) estilo = localStorage.getItem(ESTILO_KEY); }catch(e){}
  let ronda = null;          // { id, preguntas, i, aciertos, respondidas, fallos: [], respondida, zona, tareaId }
  let modo = null;           // modo de juego, 'estudio' o 'seleccion' (con el mapa abierto)
  let sugerencias = [];      // resultados de la búsqueda (estudio y selección): { via } o { lugar }
  let capaZona = null;       // contorno de la zona elegida
  const ZONA_KEY = 'cj_zona';
  // '' = toda Córdoba · 'd:<distrito>' · 'b:<barrio>' · 'fuera' = afueras y pedanías · 't:<id>' = una tarea
  let zona = '';
  try{ zona = localStorage.getItem(ZONA_KEY) || ''; }catch(e){}
  let tareas = [];           // tareas del alumno (callejero_tareas_de), con _vias y _lugares (Set)
  let rondasServidor = [];   // últimas rondas (callejero_rondas)
  let rondasLocales = [];    // rondas hechas aquí que el servidor aún no devuelve
  let verTodasRondas = false;
  let vistaProfesor = 'alumnos';   // lo que ve un profesor: 'alumnos', 'temario' o 'propio' (su callejero)
  try{ const v = localStorage.getItem('cj_vista_profesor'); if(v === 'propio' || v === 'temario') vistaProfesor = v; }catch(e){}
  let pestana = 'hoy';       // pestaña de la pantalla principal: 'hoy', 'estudiar' o 'progreso'
  let enCalles = false;      // en «Estudiar», dentro de las calles (zona y modos de juego)
  let seleccion = null;      // modo selección: { vias: Set, lugares: Set, cambios, resolver }
  let verTemario = null;     // modo estudio del temario: { titulo, items: [{ nombre, tipo, detalle, vias, lugar, barrio, ruta, salida }], foco }
  let desdeTemario = false;  // al salir de la ronda o del mapa se vuelve a la pantalla del temario
  let vistaActual = 'inicio';

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
      id, nombre, categoria, direccion, lat: y / 1e5, lng: x / 1e5, clave: normalizar(nombre),
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
    return { version: doc.version, vias, porNombre, jugables: vias.filter(v => v.jugable), rio: decodificarLineas(doc.rio || []), barrios, distritos, lugares, lineaParques,
      viaPorId: new Map(vias.map(v => [v.id, v])), lugarPorId: new Map(lugares.map(l => [l.id, l])) };
  }

  /* ---------- zonas ---------- */
  // Si la zona es una tarea, la tarea (activa) del alumno; si no, null.
  function tareasActivas(){ return tareas.filter(t => !t.archivada); }
  // Las tareas con fichas del temario no son una zona: tienen su propia pantalla.
  function esTemario(t){ return (t.fichas || []).length > 0; }
  function tareasZona(){ return tareasActivas().filter(t => !esTemario(t)); }
  function tareaDeZona(z){
    z = z === undefined ? zona : z;
    if(!z || !z.startsWith('t:')) return null;
    return tareasZona().find(t => String(t.id) === z.slice(2)) || null;
  }
  // Con alguna tarea «solo esto» activa, el alumno solo puede elegir tareas.
  function soloEsto(){ return tareasActivas().some(t => t.solo_esto); }
  function usaLista(t){ return (t.vias || []).length + (t.lugares || []).length > 0; }
  function zonaValida(z){
    if(!datos) return !z;
    if(z && z.startsWith('t:')) return !!tareaDeZona(z);
    if(soloEsto()) return false;
    if(!z) return true;
    if(z === 'fuera') return datos.barrios.length > 0;
    if(z.startsWith('d:')) return datos.distritos.includes(z.slice(2));
    if(z.startsWith('b:')) return datos.barrios.some(b => b.nombre === z.slice(2));
    return false;
  }
  function enZonaBase(x, z){
    if(!z) return true;
    if(z === 'fuera') return x.barrios.length === 0;
    if(z.startsWith('d:')) return x.barrios.some(b => b.distrito === z.slice(2));
    if(z.startsWith('b:')) return x.barrios.some(b => b.nombre === z.slice(2));
    return false;
  }
  // Qué vías y qué lugares entran en una zona o en una tarea (sus calles y
  // lugares elegidos o, si mandó una zona entera, esa zona).
  function filtroDe(z, t){
    if(t && usaLista(t)){
      const sv = new Set((t.vias || []).map(Number)), sl = new Set((t.lugares || []).map(Number));
      return { via: v => sv.has(v.id), lugar: l => sl.has(l.id) };
    }
    if(t) z = t.zona || '';
    return { via: v => enZonaBase(v, z), lugar: l => enZonaBase(l, z) };
  }
  let filtro = filtroDe('');
  function actualizarFiltro(){
    if(datos && !zonaValida(zona)){
      const solo = soloEsto() ? tareasZona().find(t => t.solo_esto) || tareasZona()[0] : null;
      zona = solo ? 't:' + solo.id : '';
    }
    filtro = filtroDe(zona, tareaDeZona());
  }
  function enZona(v){ return filtro.via(v); }
  function enZonaLugar(l){ return filtro.lugar(l); }
  // Nombre de una zona ('' si no se conoce). tareasConocidas: para el profesor.
  function nombreZonaDe(z, tareasConocidas){
    if(!z) return 'Toda Córdoba';
    if(z === 'fuera') return 'Afueras y pedanías';
    if(z.startsWith('d:')) return 'Distrito ' + z.slice(2);
    if(z.startsWith('b:')) return z.slice(2);
    if(z.startsWith('t:')){
      const t = (tareasConocidas || tareas).find(x => String(x.id) === z.slice(2));
      return t ? 'Tarea «' + t.titulo + '»' : 'Una tarea';
    }
    if(z.startsWith('f:')) return typeof CJT !== 'undefined' ? CJT.nombreAmbito(z.slice(2)) : 'Temario';
    return z;
  }
  function nombreZona(){ return nombreZonaDe(zona); }
  function barriosDeZona(){
    const t = tareaDeZona();
    const z = t ? (usaLista(t) ? '' : (t.zona || '')) : zona;
    if(!z || z === 'fuera') return [];
    if(z.startsWith('d:')) return datos.barrios.filter(b => b.distrito === z.slice(2));
    return datos.barrios.filter(b => b.nombre === z.slice(2));
  }
  function cambiarZona(z){
    guardarZona(z);
    pintarInicio();
  }
  // Opciones de zona (sin tareas): las usa también el profesor.
  function opcionesZona(actual){
    const op = (v, t) => '<option value="' + escapeHtml(v) + '"' + (v === actual ? ' selected' : '') + '>' + escapeHtml(t) + '</option>';
    let html = op('', 'Toda Córdoba');
    if(!datos.barrios.length) return html;
    html += '<optgroup label="Distritos">' + datos.distritos.map(d => op('d:' + d, 'Distrito ' + d)).join('') + '</optgroup>';
    datos.distritos.forEach(d => {
      html += '<optgroup label="Barrios · ' + escapeHtml(d) + '">' +
        datos.barrios.filter(b => b.distrito === d).map(b => op('b:' + b.nombre, b.nombre)).join('') + '</optgroup>';
    });
    return html + '<optgroup label="Fuera de los barrios">' + op('fuera', 'Afueras y pedanías') + '</optgroup>';
  }
  function selectorZona(){
    const ts = tareasZona();
    let html = '<select class="cj-zona-select" id="cjZona" onchange="CJ.cambiarZona(this.value)" aria-label="Zona de estudio">';
    if(ts.length){
      html += '<optgroup label="Tareas de tu profesor">' + ts.map(t =>
        '<option value="t:' + t.id + '"' + (zona === 't:' + t.id ? ' selected' : '') + '>' + escapeHtml(t.titulo) + '</option>').join('') + '</optgroup>';
    }
    if(!soloEsto()) html += opcionesZona(zona);
    return html + '</select>';
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

  /* ---------- progreso por habilidad ---------- */
  function claveP(hab, id){ return hab + '|' + id; }
  // Misma regla que los tests: dominada si nunca se ha fallado o si lleva
  // 3 aciertos seguidos; «fallada» si la última vez se falló.
  function estadoDe(p){
    if(!p || !p.intentos) return 'nueva';
    if(p.racha === 0) return 'fallada';
    return (p.fallos === 0 || p.racha >= 3) ? 'dominada' : 'progreso';
  }
  function sumar(prog, hab, id, acierto){
    const k = claveP(hab, id);
    const p = prog.get(k) || { intentos: 0, aciertos: 0, racha: 0, fallos: 0 };
    p.intentos++;
    if(acierto){ p.aciertos++; p.racha++; } else { p.fallos++; p.racha = 0; }
    prog.set(k, p);
  }
  // Filas de callejero_progreso: [id, habilidad, intentos, aciertos, racha, fallos, última vez]
  function progresoDesdeFilas(filas){
    return new Map((filas || []).map(([id, hab, intentos, aciertos, racha, fallos, ultima]) =>
      [claveP(hab, Number(id)), { intentos, aciertos, racha, fallos, ultima }]));
  }
  async function cargarProgreso(){
    await subirPendientes();   // lo que estaba en la cola ya cuenta en el servidor
    const { data, error } = await sb.rpc('callejero_progreso');
    if(error) return;
    progreso = progresoDesdeFilas(data);
    misPendientes().forEach(p => sumar(progreso, HABILIDAD[p.modo] || 'nombre', p.id_vial, p.acierto));
  }

  /* ---------- intentos (con cola si no hay conexión) ---------- */
  // Cada respuesta lleva un uid: reintentar una subida (sin conexión, dos
  // a la vez, otra pestaña) no la duplica, y de la cola solo se borra lo
  // que el servidor ya tiene. Cada una lleva también su usuario: si en el
  // dispositivo entra otra cuenta, no se le suben respuestas ajenas.
  function nuevoUid(){
    if(window.crypto && crypto.randomUUID) return crypto.randomUUID();
    const b = crypto.getRandomValues(new Uint8Array(16));
    b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
    const h = [...b].map(x => x.toString(16).padStart(2, '0')).join('');
    return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
  }
  function pendientes(){
    try{ return JSON.parse(localStorage.getItem(PENDIENTES_KEY)) || []; }catch(e){ return []; }
  }
  function guardarPendientes(lista){
    try{ localStorage.setItem(PENDIENTES_KEY, JSON.stringify(lista.slice(-2000))); }catch(e){}
  }
  function misPendientes(){
    return currentUser ? pendientes().filter(p => (p.user_id || currentUser.id) === currentUser.id) : [];
  }
  // Las de versiones anteriores de la app no tenían uid ni usuario.
  function completarPendientes(){
    const lista = pendientes();
    if(!currentUser || !lista.some(p => !p.uid || !p.user_id)) return;
    guardarPendientes(lista.map(p => Object.assign({}, p, { uid: p.uid || nuevoUid(), user_id: p.user_id || currentUser.id })));
  }
  // Error del servidor por los datos de la respuesta (no por la conexión).
  function esErrorDeDatos(e){ return !!(e && e.code && /^(22|23)/.test(e.code)); }
  // Sube un lote y devuelve los uid que ya no hace falta guardar. Si el
  // servidor rechaza el lote por sus datos, se prueba de una en una y se
  // descartan las que no valen, para que no atasquen la cola para siempre.
  async function subirLote(lote){
    const subir = filas => sb.from('callejero_intentos').upsert(filas, { onConflict: 'uid', ignoreDuplicates: true });
    const { error } = await subir(lote);
    if(!error) return lote.map(p => p.uid);
    if(!esErrorDeDatos(error)) return [];
    const hechas = [];
    for(const p of lote){
      const r = await subir([p]);
      if(r.error && !esErrorDeDatos(r.error)) break;
      hechas.push(p.uid);
    }
    return hechas;
  }
  let subiendo = null, repetirSubida = false;
  function subirPendientes(){
    if(!currentUser) return Promise.resolve();
    if(subiendo){ repetirSubida = true; return subiendo; }
    subiendo = (async () => {
      do{
        repetirSubida = false;
        const yo = currentUser && currentUser.id;
        if(!yo) break;
        completarPendientes();
        const lote = pendientes().filter(p => p.user_id === yo).slice(0, 200);
        if(!lote.length) break;
        const hechas = new Set(await subirLote(lote));
        guardarPendientes(pendientes().filter(p => !hechas.has(p.uid)));
        if(hechas.size < lote.length) break;   // sin conexión: se reintenta más tarde
        if(pendientes().some(p => p.user_id === yo)) repetirSubida = true;
      }while(repetirSubida);
    })().catch(() => {}).finally(() => { subiendo = null; });
    return subiendo;
  }
  // id: el de la vía, o el de un lugar en negativo (así no se mezclan).
  function anotarIntento(id, modoIntento, acierto, distancia){
    sumar(progreso, HABILIDAD[modoIntento] || 'nombre', id, acierto);
    const fila = { uid: nuevoUid(), user_id: currentUser ? currentUser.id : null, id_vial: id, modo: modoIntento, acierto, created_at: new Date().toISOString() };
    if(distancia != null) fila.distancia_m = Math.round(distancia);
    if(ronda){
      fila.ronda = ronda.id;
      fila.ronda_total = ronda.preguntas.length;
      fila.zona = ronda.zona;
      if(ronda.tareaId) fila.tarea_id = ronda.tareaId;
    }
    guardarPendientes(pendientes().concat([fila]));
    subirPendientes();
  }
  window.addEventListener('online', () => { subirPendientes(); });

  /* ---------- tareas, rondas y avisos ---------- */
  function prepararTareas(lista){
    return (lista || []).map(t => Object.assign(t, { vias: (t.vias || []).map(Number), lugares: (t.lugares || []).map(Number), modos: t.modos || [], fichas: t.fichas || [] }));
  }
  // Se guardan en el dispositivo: sin conexión, las tareas (y «solo esto») siguen valiendo.
  function claveTareas(){ return 'cj_tareas_' + (currentUser ? currentUser.id : ''); }
  async function cargarTareas(){
    const { data, error } = await sb.rpc('callejero_tareas_de');
    if(error){
      if(!tareas.length){ try{ tareas = prepararTareas(JSON.parse(localStorage.getItem(claveTareas())) || []); }catch(e){} }
      return;
    }
    tareas = prepararTareas(data);
    try{ localStorage.setItem(claveTareas(), JSON.stringify(data || [])); }catch(e){}
  }
  async function cargarRondas(){
    const { data, error } = await sb.rpc('callejero_rondas', { p_limite: 30 });
    if(error) return;
    rondasServidor = data || [];
    const enServidor = new Set(rondasServidor.map(r => r.ronda));
    rondasLocales = rondasLocales.filter(r => !enServidor.has(r.ronda));
  }
  // Punto en la pestaña Callejero: tareas sin ver y mensajes sin leer.
  let ultimosAvisos = 0;
  async function comprobarAvisos(forzar){
    if(!currentUser || (typeof featureEnabled === 'function' && !featureEnabled('callejero'))) return;
    if(!forzar && Date.now() - ultimosAvisos < 60000) return;
    ultimosAvisos = Date.now();
    const { data, error } = await sb.rpc('callejero_avisos');
    const n = error || !data ? 0 : (data.tareas_nuevas || 0) + (data.mensajes || 0);
    const punto = document.getElementById('navCallejeroAviso');
    if(punto){ punto.textContent = n > 9 ? '9+' : String(n); punto.classList.toggle('hidden', !n); }
  }
  document.addEventListener('visibilitychange', () => { if(document.visibilityState === 'visible') comprobarAvisos(); });
  // Al cerrar sesión: nada de esta cuenta se queda en memoria.
  function reiniciar(){
    try{ Object.keys(localStorage).filter(k => k.startsWith('cj_tareas_')).forEach(k => localStorage.removeItem(k)); }catch(e){}
    progreso = new Map(); tareas = []; rondasServidor = []; rondasLocales = [];
    ronda = null; modo = null; seleccion = null; verTemario = null; desdeTemario = false; ultimosAvisos = 0;
    if(typeof CJT !== 'undefined') CJT.reiniciar();
    if(el('cjInicio')) mostrarVista('inicio');
    const punto = document.getElementById('navCallejeroAviso');
    if(punto) punto.classList.add('hidden');
  }

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
  // ¿El punto cae dentro del barrio? (par-impar con todos sus anillos)
  function dentroDeBarrio(lat, lng, b){
    let dentro = false;
    b.anillos.forEach(a => {
      for(let i = 0, j = a.length - 1; i < a.length; j = i++){
        const [yi, xi] = a[i], [yj, xj] = a[j];
        if((yi > lat) !== (yj > lat) && lng < (xj - xi) * (lat - yi) / (yj - yi) + xi) dentro = !dentro;
      }
    });
    return dentro;
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
    capaPuntos = L.layerGroup();
    aplicarEstilo();
    mapa.addControl(crearControlEstilo());
    mapa.setMaxBounds(limitesDe(datos.vias).pad(0.15));
    mapa.setView(CENTRO, 14);
    capaZona = L.layerGroup().addTo(mapa);
    mapa.on('click', e => {
      if(modo === 'estudio') tocarEstudio(e.latlng);
      else if(modo === 'seleccion') tocarSeleccion(e.latlng);
      else responder(e.latlng);
    });
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
    [capaRio, capas.restoBorde, capas.princBorde, capas.resto, capas.princ, capaPuntos, capaMarcas].forEach(c => { if(c && mapa.hasLayer(c)) mapa.removeLayer(c); });
    poner(capaRio, S.rio);
    poner(capas.restoBorde, S.restoBorde);
    poner(capas.princBorde, S.princBorde);
    poner(capas.resto, S.resto);
    poner(capas.princ, S.princ);
    if(capaPuntos) capaPuntos.addTo(mapa);
    capaMarcas.addTo(mapa);
    const cont = mapa.getContainer();
    cont.style.background = S.fondo || '';
    document.querySelectorAll('.cj-estilo-opcion').forEach(b => b.classList.toggle('activa', b.dataset.estilo === estilo));
    const actual = document.querySelector('.cj-estilo-actual');
    if(actual) actual.textContent = ESTILOS[estilo];
  }

  // Dibuja el contorno de la zona elegida. Con una tarea de calles elegidas,
  // en el modo estudio se ven sus calles y lugares resaltados (jugando no,
  // que sería dar la respuesta).
  function pintarZona(){
    capaZona.clearLayers();
    capaPuntos.clearLayers();
    barriosDeZona().forEach(b => {
      L.polyline(b.anillos, { color: '#F2665C', weight: 2.5, opacity: 0.9, dashArray: '6 6', interactive: false }).addTo(capaZona);
    });
    const t = tareaDeZona();
    if(modo === 'estudio' && t && usaLista(t)){
      datos.vias.filter(enZona).forEach(v => L.polyline(v.lineas, { color: '#4E9BF7', weight: 6, opacity: 0.35, interactive: false }).addTo(capaZona));
      datos.lugares.filter(enZonaLugar).forEach(l => L.circleMarker([l.lat, l.lng], { radius: 6, color: '#4E9BF7', weight: 2, fillColor: '#4E9BF7', fillOpacity: 0.35, interactive: false }).addTo(capaPuntos));
    }
  }
  function irAZona(animado){
    const vias = zona ? datos.vias.filter(enZona) : [];
    const puntos = zona ? datos.lugares.filter(enZonaLugar).map(l => [l.lat, l.lng]) : [];
    if(!vias.length && !puntos.length){ animado ? mapa.flyTo(CENTRO, 14, { duration: 0.6 }) : mapa.setView(CENTRO, 14); return; }
    const b = vias.length ? limitesDe(vias) : L.latLngBounds(puntos);
    if(vias.length && puntos.length) b.extend(L.latLngBounds(puntos));
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

  // Cuántas de `ids` están dominadas, en progreso, por repasar y sin ver en una habilidad.
  function contar(prog, hab, ids){
    const r = { total: ids.length, dominada: 0, progreso: 0, fallada: 0, nueva: 0 };
    ids.forEach(id => { r[estadoDe(prog.get(claveP(hab, id)))]++; });
    return r;
  }
  // «120 de 3.084 dominadas · 15 en progreso · 4 por repasar» (lo que es 0, no se dice).
  function detalleProgreso(r){
    const n = x => x.toLocaleString('es-ES');
    return n(r.dominada) + ' de ' + n(r.total) + ' dominadas' + (r.progreso ? ' · ' + n(r.progreso) + ' en progreso' : '') + (r.fallada ? ' · ' + n(r.fallada) + ' por repasar' : '');
  }
  // Tarjeta de progreso por habilidad (prog) de lo que entra en el filtro f.
  // La usa también el profesor con el progreso de su alumno.
  function tarjetaProgreso(prog, f, titulo){
    const vias = datos.jugables.filter(f.via).map(v => v.id);
    const lugares = datos.lugares.filter(f.lugar);
    const universo = {
      nombre: vias, localiza: vias, cruces: vias,
      lugares: lugares.map(l => -l.id),
      parque: datos.lineaParques ? datos.jugables.filter(v => v.parque && f.via(v)).map(v => v.id).concat(lugares.filter(l => l.parque).map(l => -l.id)) : []
    };
    const filas = HABILIDADES.filter(h => universo[h.k].length).map(h => {
      const r = contar(prog, h.k, universo[h.k]);
      const ancho = n => (n * 100 / r.total).toFixed(2) + '%';
      return '<div class="cj-hab">' +
        '<div class="cj-hab-cab"><span>' + escapeHtml(h.titulo) + (h.desc ? ' <small>' + escapeHtml(h.desc) + '</small>' : '') + '</span>' +
          '<b>' + Math.round(r.dominada * 100 / r.total) + '%</b></div>' +
        '<div class="cj-bar cj-bar-multi">' +
          '<div class="cj-bar-seg dominada" style="width:' + ancho(r.dominada) + '"></div>' +
          '<div class="cj-bar-seg progreso" style="width:' + ancho(r.progreso) + '"></div>' +
          '<div class="cj-bar-seg fallada" style="width:' + ancho(r.fallada) + '"></div>' +
        '</div>' +
        '<div class="cj-hab-det">' + detalleProgreso(r) + '</div>' +
      '</div>';
    }).join('');
    return '<div class="cj-card">' +
      '<div class="cj-card-title">' + escapeHtml(titulo) + '</div>' +
      (filas || '<div class="cj-hab-det">No hay nada que estudiar aquí.</div>') +
      (filas ? '<div class="cj-leyenda"><span><i class="dominada"></i>Dominada: nunca fallada o 3 aciertos seguidos</span><span><i class="progreso"></i>En progreso</span><span><i class="fallada"></i>Por repasar</span></div>' : '') +
    '</div>';
  }

  // Rondas (del alumno o, para el profesor, de su alumno), de la más reciente a la más antigua.
  function rondasHtml(lista, tareasConocidas, max){
    if(!lista.length) return '<div class="cj-hab-det">Todavía no hay rondas.</div>';
    return lista.slice(0, max).map(r => {
      const titulo = MODOS[r.modo] ? MODOS[r.modo].titulo : r.modo;
      const acabada = r.respondidas >= r.total;
      const pct = r.total ? Math.round(r.aciertos * 100 / r.total) : 0;
      return '<div class="cj-ronda">' +
        '<div class="cj-ronda-txt"><div class="cj-ronda-modo">' + escapeHtml(titulo) + '</div>' +
          '<div class="cj-ronda-zona">' + escapeHtml(nombreZonaDe(r.zona || '', tareasConocidas)) + ' · ' + escapeHtml(formatRelativeDate(r.fin)) +
          (acabada ? '' : ' · a medias (' + r.respondidas + ' de ' + r.total + ')') + '</div></div>' +
        '<b class="' + (pct >= 80 ? 'ok' : pct >= 50 ? 'medio' : 'ko') + '">' + r.aciertos + '/' + r.total + '</b>' +
      '</div>';
    }).join('');
  }
  function todasLasRondas(){
    const vistas = new Set();
    return rondasLocales.concat(rondasServidor).filter(r => !vistas.has(r.ronda) && vistas.add(r.ronda))
      .sort((a, b) => new Date(b.fin) - new Date(a.fin));
  }
  function alternarRondas(){ verTodasRondas = !verTodasRondas; pintarInicio(); }

  /* ---------- tareas (lado del alumno) ---------- */
  function fechaCorta(d){ return new Date(d + 'T12:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }); }
  function describirTarea(t){
    if(esTemario(t)) return { que: typeof CJT !== 'undefined' ? CJT.describirFichas(t.fichas) : 'Temario', modos: 'preguntas del temario' };
    const n = (k, uno, varios) => k ? k + ' ' + (k === 1 ? uno : varios) : '';
    const que = usaLista(t)
      ? [n(t.vias.length, 'calle', 'calles'), n(t.lugares.length, 'lugar', 'lugares')].filter(Boolean).join(' y ')
      : nombreZonaDe(t.zona || '');
    const modos = t.modos.length ? t.modos.map(m => MODOS[m] ? MODOS[m].titulo : m).join(', ') : 'cualquier modo';
    return { que, modos };
  }
  function tareaHecha(t){ return t.rondas_validas >= t.rondas; }
  // Una tarea en «Hoy»: qué es, cuánto lleva y sus botones.
  function tarjetaTarea(t){
    const hecha = tareaHecha(t);
    const { que, modos } = describirTarea(t);
    const pct = Math.min(100, Math.round(t.rondas_validas * 100 / t.rondas));
    const vencida = t.fecha_limite && !hecha && new Date(t.fecha_limite + 'T23:59:59') < new Date();
    const sinContar = t.rondas_jugadas - t.rondas_validas;
    const unModo = t.modos.length === 1;
    const temario = esTemario(t);
    const acciones = temario
      ? '<button type="button" class="btn btn-primary btn-light" onclick="CJT.abrirTarea(' + t.id + ')">Estudiar</button>' +
        '<button type="button" class="btn btn-ghost" onclick="CJT.preguntarTarea(' + t.id + ')">Preguntar</button>'
      : (unModo ? '<button type="button" class="btn btn-primary btn-light" onclick="CJ.empezarTarea(' + t.id + ')">Empezar ronda</button>' : '') +
        '<button type="button" class="btn ' + (unModo ? 'btn-ghost' : 'btn-primary btn-light') + '" onclick="CJ.estudiarTarea(' + t.id + ')">Estudiar</button>';
    return '<div class="cj-card cj-tarea' + (hecha ? ' hecha' : '') + '">' +
      '<div class="cj-tarea-cab">' +
        '<span class="cj-tarea-etq">' + (hecha ? '✓ Hecha' : temario ? 'Estúdiate esto' : 'Tarea') + '</span>' +
        (!hecha && !t.vista_at ? '<span class="cj-tarea-solo">Nueva</span>' : '') +
        (t.fecha_limite ? '<span class="cj-tarea-fecha' + (vencida ? ' vencida' : '') + '">' + (vencida ? 'Venció el ' : 'Hasta el ') + fechaCorta(t.fecha_limite) + '</span>' : '') +
      '</div>' +
      '<div class="cj-tarea-titulo">' + escapeHtml(t.titulo) + '</div>' +
      '<div class="cj-tarea-que">' + escapeHtml(que) + '</div>' +
      (t.mensaje ? '<div class="cj-tarea-msg">' + escapeHtml(t.mensaje) + '</div>' : '') +
      '<div class="cj-tarea-barra"><div class="cj-bar"><div class="cj-bar-fill" style="width:' + pct + '%"></div></div>' +
        '<b>' + Math.min(t.rondas_validas, t.rondas) + '/' + t.rondas + '</b></div>' +
      '<div class="cj-tarea-prog">' + t.rondas + (t.rondas === 1 ? ' ronda' : ' rondas') + (temario ? '' : ' de ' + escapeHtml(modos)) + ' con un ' + t.minimo + '% o más' +
        (sinContar > 0 ? ' · ' + sinContar + (sinContar === 1 ? ' no cuenta' : ' no cuentan') : '') + '</div>' +
      '<div class="cj-tarea-acciones">' + acciones +
        '<button type="button" class="btn btn-ghost" onclick="CJP.abrirMensajes(' + t.id + ')">Mensajes' +
          (t.sin_leer ? ' <span class="cj-num">' + t.sin_leer + '</span>' : (t.mensajes ? ' (' + t.mensajes + ')' : '')) + '</button>' +
      '</div>' +
    '</div>';
  }
  const marcandoVista = new Set();
  function marcarVistas(){
    tareasActivas().filter(t => !t.vista_at && !marcandoVista.has(t.id)).forEach(t => {
      marcandoVista.add(t.id);
      sb.rpc('callejero_tarea_vista', { p_tarea: t.id }).then(r => {
        if(!r.error){ t.vista_at = new Date().toISOString(); comprobarAvisos(true); }
      }, () => {});
    });
  }
  // La página se desplaza dentro de #app (no la ventana).
  function arriba(){ const a = document.getElementById('app'); if(a) a.scrollTop = 0; else window.scrollTo(0, 0); }
  function guardarZona(z){
    zona = z || '';
    try{ localStorage.setItem(ZONA_KEY, zona); }catch(e){}
  }
  // «Estudiar» de una tarea de calles: sus calles, con sus modos.
  function estudiarTarea(id){
    guardarZona('t:' + id);
    pestana = 'estudiar';
    enCalles = true;
    pintarInicio();
    arriba();
  }
  function empezarTarea(id){
    const t = tareasZona().find(x => x.id === id);
    if(!t) return;
    guardarZona('t:' + id);
    empezar(t.modos[0] || 'localiza');
  }
  function cambiarVistaProfesor(v){
    vistaProfesor = v === 'propio' || v === 'temario' ? v : 'alumnos';
    try{ localStorage.setItem('cj_vista_profesor', vistaProfesor); }catch(e){}
    pintarInicio();
    arriba();
  }
  // Pestañas del alumno. Volver a tocar «Estudiar» estando en ella lleva a su principio.
  function cambiarPestana(p){
    if(p === 'estudiar' && pestana === 'estudiar') enCalles = false;
    pestana = ['hoy', 'estudiar', 'progreso'].includes(p) ? p : 'hoy';
    pintarInicio();
    arriba();
  }
  function abrirCalles(){ enCalles = true; pintarInicio(); arriba(); }
  function cerrarCalles(){ enCalles = false; pintarInicio(); arriba(); }

  /* ---------- pestañas de la pantalla principal ---------- */
  // Profesor: dos pestañas, «Alumnos» (js/callejero-profesor.js) y «Temario»,
  // y el enlace a su propio callejero.
  // Alumno (y profesor en «Mi callejero»): tres pestañas.
  //   Hoy:      las tareas y lo que más conviene hacer ahora.
  //   Estudiar: las fichas del temario y las calles de Córdoba (zona y modos).
  //   Progreso: temario, lo que más falla, calles, últimas rondas.
  function pintarInicio(){
    const root = el('cjInicio');
    if(!root) return;
    const profe = typeof currentUserIsProfesor !== 'undefined' && currentUserIsProfesor;
    if(profe && vistaProfesor !== 'propio' && typeof CJP !== 'undefined'){
      // El temario lo ve entero y desde él les manda lo que quiera.
      const b = (v, texto) => '<button type="button" role="tab" aria-selected="' + (vistaProfesor === v) + '"' + (vistaProfesor === v ? ' class="activo"' : '') +
        ' onclick="CJ.cambiarVistaProfesor(\'' + v + '\')">' + texto + '</button>';
      root.innerHTML = '<div class="cjp-arriba"><button type="button" class="cj-volver-link" onclick="CJ.cambiarVistaProfesor(\'propio\')">Mi callejero ›</button></div>' +
        '<div class="cj-segmento cj-pestanas" role="tablist">' + b('alumnos', 'Alumnos') + b('temario', 'Temario') + '</div>' +
        (vistaProfesor === 'temario' ? (typeof CJT !== 'undefined' ? CJT.tarjetaInicio() : '') : '<div id="cjpAlumnos"></div>');
      if(vistaProfesor === 'alumnos') CJP.pintarAlumnos(el('cjpAlumnos'));
      return;
    }
    const volverProfe = profe ? '<button type="button" class="cj-volver-link" onclick="CJ.cambiarVistaProfesor(\'alumnos\')">‹ Volver a mis alumnos</button>' : '';
    if(!datos){ root.innerHTML = volverProfe + '<div class="cj-card">' + skelList(3) + '</div>'; return; }
    actualizarFiltro();
    marcarVistas();
    root.innerHTML = volverProfe + pestanasHtml() +
      (pestana === 'estudiar' ? estudiarHtml() : pestana === 'progreso' ? progresoHtml() : hoyHtml());
  }
  function pestanasHtml(){
    const porHacer = tareasActivas().filter(t => !tareaHecha(t)).length;
    const b = (p, texto, n) => '<button type="button" role="tab" aria-selected="' + (pestana === p) + '"' + (pestana === p ? ' class="activo"' : '') +
      ' onclick="CJ.cambiarPestana(\'' + p + '\')">' + texto + (n ? ' <span class="cj-num">' + n + '</span>' : '') + '</button>';
    return '<div class="cj-segmento cj-pestanas" role="tablist">' +
      b('hoy', 'Hoy', pestana !== 'hoy' ? porHacer : 0) + b('estudiar', 'Estudiar') + b('progreso', 'Progreso') + '</div>';
  }
  const AVISO_SOLO = '<div class="cj-card"><div class="cj-zona-aviso">Tu profesor ha pedido que, de momento, estudies solo sus tareas.</div></div>';

  // ---- Hoy ----
  function hoyHtml(){
    const activas = tareasActivas();
    const porHacer = activas.filter(x => !tareaHecha(x));
    const hechas = activas.filter(tareaHecha);
    return (porHacer.length ? '<div class="cj-seccion">Tareas de tu profesor</div>' + porHacer.map(tarjetaTarea).join('') : '') +
      (soloEsto() ? AVISO_SOLO : tarjetaHoy(porHacer.length > 0)) +
      (hechas.length ? '<details class="cj-hechas"><summary>Tareas hechas (' + hechas.length + ')</summary>' + hechas.map(tarjetaTarea).join('') + '</details>' : '');
  }
  // Lo que más conviene hacer ahora: repasar lo fallado (temario o calles),
  // seguir con la última ficha o empezar por la General. Y un resumen.
  function tarjetaHoy(conTareas){
    if(typeof CJT === 'undefined') return '';
    const r = CJT.resumen();
    if(!r) return '<div class="cj-card">' + skelList(2) + '</div>';
    const calles = callesPorRepasar();
    const boton = (accion, titulo, sub) => '<button type="button" class="cj-hoy-btn" onclick="' + escapeHtml(accion) + '">' +
      '<span class="cj-hoy-play"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.14v13.72a1 1 0 0 0 1.5.86l11-6.86a1 1 0 0 0 0-1.72l-11-6.86A1 1 0 0 0 8 5.14Z"/></svg></span>' +
      '<span class="cj-hoy-txt"><b>' + escapeHtml(titulo) + '</b><small>' + escapeHtml(sub) + '</small></span></button>';
    const seguir = r.ultima ? ['CJT.abrir(' + JSON.stringify(r.ultima.id) + ')', 'Seguir con ' + r.ultima.titulo, r.ultima.pct + '% dominado'] : null;
    let principal, otro = null;
    if(r.falladas){
      principal = boton('CJT.repasar()', 'Repasar lo que fallas', r.falladas + (r.falladas === 1 ? ' cosa' : ' cosas') + ' del temario por repasar');
      otro = seguir;
    }else if(calles.total){
      principal = boton('CJ.repasarCalles()', 'Repasar calles', calles.total + ' por repasar · ' + nombreZona());
      otro = seguir;
    }else if(seguir) principal = boton(seguir[0], seguir[1], seguir[2]);
    else principal = boton("CJT.abrir('general')", 'Empezar por la ficha General', 'Datos, carreteras, puentes, planos…');
    const hace7 = Date.now() - 7 * 864e5;
    const semana = todasLasRondas().filter(x => new Date(x.fin).getTime() >= hace7).length;
    return (conTareas ? '<div class="cj-seccion">Para hoy</div>' : '') +
      '<div class="cj-card cj-hoy">' + principal +
        (otro ? '<button type="button" class="cj-hoy-otro" onclick="' + escapeHtml(otro[0]) + '">' + escapeHtml(otro[1]) + ' ›</button>' : '') +
      '</div>' +
      '<button type="button" class="cj-resumen" onclick="CJ.cambiarPestana(\'progreso\')">' +
        '<span class="cj-resumen-txt"><span><b>' + r.pct + '%</b> del temario dominado</span><span><b>' + semana + '</b> ' + (semana === 1 ? 'ronda' : 'rondas') + ' esta semana</span></span>' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>' +
      '</button>';
  }
  // Calles y lugares por repasar (la última vez mal) de la zona elegida, y el modo que más lo necesita.
  const MODO_DE_HAB = { nombre: 'opciones', localiza: 'localiza', cruces: 'cruces', lugares: 'lugares', parque: 'parque' };
  const ID_TEMARIO = 5000000000000;
  function callePorId(id){
    const x = id > 0 ? datos.viaPorId.get(id) : datos.lugarPorId.get(-id);
    return x && (id > 0 ? x.jugable && filtro.via(x) : filtro.lugar(x)) ? x : null;
  }
  function callesPorRepasar(){
    const n = {};
    let total = 0;
    progreso.forEach((p, k) => {
      const [hab, s] = k.split('|'), id = Number(s);
      if(!MODO_DE_HAB[hab] || id >= ID_TEMARIO || estadoDe(p) !== 'fallada' || !callePorId(id)) return;
      n[hab] = (n[hab] || 0) + 1;
      total++;
    });
    const hab = Object.keys(n).sort((a, b) => n[b] - n[a])[0];
    return { total, modo: hab ? MODO_DE_HAB[hab] : null };
  }
  function repasarCalles(){
    const r = callesPorRepasar();
    if(r.modo) empezar(r.modo); else uiToast('No tienes calles por repasar en ' + nombreZona() + '.', 'info');
  }

  // ---- Estudiar ----
  function estudiarHtml(){
    if(soloEsto()) return AVISO_SOLO + (tareasZona().length ? callesHtml(false) : '');
    if(enCalles) return callesHtml(true);
    const n = new Set(datos.jugables.filter(enZona).map(v => v.nombre)).size;
    return (typeof CJT !== 'undefined' ? '<div class="cj-seccion">Temario de la academia</div>' + CJT.filasFichas() : '') +
      '<div class="cj-seccion">Callejero</div>' +
      '<div class="cj-card cjt-inicio"><button type="button" class="cjt-ficha" onclick="CJ.abrirCalles()">' +
        '<span class="cj-fila-icono">' + svgIcono(ICONOS.mapa) + '</span>' +
        '<span class="cjt-ficha-txt"><span class="cjt-ficha-n">Calles de Córdoba</span>' +
          '<span class="cjt-ficha-d">' + escapeHtml(nombreZona()) + ' · ' + n.toLocaleString('es-ES') + ' calles · mapa libre y 6 modos de juego</span></span>' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>' +
      '</button></div>';
  }
  // Las calles: la zona (o una tarea de calles) y los modos en baldosas.
  function callesHtml(conCabecera){
    const t = tareaDeZona();
    const info = t && usaLista(t)
      ? describirTarea(t).que + ' elegidos por tu profesor'
      : new Set(datos.jugables.filter(enZona).map(v => v.nombre)).size.toLocaleString('es-ES') + ' calles en ' + nombreZona();
    return (conCabecera
        ? '<div class="cjt-cab"><button type="button" class="cj-salir" onclick="CJ.cerrarCalles()" aria-label="Volver">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg></button>' +
            '<div><div class="cjt-cab-etq">Callejero</div><h2>Calles de Córdoba</h2></div></div>'
        : '') +
      ((datos.barrios.length || tareasZona().length)
        ? '<div class="cj-card cj-zona">' + selectorZona() + '<div class="cj-zona-info">' + escapeHtml(info) + '</div></div>'
        : '') +
      mosaicoModos();
  }
  // Iconos de los modos: trazados SVG separados por «|» («circle:cx,cy,r» para un círculo).
  const ICONOS = {
    mapa: 'M14.106 5.553a2 2 0 0 0 1.788 0l3.659-1.83A1 1 0 0 1 21 4.619v12.764a1 1 0 0 1-.553.894l-4.553 2.277a2 2 0 0 1-1.788 0l-4.212-2.106a2 2 0 0 0-1.788 0l-3.659 1.83A1 1 0 0 1 3 19.381V6.618a1 1 0 0 1 .553-.894l4.553-2.277a2 2 0 0 1 1.788 0z|M15 5.764v15|M9 3.236v15',
    estudio: 'M12 7v14|M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z',
    localiza: 'M20 10c0 4.99-5.54 10.19-7.4 11.8a1 1 0 0 1-1.2 0C9.54 20.19 4 14.99 4 10a8 8 0 0 1 16 0|circle:12,10,3',
    opciones: 'M9 11l3 3L22 4|M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11',
    voz: 'M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z|M19 10v2a7 7 0 0 1-14 0v-2|M12 19v3',
    cruces: 'M12 3v18|M3 12h18|M8 3v4|M16 17v4',
    lugares: 'M3 21h18|M5 21V7l8-4v18|M19 21V11l-6-4|M9 9v.01|M9 12v.01|M9 15v.01|M9 18v.01',
    parque: 'M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.43-2.29 1-3a2.5 2.5 0 0 0 2.5 2.5z'
  };
  function svgIcono(icono){
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      icono.split('|').map(d => {
        if(!d.startsWith('circle:')) return '<path d="' + d + '"/>';
        const [cx, cy, r] = d.slice(7).split(',');
        return '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '"/>';
      }).join('') + '</svg>';
  }
  const BALDOSAS = [
    ['estudio', 'Mapa libre', 'Toca o busca calles y lugares'],
    ['localiza', 'Localiza la calle', 'Te doy el nombre y la tocas'],
    ['opciones', '¿Cómo se llama?', 'Elige entre 4 nombres'],
    ['voz', 'Di el nombre', 'Lo dices y lo compruebas'],
    ['cruces', 'Cruces y paralelas', '¿Cuál cruza con esta?'],
    ['lugares', 'Lugares importantes', 'Hospitales, colegios…'],
    ['parque', '¿Qué parque acude?', 'Central o Granadal']
  ];
  // Los modos de juego en baldosas: sin z, en la zona elegida; con z (desde
  // una ficha del temario), en esa zona. `sinEstudio`: sin «Mapa libre»;
  // `compacto`: solo el icono y el nombre.
  function mosaicoModos(z, sinEstudio, compacto){
    const propia = z === undefined;
    const t = propia ? tareaDeZona() : null;
    const f = propia ? filtro : filtroDe(z);
    const hayVias = datos.jugables.some(f.via);
    const hay = {
      estudio: !sinEstudio, localiza: hayVias, opciones: hayVias, voz: hayVias, cruces: hayVias,
      lugares: datos.lugares.some(f.lugar),
      parque: !!datos.lineaParques && (datos.jugables.some(v => v.parque && f.via(v)) || datos.lugares.some(l => l.parque && f.lugar(l)))
    };
    const zq = JSON.stringify(z || '');
    const accion = m => m === 'estudio'
      ? (propia ? 'CJ.estudio()' : 'CJ.estudioEn(' + zq + ')')
      : (propia ? 'CJ.empezar(\'' + m + '\')' : 'CJ.empezarEn(' + zq + ', \'' + m + '\')');
    return '<div class="cj-mosaico' + (compacto ? ' compacto' : '') + '">' + BALDOSAS.filter(b => hay[b[0]]).map(([m, titulo, desc]) => {
      const cuenta = !!t && m !== 'estudio' && (!t.modos.length || t.modos.includes(m));
      return '<button type="button" class="cj-baldosa' + (m === 'estudio' ? ' ancha' : '') + '" onclick="' + escapeHtml(accion(m)) + '">' +
        '<span class="cj-baldosa-icono cj-mode-icon-' + m + '">' + svgIcono(ICONOS[m]) + '</span>' +
        '<span class="cj-baldosa-txt"><span class="cj-baldosa-t">' + escapeHtml(titulo) + '</span>' +
          '<span class="cj-baldosa-d">' + escapeHtml(desc) + '</span></span>' +
        (cuenta ? '<span class="cj-cuenta">Cuenta</span>' : '') +
      '</button>';
    }).join('') + '</div>';
  }
  // Desde una ficha del temario: jugar o ver el mapa en su distrito (o en toda Córdoba).
  function empezarEn(z, m){ if(zonaValida(z)) guardarZona(z); empezar(m); }
  function estudioEn(z){ if(zonaValida(z)) guardarZona(z); estudio(); }

  // ---- Progreso ----
  function progresoHtml(){
    const temario = typeof CJT !== 'undefined' && !soloEsto();
    return (temario ? '<div class="cj-seccion">Temario</div>' + CJT.tarjetaProgresoFichas() : '') +
      '<div class="cj-seccion">Lo que más fallas</div>' + falladasHtml(temario) +
      '<div class="cj-seccion">Calles</div>' + tarjetaProgreso(progreso, filtro, nombreZona()) +
      ultimasRondas(todasLasRondas()) +
      '<details class="cj-info-det"><summary>' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>' +
        'De dónde salen los datos</summary>' +
        '<div class="cj-fuente">' + datos.jugables.length.toLocaleString('es-ES') + ' vías de Córdoba del callejero oficial de la Junta de Andalucía (CDAU), revisado cada semana y cruzado con el callejero del INE. ' +
          'Rondas de hasta ' + PREGUNTAS_POR_RONDA + ' preguntas; primero salen las que fallaste. Una cosa está dominada si nunca la has fallado o si llevas 3 aciertos seguidos.' +
          (datos.lineaParques ? ' Zonas de los parques según el documento oficial del S.E.I.S.; lo que está pegado a la línea no se pregunta.' : '') +
          (typeof CJT !== 'undefined' && CJT.fuente() ? ' ' + escapeHtml(CJT.fuente()) : '') + '</div>' +
      '</details>';
  }
  // Lo que más falla (la última vez mal, o fallado y aún sin dominar): el
  // temario entero y las calles y lugares de la zona elegida.
  const HAB_TXT = { nombre: 'Nombre', localiza: 'Situarla', cruces: 'Cruces', lugares: 'Situarlo', parque: 'Parque que acude' };
  function falladasHtml(conTemario){
    const filas = [];
    progreso.forEach((p, k) => {
      const [hab, s] = k.split('|'), id = Number(s);
      if(!p.fallos || estadoDe(p) === 'dominada') return;
      const temario = id >= ID_TEMARIO;
      if(temario && !conTemario) return;
      const x = temario ? CJT.nombreItem(id) : MODO_DE_HAB[hab] ? callePorId(id) : null;
      if(x) filas.push({ hab, p, x, temario });
    });
    filas.sort((a, b) => (a.p.racha === 0 ? 0 : 1) - (b.p.racha === 0 ? 0 : 1) || b.p.fallos - a.p.fallos || (b.p.ultima || 0) - (a.p.ultima || 0));
    if(!filas.length) return '<div class="cj-card"><div class="cj-hab-det">Nada por repasar. ¡Bien!</div></div>';
    const hayCalles = filas.some(r => !r.temario);
    return '<div class="cj-card cj-falladas">' + filas.slice(0, 8).map(r =>
      '<div class="cj-ronda"><div class="cj-ronda-txt">' +
        '<div class="cj-ronda-modo">' + escapeHtml(r.x.nombre) + '</div>' +
        '<div class="cj-ronda-zona">' + escapeHtml(r.temario ? r.x.donde : HAB_TXT[r.hab]) + (r.p.racha === 0 ? ' · la última, mal' : ' · recuperándola') + '</div>' +
      '</div><b class="ko">' + r.p.fallos + (r.p.fallos === 1 ? ' fallo' : ' fallos') + '</b></div>').join('') +
      '<div class="cj-tarea-acciones">' +
        (filas.some(r => r.temario) ? '<button type="button" class="btn btn-primary btn-light" onclick="CJT.repasar()">Repasar el temario</button>' : '') +
        (hayCalles ? '<button type="button" class="btn ' + (filas.some(r => r.temario) ? 'btn-ghost' : 'btn-primary btn-light') + '" onclick="CJ.repasarCalles()">Repasar calles</button>' : '') +
      '</div></div>';
  }
  function ultimasRondas(rondas){
    return '<div class="cj-seccion">Tus últimas rondas</div>' +
      '<div class="cj-card cj-rondas">' + rondasHtml(rondas, null, verTodasRondas ? 30 : 5) +
        (rondas.length > 5 ? '<button type="button" class="cj-ver-mas" onclick="CJ.alternarRondas()">' + (verTodasRondas ? 'Ver menos' : 'Ver más') + '</button>' : '') +
      '</div>';
  }

  async function abrir(){
    const root = el('cjInicio');
    // Se vuelve a la ronda, al modo estudio o a la página del profesor tal cual se dejaron.
    if(modo){ if(mapa) setTimeout(() => mapa.invalidateSize(), 0); return; }
    if(vistaActual === 'panel' || vistaActual === 'temario') return;
    mostrarVista('inicio');
    pintarInicio();
    try{
      await cargarDatos();
      await Promise.all([cargarProgreso(), cargarTareas(), cargarRondas()]);
      if(vistaActual === 'inicio') pintarInicio();
      comprobarAvisos(true);
    }catch(e){
      if(root) root.innerHTML = '<div class="cj-card cj-error">No se ha podido cargar el callejero: ' + escapeHtml(e.message) +
        '<br><button type="button" class="btn btn-light" onclick="CJ.abrir()">Reintentar</button></div>';
    }
  }

  function mostrarVista(v){
    vistaActual = v;
    el('cjInicio').classList.toggle('hidden', v !== 'inicio');
    el('cjJuego').classList.toggle('hidden', v !== 'juego');
    el('cjFin').classList.toggle('hidden', v !== 'fin');
    el('cjPanel').classList.toggle('hidden', v !== 'panel');
    el('cjTemario').classList.toggle('hidden', v !== 'temario');
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
  // Orden de las preguntas según el progreso en la habilidad del modo
  // (cada modo mira su habilidad): primero las falladas (hasta el 40 %) y
  // las que están en progreso (hasta el 20 %), luego las que no han salido
  // nunca, luego las dominadas y al final el resto de falladas y en progreso.
  function ordenarPorRepaso(items, idDe, m){
    const hab = HABILIDAD[m] || 'nombre';
    const grupos = { fallada: [], progreso: [], nueva: [], dominada: [] };
    items.forEach(x => grupos[estadoDe(progreso.get(claveP(hab, idDe(x))))].push(x));
    const falladas = barajar(grupos.fallada), enProgreso = barajar(grupos.progreso);
    const nf = Math.ceil(PREGUNTAS_POR_RONDA * 0.4), np = Math.ceil(PREGUNTAS_POR_RONDA * 0.2);
    return falladas.slice(0, nf).concat(enProgreso.slice(0, np), barajar(grupos.nueva), barajar(grupos.dominada), falladas.slice(nf), enProgreso.slice(np));
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
      return sinRepetirNombre(ordenarPorRepaso(vias, v => v.id, m), n, v => ({ via: v, id: v.id, etiqueta: 'Localiza', texto: v.nombre, nombre: v.nombre }));
    }
    if(m === 'opciones'){
      return sinRepetirNombre(ordenarPorRepaso(vias, v => v.id, m), n, v => {
        const otras = [...new Set(viasCercanasA(v, 12).map(w => w.nombre))].slice(0, 3);
        if(otras.length < 3) return null;
        return Object.assign({ via: v, id: v.id, etiqueta: '¿Cómo se llama la calle marcada?', texto: '', nombre: v.nombre }, opcionesCon(v.nombre, otras));
      });
    }
    if(m === 'voz'){
      return sinRepetirNombre(ordenarPorRepaso(vias, v => v.id, m), n, v => ({ via: v, id: v.id, etiqueta: 'Di el nombre de la calle marcada', texto: '', nombre: v.nombre }));
    }
    if(m === 'cruces'){
      let turno = 0;
      return sinRepetirNombre(ordenarPorRepaso(vias, v => v.id, m), n, v => {
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
      const lugares = datos.lugares.filter(enZonaLugar);
      return sinRepetirNombre(ordenarPorRepaso(lugares, l => -l.id, m), n, l => ({ lugar: l, id: -l.id, etiqueta: 'Localiza · ' + l.categoria, texto: l.nombre, nombre: l.nombre }));
    }
    if(m === 'parque'){
      const items = vias.filter(v => v.parque).map(v => ({ via: v, nombre: v.nombre, id: v.id, parque: v.parque }))
        .concat(datos.lugares.filter(l => l.parque && enZonaLugar(l)).map(l => ({ lugar: l, nombre: l.nombre, id: -l.id, parque: l.parque })));
      return sinRepetirNombre(ordenarPorRepaso(items, x => x.id, m), n, x => Object.assign({}, x, {
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
    actualizarFiltro();
    const preguntas = crearPreguntas(m);
    if(!preguntas.length){ uiToast('No hay preguntas de este tipo en esta zona.', 'info'); return; }
    const t = tareaDeZona();
    // Desde una ficha del temario (sus calles), al acabar se vuelve a ella.
    desdeTemario = vistaActual === 'temario' || (vistaActual === 'fin' && desdeTemario);
    ronda = { id: nuevoUid(), preguntas, i: 0, aciertos: 0, respondidas: 0, fallos: [], respondida: false, zona, tareaId: t ? t.id : null };
    modo = m;
    mostrarVista('juego');
    ponerInterfaz();
    crearMapa();
    pintarZona();
    irAZona(false);
    siguientePregunta(true);
  }

  /* ---------- temario (las preguntas las hace js/callejero-temario.js) ---------- */
  // Cómo se responde la pregunta: la del modo o, en el temario, la de cada pregunta.
  function respuestaDe(q){ return modo === 'temario' ? q.respuesta : MODOS[modo].respuesta; }
  // Lo que puede dibujar el temario en el mapa (antes y después de responder).
  function mapaApi(){ return { mapa, capa: capaMarcas, resaltar, verVias, limitesDe }; }
  let ultimaTemario = null;   // para «Otra ronda»
  // opts: { crear() → preguntas, zona ('f:<clave>' o 't:<tarea>'), tareaId, titulo, encuadre() → puntos }
  async function empezarTemario(opts){
    try{
      await Promise.all([cargarLeaflet(), cargarDatos()]);
    }catch(e){
      uiToast(e.message, 'error');
      return;
    }
    const preguntas = opts.crear();
    if(!preguntas.length){ uiToast('No hay preguntas de esto.', 'info'); return; }
    // Al acabar se vuelve a la pantalla del temario si se empezó desde ella.
    desdeTemario = vistaActual === 'temario' || (vistaActual === 'fin' && desdeTemario);
    ultimaTemario = opts;
    ronda = { id: nuevoUid(), preguntas, i: 0, aciertos: 0, respondidas: 0, fallos: [], respondida: false, zona: opts.zona,
      tareaId: opts.tareaId || null, titulo: opts.titulo, encuadre: opts.encuadre ? opts.encuadre() : null };
    modo = 'temario';
    verTemario = null;
    mostrarVista('juego');
    ponerInterfaz();
    crearMapa();
    capaZona.clearLayers();
    capaPuntos.clearLayers();
    contornoDistritos(opts.distritos);
    if(ronda.encuadre) mapa.fitBounds(L.latLngBounds(ronda.encuadre), { padding: [30, 30], maxZoom: 16 });
    else mapa.setView(CENTRO, 13);
    siguientePregunta(true);
  }
  function otraRonda(){ if(ultimaTemario) empezarTemario(ultimaTemario); }
  // Contorno de los distritos de una ficha (como el de la zona elegida).
  function contornoDistritos(distritos){
    datos.barrios.filter(b => (distritos || []).includes(b.distrito)).forEach(b => {
      L.polyline(b.anillos, { color: '#F2665C', weight: 2.5, opacity: 0.9, dashArray: '6 6', interactive: false }).addTo(capaZona);
    });
  }
  function irAEncuadre(){
    if(ronda && ronda.encuadre) mapa.flyToBounds(L.latLngBounds(ronda.encuadre), { padding: [30, 30], maxZoom: 16, duration: 0.6 });
    else mapa.flyTo(CENTRO, 13, { duration: 0.6 });
  }

  // Opciones, botones de voz o plano (debajo de la pregunta o sobre el mapa).
  function ponerRespuesta(respuesta, conPlano){
    el('cjOpciones').classList.toggle('hidden', respuesta !== 'opciones');
    el('cjVoz').classList.toggle('hidden', respuesta !== 'voz');
    el('cjPlano').classList.toggle('hidden', !conPlano);
    // Con botones debajo de la pregunta, el mapa se hace más bajo.
    document.getElementById('screen-callejero').classList.toggle('cj-con-respuesta', respuesta === 'opciones' || respuesta === 'voz');
  }
  // Lo que se ve encima y dentro del mapa depende del modo.
  function ponerInterfaz(){
    const libre = modo === 'estudio' || modo === 'seleccion';
    const respuesta = libre || modo === 'temario' ? null : MODOS[modo].respuesta;
    ponerRespuesta(respuesta, false);
    el('cjOpciones').innerHTML = '';
    const pantalla = document.getElementById('screen-callejero');
    pantalla.classList.toggle('cj-seleccionando', modo === 'seleccion');
    el('cjContador').classList.toggle('hidden', libre);
    el('cjAciertos').classList.toggle('hidden', libre);
    el('cjBarraTitulo').classList.toggle('hidden', !libre);
    el('cjBarraTitulo').textContent = modo === 'seleccion' ? 'Elegir calles y lugares' : verTemario ? verTemario.titulo : 'Modo estudio';
    el('cjPreguntaWrap').classList.toggle('hidden', libre);
    el('cjBuscarWrap').classList.toggle('hidden', !libre);
    el('cjSel').classList.toggle('hidden', modo !== 'seleccion');
    el('cjPista').textContent = modo === 'seleccion' ? 'Toca una calle o un punto morado para elegirlo o quitarlo'
      : verTemario ? 'Toca lo marcado en azul para ver qué es' : 'Toca una calle para ver cómo se llama';
    el('cjPista').classList.toggle('hidden', !libre);
    el('cjInfo').classList.add('hidden');
    el('cjResultado').className = 'cj-resultado hidden';
    el('cjSugerencias').classList.add('hidden');
    el('cjBuscar').value = '';
    el('cjLista').classList.add('hidden');
    const boton = el('cjListaBoton');
    if(modo === 'estudio' && verTemario){
      boton.textContent = 'Lista de lo marcado (' + verTemario.items.length + ')';
      boton.classList.remove('hidden');
    }else if(modo === 'estudio' && zona){
      const n = new Set(datos.vias.filter(enZona).map(v => v.nombre)).size;
      const nl = datos.lugares.filter(enZonaLugar).length;
      const t = tareaDeZona();
      boton.textContent = (t && usaLista(t) ? 'Calles y lugares de la tarea' : 'Calles de ' + nombreZona()) + ' (' + (t && usaLista(t) ? n + nl : n) + ')';
      boton.classList.remove('hidden');
    }else boton.classList.add('hidden');
  }

  // Lista alfabética de las calles de la zona (y los lugares, si es una
  // tarea), sobre el mapa. En el modo selección, lo elegido.
  let listaZona = [];
  function alternarLista(){
    const caja = el('cjLista');
    if(!caja.classList.contains('hidden')){ caja.classList.add('hidden'); return; }
    if(modo === 'seleccion'){ pintarListaSeleccion(); caja.scrollTop = 0; caja.classList.remove('hidden'); return; }
    if(verTemario){
      const variosTipos = new Set(verTemario.items.map(it => it.tipo)).size > 1;
      listaZona = verTemario.items.map((it, i) => ({ temario: i, nombre: it.nombre }));
      caja.innerHTML = verTemario.items.map((it, i) => '<button type="button" class="cj-lista-item" onclick="CJ.elegirDeLista(' + i + ')">' + escapeHtml(it.nombre) +
        (variosTipos ? ' <span class="cj-sug-cat">' + escapeHtml(it.tipo) + '</span>' : '') + '</button>').join('');
      caja.scrollTop = 0;
      caja.classList.remove('hidden');
      return;
    }
    const vistos = new Set();
    const t = tareaDeZona();
    const orden = (a, b) => a.nombre.localeCompare(b.nombre, 'es');
    listaZona = datos.vias.filter(enZona).filter(v => !vistos.has(v.clave) && vistos.add(v.clave)).sort(orden).map(v => ({ via: v, nombre: v.nombre }));
    const lugares = t && usaLista(t) ? datos.lugares.filter(enZonaLugar).sort(orden).map(l => ({ lugar: l, nombre: l.nombre })) : [];
    const item = (x, i) => '<button type="button" class="cj-lista-item" onclick="CJ.elegirDeLista(' + i + ')">' + escapeHtml(x.nombre) +
      (x.lugar ? ' <span class="cj-sug-cat">' + escapeHtml(x.lugar.categoria) + '</span>' : '') + '</button>';
    caja.innerHTML = listaZona.map(item).join('') +
      (lugares.length ? '<div class="cj-lista-cab">Lugares</div>' + lugares.map((x, i) => item(x, listaZona.length + i)).join('') : '');
    listaZona = listaZona.concat(lugares);
    caja.scrollTop = 0;
    caja.classList.remove('hidden');
  }
  function elegirDeLista(i){
    const x = listaZona[i];
    if(!x) return;
    el('cjLista').classList.add('hidden');
    if(x.temario !== undefined){ mostrarItemTemario(x.temario, true); return; }
    x.via ? mostrarVia(x.via, true) : mostrarLugar(x.lugar, true);
  }

  /* ---------- modo estudio ---------- */
  // extra (temario): { titulo, items, foco }: lo del temario marcado en el mapa.
  async function estudio(extra){
    try{
      await Promise.all([cargarLeaflet(), cargarDatos()]);
    }catch(e){
      uiToast(e.message, 'error');
      return;
    }
    actualizarFiltro();
    ronda = null;
    modo = 'estudio';
    verTemario = extra && extra.items ? extra : null;
    desdeTemario = vistaActual === 'temario';
    mostrarVista('juego');
    ponerInterfaz();
    crearMapa();
    capaMarcas.clearLayers();
    if(verTemario){
      pintarVerTemario();
      if(verTemario.foco >= 0) mostrarItemTemario(verTemario.foco, false);
      return;
    }
    pintarZona();
    irAZona(false);
  }
  // Todo lo del apartado en azul; lo elegido (lista o toque), en rojo con su ficha.
  function pintarVerTemario(){
    capaZona.clearLayers();
    capaPuntos.clearLayers();
    contornoDistritos(verTemario.distritos);
    const pts = [];
    const azul = '#4E9BF7';
    verTemario.items.forEach(it => {
      if(it.barrio){
        L.polygon(it.barrio.anillos, { color: azul, weight: 2, fillColor: azul, fillOpacity: 0.08, interactive: false }).addTo(capaZona);
        it.barrio.anillos.forEach(a => a.forEach(p => pts.push(p)));
      }
      it.vias.concat((it.ruta || []).flatMap(p => p.vias)).forEach(v => {
        L.polyline(v.lineas, { color: azul, weight: 6, opacity: 0.4, interactive: false }).addTo(capaZona);
      });
      if(it.lugar) L.circleMarker([it.lugar.lat, it.lugar.lng], { radius: 7, color: '#fff', weight: 2, fillColor: azul, fillOpacity: 1, interactive: false }).addTo(capaPuntos);
      puntosItem(it).forEach(p => pts.push(p));
    });
    const foco = verTemario.foco >= 0 ? verTemario.items[verTemario.foco] : null;
    const ptsFoco = foco ? puntosItem(foco) : [];
    const b = L.latLngBounds(ptsFoco.length ? ptsFoco : pts.length ? pts : [CENTRO]);
    mapa.fitBounds(b, { paddingTopLeft: [30, 30], paddingBottomRight: [30, ptsFoco.length ? 150 : 30], maxZoom: 16 });
  }
  function puntosItem(it){
    if(it.encuadre && it.encuadre.length) return it.encuadre;
    const pts = [];
    if(it.barrio) it.barrio.anillos.forEach(a => a.forEach(p => pts.push(p)));
    // (de cada vía basta su caja: da los mismos límites con muchos menos puntos)
    it.vias.concat((it.ruta || []).flatMap(p => p.vias)).forEach(v => pts.push([v.caja.s, v.caja.o], [v.caja.n, v.caja.e]));
    if(it.lugar) pts.push([it.lugar.lat, it.lugar.lng]);
    if(it.salida && it.ruta) pts.push([it.salida.lat, it.salida.lng]);
    return pts;
  }
  function mostrarItemTemario(i, centrar){
    const it = verTemario && verTemario.items[i];
    if(!it) return;
    const rojo = '#F2665C';
    capaMarcas.clearLayers();
    if(it.barrio) L.polygon(it.barrio.anillos, { color: rojo, weight: 3, fillColor: rojo, fillOpacity: 0.18, interactive: false }).addTo(capaMarcas);
    it.vias.forEach(v => resaltar(v, rojo, true));
    // Cada paso del recorrido con su número donde se entra en él.
    (it.ruta || []).forEach((p, k) => {
      p.vias.forEach(v => resaltar(v, rojo, false));
      if(p.en) L.marker(p.en, { interactive: false, icon: L.divIcon({ className: 'cjt-num', html: '<span style="background:' + rojo + '">' + (k + 1) + '</span>', iconSize: [24, 24], iconAnchor: [12, 12] }) }).addTo(capaMarcas);
    });
    if(it.salida && it.ruta) L.circleMarker([it.salida.lat, it.salida.lng], { radius: 10, color: '#fff', weight: 2, fillColor: '#F59E0B', fillOpacity: 1, interactive: false }).addTo(capaMarcas);
    if(it.lugar){
      if(it.lugar.radio > 20) L.circle([it.lugar.lat, it.lugar.lng], { radius: it.lugar.radio, color: rojo, weight: 3, fillColor: rojo, fillOpacity: 0.15, interactive: false }).addTo(capaMarcas);
      L.circleMarker([it.lugar.lat, it.lugar.lng], { radius: 9, color: '#fff', weight: 2, fillColor: rojo, fillOpacity: 1, interactive: false }).addTo(capaMarcas);
    }
    const pts = puntosItem(it);
    if(centrar && pts.length) mapa.flyToBounds(L.latLngBounds(pts), { paddingTopLeft: [50, 50], paddingBottomRight: [50, 150], maxZoom: 17, duration: 0.7 });
    el('cjInfo').innerHTML =
      '<div class="cj-info-tipo">' + escapeHtml(it.tipo) + '</div>' +
      '<div class="cj-info-nombre">' + escapeHtml(it.nombre) + '</div>' +
      (it.detalle || []).map(d => '<div class="cj-info-extra">' + escapeHtml(d) + '</div>').join('');
    el('cjInfo').classList.remove('hidden');
    el('cjPista').classList.add('hidden');
  }
  // Qué elemento del temario se ha tocado: un punto (a menos de 16 px), una calle o un barrio.
  function itemTocado(latlng){
    const px = mapa.latLngToContainerPoint(latlng);
    let mejor = -1, dMin = 16;
    verTemario.items.forEach((it, i) => {
      if(!it.lugar) return;
      const d = mapa.latLngToContainerPoint([it.lugar.lat, it.lugar.lng]).distanceTo(px);
      if(d < dMin){ dMin = d; mejor = i; }
    });
    if(mejor >= 0) return mejor;
    const tol = Math.max(15, mapa.distance(mapa.containerPointToLatLng([0, 0]), mapa.containerPointToLatLng([20, 0])));
    let dv = tol;
    verTemario.items.forEach((it, i) => {
      it.vias.concat((it.ruta || []).flatMap(p => p.vias)).forEach(v => {
        const d = distanciaAVia(latlng.lat, latlng.lng, v);
        if(d < dv){ dv = d; mejor = i; }
      });
    });
    if(mejor >= 0) return mejor;
    return verTemario.items.findIndex(it => it.barrio && dentroDeBarrio(latlng.lat, latlng.lng, it.barrio));
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
  function pista(texto){
    el('cjInfo').classList.add('hidden');
    el('cjPista').textContent = texto;
    el('cjPista').classList.remove('hidden');
  }

  function tocarEstudio(latlng){
    if(verTemario){
      const i = itemTocado(latlng);
      if(i >= 0){ mostrarItemTemario(i, false); return; }
    }
    const cerca = viasCercanas(latlng);
    const v = cerca.length ? cerca[0].v : null;
    if(!v){
      capaMarcas.clearLayers();
      pista('Ahí no hay ninguna calle: toca justo encima de una');
      return;
    }
    const cruce = [];
    cerca.slice(1).forEach(c => {
      if(c.d <= cerca[0].d + 4 && c.v.nombre !== v.nombre && !cruce.includes(c.v.nombre)) cruce.push(c.v.nombre);
    });
    mostrarVia(v, false, cruce);
  }

  function tipoBonito(t){ return t ? t.charAt(0) + t.slice(1).toLowerCase() : ''; }
  const HAB_CORTA = { nombre: 'nombre', localiza: 'situarla', cruces: 'cruces', parque: 'parque', lugares: 'situarlo' };
  // «Aciertos: nombre 3 de 4 · situarla 1 de 2» con lo que haya de cada habilidad.
  function textoAciertosDe(id, habs){
    const partes = habs.map(h => {
      const p = progreso.get(claveP(h, id));
      return p ? HAB_CORTA[h] + ' ' + p.aciertos + ' de ' + p.intentos : null;
    }).filter(Boolean);
    return partes.length ? 'Tus aciertos: ' + partes.join(' · ') + '.' : 'Todavía no te ha salido en ningún modo.';
  }

  function mostrarVia(v, centrar, cruce){
    const iguales = datos.porNombre.get(v.nombre.toLowerCase()) || [v];
    capaMarcas.clearLayers();
    iguales.forEach(o => {
      const principal = o === v;
      L.polyline(o.lineas, { color: '#F2665C', weight: principal ? 10 : 7, opacity: principal ? 0.3 : 0.18, interactive: false }).addTo(capaMarcas);
      L.polyline(o.lineas, { color: '#F2665C', weight: principal ? 4 : 3, opacity: principal ? 1 : 0.6, interactive: false }).addTo(capaMarcas);
    });
    if(centrar) mapa.flyToBounds(limitesDe(iguales), { padding: [70, 70], maxZoom: 17, duration: 0.7 });
    const extra = v.jugable ? textoAciertosDe(v.id, ['nombre', 'localiza', 'cruces', 'parque']) : 'No entra en las preguntas del juego.';
    el('cjInfo').innerHTML =
      '<div class="cj-info-tipo">' + escapeHtml(tipoBonito(v.tipo)) + '</div>' +
      '<div class="cj-info-nombre">' + escapeHtml(v.nombre) + '</div>' +
      (cruce && cruce.length ? '<div class="cj-info-cruce">En el cruce con ' + cruce.map(escapeHtml).join(' y ') + '</div>' : '') +
      (iguales.length > 1 ? '<div class="cj-info-extra">Hay ' + iguales.length + ' vías con este nombre (todas marcadas en el mapa).</div>' : '') +
      (v.parque && datos.lineaParques ? '<div class="cj-info-extra">Acude el ' + escapeHtml(PARQUES[v.parque]) + '.</div>' : '') +
      '<div class="cj-info-extra">' + escapeHtml(extra) + '</div>';
    el('cjInfo').classList.remove('hidden');
    el('cjPista').classList.add('hidden');
  }
  function mostrarLugar(l, centrar){
    capaMarcas.clearLayers();
    if(l.radio > 20) L.circle([l.lat, l.lng], { radius: l.radio, color: '#F2665C', weight: 3, fillColor: '#F2665C', fillOpacity: 0.15, interactive: false }).addTo(capaMarcas);
    L.circleMarker([l.lat, l.lng], { radius: 9, color: '#fff', weight: 2, fillColor: '#F2665C', fillOpacity: 1, interactive: false }).addTo(capaMarcas);
    if(centrar) mapa.flyTo([l.lat, l.lng], Math.max(mapa.getZoom(), 16), { duration: 0.7 });
    el('cjInfo').innerHTML =
      '<div class="cj-info-tipo">' + escapeHtml(l.categoria) + '</div>' +
      '<div class="cj-info-nombre">' + escapeHtml(l.nombre) + '</div>' +
      (l.direccion ? '<div class="cj-info-extra">' + escapeHtml(l.direccion) + '</div>' : '') +
      (l.parque && datos.lineaParques ? '<div class="cj-info-extra">Acude el ' + escapeHtml(PARQUES[l.parque]) + '.</div>' : '') +
      '<div class="cj-info-extra">' + escapeHtml(textoAciertosDe(-l.id, ['lugares', 'parque'])) + '</div>';
    el('cjInfo').classList.remove('hidden');
    el('cjPista').classList.add('hidden');
  }

  // Búsqueda de calles y lugares (modo estudio y modo selección).
  function buscar(texto){
    const q = normalizar(texto.trim());
    const caja = el('cjSugerencias');
    if(q.length < 2){ sugerencias = []; caja.classList.add('hidden'); return; }
    const eligiendo = modo === 'seleccion';
    const vistos = new Set();
    const empiezan = [], contienen = [];
    for(const v of datos.vias){
      // Eligiendo, cada vía por separado: hay nombres repetidos en distintas barriadas.
      if((!eligiendo && vistos.has(v.clave)) || !v.clave.includes(q)) continue;
      vistos.add(v.clave);
      // «calle feria» también encuentra «Calle Feria»; «feria» prioriza
      // las que tienen esa palabra al principio del nombre sin el tipo.
      const sinTipo = v.clave.replace(/^\S+\s+/, '');
      (v.clave.startsWith(q) || sinTipo.startsWith(q) ? empiezan : contienen).push({ via: v, nombre: v.nombre });
    }
    for(const l of datos.lugares){
      if(!l.clave.includes(q)) continue;
      (l.clave.startsWith(q) ? empiezan : contienen).push({ lugar: l, nombre: l.nombre });
    }
    const orden = (a, b) => a.nombre.localeCompare(b.nombre, 'es');
    sugerencias = empiezan.sort(orden).concat(contienen.sort(orden)).slice(0, 10);
    const detalle = s => {
      if(s.lugar) return s.lugar.categoria;
      if(!eligiendo || (datos.porNombre.get(s.via.nombre.toLowerCase()) || []).length < 2) return '';
      return s.via.barrios.length ? s.via.barrios[0].nombre : 'Afueras';
    };
    const elegida = s => eligiendo && (s.via ? seleccion.vias.has(s.via.id) : seleccion.lugares.has(s.lugar.id));
    caja.innerHTML = sugerencias.length
      ? sugerencias.map((s, i) => '<button type="button" class="cj-sugerencia" onclick="CJ.elegir(' + i + ')">' + (elegida(s) ? '✓ ' : '') + escapeHtml(s.nombre) +
          (detalle(s) ? ' <span class="cj-sug-cat">' + escapeHtml(detalle(s)) + '</span>' : '') + '</button>').join('')
      : '<div class="cj-sugerencia-vacia">Ninguna calle ni lugar con ese nombre</div>';
    caja.classList.remove('hidden');
  }

  function elegir(i){
    const s = sugerencias[i];
    if(!s) return;
    el('cjBuscar').value = modo === 'seleccion' ? '' : s.nombre;
    el('cjBuscar').blur();
    el('cjSugerencias').classList.add('hidden');
    if(modo === 'seleccion'){
      alternarElegida(s.via ? 'v' : 'l', s.via ? s.via.id : s.lugar.id, true);
      if(s.via) mapa.flyToBounds(limitesDe([s.via]), { padding: [70, 70], maxZoom: 17, duration: 0.7 });
      else mapa.flyTo([s.lugar.lat, s.lugar.lng], Math.max(mapa.getZoom(), 16), { duration: 0.7 });
      return;
    }
    s.via ? mostrarVia(s.via, true) : mostrarLugar(s.lugar, true);
  }

  /* ---------- modo selección (el profesor elige calles y lugares) ---------- */
  // CJ.seleccionar({ vias, lugares }) abre el mapa con eso elegido y
  // devuelve { vias, lugares } al pulsar «Listo», o null si se sale.
  let marcasSel = null;   // { vias: Map(id → capa), lugares: Map(id → punto) }
  async function seleccionar(inicial){
    await Promise.all([cargarLeaflet(), cargarDatos()]);
    return new Promise(resolve => {
      seleccion = { vias: new Set(((inicial && inicial.vias) || []).map(Number)), lugares: new Set(((inicial && inicial.lugares) || []).map(Number)), cambios: false, resolver: resolve };
      ronda = null;
      modo = 'seleccion';
      mostrarVista('juego');
      ponerInterfaz();
      crearMapa();
      capaZona.clearLayers();
      el('cjSelZona').innerHTML = '<option value="">+ Añadir zona…</option>' + opcionesZona(null).replace(/<option value="">Toda Córdoba<\/option>/, '');
      dibujarSeleccion();
      contadorSeleccion();
      const elegidas = [...seleccion.vias].map(id => datos.viaPorId.get(id)).filter(Boolean);
      const puntos = [...seleccion.lugares].map(id => datos.lugarPorId.get(id)).filter(Boolean).map(l => [l.lat, l.lng]);
      if(elegidas.length || puntos.length){
        const b = elegidas.length ? limitesDe(elegidas) : L.latLngBounds(puntos);
        if(elegidas.length && puntos.length) b.extend(L.latLngBounds(puntos));
        mapa.fitBounds(b, { padding: [30, 30], maxZoom: 16 });
      }else mapa.setView(CENTRO, 14);
    });
  }
  function estiloPunto(on){
    return on ? { radius: 7, color: '#fff', weight: 2, fillColor: '#F2665C', fillOpacity: 1 }
              : { radius: 4, color: '#8C7DF5', weight: 1, fillColor: '#8C7DF5', fillOpacity: 0.8 };
  }
  function dibujarSeleccion(){
    capaMarcas.clearLayers();
    capaPuntos.clearLayers();
    marcasSel = { vias: new Map(), lugares: new Map() };
    datos.lugares.forEach(l => {
      const on = seleccion.lugares.has(l.id);
      marcasSel.lugares.set(l.id, L.circleMarker([l.lat, l.lng], Object.assign({ interactive: false }, estiloPunto(on))).addTo(capaPuntos));
    });
    seleccion.vias.forEach(id => dibujarVia(id, true));
  }
  function dibujarVia(id, on){
    const antes = marcasSel.vias.get(id);
    if(antes){ capaMarcas.removeLayer(antes); marcasSel.vias.delete(id); }
    const v = on && datos.viaPorId.get(id);
    if(!v) return;
    const g = L.layerGroup([
      L.polyline(v.lineas, { color: '#F2665C', weight: 9, opacity: 0.3, interactive: false }),
      L.polyline(v.lineas, { color: '#F2665C', weight: 4, opacity: 1, interactive: false })
    ]).addTo(capaMarcas);
    marcasSel.vias.set(id, g);
  }
  function dibujarLugar(id, on){
    const p = marcasSel.lugares.get(id);
    if(p){ p.setStyle(estiloPunto(on)); p.setRadius(estiloPunto(on).radius); }
  }
  function contadorSeleccion(){
    const nv = seleccion.vias.size, nl = seleccion.lugares.size;
    el('cjSelLista').textContent = 'Lista (' + (nv + nl) + ')';
    el('cjBarraTitulo').textContent = nv + (nv === 1 ? ' calle' : ' calles') + ' y ' + nl + (nl === 1 ? ' lugar' : ' lugares');
  }
  function tocarSeleccion(latlng){
    // Primero un lugar (su punto a menos de 14 px); si no, la calle más cercana.
    const px = mapa.latLngToContainerPoint(latlng);
    let lugar = null, mejor = 14;
    for(const l of datos.lugares){
      const d = mapa.latLngToContainerPoint([l.lat, l.lng]).distanceTo(px);
      if(d < mejor){ mejor = d; lugar = l; }
    }
    if(lugar){ alternarElegida('l', lugar.id); return; }
    const cerca = viasCercanas(latlng);
    if(!cerca.length){ pista('Ahí no hay ninguna calle: toca justo encima de una'); return; }
    alternarElegida('v', cerca[0].v.id);
  }
  // Elige o quita una vía ('v') o un lugar ('l'). `forzar`: true elige, false quita.
  function alternarElegida(tipo, id, forzar){
    if(!seleccion) return;
    const conjunto = tipo === 'v' ? seleccion.vias : seleccion.lugares;
    const on = forzar === undefined ? !conjunto.has(id) : !!forzar;
    if(on) conjunto.add(id); else conjunto.delete(id);
    seleccion.cambios = true;
    if(tipo === 'v') dibujarVia(id, on); else dibujarLugar(id, on);
    contadorSeleccion();
    const x = tipo === 'v' ? datos.viaPorId.get(id) : datos.lugarPorId.get(id);
    if(x){
      el('cjInfo').innerHTML =
        '<div class="cj-info-tipo">' + escapeHtml(tipo === 'v' ? tipoBonito(x.tipo) : x.categoria) + '</div>' +
        '<div class="cj-info-nombre">' + escapeHtml(x.nombre) + '</div>' +
        '<div class="cj-info-extra">' + (on ? 'Elegido para la tarea.' : 'Quitado de la tarea.') +
          (tipo === 'v' && !x.jugable ? ' Ojo: esta vía no sale en las preguntas del juego (solo en el modo estudio).' : '') + '</div>' +
        '<button type="button" class="cj-info-accion" onclick="CJ.alternarElegida(\'' + tipo + '\', ' + id + ')">' + (on ? 'Quitar' : 'Volver a elegir') + '</button>';
      el('cjInfo').classList.remove('hidden');
      el('cjPista').classList.add('hidden');
    }
    if(!el('cjLista').classList.contains('hidden')) pintarListaSeleccion();
  }
  // Añade todas las calles (que salen en el juego) y los lugares de una zona.
  function anadirZona(z){
    if(!seleccion || z === '') return;
    let nv = 0, nl = 0;
    const deZona = datos.jugables.filter(v => enZonaBase(v, z));
    deZona.forEach(v => { if(!seleccion.vias.has(v.id)){ seleccion.vias.add(v.id); dibujarVia(v.id, true); nv++; } });
    datos.lugares.forEach(l => { if(enZonaBase(l, z) && !seleccion.lugares.has(l.id)){ seleccion.lugares.add(l.id); dibujarLugar(l.id, true); nl++; } });
    seleccion.cambios = true;
    contadorSeleccion();
    if(deZona.length) mapa.flyToBounds(limitesDe(deZona), { padding: [30, 30], maxZoom: 16, duration: 0.6 });
    uiToast('Añadidos ' + nv + (nv === 1 ? ' calle' : ' calles') + ' y ' + nl + (nl === 1 ? ' lugar' : ' lugares') + ' de ' + nombreZonaDe(z) + '.', 'info');
    if(!el('cjLista').classList.contains('hidden')) pintarListaSeleccion();
  }
  function pintarListaSeleccion(){
    const orden = (a, b) => a.nombre.localeCompare(b.nombre, 'es');
    const vias = [...seleccion.vias].map(id => datos.viaPorId.get(id)).filter(Boolean).sort(orden);
    const lugares = [...seleccion.lugares].map(id => datos.lugarPorId.get(id)).filter(Boolean).sort(orden);
    const fila = (tipo, x) => '<div class="cj-lista-fila">' +
      '<button type="button" class="cj-lista-item" onclick="CJ.irAElegida(\'' + tipo + '\', ' + x.id + ')">' + escapeHtml(x.nombre) +
        (tipo === 'l' ? ' <span class="cj-sug-cat">' + escapeHtml(x.categoria) + '</span>' : '') + '</button>' +
      '<button type="button" class="cj-lista-quitar" aria-label="Quitar" onclick="CJ.alternarElegida(\'' + tipo + '\', ' + x.id + ', false)">✕</button></div>';
    el('cjLista').innerHTML =
      (vias.length + lugares.length ? '' : '<div class="cj-sugerencia-vacia">Todavía no has elegido nada. Toca calles en el mapa, búscalas o añade una zona entera.</div>') +
      (vias.length ? '<div class="cj-lista-cab">Calles (' + vias.length + ')<button type="button" onclick="CJ.quitarTodas(\'v\')">Quitar todas</button></div>' + vias.map(v => fila('v', v)).join('') : '') +
      (lugares.length ? '<div class="cj-lista-cab">Lugares (' + lugares.length + ')<button type="button" onclick="CJ.quitarTodas(\'l\')">Quitar todos</button></div>' + lugares.map(l => fila('l', l)).join('') : '');
  }
  function irAElegida(tipo, id){
    el('cjLista').classList.add('hidden');
    const x = tipo === 'v' ? datos.viaPorId.get(id) : datos.lugarPorId.get(id);
    if(!x) return;
    if(tipo === 'v') mapa.flyToBounds(limitesDe([x]), { padding: [70, 70], maxZoom: 17, duration: 0.7 });
    else mapa.flyTo([x.lat, x.lng], Math.max(mapa.getZoom(), 16), { duration: 0.7 });
  }
  async function quitarTodas(tipo){
    const conjunto = tipo === 'v' ? seleccion.vias : seleccion.lugares;
    if(!conjunto.size || !(await uiConfirm(tipo === 'v' ? '¿Quitar todas las calles elegidas?' : '¿Quitar todos los lugares elegidos?'))) return;
    [...conjunto].forEach(id => { conjunto.delete(id); tipo === 'v' ? dibujarVia(id, false) : dibujarLugar(id, false); });
    seleccion.cambios = true;
    contadorSeleccion();
    pintarListaSeleccion();
  }
  function acabarSeleccion(resultado){
    const s = seleccion;
    seleccion = null;
    modo = null;
    marcasSel = null;
    if(capaPuntos) capaPuntos.clearLayers();
    if(capaMarcas) capaMarcas.clearLayers();
    document.getElementById('screen-callejero').classList.remove('cj-seleccionando');
    if(s) s.resolver(resultado);
  }
  function terminarSeleccion(){
    if(!seleccion) return;
    acabarSeleccion({ vias: [...seleccion.vias], lugares: [...seleccion.lugares] });
  }
  async function cancelarSeleccion(){
    if(!seleccion) return;
    if(seleccion.cambios && !(await uiConfirm('¿Salir sin guardar lo que has elegido?'))) return;
    acabarSeleccion(null);
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
    // Opciones, botones de voz o plano
    const tipo = respuestaDe(q);
    if(modo === 'temario') ponerRespuesta(tipo, !!q.plano);
    const caja = el('cjOpciones');
    if(tipo === 'opciones'){
      caja.innerHTML = q.opciones.map((o, i) => '<button type="button" class="cj-opcion" onclick="CJ.responderOpcion(' + i + ')">' + escapeHtml(o) + '</button>').join('');
      caja.classList.toggle('cj-opciones-dos', q.opciones.length === 2);
    }
    if(tipo === 'voz') prepararVoz();
    if(q.plano) CJT.pintarPlano(q);
    mapa.invalidateSize();
    // Lo que se ve en el mapa antes de responder
    if(modo === 'temario'){
      if(q.antes) q.antes(mapaApi());
      else if(!q.plano) irAEncuadre();
    }else if(q.via && (modo === 'opciones' || modo === 'voz')){
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
    ronda.respondidas++;
    const q = ronda.preguntas[ronda.i];
    if(acierto) ronda.aciertos++; else ronda.fallos.push(q);
    anotarIntento(q.id, modoIntento || modo, acierto, distancia);
    el('cjResultado').className = 'cj-resultado ' + (acierto ? 'ok' : 'ko');
    el('cjResultadoTexto').innerHTML = textoHtml;
    el('cjAciertos').textContent = textoAciertos();
    el('cjSiguiente').textContent = ronda.i + 1 >= ronda.preguntas.length ? 'Ver resultado' : 'Siguiente';
  }

  // Preguntas en las que se toca el mapa: una vía (localiza), un lugar
  // (lugares) y, en el temario, también unas vías concretas o un barrio.
  function responder(latlng){
    if(!ronda || ronda.respondida) return;
    const q = ronda.preguntas[ronda.i];
    if(respuestaDe(q) !== 'toque') return;
    const pxEnMetros = mapa.distance(mapa.containerPointToLatLng([0, 0]), mapa.containerPointToLatLng([TOLERANCIA_PX, 0]));
    const detalle = q.detalle ? ' <span class="cj-dir">' + escapeHtml(q.detalle) + '</span>' : '';
    if(q.barrio){
      const b = q.barrio;
      const dist = dentroDeBarrio(latlng.lat, latlng.lng, b) ? 0 : distanciaAVia(latlng.lat, latlng.lng, { lineas: b.anillos });
      const acierto = dist <= Math.max(TOLERANCIA_M, pxEnMetros);
      L.polygon(b.anillos, { color: '#34D399', weight: 3, fillColor: '#34D399', fillOpacity: 0.2, interactive: false }).addTo(capaMarcas);
      L.circleMarker(latlng, { radius: 7, color: '#fff', weight: 2, fillColor: acierto ? '#34D399' : '#F2665C', fillOpacity: 1, interactive: false }).addTo(capaMarcas);
      if(!acierto) mapa.flyToBounds(L.latLngBounds(b.anillos.flat()).extend(latlng), { paddingTopLeft: [60, 60], paddingBottomRight: [60, 130], maxZoom: 16, duration: 0.7 });
      marcarRespondida(acierto, acierto
        ? '<b>¡Correcto!</b> ' + escapeHtml(q.nombre) + '.' + detalle
        : '<b>Fallo.</b> Te has quedado a ' + formatearDistancia(dist) + '. En verde, dónde está.' + detalle, dist);
      return;
    }
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
      const dir = modo === 'temario' ? detalle : l.direccion ? ' <span class="cj-dir">' + escapeHtml(l.direccion) + '</span>' : '';
      marcarRespondida(acierto, acierto
        ? '<b>¡Correcto!</b> ' + escapeHtml(q.nombre) + '.' + dir
        : '<b>Fallo.</b> Te has quedado a ' + formatearDistancia(dist) + '. En verde, dónde está.' + dir, dist);
      return;
    }
    const candidatas = q.vias || datos.porNombre.get(q.via.nombre.toLowerCase()) || [q.via];
    let mejor = candidatas[0], dist = Infinity;
    candidatas.forEach(v => {
      const d = distanciaAVia(latlng.lat, latlng.lng, v);
      if(d < dist){ dist = d; mejor = v; }
    });
    const acierto = dist <= Math.max(TOLERANCIA_M, pxEnMetros);
    L.circleMarker(latlng, { radius: 7, color: '#fff', weight: 2, fillColor: acierto ? '#34D399' : '#F2665C', fillOpacity: 1, interactive: false }).addTo(capaMarcas);
    (acierto ? [mejor] : candidatas).forEach(v => resaltar(v, '#34D399'));
    if(!acierto) verVias(candidatas, latlng);
    marcarRespondida(acierto, acierto
      ? '<b>¡Correcto!</b> ' + escapeHtml(q.nombre) + (detalle ? '.' + detalle : '')
      : '<b>Fallo.</b> Te has quedado a ' + formatearDistancia(dist) + '. En verde, dónde está.' + detalle, dist);
  }
  // Temario: se toca un punto, una calle o una zona de un plano (Mezquita, Alcázar, Feria).
  function responderPlano(k){
    if(!ronda || ronda.respondida) return;
    const q = ronda.preguntas[ronda.i];
    if(respuestaDe(q) !== 'plano') return;
    const acierto = k === q.k;
    CJT.marcarPlano(q, k);
    marcarRespondida(acierto, acierto
      ? '<b>¡Correcto!</b> ' + escapeHtml(q.nombre) + '.'
      : '<b>Fallo.</b> En verde, ' + escapeHtml(q.nombre) + '.', null);
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
    if(modo === 'temario'){
      if(q.plano) CJT.marcarPlano(q, null);
      if(q.despues) q.despues(mapaApi());
      texto = (acierto ? '<b>¡Correcto!</b> ' : '<b>Fallo.</b> ') + escapeHtml(q.resumen || q.opciones[q.correcta]) +
        (q.detalle ? ' <span class="cj-dir">' + escapeHtml(q.detalle) + '</span>' : '');
    }else if(modo === 'opciones'){
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

  /* ---------- modo «Di el nombre» ---------- */
  // Uno dice el nombre para sí, pulsa «Resolver» y se corrige él mismo.
  function prepararVoz(){
    el('cjVozVer').classList.remove('hidden');
    el('cjVozSi').classList.add('hidden');
    el('cjVozNo').classList.add('hidden');
  }
  function verRespuesta(){
    if(!ronda || ronda.respondida || MODOS[modo].respuesta !== 'voz') return;
    const q = ronda.preguntas[ronda.i];
    el('cjPregunta').textContent = q.via.nombre;
    el('cjPregunta').classList.remove('hidden');
    el('cjVozVer').classList.add('hidden');
    el('cjVozSi').classList.remove('hidden');
    el('cjVozNo').classList.remove('hidden');
  }
  function autoevaluar(acierto){
    if(!ronda || ronda.respondida || el('cjVozSi').classList.contains('hidden')) return;
    const q = ronda.preguntas[ronda.i];
    el('cjVozSi').classList.add('hidden');
    el('cjVozNo').classList.add('hidden');
    marcarRespondida(acierto, acierto
      ? '<span class="cj-marca ok">✓</span> <b>¡Bien!</b> ' + escapeHtml(q.via.nombre) + '.'
      : '<span class="cj-marca ko">✗</span> <b>Mal.</b> Es ' + escapeHtml(q.via.nombre) + '.', null);
  }

  function formatearDistancia(m){
    return m >= 1000 ? (m / 1000).toFixed(1).replace('.', ',') + ' km' : Math.round(m) + ' m';
  }

  // Las rondas hechas aquí se ven en «Tus últimas rondas» hasta que el
  // servidor las devuelve (sin conexión, hasta que se suban).
  function guardarRondaLocal(){
    if(!ronda || !ronda.respondidas) return;
    rondasLocales.unshift({ ronda: ronda.id, modo, zona: ronda.zona, tarea_id: ronda.tareaId, total: ronda.preguntas.length,
      respondidas: ronda.respondidas, aciertos: ronda.aciertos, fin: new Date().toISOString() });
  }
  async function refrescarTrasRonda(){
    await subirPendientes();
    if(misPendientes().length) return;   // sin conexión: vale lo calculado aquí
    await Promise.all([cargarTareas(), cargarRondas()]);
    if(vistaActual === 'inicio') pintarInicio();
    if(vistaActual === 'temario' && typeof CJT !== 'undefined') CJT.repintar();
  }
  // Una ronda terminada cuenta para su tarea si es de un modo que cuenta y
  // llega al mínimo de aciertos (la misma regla que callejero_tareas_de).
  function notaTarea(m){
    const t = ronda.tareaId ? tareas.find(x => x.id === ronda.tareaId) : null;
    if(!t) return '';
    const total = ronda.preguntas.length;
    const pct = total ? Math.round(ronda.aciertos * 100 / total) : 0;
    t.rondas_jugadas++;
    let texto, ok = false;
    if(t.modos.length && !t.modos.includes(m)) texto = 'Este modo no cuenta para la tarea «' + t.titulo + '». Cuentan: ' + describirTarea(t).modos + '.';
    else if(ronda.aciertos * 100 < t.minimo * total) texto = 'No cuenta para la tarea «' + t.titulo + '»: hace falta un ' + t.minimo + '% de aciertos y has sacado un ' + pct + '%.';
    else{
      ok = true;
      t.rondas_validas++;
      texto = tareaHecha(t) ? '¡Tarea «' + t.titulo + '» hecha!' : 'Cuenta para la tarea «' + t.titulo + '»: llevas ' + t.rondas_validas + ' de ' + t.rondas + ' rondas.';
    }
    return '<div class="cj-fin-tarea' + (ok ? ' ok' : '') + '">' + escapeHtml(texto) + '</div>';
  }

  function terminar(){
    const total = ronda.preguntas.length;
    const fallos = ronda.fallos;
    const m = modo;
    const titulo = m === 'temario' ? 'Temario · ' + ronda.titulo : MODOS[m].titulo;
    guardarRondaLocal();
    el('cjPlano').classList.add('hidden');
    el('cjFin').innerHTML =
      '<div class="cj-card cj-fin">' +
        '<div class="cj-card-title">' + escapeHtml(titulo) + ' · Resultado</div>' +
        '<div class="cj-pct"><span>' + ronda.aciertos + '</span> de ' + total + '</div>' +
        notaTarea(m) +
        (fallos.length
          ? '<div class="cj-fin-sub">Para repasar (saldrán primero la próxima vez):</div><ul class="cj-fallos">' +
            fallos.map(q => '<li>' + escapeHtml(q.nombre) + (m === 'parque' ? ' <span class="cj-dir">· ' + escapeHtml(PARQUES[q.parque]) + '</span>' : '') +
              (m === 'temario' && q.resumen && q.respuesta === 'opciones' ? ' <span class="cj-dir">· ' + escapeHtml(q.resumen) + '</span>' : '') + '</li>').join('') + '</ul>'
          : '<div class="cj-fin-sub">¡Todas bien!</div>') +
        '<div class="cj-fin-actions">' +
          '<button type="button" class="btn btn-primary btn-light" onclick="' + (m === 'temario' ? 'CJ.otraRonda()' : 'CJ.empezar(\'' + m + '\')') + '">Otra ronda</button>' +
          '<button type="button" class="btn btn-ghost" onclick="CJ.salir()">Volver</button>' +
        '</div>' +
      '</div>';
    ronda = null;
    modo = null;
    mostrarVista('fin');
    refrescarTrasRonda();
  }

  function salir(){
    if(ronda && modo !== 'estudio'){ guardarRondaLocal(); refrescarTrasRonda(); }
    ronda = null;
    modo = null;
    verTemario = null;
    el('cjPlano').classList.add('hidden');
    if(desdeTemario && typeof CJT !== 'undefined'){
      desdeTemario = false;
      mostrarVista('temario');
      CJT.repintar();
      return;
    }
    mostrarVista('inicio');
    pintarInicio();
  }
  async function confirmarSalir(){
    if(modo === 'seleccion'){ cancelarSeleccion(); return; }
    if(modo !== 'estudio' && ronda && ronda.i > 0 && !(await uiConfirm('¿Salir de la ronda? Lo que ya has respondido queda guardado.'))) return;
    salir();
  }
  // Para el profesor: volver a la pantalla principal o recargar las tareas.
  function volver(){ if(modo) return; mostrarVista('inicio'); pintarInicio(); }
  async function recargarTareas(){
    await cargarTareas();
    if(vistaActual === 'inicio') pintarInicio();
  }

  return { abrir, empezar, estudio, buscar, elegir, salir, cambiarZona, alternarLista, elegirDeLista, confirmarSalir,
    responderOpcion, verRespuesta, autoevaluar, siguiente: () => siguientePregunta(false), refrescarTema,
    // tareas, rondas y avisos
    estudiarTarea, empezarTarea, alternarRondas, cambiarVistaProfesor, comprobarAvisos, reiniciar, recargarTareas, volver,
    // pestañas de la pantalla principal
    cambiarPestana, abrirCalles, cerrarCalles, repasarCalles, empezarEn, estudioEn, mosaicoModos,
    // modo selección
    seleccionar, alternarElegida, anadirZona, irAElegida, quitarTodas, terminarSeleccion,
    // lo que usa el profesor (js/callejero-profesor.js)
    cargarDatos, datos: () => datos, MODOS, HABILIDAD, mostrarVista, opcionesZona, nombreZonaDe, filtroDe,
    progresoDesdeFilas, tarjetaProgreso, detalleProgreso, rondasHtml, estadoDe, claveP, prepararTareas, describirTarea, tareaHecha, fechaCorta,
    // temario (js/callejero-temario.js)
    empezarTemario, otraRonda, responderPlano, ordenarPorRepaso, PREGUNTAS_POR_RONDA, esTemario,
    progreso: () => progreso, tareas: () => tareasActivas(), repintar: () => { if(vistaActual === 'inicio') pintarInicio(); } };
})();
