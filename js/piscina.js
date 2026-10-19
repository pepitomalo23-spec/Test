/* Piscina: dejar programadas las reservas de la piscina de IMDECO (PMD
   Vista Alegre). Solo administradores. Se elige día y hora y se guarda en
   piscina_reservas; el robot de GitHub Actions (reserva-piscina/) entra en
   la web de IMDECO a las 00:00 de dos días antes, la reserva y apunta aquí
   cómo fue (reservada / fallida). Copia en el dispositivo para pintar al
   momento. */
const PISCINA = (function(){
  const CACHE = 'pj_piscina_v1:';
  const IMDECO = 'https://gestiones.imdcordoba.es/CronosWeb/Login';
  const FRANJAS = [
    ['Mañana', ['08:00', '09:00']],
    ['Mediodía', ['13:00', '14:00', '15:00']],
    ['Noche', ['22:00']]
  ];
  const ANTELACION = 2;                 // el día D se abre a las 00:00 de D-2
  const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const svg = (d, cls) => '<svg class="' + (cls || 'psc-ico') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + '</svg>';
  const OLAS = svg('<path d="M2 6c.6.5 1.2 1 2.5 1C7 7 7 5 9.5 5c2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/><path d="M2 12c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/><path d="M2 18c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/>');
  const RELOJ = svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>', 'psc-ico-s');
  const PIN = svg('<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>', 'psc-ico-s');
  const BONO = svg('<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>', 'psc-ico-s');
  const IZQ = svg('<path d="m15 18-6-6 6-6"/>', 'psc-ico-s');
  const DER = svg('<path d="m9 18 6-6-6-6"/>', 'psc-ico-s');
  const PAPELERA = svg('<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/>', 'psc-ico-s');
  const CHECK = '<svg viewBox="0 0 52 52" aria-hidden="true"><circle class="psc-ok-aro" cx="26" cy="26" r="24"/><path class="psc-ok-v" d="M15 27l7 7 15-15"/></svg>';

  let filas = [], cargado = false, cargando = null, dueño = null, intentado = false;
  let mes = null, elegido = null, horaElegida = null, guardando = false, hecho = null, reprog = null;

  /* ---------- fechas (hora local, 'AAAA-MM-DD') ---------- */
  const dos = n => String(n).padStart(2, '0');
  const iso = d => d.getFullYear() + '-' + dos(d.getMonth() + 1) + '-' + dos(d.getDate());
  const deIso = s => { const [a, m, d] = s.split('-').map(Number); return new Date(a, m - 1, d); };
  const hoy = () => iso(new Date());
  const masDias = (s, n) => { const d = deIso(s); d.setDate(d.getDate() + n); return iso(d); };
  const entre = (a, b) => Math.round((deIso(b) - deIso(a)) / 864e5);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
  const largo = s => { const d = deIso(s); return DIAS[d.getDay()] + ' ' + d.getDate() + ' de ' + MESES[d.getMonth()]; };
  const corto = s => { const d = deIso(s); return DIAS[d.getDay()].slice(0, 3) + ' ' + d.getDate(); };
  const finHora = h => dos(+h.slice(0, 2) + 1) + ':00';
  // El primer día que el robot aún llega a reservar: el que se abre la próxima medianoche (D-2),
  // salvo que falte menos de media hora (el robot ya habrá mirado la lista a las 23:35).
  function primerDia(){
    const ahora = new Date();
    const tarde = ahora.getHours() === 23 && ahora.getMinutes() >= 30;
    return masDias(hoy(), ANTELACION + 1 + (tarde ? 1 : 0));
  }
  const deDia = f => filas.find(r => r.fecha === f);

  /* ---------- datos ---------- */
  function leerCache(){
    try{ const c = JSON.parse(localStorage.getItem(CACHE + currentUser.id) || 'null'); if(Array.isArray(c)) filas = c; }catch(e){}
  }
  function guardarCache(){ try{ localStorage.setItem(CACHE + currentUser.id, JSON.stringify(filas)); }catch(e){} }
  function cargar(){
    if(!currentUser || !currentUserIsAdmin) return Promise.resolve();
    if(dueño !== currentUser.id){ dueño = currentUser.id; filas = []; cargado = false; leerCache(); }
    intentado = true;
    if(!cargando) cargando = sb.from('piscina_reservas').select('id, fecha, hora, estado, detalle, calle, quiere_hora, anular, updated_at')
      .gte('fecha', masDias(hoy(), -60)).order('fecha')
      .then(({ data, error }) => {
        if(error) throw error;
        filas = data || []; cargado = true; guardarCache();
      })
      .catch(e => { console.warn('piscina', e); })
      .finally(() => { cargando = null; pintar(); if(typeof INICIO !== 'undefined') INICIO.pintar(); });
    return cargando;
  }

  /* ---------- pintar ---------- */
  function cabeceraInfo(){
    return '<div class="psc-info">' +
      '<div class="psc-info-ico">' + OLAS + '</div>' +
      '<h2 class="psc-info-t">Piscina</h2>' +
      '<p class="psc-info-p">Elige el día y la hora. El robot la reserva solo en IMDECO a las 00:00, dos días antes.</p>' +
      '<ul class="psc-info-l"><li>' + PIN + 'PMD Vista Alegre</li><li>' + RELOJ + '1 hora</li><li>' + BONO + 'Con tu abono</li></ul>' +
      '</div>';
  }
  function calendario(){
    const min = primerDia(), h = hoy();
    const d0 = new Date(mes.getFullYear(), mes.getMonth(), 1);
    const desfase = (d0.getDay() + 6) % 7; // lunes primero
    const diasMes = new Date(mes.getFullYear(), mes.getMonth() + 1, 0).getDate();
    const mesHoy = new Date(); mesHoy.setDate(1);
    const puedeAtras = d0 > new Date(mesHoy.getFullYear(), mesHoy.getMonth(), 1);
    let celdas = '';
    for(let i = 0; i < desfase; i++) celdas += '<span class="psc-dia vacio"></span>';
    for(let n = 1; n <= diasMes; n++){
      const f = iso(new Date(mes.getFullYear(), mes.getMonth(), n));
      const r = deDia(f), abierto = f >= h && f < min, pasado = f < h;
      const cls = ['psc-dia'];
      if(f === h) cls.push('hoy');
      if(f === elegido) cls.push('sel');
      if(pasado) cls.push('pasado');
      if(abierto) cls.push('abierto');
      if(r) cls.push('con', r.estado);
      const usable = !pasado && (!abierto || r);
      const titulo = r ? (r.estado === 'reservada' ? 'Reservada a las ' + r.hora : r.estado === 'fallida' ? 'No se pudo reservar' : 'Programada a las ' + r.hora)
        : abierto ? 'Ya está abierto: resérvalo en IMDECO' : '';
      celdas += '<button type="button" class="' + cls.join(' ') + '" data-psc="dia" data-f="' + f + '"' + (usable ? '' : ' disabled') +
        (titulo ? ' title="' + esc(titulo) + '"' : '') + '><span>' + n + '</span></button>';
    }
    return '<div class="psc-cal">' +
      '<div class="psc-col-t">Elige día y hora</div>' +
      '<div class="psc-mes"><span>' + MESES[mes.getMonth()] + ' ' + mes.getFullYear() + '</span>' +
        '<span class="psc-mes-nav"><button type="button" data-psc="mes" data-d="-1" aria-label="Mes anterior"' + (puedeAtras ? '' : ' disabled') + '>' + IZQ + '</button>' +
        '<button type="button" data-psc="mes" data-d="1" aria-label="Mes siguiente">' + DER + '</button></span></div>' +
      '<div class="psc-sem">' + ['lu', 'ma', 'mi', 'ju', 'vi', 'sá', 'do'].map(x => '<span>' + x + '</span>').join('') + '</div>' +
      '<div class="psc-dias">' + celdas + '</div>' +
      '<div class="psc-nota">Hasta el ' + corto(masDias(min, -1)) + ' ya está abierto: eso, a mano en <a href="' + IMDECO + '" target="_blank" rel="noopener">IMDECO</a>.</div>' +
      '</div>';
  }
  // Otra reserva a 2 días o menos: IMDECO solo deja una pendiente a la vez, así que puede fallar.
  function choque(f){
    return filas.find(r => r.fecha !== f && r.estado !== 'fallida' && Math.abs(entre(r.fecha, f)) <= ANTELACION && r.fecha >= hoy());
  }
  function horas(){
    if(!elegido) return '<div class="psc-horas"><div class="psc-horas-vacio">Elige un día en el calendario</div></div>';
    const r = deDia(elegido);
    let cab = '<div class="psc-horas-t">' + cap(largo(elegido)) + '</div>';
    if(r && r.estado !== 'programada' && reprog !== elegido){
      const ok = r.estado === 'reservada';
      return '<div class="psc-horas">' + cab +
        '<div class="psc-estado ' + r.estado + '"><b>' + (ok ? '✓ Reservada' : '✕ No se pudo reservar') + '</b>' +
        '<span>' + r.hora + ' – ' + finHora(r.hora) + (r.calle ? ' · ' + esc(r.calle) : '') + '</span>' +
        (r.detalle && !ok ? '<span class="psc-estado-det">' + esc(r.detalle) + '</span>' : '') + '</div>' +
        (ok && r.fecha >= hoy() ? (r.anular ? '<div class="psc-aviso">El robot la está anulando en IMDECO…</div>'
          : '<button type="button" class="psc-btn-borrar" data-psc="anular" data-id="' + esc(r.id) + '">' + PAPELERA + 'Anular en IMDECO</button>') : '') +
        (r.fecha >= primerDia() ? '<button type="button" class="psc-btn-sec" data-psc="reprogramar">Volver a programar</button>' : '') +
        '<button type="button" class="psc-btn-borrar" data-psc="borrar" data-id="' + esc(r.id) + '">' + PAPELERA + 'Quitar de la lista</button></div>';
    }
    const prog = r && r.estado === 'programada' ? r : null; // la hora que ya tiene programada
    cab += '<div class="psc-horas-sub">' + (prog ? 'Programada a las ' + prog.hora + ' · toca otra hora para cambiarla' : '6 horas · 1 h cada una') + '</div>';
    const c = choque(elegido);
    const aviso = c ? '<div class="psc-aviso">Ojo: el ' + corto(c.fecha) + ' ya tienes otra. IMDECO solo deja una reserva pendiente a la vez, así que esta puede fallar.</div>' : '';
    const lista = FRANJAS.map(([nom, hs]) => '<div class="psc-franja">' + nom + '</div>' + hs.map(hh => {
      const actual = prog && prog.hora === hh, sel = horaElegida === hh;
      if(sel && !actual) return '<div class="psc-hora-par"><button type="button" class="psc-hora sel" data-psc="hora" data-h="' + hh + '">' + hh + '</button>' +
        '<button type="button" class="psc-confirmar" data-psc="confirmar"' + (guardando ? ' disabled' : '') + '>' + (guardando ? 'Guardando…' : 'Confirmar') + '</button></div>';
      return '<button type="button" class="psc-hora' + (actual ? ' actual' : '') + '" data-psc="hora" data-h="' + hh + '">' + hh + (actual ? '<small>programada</small>' : '') + '</button>';
    }).join('')).join('');
    return '<div class="psc-horas">' + cab + aviso + '<div class="psc-horas-l">' + lista + '</div>' +
      (r ? '<button type="button" class="psc-btn-borrar" data-psc="borrar" data-id="' + esc(r.id) + '">' + PAPELERA + 'Quitar este día</button>' : '') + '</div>';
  }
  function exito(){
    const f = hecho.fecha, abre = masDias(f, -ANTELACION);
    return '<div class="psc-ok">' + CHECK +
      '<div class="psc-ok-t">' + (hecho.cambio ? 'Cambiado' : 'Programado') + '</div>' +
      '<div class="psc-ok-s">' + cap(largo(f)) + ' · ' + hecho.hora + ' – ' + finHora(hecho.hora) + '</div>' +
      '<div class="psc-ok-n">El robot la reservará el ' + largo(abre) + ' a las 00:00</div>' +
      '<button type="button" class="psc-confirmar" data-psc="otro">Programar otro día</button></div>';
  }
  // El robot no la coge porque IMDECO la cobra (el bono no la cubre)
  const dePago = r => !!(r && r.quiere_hora && /^De pago/.test(r.detalle || ''));
  function chip(r){
    if(dePago(r) && r.fecha >= hoy()) return '<span class="psc-chip fallida">De pago</span>';
    if(r.anular && r.estado === 'reservada') return '<span class="psc-chip vigilando">Anulando…</span>';
    if(r.estado === 'fallida' && r.detalle === 'Anulada') return '<span class="psc-chip fallida">Anulada</span>';
    if(r.quiere_hora && r.fecha >= hoy()) return '<span class="psc-chip vigilando">Vigilando ' + r.quiere_hora + '</span>';
    const fue = r.estado === 'reservada' && r.detalle === 'Asistido';
    const t = fue ? 'Asistida' : { programada: 'Programada', reservada: 'Reservada', fallida: 'No se pudo' }[r.estado];
    return '<span class="psc-chip ' + r.estado + (fue ? ' asistida' : '') + '">' + t + '</span>';
  }
  function lista(){
    const h = hoy();
    const prox = filas.filter(r => r.fecha >= h), antes = filas.filter(r => r.fecha < h).reverse().slice(0, 8);
    const fila = r => '<div class="psc-fila" role="button" tabindex="0" data-psc="ir" data-f="' + r.fecha + '">' +
      '<span class="psc-fila-dia"><b>' + deIso(r.fecha).getDate() + '</b><small>' + MESES[deIso(r.fecha).getMonth()].slice(0, 3) + '</small></span>' +
      '<span class="psc-fila-txt"><b>' + cap(DIAS[deIso(r.fecha).getDay()]) + ' · ' + r.hora + ' – ' + finHora(r.hora) + '</b>' +
        '<span>' + (dePago(r) && r.fecha >= hoy() ? esc(r.detalle) : r.quiere_hora && r.fecha >= hoy() ? (r.estado === 'reservada' ? 'Tienes las ' + r.hora + (r.calle ? ' (' + esc(r.calle) + ')' : '') + ' · si se liberan las ' + r.quiere_hora + ', te cambio' : (otraEnVigor(r.fecha) ? 'La cojo a las ' + r.quiere_hora + ' cuando pase tu reserva del ' + corto(otraEnVigor(r.fecha).fecha) : hayLibres(r.fecha, r.quiere_hora) ? 'Hay sitio a las ' + r.quiere_hora + ': el robot la está cogiendo' : 'En cuanto haya sitio a las ' + r.quiere_hora + ', la cojo')) + (r.detalle && r.detalle !== 'Asistido' ? ' · ' + esc(r.detalle) : '') :
          r.estado === 'programada' ? (r.fecha >= primerDia() ? 'Se reserva el ' + corto(masDias(r.fecha, -ANTELACION)) + ' a las 00:00' : 'Esta noche o ya abierto') :
          r.anular && r.estado === 'reservada' ? 'El robot la está anulando en IMDECO' :
          r.estado === 'reservada' ? (r.calle ? esc(r.calle) : 'Hecha') : esc((r.detalle || '').slice(0, 90))) + '</span></span>' +
      chip(r) + '</div>';
    return '<div class="psc-lista"><div class="psc-lista-t">Próximas</div>' +
      (prox.length ? prox.map(fila).join('') : '<div class="psc-lista-vacia">Nada programado todavía.</div>') +
      (antes.length ? '<details class="psc-antes"><summary>Anteriores</summary>' + antes.map(fila).join('') + '</details>' : '') +
      '</div>';
  }
  /* Todo en una pantalla, sin deslizar: arriba lo tuyo de los próximos días y los huecos de
     ahora. Lo demás (programar un día, todas tus reservas, las liberadas, cómo funciona), en
     botones que lo abren en una ventana. */
  let ventana = null;   // 'programar' | 'lista' | 'liberadas' | 'info'
  function proximas(){
    const h = hoy();
    const xs = filas.filter(r => r.fecha >= h && !(r.estado === 'fallida' && r.detalle === 'Anulada')).slice(0, 4);
    if(!xs.length) return cargado ? '<div class="psc-mias-vacio">No tienes nada reservado ni programado.</div>' : '<span class="skel" style="width:40%;height:16px"></span>';
    return xs.map(r => '<button type="button" class="psc-mia ' + r.estado + '" data-psc="ir" data-f="' + r.fecha + '">' +
      '<b>' + cap(corto(r.fecha)) + ' · ' + r.hora + '</b>' + chip(r) + '</button>').join('');
  }
  function pintar(){
    const root = document.getElementById('piscinaRoot');
    if(!root || !document.getElementById('screen-piscina').classList.contains('active')) return;
    if(!currentUserIsAdmin){ root.innerHTML = '<div class="psc-lista-vacia">Esta pantalla es solo para administradores.</div>'; return; }
    const n = filas.filter(r => r.fecha >= hoy()).length;
    root.innerHTML = '<div class="psc-top"><div class="psc-top-t">' + OLAS + '<h2>Piscina</h2></div>' +
        '<div class="psc-top-bts"><button type="button" class="psc-tb primario" data-psc="v-programar">+ Programar día</button>' +
        '<button type="button" class="psc-tb" data-psc="v-lista">Mis reservas' + (n ? ' <em>' + n + '</em>' : '') + '</button>' +
        '<button type="button" class="psc-tb redondo" data-psc="v-info" aria-label="Cómo funciona">?</button></div></div>' +
      '<div class="psc-mias">' + proximas() + '</div>' +
      '<div class="psc-huecos" id="pscHuecos">' + seccionHuecos() + '</div>';
    pintarVentana();
  }
  function contenidoVentana(){
    if(ventana === 'programar') return ['Programar un día', 'El robot la reserva a las 00:00, dos días antes',
      '<div class="psc-cuerpo' + (hecho ? ' psc-cuerpo-ok' : '') + '">' + (hecho ? exito() : calendario() + horas()) + '</div>'];
    if(ventana === 'lista') return ['Mis reservas', 'Las de IMDECO y las programadas', cargado || filas.length ? lista() : '<span class="skel" style="width:50%;height:16px"></span>'];
    if(ventana === 'liberadas') return ['Se han liberado', 'Calles que alguien ha anulado en las últimas horas', liberadasHtml(99) || '<div class="psc-lista-vacia">Nada liberado últimamente.</div>'];
    return ['Cómo funciona', 'PMD Vista Alegre · 1 h · con tu abono', cabeceraInfo() +
      '<ul class="psc-ayuda"><li><b>Programar día:</b> eliges día y hora y el robot la reserva a las 00:00, dos días antes.</li>' +
      '<li><b>Huecos ahora:</b> las calles libres de hoy, mañana y pasado (se actualiza cada 30 s).</li>' +
      '<li><b>Cógemela / Cogerla si se libera:</b> el robot la reserva en cuanto hay sitio. Si ese día ya tenías otra hora, la cambia.</li>' +
      '<li><b>Anular en IMDECO:</b> en tu reserva; lo hace el robot.</li>' +
      '<li>IMDECO solo deja una reserva en vigor a la vez, y el robot nunca compra una hora de pago.</li></ul>'];
  }
  function pintarVentana(){
    let bg = document.getElementById('pscVentana');
    if(!ventana || !document.getElementById('screen-piscina').classList.contains('active')){ if(bg) bg.remove(); ventana = null; return; }
    const [t, sub, cuerpo] = contenidoVentana();
    if(!bg){
      bg = document.createElement('div');
      bg.className = 'cal-hoja-bg psc-ventana-bg'; bg.id = 'pscVentana';
      bg.addEventListener('click', e => {
        if(e.target === bg || e.target.closest('[data-psc="v-cerrar"]')){ ventana = null; hecho = null; pintarVentana(); return; }
        onClick(e);
      });
      document.body.appendChild(bg);
      requestAnimationFrame(() => bg.classList.add('on'));
    }
    const scroll = bg.querySelector('.cal-hoja-cuerpo')?.scrollTop || 0;
    bg.innerHTML = '<div class="cal-hoja psc-ventana' + (ventana === 'programar' ? ' ancha' : '') + '" style="--c: var(--blue)" role="dialog" aria-modal="true" aria-label="' + esc(t) + '">' +
      '<div class="cal-hoja-top"><div class="cal-hoja-asa"></div><div class="cal-hoja-cab"><div class="cal-hoja-tit"><h3>' + esc(t) + '</h3><div class="cal-hoja-sub">' + esc(sub) + '</div></div>' +
      '<button type="button" class="cal-x" data-psc="v-cerrar" aria-label="Cerrar">✕</button></div></div>' +
      '<div class="cal-hoja-cuerpo">' + cuerpo + '</div></div>';
    bg.querySelector('.cal-hoja-cuerpo').scrollTop = scroll;
  }
  function abrirVentana(v){ ventana = v; if(v !== 'programar') hecho = null; pintarVentana(); }

  /* ---------- huecos ahora en IMDECO (función piscina-huecos) ----------
     Hoy, mañana y pasado: cuántas calles libres hay a cada hora, y las que
     se acaban de liberar (alguien anuló). Se pide cada 30 s mientras la
     pantalla está abierta y a la vista. */
  const REFRESCO = 30000;
  let huecos = null, huecosError = null, huecosCargando = false, diaHuecos = 0, horaHuecos = null, temporizador = null;
  async function cargarHuecos(){
    if(huecosCargando || !currentUserIsAdmin) return;
    huecosCargando = true; pintarHuecos();
    try{
      // IMDECO a veces tarda o corta: un segundo intento antes de dar error
      let r = null;
      for(let i = 0; i < 2; i++){
        r = await sb.functions.invoke('piscina-huecos', { body: {} });
        if(!r.error && r.data && !r.data.error) break;
        if(i === 0) await new Promise(ok => setTimeout(ok, 2500));
      }
      if(r.error) throw r.error;
      if(r.data && r.data.error) throw new Error(r.data.error);
      huecos = r.data; huecosError = r.data.aviso || null;
    }catch(e){ huecosError = 'No se pudo consultar IMDECO' + (huecos ? ' (se ve lo último que hubo)' : ''); console.warn('piscina-huecos', e); }
    huecosCargando = false; pintarHuecos();
  }
  function hace(iso){
    const s = Math.max(0, Math.round((Date.now() - new Date(iso)) / 1000));
    return s < 10 ? 'ahora mismo' : s < 60 ? 'hace ' + s + ' s' : s < 3600 ? 'hace ' + Math.round(s / 60) + ' min' : 'hace ' + Math.round(s / 3600) + ' h';
  }
  function liberadasHtml(max){
    return ((huecos && huecos.liberados) || []).slice(0, max).map(l => '<div class="psc-lib"><span class="psc-lib-punto"></span><span><b>Se ha liberado</b> ' +
      nombreRel(l.fecha).toLowerCase() + ' a las ' + esc(l.hora) + ' · ' + esc(l.calle) + '</span><small>' + hace(l.visto) + '</small></div>').join('');
  }
  const nombreRel = f => f === hoy() ? 'Hoy' : f === masDias(hoy(), 1) ? 'Mañana' : cap(DIAS[deIso(f).getDay()]);
  function seccionHuecos(){
    if(!huecos) return '<div class="psc-hc-t"><b>Huecos ahora</b><span>' + (huecosError ? esc(huecosError) : 'Consultando IMDECO…') + '</span></div>' +
      (huecosError ? '' : '<div class="psc-hc-horas">' + '<span class="skel" style="height:58px"></span>'.repeat(6) + '</div>');
    const dias = huecos.dias || [];
    const d = dias[Math.min(diaHuecos, dias.length - 1)];
    const ahoraH = new Date().toTimeString().slice(0, 5);
    const libs = (huecos.liberados || []);
    const avisos = libs.length ? '<button type="button" class="psc-lib-btn" data-psc="v-liberadas"><span class="psc-lib-punto"></span><b>' + libs.length + (libs.length === 1 ? ' liberada' : ' liberadas') + '</b>' +
      '<span>la última ' + nombreRel(libs[0].fecha).toLowerCase() + ' a las ' + esc(libs[0].hora) + ', ' + hace(libs[0].visto) + '</span></button>' : '';
    const tabs = dias.map((x, i) => {
      const n = x.horas.filter(h => !(x.fecha === hoy() && h.hora <= ahoraH)).reduce((a, h) => a + h.libres.length, 0);
      return '<button type="button" class="psc-hc-tab' + (x === d ? ' sel' : '') + '" data-psc="hc-dia" data-i="' + i + '">' + nombreRel(x.fecha) + ' <small>' + deIso(x.fecha).getDate() + '</small><em>' + n + '</em></button>';
    }).join('');
    const horasHtml = d ? d.horas.map(h => {
      const pasada = d.fecha === hoy() && h.hora <= ahoraH;
      const n = h.libres.length, recien = libs.some(l => l.fecha === d.fecha && l.hora === h.hora);
      const mia = deDia(d.fecha), tuya = mia && mia.estado === 'reservada' && mia.hora === h.hora, vigilo = mia && mia.quiere_hora === h.hora;
      const cls = pasada ? 'pasada' : n ? (n <= 2 ? 'pocas' : 'libre') : 'llena';
      return '<button type="button" class="psc-hc-hora ' + cls + (recien && !pasada ? ' recien' : '') + (horaHuecos === h.hora ? ' sel' : '') + '" data-psc="hc-hora" data-h="' + h.hora + '"' + (pasada ? ' disabled' : '') + '>' +
        '<b>' + h.hora + '</b><span>' + (pasada ? 'pasada' : n ? n + (n === 1 ? ' libre' : ' libres') : 'completo') + '</span>' +
        (tuya ? '<i class="psc-hc-marca tuya">la tuya</i>' : vigilo ? (dePago(mia) ? '<i class="psc-hc-marca pago">de pago</i>' : '<i class="psc-hc-marca vigilo">vigilando</i>') : '') + '</button>';
    }).join('') : '';
    const sel = d && horaHuecos && d.horas.find(h => h.hora === horaHuecos);
    const detalle = sel ? '<div class="psc-hc-det">' + (sel.libres.length
      ? '<b>' + sel.libres.length + ' de ' + sel.total + ' libres a las ' + sel.hora + ':</b> ' + sel.libres.map(esc).join(', ')
      : 'A las ' + sel.hora + ' está todo ocupado' + ((deDia(d.fecha) || {}).estado === 'reservada' && deDia(d.fecha).hora === sel.hora ? ' (una calle es la tuya).' : '.')) + ' <a href="' + IMDECO + '" target="_blank" rel="noopener">Reservar en IMDECO ›</a>' + accionHora(d.fecha, sel) + '</div>' : '';
    return '<div class="psc-hc-t"><b>Huecos ahora</b><span>' + (huecosCargando ? 'Actualizando…' : 'Actualizado ' + hace(huecos.actualizado)) +
        (huecosError ? ' · ' + esc(huecosError) : '') + '</span>' + avisos + '<button type="button" class="psc-hc-recarga" data-psc="hc-recargar" aria-label="Actualizar"' + (huecosCargando ? ' disabled' : '') + '>↻</button></div>' +
      '<div class="psc-hc-tabs">' + tabs + '</div><div class="psc-hc-horas">' + horasHtml + '</div>' + detalle;
  }
  /* ---------- «Cogerla si se libera» (lo hace reserva-piscina/vigilar.mjs) ----------
     Se guarda la hora pedida en quiere_hora. Si ese día ya tienes reserva a otra
     hora, el robot la anula en el momento de coger la nueva (IMDECO solo deja una)
     y, si la nueva no saliera, vuelve a coger la de antes. */
  function accionHora(fecha, h){
    const r = deDia(fecha);
    if(r && r.estado === 'reservada' && r.hora === h.hora) return '<div class="psc-hc-acc"><span class="psc-hc-ok">✓ Esta es tu reserva' + (r.calle ? ' (' + esc(r.calle) + ')' : '') + '</span>' +
      (r.anular ? '<small>El robot la está anulando…</small>' : '<button type="button" class="psc-btn-sec" data-psc="anular" data-id="' + esc(r.id) + '">Anular en IMDECO</button>') + '</div>';
    if(r && r.quiere_hora === h.hora){
      const o = r.estado !== 'reservada' && otraEnVigor(fecha);
      if(dePago(r)) return '<div class="psc-hc-acc"><span class="psc-aviso">' + esc(r.detalle) + '</span><button type="button" class="psc-btn-sec" data-psc="no-vigilar" data-f="' + fecha + '">Dejar de vigilar</button></div>';
      return '<div class="psc-hc-acc"><span class="psc-hc-vig">● Vigilando: ' + (o ? 'la cojo en cuanto pase tu reserva del ' + corto(o.fecha) + ' (' + o.hora + '–' + finHora(o.hora) + '), si sigue libre. IMDECO solo deja una reserva en vigor a la vez'
        : 'en cuanto haya sitio, la cojo' + (r.estado === 'reservada' ? ' y anulo la de las ' + r.hora : '')) + '</span><button type="button" class="psc-btn-sec" data-psc="no-vigilar" data-f="' + fecha + '">Dejar de vigilar</button></div>';
    }
    const cambio = r && r.estado === 'reservada';
    // IMDECO solo deja una reserva en vigor a la vez
    const otra1 = !cambio && otraEnVigor(fecha);
    const txt = otra1 ? 'Cogerla cuando pase la otra' : cambio ? (h.libres.length ? 'Cambiar a las ' + h.hora : 'Cambiar a las ' + h.hora + ' si se libera')
      : h.libres.length ? 'Cogérmela' : 'Cogerla si se libera';
    const otra = (cambio ? '<small>Anulo tu reserva de las ' + r.hora + ' justo al coger la nueva; si la nueva no saliera, vuelvo a coger la tuya.</small>' : '') +
      (r && r.quiere_hora ? '<small>Ahora vigilas las ' + r.quiere_hora + ': se cambia por esta.</small>' : '');
    return '<div class="psc-hc-acc"><button type="button" class="psc-confirmar" data-psc="vigilar" data-f="' + fecha + '" data-h="' + h.hora + '">' + txt + '</button>' + otra +
      (otra1 ? '<small class="psc-aviso">IMDECO solo deja una reserva en vigor a la vez y ya tienes la del ' + corto(otra1.fecha) + ' a las ' + otra1.hora +
        '. El robot la vigila y la coge en cuanto pase esa (a las ' + finHora(otra1.hora) + '), si sigue libre. Si la quieres ya, anula antes la otra.</small>' : '') +
      '<small>' + (otra1 ? '' : h.libres.length ? 'Hay sitio: el robot la reserva en cuanto lo pulses (en segundos si ya está en marcha; si no, en unos 5 min).'
        : 'El robot mira unas 2 veces por segundo, de 6:30 a 23:20, y la coge en cuanto alguien la libere.') + ' Solo si es gratis con tu bono: si cobrase algo, no la compra.</small></div>';
  }
  async function vigilarHora(fecha, hora){
    const r = deDia(fecha);
    const cambio = { quiere_hora: hora, updated_at: new Date().toISOString() };
    if(r && /^De pago/.test(r.detalle || '')) cambio.detalle = null;
    const q = r
      ? sb.from('piscina_reservas').update(r.estado === 'reservada' ? cambio : Object.assign(cambio, { hora, estado: 'programada', detalle: null })).eq('id', r.id)
      : sb.from('piscina_reservas').insert({ fecha, hora, estado: 'programada', quiere_hora: hora });
    const { data, error } = await q.select('id, fecha, hora, estado, detalle, calle, quiere_hora, anular, updated_at').single();
    if(error){ uiToast('No se pudo guardar: ' + error.message, 'error'); return; }
    filas = filas.filter(x => x.fecha !== fecha).concat(data).sort((a, b) => a.fecha < b.fecha ? -1 : 1);
    guardarCache(); pintar();
    const ya = hayLibres(fecha, hora);
    uiToast(r && r.estado === 'reservada' ? (ya ? 'Hay sitio: el robot cambia tu reserva a las ' + hora : 'Vigilando las ' + hora + ': si se libera, cambio tu reserva')
      : ya ? 'Hay sitio: el robot reserva las ' + hora + ' ya' : 'Vigilando las ' + hora + ': en cuanto haya sitio, la cojo', 'success');
  }
  // Otra reserva tuya que aún no ha terminado (IMDECO no deja tener dos)
  function otraEnVigor(fecha){
    const ahora = new Date();
    return filas.find(r => r.fecha !== fecha && r.estado === 'reservada' && !r.anular &&
      new Date(deIso(r.fecha).getTime() + (+r.hora.slice(0, 2) + 1) * 3600e3) > ahora) || null;
  }
  // ¿Hay calles libres ahora (según la última foto de huecos)?
  function hayLibres(fecha, hora){
    const d = huecos && (huecos.dias || []).find(x => x.fecha === fecha), h = d && d.horas.find(x => x.hora === hora);
    return !!(h && h.libres.length);
  }
  // «Anular en IMDECO»: lo hace el robot (vigilar.mjs) en cuanto lo ve
  async function anular(id){
    const r = filas.find(x => x.id === id);
    if(!r) return;
    const ok = await uiConfirm('¿Anular tu reserva del ' + largo(r.fecha) + ' a las ' + r.hora + '?\n\nEl robot la anula en IMDECO (en segundos si ya está en marcha; si no, en unos 5 min).', { ok: 'Anular', danger: true });
    if(!ok) return;
    const { error } = await sb.from('piscina_reservas').update({ anular: true, quiere_hora: null, updated_at: new Date().toISOString() }).eq('id', id);
    if(error){ uiToast('No se pudo pedir: ' + error.message, 'error'); return; }
    r.anular = true; r.quiere_hora = null; guardarCache(); pintar();
    uiToast('Pedido: el robot la anula en IMDECO', 'success');
  }
  async function noVigilar(fecha){
    const r = deDia(fecha);
    if(!r) return;
    // Sin reserva ese día (solo era la vigilancia de un día ya abierto): fuera la fila
    const abierto = fecha < primerDia();
    const q = r.estado !== 'reservada' && abierto
      ? sb.from('piscina_reservas').delete().eq('id', r.id)
      : sb.from('piscina_reservas').update({ quiere_hora: null, updated_at: new Date().toISOString() }).eq('id', r.id);
    const { error } = await q;
    if(error){ uiToast('No se pudo quitar: ' + error.message, 'error'); return; }
    if(r.estado !== 'reservada' && abierto) filas = filas.filter(x => x.id !== r.id); else r.quiere_hora = null;
    guardarCache(); pintar();
  }
  function pintarHuecos(){
    const el = document.getElementById('pscHuecos');
    if(el) el.innerHTML = seccionHuecos();
  }
  function vigilar(){
    clearInterval(temporizador);
    temporizador = setInterval(() => {
      const activa = document.getElementById('screen-piscina')?.classList.contains('active');
      if(!activa){ clearInterval(temporizador); temporizador = null; ventana = null; pintarVentana(); return; }
      if(document.visibilityState === 'visible'){ cargarHuecos(); cargar(); } else pintarHuecos();
    }, REFRESCO);
  }

  /* ---------- acciones ---------- */
  async function confirmar(){
    if(!elegido || !horaElegida || guardando) return;
    const previa = deDia(elegido);
    guardando = true; pintar();
    const { data, error } = await sb.from('piscina_reservas')
      .upsert({ fecha: elegido, hora: horaElegida, estado: 'programada', detalle: null, calle: null, updated_at: new Date().toISOString() }, { onConflict: 'user_id,fecha' })
      .select('id, fecha, hora, estado, detalle, calle, quiere_hora, anular, updated_at').single();
    guardando = false;
    if(error){ uiToast('No se pudo guardar: ' + error.message, 'error'); pintar(); return; }
    filas = filas.filter(r => r.fecha !== data.fecha).concat(data).sort((a, b) => a.fecha < b.fecha ? -1 : 1);
    guardarCache();
    hecho = { fecha: data.fecha, hora: data.hora, cambio: !!previa };
    horaElegida = null; reprog = null;
    pintar();
    if(typeof INICIO !== 'undefined') INICIO.pintar();
  }
  async function borrar(id){
    const r = filas.find(x => x.id === id);
    if(!r) return;
    const ok = await uiConfirm('¿Quitar el ' + largo(r.fecha) + '?\n\n' + (r.estado === 'reservada'
      ? 'Solo se quita de esta lista: la reserva sigue hecha en IMDECO y volverá a salir aquí. Si no vas a ir, anúlala en IMDECO.'
      : 'El robot ya no la reservará.'), { ok: 'Quitar', danger: true });
    if(!ok) return;
    const { error } = await sb.from('piscina_reservas').delete().eq('id', id);
    if(error){ uiToast('No se pudo quitar: ' + error.message, 'error'); return; }
    filas = filas.filter(x => x.id !== id); guardarCache();
    horaElegida = null; pintar();
    if(typeof INICIO !== 'undefined') INICIO.pintar();
  }
  function onClick(e){
    const el = e.target.closest('[data-psc]');
    if(!el || el.disabled) return;
    switch(el.dataset.psc){
      case 'dia': elegido = el.dataset.f; horaElegida = null; reprog = null; pintar(); break;
      case 'mes': mes = new Date(mes.getFullYear(), mes.getMonth() + Number(el.dataset.d), 1); pintar(); break;
      case 'hora': {
        const r = deDia(elegido), yaEs = r && r.estado === 'programada' && r.hora === el.dataset.h;
        horaElegida = yaEs || horaElegida === el.dataset.h ? null : el.dataset.h;
        pintar(); break;
      }
      case 'confirmar': confirmar(); break;
      case 'borrar': borrar(el.dataset.id); break;
      case 'anular': anular(el.dataset.id); break;
      case 'reprogramar': reprog = elegido; horaElegida = null; pintar(); break;
      case 'otro': hecho = null; elegido = null; pintar(); break;
      case 'v-programar': elegido = null; horaElegida = null; reprog = null; hecho = null; abrirVentana('programar'); break;
      case 'v-lista': abrirVentana('lista'); break;
      case 'v-info': abrirVentana('info'); break;
      case 'v-liberadas': abrirVentana('liberadas'); break;
      case 'hc-dia': diaHuecos = Number(el.dataset.i); horaHuecos = null; pintarHuecos(); break;
      case 'hc-hora': horaHuecos = horaHuecos === el.dataset.h ? null : el.dataset.h; pintarHuecos(); break;
      case 'hc-recargar': cargarHuecos(); cargar(); break;
      case 'vigilar': vigilarHora(el.dataset.f, el.dataset.h); break;
      case 'no-vigilar': noVigilar(el.dataset.f); break;
      case 'ir': {
        hecho = null; elegido = el.dataset.f; horaElegida = null; reprog = null;
        const d = deIso(elegido); mes = new Date(d.getFullYear(), d.getMonth(), 1);
        ventana = 'programar'; pintar(); break;
      }
    }
  }

  function abrir(){
    const root = document.getElementById('piscinaRoot');
    if(root && !root.dataset.listo){
      root.dataset.listo = '1';
      root.addEventListener('click', onClick);
      root.addEventListener('keydown', e => { if(e.key === 'Enter' && e.target.dataset && e.target.dataset.psc === 'ir') onClick(e); });
      // Al volver a la app con la pantalla abierta, los huecos al momento
      document.addEventListener('visibilitychange', () => {
        if(document.visibilityState === 'visible' && document.getElementById('screen-piscina').classList.contains('active')){ cargarHuecos(); cargar(); if(!temporizador) vigilar(); }
      });
    }
    if(currentUser && dueño !== currentUser.id){ dueño = currentUser.id; filas = []; cargado = false; leerCache(); }
    hecho = null; horaElegida = null; reprog = null; ventana = null;
    const min = deIso(primerDia());
    if(!mes) mes = new Date(min.getFullYear(), min.getMonth(), 1);
    if(!elegido || elegido < primerDia() && !deDia(elegido)) elegido = null;
    pintar();
    cargar();
    cargarHuecos();
    vigilar();
  }

  /* ---------- para Inicio ---------- */
  // Lo próximo de la lista (de la copia; si no hay, la pide por detrás).
  function proxima(){
    if(!currentUser || !currentUserIsAdmin) return null;
    if(dueño !== currentUser.id){ dueño = currentUser.id; filas = []; cargado = false; leerCache(); }
    if(!intentado) cargar();
    const h = hoy();
    return filas.find(r => r.fecha >= h && r.estado !== 'fallida') || null;
  }
  function textoProxima(r){
    if(!r) return 'Programar reservas';
    return (r.estado === 'reservada' ? 'Reservada: ' : 'Próxima: ') + corto(r.fecha) + ' · ' + r.hora;
  }
  return { abrir, pintar, proxima, textoProxima };
})();
