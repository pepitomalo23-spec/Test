/* Administración: callejero (sincronización con el CDAU y cambios por revisar). */

const CJ_TIPO_CAMBIO = {
  nueva: 'Vía nueva',
  renombrada: 'Cambio de nombre',
  desaparecida: 'Ya no está en el callejero oficial',
  reaparecida: 'Ha vuelto al callejero oficial',
  trazado: 'Trazado actualizado'
};

async function adminCallejeroInvocar(body){
  const { data, error } = await sb.functions.invoke('callejero-sync', { body });
  if(error || !data || !data.ok) throw new Error((data && data.error) || (error && error.message) || 'error');
  return data;
}

async function adminLoadCallejero(){
  const estadoEl = document.getElementById('adminCallejeroEstado');
  const pendEl = document.getElementById('adminCallejeroPendientes');
  const histEl = document.getElementById('adminCallejeroHistorial');
  if(!estadoEl) return;
  estadoEl.innerHTML = skelList(2); pendEl.innerHTML = skelList(2); histEl.innerHTML = '';
  const [pub, log, pend, hist] = await Promise.all([
    sb.from('callejero_publicado').select('*').eq('id', 1).maybeSingle(),
    sb.from('callejero_sync_log').select('*').order('id', { ascending: false }).limit(1).maybeSingle(),
    sb.from('callejero_cambios').select('*').eq('estado', 'pendiente').order('id'),
    sb.from('callejero_cambios').select('*').neq('estado', 'pendiente').order('id', { ascending: false }).limit(30)
  ]);

  // Estado
  const p = pub.data, l = log.data;
  let html = '<div class="admin-card"><div class="admin-card-meta">';
  html += p ? '<b>' + p.jugables.toLocaleString('es-ES') + '</b> vías en el juego (' + p.total_vias.toLocaleString('es-ES') + ' en el mapa) · publicado el ' + escapeHtml(formatDateTime(p.publicado_at))
            : 'Todavía no hay callejero publicado.';
  html += '</div>';
  if(l){
    const cuando = escapeHtml(formatDateTime(l.empezada_at));
    if(l.ok === true){
      const r = l.resumen || {};
      const partes = [];
      if(r.carga_inicial) partes.push('carga inicial de ' + r.nuevas + ' vías');
      else{
        if(r.nuevas) partes.push(r.nuevas + ' nuevas');
        if(r.trazados) partes.push(r.trazados + ' trazados actualizados');
        if(r.renombradas) partes.push(r.renombradas + ' cambios de nombre');
        if(r.desaparecidas) partes.push(r.desaparecidas + ' desaparecidas');
        if(r.reaparecidas) partes.push(r.reaparecidas + ' reaparecidas');
      }
      html += '<div class="admin-card-meta">Última comprobación: ' + cuando + ' · ' + (partes.length ? escapeHtml(partes.join(', ')) : 'sin cambios') + '</div>';
    }else if(l.ok === false){
      html += '<div class="admin-card-meta cj-admin-error">Última comprobación (' + cuando + ') fallida: ' + escapeHtml(l.error || '') + '. No se ha cambiado nada.</div>';
    }else{
      html += '<div class="admin-card-meta">Comprobación en curso desde ' + cuando + '…</div>';
    }
  }
  estadoEl.innerHTML = html + '</div>';

  // Pendientes
  const pendientes = pend.data || [];
  const countEl = document.getElementById('adminCallejeroCount');
  if(countEl){ countEl.textContent = String(pendientes.length); countEl.classList.toggle('hidden', !pendientes.length); }
  pendEl.innerHTML = pendientes.length ? pendientes.map(c => {
    const antes = c.antes || {}, despues = c.despues || {};
    let detalle = '';
    if(c.tipo_cambio === 'renombrada'){
      detalle = '<div class="cj-admin-cambio"><span class="cj-admin-antes">' + escapeHtml(antes.nombre) + '</span> → <span class="cj-admin-despues">' + escapeHtml(despues.nombre) + '</span></div>' +
        '<div class="admin-card-meta">Si lo apruebas, la vía pasa a llamarse así en el juego.</div>';
    }else if(c.tipo_cambio === 'desaparecida'){
      detalle = '<div class="cj-admin-cambio">' + escapeHtml(antes.nombre) + '</div>' +
        '<div class="admin-card-meta">Si lo apruebas, deja de salir en el juego (el progreso de los alumnos no se borra). Si la rechazas, se mantiene.</div>';
    }
    return '<div class="admin-card"><div class="admin-card-title">' + escapeHtml(CJ_TIPO_CAMBIO[c.tipo_cambio] || c.tipo_cambio) +
      ' <span class="admin-card-meta">· ' + escapeHtml(formatDateTime(c.detectado_at)) + ' · vía ' + c.id_vial + '</span></div>' + detalle +
      '<div class="admin-form-actions" style="margin-top:10px;">' +
        '<button class="btn btn-light" onclick="adminCallejeroDecidir(' + c.id + ', true, this)">Aprobar</button>' +
        '<button class="btn btn-ghost" onclick="adminCallejeroDecidir(' + c.id + ', false, this)">Rechazar</button>' +
      '</div></div>';
  }).join('') : '<div class="admin-empty">Nada pendiente.</div>';

  // Historial
  const h = hist.data || [];
  histEl.innerHTML = h.length ? '<div class="admin-card">' + h.map(c => {
    const nombre = (c.despues && c.despues.nombre) || (c.antes && c.antes.nombre) || ('vía ' + c.id_vial);
    const estado = c.estado === 'aplicado' ? 'aprobado' : c.estado === 'rechazado' ? (c.revisado_por ? 'rechazado' : 'descartado solo') : 'automático';
    return '<div class="cj-admin-hist"><span>' + escapeHtml(CJ_TIPO_CAMBIO[c.tipo_cambio] || c.tipo_cambio) + ': ' + escapeHtml(nombre) + '</span>' +
      '<span class="admin-card-meta">' + escapeHtml(estado) + ' · ' + escapeHtml(formatDateTime(c.revisado_at || c.detectado_at)) + '</span></div>';
  }).join('') + '</div>' : '<div class="admin-empty">Todavía no hay cambios.</div>';
}

async function adminCallejeroSincronizar(){
  const btn = document.getElementById('callejeroSyncBtn');
  if(btn){ btn.disabled = true; btn.textContent = 'Comprobando…'; }
  try{
    const data = await adminCallejeroInvocar({ accion: 'sincronizar' });
    const r = data.resumen || {};
    const cambios = (r.nuevas || 0) + (r.trazados || 0) + (r.renombradas || 0) + (r.desaparecidas || 0) + (r.reaparecidas || 0);
    uiToast(cambios ? 'Callejero comprobado: hay cambios.' : 'Callejero comprobado: sin cambios.', 'success');
  }catch(e){
    uiToast('No se pudo comprobar el callejero: ' + e.message, 'error');
  }finally{
    if(btn){ btn.disabled = false; btn.textContent = 'Comprobar ahora'; }
    adminLoadCallejero();
    refreshAdminPendingBadge();
  }
}

async function adminCallejeroDecidir(id, aprobar, btn){
  if(btn) btn.disabled = true;
  try{
    await adminCallejeroInvocar({ accion: aprobar ? 'aprobar' : 'rechazar', id });
    uiToast(aprobar ? 'Cambio aprobado.' : 'Cambio rechazado.', 'success');
  }catch(e){
    uiToast('No se pudo guardar: ' + e.message, 'error');
  }finally{
    adminLoadCallejero();
    refreshAdminPendingBadge();
  }
}
