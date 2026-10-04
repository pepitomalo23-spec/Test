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
       CC BY 4.0) con las vías encima, finas. Necesita conexión. Solo se
       ve la del último vuelo (servicio de ortofotos provisionales: 2025
       en Córdoba), en trozos de 512 px con el doble de píxeles en
       pantallas retina, para que se vea nítida. La de «máxima actualidad»
       (2022 en Córdoba) solo entra en el trozo que falle o tarde más de
       12 s. Cada trozo se guarda en el móvil (service worker) y, por
       detrás, se precarga lo de alrededor (siguiente zoom, anterior y los
       lados) y se descarga toda Córdoba hasta el zoom 13 y la ciudad hasta
       el 17: al ampliar y alejar sale al momento.
   Las calles (y lo resaltado encima) se ensanchan al acercarse, como en
   un plano de verdad: cada línea tiene su grosor de lejos y su anchura en
   metros, y se pinta con el mayor de los dos.

   Modo «Localiza la calle»: se da el nombre de una vía y hay que
   tocarla en el mapa. Cuenta como acierto si el toque cae a menos de
   la tolerancia (lo que sea mayor: 35 m o 22 píxeles de pantalla) de
   cualquier vía con ese mismo nombre (hay nombres repetidos en
   distintas pedanías). Cada respuesta se guarda en callejero_intentos.

   Zona de estudio: toda Córdoba, un distrito, un barrio (los de los
   planos de distrito del Ayuntamiento) o las afueras y pedanías (vías
   que no están en ningún barrio). Filtra las preguntas, el progreso y la
   lista de calles del modo estudio, y se dibuja su contorno en el mapa.
   Se recuerda en el dispositivo.

   Modos de juego (todos con rondas con todas las preguntas de la zona
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

   Modo estudio (mapa libre): el mismo mapa, libre. Al tocar una vía se ve
   su nombre (y cuántas veces la has acertado), y se puede buscar cualquier
   vía o lugar por su nombre para que el mapa vaya hasta él. Lo que ha
   mandado el profesor sale resaltado en morado, y dentro del mapa, arriba,
   se elige qué tocar: Calles, Lugares (todos, como puntos) o Profesor (solo
   lo suyo, con su lista). No guarda nada.
   Cualquier mapa (también jugando) se puede poner a pantalla completa.

   Progreso: por habilidad (nombres, situar calles, cruces, lugares y
   parque), con la regla de los tests: dominada si nunca se ha fallado o
   si lleva 3 aciertos seguidos (callejero_progreso). Cada respuesta lleva
   un uid, la ronda, la zona y la tarea; la cola sin conexión no duplica
   ni pierde respuestas.

   Tareas del profesor (js/callejero-profesor.js): salen en «Hoy»; cada una
   se abre entera (js/callejero-temario.js) y puede llevar temario, calles y
   lugares elegidos y una zona, todo junto. Lo de calles es también una zona
   («t:<id>»: sus calles y lugares elegidos y la zona que mandó); «p» es lo
   de todas sus tareas junto. Con «solo esto», el alumno solo puede elegir
   sus tareas.
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
  const PNOA_RECIENTE = 'https://wms-pnoa.idee.es/pnoa-provisionales';
  const PNOA_WMS = 'https://www.ign.es/wms-inspire/pnoa-ma';
  const ATRIBUCION_PNOA = 'Ortofoto: <a href="https://pnoa.ign.es/" target="_blank" rel="noopener">PNOA</a> (vuelo más reciente) © Instituto Geográfico Nacional (CC BY 4.0)';
  const ESTILOS = { sencillo: 'Sencillo', plano: 'Plano', satelite: 'Satélite' };
  const ESTILO_KEY = 'cj_estilo_mapa';
  // En el estilo Plano estas vías se pintan como las principales (amarillas).
  const TIPOS_PRINCIPALES = new Set(['AVENIDA', 'CARRETERA', 'AUTOVIA', 'RONDA', 'PASEO', 'BULEVAR', 'VIA', 'ENLACE']);
  const CENTRO = [37.8845, -4.7796];
  // Sin tope: cada ronda trae todo lo que haya (todas las calles de la zona,
  // todo lo que toca repasar, todo el temario elegido…).
  const PREGUNTAS_POR_RONDA = Infinity;
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
    temario: { titulo: 'Temario', respuesta: 'variable' },
    // Barrios y distritos: tocarlos, qué barrio es el marcado y de qué distrito es.
    barrios: { titulo: 'Barrios y distritos', respuesta: 'variable' },
    enbarrio: { titulo: '¿En qué barrio está?', respuesta: 'opciones' },
    // Todos los distritos (o barrios) a la vez, cada uno de un color: «toca el…».
    // Sus respuestas se guardan como las de «Barrios y distritos».
    mapadistritos: { titulo: 'Distritos en el mapa', respuesta: 'toque', registra: 'barrios' },
    mapabarrios: { titulo: 'Barrios en el mapa', respuesta: 'toque', registra: 'barrios' },
    // Nombra las calles de una zona: no son preguntas, se dicen o se escriben.
    nombrar: { titulo: 'Nombra las calles', respuesta: 'nombrar' }
  };
  const PENDIENTES_KEY = 'cj_intentos_pendientes';
  // Habilidad que entrena cada modo: el progreso se cuenta por habilidad
  // («escribe» es un modo antiguo que ya no existe, pero tiene respuestas).
  const HABILIDAD = { localiza: 'localiza', opciones: 'nombre', voz: 'nombre', escribe: 'nombre', cruces: 'cruces', lugares: 'lugares', parque: 'parque', temario: 'temario',
    barrios: 'barrios', enbarrio: 'barrios', mapadistritos: 'barrios', mapabarrios: 'barrios', nombrar: 'memoria' };
  const HABILIDADES = [
    { k: 'nombre', titulo: 'Nombres', desc: '¿Cómo se llama? y Di el nombre' },
    { k: 'localiza', titulo: 'Situar calles', desc: 'Localiza la calle' },
    { k: 'cruces', titulo: 'Cruces y paralelas', desc: '' },
    { k: 'lugares', titulo: 'Lugares importantes', desc: '' },
    { k: 'parque', titulo: 'Parque que acude', desc: '' },
    { k: 'barrios', titulo: 'Barrios y distritos', desc: 'Y en qué barrio está cada calle' },
    { k: 'memoria', titulo: 'De memoria', desc: 'Nombra las calles' }
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
  // Mapa libre: lo que ha mandado el profesor, resaltado en morado, y todos
  // los lugares (con «Lugares» arriba). verEstudio: 'calles', 'lugares' o 'profesor'.
  let capaProfesor = null, capaLugares = null;
  let verEstudio = 'calles';
  let delProfesor = null;    // { vias: Map, lugares: Map, items: [{ nombre, tipo, vias, lugar }] }
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
  let enCalles = false;      // dentro de «Todas las calles» (zona y modos de juego)
  let subInicio = null;      // pantalla abierta desde los 3 botones: 'tareas', 'repasar', 'aprender' o null
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
  // Una tarea puede llevar a la vez fichas del temario, calles y lugares
  // elegidos y una zona entera. Lo de calles (lista y zona) es su «zona».
  function esTemario(t){ return (t.fichas || []).length > 0; }
  function tieneCalles(t){ return usaLista(t) || (t.zona !== null && t.zona !== undefined); }
  function tareasZona(){ return tareasActivas().filter(tieneCalles); }
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
    if(z === 'p') return tareasZona().length > 0;
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
  // Qué vías y qué lugares entran en una zona o en una tarea: sus calles y
  // lugares elegidos y, si mandó una zona entera, esa zona (las dos cosas, si
  // lleva las dos). 'p': todo lo de las tareas del profesor, junto.
  function filtroDe(z, t){
    if(!t && z === 'p'){
      const fs = tareasZona().map(x => filtroDe('t:' + x.id, x));
      return { via: v => fs.some(f => f.via(v)), lugar: l => fs.some(f => f.lugar(l)) };
    }
    if(t){
      const sv = new Set((t.vias || []).map(Number)), sl = new Set((t.lugares || []).map(Number));
      const zt = t.zona === null || t.zona === undefined ? null : t.zona;
      return { via: v => sv.has(v.id) || (zt !== null && enZonaBase(v, zt)), lugar: l => sl.has(l.id) || (zt !== null && enZonaBase(l, zt)) };
    }
    return { via: v => enZonaBase(v, z), lugar: l => enZonaBase(l, z) };
  }
  // El filtro de cualquier zona (también de una tarea o de todo lo del profesor).
  function filtroZona(z){ return filtroDe(z, tareaDeZona(z)); }
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
    if(z === 'p') return 'Todo lo del profesor';
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
    const z = t ? (t.zona || '') : zona === 'p' ? '' : zona;
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
      html += '<optgroup label="Tareas de tu profesor">' +
        (ts.length > 1 ? '<option value="p"' + (zona === 'p' ? ' selected' : '') + '>Todo lo del profesor</option>' : '') +
        ts.map(t => '<option value="t:' + t.id + '"' + (zona === 't:' + t.id ? ' selected' : '') + '>' + escapeHtml(t.titulo) + '</option>').join('') + '</optgroup>';
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
    p.ultima = Math.floor(Date.now() / 1000);
    prog.set(k, p);
  }
  // Filas de callejero_progreso: [id, habilidad, intentos, aciertos, racha, fallos, última vez]
  function progresoDesdeFilas(filas){
    return new Map((filas || []).map(([id, hab, intentos, aciertos, racha, fallos, ultima]) =>
      [claveP(hab, Number(id)), { intentos, aciertos, racha, fallos, ultima }]));
  }
  async function cargarProgreso(){
    await subirPendientes();   // lo que estaba en la cola ya cuenta en el servidor
    cargarNotas();
    const { data, error } = await sb.rpc('callejero_progreso');
    if(error) return;
    progreso = progresoDesdeFilas(data);
    misPendientes().forEach(p => sumar(progreso, HABILIDAD[p.modo] || 'nombre', p.id_vial, p.acierto));
  }

  /* ---------- notas propias de cada calle o lugar ----------
     En una ronda, arriba, «Nota»: texto y una foto de esa calle (o lugar).
     Al responder, sale en pequeño en una esquina del mapa (antes no, que
     podría dar la respuesta). Son de cada alumno (callejero_notas); la
     foto va en el almacén «question-notes», como las de las preguntas. */
  let notas = new Map();   // clave → { texto, imagen }
  async function cargarNotas(){
    if(!currentUser) return;
    const { data, error } = await sb.from('callejero_notas').select('clave, texto, imagen, updated_at');
    if(!error) notas = new Map((data || []).map(r => [r.clave, { texto: r.texto || '', imagen: r.imagen || '', fecha: r.updated_at }]));
  }
  // De qué es la nota de una pregunta: la calle (todos sus tramos, por nombre) o el lugar.
  function claveNota(q){
    if(!q) return null;
    if(q.via) return claveVia(q.via);
    if(q.lugar && q.lugar.id) return 'l:' + q.lugar.id;
    if(q.vias && q.vias.length) return claveVia(q.vias[0]);
    return null;
  }
  const claveVia = v => 'v:' + v.clave;
  const claveLugar = l => 'l:' + l.id;
  // La nota dentro de la ficha de una calle o un lugar (mapa libre, Aprender,
  // lo del temario): lo apuntado y el botón para añadirla o cambiarla.
  let infoActual = null;   // para volver a pintar la ficha al guardar la nota
  function notaInfoHtml(k){
    const n = notas.get(k);
    return '<div class="cj-info-nota">' +
      (n && n.imagen ? '<img src="' + escapeHtml(n.imagen) + '" alt="" onclick="event.stopPropagation(); openImageLightbox(this.src)">' : '') +
      (n && n.texto ? '<div class="cj-info-nota-txt">' + escapeHtml(n.texto) + '</div>' : '') +
      '<button type="button" class="cj-info-nota-btn" onclick="CJ.editarNota(' + escapeHtml(JSON.stringify(k)) + ')">' + (n ? 'Cambiar tu nota' : '+ Añadir una nota') + '</button></div>';
  }
  function botonBarra(id){
    let b = el(id);
    if(!b){
      b = document.createElement('button');
      b.type = 'button'; b.id = id; b.className = 'cj-nota-btn hidden';
      el('cjPlegar').before(b);
    }
    return b;
  }
  function ponerBotonNota(){
    const q = ronda && ronda.preguntas[ronda.i];
    const k = claveNota(q);
    const b = botonBarra('cjNotaBtn');
    b.classList.toggle('hidden', !k);
    b.onclick = () => editarNota(k);
    if(k) b.innerHTML = svgIcono('M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5Z|M14 2v6h6|M8 13h8|M8 17h5') + '<span>' + (notas.has(k) ? 'Tu nota' : 'Nota') + '</span>';
    // En el temario, el admin y los profesores: «Editar» (cambiar o quitar la pregunta para todos).
    const editar = !!q && modo === 'temario' && typeof CJT !== 'undefined' && CJT.puedeEditar();
    const e = botonBarra('cjEditarBtn');
    e.classList.toggle('hidden', !editar);
    e.onclick = () => CJT.editarPregunta(q);
    if(editar) e.innerHTML = svgIcono('M12 20h9|M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z') + '<span>Editar</span>';
  }
  function tarjetaNota(mostrar){
    let c = el('cjNota');
    if(!c){
      c = document.createElement('div');
      c.id = 'cjNota'; c.className = 'cj-nota hidden';
      c.onclick = () => c.classList.toggle('grande');
      el('cjResultado').before(c);
    }
    const q = ronda && ronda.preguntas[ronda.i];
    const n = mostrar && notas.get(claveNota(q));
    c.classList.remove('grande');
    c.classList.toggle('hidden', !n);
    if(!n) return;
    c.innerHTML = (n.imagen ? '<img src="' + escapeHtml(n.imagen) + '" alt="">' : '') + (n.texto ? '<div class="cj-nota-txt">' + escapeHtml(n.texto) + '</div>' : '');
  }
  // Ventana con campos (para las notas y las preguntas del temario): botones
  // { k, texto, clase }; devuelve { k, root } y se cierra sola.
  function ventana(titulo, html, botones, alAbrir){
    return new Promise(resolve => {
      const bg = document.createElement('div');
      bg.className = 'ui-confirm-bg';
      bg.innerHTML = '<div class="ui-confirm cj-ventana" role="dialog" aria-modal="true"><h3></h3><div class="cj-ventana-cuerpo">' + html + '</div>' +
        '<div class="ui-confirm-actions">' + botones.map(b => '<button type="button" data-k="' + b.k + '" class="' + (b.clase || 'ui-confirm-cancel') + '">' + escapeHtml(b.texto) + '</button>').join('') + '</div></div>';
      bg.querySelector('h3').textContent = titulo;
      const cerrar = k => { document.removeEventListener('keydown', onKey, true); resolve({ k, root: bg }); bg.remove(); };
      const onKey = e => { if(e.key === 'Escape'){ e.preventDefault(); e.stopPropagation(); cerrar(null); } };
      bg.querySelectorAll('.ui-confirm-actions button').forEach(b => b.addEventListener('click', () => cerrar(b.dataset.k)));
      bg.addEventListener('click', e => { if(e.target === bg) cerrar(null); });
      document.addEventListener('keydown', onKey, true);
      document.body.appendChild(bg);
      if(alAbrir) alAbrir(bg);
    });
  }
  async function editarNota(k){
    if(!k) return;
    const n = notas.get(k) || { texto: '', imagen: '' };
    let foto = null, quitarFoto = false;
    const html = '<textarea class="cj-nota-texto" rows="4" maxlength="2000" placeholder="Lo que te ayude a recordarla: un comercio, un truco, por dónde pasa…"></textarea>' +
      '<div class="cj-nota-foto"><img class="cj-nota-prev' + (n.imagen ? '' : ' hidden') + '" alt="">' +
      '<label class="btn btn-ghost cj-nota-subir">Foto<input type="file" accept="image/*" hidden></label>' +
      '<button type="button" class="btn btn-ghost cj-nota-quitar' + (n.imagen ? '' : ' hidden') + '">Quitar foto</button></div>' +
      '<div class="cj-hab-det">Solo la ves tú. Sale al responder, en una esquina del mapa.</div>';
    const r = await ventana(n.texto || n.imagen ? 'Tu nota de esta calle' : 'Añadir una nota a esta calle', html,
      [{ k: null, texto: 'Cancelar' }].concat(notas.has(k) ? [{ k: 'borrar', texto: 'Borrar', clase: 'ui-confirm-ok danger' }] : [], [{ k: 'guardar', texto: 'Guardar', clase: 'ui-confirm-ok' }]),
      root => {
        const t = root.querySelector('.cj-nota-texto'), prev = root.querySelector('.cj-nota-prev'), quitar = root.querySelector('.cj-nota-quitar');
        t.value = n.texto;
        if(n.imagen) prev.src = n.imagen;
        root.querySelector('input[type=file]').addEventListener('change', e => {
          foto = e.target.files && e.target.files[0];
          if(!foto) return;
          quitarFoto = false;
          prev.src = URL.createObjectURL(foto); prev.classList.remove('hidden'); quitar.classList.remove('hidden');
        });
        quitar.addEventListener('click', () => { foto = null; quitarFoto = true; prev.classList.add('hidden'); quitar.classList.add('hidden'); });
        setTimeout(() => t.focus(), 50);
      });
    if(!r.k) return;
    const texto = r.root.querySelector('.cj-nota-texto').value.trim();
    try{
      if(r.k === 'borrar' || (!texto && !foto && (quitarFoto || !n.imagen))){
        const { error } = await sb.from('callejero_notas').delete().eq('clave', k).eq('user_id', currentUser.id);
        if(error) throw error;
        notas.delete(k);
        uiToast('Nota borrada', 'success');
      }else{
        let imagen = quitarFoto ? '' : n.imagen;
        if(foto){
          uiToast('Subiendo la foto…', 'info');
          imagen = await uploadOwnNoteImage('callejero/' + currentUser.id, foto);
        }
        const fila = { user_id: currentUser.id, clave: k, texto: texto || null, imagen: imagen || null, updated_at: new Date().toISOString() };
        const { error } = await sb.from('callejero_notas').upsert(fila);
        if(error) throw error;
        notas.set(k, { texto, imagen: imagen || '', fecha: fila.updated_at });
        uiToast('Nota guardada', 'success');
      }
    }catch(e){ uiToast('No se ha podido guardar la nota: ' + (e.message || e), 'error'); return; }
    if(modo === 'estudio'){ if(infoActual) infoActual(); }
    else if(ronda){ ponerBotonNota(); if(ronda.respondida || ronda.vista) tarjetaNota(true); }
    if(vistaActual === 'inicio') pintarInicio();
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
    progreso = new Map(); tareas = []; rondasServidor = []; rondasLocales = []; notas = new Map();
    ronda = null; modo = null; seleccion = null; verTemario = null; desdeTemario = false; ultimosAvisos = 0; delProfesor = null; verEstudio = 'calles';
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
    // Un solo lienzo para todas las líneas (las calles y todo lo resaltado
    // encima), con mucho margen: al alejar de golpe ya están pintadas
    // alrededor. Sin fundido de la foto: cada trozo sale en cuanto está.
    const renderer = L.canvas({ padding: margenLienzo(), tolerance: 4 });
    mapa = L.map(el, { zoomControl: false, attributionControl: true, renderer, fadeAnimation: false, minZoom: 11, maxZoom: 19, zoomSnap: 0.5 });
    mapa.attributionControl.setPrefix(false);
    mapa.attributionControl.addAttribution(ATRIBUCION);
    capaFoto = crearCapaFoto();
    const linea = lineas => L.polyline(lineas, { renderer, interactive: false, lineCap: 'round', lineJoin: 'round' });
    if(datos.rio.length) capaRio = linea(datos.rio);
    const princ = datos.vias.filter(v => TIPOS_PRINCIPALES.has(v.tipo)).flatMap(v => v.lineas);
    const resto = datos.vias.filter(v => !TIPOS_PRINCIPALES.has(v.tipo)).flatMap(v => v.lineas);
    capas = { restoBorde: linea(resto), resto: linea(resto), princBorde: linea(princ), princ: linea(princ) };
    capaMarcas = L.layerGroup();
    capaPuntos = L.layerGroup();
    capaProfesor = L.layerGroup();
    capaLugares = L.layerGroup();
    capaMarcado = L.layerGroup();
    aplicarEstilo();
    // Arriba a la derecha: estilo, pantalla completa, barrio o distrito
    // marcado y zoom (la izquierda, para las opciones del mapa libre).
    mapa.addControl(crearControlEstilo());
    mapa.addControl(crearControlCompleta());
    mapa.addControl(crearControlMarcar());
    L.control.zoom({ position: 'topright' }).addTo(mapa);
    pintarMarcado();
    prepararAtribucion();
    mapa.on('zoomend', reescalar);
    mapa.on('dragstart', () => cancelarPrecarga(true));
    mapa.on('zoomstart', () => cancelarPrecarga(false));
    mapa.setMaxBounds(limitesDe(datos.vias).pad(0.15));
    mapa.setView(CENTRO, 14);
    capaZona = L.layerGroup().addTo(mapa);
    mapa.on('click', e => {
      if(cerrarMenus()) return;
      if(modo === 'estudio') tocarEstudio(e.latlng);
      else if(modo === 'seleccion') tocarSeleccion(e.latlng);
      else if(modo === 'nombrar') tocarNombrar(e.latlng);
      else responder(e.latlng);
    });
  }

  // El margen del lienzo, en pantallas a cada lado: cuanto más, más se puede
  // alejar de golpe sin que falten líneas por los bordes (1 = hasta ~1,5
  // niveles), pero el lienzo crece mucho y en el iPhone y el iPad no puede
  // pasar de ~16 megapíxeles. El mayor que quepa en 14, entre 0,3 y 1.
  function margenLienzo(){
    const m = window.devicePixelRatio > 1 ? 2 : 1;   // Leaflet pinta como mucho al doble
    const px = Math.max(1, window.innerWidth * window.innerHeight * m * m);
    return Math.max(0.3, Math.min(1, (Math.sqrt(14e6 / px) - 1) / 2));
  }

  /* ---------- grosor según el zoom ---------- */
  // Metros por píxel en el zoom 0 a la latitud de Córdoba.
  const M_POR_PX = 156543.03 * Math.cos(CENTRO[0] * Math.PI / 180);
  // El grosor de una línea: el de lejos (min) o su anchura en metros, lo que
  // sea mayor. Al alejarse del zoom 16 adelgaza (encoge: hasta dónde, p. ej.
  // 0,4 = al 40 %), para que de lejos se vean finas y no tapen el mapa: las
  // calles del fondo del todo; lo resaltado, algo menos.
  function grosor(min, metros, encoge){
    const z = mapa && mapa.getZoom() !== undefined ? mapa.getZoom() : 14;
    const lejos = encoge && z < 16 ? Math.max(encoge, Math.pow(2, (z - 16) / 2)) : 1;
    return Math.max(min * lejos, metros ? metros * Math.pow(2, z) / M_POR_PX : 0);
  }
  // Una línea de lo resaltado (calle marcada, lo del profesor…) que se
  // ensancha con el zoom: st.weight es su grosor de lejos; st.metros, su anchura.
  function lineaAncha(lineas, st){
    const o = Object.assign({ interactive: false, encoge: 0.6 }, st, { pesoMin: st.weight });
    o.weight = grosor(o.pesoMin, o.metros, o.encoge);
    return L.polyline(lineas, o);
  }
  function ajustarGrosor(l){
    if(l.eachLayer){ l.eachLayer(ajustarGrosor); return; }
    const o = l.options;
    if(o && o.metros) l.setStyle({ weight: grosor(o.pesoMin, o.metros, o.encoge) });
  }
  function reescalar(){
    [capaRio, ...Object.values(capas || {})].forEach(c => { if(c && mapa.hasLayer(c)) ajustarGrosor(c); });
    [capaMarcas, capaProfesor, capaZona].forEach(g => { if(g) ajustarGrosor(g); });
  }

  /* ---------- satélite ---------- */
  // Solo la ortofoto del último vuelo, en trozos de 512 px (la mitad de
  // peticiones a un servicio lento) con el doble de píxeles en pantallas
  // retina. Si un trozo falla o tarda más de 12 s, ese trozo se pide a la
  // de «máxima actualidad» (más antigua, pero siempre responde).
  function crearCapaFoto(){
    const WMS = L.TileLayer.WMS;
    const Foto = WMS.extend({
      createTile(coords, done){
        const img = WMS.prototype.createTile.call(this, coords, done);
        img._respaldo = this.getTileUrl(coords).replace(PNOA_RECIENTE, PNOA_WMS).replace('layers=OrtoimagenRapida', 'layers=OI.OrthoimageCoverage');
        img._espera = setTimeout(() => this._alRespaldo(img), 12000);
        return img;
      },
      _tileOnLoad(done, tile){ clearTimeout(tile._espera); WMS.prototype._tileOnLoad.call(this, done, tile); },
      _tileOnError(done, tile, e){
        clearTimeout(tile._espera);
        if(!this._alRespaldo(tile)) WMS.prototype._tileOnError.call(this, done, tile, e);
      },
      _alRespaldo(tile){
        if(!tile._respaldo || !tile.parentNode) return false;
        const url = tile._respaldo;
        tile._respaldo = null;
        tile.src = url;
        return true;
      }
    });
    const capa = new Foto(PNOA_RECIENTE, {
      layers: 'OrtoimagenRapida', format: 'image/jpeg', version: '1.3.0', tileSize: 512, detectRetina: true,
      maxZoom: 19, attribution: ATRIBUCION_PNOA,
      // Carga mientras se arrastra y en cada nivel al pellizcar (sale de lo
      // guardado en el móvil, así que al soltar ya está).
      updateWhenIdle: false, updateWhenZooming: true, keepBuffer: 3,
      // Con CORS: así el service worker puede guardarlos (ver arriba).
      crossOrigin: true
    });
    capa.on('load', () => { clearTimeout(esperaCerca); esperaCerca = setTimeout(precargarCerca, 300); siguientePedido(); });
    return capa;
  }
  /* ---------- satélite siempre cargado ---------- */
  // Cada trozo se guarda en el móvil (sw.js, caché «pjfire-sat»): lo que se
  // ha visto una vez sale al momento, también al volver otro día. Y además,
  // por detrás:
  //  - cerca: con el mapa quieto y lo que se ve ya cargado, los del zoom
  //    siguiente en el centro, los del anterior y los de alrededor (al
  //    ampliar, alejar o moverse ya están);
  //  - guardar: poco a poco, toda Córdoba hasta el zoom 13 y la ciudad (la
  //    caja de sus barrios) hasta el 17 (con datos móviles, hasta el 16). Si
  //    se cierra antes, sigue en la siguiente vez; al terminar se apunta en
  //    el dispositivo y ya no se repite.
  // Pocas peticiones a la vez y con prioridad baja (el servicio va por
  // HTTP/1.1 y lo que se ve va primero); nada con el ahorro de datos puesto.
  const GUARDADO_KEY = 'cj_satelite_guardado';
  const FIRMA_FOTO = 'OrtoimagenRapida:' + (window.devicePixelRatio > 1 ? 1024 : 512);
  let esperaCerca = null, colaCerca = [], colaGuardar = null, guardar = null, fallosSeguidos = 0;
  const pidiendo = new Map(), pedidas = new Set();
  function ahorroDatos(){
    const c = navigator.connection;
    return !!(c && (c.saveData || /2g/.test(c.effectiveType || '')));
  }
  function enCurso(tipo){ let n = 0; pidiendo.forEach(x => { if(x.tipo === tipo) n++; }); return n; }
  // Los trozos (512 px) de una caja en un zoom.
  function trozosEn(caja, z){
    const ts = capaFoto.getTileSize();
    const a = mapa.project(caja.getNorthWest(), z).unscaleBy(ts).floor();
    const b = mapa.project(caja.getSouthEast(), z).unscaleBy(ts).floor();
    const out = [];
    for(let x = a.x; x <= b.x; x++) for(let y = a.y; y <= b.y; y++){ const p = L.point(x, y); p.z = z; out.push(p); }
    return out;
  }
  function porCercania(trozos, z){
    const c = mapa.project(mapa.getCenter(), z).unscaleBy(capaFoto.getTileSize());
    return trozos.sort((p, q) => p.add([0.5, 0.5]).distanceTo(c) - q.add([0.5, 0.5]).distanceTo(c));
  }
  // Los del zoom de al lado, además, descodificados en memoria (los últimos
  // MEMORIA, ~4 MB cada uno): al ampliar o alejar se pintan en el mismo
  // instante, sin ir ni a lo guardado.
  const MEMORIA = 12;
  const enMemoria = new Map();
  function pedir(url, tipo, decodificar){
    const ctl = { cancelado: false, abort(){} };
    pidiendo.set(url, { ctl, tipo });
    let hecho;
    if(decodificar){
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.decoding = 'async';
      ctl.abort = () => { ctl.cancelado = true; img.src = ''; };
      img.src = url;
      hecho = (img.decode ? img.decode() : new Promise((si, no) => { img.onload = si; img.onerror = no; })).then(() => {
        enMemoria.delete(url);
        enMemoria.set(url, img);
        if(enMemoria.size > MEMORIA) enMemoria.delete(enMemoria.keys().next().value);
      });
    } else {
      const ac = new AbortController();
      ctl.abort = () => { ctl.cancelado = true; ac.abort(); };
      hecho = fetch(url, { mode: 'cors', priority: 'low', signal: ac.signal })
        .then(r => { if(!r.ok) throw new Error(String(r.status)); return r.blob(); });
    }
    hecho.then(() => { pedidas.add(url); fallosSeguidos = 0; return true; },
               () => { if(!ctl.cancelado) fallosSeguidos++; return false; })
      .then(ok => {
        // (Si se canceló y se volvió a pedir, la nueva petición no es esta.)
        if(pidiendo.has(url) && pidiendo.get(url).ctl === ctl) pidiendo.delete(url);
        if(tipo === 'guardar' && guardar){ if(ok) guardar.hechos++; else guardar.fallos++; }
        if(tipo === 'extra' && extra) extra.hechos++;
        if(tipo !== 'cerca') ponerNotaSatelite();
        siguientePedido();
      });
  }
  // Primero lo de cerca (hasta 3 a la vez); luego, 2 a la vez y solo cuando
  // lo que se ve ya ha cargado y no queda nada de cerca, lo de guardar y,
  // cuando termina, lo de cerca de lo que se estudia (planificarExtra).
  function siguientePedido(){
    if(!mapa || !capaFoto || !mapa.hasLayer(capaFoto)) return;
    while(colaCerca.length && enCurso('cerca') < 3){
      const x = colaCerca.shift();
      const ya = x.decodificar ? enMemoria.has(x.url) : pedidas.has(x.url);
      if(!ya && !pidiendo.has(x.url)) pedir(x.url, 'cerca', x.decodificar);
    }
    const libre = !capaFoto.isLoading() && !colaCerca.length && !enCurso('cerca');
    if(colaGuardar){
      // Sin conexión (o el servicio caído): se deja para la próxima vez.
      if(fallosSeguidos >= 5){ if(!enCurso('guardar')){ colaGuardar = null; ponerNotaSatelite(); } return; }
      if(colaGuardar.length && libre){
        while(colaGuardar.length && enCurso('guardar') < 2){
          const u = colaGuardar.shift();
          if(pedidas.has(u) || pidiendo.has(u)){ guardar.hechos++; continue; }
          pedir(u, 'guardar');
        }
      }
      if(!colaGuardar.length && !enCurso('guardar')) terminarGuardado();
      return;
    }
    if(colaExtra && colaExtra.length && libre && fallosSeguidos < 5){
      while(colaExtra.length && enCurso('extra') < 2){
        const u = colaExtra.shift();
        if(!pedidas.has(u) && !pidiendo.has(u)) pedir(u, 'extra');
      }
    }
  }
  function precargarCerca(){
    if(!mapa || !mapa.hasLayer(capaFoto) || ahorroDatos()) return;
    const z = Math.round(mapa.getZoom()), b = mapa.getBounds(), lista = [];
    const zMas = Math.round(mapa.getZoom() + 1);
    const cerca = (trozos, decodificar) => trozos.forEach(p => lista.push({ url: capaFoto.getTileUrl(p), decodificar }));
    // Al ampliar y al alejar: el zoom de al lado, en memoria.
    if(zMas <= mapa.getMaxZoom()) cerca(porCercania(trozosEn(b.pad(-0.25), zMas), zMas).slice(0, 6), true);
    if(z - 1 >= mapa.getMinZoom()) cerca(porCercania(trozosEn(b.pad(0.5), z - 1), z - 1).slice(0, 6), true);
    // Al moverse: los de alrededor, en este zoom.
    const dentro = new Set(trozosEn(b, z).map(p => p.x + ':' + p.y));
    cerca(porCercania(trozosEn(b.pad(0.5), z), z).filter(p => !dentro.has(p.x + ':' + p.y)).slice(0, 8), false);
    colaCerca = lista;
    siguientePedido();
  }
  // Al arrastrar, lo de cerca que se estaba pidiendo ya no sirve: fuera, para
  // dejar sitio a lo que se va a ver. Al ampliar se deja (es lo que hace falta).
  function cancelarPrecarga(todo){
    colaCerca = [];
    if(!todo) return;
    pidiendo.forEach((x, u) => { if(x.tipo === 'cerca'){ x.ctl.abort(); pidiendo.delete(u); } });
  }
  // De cerca (zoom 18) lo que se estudia: las calles y los lugares del
  // profesor (los trozos por los que pasan y los de al lado) y, del barrio o
  // distrito marcado, los trozos con calles. Como mucho EXTRA_MAX (~65 MB);
  // no con datos móviles ni con el ahorro de datos. No se apunta: lo que ya
  // está guardado sale del móvil al momento.
  const EXTRA_MAX = 300;
  let colaExtra = null, extra = null;
  function enDatosMoviles(){ return !!(navigator.connection && navigator.connection.type === 'cellular'); }
  function trozosExtra(){
    const z = 18, ts = capaFoto.getTileSize().x, vistos = new Set(), out = [];
    const poner = (x, y) => { const k = x + ':' + y; if(vistos.has(k)) return; vistos.add(k); const p = L.point(x, y); p.z = z; out.push(p); };
    const conVecinos = (x, y) => { for(let i = -1; i <= 1; i++) for(let j = -1; j <= 1; j++) poner(x + i, y + j); };
    // Los trozos por los que pasa una línea (mirando cada cuarto de trozo).
    const recorrer = (linea, alPasar) => {
      let antes = null;
      linea.forEach(ll => {
        const p = mapa.project(ll, z);
        const pasos = antes ? Math.max(1, Math.ceil(antes.distanceTo(p) / (ts / 4))) : 0;
        for(let k = antes ? 1 : 0; k <= pasos; k++){
          const q = antes ? antes.add(p.subtract(antes).multiplyBy(k / pasos)) : p;
          alPasar(Math.floor(q.x / ts), Math.floor(q.y / ts));
        }
        antes = p;
      });
    };
    if(delProfesor){
      delProfesor.vias.forEach(v => v.lineas.forEach(l => recorrer(l, conVecinos)));
      delProfesor.lugares.forEach(l => { const p = mapa.project([l.lat, l.lng], z); conVecinos(Math.floor(p.x / ts), Math.floor(p.y / ts)); });
    }
    const m = marcadoValido();
    if(m){
      const caja = L.latLngBounds(barriosDeMarcado(m).flatMap(b => b.anillos.flat()));
      const a = mapa.project(caja.getNorthWest(), z).divideBy(ts).floor(), b = mapa.project(caja.getSouthEast(), z).divideBy(ts).floor();
      const dentro = (x, y) => { if(x >= a.x && x <= b.x && y >= a.y && y <= b.y) poner(x, y); };
      datos.vias.forEach(v => {
        const c = v.caja;
        if(c.n < caja.getSouth() || c.s > caja.getNorth() || c.e < caja.getWest() || c.o > caja.getEast()) return;
        v.lineas.forEach(l => recorrer(l, dentro));
      });
    }
    return out;
  }
  function planificarExtra(){
    if(!mapa || !capaFoto || !mapa.hasLayer(capaFoto) || ahorroDatos() || enDatosMoviles()) return;
    if(!navigator.serviceWorker || !navigator.serviceWorker.controller) return;
    colaExtra = trozosExtra().slice(0, EXTRA_MAX).map(p => capaFoto.getTileUrl(p)).filter(u => !pedidas.has(u));
    extra = { total: colaExtra.length, hechos: 0 };
    ponerNotaSatelite();
    siguientePedido();
  }
  // La caja de la ciudad: la de todos sus barrios.
  function cajaCiudad(){
    const pts = datos.barrios.flatMap(b => b.anillos.flat());
    return pts.length ? L.latLngBounds(pts) : limitesDe(datos.vias);
  }
  function leerGuardado(){ try{ return JSON.parse(localStorage.getItem(GUARDADO_KEY) || 'null'); }catch(e){ return null; } }
  async function empezarGuardado(){
    // Solo con el service worker (sin él no quedaría guardado de verdad), una
    // vez por sesión y sin el ahorro de datos.
    if(guardar || !mapa.hasLayer(capaFoto) || !('caches' in window) || !navigator.serviceWorker || !navigator.serviceWorker.controller) return;
    if(ahorroDatos()){ ponerNotaSatelite(); return; }
    const hasta = enDatosMoviles() ? 16 : 17;
    const todo = limitesDe(datos.vias), ciudad = cajaCiudad(), trozos = [];
    for(let z = 11; z <= 13; z++) trozos.push(...trozosEn(todo, z));
    for(let z = 14; z <= hasta; z++) trozos.push(...porCercania(trozosEn(ciudad, z), z));
    const urls = trozos.map(p => capaFoto.getTileUrl(p));
    guardar = { urls, total: urls.length, hechos: 0, fallos: 0, hasta, listo: false };
    const antes = leerGuardado();
    // Ya se guardó: se comprueba que sigue ahí (el navegador puede borrarlo).
    if(antes && antes.firma === FIRMA_FOTO && antes.hasta >= hasta && await siguenGuardados(urls)){
      guardar.hechos = guardar.total; guardar.listo = true; ponerNotaSatelite(); planificarExtra(); return;
    }
    try{ if(navigator.storage && navigator.storage.persist && !(await navigator.storage.persisted())) navigator.storage.persist(); }catch(e){}
    colaGuardar = urls.slice();
    ponerNotaSatelite();
    planificarExtra();
    siguientePedido();
  }
  // El primero, el del medio y el último, en la caché del service worker (si
  // al empezar aún mandaba la versión anterior, que no los guardaba, no).
  async function siguenGuardados(urls){
    try{
      for(const u of [urls[0], urls[urls.length >> 1], urls[urls.length - 1]]) if(!(await caches.match(u))) return false;
      return true;
    }catch(e){ return false; }
  }
  async function terminarGuardado(){
    colaGuardar = null;
    // El service worker guarda cada trozo justo después de entregarlo: se
    // le da un momento al último.
    let todos = false;
    for(let i = 0; i < 6 && guardar.fallos === 0 && !todos; i++){
      if(i) await new Promise(r => setTimeout(r, 500));
      todos = await siguenGuardados(guardar.urls);
    }
    if(todos){
      guardar.listo = true;
      try{ localStorage.setItem(GUARDADO_KEY, JSON.stringify({ firma: FIRMA_FOTO, hasta: guardar.hasta })); }catch(e){}
    }
    ponerNotaSatelite();
    siguientePedido();
  }
  // Cómo va, en el menú de estilos (debajo de «Satélite»).
  function ponerNotaSatelite(){
    const nota = document.querySelector('.cj-estilo-nota');
    if(!nota) return;
    let t = '';
    if(estilo === 'satelite'){
      if(ahorroDatos() && !(guardar && guardar.listo)) t = 'Con el ahorro de datos puesto no se guarda en el móvil.';
      else if(guardar && guardar.listo){
        // Y, después, de cerca lo que se estudia (lo del profesor y lo marcado).
        const quedan = extra && extra.total && extra.hechos < extra.total;
        t = 'Guardado en el móvil: sale al momento.' +
          (quedan ? ' Ahora, de cerca lo que estudias: ' + Math.floor(100 * extra.hechos / extra.total) + ' %' :
           extra && extra.total ? ' También de cerca lo que estudias.' : '');
      }
      else if(guardar && colaGuardar) t = 'Guardándolo en el móvil para que salga al momento: ' + Math.floor(100 * guardar.hechos / guardar.total) + ' %';
      else if(guardar) t = 'Guardado en parte (' + Math.floor(100 * guardar.hechos / guardar.total) + ' %); sigue la próxima vez.';
    }
    nota.textContent = t;
    nota.classList.toggle('hidden', !t);
  }

  // Los créditos del mapa, a pantalla completa, en un botón «i» que se abre
  // y se cierra al tocarlo (así no tapan el mapa).
  function prepararAtribucion(){
    const at = mapa.attributionControl.getContainer();
    L.DomEvent.disableClickPropagation(at);
    at.addEventListener('click', e => {
      if(!document.getElementById('screen-callejero').classList.contains('cj-completa')) return;
      if(at.classList.contains('abierta') && e.target.closest('a')) return;
      e.preventDefault();
      at.classList.toggle('abierta');
    });
  }

  // Qué capas se ven y con qué colores en cada estilo. weight es el grosor
  // de lejos; metros, la anchura de verdad (para cuando se acerca).
  function aplicarEstilo(){
    if(!mapa) return;
    const S = {
      sencillo: {
        fondo: null, foto: false,
        rio: { color: colorRio(), weight: 9, metros: 50, opacity: 1 },
        restoBorde: null, resto: { color: colorCalles(), weight: 2, metros: 5, opacity: 0.9 },
        princBorde: null, princ: { color: colorCalles(), weight: 2, metros: 8, opacity: 0.9 }
      },
      plano: {
        fondo: '#efe9dc', foto: false,
        rio: { color: '#9ccbeb', weight: 11, metros: 50, opacity: 1 },
        restoBorde: { color: '#cbc2b0', weight: 5, metros: 7, opacity: 1 }, resto: { color: '#ffffff', weight: 3, metros: 5, opacity: 1 },
        princBorde: { color: '#d9a93a', weight: 7, metros: 12, opacity: 1 }, princ: { color: '#fbd96b', weight: 4.5, metros: 9, opacity: 1 }
      },
      // En el satélite, finas (una raya por el centro de la calle) para no tapar la foto.
      satelite: {
        fondo: '#1b1d1a', foto: true, rio: null,
        restoBorde: null, resto: { color: '#ffffff', weight: 1.5, metros: 2, opacity: 0.5 },
        princBorde: null, princ: { color: '#ffe38a', weight: 2, metros: 3, opacity: 0.6 }
      }
    }[estilo];
    const poner = (capa, st) => {
      if(!capa) return;
      if(st){
        capa.setStyle(Object.assign({}, st, { pesoMin: st.weight, encoge: 0.4, weight: grosor(st.weight, st.metros, 0.4) }));
        if(!mapa.hasLayer(capa)) capa.addTo(mapa);
      }
      else if(mapa.hasLayer(capa)) mapa.removeLayer(capa);
    };
    if(S.foto){ if(!mapa.hasLayer(capaFoto)){ capaFoto.addTo(mapa); mapa.whenReady(empezarGuardado); } }
    else if(mapa.hasLayer(capaFoto)) mapa.removeLayer(capaFoto);
    ponerNotaSatelite();
    // Orden de abajo arriba: río, bordes, rellenos y, encima de todo, las marcas.
    [capaRio, capas.restoBorde, capas.princBorde, capas.resto, capas.princ, capaMarcado, capaProfesor, capaLugares, capaPuntos, capaMarcas].forEach(c => { if(c && mapa.hasLayer(c)) mapa.removeLayer(c); });
    poner(capaRio, S.rio);
    poner(capas.restoBorde, S.restoBorde);
    poner(capas.princBorde, S.princBorde);
    poner(capas.resto, S.resto);
    poner(capas.princ, S.princ);
    if(capaMarcado) capaMarcado.addTo(mapa);
    if(capaProfesor) capaProfesor.addTo(mapa);
    if(capaLugares) capaLugares.addTo(mapa);
    if(capaPuntos) capaPuntos.addTo(mapa);
    capaMarcas.addTo(mapa);
    const cont = mapa.getContainer();
    cont.style.background = S.fondo || '';
    document.querySelectorAll('.cj-estilo-opcion').forEach(b => b.classList.toggle('activa', b.dataset.estilo === estilo));
    const actual = document.querySelector('.cj-estilo-actual');
    if(actual) actual.textContent = ESTILOS[estilo];
  }

  // Dibuja el contorno de la zona elegida. (En el modo estudio, lo que ha
  // mandado el profesor se resalta aparte, en morado: pintarProfesor.)
  function pintarZona(){
    capaZona.clearLayers();
    capaPuntos.clearLayers();
    barriosDeZona().forEach(b => {
      L.polyline(b.anillos, { color: '#F2665C', weight: 2.5, opacity: 0.9, dashArray: '6 6', interactive: false }).addTo(capaZona);
    });
  }

  /* ---------- un barrio o distrito marcado ---------- */
  // Botón en todos los mapas (columna de la derecha): se busca y se elige un
  // barrio o un distrito y su contorno queda marcado (línea blanca con borde
  // oscuro, que se ve en los tres estilos, y su nombre) mientras se estudia y
  // en los siguientes mapas, hasta quitarlo. Se recuerda en el dispositivo.
  // Es solo para verlo: no cambia la zona de las preguntas.
  const MARCADO_KEY = 'cj_marcado';
  let marcado = null;            // 'b:<barrio>' o 'd:<distrito>'
  try{ marcado = localStorage.getItem(MARCADO_KEY) || null; }catch(e){}
  let capaMarcado = null;
  const contornosDistrito = new Map();
  function marcadoValido(){
    if(!marcado || !datos) return null;
    if(marcado.startsWith('d:') && datos.distritos.includes(marcado.slice(2))) return marcado;
    if(marcado.startsWith('b:') && datos.barrios.some(b => b.nombre === marcado.slice(2))) return marcado;
    return null;
  }
  function barriosDeMarcado(m){
    return m.startsWith('d:') ? datos.barrios.filter(b => b.distrito === m.slice(2)) : datos.barrios.filter(b => b.nombre === m.slice(2));
  }
  function nombreMarcado(m){ return m.startsWith('d:') ? 'Distrito ' + m.slice(2) : m.slice(2); }
  // El contorno de fuera de un distrito (sin los bordes entre sus barrios):
  // se juntan los vértices a menos de ~12 m, se parte cada lado por los
  // vértices que caen encima (un barrio puede tener un vértice a mitad del
  // lado del vecino) y se quedan los tramos que no comparte nadie. En
  // unidades de 1e-5 grados, como vienen los datos.
  function contornoDistrito(d){
    if(contornosDistrito.has(d)) return contornosDistrito.get(d);
    const TOL = 12, C = 200, rep = new Map(), rejilla = new Map();
    const clave = p => p[0] + ',' + p[1];
    const celda = (x, y) => Math.floor(x / C) + ':' + Math.floor(y / C);
    const anillos = barriosDeMarcado('d:' + d).flatMap(b => b.anillos)
      .map(a => a.map(([la, ln]) => [Math.round(ln * 1e5), Math.round(la * 1e5)]));
    const junto = p => {
      const k = clave(p);
      if(rep.has(k)) return rep.get(k);
      const cx = Math.floor(p[0] / C), cy = Math.floor(p[1] / C);
      for(let i = -1; i <= 1; i++) for(let j = -1; j <= 1; j++){
        for(const q of rejilla.get((cx + i) + ':' + (cy + j)) || []){
          if((q[0] - p[0]) ** 2 + (q[1] - p[1]) ** 2 <= TOL * TOL){ rep.set(k, q); return q; }
        }
      }
      rep.set(k, p);
      const c = celda(p[0], p[1]);
      if(!rejilla.has(c)) rejilla.set(c, []);
      rejilla.get(c).push(p);
      return p;
    };
    const lados = [];
    anillos.forEach(a => {
      const pts = a.map(junto);
      if(clave(pts[0]) !== clave(pts[pts.length - 1])) pts.push(pts[0]);
      for(let i = 0; i < pts.length - 1; i++) if(clave(pts[i]) !== clave(pts[i + 1])) lados.push([pts[i], pts[i + 1]]);
    });
    const cuenta = new Map();
    lados.forEach(([a, b]) => {
      const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy, cortes = [];
      const x0 = Math.floor((Math.min(a[0], b[0]) - TOL) / C), x1 = Math.floor((Math.max(a[0], b[0]) + TOL) / C);
      const y0 = Math.floor((Math.min(a[1], b[1]) - TOL) / C), y1 = Math.floor((Math.max(a[1], b[1]) + TOL) / C);
      for(let x = x0; x <= x1; x++) for(let y = y0; y <= y1; y++){
        for(const p of rejilla.get(x + ':' + y) || []){
          if(p === a || p === b) continue;
          const t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2;
          if(t <= 0 || t >= 1) continue;
          if((p[0] - a[0] - t * dx) ** 2 + (p[1] - a[1] - t * dy) ** 2 <= TOL * TOL) cortes.push([t, p]);
        }
      }
      const seq = [a, ...cortes.sort((u, v) => u[0] - v[0]).map(c => c[1]), b];
      for(let i = 0; i < seq.length - 1; i++){
        if(seq[i] === seq[i + 1]) continue;
        const k = [clave(seq[i]), clave(seq[i + 1])].sort().join('|');
        const e = cuenta.get(k);
        if(e) e.n++; else cuenta.set(k, { n: 1, a: seq[i], b: seq[i + 1] });
      }
    });
    const tramos = [];
    cuenta.forEach(e => { if(e.n === 1) tramos.push([[e.a[1] / 1e5, e.a[0] / 1e5], [e.b[1] / 1e5, e.b[0] / 1e5]]); });
    contornosDistrito.set(d, tramos);
    return tramos;
  }
  // Dónde poner el nombre: el centro de la caja si cae dentro; si no, el del
  // barrio más grande.
  function puntoNombre(barrios){
    const caja = L.latLngBounds(barrios.flatMap(b => b.anillos.flat()));
    const c = caja.getCenter();
    if(barrios.some(b => dentroDeBarrio(c.lat, c.lng, b))) return c;
    const grande = barrios.map(b => ({ b, caja: L.latLngBounds(b.anillos.flat()) }))
      .sort((x, y) => areaCaja(y.caja) - areaCaja(x.caja))[0];
    const cb = grande.caja.getCenter();
    return dentroDeBarrio(cb.lat, cb.lng, grande.b) ? cb : L.latLng(grande.b.anillos[0][0]);
  }
  function areaCaja(caja){ return (caja.getNorth() - caja.getSouth()) * (caja.getEast() - caja.getWest()); }
  function pintarMarcado(){
    if(!capaMarcado) return;
    capaMarcado.clearLayers();
    const m = marcadoValido();
    ponerBotonMarcar();
    if(!m) return;
    const barrios = barriosDeMarcado(m);
    const lineas = m.startsWith('d:') ? contornoDistrito(m.slice(2)) : barrios.flatMap(b => b.anillos.map(a => a.concat([a[0]])));
    const estilo = (color, weight, opacity) => ({ color, weight, opacity, interactive: false, lineCap: 'round', lineJoin: 'round' });
    L.polyline(lineas, estilo('#0b1220', 8, 0.55)).addTo(capaMarcado);
    L.polyline(lineas, estilo('#ffffff', 3.5, 1)).addTo(capaMarcado);
    L.marker(puntoNombre(barrios), {
      icon: L.divIcon({ className: 'cj-marcado-nombre', html: '<span>' + escapeHtml(nombreMarcado(m)) + '</span>', iconSize: null }),
      interactive: false, keyboard: false
    }).addTo(capaMarcado);
  }
  function irAMarcado(){
    const m = marcadoValido();
    if(!m) return;
    mapa.flyToBounds(L.latLngBounds(barriosDeMarcado(m).flatMap(b => b.anillos.flat())), { padding: [40, 40], maxZoom: 16, duration: 0.6 });
  }
  function marcar(m){
    marcado = m || null;
    try{ marcado ? localStorage.setItem(MARCADO_KEY, marcado) : localStorage.removeItem(MARCADO_KEY); }catch(e){}
    pintarMarcado();
    cerrarMenus();
    if(marcado) irAMarcado();
    planificarExtra();
  }
  // El botón y su menú: arriba lo marcado (Ir · Quitar), un buscador y la
  // lista de distritos y barrios.
  const ICONO_MARCAR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8c0 3.6-3.9 7.4-5.4 8.8a1 1 0 0 1-1.2 0C9.9 15.4 6 11.6 6 8a6 6 0 0 1 12 0"/><circle cx="12" cy="8" r="2"/><path d="M8.7 14H5a1 1 0 0 0-.9.7l-2 6A1 1 0 0 0 3 22h18a1 1 0 0 0 .9-1.3l-2-6a1 1 0 0 0-.9-.7h-3.7"/></svg>';
  function crearControlMarcar(){
    const Control = L.Control.extend({
      options: { position: 'topright' },
      onAdd: function(){
        const div = L.DomUtil.create('div', 'cj-marcar');
        div.innerHTML =
          '<button type="button" class="cj-marcar-boton" aria-label="Marcar un barrio o distrito" title="Marcar un barrio o distrito" aria-expanded="false">' + ICONO_MARCAR + '</button>' +
          '<div class="cj-marcar-menu hidden">' +
            '<div class="cj-marcar-actual hidden"></div>' +
            '<input type="search" class="cj-marcar-buscar" placeholder="Buscar barrio o distrito…" autocomplete="off" spellcheck="false" aria-label="Buscar barrio o distrito">' +
            '<div class="cj-marcar-lista"></div>' +
          '</div>';
        L.DomEvent.disableClickPropagation(div);
        L.DomEvent.disableScrollPropagation(div);
        const menu = div.querySelector('.cj-marcar-menu'), buscar = div.querySelector('.cj-marcar-buscar');
        div.querySelector('.cj-marcar-boton').addEventListener('click', () => {
          const abrir = menu.classList.contains('hidden');
          cerrarMenus();
          if(!abrir) return;
          buscar.value = '';
          pintarListaMarcar('');
          menu.classList.remove('hidden');
          div.querySelector('.cj-marcar-boton').setAttribute('aria-expanded', 'true');
        });
        buscar.addEventListener('input', () => pintarListaMarcar(buscar.value));
        buscar.addEventListener('keydown', e => {
          if(e.key !== 'Enter') return;
          const primero = div.querySelector('.cj-marcar-opcion');
          if(primero) marcar(primero.dataset.m);
        });
        div.querySelector('.cj-marcar-lista').addEventListener('click', e => {
          const b = e.target.closest('.cj-marcar-opcion');
          if(b) marcar(b.dataset.m);
        });
        div.querySelector('.cj-marcar-actual').addEventListener('click', e => {
          const b = e.target.closest('button');
          if(!b) return;
          if(b.dataset.accion === 'quitar') marcar(null);
          else{ cerrarMenus(); irAMarcado(); }
        });
        return div;
      }
    });
    return new Control();
  }
  function pintarListaMarcar(texto){
    const lista = document.querySelector('.cj-marcar-lista');
    if(!lista) return;
    const q = normalizar(texto.trim());
    const vale = n => !q || normalizar(n).includes(q);
    const op = (m, t, extra) => '<button type="button" class="cj-marcar-opcion' + (m === marcado ? ' activa' : '') + '" data-m="' + escapeHtml(m) + '">' +
      escapeHtml(t) + (extra ? ' <small>' + escapeHtml(extra) + '</small>' : '') + '</button>';
    let html = '';
    const ds = datos.distritos.filter(d => vale('Distrito ' + d));
    if(ds.length) html += '<div class="cj-marcar-cab">Distritos</div>' + ds.map(d => op('d:' + d, 'Distrito ' + d)).join('');
    datos.distritos.forEach(d => {
      const bs = datos.barrios.filter(b => b.distrito === d && (vale(b.nombre) || (q && vale(d))));
      if(bs.length) html += '<div class="cj-marcar-cab">Barrios · ' + escapeHtml(d) + '</div>' + bs.map(b => op('b:' + b.nombre, b.nombre)).join('');
    });
    lista.innerHTML = html || '<div class="cj-marcar-vacio">Ningún barrio ni distrito con ese nombre</div>';
  }
  // El botón, resaltado si hay algo marcado; y arriba del menú, qué es.
  function ponerBotonMarcar(){
    const m = marcadoValido();
    const boton = document.querySelector('.cj-marcar-boton');
    if(boton) boton.classList.toggle('activo', !!m);
    const actual = document.querySelector('.cj-marcar-actual');
    if(!actual) return;
    actual.classList.toggle('hidden', !m);
    actual.innerHTML = m ? '<span>Marcado: <b>' + escapeHtml(nombreMarcado(m)) + '</b></span>' +
      '<span class="cj-marcar-acciones"><button type="button" data-accion="ir">Ir</button><button type="button" data-accion="quitar">Quitar</button></span>' : '';
  }
  // Solo un menú abierto a la vez; tocar el mapa con uno abierto solo lo cierra.
  function cerrarMenus(){
    let habia = false;
    document.querySelectorAll('.cj-estilo-menu, .cj-marcar-menu').forEach(x => { if(!x.classList.contains('hidden')){ habia = true; x.classList.add('hidden'); } });
    const b = document.querySelector('.cj-marcar-boton');
    if(b) b.setAttribute('aria-expanded', 'false');
    return habia;
  }

  /* ---------- mapa libre: lo del profesor y los lugares ---------- */
  const MORADO = '#A855F7', TURQUESA = '#14B8A6';
  // Todo lo que ha mandado el profesor que tiene sitio en el mapa: las calles
  // y los lugares elegidos y las cosas del temario con calle o lugar (no las
  // zonas enteras, que se ven con su contorno al elegirlas).
  function calcularDelProfesor(){
    const vias = new Map(), lugares = new Map(), items = [];
    tareasActivas().forEach(t => {
      (t.vias || []).forEach(id => { const v = datos.viaPorId.get(Number(id)); if(v) vias.set(v.id, v); });
      (t.lugares || []).forEach(id => { const l = datos.lugarPorId.get(Number(id)); if(l) lugares.set(l.id, l); });
      if(esTemario(t) && typeof CJT !== 'undefined') CJT.geoClaves(t.fichas).forEach(it => {
        items.push(it);
        it.vias.forEach(v => vias.set(v.id, v));
        if(it.lugar) lugares.set(it.lugar.id, it.lugar);
      });
    });
    // La lista: las calles (una por nombre), los lugares y lo del temario, sin repetir nombres.
    const vistos = new Set(items.map(it => normalizar(it.nombre)));
    const nuevo = (nombre, x) => { const k = normalizar(nombre); if(vistos.has(k)) return; vistos.add(k); items.push(x); };
    [...vias.values()].forEach(v => nuevo(v.nombre, { nombre: v.nombre, tipo: 'Calle', vias: [v], lugar: null }));
    [...lugares.values()].forEach(l => nuevo(l.nombre, { nombre: l.nombre, tipo: l.categoria, vias: [], lugar: l }));
    items.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
    return { vias, lugares, items };
  }
  // Con «Colores», cada cosa del profesor (de su lista) con su color, y su
  // punto de ese color en la lista; si no, todo en morado. Se recuerda.
  const COLORES_KEY = 'cj_colores_profesor';
  const PALETA = ['#EF4444', '#3B82F6', '#F59E0B', '#10B981', '#EC4899', '#06B6D4', '#84CC16', '#A855F7', '#F97316', '#14B8A6', '#6366F1', '#EAB308'];
  let coloresProfe = false;
  try{ coloresProfe = localStorage.getItem(COLORES_KEY) === '1'; }catch(e){}
  function colorDeItem(i){ return coloresProfe ? PALETA[i % PALETA.length] : MORADO; }
  function pintarProfesor(){
    capaProfesor.clearLayers();
    if(!delProfesor) return;
    // Cada calle y lugar, con el color de su cosa de la lista (o de la que se
    // llama igual: la lista tiene una por nombre).
    const colorVia = new Map(), colorLugar = new Map(), porNombre = new Map();
    delProfesor.items.forEach((it, i) => {
      const c = colorDeItem(i);
      porNombre.set(normalizar(it.nombre), c);
      it.vias.forEach(v => colorVia.set(v.id, c));
      if(it.lugar) colorLugar.set(it.lugar.id, c);
    });
    delProfesor.vias.forEach(v => {
      const c = colorVia.get(v.id) || porNombre.get(normalizar(v.nombre)) || MORADO;
      lineaAncha(v.lineas, { color: c, weight: 9, metros: 14, opacity: 0.25, lineCap: 'round' }).addTo(capaProfesor);
      lineaAncha(v.lineas, { color: c, weight: 3.5, metros: 6, opacity: 0.95, lineCap: 'round' }).addTo(capaProfesor);
    });
    delProfesor.lugares.forEach(l => {
      const c = colorLugar.get(l.id) || porNombre.get(normalizar(l.nombre)) || MORADO;
      L.circleMarker([l.lat, l.lng], { radius: 7, color: '#fff', weight: 2, fillColor: c, fillOpacity: 1, interactive: false }).addTo(capaProfesor);
    });
  }
  function alternarColores(){
    coloresProfe = !coloresProfe;
    try{ localStorage.setItem(COLORES_KEY, coloresProfe ? '1' : '0'); }catch(e){}
    pintarProfesor();
    ponerChips();
    if(verEstudio === 'profesor') el('cjPista').textContent = coloresProfe ? 'Toca lo de colores para ver qué es' : 'Toca lo morado para ver qué es';
    // La lista de lo del profesor, si está abierta, con sus puntos de color.
    const caja = el('cjLista');
    if(!caja.classList.contains('hidden') && verEstudio === 'profesor'){ caja.classList.add('hidden'); alternarLista(); }
  }
  function hayDelProfesor(){ return !!delProfesor && (delProfesor.vias.size + delProfesor.lugares.size) > 0; }
  // Todos los lugares de la zona, como puntos (con «Lugares» arriba).
  function pintarLugares(){
    capaLugares.clearLayers();
    if(verEstudio !== 'lugares') return;
    datos.lugares.filter(enZonaLugar).forEach(l => L.circleMarker([l.lat, l.lng], { radius: 5.5, color: '#fff', weight: 1.5, fillColor: TURQUESA, fillOpacity: 0.95, interactive: false }).addTo(capaLugares));
  }
  // Los botones de arriba del mapa libre: Calles · Lugares · De tu profesor.
  function ponerChips(){
    const caja = el('cjChips');
    const ver = modo === 'estudio' && !verTemario;
    caja.classList.toggle('hidden', !ver);
    if(!ver) return;
    const nl = datos.lugares.filter(enZonaLugar).length;
    const b = (k, texto, clase) => '<button type="button" role="tab" aria-selected="' + (verEstudio === k) + '" class="cj-chip' + (clase ? ' ' + clase : '') + (verEstudio === k ? ' activo' : '') +
      '" onclick="CJ.cambiarVerEstudio(\'' + k + '\')">' + texto + '</button>';
    caja.innerHTML = b('calles', 'Calles') + (nl ? b('lugares', 'Lugares') : '') +
      (hayDelProfesor() ? b('profesor', '<i></i>Profesor', 'cj-chip-profe') +
        '<button type="button" class="cj-chip cj-chip-colores' + (coloresProfe ? ' activo' : '') + '" aria-pressed="' + coloresProfe +
        '" aria-label="Colores: cada cosa del profesor, de un color" title="Colores: cada cosa del profesor, de un color" onclick="CJ.alternarColores()"><i></i></button>' : '');
  }
  function cambiarVerEstudio(v){
    if(modo !== 'estudio' || verTemario) return;
    verEstudio = v === 'lugares' || (v === 'profesor' && hayDelProfesor()) ? v : 'calles';
    capaMarcas.clearLayers();
    el('cjInfo').classList.add('hidden');
    el('cjLista').classList.add('hidden');
    ponerChips();
    ponerBotonLista();
    pintarLugares();
    el('cjPista').textContent = verEstudio === 'lugares' ? 'Toca un punto para ver qué lugar es'
      : verEstudio === 'profesor' ? (coloresProfe ? 'Toca lo de colores para ver qué es' : 'Toca lo morado para ver qué es') : 'Toca una calle para ver cómo se llama';
    el('cjPista').classList.remove('hidden');
    if(verEstudio === 'profesor'){
      const pts = [];
      delProfesor.vias.forEach(x => pts.push([x.caja.s, x.caja.o], [x.caja.n, x.caja.e]));
      delProfesor.lugares.forEach(l => pts.push([l.lat, l.lng]));
      if(pts.length) mapa.flyToBounds(L.latLngBounds(pts), { padding: [40, 40], maxZoom: 16, duration: 0.6 });
    }
  }
  // Lo del profesor tocado: un lugar (a menos de 18 px) o una de sus calles.
  function tocadoDelProfesor(latlng){
    const px = mapa.latLngToContainerPoint(latlng);
    let mejor = null, dMin = 18;
    delProfesor.lugares.forEach(l => {
      const d = mapa.latLngToContainerPoint([l.lat, l.lng]).distanceTo(px);
      if(d < dMin){ dMin = d; mejor = { lugar: l }; }
    });
    if(mejor) return mejor;
    const tol = Math.max(15, mapa.distance(mapa.containerPointToLatLng([0, 0]), mapa.containerPointToLatLng([20, 0])));
    let dv = tol;
    delProfesor.vias.forEach(v => {
      const d = distanciaAVia(latlng.lat, latlng.lng, v);
      if(d < dv){ dv = d; mejor = { via: v }; }
    });
    return mejor;
  }
  // El lugar de la zona más cercano al toque (a menos de 20 px).
  function lugarTocado(latlng){
    const px = mapa.latLngToContainerPoint(latlng);
    let mejor = null, dMin = 20;
    datos.lugares.filter(enZonaLugar).forEach(l => {
      const d = mapa.latLngToContainerPoint([l.lat, l.lng]).distanceTo(px);
      if(d < dMin){ dMin = d; mejor = l; }
    });
    return mejor;
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

  // Pantalla completa: el mapa ocupa todo el móvil, de borde a borde (y, si
  // el navegador deja, también sin sus barras), y lo demás flota encima en
  // recuadros pequeños que se pliegan con un toque: arriba, la pregunta o el
  // buscador (CJ.plegarCabeza); abajo, lo que se ha tocado (se pliega
  // tocándolo). Se quita con el mismo botón, con «atrás» o al salir, y se
  // recuerda en el dispositivo para los siguientes mapas.
  const ICONO_COMPLETA = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6"/><path d="M9 21H3v-6"/><path d="M21 3l-7 7"/><path d="M3 21l7-7"/></svg>';
  const ICONO_SALIR_COMPLETA = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 14h6v6"/><path d="M20 10h-6V4"/><path d="M14 10l7-7"/><path d="M3 21l7-7"/></svg>';
  const COMPLETA_KEY = 'cj_pantalla_completa';
  let completaNavegador = false;   // si la pantalla completa del navegador la hemos pedido nosotros
  let cabezaPlegada = false;
  const enNavegador = () => document.fullscreenElement || document.webkitFullscreenElement;
  function estaCompleta(){ return document.getElementById('screen-callejero').classList.contains('cj-completa'); }
  // recordar: al pulsar el botón (o salir con «atrás»), no al cerrar el mapa.
  function pantallaCompleta(on, recordar){
    const pantalla = document.getElementById('screen-callejero');
    on = on === undefined ? !pantalla.classList.contains('cj-completa') : !!on;
    pantalla.classList.toggle('cj-completa', on);
    if(recordar){ try{ localStorage.setItem(COMPLETA_KEY, on ? '1' : '0'); }catch(e){} }
    // (Los dos iconos están en el botón y el CSS enseña uno: cambiar su HTML
    // en pleno toque haría que el mapa también lo recibiera.)
    const b = document.querySelector('.cj-completa-boton');
    if(b){
      b.setAttribute('aria-label', on ? 'Salir de pantalla completa' : 'Pantalla completa');
      b.title = b.getAttribute('aria-label');
    }
    const raiz = document.documentElement;
    const pedir = raiz.requestFullscreen || raiz.webkitRequestFullscreen;
    if(on && pedir && !enNavegador()){
      // Todo el documento (no solo el mapa), para que los avisos y los
      // diálogos se sigan viendo. En el iPhone no existe: se queda en el CSS.
      completaNavegador = true;
      try{
        const p = pedir.call(raiz, { navigationUI: 'hide' });
        if(p && p.catch) p.catch(() => { completaNavegador = false; });
      }catch(e){ completaNavegador = false; }
    } else if(!on && completaNavegador){
      completaNavegador = false;
      const dejar = document.exitFullscreen || document.webkitExitFullscreen;
      if(enNavegador() && dejar){
        try{ const p = dejar.call(document); if(p && p.catch) p.catch(() => {}); }catch(e){}
      }
    }
    if(on) vigilarCabeza();
    if(mapa) setTimeout(() => mapa.invalidateSize(), 0);
  }
  // Si se sale de la pantalla completa del navegador (con «atrás» o Esc),
  // también de la del mapa.
  function alCambiarNavegador(){
    if(enNavegador() || !completaNavegador) return;
    completaNavegador = false;
    if(estaCompleta()) pantallaCompleta(false, true);
  }
  document.addEventListener('fullscreenchange', alCambiarNavegador);
  document.addEventListener('webkitfullscreenchange', alCambiarNavegador);
  function completaRecordada(){ try{ return localStorage.getItem(COMPLETA_KEY) === '1'; }catch(e){ return false; } }
  // El recuadro de arriba (pregunta, opciones, buscador…) plegado deja solo
  // la barra y la pregunta en una línea.
  function plegarCabeza(plegar){
    cabezaPlegada = plegar === undefined ? !cabezaPlegada : !!plegar;
    el('cjCabeza').classList.toggle('plegada', cabezaPlegada);
    const b = el('cjPlegar');
    b.setAttribute('aria-expanded', String(!cabezaPlegada));
    b.setAttribute('aria-label', cabezaPlegada ? 'Desplegar' : 'Plegar');
    b.title = b.getAttribute('aria-label');
    if(cabezaPlegada) el('cjSugerencias').classList.add('hidden');
  }
  // Lo que flota bajo el recuadro de arriba (Calles/Lugares/Profesor, la
  // lista) se coloca según su alto: --cj-arriba, en píxeles desde arriba.
  let vigilandoCabeza = false;
  function vigilarCabeza(){
    const cab = el('cjCabeza'), juego = el('cjJuego');
    const poner = () => juego.style.setProperty('--cj-arriba', (cab.offsetTop + cab.offsetHeight) + 'px');
    poner();
    if(vigilandoCabeza) return;
    vigilandoCabeza = true;
    if(window.ResizeObserver) new ResizeObserver(poner).observe(cab);
    // El recuadro de lo tocado se pliega y despliega tocándolo (no sus botones).
    el('cjInfo').addEventListener('click', e => {
      if(!estaCompleta() || e.target.closest('button, a, input, select')) return;
      el('cjInfo').classList.toggle('plegada');
    });
  }
  function crearControlCompleta(){
    const Control = L.Control.extend({
      options: { position: 'topright' },
      onAdd: function(){
        const div = L.DomUtil.create('div', 'cj-completa-ctl');
        div.innerHTML = '<button type="button" class="cj-completa-boton" aria-label="Pantalla completa" title="Pantalla completa">' +
          '<span class="cj-ico-abrir">' + ICONO_COMPLETA + '</span><span class="cj-ico-cerrar">' + ICONO_SALIR_COMPLETA + '</span></button>';
        L.DomEvent.disableClickPropagation(div);
        div.querySelector('button').addEventListener('click', e => { L.DomEvent.stop(e); pantallaCompleta(undefined, true); });
        return div;
      }
    });
    return new Control();
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
            '<div class="cj-estilo-nota hidden"></div>' +
          '</div>';
        L.DomEvent.disableClickPropagation(div);
        div.querySelector('.cj-estilo-boton').addEventListener('click', () => {
          const menu = div.querySelector('.cj-estilo-menu'), abrir = menu.classList.contains('hidden');
          cerrarMenus();
          if(abrir) menu.classList.remove('hidden');
        });
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
      parque: datos.lineaParques ? datos.jugables.filter(v => v.parque && f.via(v)).map(v => v.id).concat(lugares.filter(l => l.parque).map(l => -l.id)) : [],
      // Los barrios de sus calles y sus distritos.
      barrios: (() => {
        const bs = [...new Set(datos.jugables.filter(f.via).flatMap(v => v.barrios))];
        return bs.map(idBarrio).concat([...new Set(bs.map(b => b.distrito))].map(idDistrito));
      })(),
      memoria: vias
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
  // Qué lleva una tarea («Ficha Centro · 6 calles y 1 lugar · Distrito Levante») y qué modos cuentan.
  function describirTarea(t){
    const n = (k, uno, varios) => k ? k + ' ' + (k === 1 ? uno : varios) : '';
    const partes = [];
    if(esTemario(t)) partes.push(typeof CJT !== 'undefined' ? CJT.describirFichas(t.fichas) : 'Temario');
    if(usaLista(t)) partes.push([n(t.vias.length, 'calle', 'calles'), n(t.lugares.length, 'lugar', 'lugares')].filter(Boolean).join(' y '));
    if(t.zona !== null && t.zona !== undefined) partes.push(nombreZonaDe(t.zona));
    const modos = !tieneCalles(t) ? 'preguntas del temario'
      : t.modos.length ? t.modos.map(m => MODOS[m] ? MODOS[m].titulo : m).join(', ') : 'cualquier modo';
    return { que: partes.join(' · '), modos };
  }
  function tareaHecha(t){ return t.rondas_validas >= t.rondas; }
  // «2 rondas de Localiza la calle con un 70 % o más · 1 no cuenta»
  function textoRondas(t){
    const sinContar = t.rondas_jugadas - t.rondas_validas;
    return t.rondas + (t.rondas === 1 ? ' ronda' : ' rondas') + (tieneCalles(t) ? ' de ' + describirTarea(t).modos : '') + ' con un ' + t.minimo + '% o más' +
      (sinContar > 0 ? ' · ' + sinContar + (sinContar === 1 ? ' no cuenta' : ' no cuentan') : '');
  }
  // Todo lo que ha mandado el profesor, dentro de una sola caja: una fila
  // por tarea sin terminar (se pulsa y se abre) y, al final, todo junto.
  const FLECHA_FILA = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>';
  function filaTarea(t){
    const vencida = t.fecha_limite && new Date(t.fecha_limite + 'T23:59:59') < new Date();
    const det = [describirTarea(t).que, Math.min(t.rondas_validas, t.rondas) + '/' + t.rondas + (t.rondas === 1 ? ' ronda' : ' rondas'),
      t.fecha_limite ? (vencida ? 'venció el ' : 'hasta el ') + fechaCorta(t.fecha_limite) : ''].filter(Boolean).join(' · ');
    return '<button type="button" class="cjt-ficha cj-tarea-fila" onclick="CJT.abrirTarea(' + t.id + ')">' +
      '<span class="cjt-ficha-txt"><span class="cjt-ficha-n">' + escapeHtml(t.titulo) +
        (!t.vista_at ? ' <span class="cj-tarea-solo">Nueva</span>' : '') +
        (t.sin_leer ? ' <span class="cj-tarea-msgs">' + t.sin_leer + (t.sin_leer === 1 ? ' mensaje' : ' mensajes') + '</span>' : '') + '</span>' +
        '<span class="cjt-ficha-d">' + escapeHtml(det) + '</span></span>' + FLECHA_FILA + '</button>';
  }
  function tareasHtml(){
    const ts = tareasActivas();
    const porHacer = ts.filter(t => !tareaHecha(t)), hechas = ts.filter(tareaHecha);
    return (porHacer.length ? '<div class="cj-card cjt-inicio">' + porHacer.map(filaTarea).join('') + '</div>'
        : '<div class="cj-card"><div class="cj-repaso-vacio">' + (ts.length ? 'Lo tienes todo hecho.' : 'Tu profesor no te ha mandado nada.') + '</div></div>') +
      (hechas.length ? '<div class="cj-seccion">Hechas</div><div class="cj-card cjt-inicio">' + hechas.map(filaTarea).join('') + '</div>' : '') +
      (ts.length > 1 ? '<button type="button" class="cj-hoy-otro" onclick="CJT.abrirProfesor()">Verlo todo junto ›</button>' : '');
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
  function cambiarVistaProfesor(v){
    vistaProfesor = v === 'propio' || v === 'temario' ? v : 'alumnos';
    try{ localStorage.setItem('cj_vista_profesor', vistaProfesor); }catch(e){}
    pintarInicio();
    arriba();
  }
  // Pestañas del alumno. Volver a tocar «Estudiar» estando en ella lleva a su principio.
  function cambiarPestana(){
    enCalles = false;
    subInicio = null;
    pintarInicio();
    arriba();
  }
  function abrirCalles(){ enCalles = true; pintarInicio(); arriba(); }
  function irA(sub){ subInicio = sub || null; enCalles = false; pintarInicio(); arriba(); }
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
    avisarNuevas();
    marcarVistas();
    // Una sola pantalla: lo que ha mandado el profesor, repasar lo visto,
    // aprender por niveles y, debajo, el temario y las calles.
    root.innerHTML = volverProfe + (enCalles ? callesHtml(true) : subInicio ? subHtml() : inicioHtml());
  }
  // La pantalla principal: solo tres botones grandes; cada uno abre lo suyo.
  function inicioHtml(){
    if(soloEsto()) return tareasHtml() + AVISO_SOLO + (tareasZona().length ? callesHtml(false) : '');
    const porHacer = tareasActivas().filter(t => !tareaHecha(t)).length;
    const r = porRepasar();
    const tem = typeof CJT !== 'undefined' ? CJT.resumen() : null;
    const repasos = r.total + (tem ? tem.falladas || 0 : 0);
    const boton = (sub, clase, icono, titulo, texto, num) =>
      '<button type="button" class="cj-grande ' + clase + '" onclick="CJ.irA(\'' + sub + '\')">' +
        '<span class="cj-grande-icono">' + svgIcono(icono) + '</span>' +
        '<span class="cj-grande-txt"><b>' + titulo + '</b><small>' + texto + '</small></span>' +
        (num ? '<span class="cj-grande-num">' + num + '</span>' : '') + FLECHA_FILA + '</button>';
    return '<div class="cj-grandes">' +
      boton('tareas', 'profe', ICONOS.localiza, 'Lo que te ha mandado', porHacer ? (porHacer === 1 ? '1 sin terminar' : porHacer + ' sin terminar') : 'Nada pendiente', porHacer) +
      boton('repasar', 'repaso', ICONOS.repasar, 'Repasar lo estudiado', repasos ? 'Lo que hoy toca recordar' : 'Al día', repasos) +
      boton('aprender', 'nuevo', ICONOS.aprender, 'Aprender', 'Distritos, barrios, calles, lugares y temario', 0) +
    '</div>';
  }
  // La pantalla de cada botón, con su cabecera para volver.
  function subHtml(){
    const titulos = { tareas: 'Lo que te ha mandado', repasar: 'Repasar lo estudiado', aprender: 'Aprender', temario: 'Temario de la academia', todo: 'Todo lo dado hasta ahora', notas: 'Mis notas' };
    const cuerpo = subInicio === 'tareas' ? tareasHtml() : subInicio === 'repasar' ? repasarHtml() : subInicio === 'todo' ? todoHtml()
      : subInicio === 'temario' ? temarioHtml() : subInicio === 'notas' ? notasHtml() : aprenderHtml();
    const atras = subInicio === 'todo' ? 'repasar' : subInicio === 'temario' || subInicio === 'notas' ? 'aprender' : '';
    return '<div class="cjt-cab"><button type="button" class="cj-salir" onclick="CJ.irA(\'' + atras + '\')" aria-label="Volver">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg></button>' +
        '<div><div class="cjt-cab-etq">Callejero</div><h2>' + titulos[subInicio] + '</h2></div></div>' + cuerpo;
  }
  // La ventanita al entrar: lo que acaba de mandar el profesor (sin ver aún).
  const avisadas = new Set();
  function avisarNuevas(){
    const nuevas = tareasActivas().filter(t => !t.vista_at && !tareaHecha(t) && !avisadas.has(t.id));
    if(!nuevas.length || document.querySelector('.ui-confirm-bg')) return;
    nuevas.forEach(t => avisadas.add(t.id));
    const t = nuevas[0];
    const texto = nuevas.length === 1
      ? '«' + t.titulo + '»\n\n' + describirTarea(t).que + (t.mensaje ? '\n\n' + t.mensaje : '')
      : nuevas.map(x => '· ' + x.titulo).join('\n');
    uiConfirm(texto, { title: nuevas.length === 1 ? '📍 Tu profesor te ha mandado algo para estudiar' : '📍 Tu profesor te ha mandado ' + nuevas.length + ' cosas para estudiar',
      ok: nuevas.length === 1 ? 'Estudiar esto' : 'Ver', cancel: 'Luego', danger: false })
      .then(ok => { if(ok) setTimeout(() => CJT.abrirTarea(t.id), 0); });
  }
  const AVISO_SOLO = '<div class="cj-card"><div class="cj-zona-aviso">Tu profesor ha pedido que, de momento, estudies solo sus tareas.</div></div>';

  /* ---------- Aprender por niveles y Repaso ---------- */
  // Cada calle sube por cuatro niveles, de más fácil a más difícil: 1 ¿Cómo
  // se llama? (4 opciones), 2 Localiza la calle, 3 Cruces y paralelas y
  // 4 ¿Qué parque acude? Pasa un nivel cuando lo domina (la regla de siempre:
  // sin fallos o 3 seguidas bien). Las calles nuevas salen de la más fácil
  // (rondas, avenidas, las largas de la ciudad) a la más difícil (pasajes,
  // afueras). Todo lo ya estudiado vuelve en el Repaso cada vez más espaciado
  // (1, 3, 7, 15 y 30 días; si se falla, enseguida). Todo sale de
  // callejero_intentos: no hace falta guardar nada más.
  const NIVELES = [
    { modo: 'opciones', titulo: '¿Cómo se llama?', desc: 'Eliges entre 4 nombres' },
    { modo: 'localiza', titulo: 'Localiza la calle', desc: 'Te doy el nombre y la tocas' },
    { modo: 'cruces', titulo: 'Cruces y paralelas', desc: 'Con qué calles se cruza' },
    { modo: 'parque', titulo: '¿Qué parque acude?', desc: 'Central o Granadal' }
  ];
  const NUEVAS_POR_RONDA = 10;
  const DIAS_REPASO = [0, 1, 3, 7, 15, 30];
  const PESO_TIPO = { AVENIDA: 3, RONDA: 3, PASEO: 3, BULEVAR: 3, PLAZA: 2.5, GLORIETA: 2, CALLE: 1, PASAJE: 0.5, CALLEJA: 0.5, TRAVESIA: 0.6,
    AUTOVIA: 0.3, CARRETERA: 0.3, URBANIZACION: 0.3, ENLACE: 0.2, CAMINO: 0.2, FINCA: 0.1, DISEMINADO: 0.1, VEREDA: 0.1 };
  let limiteRonda = null;    // calles (en orden) de la próxima ronda guiada
  let guiaPendiente = null;  // qué ronda guiada se está preparando
  let rondaGuiada = null;    // { tipo: 'nivel', n } | { tipo: 'repaso' } de la ronda en curso
  let cacheCalles = null;    // { clave, calles }
  function largoDe(v){
    if(v._largo === undefined){
      let m = 0;
      v.lineas.forEach(l => { for(let k = 1; k < l.length; k++) m += Math.hypot((l[k][0] - l[k - 1][0]) * 111000, (l[k][1] - l[k - 1][1]) * 88000); });
      v._largo = m;
    }
    return v._largo;
  }
  // Las calles de la zona (una por nombre: su tramo más largo), de la más
  // fácil a la más difícil.
  function callesOrdenadas(){
    const clave = datos.version + '|' + zona;
    if(cacheCalles && cacheCalles.clave === clave) return cacheCalles.calles;
    const grupos = new Map();
    datos.jugables.filter(enZona).forEach(v => {
      const g = grupos.get(v.nombre) || { rep: v, largo: 0 };
      g.largo += largoDe(v);
      if(largoDe(v) > largoDe(g.rep)) g.rep = v;
      grupos.set(v.nombre, g);
    });
    // Más fácil: más larga (hasta 2,5 km: una carretera de 30 km no es más
    // conocida), de un tipo importante (avenida, ronda, plaza) y cerca del
    // centro; lo de fuera de los barrios, al final.
    const puntos = g => {
      const c = g.rep.caja, km = Math.hypot(((c.s + c.n) / 2 - CENTRO[0]) * 111, ((c.o + c.e) / 2 - CENTRO[1]) * 88);
      return Math.min(g.largo, 2500) * (PESO_TIPO[g.rep.tipo] || 1) * (km < 3.5 ? 1 : km < 6 ? 0.4 : 0.03) * (g.rep.barrios.length ? 1 : 0.05);
    };
    const calles = [...grupos.values()].sort((a, b) => puntos(b) - puntos(a)).map(g => g.rep);
    cacheCalles = { clave, calles };
    return calles;
  }
  function estadoNivel(n, v){ return estadoDe(progreso.get(claveP(HABILIDAD[NIVELES[n].modo], v.id))); }
  // ¿Tiene sentido este nivel para esta calle? (sin cruces o sin parque, se salta)
  function aplica(n, v){
    if(n === 2) return [...crucesDe(v)].some(w => w.jugable);
    if(n === 3) return !!v.parque;
    return true;
  }
  function listaPara(n, v){ return aplica(n, v); }
  // Las calles de una ronda del nivel n: primero lo que se está aprendiendo
  // (fallado o a medias) y luego las nuevas, de la más fácil a la más difícil.
  function callesDeNivel(n){
    const enCurso = [], nuevas = [];
    callesOrdenadas().forEach(v => {
      if(!listaPara(n, v)) return;
      const e = estadoNivel(n, v);
      if(e === 'fallada' || e === 'progreso') enCurso.push(v);
      else if(e === 'nueva') nuevas.push(v);
    });
    const cupo = Math.max(NUEVAS_POR_RONDA, PREGUNTAS_POR_RONDA - enCurso.length);
    return enCurso.slice(0, PREGUNTAS_POR_RONDA).concat(nuevas.slice(0, Math.min(cupo, PREGUNTAS_POR_RONDA))).slice(0, PREGUNTAS_POR_RONDA + 5);
  }
  // Repaso: lo estudiado (de los cuatro niveles) a lo que ya le toca volver.
  function porRepasar(){
    const ahora = Date.now();
    const porModo = {};
    let total = 0, proxima = null;
    callesOrdenadas().forEach(v => NIVELES.forEach((nv, n) => {
      const p = progreso.get(claveP(HABILIDAD[nv.modo], v.id));
      if(!p || !p.intentos || !aplica(n, v)) return;
      const toca = (Number(p.ultima) || 0) * 1000 + DIAS_REPASO[Math.min(p.racha, DIAS_REPASO.length - 1)] * 864e5;
      if(toca <= ahora){ (porModo[nv.modo] = porModo[nv.modo] || []).push({ v, toca }); total++; }
      else if(proxima === null || toca < proxima) proxima = toca;
    }));
    Object.values(porModo).forEach(l => l.sort((a, b) => a.toca - b.toca));
    return { total, porModo, proxima };
  }
  async function empezarGuiada(m, vias, guia){
    if(!vias.length){ uiToast('No hay calles para esto en ' + nombreZona() + '.', 'info'); return; }
    limiteRonda = vias;
    guiaPendiente = guia;
    try{ await empezar(m); }
    finally{ limiteRonda = null; guiaPendiente = null; }
  }
  function aprender(n){
    if(!datos) return;
    n = Number(n) || 0;
    empezarGuiada(NIVELES[n].modo, callesDeNivel(n), { tipo: 'nivel', n });
  }
  // Repasar lo que toca de un modo (lo elige el alumno).
  function repasar(modo){
    if(!datos) return;
    const l = porRepasar().porModo[modo] || [];
    if(!l.length){ uiToast('Ya has repasado todo lo de este modo.', 'info'); return; }
    empezarGuiada(modo, l.slice(0, PREGUNTAS_POR_RONDA + 5).map(x => x.v), { tipo: 'repaso', modo });
  }
  function seguirGuiada(){
    const g = rondaGuiada;
    if(g && g.tipo === 'repaso') repasar(g.modo); else if(g && g.tipo === 'todo') repasarTodo(g.modo); else aprender(g ? g.n : 0);
  }
  // Una fila grande de modo de juego: icono, nombre y lo que lleva.
  function filaModo(accion, titulo, texto, icono, activo){
    return '<button type="button" class="cj-nivel"' + (activo ? ' onclick="' + accion + '"' : ' disabled') + '>' +
      '<span class="cj-nivel-n">' + svgIcono(icono) + '</span>' +
      '<span class="cj-nivel-txt"><b>' + escapeHtml(titulo) + '</b><small>' + escapeHtml(texto) + '</small></span>' +
      (activo ? FLECHA_FILA : '') + '</button>';
  }
  // Repasar: el alumno elige el modo; cada uno, con lo que le toca hoy.
  function repasarHtml(){
    const r = porRepasar();
    const tem = typeof CJT !== 'undefined' ? CJT.resumen() : null;
    const delTemario = tem ? tem.falladas || 0 : 0;
    const n = k => k.toLocaleString('es-ES') + ' para repasar';
    const filas = NIVELES.map(nv => { const k = (r.porModo[nv.modo] || []).length; return filaModo('CJ.repasar(\'' + nv.modo + '\')', nv.titulo, k ? n(k) : 'Al día', ICONOS[nv.modo], k); })
      .concat(tem ? [filaModo('CJT.repasar()', 'Temario de la academia', delTemario ? n(delTemario) : 'Al día', ICONOS.estudio, delTemario)] : []).join('');
    const diaProx = r.proxima ? Math.max(1, Math.ceil((r.proxima - Date.now()) / 864e5)) : null;
    const aviso = r.total || delTemario ? 'Elige cómo quieres repasar.'
      : diaProx ? 'Nada para repasar hoy. Lo siguiente vuelve ' + (diaProx === 1 ? 'mañana' : 'en ' + diaProx + ' días') + '.'
      : 'Aquí se irá juntando todo lo que estudies, para repasarlo cuando toque.';
    const mandado = tem && tareasActivas().some(t => (t.fichas || []).length);
    const practicar = (tem ? filaModo('CJT.preguntarSinMapa()', 'Preguntas del temario', (mandado ? 'Lo que te ha mandado' : 'Todo el temario') + ' · sin mapa', ICONOS.estudio, true) : '') +
      (datos.barrios.length
        ? filaModo('CJ.empezar(\'mapadistritos\')', 'Distritos en el mapa', 'Todos de colores; toca el que te pido', ICONOS.barrios, true) +
          filaModo('CJ.empezar(\'mapabarrios\')', 'Barrios en el mapa', 'Todos de colores; toca el que te pido', ICONOS.enbarrio, true)
        : '');
    const todo = '<button type="button" class="cj-grande repaso cj-todo" onclick="CJ.irA(\'todo\')">' +
      '<span class="cj-grande-icono">' + svgIcono(ICONOS.repasar) + '</span>' +
      '<span class="cj-grande-txt"><b>Todo lo dado hasta ahora</b><small>Preguntas del temario y calles; eliges cómo te pregunto</small></span>' + FLECHA_FILA + '</button>';
    return todo + (practicar ? '<div class="cj-card cj-repaso"><div class="cj-niveles cj-modos cj-modos-arriba">' + practicar + '</div></div><div class="cj-seccion">Lo que toca repasar hoy</div>' : '') +
      '<div class="cj-card cj-repaso"><div class="cj-repaso-vacio">' + aviso + '</div><div class="cj-niveles cj-modos">' + filas + '</div></div>';
  }
  // Aprender: ver en el mapa, con su nombre, los distritos, los barrios,
  // todas las calles (sin lo del profesor), las plazas y los lugares por
  // tipo; y el temario. Se toca cualquier cosa (o se elige de la lista) y
  // dice qué es.
  const GRUPOS_LUGARES = [
    { k: 'colegios', titulo: 'Colegios, institutos y universidad', cats: ['Colegios e institutos', 'Universidad'] },
    { k: 'salud', titulo: 'Hospitales y centros de salud', cats: ['Hospitales', 'Centros de salud', 'Residencias de mayores'] },
    { k: 'parques', titulo: 'Parques y jardines', cats: ['Parques y jardines'] },
    { k: 'monumentos', titulo: 'Monumentos, museos e iglesias', cats: ['Monumentos', 'Museos', 'Edificios religiosos'] },
    { k: 'publicos', titulo: 'Edificios públicos y emergencias', cats: ['Administraciones', 'Juzgados', 'Correos', 'Seguridad y emergencias', 'Bibliotecas y archivos'] },
    { k: 'ocio', titulo: 'Deporte, cultura y hoteles', cats: ['Instalaciones deportivas', 'Cultura y ocio', 'Hoteles'] },
    { k: 'otros', titulo: 'Transporte, mercados e industria', cats: ['Transporte', 'Mercados y comercios', 'Industria y polígonos', 'Cementerios'] }
  ];
  const lugaresDeGrupo = g => datos.lugares.filter(l => g.cats.includes(l.categoria));
  function aprenderHtml(){
    const n = k => k.toLocaleString('es-ES');
    const nc = new Set(datos.jugables.map(v => v.nombre)).size;
    const np = new Set(datos.vias.filter(v => v.tipo === 'PLAZA' || v.tipo === 'GLORIETA').map(v => v.nombre)).size;
    const filas = (datos.barrios.length
        ? filaModo('CJ.ver(\'distritos\')', 'Distritos', 'Los ' + datos.distritos.length + ', de colores y con su nombre', ICONOS.barrios, true) +
          filaModo('CJ.ver(\'barrios\')', 'Barrios', 'Los ' + n(datos.barrios.length) + ', con su nombre (acércate para leerlos)', ICONOS.enbarrio, true)
        : '') +
      filaModo('CJ.ver(\'calles\')', 'Todas las calles', n(nc) + ' calles; toca una y te dice cómo se llama', ICONOS.mapa, true) +
      (np ? filaModo('CJ.ver(\'plazas\')', 'Plazas y glorietas', n(np) + ' plazas y glorietas', ICONOS.localiza, true) : '') +
      GRUPOS_LUGARES.map(g => { const k = lugaresDeGrupo(g).length; return k ? filaModo('CJ.ver(\'' + g.k + '\')', g.titulo, n(k) + (k === 1 ? ' lugar' : ' lugares'), ICONOS.lugares, true) : ''; }).join('');
    const nn = notas.size;
    return '<div class="cj-card cj-aprender"><div class="cj-niveles cj-modos cj-modos-arriba">' +
        filaModo('CJ.irA(\'notas\')', 'Mis notas', nn ? nn + (nn === 1 ? ' nota' : ' notas') + ' · las últimas, arriba' : 'Lo que apuntes de cada calle o lugar', ICONOS.estudio, true) +
      '</div></div><div class="cj-card cj-aprender cj-todas"><div class="cj-niveles cj-modos cj-modos-arriba">' + filas + '</div></div>' +
      (typeof CJT !== 'undefined' ? '<div class="cj-card cj-aprender cj-todas"><div class="cj-niveles cj-modos cj-modos-arriba">' +
        filaModo('CJ.irA(\'temario\')', 'Temario de la academia', 'Las fichas, con sus apartados, documentos y mapas', ICONOS.estudio, true) + '</div></div>' : '');
  }
  async function ver(k){
    try{ await Promise.all([cargarLeaflet(), cargarDatos()]); }catch(e){ uiToast(e.message, 'error'); return; }
    if(k === 'calles'){ guardarZona(''); await estudio({ sinProfesor: true }); if(modo === 'estudio') el('cjBarraTitulo').textContent = 'Todas las calles'; return; }
    const base = { foco: -1, distritos: [], lista: 'Lista', pista: 'Toca cualquier cosa para ver cómo se llama' };
    let extra = null;
    if(k === 'distritos'){
      const color = coloresDe('distritos');
      extra = { titulo: 'Distritos', nombres: true, items: datos.distritos.map(d => {
        const bs = datos.barrios.filter(b => b.distrito === d);
        return { nombre: d, tipo: 'Distrito', vias: [], lugar: null, barrios: bs, distrito: d, color: color.get(d),
          detalle: [bs.length + (bs.length === 1 ? ' barrio: ' : ' barrios: ') + bs.map(b => b.nombre).join(', ')] };
      }) };
    }else if(k === 'barrios'){
      const color = coloresDe('barrios');
      extra = { titulo: 'Barrios', nombres: true, nombresDesde: 15, items: datos.barrios.slice().sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
        .map(b => ({ nombre: b.nombre, tipo: 'Barrio', vias: [], lugar: null, barrios: [b], color: color.get(b.nombre), detalle: ['Distrito ' + b.distrito] })) };
    }else if(k === 'plazas'){
      const grupos = new Map();
      datos.vias.filter(v => v.tipo === 'PLAZA' || v.tipo === 'GLORIETA').forEach(v => { if(!grupos.has(v.nombre)) grupos.set(v.nombre, []); grupos.get(v.nombre).push(v); });
      extra = { titulo: 'Plazas y glorietas', centro: 15, items: [...grupos].sort((a, b) => a[0].localeCompare(b[0], 'es')).map(([nombre, vs]) => ({
        nombre, tipo: tipoBonito(vs[0].tipo), vias: vs, lugar: null,
        detalle: [[...new Set(vs.flatMap(v => v.barrios.map(b => b.nombre)))].join(', ')].filter(Boolean) })) };
    }else{
      const g = GRUPOS_LUGARES.find(x => x.k === k);
      if(!g) return;
      extra = { titulo: g.titulo, centro: 14, items: lugaresDeGrupo(g).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
        .map(l => ({ nombre: l.nombre, tipo: l.categoria, vias: [], lugar: l, detalle: [l.direccion].filter(Boolean) })) };
    }
    await estudio(Object.assign(base, extra));
  }
  // Mis notas: las de las calles y lugares, de la última añadida o cambiada a
  // la más antigua; al tocar una, se abre en el mapa con su ficha (y su nota).
  function cosaDeNota(k){
    if(k.startsWith('l:')){ const l = datos.lugarPorId.get(Number(k.slice(2))); return l ? { lugar: l, nombre: l.nombre, tipo: l.categoria } : null; }
    const c = k.slice(2), v = datos.vias.find(x => x.clave === c);
    return v ? { via: v, nombre: v.nombre, tipo: tipoBonito(v.tipo) } : null;
  }
  function fechaNota(f){
    if(!f) return '';
    const d = new Date(f), dias = Math.floor((Date.now() - d) / 864e5);
    return dias < 1 ? 'hoy' : dias === 1 ? 'ayer' : dias < 7 ? 'hace ' + dias + ' días' : d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
  }
  function notasHtml(){
    const lista = [...notas].map(([k, n]) => ({ k, n, x: cosaDeNota(k) })).filter(r => r.x)
      .sort((a, b) => String(b.n.fecha || '').localeCompare(String(a.n.fecha || '')));
    const cambios = typeof CJT !== 'undefined' && CJT.puedeEditar() ? CJT.ultimasPropias(30) : [];
    return '<div class="cj-seccion">Tus notas de calles y lugares</div>' +
      (lista.length ? '<div class="cj-card cjt-inicio">' + lista.map(r =>
        '<button type="button" class="cjt-ficha cj-nota-fila" onclick="CJ.verNota(' + escapeHtml(JSON.stringify(r.k)) + ')">' +
          (r.n.imagen ? '<img src="' + escapeHtml(r.n.imagen) + '" alt="">' : '<span class="cj-fila-icono">' + svgIcono(r.x.lugar ? ICONOS.lugares : ICONOS.localiza) + '</span>') +
          '<span class="cjt-ficha-txt"><span class="cjt-ficha-n">' + escapeHtml(r.x.nombre) + '</span>' +
            '<span class="cjt-ficha-d">' + escapeHtml([fechaNota(r.n.fecha), r.n.texto].filter(Boolean).join(' · ')) + '</span></span>' + FLECHA_FILA + '</button>').join('') + '</div>'
        : '<div class="cj-card"><div class="cj-repaso-vacio">Todavía no tienes notas. Añádelas en una ronda («Nota», arriba) o al tocar una calle en el mapa.</div></div>') +
      (cambios.length ? '<div class="cj-seccion">Preguntas del temario cambiadas o añadidas</div><div class="cj-card cjt-inicio">' + cambios.map(p =>
        '<button type="button" class="cjt-ficha" onclick="CJT.editarPropia(' + p.id + ')"><span class="cjt-ficha-txt"><span class="cjt-ficha-n">' + escapeHtml(p.pregunta) + '</span>' +
          '<span class="cjt-ficha-d">' + escapeHtml([fechaNota(p.fecha), p.donde].filter(Boolean).join(' · ')) + '</span></span>' + FLECHA_FILA + '</button>').join('') + '</div>' : '');
  }
  async function verNota(k){
    const x = cosaDeNota(k);
    if(!x) return;
    await estudioEn('', x.via ? { via: x.via.id } : { lugar: x.lugar.id });
  }
  function temarioHtml(){
    return typeof CJT !== 'undefined' ? CJT.filasFichas() : '';
  }

  // Repasar todo lo dado: las calles que ya ha estudiado (en cualquier
  // modo), primero las falladas y luego las demás, preguntadas como elija.
  const HAB_CALLES = ['nombre', 'localiza', 'cruces', 'parque'];
  function callesVistas(){
    const vistas = new Map();
    progreso.forEach((p, k) => {
      const [hab, s] = k.split('|'), id = Number(s);
      if(!HAB_CALLES.includes(hab) || !(id > 0 && id < ID_TEMARIO) || !p.intentos) return;
      const v = datos.viaPorId.get(id);
      if(!v || !v.jugable) return;
      const x = vistas.get(v.nombre) || { v, fallada: false };
      if(estadoDe(p) === 'fallada') x.fallada = true;
      vistas.set(v.nombre, x);
    });
    const l = [...vistas.values()];
    return barajar(l.filter(x => x.fallada)).concat(barajar(l.filter(x => !x.fallada))).map(x => x.v);
  }
  const FORMAS_CALLES = [
    { modo: 'opciones', titulo: 'Eligiendo entre 4 nombres', desc: 'Te marco la calle y eliges cómo se llama' },
    { modo: 'localiza', titulo: 'Señalándolas en el mapa', desc: 'Te digo el nombre y la tocas' },
    { modo: 'voz', titulo: 'Diciendo el nombre', desc: 'Te marco la calle, la dices y lo compruebas' },
    { modo: 'cruces', titulo: 'Con sus cruces y paralelas', desc: '¿Cuál cruza con esta?' },
    { modo: 'parque', titulo: '¿Qué parque acude?', desc: 'Central o Granadal' }
  ];
  function repasarTodo(m){
    if(!datos) return;
    const n = m === 'cruces' ? 2 : m === 'parque' ? 3 : -1;
    const vias = callesVistas().filter(v => n < 0 || aplica(n, v));
    if(!vias.length){ uiToast('Todavía no has estudiado calles para esto.', 'info'); return; }
    empezarGuiada(m, vias.slice(0, PREGUNTAS_POR_RONDA + 5), { tipo: 'todo', modo: m });
  }
  function todoHtml(){
    const n = k => k.toLocaleString('es-ES');
    const nc = callesVistas().length;
    const nt = typeof CJT !== 'undefined' ? CJT.contarVistas() : null;
    return '<div class="cj-seccion">Temario</div><div class="cj-card cj-repaso"><div class="cj-niveles cj-modos cj-modos-arriba">' +
        filaModo('CJT.preguntarVistas()', 'Preguntas del temario', nt === null ? 'Todo lo que ya has respondido' : nt ? n(nt) + ' que ya has respondido' : 'Todavía no has respondido ninguna', ICONOS.estudio, nt !== 0) +
      '</div></div>' +
      '<div class="cj-seccion">Calles · ¿cómo te las pregunto?</div><div class="cj-card cj-repaso">' +
        '<div class="cj-repaso-vacio">' + (nc ? n(nc) + (nc === 1 ? ' calle estudiada' : ' calles estudiadas') + '. Elige cómo quieres que te las pregunte:' : 'Todavía no has estudiado ninguna calle.') + '</div>' +
        '<div class="cj-niveles cj-modos">' + FORMAS_CALLES.map(f => filaModo('CJ.repasarTodo(\'' + f.modo + '\')', f.titulo, f.desc, ICONOS[f.modo], nc > 0)).join('') + '</div>' +
      '</div>';
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

  // Las calles: la zona (o una tarea de calles) y los modos en baldosas.
  function callesHtml(conCabecera){
    const t = tareaDeZona();
    const nc = new Set(datos.jugables.filter(enZona).map(v => v.nombre)).size, nl = datos.lugares.filter(enZonaLugar).length;
    const n = (k, uno, varios) => k.toLocaleString('es-ES') + ' ' + (k === 1 ? uno : varios);
    const info = t || zona === 'p'
      ? n(nc, 'calle', 'calles') + ' y ' + n(nl, 'lugar', 'lugares') + (t ? ' de la tarea' : ' de tus tareas')
      : n(nc, 'calle', 'calles') + ' en ' + nombreZona();
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
    repasar: 'M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8|M21 3v5h-5|M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16|M8 16H3v5',
    aprender: 'M12 5v14|M5 12h14',
    mapa: 'M14.106 5.553a2 2 0 0 0 1.788 0l3.659-1.83A1 1 0 0 1 21 4.619v12.764a1 1 0 0 1-.553.894l-4.553 2.277a2 2 0 0 1-1.788 0l-4.212-2.106a2 2 0 0 0-1.788 0l-3.659 1.83A1 1 0 0 1 3 19.381V6.618a1 1 0 0 1 .553-.894l4.553-2.277a2 2 0 0 1 1.788 0z|M15 5.764v15|M9 3.236v15',
    estudio: 'M12 7v14|M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z',
    localiza: 'M20 10c0 4.99-5.54 10.19-7.4 11.8a1 1 0 0 1-1.2 0C9.54 20.19 4 14.99 4 10a8 8 0 0 1 16 0|circle:12,10,3',
    opciones: 'M9 11l3 3L22 4|M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11',
    voz: 'M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z|M19 10v2a7 7 0 0 1-14 0v-2|M12 19v3',
    cruces: 'M12 3v18|M3 12h18|M8 3v4|M16 17v4',
    lugares: 'M3 21h18|M5 21V7l8-4v18|M19 21V11l-6-4|M9 9v.01|M9 12v.01|M9 15v.01|M9 18v.01',
    parque: 'M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.43-2.29 1-3a2.5 2.5 0 0 0 2.5 2.5z',
    barrios: 'M4 4h7v7H4z|M13 4h7v4h-7z|M13 10h7v10h-7z|M4 13h7v7H4z',
    enbarrio: 'M3 7l6-3 6 3 6-3v13l-6 3-6-3-6 3z|M9 4v13|M15 7v13',
    nombrar: 'M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z|M19 10v2a7 7 0 0 1-14 0v-2|M4 21h16'
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
    ['parque', '¿Qué parque acude?', 'Central o Granadal'],
    ['barrios', 'Barrios y distritos', 'Tócalos y di de qué distrito son'],
    ['enbarrio', '¿En qué barrio está?', 'Te marco una calle y eliges'],
    ['nombrar', 'Nombra las calles', 'Di o escribe todas las que sepas']
  ];
  // Los modos de juego en baldosas: sin z, en la zona elegida; con z (desde
  // una ficha del temario), en esa zona. `sinEstudio`: sin «Mapa libre»;
  // `compacto`: solo el icono y el nombre.
  function mosaicoModos(z, sinEstudio, compacto){
    const propia = z === undefined;
    const t = propia ? tareaDeZona() : tareaDeZona(z);
    const f = propia ? filtro : filtroZona(z);
    const hayVias = datos.jugables.some(f.via);
    const hay = {
      estudio: !sinEstudio, localiza: hayVias, opciones: hayVias, voz: hayVias, cruces: hayVias,
      lugares: datos.lugares.some(f.lugar),
      parque: !!datos.lineaParques && (datos.jugables.some(v => v.parque && f.via(v)) || datos.lugares.some(l => l.parque && f.lugar(l))),
      barrios: datos.barrios.length > 0,
      enbarrio: datos.jugables.some(v => v.barrios.length && f.via(v)),
      nombrar: hayVias
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
  // Desde una ficha del temario o una tarea: jugar o ver el mapa libre en su
  // zona. `foco`: { via } o { lugar } (id) para ir ya a esa calle o ese lugar.
  function empezarEn(z, m){ if(zonaValida(z)) guardarZona(z); empezar(m); }
  async function estudioEn(z, foco){
    if(zonaValida(z)) guardarZona(z);
    await estudio();
    if(modo !== 'estudio' || !foco) return;
    const v = foco.via && datos.viaPorId.get(foco.via), l = foco.lugar && datos.lugarPorId.get(foco.lugar);
    if(v) mostrarVia(v, true); else if(l) mostrarLugar(l, true);
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

  function sinMapaAhora(){ return document.getElementById('screen-callejero').classList.contains('cj-sin-mapa'); }
  function mostrarVista(v){
    vistaActual = v;
    document.getElementById('screen-callejero').classList.remove('cj-sin-mapa');
    el('cjInicio').classList.toggle('hidden', v !== 'inicio');
    el('cjJuego').classList.toggle('hidden', v !== 'juego');
    el('cjFin').classList.toggle('hidden', v !== 'fin');
    el('cjPanel').classList.toggle('hidden', v !== 'panel');
    el('cjTemario').classList.toggle('hidden', v !== 'temario');
    document.getElementById('screen-callejero').classList.toggle('cj-jugando', v === 'juego');
    if(v !== 'juego') pantallaCompleta(false);
    else if(completaRecordada() && !estaCompleta()) pantallaCompleta(true);
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
  function ordenarPorRepasoBase(items, idDe, m){
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
  /* ---------- barrios y distritos ---------- */
  // Ids fijos para sus respuestas (en callejero_intentos, como las calles):
  // barrios desde 6·10^12 y distritos desde 6,1·10^12, más un resumen
  // (FNV-1a) de su nombre.
  const ID_BARRIO = 6000000000000, ID_DISTRITO = 6100000000000;
  function resumen32(t){
    let h = 0x811c9dc5;
    for(const c of normalizar(t)){ h ^= c.codePointAt(0); h = Math.imul(h, 0x01000193) >>> 0; }
    return h;
  }
  function idBarrio(b){ return ID_BARRIO + resumen32(b.nombre); }
  function idDistrito(d){ return ID_DISTRITO + resumen32(d); }
  function centroBarrio(b){
    if(!b._centro){ const c = cajaDe(b.anillos); b._centro = [(c.s + c.n) / 2, (c.o + c.e) / 2]; }
    return b._centro;
  }
  function centroDistrito(d){
    const cs = datos.barrios.filter(b => b.distrito === d).map(centroBarrio);
    return [cs.reduce((a, c) => a + c[0], 0) / cs.length, cs.reduce((a, c) => a + c[1], 0) / cs.length];
  }
  function lejania(a, b){ return ((a[0] - b[0]) * 111) ** 2 + ((a[1] - b[1]) * 88) ** 2; }
  // Los más cercanos a un punto (para las opciones falsas: las que confunden).
  function barriosCerca(punto, n, fuera){
    return datos.barrios.filter(b => !fuera.has(b.nombre)).sort((a, b) => lejania(centroBarrio(a), punto) - lejania(centroBarrio(b), punto)).slice(0, n);
  }
  // Los barrios de la zona (los de sus calles); si son pocos (una zona de un
  // barrio), los de su distrito; y si no, todos.
  function barriosDelJuego(){
    const nombres = new Set();
    datos.vias.filter(enZona).forEach(v => v.barrios.forEach(b => nombres.add(b.nombre)));
    let lista = datos.barrios.filter(b => nombres.has(b.nombre));
    if(lista.length < 4){
      const ds = new Set(lista.map(b => b.distrito));
      lista = datos.barrios.filter(b => ds.has(b.distrito));
    }
    return lista.length >= 4 ? lista : datos.barrios.slice();
  }
  function cajaBarrios(bs){ return L.latLngBounds(bs.flatMap(b => b.anillos.flat())); }
  function poligonos(bs, color, relleno, discontinuo){
    bs.forEach(b => L.polygon(b.anillos, { color, weight: discontinuo ? 2.5 : 3, dashArray: discontinuo ? '6 6' : null, fillColor: color, fillOpacity: relleno, interactive: false }).addTo(capaMarcas));
  }
  // Todos los distritos (o todos los barrios) a la vez, cada uno de un color
  // y sin nombres; los barrios de al lado, de colores distintos. Se encuadra
  // la ciudad solo en la primera pregunta (luego se respeta el zoom).
  const COLORES = ['#F2665C', '#4E9BF7', '#F5C043', '#A78BFA', '#F472B6', '#FB923C', '#E5E7EB', '#84CC16', '#94A3B8', '#B45309'];
  function coloresDe(tipo){
    const color = new Map();
    if(tipo === 'distritos') datos.distritos.forEach((d, i) => color.set(d, COLORES[i % COLORES.length]));
    else{
      const cajas = datos.barrios.map(b => { const c = cajaDe(b.anillos), m = 0.0004; return { s: c.s - m, n: c.n + m, o: c.o - m, e: c.e + m }; });
      const toca = (a, b) => a.s <= b.n && b.s <= a.n && a.o <= b.e && b.o <= a.e;
      datos.barrios.forEach((b, i) => {
        const usados = new Set(datos.barrios.filter((x, j) => color.has(x.nombre) && toca(cajas[i], cajas[j])).map(x => color.get(x.nombre)));
        color.set(b.nombre, COLORES.find(c => !usados.has(c)) || COLORES[i % COLORES.length]);
      });
    }
    return color;
  }
  function colores(tipo){
    const color = coloresDe(tipo);
    return () => {
      if(tipo === 'distritos'){
        datos.distritos.forEach(d => {
          datos.barrios.filter(b => b.distrito === d).forEach(b => L.polygon(b.anillos, { weight: 0, fillColor: color.get(d), fillOpacity: 0.4, interactive: false }).addTo(capaMarcas));
          L.polyline(contornoDistrito(d), { color: color.get(d), weight: 2.5, opacity: 1, interactive: false }).addTo(capaMarcas);
        });
      }else datos.barrios.forEach(b => L.polygon(b.anillos, { color: '#0b0b0b', weight: 1, fillColor: color.get(b.nombre), fillOpacity: 0.45, interactive: false }).addTo(capaMarcas));
      if(ronda && ronda.i === 0) mapa.fitBounds(cajaCiudad(), { padding: [20, 20] });
    };
  }
  // Una pregunta de un barrio: tocarlo, qué barrio es el marcado o de qué distrito es.
  function preguntaBarrio(b, tipo){
    const id = idBarrio(b), detalle = 'Distrito ' + b.distrito;
    if(tipo === 'toca') return { barrio: b, id, etiqueta: 'Toca el barrio', texto: b.nombre, nombre: b.nombre, respuesta: 'toque', detalle };
    if(tipo === 'cual'){
      const otras = barriosCerca(centroBarrio(b), 3, new Set([b.nombre])).map(x => x.nombre);
      const q = Object.assign({ id, etiqueta: '¿Qué barrio es este?', texto: '', nombre: b.nombre, respuesta: 'opciones', resumen: b.nombre, detalle,
        antes: () => { poligonos([b], '#F2665C', 0.12); mapa.flyToBounds(cajaBarrios([b]), { padding: [60, 60], maxZoom: 15, duration: 0.6 }); } },
        opcionesCon(b.nombre, otras));
      // Al responder: en verde el barrio y, si se ha fallado, el elegido.
      q.despues = (api, i) => {
        capaMarcas.clearLayers();
        poligonos([b], '#34D399', 0.2);
        const elegido = datos.barrios.find(x => x.nombre === q.opciones[i]);
        if(elegido && elegido !== b) poligonos([elegido], '#F2665C', 0.08, true);
        mapa.flyToBounds(cajaBarrios(elegido && elegido !== b ? [b, elegido] : [b]), { padding: [50, 50], maxZoom: 15, duration: 0.6 });
      };
      return q;
    }
    // De qué distrito es: las opciones falsas, los distritos más cercanos.
    const otros = datos.distritos.filter(d => d !== b.distrito).sort((x, y) => lejania(centroDistrito(x), centroBarrio(b)) - lejania(centroDistrito(y), centroBarrio(b))).slice(0, 3);
    return Object.assign({ id, etiqueta: '¿De qué distrito es el barrio…?', texto: b.nombre, nombre: b.nombre, respuesta: 'opciones', resumen: 'Distrito ' + b.distrito,
      despues: () => {
        capaMarcas.clearLayers();
        const delDistrito = datos.barrios.filter(x => x.distrito === b.distrito);
        L.polyline(contornoDistrito(b.distrito), { color: '#34D399', weight: 3, opacity: 0.95, interactive: false }).addTo(capaMarcas);
        poligonos([b], '#34D399', 0.25);
        mapa.flyToBounds(cajaBarrios(delDistrito), { padding: [40, 40], maxZoom: 15, duration: 0.6 });
      } }, opcionesCon(b.distrito, otros));
  }
  function preguntaDistrito(d){
    return { barrios: datos.barrios.filter(b => b.distrito === d), distrito: d, id: idDistrito(d), etiqueta: 'Toca el distrito', texto: d, nombre: 'Distrito ' + d, respuesta: 'toque' };
  }
  // «¿En qué barrio está?»: una calle marcada y cuatro barrios (los de al lado).
  function preguntaEnBarrio(v){
    const correcta = v.barrios[0];
    const c = [(v.caja.s + v.caja.n) / 2, (v.caja.o + v.caja.e) / 2];
    const otras = barriosCerca(c, 3, new Set(v.barrios.map(b => b.nombre))).map(b => b.nombre);
    const y = v.barrios.length > 1 ? ' (también pasa por ' + v.barrios.slice(1).map(b => b.nombre).join(' y ') + ')' : '';
    const q = Object.assign({ via: v, id: v.id, etiqueta: '¿En qué barrio está…?', texto: v.nombre, nombre: v.nombre,
      resumen: 'Está en ' + correcta.nombre + y + '.', detalle: 'Distrito ' + correcta.distrito,
      antes: () => { resaltar(v, '#F2665C', true); verVias([v]); } }, opcionesCon(correcta.nombre, otras));
    // Al responder: en verde su barrio y, si se ha fallado, el elegido.
    q.despues = (api, i) => {
      poligonos(v.barrios, '#34D399', 0.15);
      const elegido = datos.barrios.find(x => x.nombre === q.opciones[i]);
      const mal = elegido && !v.barrios.includes(elegido) ? [elegido] : [];
      poligonos(mal, '#F2665C', 0.06, true);
      mapa.flyToBounds(cajaBarrios(v.barrios.concat(mal)).extend(limitesDe([v])), { padding: [40, 40], maxZoom: 16, duration: 0.6 });
    };
    return q;
  }

  function crearPreguntas(m){
    const n = PREGUNTAS_POR_RONDA;
    // Ronda guiada (Aprender por niveles o Repaso): sus calles, en su orden.
    const fijo = limiteRonda;
    const vias = fijo || datos.jugables.filter(enZona);
    const ordenarPorRepaso = (items, idDe, mm) => fijo ? items : ordenarPorRepasoBase(items, idDe, mm);
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
    if(m === 'barrios'){
      // Cada barrio, con un tipo de pregunta (y si son pocos, otra vuelta con
      // otro tipo); si la zona tiene varios distritos, también de qué
      // distrito es cada barrio y tocar unos distritos.
      const lista = barriosDelJuego();
      const ds = [...new Set(lista.map(b => b.distrito))];
      const tipos = ds.length > 1 ? ['toca', 'cual', 'distrito'] : ['toca', 'cual'];
      const orden = ordenarPorRepaso(lista, idBarrio, m), qs = [];
      const nDistritos = ds.length > 1 ? Math.min(3, ds.length) : 0;
      for(let vuelta = 0; vuelta < tipos.length && qs.length < n - nDistritos; vuelta++){
        orden.forEach((b, i) => { if(qs.length < n - nDistritos) qs.push(preguntaBarrio(b, tipos[(i + vuelta) % tipos.length])); });
      }
      ordenarPorRepaso(ds, idDistrito, m).slice(0, nDistritos).forEach(d => qs.push(preguntaDistrito(d)));
      return barajar(qs);
    }
    if(m === 'mapadistritos'){
      const pintar = colores('distritos');
      return barajar(datos.distritos.slice()).map(d => Object.assign(preguntaDistrito(d), { antes: pintar }));
    }
    if(m === 'mapabarrios'){
      const pintar = colores('barrios');
      return barajar(ordenarPorRepaso(barriosDelJuego(), idBarrio, m).slice(0, n)).map(b => Object.assign(preguntaBarrio(b, 'toca'), { antes: pintar }));
    }
    if(m === 'enbarrio'){
      // Calles de un barrio (o dos); en una zona de un solo barrio, las de su
      // distrito, para que no sea siempre el mismo.
      const nombres = new Set(barriosDelJuego().map(b => b.nombre));
      const vale = zona.startsWith('b:') ? (v => v.barrios.some(b => nombres.has(b.nombre))) : enZona;
      const pool = datos.jugables.filter(v => v.barrios.length && v.barrios.length <= 2 && vale(v));
      return sinRepetirNombre(ordenarPorRepaso(pool, v => v.id, m), n, preguntaEnBarrio);
    }
    if(m === 'lugares'){
      const lugares = datos.lugares.filter(enZonaLugar);
      return sinRepetirNombre(ordenarPorRepaso(lugares, l => -l.id, m), n, l => ({ lugar: l, id: -l.id, etiqueta: 'Localiza · ' + l.categoria, texto: l.nombre, nombre: l.nombre }));
    }
    if(m === 'parque'){
      const items = vias.filter(v => v.parque).map(v => ({ via: v, nombre: v.nombre, id: v.id, parque: v.parque }))
        .concat(fijo ? [] : datos.lugares.filter(l => l.parque && enZonaLugar(l)).map(l => ({ lugar: l, nombre: l.nombre, id: -l.id, parque: l.parque })));
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
    if(m === 'nombrar'){ desdeTemario = vistaActual === 'temario'; await empezarNombrar(); return; }
    const preguntas = crearPreguntas(m);
    rondaGuiada = limiteRonda ? guiaPendiente : null;
    limiteRonda = null;
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
  function respuestaDe(q){ return q.respuesta || MODOS[modo].respuesta; }
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
    // La nota de la calle: solo en las rondas (la pone cada pregunta).
    ['cjNotaBtn', 'cjEditarBtn', 'cjNota'].forEach(id => { if(el(id)) el(id).classList.add('hidden'); });
    infoActual = null;
    const libre = modo === 'estudio' || modo === 'seleccion';
    const respuesta = libre || MODOS[modo].respuesta === 'variable' ? null : MODOS[modo].respuesta;
    ponerRespuesta(respuesta, false);
    el('cjOpciones').innerHTML = '';
    const pantalla = document.getElementById('screen-callejero');
    pantalla.classList.toggle('cj-seleccionando', modo === 'seleccion');
    const nombrando = modo === 'nombrar';
    el('cjContador').classList.toggle('hidden', libre);
    el('cjAciertos').classList.toggle('hidden', libre || nombrando);
    el('cjBarraTitulo').classList.toggle('hidden', !libre && !nombrando);
    el('cjBarraTitulo').textContent = modo === 'seleccion' ? 'Elegir calles y lugares' : nombrando ? 'Nombra las calles' : verTemario ? verTemario.titulo : 'Modo estudio';
    el('cjPreguntaWrap').classList.toggle('hidden', libre || nombrando);
    el('cjNombrar').classList.toggle('hidden', !nombrando);
    pantalla.classList.toggle('cj-nombrando', nombrando);
    el('cjBuscarWrap').classList.toggle('hidden', !libre);
    el('cjSel').classList.toggle('hidden', modo !== 'seleccion');
    el('cjPista').textContent = modo === 'seleccion' ? 'Toca una calle o un punto morado para elegirlo o quitarlo'
      : verTemario ? verTemario.pista || 'Toca lo marcado en azul para ver qué es' : 'Toca una calle para ver cómo se llama';
    el('cjPista').classList.toggle('hidden', !libre);
    el('cjInfo').classList.add('hidden');
    el('cjResultado').className = 'cj-resultado hidden';
    el('cjSugerencias').classList.add('hidden');
    el('cjBuscar').value = '';
    el('cjLista').classList.add('hidden');
    // Lo resaltado del mapa libre, fuera (jugando sería dar la respuesta).
    el('cjChips').classList.add('hidden');
    if(capaProfesor){ capaProfesor.clearLayers(); capaLugares.clearLayers(); }
    ponerBotonLista();
  }
  // El botón de la lista (encima del mapa): lo marcado del temario, lo del
  // profesor, los lugares o las calles de la zona.
  function ponerBotonLista(){
    const boton = el('cjListaBoton');
    const n = (k, uno, varios) => k.toLocaleString('es-ES') + ' ' + (k === 1 ? uno : varios);
    let texto = '';
    if(modo === 'estudio' && verTemario) texto = (verTemario.lista || 'Lo marcado') + ' (' + verTemario.items.length + ')';
    else if(modo === 'estudio' && verEstudio === 'profesor' && delProfesor) texto = 'Lo del profesor (' + delProfesor.items.length + ')';
    else if(modo === 'estudio' && verEstudio === 'lugares') texto = n(datos.lugares.filter(enZonaLugar).length, 'lugar', 'lugares');
    else if(modo === 'estudio' && zona){
      const nc = new Set(datos.vias.filter(enZona).map(v => v.nombre)).size, nl = datos.lugares.filter(enZonaLugar).length;
      texto = tareaDeZona() || zona === 'p' ? n(nc, 'calle', 'calles') + ' y ' + n(nl, 'lugar', 'lugares') : n(nc, 'calle', 'calles');
    }
    boton.textContent = texto;
    boton.classList.toggle('hidden', !texto);
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
    const item = (x, i) => '<button type="button" class="cj-lista-item" onclick="CJ.elegirDeLista(' + i + ')">' + escapeHtml(x.nombre) +
      (x.cat ? ' <span class="cj-sug-cat">' + escapeHtml(x.cat) + '</span>' : '') + '</button>';
    if(verEstudio === 'profesor' && delProfesor){
      listaZona = delProfesor.items.map(it => ({ profe: it, nombre: it.nombre, cat: it.tipo }));
      const punto = i => coloresProfe ? '<i class="cj-punto-color" style="background:' + colorDeItem(i) + '"></i>' : '';
      caja.innerHTML = listaZona.map((x, i) => '<button type="button" class="cj-lista-item" onclick="CJ.elegirDeLista(' + i + ')">' + punto(i) + escapeHtml(x.nombre) +
        (x.cat ? ' <span class="cj-sug-cat">' + escapeHtml(x.cat) + '</span>' : '') + '</button>').join('');
      caja.scrollTop = 0;
      caja.classList.remove('hidden');
      return;
    }
    const lugares = t || zona === 'p' || verEstudio === 'lugares' ? datos.lugares.filter(enZonaLugar).sort(orden).map(l => ({ lugar: l, nombre: l.nombre, cat: l.categoria })) : [];
    listaZona = verEstudio === 'lugares' ? [] : datos.vias.filter(enZona).filter(v => !vistos.has(v.clave) && vistos.add(v.clave)).sort(orden).map(v => ({ via: v, nombre: v.nombre }));
    caja.innerHTML = listaZona.map(item).join('') +
      (lugares.length ? (listaZona.length ? '<div class="cj-lista-cab">Lugares</div>' : '') + lugares.map((x, i) => item(x, listaZona.length + i)).join('') : '');
    listaZona = listaZona.concat(lugares);
    caja.scrollTop = 0;
    caja.classList.remove('hidden');
  }
  function elegirDeLista(i){
    const x = listaZona[i];
    if(!x) return;
    el('cjLista').classList.add('hidden');
    if(x.temario !== undefined){ mostrarItemTemario(x.temario, true); return; }
    if(x.profe){ mostrarDelProfesor(x.profe); return; }
    x.via ? mostrarVia(x.via, true) : mostrarLugar(x.lugar, true);
  }
  // Una cosa de lo que ha mandado el profesor: su lugar o sus calles.
  function mostrarDelProfesor(it){
    if(it.lugar){ mostrarLugar(it.lugar, true); return; }
    if(!it.vias.length) return;
    mostrarVia(it.vias[0], false);
    it.vias.slice(1).forEach(v => resaltar(v, '#F2665C', true));
    mapa.flyToBounds(limitesDe(it.vias), { padding: [70, 70], maxZoom: 17, duration: 0.7 });
    if(normalizar(it.nombre) !== normalizar(it.vias[0].nombre)){
      el('cjInfo').insertAdjacentHTML('afterbegin', '<div class="cj-info-tipo">' + escapeHtml(it.tipo) + '</div><div class="cj-info-extra"><b>' + escapeHtml(it.nombre) + '</b></div>');
    }
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
    verEstudio = 'calles';
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
    // Lo del profesor en morado (lo del temario, con el temario descargado).
    if(tareasActivas().some(esTemario) && typeof CJT !== 'undefined' && !CJT.listo()){ try{ await CJT.cargar(); }catch(e){} }
    if(modo !== 'estudio' || verTemario) return;
    delProfesor = extra && extra.sinProfesor ? null : calcularDelProfesor();
    pintarProfesor();
    ponerChips();
    ponerBotonLista();
    planificarExtra();
    if(hayDelProfesor()){
      el('cjPista').innerHTML = coloresProfe ? '<i class="cj-pista-morado cj-pista-colores"></i>En colores, lo que te ha mandado tu profesor'
        : '<i class="cj-pista-morado"></i>En morado, lo que te ha mandado tu profesor';
      el('cjPista').classList.remove('hidden');
    }
  }
  // Todo lo del apartado en azul; lo elegido (lista o toque), en rojo con su ficha.
  // Los barrios de un elemento del visor: uno (temario) o varios (un distrito).
  function barriosItem(it){ return it.barrios || (it.barrio ? [it.barrio] : []); }
  // Los nombres sobre el mapa (distritos y barrios en «Aprender»). Con
  // muchos (los barrios), solo de cerca, para que no se pisen.
  let capaNombres = null, vigilandoNombres = false;
  function ponerNombres(){
    if(!capaNombres) return;
    const ver = modo === 'estudio' && verTemario && verTemario.nombres && mapa.getZoom() >= (verTemario.nombresDesde || 0);
    if(ver && !capaPuntos.hasLayer(capaNombres)) capaPuntos.addLayer(capaNombres);
    if(!ver && capaPuntos.hasLayer(capaNombres)) capaPuntos.removeLayer(capaNombres);
  }
  function pintarVerTemario(){
    capaZona.clearLayers();
    capaPuntos.clearLayers();
    contornoDistritos(verTemario.distritos);
    const pts = [];
    const azul = '#4E9BF7';
    if(!capaNombres) capaNombres = L.layerGroup();
    capaNombres.clearLayers();
    if(!vigilandoNombres){ vigilandoNombres = true; mapa.on('zoomend', ponerNombres); }
    verTemario.items.forEach(it => {
      const bs = barriosItem(it);
      bs.forEach(b => {
        L.polygon(b.anillos, it.color
          ? { color: it.distrito ? it.color : '#0b0b0b', weight: it.distrito ? 0 : 1, fillColor: it.color, fillOpacity: 0.4, interactive: false }
          : { color: azul, weight: 2, fillColor: azul, fillOpacity: 0.08, interactive: false }).addTo(capaZona);
        b.anillos.forEach(a => a.forEach(p => pts.push(p)));
      });
      if(it.distrito) L.polyline(contornoDistrito(it.distrito), { color: it.color || azul, weight: 2.5, opacity: 1, interactive: false }).addTo(capaZona);
      if(verTemario.nombres && bs.length) L.marker(puntoNombre(bs), {
        icon: L.divIcon({ className: 'cj-marcado-nombre' + (verTemario.nombresDesde ? ' cj-nombre-chico' : ''), html: '<span>' + escapeHtml(it.nombre) + '</span>', iconSize: null }),
        interactive: false, keyboard: false
      }).addTo(capaNombres);
      it.vias.concat((it.ruta || []).flatMap(p => p.vias)).forEach(v => {
        lineaAncha(v.lineas, { color: azul, weight: 6, metros: 10, opacity: 0.4 }).addTo(capaZona);
      });
      if(it.lugar) L.circleMarker([it.lugar.lat, it.lugar.lng], { radius: 7, color: '#fff', weight: 2, fillColor: azul, fillOpacity: 1, interactive: false }).addTo(capaPuntos);
      puntosItem(it).forEach(p => pts.push(p));
    });
    const foco = verTemario.foco >= 0 ? verTemario.items[verTemario.foco] : null;
    const ptsFoco = foco ? puntosItem(foco) : [];
    const b = L.latLngBounds(ptsFoco.length ? ptsFoco : pts.length ? pts : [CENTRO]);
    if(verTemario.centro && !ptsFoco.length) mapa.setView(CENTRO, verTemario.centro);
    else mapa.fitBounds(b, { paddingTopLeft: [30, 30], paddingBottomRight: [30, ptsFoco.length ? 150 : 30], maxZoom: 16 });
    ponerNombres();
  }
  function puntosItem(it){
    if(it.encuadre && it.encuadre.length) return it.encuadre;
    const pts = [];
    barriosItem(it).forEach(b => b.anillos.forEach(a => a.forEach(p => pts.push(p))));
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
    barriosItem(it).forEach(b => L.polygon(b.anillos, { color: rojo, weight: it.distrito ? 0 : 3, fillColor: rojo, fillOpacity: 0.25, interactive: false }).addTo(capaMarcas));
    if(it.distrito) L.polyline(contornoDistrito(it.distrito), { color: rojo, weight: 3, opacity: 1, interactive: false }).addTo(capaMarcas);
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
      (it.detalle || []).map(d => '<div class="cj-info-extra">' + escapeHtml(d) + '</div>').join('') +
      (it.lugar && it.lugar.id ? notaInfoHtml(claveLugar(it.lugar)) : it.vias.length ? notaInfoHtml(claveVia(it.vias[0])) : '');
    infoActual = () => mostrarItemTemario(i, false);
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
    return verTemario.items.findIndex(it => barriosItem(it).some(b => dentroDeBarrio(latlng.lat, latlng.lng, b)));
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
    if(verEstudio === 'lugares'){
      const l = lugarTocado(latlng);
      if(l) mostrarLugar(l, false);
      else{ capaMarcas.clearLayers(); pista('Toca justo encima de uno de los puntos'); }
      return;
    }
    if(verEstudio === 'profesor' && delProfesor){
      const x = tocadoDelProfesor(latlng);
      if(x && x.lugar){ mostrarLugar(x.lugar, false); return; }
      if(x && x.via){ mostrarVia(x.via, false); return; }
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
      lineaAncha(o.lineas, { color: '#F2665C', weight: principal ? 10 : 7, metros: 14, opacity: principal ? 0.3 : 0.18 }).addTo(capaMarcas);
      lineaAncha(o.lineas, { color: '#F2665C', weight: principal ? 4 : 3, metros: 6, opacity: principal ? 1 : 0.6 }).addTo(capaMarcas);
    });
    if(centrar) mapa.flyToBounds(limitesDe(iguales), { padding: [70, 70], maxZoom: 17, duration: 0.7 });
    const extra = v.jugable ? textoAciertosDe(v.id, ['nombre', 'localiza', 'cruces', 'parque']) : 'No entra en las preguntas del juego.';
    el('cjInfo').innerHTML =
      '<div class="cj-info-tipo">' + escapeHtml(tipoBonito(v.tipo)) + '</div>' +
      '<div class="cj-info-nombre">' + escapeHtml(v.nombre) + '</div>' +
      (cruce && cruce.length ? '<div class="cj-info-cruce">En el cruce con ' + cruce.map(escapeHtml).join(' y ') + '</div>' : '') +
      (iguales.length > 1 ? '<div class="cj-info-extra">Hay ' + iguales.length + ' vías con este nombre (todas marcadas en el mapa).</div>' : '') +
      (v.parque && datos.lineaParques ? '<div class="cj-info-extra">Acude el ' + escapeHtml(PARQUES[v.parque]) + '.</div>' : '') +
      '<div class="cj-info-extra">' + escapeHtml(extra) + '</div>' + notaInfoHtml(claveVia(v));
    infoActual = () => mostrarVia(v, false, cruce);
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
      '<div class="cj-info-extra">' + escapeHtml(textoAciertosDe(-l.id, ['lugares', 'parque'])) + '</div>' + notaInfoHtml(claveLugar(l));
    infoActual = () => mostrarLugar(l, false);
    el('cjInfo').classList.remove('hidden');
    el('cjPista').classList.add('hidden');
  }

  // Búsqueda de calles y lugares (modo estudio y modo selección).
  function buscar(texto){
    const q = normalizar(texto.trim());
    const caja = el('cjSugerencias');
    if(q.length < 2){ sugerencias = []; caja.classList.add('hidden'); return; }
    const eligiendo = modo === 'seleccion';
    const soloLugares = modo === 'estudio' && verEstudio === 'lugares';
    const vistos = new Set();
    const empiezan = [], contienen = [];
    if(!soloLugares) for(const v of datos.vias){
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
      lineaAncha(v.lineas, { color: '#F2665C', weight: 9, metros: 14, opacity: 0.3 }),
      lineaAncha(v.lineas, { color: '#F2665C', weight: 4, metros: 6, opacity: 1 })
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
    lineaAncha(v.lineas, { color, weight: fuerte ? 10 : 8, metros: 14, opacity: 0.3 }).addTo(capaMarcas);
    lineaAncha(v.lineas, { color, weight: fuerte ? 4.5 : 3.5, metros: 6, opacity: 1 }).addTo(capaMarcas);
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
    ronda.vista = false;
    capaMarcas.clearLayers();
    ponerBotonNota();
    tarjetaNota(false);
    el('cjResultado').className = 'cj-resultado hidden';
    pintarCabecera();
    const q = ronda.preguntas[ronda.i];
    // Opciones, botones de voz o plano
    const tipo = respuestaDe(q);
    if(MODOS[modo].respuesta === 'variable') ponerRespuesta(tipo, !!q.plano);
    // Preguntas del temario que no necesitan el mapa (datos, distritos,
    // carreteras…): sin mapa, solo la pregunta y sus opciones.
    const sinMapa = modo === 'temario' && tipo === 'opciones' && !q.antes && !q.plano;
    document.getElementById('screen-callejero').classList.toggle('cj-sin-mapa', sinMapa);
    if(sinMapa && cabezaPlegada) plegarCabeza(false);
    const caja = el('cjOpciones');
    if(tipo === 'opciones'){
      caja.innerHTML = q.opciones.map((o, i) => '<button type="button" class="cj-opcion" onclick="CJ.responderOpcion(' + i + ')">' + escapeHtml(o) + '</button>').join('');
      caja.classList.toggle('cj-opciones-dos', q.opciones.length === 2);
    }
    if(tipo === 'voz') prepararVoz();
    if(q.plano) CJT.pintarPlano(q);
    if(sinMapa) return;
    mapa.invalidateSize();
    // Lo que se ve en el mapa antes de responder
    if(q.antes) q.antes(mapaApi());
    else if(modo === 'temario'){
      if(!q.plano) irAEncuadre();
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
    anotarIntento(q.id, modoIntento || MODOS[modo].registra || modo, acierto, distancia);
    el('cjResultado').className = 'cj-resultado ' + (acierto ? 'ok' : 'ko');
    el('cjResultadoTexto').innerHTML = textoHtml;
    el('cjAciertos').textContent = textoAciertos();
    el('cjSiguiente').textContent = ronda.i + 1 >= ronda.preguntas.length ? 'Ver resultado' : 'Siguiente';
    tarjetaNota(true);
  }

  // Preguntas en las que se toca el mapa: una vía (localiza), un lugar
  // (lugares) y, en el temario, también unas vías concretas o un barrio.
  function responder(latlng){
    if(!ronda || ronda.respondida) return;
    const q = ronda.preguntas[ronda.i];
    if(respuestaDe(q) !== 'toque') return;
    const pxEnMetros = mapa.distance(mapa.containerPointToLatLng([0, 0]), mapa.containerPointToLatLng([TOLERANCIA_PX, 0]));
    const detalle = q.detalle ? ' <span class="cj-dir">' + escapeHtml(q.detalle) + '</span>' : '';
    if(q.barrio || q.barrios){
      // Un barrio o un distrito (sus barrios): vale tocar dentro o muy cerca del borde.
      const bs = q.barrios || [q.barrio];
      const dist = bs.some(b => dentroDeBarrio(latlng.lat, latlng.lng, b)) ? 0
        : Math.min(...bs.map(b => distanciaAVia(latlng.lat, latlng.lng, { lineas: b.anillos })));
      const acierto = dist <= Math.max(TOLERANCIA_M, pxEnMetros);
      bs.forEach(b => L.polygon(b.anillos, { color: '#34D399', weight: q.distrito ? 0 : 3, fillColor: '#34D399', fillOpacity: 0.2, interactive: false }).addTo(capaMarcas));
      if(q.distrito) L.polyline(contornoDistrito(q.distrito), { color: '#34D399', weight: 3, opacity: 0.95, interactive: false }).addTo(capaMarcas);
      L.circleMarker(latlng, { radius: 7, color: '#fff', weight: 2, fillColor: acierto ? '#34D399' : '#F2665C', fillOpacity: 1, interactive: false }).addTo(capaMarcas);
      if(!acierto) mapa.flyToBounds(cajaBarrios(bs).extend(latlng), { paddingTopLeft: [60, 60], paddingBottomRight: [60, 130], maxZoom: 16, duration: 0.7 });
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
    if(modo === 'temario' || q.despues){
      if(q.plano) CJT.marcarPlano(q, null);
      if(q.despues && !sinMapaAhora()) q.despues(mapaApi(), i);
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

  /* ---------- modo «Nombra las calles» ---------- */
  // De una zona (un barrio, un distrito…) se escriben o se dicen (con el
  // micrófono, si el navegador sabe) nombres de calles, y cada una que está
  // se pone en verde. Vale sin «Calle», sin tildes y con alguna letra mal; y
  // una parte («Pío Baroja») si ninguna otra calle de la zona la tiene. Al
  // terminar, las que faltan salen en rojo y cuentan como no sabidas, en su
  // propia habilidad («De memoria», que no llena «Lo que más fallas»).
  const PALABRAS_TIPO = new Set(['calle', 'c', 'avenida', 'av', 'avda', 'plaza', 'pza', 'paseo', 'ronda', 'glorieta', 'carretera', 'ctra',
    'camino', 'pasaje', 'callejon', 'cuesta', 'travesia', 'barriada', 'urbanizacion', 'puente', 'autovia', 'bulevar', 'via', 'rotonda',
    'costanilla', 'plazuela', 'compas', 'senda', 'vereda', 'canada', 'ribera', 'campo', 'patio', 'calleja', 'poligono', 'parque',
    'jardines', 'jardin', 'enlace', 'acceso', 'carril', 'arroyo', 'pago', 'parcelacion', 'barrio']);
  const PALABRAS_VACIAS = new Set(['de', 'del', 'la', 'las', 'los', 'el', 'y', 'e']);
  let nombrar = null;   // { grupos: [{ nombre, nucleo, tipo, vias, hallado }], hallados, terminado, escucha }
  function palabras(t){ return normalizar(t).replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(w => w && !PALABRAS_VACIAS.has(w)); }
  function nucleoDe(nombre, tipo){
    const w = palabras(nombre);
    if(w.length > 1 && (w[0] === normalizar(tipo || '') || PALABRAS_TIPO.has(w[0]))) w.shift();
    return w.join(' ');
  }
  function levenshtein(a, b){
    let fila = Array.from({ length: b.length + 1 }, (_, j) => j);
    for(let i = 1; i <= a.length; i++){
      const nueva = [i];
      for(let j = 1; j <= b.length; j++) nueva[j] = Math.min(fila[j] + 1, nueva[j - 1] + 1, fila[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      fila = nueva;
    }
    return fila[b.length];
  }
  function casiIgual(a, b){
    const n = Math.max(a.length, b.length), max = n >= 12 ? 2 : n >= 6 ? 1 : 0;
    return max > 0 && Math.abs(a.length - b.length) <= max && levenshtein(a, b) <= max;
  }
  // Las calles de la zona que corresponden a lo dicho (vacío si ninguna).
  function callesDichas(texto){
    const w = palabras(texto);
    if(!w.length) return [];
    const conTipo = PALABRAS_TIPO.has(w[0]) && w.length > 1;
    const formas = [...new Set([conTipo ? w.slice(1).join(' ') : null, w.join(' ')].filter(Boolean))];
    const g = nombrar.grupos;
    let r = g.filter(x => formas.includes(x.nucleo));
    // Si hay varias con ese nombre («Calle San Agustín», «Plaza San Agustín»),
    // la del tipo dicho y, si no se ha dicho, la calle.
    if(r.length > 1){
      const tipo = conTipo ? w[0] : 'calle';
      const mismo = r.filter(x => normalizar(x.tipo) === tipo);
      if(mismo.length) r = mismo;
    }
    if(!r.length) r = g.filter(x => formas.some(f => casiIgual(f, x.nucleo)));
    if(!r.length && formas[0].length >= 6){
      const parte = ' ' + formas[0] + ' ';
      const con = g.filter(x => (' ' + x.nucleo + ' ').includes(parte));
      if(new Set(con.map(x => x.nucleo)).size === 1) r = con;
    }
    return r;
  }
  async function empezarNombrar(){
    pararEscucha();
    const grupos = new Map();
    datos.vias.filter(enZona).forEach(v => {
      if(!grupos.has(v.clave)) grupos.set(v.clave, { nombre: v.nombre, tipo: v.tipo, nucleo: nucleoDe(v.nombre, v.tipo), vias: [], hallado: false });
      grupos.get(v.clave).vias.push(v);
    });
    if(!grupos.size){ uiToast('No hay calles en esta zona.', 'info'); return; }
    const t = tareaDeZona();
    nombrar = { grupos: [...grupos.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')), hallados: 0, terminado: false, escucha: null };
    ronda = { id: nuevoUid(), preguntas: new Array(nombrar.grupos.length), i: 0, aciertos: 0, respondidas: 0, fallos: [], respondida: false, zona, tareaId: t ? t.id : null };
    modo = 'nombrar';
    mostrarVista('juego');
    ponerInterfaz();
    crearMapa();
    capaMarcas.clearLayers();
    pintarZona();
    irAZona(false);
    el('cjNombrarZona').innerHTML = opcionesZona(zona && !zona.startsWith('t:') && zona !== 'p' ? zona : '');
    el('cjNombrarZona').classList.toggle('hidden', zona.startsWith('t:') || zona === 'p');
    el('cjNombrarVoz').classList.toggle('hidden', !(window.SpeechRecognition || window.webkitSpeechRecognition));
    el('cjNombrarTexto').value = '';
    el('cjNombrarTexto').disabled = false;
    el('cjNombrarFin').textContent = 'Terminar';
    avisoNombrar('Escribe o di nombres de calles de ' + (zona ? nombreZona() : 'Córdoba') + '.', '');
    contarNombrar();
  }
  function contarNombrar(){
    el('cjContador').textContent = nombrar.hallados + ' / ' + nombrar.grupos.length;
  }
  function avisoNombrar(texto, clase){
    const a = el('cjNombrarAviso');
    a.textContent = texto;
    a.className = 'cj-nombrar-aviso' + (clase ? ' ' + clase : '');
  }
  // Lo escrito o lo oído (el micrófono da varias versiones: vale la primera
  // que coincida; y si en una frase van varias calles, se prueba por trozos).
  function decirCalle(dicho){
    if(!nombrar || nombrar.terminado) return;
    const versiones = (Array.isArray(dicho) ? dicho : [dicho]).map(x => String(x || '').trim()).filter(Boolean);
    if(!versiones.length) return;
    let r = [];
    for(const v of versiones){ r = callesDichas(v); if(r.length) break; }
    if(!r.length){
      for(const v of versiones){
        const trozos = v.split(/,| y | e /i).map(x => x.trim()).filter(x => x.length > 2);
        if(trozos.length > 1){ r = [...new Set(trozos.flatMap(callesDichas))]; if(r.length) break; }
      }
    }
    if(!r.length){ avisoNombrar('«' + versiones[0] + '»: no hay ninguna calle así aquí.', 'ko'); return; }
    const nuevas = r.filter(x => !x.hallado);
    if(!nuevas.length){ avisoNombrar('Ya la tenías: ' + r.map(x => x.nombre).join(', ') + '.', ''); return; }
    nuevas.forEach(x => {
      x.hallado = true;
      nombrar.hallados++;
      ronda.respondidas++;
      ronda.aciertos++;
      anotarIntento(x.vias[0].id, 'nombrar', true, null);
      x.vias.forEach(v => resaltar(v, '#34D399'));
    });
    avisoNombrar('✓ ' + nuevas.map(x => x.nombre).join(', '), 'ok');
    contarNombrar();
    if(nombrar.hallados === nombrar.grupos.length) terminarNombrar(true);
  }
  // Terminar: las que faltan, en rojo (y cuentan como no sabidas).
  function terminarNombrar(todas){
    if(!nombrar) return;
    if(nombrar.terminado){ empezarNombrar(); return; }   // «Otra vez»
    pararEscucha();
    nombrar.terminado = true;
    const faltan = nombrar.grupos.filter(x => !x.hallado);
    faltan.forEach(x => {
      ronda.respondidas++;
      anotarIntento(x.vias[0].id, 'nombrar', false, null);
      x.vias.forEach(v => resaltar(v, '#F2665C'));
    });
    el('cjNombrarTexto').disabled = true;
    el('cjNombrarFin').textContent = 'Otra vez';
    avisoNombrar(todas ? '¡Todas! ' + nombrar.grupos.length + ' de ' + nombrar.grupos.length + '.'
      : 'Has dicho ' + nombrar.hallados + ' de ' + nombrar.grupos.length + '. En rojo, las que faltaban: toca una para ver cómo se llama.', todas ? 'ok' : '');
    guardarRondaLocal();
  }
  // Ya terminado, tocar una calle (de las de la zona) dice cuál es.
  function tocarNombrar(latlng){
    if(!nombrar || !nombrar.terminado) return;
    const cerca = viasCercanas(latlng).filter(c => enZona(c.v));
    if(!cerca.length) return;
    const v = cerca[0].v, x = nombrar.grupos.find(g => g.vias.includes(v));
    el('cjInfo').innerHTML = '<div class="cj-info-tipo">' + escapeHtml(x && x.hallado ? 'La has dicho' : 'Te faltaba') + '</div>' +
      '<div class="cj-info-nombre">' + escapeHtml(v.nombre) + '</div>';
    el('cjInfo').classList.remove('hidden');
  }
  function cambiarZonaNombrar(z){
    if(!zonaValida(z) && z !== '') return;
    guardarZona(z);
    actualizarFiltro();
    empezarNombrar();
  }
  // El micrófono: reconocimiento de voz del navegador, en español, seguido
  // (se vuelve a encender solo si el navegador lo corta por silencio).
  function alternarEscucha(){
    if(!nombrar || nombrar.terminado) return;
    if(nombrar.escucha){ pararEscucha(); return; }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if(!SR) return;
    const r = new SR();
    r.lang = 'es-ES';
    r.continuous = true;
    r.interimResults = false;
    r.maxAlternatives = 3;
    r.onresult = e => {
      for(let i = e.resultIndex; i < e.results.length; i++){
        if(e.results[i].isFinal) decirCalle([...e.results[i]].map(a => a.transcript));
      }
    };
    r.onerror = e => {
      if(e.error === 'not-allowed' || e.error === 'service-not-allowed'){
        pararEscucha();
        avisoNombrar('No se puede usar el micrófono: dale permiso en el navegador, o escríbelas.', 'ko');
      }
    };
    r.onend = () => { if(nombrar && nombrar.escucha === r){ try{ r.start(); }catch(err){ pararEscucha(); } } };
    nombrar.escucha = r;
    try{ r.start(); }catch(e){ nombrar.escucha = null; return; }
    el('cjNombrarVoz').classList.add('activo');
    el('cjNombrarVoz').setAttribute('aria-pressed', 'true');
    avisoNombrar('Te escucho: di nombres de calles.', '');
  }
  function pararEscucha(){
    if(!nombrar || !nombrar.escucha) return;
    const r = nombrar.escucha;
    nombrar.escucha = null;
    try{ r.stop(); }catch(e){}
    el('cjNombrarVoz').classList.remove('activo');
    el('cjNombrarVoz').setAttribute('aria-pressed', 'false');
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
    // Ya se ve el nombre: también la nota.
    ronda.vista = true;
    tarjetaNota(true);
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
          '<button type="button" class="btn btn-primary btn-light" onclick="' + (m === 'temario' ? 'CJ.otraRonda()' : rondaGuiada ? 'CJ.seguirGuiada()' : 'CJ.empezar(\'' + m + '\')') + '">' +
            (rondaGuiada && rondaGuiada.tipo !== 'nivel' ? 'Seguir repasando' : rondaGuiada ? 'Seguir aprendiendo' : 'Otra ronda') + '</button>' +
          '<button type="button" class="btn btn-ghost" onclick="CJ.salir()">Volver</button>' +
        '</div>' +
      '</div>';
    ronda = null;
    modo = null;
    mostrarVista('fin');
    refrescarTrasRonda();
  }

  function salir(){
    pararEscucha();
    if(ronda && modo !== 'estudio' && !(modo === 'nombrar' && nombrar && nombrar.terminado)) guardarRondaLocal();
    if(ronda && modo !== 'estudio') refrescarTrasRonda();
    nombrar = null;
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
    if(modo !== 'estudio' && modo !== 'nombrar' && ronda && ronda.i > 0 && !(await uiConfirm('¿Salir de la ronda? Lo que ya has respondido queda guardado.'))) return;
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
    // pantalla completa y sus recuadros; colores de lo del profesor
    pantallaCompleta, plegarCabeza, alternarColores,
    // «Nombra las calles»
    decirCalle, terminarNombrar: () => terminarNombrar(false), alternarEscucha, cambiarZonaNombrar,
    // tareas, rondas y avisos
    alternarRondas, cambiarVistaProfesor, comprobarAvisos, reiniciar, recargarTareas, volver,
    // pestañas de la pantalla principal
    cambiarPestana, abrirCalles, cerrarCalles, irA, ver, repasarTodo, ventana, editarNota, verNota, repasarCalles, aprender, repasar, seguirGuiada, empezarEn, estudioEn, mosaicoModos, cambiarVerEstudio,
    // modo selección
    seleccionar, alternarElegida, anadirZona, irAElegida, quitarTodas, terminarSeleccion,
    // lo que usa el profesor (js/callejero-profesor.js)
    cargarDatos, datos: () => datos, MODOS, HABILIDAD, mostrarVista, opcionesZona, nombreZonaDe, filtroDe,
    progresoDesdeFilas, tarjetaProgreso, detalleProgreso, rondasHtml, estadoDe, claveP, prepararTareas, describirTarea, textoRondas, tareaHecha, fechaCorta,
    tieneCalles, filtroZona,
    // temario (js/callejero-temario.js)
    empezarTemario, otraRonda, responderPlano, PREGUNTAS_POR_RONDA, esTemario,
    ordenarPorRepaso: ordenarPorRepasoBase,
    progreso: () => progreso, tareas: () => tareasActivas(), repintar: () => { if(vistaActual === 'inicio') pintarInicio(); } };
})();
