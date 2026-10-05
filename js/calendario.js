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
  const CAT = Object.fromEntries(CATS.map(([k, n, c]) => [k, { n, c }]));
  // Desde la tarea se puede saltar a su apartado.
  const IR = { normativas: 'screen-normativas', legislacion: 'screen-home', callejero: 'screen-callejero', test: 'screen-home' };
  const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const FRASES = ['Día libre. Si te apetece, apunta algo.', 'Nada apuntado para este día.', 'Hueco libre: buen momento para un repaso.'];

  let tareas = [], cargado = false, cargando = null, dueño = null;
  let mes = null, elegido = null, hoja = null;

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
        : IR[t.categoria] && !t.hecho ? '<button class="cal-ir" data-cal="ir" data-k="' + t.categoria + '" aria-label="Ir a ' + esc(c.n) + '">›</button>' : '') +
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
  function proximos(){
    const h = hoy(), fs = [...new Set(tareas.filter(t => t.fecha > h && t.fecha !== elegido).map(t => t.fecha))].slice(0, 5);
    if(!fs.length) return '';
    return '<div class="cal-prox"><div class="cal-sec">Próximos días</div>' + fs.map(f => {
      const ts = delDia(f);
      return '<button class="cal-prox-fila" data-cal="dia" data-f="' + f + '"><span class="cal-prox-f"><b>' + deIso(f).getDate() + '</b>' + MESES[deIso(f).getMonth()].slice(0, 3) + '</span>' +
        '<span class="cal-prox-t">' + ts.slice(0, 3).map(t => '<span style="--c:' + CAT[t.categoria].c + '">' + esc(t.titulo) + '</span>').join('') + (ts.length > 3 ? '<em>y ' + (ts.length - 3) + ' más</em>' : '') + '</span></button>';
    }).join('') + '</div>';
  }
  function pintar(){
    const root = document.getElementById('calRoot');
    if(!root || !document.getElementById('screen-calendario').classList.contains('active')) return;
    if(!elegido) elegido = hoy();
    if(!mes){ const d = deIso(elegido); mes = [d.getFullYear(), d.getMonth()]; }
    if(!cargado && !tareas.length && cargando){ root.innerHTML = '<div class="cal-cargando">Cargando tu calendario…</div>'; return; }
    root.innerHTML = cabecera() + '<div class="cal-cuerpo"><div class="cal-col">' + rejilla() + '</div><div class="cal-col">' + dia() + bloqueAtrasadas() + proximos() + '</div></div>';
  }

  /* ---------- hoja para añadir o editar ---------- */
  function abrirHoja(t){
    const nueva = !t;
    t = t || { titulo: '', nota: '', categoria: (hoja && hoja.ultimaCat) || 'normativas', fecha: elegido };
    cerrarHoja();
    const bg = document.createElement('div');
    bg.className = 'cal-hoja-bg';
    bg.id = 'calHoja';
    bg.innerHTML = '<form class="cal-hoja" autocomplete="off"><div class="cal-hoja-asa"></div>' +
      '<h3>' + (nueva ? 'Nueva tarea' : 'Editar tarea') + '</h3>' +
      '<input class="cal-in cal-in-t" name="titulo" maxlength="200" required placeholder="¿Qué toca? Ej.: Tema 4, fichas de EPIs…" value="' + esc(t.titulo) + '">' +
      '<div class="cal-cats">' + CATS.map(([k, n, c]) => '<button type="button" class="cal-cat-op' + (k === t.categoria ? ' on' : '') + '" data-k="' + k + '" style="--c:' + c + '"><i></i>' + n + '</button>').join('') + '</div>' +
      '<label class="cal-lbl">Día<input class="cal-in" type="date" name="fecha" required value="' + t.fecha + '"></label>' +
      '<textarea class="cal-in" name="nota" rows="2" maxlength="1000" placeholder="Nota (opcional): páginas, artículos, cuántos tests…">' + esc(t.nota || '') + '</textarea>' +
      (nueva ? '<div class="cal-rep-fila"><label class="cal-lbl">Repetir<select class="cal-in" name="rep">' +
          '<option value="">No</option><option value="1">Cada día</option><option value="lab">De lunes a viernes</option><option value="7">Cada semana</option></select></label>' +
          '<label class="cal-lbl cal-hasta hidden">Hasta<input class="cal-in" type="date" name="hasta" value="' + masDias(t.fecha, 27) + '"></label></div>' : '') +
      '<div class="cal-hoja-acts">' +
        (nueva ? '' : '<button type="button" class="cal-btn peligro" data-h="borrar">Borrar</button>') +
        '<span></span><button type="button" class="cal-btn" data-h="cerrar">Cancelar</button><button type="submit" class="cal-btn primario">' + (nueva ? 'Añadir' : 'Guardar') + '</button></div></form>';
    document.body.appendChild(bg);
    hoja = Object.assign(hoja || {}, { t: nueva ? null : t, cat: t.categoria });
    const f = bg.querySelector('form');
    bg.addEventListener('click', e => {
      if(e.target === bg) return cerrarHoja();
      const op = e.target.closest('.cal-cat-op');
      if(op){ hoja.cat = op.dataset.k; f.querySelectorAll('.cal-cat-op').forEach(b => b.classList.toggle('on', b === op)); }
      const h = e.target.closest('[data-h]');
      if(h && h.dataset.h === 'cerrar') cerrarHoja();
      if(h && h.dataset.h === 'borrar') borrar(t);
    });
    if(f.rep) f.rep.addEventListener('change', () => f.querySelector('.cal-hasta').classList.toggle('hidden', !f.rep.value));
    f.addEventListener('submit', e => { e.preventDefault(); guardar(f); });
    document.addEventListener('keydown', teclaHoja, true);
    requestAnimationFrame(() => bg.classList.add('on'));
    if(nueva && matchMedia('(hover: hover)').matches) setTimeout(() => f.titulo.focus(), 60);
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
  async function guardar(f){
    const titulo = f.titulo.value.trim(), nota = f.nota.value.trim() || null, fecha = f.fecha.value, cat = hoja.cat;
    if(!titulo || !fecha) return;
    hoja.ultimaCat = cat;
    const t = hoja.t;
    cerrarHoja();
    if(t){
      Object.assign(t, { titulo, nota, fecha, categoria: cat });
      ordenar();
      elegido = fecha; const d = deIso(fecha); mes = [d.getFullYear(), d.getMonth()];
      return enviar(sb.from('calendario_tareas').update({ titulo, nota, fecha, categoria: cat, updated_at: new Date().toISOString() }).eq('id', t.id), 'No se pudo guardar');
    }
    const fechas = fechasRepetidas(fecha, f.rep && f.rep.value, f.hasta && f.hasta.value);
    const serie = fechas.length > 1 ? crypto.randomUUID() : null;
    const filas = fechas.map(x => ({ id: crypto.randomUUID(), user_id: yo(), fecha: x, titulo, nota, categoria: cat, hecho: false, serie,
      orden: delDia(x).length, created_at: new Date().toISOString() }));
    tareas.push(...filas); ordenar();
    elegido = fecha; const d = deIso(fecha); mes = [d.getFullYear(), d.getMonth()];
    if(fechas.length > 1) uiToast('Añadida en ' + fechas.length + ' días', 'success');
    return enviar(sb.from('calendario_tareas').insert(filas.map(({ created_at, ...r }) => r)), 'No se pudo añadir');
  }
  async function borrar(t){
    cerrarHoja();
    let todas = false;
    if(t.serie){
      const sig = tareas.filter(x => x.serie === t.serie && x.fecha > t.fecha).length;
      if(sig) todas = await uiConfirm('¿Borrar también las siguientes?\n\nEsta tarea se repite: hay ' + sig + ' más después de este día.', { ok: 'Borrar todas', cancel: 'Solo esta', danger: true });
    }
    const fuera = todas ? tareas.filter(x => x.serie === t.serie && x.fecha >= t.fecha) : [t];
    const ids = new Set(fuera.map(x => x.id));
    tareas = tareas.filter(x => !ids.has(x.id));
    uiToast(fuera.length > 1 ? 'Borradas ' + fuera.length + ' tareas' : 'Tarea borrada', 'success', {
      action: 'Deshacer', onAction: () => { tareas.push(...fuera); ordenar(); enviar(sb.from('calendario_tareas').insert(fuera.map(({ created_at, ...r }) => r)), 'No se pudo recuperar'); }
    });
    return enviar(sb.from('calendario_tareas').delete().in('id', [...ids]), 'No se pudo borrar');
  }

  /* ---------- acciones ---------- */
  function onClick(e){
    const el = e.target.closest('[data-cal]');
    if(!el) return;
    const t = el.dataset.id ? tareas.find(x => x.id === el.dataset.id) : null;
    switch(el.dataset.cal){
      case 'dia': {
        elegido = el.dataset.f; const d = deIso(elegido); mes = [d.getFullYear(), d.getMonth()]; pintar();
        if(el.classList.contains('cal-prox-fila')) document.querySelector('.cal-dia-cab').scrollIntoView({ behavior: 'smooth', block: 'start' });
        break;
      }
      case 'mes': { const d = new Date(mes[0], mes[1] + Number(el.dataset.d), 1); mes = [d.getFullYear(), d.getMonth()]; pintar(); break; }
      case 'hoy': { elegido = hoy(); const d = deIso(elegido); mes = [d.getFullYear(), d.getMonth()]; pintar(); break; }
      case 'nueva': abrirHoja(); break;
      case 'editar': if(t) abrirHoja(t); break;
      case 'hecho': {
        if(!t) return;
        t.hecho = !t.hecho;
        if(t.hecho && t.fecha === hoy() && delDia(t.fecha).every(x => x.hecho)) uiToast('¡Todo hecho por hoy! 🎉', 'success');
        enviar(sb.from('calendario_tareas').update({ hecho: t.hecho, updated_at: new Date().toISOString() }).eq('id', t.id), 'No se pudo marcar');
        break;
      }
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
  return { abrir, recargar: cargar };
})();
