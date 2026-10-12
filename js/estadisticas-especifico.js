/* Estadísticas › Específico: lo mismo que las de Legislación (dominio de
   preguntas, nota, ranking de temas; además, la evolución semanal y los temas
   de peor a mejor por % de acierto, con sus tests) pero solo con las respuestas de los
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
  async function cargar(){
    const yo = currentUser.id;
    const [rt, preguntas, respuestas] = await Promise.all([
      sb.from('especifico_tests').select('id,tema,titulo,orden'),
      supabaseTodas(o => sb.from('especifico_preguntas').select('id,test_id', o).order('id')),
      supabaseTodas(o => sb.from('especifico_respuestas').select('pregunta_id,acierto,created_at', o).eq('user_id', yo).order('id'))
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
      nRespuestas: respuestas.filter(r => existe.has(r.pregunta_id)).length,
      respuestas: respuestas.filter(r => existe.has(r.pregunta_id))
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

  /* ---------- evolución semanal y temas por % de acierto ---------- */
  const abiertos = new Set();   // temas desplegados en «Tus temas»
  const SEMANAS = 8;
  const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const lunes = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - (x.getDay() + 6) % 7); return x; };
  const pctTxt = v => Math.round(v) + ' %';
  // Las últimas semanas (de lunes a domingo): cuántas respondiste y qué % acertaste.
  function evolucion(respuestas){
    const hoyL = lunes(new Date());
    const sem = Array.from({ length: SEMANAS }, (_, i) => { const d = new Date(hoyL); d.setDate(d.getDate() - (SEMANAS - 1 - i) * 7); return { d, n: 0, ok: 0 }; });
    const ini = sem[0].d.getTime();
    respuestas.forEach(r => {
      if(!r.created_at) return;
      const t = new Date(r.created_at).getTime();
      if(t < ini) return;
      const k = Math.min(SEMANAS - 1, Math.floor((lunes(t) - ini) / (7 * 864e5) + 0.5));
      sem[k].n++; if(r.acierto) sem[k].ok++;
    });
    const max = Math.max(1, ...sem.map(x => x.n));
    const ya = sem[SEMANAS - 1], antes = sem[SEMANAS - 2];
    const p = x => x.n ? x.ok / x.n * 100 : 0;
    let sub = ya.n ? 'Esta semana: <b>' + ya.n + '</b> ' + (ya.n === 1 ? 'pregunta' : 'preguntas') + ' · <b>' + pctTxt(p(ya)) + '</b> de acierto' : 'Esta semana aún no has respondido ninguna.';
    if(ya.n && antes.n){
      const dif = Math.round(p(ya) - p(antes));
      sub += dif ? ' <span class="este-dif ' + (dif > 0 ? 'sube' : 'baja') + '">' + (dif > 0 ? '▲ ' : '▼ ') + Math.abs(dif) + ' pts</span>' : ' <span class="este-dif">= que la anterior</span>';
    }
    return '<div class="ranking-card"><div class="ranking-head"><div class="ranking-title">Evolución semanal</div><div class="ranking-sub">Últimas ' + SEMANAS + ' semanas</div></div>' +
      '<div class="este-evo-sub">' + sub + '</div>' +
      '<div class="este-evo">' + sem.map((x, i) => {
        const h = x.n ? Math.max(8, Math.round(x.n / max * 100)) : 0;
        return '<div class="este-evo-col' + (i === SEMANAS - 1 ? ' actual' : '') + '" title="' + x.n + ' preguntas · ' + pctTxt(p(x)) + ' de acierto">' +
          '<span class="este-evo-pct" style="color:' + (x.n ? colorPct(p(x)) : 'var(--muted)') + '">' + (x.n ? pctTxt(p(x)) : '–') + '</span>' +
          '<span class="este-evo-barra"><i style="height:' + h + '%; background:' + (x.n ? colorPct(p(x)) : 'transparent') + '"></i></span>' +
          '<span class="este-evo-n">' + x.n + '</span>' +
          '<span class="este-evo-f">' + x.d.getDate() + ' ' + MES[x.d.getMonth()] + '</span></div>';
      }).join('') + '</div>' +
      '<div class="este-evo-ley">Altura: preguntas respondidas · Número de arriba: % de acierto</div></div>';
  }
  // Por tema, de peor a mejor según el % de acierto de todo lo que has respondido; al tocarlo, sus tests.
  function temasAcierto(tests, preguntas, respuestas){
    const testDe = {}, temaDe = {}, totalTest = {};
    preguntas.forEach(p => { testDe[p.id] = p.test_id; totalTest[p.test_id] = (totalTest[p.test_id] || 0) + 1; });
    tests.forEach(t => { temaDe[t.id] = t.tema; });
    const porTest = {}, porTema = {};
    const sumar = (o, k, r) => { const x = o[k] = o[k] || { n: 0, ok: 0, vistas: new Set(), rec: { n: 0, ok: 0 } }; x.n++; if(r.acierto) x.ok++; x.vistas.add(r.pregunta_id);
      if(r.created_at && Date.now() - new Date(r.created_at).getTime() < 14 * 864e5){ x.rec.n++; if(r.acierto) x.rec.ok++; } };
    respuestas.forEach(r => { const t = testDe[r.pregunta_id], k = temaDe[t]; if(!t || !k) return; sumar(porTest, t, r); sumar(porTema, k, r); });
    const totalTema = {};
    preguntas.forEach(p => { const k = temaDe[p.test_id]; if(k) totalTema[k] = (totalTema[k] || 0) + 1; });
    const lista = ESP.temas().map((t, i) => porTema[t.clave] ? Object.assign({ clave: t.clave, nombre: (i + 1) + '. ' + t.titulo, total: totalTema[t.clave] || 0 }, porTema[t.clave]) : null)
      .filter(Boolean).sort((a, b) => a.ok / a.n - b.ok / b.n);
    const sinEmpezar = ESP.temas().map((t, i) => totalTema[t.clave] && !porTema[t.clave] ? (i + 1) + '. ' + t.titulo : null).filter(Boolean);
    if(!lista.length) return '';
    const fila = (x, extra) => {
      const p = x.ok / x.n * 100, color = colorPct(p);
      const rec = x.rec.n >= 5 ? ' · últimos 14 días: ' + pctTxt(x.rec.ok / x.rec.n * 100) : '';
      return '<div class="ranking-body">' +
          '<div class="ranking-name">' + escapeHtml(x.nombre) + ' <span class="este-sub">' + x.n + ' respuestas · ' + x.vistas.size + ' de ' + x.total + ' vistas' + rec + '</span></div>' +
          '<div class="ranking-track"><div class="ranking-fill" style="width:' + p + '%; background:' + color + '"></div></div></div>' +
        '<div class="ranking-pct" style="color:' + color + '">' + pctTxt(p) + '</div>' + (extra || '');
    };
    return '<div class="ranking-card"><div class="ranking-head"><div class="ranking-title">Tus temas, de peor a mejor</div><div class="ranking-sub">% de acierto · toca uno para ver sus tests</div></div>' +
      '<div class="ranking-list este-temas">' + lista.map((x, i) => {
        const abierto = abiertos.has(x.clave);
        const sus = tests.filter(t => t.tema === x.clave && porTest[t.id]).map(t => Object.assign({ id: t.id, nombre: t.titulo, total: totalTest[t.id] || 0 }, porTest[t.id]))
          .sort((a, b) => a.ok / a.n - b.ok / b.n);
        return '<div class="ranking-row este-clic este-tema' + (abierto ? ' abierto' : '') + '" role="button" tabindex="0" aria-expanded="' + abierto + '" data-este-tema="' + escapeHtml(x.clave) + '">' +
            '<div class="ranking-pos">' + (i + 1) + '</div>' + fila(x, '<span class="este-chev" aria-hidden="true">›</span>') + '</div>' +
          (abierto ? '<div class="este-tests">' + sus.map(t => '<div class="ranking-row este-clic" role="button" tabindex="0" data-este-test="' + t.id + '">' + fila(t) + '</div>').join('') + '</div>' : '');
      }).join('') + '</div>' +
      (sinEmpezar.length ? '<div class="este-sin">Sin empezar: ' + escapeHtml(sinEmpezar.join(' · ')) + '</div>' : '') + '</div>';
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
      if(datos.respuestas.length) html += evolucion(datos.respuestas) + temasAcierto(tests, preguntas, datos.respuestas);
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
      html += '<div class="ranking-card"><div class="ranking-head"><div class="ranking-title">Ranking de temas</div><div class="ranking-sub">% dominadas, de mejor a peor</div></div>' +
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
    const tema = k => { if(abiertos.has(k)) abiertos.delete(k); else abiertos.add(k); pintar(); };
    r.addEventListener('click', e => { const f = e.target.closest('[data-este-test]'); if(f) return abrirTest(f.dataset.esteTest); const t = e.target.closest('[data-este-tema]'); if(t) tema(t.dataset.esteTema); });
    r.addEventListener('keydown', e => { if(e.key !== 'Enter') return; const f = e.target.closest('[data-este-test]'); if(f) return abrirTest(f.dataset.esteTest); const t = e.target.closest('[data-este-tema]'); if(t) tema(t.dataset.esteTema); });
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', enganchar); else enganchar();

  // Al entrar en Estadísticas, al cambiar los permisos y al guardar respuestas nuevas.
  function abrir(){ aplicarPestana(); }
  function invalidar(){
    sucio = true; ultimoIntento = 0;
    if(enPantalla() && pestana() === 'esp') refrescar();
  }
  function reiniciar(){ datos = null; sucio = true; fallo = ''; ultimoIntento = 0; }
  // Para «Tu progreso» de Inicio: cuántas dominadas, en progreso, suspendidas
  // y vistas. Si aún no se ha cargado, lo carga por detrás y repinta Inicio.
  let ultimoIntento = 0;
  function resumen(){
    if(!currentUser) return null;
    if((sucio || !datos) && !cargando && Date.now() - ultimoIntento > 60000){
      ultimoIntento = Date.now();   // si falla, no se reintenta en bucle
      cargando = cargar()
        .then(() => { sucio = false; fallo = ''; })
        .catch(e => { fallo = e.message || String(e); })
        .finally(() => {
          cargando = null;
          if(enPantalla() && pestana() === 'esp') pintar();
          if(typeof INICIO !== 'undefined') INICIO.pintar();
        });
    }
    if(!datos) return null;
    const n = { green: 0, yellow: 0, red: 0 };
    datos.preguntas.forEach(p => { const e = datos.estado[p.id]; if(e) n[e]++; });
    return { total: datos.preguntas.length, verde: n.green, amarillo: n.yellow, rojo: n.red, vistas: n.green + n.yellow + n.red };
  }
  return { abrir, aplicarPestana, invalidar, reiniciar, resumen };
})();
