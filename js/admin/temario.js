/* Administración: temas, estructura del temario y preguntas. */

/* ---------- TOPICS ---------- */
async function adminLoadTopics(){
  const { data, error } = await sb.from('topics').select('*').order('sort_order');
  if(error){ console.error(error); return; }
  adminData.topics = data || [];
  const el = document.getElementById('adminList-topics');
  if(!adminData.topics.length){ el.innerHTML = '<div class="admin-empty">No hay temas todavía.</div>'; return; }
  el.innerHTML = adminData.topics.map(t =>
    '<div class="admin-card"><div class="admin-card-row">' +
      '<div><div class="admin-card-title">'+esc(t.name)+'</div><div class="admin-card-meta">'+esc(t.category||'')+' · '+(t.enabled ? 'Activo' : 'Inactivo')+' · orden '+t.sort_order+'</div></div>' +
      '<div class="admin-card-actions">' +
        '<div class="admin-icon-btn" onclick="adminEditTopic(\''+t.id+'\')" title="Editar">'+ICONS.check+'</div>' +
        '<div class="admin-icon-btn" onclick="adminDeleteTopic(\''+t.id+'\')" title="Borrar">'+ICONS.cross+'</div>' +
      '</div>' +
    '</div></div>'
  ).join('');
}
function adminEditTopic(id){
  const t = adminData.topics.find(x => String(x.id) === String(id));
  if(!t) return;
  document.getElementById('adminForm-topic').classList.remove('hidden');
  adminEditing.topic = id;
  document.getElementById('adminTopicId').value = t.id;
  document.getElementById('adminTopicId').disabled = true;
  document.getElementById('adminTopicCategory').value = t.category || '';
  document.getElementById('adminTopicName').value = t.name || '';
  document.getElementById('adminTopicDesc').value = t.description || '';
  document.getElementById('adminTopicEnabled').checked = !!t.enabled;
  document.getElementById('adminTopicSort').value = t.sort_order || 0;
}
async function adminSaveTopic(){
  const id = document.getElementById('adminTopicId').value.trim();
  const category = document.getElementById('adminTopicCategory').value.trim();
  const name = document.getElementById('adminTopicName').value.trim();
  const description = document.getElementById('adminTopicDesc').value.trim();
  const enabled = document.getElementById('adminTopicEnabled').checked;
  const sort_order = parseInt(document.getElementById('adminTopicSort').value, 10) || 0;
  if(!id || !name){ showAdminStatus('topic', 'Id y nombre son obligatorios.', true); return; }
  const payload = { id, category, name, description, enabled, sort_order };
  const { error } = adminEditing.topic
    ? await sb.from('topics').update(payload).eq('id', adminEditing.topic)
    : await sb.from('topics').insert(payload);
  if(error){ showAdminStatus('topic', error.message, true); return; }
  showAdminStatus('topic', 'Guardado correctamente.', false);
  await adminLoadTopics();
  refreshTreeTopicSelect();
  setTimeout(() => toggleAdminForm('topic'), 600);
}
async function adminDeleteTopic(id){
  if(!await uiConfirm('¿Borrar este tema? También se borrará su estructura (títulos/capítulos/secciones/artículos) y las preguntas asociadas.')) return;
  const { error } = await sb.from('topics').delete().eq('id', id);
  if(error){ uiToast(error.message); return; }
  await adminLoadTopics();
  if(adminTreeTopicId === id) adminTreeTopicId = null;
  refreshTreeTopicSelect();
}

/* ---------- ESTRUCTURA (árbol libre: Título / Capítulo / Sección / Artículo) ---------- */

function refreshTreeTopicSelect(){
  const sel = document.getElementById('adminTreeTopic');
  if(!sel) return;
  if(!adminData.topics.length){
    sel.innerHTML = '<option value="">No hay temas todavía</option>';
    adminTreeTopicId = null;
    document.getElementById('adminTreeContainer').innerHTML = '<div class="tree-empty">Crea primero un tema en la pestaña "Temas".</div>';
    return;
  }
  const keepSelection = adminTreeTopicId && adminData.topics.some(t => t.id === adminTreeTopicId);
  sel.innerHTML = adminData.topics.map(t => '<option value="'+t.id+'">'+esc(t.name)+'</option>').join('');
  adminTreeTopicId = keepSelection ? adminTreeTopicId : adminData.topics[0].id;
  sel.value = adminTreeTopicId;
  adminLoadTree();
}
function onAdminTreeTopicChange(){
  adminTreeTopicId = document.getElementById('adminTreeTopic').value;
  adminCancelNodeForm();
  adminCancelTreeQuestionForm();
  adminCancelMoveNode(); adminCancelBulkMove();
  treeNodeMenuOpen = null;
  showingDuplicates = false;
  adminLoadTree();
}
async function adminLoadTree(){
  const el = document.getElementById('adminTreeContainer');
  if(!adminTreeTopicId){ el.innerHTML = ''; return; }
  const { data, error } = await sb.from('nodos_temario').select('*').eq('topic_id', adminTreeTopicId);
  if(error){ el.innerHTML = '<div class="tree-empty">Error cargando la estructura: '+esc(error.message)+'</div>'; return; }
  adminData.nodes = data || [];
  renderTree();
}
function nodeChildren(parentId){
  return adminData.nodes.filter(n => (n.padre_id || null) === (parentId || null)).sort(compareNodes);
}
function nodePathName(nodeId){
  const parts = [];
  let cur = adminData.nodes.find(n => n.id === nodeId);
  while(cur){
    parts.unshift(nodeDisplayName(cur));
    cur = cur.padre_id ? adminData.nodes.find(n => n.id === cur.padre_id) : null;
  }
  return parts.join(' › ');
}
function renderTree(){
  const el = document.getElementById('adminTreeContainer');
  if(showingDuplicates){
    el.innerHTML = renderDuplicatesView();
    updateBulkSelectBar();
    updateDuplicatesLink();
    return;
  }
  const roots = nodeChildren(null);
  const temaHtml = renderTemaGeneralRow();
  if(!roots.length){
    el.innerHTML = temaHtml + '<div class="tree-empty">Este tema todavía no tiene estructura. Añade un nivel raíz (Título, Capítulo, Sección o Artículo, el que necesites).</div>';
    updateBulkSelectBar();
    updateDuplicatesLink();
    return;
  }
  el.innerHTML = temaHtml + roots.map(n => renderNode(n)).join('');
  updateBulkSelectBar();
  updateDuplicatesLink();
}
const TEMA_GENERAL_KEY = '__tema_general__';
function temaGeneralQuestions(){
  return adminData.questions.filter(q => !q.nodo_id && q.topic_id === adminTreeTopicId);
}
function renderTemaGeneralRow(){
  const qs = temaGeneralQuestions();
  const isOpen = expandedTreeNodes.has(TEMA_GENERAL_KEY);
  return (
    '<div class="tema-general-row">' +
      '<div class="tree-node-main">' +
        '<span class="tree-chevron-spacer"></span>' +
        '<span class="node-badge general-node">General</span>' +
        '<span class="tree-node-name">Todo el tema (sin título, capítulo, sección ni artículo)</span>' +
        (qs.length ? '<span class="node-general-badge" onclick="toggleNodeQuestions(\''+TEMA_GENERAL_KEY+'\')">'+(isOpen?'▾':'▸')+' '+qs.length+' general'+(qs.length===1?'':'es')+'</span>' : '') +
      '</div>' +
      '<div class="tree-node-actions">' +
        '<div class="tree-kebab-btn" onclick="adminOpenTreeQuestionForm(null)" title="Añadir pregunta general">'+ICONS.plus+'</div>' +
      '</div>' +
    '</div>' +
    (isOpen ? '<div class="tree-children" style="margin-bottom:12px;">'+renderTemaGeneralQuestionsList()+'</div>' : '')
  );
}
function renderTemaGeneralQuestionsList(){
  const qs = temaGeneralQuestions();
  if(!qs.length) return '<div class="tree-empty" style="padding:8px 0;">Todavía no hay preguntas generales de todo el tema.</div>';
  return qs.map(q => renderQuestionCard(q)).join('');
}
/* Tarjeta de pregunta: toda la tarjeta es clicable para editar directamente
   (más fácil y accesible que depender solo del icono pequeño), y el botón de
   borrar corta la propagación para no abrir el editor al pulsarlo. */
function renderQuestionCard(q){
  const diff = q.difficulty || 'media';
  const selected = selectedQuestionIds.has(q.id);
  const clickAction = selectionMode ? "toggleQuestionSelected('"+q.id+"', event)" : "adminEditQuestionInTree('"+q.id+"')";
  return (
    '<div class="question-card'+(selected?' selected':'')+'" data-qid="'+q.id+'" role="button" tabindex="0" ' +
      'onclick="'+clickAction+'" ' +
      'onkeydown="if(event.key===\'Enter\'||event.key===\' \'){event.preventDefault();'+clickAction+';}">' +
      (selectionMode ? '<input type="checkbox" class="qcard-checkbox" '+(selected?'checked':'')+' onclick="event.stopPropagation();toggleQuestionSelected(\''+q.id+'\')">' : '') +
      '<div class="question-card-body">' +
        '<div class="question-card-text">'+esc(q.question)+'</div>' +
        '<div class="question-card-meta"><span class="q-diff q-diff-'+esc(diff)+'">'+esc(DIFICULTAD_LABELS[diff]||diff)+'</span></div>' +
      '</div>' +
      (!selectionMode ? (
      '<div class="question-card-actions">' +
        '<div class="admin-icon-btn" onclick="event.stopPropagation();adminEditQuestionInTree(\''+q.id+'\')" title="Editar">'+ICONS.check+'</div>' +
        '<div class="admin-icon-btn" onclick="event.stopPropagation();adminDeleteQuestion(\''+q.id+'\')" title="Borrar">'+ICONS.cross+'</div>' +
      '</div>') : '') +
    '</div>'
  );
}
let expandedTreeNodes = new Set();   // nodos con el listado de preguntas desplegado
let expandedTreeBranches = new Set(); // nodos con sus subniveles (hijos) desplegados — colapsado por defecto para que no se vea todo de golpe
let treeNodeMenuOpen = null;          // id del nodo cuyo menú de acciones (⋮) está abierto

/* ---------- Selección múltiple: elegir varias preguntas y/o varios niveles
   (títulos/capítulos/secciones/artículos) a la vez para moverlos juntos ---------- */
let selectionMode = false;
let selectedQuestionIds = new Set();
let selectedNodeIds = new Set();
function toggleSelectionMode(){
  selectionMode = !selectionMode;
  if(!selectionMode){ selectedQuestionIds.clear(); selectedNodeIds.clear(); adminCancelBulkMove(); }
  else { treeNodeMenuOpen = null; adminCancelNodeForm(); adminCancelTreeQuestionForm(); adminCancelGeneralPicker(); adminCancelMoveNode(); adminCancelBulkMove(); adminCancelIAImportForm(); }
  renderTree();
}
function toggleQuestionSelected(id, event){
  if(event) event.stopPropagation();
  if(selectedQuestionIds.has(id)) selectedQuestionIds.delete(id); else selectedQuestionIds.add(id);
  renderTree();
}
function toggleNodeSelected(id, event){
  if(event) event.stopPropagation();
  if(selectedNodeIds.has(id)) selectedNodeIds.delete(id); else selectedNodeIds.add(id);
  renderTree();
}
/* Todas las preguntas del tema actualmente abierto en "Estructura" (con
   independencia de qué artículos estén desplegados en el árbol), que es el
   conjunto sobre el que tiene sentido "seleccionar/deseleccionar todas".
   Si se está viendo el listado de duplicadas, el "todas" se limita a las
   preguntas duplicadas mostradas (no a todo el tema), que es lo útil ahí:
   marcarlas todas de golpe y luego ir desmarcando a mano las que se quieren
   conservar antes de borrar el resto. */
function currentTopicQuestionIds(){
  if(!adminTreeTopicId || !adminData || !adminData.questions) return [];
  if(showingDuplicates) return findDuplicateQuestionGroups().flat().map(q => q.id);
  return adminData.questions.filter(q => q.topic_id === adminTreeTopicId).map(q => q.id);
}
/* Actúa como interruptor: si ya están todas seleccionadas, las deselecciona;
   si no, selecciona de golpe todas las preguntas del tema (aunque su artículo
   esté colapsado, no hace falta desplegarlo pregunta a pregunta). */
function toggleSelectAllQuestions(){
  const ids = currentTopicQuestionIds();
  if(!ids.length) return;
  const allSelected = ids.every(id => selectedQuestionIds.has(id));
  if(allSelected) ids.forEach(id => selectedQuestionIds.delete(id));
  else ids.forEach(id => selectedQuestionIds.add(id));
  renderTree();
}

/* ---------- Detección de preguntas duplicadas ----------
   Compara el texto de la pregunta (ignorando mayúsculas/minúsculas, acentos,
   puntuación y espacios repetidos) dentro del mismo tema. No se compara entre
   temas distintos porque una misma pregunta en dos temas no es un duplicado
   por error, sino una decisión del admin. */
let showingDuplicates = false;
function normalizeForDuplicateCheck(text){
  return (text || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // quita acentos
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')                  // quita puntuación
    .replace(/\s+/g, ' ')
    .trim();
}
/* Clave estricta de duplicado: mismo enunciado, MISMAS opciones (sin importar
   en qué orden A/B/C/D estén escritas) y misma opción marcada como correcta.
   Solo se consideran duplicadas dos preguntas que sean literalmente iguales
   en todo esto, no solo en el enunciado. */
function duplicateKeyForQuestion(q){
  const qText = normalizeForDuplicateCheck(q.question);
  if(!qText) return null;
  const opts = (q.options || []).map(o => normalizeForDuplicateCheck(o)).filter(Boolean);
  if(!opts.length) return null;
  const correctText = (q.correct_index != null && opts[q.correct_index] != null) ? opts[q.correct_index] : '';
  const sortedOpts = [...opts].sort(); // el orden de las opciones no importa para considerarlas "las mismas"
  return qText + '||opts:' + sortedOpts.join('|') + '||correcta:' + correctText;
}
function findDuplicateQuestionGroups(){
  if(!adminTreeTopicId || !adminData.questions) return [];
  const groups = {};
  adminData.questions
    .filter(q => q.topic_id === adminTreeTopicId)
    .forEach(q => {
      const key = duplicateKeyForQuestion(q);
      if(!key) return;
      (groups[key] = groups[key] || []).push(q);
    });
  return Object.values(groups)
    .filter(g => g.length > 1)
    .sort((a, b) => b.length - a.length);
}
function toggleDuplicatesView(){
  if(!adminTreeTopicId){ uiToast('Selecciona antes un tema.'); return; }
  showingDuplicates = !showingDuplicates;
  selectedQuestionIds.clear();
  selectedNodeIds.clear();
  adminCancelBulkMove();
  if(showingDuplicates){
    treeNodeMenuOpen = null;
    adminCancelNodeForm(); adminCancelTreeQuestionForm(); adminCancelGeneralPicker();
    adminCancelMoveNode(); adminCancelIAImportForm();
  }
  renderTree();
}
function updateDuplicatesLink(){
  const link = document.getElementById('duplicatesToggleLink');
  if(!link) return;
  if(showingDuplicates){ link.textContent = '← Volver al árbol'; return; }
  const nGroups = findDuplicateQuestionGroups().length;
  link.textContent = nGroups ? ('Ver duplicadas ('+nGroups+')') : 'Ver duplicadas';
}
function renderDuplicatesView(){
  const groups = findDuplicateQuestionGroups();
  if(!groups.length){
    return '<div class="tree-empty">No se han encontrado preguntas duplicadas en este tema (se comparan enunciado, opciones y respuesta correcta; se ignoran mayúsculas, acentos, puntuación y el orden de las opciones).</div>';
  }
  return (
    '<div class="tree-empty" style="text-align:left;margin-bottom:14px;">Se han encontrado ' + groups.length + ' grupo' + (groups.length===1?'':'s') + ' de preguntas idénticas en este tema (mismo enunciado, mismas opciones y misma respuesta correcta). Revisa cada grupo, marca en modo selección las copias que quieras eliminar (deja al menos una) y usa "Eliminar selección".</div>' +
    groups.map((g, gi) => (
      '<div class="dup-group" style="margin-bottom:20px;">' +
        '<div class="dup-group-head" style="font-weight:600;margin-bottom:6px;">Grupo ' + (gi+1) + ' — ' + g.length + ' preguntas idénticas' +
          (g[0].nodo_id ? ' · ' + esc(nodePathName(g[0].nodo_id)) : ' · Pregunta general del tema') +
        '</div>' +
        g.map(q => renderQuestionCard(q)).join('') +
      '</div>'
    )).join('')
  );
}

function clearSelection(){
  selectedQuestionIds.clear();
  selectedNodeIds.clear();
  adminCancelBulkMove();
  renderTree();
}
function updateBulkSelectBar(){
  const link = document.getElementById('selectionToggleLink');
  if(link) link.textContent = selectionMode ? 'Salir de selección' : 'Seleccionar varios';
  const selectAllLink = document.getElementById('selectAllLink');
  if(selectAllLink){
    const ids = currentTopicQuestionIds();
    selectAllLink.classList.toggle('hidden', !selectionMode || !ids.length);
    const allSelected = ids.length > 0 && ids.every(id => selectedQuestionIds.has(id));
    selectAllLink.textContent = allSelected ? 'Deseleccionar todas' : 'Seleccionar todas';
  }
  const bar = document.getElementById('bulkSelectBar');
  if(!bar) return;
  const total = selectedQuestionIds.size + selectedNodeIds.size;
  if(!selectionMode || total === 0){ bar.classList.add('hidden'); return; }
  bar.classList.remove('hidden');
  const parts = [];
  if(selectedQuestionIds.size) parts.push(selectedQuestionIds.size + ' pregunta' + (selectedQuestionIds.size===1?'':'s'));
  if(selectedNodeIds.size) parts.push(selectedNodeIds.size + ' nivel' + (selectedNodeIds.size===1?'':'es'));
  document.getElementById('bulkSelectCount').textContent = parts.join(' y ') + ' seleccionado' + (total===1?'':'s');
}
/* Todas las ubicaciones posibles del árbol (de cualquier tipo), para elegir dónde
   mover preguntas — a diferencia de un nivel, una pregunta puede ir directamente
   a un Artículo o quedar "general" en cualquier Título/Capítulo/Sección. */
function buildAnyNodeOptions(){
  const options = [];
  (function walk(parentId, depth){
    nodeChildren(parentId).forEach(n => {
      options.push({ id: n.id, label: '—'.repeat(depth) + ' ' + NODE_TYPE_LABEL[n.tipo] + ' ' + nodeDisplayName(n) });
      walk(n.id, depth + 1);
    });
  })(null, 0);
  return options;
}
/* Ubicaciones válidas para mover varios niveles seleccionados a la vez: todos deben
   ser del mismo tipo (se valida en adminOpenBulkMove), y el destino debe quedar por
   encima de ese tipo en la jerarquía, sin colarse dentro de sí mismos ni de sus propios
   descendientes. */
function buildBulkNodeTargetOptions(){
  const ids = [...selectedNodeIds];
  const level = Math.min(...ids.map(id => NODE_TYPE_LEVEL[(adminData.nodes.find(n => n.id === id) || {}).tipo]));
  const excluded = new Set(ids);
  ids.forEach(id => nodeDescendantIds(id).forEach(d => excluded.add(d)));
  const options = [];
  (function walk(parentId, depth){
    nodeChildren(parentId).forEach(n => {
      if(excluded.has(n.id)) return; // ni como destino, ni se explora lo que cuelga de él
      if(NODE_TYPE_LEVEL[n.tipo] < level){
        options.push({ id: n.id, label: '—'.repeat(depth) + ' ' + nodeDisplayName(n) });
      }
      walk(n.id, depth + 1);
    });
  })(null, 0);
  return options;
}
function adminOpenBulkMove(){
  if(!selectedQuestionIds.size && !selectedNodeIds.size){ uiToast('No has seleccionado nada todavía.'); return; }
  if(selectedQuestionIds.size && selectedNodeIds.size){
    uiToast('Selecciona solo preguntas, o solo niveles (títulos/capítulos/secciones/artículos), para moverlos juntos — no se pueden mezclar en el mismo movimiento.');
    return;
  }
  const sel = document.getElementById('bulkMoveTarget');
  const statusEl = document.getElementById('adminStatus-bulkMove');
  statusEl.textContent = '';
  let options, rootLabel;
  if(selectedQuestionIds.size){
    rootLabel = 'Todo el tema (pregunta general, sin artículo)';
    options = buildAnyNodeOptions();
    document.getElementById('bulkMovePath').textContent = 'Mover ' + selectedQuestionIds.size + ' pregunta' + (selectedQuestionIds.size===1?'':'s') + ' seleccionada' + (selectedQuestionIds.size===1?'':'s') + ' a:';
  } else {
    const tipos = new Set([...selectedNodeIds].map(id => (adminData.nodes.find(n => n.id === id) || {}).tipo));
    if(tipos.size > 1){ uiToast('Selecciona niveles del mismo tipo (por ejemplo, solo artículos, o solo capítulos) para moverlos juntos.'); return; }
    rootLabel = 'Nivel raíz del tema (directamente bajo el tema)';
    options = buildBulkNodeTargetOptions();
    document.getElementById('bulkMovePath').textContent = 'Mover ' + selectedNodeIds.size + ' nivel' + (selectedNodeIds.size===1?'':'es') + ' seleccionado' + (selectedNodeIds.size===1?'':'s') + ' a:';
  }
  sel.innerHTML = '<option value="">' + rootLabel + '</option>' + options.map(o => '<option value="'+o.id+'">'+esc(o.label)+'</option>').join('');
  document.getElementById('adminForm-bulkMove').classList.remove('hidden');
  document.getElementById('adminForm-bulkMove').scrollIntoView({ behavior:'smooth', block:'center' });
}
function adminCancelBulkMove(){
  const form = document.getElementById('adminForm-bulkMove');
  if(form) form.classList.add('hidden');
}
/* Elimina de golpe las preguntas y/o niveles marcados en el modo de selección.
   A diferencia de mover, sí se permite mezclar preguntas y niveles en el mismo
   borrado: cada tabla se limpia con sus propios ids, de forma independiente.
   Borrar un nivel se comporta igual que borrarlo uno a uno (adminDeleteNode):
   sus subniveles desaparecen con él, pero las preguntas que colgaban directamente
   de él (o de sus subniveles) NO se borran, quedan como generales del tema. */
async function adminConfirmBulkDelete(){
  const nQ = selectedQuestionIds.size, nN = selectedNodeIds.size;
  if(!nQ && !nN){ uiToast('No has seleccionado nada todavía.'); return; }
  const parts = [];
  if(nQ) parts.push(nQ + ' pregunta' + (nQ===1?'':'s'));
  if(nN) parts.push(nN + ' nivel' + (nN===1?'':'es'));
  let msg = '¿Eliminar ' + parts.join(' y ') + '? Esta acción no se puede deshacer.';
  if(nN) msg += ' Los niveles seleccionados se borran junto con sus subniveles; las preguntas que colgaban de ellos pasarán a quedar como generales de todo el tema.';
  if(!await uiConfirm(msg)) return;
  try{
    if(nQ){
      const { error } = await sb.from('questions').delete().in('id', [...selectedQuestionIds]);
      if(error) throw new Error(error.message);
    }
    if(nN){
      const { error } = await sb.from('nodos_temario').delete().in('id', [...selectedNodeIds]);
      if(error) throw new Error(error.message);
    }
    selectedQuestionIds.clear();
    selectedNodeIds.clear();
    selectionMode = false;
    await adminLoadTree();
    await adminLoadQuestions();
    renderTree();
    await adminRefreshStudentStats();
  } catch(err){
    uiToast(err.message || 'Ha ocurrido un error al eliminar la selección.');
  }
}
async function adminConfirmBulkMove(){
  const val = document.getElementById('bulkMoveTarget').value;
  const targetId = val || null;
  const statusEl = document.getElementById('adminStatus-bulkMove');
  try{
    if(selectedQuestionIds.size){
      const ids = [...selectedQuestionIds];
      const { error } = await sb.from('questions').update({ nodo_id: targetId }).in('id', ids);
      if(error) throw new Error(error.message);
      statusEl.style.color = 'var(--green)';
      statusEl.textContent = ids.length + ' pregunta' + (ids.length===1?'':'s') + ' movida' + (ids.length===1?'':'s') + ' correctamente.';
    } else {
      const ids = [...selectedNodeIds];
      const { error } = await sb.from('nodos_temario').update({ padre_id: targetId }).in('id', ids);
      if(error) throw new Error(error.message);
      statusEl.style.color = 'var(--green)';
      statusEl.textContent = ids.length + ' nivel' + (ids.length===1?'':'es') + ' movido' + (ids.length===1?'':'s') + ' correctamente.';
      if(targetId) expandedTreeBranches.add(targetId);
    }
    selectedQuestionIds.clear();
    selectedNodeIds.clear();
    selectionMode = false;
    await adminLoadTree();
    await adminLoadQuestions();
    renderTree();
    await adminRefreshStudentStats();
    setTimeout(adminCancelBulkMove, 900);
  } catch(err){
    statusEl.style.color = 'var(--coral)';
    statusEl.textContent = err.message || 'Ha ocurrido un error al mover la selección.';
  }
}
function toggleNodeBranch(id, event){
  if(event) event.stopPropagation();
  if(expandedTreeBranches.has(id)) expandedTreeBranches.delete(id); else expandedTreeBranches.add(id);
  renderTree();
}
function toggleNodeMenu(id, event){
  if(event) event.stopPropagation();
  treeNodeMenuOpen = (treeNodeMenuOpen === id) ? null : id;
  renderTree();
}
function adminExpandAllTree(){
  adminData.nodes.forEach(n => expandedTreeBranches.add(n.id));
  renderTree();
}
function adminCollapseAllTree(){
  expandedTreeBranches.clear();
  renderTree();
}
function directQuestionCount(nodeId){
  return adminData.questions.filter(q => q.nodo_id === nodeId).length;
}
function subtreeQuestionCount(nodeId){
  let total = directQuestionCount(nodeId);
  nodeChildren(nodeId).forEach(c => { total += subtreeQuestionCount(c.id); });
  return total;
}
function toggleNodeQuestions(nodeId){
  if(expandedTreeNodes.has(nodeId)) expandedTreeNodes.delete(nodeId); else expandedTreeNodes.add(nodeId);
  renderTree();
}
function renderNodeQuestionsList(nodeId){
  const qs = adminData.questions.filter(q => q.nodo_id === nodeId);
  if(!qs.length) return '<div class="tree-empty" style="padding:8px 0;">Este nivel todavía no tiene preguntas propias.</div>';
  return qs.map(q => renderQuestionCard(q)).join('');
}
function renderNode(n){
  const children = nodeChildren(n.id);
  const canHaveChildren = n.tipo !== 'articulo';
  const count = subtreeQuestionCount(n.id);
  const directGeneral = n.tipo !== 'articulo' ? directQuestionCount(n.id) : 0;
  const isOpen = expandedTreeNodes.has(n.id);
  const branchOpen = expandedTreeBranches.has(n.id);
  const hasBranch = children.length > 0;
  const menuOpen = treeNodeMenuOpen === n.id;
  const questionLabel = n.tipo === 'articulo' ? '+ Pregunta aquí' : '+ Pregunta general aquí';
  const nodeSelected = selectedNodeIds.has(n.id);
  const mainClick = selectionMode ? "toggleNodeSelected('"+n.id+"', event)" : (hasBranch ? "toggleNodeBranch('"+n.id+"')" : '');
  return (
    '<div class="tree-node">' +
      '<div class="tree-node-row'+(nodeSelected?' selected':'')+'">' +
        '<div class="tree-node-main" style="cursor:pointer;" '+(mainClick?'onclick="'+mainClick+'"':'')+'>' +
          (selectionMode
            ? '<input type="checkbox" class="node-checkbox" '+(nodeSelected?'checked':'')+' onclick="event.stopPropagation();toggleNodeSelected(\''+n.id+'\')">'
            : (hasBranch
              ? '<span class="tree-chevron-btn'+(branchOpen?' open':'')+'" onclick="toggleNodeBranch(\''+n.id+'\', event)">'+ICONS.chevron+'</span>'
              : '<span class="tree-chevron-spacer"></span>')) +
          '<span class="node-badge '+(isGeneralNode(n) ? 'general-node' : n.tipo)+'">'+(isGeneralNode(n) ? 'General' : NODE_TYPE_LABEL[n.tipo])+'</span>' +
          (isGeneralNode(n) ? '' : '<span class="tree-node-name">'+esc(nodeDisplayName(n))+'</span>') +
          (directGeneral ? '<span class="node-general-badge" onclick="event.stopPropagation();toggleNodeQuestions(\''+n.id+'\')">'+(isOpen?'▾':'▸')+' '+directGeneral+' general'+(directGeneral===1?'':'es')+' aquí</span>' : '') +
          (count && !directGeneral ? '<span class="node-qcount" onclick="event.stopPropagation();toggleNodeQuestions(\''+n.id+'\')">'+(isOpen?'▾':'▸')+' '+count+' preg.</span>' : '') +
          (count && directGeneral && count > directGeneral ? '<span class="node-qcount" onclick="event.stopPropagation();toggleNodeQuestions(\''+n.id+'\')">'+count+' en total</span>' : '') +
        '</div>' +
        (!selectionMode ? '<div class="tree-node-actions">' +
          '<div class="tree-kebab-btn" onclick="toggleNodeMenu(\''+n.id+'\', event)" title="Más acciones">'+ICONS.kebab+'</div>' +
        '</div>' : '') +
      '</div>' +
      (menuOpen ? (
        '<div class="tree-node-menu">' +
          (canHaveChildren ? '<div class="tree-menu-item" onclick="adminOpenNodeForm(\''+n.id+'\')">'+ICONS.plus+'<span>Añadir subnivel</span></div>' : '') +
          '<div class="tree-menu-item" onclick="adminOpenTreeQuestionForm(\''+n.id+'\')">'+ICONS.plus+'<span>'+questionLabel+'</span></div>' +
          '<div class="tree-menu-item" onclick="adminEditNode(\''+n.id+'\')">'+ICONS.check+'<span>Editar</span></div>' +
          '<div class="tree-menu-item" onclick="adminOpenMoveNode(\''+n.id+'\')">'+ICONS.move+'<span>Mover a otro título / sección…</span></div>' +
          '<div class="tree-menu-item danger" onclick="adminDeleteNode(\''+n.id+'\')">'+ICONS.cross+'<span>Borrar</span></div>' +
        '</div>'
      ) : '') +
      (isOpen ? '<div class="tree-children">'+renderNodeQuestionsList(n.id)+'</div>' : '') +
      (hasBranch && branchOpen ? '<div class="tree-children">'+children.map(c => renderNode(c)).join('')+'</div>' : '') +
    '</div>'
  );
}
function fillNodeTypeSelect(allowed, selected){
  const sel = document.getElementById('adminNodeType');
  sel.innerHTML = allowed.map(t => '<option value="'+t+'">'+NODE_TYPE_LABEL[t]+'</option>').join('');
  sel.value = allowed.includes(selected) ? selected : allowed[0];
}
function adminOpenNodeForm(parentId){
  treeAddParentId = parentId || null;
  adminEditing.node = null;
  adminCancelIAImportForm();
  adminCancelMoveNode(); adminCancelBulkMove();
  treeNodeMenuOpen = null;
  document.getElementById('adminForm-node').classList.remove('hidden');
  document.getElementById('adminForm-treeQuestion').classList.add('hidden');
  document.getElementById('nodeFormParentPath').textContent = parentId
    ? 'Se creará dentro de: ' + nodePathName(parentId)
    : 'Se creará como nivel raíz del tema (directamente bajo el tema).';
  fillNodeTypeSelect(allowedChildTypes(parentId), parentId ? allowedChildTypes(parentId)[0] : 'titulo');
  document.getElementById('adminNodeNumber').value = '';
  document.getElementById('adminNodeName').value = '';
  document.getElementById('adminStatus-node').textContent = '';
  renderTree();
}
function adminEditNode(id){
  const n = adminData.nodes.find(x => String(x.id) === String(id));
  if(!n) return;
  treeAddParentId = n.padre_id || null;
  adminEditing.node = id;
  adminCancelMoveNode(); adminCancelBulkMove();
  treeNodeMenuOpen = null;
  document.getElementById('adminForm-node').classList.remove('hidden');
  document.getElementById('adminForm-treeQuestion').classList.add('hidden');
  document.getElementById('nodeFormParentPath').textContent = 'Editando: ' + nodePathName(id);
  fillNodeTypeSelect(allowedChildTypes(n.padre_id || null), n.tipo);
  document.getElementById('adminNodeNumber').value = n.numero || '';
  document.getElementById('adminNodeName').value = n.nombre || '';
  document.getElementById('adminStatus-node').textContent = '';
  renderTree();
}
function adminCancelNodeForm(){
  adminEditing.node = null;
  document.getElementById('adminForm-node').classList.add('hidden');
}
async function adminSaveNode(){
  if(!adminTreeTopicId){ showAdminStatus('node', 'Selecciona antes un tema.', true); return; }
  const tipo = document.getElementById('adminNodeType').value;
  const numero = document.getElementById('adminNodeNumber').value.trim();
  const nombre = document.getElementById('adminNodeName').value.trim();
  // Título/Capítulo/Sección/Artículo necesitan al menos uno de los dos para
  // identificarse; "libre" y "estructura" son niveles de posición libre y
  // no lo necesitan (pueden crearse vacíos, p.ej. como contenedor, y
  // rellenarse después).
  const esFlexible = NODE_TYPE_LEVEL[tipo] === 0;
  if(!esFlexible && !numero && !nombre){ showAdminStatus('node', 'Rellena al menos el número o el nombre.', true); return; }
  const payload = { topic_id: adminTreeTopicId, padre_id: treeAddParentId, tipo, numero: numero || null, nombre: nombre || null };
  const { error } = adminEditing.node
    ? await sb.from('nodos_temario').update(payload).eq('id', adminEditing.node)
    : await sb.from('nodos_temario').insert(payload);
  if(error){ showAdminStatus('node', error.message, true); return; }
  showAdminStatus('node', 'Guardado correctamente.', false);
  await adminLoadTree();
  setTimeout(adminCancelNodeForm, 500);
}
async function adminDeleteNode(id){
  if(!await uiConfirm('¿Borrar este nivel? Se borrarán sus subniveles, pero las preguntas que colgaban directamente de él (y de esos subniveles) NO se borran: pasarán a quedar como preguntas generales de todo el tema.')) return;
  const { error } = await sb.from('nodos_temario').delete().eq('id', id);
  if(error){ uiToast(error.message); return; }
  await adminLoadQuestions();
  await adminLoadTree();
  await adminRefreshStudentStats();
}

/* ---------- Mover un nivel (título/capítulo/sección/artículo) a otro sitio del árbol ---------- */
let moveNodeId = null;
function nodeDescendantIds(id){
  const result = new Set();
  (function walk(parentId){
    nodeChildren(parentId).forEach(c => { result.add(c.id); walk(c.id); });
  })(id);
  return result;
}
// Opciones válidas de destino: cualquier nodo cuyo nivel sea inferior al del nodo que
// se mueve (para que la jerarquía Título > Capítulo > Sección > Artículo siga teniendo
// sentido), excluyendo el propio nodo y todo lo que cuelga de él (no se puede meter un
// título dentro de su propio artículo).
function buildMoveTargetOptions(nodeId){
  const node = adminData.nodes.find(n => n.id === nodeId);
  if(!node) return [];
  const level = NODE_TYPE_LEVEL[node.tipo];
  const excluded = nodeDescendantIds(nodeId);
  excluded.add(nodeId);
  const options = [];
  (function walk(parentId, depth){
    nodeChildren(parentId).forEach(n => {
      if(excluded.has(n.id)) return;
      if(NODE_TYPE_LEVEL[n.tipo] < level){
        options.push({ id: n.id, label: '—'.repeat(depth) + ' ' + nodeDisplayName(n) });
      }
      walk(n.id, depth + 1);
    });
  })(null, 0);
  return options;
}
function adminOpenMoveNode(id){
  const n = adminData.nodes.find(x => String(x.id) === String(id));
  if(!n) return;
  moveNodeId = id;
  adminCancelNodeForm();
  adminCancelTreeQuestionForm();
  adminCancelGeneralPicker();
  adminCancelIAImportForm();
  treeNodeMenuOpen = null;
  renderTree();
  document.getElementById('moveNodePath').textContent = 'Mover: ' + nodePathName(id);
  const targets = buildMoveTargetOptions(id);
  const sel = document.getElementById('moveNodeTarget');
  const rootOption = '<option value="">Nivel raíz del tema (directamente bajo el tema)</option>';
  sel.innerHTML = rootOption + targets.map(t => '<option value="'+t.id+'">'+esc(t.label)+'</option>').join('');
  sel.value = n.padre_id || '';
  document.getElementById('adminStatus-moveNode').textContent = '';
  document.getElementById('adminForm-moveNode').classList.remove('hidden');
  document.getElementById('adminForm-moveNode').scrollIntoView({ behavior:'smooth', block:'center' });
}
function adminCancelMoveNode(){
  moveNodeId = null;
  const form = document.getElementById('adminForm-moveNode');
  if(form) form.classList.add('hidden');
}
async function adminConfirmMove(){
  if(!moveNodeId) return;
  const val = document.getElementById('moveNodeTarget').value;
  const newParentId = val || null;
  const { error } = await sb.from('nodos_temario').update({ padre_id: newParentId }).eq('id', moveNodeId);
  if(error){ showAdminStatus('moveNode', error.message, true); return; }
  showAdminStatus('moveNode', 'Movido correctamente.', false);
  if(newParentId) expandedTreeBranches.add(newParentId);
  await adminLoadTree();
  setTimeout(adminCancelMoveNode, 500);
}

/* ---------- Pregunta "general": el admin elige a qué nivel pertenece (Tema/Título/Capítulo/Sección; Artículo no, porque dejaría de ser general) ---------- */
function adminOpenGeneralQuestionPicker(){
  if(!adminTreeTopicId){ uiToast('Selecciona antes un tema.'); return; }
  adminCancelNodeForm();
  adminCancelTreeQuestionForm();
  adminCancelIAImportForm();
  adminCancelMoveNode(); adminCancelBulkMove();
  treeNodeMenuOpen = null;
  renderTree();
  document.getElementById('adminForm-generalPicker').classList.remove('hidden');
  const sel = document.getElementById('generalPickerNode');
  const options = ['<option value="">Todo el tema (sin título, capítulo ni sección concretos)</option>'];
  const walk = (parentId, depth) => {
    nodeChildren(parentId).filter(n => n.tipo !== 'articulo').forEach(n => {
      options.push('<option value="'+n.id+'">'+'—'.repeat(depth)+' '+esc(nodeDisplayName(n))+'</option>');
      walk(n.id, depth + 1);
    });
  };
  walk(null, 0);
  sel.innerHTML = options.join('');
  document.getElementById('adminStatus-generalPicker').textContent = '';
}
function adminCancelGeneralPicker(){
  document.getElementById('adminForm-generalPicker').classList.add('hidden');
}
function adminConfirmGeneralPicker(){
  const nodeId = document.getElementById('generalPickerNode').value || null;
  adminCancelGeneralPicker();
  adminOpenTreeQuestionForm(nodeId);
}

/* ---------- QUESTIONS (datos usados por el árbol de Estructura) ---------- */
async function adminLoadQuestions(){
  const { data, error } = await loadQuestionsCached();
  if(error){ console.error(error); return; }
  adminData.questions = data || [];
}
async function adminDeleteQuestion(id){
  if(!await uiConfirm('¿Borrar esta pregunta?')) return;
  const { error } = await sb.from('questions').delete().eq('id', id);
  if(error){ uiToast(error.message); return; }
  await adminLoadQuestions();
  renderTree();
  await adminRefreshStudentStats();
}
