/* Administración: tests de cada tema del Específico (tabla especifico_tests).
   Se elige el tema, se añaden tests, se ordenan con las flechas y se quitan.
   Los alumnos los ven en Estudio › Específico (js/especifico.js). */

let adminEspTests = [];
let adminEspTema = null;

async function adminLoadEspecifico(){
  const el = document.getElementById('adminEspLista');
  if(!el) return;
  const temas = ESP.temas();
  if(!adminEspTema) adminEspTema = temas[0].clave;
  el.innerHTML = skelList(3);
  const { data, error } = await sb.from('especifico_tests').select('id,tema,titulo,orden,created_at').order('orden').order('created_at');
  if(error){ el.innerHTML = '<div class="admin-empty">No se pudieron cargar los tests: ' + escapeHtml(error.message) + '</div>'; return; }
  adminEspTests = data || [];
  adminPintarEspecifico();
}
function adminEspDelTema(k){ return adminEspTests.filter(t => t.tema === k).sort((a, b) => a.orden - b.orden || String(a.created_at).localeCompare(String(b.created_at))); }
function adminPintarEspecifico(){
  const sel = document.getElementById('adminEspTema');
  const el = document.getElementById('adminEspLista');
  if(!sel || !el) return;
  sel.innerHTML = ESP.temas().map((t, i) => {
    const n = adminEspDelTema(t.clave).length;
    return '<option value="' + t.clave + '"' + (t.clave === adminEspTema ? ' selected' : '') + '>' + (i + 1) + '. ' + escapeHtml(t.titulo) + (n ? ' (' + n + ')' : '') + '</option>';
  }).join('');
  const lista = adminEspDelTema(adminEspTema);
  el.innerHTML = lista.length ? lista.map((t, i) =>
    '<div class="admin-card admin-esp-fila">' +
      '<span class="admin-esp-titulo"><span class="admin-esp-tipo">Test - </span>' + escapeHtml(t.titulo) + '</span>' +
      '<button type="button" class="admin-esp-btn" title="Subir"' + (i ? '' : ' disabled') + ' onclick="adminEspMover(\'' + t.id + '\', -1)">↑</button>' +
      '<button type="button" class="admin-esp-btn" title="Bajar"' + (i < lista.length - 1 ? '' : ' disabled') + ' onclick="adminEspMover(\'' + t.id + '\', 1)">↓</button>' +
      '<button type="button" class="admin-esp-btn peligro" title="Quitar" onclick="adminEspBorrar(\'' + t.id + '\')">✕</button>' +
    '</div>').join('')
    : '<div class="admin-empty">Este tema todavía no tiene tests.</div>';
}
function adminEspCambiarTema(k){ adminEspTema = k; adminPintarEspecifico(); }

async function adminEspAnadir(ev){
  ev.preventDefault();
  const inp = document.getElementById('adminEspTitulo');
  const titulo = inp.value.trim();
  if(!titulo){ inp.focus(); return; }
  const orden = adminEspDelTema(adminEspTema).reduce((m, t) => Math.max(m, t.orden + 1), 0);
  const btn = document.getElementById('adminEspAnadirBtn'); btn.disabled = true;
  const { data, error } = await sb.from('especifico_tests').insert({ tema: adminEspTema, titulo, orden }).select('id,tema,titulo,orden,created_at').single();
  btn.disabled = false;
  if(error){ uiToast('No se pudo añadir: ' + error.message, 'error'); return; }
  adminEspTests.push(data);
  inp.value = '';
  inp.focus();
  adminPintarEspecifico();
}
async function adminEspMover(id, d){
  const lista = adminEspDelTema(adminEspTema);
  const i = lista.findIndex(t => t.id === id), j = i + d;
  if(i < 0 || j < 0 || j >= lista.length) return;
  // Se reescribe el orden de todo el tema (0, 1, 2…) con los dos cambiados de sitio.
  [lista[i], lista[j]] = [lista[j], lista[i]];
  const cambios = lista.map((t, n) => ({ t, n })).filter(({ t, n }) => t.orden !== n);
  cambios.forEach(({ t, n }) => { t.orden = n; });
  adminPintarEspecifico();
  const rs = await Promise.all(cambios.map(({ t, n }) => sb.from('especifico_tests').update({ orden: n }).eq('id', t.id)));
  const fallo = rs.find(r => r.error);
  if(fallo){ uiToast('No se pudo cambiar el orden: ' + fallo.error.message, 'error'); adminLoadEspecifico(); }
}
async function adminEspBorrar(id){
  const t = adminEspTests.find(x => x.id === id);
  if(!t || !(await uiConfirm('¿Quitar «' + t.titulo + '» de este tema?', { ok: 'Quitar', danger: true }))) return;
  const { error } = await sb.from('especifico_tests').delete().eq('id', id);
  if(error){ uiToast('No se pudo quitar: ' + error.message, 'error'); return; }
  adminEspTests = adminEspTests.filter(x => x.id !== id);
  adminPintarEspecifico();
}
