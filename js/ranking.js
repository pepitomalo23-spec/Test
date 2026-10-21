/* Mini ranking de Estadística: quién va ganando en los exámenes (Simulacro
   oficial y Examen). Quién sale y con qué nombre lo decide el administrador
   (tabla ranking_participantes, en Usuarios); las notas llegan de la función
   ranking_examenes. Se ordena por la nota media. */
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
        return '<li class="rk-fila' + (soy ? ' yo' : '') + (pos && pos <= 3 ? ' p' + pos : '') + '">' +
          '<span class="rk-pos">' + (pos || '–') + '</span>' +
          '<span class="rk-nombre"><b>' + escapeHtml(f.nombre) + (soy ? ' <i>tú</i>' : '') + '</b>' +
            '<small>' + (f.examenes > 0 ? 'Última ' + num(f.ultima) + ' · mejor ' + num(f.mejor) + ' · ' + f.examenes + (f.examenes === 1 ? ' examen' : ' exámenes') : 'Sin exámenes todavía') + '</small></span>' +
          '<span class="rk-nota' + (f.examenes > 0 ? (Number(f.media) >= 5 ? ' ok' : ' mal') : '') + '">' + num(f.media) + '</span>' +
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
  return { abrir };
})();
