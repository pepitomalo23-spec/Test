/* Administración: normativas y cambios legislativos (BOE). */

/* ---------- NORMATIVAS / CAMBIOS LEGISLATIVOS (BOE) ---------- */
let boeCambiosData = [];
let boeNormasData = [];

async function loadNormativas(){
  const [{ data: normas, error: errNormas }, { data: cambios, error: errCambios }] = await Promise.all([
    sb.from('boe_normas_seguimiento').select('*'),
    sb.from('boe_cambios').select('*').order('created_at', { ascending:false }).limit(100)
  ]);
  if(errNormas) console.error(errNormas);
  if(errCambios) console.error(errCambios);
  boeNormasData = normas || [];
  boeCambiosData = cambios || [];
  renderBoeNormas();
  renderBoeCambios();
}

function renderBoeNormas(){
  const el = document.getElementById('boeNormasList');
  if(!el) return;
  if(!boeNormasData.length){
    el.innerHTML = '<div class="empty">Todavía no hay ninguna ley en seguimiento.</div>';
    return;
  }
  el.innerHTML = boeNormasData.map(n => {
    const estado = n.ultimo_error
      ? '<span class="admin-badge over">Error: '+esc(n.ultimo_error)+'</span>'
      : (n.activo ? '<span class="admin-badge admin">Activo</span>' : '<span class="admin-badge">Pausado</span>');
    const comprobado = n.ultima_comprobacion ? 'Última comprobación: '+formatDateTime(n.ultima_comprobacion) : 'Todavía sin comprobar';
    return (
      '<div class="boe-norma-card">' +
        '<div>' +
          '<div class="boe-norma-title">'+esc(n.titulo || n.boe_id)+'</div>' +
          '<div class="boe-norma-meta">'+esc(n.boe_id)+' · '+comprobado+'</div>' +
        '</div>' +
        estado +
      '</div>'
    );
  }).join('');
}

function renderBoeCambios(){
  const el = document.getElementById('boeCambiosList');
  if(!el) return;
  if(!boeCambiosData.length){
    el.innerHTML = '<div class="empty">No se ha detectado ningún cambio todavía. En cuanto el BOE publique una modificación de alguno de tus artículos, aparecerá aquí.</div>';
    return;
  }
  el.innerHTML = boeCambiosData.map(c => {
    const badge = c.estado === 'revisado' ? '<span class="boe-badge-revisado">Revisado</span>' : '<span class="boe-badge-nuevo">Nuevo</span>';
    const fecha = c.fecha_publicacion ? formatDateOnly(c.fecha_publicacion) : '';
    return (
      '<div class="boe-cambio-card" onclick="openBoeDetalle(\''+c.id+'\')">' +
        '<div class="boe-cambio-head">' +
          '<div class="boe-cambio-title">'+esc(topicTitle(c.topic_id))+' — '+esc(c.titulo_bloque || '')+'</div>' +
          badge +
        '</div>' +
        '<div class="boe-cambio-sub">'+esc((c.resumen_ia && c.resumen_ia.simple) || c.resumen_oficial || 'Se ha modificado el texto de este artículo.')+'</div>' +
        '<div class="boe-cambio-fecha">'+fecha+'</div>' +
      '</div>'
    );
  }).join('');
}

function formatDateOnly(d){
  if(!d) return '';
  try{ return new Date(d+'T00:00:00').toLocaleDateString('es-ES', { day:'2-digit', month:'2-digit', year:'numeric' }); }
  catch(e){ return d; }
}

async function openBoeDetalle(id){
  const c = boeCambiosData.find(x => x.id === id);
  if(!c){ return; }
  showScreen('screen-boe-detalle');
  const body = document.getElementById('boeDetalleBody');
  body.innerHTML = skelList(3, false);

  const { data: preguntas } = c.nodo_id
    ? await sb.from('questions').select('id, question').eq('nodo_id', c.nodo_id)
    : { data: [] };

  const ia = c.resumen_ia || null;
  body.innerHTML =
    '<div class="boe-detalle-section">' +
      '<div class="boe-detalle-label">Norma</div>' +
      '<div>'+esc(topicTitle(c.topic_id))+' — '+esc(c.titulo_bloque || '')+'</div>' +
    '</div>' +
    (c.fecha_publicacion || c.fecha_vigencia ? (
      '<div class="boe-detalle-section">' +
        '<div class="boe-detalle-label">Fechas</div>' +
        '<div>' +
          (c.fecha_publicacion ? 'Publicación de la modificación: '+formatDateOnly(c.fecha_publicacion)+'<br>' : '') +
          (c.fecha_vigencia ? 'Entrada en vigor: '+formatDateOnly(c.fecha_vigencia) : '') +
        '</div>' +
      '</div>'
    ) : '') +
    (ia ? (
      '<div class="boe-detalle-section">' +
        '<div class="boe-detalle-label">Qué ha cambiado</div>' +
        '<div>'+esc(ia.simple || '')+'</div>' +
        (ia.tecnica ? '<div class="boe-cambio-sub" style="margin-top:8px;">'+esc(ia.tecnica)+'</div>' : '') +
        (ia.afecta ? '<div class="boe-cambio-sub" style="margin-top:8px;"><b>Afecta a:</b> '+esc(ia.afecta)+'</div>' : '') +
      '</div>'
    ) : (c.resumen_oficial ? (
      '<div class="boe-detalle-section">' +
        '<div class="boe-detalle-label">Nota oficial del BOE</div>' +
        '<div>'+esc(c.resumen_oficial)+'</div>' +
      '</div>'
    ) : '')) +
    '<div class="boe-detalle-section">' +
      '<div class="boe-detalle-label">Antes</div>' +
      '<div class="boe-detalle-antes">'+(c.texto_antes_html || '(sin texto anterior)')+'</div>' +
    '</div>' +
    '<div class="boe-detalle-section">' +
      '<div class="boe-detalle-label">Ahora</div>' +
      '<div class="boe-detalle-ahora">'+(c.texto_ahora_html || '')+'</div>' +
    '</div>' +
    (c.fuente_url ? (
      '<div class="boe-detalle-section"><a href="'+esc(c.fuente_url)+'" target="_blank" rel="noopener">Ver en boe.es →</a></div>'
    ) : '') +
    '<div class="boe-detalle-section">' +
      '<div class="boe-detalle-label">Contenido de tu web afectado</div>' +
      (preguntas && preguntas.length
        ? preguntas.map(p => '<div class="boe-afecta-item">'+esc(p.question)+'</div>').join('')
        : '<div class="boe-cambio-sub">No hay preguntas ligadas directamente a este artículo.</div>') +
    '</div>' +
    (currentUserIsAdmin && c.estado !== 'revisado' ? (
      '<div class="modal-footer"><button class="btn btn-primary btn-light" onclick="adminMarcarRevisado(\''+c.id+'\')">Marcar como revisado</button></div>'
    ) : '');
}

async function adminMarcarRevisado(id){
  const { error } = await sb.rpc('admin_marcar_cambio_revisado', { p_cambio_id: id });
  if(error){ uiToast('No se pudo marcar como revisado: ' + error.message); return; }
  showScreen('screen-boe-cambios');
  await loadNormativas();
}

function initBoeAdminPanel(){
  const sel = document.getElementById('boeFormTopic');
  if(sel && !sel.dataset.filled){
    sel.innerHTML = TOPICS.map(t => '<option value="'+esc(t.id)+'">'+esc(t.name || t.id)+'</option>').join('');
    sel.dataset.filled = '1';
  }
  refreshBoeGeminiStatus();
}

async function adminSaveBoeNorma(){
  const topicId = document.getElementById('boeFormTopic').value;
  const boeId = document.getElementById('boeFormId').value.trim();
  const url = document.getElementById('boeFormUrl').value.trim() || null;
  if(!topicId || !boeId){ uiToast('Elige un tema e introduce el identificador del BOE.'); return; }
  const { error } = await sb.rpc('admin_upsert_boe_norma', {
    p_topic_id: topicId, p_boe_id: boeId, p_titulo: topicTitle(topicId), p_url_html: url, p_activo: true
  });
  if(error){ uiToast('No se pudo guardar: ' + error.message); return; }
  document.getElementById('boeFormId').value = '';
  document.getElementById('boeFormUrl').value = '';
  await loadNormativas();
}

async function refreshBoeGeminiStatus(){
  const statusEl = document.getElementById('boeGeminiStatus');
  if(!statusEl) return;
  const { data, error } = await sb.rpc('admin_app_secret_status', { p_name: 'gemini_api_key' });
  if(error){ statusEl.textContent = 'No se pudo comprobar'; return; }
  statusEl.textContent = data ? '✅ Configurada' : 'No configurada';
  statusEl.className = data ? 'admin-badge admin' : 'admin-badge';
}

async function adminSaveGeminiKey(){
  const input = document.getElementById('boeFormGeminiKey');
  const value = input.value.trim();
  if(!value){ uiToast('Introduce una clave.'); return; }
  const { error } = await sb.rpc('admin_set_app_secret', { p_name: 'gemini_api_key', p_value: value });
  if(error){ uiToast('No se pudo guardar: ' + error.message); return; }
  input.value = '';
  refreshBoeGeminiStatus();
}

async function adminTriggerBoeSyncNow(){
  const btn = document.getElementById('boeSyncNowBtn');
  const original = btn.textContent;
  btn.disabled = true; btn.textContent = 'Comprobando…';
  const { error } = await sb.rpc('admin_trigger_boe_sync');
  btn.disabled = false; btn.textContent = original;
  if(error){ uiToast('No se pudo lanzar la comprobación: ' + error.message); return; }
  // La Edge Function tarda unos segundos en recorrer todas las normas;
  // esperamos un poco antes de refrescar la lista.
  setTimeout(loadNormativas, 6000);
}
