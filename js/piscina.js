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
    if(!cargando) cargando = sb.from('piscina_reservas').select('id, fecha, hora, estado, detalle, calle, updated_at')
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
  function chip(r){
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
        '<span>' + (r.estado === 'programada' ? (r.fecha >= primerDia() ? 'Se reserva el ' + corto(masDias(r.fecha, -ANTELACION)) + ' a las 00:00' : 'Esta noche o ya abierto') :
          r.estado === 'reservada' ? (r.calle ? esc(r.calle) : 'Hecha') : esc((r.detalle || '').slice(0, 90))) + '</span></span>' +
      chip(r) + '</div>';
    return '<div class="psc-lista"><div class="psc-lista-t">Próximas</div>' +
      (prox.length ? prox.map(fila).join('') : '<div class="psc-lista-vacia">Nada programado todavía.</div>') +
      (antes.length ? '<details class="psc-antes"><summary>Anteriores</summary>' + antes.map(fila).join('') + '</details>' : '') +
      '</div>';
  }
  function pintar(){
    const root = document.getElementById('piscinaRoot');
    if(!root || !document.getElementById('screen-piscina').classList.contains('active')) return;
    if(!currentUserIsAdmin){ root.innerHTML = '<div class="psc-lista-vacia">Esta pantalla es solo para administradores.</div>'; return; }
    const cuerpo = hecho ? exito() : calendario() + horas();
    root.innerHTML = '<div class="psc-hero"><span>Elige día</span><span class="psc-hero-b">y hora</span></div>' +
      '<div class="psc-card' + (hecho ? ' psc-card-ok' : '') + '">' + cabeceraInfo() + '<div class="psc-cuerpo">' + cuerpo + '</div></div>' +
      (cargado || filas.length ? lista() : '<div class="psc-lista"><span class="skel" style="width:50%;height:16px"></span></div>');
  }

  /* ---------- acciones ---------- */
  async function confirmar(){
    if(!elegido || !horaElegida || guardando) return;
    const previa = deDia(elegido);
    guardando = true; pintar();
    const { data, error } = await sb.from('piscina_reservas')
      .upsert({ fecha: elegido, hora: horaElegida, estado: 'programada', detalle: null, calle: null, updated_at: new Date().toISOString() }, { onConflict: 'user_id,fecha' })
      .select('id, fecha, hora, estado, detalle, calle, updated_at').single();
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
      case 'reprogramar': reprog = elegido; horaElegida = null; pintar(); break;
      case 'otro': hecho = null; elegido = null; pintar(); break;
      case 'ir': {
        hecho = null; elegido = el.dataset.f; horaElegida = null; reprog = null;
        const d = deIso(elegido); mes = new Date(d.getFullYear(), d.getMonth(), 1);
        pintar(); document.getElementById('screen-piscina').scrollIntoView({ behavior: 'smooth' }); break;
      }
    }
  }

  function abrir(){
    const root = document.getElementById('piscinaRoot');
    if(root && !root.dataset.listo){
      root.dataset.listo = '1';
      root.addEventListener('click', onClick);
      root.addEventListener('keydown', e => { if(e.key === 'Enter' && e.target.dataset && e.target.dataset.psc === 'ir') onClick(e); });
    }
    if(currentUser && dueño !== currentUser.id){ dueño = currentUser.id; filas = []; cargado = false; leerCache(); }
    hecho = null; horaElegida = null; reprog = null;
    const min = deIso(primerDia());
    if(!mes) mes = new Date(min.getFullYear(), min.getMonth(), 1);
    if(!elegido || elegido < primerDia() && !deDia(elegido)) elegido = null;
    pintar();
    cargar();
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
