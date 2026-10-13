/* Carga de temas, árbol y preguntas desde Supabase, con copia en el
   dispositivo (IndexedDB) para abrir rápido y sin conexión. */

/* ---------- load app content (topics/estructura en árbol/questions) from Supabase ---------- */
function nodeFullPath(nodeId){
  const parts = [];
  let cur = NODES_BY_ID[nodeId];
  while(cur){
    parts.unshift(nodeDisplayName(cur));
    cur = cur.padre_id ? NODES_BY_ID[cur.padre_id] : null;
  }
  return parts.join(' › ');
}
/* Supabase/PostgREST limita cada select() a un máximo de filas por defecto
   (p.ej. 1000), aunque no haya ningún .limit() explícito en el código: a
   partir de ese número, corta la respuesta en silencio y sin error. Como
   la tabla "questions" puede superar ese límite, cualquier select('*') sin
   paginar puede devolver solo una parte de las preguntas (y, al no llevar
   tampoco ORDER BY, un subconjunto distinto y arbitrario en cada carga).
   Esta función pagina con .range() hasta traer todas las filas. */
/* ---------- Banco de preguntas guardado en el dispositivo ----------
   Las ~2.000 preguntas (2,5 MB) se guardan en IndexedDB. En cada entrada
   solo se piden a Supabase las que han cambiado (updated_at) o se han
   borrado (questions_deleted) desde la última vez, y se comprueba el total;
   si algo no cuadra, o cada 7 días, se descarga todo de nuevo. Ahorra
   transferencia de Supabase y acelera el arranque. */
const QCACHE_KEY = 'questions_v1';
function idbOpen(){
  return new Promise((resolve, reject) => {
    const r = indexedDB.open('pjfire', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('kv');
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
async function idbGet(key){
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const t = db.transaction('kv').objectStore('kv').get(key);
    t.onsuccess = () => resolve(t.result);
    t.onerror = () => reject(t.error);
  });
}
async function idbSet(key, value){
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('kv', 'readwrite');
    tx.objectStore('kv').put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
let questionsCacheMem = null;
async function loadQuestionsCached(){
  const OVERLAP_MS = 15 * 60 * 1000;         // margen (escrituras lentas, reloj del móvil algo desfasado)
  const FULL_EVERY_MS = 7 * 24 * 3600 * 1000;
  let cache = questionsCacheMem;
  if(!cache){ try{ cache = await idbGet(QCACHE_KEY); }catch(e){ cache = null; } pasoArranque('copia guardada ' + (cache && cache.rows ? cache.rows.length : 0)); }
  let rows = null;
  const syncStart = Date.now();
  if(cache && Array.isArray(cache.rows) && cache.syncedAt && (Date.now() - (cache.fullAt || 0)) < FULL_EVERY_MS){
    try{
      // Todo lo que cambió antes de la última sincronización ya lo tenemos.
      const since = new Date(cache.syncedAt - OVERLAP_MS).toISOString();
      // 1) Ligero: solo id + fecha de las que han cambiado hace poco.
      const [lite, del, cnt] = await Promise.all([
        sb.from('questions').select('id, updated_at').gte('updated_at', since).order('id').range(0, 4999),
        sb.from('questions_deleted').select('id').gte('deleted_at', since),
        sb.from('questions').select('id', { count: 'exact', head: true })
      ]);
      if(!lite.error && !del.error && !cnt.error){
        const byId = new Map(cache.rows.map(r => [r.id, r]));
        // 2) Completas solo las que de verdad difieren de lo guardado.
        const need = (lite.data || []).filter(x => { const c = byId.get(x.id); return !c || c.updated_at !== x.updated_at; }).map(x => x.id);
        let fresh = [], ok = need.length <= 800;
        for(let i = 0; ok && i < need.length; i += 200){
          const r = await sb.from('questions').select('*').in('id', need.slice(i, i + 200));
          if(r.error){ ok = false; break; }
          fresh = fresh.concat(r.data || []);
        }
        if(ok){
          (del.data || []).forEach(d => byId.delete(d.id));
          fresh.forEach(r => byId.set(r.id, r));
          if(byId.size === cnt.count){
            rows = [...byId.values()].sort((a, b) => a.id - b.id);
            cache = { rows, syncedAt: syncStart, fullAt: cache.fullAt };
            idbSet(QCACHE_KEY, cache).catch(() => {});
            pasoArranque('preguntas al día (' + fresh.length + ' cambiadas)');
          }
        }
      }
    }catch(e){ rows = null; }
  }
  if(!rows){
    const { data, error } = await fetchAllRows('questions', '*', q => q.order('id'));
    if(error && !data) return { data: null, error };
    rows = data || [];
    pasoArranque('preguntas descargadas enteras (' + rows.length + ')');
    cache = { rows, syncedAt: syncStart, fullAt: syncStart };
    idbSet(QCACHE_KEY, cache).catch(() => {});
  }
  questionsCacheMem = cache;
  // Copia: quien las usa les añade datos del usuario y no debe tocar la caché.
  return { data: (typeof structuredClone === 'function') ? structuredClone(rows) : JSON.parse(JSON.stringify(rows)), error: null };
}

async function fetchAllRows(tableName, selectCols, applyOrder){
  const PAGE_SIZE = 1000;
  // Se pregunta primero cuántas filas hay y luego se piden todas las
  // páginas a la vez (antes iban una detrás de otra, y con datos móviles
  // eso alargaba mucho la entrada a la app).
  try{
    const { count, error: cErr } = await sb.from(tableName).select('*', { count: 'exact', head: true });
    if(!cErr && typeof count === 'number'){
      const pages = Math.max(1, Math.ceil(count / PAGE_SIZE));
      const results = await Promise.all(Array.from({ length: pages }, (_, i) => {
        let q = sb.from(tableName).select(selectCols || '*');
        if(applyOrder) q = applyOrder(q);
        return q.range(i * PAGE_SIZE, (i + 1) * PAGE_SIZE - 1);
      }));
      const failed = results.find(r => r.error);
      if(!failed){
        let rows = [];
        results.forEach(r => { rows = rows.concat(r.data || []); });
        // Si justo se añadieron filas entre medias, se completa con la vía normal.
        if(rows.length >= count) return { data: rows, error: null };
      }
    }
  }catch(e){ /* si algo falla, se usa la carga página a página de siempre */ }
  let allRows = [];
  let from = 0;
  while(true){
    let query = sb.from(tableName).select(selectCols || '*');
    if(applyOrder) query = applyOrder(query);
    const { data, error } = await query.range(from, from + PAGE_SIZE - 1);
    if(error) return { data: allRows.length ? allRows : null, error };
    allRows = allRows.concat(data || []);
    if(!data || data.length < PAGE_SIZE) break; // última página
    from += PAGE_SIZE;
  }
  return { data: allRows, error: null };
}
async function loadAppData(){
  const [{ data: topicsData, error: topicsErr }, { data: nodesData }, { data: questionsData }] = await Promise.all([
    sb.from('topics').select('*').order('sort_order'),
    sb.from('nodos_temario').select('*').order('orden'),
    loadQuestionsCached()
  ]);
  if(topicsErr) console.error('Error cargando temas', topicsErr);

  NODES_BY_ID = {};
  (nodesData || []).forEach(n => { NODES_BY_ID[n.id] = n; });

  // Para la pantalla "detalle de tema" del alumno: en vez de listar los artículos
  // (demasiado granular), listamos solo los grupos de nivel raíz que NO sean
  // artículo (normalmente Títulos, o el nivel que se haya usado). Elegir un grupo
  // incluye todas las preguntas colgadas de él y de sus subniveles/artículos.
  TOPIC_GROUPS = {};
  const nodesByTopic = {};
  (nodesData || []).forEach(n => { (nodesByTopic[n.topic_id] = nodesByTopic[n.topic_id] || []).push(n); });
  Object.keys(nodesByTopic).forEach(topicId => {
    const roots = nodesByTopic[topicId].filter(n => !n.padre_id && n.tipo !== 'articulo').sort(compareNodes);
    TOPIC_GROUPS[topicId] = roots.map(n => ({ id: n.id, label: nodeDisplayName(n) }));
  });

  let masteryByQuestion = {};
  let dismissedMap = {}; // { question_id: dismissed_at } — preguntas descartadas de Fallos
  let myNotesMap = {}; // { question_id: { own_note, ai_explain } } — privado del usuario actual
  if(currentUser){
    const qIds = (questionsData || []).map(q => q.id);
    // Estas consultas no dependen una de otra, así que van en paralelo en
    // vez de una detrás de otra (ahorra viajes de ida y vuelta a Supabase
    // en cada entrada a la app).
    const [mastery, { data: dismissedData, error: dismissedErr }, { data: myNotesData, error: myNotesErr }] = await Promise.all([
      qIds.length ? computeQuestionMastery(qIds) : Promise.resolve({}),
      sb.from('dismissed_fails').select('question_id, dismissed_at').eq('user_id', currentUser.id),
      // Notas propias y explicaciones de IA: viven en una tabla privada por
      // usuario (question_user_data), no en la propia pregunta, para que no
      // se vean entre distintas cuentas.
      qIds.length ? sb.rpc('get_my_question_data', { p_question_ids: qIds }) : Promise.resolve({ data: [] })
    ]);
    masteryByQuestion = mastery;
    pasoArranque('respuestas y notas');
    if(dismissedErr) console.error('Error cargando preguntas descartadas de Fallos', dismissedErr);
    (dismissedData || []).forEach(d => { dismissedMap[d.question_id] = d.dismissed_at; });
    if(myNotesErr) console.error('Error cargando notas/explicaciones propias', myNotesErr);
    (myNotesData || []).forEach(d => { myNotesMap[d.question_id] = { own_note: d.own_note || null, ai_explain: d.ai_explain || null }; });
  }
  QUESTIONS_ALL = (questionsData || []).map(row => {
    const m = masteryByQuestion[row.id];
    row._failCount = m ? m.failCount : 0;
    row._timesSeen = m ? m.timesSeen : 0;
    row._status = m ? m.status : null;
    row._lastAttemptAt = m ? m.lastAttemptAt : null;
    // Oculta de Fallos si se descartó Y no hay ningún intento (fallado o no)
    // posterior a ese descarte. Si vuelve a fallarse, el nuevo intento es
    // más reciente y esto pasa a false automáticamente.
    const dismissedAt = dismissedMap[row.id];
    const lastAttemptAt = m ? m.lastAttemptAt : null;
    row._fallosHidden = !!(dismissedAt && (!lastAttemptAt || new Date(dismissedAt) >= new Date(lastAttemptAt)));
    // La columna own_note/ai_explain de la propia pregunta ya no se usa
    // (era compartida entre todos los usuarios); se sustituye por el dato
    // privado del usuario actual, si lo hay.
    const mine = myNotesMap[row.id];
    row.own_note = mine ? mine.own_note : null;
    row.ai_explain = mine ? mine.ai_explain : null;
    return mapDbQuestionToQuiz(row);
  });

  TOPICS_DATA = topicsData || [];
  aplicarFuenteLegis();
  // Antes esto marcaba todos los temas como seleccionados nada más cargar
  // la app. Ahora se deja vacío: nada preseleccionado hasta que el
  // usuario elija temas o pulse "Seleccionar todo" él mismo.
  configState.nodeSelections = {};
}

/* ---------- Legislación: preguntas de pj.fire y de tutorbomberos ----------
   Todas van juntas (un solo Legislación, historial, Fallos y estadísticas).
   Cada pregunta sabe de dónde es (q.fuente: 'pj' o 'tb') y al preparar un
   test se elige de cuáles («Preguntas de»: Todas, pj.fire o Tutorbombero;
   configState.fuente). En Estadísticas › Legislación hay un filtro opcional
   (fuenteStats, Todas por defecto). Cada sesión guarda de qué fuente eran
   sus preguntas ('pj', 'tb' o 'mix'). */
const FUENTES_LEGIS = { pj: 'pj.fire', tb: 'Tutorbombero' };
let TOPICS_DATA = [];
let fuenteStats = 'todas';
const fuenteDe = q => (q && q.fuente) || 'pj';
// ¿Esta pregunta entra con la fuente elegida? ('todas', 'pj' o 'tb')
const deFuente = (q, f) => !f || f === 'todas' || fuenteDe(q) === f;
// La fuente de un conjunto de preguntas: 'pj', 'tb' o 'mix'.
function fuenteDeConjunto(preguntas){
  const fs = new Set((preguntas || []).map(fuenteDe));
  return fs.size > 1 ? 'mix' : fs.has('tb') ? 'tb' : 'pj';
}
const hayTutorbombero = () => QUESTIONS_ALL.some(q => fuenteDe(q) === 'tb');
// Títulos bloqueados (nodos_temario.bloqueado: los que se crearon para colocar preguntas de
// tutorbomberos y no estaban en tu temario): sus preguntas no salen en ningún test ni cuentan en
// Estadísticas hasta desbloquearlos.
function nodoBloqueado(id){
  let n = NODES_BY_ID[id];
  while(n){ if(n.bloqueado) return true; n = n.padre_id ? NODES_BY_ID[n.padre_id] : null; }
  return false;
}
async function bloquearNodo(id, bloquear){
  const { error } = await sb.from('nodos_temario').update({ bloqueado: bloquear }).eq('id', id);
  if(error){ uiToast('No se pudo ' + (bloquear ? 'bloquear' : 'desbloquear') + ': ' + error.message, 'error'); return false; }
  if(NODES_BY_ID[id]) NODES_BY_ID[id].bloqueado = bloquear;
  aplicarFuenteLegis();
  if(typeof refreshGlobalStats === 'function') refreshGlobalStats();
  return true;
}
function aplicarFuenteLegis(){
  QUESTIONS_POOL = QUESTIONS_ALL.filter(q => !q.nodo_id || !nodoBloqueado(q.nodo_id));
  const redByTopic = {};
  QUESTIONS_POOL.forEach(q => {
    if(!q.topic_id) return;
    // Este contador alimenta solo la pantalla/badge de Fallos: las
    // descartadas no cuentan aquí, pero siguen contando como fallos en
    // Estadísticas (renderMasteryBar/renderTopicRanking usan masteryStatus
    // directamente y no miran fallosHidden).
    if(q.masteryStatus === 'red' && !q.fallosHidden) redByTopic[q.topic_id] = (redByTopic[q.topic_id] || 0) + 1;
  });
  TOPICS = TOPICS_DATA.map(t => ({
    id: t.id, category: t.category, name: t.name, desc: t.description, enabled: t.enabled,
    fails: redByTopic[t.id] || 0
  }));
  pintarFuenteStats();
}
// Las preguntas que miran las Estadísticas de Legislación (todas o las de una fuente).
const poolStats = () => fuenteStats === 'todas' ? QUESTIONS_POOL : QUESTIONS_POOL.filter(q => fuenteDe(q) === fuenteStats);
// Filtro de Estadísticas › Legislación: solo sale si hay preguntas de tutorbomberos.
function pintarFuenteStats(){
  const el = document.getElementById('statsFuente');
  if(!el) return;
  if(!hayTutorbombero()){ el.innerHTML = ''; fuenteStats = 'todas'; return; }
  // Solo las que pueden salir (sin las de títulos bloqueados).
  const n = k => (k === 'todas' ? QUESTIONS_POOL : QUESTIONS_POOL.filter(q => fuenteDe(q) === k)).length;
  el.innerHTML = [['todas', 'Todas'], ['pj', FUENTES_LEGIS.pj], ['tb', FUENTES_LEGIS.tb]].map(([k, t]) =>
    '<button type="button" class="legis-fuente-op' + (k === fuenteStats ? ' on' : '') + '" onclick="cambiarFuenteStats(\'' + k + '\')" aria-pressed="' + (k === fuenteStats) + '">' +
      t + '<span>' + n(k).toLocaleString('es-ES') + '</span></button>').join('');
}
async function cambiarFuenteStats(f){
  if(f === fuenteStats) return;
  fuenteStats = f;
  pintarFuenteStats();
  try{ await refreshGlobalStats(); }catch(e){}
}
