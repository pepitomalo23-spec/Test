/* Administración: importar preguntas en bloque (con IA o sin ella). */

/* ---------- Importar preguntas en bloque con IA (Gemini) ---------- */
const IA_LOC_LEVELS = ['articulo'];
let iaPreviewData = []; // preguntas propuestas por la IA, pendientes de revisar/guardar
function adminOpenIAImportForm(){
  if(!adminTreeTopicId){ uiToast('Selecciona antes un tema.'); return; }
  adminCancelNodeForm();
  adminCancelTreeQuestionForm();
  adminCancelGeneralPicker();
  adminCancelMoveNode(); adminCancelBulkMove();
  treeNodeMenuOpen = null;
  renderTree();
  iaPreviewData = [];
  document.getElementById('iaPreviewList').innerHTML = '';
  document.getElementById('iaSaveRow').classList.add('hidden');
  document.getElementById('iaRawText').value = '';
  document.getElementById('adminStatus-iaImport').textContent = '';
  const topic = adminData.topics.find(t => t.id === adminTreeTopicId);
  document.getElementById('iaImportPath').textContent = 'Tema: ' + (topic ? topic.name : '');
  document.getElementById('adminForm-iaImport').classList.remove('hidden');
}
function adminCancelIAImportForm(){
  document.getElementById('adminForm-iaImport').classList.add('hidden');
}
function emptyIALoc(){ return { titulo: null, capitulo: null, seccion: null, articulo: null }; }
function normalizeIALoc(loc){
  const out = emptyIALoc();
  if(loc && typeof loc === 'object'){
    IA_LOC_LEVELS.forEach(t => {
      const v = loc[t];
      if(v && (v.numero || v.nombre)) out[t] = { numero: v.numero || '', nombre: v.nombre || '' };
    });
  }
  return out;
}
function iaLocIsEmpty(loc){ return IA_LOC_LEVELS.every(t => !loc[t]); }

/* ---------- Parseo determinista del texto del marcador (sin IA) ----------
   Formato esperado por bloque, separado de otros bloques por una línea de
   "=" (3 o más), tal y como lo entrega el bookmarklet "Extraer preguntas":
     N. Enunciado de la pregunta (puede ocupar varias líneas)
     A) opción
     B) opción  [CORRECTA]
     ...
     ———————- (línea de guiones, 3 o más)
     Explicación: texto de la explicación (puede ocupar varias líneas)
   Ninguna llamada a IA interviene en este parseo: es puro texto -> datos. */
function splitBookmarkletBlocks(rawText){
  return rawText
    .replace(/\r\n/g, '\n')
    .split(/\n\s*={3,}\s*\n/)
    .map(b => b.trim())
    .filter(Boolean);
}
function parseBookmarkletBlock(block){
  const lines = block.split('\n').map(l => l.replace(/\s+$/, ''));
  const sepIdx = lines.findIndex(l => /^[-–—_]{3,}$/.test(l.trim()));
  const qOptLines = sepIdx === -1 ? lines : lines.slice(0, sepIdx);
  const explainLines = sepIdx === -1 ? [] : lines.slice(sepIdx + 1);

  const optionStartIdx = qOptLines.findIndex(l => /^[A-D]\)/.test(l.trim()));
  const questionLines = optionStartIdx === -1 ? qOptLines : qOptLines.slice(0, optionStartIdx);
  const optionLines = optionStartIdx === -1 ? [] : qOptLines.slice(optionStartIdx);

  let questionText = questionLines.join(' ').replace(/\s+/g, ' ').trim();
  let number = null;
  const numMatch = questionText.match(/^(\d+)\.\s*(.*)$/s);
  if(numMatch){ number = parseInt(numMatch[1], 10); questionText = numMatch[2].trim(); }

  const options = [];
  optionLines.forEach(line => {
    const m = line.trim().match(/^([A-D])\)\s*(.*)$/);
    if(m){ options.push(m[2]); }
    else if(options.length && line.trim()){ options[options.length - 1] += ' ' + line.trim(); }
  });
  let correct_index = null;
  const correctHits = [];
  options.forEach((opt, i) => {
    if(/\[\s*correcta\s*\]/i.test(opt)) correctHits.push(i);
  });
  const cleanOptions = options.map(opt => opt.replace(/\[\s*correcta\s*\]/gi, '').replace(/\s+/g, ' ').trim());
  if(correctHits.length) correct_index = correctHits[correctHits.length - 1];

  let explainText = explainLines.join('\n').trim();
  explainText = explainText.replace(/^Explicaci[oó]n\s*:\s*/i, '').trim();

  const warnings = [];
  if(!questionText) warnings.push('No se ha detectado el enunciado de la pregunta.');
  if(cleanOptions.length < 2) warnings.push('Se han detectado menos de 2 opciones.');
  if(correctHits.length === 0) warnings.push('Ninguna opción está marcada como [CORRECTA].');
  if(correctHits.length > 1) warnings.push('Hay más de una opción marcada como [CORRECTA]; se ha usado la última.');
  if(!explainText) warnings.push('No se ha detectado explicación.');

  const location = emptyIALoc();
  let autoDetected = false;
  const detected = autoDetectUbicacion(explainText) || autoDetectUbicacion(questionText);
  if(detected){
    IA_LOC_LEVELS.forEach(tipo => {
      if(detected[tipo]){
        const nombreExistente = findExistingNodeNombre(tipo, detected[tipo]);
        location[tipo] = { numero: detected[tipo], nombre: nombreExistente || '' };
      }
    });
    autoDetected = true;
  }

  return {
    number,
    question: questionText,
    options: cleanOptions.slice(0, 4),
    correct_index: correct_index != null ? correct_index : 0,
    explain: explainText,
    location,
    autoDetected,
    confirmedGeneral: false,
    include: true, // preseleccionada; el admin desmarca si al revisar decide descartarla
    warnings,
    saveError: null,
    // Plegada por defecto para no mostrar todas las preguntas seguidas en una
    // fila larguísima; las que tienen algún problema se abren solas porque
    // necesitan revisión inmediata (ver iaNeedsAttention()).
    collapsed: !warnings.length
  };
}
/* Detección determinista (sin IA) de a qué nivel del temario pertenece un
   texto, buscando menciones explícitas tipo "Artículo 9.1", "TÍTULO I",
   "Capítulo II", "Sección 1ª". Solo rellena lo que el propio texto indica
   literalmente; nunca inventa. Devuelve null si no encuentra nada. */
function autoDetectUbicacion(text){
  if(!text) return null;
  const out = {};
  let found = false;
  const artMatch = text.match(/Art(?:í|i)culos?\.?\s+(\d+)/i) || text.match(/\bart\.\s*(\d+)/i);
  if(artMatch){ out.articulo = artMatch[1]; found = true; }
  const capMatch = text.match(/Cap(?:í|i)tulo\s+([IVXLCDM]+|\d+)/i);
  if(capMatch){ out.capitulo = capMatch[1]; found = true; }
  const titMatch = text.match(/T(?:í|i)tulo\s+([IVXLCDM]+|\d+)(?!\s*B[aá]sico)/i);
  if(titMatch){ out.titulo = titMatch[1]; found = true; }
  const secMatch = text.match(/Secci[oó]n\s+(\d+\s*[ªº]?|[IVXLCDM]+)/i);
  if(secMatch){ out.seccion = secMatch[1].trim(); found = true; }
  return found ? out : null;
}
/* Si ya existe un nodo con ese tipo+número en el tema actual, reutiliza su
   nombre para que el admin no tenga que volver a escribirlo (y para que
   ensureIANodePath encaje con el nodo existente en vez de crear uno nuevo). */
function findExistingNodeNombre(tipo, numero){
  if(!numero || !adminTreeTopicId || !adminData || !adminData.nodes) return '';
  const found = adminData.nodes.find(n => n.topic_id === adminTreeTopicId && n.tipo === tipo &&
    n.numero && String(n.numero).trim().toLowerCase() === String(numero).trim().toLowerCase());
  return found ? (found.nombre || '') : '';
}
function adminExtractDeterministic(){
  const rawText = document.getElementById('iaRawText').value.trim();
  const statusEl = document.getElementById('adminStatus-iaImport');
  if(!rawText){ statusEl.textContent = 'Pega antes el texto extraído.'; statusEl.style.color = 'var(--coral)'; return; }
  const blocks = splitBookmarkletBlocks(rawText);
  if(!blocks.length){ statusEl.style.color = 'var(--coral)'; statusEl.textContent = 'No se ha reconocido ningún bloque de pregunta (separador "=====================").'; return; }
  iaPreviewData = blocks.map(parseBookmarkletBlock);
  renderIAPreview();
  const conProblemas = iaPreviewData.filter(q => q.warnings.length).length;
  const sinUbicar = iaPreviewData.filter(q => iaLocIsEmpty(q.location)).length;
  statusEl.style.color = conProblemas ? 'var(--amber)' : 'var(--green)';
  statusEl.textContent = iaPreviewData.length + ' pregunta' + (iaPreviewData.length===1?'':'s') + ' extraída' + (iaPreviewData.length===1?'':'s') + ' del texto' +
    (conProblemas ? ', ' + conProblemas + ' con avisos de formato' : '') + '. ' +
    (sinUbicar
      ? sinUbicar + ' sin artículo detectado automáticamente: indícalo a mano en cada pregunta.'
      : 'Artículo detectado automáticamente en todas — revísalos y guarda.');
  document.getElementById('iaSaveRow').classList.remove('hidden');
}
function iaLocField(i, tipo, field){
  return 'onchange="iaPreviewData['+i+'].location.'+tipo+'=iaPreviewData['+i+'].location.'+tipo+'||{numero:\'\',nombre:\'\'};' +
    'iaPreviewData['+i+'].location.'+tipo+'.'+field+'=this.value;' +
    'if(!iaPreviewData['+i+'].location.'+tipo+'.numero&&!iaPreviewData['+i+'].location.'+tipo+'.nombre)iaPreviewData['+i+'].location.'+tipo+'=null;"';
}
const IA_LOC_TITLE = { articulo:'Artículo' };
/* Un elemento "necesita atención" si tiene un error de guardado, avisos de
   formato, o no tiene artículo ubicado y no está confirmada como pregunta
   general. Estos se muestran primero y desplegados, para no tener que
   buscarlos entre el resto. */
function iaNeedsAttention(q){
  const noLoc = iaLocIsEmpty(q.location) && !q.confirmedGeneral;
  return !!(q.saveError || (q.warnings && q.warnings.length) || noLoc);
}
/* Orden de prioridad para mostrar: 1) con error de guardado, 2) con avisos/
   incidencias o sin ubicar, 3) el resto en su orden original. Es solo un
   orden de visualización: no reordena iaPreviewData, así que los índices
   usados en los onchange/onclick (iaPreviewData[i]) siguen siendo válidos. */
function iaSortedIndices(){
  const idx = iaPreviewData.map((_, i) => i);
  const score = q => q.saveError ? 0 : (iaNeedsAttention(q) ? 1 : 2);
  idx.sort((a, b) => score(iaPreviewData[a]) - score(iaPreviewData[b]) || a - b);
  return idx;
}
function iaToggleCollapse(i){
  iaPreviewData[i].collapsed = !iaPreviewData[i].collapsed;
  renderIAPreview();
}
function iaExpandAll(){
  iaPreviewData.forEach(q => q.collapsed = false);
  renderIAPreview();
}
/* Desactiva de golpe el número de artículo de TODAS las preguntas de la
   tanda y las marca como "generales de todo el tema" a propósito, para no
   tener que ir pregunta por pregunta cuando el temario importado no se
   organiza por artículos. Así se pueden guardar todas sin artículo. */
function iaMarkAllGeneral(){
  iaPreviewData.forEach(q => {
    q.location.articulo = null;
    q.confirmedGeneral = true;
  });
  renderIAPreview();
}
function iaCollapseAll(){
  // Las que necesitan atención (error, avisos o sin artículo) se quedan
  // desplegadas incluso al "Plegar todas", porque si no se perdería de vista
  // justo lo que hay que corregir.
  iaPreviewData.forEach(q => { q.collapsed = !iaNeedsAttention(q); });
  renderIAPreview();
}
function renderIAPreview(){
  const el = document.getElementById('iaPreviewList');
  const toolbar = document.getElementById('iaPreviewToolbar');
  const countEl = document.getElementById('iaPreviewCount');
  if(!iaPreviewData.length){
    el.innerHTML = '';
    toolbar.classList.add('hidden');
    return;
  }
  const conProblemas = iaPreviewData.filter(iaNeedsAttention).length;
  toolbar.classList.remove('hidden');
  countEl.textContent = iaPreviewData.length + ' pregunta' + (iaPreviewData.length===1?'':'s') +
    (conProblemas ? ' · ' + conProblemas + ' con aviso' + (conProblemas===1?'':'s') + ' (arriba)' : '');
  el.innerHTML = iaSortedIndices().map(i => {
    const q = iaPreviewData[i];
    const noLoc = iaLocIsEmpty(q.location);
    const needsAttention = noLoc && !q.confirmedGeneral;
    const priority = iaNeedsAttention(q);
    const collapsed = !!q.collapsed;
    const statusBadges =
      (q.saveError ? '<span class="ia-status-dot ia-status-dot--error">Error al guardar</span>' : '') +
      (q.warnings && q.warnings.length ? '<span class="ia-status-dot ia-status-dot--warn">'+q.warnings.length+' aviso'+(q.warnings.length===1?'':'s')+'</span>' : '') +
      (needsAttention ? '<span class="ia-status-dot ia-status-dot--warn">Sin artículo</span>' : '');
    const previewText = (q.number!=null?'#'+q.number+' — ':'') + (q.question ? q.question : '(sin enunciado)');
    return (
    '<div class="ia-preview-item'+(priority?' ia-preview-item--priority':'')+'">' +
      '<div class="ia-preview-head">' +
        '<label><input type="checkbox" '+(q.include?'checked':'')+' onchange="iaPreviewData['+i+'].include=this.checked">Incluir al guardar'+(q.number!=null?' <span class="admin-badge" style="margin-left:6px;">#'+q.number+'</span>':'')+'</label>' +
        '<span style="display:flex; align-items:center; gap:8px;">' +
          statusBadges +
          '<span class="ia-collapse-toggle" onclick="iaToggleCollapse('+i+')" title="'+(collapsed?'Desplegar':'Plegar')+'">'+(collapsed?'▸ Desplegar':'▾ Plegar')+'</span>' +
          '<span class="ia-discard-btn" onclick="iaPreviewData.splice('+i+',1);renderIAPreview();">Descartar</span>' +
        '</span>' +
      '</div>' +
      (collapsed ? '<div class="ia-preview-summary" onclick="iaToggleCollapse('+i+')">'+esc(previewText)+'</div>' : '') +
      (collapsed ? '' :
      (q.saveError ? '<div class="ia-issue-box"><div class="ia-warn" style="margin-bottom:2px;">⛔ '+esc(q.saveError)+'</div></div>' : '') +
      (q.warnings && q.warnings.length ? '<div class="ia-issue-box">' + q.warnings.map(w => '<div class="ia-warn" style="margin-bottom:2px;">⚠ '+esc(w)+'</div>').join('') + '</div>' : '') +
      '<label>Pregunta</label>' +
      '<textarea onchange="iaPreviewData['+i+'].question=this.value">'+esc(q.question)+'</textarea>' +
      q.options.map((opt, oi) => (
        '<label>Opción '+String.fromCharCode(65+oi)+(oi===q.correct_index?' (correcta)':'')+'</label>' +
        '<input value="'+esc(opt)+'" onchange="iaPreviewData['+i+'].options['+oi+']=this.value">'
      )).join('') +
      '<label>Opción correcta</label>' +
      '<select onchange="iaPreviewData['+i+'].correct_index=parseInt(this.value,10)">' +
        q.options.map((opt, oi) => '<option value="'+oi+'" '+(oi===q.correct_index?'selected':'')+'>'+esc(opt||('Opción '+String.fromCharCode(65+oi)))+'</option>').join('') +
      '</select>' +
      '<label>Explicación</label>' +
      '<textarea onchange="iaPreviewData['+i+'].explain=this.value">'+esc(q.explain)+'</textarea>' +
      '<label>Número de artículo</label>' +
      (q.autoDetected && !noLoc ? '<div class="ia-notreviewed" style="color:var(--green);">📍 Detectado automáticamente del texto — revisa que sea correcto.</div>' : '') +
      (needsAttention ? '<div class="ia-warn">⚠ No se ha detectado el número de artículo para esta pregunta. Indícalo abajo o márcala como general a propósito.</div>' : '') +
      '<div class="ia-loc-row">' +
        '<input placeholder="Número de artículo" value="'+esc(q.location.articulo ? q.location.articulo.numero : '')+'" '+iaLocField(i,'articulo','numero')+'>' +
      '</div>' +
      '<div class="ia-general-check"><input type="checkbox" id="iaGeneral'+i+'" '+(q.confirmedGeneral?'checked':'')+' onchange="iaPreviewData['+i+'].confirmedGeneral=this.checked;renderIAPreview();">' +
      '<label for="iaGeneral'+i+'" style="margin:0;">Es una pregunta general de todo el tema (sin artículo), a propósito</label></div>'
      ) +
    '</div>'
    );
  }).join('');
}
/* Busca el nodo "articulo" del árbol que corresponde al número indicado (o null si
   no se indicó número = pregunta general confirmada). Solo se pide el número: se
   busca en cualquier parte del árbol de este tema y se reutiliza si existe; si no
   existe, se crea automáticamente colgado directamente del tema (sin título/
   capítulo/sección), que es una ubicación válida según el esquema del árbol. Así
   se puede ir construyendo la estructura sobre la marcha, sin bloquear el guardado
   de preguntas. Si luego quieres reordenarlo bajo un capítulo/sección, se puede
   mover a mano en "Estructura" sin perder ni duplicar preguntas. */
async function ensureIANodePath(topicId, loc){
  const spec = loc.articulo;
  if(!spec || !spec.numero) return null;
  const numeroMatches = n => n.numero && String(n.numero).trim().toLowerCase() === String(spec.numero).trim().toLowerCase();
  const existing = adminData.nodes.find(n => n.topic_id === topicId && n.tipo === 'articulo' && numeroMatches(n));
  if(existing) return existing.id;
  // No existe todavía: se crea como nivel raíz del tema, igual que hace
  // adminSaveNode() al crear un nivel manualmente sin padre.
  const payload = { topic_id: topicId, padre_id: null, tipo: 'articulo', numero: spec.numero, nombre: null };
  const { data, error } = await sb.from('nodos_temario').insert(payload).select().single();
  if(error){
    throw new Error('No se ha podido crear automáticamente el "Artículo ' + spec.numero + '": ' + error.message);
  }
  // Se añade a la caché local para que, dentro del mismo guardado por lotes,
  // otras preguntas del mismo artículo reutilicen este nodo en vez de crear duplicados.
  adminData.nodes.push(data);
  return data.id;
}
async function adminSaveIAQuestions(){
  const statusEl = document.getElementById('adminStatus-iaImport');
  // Limpia errores de un intento de guardado anterior antes de revalidar.
  iaPreviewData.forEach(q => q.saveError = null);
  const candidates = iaPreviewData.filter(q => q.include && q.question.trim() && q.options.filter(o=>o && o.trim()).length >= 2);
  if(!candidates.length){ statusEl.style.color = 'var(--coral)'; statusEl.textContent = 'No hay preguntas válidas seleccionadas para guardar.'; return; }
  const pending = candidates.filter(q => iaLocIsEmpty(q.location) && !q.confirmedGeneral);
  if(pending.length){
    pending.forEach(q => { q.saveError = 'Falta el número de artículo, o márcala como general a propósito.'; q.collapsed = false; });
    renderIAPreview();
    statusEl.style.color = 'var(--coral)';
    statusEl.textContent = 'Hay ' + pending.length + ' pregunta' + (pending.length===1?'':'s') + ' sin número de artículo: indícalo o márca' + (pending.length===1?'la':'las') + ' como general a propósito antes de guardar. Se ' + (pending.length===1?'ha':'han') + ' subido al principio de la lista.';
    return;
  }
  const btn = document.getElementById('iaSaveBtn');
  btn.disabled = true; btn.textContent = 'Guardando…';
  try{
    // 1ª pasada: resolver el nodo de cada candidata SIN guardar nada todavía.
    // Si alguna falla (p.ej. el artículo no existe en el árbol), se marca con
    // su propio error y se sube al principio de la lista, en vez de abortar
    // en la primera y dejar al admin sin saber cuántas más fallan ni cuáles.
    const resolved = [];
    let hadError = false;
    for(const q of candidates){
      try{
        const nodoId = iaLocIsEmpty(q.location) ? null : await ensureIANodePath(adminTreeTopicId, q.location);
        resolved.push({ q, nodoId });
      } catch(err){
        q.saveError = err.message || 'No se ha podido ubicar esta pregunta.';
        q.collapsed = false;
        hadError = true;
      }
    }
    if(hadError){
      renderIAPreview();
      const nErr = candidates.filter(q => q.saveError).length;
      statusEl.style.color = 'var(--coral)';
      statusEl.textContent = nErr + ' pregunta' + (nErr===1?' tiene':'s tienen') + ' un error y se ' + (nErr===1?'ha':'han') + ' subido al principio de la lista, marcada' + (nErr===1?'':'s') + ' en rojo. Corrígela' + (nErr===1?'':'s') + ' y vuelve a guardar.';
      return;
    }
    const payload = resolved.map(({ q, nodoId }) => ({
      topic_id: adminTreeTopicId,
      nodo_id: nodoId,
      question: q.question.trim(),
      options: q.options.map(o => (o||'').trim()).filter(o => o.length > 0),
      correct_index: q.correct_index,
      explain: (q.explain||'').trim(),
      difficulty: 'media'
    }));
    const { error } = await sb.from('questions').insert(payload);
    if(error) throw new Error(error.message);
    statusEl.style.color = 'var(--green)';
    statusEl.textContent = payload.length + ' pregunta' + (payload.length===1?'':'s') + ' guardada' + (payload.length===1?'':'s') + ' correctamente.';
    iaPreviewData = [];
    renderIAPreview();
    document.getElementById('iaSaveRow').classList.add('hidden');
    await adminLoadTree();
    await adminLoadQuestions();
    renderTree();
    await adminRefreshStudentStats();
    setTimeout(adminCancelIAImportForm, 1200);
  } catch(err){
    statusEl.style.color = 'var(--coral)';
    statusEl.textContent = err.message || 'Ha ocurrido un error al guardar las preguntas.';
  } finally {
    btn.disabled = false; btn.textContent = 'Guardar preguntas seleccionadas';
  }
}
function adminOpenTreeQuestionForm(nodeId){
  treeQuestionNodeId = nodeId || null;
  treeQuestionTopicId = adminTreeTopicId;
  treeQuestionLocationSet = true;
  adminEditing.question = null;
  adminCancelNodeForm();
  adminCancelGeneralPicker();
  adminCancelIAImportForm();
  adminCancelMoveNode(); adminCancelBulkMove();
  treeNodeMenuOpen = null;
  renderTree();
  document.getElementById('adminForm-treeQuestion').classList.remove('hidden');
  const node = treeQuestionNodeId ? adminData.nodes.find(n => n.id === treeQuestionNodeId) : null;
  document.getElementById('treeQuestionPath').textContent = !node
    ? 'Pregunta general de todo el tema (sin título, capítulo, sección ni artículo asociado)'
    : (node.tipo === 'articulo' ? 'Pregunta en: ' : 'Pregunta general en: ') + nodePathName(treeQuestionNodeId);
  document.getElementById('tqText').value = '';
  document.getElementById('tqOpt0').value = '';
  document.getElementById('tqOpt1').value = '';
  document.getElementById('tqOpt2').value = '';
  document.getElementById('tqOpt3').value = '';
  document.getElementById('tqCorrect').value = '0';
  document.getElementById('tqExplain').value = '';
  document.getElementById('tqDifficulty').value = 'media';
  document.getElementById('adminStatus-treeQuestion').textContent = '';
  document.getElementById('tqSaveBtn').textContent = 'Guardar pregunta';
}
/* Editar una pregunta ya existente sin salir de la Estructura: reutiliza el mismo
   formulario flotante que se usa para añadir preguntas en un nivel del árbol, pero
   precargado con sus datos y en modo "actualizar" en vez de "crear". */
function adminEditQuestionInTree(id){
  const q = adminData.questions.find(x => String(x.id) === String(id));
  if(!q) return;
  treeQuestionNodeId = q.nodo_id || null;
  treeQuestionTopicId = q.topic_id || adminTreeTopicId;
  treeQuestionLocationSet = true;
  adminEditing.question = id;
  adminCancelNodeForm();
  adminCancelGeneralPicker();
  adminCancelIAImportForm();
  adminCancelMoveNode(); adminCancelBulkMove();
  treeNodeMenuOpen = null;
  renderTree();
  const form = document.getElementById('adminForm-treeQuestion');
  form.classList.remove('hidden');
  document.getElementById('treeQuestionPath').textContent = 'Editando pregunta en: ' + (q.nodo_id ? nodePathName(q.nodo_id) : 'Todo el tema (general)');
  document.getElementById('tqText').value = q.question || '';
  const opts = q.options || [];
  document.getElementById('tqOpt0').value = opts[0] || '';
  document.getElementById('tqOpt1').value = opts[1] || '';
  document.getElementById('tqOpt2').value = opts[2] || '';
  document.getElementById('tqOpt3').value = opts[3] || '';
  document.getElementById('tqCorrect').value = q.correct_index != null ? q.correct_index : 0;
  document.getElementById('tqExplain').value = q.explain || '';
  document.getElementById('tqDifficulty').value = q.difficulty || 'media';
  document.getElementById('adminStatus-treeQuestion').textContent = '';
  document.getElementById('tqSaveBtn').textContent = 'Guardar cambios';
  form.scrollIntoView({ behavior:'smooth', block:'center' });
}
function adminCancelTreeQuestionForm(){
  treeQuestionNodeId = null;
  treeQuestionLocationSet = false;
  adminEditing.question = null;
  document.getElementById('adminForm-treeQuestion').classList.add('hidden');
}
async function adminSaveTreeQuestion(){
  if(!treeQuestionLocationSet || !treeQuestionTopicId){ showAdminStatus('treeQuestion', 'No hay ubicación seleccionada.', true); return; }
  const question = document.getElementById('tqText').value.trim();
  const options = [
    document.getElementById('tqOpt0').value.trim(),
    document.getElementById('tqOpt1').value.trim(),
    document.getElementById('tqOpt2').value.trim(),
    document.getElementById('tqOpt3').value.trim()
  ].filter(o => o.length > 0);
  const correct_index = parseInt(document.getElementById('tqCorrect').value, 10) || 0;
  const explain = document.getElementById('tqExplain').value.trim();
  const difficulty = document.getElementById('tqDifficulty').value;
  if(!question || options.length < 2){ showAdminStatus('treeQuestion', 'Enunciado y al menos 2 opciones son obligatorios.', true); return; }
  if(correct_index >= options.length){ showAdminStatus('treeQuestion', 'La opción correcta seleccionada no existe entre las opciones rellenadas.', true); return; }
  const payload = { topic_id: treeQuestionTopicId, nodo_id: treeQuestionNodeId, question, options, correct_index, explain, difficulty };
  const editingId = adminEditing.question;
  const { error } = editingId
    ? await sb.from('questions').update(payload).eq('id', editingId)
    : await sb.from('questions').insert(payload);
  if(error){ showAdminStatus('treeQuestion', error.message, true); return; }
  showAdminStatus('treeQuestion', editingId ? 'Cambios guardados correctamente.' : 'Pregunta guardada correctamente.', false);
  await adminLoadQuestions();
  renderTree();
  await adminRefreshStudentStats();
  setTimeout(adminCancelTreeQuestionForm, 700);
}
