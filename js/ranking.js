/* Mini ranking de Estadística: quién va ganando en los exámenes (Simulacro
   oficial y Examen). Quién sale y con qué nombre lo decide el administrador
   (tabla ranking_participantes, en Usuarios); las notas llegan de la función
   ranking_examenes. Se ordena por la nota media. Pulsando tu fila salen todos
   tus exámenes, y desde ahí se puede eliminar uno (borrar_examen: queda
   marcado como eliminado y el administrador lo puede devolver). */
const RANK = (function(){
  const CACHE = 'pj_ranking:';
  const yo = () => (typeof currentUser !== 'undefined' && currentUser) ? currentUser.id : null;
  const num = n => n == null ? '—' : Number(n).toFixed(2).replace('.', ',');
  const COPA = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4"/><path d="M12 13v4M9 20h6M10 17h4"/></svg>';
  let filas = null;

  function leerCache(){ try{ return JSON.parse(localStorage.getItem(CACHE + yo()) || 'null'); }catch(e){ return null; } }
  function guardarCache(){ try{ localStorage.setItem(CACHE + yo(), JSON.stringify(filas)); }catch(e){} }

  function ordenar(l){
    return l.slice().sort((a, b) =>
      (b.examenes > 0) - (a.examenes > 0) || Number(b.media || 0) - Number(a.media || 0) || Number(b.mejor || 0) - Number(a.mejor || 0) || String(a.nombre).localeCompare(String(b.nombre)));
  }
  function html(){
    if(!filas || !filas.length) return '';
    const l = ordenar(filas);
    return '<div class="rk-card">' +
      '<div class="rk-cab"><span class="rk-ico">' + COPA + '</span><div><b>Ranking de exámenes</b><span>Simulacro oficial y Examen · por nota media</span></div></div>' +
      '<ol class="rk-lista">' + l.map((f, i) => {
        const pos = f.examenes > 0 ? i + 1 : null, soy = f.user_id === yo();
        return '<li class="rk-fila' + (soy ? ' yo' : '') + (pos && pos <= 3 ? ' p' + pos : '') + '"' + (soy ? ' role="button" tabindex="0" data-rk-yo title="Ver tus exámenes"' : '') + '>' +
          '<span class="rk-pos">' + (pos || '–') + '</span>' +
          '<span class="rk-nombre"><b>' + escapeHtml(f.nombre) + (soy ? ' <i>tú</i>' : '') + '</b>' +
            '<small>' + (f.examenes > 0 ? 'Última ' + num(f.ultima) + ' · mejor ' + num(f.mejor) + ' · ' + f.examenes + (f.examenes === 1 ? ' examen' : ' exámenes') : 'Sin exámenes todavía') + '</small></span>' +
          '<span class="rk-nota' + (f.examenes > 0 ? (Number(f.media) >= 5 ? ' ok' : ' mal') : '') + '">' + num(f.media) + '</span>' +
          (soy ? '<span class="rk-flecha" aria-hidden="true">›</span>' : '') +
        '</li>';
      }).join('') + '</ol></div>';
  }
  function pintar(){
    const el = document.getElementById('statsRanking');
    if(!el) return;
    el.innerHTML = html();
    el.classList.toggle('hidden', !el.innerHTML);
  }
  async function abrir(){
    if(!yo()) return;
    if(filas == null) filas = leerCache();
    pintar();
    try{
      const { data, error } = await sb.rpc('ranking_examenes');
      if(error) throw error;
      filas = data || [];
      guardarCache();
      pintar();
    }catch(e){}
  }
  /* ---------- tus exámenes ---------- */
  const fecha = f => { const d = new Date(f); return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }) + ' · ' + d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }); };
  const PAPELERA = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/></svg>';
  async function misExamenes(){
    const bg = document.createElement('div');
    bg.className = 'ui-confirm-bg';
    const cerrar = () => { bg.remove(); document.removeEventListener('keydown', tecla, true); };
    const tecla = e => { if(e.key === 'Escape'){ e.preventDefault(); cerrar(); } };
    document.addEventListener('keydown', tecla, true);
    document.body.appendChild(bg);
    let lista = null;
    const pintarLista = () => {
      const cuerpo = lista == null ? '<p>Cargando…</p>' : !lista.length ? '<p>Todavía no has hecho ningún examen.</p>' :
        '<ul class="rk-mis">' + lista.map(h => {
          const t = (h.resumen && h.resumen.todo) || {};
          return '<li><button type="button" class="rk-mis-ver" data-rk-ver="' + h.id + '">' +
              '<b class="' + (Number(h.nota) >= 5 ? 'ok' : 'mal') + '">' + num(h.nota) + '</b>' +
              '<span><b>' + (h.modo === 'examen' ? 'Examen' : 'Simulacro oficial') + '</b><small>' + fecha(h.created_at) + ' · ' + (t.bien || 0) + ' bien, ' + (t.mal || 0) + ' mal, ' + (t.blanco || 0) + ' en blanco</small></span>' +
            '</button><button type="button" class="rk-mis-borrar" data-rk-borrar="' + h.id + '" aria-label="Eliminar este examen" title="Eliminar">' + PAPELERA + '</button></li>';
        }).join('') + '</ul>';
      bg.innerHTML = '<div class="ui-confirm rk-mis-caja" role="dialog" aria-modal="true" aria-label="Tus exámenes"><h3>Tus exámenes</h3>' + cuerpo +
        '<div class="ui-confirm-actions"><button type="button" class="ui-confirm-ok" data-rk-cerrar>Cerrar</button></div></div>';
    };
    const cargar = async () => {
      const { data, error } = await sb.from('historial_pruebas').select('id,modo,nota,resumen,created_at')
        .eq('user_id', yo()).in('modo', ['oficial', 'examen']).is('borrado_at', null).order('created_at', { ascending: false });
      if(error) throw error;
      lista = data || [];
      pintarLista();
    };
    pintarLista();
    bg.addEventListener('click', async e => {
      if(e.target === bg || e.target.closest('[data-rk-cerrar]')){ cerrar(); return; }
      const ver = e.target.closest('[data-rk-ver]');
      if(ver){ cerrar(); if(typeof PRU !== 'undefined') PRU.revisarHistorial(ver.dataset.rkVer); return; }
      const b = e.target.closest('[data-rk-borrar]');
      if(!b) return;
      const h = lista.find(x => x.id === b.dataset.rkBorrar);
      if(!(await uiConfirm('¿Eliminar el ' + (h.modo === 'examen' ? 'examen' : 'simulacro') + ' del ' + fecha(h.created_at) + ' (nota ' + num(h.nota) + ')?\n\nDeja de contar en el ranking. Si te equivocas, el administrador lo puede devolver.', { ok: 'Eliminar', danger: true }))) return;
      b.disabled = true;
      const { data, error } = await sb.rpc('borrar_examen', { p_id: h.id });
      if(error || !data){ b.disabled = false; uiToast('No se pudo eliminar' + (error ? ': ' + error.message : ''), 'error'); return; }
      lista = lista.filter(x => x.id !== h.id);
      pintarLista();
      uiToast('Examen eliminado', 'success');
      if(typeof PRU !== 'undefined' && PRU.olvidarDelHistorial) PRU.olvidarDelHistorial(h.id);
      abrir();
    });
    try{ await cargar(); }catch(e){ cerrar(); uiToast('No se pudieron cargar tus exámenes: ' + (e.message || e), 'error'); }
  }
  document.addEventListener('click', e => { if(e.target.closest('#statsRanking [data-rk-yo]')) misExamenes(); });
  document.addEventListener('keydown', e => { if(e.key === 'Enter' && e.target.closest && e.target.closest('#statsRanking [data-rk-yo]')) misExamenes(); });

  return { abrir, misExamenes };
})();
