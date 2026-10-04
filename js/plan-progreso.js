/* ============================================================
   PLANP · Progreso del Plan de estudio
   Cifras y gráficos SOLO con datos reales: lo que se ha apuntado o
   confirmado. Abrir un test no cuenta como hecho, y no se inventa nada:
   si algo no se puede calcular, se dice.
   - Tarjetas: plan cumplido, tests hechos y pendientes, nota media,
     % de aciertos y tiempo registrado (medido por la app / apuntado).
   - Gráficos SVG hechos a mano (sin librerías), con colores del tema:
     evolución de la nota, previsto frente a hecho por día y % de
     aciertos por tema.
   - Temas a reforzar (con «Proponer repaso») e historial por día o semana.
   ============================================================ */
const PLANP = (function(){
  'use strict';

  let periodo = '30';          // '7' | '30' | 'todo'
  let agrupar = 'dia';         // 'dia' | 'semana'
  const COLOR_FUENTE = { manual: 'var(--orange)', pjfire: 'var(--purple)', examen: 'var(--blue)' };
  const NOMBRE_FUENTE = { manual: 'Apuntado a mano', pjfire: 'Test de pj.fire', examen: 'Examen del plan' };

  function D(){ return PLAN.datos(); }
  function plural(n, a, b){ return n + ' ' + (n === 1 ? a : b); }
  function idAttr(x){ return /^[0-9a-f-]{36}$/i.test(String(x || '')) ? x : ''; }
  function desdeDe(h){ return periodo === '7' ? PLANL.sumarDias(h, -6) : periodo === '30' ? PLANL.sumarDias(h, -29) : null; }
  function diaDe(r){ const ms = Date.parse(r.realizado_at || r.created_at); return isNaN(ms) ? null : PLANL.hoy(new Date(ms)); }
  function enPeriodo(r, desde, h){ const dd = diaDe(r); return dd && (!desde || dd >= desde) && dd <= h; }
  function duracion(seg){
    seg = Math.round(seg || 0);
    if(seg < 60) return seg ? seg + ' s' : '0 min';
    const min = Math.round(seg / 60);
    if(min < 60) return min + ' min';
    const h = Math.floor(min / 60), m = min % 60;
    return h + ' h' + (m ? ' ' + m + ' min' : '');
  }
  function pct1(x){ return x == null ? '—' : (Math.round(x * 10) / 10).toString().replace('.', ',') + ' %'; }
  // Aciertos y preguntas de un resultado (null si no tiene recuento).
  function recuento(r){
    if(r.aciertos == null) return null;
    const a = Number(r.aciertos) || 0, f = Number(r.fallos) || 0, b = Number(r.blancos) || 0;
    const n = Math.max(Number(r.total) || 0, a + f + b);
    return n > 0 ? { a, n } : null;
  }

  function render(el){
    if(!el) return;
    const d = D();
    const h = PLAN.hoy();
    const desde = desdeDe(h);
    const aj = PLANL.ajustesDe(d.ajustes);
    const res = d.resultados.filter(r => enPeriodo(r, desde, h));
    let html = '<div class="plp-cab"><div class="pl-chips" role="radiogroup" aria-label="Periodo">' +
      [['7', '7 días'], ['30', '30 días'], ['todo', 'Todo']].map(p => '<button type="button" role="radio" aria-checked="' + (periodo === p[0]) + '" class="pl-chip' + (periodo === p[0] ? ' on' : '') + '" onclick="PLANP.periodo(\'' + p[0] + '\')">' + p[1] + '</button>').join('') +
      '</div></div>';
    if(!d.tareas.length && !d.resultados.length){
      el.innerHTML = html + '<div class="pl-vacio"><p>Aún no hay datos. Cuando planifiques tests y apuntes sus resultados, aquí verás tu progreso.</p>' +
        '<p class="pl-suave">Solo cuenta lo que has registrado o confirmado. Abrir un test no cuenta como hecho.</p></div>';
      return;
    }

    // ---------- tarjetas ----------
    const cum = PLANL.cumplimiento({ tareas: d.tareas, desde, hasta: h, hoy: h });
    const sinNota = d.tareas.filter(t => t.estado === 'completado' && !t.resultado_id && !d.resultados.some(r => r.tarea_id === t.id) && t.completada_at && enPeriodo({ realizado_at: t.completada_at }, desde, h)).length;
    const hechos = res.length + sinNota;
    const abiertasHastaHoy = d.tareas.filter(t => PLANL.abierta(t) && t.fecha <= h).length;
    const conTarea = new Set(d.tareas.filter(t => t.estado === 'completado' || PLANL.abierta(t)).map(t => t.test_id));
    d.resultados.forEach(r => { if(r.test_id) conTarea.add(r.test_id); });
    const nuncaHechos = d.tests.filter(t => !t.archivado && !conTarea.has(t.id)).length;
    const notas = res.map(r => r.nota).filter(n => n != null).map(Number);
    const notaMedia = notas.length ? notas.reduce((a, b) => a + b, 0) / notas.length : null;
    let sa = 0, sn = 0;
    res.forEach(r => { const c = recuento(r); if(c){ sa += c.a; sn += c.n; } });
    const t = PLANL.tiempo(d.resultados, desde);
    html += '<div class="plp-kpis">' +
      kpi('Plan cumplido', cum.pct == null ? '—' : Math.round(cum.pct) + ' %', cum.previstas ? cum.completadas + ' de ' + plural(cum.previstas, 'tarea prevista', 'tareas previstas') + (desde ? '' : ' en total') : 'Sin tareas previstas en este periodo', 'green') +
      kpi('Tests hechos', String(hechos), plural(abiertasHastaHoy, 'tarea pendiente', 'tareas pendientes') + ' hasta hoy · ' + plural(nuncaHechos, 'test nunca hecho', 'tests nunca hechos'), 'purple') +
      kpi('Nota media', notaMedia == null ? '—' : formatNota(notaMedia), notas.length ? 'De ' + plural(notas.length, 'resultado', 'resultados') + ' con nota' : 'Sin notas en este periodo', 'blue') +
      kpi('Aciertos', sn ? pct1(sa / sn * 100) : '—', sn ? sa + ' de ' + plural(sn, 'pregunta', 'preguntas') : 'Sin resultados con aciertos y fallos', 'teal') +
      kpi('Tiempo registrado', duracion(t.medido_seg + t.apuntado_seg), 'Medido por la app: ' + duracion(t.medido_seg) + ' · apuntado por ti: ' + duracion(t.apuntado_seg), 'amber') +
      '</div><p class="pl-pie">El tiempo «medido» es el de los tests de pj.fire y los exámenes del plan. El de Tutor Bombero no se puede medir: solo cuenta si lo apuntas tú.</p>';

    // ---------- evolución ----------
    const serie = PLANL.serie(d.resultados, desde).filter(p => p.nota != null).slice(-60);
    html += '<section class="pl-card"><h2 class="pl-seccion">Evolución de la nota</h2>' +
      (serie.length ? graficoEvolucion(serie) + leyendaFuentes(serie) : '<p class="pl-suave">Aún no hay resultados con nota en este periodo.</p>') + '</section>';

    // ---------- previsto frente a hecho ----------
    const nDias = periodo === '7' ? 7 : 30;
    const cumDias = PLANL.cumplimiento({ tareas: d.tareas, desde: PLANL.sumarDias(h, -(nDias - 1)), hasta: h, hoy: h });
    html += '<section class="pl-card"><h2 class="pl-seccion">Previsto y hecho por día</h2>' +
      (cumDias.previstas ? graficoPrevisto(cumDias.porDia, aj.limite_diario, h) +
        '<div class="plp-leyenda"><span><i style="background:var(--w14)"></i>Previstas</span><span><i style="background:var(--green)"></i>Hechas</span></div>'
        : '<p class="pl-suave">No había tareas previstas en los últimos ' + nDias + ' días.</p>') + '</section>';

    // ---------- por tema ----------
    const stats = PLANL.statsTemas({ temas: d.temas, tests: d.tests, resultados: res, mapaTopicTema: PLAN.mapaTopicTema() });
    const umbral = aj.reglas.umbral_repaso;
    const filas = PLAN.temasOrdenados(false).map(tm => ({ tema: tm, s: stats[tm.id] })).filter(x => x.s && x.s.respondidas > 0);
    const sinDatos = PLAN.temasOrdenados(false).filter(tm => !stats[tm.id] || !stats[tm.id].respondidas);
    html += '<section class="pl-card"><h2 class="pl-seccion">Aciertos por tema</h2>' +
      (filas.length ? '<div class="plp-temas">' + filas.sort((a, b) => a.s.pct - b.s.pct).map(x => barraTema(x.tema, x.s, umbral)).join('') + '</div>' +
        '<p class="pl-pie">La raya marca tu umbral de repaso (' + umbral + ' %). Los tests de Tutor Bombero cuentan para el tema del test; los exámenes y tests de pj.fire, pregunta a pregunta.</p>'
        : '<p class="pl-suave">Aún no hay resultados con aciertos y fallos para tus temas en este periodo.</p>') +
      (sinDatos.length && filas.length ? '<details class="plp-sin"><summary>' + plural(sinDatos.length, 'tema sin datos', 'temas sin datos') + '</summary><p class="pl-suave">' + sinDatos.map(x => esc(PLAN.nombreTema(x.id))).join(' · ') + '</p></details>' : '') +
      '</section>';

    // ---------- a reforzar ----------
    const flojos = PLANL.temasAReforzar(stats, umbral);
    html += '<section class="pl-card"><h2 class="pl-seccion">Temas a reforzar</h2>' +
      (flojos.length ? flojos.map(f => {
        const tm = PLAN.temaDe(f.tema_id);
        return '<div class="pl-fila"><div class="pl-fila-txt"><b>' + esc(PLAN.nombreTema(f.tema_id)) + '</b><span>' + pct1(f.pct) + ' de aciertos en ' + plural(f.respondidas, 'pregunta', 'preguntas') + '</span></div>' +
          (tm ? '<button type="button" class="btn btn-ghost" onclick="PLANP.proponerRepaso(\'' + idAttr(tm.id) + '\')">Proponer repaso</button>' : '') + '</div>';
      }).join('') : '<p class="pl-suave">' + (filas.length ? 'Ningún tema baja del ' + umbral + ' % (con al menos 10 preguntas). ¡Bien!' : 'Hacen falta resultados para saberlo.') + '</p>') + '</section>';

    // ---------- historial ----------
    const grupos = PLANL.historial({ tareas: d.tareas, resultados: d.resultados, eventos: d.eventos, desde, hasta: h, agrupar }).slice(0, 40);
    html += '<section class="pl-card"><div class="plp-hist-cab"><h2 class="pl-seccion">Historial</h2><div class="pl-segmento" role="tablist" aria-label="Agrupar">' +
      '<button type="button" role="tab" aria-selected="' + (agrupar === 'dia') + '" class="' + (agrupar === 'dia' ? 'on' : '') + '" onclick="PLANP.agrupar(\'dia\')">Por día</button>' +
      '<button type="button" role="tab" aria-selected="' + (agrupar === 'semana') + '" class="' + (agrupar === 'semana' ? 'on' : '') + '" onclick="PLANP.agrupar(\'semana\')">Por semana</button></div></div>' +
      (grupos.length ? grupos.map(g => grupoHistorial(g, h)).join('') : '<p class="pl-suave">Sin actividad en este periodo.</p>') + '</section>' +
      '<p class="pl-nota-honesta">Solo cuenta lo que has registrado o confirmado. Abrir un test no cuenta como hecho.</p>';
    el.innerHTML = html;
  }

  function kpi(etiqueta, valor, sub, color){
    return '<div class="plp-kpi"><div class="plp-kpi-et">' + esc(etiqueta) + '</div><div class="plp-kpi-val" style="color:var(--' + color + ')">' + esc(valor) + '</div><div class="plp-kpi-sub">' + esc(sub) + '</div></div>';
  }

  /* ---------- gráficos ---------- */
  function graficoEvolucion(serie){
    const W = 640, H = 230, L = 34, R = 12, T = 12, B = 30;
    const w = W - L - R, hh = H - T - B;
    const n = serie.length;
    const x = i => L + (n === 1 ? w / 2 : i / (n - 1) * w);
    const y = v => T + (10 - Math.max(0, Math.min(10, v))) / 10 * hh;
    let s = '';
    [0, 5, 10].forEach(v => {
      s += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(v) + '" y2="' + y(v) + '" style="stroke:var(--line)" stroke-dasharray="' + (v === 5 ? '4 4' : '') + '"/>' +
        '<text x="' + (L - 8) + '" y="' + (y(v) + 4) + '" text-anchor="end" class="plp-eje">' + v + '</text>';
    });
    if(n > 1) s += '<polyline fill="none" style="stroke:var(--purple)" stroke-width="2" stroke-linejoin="round" points="' + serie.map((p, i) => x(i).toFixed(1) + ',' + y(p.nota).toFixed(1)).join(' ') + '"/>';
    // Media móvil de 5
    if(n >= 5){
      const mm = serie.map((p, i) => {
        const v = serie.slice(Math.max(0, i - 4), i + 1).map(q => q.nota);
        return v.reduce((a, b) => a + b, 0) / v.length;
      });
      s += '<polyline fill="none" style="stroke:var(--muted)" stroke-width="2" stroke-dasharray="5 4" points="' + mm.map((v, i) => x(i).toFixed(1) + ',' + y(v).toFixed(1)).join(' ') + '"/>';
    }
    serie.forEach((p, i) => {
      s += '<circle cx="' + x(i).toFixed(1) + '" cy="' + y(p.nota).toFixed(1) + '" r="' + (n > 30 ? 3 : 4.5) + '" style="fill:' + (COLOR_FUENTE[p.fuente] || 'var(--teal)') + ';stroke:var(--card)" stroke-width="1.5"><title>' +
        esc(PLANL.fechaCorta(p.dia) + ' · ' + (p.titulo || NOMBRE_FUENTE[p.fuente] || '') + ' · nota ' + formatNota(p.nota)) + '</title></circle>';
    });
    s += '<text x="' + L + '" y="' + (H - 8) + '" class="plp-eje">' + esc(PLANL.fechaCorta(serie[0].dia)) + '</text>';
    if(n > 1) s += '<text x="' + (W - R) + '" y="' + (H - 8) + '" text-anchor="end" class="plp-eje">' + esc(PLANL.fechaCorta(serie[n - 1].dia)) + '</text>';
    const media = serie.reduce((a, p) => a + p.nota, 0) / n;
    const etiqueta = n + ' resultados con nota. Primera ' + formatNota(serie[0].nota) + ', última ' + formatNota(serie[n - 1].nota) + ', media ' + formatNota(media) + '.';
    return '<svg class="plp-svg" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(etiqueta) + '">' + s + '</svg>' +
      '<p class="pl-pie">' + esc(etiqueta) + (n >= 5 ? ' La línea discontinua es la media de los 5 últimos.' : '') + '</p>';
  }
  function leyendaFuentes(serie){
    const f = [...new Set(serie.map(p => p.fuente))];
    return '<div class="plp-leyenda">' + f.map(x => '<span><i style="background:' + (COLOR_FUENTE[x] || 'var(--teal)') + '"></i>' + esc(NOMBRE_FUENTE[x] || x) + '</span>').join('') + '</div>';
  }
  function graficoPrevisto(porDia, limite, h){
    const W = 640, H = 200, L = 26, R = 8, T = 10, B = 28;
    const w = W - L - R, hh = H - T - B;
    const n = porDia.length;
    const max = Math.max(limite, 1, ...porDia.map(p => p.previstas));
    const paso = w / n, ancho = Math.max(3, paso * 0.62);
    const y = v => T + hh - v / max * hh;
    let s = '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(limite) + '" y2="' + y(limite) + '" style="stroke:var(--amber)" stroke-dasharray="4 4"/>' +
      '<text x="' + (L - 6) + '" y="' + (y(limite) + 4) + '" text-anchor="end" class="plp-eje">' + limite + '</text>' +
      '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(0) + '" y2="' + y(0) + '" style="stroke:var(--line)"/>';
    let previstas = 0, hechas = 0;
    porDia.forEach((p, i) => {
      previstas += p.previstas; hechas += p.completadas;
      const cx = L + paso * i + (paso - ancho) / 2;
      if(p.previstas) s += '<rect x="' + cx.toFixed(1) + '" y="' + y(p.previstas).toFixed(1) + '" width="' + ancho.toFixed(1) + '" height="' + (y(0) - y(p.previstas)).toFixed(1) + '" rx="3" style="fill:var(--w14)"><title>' + esc(PLANL.fechaCorta(p.dia) + ': ' + p.completadas + ' de ' + p.previstas) + '</title></rect>';
      if(p.completadas) s += '<rect x="' + cx.toFixed(1) + '" y="' + y(p.completadas).toFixed(1) + '" width="' + ancho.toFixed(1) + '" height="' + (y(0) - y(p.completadas)).toFixed(1) + '" rx="3" style="fill:var(--green)"/>';
      const etiqueta = n <= 14 || i % 5 === 0 || p.dia === h;
      if(etiqueta) s += '<text x="' + (L + paso * i + paso / 2).toFixed(1) + '" y="' + (H - 9) + '" text-anchor="middle" class="plp-eje' + (p.dia === h ? ' hoy' : '') + '">' +
        (n <= 7 ? esc(PLANL.nombreDia(p.dia).slice(0, 3)) : Number(p.dia.slice(8, 10))) + '</text>';
    });
    const et = 'Últimos ' + n + ' días: ' + hechas + ' de ' + previstas + ' tareas previstas hechas. La raya es tu límite diario (' + limite + ').';
    return '<svg class="plp-svg" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(et) + '">' + s + '</svg><p class="pl-pie">' + esc(et) + '</p>';
  }
  function barraTema(tema, s, umbral){
    const p = Math.max(0, Math.min(100, s.pct));
    const color = p >= 70 ? 'var(--green)' : p >= umbral ? 'var(--amber)' : 'var(--coral)';
    return '<div class="plp-tema"><div class="plp-tema-cab"><span>' + esc(PLAN.nombreTema(tema.id)) + '</span><b style="color:' + color + '">' + pct1(s.pct) + '</b></div>' +
      '<div class="plp-pista" role="img" aria-label="' + esc(PLAN.nombreTema(tema.id) + ': ' + pct1(s.pct) + ' de aciertos en ' + s.respondidas + ' preguntas') + '">' +
      '<div class="plp-relleno" style="width:' + p.toFixed(1) + '%;background:' + color + '"></div><div class="plp-umbral" style="left:' + umbral + '%"></div></div>' +
      '<div class="plp-tema-sub">' + plural(s.respondidas, 'pregunta', 'preguntas') + ' · ' + plural(s.resultados, 'resultado', 'resultados') + (s.notaMedia != null ? ' · nota media ' + formatNota(s.notaMedia) : '') + '</div></div>';
  }
  function grupoHistorial(g, h){
    const titulo = agrupar === 'semana' ? 'Semana del ' + PLANL.fechaCorta(g.clave).replace(/^\S+ /, '') : (g.clave === h ? 'Hoy' : PLANL.fechaLarga(g.clave));
    const partes = [];
    if(g.previstas) partes.push(g.completadas + ' de ' + plural(g.previstas, 'prevista', 'previstas') + ' hechas');
    if(g.abiertos) partes.push(plural(g.abiertos, 'test abierto', 'tests abiertos'));
    if(g.excepciones) partes.push(plural(g.excepciones, 'excepción', 'excepciones'));
    const d = D();
    return '<div class="plp-grupo"><div class="plp-grupo-cab"><b>' + esc(titulo.charAt(0).toUpperCase() + titulo.slice(1)) + '</b><span>' + esc(partes.join(' · ')) + '</span></div>' +
      (g.resultados.length ? '<ul class="plp-res">' + g.resultados.slice().reverse().map(r => {
        const test = r.test_id ? d.tests.find(x => x.id === r.test_id) : null;
        const nombre = r.titulo || (test ? test.nombre : 'Test');
        return '<li><span>' + esc(nombre) + ' <small class="pl-suave">' + esc(NOMBRE_FUENTE[r.fuente] || '') + '</small></span><b>' + (r.nota != null ? formatNota(r.nota) : '—') + '</b></li>';
      }).join('') + '</ul>' : '') + '</div>';
  }

  /* ---------- acciones ---------- */
  function cambiarPeriodo(p){ periodo = ['7', '30', 'todo'].includes(p) ? p : '30'; PLAN.repintar(); }
  function cambiarAgrupar(a){ agrupar = a === 'semana' ? 'semana' : 'dia'; PLAN.repintar(); }
  // Repaso de un tema flojo: su test hecho con peor nota, o un test de fallos de pj.fire.
  function proponerRepaso(temaId){
    const d = D();
    const h = PLAN.hoy();
    const aj = PLANL.ajustesDe(d.ajustes);
    const rep = PLANL.proponerRepasos({ temas: d.temas, tests: d.tests, tareas: d.tareas, resultados: d.resultados, hoy: h, ajustes: aj, mapaTopicTema: PLAN.mapaTopicTema() })
      .find(r => r.tema_id === temaId);
    const tema = PLAN.temaDe(temaId);
    if(rep && rep.test_id){
      let dia = h;
      for(let i = 0; i < 21; i++){
        const x = PLANL.sumarDias(h, i);
        if(PLANL.esDiaDeEstudio(x, aj) && PLANL.puedeAnadir(d.tareas, x, aj).ok && !d.tareas.some(t => t.test_id === rep.test_id && t.fecha === x)){ dia = x; break; }
      }
      PLAN.programar(rep.test_id, dia, { origen: 'repaso', prioridad: 1 });
      return;
    }
    if(tema && (tema.topic_ids || []).length){ PLAN.repasoFallos(temaId); return; }
    uiToast(rep ? 'Ya tienes un repaso programado para este tema.' : 'Para proponer un repaso hace falta un test ya hecho de este tema, o vincular el tema con tu banco de pj.fire (Ajustes › Temas).', 'info');
  }
  return { render, periodo: cambiarPeriodo, agrupar: cambiarAgrupar, proponerRepaso };
})();
