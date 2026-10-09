/* Calendario: lo que cada alumno se apunta para estudiar cada día
   (tabla calendario_tareas, privada). Mes con puntos de colores por
   categoría, el día elegido con sus tareas para marcar, lo atrasado para
   pasarlo a hoy y la racha de días cumplidos. Se guarda una copia en el
   dispositivo para pintar al momento y sin conexión; los cambios se ven
   antes de que llegue la respuesta del servidor. */
const CAL = (function(){
  const CACHE = 'pj_calendario_v1:';
  const CATS = [
    ['normativas', 'Normativas', 'var(--coral)'],
    ['legislacion', 'Legislación', 'var(--purple)'],
    ['callejero', 'Callejero', 'var(--teal)'],
    ['especifico', 'Específico', 'var(--blue)'],
    ['test', 'Test / simulacro', 'var(--orange)'],
    ['fisico', 'Físico', 'var(--green)'],
    ['repaso', 'Repaso', 'var(--amber)'],
    ['otro', 'Otro', 'var(--muted)']
  ];
  const ICONO = { normativas: '📘', legislacion: '⚖️', callejero: '🗺️', especifico: '🔥', test: '📝', fisico: '🏃', repaso: '🔁', otro: '✨' };
  const LAPIZ = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>';
  const CAT = Object.fromEntries(CATS.map(([k, n, c]) => [k, { n, c }]));
  // Desde la tarea se puede saltar a su apartado.
  const IR = { normativas: 'screen-normativas', legislacion: 'screen-home', callejero: 'screen-callejero', test: 'screen-home' };
  const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const FRASES = ['Día libre. Si te apetece, apunta algo.', 'Nada apuntado para este día.', 'Hueco libre: buen momento para un repaso.'];

  let tareas = [], cargado = false, cargando = null, dueño = null;
  let mes = null, elegido = null;

  /* ---------- fechas (siempre en hora local, como 'AAAA-MM-DD') ---------- */
  const dos = n => String(n).padStart(2, '0');
  const iso = d => d.getFullYear() + '-' + dos(d.getMonth() + 1) + '-' + dos(d.getDate());
  const deIso = s => { const [a, m, d] = s.split('-').map(Number); return new Date(a, m - 1, d); };
  const hoy = () => iso(new Date());
  const masDias = (s, n) => { const d = deIso(s); d.setDate(d.getDate() + n); return iso(d); };
  function nombreDia(s, corto){
    const d = deIso(s), h = hoy();
    const rel = s === h ? 'Hoy' : s === masDias(h, 1) ? 'Mañana' : s === masDias(h, -1) ? 'Ayer' : null;
    const largo = DIAS[d.getDay()] + ' ' + d.getDate() + ' de ' + MESES[d.getMonth()];
    if(corto) return rel || largo.charAt(0).toUpperCase() + largo.slice(1);
    return rel ? rel + ', ' + largo : largo.charAt(0).toUpperCase() + largo.slice(1);
  }
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* ---------- datos ---------- */
  const yo = () => (typeof currentUser !== 'undefined' && currentUser) ? currentUser.id : null;
  function leerCache(){ try{ return JSON.parse(localStorage.getItem(CACHE + yo()) || 'null'); }catch(e){ return null; } }
  function guardarCache(){ try{ localStorage.setItem(CACHE + yo(), JSON.stringify(tareas)); }catch(e){} }
  const ordenar = () => tareas.sort((a, b) => a.fecha.localeCompare(b.fecha) || (a.orden - b.orden) || String(a.created_at).localeCompare(String(b.created_at)));
  const delDia = f => tareas.filter(t => t.fecha === f);

  async function cargar(){
    if(!yo()) return;
    if(dueño !== yo()){ dueño = yo(); cargado = false; tareas = leerCache() || []; ordenar(); }
    if(cargando) return cargando;
    cargando = (async () => {
      const filas = [];
      for(let desde = 0; ; desde += 1000){
        const { data, error } = await sb.from('calendario_tareas').select('id,fecha,titulo,nota,categoria,hecho,orden,serie,created_at')
          .eq('user_id', yo()).order('fecha').order('orden').range(desde, desde + 999);
        if(error) throw error;
        filas.push(...data);
        if(data.length < 1000) break;
      }
      tareas = filas; ordenar(); cargado = true; guardarCache();
    })().catch(e => { if(!cargado) uiToast('No se pudo cargar el calendario: ' + (e.message || e), 'error'); })
      .finally(() => { cargando = null; pintar(); });
    return cargando;
  }
  // Cambio optimista: se ve ya y, si falla, se vuelve a cargar lo del servidor.
  async function enviar(promesa, msgError){
    guardarCache(); pintar();
    const { error } = await promesa;
    if(error){ uiToast(msgError + ': ' + error.message, 'error'); await cargar(); }
  }

  /* ---------- cálculos ---------- */
  function racha(){
    // Días seguidos (hacia atrás) en los que se hizo todo lo apuntado; los
    // días sin nada apuntado no cortan la racha, y hoy solo cuenta si ya está.
    const porDia = new Map();
    tareas.forEach(t => { const d = porDia.get(t.fecha) || [0, 0]; d[0]++; if(t.hecho) d[1]++; porDia.set(t.fecha, d); });
    let n = 0, f = hoy();
    const t0 = porDia.get(f);
    if(t0 && t0[0] === t0[1]) n++;
    for(let i = 0; i < 400; i++){
      f = masDias(f, -1);
      const d = porDia.get(f);
      if(!d) continue;
      if(d[0] !== d[1]) break;
      n++;
    }
    return n;
  }
  const atrasadas = () => { const h = hoy(); return tareas.filter(t => !t.hecho && t.fecha < h); };

  /* ---------- pintar ---------- */
  function anillo(hechas, total){
    const r = 34, c = 2 * Math.PI * r, p = total ? hechas / total : 0;
    return '<svg class="cal-anillo" viewBox="0 0 80 80" aria-hidden="true"><defs><linearGradient id="calGrad" x1="0" y1="0" x2="1" y2="1">' +
      '<stop offset="0" stop-color="var(--coral)"/><stop offset="1" stop-color="var(--amber)"/></linearGradient></defs>' +
      '<circle cx="40" cy="40" r="' + r + '" class="cal-anillo-fondo"/>' +
      '<circle cx="40" cy="40" r="' + r + '" class="cal-anillo-barra" stroke-dasharray="' + c.toFixed(1) + '" stroke-dashoffset="' + (c * (1 - p)).toFixed(1) + '"/></svg>' +
      '<div class="cal-anillo-txt">' + (total ? Math.round(p * 100) + '%' : '—') + '</div>';
  }
  function cabecera(){
    const h = hoy(), lista = delDia(h), hechas = lista.filter(t => t.hecho).length, r = racha();
    const proximas = tareas.filter(t => t.fecha > h && t.fecha <= masDias(h, 7) && !t.hecho).length;
    const msg = !lista.length ? 'Hoy no tienes nada apuntado.'
      : hechas === lista.length ? '¡Todo hecho por hoy! 🎉'
      : 'Te queda' + (lista.length - hechas === 1 ? ' 1 cosa' : 'n ' + (lista.length - hechas) + ' cosas') + ' por hacer.';
    return '<div class="cal-hero">' +
      '<div class="cal-hero-anillo">' + anillo(hechas, lista.length) + '</div>' +
      '<div class="cal-hero-txt"><div class="cal-hero-fecha">' + esc(nombreDia(h)) + '</div>' +
        '<div class="cal-hero-msg">' + msg + '</div>' +
        '<div class="cal-hero-chips">' +
          '<span class="cal-chip-dato"><b>' + hechas + '/' + lista.length + '</b> hoy</span>' +
          '<span class="cal-chip-dato' + (r ? ' fuego' : '') + '">🔥 <b>' + r + '</b> ' + (r === 1 ? 'día' : 'días') + ' de racha</span>' +
          '<span class="cal-chip-dato"><b>' + proximas + '</b> en 7 días</span>' +
        '</div></div></div>';
  }
  function rejilla(){
    const [a, m] = mes, primero = new Date(a, m, 1), h = hoy();
    const hueco = (primero.getDay() + 6) % 7;            // la semana empieza en lunes
    const diasMes = new Date(a, m + 1, 0).getDate();
    const porDia = new Map();
    tareas.forEach(t => { if(!porDia.has(t.fecha)) porDia.set(t.fecha, []); porDia.get(t.fecha).push(t); });
    let celdas = '';
    for(let i = 0; i < hueco; i++) celdas += '<div class="cal-dia vacio"></div>';
    for(let d = 1; d <= diasMes; d++){
      const f = a + '-' + dos(m + 1) + '-' + dos(d), ts = porDia.get(f) || [];
      const todo = ts.length && ts.every(t => t.hecho), falta = ts.length && f < h && !todo;
      const cls = ['cal-dia', f === h ? 'hoy' : '', f === elegido ? 'sel' : '', todo ? 'ok' : '', falta ? 'falta' : '', f < h ? 'pasado' : ''].filter(Boolean).join(' ');
      const puntos = ts.slice(0, 4).map(t => '<i style="background:' + CAT[t.categoria].c + '"' + (t.hecho ? ' class="h"' : '') + '></i>').join('') + (ts.length > 4 ? '<em>+' + (ts.length - 4) + '</em>' : '');
      celdas += '<button class="' + cls + '" data-cal="dia" data-f="' + f + '" aria-label="' + esc(nombreDia(f)) + ', ' + ts.length + ' tareas">' +
        '<span class="cal-num">' + d + '</span>' + (todo ? '<span class="cal-ok">✓</span>' : '') + '<span class="cal-puntos">' + puntos + '</span></button>';
    }
    const esteMes = (() => { const n = new Date(); return n.getFullYear() === a && n.getMonth() === m; })();
    return '<div class="cal-mes">' +
      '<div class="cal-mes-cab"><button class="cal-flecha" data-cal="mes" data-d="-1" aria-label="Mes anterior">‹</button>' +
        '<div class="cal-mes-nombre">' + MESES[m].charAt(0).toUpperCase() + MESES[m].slice(1) + ' <span>' + a + '</span></div>' +
        '<button class="cal-flecha" data-cal="mes" data-d="1" aria-label="Mes siguiente">›</button>' +
        (esteMes && elegido === h ? '' : '<button class="cal-hoy-btn" data-cal="hoy">Hoy</button>') + '</div>' +
      '<div class="cal-semana">' + ['L', 'M', 'X', 'J', 'V', 'S', 'D'].map(x => '<span>' + x + '</span>').join('') + '</div>' +
      '<div class="cal-rejilla">' + celdas + '</div></div>';
  }
  function tarjeta(t, conFecha){
    const c = CAT[t.categoria];
    return '<div class="cal-tarea' + (t.hecho ? ' hecha' : '') + '" style="--c:' + c.c + '">' +
      '<button class="cal-check" data-cal="hecho" data-id="' + t.id + '" aria-label="' + (t.hecho ? 'Desmarcar' : 'Marcar como hecha') + '">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5 10 17l9-10"/></svg></button>' +
      '<button class="cal-tarea-main" data-cal="editar" data-id="' + t.id + '">' +
        '<span class="cal-tarea-t">' + esc(t.titulo) + '</span>' +
        (t.nota ? '<span class="cal-tarea-n">' + esc(t.nota) + '</span>' : '') +
        '<span class="cal-tarea-meta"><span class="cal-cat">' + esc(c.n) + '</span>' + (conFecha ? '<span class="cal-tarea-f">' + esc(nombreDia(t.fecha, true)) + '</span>' : '') + (t.serie ? '<span class="cal-rep" title="Se repite">↻</span>' : '') + '</span>' +
      '</button>' +
      (conFecha ? '<button class="cal-mini" data-cal="a-hoy" data-id="' + t.id + '">A hoy</button>'
        : (IR[t.categoria] && !t.hecho ? '<button class="cal-ir" data-cal="ir" data-k="' + t.categoria + '" aria-label="Ir a ' + esc(c.n) + '">›</button>' : '') +
          '<button class="cal-ir cal-lapiz" data-cal="editar" data-id="' + t.id + '" aria-label="Editar">' + LAPIZ + '</button>') +
      '</div>';
  }
  function dia(){
    const lista = delDia(elegido), hechas = lista.filter(t => t.hecho).length;
    const frase = FRASES[deIso(elegido).getDate() % FRASES.length];
    return '<div class="cal-dia-cab"><div><h2>' + esc(nombreDia(elegido)) + '</h2>' +
        '<div class="cal-dia-sub">' + (lista.length ? hechas + ' de ' + lista.length + ' hechas' : 'Sin tareas') + '</div></div>' +
        '<button class="cal-anadir" data-cal="nueva"><span>+</span> Añadir</button></div>' +
      (lista.length ? '<div class="cal-lista">' + lista.map(t => tarjeta(t)).join('') + '</div>'
        : '<button class="cal-vacio" data-cal="nueva"><span class="cal-vacio-ico">✨</span><span>' + frase + '</span><b>Toca para añadir</b></button>');
  }
  function bloqueAtrasadas(){
    const at = atrasadas();
    if(!at.length) return '';
    return '<details class="cal-atras"' + (at.length <= 3 ? ' open' : '') + '><summary><span class="cal-atras-n">' + at.length + '</span> ' +
        (at.length === 1 ? 'Tarea atrasada' : 'Tareas atrasadas') + '<button class="cal-mini" data-cal="todas-a-hoy">Pasar todas a hoy</button></summary>' +
      '<div class="cal-lista">' + at.slice(-30).reverse().map(t => tarjeta(t, true)).join('') + '</div></details>';
  }
  function pintar(){
    if(typeof INICIO !== 'undefined') INICIO.pintar();
    const root = document.getElementById('calRoot');
    if(!root || !document.getElementById('screen-calendario').classList.contains('active')) return;
    if(!elegido) elegido = hoy();
    if(!mes){ const d = deIso(elegido); mes = [d.getFullYear(), d.getMonth()]; }
    if(!cargado && !tareas.length && cargando){ root.innerHTML = '<div class="cal-cargando">Cargando tu calendario…</div>'; return; }
    root.innerHTML = cabecera() + '<div class="cal-cuerpo"><div class="cal-col">' + rejilla() + '</div><div class="cal-col">' + dia() + bloqueAtrasadas() + '</div></div>';
  }

  /* ---------- hoja para añadir o editar ---------- */
  // h: estado de la hoja abierta. En una tarea que se repite (serie), los
  // cambios pueden ir solo a ella o a ella y las siguientes.
  let h = null, ultimaCat = 'normativas';
  const REPS = [['', 'No'], ['1', 'Cada día'], ['lab', 'L a V'], ['7', 'Semanal']];
  function repDeSerie(t){
    const fs = tareas.filter(x => x.serie === t.serie).map(x => x.fecha).sort();
    if(fs.length < 2) return { rep: '', hasta: t.fecha };
    const salto = fs.slice(1).map((f, k) => Math.round((deIso(f) - deIso(fs[k])) / 864e5));
    const rep = salto.every(x => x === 7) ? '7' : salto.every(x => x === 1) ? '1' : 'lab';
    return { rep, hasta: fs[fs.length - 1] };
  }
  function siguientes(t){ return t.serie ? tareas.filter(x => x.serie === t.serie && x.fecha > t.fecha) : []; }

  function abrirHoja(t){
    cerrarHoja();
    const nueva = !t;
    const base = t || { titulo: '', nota: '', categoria: ultimaCat, fecha: elegido };
    const serie = t && t.serie ? repDeSerie(t) : null;
    h = { t, cat: base.categoria, fecha: base.fecha, rep: serie ? serie.rep : '', hasta: serie ? serie.hasta : masDias(base.fecha, 27),
          alcance: 'una', repIni: serie ? serie.rep : '', hastaIni: serie ? serie.hasta : null };
    const bg = document.createElement('div');
    bg.className = 'cal-hoja-bg';
    bg.id = 'calHoja';
    bg.innerHTML = '<form class="cal-hoja" autocomplete="off" novalidate>' +
      '<div class="cal-hoja-top"><div class="cal-hoja-asa"></div>' +
        '<div class="cal-hoja-cab"><span class="cal-hoja-ico" data-ico></span><div class="cal-hoja-tit"><h3>' + (nueva ? 'Nueva tarea' : 'Editar tarea') + '</h3><div class="cal-hoja-sub" data-sub></div></div>' +
        '<button type="button" class="cal-x" data-h="cerrar" aria-label="Cerrar">✕</button></div></div>' +
      '<div class="cal-hoja-cuerpo">' +
        '<input class="cal-titulo" name="titulo" maxlength="200" placeholder="¿Qué toca estudiar?" value="' + esc(base.titulo) + '">' +
        '<div class="cal-campo"><div class="cal-campo-t">Categoría</div><div class="cal-cats">' +
          CATS.map(([k, n, c]) => '<button type="button" class="cal-cat-op" data-cat="' + k + '" style="--c:' + c + '"><span>' + ICONO[k] + '</span>' + n + '</button>').join('') + '</div></div>' +
        '<div class="cal-campo"><div class="cal-campo-t">Día</div><div class="cal-segs" data-dias></div></div>' +
        '<div class="cal-campo"><div class="cal-campo-t">Nota</div><textarea class="cal-in" name="nota" rows="2" maxlength="1000" placeholder="Páginas, artículos, cuántos tests…">' + esc(base.nota || '') + '</textarea></div>' +
        (t && t.serie && siguientes(t).length ? '<div class="cal-campo"><div class="cal-campo-t">Aplicar los cambios a</div><div class="cal-segs cal-segs-full" data-alcance></div></div>' : '') +
        '<div class="cal-campo" data-rep-campo><div class="cal-campo-t">Repetir</div><div class="cal-segs cal-segs-full" data-rep></div>' +
          '<div class="cal-hasta" data-hasta></div></div>' +
      '</div>' +
      '<div class="cal-hoja-pie">' + (nueva ? '' : '<button type="button" class="cal-btn peligro" data-h="borrar">Borrar</button>') +
        '<button type="submit" class="cal-btn primario cal-guardar">' + (nueva ? 'Añadir tarea' : 'Guardar cambios') + '</button></div></form>';
    document.body.appendChild(bg);
    const f = bg.querySelector('form');
    pintarHoja(f);
    bg.addEventListener('click', e => {
      if(e.target === bg) return cerrarHoja();
      const b = e.target.closest('button');
      if(!b) return;
      if(b.dataset.cat){ h.cat = b.dataset.cat; ultimaCat = h.cat; }
      else if(b.dataset.dia){ h.fecha = b.dataset.dia; }
      else if(b.dataset.rep != null){ h.rep = b.dataset.rep; }
      else if(b.dataset.hastaN){ h.hasta = masDias(h.fecha, +b.dataset.hastaN); }
      else if(b.dataset.alc){ h.alcance = b.dataset.alc; }
      else if(b.dataset.h === 'cerrar') return cerrarHoja();
      else if(b.dataset.h === 'borrar') return borrar(t);
      else return;
      pintarHoja(f);
    });
    bg.addEventListener('change', e => {
      if(e.target.name === 'otroDia' && e.target.value){ h.fecha = e.target.value; pintarHoja(f); }
      if(e.target.name === 'hasta' && e.target.value){ h.hasta = e.target.value; pintarHoja(f); }
    });
    f.addEventListener('submit', e => { e.preventDefault(); guardar(f); });
    document.addEventListener('keydown', teclaHoja, true);
    requestAnimationFrame(() => bg.classList.add('on'));
    if(nueva && matchMedia('(hover: hover)').matches) setTimeout(() => f.titulo.focus(), 60);
  }
  function pintarHoja(f){
    const c = CAT[h.cat], hh = hoy();
    f.style.setProperty('--c', c.c);
    f.querySelector('[data-ico]').textContent = ICONO[h.cat];
    f.querySelector('[data-sub]').textContent = c.n + ' · ' + nombreDia(h.fecha);
    f.querySelectorAll('.cal-cat-op').forEach(b => b.classList.toggle('on', b.dataset.cat === h.cat));
    const rapidos = [[hh, 'Hoy'], [masDias(hh, 1), 'Mañana'], [masDias(hh, 2), 'Pasado']];
    const otro = !rapidos.some(r => r[0] === h.fecha);
    f.querySelector('[data-dias]').innerHTML = rapidos.map(([d, n]) => '<button type="button" class="cal-seg' + (d === h.fecha ? ' on' : '') + '" data-dia="' + d + '">' + n + '</button>').join('') +
      '<label class="cal-seg cal-seg-fecha' + (otro ? ' on' : '') + '">📅 ' + (otro ? esc(nombreDia(h.fecha, true)) : 'Otro día') + '<input type="date" name="otroDia" value="' + h.fecha + '"></label>';
    const alc = f.querySelector('[data-alcance]');
    if(alc){
      const n = siguientes(h.t).length;
      alc.innerHTML = '<button type="button" class="cal-seg' + (h.alcance === 'una' ? ' on' : '') + '" data-alc="una">Solo esta</button>' +
        '<button type="button" class="cal-seg' + (h.alcance === 'serie' ? ' on' : '') + '" data-alc="serie">Esta y las ' + n + ' siguientes</button>';
    }
    // La repetición se cambia en una tarea suelta o en toda la serie (no en una sola de la serie).
    const verRep = !h.t || !h.t.serie || h.alcance === 'serie' || !alc;
    f.querySelector('[data-rep-campo]').classList.toggle('hidden', !verRep);
    f.querySelector('[data-rep]').innerHTML = REPS.map(([k, n]) => '<button type="button" class="cal-seg' + (k === h.rep ? ' on' : '') + '" data-rep="' + k + '">' + n + '</button>').join('');
    if(h.hasta < h.fecha) h.hasta = masDias(h.fecha, 27);
    const fechas = fechasRepetidas(h.fecha, h.rep, h.hasta);
    f.querySelector('[data-hasta]').innerHTML = h.rep ?
      '<div class="cal-hasta-fila"><span>Hasta</span>' + [[6, '1 semana'], [13, '2 semanas'], [27, '4 semanas']].map(([n, txt]) =>
        '<button type="button" class="cal-chip' + (h.hasta === masDias(h.fecha, n) ? ' on' : '') + '" data-hasta-n="' + n + '">' + txt + '</button>').join('') +
        '<label class="cal-chip cal-chip-fecha">📅 ' + esc(nombreDia(h.hasta, true)) + '<input type="date" name="hasta" value="' + h.hasta + '" min="' + h.fecha + '"></label></div>' +
      '<div class="cal-hasta-res">Se apuntará en <b>' + fechas.length + '</b> ' + (fechas.length === 1 ? 'día' : 'días') + '</div>' : '';
  }
  function teclaHoja(e){ if(e.key === 'Escape'){ e.stopPropagation(); cerrarHoja(); } }
  function cerrarHoja(){
    const bg = document.getElementById('calHoja');
    document.removeEventListener('keydown', teclaHoja, true);
    if(bg) bg.remove();
  }
  function fechasRepetidas(desde, rep, hasta){
    if(!rep || !hasta || hasta < desde) return [desde];
    const out = [];
    for(let f = desde, i = 0; f <= hasta && i < 366; f = masDias(f, rep === '7' ? 7 : 1), i++){
      const wd = deIso(f).getDay();
      if(rep === 'lab' && (wd === 0 || wd === 6)) continue;
      out.push(f);
    }
    return out.length ? out : [desde];
  }
  const ahora = () => new Date().toISOString();
  const fila = (fecha, d, serie, hecho) => ({ id: crypto.randomUUID(), user_id: yo(), fecha, titulo: d.titulo, nota: d.nota, categoria: d.categoria,
    hecho: !!hecho, serie, orden: delDia(fecha).length, created_at: ahora() });
  const sinMeta = r => { const { created_at, ...x } = r; return x; };
  function irA(fecha){ elegido = fecha; const d = deIso(fecha); mes = [d.getFullYear(), d.getMonth()]; }

  async function guardar(f){
    const titulo = f.titulo.value.trim();
    if(!titulo){ f.titulo.classList.add('mal'); f.titulo.focus(); setTimeout(() => f.titulo.classList.remove('mal'), 600); return; }
    const d = { titulo, nota: f.nota.value.trim() || null, categoria: h.cat };
    const { t, fecha, rep, hasta } = h;
    const alcance = t && t.serie && siguientes(t).length ? h.alcance : 'serie';
    cerrarHoja();
    irA(fecha);
    if(!t){
      const fechas = fechasRepetidas(fecha, rep, hasta), serie = fechas.length > 1 ? crypto.randomUUID() : null;
      const filas = fechas.map(x => fila(x, d, serie));
      tareas.push(...filas); ordenar();
      if(fechas.length > 1) uiToast('Añadida en ' + fechas.length + ' días', 'success');
      return enviar(sb.from('calendario_tareas').insert(filas.map(sinMeta)), 'No se pudo añadir');
    }
    const ops = [];
    const cambiaRep = rep !== h.repIni || (rep && hasta !== h.hastaIni) || (rep && fecha !== t.fecha);
    if(alcance === 'una' || !cambiaRep){
      // Mismos días: se cambian los datos (y, en la serie, también en las siguientes).
      const delta = Math.round((deIso(fecha) - deIso(t.fecha)) / 864e5);
      const grupo = alcance === 'serie' && t.serie ? [t, ...siguientes(t)] : [t];
      grupo.forEach(x => { Object.assign(x, d); if(delta) x.fecha = masDias(x.fecha, delta); });
      if(alcance === 'una' && t.serie && rep !== h.repIni) t.serie = null;
      grupo.forEach(x => ops.push(sb.from('calendario_tareas').update({ ...d, fecha: x.fecha, serie: x.serie, updated_at: ahora() }).eq('id', x.id)));
    } else {
      // Cambia la repetición: se rehacen las siguientes desde el nuevo día
      // (las que ya estaban hechas en un día que sigue, siguen hechas).
      const viejas = siguientes(t), hechas = new Set(viejas.filter(x => x.hecho).map(x => x.fecha));
      const ids = new Set(viejas.map(x => x.id));
      tareas = tareas.filter(x => !ids.has(x.id));
      const fechas = fechasRepetidas(fecha, rep, hasta), serie = fechas.length > 1 ? (t.serie || crypto.randomUUID()) : null;
      Object.assign(t, d, { fecha, serie });
      const nuevas = fechas.slice(1).map(x => fila(x, d, serie, hechas.has(x)));
      tareas.push(...nuevas);
      if(ids.size) ops.push(sb.from('calendario_tareas').delete().in('id', [...ids]));
      ops.push(sb.from('calendario_tareas').update({ ...d, fecha, serie, updated_at: ahora() }).eq('id', t.id));
      if(nuevas.length) ops.push(sb.from('calendario_tareas').insert(nuevas.map(sinMeta)));
      if(nuevas.length || ids.size) uiToast(serie ? 'Ahora se repite en ' + fechas.length + ' días' : 'Ya no se repite', 'success');
    }
    ordenar();
    return enviar(Promise.all(ops).then(rs => rs.find(r => r.error) || {}), 'No se pudo guardar');
  }
  async function borrar(t){
    cerrarHoja();
    let todas = false;
    const sig = siguientes(t).length;
    if(sig) todas = await uiConfirm('¿Borrar también las siguientes?\n\nEsta tarea se repite: hay ' + sig + ' más después de este día.', { ok: 'Borrar todas', cancel: 'Solo esta', danger: true });
    const fuera = todas ? [t, ...siguientes(t)] : [t];
    const ids = new Set(fuera.map(x => x.id));
    tareas = tareas.filter(x => !ids.has(x.id));
    uiToast(fuera.length > 1 ? 'Borradas ' + fuera.length + ' tareas' : 'Tarea borrada', 'success', {
      action: 'Deshacer', onAction: () => { tareas.push(...fuera); ordenar(); enviar(sb.from('calendario_tareas').insert(fuera.map(sinMeta)), 'No se pudo recuperar'); }
    });
    return enviar(sb.from('calendario_tareas').delete().in('id', [...ids]), 'No se pudo borrar');
  }

  /* ---------- acciones ---------- */
  function marcar(t){
    if(!t) return;
    t.hecho = !t.hecho;
    if(t.hecho && t.fecha === hoy() && delDia(t.fecha).every(x => x.hecho)) uiToast('¡Todo hecho por hoy! 🎉', 'success');
    enviar(sb.from('calendario_tareas').update({ hecho: t.hecho, updated_at: new Date().toISOString() }).eq('id', t.id), 'No se pudo marcar');
  }
  function onClick(e){
    const el = e.target.closest('[data-cal]');
    if(!el) return;
    const t = el.dataset.id ? tareas.find(x => x.id === el.dataset.id) : null;
    switch(el.dataset.cal){
      case 'dia': {
        irA(el.dataset.f); pintar();
        break;
      }
      case 'mes': { const d = new Date(mes[0], mes[1] + Number(el.dataset.d), 1); mes = [d.getFullYear(), d.getMonth()]; pintar(); break; }
      case 'hoy': { elegido = hoy(); const d = deIso(elegido); mes = [d.getFullYear(), d.getMonth()]; pintar(); break; }
      case 'nueva': abrirHoja(); break;
      case 'editar': if(t) abrirHoja(t); break;
      case 'hecho': marcar(t); break;
      case 'a-hoy': if(t){ t.fecha = hoy(); ordenar(); enviar(sb.from('calendario_tareas').update({ fecha: t.fecha, updated_at: new Date().toISOString() }).eq('id', t.id), 'No se pudo mover'); } break;
      case 'todas-a-hoy': {
        e.preventDefault();
        const at = atrasadas(), h = hoy();
        at.forEach(x => { x.fecha = h; });
        ordenar(); elegido = h;
        enviar(sb.from('calendario_tareas').update({ fecha: h, updated_at: new Date().toISOString() }).in('id', at.map(x => x.id)), 'No se pudieron mover');
        break;
      }
      case 'ir': if(IR[el.dataset.k]) showScreen(IR[el.dataset.k]); break;
    }
  }

  function abrir(){
    const root = document.getElementById('calRoot');
    if(root && !root.dataset.listo){ root.dataset.listo = '1'; root.addEventListener('click', onClick); }
    // Al volver a la pestaña otro día, se parte de hoy.
    if(abrir.dia !== hoy()){ abrir.dia = hoy(); elegido = hoy(); mes = null; }
    if(dueño !== yo()){ tareas = []; cargado = false; }
    pintar();
    cargar();
  }
  /* ---------- resumen para la pantalla de Inicio ---------- */
  // Carga las tareas si aún no están (sin abrir el calendario).
  function asegurar(){
    if(dueño !== yo()){ tareas = []; cargado = false; }
    if(!cargado && !cargando) cargar();
  }
  // null mientras no hay nada que enseñar (cargando por primera vez).
  function resumenHoy(){
    if(!yo() || dueño !== yo() || (!cargado && !tareas.length && cargando)) return null;
    const h = hoy(), lista = delDia(h);
    return {
      lista: lista.map(t => ({ id: t.id, titulo: t.titulo, nota: t.nota, hecho: t.hecho, cat: CAT[t.categoria].n, color: CAT[t.categoria].c, icono: ICONO[t.categoria] })),
      hechas: lista.filter(t => t.hecho).length,
      racha: racha(),
      atrasadas: atrasadas().length,
      manana: delDia(masDias(h, 1)).length
    };
  }
  function marcarId(id){ marcar(tareas.find(x => x.id === id)); }
  return { abrir, recargar: cargar, asegurar, resumenHoy, marcar: marcarId, nueva: () => { elegido = hoy(); mes = null; abrirHoja(); } };
})();
