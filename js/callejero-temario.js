/* ============================================================
   CALLEJERO · Temario de la academia
   La documentación de callejero de la academia (ficha General y una
   ficha por distrito) pasada a datos: datos/callejero-temario.json. Cada
   elemento (un colegio, una plaza, un recorrido, un dato, una puerta de
   la Mezquita...) tiene un id fijo (desde 5 000 000 000 000) y, si se ha
   podido, sus vías (v), su lugar (l) o su barrio (b) del mapa.
   El archivo se descarga solo al abrir el callejero (lleva ?v= con su
   huella, que pone scripts/versionar.mjs).

   Cada ficha tiene sus apartados, y de cada apartado se puede:
     - Ver: la lista, y «En el mapa» (modo estudio con lo del apartado
       marcado: calles, lugares, barrios y recorridos numerados).
     - Preguntar: rondas del modo «temario» (hasta 20 preguntas, primero
       lo fallado). Según lo que sea, se pregunta tocando el mapa, eligiendo
       entre opciones o tocando un plano (Mezquita, Alcázar, Feria: planos
       dibujados aquí, esquemáticos).
   El progreso es por elemento (habilidad «temario», misma regla de
   dominada que el resto). El profesor puede mandar fichas o apartados
   (tareas con «fichas»): al alumno le salen como «Estúdiate esto».
   ============================================================ */
const CJT = (function(){
  const ARCHIVO = 'datos/callejero-temario.json?v=3e4f4a980f';
  const PARQUE_NOMBRE = { central: 'Parque Central', granadal: 'Parque del Granadal' };
  // Los dos parques de bomberos en los lugares del mapa (salida de los recorridos).
  const PARQUE_LUGAR = { central: 11215900007629, granadal: 11215900007679 };
  const AZUL = '#4E9BF7', VERDE = '#34D399', ROJO = '#F2665C', NARANJA = '#F59E0B';

  let T = null, cargando = null;
  // Lo que se ve en la pantalla del temario: una ficha o una tarea.
  let vista = null;          // { claves: ['centro'] o ['general/puentes', ...], titulo, tarea }
  const abiertas = new Set();   // apartados con la lista desplegada ('ficha/apartado')
  let planoVer = {};         // plano en la lista: { [id]: k resaltado }

  /* ---------- datos ---------- */
  function cargar(){
    if(T) return Promise.resolve(T);
    if(cargando) return cargando;
    cargando = fetch(ARCHIVO)
      .then(r => { if(!r.ok) throw new Error('No se pudo descargar el temario (' + r.status + ')'); return r.json(); })
      .then(doc => { T = indexar(doc); return T; })
      .finally(() => { cargando = null; });
    return cargando;
  }
  function indexar(doc){
    const porId = new Map(), fichaPorId = new Map();
    doc.fichas.forEach(f => {
      fichaPorId.set(f.id, f);
      f.secciones.forEach(s => {
        s._f = f;
        s.items.forEach((x, i) => { x._s = s; x._f = f; x._i = i; porId.set(x.id, x); });
      });
    });
    const distritos = new Set(doc.fichas.filter(f => f.grupo === 'distrito').map(f => f.titulo));
    doc.fichas.forEach(f => f.secciones.forEach(s => s.items.forEach(x => { if(x.distrito) distritos.add(x.distrito); })));
    return Object.assign(doc, { porId, fichaPorId, distritos: [...distritos] });
  }
  function listo(){ return !!T; }
  function normalizar(t){ return String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim(); }
  function barajar(a){ return shuffleArray(a.slice()); }
  function unicos(lista){
    const vistos = new Set();
    return lista.filter(t => t && !vistos.has(normalizar(t)) && vistos.add(normalizar(t)));
  }
  function mayuscula(t){ return t ? t.charAt(0).toUpperCase() + t.slice(1) : t; }

  // Claves de ámbito: 'centro' (ficha entera) o 'centro/plazas' (un apartado).
  function seccionesDe(claves){
    const out = [];
    T.fichas.forEach(f => f.secciones.forEach(s => {
      if(claves.includes(f.id) || claves.includes(f.id + '/' + s.id)) out.push(s);
    }));
    return out;
  }
  function itemsDe(claves){ return seccionesDe(claves).flatMap(s => s.items); }
  function claveDe(s){ return s._f.id + '/' + s.id; }
  function nombreClave(k){
    const [fid, sid] = String(k).split('/');
    const f = T && T.fichaPorId.get(fid);
    if(!f) return k;
    const s = sid ? f.secciones.find(x => x.id === sid) : null;
    return s ? f.titulo + ' · ' + s.titulo : 'Ficha ' + f.titulo;
  }
  function nombreAmbito(k){ return 'Temario · ' + (T ? nombreClave(k) : k); }
  // «Ficha Centro, General (Carreteras, Puentes, islas y molinos)»
  function describirFichas(claves){
    if(!T) return claves.length + (claves.length === 1 ? ' ficha del temario' : ' fichas del temario');
    const partes = [];
    T.fichas.forEach(f => {
      if(claves.includes(f.id)){ partes.push('Ficha ' + f.titulo); return; }
      const ss = f.secciones.filter(s => claves.includes(f.id + '/' + s.id));
      if(ss.length) partes.push(f.titulo + ' (' + ss.map(s => s.titulo).join(', ') + ')');
    });
    return partes.join(' · ') || 'Temario';
  }
  function nombreItem(id){
    const x = T && T.porId.get(Number(id));
    return x ? { nombre: textoItem(x), donde: x._f.titulo + ' · ' + x._s.titulo } : null;
  }
  // Apartado de un elemento ('centro/plazas'), para mandarlo como tarea.
  function claveDeItem(id){
    const x = T && T.porId.get(Number(id));
    return x ? claveDe(x._s) : null;
  }
  function textoItem(x){
    if(x._s.tipo === 'otro_nombre') return '«' + x.n + '» (' + x.real + ')';
    if(x._s.tipo === 'datos') return x.n;
    return x.n;
  }

  /* ---------- progreso ---------- */
  function estado(prog, x){ return CJ.estadoDe(prog.get(CJ.claveP('temario', x.id))); }
  function cuenta(prog, items){
    const r = { total: 0, dominada: 0, progreso: 0, fallada: 0, nueva: 0 };
    items.forEach(x => { if(preguntable(x)){ r.total++; r[estado(prog, x)]++; } });
    return r;
  }
  function barra(r){
    const ancho = n => (r.total ? n * 100 / r.total : 0).toFixed(2) + '%';
    return '<div class="cj-bar cj-bar-multi">' +
      '<div class="cj-bar-seg dominada" style="width:' + ancho(r.dominada) + '"></div>' +
      '<div class="cj-bar-seg progreso" style="width:' + ancho(r.progreso) + '"></div>' +
      '<div class="cj-bar-seg fallada" style="width:' + ancho(r.fallada) + '"></div></div>';
  }
  function pct(r){ return r.total ? Math.round(r.dominada * 100 / r.total) : 0; }

  /* ---------- geometría (del mapa del callejero) ---------- */
  function geoDe(x){
    const d = CJ.datos();
    if(!d) return null;
    const vias = (x.v || []).map(id => d.viaPorId.get(id)).filter(Boolean);
    const lugar = x.l ? d.lugarPorId.get(x.l) || null : null;
    const barrio = x.b ? d.barrios.find(b => b.nombre === x.b) || null : null;
    if(!vias.length && !lugar && !barrio) return null;
    return { vias, lugar, barrio };
  }
  function tieneGeo(x){ return !!((x.v && x.v.length) || x.l || x.b); }
  // Punto de referencia de un elemento (para buscar los cercanos).
  function centroDe(x){
    if(x._c !== undefined) return x._c;
    const g = geoDe(x);
    let c = null;
    if(g && g.lugar) c = [g.lugar.lat, g.lugar.lng];
    else if(g && g.vias.length){ const k = g.vias[0].caja; c = [(k.s + k.n) / 2, (k.o + k.e) / 2]; }
    else if(g && g.barrio){ const pts = g.barrio.anillos.flat(); c = [pts.reduce((a, p) => a + p[0], 0) / pts.length, pts.reduce((a, p) => a + p[1], 0) / pts.length]; }
    if(CJ.datos()) x._c = c;
    return c;
  }
  function distancia(a, b){ return Math.hypot(a[0] - b[0], (a[1] - b[1]) * 0.79); }
  // Elementos del mismo tipo de apartado (en todas las fichas), del más cercano al más lejano.
  function vecinos(x, n){
    const c = centroDe(x);
    if(!c) return [];
    return T.fichas.flatMap(f => f.secciones.filter(s => s.id === x._s.id).flatMap(s => s.items))
      .filter(y => y !== x && normalizar(y.n) !== normalizar(x.n))
      .map(y => ({ y, c: centroDe(y) })).filter(o => o.c)
      .sort((a, b) => distancia(a.c, c) - distancia(b.c, c)).slice(0, n).map(o => o.y);
  }
  function limitesItems(items){
    const pts = [];
    items.forEach(x => {
      const g = geoDe(x);
      if(x.pv) pasosRuta(x).encuadre.forEach(p => pts.push(p));
      if(!g) return;
      // Un lugar cuenta por su punto (no por toda la avenida de su dirección).
      if(g.lugar) pts.push([g.lugar.lat, g.lugar.lng]);
      else if(g.barrio) g.barrio.anillos.forEach(a => a.forEach(p => pts.push(p)));
      else g.vias.forEach(v => { pts.push([v.caja.s, v.caja.o], [v.caja.n, v.caja.e]); });
    });
    return pts.length ? pts : null;
  }

  /* ---------- dibujo en el mapa ---------- */
  function puntoDeVia(v){
    const l = v.lineas.reduce((a, b) => (b.length > a.length ? b : a), v.lineas[0]);
    return l[Math.floor(l.length / 2)];
  }
  function dibujarGeo(api, g, color, fuerte){
    if(!g) return;
    const L = window.L;
    if(g.barrio) L.polygon(g.barrio.anillos, { color, weight: 3, fillColor: color, fillOpacity: fuerte ? 0.22 : 0.12, interactive: false }).addTo(api.capa);
    g.vias.forEach(v => api.resaltar(v, color, fuerte));
    if(g.lugar){
      if(g.lugar.radio > 20) L.circle([g.lugar.lat, g.lugar.lng], { radius: g.lugar.radio, color, weight: 3, fillColor: color, fillOpacity: 0.15, interactive: false }).addTo(api.capa);
      L.circleMarker([g.lugar.lat, g.lugar.lng], { radius: 9, color: '#fff', weight: 2, fillColor: color, fillOpacity: 1, interactive: false }).addTo(api.capa);
    }
  }
  function puntosGeo(g){
    const pts = [];
    if(!g) return pts;
    if(g.lugar) pts.push([g.lugar.lat, g.lugar.lng]);
    g.vias.forEach(v => pts.push([v.caja.s, v.caja.o], [v.caja.n, v.caja.e]));
    if(g.barrio) g.barrio.anillos.forEach(a => a.forEach(p => pts.push(p)));
    return pts;
  }
  function encuadrar(api, pts){
    if(!pts.length) return;
    api.mapa.flyToBounds(window.L.latLngBounds(pts), { paddingTopLeft: [50, 50], paddingBottomRight: [50, 130], maxZoom: 17, duration: 0.6 });
  }
  // Recorrido: cada paso con sus vías y por dónde se entra en él (el punto
  // de sus vías más cercano al paso anterior o, el primero, a la salida del
  // parque). Ahí va su número. Así una carretera larga (la N-IV) no descoloca
  // el número ni el encuadre.
  function viasDePaso(ids){ const d = CJ.datos(); return (ids || []).map(id => d.viaPorId.get(id)).filter(Boolean); }
  function muestras(vias){
    const pts = vias.flatMap(v => v.lineas.flat());
    const paso = Math.max(1, Math.ceil(pts.length / 300));
    return pts.filter((p, i) => i % paso === 0 || i === pts.length - 1);
  }
  function salidaDe(x){ return x.parque && CJ.datos() ? CJ.datos().lugarPorId.get(PARQUE_LUGAR[x.parque]) || null : null; }
  function pasosRuta(x){
    if(x._ruta) return x._ruta;
    const nombres = x.pasos || x.recorrido || [];
    const salida = salidaDe(x);
    let antes = salida ? [[salida.lat, salida.lng]] : null;
    const ruta = (x.pv || []).map((ids, k) => {
      const vias = viasDePaso(ids), pts = muestras(vias);
      let en = null;
      if(pts.length && antes){
        let dm = Infinity;
        pts.forEach(p => antes.forEach(q => { const d = distancia(p, q); if(d < dm){ dm = d; en = p; } }));
      }else if(pts.length) en = vias.length ? puntoDeVia(vias[0]) : pts[0];
      if(pts.length) antes = pts;
      return { n: nombres[k], vias, en };
    });
    // Encuadre: la salida, cada entrada y, si es corto, el último paso entero (el destino).
    const encuadre = ruta.filter(p => p.en).map(p => p.en);
    if(salida) encuadre.push([salida.lat, salida.lng]);
    const ultimo = ruta.length ? ruta[ruta.length - 1].vias : [];
    if(ultimo.length && ultimo.every(v => Math.hypot(v.caja.n - v.caja.s, (v.caja.e - v.caja.o) * 0.79) < 0.02)) muestras(ultimo).forEach(p => encuadre.push(p));
    x._ruta = Object.assign(ruta, { encuadre });
    return x._ruta;
  }
  // Dibuja los `hasta` primeros pasos con su número; devuelve los puntos para encuadrar.
  function dibujarRecorrido(api, x, hasta, color){
    const L = window.L;
    const ruta = pasosRuta(x);
    const pts = [];
    const salida = salidaDe(x);
    if(salida){
      L.circleMarker([salida.lat, salida.lng], { radius: 10, color: '#fff', weight: 2, fillColor: NARANJA, fillOpacity: 1, interactive: false }).addTo(api.capa);
      pts.push([salida.lat, salida.lng]);
    }
    ruta.slice(0, hasta).forEach((p, k) => {
      p.vias.forEach(v => api.resaltar(v, color, false));
      if(p.en){ numero(api, p.en, k + 1, color); pts.push(p.en); }
    });
    return pts;
  }
  function numero(api, p, n, color){
    const L = window.L;
    L.marker(p, { interactive: false, icon: L.divIcon({ className: 'cjt-num', html: '<span style="background:' + color + '">' + n + '</span>', iconSize: [24, 24], iconAnchor: [12, 12] }) }).addTo(api.capa);
  }

  /* ---------- preguntas ---------- */
  // Tipos de pregunta que admite cada elemento (según su apartado y sus datos).
  function generadores(x){
    const s = x._s, g = [];
    const geo = tieneGeo(x);
    switch(s.tipo){
      case 'datos': if(x.r && x.falsas && x.falsas.length) g.push(qDato); break;
      case 'linea': g.push(qLineaSiguiente); if(geo) g.push(qTocar); break;
      case 'distritos': g.push(qDistritoDeBarrio); if(x.b) g.push(qTocar); break;
      case 'carreteras': g.push(qCarreteraCodigo, qCarreteraQueEs); if(geo) g.push(qTocar); break;
      case 'salidas': g.push(qSalidaDestino, qSalidaNumero); break;
      case 'urbanizaciones': g.push(qUrbanizacion); break;
      case 'poligonos':
        g.push(qPoligonoDistrito, qParque, qPoligonoAcceso);
        if(x.industrias && x.industrias.length) g.push(qPoligonoIndustria);
        if(x.recorrido && x.recorrido.length > 1) g.push(qRecorridoPaso);
        if(geo) g.push(qTocar);
        break;
      case 'lugares': if(x.dir) g.push(qCalleDe); if(geo) g.push(qTocar); break;
      case 'puentes':
        if(x.entre) g.push(qEntrePuentes);
        else{
          if(x.largo) g.push(qPuenteLargo);
          if(x.uso) g.push(qPuenteUso);
          if(x.desde) g.push(qPuenteUne);
          if(ordenPuente(x) > 0) g.push(qPuenteSiguiente);
          if(geo) g.push(qTocar);
        }
        break;
      case 'aguas': g.push(qDistrito, qAguaZona); break;
      case 'inundables': g.push(qInundableDonde, qDistrito); break;
      case 'otro_nombre': g.push(qNombreReal, qNombreColoquial); if(geo) g.push(qTocar); break;
      case 'plano': g.push(qPlanoTocar, qPlanoQueEs); break;
      case 'barrios': if(x.b) g.push(qTocar, qMarcado); else g.push(qBarrioDistrito); break;
      case 'recorridos': g.push(qParque); if(x.pasos && x.pasos.length > 1) g.push(qRecorridoPaso); break;
      case 'plazas': case 'jardines': if(geo) g.push(qTocar, qMarcado); if(x.barrio) g.push(qBarrioDe); break;
    }
    return g;
  }
  function preguntable(x){ return generadores(x).length > 0; }

  function base(x, etiqueta, texto, extra){
    return Object.assign({ id: x.id, item: x, nombre: textoItem(x), etiqueta, texto }, extra);
  }
  // Pregunta de opciones: la correcta y hasta 3 falsas (en el orden de preferencia en que llegan).
  function opciones(x, etiqueta, texto, correcta, falsas, extra, minimo){
    const k = normalizar(correcta);
    const otras = unicos(falsas).filter(f => normalizar(f) !== k).slice(0, 3);
    if(!correcta || otras.length < (minimo || 3)) return null;
    const lista = barajar([correcta].concat(otras));
    return base(x, etiqueta, texto, Object.assign({ respuesta: 'opciones', opciones: lista, correcta: lista.indexOf(correcta), resumen: correcta + '.' }, extra));
  }
  // Después de responder, se ve en el mapa (si está en él).
  function verDespues(x){
    return api => { const g = geoDe(x); if(g){ dibujarGeo(api, g, VERDE, true); encuadrar(api, puntosGeo(g)); } };
  }
  function hermanosFicha(x, tipo){ return x._f.secciones.filter(s => s.tipo === tipo).flatMap(s => s.items).filter(y => y !== x); }
  function detalleDe(x){
    const s = x._s;
    if(s.tipo === 'lugares') return x.dir || '';
    if(s.tipo === 'plazas' || s.tipo === 'jardines') return [x.barrio, x.nota].filter(Boolean).join(' · ');
    if(s.tipo === 'otro_nombre') return 'Se llama ' + x.real + '.';
    if(s.tipo === 'carreteras') return x.r;
    if(s.tipo === 'poligonos') return x.acceso || '';
    if(s.tipo === 'puentes') return [x.largo, x.uso].filter(Boolean).join(' · ');
    return '';
  }

  function qTocar(x){
    const g = geoDe(x);
    if(!g) return null;
    const s = x._s;
    const q = base(x, '', x.n, { respuesta: 'toque', detalle: detalleDe(x) });
    if(g.barrio && (s.tipo === 'barrios' || s.tipo === 'distritos' || s.tipo === 'poligonos')){ q.barrio = g.barrio; q.etiqueta = s.tipo === 'poligonos' ? 'Toca el polígono en el mapa' : 'Toca el barrio en el mapa'; }
    else if(g.lugar){ q.lugar = g.lugar; q.etiqueta = 'Localiza · ' + s.titulo; }
    else if(g.vias.length){
      q.vias = g.vias;
      q.etiqueta = s.tipo === 'lugares' ? 'Toca la calle donde está · ' + s.titulo : 'Localiza en el mapa · ' + s.titulo;
    }else return null;
    if(s.tipo === 'otro_nombre') q.texto = 'La calle conocida como «' + x.n + '»';
    if(s.tipo === 'linea'){
      q.etiqueta = 'Línea entre los parques · toca en el mapa';
      q.antes = api => { s.items.slice(0, x._i).forEach(y => { const gy = geoDe(y); if(gy) dibujarGeo(api, gy, AZUL, false); }); };
    }
    return q;
  }
  function qMarcado(x){
    const g = geoDe(x);
    if(!g) return null;
    const s = x._s;
    const pregunta = s.tipo === 'barrios' ? '¿Qué barrio es el marcado?' : s.tipo === 'jardines' ? '¿Cómo se llama el jardín o parque marcado?' : '¿Cómo se llama la plaza marcada?';
    return opciones(x, pregunta, '', x.n, vecinos(x, 6).map(y => y.n), {
      antes: api => { dibujarGeo(api, g, ROJO, true); encuadrar(api, puntosGeo(g)); },
      detalle: detalleDe(x)
    });
  }
  function qDato(x){ return opciones(x, 'Datos generales', x.n, x.r, barajar(x.falsas)); }
  function qLineaSiguiente(x){
    const s = x._s, k = x._i;
    const cerca = barajar(s.items.filter((y, j) => j !== k && j !== k - 1 && Math.abs(j - k) <= 6).map(y => y.n));
    const antes = api => {
      const pts = [];
      s.items.slice(0, k).forEach(y => { const gy = geoDe(y); if(gy){ dibujarGeo(api, gy, AZUL, false); puntosGeo(gy).forEach(p => pts.push(p)); } });
      if(pts.length) encuadrar(api, pts);
    };
    if(k === 0) return opciones(x, 'Línea entre el Parque Central y el Granadal', '¿Por dónde empieza (al norte)?', x.n, cerca, { despues: verDespues(x) });
    return opciones(x, 'Línea entre los parques (de norte a sur) · después de…', s.items[k - 1].n, x.n, cerca, { antes, despues: verDespues(x) });
  }
  function qDistritoDeBarrio(x){
    return opciones(x, '¿En qué distrito está?', 'Barrio ' + x.n, x.distrito, barajar(T.distritos),
      { resumen: x.n + ' es del distrito ' + x.distrito + '.', despues: verDespues(x) });
  }
  function carreterasOrdenadas(x){
    const s = x._s.items.filter(y => y !== x);
    return barajar(s.filter(y => y.grupo === x.grupo)).concat(barajar(s.filter(y => y.grupo !== x.grupo)));
  }
  function qCarreteraCodigo(x){
    return opciones(x, '¿Qué carretera es?', x.r, x.n, carreterasOrdenadas(x).map(y => y.n), { resumen: x.n + ': ' + x.r + '.', despues: verDespues(x) });
  }
  function qCarreteraQueEs(x){
    return opciones(x, '¿Qué es?', x.n, x.r, carreterasOrdenadas(x).map(y => y.r), { resumen: x.n + ': ' + x.r + '.', despues: verDespues(x) });
  }
  function salidasHermanas(x){ return x._s.items.filter(y => y !== x && y.via === x.via && y.sentido === x.sentido); }
  function qSalidaDestino(x){
    return opciones(x, x.via + ' ' + x.sentido + ' · ¿a dónde lleva?', 'Salida ' + x.num, x.r, barajar(salidasHermanas(x).map(y => y.r)),
      { resumen: 'La salida ' + x.num + ' lleva a ' + x.r + '.' });
  }
  function qSalidaNumero(x){
    const h = salidasHermanas(x);
    if(h.some(y => normalizar(y.r) === normalizar(x.r))) return null;   // dos salidas al mismo sitio
    const cerca = h.slice().sort((a, b) => Math.abs(parseInt(a.num, 10) - parseInt(x.num, 10)) - Math.abs(parseInt(b.num, 10) - parseInt(x.num, 10)));
    return opciones(x, x.via + ' ' + x.sentido + ' · ¿qué salida es?', x.r, 'Salida ' + x.num, cerca.map(y => 'Salida ' + y.num),
      { resumen: 'Es la salida ' + x.num + '.' });
  }
  // Carretera del temario por su código («CO-3402 (Ctra. de Trassierra)» → CO-3402).
  function carreteraDe(texto){
    const m = String(texto).match(/\b(CO-\d+|N-\d+|N-IV|A-\d+|CH-\d)\b/);
    if(!m) return null;
    const g = T.fichaPorId.get('general');
    const s = g && g.secciones.find(x => x.id === 'carreteras');
    return s ? s.items.find(y => y.n.split(' ')[0] === m[1]) || null : null;
  }
  function qUrbanizacion(x){
    const c = carreteraDe(x.via);
    return opciones(x, '¿Por qué carretera se llega?', x.n, x.via, barajar(x._s.items.map(y => y.via)),
      { resumen: 'Por la ' + x.via + '.', despues: c ? verDespues(c) : null });
  }
  function qPoligonoDistrito(x){
    return opciones(x, '¿En qué distrito está?', x.n, x.distrito, barajar(T.distritos), { resumen: x.n + ' está en el distrito ' + x.distrito + '.', despues: verDespues(x) });
  }
  function qParque(x){
    const bien = PARQUE_NOMBRE[x.parque];
    if(!bien) return null;
    const q = opciones(x, '¿Desde qué parque se sale?', x._s.tipo === 'recorridos' ? 'Para ir a ' + x.n : x.n, bien,
      Object.values(PARQUE_NOMBRE), { resumen: 'Sale el ' + bien + '.' }, 1);
    // Siempre en el mismo orden: Central a la izquierda, Granadal a la derecha.
    q.opciones = Object.values(PARQUE_NOMBRE);
    q.correcta = q.opciones.indexOf(bien);
    if(x.pv) q.despues = api => { dibujarRecorrido(api, x, x.pv.length, VERDE); encuadrar(api, pasosRuta(x).encuadre); };
    return q;
  }
  function qPoligonoAcceso(x){
    return opciones(x, '¿Por dónde se accede?', x.n, x.acceso, barajar(x._s.items.filter(y => y !== x).map(y => y.acceso)),
      { resumen: x.acceso + '.', detalle: x.pemuco || '', despues: verDespues(x) });
  }
  function qPoligonoIndustria(x){
    const otros = x._s.items.filter(y => y !== x);
    const propias = x.industrias.filter(i => !otros.some(y => (y.industrias || []).some(j => normalizar(j) === normalizar(i))));
    if(!propias.length) return null;
    const i = propias[Math.floor(Math.random() * propias.length)];
    return opciones(x, '¿En qué polígono está?', i, x.n, barajar(otros.map(y => y.n)), { resumen: i + ' está en el ' + x.n + '.', despues: verDespues(x) });
  }
  function qRecorridoPaso(x){
    const pasos = x.pasos || x.recorrido;
    if(!pasos || pasos.length < 2) return null;
    const k = 1 + Math.floor(Math.random() * (pasos.length - 1));
    const prohibidas = new Set([normalizar(pasos[k]), normalizar(pasos[k - 1])]);
    const otrosPasos = x._f.secciones.filter(s => s.tipo === 'recorridos' || s.tipo === 'poligonos').flatMap(s => s.items)
      .filter(y => y !== x).flatMap(y => y.pasos || y.recorrido || []);
    const falsas = barajar(pasos.filter((p, j) => j !== k && j !== k - 1)).concat(barajar(otrosPasos)).filter(p => !prohibidas.has(normalizar(p)));
    const parque = PARQUE_NOMBRE[x.parque] || 'el parque';
    return opciones(x, 'Recorrido desde el ' + parque + ' a ' + x.n + ' · después de…', pasos[k - 1], pasos[k], falsas, {
      resumen: 'Después de ' + pasos[k - 1] + ' viene ' + pasos[k] + '.',
      detalle: pasos.map((p, j) => (j + 1) + '. ' + p).join(' → '),
      antes: x.pv ? api => {
        const pts = dibujarRecorrido(api, x, k, AZUL);
        const sig = pasosRuta(x)[k];
        if(sig && sig.en) pts.push(sig.en);
        encuadrar(api, pts);
      } : null,
      despues: x.pv ? api => {
        const sig = pasosRuta(x)[k];
        if(!sig) return;
        sig.vias.forEach(v => api.resaltar(v, VERDE, true));
        if(sig.en) numero(api, sig.en, k + 1, VERDE);
      } : null
    });
  }
  function qCalleDe(x){
    const calle = d => normalizar(d).replace(/\b(s\/n|n[.º°o]*\s*\d+|\d+)\b/g, '').replace(/[.,]/g, '').trim();
    const mia = calle(x.dir);
    const falsas = barajar(hermanosFicha(x, 'lugares').map(y => y.dir).filter(d => d && calle(d) !== mia));
    return opciones(x, '¿Dónde está? · ' + x._s.titulo, x.n, x.dir, falsas, { resumen: x.n + ': ' + x.dir + '.', despues: verDespues(x) });
  }
  const USOS = ['doble sentido', 'peatonal', 'uso restringido (gravera)', 'prohibido el paso'];
  function puentesEnOrden(){
    const s = T.fichaPorId.get('general').secciones.find(y => y.id === 'puentes');
    return s ? s.items.filter(y => y.largo) : [];
  }
  function ordenPuente(x){ return puentesEnOrden().indexOf(x); }
  function uneTexto(x){ return x.desde === x.hasta ? 'Es la ' + x.desde : 'De ' + x.desde + ' a ' + x.hasta; }
  function qPuenteLargo(x){
    return opciones(x, '¿Cuánto mide?', x.n, x.largo, barajar(x._s.items.filter(y => y !== x).map(y => y.largo)), { resumen: x.n + ': ' + x.largo + '.', despues: verDespues(x) });
  }
  function qPuenteUso(x){
    return opciones(x, '¿Cómo es?', x.n, mayuscula(x.uso), USOS.map(mayuscula), { resumen: x.n + ': ' + x.uso + '.', despues: verDespues(x) }, 2);
  }
  function qPuenteUne(x){
    return opciones(x, '¿Qué une?', x.n, uneTexto(x), barajar(x._s.items.filter(y => y !== x && y.desde).map(uneTexto)), { resumen: uneTexto(x) + '.', despues: verDespues(x) });
  }
  function qPuenteSiguiente(x){
    const orden = puentesEnOrden(), k = orden.indexOf(x);
    return opciones(x, 'Río arriba (hacia el este), ¿qué puente viene después del…?', orden[k - 1].n, x.n,
      barajar(orden.filter((y, j) => j !== k && j !== k - 1).map(y => y.n)), { resumen: 'Después del ' + orden[k - 1].n + ' viene el ' + x.n + '.', despues: verDespues(x) });
  }
  function qEntrePuentes(x){
    const orden = puentesEnOrden().map(y => y.n).concat(['Alcolea']);
    const pares = orden.slice(1).map((n, j) => orden[j] + ' y ' + n);
    const bien = x.entre.join(' y ');
    return opciones(x, '¿Entre qué puentes está?', x.n, bien, barajar(pares), { resumen: x.n + ': entre el ' + x.entre.join(' y el ') + '.' });
  }
  function qDistrito(x){
    return opciones(x, '¿En qué distrito está?', x.n, x.distrito, barajar(T.distritos), { resumen: x.n + ': distrito ' + x.distrito + '.' });
  }
  function qAguaZona(x){
    return opciones(x, '¿Por qué barrio o zona pasa?', x.n, x.barrio, barajar(x._s.items.map(y => y.barrio)), { resumen: x.n + ': ' + x.barrio + '.' });
  }
  function qInundableDonde(x){
    return opciones(x, 'Zona inundable (PEMUCO) · ¿dónde está?', x.n, x.donde, unicos(x._s.items.map(y => y.donde)), { resumen: x.n + ': ' + x.donde.toLowerCase() + '.' }, 2);
  }
  function qNombreReal(x){
    return opciones(x, '¿Cómo se llama de verdad?', 'La calle «' + x.n + '»', x.real, barajar(x._s.items.map(y => y.real)), { resumen: '«' + x.n + '» es ' + x.real + '.', despues: verDespues(x) });
  }
  function qNombreColoquial(x){
    return opciones(x, '¿Cómo la conoce todo el mundo?', 'Calle ' + x.real, '«' + x.n + '»', barajar(x._s.items.map(y => '«' + y.n + '»')), { resumen: 'A ' + x.real + ' la llaman «' + x.n + '».', despues: verDespues(x) });
  }
  function qBarrioDistrito(x){
    return opciones(x, '¿De qué distrito es?', 'Barrio ' + x.n, x._f.titulo, barajar(T.distritos), { resumen: x.n + ' es del distrito ' + x._f.titulo + '.' });
  }
  function qBarrioDe(x){
    return opciones(x, '¿En qué barrio está?', x.n, x.barrio, barajar(x._s.items.map(y => y.barrio)), { resumen: x.n + ': ' + x.barrio + '.', despues: verDespues(x) });
  }
  function qPlanoTocar(x){
    return base(x, 'Toca en el plano · ' + x._s.titulo, x.n, { respuesta: 'plano', plano: x._s.plano, k: x.k, resumen: x.n + '.' });
  }
  function qPlanoQueEs(x){
    const esCalle = n => /^Calle /.test(n);
    const otros = x._s.items.filter(y => y !== x && esCalle(y.n) === esCalle(x.n));
    return opciones(x, '¿Qué es lo marcado en el plano?', x._s.titulo, x.n, barajar(otros.map(y => y.n)), { plano: x._s.plano, k: x.k, marcar: true });
  }

  // Preguntas de una ronda: primero lo fallado; de cada elemento, un tipo de pregunta al azar.
  function crearPreguntas(items){
    const candidatos = CJ.ordenarPorRepaso(items.filter(preguntable), x => x.id, 'temario');
    const out = [];
    for(const x of candidatos){
      if(out.length >= CJ.PREGUNTAS_POR_RONDA) break;
      for(const g of barajar(generadores(x))){
        const q = g(x);
        if(q){ out.push(q); break; }
      }
    }
    return barajar(out);
  }

  /* ---------- rondas ---------- */
  async function preguntar(claves, tareaId, titulo){
    try{ await cargar(); }catch(e){ uiToast(e.message, 'error'); return; }
    const items = itemsDe(claves);
    if(!items.length){ uiToast('No se encuentra esta parte del temario. Actualiza la app.', 'info'); return; }
    await CJ.empezarTemario({
      crear: () => crearPreguntas(items),
      distritos: distritosDe(claves),
      zona: tareaId ? 't:' + tareaId : 'f:' + claves[0],
      tareaId: tareaId || null,
      titulo: titulo || (claves.length === 1 ? nombreClave(claves[0]) : 'Temario'),
      encuadre: () => limitesItems(items)
    });
  }
  function preguntarClave(k){ preguntar([k]); }
  // Distritos de las fichas (su contorno se ve en el mapa, para orientarse).
  function distritosDe(claves){
    return [...new Set(seccionesDe(claves).map(s => s._f).filter(f => f.grupo === 'distrito').map(f => f.titulo))];
  }
  function preguntarTarea(id){
    const t = CJ.tareas().find(x => x.id === id);
    if(t) preguntar(t.fichas, t.id, t.titulo);
  }

  /* ---------- ver en el mapa ---------- */
  // Lo que se dibuja de cada elemento en el modo estudio del temario.
  function itemMapa(x){
    const g = geoDe(x);
    const ruta = x.pv ? pasosRuta(x) : null;
    if(!g && !(ruta && ruta.some(p => p.vias.length))) return null;
    // Con recorrido, se encuadra el recorrido (y lo propio del elemento, si lo tiene).
    const encuadre = ruta ? ruta.encuadre.concat(puntosGeo(g)) : null;
    return {
      id: x.id, nombre: textoItem(x), tipo: x._s.titulo,
      detalle: lineasDetalle(x, true),
      vias: g ? g.vias : [], lugar: g ? g.lugar : null, barrio: g ? g.barrio : null, ruta, salida: salidaDe(x), encuadre
    };
  }
  async function verEnMapa(claves, focoId){
    try{ await cargar(); }catch(e){ uiToast(e.message, 'error'); return; }
    const secciones = seccionesDe(claves);
    const items = secciones.flatMap(s => s.items).map(itemMapa).filter(Boolean);
    if(!items.length){ uiToast('Esto no tiene nada que marcar en el mapa.', 'info'); return; }
    const titulo = claves.length === 1 ? nombreClave(claves[0]) : (vista && vista.titulo) || 'Temario';
    CJ.estudio({ titulo, items, distritos: distritosDe(claves), foco: focoId ? items.findIndex(i => i.id === focoId) : -1 });
  }
  function verClave(k){ verEnMapa([k]); }
  function verItem(id){
    const x = T && T.porId.get(Number(id));
    if(x) verEnMapa([claveDe(x._s)], x.id);
  }

  /* ---------- pantalla del temario ---------- */
  function abrir(clave){
    vista = { claves: [clave], titulo: nombreClave(clave).replace(/^Ficha /, '') };
    abiertas.clear();
    mostrar();
  }
  function abrirTarea(id){
    const t = CJ.tareas().find(x => x.id === id);
    if(!t) return;
    vista = { claves: t.fichas, titulo: t.titulo, tarea: t };
    abiertas.clear();
    // Con un solo apartado, se abre ya desplegado.
    if(t.fichas.length === 1 && t.fichas[0].includes('/')) abiertas.add(t.fichas[0]);
    mostrar();
  }
  async function mostrar(){
    CJ.mostrarVista('temario');
    const root = document.getElementById('cjTemario');
    root.innerHTML = '<div class="cj-card">' + skelList(4) + '</div>';
    window.scrollTo(0, 0);
    try{ await Promise.all([cargar(), CJ.cargarDatos()]); }
    catch(e){
      root.innerHTML = '<div class="cj-card cj-error">No se ha podido cargar el temario: ' + escapeHtml(e.message) +
        '<br><button type="button" class="btn btn-light" onclick="CJT.volver()">Volver</button></div>';
      return;
    }
    pintar();
  }
  function volver(){ vista = null; CJ.mostrarVista('inicio'); CJ.repintar(); }
  function repintar(){ if(vista && document.getElementById('cjTemario')) pintar(); }

  function pintar(){
    const root = document.getElementById('cjTemario');
    if(!root || !vista || !T) return;
    const prog = CJ.progreso();
    const secciones = seccionesDe(vista.claves);
    const todos = secciones.flatMap(s => s.items);
    const r = cuenta(prog, todos);
    const t = vista.tarea;
    const conMapa = todos.some(tieneGeo) || todos.some(x => x.pv);
    // Agrupadas por ficha (una tarea puede mezclar apartados de varias).
    const fichas = [...new Set(secciones.map(s => s._f))];
    root.innerHTML =
      '<div class="cjt-cab"><button type="button" class="cj-salir" onclick="CJT.volver()" aria-label="Volver">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg></button>' +
        '<div><div class="cjt-cab-etq">' + (t ? 'Estúdiate esto' : 'Temario') + '</div><h2>' + escapeHtml(vista.titulo) + '</h2></div></div>' +
      (t && t.mensaje ? '<div class="cj-tarea-msg cjt-msg">' + escapeHtml(t.mensaje) + '</div>' : '') +
      '<div class="cj-card">' +
        '<div class="cj-hab-cab"><span>' + (t ? escapeHtml(describirFichas(t.fichas)) : 'Tu progreso') + '</span><b>' + pct(r) + '%</b></div>' + barra(r) +
        '<div class="cj-hab-det">' + r.dominada + ' dominadas · ' + r.progreso + ' en progreso · ' + r.fallada + ' por repasar · ' + r.nueva + ' sin ver</div>' +
        (t ? '<div class="cj-tarea-que">' + t.rondas + (t.rondas === 1 ? ' ronda' : ' rondas') + ' con al menos un ' + t.minimo + '% de aciertos · llevas ' +
          Math.min(t.rondas_validas, t.rondas) + '</div>' : '') +
        '<div class="cj-tarea-acciones">' +
          '<button type="button" class="btn btn-primary btn-light" onclick="' + (t ? 'CJT.preguntarTarea(' + t.id + ')' : 'CJT.preguntarClave(\'' + escapeHtml(vista.claves[0]) + '\')') + '">' +
            (t ? 'Preguntar (cuenta para la tarea)' : 'Preguntar toda la ficha') + '</button>' +
          (conMapa ? '<button type="button" class="btn btn-ghost" onclick="CJT.verTodo()">Ver en el mapa</button>' : '') +
          (t ? '<button type="button" class="btn btn-ghost" onclick="CJP.abrirMensajes(' + t.id + ')">Mensajes</button>' : '') +
        '</div>' +
      '</div>' +
      fichas.map(f => (fichas.length > 1 ? '<div class="cj-seccion">' + escapeHtml(f.titulo) + '</div>' : '') +
        secciones.filter(s => s._f === f).map(s => tarjetaSeccion(s, prog)).join('')).join('') +
      '<div class="cj-fuente">' + escapeHtml(T.fuente) + (T.faltan && T.faltan.length ? ' Faltan las fichas de ' + escapeHtml(T.faltan.join(', ')) + '.' : '') +
        ' Los planos de la Mezquita, el Alcázar y la Feria están dibujados aquí, a grandes rasgos, con lo que se pregunta.</div>';
  }
  function verTodo(){ if(vista) verEnMapa(vista.claves); }

  function tarjetaSeccion(s, prog){
    const k = claveDe(s);
    const r = cuenta(prog, s.items);
    const abierta = abiertas.has(k);
    const conMapa = s.items.some(tieneGeo) || s.items.some(x => x.pv);
    const n = s.items.length;
    return '<div class="cj-card cjt-sec' + (abierta ? ' abierta' : '') + '">' +
      '<button type="button" class="cjt-sec-cab" onclick="CJT.alternar(\'' + escapeHtml(k) + '\')" aria-expanded="' + abierta + '">' +
        '<span class="cjt-sec-titulo">' + escapeHtml(s.titulo) + ' <small>' + n + '</small></span>' +
        (r.total ? '<b>' + pct(r) + '%</b>' : '') +
        '<svg class="cjt-flecha" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>' +
      '</button>' +
      (r.total ? barra(r) : '') +
      (abierta
        ? (s.texto ? '<div class="cjt-texto">' + escapeHtml(s.texto) + '</div>' : '') +
          (s.tipo === 'plano' ? planoVerHtml(s) : '') +
          '<div class="cjt-lista">' + s.items.map(x => filaItem(x, prog)).join('') + '</div>'
        : '') +
      '<div class="cjt-sec-acciones">' +
        (r.total ? '<button type="button" class="btn btn-primary btn-light" onclick="CJT.preguntarClave(\'' + escapeHtml(k) + '\')">Preguntar</button>' : '') +
        (conMapa ? '<button type="button" class="btn btn-ghost" onclick="CJT.verClave(\'' + escapeHtml(k) + '\')">En el mapa</button>' : '') +
        '<button type="button" class="btn btn-ghost" onclick="CJT.alternar(\'' + escapeHtml(k) + '\')">' + (abierta ? 'Ocultar lista' : 'Ver lista') + '</button>' +
      '</div>' +
    '</div>';
  }
  function alternar(k){
    if(abiertas.has(k)) abiertas.delete(k); else abiertas.add(k);
    pintar();
  }

  // Lo que se ve de cada elemento en la lista (y en la ficha del mapa).
  // `plano`: sin HTML (para la ficha del mapa, que ya lo escapa).
  function lineasDetalle(x, plano){
    const e = plano ? (t => String(t)) : escapeHtml, b = plano ? (t => t) : (t => '<b>' + t + '</b>'), s = x._s, out = [];
    switch(s.tipo){
      case 'datos': out.push(b(e(x.r))); break;
      case 'distritos': out.push('Distrito ' + e(x.distrito)); break;
      case 'carreteras': out.push(e(x.r) + (x.grupo ? ' · ' + e(x.grupo) : '')); break;
      case 'salidas': out.push(e(x.r)); break;
      case 'urbanizaciones': out.push(e(x.via)); break;
      case 'poligonos':
        out.push('Distrito ' + e(x.distrito) + ' · acude el ' + e(PARQUE_NOMBRE[x.parque] || ''));
        if(x.acceso) out.push('Acceso: ' + e(x.acceso));
        if(x.recorrido) out.push('Recorrido: ' + x.recorrido.map((p, j) => (j + 1) + '. ' + e(p)).join(' → ') + (x.recorrido_nota ? ' (' + e(x.recorrido_nota) + ')' : ''));
        if(x.industrias && x.industrias.length) out.push('Industrias: ' + x.industrias.map(e).join(', '));
        if(x.pemuco) out.push('PEMUCO: ' + e(x.pemuco));
        break;
      case 'lugares': if(x.dir) out.push(e(x.dir)); if(x.grupo) out.push(e(x.grupo)); break;
      case 'puentes':
        if(x.entre) out.push('Entre el ' + x.entre.map(e).join(' y el '));
        else{
          out.push([x.largo, x.uso].filter(Boolean).map(e).join(' · '));
          if(x.desde) out.push(e(uneTexto(x)));
        }
        break;
      case 'aguas': out.push(e(mayuscula(x.clase)) + ' · ' + e(x.barrio) + ' · distrito ' + e(x.distrito)); break;
      case 'inundables': out.push(e(x.donde) + ' · distrito ' + e(x.distrito)); break;
      case 'otro_nombre': out.push('Se llama ' + b(e(x.real)) + ' · ' + e(x.distrito)); break;
      case 'recorridos':
        out.push('Sale el ' + e(PARQUE_NOMBRE[x.parque] || ''));
        out.push(x.pasos.map((p, j) => (j + 1) + '. ' + e(p)).join(' → '));
        if(x.nota) out.push(e(x.nota));
        break;
      case 'plazas': case 'jardines': if(x.barrio) out.push(e(x.barrio)); if(x.nota) out.push(e(x.nota)); break;
    }
    return out.filter(Boolean);
  }
  function filaItem(x, prog){
    const est = preguntable(x) ? estado(prog, x) : '';
    const mapa = tieneGeo(x) || x.pv;
    const numerado = x._s.tipo === 'linea' || x._s.tipo === 'plano';
    const titulo = numerado ? (x._i + 1) + '. ' + x.n : x._s.tipo === 'otro_nombre' ? '«' + x.n + '»' : x.n;
    const cuerpo = '<i class="cjt-estado ' + est + '"></i><span class="cjt-fila-txt"><span class="cjt-fila-n">' + escapeHtml(titulo) + '</span>' +
      lineasDetalle(x).map(l => '<span class="cjt-fila-d">' + l + '</span>').join('') + '</span>';
    // En los planos, la fila marca su sitio en el plano de arriba.
    if(x._s.tipo === 'plano'){
      return '<button type="button" class="cjt-fila' + (planoVer[x._s.plano] === x.k ? ' activa' : '') + '" onclick="CJT.verEnPlano(\'' + x._s.plano + '\', \'' + x.k + '\')">' + cuerpo + '</button>';
    }
    return mapa
      ? '<button type="button" class="cjt-fila" onclick="CJT.verItem(' + x.id + ')">' + cuerpo +
          '<svg class="cjt-fila-ir" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 4.99-5.54 10.19-7.4 11.8a1 1 0 0 1-1.2 0C9.54 20.19 4 14.99 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/></svg></button>'
      : '<div class="cjt-fila">' + cuerpo + '</div>';
  }

  /* ---------- en la pantalla principal del callejero ---------- */
  function tarjetaInicio(){
    if(!T){
      cargar().then(() => CJ.repintar(), () => {});
      return '<div class="cj-seccion">Temario</div><div class="cj-card">' + skelList(2) + '</div>';
    }
    const prog = CJ.progreso();
    return '<div class="cj-seccion">Temario de la academia</div>' +
      '<div class="cj-card cjt-inicio">' +
        '<div class="cj-hab-det cjt-intro">Lo de la documentación, ficha a ficha: míralo en la lista o en el mapa y pregúntatelo.</div>' +
        T.fichas.map(f => {
          const r = cuenta(prog, f.secciones.flatMap(s => s.items));
          return '<button type="button" class="cjt-ficha" onclick="CJT.abrir(\'' + escapeHtml(f.id) + '\')">' +
            '<span class="cjt-ficha-txt"><span class="cjt-ficha-n">' + escapeHtml(f.titulo) + '</span>' +
              '<span class="cjt-ficha-d">' + f.secciones.length + ' apartados · ' + r.total + ' preguntas · ' + pct(r) + '% dominado</span>' + barra(r) + '</span>' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>' +
          '</button>';
        }).join('') +
        (T.faltan && T.faltan.length ? '<div class="cj-hab-det">Todavía faltan: ' + escapeHtml(T.faltan.join(', ')) + '.</div>' : '') +
      '</div>';
  }

  /* ---------- para el profesor ---------- */
  // Progreso de un alumno por ficha.
  function tarjetaProgresoAlumno(prog){
    if(!T) return '';
    return '<div class="cj-card"><div class="cj-card-title">Temario de la academia</div>' +
      T.fichas.map(f => {
        const r = cuenta(prog, f.secciones.flatMap(s => s.items));
        return '<div class="cj-hab"><div class="cj-hab-cab"><span>' + escapeHtml(f.titulo) + '</span><b>' + pct(r) + '%</b></div>' + barra(r) +
          '<div class="cj-hab-det">' + r.dominada + ' dominadas · ' + r.progreso + ' en progreso · ' + r.fallada + ' por repasar · ' + r.nueva + ' sin ver</div></div>';
      }).join('') + '</div>';
  }
  // Casillas de fichas y apartados. `elegidas`: claves ya elegidas.
  function selectorFichas(elegidas){
    if(!T) return '<div class="cj-hab-det">Cargando el temario…</div>';
    const sel = new Set(elegidas || []);
    return '<div class="cjt-selector">' + T.fichas.map(f => {
      const entera = sel.has(f.id);
      const marcadas = f.secciones.filter(s => entera || sel.has(f.id + '/' + s.id)).length;
      // La casilla elige la ficha entera; el nombre despliega sus apartados.
      return '<details class="cjt-sel-ficha"' + (marcadas && !entera ? ' open' : '') + '>' +
        '<summary><input type="checkbox" class="cjt-sel-f" value="' + escapeHtml(f.id) + '" aria-label="Toda la ficha ' + escapeHtml(f.titulo) + '"' +
          (marcadas === f.secciones.length ? ' checked' : '') + ' onclick="event.stopPropagation()" onchange="CJT.marcarFicha(this)">' +
          '<span class="cjt-sel-nombre"><b>' + escapeHtml(f.titulo) + '</b> <span class="cj-sug-cat">' + f.secciones.length + ' apartados</span></span>' +
          '<span class="cjt-sel-n" data-f="' + escapeHtml(f.id) + '">' + (marcadas && marcadas < f.secciones.length ? marcadas + ' de ' + f.secciones.length : '') + '</span>' +
          '<svg class="cjt-flecha" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg></summary>' +
        '<div class="cjt-sel-secs">' + f.secciones.map(s =>
          '<label class="cjp-check"><input type="checkbox" class="cjt-sel-s" data-f="' + escapeHtml(f.id) + '" value="' + escapeHtml(f.id + '/' + s.id) + '"' +
            (entera || sel.has(f.id + '/' + s.id) ? ' checked' : '') + ' onchange="CJT.marcarApartado(this)"> ' + escapeHtml(s.titulo) +
            ' <span class="cj-sug-cat">' + s.items.length + '</span></label>').join('') + '</div>' +
      '</details>';
    }).join('') + '</div>';
  }
  function casillas(fid){ return [...document.querySelectorAll('.cjt-sel-s')].filter(c => c.dataset.f === fid); }
  function contarFicha(fid){
    const cs = casillas(fid), n = cs.filter(c => c.checked).length;
    const f = [...document.querySelectorAll('.cjt-sel-f')].find(c => c.value === fid);
    if(f){ f.checked = n === cs.length; f.indeterminate = n > 0 && n < cs.length; }
    const etq = [...document.querySelectorAll('.cjt-sel-n')].find(e => e.dataset.f === fid);
    if(etq) etq.textContent = n && n < cs.length ? n + ' de ' + cs.length : '';
  }
  function marcarFicha(c){ casillas(c.value).forEach(s => { s.checked = c.checked; }); contarFicha(c.value); }
  function marcarApartado(c){ contarFicha(c.dataset.f); }
  function leerSelector(){
    const out = [];
    document.querySelectorAll('.cjt-sel-f').forEach(f => {
      const cs = casillas(f.value), marcadas = cs.filter(c => c.checked);
      if(cs.length && marcadas.length === cs.length) out.push(f.value);
      else marcadas.forEach(c => out.push(c.value));
    });
    return out;
  }
  function iniciarSelector(){ document.querySelectorAll('.cjt-sel-f').forEach(f => contarFicha(f.value)); }

  /* ---------- planos (dibujados aquí, a grandes rasgos) ---------- */
  // Cada plano: viewBox, dibujo de fondo y la posición de cada cosa que se
  // pregunta (k del temario): un punto { x, y }, una calle { d } o una zona { zona }.
  let planos = null;
  function definirPlanos(){
    if(planos) return planos;
    const f = n => Math.round(n * 10) / 10;
    // --- Mezquita-Catedral (la quibla arriba, al sur; el patio abajo, al norte) ---
    let col = '';
    for(let x = 85; x <= 785; x += 40) for(let y = 90; y <= 740; y += 40) col += 'M' + x + ' ' + y + 'h.1';
    const mezquita = {
      vb: '0 0 865 1215',
      fondo:
        '<rect class="cjt-muro" x="40" y="40" width="785" height="1105" rx="4"/>' +
        '<rect class="cjt-suelo" x="52" y="52" width="761" height="710"/>' +
        '<path class="cjt-columnas" d="' + col + '"/>' +
        '<rect class="cjt-patio" x="52" y="778" width="761" height="355"/>' +
        '<rect class="cjt-arboles" x="128" y="830" width="162" height="210"/><rect class="cjt-arboles" x="328" y="830" width="157" height="210"/><rect class="cjt-arboles" x="598" y="830" width="137" height="210"/>' +
        '<path class="cjt-catedral" d="M248 405h322v115H248z M375 385h60v155h-60z"/>' +
        '<path class="cjt-linea" d="M52 770h761"/>' +
        '<text class="cjt-rot" x="432" y="28" text-anchor="middle">Quibla · sur (hacia el río)</text>' +
        '<text class="cjt-rot" x="432" y="1200" text-anchor="middle">Norte · C/ Cardenal Herrero</text>' +
        '<text class="cjt-rot" x="20" y="600" text-anchor="middle" transform="rotate(-90 20 600)">Este · C/ Magistral González Francés</text>' +
        '<text class="cjt-rot" x="845" y="600" text-anchor="middle" transform="rotate(90 845 600)">Oeste · C/ Torrijos</text>',
      puntos: {
        cap_sagrario: { x: 148, y: 93 }, tesoro: { x: 423, y: 80 }, cap_cardenal: { x: 487, y: 87 }, mihrab: { x: 580, y: 72 },
        sacristia: { x: 72, y: 170 }, p_sagrario: { x: 40, y: 225 }, p_catalina: { x: 40, y: 825 },
        p_palacio: { x: 825, y: 215 }, p_miguel: { x: 825, y: 377 }, p_esteban: { x: 825, y: 637 }, p_deanes: { x: 825, y: 825 }, p_leche: { x: 825, y: 1110 },
        p_cano: { x: 208, y: 1145 }, p_perdon: { x: 535, y: 1145 }, torre: { x: 630, y: 1095 },
        p_palmas: { x: 585, y: 770 }, fuente: { x: 428, y: 1020 },
        patio: { zona: 'M52 778h761v355H52z', x: 250, y: 1085 },
        villaviciosa: { x: 590, y: 225 }, cap_real: { x: 560, y: 310 }, primitiva: { x: 720, y: 310 },
        trasaltar: { x: 262, y: 462 }, cap_mayor: { x: 330, y: 462 }, crucero: { x: 405, y: 462 }, coro: { x: 492, y: 462 }, trascoro: { x: 592, y: 462 }
      }
    };
    // --- Alcázar de los Reyes Cristianos (el río arriba) ---
    const torre = (cx, cy) => { const a = 12 * Math.PI / 180, h = 52; const p = [[-h, -h], [h, -h], [h, h], [-h, h]].map(([x, y]) => f(cx + x * Math.cos(a) - y * Math.sin(a)) + ',' + f(cy + x * Math.sin(a) + y * Math.cos(a))); return '<polygon class="cjt-torre" points="' + p.join(' ') + '"/>'; };
    const alcazar = {
      vb: '0 0 700 470',
      fondo:
        '<path class="cjt-agua" d="M0 0h700v38H0z"/>' +
        '<text class="cjt-rot" x="350" y="26" text-anchor="middle">Río</text>' +
        '<path class="cjt-jardin" d="M255 95L545 122L480 335L150 300Z"/>' +
        '<path class="cjt-muralla" d="M255 95L545 122L480 335L150 300Z"/>' +
        torre(255, 95) + torre(545, 122) + torre(150, 300) + torre(480, 335) +
        '<text class="cjt-rot" x="28" y="235" text-anchor="middle" transform="rotate(-90 28 235)">Pje. Santa Teresa de Jornet</text>',
      puntos: { paloma: { x: 255, y: 95 }, inquisicion: { x: 545, y: 122 }, homenaje: { x: 150, y: 300 }, leones: { x: 480, y: 335 } }
    };
    // --- Feria de la Salud (El Arenal): abanico con el río arriba ---
    const C = [500, 2380];
    const P = (a, r) => [C[0] + r * Math.sin(a * Math.PI / 180), C[1] - r * Math.cos(a * Math.PI / 180)];
    const pt = p => f(p[0]) + ' ' + f(p[1]);
    const arco = (r, a1, a2) => 'M' + pt(P(a1, r)) + ' A' + r + ' ' + r + ' 0 0 1 ' + pt(P(a2, r));
    const radial = (a, r1, r2) => 'M' + pt(P(a, r1)) + ' L' + pt(P(a, r2));
    const banda = (r1, r2, a1, a2) => arco(r2, a1, a2) + ' L' + pt(P(a2, r1)) + ' A' + r1 + ' ' + r1 + ' 0 0 0 ' + pt(P(a1, r1)) + 'Z';
    const RAD = { c_medina: -9.6, c_faroles: -7.4, c_tendillas: -5.2, c_patios: -3.0, c_corredera: -0.8, c_alcazar: 1.4, c_puente: 3.6, c_juderia: 5.8, c_mezquita: 8.0 };
    const ARC = { c_guadalquivir: 2260, c_enmedio: 2080, c_potro: 1910, c_infierno: 1855, c_peineta: 1800, c_volante: 1745 };
    const angulos = Object.values(RAD);
    let casetas = '';
    for(let i = 1; i < angulos.length - 1; i++){
      casetas += '<path class="cjt-caseta" d="' + banda(2095, 2245, angulos[i] + 0.35, angulos[i + 1] - 0.35) + '"/>';
      casetas += '<path class="cjt-caseta" d="' + banda(1925, 2065, angulos[i] + 0.35, angulos[i + 1] - 0.35) + '"/>';
    }
    const puntosFeria = {};
    Object.keys(RAD).forEach(k => {
      const hasta = k === 'c_medina' ? 1745 : 1910;
      puntosFeria[k] = { d: radial(RAD[k], 2260, hasta), x: P(RAD[k], 2150)[0], y: P(RAD[k], 2150)[1] };
    });
    // El número de cada calle en arco va en un sitio distinto, para que no se pisen.
    const ANG_NUM = { c_guadalquivir: -1.9, c_enmedio: -1.9, c_potro: -6.3, c_infierno: -1.9, c_peineta: 2.5, c_volante: 6.9 };
    Object.keys(ARC).forEach(k => {
      const [x, y] = P(ANG_NUM[k], ARC[k]);
      puntosFeria[k] = { d: k === 'c_guadalquivir' ? arco(ARC[k], -11, 10.2) : arco(ARC[k], -9.6, 8.0), x, y };
    });
    const zp = (a, r) => { const [x, y] = P(a, r); return { x, y }; };
    Object.assign(puntosFeria, {
      rincon: zp(-11.3, 2215), descanso: Object.assign({ zona: banda(2095, 2245, angulos[0] + 0.35, angulos[1] - 0.35) }, zp(-8.5, 2215)),
      cruzroja: zp(-8.5, 1990), caseta: zp(-11.4, 1990), policia: zp(-11.2, 1830), portada: zp(10.4, 1850),
      atracciones: Object.assign({ zona: banda(1630, 1715, -9, 9) }, zp(0, 1672))
    });
    const a4 = P(-13.3, 1960);
    const feria = {
      vb: '-20 30 1040 840',
      fondo:
        '<path class="cjt-agua" d="' + banda(2300, 2360, -13.5, 13.5) + '"/>' +
        '<text class="cjt-rot" x="' + f(P(0, 2320)[0]) + '" y="' + f(P(0, 2320)[1] + 5) + '" text-anchor="middle">Río Guadalquivir</text>' +
        '<path class="cjt-recinto" d="' + banda(1610, 2280, -12.5, 12) + '"/>' +
        casetas +
        '<path class="cjt-estadio" d="' + banda(1520, 1595, -8, 8) + '"/>' +
        '<text class="cjt-rot" x="' + f(P(0, 1545)[0]) + '" y="' + f(P(0, 1545)[1] + 8) + '" text-anchor="middle">Estadio</text>' +
        '<text class="cjt-rot" x="' + f(a4[0]) + '" y="' + f(a4[1]) + '" text-anchor="middle" transform="rotate(-77 ' + f(a4[0]) + ' ' + f(a4[1]) + ')">A-4 · salida 401</text>',
      puntos: puntosFeria
    };
    planos = { mezquita, alcazar, feria };
    return planos;
  }
  function seccionPlano(id){
    const g = T.fichaPorId.get('general');
    return g ? g.secciones.find(s => s.plano === id) : null;
  }
  // modo: 'ver' (con números), 'tocar' (se responde tocando) o 'fijo' (solo mirar, con lo preguntado marcado).
  function svgPlano(id, modo, marcado){
    const P = definirPlanos()[id], s = seccionPlano(id);
    if(!P || !s) return '';
    const orden = s.items.map((x, i) => ({ x, i, p: P.puntos[x.k] })).filter(o => o.p)
      .sort((a, b) => (b.p.zona ? 2 : b.p.d ? 1 : 0) - (a.p.zona ? 2 : a.p.d ? 1 : 0));
    let html = '<svg class="cjt-svg" viewBox="' + P.vb + '" data-plano="' + id + '" data-modo="' + modo + '" onclick="CJT.clicPlano(event)" role="img" aria-label="Plano: ' + escapeHtml(s.titulo) + '">' + P.fondo;
    orden.forEach(({ x, i, p }) => {
      const clase = 'cjt-hot' + (p.zona ? ' zona' : p.d ? ' calle' : ' punto') + (marcado === x.k ? ' marcado' : '');
      html += '<g class="' + clase + '" data-k="' + x.k + '">';
      if(p.zona) html += '<path class="cjt-forma" d="' + p.zona + '"/>';
      else if(p.d) html += '<path class="cjt-forma" d="' + p.d + '"/><path class="cjt-toque" d="' + p.d + '"/>';
      else html += '<circle class="cjt-forma" cx="' + p.x + '" cy="' + p.y + '" r="14"/>';
      if(modo === 'ver') html += '<circle class="cjt-bola" cx="' + p.x + '" cy="' + p.y + '" r="19"/><text class="cjt-bola-n" x="' + p.x + '" y="' + (p.y + 7) + '" text-anchor="middle">' + (i + 1) + '</text>';
      html += '</g>';
    });
    return html + '</svg>';
  }
  // Toque en un plano: el punto más cercano (hasta ~60 unidades) o la calle o zona tocada.
  function clicPlano(ev){
    const svg = ev.currentTarget;
    const id = svg.dataset.plano, modo = svg.dataset.modo;
    if(modo === 'fijo') return;
    const P = definirPlanos()[id];
    let k = null;
    const m = svg.getScreenCTM();
    if(m){
      const p = new DOMPoint(ev.clientX, ev.clientY).matrixTransform(m.inverse());
      let mejor = 60;
      Object.keys(P.puntos).forEach(key => {
        const q = P.puntos[key];
        if(q.d || q.zona) return;
        const d = Math.hypot(q.x - p.x, q.y - p.y);
        if(d < mejor){ mejor = d; k = key; }
      });
    }
    if(!k){ const g = ev.target.closest('[data-k]'); if(g) k = g.dataset.k; }
    if(!k) return;
    if(modo === 'tocar') CJ.responderPlano(k);
    else{ planoVer[id] = planoVer[id] === k ? null : k; pintar(); }
  }
  function verEnPlano(id, k){
    planoVer[id] = planoVer[id] === k ? null : k;
    pintar();
    const svg = document.querySelector('.cjt-svg[data-plano="' + id + '"]');
    if(svg) svg.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  function planoVerHtml(s){
    const k = planoVer[s.plano];
    const x = k ? s.items.find(y => y.k === k) : null;
    return '<div class="cjt-plano-ver">' + svgPlano(s.plano, 'ver', k) +
      '<div class="cjt-plano-nombre">' + (x ? escapeHtml(x.n) : 'Toca un número del plano para ver qué es') + '</div></div>';
  }
  // En una ronda: el plano de la pregunta (sobre el mapa).
  function pintarPlano(q){
    const caja = document.getElementById('cjPlano');
    caja.innerHTML = svgPlano(q.plano, q.marcar ? 'fijo' : 'tocar', q.marcar ? q.k : null);
    caja.classList.remove('hidden', 'respondida');
  }
  function marcarPlano(q, tocado){
    const caja = document.getElementById('cjPlano');
    caja.classList.add('respondida');
    const svg = caja.querySelector('svg');
    if(svg) svg.dataset.modo = 'fijo';
    caja.querySelectorAll('.cjt-hot').forEach(g => {
      g.classList.toggle('correcta', g.dataset.k === q.k);
      g.classList.toggle('incorrecta', !!tocado && g.dataset.k === tocado && tocado !== q.k);
    });
  }

  return {
    cargar, listo, nombreAmbito, describirFichas, nombreItem, claveDeItem, tarjetaInicio, tarjetaProgresoAlumno,
    abrir, abrirTarea, volver, repintar, alternar, verTodo, verClave, verItem, preguntarClave, preguntarTarea,
    selectorFichas, marcarFicha, marcarApartado, leerSelector, iniciarSelector,
    clicPlano, pintarPlano, marcarPlano, verEnPlano
  };
})();
