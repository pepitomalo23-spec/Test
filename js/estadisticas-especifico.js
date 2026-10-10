/* Estadísticas › Específico: lo mismo que las de Legislación (dominio de
   preguntas, nota, ranking de temas) pero solo con las respuestas de los
   tests del Específico (tabla especifico_respuestas, las guarda
   js/especifico-test.js), sin mezclar. Las pestañas «Legislación /
   Específico» de la pantalla de Estadísticas cambian de una vista a otra;
   la de Específico solo sale a quien tiene el Específico. */
const ESTE = (function(){
  const PESTANA = 'pj_stats_pestana';
  let datos = null, cargando = null, sucio = true, fallo = '';
  const root = () => document.getElementById('statsEsp');
  const enPantalla = () => { const s = document.getElementById('screen-stats'); return !!(s && s.classList.contains('active')); };

  function pestana(){
    if(typeof featureEnabled === 'function' && !featureEnabled('especifico')) return 'legis';
    try{ return localStorage.getItem(PESTANA) === 'esp' ? 'esp' : 'legis'; }catch(e){ return 'legis'; }
  }
  function aplicarPestana(){
    const p = pestana();
    document.querySelectorAll('[data-stats-tab]').forEach(b => {
      const activa = b.dataset.statsTab === p;
      b.classList.toggle('active', activa);
      b.setAttribute('aria-selected', activa ? 'true' : 'false');
    });
    const legis = document.getElementById('statsLegis'), esp = root();
    if(legis) legis.classList.toggle('hidden', p !== 'legis');
    if(esp) esp.classList.toggle('hidden', p !== 'esp');
    if(p === 'esp' && enPantalla()) refrescar();
  }
  function elegir(p){
    try{ localStorage.setItem(PESTANA, p); }catch(e){}
    aplicarPestana();
  }

  /* ---------- datos ---------- */
  async function todas(consulta){   // por páginas: Supabase devuelve como mucho 1000 filas
    let out = [];
    for(let desde = 0; ; desde += 1000){
      const { data, error } = await consulta().range(desde, desde + 999);
      if(error) throw error;
      out = out.concat(data || []);
      if(!data || data.length < 1000) return out;
    }
  }
  async function cargar(){
    const yo = currentUser.id;
    const [rt, preguntas, respuestas] = await Promise.all([
      sb.from('especifico_tests').select('id,tema,titulo,orden'),
      todas(() => sb.from('especifico_preguntas').select('id,test_id').order('id')),
      todas(() => sb.from('especifico_respuestas').select('pregunta_id,acierto').eq('user_id', yo).order('id'))
    ]);
    if(rt.error) throw rt.error;
    // Estado de cada pregunta, con las mismas reglas que en Legislación:
    // verde = nunca fallada o ya 3 aciertos seguidos; amarilla = falló y lleva
    // 1 o 2 aciertos seguidos; roja = el último intento fue un fallo; sin ver = azul.
    const intentos = {};
    respuestas.forEach(r => { (intentos[r.pregunta_id] = intentos[r.pregunta_id] || []).push(r.acierto); });
    const estado = {};
    Object.keys(intentos).forEach(id => {
      const a = intentos[id];
      let racha = 0;
      for(let i = a.length - 1; i >= 0 && a[i]; i--) racha++;
      const fallos = a.filter(x => !x).length;
      estado[id] = (!fallos || racha >= 3) ? 'green' : racha >= 1 ? 'yellow' : 'red';
    });
    const existe = new Set(preguntas.map(p => p.id));
    datos = {
      tests: rt.data || [], preguntas, estado,
      nRespuestas: respuestas.filter(r => existe.has(r.pregunta_id)).length
    };
  }
  function refrescar(){
    if(!currentUser || !root()) return;
    if(!sucio && datos){ pintar(); return; }
    if(cargando) return;
    if(!datos) root().innerHTML = '<div class="ranking-empty">Cargando tus estadísticas del Específico…</div>';
    cargando = cargar()
      .then(() => { sucio = false; fallo = ''; })
      .catch(e => { fallo = e.message || String(e); })
      .finally(() => { cargando = null; if(pestana() === 'esp') pintar(); });
  }

  /* ---------- pintar ---------- */
  const colorPct = pct => pct >= 70 ? 'var(--green)' : (pct >= 40 ? 'var(--amber)' : 'var(--coral)');
  function filaRanking(i, nombre, sub, pct, valor, attrs, colorFijo){
    const color = colorFijo || colorPct(pct);
    return '<div class="ranking-row' + (attrs ? ' este-clic' : '') + '"' + (attrs || '') + '>' +
        '<div class="ranking-pos">' + (i + 1) + '</div>' +
        '<div class="ranking-body">' +
          '<div class="ranking-name">' + escapeHtml(nombre) + (sub ? ' <span class="este-sub">' + escapeHtml(sub) + '</span>' : '') + '</div>' +
          '<div class="ranking-track"><div class="ranking-fill" style="width:' + pct + '%; background:' + color + '"></div></div>' +
        '</div>' +
        '<div class="ranking-pct" style="color:' + color + '">' + valor + '</div>' +
      '</div>';
  }
  function pintar(){
    const r = root();
    if(!r) return;
    if(!datos){
      r.innerHTML = '<div class="ranking-empty">' + (fallo ? 'No se pudieron cargar tus estadísticas del Específico: ' + escapeHtml(fallo) : 'Cargando tus estadísticas del Específico…') + '</div>';
      return;
    }
    const { tests, preguntas, estado, nRespuestas } = datos;
    const total = preguntas.length;
    if(!total){ r.innerHTML = '<div class="ranking-empty">Todavía no hay preguntas en el Específico.</div>'; return; }
    const n = { green: 0, yellow: 0, red: 0 };
    preguntas.forEach(p => { const e = estado[p.id]; if(e) n[e]++; });
    const azul = total - n.green - n.yellow - n.red;
    const pct = x => x / total * 100;
    const leyenda = (clase, txt, v) => '<div class="mastery-legend-item"><span class="mastery-dot ' + clase + '"></span>' + txt +
      ' <span class="mastery-legend-value">' + v + '</span> <span class="mastery-legend-pct">(' + formatPctExact(pct(v)) + ')</span></div>';
    let html =
      '<div class="mastery-card">' +
        '<div class="mastery-head">' +
          '<div class="mastery-title-row"><div class="mastery-title">Dominio de preguntas</div>' +
            '<button type="button" class="mastery-info-btn" id="espMasteryInfoBtn" title="¿Qué significa cada color?" onclick="toggleInfoBox(\'espMasteryInfoBox\',\'espMasteryInfoBtn\')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8"/><line x1="12" y1="11" x2="12" y2="16"/><circle cx="12" cy="8" r="0.9" fill="currentColor" stroke="none"/></svg></button></div>' +
          '<div class="mastery-total"><span>' + total + '</span> preguntas del Específico</div>' +
        '</div>' +
        '<div class="mastery-info-box" id="espMasteryInfoBox">' +
          '<div><span>Solo cuentan tus respuestas en los tests del Específico y en Preguntas marcadas; las de Legislación van aparte. Los colores siguen las mismas reglas:</span></div>' +
          '<div><span class="mastery-dot mastery-green"></span><span><b>Aprobada:</b> nunca la has fallado, o ya llevas 3 aciertos seguidos.</span></div>' +
          '<div><span class="mastery-dot mastery-yellow"></span><span><b>En progreso:</b> la fallaste y llevas 1 o 2 aciertos seguidos.</span></div>' +
          '<div><span class="mastery-dot mastery-red"></span><span><b>Suspendida:</b> tu último intento fue un fallo.</span></div>' +
          '<div><span class="mastery-dot mastery-blue"></span><span><b>Sin ver:</b> todavía no la has respondido.</span></div>' +
        '</div>' +
        (nRespuestas ? '' : '<div class="este-nota">Aún no has respondido ninguna pregunta del Específico. Cuentan desde ahora: cada respuesta en sus tests y en Preguntas marcadas.</div>') +
        '<div class="mastery-donut-wrap"><svg class="mastery-donut" viewBox="0 0 220 125">' + masteryDonutSvg(n.green, n.yellow, n.red, azul) + '</svg>' +
          '<div class="mastery-donut-center"><span class="mastery-donut-pct">' + formatPctExact(pct(n.green)) + '</span><span class="mastery-donut-sublabel">dominadas</span></div></div>' +
        '<div class="mastery-legend">' +
          leyenda('mastery-green', 'Aprobadas', n.green) + leyenda('mastery-yellow', 'En progreso', n.yellow) +
          leyenda('mastery-red', 'Suspendidas', n.red) + leyenda('mastery-blue', 'Sin ver', azul) +
        '</div>' +
      '</div>' +
      '<div class="stats-grid">' +
        '<div class="stat-card"><div class="stat-label">Preguntas hechas</div><div class="stat-value purple">' + nRespuestas + '</div></div>' +
        '<div class="stat-card"><div class="stat-label">Preguntas totales</div><div class="stat-value coral">' + total + '</div></div>' +
        '<div class="stat-card"><div class="stat-label">Nota actual</div><div class="stat-value blue">' + formatNota(n.green / total * 10) + '</div>' +
          '<div class="stat-sub">Nivel general: <b>' + formatPctExact(pct(n.green)) + '</b></div></div>' +
      '</div>';

    if(typeof featureEnabled !== 'function' || featureEnabled('stats_avanzadas')){
      // Ranking de temas: % de preguntas dominadas de cada tema (las no hechas cuentan).
      const temaDe = {};
      tests.forEach(t => { temaDe[t.id] = t.tema; });
      const porTema = {};
      preguntas.forEach(p => {
        const k = temaDe[p.test_id];
        if(!k) return;
        const x = porTema[k] = porTema[k] || { total: 0, green: 0 };
        x.total++;
        if(estado[p.id] === 'green') x.green++;
      });
      const temas = ESP.temas().map((t, i) => porTema[t.clave] ? { nombre: (i + 1) + '. ' + t.titulo, pct: porTema[t.clave].green / porTema[t.clave].total * 100 } : null)
        .filter(Boolean).sort((a, b) => b.pct - a.pct);
      html += '<div class="ranking-card"><div class="ranking-head"><div class="ranking-title">Ranking de temas</div><div class="ranking-sub">De mejor a peor</div></div>' +
        '<div class="ranking-list">' + temas.map((t, i) => filaRanking(i, t.nombre, '', t.pct, formatPctExact(t.pct))).join('') + '</div></div>';

      // Tests con más preguntas suspendidas (rojas): se abren al pulsarlos.
      const rojas = {}, totales = {};
      preguntas.forEach(p => {
        totales[p.test_id] = (totales[p.test_id] || 0) + 1;
        if(estado[p.id] === 'red') rojas[p.test_id] = (rojas[p.test_id] || 0) + 1;
      });
      const peores = tests.filter(t => rojas[t.id]).sort((a, b) => rojas[b.id] - rojas[a.id] || rojas[b.id] / totales[b.id] - rojas[a.id] / totales[a.id]).slice(0, 8);
      const tituloTema = k => { const t = ESP.temas().find(x => x.clave === k); return t ? t.titulo : ''; };
      html += '<div class="ranking-card"><div class="ranking-head"><div class="ranking-title">Tests que más fallas</div><div class="ranking-sub">Pulsa uno para hacerlo</div></div>' +
        '<div class="ranking-list">' + (peores.length
          ? peores.map((t, i) => filaRanking(i, t.titulo,
              rojas[t.id] + ' de ' + totales[t.id] + (totales[t.id] === 1 ? ' suspendida' : ' suspendidas') + ' · ' + tituloTema(t.tema),
              rojas[t.id] / totales[t.id] * 100, String(rojas[t.id]),
              ' role="button" tabindex="0" data-este-test="' + t.id + '" title="' + rojas[t.id] + ' preguntas suspendidas"', 'var(--coral)')).join('')
          : '<div class="ranking-empty">No tienes ninguna pregunta suspendida en el Específico.</div>') +
        '</div></div>';
    }
    r.innerHTML = html;
  }

  function abrirTest(id){
    const t = datos && datos.tests.find(x => x.id === id);
    if(t && typeof ESPT !== 'undefined') ESPT.abrir(t);
  }
  function enganchar(){
    document.querySelectorAll('[data-stats-tab]').forEach(b => b.addEventListener('click', () => elegir(b.dataset.statsTab)));
    const r = root();
    if(!r) return;
    r.addEventListener('click', e => { const f = e.target.closest('[data-este-test]'); if(f) abrirTest(f.dataset.esteTest); });
    r.addEventListener('keydown', e => { const f = e.target.closest('[data-este-test]'); if(f && e.key === 'Enter') abrirTest(f.dataset.esteTest); });
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', enganchar); else enganchar();

  // Al entrar en Estadísticas, al cambiar los permisos y al guardar respuestas nuevas.
  function abrir(){ aplicarPestana(); }
  function invalidar(){
    sucio = true;
    if(enPantalla() && pestana() === 'esp') refrescar();
  }
  function reiniciar(){ datos = null; sucio = true; fallo = ''; }
  return { abrir, aplicarPestana, invalidar, reiniciar };
})();
