/* Específico: temario de bombero. Cada tema se despliega y muestra sus
   tests (filas con el tick verde, tabla especifico_tests). Los tests los
   añade, ordena y quita el administrador desde su panel (js/admin/
   especifico.js); aquí solo se ven. Copia en el dispositivo para pintar al
   momento y sin conexión. */
const ESP = (function(){
  // [clave (no cambiarla: la usa la base de datos), título, icono (trazos SVG de 24×24)]
  const TEMAS = [
    ['fuego', 'Teoría del fuego. Explosiones. Conceptos de química', '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>'],
    ['extintores', 'Clasificación de incendios. Agentes extintores', '<path d="M7 16.3c2.2 0 4-1.83 4-4.05 0-1.16-.57-2.26-1.71-3.19S7.29 6.75 7 5.3c-.29 1.45-1.14 2.84-2.29 3.76S3 11.1 3 12.25c0 2.22 1.8 4.05 4 4.05z"/><path d="M12.56 6.6A10.97 10.97 0 0 0 14 3.02c.5 2.5 2 4.9 4 6.5s3 3.5 3 5.5a6.98 6.98 0 0 1-11.91 4.97"/>'],
    ['sistemas', 'Sistemas de extinción de incendios. Extintores, BIES, columnas secas. RIPCI', '<path d="M15 6.5V3a1 1 0 0 0-1-1h-2a1 1 0 0 0-1 1v3.5"/><path d="M9 18h8"/><path d="M18 3h-3"/><path d="M11 3a6 6 0 0 0-6 6v11"/><path d="M5 13h4"/><path d="M17 10a4 4 0 0 0-8 0v10a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2Z"/>'],
    ['utiles', 'Útiles de extinción de incendios. Herramientas', '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>'],
    ['epi', 'Equipos de protección individual. Equipos respiratorios. Rescate en altura', '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>'],
    ['vehiculos', 'Vehículos de los SPEIS. Normativa. Mecánica básica', '<path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9"/><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/>'],
    ['fisica', 'Física, conceptos básicos. Máquinas fundamentales', '<path d="M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z"/><path d="M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z"/><path d="M12 2v2"/><path d="M12 22v-2"/><path d="m17 20.66-1-1.73"/><path d="M11 10.27 7 3.34"/><path d="m20.66 17-1.73-1"/><path d="m3.34 7 1.73 1"/><path d="M14 12h8"/><path d="M2 12h2"/><path d="m20.66 7-1.73 1"/><path d="m3.34 17 1.73-1"/><path d="m17 3.34-1 1.73"/><path d="m11 13.73-4 6.93"/>'],
    ['hidraulica', 'Hidráulica y bombas', '<path d="M2 6c.6.5 1.2 1 2.5 1C7 7 7 5 9.5 5c2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/><path d="M2 12c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/><path d="M2 18c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/>'],
    ['gases', 'Gases', '<path d="M10 2v7.527a2 2 0 0 1-.211.896L4.72 20.55a1 1 0 0 0 .9 1.45h12.76a1 1 0 0 0 .9-1.45l-5.069-10.127A2 2 0 0 1 14 9.527V2"/><path d="M8.5 2h7"/><path d="M7 16h10"/>'],
    ['electricidad', 'Electricidad. Instalaciones', '<path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/>'],
    ['mercancias', 'Mercancías peligrosas', '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>'],
    ['radio', 'Radiotransmisiones', '<path d="M4.9 16.1C1 12.2 1 5.8 4.9 1.9"/><path d="M7.8 4.7a6.14 6.14 0 0 0-.8 7.5"/><circle cx="12" cy="9" r="2"/><path d="M16.2 4.8c2 2 2.26 5.11.8 7.47"/><path d="M19.1 1.9a9.96 9.96 0 0 1 0 14.1"/><path d="M9.5 18h5"/><path d="m8 22 4-11 4 11"/>'],
    ['socorrismo', 'Socorrismo y primeros auxilios', '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/><path d="M3.22 12H9.5l.5-1 2 4.5 2-7 1.5 3.5h5.27"/>'],
    ['forestales', 'Incendios forestales. Topografía básica y planos', '<path d="M10 10v.2A3 3 0 0 1 8.9 16H5a3 3 0 0 1-1-5.8V10a3 3 0 0 1 6 0Z"/><path d="M7 16v6"/><path d="M13 19v3"/><path d="M12 19h8.3a1 1 0 0 0 .7-1.7L18 14h.3a1 1 0 0 0 .7-1.7L16 9h.2a1 1 0 0 0 .8-1.7L13 3l-1.4 1.5"/>'],
    ['intervenciones', 'Intervenciones. Accidentes de tráfico. Ventilación', '<path d="m21 8-2 2-1.5-3.7A2 2 0 0 0 15.646 5H8.4a2 2 0 0 0-1.903 1.257L5 10 3 8"/><path d="M7 14h.01"/><path d="M17 14h.01"/><rect width="18" height="8" x="3" y="10" rx="2"/><path d="M5 18v2"/><path d="M19 18v2"/>'],
    ['construccion', 'Construcción. Apeos y apuntalamientos. Sismos', '<rect width="16" height="20" x="4" y="2" rx="2" ry="2"/><path d="M9 22v-4h6v4"/><path d="M8 6h.01"/><path d="M16 6h.01"/><path d="M12 6h.01"/><path d="M12 10h.01"/><path d="M12 14h.01"/><path d="M16 10h.01"/><path d="M16 14h.01"/><path d="M8 10h.01"/><path d="M8 14h.01"/>'],
    ['cte', 'Código Técnico de Edificación (CTE)', '<path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/><path d="M10 6h4"/><path d="M10 10h4"/><path d="M10 14h4"/><path d="M10 18h4"/>'],
    ['rseiei', 'RD 164/2025, Reglamento de Seguridad Contra Incendios en Establecimientos Industriales (actual)', '<path d="M2 20a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8l-7 5V8l-7 5V4a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"/><path d="M17 18h1"/><path d="M12 18h1"/><path d="M7 18h1"/>'],
    ['prl', 'Ley de Prevención de riesgos laborales', '<path d="M10 10V5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v5"/><path d="M14 6a6 6 0 0 1 6 6v3"/><path d="M4 15v-3a6 6 0 0 1 6-6"/><rect x="2" y="15" width="20" height="4" rx="1"/>'],
    ['ascensores', 'Ascensores', '<path d="m21 16-4 4-4-4"/><path d="M17 20V4"/><path d="m3 8 4-4 4 4"/><path d="M7 4v16"/>'],
    ['himenopteros', 'Intervenciones con himenópteros', '<path d="m8 2 1.88 1.88"/><path d="M14.12 3.88 16 2"/><path d="M9 7.13v-1a3.003 3.003 0 1 1 6 0v1"/><path d="M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6"/><path d="M12 20v-9"/><path d="M6.53 9C4.6 8.8 3 7.1 3 5"/><path d="M6 13H2"/><path d="M3 21c0-2.1 1.7-3.9 3.8-4"/><path d="M20.97 5c0 2.1-1.6 3.8-3.5 4"/><path d="M22 13h-4"/><path d="M17.2 17c2.1.1 3.8 1.9 3.8 4"/>']
  ];
  const CACHE = 'pj_especifico_tests_v1';
  const svg = d => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + d + '</svg>';
  const TICK = '<svg class="esp-tick" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="2.5" width="19" height="19" rx="1.5"/><path d="m7 12.5 3.5 3.5L17 8.5"/></svg>';
  let abierto = null, tests = [], cargando = null;
  try{ tests = JSON.parse(localStorage.getItem(CACHE) || '[]'); }catch(e){ tests = []; }
  const delTema = k => tests.filter(t => t.tema === k).sort((a, b) => a.orden - b.orden || String(a.created_at).localeCompare(String(b.created_at)));

  async function cargar(){
    if(cargando) return cargando;
    cargando = (async () => {
      const { data, error } = await sb.from('especifico_tests').select('id,tema,titulo,orden,created_at').order('tema').order('orden');
      if(error) throw error;
      tests = data || [];
      try{ localStorage.setItem(CACHE, JSON.stringify(tests)); }catch(e){}
    })().catch(e => console.warn('No se pudieron cargar los tests del específico', e))
      .finally(() => { cargando = null; pintar(); });
    return cargando;
  }

  function filaTest(t){
    return '<div class="esp-test" role="button" tabindex="0" data-test="' + t.id + '">' + TICK +
      '<span class="esp-test-txt"><span class="esp-test-tipo">Test - </span><b>' + escapeHtml(t.titulo) + '</b></span>' +
      '</div>';
  }
  function cuerpo(k){
    const lista = delTema(k);
    return '<div class="esp-cuerpo">' +
      (lista.length ? '<div class="esp-tests">' + lista.map(filaTest).join('') + '</div>'
        : '<div class="esp-vacio">' + (cargando ? 'Cargando…' : 'Todavía no hay tests en este tema.') + '</div>') +
      '</div>';
  }
  function pintar(){
    const root = document.getElementById('espRoot');
    if(!root) return;
    root.innerHTML = '<ul class="esp-lista">' + TEMAS.map(([k, t, i]) => {
      return '<li class="esp-tema' + (k === abierto ? ' abierto' : '') + '">' +
        '<button type="button" class="esp-cab" data-tema="' + k + '" aria-expanded="' + (k === abierto) + '">' +
          '<span class="esp-caja" aria-hidden="true"></span>' +
          '<span class="esp-ico">' + svg(i) + '</span>' +
          '<span class="esp-titulo">' + escapeHtml(t) + '</span>' +
        '</button>' +
        (k === abierto ? cuerpo(k) : '') +
      '</li>';
    }).join('') + '</ul>';
  }

  function abrir(){
    const root = document.getElementById('espRoot');
    if(root && !root.dataset.listo){
      root.dataset.listo = '1';
      root.addEventListener('click', e => {
        if(e.target.closest('[data-test]')){ uiToast('Los tests llegarán muy pronto.', 'info'); return; }
        const cab = e.target.closest('.esp-cab');
        if(!cab) return;
        abierto = abierto === cab.dataset.tema ? null : cab.dataset.tema;
        pintar();
      });
      root.addEventListener('keydown', e => {
        if(e.key === 'Enter' && e.target.dataset && e.target.dataset.test) uiToast('Los tests llegarán muy pronto.', 'info');
      });
    }
    pintar();
    cargar();
  }
  return { abrir, temas: () => TEMAS.map(([k, t]) => ({ clave: k, titulo: t })) };
})();
