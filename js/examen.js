/* Tu examen: la fecha (cuenta atrás en Inicio, con el ritmo diario que hace
   falta para llegar con todo dominado) y su formato para el Simulacro
   oficial: cuántas preguntas, minutos, cuánto resta cada fallo y el reparto
   entre Legislación y Específico. Se guarda en examen_ajustes (una fila por
   alumno, privada) y una copia en el dispositivo para pintar al momento.
   El simulacro lo hace js/pruebas.js (modo 'oficial'). */
const EXA = (function(){
  const CACHE = 'pj_examen_v1:';
  const BASE = { fecha: null, preguntas: 100, minutos: 120, penalizacion: null, pct_legis: 50 };
  const PREGUNTAS = [50, 60, 80, 100, 120, 150];
  const MINUTOS = [60, 90, 120, 150, 180];
  const PENS = [[null, '1/(opciones−1)'], [0, 'No restan'], [0.25, '−¼'], [1 / 3, '−⅓']];
  const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const ICO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 2h4"/><path d="M12 14l3-3"/><circle cx="12" cy="14" r="8"/></svg>';
  const FLECHA = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>';
  const esc = s => escapeHtml(String(s == null ? '' : s));

  let aj = null, dueño = null, cargando = null, h = null;
  const yo = () => (typeof currentUser !== 'undefined' && currentUser) ? currentUser.id : null;
  function leerCache(){ try{ return JSON.parse(localStorage.getItem(CACHE + yo()) || 'null'); }catch(e){ return null; } }
  function guardarCache(){ try{ localStorage.setItem(CACHE + yo(), JSON.stringify(aj)); }catch(e){} }
  function ajustes(){
    if(dueño !== yo()){ dueño = yo(); aj = leerCache(); cargar(); }
    return Object.assign({}, BASE, aj || {});
  }
  function cargar(){
    if(!yo() || cargando) return cargando;
    const quien = yo();
    // Dentro de una promesa: si algo falla, Inicio se pinta igual (sin la cuenta atrás guardada).
    cargando = Promise.resolve().then(() => sb.from('examen_ajustes').select('fecha,preguntas,minutos,penalizacion,pct_legis').eq('user_id', quien).maybeSingle())
      .then(({ data, error }) => {
        if(error || quien !== yo()) return;
        aj = data ? Object.assign({}, data, { penalizacion: data.penalizacion == null ? null : Number(data.penalizacion) }) : null;
        guardarCache();
        if(typeof INICIO !== 'undefined') INICIO.pintar();
      }).catch(() => {}).finally(() => { cargando = null; });
    return cargando;
  }
  async function guardar(nuevo){
    aj = Object.assign({}, BASE, nuevo);
    guardarCache();
    if(typeof INICIO !== 'undefined') INICIO.pintar();
    const { error } = await sb.from('examen_ajustes').upsert(Object.assign({ user_id: yo(), updated_at: new Date().toISOString() }, aj), { onConflict: 'user_id' });
    if(error) uiToast('No se pudo guardar: ' + error.message, 'error');
  }

  /* ---------- fechas ---------- */
  const deIso = s => { const [a, m, d] = s.split('-').map(Number); return new Date(a, m - 1, d); };
  function diasHasta(f){
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    return Math.round((deIso(f) - hoy) / 864e5);
  }
  function fechaLarga(f){
    const d = deIso(f);
    return DIAS[d.getDay()] + ' ' + d.getDate() + ' de ' + MESES[d.getMonth()] + (d.getFullYear() !== new Date().getFullYear() ? ' de ' + d.getFullYear() : '');
  }

  /* ---------- ritmo: lo que falta por dominar, repartido entre los días que quedan ---------- */
  function pendientes(){
    const out = { legis: null, esp: null };
    if(typeof appDataReady !== 'undefined' && appDataReady && QUESTIONS_POOL.length) out.legis = QUESTIONS_POOL.filter(q => q.masteryStatus !== 'green').length;
    if(featureEnabled('especifico') && typeof ESTE !== 'undefined'){ const r = ESTE.resumen(); if(r) out.esp = r.total - r.verde; }
    return out;
  }
  function ritmo(dias){
    const p = pendientes();
    if(p.legis == null && p.esp == null) return '';
    const l = p.legis || 0, e = p.esp || 0;
    if(!l && !e) return '<div class="exa-ritmo">Lo tienes todo dominado. Mantenlo con simulacros.</div>';
    const al = n => Math.ceil(n / Math.max(1, dias));
    const total = al(l + e);
    const partes = [l ? al(l) + ' de Legislación' : '', e ? al(e) + ' del Específico' : ''].filter(Boolean);
    return '<div class="exa-ritmo">Para llegar con todo dominado: <b>unas ' + total + ' preguntas al día</b>' +
      (partes.length > 1 ? ' (' + partes.join(' y ') + ')' : '') + '.<span>Te quedan ' + (l + e) + ' por dominar.</span></div>';
  }

  /* ---------- tarjeta de Inicio ---------- */
  function tarjeta(){
    if(!yo()) return '';
    const a = ajustes();
    if(!a.fecha) return '<button type="button" class="exa-tarjeta exa-sin" data-ini="examen"><span class="exa-ico">' + ICO + '</span>' +
      '<span class="exa-txt"><b>Sin fecha</b><span>Ponla para ver los días que quedan y cuánto repasar cada día</span></span><span class="ini-flecha">' + FLECHA + '</span></button>';
    const d = diasHasta(a.fecha);
    const grande = d > 1 ? '<b>' + d + '</b><span>días</span>' : d === 1 ? '<b>1</b><span>día</span>' : d === 0 ? '<b>Hoy</b>' : '<b>✓</b>';
    const titulo = d > 1 ? 'Faltan ' + d + ' días' : d === 1 ? '¡Es mañana!' : d === 0 ? '¡Hoy es el examen!' : 'El examen ya pasó';
    const sub = d >= 0 ? 'Examen el ' + fechaLarga(a.fecha) + (d > 13 ? ' · ' + Math.floor(d / 7) + ' semanas' : '') : 'Fue el ' + fechaLarga(a.fecha) + '. Pon la fecha del siguiente.';
    return '<div class="exa-tarjeta' + (d < 0 ? ' pasado' : '') + '" role="button" tabindex="0" data-ini="examen">' +
      '<div class="exa-cuenta">' + grande + '</div>' +
      '<div class="exa-txt"><b>' + titulo + '</b><span>' + esc(sub) + '</span>' + (d > 0 ? ritmo(d) : '') +
        (typeof PRU !== 'undefined' && PRU.oficialDisponible() && d >= 0 ? '<button type="button" class="exa-sim" data-ini="oficial">Simulacro oficial · ' + a.preguntas + ' preg. · ' + a.minutos + ' min</button>' : '') +
      '</div></div>';
  }

  /* ---------- hoja de ajustes ---------- */
  function cerrar(){ const bg = document.getElementById('exaHoja'); if(bg) bg.remove(); document.removeEventListener('keydown', tecla, true); }
  function tecla(e){ if(e.key === 'Escape'){ e.stopPropagation(); cerrar(); } }
  function abrir(){
    cerrar();
    h = ajustes();
    const conSim = typeof PRU !== 'undefined' && PRU.oficialDisponible();
    const bg = document.createElement('div');
    bg.className = 'cal-hoja-bg'; bg.id = 'exaHoja';
    bg.innerHTML = '<form class="cal-hoja exa-hoja" style="--c: var(--coral)" autocomplete="off" novalidate>' +
      '<div class="cal-hoja-top"><div class="cal-hoja-asa"></div>' +
        '<div class="cal-hoja-cab"><span class="cal-hoja-ico">' + ICO + '</span><div class="cal-hoja-tit"><h3>Tu examen</h3><div class="cal-hoja-sub">Fecha y formato del examen de verdad</div></div>' +
        '<button type="button" class="cal-x" data-x="cerrar" aria-label="Cerrar">✕</button></div></div>' +
      '<div class="cal-hoja-cuerpo" data-cuerpo></div>' +
      '<div class="cal-hoja-pie">' + (conSim ? '<button type="button" class="cal-btn" data-x="simulacro">Hacer simulacro</button>' : '') +
        '<button type="submit" class="cal-btn primario">Guardar</button></div></form>';
    document.body.appendChild(bg);
    const f = bg.querySelector('form');
    pintar(f);
    if(conSim) PRU.cargarHistorial().then(() => { if(document.getElementById('exaHoja')) pintar(f); }).catch(() => {});
    bg.addEventListener('click', e => {
      if(e.target === bg) return cerrar();
      if(typeof PRU !== 'undefined' && e.target.closest('[data-pru-hist],[data-pru-borrar]')){
        if(e.target.closest('[data-pru-hist]') && !e.target.closest('[data-pru-borrar]')) cerrar();
        PRU.onPanelClick(e);
        return;
      }
      const b = e.target.closest('button');
      if(!b) return;
      if(b.dataset.x === 'cerrar') return cerrar();
      if(b.dataset.x === 'sin-fecha') h.fecha = null;
      else if(b.dataset.x === 'simulacro'){ leer(f); guardar(h).then(() => {}); cerrar(); return simulacro(); }
      else if(b.dataset.preg) h.preguntas = +b.dataset.preg;
      else if(b.dataset.min) h.minutos = +b.dataset.min;
      else if(b.dataset.pen != null) h.penalizacion = b.dataset.pen === '' ? null : +b.dataset.pen;
      else return;
      pintar(f);
    });
    bg.addEventListener('input', e => {
      if(e.target.name === 'pct'){ h.pct_legis = +e.target.value; const o = f.querySelector('[data-pct]'); if(o) o.innerHTML = textoPct(h.pct_legis); }
    });
    bg.addEventListener('change', e => {
      if(e.target.name === 'fecha'){ h.fecha = e.target.value || null; pintar(f); }
      if(e.target.name === 'otrasPreg' && +e.target.value >= 5){ h.preguntas = Math.min(400, Math.round(+e.target.value)); pintar(f); }
      if(e.target.name === 'otrosMin' && +e.target.value >= 5){ h.minutos = Math.min(600, Math.round(+e.target.value)); pintar(f); }
    });
    f.addEventListener('submit', e => { e.preventDefault(); leer(f); guardar(h); cerrar(); uiToast('Guardado', 'success'); });
    document.addEventListener('keydown', tecla, true);
    requestAnimationFrame(() => bg.classList.add('on'));
  }
  // Lo escrito en los campos sueltos (por si no se ha salido de ellos).
  function leer(f){
    if(f.fecha) h.fecha = f.fecha.value || null;
    if(f.otrasPreg && +f.otrasPreg.value >= 5) h.preguntas = Math.min(400, Math.round(+f.otrasPreg.value));
    if(f.otrosMin && +f.otrosMin.value >= 5) h.minutos = Math.min(600, Math.round(+f.otrosMin.value));
  }
  const textoPct = p => '<b>' + p + ' %</b> Legislación · <b>' + (100 - p) + ' %</b> Específico';
  function pintar(f){
    const conSim = typeof PRU !== 'undefined' && PRU.oficialDisponible();
    const chip = (on, attrs, txt) => '<button type="button" class="cal-seg' + (on ? ' on' : '') + '" ' + attrs + '>' + txt + '</button>';
    const d = h.fecha ? diasHasta(h.fecha) : null;
    const penOn = v => v == null ? h.penalizacion == null : h.penalizacion != null && Math.abs(h.penalizacion - v) < 0.001;
    f.querySelector('[data-cuerpo]').innerHTML =
      '<div class="cal-campo"><div class="cal-campo-t">Fecha del examen</div><div class="exa-fecha">' +
        '<input class="cal-in" type="date" name="fecha" value="' + esc(h.fecha || '') + '">' +
        (h.fecha ? '<button type="button" class="cal-chip" data-x="sin-fecha">Quitar</button>' : '') + '</div>' +
        '<div class="cal-hasta-res">' + (d == null ? 'Sin fecha: no sale la cuenta atrás.' : d > 0 ? 'Faltan <b>' + d + '</b> ' + (d === 1 ? 'día' : 'días') + ' · ' + esc(fechaLarga(h.fecha)) : d === 0 ? 'Es hoy' : 'Esa fecha ya pasó') + '</div></div>' +
      (conSim ?
        '<div class="cal-campo"><div class="cal-campo-t">Preguntas del examen</div><div class="cal-segs">' +
          PREGUNTAS.map(n => chip(h.preguntas === n, 'data-preg="' + n + '"', n)).join('') +
          '<input class="cal-in exa-otro" type="number" name="otrasPreg" min="5" max="400" inputmode="numeric" placeholder="Otra" value="' + (PREGUNTAS.includes(h.preguntas) ? '' : h.preguntas) + '"></div></div>' +
        '<div class="cal-campo"><div class="cal-campo-t">Tiempo (minutos)</div><div class="cal-segs">' +
          MINUTOS.map(n => chip(h.minutos === n, 'data-min="' + n + '"', n)).join('') +
          '<input class="cal-in exa-otro" type="number" name="otrosMin" min="5" max="600" inputmode="numeric" placeholder="Otro" value="' + (MINUTOS.includes(h.minutos) ? '' : h.minutos) + '"></div></div>' +
        '<div class="cal-campo"><div class="cal-campo-t">Cuánto resta cada fallo</div><div class="cal-segs cal-segs-full">' +
          PENS.map(([v, t]) => chip(penOn(v), 'data-pen="' + (v == null ? '' : v) + '"', t)).join('') + '</div>' +
          '<div class="cal-hasta-res">' + (h.penalizacion == null ? 'Como en los simulacros de la app: con 4 opciones, cada fallo resta ⅓. ' : '') + 'En blanco no suma ni resta.</div></div>' +
        '<div class="cal-campo"><div class="cal-campo-t">Reparto</div>' +
          '<input class="exa-rango" type="range" name="pct" min="0" max="100" step="5" value="' + h.pct_legis + '" aria-label="% de Legislación">' +
          '<div class="cal-hasta-res" data-pct>' + textoPct(h.pct_legis) + '</div></div>' +
        '<div class="cal-hasta-res exa-nota">Si aún no sabes cómo será, déjalo así y cámbialo cuando salga la convocatoria. El simulacro coge todas las leyes y todo el Específico, y el reloj no se para aunque salgas.</div>' +
        '<div class="exa-hist">' + PRU.historialHtml(['oficial'], 5) + '</div>'
      : '');
  }
  function repintar(){ const bg = document.getElementById('exaHoja'); if(bg) pintar(bg.querySelector('form')); }

  // El simulacro, con lo guardado; antes, un resumen de cómo va a ser.
  async function simulacro(){
    if(typeof PRU === 'undefined' || !PRU.oficialDisponible()) return;
    const a = ajustes();
    const ok = await uiConfirm('Simulacro oficial\n\n' + a.preguntas + ' preguntas · ' + a.minutos + ' minutos · ' + a.pct_legis + ' % Legislación\n' +
      PRU.textoPen(a.penalizacion).replace(/^./, c => c.toUpperCase()) + '.\n\nEl reloj no se para aunque salgas.', { ok: 'Empezar' });
    if(ok) PRU.empezarOficial(a);
  }
  function reiniciar(){ aj = null; dueño = null; cerrar(); }
  return { tarjeta, abrir, simulacro, repintar, reiniciar, ajustes };
})();
