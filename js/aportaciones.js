/* Pantalla «Notas y explicaciones IA» (Tu cuenta). */

/* ---------- Pantalla "Notas y explicaciones IA" (Tu cuenta) ----------
   Recorre QUESTIONS_POOL (ya cargado al entrar en la app) buscando toda
   pregunta con own_note y/o ai_explain, para poder encontrarlas y
   editarlas/quitarlas sin tener que acordarse de en qué test o artículo
   estaban. Las notas propias (con updated_at) van primero y más
   recientes arriba; las que solo tienen explicación IA van después. */
function myAdditionItems(){
  return (QUESTIONS_POOL || []).filter(q => q.own_note || q.ai_explain);
}
function myAdditionTemaKey(q){ return q.art || 'General'; }
function myAdditionSortByRecent(items){
  return items.slice().sort((a, b) => {
    const ta = a.own_note && a.own_note.updated_at ? new Date(a.own_note.updated_at).getTime() : 0;
    const tb = b.own_note && b.own_note.updated_at ? new Date(b.own_note.updated_at).getTime() : 0;
    return tb - ta;
  });
}
/* Tarjeta compartida entre la lista corta de "Notas y explicaciones IA" y
   la pantalla completa "Todas las notas" (organizada por ficha). blurred=true
   pinta la 11ª tarjeta difuminada, que ahora en vez de desplegar el resto
   en el mismo sitio, lleva a esa pantalla organizada. returnScreen es la
   pantalla a la que debe volver el detalle al cerrarse. */
function myAdditionCardHtml(q, blurred, returnScreen){
  const badges =
    (q.own_note ? '<span class="addition-badge addition-badge-note">' + ICONS.pencil + '<span>Nota</span></span>' : '') +
    (q.ai_explain ? '<span class="addition-badge addition-badge-ia">' + ICONS.brain + '<span>IA</span></span>' : '');
  const location = q.art || 'General';
  const editedAt = q.own_note ? formatDateTime(q.own_note.updated_at) : '';
  const metaHtml = editedAt ? (esc(location) + ' · Editada: ' + editedAt) : esc(location);
  const clickAttrs = blurred
    ? ' onclick="openNotasOrganizadas();" onkeydown="if(event.key===\'Enter\')openNotasOrganizadas();"'
    : ' onclick="openMyAddition(\'' + q.id + '\',\'' + (returnScreen || 'screen-my-additions') + '\')" onkeydown="if(event.key===\'Enter\')openMyAddition(\'' + q.id + '\',\'' + (returnScreen || 'screen-my-additions') + '\')"';
  return '<div class="admin-card' + (blurred ? ' addition-card-peek' : '') + '" role="button" tabindex="0"' + clickAttrs + '>' +
    '<div class="admin-card-row">' +
      '<div>' +
        '<div class="admin-card-title">' + esc(q.q) + '</div>' +
        '<div class="admin-card-meta">' + metaHtml + '</div>' +
      '</div>' +
      '<div class="admin-card-actions">' + badges + '</div>' +
    '</div>' +
    (blurred ? '<div class="addition-card-peek-label">Pulsa para ver más</div>' : '') +
  '</div>';
}
/* Muestra como mucho las 10 aportaciones (nota/IA) más recientes; si hay
   más, se ve una 11ª tarjeta difuminada con "Pulsa para ver más" que lleva
   a la pantalla "Todas las notas", organizada por ficha. */
function renderMyAdditionsList(){
  const listEl = document.getElementById('myAdditionsList');
  if(!listEl) return;

  const items = myAdditionItems();

  if(!items.length){
    listEl.innerHTML = '<div class="empty">Todavía no habéis añadido ninguna nota ni ninguna explicación con IA. Aparecerán aquí en cuanto uséis los botones "Nota" o "IA" en la explicación de una pregunta.</div>';
    return;
  }

  const sorted = myAdditionSortByRecent(items);
  const LIMIT = 10;
  const hasMore = sorted.length > LIMIT;
  const visibleItems = hasMore ? sorted.slice(0, LIMIT) : sorted;
  const peekItem = hasMore ? sorted[LIMIT] : null;

  listEl.innerHTML = visibleItems.map(q => myAdditionCardHtml(q, false, 'screen-my-additions')).join('') + (peekItem ? myAdditionCardHtml(peekItem, true) : '');
}

/* ---------- "Todas las notas", organizada por ficha ----------
   Se abre desde la tarjeta difuminada de "Notas y explicaciones IA".
   Arriba, un selector de fichas (con cuántas notas tiene cada una) y
   debajo la lista completa agrupada por ficha; si se elige una ficha
   concreta, solo se ve el grupo de esa ficha. */
let notasTemaFilter = 'todas';
function openMyAdditions(){
  if(!featureEnabled('notas_ia')) return; // el administrador ha desactivado esta función para este usuario
  showScreen('screen-my-additions');
}
function openNotasOrganizadas(){
  notasTemaFilter = 'todas';
  renderNotasTemaFilters();
  renderNotasOrganizadasList();
  showScreen('screen-notas-todas');
}
function renderNotasTemaFilters(){
  const wrap = document.getElementById('notasTemaFilters');
  if(!wrap) return;
  const items = myAdditionItems();
  const counts = {};
  items.forEach(q => { const k = myAdditionTemaKey(q); counts[k] = (counts[k] || 0) + 1; });
  const temas = Object.keys(counts).sort((a, b) => a.localeCompare(b, 'es'));
  const defs = [{ id: 'todas', label: 'Todas', count: items.length }]
    .concat(temas.map(t => ({ id: t, label: t, count: counts[t] })));
  wrap.innerHTML = '';
  defs.forEach(d => {
    const el = document.createElement('div');
    el.className = 'param-opt' + (notasTemaFilter === d.id ? ' selected' : '');
    el.setAttribute('role', 'button'); el.setAttribute('tabindex', '0');
    el.textContent = d.label + ' · ' + d.count;
    el.onclick = () => { notasTemaFilter = d.id; renderNotasTemaFilters(); renderNotasOrganizadasList(); };
    el.onkeydown = (e) => { if(e.key === 'Enter') el.onclick(); };
    wrap.appendChild(el);
  });
}
function renderNotasOrganizadasList(){
  const listEl = document.getElementById('notasTodasList');
  if(!listEl) return;
  const items = myAdditionItems();
  if(!items.length){
    listEl.innerHTML = '<div class="empty">Todavía no habéis añadido ninguna nota ni ninguna explicación con IA.</div>';
    return;
  }
  const groups = {};
  items.forEach(q => {
    const k = myAdditionTemaKey(q);
    if(notasTemaFilter !== 'todas' && k !== notasTemaFilter) return;
    (groups[k] = groups[k] || []).push(q);
  });
  const temas = Object.keys(groups).sort((a, b) => a.localeCompare(b, 'es'));
  if(!temas.length){
    listEl.innerHTML = '<div class="empty">No hay notas en esta ficha.</div>';
    return;
  }
  listEl.innerHTML = temas.map(t => {
    const rows = myAdditionSortByRecent(groups[t]).map(q => myAdditionCardHtml(q, false, 'screen-notas-todas')).join('');
    return '<div class="section-row"><div class="section-title">' + esc(t) + '</div><div class="section-rule"></div></div>' + rows;
  }).join('');
}

/* Abre el detalle de una pregunta desde "Notas y explicaciones IA": la
   pregunta con sus opciones (la correcta marcada) y, debajo, el mismo
   bloque de explicación que se ve al hacer el test (con sus botones de
   editar/quitar Nota e IA), para poder gestionarla sin tener que volver
   a responder ningún test. */
let myAdditionDetailReturn = 'screen-my-additions';
function openMyAddition(questionId, returnScreen){
  myAdditionDetailReturn = returnScreen || 'screen-my-additions';
  const q = findQuestionById(questionId);
  const body = document.getElementById('myAdditionDetailBody');
  if(!body) return;
  if(!q){
    body.innerHTML = '<div class="empty">No se ha podido encontrar esta pregunta.</div>';
    showScreen('screen-my-addition-detail');
    return;
  }

  const letters = ['A','B','C','D'];
  const optionsHtml = q.options.map((opt, i) =>
    '<div class="option' + (i === q.correct ? ' correct' : '') + '">' +
      '<span class="opt-badge">' + letters[i] + '</span><span class="opt-text">' + opt + '</span>' +
      (i === q.correct ? '<span class="opt-result" style="display:block">' + ICONS.check + '</span>' : '') +
    '</div>'
  ).join('');

  body.innerHTML =
    '<div class="quiz-card" style="margin-bottom:0;">' +
      '<div class="question">' + q.q + '</div>' +
      '<div class="options">' + optionsHtml + '</div>' +
    '</div>' +
    '<div class="explain show">' + explainMetaHtml(q) + explainBodyHtml(q) + '</div>';

  showScreen('screen-my-addition-detail');
}
