/* Administración: copias de seguridad. */

/* ---------- Administración → Copias de seguridad ---------- */
function fmtBytes(n){ return n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB'; }
async function adminLoadBackups(){
  const el = document.getElementById('adminList-backups');
  if(!el) return;
  el.innerHTML = skelList(3);
  const { data, error } = await sb.storage.from('backups').list('', { limit: 100, sortBy: { column: 'name', order: 'desc' } });
  if(error){ el.innerHTML = '<div class="admin-empty">No se pudieron cargar las copias: ' + escapeHtml(error.message) + '</div>'; return; }
  const files = (data || []).filter(f => /\.json\.gz$/.test(f.name));
  if(!files.length){ el.innerHTML = '<div class="admin-empty">Todavía no hay copias. La primera se hará esta noche (o pulsa «Hacer copia ahora»).</div>'; return; }
  el.innerHTML = files.map((f, i) => {
    const d = f.name.slice(0, 10);
    const label = new Date(d + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    const size = f.metadata && f.metadata.size ? fmtBytes(f.metadata.size) : '';
    return '<div class="admin-card backup-row"><div><div class="backup-date">' + escapeHtml(label) + (i === 0 ? ' <span class="admin-badge">Más reciente</span>' : '') + '</div>' +
      '<div class="admin-card-meta">' + escapeHtml(f.name) + (size ? ' · ' + size : '') + '</div></div>' +
      '<button class="btn btn-light" onclick="adminDownloadBackup(\'' + f.name.replace(/[^\w.\-]/g, '') + '\')">Descargar</button></div>';
  }).join('');
}
async function adminDownloadBackup(name){
  const { data, error } = await sb.storage.from('backups').createSignedUrl(name, 120, { download: 'pjfire-copia-' + name });
  if(error || !data){ uiToast('No se pudo descargar la copia: ' + (error ? error.message : ''), 'error'); return; }
  const a = document.createElement('a');
  a.href = data.signedUrl; a.rel = 'noopener';
  document.body.appendChild(a); a.click(); a.remove();
}
async function adminBackupNow(){
  const btn = document.getElementById('backupNowBtn');
  if(btn){ btn.disabled = true; btn.textContent = 'Haciendo copia…'; }
  try{
    const { data, error } = await sb.functions.invoke('backup-db', { body: {} });
    if(error || !data || !data.ok) throw new Error((data && data.error) || (error && error.message) || 'error');
    uiToast('Copia guardada (' + fmtBytes(data.bytes) + ')', 'success');
    adminLoadBackups();
  }catch(e){
    uiToast('No se pudo hacer la copia: ' + e.message, 'error');
  }finally{
    if(btn){ btn.disabled = false; btn.textContent = 'Hacer copia ahora'; }
  }
}
