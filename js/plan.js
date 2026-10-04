/* ============================================================
   PLAN · Plan de estudio (pantalla «Plan»)
   El centro de control del estudio: qué test toca cada día y en qué
   orden, de qué plataforma (Tutor Bombero, los tests de pj.fire u otra),
   qué se ha abierto, qué se ha terminado y con qué resultado.

   - Datos: tablas plan_* de Supabase, privadas (RLS) y con el permiso
     «plan», que está apagado salvo que se active (ver permisos.js). Se
     guardan al momento en memoria y en una cola en el dispositivo que se
     sube en orden: sin conexión no se pierde nada y reintentar no
     duplica (los ids los pone la app).
   - Abrir no es terminar: abrir un test lo deja «en curso» y apunta que
     se abrió; solo se completa cuando el usuario lo confirma o apunta el
     resultado (o lo registra un test de pj.fire al terminar).
   - Tutor Bombero no tiene API ni enlaces a cada test: se abre su página
     de entrada (o la que se guarde en el test) en otra pestaña y, al
     volver, se pregunta si se terminó y cuánto se sacó. No se guardan sus
     credenciales ni su contenido, y no se puede bloquear la web si se
     entra directamente: solo se controla lo que se abre desde aquí.
   La lógica pura (fechas, reglas, estadísticas…) está en plan-logica.js
   (PLANL). Las pestañas Exámenes y Progreso, en plan-examen.js (PLANX) y
   plan-progreso.js (PLANP).
   ============================================================ */
const PLAN = (function(){
  'use strict';

  /* ---------- constantes ---------- */
  const TABLAS = {
    plan_temas: 'temas', plan_tests: 'tests', plan_tareas: 'tareas',
    plan_resultados: 'resultados', plan_eventos: 'eventos', plan_preguntas: 'preguntas'
  };
  const NO_ENVIAR = ['clave', 'huella', 'created_at', 'updated_at'];
  const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const PESTANAS = [
    { id: 'hoy', texto: 'Hoy' }, { id: 'plan', texto: 'Plan' }, { id: 'tests', texto: 'Tests' },
    { id: 'examenes', texto: 'Exámenes' }, { id: 'progreso', texto: 'Progreso' }
  ];
  const VUELTA_MIN_MS = 20 * 1000;        // volver antes de 20 s no cuenta como «he hecho el test»
  const VUELTA_MAX_MS = 18 * 3600 * 1000; // pasadas 18 h ya no se pregunta al volver (sigue en Hoy)
  const DIAS_CORTOS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

  const ICO = {
    ajustes: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>',
    mas: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>',
    izq: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>',
    der: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>',
    cerrar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/></svg>',
    externo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>'
  };

  /* ---------- estado ---------- */
  let d = vacio();
  let cargado = false, cargando = null, errorCarga = null, duenio = null;
  let pestana = leerLocal('plan_pestana') || 'hoy';
  if(pestana !== 'ajustes' && !PESTANAS.some(p => p.id === pestana)) pestana = 'hoy';
  let vistaPlan = leerLocal('plan_vista') === 'mes' ? 'mes' : 'semana';
  let semanaVista = null, mesVista = null;
  let filtroTests = '', verArchivados = false;
  let hojaActual = null;
  let ultimoDiaPintado = null;
  let subiendo = null, repetirSubida = false, reintento = null, recargarTrasSubir = false;

  function vacio(){
    return { ajustes: null, temas: [], tests: [], tareas: [], resultados: [], eventos: [], preguntas: [] };
  }

  /* ---------- utilidades ---------- */
  function yo(){ return currentUser ? currentUser.id : null; }
  function hoy(){ return PLANL.hoy(); }
  function ajustes(){ return PLANL.ajustesDe(d.ajustes); }
  function reglas(){ return ajustes().reglas; }
  function esUuid(x){ return typeof x === 'string' && RE_UUID.test(x); }
  function idAttr(x){ return esUuid(x) ? x : ''; }
  function uid(){
    if(window.crypto && crypto.randomUUID) return crypto.randomUUID();
    const b = crypto.getRandomValues(new Uint8Array(16));
    b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
    const h = [...b].map(x => x.toString(16).padStart(2, '0')).join('');
    return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
  }
  function leerLocal(k){ try{ return localStorage.getItem(k); }catch(e){ return null; } }
  function escribirLocal(k, v){ try{ if(v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); }catch(e){} }
  function ahoraIso(){ return new Date().toISOString(); }
  function nota2(n){ return n == null ? '—' : formatNota(n); }
  function enteroONull(v){
    if(v === '' || v == null) return null;
    const n = Number(String(v).replace(',', '.'));
    return Number.isFinite(n) && n >= 0 ? Math.round(n) : NaN;
  }
  function numeroONull(v){
    if(v === '' || v == null) return null;
    const n = Number(String(v).replace(',', '.'));
    return Number.isFinite(n) ? n : NaN;
  }
  // Para pintar números que vienen de datos (nunca texto libre en el HTML).
  function n0(x){ const v = Number(x); return Number.isFinite(v) ? String(Math.round(v * 100) / 100) : '?'; }
  function claseEstado(e){ return Object.prototype.hasOwnProperty.call(PLANL.ESTADOS, e) ? e : 'pendiente'; }
  // ms de una marca de tiempo de PostgREST (con microsegundos, que algún Safari no lee).
  function msDe(iso){
    if(!iso) return NaN;
    const ms = Date.parse(String(iso).trim().replace(' ', 'T').replace(/(\.\d{3})\d+/, '$1').replace(/([+-]\d{2})$/, '$1:00'));
    return Number.isFinite(ms) ? ms : Date.parse(iso);
  }
  function diaDeIso(iso){ const ms = msDe(iso); return Number.isFinite(ms) ? PLANL.hoy(new Date(ms)) : null; }
  function textoCorto(s, n){ s = String(s || ''); return s.length > n ? s.slice(0, n - 1) + '…' : s; }
  function plural(n, uno, varios){ return n + ' ' + (n === 1 ? uno : varios); }
  function hace(ms){
    const min = Math.round(ms / 60000);
    if(min < 1) return 'hace un momento';
    if(min < 60) return 'hace ' + plural(min, 'minuto', 'minutos');
    const h = Math.round(min / 60);
    return 'hace ' + plural(h, 'hora', 'horas');
  }
  function urlSegura(u){
    if(typeof u !== 'string') return null;
    const s = u.trim();
    return /^https?:\/\/\S+$/i.test(s) && s.length <= 500 ? s : null;
  }

  /* ---------- acceso a los datos ---------- */
  function temaDe(id){ return id ? d.temas.find(t => t.id === id) || null : null; }
  function testDe(id){ return id ? d.tests.find(t => t.id === id) || null : null; }
  function tareaDe(id){ return id ? d.tareas.find(t => t.id === id) || null : null; }
  function resultadoDe(id){ return id ? d.resultados.find(r => r.id === id) || null : null; }
  function nombreTema(id){
    const t = temaDe(id);
    if(!t) return 'Sin tema';
    return (t.numero != null ? 'Tema ' + t.numero + ' · ' : '') + t.nombre;
  }
  function temasOrdenados(conArchivados){
    return d.temas.filter(t => conArchivados || !t.archivado).slice().sort((a, b) => {
      const na = a.numero == null ? Infinity : a.numero, nb = b.numero == null ? Infinity : b.numero;
      return na - nb || PLANL.ordenNatural(a.nombre, b.nombre);
    });
  }
  function mapaTopicTema(){
    const m = {};
    temasOrdenados(false).forEach(t => (t.topic_ids || []).forEach(tp => { if(!(tp in m)) m[tp] = t.id; }));
    return m;
  }
  function resultadosDeTest(id){
    return d.resultados.filter(r => r.test_id === id).sort((a, b) => String(a.realizado_at).localeCompare(String(b.realizado_at)));
  }
  function ultimoResultado(testId){ const l = resultadosDeTest(testId); return l[l.length - 1] || null; }
  function resultadoDeTarea(t){
    if(!t) return null;
    return resultadoDe(t.resultado_id) || d.resultados.filter(r => r.tarea_id === t.id).slice(-1)[0] || null;
  }
  function claveTest(plataforma, referencia, nombre){
    const r = String(referencia || '').trim();
    return plataforma + '|' + (r || String(nombre || '')).trim().toLowerCase();
  }
  function urlDeTest(test){
    if(!test) return null;
    const u = urlSegura(test.url);
    if(u) return u;
    return test.plataforma === 'tutor_bombero' ? PLANL.TB_URL : null;
  }
  function etiquetaPlataforma(p){
    const cls = p === 'tutor_bombero' ? 'tb' : p === 'pjfire' ? 'pj' : 'otra';
    return '<span class="pl-plat ' + cls + '">' + esc(PLANL.PLATAFORMAS[p] || 'Otra') + '</span>';
  }
  function textoResultado(r){
    if(!r) return '';
    const partes = [];
    if(r.nota != null) partes.push('Nota <b>' + nota2(r.nota) + '</b>');
    if(r.aciertos != null){
      partes.push('<span class="c-ok">' + n0(r.aciertos) + ' ✓</span>');
      if(r.fallos != null) partes.push('<span class="c-bad">' + n0(r.fallos) + ' ✗</span>');
      if(Number(r.blancos)) partes.push('<span class="c-pending">' + n0(r.blancos) + ' en blanco</span>');
    }
    if(r.aciertos != null && r.fallos == null && r.total != null) partes.push('<span class="c-pending">de ' + n0(r.total) + '</span>');
    return partes.join(' · ');
  }

  /* ---------- caché y cola en el dispositivo ---------- */
  function claveCache(u){ return 'plan_cache_v1_' + u; }
  function claveCola(u){ return 'plan_cola_v1_' + u; }
  function claveApertura(u){ return 'plan_apertura_v1_' + u; }
  // La copia local se guarda con un pequeño retraso (muchos cambios seguidos = una sola escritura).
  let temporizadorCache = null;
  function guardarCache(ya){
    if(!ya){ clearTimeout(temporizadorCache); temporizadorCache = setTimeout(() => guardarCache(true), 800); return; }
    const u = yo();
    if(!u || !cargado) return;
    try{ localStorage.setItem(claveCache(u), JSON.stringify({ at: Date.now(), d })); }catch(e){ /* sin espacio: da igual */ }
  }
  function leerCache(u){
    try{
      const c = JSON.parse(localStorage.getItem(claveCache(u)));
      return c && c.d ? c.d : null;
    }catch(e){ return null; }
  }
  function cola(u){
    u = u || yo();
    if(!u) return [];
    try{ return JSON.parse(localStorage.getItem(claveCola(u))) || []; }catch(e){ return []; }
  }
  // La cola no se recorta nunca. Si no cabe, se borra antes la caché (que se
  // puede volver a descargar) y, si aun así no cabe, se avisa.
  let avisoSinEspacio = false;
  function guardarCola(lista, u){
    u = u || yo();
    if(!u) return true;
    const txt = JSON.stringify(lista);
    try{ localStorage.setItem(claveCola(u), txt); return true; }catch(e){}
    try{ localStorage.removeItem(claveCache(u)); localStorage.setItem(claveCola(u), txt); return true; }catch(e){}
    if(!avisoSinEspacio){
      avisoSinEspacio = true;
      uiToast('No queda espacio en este dispositivo para guardar los cambios sin conexión. Conéctate para que se suban.', 'error');
    }
    return false;
  }

  // Aplica una operación a los datos en memoria (antes de subirla).
  function aplicarLocal(op){
    if(op.op === 'lote'){ (op.filas || []).forEach(f => aplicarLocal({ op: 'upsert', tabla: op.tabla, fila: f })); return; }
    if(op.tabla === 'plan_ajustes'){
      if(op.op === 'upsert') d.ajustes = Object.assign({}, op.fila);
      else if(op.op === 'update') d.ajustes = Object.assign({}, d.ajustes || {}, op.cambios);
      return;
    }
    const k = TABLAS[op.tabla];
    if(!k) return;
    const l = d[k];
    if(op.op === 'upsert' || op.op === 'evento'){
      const i = l.findIndex(x => x.id === op.fila.id);
      if(i >= 0){ if(op.op === 'upsert') l[i] = Object.assign({}, l[i], op.fila); }
      else if(op.op === 'evento') l.unshift(Object.assign({}, op.fila));
      else l.push(Object.assign({ created_at: ahoraIso() }, op.fila));
    } else if(op.op === 'update'){
      const x = l.find(r => r.id === op.id);
      if(x) Object.assign(x, op.cambios);
    } else if(op.op === 'delete'){
      d[k] = l.filter(r => r.id !== op.id);
      // Lo mismo que hace la base de datos al borrar (on delete …).
      if(op.tabla === 'plan_temas'){
        d.tests.forEach(t => { if(t.tema_id === op.id) t.tema_id = null; });
        d.preguntas.forEach(p => { if(p.tema_id === op.id) p.tema_id = null; });
      } else if(op.tabla === 'plan_tests'){
        d.tareas = d.tareas.filter(t => t.test_id !== op.id);
        d.resultados.forEach(r => { if(r.test_id === op.id) r.test_id = null; });
      } else if(op.tabla === 'plan_tareas'){
        d.resultados.forEach(r => { if(r.tarea_id === op.id) r.tarea_id = null; });
      }
    }
  }
  function limpiarFila(f){
    const o = {};
    Object.keys(f).forEach(k => { if(!NO_ENVIAR.includes(k)) o[k] = f[k]; });
    return o;
  }
  function encolar(op){
    const u = yo();
    if(!u) return;
    op.n = uid();
    aplicarLocal(op);
    if(!guardarCola(cola(u).concat([op]), u)) return;
    guardarCache();
    actualizarAviso();
    subir();
  }
  // ¿El error es por los datos (no se arreglará reintentando)? Cualquier 4xx
  // salvo 401 (sesión), 408 (tiempo) y 429 (demasiadas peticiones).
  function errorDeDatos(e, estado){
    const c = String((e && e.code) || '');
    if(estado >= 400 && estado < 500 && ![401, 408, 429].includes(estado)) return true;
    return /^(22|23)/.test(c) || c === '42501' || c === '42703' || /^PGRST(1|204)/.test(c);
  }
  function tablaFalta(e){
    const c = String((e && e.code) || '');
    return c === '42P01' || c === 'PGRST205' || /could not find the table|does not exist/i.test(String(e && e.message));
  }
  function mensajeError(e){
    const c = String((e && e.code) || '');
    if(c === '23505') return 'No se ha guardado un cambio del Plan: ya tienes uno igual (mismo nombre, identificador o fecha).';
    if(c === '23503') return 'No se ha guardado un cambio del Plan: lo que usaba ya no existe (quizá lo borraste en otro dispositivo).';
    if(c === '42501') return 'No se ha guardado un cambio del Plan: no tienes permiso para usarlo.';
    if(/^(22|23)/.test(c)) return 'No se ha guardado un cambio del Plan: algún dato no es válido.';
    return 'No se ha podido guardar un cambio del Plan. Inténtalo de nuevo.';
  }
  function conTiempo(promesa, ms){
    return Promise.race([promesa, new Promise(res => setTimeout(() => res({ error: { message: 'timeout', code: 'TIMEOUT' } }), ms))]);
  }
  async function ejecutar(op, u){
    let q;
    if(op.op === 'upsert') q = sb.from(op.tabla).upsert(limpiarFila(op.fila), { onConflict: op.tabla === 'plan_ajustes' ? 'user_id' : 'id' });
    else if(op.op === 'update') q = sb.from(op.tabla).update(limpiarFila(op.cambios)).eq('id', op.id).eq('user_id', u);
    else if(op.op === 'delete') q = sb.from(op.tabla).delete().eq('id', op.id).eq('user_id', u);
    else if(op.op === 'evento') q = sb.from('plan_eventos').upsert(limpiarFila(op.fila), { onConflict: 'id', ignoreDuplicates: true });
    else if(op.op === 'lote') q = sb.from(op.tabla).upsert((op.filas || []).map(limpiarFila), { onConflict: 'id', ignoreDuplicates: op.tabla === 'plan_eventos' });
    else return { ok: true };
    const r = await conTiempo(q, 30000);
    if(!r || !r.error) return { ok: true };
    if(tablaFalta(r.error)) return { red: true, error: r.error };   // falta la migración: se guarda para luego
    if(errorDeDatos(r.error, r.status)) return { datos: true, error: r.error };
    return { red: true, error: r.error };
  }
  // Sube la cola en orden, de una en una. Sin conexión, se para y reintenta.
  function subir(){
    if(subiendo){ repetirSubida = true; return subiendo; }
    subiendo = (async () => {
      do{
        repetirSubida = false;
        const u = yo();
        if(!u || !navigator.onLine) break;
        let l = cola(u);
        while(l.length){
          const op = l[0];
          let r;
          try{ r = await ejecutar(op, u); }catch(e){ r = { red: true, error: e }; }
          if(yo() !== u) return;
          if(r.red){ estancada = true; programarReintento(); actualizarAvisoCola(); return; }
          let sustituta = null;
          if(r.datos && String(r.error && r.error.code) === '23503' && op.tabla === 'plan_resultados' && op.op === 'upsert' && (op.fila.test_id || op.fila.tarea_id)){
            // El test o la tarea ya no existen: el resultado se guarda igualmente, sin ellos.
            sustituta = Object.assign({}, op, { n: uid(), fila: Object.assign({}, op.fila, { test_id: null, tarea_id: null }) });
          } else if(r.datos && op.op === 'lote' && (op.filas || []).length > 1){
            // Un lote rechazado se reparte en operaciones sueltas, para no perder las buenas.
            sustituta = op.filas.map(f => ({ op: op.tabla === 'plan_eventos' ? 'evento' : 'upsert', tabla: op.tabla, fila: f, n: uid() }));
          } else if(r.datos){
            uiToast(mensajeError(r.error), 'error');
            reportClientError('plan-guardar', op.op + ' ' + op.tabla + ': ' + (r.error && (r.error.code + ' ' + r.error.message)));
            recargarTrasSubir = true;
          }
          if(!r.datos) recordarSubida(op);
          l = cola(u);
          const i = l.findIndex(x => x.n === op.n);
          if(i >= 0) l.splice(i, 1, ...(sustituta ? [].concat(sustituta) : []));
          guardarCola(l, u);
          estancada = false;
        }
      }while(repetirSubida);
      if(recargarTrasSubir){ recargarTrasSubir = false; cargar(); }
    })().catch(() => {}).finally(() => { subiendo = null; actualizarAvisoCola(); });
    return subiendo;
  }
  // Lo subido en los últimos minutos se vuelve a aplicar al recargar: una
  // lectura que salió antes de que llegara (o la copia del service worker
  // si la red tardó) no debe deshacerlo en pantalla.
  let recientes = [];
  function recordarSubida(op){
    const ahora = Date.now();
    recientes = recientes.filter(x => ahora - x.at < 180000).concat([{ at: ahora, op }]);
  }
  let estancada = false;
  function actualizarAvisoCola(){
    if(visible() && pestana !== 'ajustes'){
      const el = document.getElementById('plAvisoCola');
      const n = cola().length;
      if(el) el.classList.toggle('hidden', !(n && (estancada || !navigator.onLine)));
      if(el && n) el.querySelector('span').textContent = plural(n, 'cambio pendiente', 'cambios pendientes') + ' de subir' + (navigator.onLine ? ': no se ha podido guardar todavía.' : ' (sin conexión).');
    }
  }
  function reintentarYa(){ estancada = false; subir(); }
  function programarReintento(){
    if(reintento) return;
    reintento = setTimeout(() => { reintento = null; if(cola().length) subir(); }, 30000);
  }
  window.addEventListener('online', () => { if(yo()) subir(); });

  /* ---------- API de escritura (optimista + cola) ---------- */
  function guardar(tabla, fila){
    const u = yo();
    if(!u) return Promise.resolve(null);
    const f = Object.assign({}, fila, { user_id: u });
    if(tabla !== 'plan_ajustes' && !f.id) f.id = uid();
    encolar({ op: 'upsert', tabla, fila: f });
    return Promise.resolve(f);
  }
  function cambiar(tabla, id, cambios){
    if(!yo() || !id) return Promise.resolve(null);
    encolar({ op: 'update', tabla, id, cambios: Object.assign({}, cambios) });
    return Promise.resolve(true);
  }
  function borrar(tabla, id){
    if(!yo() || !id) return Promise.resolve(null);
    encolar({ op: 'delete', tabla, id });
    return Promise.resolve(true);
  }
  function evento(tipo, o){
    const u = yo();
    if(!u) return;
    o = o || {};
    encolar({ op: 'evento', tabla: 'plan_eventos', fila: {
      id: uid(), user_id: u, tipo, tarea_id: o.tarea_id || null, test_id: o.test_id || null, at: ahoraIso(), datos: o.datos || {}
    } });
  }

  /* ---------- carga ---------- */
  async function todas(tabla, u, ordenar){
    const PAG = 1000;
    let filas = [];
    for(let desde = 0; desde < 50000; desde += PAG){
      let q = sb.from(tabla).select('*').eq('user_id', u);
      q = ordenar(q).range(desde, desde + PAG - 1);
      const { data, error } = await q;
      if(error) throw error;
      filas = filas.concat(data || []);
      if(!data || data.length < PAG) break;
    }
    return filas;
  }
  function cargar(){
    const u = yo();
    if(!u || !featureEnabled('plan')) return Promise.resolve();
    if(cargando) return cargando;
    cargando = (async () => {
      try{
        const porId = q => q.order('created_at').order('id');
        const [aj, temas, tests, tareas, resultados, eventos, preguntas] = await Promise.all([
          sb.from('plan_ajustes').select('*').eq('user_id', u).maybeSingle().then(r => { if(r.error) throw r.error; return r.data; }),
          todas('plan_temas', u, porId),
          todas('plan_tests', u, porId),
          todas('plan_tareas', u, q => q.order('fecha').order('orden').order('id')),
          todas('plan_resultados', u, q => q.order('realizado_at').order('id')),
          sb.from('plan_eventos').select('*').eq('user_id', u).order('at', { ascending: false }).limit(1000).then(r => { if(r.error) throw r.error; return r.data || []; }),
          todas('plan_preguntas', u, porId)
        ]);
        if(yo() !== u) return;
        d = { ajustes: aj, temas, tests, tareas, resultados, eventos, preguntas };
        // Lo subido hace un momento (por si la lectura salió antes) y lo que aún
        // no se ha subido siguen viéndose.
        const ahora = Date.now();
        recientes.filter(x => ahora - x.at < 180000).forEach(x => aplicarLocal(x.op));
        cola(u).forEach(aplicarLocal);
        cargado = true; errorCarga = null; duenio = u;
        guardarCache(true);
      }catch(e){
        if(yo() !== u) return;
        errorCarga = tablaFalta(e) ? 'sin_tablas' : (String(e && e.code) === '42501' ? 'sin_permiso' : 'red');
        if(errorCarga !== 'red') reportClientError('plan-cargar', String(e && (e.code + ' ' + e.message)));
      }finally{
        cargando = null;
      }
      actualizarAviso();
      if(visible()){
        if(escribiendo()) repintarAlSalir = true;
        else pintar();
      }
      subir();
      setTimeout(alVolver, 400);   // si la app se reabrió tras abrir un test, preguntar ahora
    })();
    return cargando;
  }
  // No se repinta mientras se escribe en un campo del plan (se perdería el foco y el teclado).
  let repintarAlSalir = false;
  function escribiendo(){
    const a = document.activeElement;
    return !!(a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) && a.closest && a.closest('#planRaiz'));
  }
  document.addEventListener('focusout', () => setTimeout(() => {
    if(repintarAlSalir && !escribiendo()){ repintarAlSalir = false; if(visible()) pintar(); }
  }, 200));
  // Con la copia del dispositivo se pinta al instante, sin esperar a la red.
  function cargarCacheLocal(){
    const u = yo();
    if(!u || cargado) return;
    const c = leerCache(u);
    if(!c) return;
    d = Object.assign(vacio(), c);
    cola(u).forEach(aplicarLocal);
    cargado = true; duenio = u;
  }
  function visible(){
    const s = document.getElementById('screen-plan');
    return !!(s && s.classList.contains('active'));
  }

  /* ---------- API de ciclo de vida ---------- */
  function abrir(){
    if(!yo() || !featureEnabled('plan')) return;
    cargarCacheLocal();
    pintar();
    cargar();
  }
  function alEntrar(){
    if(!yo() || !featureEnabled('plan')) { actualizarAviso(); return; }
    cargarCacheLocal();
    actualizarAviso();
    cargar();
  }
  function reiniciar(){
    if(duenio) escribirLocal(claveCache(duenio), null);
    d = vacio(); cargado = false; errorCarga = null; duenio = null; cargando = null; recientes = [];
    semanaVista = null; mesVista = null; filtroTests = '';
    if(hojaActual) hojaActual.cerrar();
    if(reintento){ clearTimeout(reintento); reintento = null; }
    const raiz = document.getElementById('planRaiz');
    if(raiz) raiz.innerHTML = '';
    actualizarAviso();
    if(typeof PLANX !== 'undefined' && PLANX.reiniciar) PLANX.reiniciar();
  }
  function alCambiarPermisos(){
    if(!featureEnabled('plan')){
      d = vacio(); cargado = false; errorCarga = null;
      actualizarAviso();
      return;
    }
    if(!cargado) alEntrar();
  }

  /* ---------- aviso en el menú ---------- */
  function pendientesHoy(){
    if(!cargado) return 0;
    const h = hoy();
    let n = d.tareas.filter(t => t.fecha === h && PLANL.abierta(t)).length;
    if(reglas().mostrar_atrasadas) n += PLANL.atrasadas(d.tareas, h).length;
    return n;
  }
  function actualizarAviso(){
    const el = document.getElementById('navPlanAviso');
    if(!el) return;
    const n = (yo() && featureEnabled('plan')) ? pendientesHoy() : 0;
    el.textContent = n > 99 ? '99+' : String(n);
    el.classList.toggle('hidden', !n);
  }

  /* ---------- hoja (diálogo) propia ---------- */
  function hoja(o){
    o = o || {};
    if(hojaActual) hojaActual.cerrar();
    const previo = document.activeElement;
    const bg = document.createElement('div');
    bg.className = 'pl-hoja-bg';
    bg.innerHTML = '<div class="pl-hoja' + (o.ancha ? ' ancha' : '') + '" role="dialog" aria-modal="true" aria-labelledby="plHojaTitulo" tabindex="-1">' +
      '<div class="pl-hoja-cab"><h2 id="plHojaTitulo"></h2><button type="button" class="pl-icono pl-hoja-x" aria-label="Cerrar">' + ICO.cerrar + '</button></div>' +
      '<div class="pl-hoja-cuerpo"></div><div class="pl-hoja-botones"></div></div>';
    const panel = bg.querySelector('.pl-hoja');
    bg.querySelector('h2').textContent = o.titulo || '';
    bg.querySelector('.pl-hoja-cuerpo').innerHTML = o.html || '';
    let cerrada = false;
    const api = { el: panel, cerrar };
    function cerrar(){
      if(cerrada) return;
      cerrada = true;
      document.removeEventListener('keydown', teclas, true);
      bg.remove();
      document.documentElement.classList.remove('pl-hoja-abierta');
      if(hojaActual === api) hojaActual = null;
      if(o.alCerrar) try{ o.alCerrar(); }catch(e){}
      if(previo && previo.focus && document.contains(previo)) try{ previo.focus({ preventScroll: true }); }catch(e){}
    }
    function teclas(ev){ if(ev.key === 'Escape'){ ev.preventDefault(); cerrar(); } }
    const caja = bg.querySelector('.pl-hoja-botones');
    (o.botones || []).forEach(b => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn ' + (b.clase === 'primario' ? 'btn-primary' : b.clase === 'peligro' ? 'btn-ghost pl-peligro' : 'btn-ghost');
      btn.textContent = b.texto;
      // Sin await antes de la acción: así window.open (abrir un test)
      // sigue dentro del toque y Safari no lo bloquea.
      btn.addEventListener('click', () => {
        let r;
        try{ r = b.accion ? b.accion(api) : undefined; }catch(e){ console.error(e); }
        if(r !== false) cerrar();
      });
      caja.appendChild(btn);
    });
    if(!caja.children.length) caja.remove();
    bg.querySelector('.pl-hoja-x').addEventListener('click', cerrar);
    bg.addEventListener('click', ev => { if(ev.target === bg) cerrar(); });
    document.addEventListener('keydown', teclas, true);
    document.body.appendChild(bg);
    document.documentElement.classList.add('pl-hoja-abierta');
    hojaActual = api;
    if(o.alAbrir) try{ o.alAbrir(panel, api); }catch(e){ console.error(e); }
    const foco = panel.querySelector('[autofocus]') || panel;
    try{ foco.focus({ preventScroll: true }); }catch(e){}
    return api;
  }

  /* ============================================================
     PINTAR
     ============================================================ */
  function pintar(){
    const raiz = document.getElementById('planRaiz');
    if(!raiz || !yo()) return;
    ultimoDiaPintado = hoy();
    if(!raiz.querySelector('.pl-cab')){
      raiz.innerHTML =
        '<div class="pl-cab"><h1>Plan de estudio</h1>' +
        '<button type="button" class="pl-icono" id="plBtnAjustes" onclick="PLAN.irA(\'ajustes\')" aria-label="Ajustes del plan" title="Ajustes">' + ICO.ajustes + '</button></div>' +
        '<div class="pl-pestanas" role="tablist" aria-label="Secciones del plan" id="plPestanas"></div>' +
        '<div id="plCuerpo"></div>';
    }
    pintarPestanas();
    const cuerpo = document.getElementById('plCuerpo');
    if(!cargado){
      if(errorCarga) cuerpo.innerHTML = htmlError();
      else cuerpo.innerHTML = '<div class="pl-card">' + skelList(4) + '</div>';
      return;
    }
    let html = '';
    if(errorCarga === 'red') html += '<div class="pl-aviso-linea">Sin conexión: ves lo último guardado en este dispositivo. Lo que cambies se subirá solo.</div>';
    html += '<div class="pl-aviso-linea hidden" id="plAvisoCola"><span></span> <button type="button" class="pl-enlace" onclick="PLAN.reintentarYa()">Reintentar ahora</button></div>';
    cuerpo.innerHTML = html + '<div id="plContenido"></div>';
    actualizarAvisoCola();
    const el = document.getElementById('plContenido');
    try{
      if(pestana === 'hoy') pintarHoy(el);
      else if(pestana === 'plan') pintarPlan(el);
      else if(pestana === 'tests') pintarTests(el);
      else if(pestana === 'ajustes') pintarAjustes(el);
      else if(pestana === 'examenes'){
        if(typeof PLANX !== 'undefined' && PLANX.render) PLANX.render(el);
        else el.innerHTML = '<div class="pl-vacio">Los exámenes no están disponibles.</div>';
      } else if(pestana === 'progreso'){
        if(typeof PLANP !== 'undefined' && PLANP.render) PLANP.render(el);
        else el.innerHTML = '<div class="pl-vacio">El progreso no está disponible.</div>';
      }
    }catch(e){
      console.error(e);
      reportClientError('plan-pintar', pestana + ': ' + (e && (e.message || e)), e && e.stack);
      el.innerHTML = '<div class="pl-card pl-error">Algo ha fallado al mostrar esta sección. <button type="button" class="btn btn-ghost" onclick="PLAN.repintar()">Reintentar</button></div>';
    }
  }
  function htmlError(){
    if(errorCarga === 'sin_tablas'){
      return '<div class="pl-card pl-error"><div class="pl-card-title">El Plan aún no está preparado</div>' +
        '<p>Falta crear sus tablas en la base de datos (la migración «plan_estudio» de Supabase). Cuando estén, esta pantalla funcionará sola.</p></div>';
    }
    if(errorCarga === 'sin_permiso'){
      return '<div class="pl-card pl-error"><div class="pl-card-title">Sin acceso al Plan</div><p>Tu cuenta no tiene activado el Plan de estudio.</p></div>';
    }
    return '<div class="pl-card pl-error"><div class="pl-card-title">No se ha podido cargar el plan</div>' +
      '<p>Comprueba la conexión.</p><button type="button" class="btn btn-ghost" onclick="PLAN.recargar()">Reintentar</button></div>';
  }
  function pintarPestanas(){
    const cont = document.getElementById('plPestanas');
    if(!cont) return;
    const nHoy = pendientesHoy();
    cont.innerHTML = PESTANAS.map(p =>
      '<button type="button" role="tab" id="plTab-' + p.id + '" aria-selected="' + (pestana === p.id) + '" class="' + (pestana === p.id ? 'on' : '') + '" ' +
      'onclick="PLAN.irA(\'' + p.id + '\')">' + p.texto + (p.id === 'hoy' && nHoy ? ' <span class="pl-num">' + nHoy + '</span>' : '') + '</button>'
    ).join('');
    cont.classList.toggle('hidden', pestana === 'ajustes');
    const btn = document.getElementById('plBtnAjustes');
    if(btn) btn.classList.toggle('hidden', pestana === 'ajustes');
  }
  function irA(p){
    if(p !== 'ajustes' && !PESTANAS.some(x => x.id === p)) p = 'hoy';
    pestana = p;
    escribirLocal('plan_pestana', p === 'ajustes' ? 'hoy' : p);
    if(!visible()){ showScreen('screen-plan'); return; }   // showScreen → abrir() → pintar()
    pintar();
    // Arriba del todo (con scrollIntoView el título quedaría bajo la cabecera fija).
    if(window.scrollY > 0) window.scrollTo(0, 0);
  }
  function repintar(){
    actualizarAviso();
    if(visible()) pintar();
  }

  /* ============================================================
     HOY
     ============================================================ */
  function pintarHoy(el){
    const h = hoy();
    const aj = ajustes();
    if(!d.temas.length && !d.tests.length){ el.innerHTML = htmlEmpezar(); return; }
    const deHoy = PLANL.ordenarDia(PLANL.tareasDelDia(d.tareas, h), h, aj.reglas);
    const hechas = deHoy.filter(t => t.estado === 'completado').length;
    const usados = deHoy.length;
    const enCurso = d.tareas.filter(t => t.estado === 'en_curso' && t.fecha <= h && (testDe(t.test_id) || {}).plataforma !== 'pjfire');
    const atr = aj.reglas.mostrar_atrasadas ? PLANL.atrasadas(d.tareas, h) : [];
    const pct = usados ? Math.round(hechas / usados * 100) : 0;

    let principal = '<div class="pl-dia-cab"><div><div class="pl-fecha">' + esc(capitalizar(PLANL.fechaLarga(h))) + '</div>' +
      '<div class="pl-dia-sub">' + (usados ? hechas + ' de ' + usados + ' hechas' : 'Nada planificado') + ' · límite ' + aj.limite_diario + ' al día' +
      (PLANL.esDiaDeEstudio(h, aj) ? '' : ' · hoy es de descanso') + '</div></div>' +
      (usados ? '<div class="pl-dia-pct" aria-hidden="true">' + pct + '%</div>' : '') + '</div>' +
      (usados ? '<div class="pl-bar" role="progressbar" aria-label="Tareas de hoy hechas" aria-valuemin="0" aria-valuemax="' + usados + '" aria-valuenow="' + hechas + '"><div class="pl-bar-fill" style="width:' + pct + '%"></div></div>' : '');

    // Lo que está abierto y pendiente de confirmar, lo primero.
    enCurso.forEach(t => {
      const test = testDe(t.test_id);
      if(!test) return;
      const cuando = t.abierta_at && Number.isFinite(msDe(t.abierta_at)) ? hace(Date.now() - msDe(t.abierta_at)) : 'hace un rato';
      principal += '<div class="pl-card pl-encurso"><div class="pl-encurso-txt"><b>¿Has terminado «' + esc(test.nombre) + '»?</b>' +
        '<span>Lo abriste ' + esc(cuando) + ' en ' + esc(PLANL.PLATAFORMAS[test.plataforma] || 'otra web') + '. Hasta que lo confirmes, sigue sin hacer.</span></div>' +
        '<div class="pl-acciones"><button type="button" class="btn btn-primary" onclick="PLAN.apuntarTarea(\'' + idAttr(t.id) + '\')">Apuntar resultado</button>' +
        '<button type="button" class="btn btn-ghost" onclick="PLAN.abrirTarea(\'' + idAttr(t.id) + '\', true)">Volver a abrir</button></div></div>';
    });

    if(deHoy.length){
      principal += '<ol class="pl-lista-hoy">' + deHoy.map((t, i) => htmlTarea(t, i + 1, h)).join('') + '</ol>';
    } else {
      principal += '<div class="pl-vacio"><p>' + (PLANL.esDiaDeEstudio(h, aj) ? 'Hoy no tienes ningún test planificado.' : 'Hoy es día de descanso en tu plan.') + '</p>' +
        '<div class="pl-acciones centro"><button type="button" class="btn btn-primary" onclick="PLAN.anadirTarea(\'' + h + '\')">Añadir un test a hoy</button>' +
        '<button type="button" class="btn btn-ghost" onclick="PLAN.planificarAuto()">Planificar automáticamente</button></div></div>';
    }
    const puede = PLANL.puedeAnadir(d.tareas, h, aj);
    if(deHoy.length && puede.ok){
      principal += '<button type="button" class="pl-anadir" onclick="PLAN.anadirTarea(\'' + h + '\')">+ Añadir un test a hoy (' + (aj.limite_diario - usados) + ' libre' + (aj.limite_diario - usados === 1 ? '' : 's') + ')</button>';
    }

    let lado = '';
    if(atr.length){
      lado += '<section class="pl-card pl-atrasadas"><h2 class="pl-seccion">Atrasadas <span class="pl-num">' + atr.length + '</span></h2>' +
        atr.slice(0, 12).map(t => htmlAtrasada(t, h, puede.ok)).join('') +
        (atr.length > 12 ? '<p class="pl-pie">Y ' + (atr.length - 12) + ' más. «Planificar automáticamente» las recoloca.</p>' : '') + '</section>';
    }
    if(puede.ok) lado += htmlSugerencias(h);
    lado += '<p class="pl-nota-honesta">pj.fire solo controla lo que abres desde aquí: no puede bloquear Tutor Bombero si entras directamente. Abrir un test no cuenta como hecho hasta que lo confirmas.</p>';

    el.innerHTML = '<div class="pl-hoy"><div class="pl-col-main">' + principal + '</div><aside class="pl-col-lado">' + lado + '</aside></div>';
  }
  function capitalizar(s){ return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
  function htmlEmpezar(){
    return '<div class="pl-card pl-empezar"><div class="pl-card-title">Empieza en tres pasos</div><ol>' +
      '<li><b>Crea tus temas</b> de la oposición (puedes pegarlos todos de golpe).</li>' +
      '<li><b>Añade tus tests</b>: los de Tutor Bombero (nombre e identificador) y, si quieres, tests de tu banco de pj.fire.</li>' +
      '<li><b>Planifica</b>: elige tu límite diario y deja que el plan reparta los tests por días.</li></ol>' +
      '<div class="pl-acciones"><button type="button" class="btn btn-primary" onclick="PLAN.crearVariosTemas()">Crear mis temas</button>' +
      '<button type="button" class="btn btn-ghost" onclick="PLAN.irA(\'tests\')">Ir a Tests</button></div></div>';
  }
  function htmlTarea(t, n, h){
    const test = testDe(t.test_id) || { nombre: '(test borrado)', plataforma: 'otra' };
    const res = resultadoDeTarea(t);
    const estado = t.estado;
    let boton;
    if(estado === 'completado') boton = '<button type="button" class="btn btn-ghost" onclick="PLAN.verTarea(\'' + idAttr(t.id) + '\')">Ver</button>';
    else if(estado === 'en_curso' && test.plataforma !== 'pjfire') boton = '<button type="button" class="btn btn-primary" onclick="PLAN.apuntarTarea(\'' + idAttr(t.id) + '\')">Apuntar resultado</button>';
    else boton = '<button type="button" class="btn btn-primary" onclick="PLAN.abrirTarea(\'' + idAttr(t.id) + '\')">' + (estado === 'en_curso' ? 'Seguir' : 'Abrir') + ' ' + (test.plataforma === 'pjfire' ? '' : ICO.externo) + '</button>';
    const ref = test.referencia ? '<span class="pl-ref">Busca: «' + esc(test.referencia) + '»</span>' : '';
    const meta = [etiquetaPlataforma(test.plataforma)];
    if(t.prioridad === 1) meta.push('<span class="pl-prio alta">Prioridad alta</span>');
    else if(t.prioridad === 3) meta.push('<span class="pl-prio baja">Prioridad baja</span>');
    if(estado !== 'pendiente') meta.push('<span class="pl-estado ' + claseEstado(estado) + '">' + esc(PLANL.ESTADOS[estado] || estado) + (estado === 'aplazado' && Number(t.veces_aplazada) > 1 ? ' ×' + n0(t.veces_aplazada) : '') + '</span>');
    if(t.origen === 'excepcion') meta.push('<span class="pl-estado excepcion">Excepción</span>');
    if(t.origen === 'repaso') meta.push('<span class="pl-estado repaso">Repaso</span>');
    return '<li class="pl-tarea ' + claseEstado(estado) + '">' +
      '<span class="pl-tarea-num" aria-hidden="true">' + (estado === 'completado' ? ICO.check : n) + '</span>' +
      '<div class="pl-tarea-cuerpo"><div class="pl-tarea-tema">' + esc(nombreTema(test.tema_id)) + '</div>' +
      '<div class="pl-tarea-nombre">' + esc(test.nombre) + '</div>' +
      '<div class="pl-tarea-meta">' + meta.join('') + ref + '</div>' +
      (res ? '<div class="pl-tarea-res">' + textoResultado(res) + '</div>' : (estado === 'completado' ? '<div class="pl-tarea-res">Hecho, sin nota apuntada.</div>' : '')) +
      (estado === 'en_curso' && test.plataforma === 'tutor_bombero' && !urlSegura(test.url) ? '<div class="pl-pista">En Tutor Bombero no hay enlaces directos a cada test: entra y busca «' + esc(test.referencia || test.nombre) + '».</div>' : '') +
      '</div><div class="pl-tarea-acc">' + boton +
      '<button type="button" class="pl-icono" onclick="PLAN.menuTarea(\'' + idAttr(t.id) + '\')" aria-label="Más opciones de ' + esc(test.nombre) + '">' + ICO.mas + '</button></div></li>';
  }
  function htmlAtrasada(t, h, cabeHoy){
    const test = testDe(t.test_id) || { nombre: '(test borrado)' };
    const dias = PLANL.diasEntre(t.fecha, h);
    return '<div class="pl-fila"><div class="pl-fila-txt"><b>' + esc(test.nombre) + '</b><span>' + esc(nombreTema(test.tema_id)) + ' · era para ' +
      esc(PLANL.fechaCorta(t.fecha)) + ' (' + (dias === 1 ? 'ayer' : 'hace ' + dias + ' días') + ')</span></div>' +
      '<div class="pl-acciones">' + (cabeHoy ? '<button type="button" class="btn btn-ghost" onclick="PLAN.moverTarea(\'' + idAttr(t.id) + '\', \'' + h + '\')">Hacer hoy</button>' : '') +
      '<button type="button" class="pl-icono" onclick="PLAN.menuTarea(\'' + idAttr(t.id) + '\')" aria-label="Opciones de ' + esc(test.nombre) + '">' + ICO.mas + '</button></div></div>';
  }
  function htmlSugerencias(h){
    const aj = ajustes();
    const items = [];
    const reps = PLANL.proponerRepasos({ temas: d.temas, tests: d.tests, tareas: d.tareas, resultados: d.resultados, hoy: h, ajustes: aj, mapaTopicTema: mapaTopicTema() });
    reps.slice(0, 3).forEach(r => {
      const tema = nombreTema(r.tema_id);
      if(r.test_id){
        const test = testDe(r.test_id);
        if(test) items.push('<div class="pl-fila"><div class="pl-fila-txt"><b>Repasar: ' + esc(test.nombre) + '</b><span>' + esc(tema) + ' · ' + esc(r.motivo) + '</span></div>' +
          '<button type="button" class="btn btn-ghost" onclick="PLAN.programarRepaso(\'' + idAttr(test.id) + '\')">Añadir a hoy</button></div>');
      } else if((temaDe(r.tema_id) || {}).topic_ids && temaDe(r.tema_id).topic_ids.length){
        items.push('<div class="pl-fila"><div class="pl-fila-txt"><b>Repasar fallos de ' + esc(tema) + '</b><span>' + esc(r.motivo) + '. Test de fallos de tu banco.</span></div>' +
          '<button type="button" class="btn btn-ghost" onclick="PLAN.repasoFallos(\'' + idAttr(r.tema_id) + '\')">Añadir a hoy</button></div>');
      }
    });
    const prop = PLANL.proponerPlan({ tests: d.tests, tareas: d.tareas, resultados: d.resultados, temas: d.temas, ajustes: Object.assign({}, aj, { reglas: Object.assign({}, aj.reglas, { mostrar_atrasadas: false }) }), desde: h, dias: 1, hoy: h });
    prop.nuevas.slice(0, 3).forEach(n => {
      const test = testDe(n.test_id);
      if(test) items.push('<div class="pl-fila"><div class="pl-fila-txt"><b>' + esc(test.nombre) + '</b><span>' + esc(nombreTema(test.tema_id)) + ' · sin hacer todavía</span></div>' +
        '<button type="button" class="btn btn-ghost" onclick="PLAN.programarHoy(\'' + idAttr(test.id) + '\')">Añadir a hoy</button></div>');
    });
    if(!items.length) return '';
    return '<section class="pl-card"><h2 class="pl-seccion">Sugerencias para hoy</h2>' + items.join('') + '</section>';
  }

  /* ---------- acciones sobre tareas ---------- */
  function abrirTarea(id, forzar){
    const t = tareaDe(id);
    if(!t) return;
    const test = testDe(t.test_id);
    if(!test){ uiToast('Este test ya no existe.', 'error'); return; }
    if(t.estado === 'completado' && !forzar){ verTarea(id); return; }
    if(t.fecha === hoy() || forzar){ lanzar(test, t); return; }
    abrirTest(test.id);   // de otro día: pasa por los avisos del plan
  }
  // Abrir un test desde el catálogo (o una tarea de otro día): primero las reglas.
  function abrirTest(testId){
    const test = testDe(testId);
    if(!test) return;
    const h = hoy();
    const ev = PLANL.evaluarApertura({ test, tareas: d.tareas, resultados: d.resultados, hoy: h, ajustes: d.ajustes });
    if(ev.tipo === 'en_plan'){ lanzar(test, ev.tarea); return; }
    if(ev.tipo === 'libre'){ lanzar(test, null); return; }
    if(ev.tipo === 'fuera_plan'){
      evento('aviso_fuera_plan', { test_id: test.id, datos: { otra: ev.otra ? ev.otra.fecha : null } });
      const otra = ev.otra ? (ev.otra.fecha > h ? 'Lo tienes programado para el ' + PLANL.fechaLarga(ev.otra.fecha) + '.' : 'Se te quedó pendiente del ' + PLANL.fechaLarga(ev.otra.fecha) + '.') : 'No lo tienes programado ningún día.';
      const botones = [{ texto: 'Ver mis tareas de hoy', clase: 'primario', accion: () => irA('hoy') }];
      const otraEsAbierta = ev.otra && PLANL.abierta(ev.otra);
      const aHoy = excepcion => {
        let t;
        if(otraEsAbierta){
          // Ya estaba programado otro día: se trae a hoy (no se crea otra tarea).
          const cambios = { fecha: h, orden: siguienteOrden(h), estado: 'aplazado', veces_aplazada: Math.min(999, (Number(ev.otra.veces_aplazada) || 0) + 1), abierta_at: null };
          if(excepcion) cambios.origen = 'excepcion';
          cambiar('plan_tareas', ev.otra.id, cambios);
          evento('aplazado', { tarea_id: ev.otra.id, test_id: test.id, datos: { de: ev.otra.fecha, a: h } });
          t = tareaDe(ev.otra.id);
        } else t = crearTareaHoy(test, excepcion ? 'excepcion' : 'plan');
        if(excepcion) evento('excepcion', { tarea_id: t && t.id, test_id: test.id, datos: { motivo: 'limite' } });
        lanzar(test, t);
      };
      const verbo = otraEsAbierta ? 'Pasarlo a hoy' : 'Añadirlo a hoy';
      if(ev.puedeAnadirHoy) botones.push({ texto: verbo + ' y abrirlo', accion: () => aHoy(false) });
      else botones.push({ texto: verbo + ' como excepción', accion: () => aHoy(true) });
      botones.push({ texto: 'Abrirlo sin añadirlo (excepción)', accion: () => {
        evento('excepcion', { test_id: test.id, datos: { motivo: 'fuera_plan' } });
        lanzar(test, null, { excepcion: true });
      } });
      hoja({ titulo: 'Este test no está en tu plan de hoy', botones,
        html: '<p class="pl-hoja-txt"><b>' + esc(test.nombre) + '</b> · ' + esc(nombreTema(test.tema_id)) + '</p><p class="pl-hoja-txt">' + esc(otra) + '</p>' +
          (ev.puedeAnadirHoy ? '' : '<p class="pl-hoja-txt">Hoy ya tienes ' + ev.usados + ' de ' + ev.limite + ' tests (tu límite diario).</p>') +
          '<p class="pl-hoja-txt pl-suave">Si lo abres igualmente, queda apuntado como excepción.</p>' });
      return;
    }
    // repetido o completado hoy
    evento('aviso_repetido', { test_id: test.id, tarea_id: ev.tarea ? ev.tarea.id : null });
    const r = ev.resultado;
    const cuando = r && r.realizado_at ? PLANL.fechaLarga(diaDeIso(r.realizado_at)) : (ev.tarea ? PLANL.fechaLarga(diaDeIso(ev.tarea.completada_at) || ev.tarea.fecha) : '');
    hoja({ titulo: ev.tipo === 'completado_hoy' ? 'Ya lo has hecho hoy' : 'Ya hiciste este test',
      html: '<p class="pl-hoja-txt"><b>' + esc(test.nombre) + '</b> · ' + esc(nombreTema(test.tema_id)) + '</p>' +
        '<p class="pl-hoja-txt">Lo hiciste el ' + esc(cuando) + (r ? ': ' + textoResultado(r) : '') + '.</p>' +
        '<p class="pl-hoja-txt pl-suave">¿Seguro que quieres repetirlo? Quizá lo abriste por error.</p>',
      botones: [
        { texto: 'No, volver', clase: 'primario' },
        { texto: 'Sí, repetirlo', accion: () => {
          evento('excepcion', { test_id: test.id, datos: { motivo: 'repetir' } });
          const deHoy = d.tareas.find(t => t.test_id === test.id && t.fecha === hoy() && PLANL.abierta(t));
          lanzar(test, deHoy || null, { excepcion: true });
        } }
      ] });
  }
  // Crea (si cabe en la base: mismo test, mismo día no) la tarea de hoy, sin preguntar.
  function crearTareaHoy(test, origen){
    const h = hoy();
    const ya = d.tareas.find(t => t.test_id === test.id && t.fecha === h);
    if(ya){
      if(ya.estado === 'completado') cambiar('plan_tareas', ya.id, { estado: 'pendiente', completada_at: null });
      return ya;
    }
    const t = { id: uid(), test_id: test.id, fecha: h, orden: siguienteOrden(h), prioridad: 2, estado: 'pendiente', origen: origen || 'plan', veces_aplazada: 0 };
    guardar('plan_tareas', t);
    return tareaDe(t.id) || t;
  }
  function siguienteOrden(dia){
    return PLANL.tareasDelDia(d.tareas, dia).reduce((m, t) => Math.max(m, Number(t.orden) || 0), 0) + 1;
  }
  // Abre de verdad el test. Para Tutor Bombero u otra web, window.open va
  // lo primero y sin esperas: dentro del toque, o Safari lo bloquea.
  function lanzar(test, tarea, opts){
    opts = opts || {};
    if(test.plataforma === 'pjfire'){ lanzarPjfire(test, tarea, opts); return; }
    const url = urlDeTest(test);
    if(!url){ uiToast('Este test no tiene enlace. Añádelo en «Editar» para poder abrirlo desde aquí.', 'error'); editarTest(test.id); return; }
    try{ window.open(url, '_blank', 'noopener'); }catch(e){}
    const u = yo();
    if(tarea && tarea.estado !== 'completado') cambiar('plan_tareas', tarea.id, { estado: 'en_curso', abierta_at: ahoraIso() });
    evento('abierto', { tarea_id: tarea ? tarea.id : null, test_id: test.id, datos: { plataforma: test.plataforma, excepcion: !!opts.excepcion } });
    escribirLocal(claveApertura(u), JSON.stringify({ tarea_id: tarea ? tarea.id : null, test_id: test.id, at: Date.now() }));
    if(test.plataforma === 'tutor_bombero' && !urlSegura(test.url)){
      uiToast('Se abre Tutor Bombero: entra y busca «' + (test.referencia || test.nombre) + '». Al volver, apunta el resultado.', 'info', { duration: 6000 });
    }
    repintar();
  }
  function lanzarPjfire(test, tarea, opts){
    if(quizState && quizState.mode){
      hoja({ titulo: 'Tienes un test a medias',
        html: '<p class="pl-hoja-txt">Termina (o abandona) el test que tienes empezado antes de empezar otro.</p>',
        botones: [{ texto: 'Seguir con ese test', clase: 'primario', accion: () => resumeQuiz() }, { texto: 'Ahora no' }] });
      return;
    }
    if(whenAppDataReady(() => lanzarPjfire(test, tarea, opts))) return;
    const cfg = test.config || {};
    const tema = temaDe(test.tema_id);
    const topics = (Array.isArray(cfg.topic_ids) && cfg.topic_ids.length) ? cfg.topic_ids : ((tema && tema.topic_ids) || []);
    if(!topics.length){
      uiToast('Este test de pj.fire no tiene temas del banco. Edítalo y elige de qué temas son las preguntas.', 'error');
      editarTest(test.id);
      return;
    }
    const modo = ['estudio', 'examen', 'fallos'].includes(cfg.modo) ? cfg.modo : 'estudio';
    let pool = QUESTIONS_POOL.filter(q => topics.includes(q.topic_id));
    if(modo === 'fallos') pool = pool.filter(q => q.masteryStatus === 'red' && !q.fallosHidden);
    if(!pool.length){
      uiToast(modo === 'fallos' ? 'No tienes fallos pendientes en esos temas. ¡Bien!' : 'No hay preguntas de esos temas en el banco.', modo === 'fallos' ? 'success' : 'error');
      return;
    }
    const n = Math.max(1, Math.min(200, Number(cfg.n) || Number(test.num_preguntas) || 20));
    const preguntas = shuffleArray(pool).slice(0, n);
    if(tarea && tarea.estado !== 'completado') cambiar('plan_tareas', tarea.id, { estado: 'en_curso', abierta_at: ahoraIso() });
    evento('abierto', { tarea_id: tarea ? tarea.id : null, test_id: test.id, datos: { plataforma: 'pjfire', modo, excepcion: !!opts.excepcion } });
    const minutos = modo === 'examen' && Number(cfg.minutos) > 0 ? Number(cfg.minutos) : null;
    startQuiz(modo, preguntas, minutos, { plan: { tarea_id: tarea ? tarea.id : null, test_id: test.id } });
  }

  // Lo llama finishQuizInner (examen-revision.js) al terminar un test lanzado desde aquí.
  function alTerminarTest(info){
    const u = yo();
    if(!u || !info || !info.ctx) return;
    if(!cargado) cargarCacheLocal();
    const ctx = info.ctx;
    const total = Number(info.total) || 0;
    if(!total){
      uiToast('No has respondido ninguna pregunta: no se apunta en tu plan.', 'info');
      return;
    }
    const mapa = mapaTopicTema();
    const seg = Math.round(Number(info.elapsedSec) || 0);
    // Tiempo de reloj del test: solo si no se dejó a medias y se siguió después
    // (entonces incluiría el rato con la app cerrada).
    const dur = !info.reanudado && seg > 0 && seg <= 3 * 3600 ? seg : null;
    // Si la tarea o el test ya no existen (quitados mientras tanto), el resultado se guarda sin ellos.
    const existe = (id, de) => esUuid(id) && (!cargado || !!de(id));
    const res = {
      id: uid(), test_id: existe(ctx.test_id, testDe) ? ctx.test_id : null, tarea_id: existe(ctx.tarea_id, tareaDe) ? ctx.tarea_id : null,
      fuente: 'pjfire', realizado_at: ahoraIso(),
      aciertos: Math.min(1000, Number(info.ok) || 0), fallos: Math.min(1000, Number(info.bad) || 0), blancos: Math.min(1000, Number(info.blank) || 0),
      total: Math.min(1000, total), nota: Math.round(Math.max(0, Math.min(10, Number(info.nota) || 0)) * 100) / 100,
      duracion_seg: dur, duracion_medida: dur != null,
      session_id: esUuid(info.sessionId) ? info.sessionId : null,
      detalle: (info.preguntas || []).slice(0, 300).map(p => ({ k: 'b:' + p.id, t: mapa[p.topic_id] || null, f: 'pjfire', ok: p.ok === true ? true : p.ok === false ? false : null }))
    };
    guardar('plan_resultados', res);
    if(res.tarea_id) cambiar('plan_tareas', res.tarea_id, { estado: 'completado', completada_at: ahoraIso(), resultado_id: res.id });
    evento('completado', { tarea_id: res.tarea_id, test_id: res.test_id, datos: { fuente: 'pjfire', nota: res.nota } });
    uiToast('Apuntado en tu plan.', 'success', { action: 'Ver plan', onAction: () => { pestana = 'hoy'; showScreen('screen-plan'); } });
  }

  /* ---------- ¿lo has terminado? (al volver a la app) ---------- */
  function leerApertura(){
    const u = yo();
    if(!u) return null;
    try{ return JSON.parse(leerLocal(claveApertura(u))); }catch(e){ return null; }
  }
  function alVolver(){
    if(document.visibilityState !== 'visible' || !yo() || !featureEnabled('plan')) return;
    if(cargado && ultimoDiaPintado && ultimoDiaPintado !== hoy()) repintar();   // ha cambiado el día
    if(cargado) subir();
    const ap = leerApertura();
    if(!ap || !ap.at) return;
    const pasado = Date.now() - ap.at;
    if(pasado < VUELTA_MIN_MS) return;
    if(pasado > VUELTA_MAX_MS){ escribirLocal(claveApertura(yo()), null); return; }
    if(!cargado || hojaActual || document.querySelector('.ui-confirm-bg')) return;
    if(document.querySelector('#screen-quiz.active, #screen-plan-examen.active')) return;
    const t = ap.tarea_id ? tareaDe(ap.tarea_id) : null;
    const test = testDe(ap.test_id);
    escribirLocal(claveApertura(yo()), null);   // una vez por vuelta
    if(!test || (t && t.estado === 'completado')) return;
    hoja({ titulo: '¿Has terminado «' + test.nombre + '»?',
      html: '<p class="pl-hoja-txt">Lo abriste ' + esc(hace(pasado)) + ' en ' + esc(PLANL.PLATAFORMAS[test.plataforma] || 'otra web') + '. Abrirlo no cuenta como hecho: confírmalo y, si puedes, apunta cuánto sacaste.</p>',
      botones: [
        { texto: 'Sí, apuntar resultado', clase: 'primario', accion: () => { apuntarResultado(t, test); } },
        { texto: 'Aún no', accion: () => { escribirLocal(claveApertura(yo()), JSON.stringify(ap)); } },
        t ? { texto: 'Lo dejo para otro día', accion: () => { aplazar(t.id); } } : null
      ].filter(Boolean) });
  }
  document.addEventListener('visibilitychange', alVolver);
  window.addEventListener('pageshow', () => setTimeout(alVolver, 300));
  window.addEventListener('focus', () => setTimeout(alVolver, 300));

  /* ---------- apuntar resultado ---------- */
  function apuntarTarea(id){
    const t = tareaDe(id);
    if(!t) return;
    apuntarResultado(t, testDe(t.test_id), { resultado: resultadoDeTarea(t) });
  }
  function verTarea(id){
    const t = tareaDe(id);
    if(!t) return;
    const test = testDe(t.test_id) || { nombre: '(test borrado)' };
    const r = resultadoDeTarea(t);
    hoja({ titulo: test.nombre,
      html: '<p class="pl-hoja-txt">' + esc(nombreTema(test.tema_id)) + ' · ' + etiquetaPlataforma(test.plataforma) + '</p>' +
        '<p class="pl-hoja-txt">Hecho' + (diaDeIso(t.completada_at) ? ' el ' + esc(PLANL.fechaLarga(diaDeIso(t.completada_at))) : '') + '.</p>' +
        (r ? '<p class="pl-hoja-txt">' + textoResultado(r) + (Number(r.duracion_seg) ? ' · ' + Math.round(Number(r.duracion_seg) / 60) + ' min' + (r.duracion_medida ? ' (medido)' : '') : '') + '</p>' : '<p class="pl-hoja-txt pl-suave">Sin nota apuntada.</p>') +
        (r && r.notas ? '<p class="pl-hoja-txt">' + esc(r.notas) + '</p>' : ''),
      botones: [
        { texto: r ? 'Editar resultado' : 'Apuntar resultado', clase: 'primario', accion: () => { apuntarResultado(t, testDe(t.test_id), { resultado: r }); } },
        { texto: 'Repetir el test', accion: () => {
          const test = testDe(t.test_id);
          if(!test) return;
          evento('excepcion', { tarea_id: t.id, test_id: test.id, datos: { motivo: 'repetir' } });
          lanzar(test, null, { excepcion: true });
        } },
        { texto: 'Cerrar' }
      ] });
  }
  // Hoja para apuntar (o corregir) un resultado: a mano o pegándolo.
  function apuntarResultado(tarea, test, opts){
    opts = opts || {};
    if(!test){ uiToast('Este test ya no existe.', 'error'); return; }
    const r0 = opts.resultado || null;
    const pre = Object.assign({}, r0 || {}, opts.prefill || {});
    const fechaLocal = (iso => {
      const x = iso ? new Date(iso) : new Date();
      const off = x.getTimezoneOffset() * 60000;
      return new Date(x.getTime() - off).toISOString().slice(0, 16);
    })(pre.realizado_at);
    const v = k => pre[k] == null ? '' : String(pre[k]).replace('.', ',');
    const campo = (k, etiqueta, extra) => '<label class="pl-campo"><span>' + etiqueta + '</span><input class="pl-input" inputmode="numeric" pattern="[0-9]*" name="' + k + '" value="' + esc(v(k)) + '" autocomplete="off" ' + (extra || '') + '></label>';
    hoja({ titulo: r0 ? 'Editar resultado' : 'Apuntar resultado',
      html: '<p class="pl-hoja-txt"><b>' + esc(test.nombre) + '</b> · ' + esc(nombreTema(test.tema_id)) + '</p>' +
        '<button type="button" class="btn btn-ghost pl-pegar" data-accion="pegar">Pegar resultado copiado</button>' +
        '<div class="pl-pegar-manual hidden"><label class="pl-campo"><span>Pega aquí el texto del resultado</span><textarea class="pl-input" rows="3" name="pegado" placeholder="Por ejemplo: Aciertos 18 · Fallos 7 · En blanco 5"></textarea></label></div>' +
        '<p class="pl-pegado-aviso pl-suave" aria-live="polite"></p>' +
        '<div class="pl-rejilla">' + campo('aciertos', 'Aciertos', 'autofocus') + campo('fallos', 'Fallos') + campo('blancos', 'En blanco') + campo('total', 'Total') + '</div>' +
        '<div class="pl-rejilla dos"><label class="pl-campo"><span>Nota (sobre 10)</span><input class="pl-input" inputmode="decimal" name="nota" value="' + esc(v('nota')) + '" autocomplete="off"></label>' +
        '<label class="pl-campo"><span>Minutos (opcional)</span><input class="pl-input" inputmode="numeric" pattern="[0-9]*" name="minutos" value="' + (pre.duracion_seg && !pre.duracion_medida ? Math.round(pre.duracion_seg / 60) : '') + '" autocomplete="off"></label></div>' +
        '<p class="pl-nota-calc pl-suave" aria-live="polite"></p>' +
        '<label class="pl-campo"><span>Cuándo lo hiciste</span><input class="pl-input" type="datetime-local" name="cuando" value="' + esc(fechaLocal) + '"></label>' +
        '<label class="pl-campo"><span>Notas (opcional)</span><input class="pl-input" name="notas" maxlength="1000" value="' + esc(pre.notas || '') + '"></label>' +
        '<p class="pl-error-form" role="alert"></p>',
      botones: [
        { texto: 'Guardar', clase: 'primario', accion: api => guardarResultadoForm(api, tarea, test, r0) },
        (tarea && !r0 && tarea.estado !== 'completado') ? { texto: 'Lo terminé, sin nota', accion: () => { completarSinNota(tarea, test); } } : null,
        { texto: 'Cancelar' }
      ].filter(Boolean),
      alAbrir: panel => {
        const f = n => panel.querySelector('[name="' + n + '"]');
        const calc = panel.querySelector('.pl-nota-calc');
        const actualizar = () => {
          const c = cuentas(enteroONull(f('aciertos').value), enteroONull(f('fallos').value), enteroONull(f('blancos').value), enteroONull(f('total').value));
          if(!c || c.a == null){ calc.textContent = ''; return; }
          if(c.f == null){ calc.textContent = 'Para calcular la nota hacen falta los fallos (o el total y los en blanco). También puedes escribir la nota.'; return; }
          const n = PLANL.notaDe(c.a, c.f, c.b || 0);
          calc.textContent = n == null ? '' : 'Nota calculada: ' + formatNota(n) + ' (cada fallo resta ⅓ de acierto). Si la plataforma te da otra, escríbela arriba.';
        };
        panel.querySelectorAll('input').forEach(i => i.addEventListener('input', actualizar));
        actualizar();
        const rellenar = res => {
          const aviso = panel.querySelector('.pl-pegado-aviso');
          const enc = [];
          ['aciertos', 'fallos', 'blancos', 'total', 'nota'].forEach(k => {
            if(res[k] != null){ f(k).value = String(res[k]).replace('.', ','); f(k).classList.add('pl-rellenado'); enc.push(k === 'blancos' ? 'en blanco' : k); }
          });
          aviso.textContent = enc.length ? 'Encontrado: ' + enc.join(', ') + '. Revísalo antes de guardar.' : 'No he encontrado números de resultado en ese texto. Escríbelos a mano.';
          actualizar();
        };
        panel.querySelector('[data-accion="pegar"]').addEventListener('click', async () => {
          let texto = null;
          try{ if(navigator.clipboard && navigator.clipboard.readText) texto = await navigator.clipboard.readText(); }catch(e){}
          if(texto && texto.trim()){ rellenar(PLANL.parsearResultado(texto)); return; }
          panel.querySelector('.pl-pegar-manual').classList.remove('hidden');
          const ta = f('pegado');
          ta.focus();
          ta.addEventListener('input', () => rellenar(PLANL.parsearResultado(ta.value)));
        });
      } });
  }
  // Completa aciertos, fallos, blancos y total con lo que se pueda deducir, sin inventar.
  function cuentas(a, f, b, t){
    if([a, f, b, t].some(x => Number.isNaN(x))) return null;
    if(f == null && t != null && a != null && b != null && t - a - b >= 0) f = t - a - b;
    if(b == null && t != null && a != null && f != null && t - a - f >= 0) b = t - a - f;
    if(t == null && a != null && f != null) t = a + f + (b || 0);
    return { a, f, b, t };
  }
  function guardarResultadoForm(api, tarea, test, r0){
    const panel = api.el;
    const f = n => panel.querySelector('[name="' + n + '"]').value.trim();
    const err = panel.querySelector('.pl-error-form');
    let nota = numeroONull(f('nota'));
    const minutos = enteroONull(f('minutos'));
    const c = cuentas(enteroONull(f('aciertos')), enteroONull(f('fallos')), enteroONull(f('blancos')), enteroONull(f('total')));
    if(!c || Number.isNaN(minutos) || Number.isNaN(nota)){ err.textContent = 'Revisa los números: solo cifras, sin negativos.'; return false; }
    const { a, f: fa, b, t: tot } = c;
    if(a == null && nota == null){ err.textContent = 'Escribe al menos los aciertos o la nota (o usa «Lo terminé, sin nota»).'; return false; }
    if(a != null && fa == null && tot == null && nota == null){ err.textContent = 'Con solo los aciertos no se sabe cómo te fue: añade los fallos o el total (o la nota).'; return false; }
    if(nota != null && (nota < 0 || nota > 10)){
      if(nota > 10 && nota <= 100) nota = nota / 10;   // nota sobre 100
      else { err.textContent = 'La nota tiene que estar entre 0 y 10.'; return false; }
    }
    const suma = (a || 0) + (fa || 0) + (b || 0);
    if(tot != null && suma > tot){ err.textContent = 'Aciertos + fallos + en blanco no puede pasar del total (' + tot + ').'; return false; }
    if(tot === 0 || (a != null && suma === 0 && tot == null && nota == null)){ err.textContent = 'El total tiene que ser al menos 1.'; return false; }
    if([a, fa, b, tot].some(x => x != null && x > 1000) || (minutos != null && minutos > 1440)){ err.textContent = 'Algún número es demasiado grande.'; return false; }
    // La nota solo se calcula si se saben los fallos: si no, se deja sin nota (no se inventa).
    if(nota == null && a != null && fa != null) nota = PLANL.notaDe(a, fa, b || 0);
    const cuando = f('cuando');
    const ms = cuando ? Date.parse(cuando) : Date.now();   // datetime-local: hora del dispositivo
    const realizado = Number.isFinite(ms) && ms <= Date.now() + 3600000 ? new Date(ms).toISOString() : ahoraIso();
    const tareaOk = tarea && tareaDe(tarea.id) ? tarea : null;
    const res = Object.assign({}, r0 || {}, {
      id: r0 ? r0.id : uid(), test_id: testDe(test.id) ? test.id : null, tarea_id: tareaOk ? tareaOk.id : (r0 && tareaDe(r0.tarea_id) ? r0.tarea_id : null),
      fuente: r0 ? r0.fuente : 'manual', realizado_at: realizado,
      aciertos: a, fallos: fa, blancos: b, total: tot, nota: nota == null ? null : Math.round(nota * 100) / 100,
      notas: f('notas') || null
    });
    if(!r0 || !r0.duracion_medida){ res.duracion_seg = minutos != null ? minutos * 60 : null; res.duracion_medida = false; }
    delete res.user_id;
    guardar('plan_resultados', res);
    if(tareaOk && (tareaOk.estado !== 'completado' || tareaOk.resultado_id !== res.id)){
      cambiar('plan_tareas', tareaOk.id, { estado: 'completado', completada_at: tareaOk.completada_at || ahoraIso(), resultado_id: res.id });
    }
    if(!r0) evento('completado', { tarea_id: tarea ? tarea.id : null, test_id: test.id, datos: { fuente: 'manual', nota: res.nota } });
    if(yo()) escribirLocal(claveApertura(yo()), null);
    uiToast(r0 ? 'Resultado corregido.' : 'Guardado: ' + test.nombre + (res.nota != null ? ' (' + formatNota(res.nota) + ')' : '') + '.', 'success');
    repintar();
  }
  function completarSinNota(tarea, test){
    cambiar('plan_tareas', tarea.id, { estado: 'completado', completada_at: ahoraIso(), resultado_id: null });
    evento('completado', { tarea_id: tarea.id, test_id: test.id, datos: { sin_nota: true } });
    if(yo()) escribirLocal(claveApertura(yo()), null);
    uiToast('Hecho: ' + test.nombre + '.', 'success');
    repintar();
  }

  /* ---------- menú de una tarea ---------- */
  function menuTarea(id){
    const t = tareaDe(id);
    if(!t) return;
    const test = testDe(t.test_id) || { nombre: '(test borrado)' };
    const delDia = PLANL.ordenarDia(PLANL.tareasDelDia(d.tareas, t.fecha), hoy(), reglas());
    const i = delDia.findIndex(x => x.id === t.id);
    const botones = [];
    if(PLANL.abierta(t)){
      botones.push({ texto: 'Aplazar…', clase: 'primario', accion: () => { aplazar(t.id); } });
      if(t.fecha !== hoy()) botones.push({ texto: 'Hacerlo hoy', accion: () => { moverTarea(t.id, hoy()); } });
    }
    if(t.estado === 'completado'){
      botones.push({ texto: resultadoDeTarea(t) ? 'Editar resultado' : 'Apuntar resultado', accion: () => { apuntarTarea(t.id); } });
      botones.push({ texto: 'Marcar como no hecho', accion: () => { reabrir(t.id); } });
    }
    if(t.estado === 'en_curso') botones.push({ texto: 'Marcar como no empezado', accion: () => { reabrir(t.id); } });
    hoja({ titulo: test.nombre,
      html: '<p class="pl-hoja-txt">' + esc(nombreTema(test.tema_id)) + ' · ' + esc(PLANL.fechaLarga(t.fecha)) + ' · ' + esc(PLANL.ESTADOS[t.estado] || '') + '</p>' +
        '<div class="pl-campo"><span>Prioridad</span><div class="pl-chips" role="radiogroup" aria-label="Prioridad">' +
        [1, 2, 3].map(p => '<button type="button" role="radio" aria-checked="' + (t.prioridad === p) + '" class="pl-chip' + (t.prioridad === p ? ' on' : '') + '" data-prio="' + p + '">' + PLANL.PRIORIDADES[p] + '</button>').join('') + '</div></div>' +
        (delDia.length > 1 && t.estado !== 'completado' ? '<div class="pl-campo"><span>Orden del día</span><div class="pl-acciones">' +
          '<button type="button" class="btn btn-ghost" data-mover="-1"' + (simularMover(t.id, -1) ? '' : ' disabled') + '>Subir</button>' +
          '<button type="button" class="btn btn-ghost" data-mover="1"' + (simularMover(t.id, 1) ? '' : ' disabled') + '>Bajar</button></div></div>' : ''),
      botones: botones.concat([{ texto: 'Quitar del plan', clase: 'peligro', accion: () => { quitarTarea(t.id); } }, { texto: 'Cerrar' }]),
      alAbrir: (panel, api) => {
        panel.querySelectorAll('[data-prio]').forEach(b => b.addEventListener('click', () => {
          const p = Number(b.dataset.prio);
          cambiar('plan_tareas', t.id, { prioridad: p });
          panel.querySelectorAll('[data-prio]').forEach(x => { const on = Number(x.dataset.prio) === p; x.classList.toggle('on', on); x.setAttribute('aria-checked', on); });
          repintar();
        }));
        panel.querySelectorAll('[data-mover]').forEach(b => b.addEventListener('click', () => { moverOrden(t.id, Number(b.dataset.mover)); api.cerrar(); }));
      } });
  }
  // Los cambios que haría moverOrden, o null si no cambiarían la posición
  // (p. ej. lo aplazado va siempre antes a igual prioridad).
  function cambiosMover(id, paso){
    const t = tareaDe(id);
    if(!t) return null;
    const l = PLANL.ordenarDia(PLANL.tareasDelDia(d.tareas, t.fecha), hoy(), reglas()).filter(x => x.estado !== 'completado');
    const i = l.findIndex(x => x.id === id), j = i + paso;
    if(i < 0 || j < 0 || j >= l.length) return null;
    const nueva = l.slice();
    const x = nueva[i]; nueva[i] = nueva[j]; nueva[j] = x;
    const cambios = {};
    nueva.forEach((tt, k) => { cambios[tt.id] = { orden: k + 1 }; });
    if(l[j].prioridad !== t.prioridad) cambios[id].prioridad = l[j].prioridad;
    const simulada = l.map(tt => Object.assign({}, tt, cambios[tt.id]));
    const tras = PLANL.ordenarDia(simulada, hoy(), reglas()).map(tt => tt.id);
    return tras.indexOf(id) === j ? cambios : null;
  }
  function simularMover(id, paso){ return !!cambiosMover(id, paso); }
  // Cambia el orden de una tarea con su vecina del mismo día (reescribe los órdenes 1..n).
  function moverOrden(id, paso){
    const cambios = cambiosMover(id, paso);
    if(!cambios) return;
    Object.keys(cambios).forEach(k => {
      const tt = tareaDe(k);
      if(tt && (Number(tt.orden) !== cambios[k].orden || (cambios[k].prioridad && cambios[k].prioridad !== tt.prioridad))) cambiar('plan_tareas', k, cambios[k]);
    });
    repintar();
  }
  async function reabrir(id){
    const t = tareaDe(id);
    if(!t) return;
    const r = resultadoDeTarea(t);
    if(r){
      // El resultado no puede quedarse colgado de una tarea «sin hacer».
      const borrarlo = await uiConfirm('Si lo hiciste de verdad, consérvalo: seguirá contando en Progreso, pero ya no en esta tarea. Si lo apuntaste por error, bórralo.', { ok: 'Borrar el resultado', cancel: 'Conservarlo', danger: true, title: '¿Qué hago con su resultado?' });
      if(borrarlo) borrar('plan_resultados', r.id);
      else cambiar('plan_resultados', r.id, { tarea_id: null });
    }
    cambiar('plan_tareas', id, { estado: 'pendiente', completada_at: null, abierta_at: null, resultado_id: null });
    evento('reabierto', { tarea_id: id, test_id: t.test_id });
    repintar();
  }
  async function quitarTarea(id){
    const t = tareaDe(id);
    if(!t) return;
    const test = testDe(t.test_id) || { nombre: 'este test' };
    if(!await uiConfirm('¿Quitar «' + test.nombre + '» del plan del ' + PLANL.fechaCorta(t.fecha) + '?\n\nEl test sigue en tu catálogo' + (resultadoDeTarea(t) ? ' y su resultado se conserva.' : '.'), { ok: 'Quitar' })) return;
    evento('cancelado', { tarea_id: id, test_id: t.test_id, datos: { fecha: t.fecha } });
    borrar('plan_tareas', id);
    repintar();
  }
  // Mueve una tarea a otro día (aplazar o «hacer hoy»), respetando el límite.
  async function moverTarea(id, fecha){
    const t = tareaDe(id);
    if(!t || !fecha || fecha === t.fecha) return false;
    if(d.tareas.some(x => x.id !== id && x.test_id === t.test_id && x.fecha === fecha)){
      uiToast('Ese test ya está programado para ese día.', 'error');
      return false;
    }
    const p = PLANL.puedeAnadir(d.tareas, fecha, d.ajustes);
    let excepcion = false;
    if(!p.ok){
      const ok = await uiConfirm('Ese día ya tiene ' + p.usados + ' de ' + p.limite + ' tests\n\nTu límite diario es ' + p.limite + '. ¿Lo pones igualmente, como excepción?', { ok: 'Sí, como excepción', title: 'Ese día está completo' });
      if(!ok){ evento('aviso_limite', { tarea_id: id, test_id: t.test_id, datos: { fecha } }); return false; }
      excepcion = true;
    }
    const cambios = { fecha, orden: siguienteOrden(fecha), estado: t.estado === 'completado' ? 'pendiente' : 'aplazado', veces_aplazada: Math.min(999, (Number(t.veces_aplazada) || 0) + 1), abierta_at: null };
    if(excepcion) cambios.origen = 'excepcion';
    cambiar('plan_tareas', id, cambios);
    evento('aplazado', { tarea_id: id, test_id: t.test_id, datos: { de: t.fecha, a: fecha } });
    if(excepcion) evento('excepcion', { tarea_id: id, test_id: t.test_id, datos: { motivo: 'limite', fecha } });
    uiToast('Movido al ' + PLANL.fechaLarga(fecha) + '.', 'success');
    repintar();
    return true;
  }
  function proximoDiaEstudio(desde){
    const aj = ajustes();
    for(let i = 1; i <= 14; i++){
      const dia = PLANL.sumarDias(desde, i);
      if(PLANL.esDiaDeEstudio(dia, aj) && PLANL.puedeAnadir(d.tareas, dia, aj).ok) return dia;
    }
    return PLANL.sumarDias(desde, 1);
  }
  function aplazar(id){
    const t = tareaDe(id);
    if(!t) return;
    const h = hoy();
    const base = t.fecha > h ? t.fecha : h;
    const manana = PLANL.sumarDias(h, 1), proximo = proximoDiaEstudio(base);
    hoja({ titulo: 'Aplazar «' + ((testDe(t.test_id) || {}).nombre || 'test') + '»',
      html: '<div class="pl-opciones">' +
        '<button type="button" class="pl-opcion" data-fecha="' + manana + '">Mañana <span>' + esc(PLANL.fechaCorta(manana)) + ' · ' + ocupacionTexto(manana) + '</span></button>' +
        (proximo !== manana ? '<button type="button" class="pl-opcion" data-fecha="' + proximo + '">El próximo día con hueco <span>' + esc(PLANL.fechaCorta(proximo)) + ' · ' + ocupacionTexto(proximo) + '</span></button>' : '') +
        '</div><label class="pl-campo"><span>Otro día</span><input class="pl-input" type="date" name="fecha" min="' + h + '" value="' + PLANL.sumarDias(base, 2) + '"></label>',
      botones: [{ texto: 'Aplazar a ese día', clase: 'primario', accion: api => {
        const v = api.el.querySelector('[name="fecha"]').value;
        if(!v || v < h){ uiToast('Elige un día de hoy en adelante.', 'error'); return false; }
        moverTarea(id, v);
      } }, { texto: 'Cancelar' }],
      alAbrir: (panel, api) => panel.querySelectorAll('[data-fecha]').forEach(b => b.addEventListener('click', () => { api.cerrar(); moverTarea(id, b.dataset.fecha); }))
    });
  }
  function ocupacionTexto(dia){
    const p = PLANL.puedeAnadir(d.tareas, dia, d.ajustes);
    return p.usados + '/' + p.limite;
  }

  /* ---------- programar ---------- */
  // Programa un test un día. Si el día está lleno, pide permiso para la excepción.
  async function programar(testId, fecha, opts){
    opts = opts || {};
    const test = testDe(testId);
    if(!test || !fecha) return null;
    if(d.tareas.some(t => t.test_id === testId && t.fecha === fecha)){
      uiToast('«' + test.nombre + '» ya está programado ese día.', 'error');
      return null;
    }
    let origen = opts.origen || 'plan';
    const p = PLANL.puedeAnadir(d.tareas, fecha, d.ajustes);
    if(!p.ok){
      const ok = await uiConfirm('El ' + PLANL.fechaLarga(fecha) + ' ya tiene ' + p.usados + ' de ' + p.limite + ' tests\n\nAñadir más de los que te has propuesto suele acabar en tareas atrasadas. ¿Lo añades igualmente, como excepción?', { ok: 'Añadir como excepción', title: 'Has llegado a tu límite diario' });
      if(!ok){ evento('aviso_limite', { test_id: testId, datos: { fecha } }); return null; }
      origen = 'excepcion';
    }
    const t = { id: uid(), test_id: testId, fecha, orden: siguienteOrden(fecha), prioridad: [1, 2, 3].includes(opts.prioridad) ? opts.prioridad : 2, estado: 'pendiente', origen, veces_aplazada: 0 };
    guardar('plan_tareas', t);
    if(origen === 'excepcion') evento('excepcion', { tarea_id: t.id, test_id: testId, datos: { motivo: 'limite', fecha } });
    if(!opts.silencioso) uiToast('Programado: ' + test.nombre + ' (' + PLANL.fechaCorta(fecha) + ').', 'success');
    repintar();
    return t;
  }
  function programarHoy(testId){ return programar(testId, hoy()); }
  function programarRepaso(testId){ return programar(testId, hoy(), { origen: 'repaso', prioridad: 1 }); }
  // Repaso de fallos de un tema: un test de pj.fire en modo «fallos» (se crea si no existe).
  function repasoFallos(temaId){
    const tema = temaDe(temaId);
    if(!tema) return;
    let test = d.tests.find(t => t.plataforma === 'pjfire' && t.tema_id === temaId && t.config && t.config.modo === 'fallos' && !t.archivado);
    if(!test){
      const nombre = 'Repaso de fallos · ' + tema.nombre;
      test = d.tests.find(t => claveTest(t.plataforma, t.referencia, t.nombre) === claveTest('pjfire', '', nombre));
      if(!test){
        test = { id: uid(), tema_id: temaId, plataforma: 'pjfire', nombre: textoCorto(nombre, 160), referencia: null, url: null, num_preguntas: 20,
          config: { modo: 'fallos', topic_ids: [], n: 20 }, archivado: false };
        guardar('plan_tests', test);
      }
    }
    return programar(test.id, hoy(), { origen: 'repaso', prioridad: 1 });
  }

  // Hoja para elegir un test y programarlo un día.
  function anadirTarea(fecha){
    const h = hoy();
    fecha = fecha && fecha >= h ? fecha : h;
    if(!d.tests.some(t => !t.archivado)){
      uiToast('Primero añade algún test a tu catálogo.', 'info');
      irA('tests');
      return;
    }
    let elegido = null;
    hoja({ titulo: 'Añadir un test al plan', ancha: true,
      html: '<label class="pl-campo"><span>Día</span><input class="pl-input" type="date" name="fecha" min="' + h + '" value="' + fecha + '"></label>' +
        '<p class="pl-ocupacion pl-suave" aria-live="polite"></p>' +
        '<label class="pl-campo"><span>Test</span><input class="pl-input" type="search" name="buscar" placeholder="Buscar por nombre, identificador o tema…" autocomplete="off"></label>' +
        '<div class="pl-elegir" role="listbox" aria-label="Tests"></div>' +
        '<div class="pl-campo"><span>Prioridad</span><div class="pl-chips" role="radiogroup" aria-label="Prioridad">' +
        [1, 2, 3].map(p => '<button type="button" role="radio" aria-checked="' + (p === 2) + '" class="pl-chip' + (p === 2 ? ' on' : '') + '" data-prio="' + p + '">' + PLANL.PRIORIDADES[p] + '</button>').join('') + '</div></div>',
      botones: [{ texto: 'Añadir', clase: 'primario', accion: api => {
        const f = api.el.querySelector('[name="fecha"]').value;
        if(!elegido){ uiToast('Elige un test de la lista.', 'error'); return false; }
        if(!f || f < h){ uiToast('Elige un día de hoy en adelante.', 'error'); return false; }
        const on = api.el.querySelector('[data-prio].on');
        programar(elegido, f, { prioridad: on ? Number(on.dataset.prio) : 2 });
      } }, { texto: 'Cancelar' }],
      alAbrir: panel => {
        const lista = panel.querySelector('.pl-elegir');
        const inFecha = panel.querySelector('[name="fecha"]');
        const ocup = panel.querySelector('.pl-ocupacion');
        const pintarLista = () => {
          const q = PLANL.normalizar(panel.querySelector('[name="buscar"]').value);
          const f = inFecha.value;
          const p = PLANL.puedeAnadir(d.tareas, f, d.ajustes);
          ocup.textContent = f ? (PLANL.fechaLarga(f) + ': ' + p.usados + ' de ' + p.limite + ' tests' + (p.ok ? '' : ' (lleno: sería una excepción)')) : '';
          const tests = d.tests.filter(t => !t.archivado).filter(t => !q || PLANL.normalizar([t.nombre, t.referencia, nombreTema(t.tema_id)].join(' ')).includes(q))
            .sort((a, b) => PLANL.ordenNatural(nombreTema(a.tema_id), nombreTema(b.tema_id)) || PLANL.ordenNatural(a.nombre, b.nombre)).slice(0, 80);
          lista.innerHTML = tests.length ? tests.map(t => {
            const ya = d.tareas.some(x => x.test_id === t.id && x.fecha === f);
            const est = estadoTest(t);
            return '<button type="button" role="option" class="pl-elegir-item' + (elegido === t.id ? ' on' : '') + '" aria-selected="' + (elegido === t.id) + '" data-id="' + idAttr(t.id) + '"' + (ya ? ' disabled' : '') + '>' +
              '<b>' + esc(t.nombre) + '</b><span>' + esc(nombreTema(t.tema_id)) + ' · ' + esc(PLANL.PLATAFORMAS[t.plataforma] || '') + ' · ' + (ya ? 'ya está ese día' : esc(est)) + '</span></button>';
          }).join('') : '<p class="pl-suave">No hay tests que coincidan.</p>';
          lista.querySelectorAll('[data-id]').forEach(b => b.addEventListener('click', () => { elegido = b.dataset.id; pintarLista(); }));
        };
        panel.querySelector('[name="buscar"]').addEventListener('input', pintarLista);
        inFecha.addEventListener('change', pintarLista);
        panel.querySelectorAll('[data-prio]').forEach(b => b.addEventListener('click', () => {
          panel.querySelectorAll('[data-prio]').forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-checked', x === b); });
        }));
        pintarLista();
      } });
  }
  function estadoTest(t){
    const prox = d.tareas.filter(x => x.test_id === t.id && PLANL.abierta(x)).sort((a, b) => a.fecha.localeCompare(b.fecha))[0];
    const n = resultadosDeTest(t.id).length + d.tareas.filter(x => x.test_id === t.id && x.estado === 'completado' && !resultadoDeTarea(x)).length;
    if(prox) return (prox.fecha < hoy() ? 'atrasado (' : 'programado: ') + PLANL.fechaCorta(prox.fecha) + (prox.fecha < hoy() ? ')' : '');
    if(n){ const u = ultimoResultado(t.id); return 'hecho ' + (n === 1 ? '1 vez' : n + ' veces') + (u && u.nota != null ? ' · última nota ' + formatNota(u.nota) : ''); }
    return 'nunca hecho';
  }

  /* ============================================================
     PLAN (semana y mes)
     ============================================================ */
  function pintarPlan(el){
    const h = hoy();
    if(!semanaVista) semanaVista = PLANL.lunesDe(h);
    if(!mesVista) mesVista = PLANL.primeroDeMes(h);
    const aj = ajustes();
    let html = '<div class="pl-barra-plan">' +
      '<div class="pl-segmento" role="tablist" aria-label="Vista">' +
      '<button type="button" role="tab" aria-selected="' + (vistaPlan === 'semana') + '" class="' + (vistaPlan === 'semana' ? 'on' : '') + '" onclick="PLAN.vista(\'semana\')">Semana</button>' +
      '<button type="button" role="tab" aria-selected="' + (vistaPlan === 'mes') + '" class="' + (vistaPlan === 'mes' ? 'on' : '') + '" onclick="PLAN.vista(\'mes\')">Mes</button></div>' +
      '<div class="pl-nav-fechas"><button type="button" class="pl-icono" onclick="PLAN.navegar(-1)" aria-label="' + (vistaPlan === 'mes' ? 'Mes anterior' : 'Semana anterior') + '">' + ICO.izq + '</button>' +
      '<span class="pl-rango">' + esc(vistaPlan === 'mes' ? tituloMes(mesVista) : tituloSemana(semanaVista)) + '</span>' +
      '<button type="button" class="pl-icono" onclick="PLAN.navegar(1)" aria-label="' + (vistaPlan === 'mes' ? 'Mes siguiente' : 'Semana siguiente') + '">' + ICO.der + '</button>' +
      '<button type="button" class="btn btn-ghost pl-btn-hoy" onclick="PLAN.navegar(0)">Hoy</button></div>' +
      '<button type="button" class="btn btn-primary" onclick="PLAN.planificarAuto()">Planificar automáticamente</button></div>';
    html += '<p class="pl-pie">Límite: ' + aj.limite_diario + ' tests al día · días de estudio: ' + aj.dias_estudio.map(n => DIAS_CORTOS[n - 1]).join(' ') + ' · <button type="button" class="pl-enlace" onclick="PLAN.irA(\'ajustes\')">cambiar</button></p>';
    html += vistaPlan === 'mes' ? htmlMes(mesVista, h, aj) : htmlSemana(semanaVista, h, aj);
    el.innerHTML = html;
  }
  function tituloSemana(lunes){
    const dom = PLANL.sumarDias(lunes, 6);
    return PLANL.fechaCorta(lunes).replace(/^\S+ /, '') + ' – ' + PLANL.fechaCorta(dom).replace(/^\S+ /, '');
  }
  function tituloMes(primero){
    const m = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'][Number(primero.slice(5, 7)) - 1];
    return capitalizar(m) + ' de ' + primero.slice(0, 4);
  }
  function htmlSemana(lunes, h, aj){
    return '<div class="pl-semana">' + PLANL.rango(lunes, PLANL.sumarDias(lunes, 6)).map(dia => {
      const ts = PLANL.ordenarDia(PLANL.tareasDelDia(d.tareas, dia), h, aj.reglas);
      const hechas = ts.filter(t => t.estado === 'completado').length;
      const estudio = PLANL.esDiaDeEstudio(dia, aj);
      const cls = ['pl-dia'];
      if(dia === h) cls.push('hoy');
      if(dia < h) cls.push('pasado');
      if(!estudio) cls.push('descanso');
      return '<section class="' + cls.join(' ') + '" aria-label="' + esc(PLANL.fechaLarga(dia)) + '">' +
        '<div class="pl-dia-tit"><b>' + esc(capitalizar(PLANL.fechaCorta(dia))) + (dia === h ? ' · hoy' : '') + '</b>' +
        '<span class="pl-dia-cuenta">' + (ts.length ? hechas + '/' + ts.length : (estudio ? '0/' + aj.limite_diario : 'descanso')) + '</span></div>' +
        (ts.length > aj.limite_diario ? '<div class="pl-dia-exceso">' + (ts.length - aj.limite_diario) + ' por encima de tu límite (' + aj.limite_diario + ')</div>' : '') +
        (ts.length ? '<ul class="pl-dia-lista">' + ts.map(t => {
          const test = testDe(t.test_id) || { nombre: '(test borrado)', plataforma: 'otra' };
          const atrasada = PLANL.abierta(t) && dia < h;
          return '<li><button type="button" class="pl-mini ' + claseEstado(t.estado) + (atrasada ? ' atrasada' : '') + '" onclick="PLAN.menuTarea(\'' + idAttr(t.id) + '\')">' +
            '<span class="pl-mini-estado" aria-hidden="true">' + (t.estado === 'completado' ? ICO.check : '') + '</span>' +
            '<span class="pl-mini-txt"><b>' + esc(test.nombre) + '</b><small>' + esc(nombreTema(test.tema_id)) + ' · ' + esc(PLANL.PLATAFORMAS[test.plataforma] || '') +
            (atrasada ? ' · sin hacer' : t.estado !== 'pendiente' ? ' · ' + esc(PLANL.ESTADOS[t.estado]) : '') + '</small></span></button></li>';
        }).join('') + '</ul>' : '') +
        (dia >= h ? '<button type="button" class="pl-anadir mini" onclick="PLAN.anadirTarea(\'' + dia + '\')">+ Añadir</button>' : '') +
        '</section>';
    }).join('') + '</div>';
  }
  function htmlMes(primero, h, aj){
    const dias = PLANL.diasDelMes(primero);
    const hueco = PLANL.diaSemana(primero) - 1;
    let celdas = '';
    for(let i = 0; i < hueco; i++) celdas += '<div class="pl-mes-celda vacia" aria-hidden="true"></div>';
    dias.forEach(dia => {
      const ts = PLANL.tareasDelDia(d.tareas, dia);
      const hechas = ts.filter(t => t.estado === 'completado').length;
      const pend = ts.length - hechas;
      const cls = ['pl-mes-celda'];
      if(dia === h) cls.push('hoy');
      if(!PLANL.esDiaDeEstudio(dia, aj)) cls.push('descanso');
      if(ts.length && hechas === ts.length) cls.push('completo');
      else if(pend && dia < h) cls.push('atrasado');
      celdas += '<button type="button" class="' + cls.join(' ') + '" onclick="PLAN.verDia(\'' + dia + '\')" aria-label="' + esc(PLANL.fechaLarga(dia)) + ': ' + (ts.length ? hechas + ' de ' + ts.length + ' hechas' : 'sin tests') + '">' +
        '<span class="pl-mes-num">' + Number(dia.slice(8, 10)) + '</span>' +
        (ts.length ? '<span class="pl-mes-cuenta">' + hechas + '/' + ts.length + '</span>' : '') + '</button>';
    });
    return '<div class="pl-mes"><div class="pl-mes-cab" aria-hidden="true">' + DIAS_CORTOS.map(x => '<span>' + x + '</span>').join('') + '</div>' +
      '<div class="pl-mes-rejilla">' + celdas + '</div></div>' +
      '<p class="pl-pie">Verde: todo hecho · rojo: se quedó algo sin hacer · gris: descanso. Toca un día para verlo.</p>';
  }
  function verDia(dia){
    const h = hoy();
    const aj = ajustes();
    const ts = PLANL.ordenarDia(PLANL.tareasDelDia(d.tareas, dia), h, aj.reglas);
    hoja({ titulo: capitalizar(PLANL.fechaLarga(dia)),
      html: (ts.length ? '<ul class="pl-dia-lista">' + ts.map(t => {
        const test = testDe(t.test_id) || { nombre: '(test borrado)', plataforma: 'otra' };
        const r = resultadoDeTarea(t);
        return '<li><button type="button" class="pl-mini ' + claseEstado(t.estado) + '" data-tarea="' + idAttr(t.id) + '"><span class="pl-mini-estado" aria-hidden="true">' + (t.estado === 'completado' ? ICO.check : '') + '</span>' +
          '<span class="pl-mini-txt"><b>' + esc(test.nombre) + '</b><small>' + esc(nombreTema(test.tema_id)) + ' · ' + esc(PLANL.ESTADOS[t.estado]) + (r && r.nota != null ? ' · nota ' + formatNota(r.nota) : '') + '</small></span></button></li>';
      }).join('') + '</ul>' : '<p class="pl-hoja-txt pl-suave">Sin tests este día.</p>') +
        '<p class="pl-hoja-txt pl-suave">' + ts.length + ' de ' + aj.limite_diario + ' (tu límite diario)' + (PLANL.esDiaDeEstudio(dia, aj) ? '' : ' · día de descanso') + '</p>',
      botones: (dia >= h ? [{ texto: 'Añadir un test', clase: 'primario', accion: () => { anadirTarea(dia); } }] : []).concat([{ texto: 'Cerrar' }]),
      alAbrir: (panel, api) => panel.querySelectorAll('[data-tarea]').forEach(b => b.addEventListener('click', () => { api.cerrar(); menuTarea(b.dataset.tarea); }))
    });
  }
  function vista(v){ vistaPlan = v === 'mes' ? 'mes' : 'semana'; escribirLocal('plan_vista', vistaPlan); repintar(); }
  function navegar(paso){
    const h = hoy();
    if(paso === 0){ semanaVista = PLANL.lunesDe(h); mesVista = PLANL.primeroDeMes(h); }
    else if(vistaPlan === 'mes'){
      const y = Number(mesVista.slice(0, 4)), m = Number(mesVista.slice(5, 7)) - 1 + paso;
      const f = new Date(Date.UTC(y, m, 1));
      mesVista = f.toISOString().slice(0, 10);
    } else semanaVista = PLANL.sumarDias(semanaVista, 7 * paso);
    repintar();
  }

  // Planificación automática: vista previa y confirmación.
  function planificarAuto(){
    const h = hoy();
    const opciones = [
      { id: 'semana', texto: 'Lo que queda de semana', dias: 8 - PLANL.diaSemana(h) },
      { id: 'dos', texto: 'Las próximas 2 semanas', dias: 14 },
      { id: 'mes', texto: 'El próximo mes', dias: 30 }
    ];
    let elegida = opciones[1];
    let propuesta = null;
    const calcular = () => PLANL.proponerPlan({ tests: d.tests, tareas: d.tareas, resultados: d.resultados, temas: d.temas, ajustes: d.ajustes, desde: h, dias: elegida.dias, hoy: h });
    hoja({ titulo: 'Planificar automáticamente', ancha: true,
      html: '<p class="pl-hoja-txt">Reparte tus tests sin hacer por tus días de estudio, sin pasar de tu límite diario. Primero recoloca lo atrasado; después, los temas más flojos y por turnos.</p>' +
        '<div class="pl-chips" role="radiogroup" aria-label="Periodo">' + opciones.map(o => '<button type="button" role="radio" aria-checked="' + (o === elegida) + '" class="pl-chip' + (o === elegida ? ' on' : '') + '" data-op="' + o.id + '">' + o.texto + '</button>').join('') + '</div>' +
        '<div class="pl-propuesta" aria-live="polite"></div>',
      botones: [{ texto: 'Confirmar', clase: 'primario', accion: () => {
        if(!propuesta || (!propuesta.mover.length && !propuesta.nuevas.length)) return;
        aplicarPropuesta(propuesta);
      } }, { texto: 'Cancelar' }],
      alAbrir: panel => {
        const caja = panel.querySelector('.pl-propuesta');
        const pintarProp = () => {
          propuesta = calcular();
          const porDia = {};
          propuesta.mover.forEach(m => { (porDia[m.fecha] = porDia[m.fecha] || []).push({ test: testDe((tareaDe(m.tarea_id) || {}).test_id), mov: true }); });
          propuesta.nuevas.forEach(n => { (porDia[n.fecha] = porDia[n.fecha] || []).push({ test: testDe(n.test_id), mov: false }); });
          const dias = Object.keys(porDia).sort();
          caja.innerHTML = dias.length ? '<p class="pl-hoja-txt"><b>' + (propuesta.mover.length ? plural(propuesta.mover.length, 'atrasado se recoloca', 'atrasados se recolocan') + ' y ' : '') + plural(propuesta.nuevas.length, 'test nuevo', 'tests nuevos') + '</b></p>' +
            dias.map(dia => '<div class="pl-prop-dia"><b>' + esc(capitalizar(PLANL.fechaCorta(dia))) + '</b><ul>' + porDia[dia].map(x => '<li>' + esc(x.test ? x.test.nombre : '?') + ' <small>' + esc(x.test ? nombreTema(x.test.tema_id) : '') + (x.mov ? ' · atrasado' : '') + '</small></li>').join('') + '</ul></div>').join('')
            : '<p class="pl-hoja-txt pl-suave">No hay nada que planificar: ' + (d.tests.some(t => !t.archivado) ? 'tus tests sin hacer ya están programados o los días están completos.' : 'aún no tienes tests en el catálogo.') + '</p>';
        };
        panel.querySelectorAll('[data-op]').forEach(b => b.addEventListener('click', () => {
          elegida = opciones.find(o => o.id === b.dataset.op);
          panel.querySelectorAll('[data-op]').forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-checked', x === b); });
          pintarProp();
        }));
        pintarProp();
      } });
  }
  function aplicarPropuesta(p){
    p.mover.forEach(m => {
      const t = tareaDe(m.tarea_id);
      if(!t) return;
      cambiar('plan_tareas', t.id, { fecha: m.fecha, orden: siguienteOrden(m.fecha), estado: 'aplazado', veces_aplazada: Math.min(999, (Number(t.veces_aplazada) || 0) + 1), abierta_at: null });
      evento('aplazado', { tarea_id: t.id, test_id: t.test_id, datos: { de: t.fecha, a: m.fecha, auto: true } });
    });
    p.nuevas.forEach(n => {
      if(d.tareas.some(t => t.test_id === n.test_id && t.fecha === n.fecha)) return;
      guardar('plan_tareas', { id: uid(), test_id: n.test_id, fecha: n.fecha, orden: siguienteOrden(n.fecha), prioridad: n.prioridad || 2, estado: 'pendiente', origen: 'auto', veces_aplazada: 0 });
    });
    uiToast('Plan actualizado: ' + plural(p.nuevas.length, 'test añadido', 'tests añadidos') + (p.mover.length ? ' y ' + plural(p.mover.length, 'recolocado', 'recolocados') : '') + '.', 'success');
    repintar();
  }

  /* ============================================================
     TESTS (catálogo)
     ============================================================ */
  function pintarTests(el){
    el.innerHTML = '<div class="pl-barra-tests"><input class="pl-input" type="search" id="plBuscarTests" placeholder="Buscar un test…" value="' + esc(filtroTests) + '" aria-label="Buscar un test" oninput="PLAN.filtrarTests(this.value)" autocomplete="off">' +
      '<button type="button" class="btn btn-primary" onclick="PLAN.editarTest()">+ Nuevo test</button>' +
      '<button type="button" class="btn btn-ghost" onclick="PLAN.anadirVarios()">Añadir varios</button></div><div id="plListaTests"></div>';
    pintarListaTests(document.getElementById('plListaTests'));
  }
  function pintarListaTests(el){
    if(!el) return;
    const q = PLANL.normalizar(filtroTests);
    const visibles = d.tests.filter(t => verArchivados ? t.archivado : !t.archivado)
      .filter(t => !q || PLANL.normalizar([t.nombre, t.referencia, nombreTema(t.tema_id), PLANL.PLATAFORMAS[t.plataforma]].join(' ')).includes(q));
    const nArch = d.tests.filter(t => t.archivado).length;
    let html = '';
    if(!d.temas.length) html += '<div class="pl-aviso-linea">Aún no tienes temas. <button type="button" class="pl-enlace" onclick="PLAN.crearVariosTemas()">Créalos</button> para agrupar tus tests.</div>';
    if(!visibles.length){
      html += '<div class="pl-vacio">' + (d.tests.length ? (verArchivados ? 'No tienes tests archivados.' : 'Ningún test coincide con la búsqueda.') :
        'Tu catálogo está vacío. Añade los tests de Tutor Bombero que vas a hacer (con su nombre o identificador) y, si quieres, tests de tu banco de pj.fire.') + '</div>';
    } else {
      const grupos = {};
      visibles.forEach(t => { const k = t.tema_id && temaDe(t.tema_id) ? t.tema_id : ''; (grupos[k] = grupos[k] || []).push(t); });
      const orden = temasOrdenados(true).map(t => t.id).filter(id => grupos[id]);
      if(grupos['']) orden.push('');
      html += orden.map(k => {
        const l = grupos[k].sort((a, b) => PLANL.ordenNatural(a.nombre, b.nombre));
        return '<details class="pl-grupo" open><summary><span>' + esc(k ? nombreTema(k) : 'Sin tema') + '</span><span class="pl-suave">' + l.length + '</span></summary>' +
          l.map(htmlTest).join('') + '</details>';
      }).join('');
    }
    if(nArch || verArchivados) html += '<button type="button" class="pl-enlace pl-centro" onclick="PLAN.alternarArchivados()">' + (verArchivados ? 'Volver a los tests activos' : 'Ver archivados (' + nArch + ')') + '</button>';
    el.innerHTML = html;
  }
  function htmlTest(t){
    return '<div class="pl-test"><div class="pl-test-txt"><b>' + esc(t.nombre) + '</b>' +
      '<span>' + etiquetaPlataforma(t.plataforma) + (t.referencia ? ' <span class="pl-ref">«' + esc(t.referencia) + '»</span>' : '') +
      (t.plataforma === 'pjfire' && t.config ? ' <span class="pl-suave">' + esc(({ estudio: 'Estudio', examen: 'Examen', fallos: 'Fallos' })[t.config.modo] || 'Estudio') + ' · ' + n0(Number(t.config.n) || Number(t.num_preguntas) || 20) + ' preguntas</span>' : '') + '</span>' +
      '<span class="pl-suave">' + esc(capitalizar(estadoTest(t))) + '</span></div>' +
      '<div class="pl-acciones">' + (t.archivado ? '' : '<button type="button" class="btn btn-ghost" onclick="PLAN.abrirTest(\'' + idAttr(t.id) + '\')">Abrir</button>' +
      '<button type="button" class="btn btn-ghost" onclick="PLAN.programarTest(\'' + idAttr(t.id) + '\')">Programar</button>') +
      '<button type="button" class="pl-icono" onclick="PLAN.menuTest(\'' + idAttr(t.id) + '\')" aria-label="Opciones de ' + esc(t.nombre) + '">' + ICO.mas + '</button></div></div>';
  }
  function filtrarTests(v){
    filtroTests = String(v || '').slice(0, 100);
    pintarListaTests(document.getElementById('plListaTests'));
  }
  function alternarArchivados(){ verArchivados = !verArchivados; repintar(); }
  function programarTest(id){
    const test = testDe(id);
    if(!test) return;
    const h = hoy();
    hoja({ titulo: 'Programar «' + test.nombre + '»',
      html: '<label class="pl-campo"><span>Día</span><input class="pl-input" type="date" name="fecha" min="' + h + '" value="' + h + '"></label><p class="pl-ocupacion pl-suave" aria-live="polite"></p>' +
        '<div class="pl-campo"><span>Prioridad</span><div class="pl-chips" role="radiogroup" aria-label="Prioridad">' + [1, 2, 3].map(p => '<button type="button" role="radio" aria-checked="' + (p === 2) + '" class="pl-chip' + (p === 2 ? ' on' : '') + '" data-prio="' + p + '">' + PLANL.PRIORIDADES[p] + '</button>').join('') + '</div></div>',
      botones: [{ texto: 'Programar', clase: 'primario', accion: api => {
        const f = api.el.querySelector('[name="fecha"]').value;
        if(!f || f < h){ uiToast('Elige un día de hoy en adelante.', 'error'); return false; }
        const on = api.el.querySelector('[data-prio].on');
        programar(id, f, { prioridad: on ? Number(on.dataset.prio) : 2 });
      } }, { texto: 'Cancelar' }],
      alAbrir: panel => {
        const inF = panel.querySelector('[name="fecha"]'), oc = panel.querySelector('.pl-ocupacion');
        const act = () => { const p = PLANL.puedeAnadir(d.tareas, inF.value, d.ajustes); oc.textContent = inF.value ? p.usados + ' de ' + p.limite + ' tests ese día' + (p.ok ? '' : ' (lleno: sería una excepción)') : ''; };
        inF.addEventListener('change', act); act();
        panel.querySelectorAll('[data-prio]').forEach(b => b.addEventListener('click', () => panel.querySelectorAll('[data-prio]').forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-checked', x === b); })));
      } });
  }
  function menuTest(id){
    const t = testDe(id);
    if(!t) return;
    const n = d.tareas.filter(x => x.test_id === id).length;
    hoja({ titulo: t.nombre,
      html: '<p class="pl-hoja-txt">' + esc(nombreTema(t.tema_id)) + ' · ' + etiquetaPlataforma(t.plataforma) + '</p><p class="pl-hoja-txt pl-suave">' + esc(capitalizar(estadoTest(t))) + '</p>',
      botones: [
        { texto: 'Editar', clase: 'primario', accion: () => { editarTest(id); } },
        { texto: t.archivado ? 'Recuperar del archivo' : 'Archivar', accion: () => { cambiar('plan_tests', id, { archivado: !t.archivado }); uiToast(t.archivado ? 'Recuperado.' : 'Archivado: ya no se propondrá en el plan.', 'success'); repintar(); } },
        { texto: 'Borrar', clase: 'peligro', accion: async () => {
          if(!await uiConfirm('¿Borrar «' + t.nombre + '»?\n\n' + (n ? 'Se quitan también sus ' + plural(n, 'tarea', 'tareas') + ' del plan. ' : '') + 'Sus resultados se conservan en Progreso. Si solo quieres que no se proponga más, archívalo.')) return;
          borrar('plan_tests', id);
          repintar();
        } },
        { texto: 'Cerrar' }
      ] });
  }
  function opcionesTemas(sel){
    return '<option value="">Sin tema</option>' + temasOrdenados(false).concat(d.temas.filter(t => t.archivado && t.id === sel)).map(t =>
      '<option value="' + idAttr(t.id) + '"' + (t.id === sel ? ' selected' : '') + '>' + esc(nombreTema(t.id)) + '</option>').join('');
  }
  function checksTopics(seleccion, nombre){
    if(!TOPICS || !TOPICS.length) return '<p class="pl-suave">El banco de preguntas aún no ha cargado: vuelve a abrir esto en un momento.</p>';
    return '<div class="pl-checks">' + TOPICS.map(tp =>
      '<label class="pl-check"><input type="checkbox" name="' + nombre + '" value="' + esc(tp.id) + '"' + (seleccion.includes(tp.id) ? ' checked' : '') + '><span>' + esc(tp.name) + '</span></label>').join('') + '</div>';
  }
  // Alta o edición de un test.
  function editarTest(id, prefill){
    const t0 = id ? testDe(id) : null;
    const t = Object.assign({ plataforma: 'tutor_bombero', config: {} }, t0 || {}, prefill || {});
    const cfg = Object.assign({ modo: 'estudio', topic_ids: [], n: 20, minutos: null }, t.config || {});
    hoja({ titulo: t0 ? 'Editar test' : 'Nuevo test', ancha: true,
      html: '<div class="pl-campo"><span>Plataforma</span><div class="pl-chips" role="radiogroup" aria-label="Plataforma">' +
        Object.keys(PLANL.PLATAFORMAS).map(p => '<button type="button" role="radio" aria-checked="' + (t.plataforma === p) + '" class="pl-chip' + (t.plataforma === p ? ' on' : '') + '" data-plat="' + p + '">' + esc(PLANL.PLATAFORMAS[p]) + '</button>').join('') + '</div></div>' +
        '<label class="pl-campo"><span>Tema</span><select class="pl-input" name="tema">' + opcionesTemas(t.tema_id) + '</select></label>' +
        '<label class="pl-campo"><span>Nombre del test *</span><input class="pl-input" name="nombre" maxlength="160" value="' + esc(t.nombre || '') + '" placeholder="Por ejemplo: Test 3" autofocus></label>' +
        '<div class="pl-solo-ext"><label class="pl-campo"><span>Identificador en la plataforma</span><input class="pl-input" name="referencia" maxlength="160" value="' + esc(t.referencia || '') + '" placeholder="Cómo lo encuentras allí: «Tema 5 · Test 3»"></label>' +
        '<label class="pl-campo"><span>Enlace (opcional)</span><input class="pl-input" name="url" type="url" inputmode="url" maxlength="500" value="' + esc(t.url || '') + '" placeholder="https://…"></label>' +
        '<p class="pl-suave pl-solo-tb">Tutor Bombero no tiene enlaces directos a cada test: si lo dejas vacío, se abre su página de entrada y buscas el test por su identificador.</p>' +
        '<label class="pl-campo"><span>Número de preguntas (opcional)</span><input class="pl-input" name="num" inputmode="numeric" pattern="[0-9]*" value="' + esc(t.num_preguntas || '') + '"></label></div>' +
        '<div class="pl-solo-pj"><div class="pl-campo"><span>Modo</span><div class="pl-chips" role="radiogroup" aria-label="Modo">' +
        [['estudio', 'Estudio (corrige al momento)'], ['examen', 'Examen'], ['fallos', 'Solo mis fallos']].map(m => '<button type="button" role="radio" aria-checked="' + (cfg.modo === m[0]) + '" class="pl-chip' + (cfg.modo === m[0] ? ' on' : '') + '" data-modo="' + m[0] + '">' + m[1] + '</button>').join('') + '</div></div>' +
        '<div class="pl-rejilla dos"><label class="pl-campo"><span>Preguntas</span><input class="pl-input" name="n" inputmode="numeric" pattern="[0-9]*" value="' + esc(cfg.n || 20) + '"></label>' +
        '<label class="pl-campo pl-solo-examen"><span>Minutos (examen)</span><input class="pl-input" name="minutos" inputmode="numeric" pattern="[0-9]*" value="' + esc(cfg.minutos || '') + '" placeholder="Sin límite"></label></div>' +
        '<div class="pl-campo"><span>Temas del banco (si no eliges ninguno, los vinculados a su tema)</span>' + checksTopics(cfg.topic_ids || [], 'topic') + '</div></div>' +
        '<label class="pl-campo"><span>Notas (opcional)</span><input class="pl-input" name="notas" maxlength="1000" value="' + esc(t.notas || '') + '"></label>' +
        '<p class="pl-error-form" role="alert"></p>',
      botones: [{ texto: 'Guardar', clase: 'primario', accion: api => guardarTestForm(api, t0) }, { texto: 'Cancelar' }],
      alAbrir: panel => {
        const setPlat = p => {
          panel.dataset.plat = p;
          panel.querySelectorAll('[data-plat]').forEach(b => { const on = b.dataset.plat === p; b.classList.toggle('on', on); b.setAttribute('aria-checked', on); });
          panel.querySelector('.pl-solo-ext').classList.toggle('hidden', p === 'pjfire');
          panel.querySelector('.pl-solo-pj').classList.toggle('hidden', p !== 'pjfire');
          panel.querySelector('.pl-solo-tb').classList.toggle('hidden', p !== 'tutor_bombero');
        };
        const setModo = m => {
          panel.dataset.modo = m;
          panel.querySelectorAll('[data-modo]').forEach(b => { const on = b.dataset.modo === m; b.classList.toggle('on', on); b.setAttribute('aria-checked', on); });
          panel.querySelector('.pl-solo-examen').classList.toggle('hidden', m !== 'examen');
        };
        panel.querySelectorAll('[data-plat]').forEach(b => b.addEventListener('click', () => setPlat(b.dataset.plat)));
        panel.querySelectorAll('[data-modo]').forEach(b => b.addEventListener('click', () => setModo(b.dataset.modo)));
        setPlat(t.plataforma); setModo(cfg.modo);
      } });
  }
  function guardarTestForm(api, t0){
    const panel = api.el;
    const f = n => (panel.querySelector('[name="' + n + '"]') || {}).value || '';
    const err = panel.querySelector('.pl-error-form');
    const plataforma = panel.dataset.plat || 'tutor_bombero';
    const nombre = f('nombre').trim();
    if(!nombre){ err.textContent = 'Ponle un nombre al test.'; return false; }
    const referencia = plataforma === 'pjfire' ? null : (f('referencia').trim() || null);
    let url = null;
    if(plataforma !== 'pjfire' && f('url').trim()){
      url = urlSegura(f('url'));
      if(!url){ err.textContent = 'El enlace tiene que empezar por https:// (o http://).'; return false; }
    }
    if(plataforma === 'otra' && !url){ err.textContent = 'Para «Otra» plataforma hace falta el enlace.'; return false; }
    const clave = claveTest(plataforma, referencia, nombre);
    const dup = d.tests.find(x => x.id !== (t0 && t0.id) && claveTest(x.plataforma, x.referencia, x.nombre) === clave);
    if(dup){ err.textContent = 'Ya tienes ese test' + (dup.archivado ? ' (en el archivo)' : '') + ': «' + dup.nombre + '».'; return false; }
    const fila = Object.assign({}, t0 || {}, {
      id: t0 ? t0.id : uid(), tema_id: f('tema') || null, plataforma, nombre: textoCorto(nombre, 160), referencia, url, notas: f('notas').trim() || null,
      archivado: t0 ? !!t0.archivado : false
    });
    if(plataforma === 'pjfire'){
      const n = enteroONull(f('n')), min = enteroONull(f('minutos'));
      if(Number.isNaN(n) || n == null || n < 1 || n > 200){ err.textContent = 'El número de preguntas tiene que estar entre 1 y 200.'; return false; }
      if(Number.isNaN(min) || (min != null && (min < 1 || min > 600))){ err.textContent = 'Los minutos tienen que estar entre 1 y 600 (o vacío).'; return false; }
      const topics = [...panel.querySelectorAll('[name="topic"]:checked')].map(x => x.value);
      const tema = temaDe(fila.tema_id);
      if(!topics.length && !(tema && tema.topic_ids && tema.topic_ids.length)){ err.textContent = 'Elige de qué temas del banco salen las preguntas (o vincula su tema en Ajustes).'; return false; }
      fila.config = { modo: panel.dataset.modo || 'estudio', topic_ids: topics, n, minutos: panel.dataset.modo === 'examen' ? min : null };
      fila.num_preguntas = n;
    } else {
      const num = enteroONull(f('num'));
      if(Number.isNaN(num) || (num != null && (num < 1 || num > 500))){ err.textContent = 'El número de preguntas tiene que estar entre 1 y 500.'; return false; }
      fila.num_preguntas = num;
      fila.config = {};
    }
    delete fila.clave;
    guardar('plan_tests', fila);
    uiToast(t0 ? 'Test guardado.' : 'Test añadido: ' + fila.nombre + '.', 'success');
    repintar();
  }
  // Varios tests de golpe: «Test 1» … «Test 10».
  function anadirVarios(){
    hoja({ titulo: 'Añadir varios tests', ancha: true,
      html: '<p class="pl-hoja-txt">Para series numeradas de la misma plataforma, por ejemplo «Test 1» a «Test 10» del tema 5.</p>' +
        '<div class="pl-campo"><span>Plataforma</span><div class="pl-chips" role="radiogroup" aria-label="Plataforma">' +
        ['tutor_bombero', 'otra'].map((p, i) => '<button type="button" role="radio" aria-checked="' + (i === 0) + '" class="pl-chip' + (i === 0 ? ' on' : '') + '" data-plat="' + p + '">' + esc(PLANL.PLATAFORMAS[p]) + '</button>').join('') + '</div></div>' +
        '<label class="pl-campo"><span>Tema</span><select class="pl-input" name="tema">' + opcionesTemas(null) + '</select></label>' +
        '<label class="pl-campo"><span>Nombre (se le añade el número)</span><input class="pl-input" name="prefijo" maxlength="140" value="Test "></label>' +
        '<div class="pl-rejilla dos"><label class="pl-campo"><span>Desde</span><input class="pl-input" name="desde" inputmode="numeric" pattern="[0-9]*" value="1"></label>' +
        '<label class="pl-campo"><span>Hasta</span><input class="pl-input" name="hasta" inputmode="numeric" pattern="[0-9]*" value="10"></label></div>' +
        '<label class="pl-campo"><span>Identificador (opcional; «#» se cambia por el número)</span><input class="pl-input" name="ref" maxlength="150" placeholder="Por ejemplo: Tema 5 · Test #"></label>' +
        '<label class="pl-campo pl-solo-otra hidden"><span>Enlace (el mismo para todos)</span><input class="pl-input" name="url" type="url" inputmode="url" maxlength="500" placeholder="https://…"></label>' +
        '<p class="pl-previa pl-suave" aria-live="polite"></p><p class="pl-error-form" role="alert"></p>',
      botones: [{ texto: 'Crear', clase: 'primario', accion: api => crearVarios(api) }, { texto: 'Cancelar' }],
      alAbrir: panel => {
        panel.dataset.plat = 'tutor_bombero';
        const prev = () => {
          const l = listaVarios(panel);
          const p = panel.querySelector('.pl-previa');
          if(l.error){ p.textContent = l.error; return; }
          p.textContent = 'Se crearán ' + l.nuevos.length + (l.nuevos.length ? ': ' + l.nuevos.slice(0, 3).map(x => x.nombre).join(', ') + (l.nuevos.length > 3 ? '…' : '') : '') + (l.repetidos ? ' (' + l.repetidos + ' ya los tienes y se saltan)' : '') + '.';
        };
        panel.querySelectorAll('[data-plat]').forEach(b => b.addEventListener('click', () => {
          panel.dataset.plat = b.dataset.plat;
          panel.querySelectorAll('[data-plat]').forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-checked', x === b); });
          panel.querySelector('.pl-solo-otra').classList.toggle('hidden', b.dataset.plat !== 'otra');
          prev();
        }));
        panel.querySelectorAll('input, select').forEach(i => i.addEventListener('input', prev));
        prev();
      } });
  }
  function listaVarios(panel){
    const f = n => (panel.querySelector('[name="' + n + '"]') || {}).value || '';
    const desde = enteroONull(f('desde')), hasta = enteroONull(f('hasta'));
    if(desde == null || hasta == null || Number.isNaN(desde) || Number.isNaN(hasta) || hasta < desde) return { error: 'Revisa «desde» y «hasta».' };
    if(hasta - desde > 99) return { error: 'Como mucho 100 de una vez.' };
    const plataforma = panel.dataset.plat || 'tutor_bombero';
    const prefijo = f('prefijo');
    const ref = f('ref').trim();
    const nuevos = [];
    let repetidos = 0;
    const claves = new Set(d.tests.map(x => claveTest(x.plataforma, x.referencia, x.nombre)));
    for(let i = desde; i <= hasta; i++){
      const nombre = (prefijo + i).trim();
      const referencia = ref ? (ref.includes('#') ? ref.replace(/#/g, String(i)) : ref + ' ' + i) : null;
      const k = claveTest(plataforma, referencia, nombre);
      if(claves.has(k)){ repetidos++; continue; }
      claves.add(k);
      nuevos.push({ nombre: textoCorto(nombre, 160), referencia: referencia ? textoCorto(referencia, 160) : null });
    }
    return { nuevos, repetidos, plataforma };
  }
  function crearVarios(api){
    const panel = api.el;
    const err = panel.querySelector('.pl-error-form');
    const l = listaVarios(panel);
    if(l.error){ err.textContent = l.error; return false; }
    if(!l.nuevos.length){ err.textContent = 'No hay ninguno nuevo que crear.'; return false; }
    let url = null;
    if(l.plataforma === 'otra'){
      url = urlSegura(panel.querySelector('[name="url"]').value);
      if(!url){ err.textContent = 'Para «Otra» plataforma hace falta un enlace https://.'; return false; }
    }
    const tema = panel.querySelector('[name="tema"]').value || null;
    l.nuevos.forEach(x => guardar('plan_tests', { id: uid(), tema_id: tema, plataforma: l.plataforma, nombre: x.nombre, referencia: x.referencia, url, num_preguntas: null, config: {}, archivado: false }));
    uiToast('Añadidos ' + plural(l.nuevos.length, 'test', 'tests') + '.', 'success');
    repintar();
  }

  /* ============================================================
     AJUSTES
     ============================================================ */
  function pintarAjustes(el){
    const aj = ajustes();
    const r = aj.reglas;
    const REGLAS = [
      ['avisar_fuera_plan', 'Avisar si abro un test que no toca hoy', 'Te ofrece volver a tus tareas de hoy, añadirlo o abrirlo como excepción.'],
      ['respetar_limite', 'No pasar de mi límite diario', 'Para añadir más tests a un día lleno tendrás que autorizar una excepción.'],
      ['evitar_repetir', 'Avisar antes de repetir un test ya hecho', 'Para no repetirlo por error.'],
      ['mostrar_atrasadas', 'Mostrar las tareas atrasadas', 'En Hoy, y la planificación automática las recoloca primero.'],
      ['priorizar_pendientes', 'Priorizar lo aplazado', 'A igual prioridad, lo que ya se aplazó va antes.'],
      ['proponer_repasos', 'Proponer repasos de temas flojos', 'Cuando un tema baja del umbral de aciertos.']
    ];
    el.innerHTML = '<div class="pl-ajustes">' +
      '<button type="button" class="pl-enlace pl-volver" onclick="PLAN.irA(\'hoy\')">' + ICO.izq + ' Volver al plan</button><h2 class="pl-h2">Ajustes del plan</h2>' +
      '<section class="pl-card"><h3 class="pl-seccion">Ritmo</h3>' +
      '<div class="pl-ajuste-fila"><div><b>Límite diario</b><span class="pl-suave">Tests como máximo cada día.</span></div>' +
      '<div class="pl-stepper"><button type="button" class="pl-icono" onclick="PLAN.ajustarLimite(-1)" aria-label="Menos">−</button><span aria-live="polite">' + aj.limite_diario + '</span><button type="button" class="pl-icono" onclick="PLAN.ajustarLimite(1)" aria-label="Más">+</button></div></div>' +
      '<div class="pl-ajuste-fila col"><div><b>Días de estudio</b><span class="pl-suave">La planificación automática solo usa estos días.</span></div>' +
      '<div class="pl-chips">' + DIAS_CORTOS.map((x, i) => '<button type="button" class="pl-chip' + (aj.dias_estudio.includes(i + 1) ? ' on' : '') + '" aria-pressed="' + aj.dias_estudio.includes(i + 1) + '" onclick="PLAN.alternarDia(' + (i + 1) + ')" aria-label="' + ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'][i] + '">' + x + '</button>').join('') + '</div></div></section>' +
      '<section class="pl-card"><h3 class="pl-seccion">Reglas</h3>' + REGLAS.map(x =>
        '<div class="pl-ajuste-fila"><div><b>' + x[1] + '</b><span class="pl-suave">' + x[2] + '</span></div>' +
        '<button type="button" class="switch' + (r[x[0]] ? ' on' : '') + '" role="switch" aria-checked="' + !!r[x[0]] + '" aria-label="' + esc(x[1]) + '" onclick="PLAN.alternarRegla(\'' + x[0] + '\')"><span class="knob"></span></button></div>').join('') +
      '<div class="pl-ajuste-fila"><div><b>Umbral de repaso</b><span class="pl-suave">Un tema por debajo de este % de aciertos necesita repaso.</span></div>' +
      '<div class="pl-chips">' + [50, 60, 70, 80].map(u => '<button type="button" class="pl-chip' + (Number(r.umbral_repaso) === u ? ' on' : '') + '" aria-pressed="' + (Number(r.umbral_repaso) === u) + '" onclick="PLAN.ajustarUmbral(' + u + ')">' + u + ' %</button>').join('') + '</div></div></section>' +
      '<section class="pl-card"><h3 class="pl-seccion">Temas de la oposición <span class="pl-num gris">' + d.temas.filter(t => !t.archivado).length + '</span></h3>' +
      (d.temas.length ? temasOrdenados(true).map(t => '<div class="pl-fila' + (t.archivado ? ' archivado' : '') + '"><div class="pl-fila-txt"><b>' + esc(nombreTema(t.id)) + '</b><span>' +
        (t.bloque ? esc(t.bloque) + ' · ' : '') + ((t.topic_ids || []).length ? plural(t.topic_ids.length, 'tema del banco vinculado', 'temas del banco vinculados') : 'sin temas del banco vinculados') + (t.archivado ? ' · archivado' : '') + '</span></div>' +
        '<button type="button" class="btn btn-ghost" onclick="PLAN.editarTema(\'' + idAttr(t.id) + '\')">Editar</button></div>').join('') : '<p class="pl-suave">Aún no tienes temas.</p>') +
      '<div class="pl-acciones"><button type="button" class="btn btn-primary" onclick="PLAN.editarTema()">+ Nuevo tema</button><button type="button" class="btn btn-ghost" onclick="PLAN.crearVariosTemas()">Crear varios</button></div>' +
      '<p class="pl-pie">Vincular un tema con los temas de tu banco de pj.fire sirve para sus tests de pj.fire, los exámenes combinados y las estadísticas por tema.</p></section>' +
      '<section class="pl-card"><h3 class="pl-seccion">Tus datos</h3><p class="pl-hoja-txt">Tu plan es privado: en la app solo lo ves tú. La copia de seguridad diaria de la base de datos (que solo puede descargar el administrador) también lo incluye. Descárgate tu propia copia cuando quieras.</p>' +
      '<div class="pl-acciones"><button type="button" class="btn btn-ghost" onclick="PLAN.exportar()">Exportar (JSON)</button><button type="button" class="btn btn-ghost" onclick="PLAN.importar()">Importar una copia</button></div></section>' +
      '<section class="pl-card"><h3 class="pl-seccion">Tutor Bombero</h3>' +
      '<p class="pl-hoja-txt">Tutor Bombero no ofrece API, exportación de resultados ni enlaces directos a cada test, y sus condiciones dicen que el acceso es personal e intransferible. Por eso pj.fire no se conecta a tu cuenta, no guarda tus contraseñas y no copia su contenido:</p>' +
      '<ul class="pl-lista-txt"><li>«Abrir» abre su web en otra pestaña y apunta que lo abriste (no que lo terminaste).</li><li>Al volver te pregunta si lo terminaste y cuánto sacaste. Puedes copiar el resultado (también de una captura, con Texto en vivo del iPad) y pegarlo.</li>' +
      '<li>Solo controla lo que abres desde aquí: no puede bloquear Tutor Bombero si entras directamente.</li></ul>' +
      '<p class="pl-hoja-txt">Si quieres tu historial de resultados, la vía legítima es pedírselo al titular (derecho de acceso y portabilidad, arts. 15 y 20 del RGPD):</p>' +
      '<div class="pl-acciones"><button type="button" class="btn btn-ghost" onclick="PLAN.correoRgpd()">Ver borrador del correo</button></div></section>' +
      '</div>';
  }
  function guardarAjustes(cambios){
    const actual = d.ajustes || { limite_diario: ajustes().limite_diario, dias_estudio: ajustes().dias_estudio, reglas: {} };
    const fila = Object.assign({}, actual, cambios);
    delete fila.updated_at;
    guardar('plan_ajustes', fila);
    repintar();
  }
  function ajustarLimite(paso){
    const n = Math.max(1, Math.min(20, ajustes().limite_diario + paso));
    guardarAjustes({ limite_diario: n });
  }
  function alternarDia(n){
    let dias = ajustes().dias_estudio.slice();
    dias = dias.includes(n) ? dias.filter(x => x !== n) : dias.concat([n]).sort((a, b) => a - b);
    if(!dias.length){ uiToast('Deja al menos un día de estudio.', 'error'); return; }
    guardarAjustes({ dias_estudio: dias });
  }
  function alternarRegla(k){
    const guardadas = Object.assign({}, (d.ajustes && d.ajustes.reglas) || {});
    guardadas[k] = !ajustes().reglas[k];
    guardarAjustes({ reglas: guardadas });
  }
  function ajustarUmbral(u){
    const guardadas = Object.assign({}, (d.ajustes && d.ajustes.reglas) || {});
    guardadas.umbral_repaso = u;
    guardarAjustes({ reglas: guardadas });
  }
  function editarTema(id){
    const t0 = id ? temaDe(id) : null;
    const t = Object.assign({ topic_ids: [] }, t0 || {});
    hoja({ titulo: t0 ? 'Editar tema' : 'Nuevo tema', ancha: true,
      html: '<div class="pl-rejilla dos"><label class="pl-campo"><span>Número</span><input class="pl-input" name="numero" inputmode="numeric" pattern="[0-9]*" value="' + esc(t.numero == null ? '' : t.numero) + '"></label>' +
        '<label class="pl-campo"><span>Bloque (opcional)</span><input class="pl-input" name="bloque" maxlength="80" value="' + esc(t.bloque || '') + '" placeholder="Jurídico, específico…"></label></div>' +
        '<label class="pl-campo"><span>Nombre *</span><input class="pl-input" name="nombre" maxlength="160" value="' + esc(t.nombre || '') + '" autofocus></label>' +
        '<div class="pl-campo"><span>Temas de tu banco de pj.fire que le corresponden</span>' + checksTopics(t.topic_ids || [], 'topic') + '</div>' +
        (t0 ? '<label class="pl-check"><input type="checkbox" name="archivado"' + (t0.archivado ? ' checked' : '') + '><span>Archivado (no se usa al planificar)</span></label>' : '') +
        '<p class="pl-error-form" role="alert"></p>',
      botones: [{ texto: 'Guardar', clase: 'primario', accion: api => {
        const p = api.el;
        const err = p.querySelector('.pl-error-form');
        const nombre = p.querySelector('[name="nombre"]').value.trim();
        const numero = enteroONull(p.querySelector('[name="numero"]').value);
        if(!nombre){ err.textContent = 'Ponle un nombre.'; return false; }
        if(Number.isNaN(numero) || (numero != null && numero > 999)){ err.textContent = 'El número tiene que estar entre 0 y 999.'; return false; }
        if(d.temas.some(x => x.id !== (t0 && t0.id) && x.nombre.trim().toLowerCase() === nombre.toLowerCase())){ err.textContent = 'Ya tienes un tema con ese nombre.'; return false; }
        const fila = Object.assign({}, t0 || {}, {
          id: t0 ? t0.id : uid(), numero, nombre: textoCorto(nombre, 160), bloque: p.querySelector('[name="bloque"]').value.trim() || null,
          topic_ids: [...p.querySelectorAll('[name="topic"]:checked')].map(x => x.value).slice(0, 40),
          archivado: t0 ? !!(p.querySelector('[name="archivado"]') || {}).checked : false
        });
        guardar('plan_temas', fila);
        repintar();
      } }].concat(t0 ? [{ texto: 'Borrar', clase: 'peligro', accion: async () => {
        const n = d.tests.filter(x => x.tema_id === t0.id).length;
        if(!await uiConfirm('¿Borrar el tema «' + t0.nombre + '»?\n\n' + (n ? 'Sus ' + plural(n, 'test queda', 'tests quedan') + ' sin tema (no se borran). ' : '') + 'Si solo quieres dejar de usarlo, archívalo.')) return;
        borrar('plan_temas', t0.id);
        repintar();
      } }] : []).concat([{ texto: 'Cancelar' }]) });
  }
  // Pegar la lista de temas, uno por línea («5. Ley de Prevención…» o solo el nombre).
  function crearVariosTemas(){
    hoja({ titulo: 'Crear varios temas', ancha: true,
      html: '<p class="pl-hoja-txt">Escribe o pega tus temas, uno por línea. Si empiezan por un número («5. Prevención de Riesgos Laborales» o «Tema 5: …»), se usa como su número.</p>' +
        '<label class="pl-campo"><span>Temas</span><textarea class="pl-input" name="lista" rows="10" placeholder="1. Constitución Española&#10;2. Estatuto de Autonomía de Andalucía&#10;…" autofocus></textarea></label>' +
        '<p class="pl-previa pl-suave" aria-live="polite"></p>',
      botones: [{ texto: 'Crear', clase: 'primario', accion: api => {
        const l = analizarTemas(api.el.querySelector('[name="lista"]').value);
        if(!l.nuevos.length){ uiToast('No hay temas nuevos que crear.', 'error'); return false; }
        l.nuevos.forEach(x => guardar('plan_temas', { id: uid(), numero: x.numero, nombre: x.nombre, bloque: null, topic_ids: [], archivado: false }));
        uiToast('Creados ' + plural(l.nuevos.length, 'tema', 'temas') + '. Vincúlalos con tu banco en Ajustes › Temas.', 'success');
        repintar();
      } }, { texto: 'Cancelar' }],
      alAbrir: panel => {
        const ta = panel.querySelector('[name="lista"]'), p = panel.querySelector('.pl-previa');
        ta.addEventListener('input', () => { const l = analizarTemas(ta.value); p.textContent = l.nuevos.length ? 'Se crearán ' + l.nuevos.length + (l.repetidos ? ' (' + l.repetidos + ' ya existen)' : '') + '.' : ''; });
      } });
  }
  function analizarTemas(texto){
    const vistos = new Set(d.temas.map(t => t.nombre.trim().toLowerCase()));
    const nuevos = [];
    let repetidos = 0;
    String(texto || '').split(/\r?\n/).slice(0, 200).forEach(linea => {
      let s = linea.trim();
      if(!s) return;
      let numero = null;
      const m = /^(?:tema\s*)?(\d{1,3})\s*[.):\-–·]?\s+(.+)$/i.exec(s);
      if(m){ numero = Number(m[1]); s = m[2].trim(); }
      s = textoCorto(s, 160);
      if(!s) return;
      if(vistos.has(s.toLowerCase())){ repetidos++; return; }
      vistos.add(s.toLowerCase());
      nuevos.push({ numero, nombre: s });
    });
    return { nuevos, repetidos };
  }

  /* ---------- exportar / importar ---------- */
  const ORDEN_IMPORT = ['plan_ajustes', 'plan_temas', 'plan_tests', 'plan_tareas', 'plan_resultados', 'plan_preguntas', 'plan_eventos'];
  async function exportar(){
    let eventos = d.eventos;
    // En memoria solo están los 1000 últimos eventos: para la copia, todos.
    if(d.eventos.length >= 1000 && navigator.onLine){
      const cerrarAviso = uiToast('Preparando la copia…', 'info', { duration: 0 });
      try{ eventos = await todas('plan_eventos', yo(), q => q.order('at').order('id')); }
      catch(e){ eventos = d.eventos; uiToast('No se ha podido leer toda la actividad: la copia lleva solo la más reciente.', 'info'); }
      cerrarAviso();
      // Ya no hay gesto del usuario: se pide otro toque para descargar.
      hoja({ titulo: 'Tu copia está lista', html: '<p class="pl-hoja-txt">Pulsa para guardarla.</p>',
        botones: [{ texto: 'Descargar', clase: 'primario', accion: () => { descargarCopia(eventos); } }, { texto: 'Cancelar' }] });
      return;
    }
    descargarCopia(eventos);
  }
  function descargarCopia(eventos){
    const datos = {
      app: 'pj.fire', tipo: 'plan-de-estudio', version: 1, exportado: ahoraIso(), usuario: yo(),
      tablas: {
        plan_ajustes: d.ajustes ? [d.ajustes] : [], plan_temas: d.temas, plan_tests: d.tests, plan_tareas: d.tareas,
        plan_resultados: d.resultados, plan_preguntas: d.preguntas, plan_eventos: eventos
      }
    };
    const nombre = 'plan-de-estudio-' + hoy() + '.json';
    const blob = new Blob([JSON.stringify(datos, null, 1)], { type: 'application/json' });
    try{
      const file = new File([blob], nombre, { type: 'application/json' });
      if(isIOSDevice() && navigator.canShare && navigator.canShare({ files: [file] })){
        navigator.share({ files: [file], title: 'Copia de mi plan de estudio' }).catch(() => {});
        return;
      }
    }catch(e){}
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = nombre;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
    uiToast('Copia descargada: ' + nombre, 'success');
  }
  function importar(){
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.style.display = 'none';   // en el DOM: algunos iOS no avisan del cambio si no lo está
    document.body.appendChild(input);
    input.addEventListener('change', () => {
      const file = input.files && input.files[0];
      input.remove();
      if(!file) return;
      if(file.size > 15 * 1024 * 1024){ uiToast('El archivo es demasiado grande.', 'error'); return; }
      const fr = new FileReader();
      fr.onload = () => {
        let datos;
        try{ datos = JSON.parse(fr.result); }catch(e){ uiToast('No es un archivo JSON válido.', 'error'); return; }
        if(!datos || datos.tipo !== 'plan-de-estudio' || !datos.tablas || typeof datos.tablas !== 'object'){ uiToast('Ese archivo no es una copia del Plan de estudio.', 'error'); return; }
        importarDatos(datos.tablas, datos.usuario);
      };
      fr.onerror = () => uiToast('No se ha podido leer el archivo.', 'error');
      fr.readAsText(file);
    });
    input.click();
  }

  // Validación de una fila importada: solo columnas conocidas, con su tipo y
  // sus valores permitidos (un archivo manipulado no puede colar HTML ni
  // datos raros). Devuelve la fila limpia o null.
  const ES = {
    txt: (v, max, req) => { if(v == null || v === '') return req ? undefined : null; if(typeof v !== 'string') return undefined; const t = v.slice(0, max); return req && !t.trim() ? undefined : t; },
    ent: (v, min, max, req) => { if(v == null || v === '') return req ? undefined : null; const n = Number(v); return Number.isInteger(n) && n >= min && n <= max ? n : undefined; },
    num: (v, min, max) => { if(v == null || v === '') return null; const n = Number(v); return Number.isFinite(n) && n >= min && n <= max ? Math.round(n * 100) / 100 : undefined; },
    uuid: (v, req) => { if(v == null || v === '') return req ? undefined : null; return esUuid(v) ? v.toLowerCase() : undefined; },
    bool: v => v === true,
    enumv: (v, l, def) => l.includes(v) ? v : (def === undefined ? undefined : def),
    fecha: (v, req) => { if(v == null) return req ? undefined : null; return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined; },
    ts: (v, req) => { if(v == null || v === '') return req ? undefined : null; return Number.isFinite(msDe(v)) ? new Date(msDe(v)).toISOString() : undefined; },
    obj: (v, max) => { if(v == null) return {}; if(typeof v !== 'object' || Array.isArray(v)) return undefined; try{ return JSON.stringify(v).length <= max ? JSON.parse(JSON.stringify(v)) : undefined; }catch(e){ return undefined; } },
    textos: (v, maxN, maxL) => Array.isArray(v) ? v.filter(x => typeof x === 'string' && x.length <= maxL).slice(0, maxN) : []
  };
  function sanear(tabla, f){
    if(!f || typeof f !== 'object' || Array.isArray(f)) return null;
    let o;
    if(tabla === 'plan_ajustes'){
      const dias = Array.isArray(f.dias_estudio) ? f.dias_estudio.map(Number).filter(n => Number.isInteger(n) && n >= 1 && n <= 7) : [];
      o = { limite_diario: ES.ent(f.limite_diario, 1, 20, true), dias_estudio: dias.length ? [...new Set(dias)] : undefined, reglas: ES.obj(f.reglas, 3500) };
    } else if(tabla === 'plan_temas'){
      o = { id: ES.uuid(f.id, true), numero: ES.ent(f.numero, 0, 999), nombre: ES.txt(f.nombre, 160, true), bloque: ES.txt(f.bloque, 80), topic_ids: ES.textos(f.topic_ids, 40, 300), archivado: ES.bool(f.archivado) };
    } else if(tabla === 'plan_tests'){
      const plat = ES.enumv(f.plataforma, ['tutor_bombero', 'pjfire', 'otra']);
      let config = {};
      if(plat === 'pjfire'){
        const c = f.config && typeof f.config === 'object' ? f.config : {};
        config = { modo: ES.enumv(c.modo, ['estudio', 'examen', 'fallos'], 'estudio'), topic_ids: ES.textos(c.topic_ids, 40, 300), n: ES.ent(c.n, 1, 200) || 20, minutos: ES.ent(c.minutos, 1, 600) || null };
      }
      o = { id: ES.uuid(f.id, true), tema_id: ES.uuid(f.tema_id), plataforma: plat, nombre: ES.txt(f.nombre, 160, true), referencia: ES.txt(f.referencia, 160),
        url: f.url ? (urlSegura(f.url) || undefined) : null, num_preguntas: ES.ent(f.num_preguntas, 1, 500), config, notas: ES.txt(f.notas, 1000), archivado: ES.bool(f.archivado) };
    } else if(tabla === 'plan_tareas'){
      const estado = ES.enumv(f.estado, Object.keys(PLANL.ESTADOS));
      o = { id: ES.uuid(f.id, true), test_id: ES.uuid(f.test_id, true), fecha: ES.fecha(f.fecha, true), orden: ES.ent(f.orden, -32768, 32767) || 0,
        prioridad: ES.ent(f.prioridad, 1, 3) || 2, estado, origen: ES.enumv(f.origen, ['plan', 'auto', 'repaso', 'excepcion'], 'plan'),
        veces_aplazada: ES.ent(f.veces_aplazada, 0, 999) || 0, abierta_at: ES.ts(f.abierta_at), completada_at: ES.ts(f.completada_at),
        resultado_id: ES.uuid(f.resultado_id), nota: ES.txt(f.nota, 500) };
      if(o.estado === 'completado' && !o.completada_at) o.completada_at = o.fecha + 'T12:00:00Z';
    } else if(tabla === 'plan_resultados'){
      let detalle = null;
      if(Array.isArray(f.detalle)){
        detalle = f.detalle.slice(0, 300).filter(x => x && typeof x === 'object' && typeof x.k === 'string' && /^(b:\d{1,15}|p:[0-9a-f-]{36})$/i.test(x.k)).map(x => ({
          k: x.k, t: esUuid(x.t) ? x.t : null, f: ['pjfire', 'propia', 'tutor_bombero', 'otra'].includes(x.f) ? x.f : null,
          ok: x.ok === true ? true : x.ok === false ? false : null, s: Number.isInteger(x.s) && x.s >= 0 && x.s <= 3 ? x.s : null }));
      }
      o = { id: ES.uuid(f.id, true), test_id: ES.uuid(f.test_id), tarea_id: ES.uuid(f.tarea_id), fuente: ES.enumv(f.fuente, ['manual', 'pjfire', 'examen']),
        realizado_at: ES.ts(f.realizado_at, true), aciertos: ES.ent(f.aciertos, 0, 1000), fallos: ES.ent(f.fallos, 0, 1000), blancos: ES.ent(f.blancos, 0, 1000),
        total: ES.ent(f.total, 1, 1000), nota: ES.num(f.nota, 0, 10), duracion_seg: ES.ent(f.duracion_seg, 0, 86400), duracion_medida: ES.bool(f.duracion_medida),
        session_id: ES.uuid(f.session_id), titulo: ES.txt(f.titulo, 160), detalle, notas: ES.txt(f.notas, 1000) };
      if(o.aciertos == null && o.nota == null) return null;
    } else if(tabla === 'plan_preguntas'){
      const ops = Array.isArray(f.opciones) && f.opciones.length >= 2 && f.opciones.length <= 4 && f.opciones.every(x => typeof x === 'string' && x.length <= 500) ? f.opciones.slice() : undefined;
      o = { id: ES.uuid(f.id, true), tema_id: ES.uuid(f.tema_id), fuente: ES.enumv(f.fuente, ['propia', 'tutor_bombero', 'otra'], 'propia'), referencia: ES.txt(f.referencia, 160),
        enunciado: ES.txt(f.enunciado, 2000, true), opciones: ops, correcta: ops ? ES.ent(f.correcta, 0, ops.length - 1, true) : undefined, explicacion: ES.txt(f.explicacion, 4000), archivada: ES.bool(f.archivada) };
    } else if(tabla === 'plan_eventos'){
      o = { id: ES.uuid(f.id, true), tipo: ES.enumv(f.tipo, ['abierto', 'completado', 'reabierto', 'aplazado', 'cancelado', 'aviso_fuera_plan', 'aviso_repetido', 'aviso_limite', 'excepcion']),
        tarea_id: ES.uuid(f.tarea_id), test_id: ES.uuid(f.test_id), at: ES.ts(f.at, true), datos: ES.obj(f.datos, 1500) };
    } else return null;
    return Object.values(o).some(v => v === undefined) ? null : o;
  }
  // Importa sin duplicar: lo que ya existe (mismo id o mismo nombre o
  // identificador) se salta y las referencias se rehacen hacia lo que ya
  // había. Si la copia es de otra cuenta, todo recibe ids nuevos. Se sube
  // por lotes (una petición por tabla y bloque).
  async function importarDatos(t, usuarioCopia){
    if(!cargado){ uiToast('Espera a que cargue tu plan.', 'error'); return; }
    const cuenta = k => Array.isArray(t[k]) ? t[k].length : 0;
    if(!await uiConfirm('¿Importar esta copia?\n\n' + cuenta('plan_temas') + ' temas, ' + cuenta('plan_tests') + ' tests, ' + cuenta('plan_tareas') + ' tareas y ' + cuenta('plan_resultados') + ' resultados. Lo que ya tengas no se duplica.', { ok: 'Importar' })) return;
    const deOtraCuenta = !!usuarioCopia && usuarioCopia !== yo();
    const mapa = {};   // id de la copia → id en tu plan
    const re = id => (id && mapa[id]) || (deOtraCuenta ? null : id);
    let nuevos = 0, saltados = 0, invalidos = 0;
    const lotes = {};
    const anadir = (tabla, f) => {
      (lotes[tabla] = lotes[tabla] || []).push(Object.assign(f, { user_id: yo() }));
      aplicarLocal({ op: 'upsert', tabla, fila: f });   // para que lo siguiente vea lo ya importado
      nuevos++;
    };
    ORDEN_IMPORT.forEach(tabla => {
      (Array.isArray(t[tabla]) ? t[tabla] : []).forEach(f0 => {
        const f = sanear(tabla, f0);
        if(!f){ invalidos++; return; }
        if(tabla === 'plan_ajustes'){ if(!d.ajustes){ guardar('plan_ajustes', f); nuevos++; } else saltados++; return; }
        const k = TABLAS[tabla];
        const original = f.id;
        if(!deOtraCuenta && d[k].some(x => x.id === f.id)){ saltados++; return; }
        if(deOtraCuenta){ f.id = uid(); mapa[original] = f.id; }
        if(tabla === 'plan_temas'){
          const ya = d.temas.find(x => String(x.nombre).trim().toLowerCase() === f.nombre.trim().toLowerCase());
          if(ya){ mapa[original] = ya.id; saltados++; return; }
        } else if(tabla === 'plan_tests'){
          f.tema_id = re(f.tema_id);
          if(f.tema_id && !temaDe(f.tema_id)) f.tema_id = null;
          const ya = d.tests.find(x => claveTest(x.plataforma, x.referencia, x.nombre) === claveTest(f.plataforma, f.referencia, f.nombre));
          if(ya){ mapa[original] = ya.id; saltados++; return; }
        } else if(tabla === 'plan_tareas'){
          f.test_id = re(f.test_id);
          if(!testDe(f.test_id) || d.tareas.some(x => x.test_id === f.test_id && x.fecha === f.fecha)){ saltados++; return; }
          f.resultado_id = null;   // se rehace al importar los resultados
        } else if(tabla === 'plan_resultados'){
          f.test_id = re(f.test_id); f.tarea_id = re(f.tarea_id);
          if(f.test_id && !testDe(f.test_id)) f.test_id = null;
          if(f.tarea_id && !tareaDe(f.tarea_id)) f.tarea_id = null;
          if(f.session_id && d.resultados.some(x => x.session_id === f.session_id)){ saltados++; return; }
          if(f.detalle) f.detalle.forEach(x => { x.t = re(x.t); if(x.k.startsWith('p:')){ const p = re(x.k.slice(2)); if(p) x.k = 'p:' + p; } });
        } else if(tabla === 'plan_preguntas'){
          f.tema_id = re(f.tema_id);
          if(f.tema_id && !temaDe(f.tema_id)) f.tema_id = null;
          const n = PLANL.normalizar(f.enunciado);
          if(d.preguntas.some(x => PLANL.normalizar(x.enunciado) === n)){ saltados++; return; }
        } else if(tabla === 'plan_eventos'){
          f.tarea_id = re(f.tarea_id); f.test_id = re(f.test_id);
        }
        anadir(tabla, f);
      });
    });
    // Tareas completadas: su resultado (el que apunta a ellas).
    (lotes.plan_resultados || []).forEach(r => {
      const tarea = r.tarea_id && (lotes.plan_tareas || []).find(x => x.id === r.tarea_id);
      if(tarea && tarea.estado === 'completado'){ tarea.resultado_id = r.id; aplicarLocal({ op: 'upsert', tabla: 'plan_tareas', fila: tarea }); }
    });
    // A la cola, por lotes de 200 y en orden (temas antes que tests, etc.).
    const u = yo();
    const ops = [];
    ORDEN_IMPORT.forEach(tabla => {
      const l = lotes[tabla] || [];
      for(let i = 0; i < l.length; i += 200) ops.push({ op: 'lote', tabla, filas: l.slice(i, i + 200), n: uid() });
    });
    if(ops.length && !guardarCola(cola(u).concat(ops), u)){ uiToast('No se ha podido guardar la importación en el dispositivo.', 'error'); cargar(); return; }
    guardarCache();
    actualizarAviso();
    subir();
    uiToast('Importado: ' + nuevos + ' nuevos, ' + saltados + ' que ya tenías' + (invalidos ? ' y ' + invalidos + ' no válidos (no se importan)' : '') + '.', 'success');
    repintar();
  }
  function correoRgpd(){
    const texto = 'Asunto: Solicitud de copia de mis datos y resultados (arts. 15 y 20 del RGPD)\n\n' +
      'Hola:\n\n' +
      'Soy usuario de la plataforma TOB con el usuario «[tu usuario]». Os escribo para ejercer mi derecho de acceso (art. 15 del Reglamento General de Protección de Datos) y, en lo que corresponda, de portabilidad (art. 20): os pido una copia de los datos personales que tratáis sobre mí y, en particular, de mi historial de tests y resultados (fecha, test, aciertos, fallos y nota), en un formato electrónico de uso común, por ejemplo CSV o JSON.\n\n' +
      'También quería preguntaros si tenéis, o tenéis previsto, algún modo de exportar los resultados, y si os parece bien que lleve mi propio registro de estudio con ellos, solo para uso personal.\n\n' +
      'Muchas gracias.\n\nUn saludo,\n[tu nombre]';
    hoja({ titulo: 'Correo para pedir tus resultados', ancha: true,
      html: '<p class="pl-hoja-txt">Para: <b>info@tutorbomberos.es</b> (el contacto que publica la web). Por ley tienen un mes para responder y es gratis.</p>' +
        '<textarea class="pl-input pl-correo" rows="14" readonly>' + esc(texto) + '</textarea>',
      botones: [{ texto: 'Copiar', clase: 'primario', accion: () => {
        (navigator.clipboard && navigator.clipboard.writeText ? navigator.clipboard.writeText(texto) : Promise.reject())
          .then(() => uiToast('Copiado.', 'success'), () => uiToast('No se ha podido copiar: selecciónalo y cópialo a mano.', 'error'));
        return false;
      } }, { texto: 'Cerrar' }] });
  }

  return {
    // ciclo de vida
    abrir, reiniciar, alEntrar, alCambiarPermisos, alTerminarTest, recargar: () => { cargar(); },
    // para PLANX y PLANP
    datos: () => Object.assign({}, d, { cargado, error: errorCarga }),
    hoy, uid, guardar, cambiar, borrar, evento, temaDe, testDe, tareaDe, mapaTopicTema, nombreTema, hoja, repintar, irA,
    apuntarResultado, programar, temasOrdenados, etiquetaPlataforma, textoResultado, reintentarYa,
    // acciones de la interfaz (onclick)
    abrirTarea, abrirTest, apuntarTarea, verTarea, menuTarea, moverTarea, aplazar, anadirTarea, programarHoy, programarRepaso,
    repasoFallos, planificarAuto, vista, navegar, verDia, filtrarTests, alternarArchivados, programarTest, menuTest, editarTest,
    anadirVarios, ajustarLimite, alternarDia, alternarRegla, ajustarUmbral, editarTema, crearVariosTemas, exportar, importar, correoRgpd
  };
})();
