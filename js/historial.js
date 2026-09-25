/* Historial de tests: lista de Inicio, «Todo el historial» y borrado. */

/* Construye la fila (fecha + tarjeta) de una entrada del historial y la
   añade al contenedor dado. Se reutiliza tanto en el Historial de Inicio
   (10 más recientes) como en "Todo el historial" (lista completa filtrable
   por tipo de test). */
function renderHistoryEntry(container, h){
  const dateEl = document.createElement('div');
  dateEl.className = 'hist-date';
  dateEl.textContent = h.date;
  container.appendChild(dateEl);

  const item = document.createElement('div');
  item.className = 'hist-item t-' + h.type;
  item.setAttribute('role','button');
  item.setAttribute('tabindex','0');
  item.innerHTML =
    '<div class="hist-icon">' + ICONS[h.type] + '</div>' +
    '<div class="hist-content">' +
      '<div class="hist-top">' +
        '<div class="hist-title">' + h.title + '</div>' +
        '<div class="hist-top-right">' +
          '<div class="hist-score">Nota <b>' + h.nota + '</b></div>' +
          '<button class="hist-delete-btn" type="button" aria-label="Borrar test" title="Borrar test">' + ICONS.trash + '</button>' +
        '</div>' +
      '</div>' +
      '<div class="hist-bottom">' +
        '<div class="hist-meta">' + ICONS.clock + h.time + '</div>' +
        '<div class="hist-counts">' +
          '<span class="c-ok">' + ICONS.ok + h.ok + '</span>' +
          '<span class="c-bad">' + ICONS.bad + h.bad + '</span>' +
          '<span class="c-pending">' + ICONS.pending + h.pending + '</span>' +
        '</div>' +
      '</div>' +
    '</div>';
  item.onclick = async () => {
    if(h.review){ openReview(h.review, h.title + ' · Nota ' + h.nota); return; }
    const { data: rows, error } = await sb
      .from('session_answers')
      .select('question_id, selected_index, is_correct, answer_order, questions(*)')
      .eq('session_id', h.id)
      .order('answer_order');
    if(error || !rows || !rows.length){
      uiToast('Este test no tiene datos de corrección guardados.');
      return;
    }
    const review = {
      // own_note/ai_explain ya no viajan en la fila de la pregunta (son
      // privados por usuario): se toman de QUESTIONS_POOL, donde ya se
      // fusionaron al cargar la app.
      questions: rows.map(r => {
        const mapped = mapDbQuestionToQuiz(r.questions);
        const pooled = QUESTIONS_POOL.find(pq => pq.id === mapped.id);
        if(pooled){
          mapped.own_note = pooled.own_note;
          mapped.ai_explain = pooled.ai_explain;
        }
        return mapped;
      }),
      answers: rows.map(r => r.selected_index)
    };
    h.review = review;
    openReview(review, h.title + ' · Nota ' + h.nota);
  };
  item.onkeydown = (e) => { if(e.key === 'Enter') item.onclick(); };
  const delBtn = item.querySelector('.hist-delete-btn');
  delBtn.onclick = (e) => { e.stopPropagation(); deleteHistoryItem(h, delBtn); };
  delBtn.onkeydown = (e) => { e.stopPropagation(); };
  container.appendChild(item);
}
/* Como mucho las 10 entradas más recientes del historial (ya viene
   ordenado del más nuevo al más viejo); si hay más, se ve una 11ª tarjeta
   difuminada con "Pulsa para ver más" que lleva a "Todo el historial". */
function renderHistory(){
  const el = document.getElementById('historyList');
  el.innerHTML = '';

  const LIMIT = 10;
  const hasMore = HISTORY.length > LIMIT;
  const visibleHistory = hasMore ? HISTORY.slice(0, LIMIT) : HISTORY;

  visibleHistory.forEach(h => renderHistoryEntry(el, h));

  if(hasMore){
    const peek = HISTORY[LIMIT];
    const peekWrap = document.createElement('div');
    peekWrap.className = 'hist-item t-' + peek.type + ' addition-card-peek';
    peekWrap.setAttribute('role','button');
    peekWrap.setAttribute('tabindex','0');
    peekWrap.innerHTML =
      '<div class="hist-icon">' + ICONS[peek.type] + '</div>' +
      '<div class="hist-content">' +
        '<div class="hist-top">' +
          '<div class="hist-title">' + peek.title + '</div>' +
          '<div class="hist-top-right"><div class="hist-score">Nota <b>' + peek.nota + '</b></div></div>' +
        '</div>' +
        '<div class="hist-bottom">' +
          '<div class="hist-meta">' + ICONS.clock + peek.time + '</div>' +
        '</div>' +
      '</div>' +
      '<div class="addition-card-peek-label">Pulsa para ver más</div>';
    peekWrap.onclick = () => { openHistorialTodo(); };
    peekWrap.onkeydown = (e) => { if(e.key === 'Enter') openHistorialTodo(); };
    el.appendChild(peekWrap);
  }
}

/* ---------- "Todo el historial", filtrable por tipo de test ----------
   Se abre desde la tarjeta difuminada del Historial de Inicio. Arriba, un
   selector con cada tipo de test presente (y cuántos hay); debajo, la
   lista completa (limitada a lo que ya se ha cargado del backend) según
   el filtro elegido. */
const HISTORIAL_TIPO_LABELS = { examen:'Examen', estudio:'Estudio', simulacro:'Simulacro', fallos:'Fallos' };
let historialTipoFilter = 'todas';
function openHistorialTodo(){
  historialTipoFilter = 'todas';
  renderHistorialTipoFilters();
  renderHistorialTodoList();
  showScreen('screen-historial-todo');
}
function renderHistorialTipoFilters(){
  const wrap = document.getElementById('historialTipoFilters');
  if(!wrap) return;
  const counts = {};
  HISTORY.forEach(h => { counts[h.type] = (counts[h.type] || 0) + 1; });
  const defs = [{ id: 'todas', label: 'Todos', count: HISTORY.length }]
    .concat(Object.keys(HISTORIAL_TIPO_LABELS).filter(k => counts[k]).map(k => ({ id: k, label: HISTORIAL_TIPO_LABELS[k], count: counts[k] })));
  wrap.innerHTML = '';
  defs.forEach(d => {
    const el = document.createElement('div');
    el.className = 'param-opt' + (historialTipoFilter === d.id ? ' selected' : '');
    el.setAttribute('role', 'button'); el.setAttribute('tabindex', '0');
    el.textContent = d.label + ' · ' + d.count;
    el.onclick = () => { historialTipoFilter = d.id; renderHistorialTipoFilters(); renderHistorialTodoList(); };
    el.onkeydown = (e) => { if(e.key === 'Enter') el.onclick(); };
    wrap.appendChild(el);
  });
}
function renderHistorialTodoList(){
  const el = document.getElementById('historialTodoList');
  if(!el) return;
  el.innerHTML = '';
  const items = historialTipoFilter === 'todas' ? HISTORY : HISTORY.filter(h => h.type === historialTipoFilter);
  if(!items.length){
    el.innerHTML = '<div class="empty">No hay tests en este filtro.</div>';
    return;
  }
  items.forEach(h => renderHistoryEntry(el, h));
}

/* ---------- borrar un test del historial ---------- */
function isLocalOnlySessionId(id){
  // Los tests que se guardan sin haber iniciado sesión reciben un id local
  // temporal ('r' + timestamp) y nunca llegan a Supabase: no hay nada que
  // borrar en la base de datos, solo se quitan de la lista en memoria.
  return typeof id === 'string' && /^r\d+$/.test(id);
}

async function deleteHistoryItem(h, btnEl){
  const label = (h.title || 'este test') + (h.nota ? (' · Nota ' + h.nota) : '');
  if(!await uiConfirm('¿Seguro que quieres borrar "' + label + '" del historial?\n\nEsta acción no se puede deshacer.')) return;

  if(btnEl) btnEl.disabled = true;

  if(currentUser && !isLocalOnlySessionId(h.id)){
    try{
      // Se comprueba explícitamente user_id además de confiar en las políticas
      // de RLS de Supabase: así, aunque hubiera algún fallo de configuración
      // en las políticas, desde el cliente nunca se pide borrar una fila que
      // no sea del usuario que ha iniciado sesión.
      const { error: aErr } = await sb.from('session_answers').delete()
        .eq('session_id', h.id).eq('user_id', currentUser.id);
      if(aErr) throw aErr;

      const { data: deletedRows, error: sErr } = await sb.from('test_sessions').delete()
        .eq('id', h.id).eq('user_id', currentUser.id).select();
      if(sErr) throw sErr;
      if(!deletedRows || !deletedRows.length){
        // No se ha borrado ninguna fila: o no existe, o no pertenece a este
        // usuario. En ambos casos no seguimos, para no ocultar el problema.
        uiToast('No se ha podido borrar: el test no existe o no te pertenece.');
        if(btnEl) btnEl.disabled = false;
        return;
      }
    } catch(err){
      console.error('Error borrando el test del historial', err);
      uiToast('No se ha podido borrar el test. Inténtalo de nuevo.');
      if(btnEl) btnEl.disabled = false;
      return;
    }
  }

  HISTORY = HISTORY.filter(item => item.id !== h.id);
  SMART_HISTORY = SMART_HISTORY.filter(item => item.id !== h.id);
  renderHistory();
  renderHistorialTodoList();
  renderSmartHistory();

  if(currentUser){
    await refreshGlobalStats();
  }
}

/* ---------- load session history for the logged-in user ---------- */
const HISTORY_MODE_LABELS = { examen:'Examen', estudio:'Estudio', simulacro:'Simulacro', fallos:'Fallos', inteligente:'Test Inteligente' };
function mapSessionRowToHistoryEntry(row){
  return {
    id: row.id,
    date: formatRelativeDate(row.created_at),
    type: row.mode,
    title: HISTORY_MODE_LABELS[row.mode] || row.mode,
    nota: formatNota(row.score),
    time: formatMMSS(row.time_seconds),
    ok: row.ok, bad: row.bad, pending: row.pending,
    review: null
  };
}
async function loadHistory(){
  if(!currentUser){ HISTORY = []; SMART_HISTORY = []; renderHistory(); renderSmartHistory(); return; }
  const [{ data, error }, { data: smartData, error: smartError }] = await Promise.all([
    sb.from('test_sessions').select('*').eq('user_id', currentUser.id).neq('mode', 'inteligente')
      .order('created_at', { ascending: false }).limit(50),
    sb.from('test_sessions').select('*').eq('user_id', currentUser.id).eq('mode', 'inteligente')
      .order('created_at', { ascending: false }).limit(30)
  ]);
  if(error) console.error('Error cargando historial', error);
  if(smartError) console.error('Error cargando historial de Test Inteligente', smartError);
  HISTORY = (data || []).map(mapSessionRowToHistoryEntry);
  SMART_HISTORY = (smartData || []).map(mapSessionRowToHistoryEntry);
  renderHistory();
  renderSmartHistory();
}
/* ---------- Historial propio del Test Inteligente, dentro de su pantalla ---------- */
function renderSmartHistory(){
  const wrap = document.getElementById('smartHistorySection');
  const el = document.getElementById('smartHistoryList');
  if(!wrap || !el) return;
  if(!SMART_HISTORY.length){ wrap.classList.add('hidden'); el.innerHTML = ''; return; }
  wrap.classList.remove('hidden');
  el.innerHTML = '';
  SMART_HISTORY.forEach(h => renderHistoryEntry(el, h));
}
