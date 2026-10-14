/* Callejero Fiscal 2026 del Ayuntamiento de Córdoba (el PDF), de referencia.
   datos/callejero-2026.json (scripts/callejero-2026.py): cada vía con su
   código, sigla, nombre, núcleo y dónde está en el PDF (página y caja). Las
   páginas, en datos/callejero-2026/pNN.webp.
   - CJ26.filasDe(nombre, tipo): las filas de una calle (por su nombre).
   - CJ26.botonHtml(nombre, tipo): el botón «Callejero 2026» (vacío si no está).
   - CJ26.ver(i): abre la página con la fila señalada.
   - CJ26.lista(siglas): todas las vías de esos tipos (para Aprender). */
const CJ26 = (() => {
  const ARCHIVO = 'datos/callejero-2026.json?v=d42aca63f2';
  let D = null, cargando = null;
  const porClave = new Map(), porJunto = new Map(), porPrimera = new Map();

  // El nombre, sin tildes, signos ni palabras vacías; «ABADES, DE» → «de abades».
  const VACIAS = new Set(['de', 'del', 'la', 'las', 'los', 'el', 'y', 'e', 'a', 'al']);
  const TIPOS = new Set(['calle', 'c', 'cl', 'plaza', 'pz', 'pza', 'plazuela', 'glorieta', 'gl', 'gta', 'avenida', 'av', 'avda', 'pasaje', 'pj', 'paseo', 'ps', 'po',
    'ronda', 'travesia', 'tr', 'callejon', 'calleja', 'cj', 'carretera', 'cr', 'ctra', 'camino', 'cm', 'jardin', 'jardines', 'jd', 'parque', 'pq',
    'urbanizacion', 'ur', 'bulevar', 'bv', 'barriada', 'bd', 'bda', 'poligono', 'pg', 'puente', 'pt', 'acceso', 'ac', 'via']);
  // Las abreviaturas del PDF («NUESTRA SRA.», «AVD.», «GRAL.»…).
  const ABREV = { sra: 'senora', sr: 'senor', sta: 'santa', sto: 'santo', ntra: 'nuestra', ntro: 'nuestro', avd: 'avenida', avda: 'avenida', gral: 'general',
    dr: 'doctor', dra: 'doctora', fdez: 'fernandez', glez: 'gonzalez', mtro: 'maestro', prof: 'profesor', pdte: 'presidente', hnos: 'hermanos', hno: 'hermano', vgen: 'virgen', ctra: 'carretera' };
  function palabras(t){
    return String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9ñ ]/g, ' ').split(/\s+/).filter(w => w && !VACIAS.has(w));
  }
  const darVuelta = n => { const m = String(n).match(/^(.*),\s*(DE|DEL|DE LA|DE LOS|DE LAS|LA|LAS|LOS|EL)\s*$/i); return m ? m[2] + ' ' + m[1] : n; };
  // Sin lo que va entre paréntesis o guiones («Calle Osio (Encinarejo)», «GITANOS -CAMPO DE LA VERDAD-»).
  const sinAñadidos = t => String(t || '').replace(/\([^)]*\)?/g, ' ').replace(/\s-[^-]*-?\s*$/, ' ');
  // Los códigos de carretera, de una pieza («A-431» → «a431»: si no, la «a» sería una palabra vacía).
  const conCodigos = t => String(t || '').replace(/\b(AP|CO|CP|CV|CH|A|N|E)-\s?(\d{1,4}[A-Za-z]?|IV)\b/gi, (m, a, b) => ' ' + (a + b).toLowerCase() + ' ');
  function clave(t){
    let w = palabras(sinAñadidos(conCodigos(t))).map(x => ABREV[x] || x);
    while(w.length > 1 && TIPOS.has(w[0])) w = w.slice(1);
    return w.join(' ');
  }
  const junto = k => k.replace(/ /g, '');
  // Sigla del PDF → tipo de vía del mapa (para elegir entre dos con el mismo nombre).
  const SIGLA = { CL: 'CALLE', PZ: 'PLAZA', GL: 'GLORIETA', AV: 'AVENIDA', PJ: 'PASAJE', PS: 'PASEO', CR: 'CARRETERA', CM: 'CAMINO', CJ: 'CALLEJA',
    JD: 'JARDIN', TR: 'TRAVESIA', PQ: 'PARQUE', UR: 'URBANIZACION', BD: 'BARRIADA', BDA: 'BARRIADA', BV: 'BULEVAR', PG: 'POLIGONO', EX: 'EXTRARRADIO',
    SD: 'DISEMINADO', PT: 'PUENTE', AC: 'ACCESO', PL: 'PLAZUELA', ZO: 'ZONA' };
  const NOMBRE_SIGLA = { CL: 'Calle', PZ: 'Plaza', GL: 'Glorieta', AV: 'Avenida', PJ: 'Pasaje', PS: 'Paseo', CR: 'Carretera', CM: 'Camino', CJ: 'Calleja',
    JD: 'Jardín', TR: 'Travesía', PQ: 'Parque', UR: 'Urbanización', BD: 'Barriada', BDA: 'Barriada', BV: 'Bulevar', PG: 'Polígono', EX: 'Extrarradio',
    SD: 'Diseminado', PT: 'Puente', AC: 'Acceso', PL: 'Plazuela', ZO: 'Zona' };

  async function cargar(){
    if(D) return D;
    if(cargando) return cargando;
    cargando = (async () => {
      const r = await fetch(ARCHIVO);
      if(!r.ok) throw new Error('No se pudo descargar el Callejero 2026 (' + r.status + ')');
      const d = await r.json();
      d.filas = d.filas.map(([cod, sig, nombre, nucleo, pag, x0, y0, x1, y1], i) => ({ i, cod, sig, nombre, nucleo, pag, caja: [x0, y0, x1, y1], k: clave(darVuelta(nombre)) }));
      d.filas.forEach(f => {
        const p = f.k.split(' ')[0];
        if(!porPrimera.has(p)) porPrimera.set(p, []);
        porPrimera.get(p).push(f);
        if(!porClave.has(f.k)) porClave.set(f.k, []);
        porClave.get(f.k).push(f);
        const j = junto(f.k);
        if(!porJunto.has(j)) porJunto.set(j, []);
        porJunto.get(j).push(f);
      });
      D = d;
      return d;
    })();
    try{ return await cargando; }
    finally{ cargando = null; }
  }
  function listo(){ return !!D; }

  // Distancia de edición (para nombres partidos o con una letra cambiada).
  function distancia(a, b){
    if(Math.abs(a.length - b.length) > 2) return 9;
    const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
    for(let j = 1; j <= b.length; j++) d[0][j] = j;
    for(let i = 1; i <= a.length; i++) for(let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return d[a.length][b.length];
  }
  const cache = new Map();
  // Las filas de una calle: por su nombre (igual, o pegado, o casi igual) y, si hay varias, las de su tipo.
  function filasDe(nombre, tipo){
    if(!D || !nombre) return [];
    const ck = nombre + '|' + (tipo || '');
    if(cache.has(ck)) return cache.get(ck);
    const k = clave(nombre), j = junto(k);
    let fs = porClave.get(k) || porJunto.get(j) || [];
    // Abreviado o cortado en el PDF: cada palabra suya es la del nombre o su principio, en orden
    // («ARABISTA CASTEJON Y M. ARIZALA», «INGENIERO JUAN A. VIGUERAS GONZ»).
    if(!fs.length){
      const w = k.split(' ');
      const cabe = pw => { let i = 0; for(const x of pw){ while(i < w.length && !(w[i] === x || (x.length <= 4 && w[i].startsWith(x)) || (x.length > 4 && w[i].startsWith(x)))) i++; if(i++ >= w.length) return false; } return true; };
      const cands = (porPrimera.get(w[0]) || []).filter(f => { const pw = f.k.split(' '); return pw.length >= 2 && pw.length <= w.length && cabe(pw) && pw.length >= Math.ceil(w.length * 0.6); });
      const ks = new Set(cands.map(f => f.k));
      if(ks.size === 1) fs = cands;
    }
    if(!fs.length && j.length >= 6){
      let mejor = 3;
      porJunto.forEach((lista, jj) => {
        if(jj[0] !== j[0]) return;
        const dd = distancia(j, jj);
        if(dd < mejor){ mejor = dd; fs = lista; }
      });
      if(mejor > (j.length >= 12 ? 2 : 1)) fs = [];
    }
    // Una carretera, por su código («a 431», «n 432»…): las filas que empiezan por él.
    if(!fs.length){
      const m = k.match(/^(ap|co|cp|cv|ch|a|n|e)(\d{1,4}[a-z]?|iv)\b/);
      if(m){ const cod = m[0]; fs = (porPrimera.get(cod) || []).filter(f => f.k === cod || f.k.startsWith(cod + ' ')); }
    }
    if(fs.length > 1 && tipo){
      const t = String(tipo).toUpperCase(), mismo = fs.filter(f => SIGLA[f.sig] === t);
      if(mismo.length) fs = mismo;
    }
    cache.set(ck, fs);
    return fs;
  }
  // La calle de una dirección («C/ Torrijos, 3», «Av. Gran Capitán (Gran Teatro)»).
  function filasDeDireccion(dir){
    const calle = String(dir || '').split(/[,(]| s\/n| nº| n\.º| \d/i)[0].trim();
    return calle.length > 2 ? filasDe(calle) : [];
  }
  // Nombre bonito de una fila: «PZ ABADES, DE» → «Plaza de Abades».
  function nombreFila(f){
    const t = darVuelta(f.nombre).toLowerCase().replace(/(^|[\s(«"-])([a-zñáéíóú])/g, (m, a, b) => a + b.toUpperCase())
      .replace(/\b(De|Del|La|Las|Los|El|Y)\b/g, w => w.toLowerCase());
    return NOMBRE_SIGLA[f.sig] ? NOMBRE_SIGLA[f.sig] + ' ' + t : t.charAt(0).toUpperCase() + t.slice(1);
  }
  function lista(siglas){ return D ? D.filas.filter(f => siglas.includes(f.sig)) : []; }

  const ICONO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 13h8"/><path d="M8 17h5"/></svg>';
  // El botón para ir al PDF (solo si la calle está en él).
  function botonDe(fs){
    if(!fs.length) return '';
    return '<button type="button" class="cj26-btn" onclick="event.stopPropagation(); CJ26.ver(' + JSON.stringify(fs.map(f => f.i)) + ')">' + ICONO +
      'Callejero 2026 · pág. ' + fs[0].pag + '</button>';
  }
  function botonHtml(nombre, tipo){ return botonDe(filasDe(nombre, tipo)); }
  function botonDireccion(dir){ return botonDe(filasDeDireccion(dir)); }
  function botonFilas(indices){ return D ? botonDe(indices.map(i => D.filas[i]).filter(Boolean)) : ''; }
  // El núcleo, bonito: «HIGUERON (EL)» → «El Higuerón»… («CORDOBA» → «Córdoba»).
  function nombreNucleo(n){
    const m = String(n).match(/^(.*?)\s*\((EL|LA|LOS|LAS)\)$/);
    const t = (m ? m[2] + ' ' + m[1] : n).toLowerCase().replace(/(^|\s)([a-zñ])/g, (x, a, b) => a + b.toUpperCase()).replace(/\b(De|Del|La|Las|Los|El)\b(?!$)/g, w => w.toLowerCase());
    return t.charAt(0).toUpperCase() + t.slice(1).replace(/^Cordoba$/, 'Córdoba').replace(/Higueron/, 'Higuerón').replace(/Maria/, 'María').replace(/Señora/, 'Señora');
  }

  /* ---------- el visor: la página con la fila señalada ---------- */
  let visor = null;
  function ver(indices, n){
    if(!D) return;
    indices = [].concat(indices);
    const f = D.filas[indices[n || 0]];
    if(!f) return;
    if(!visor){
      visor = document.createElement('div');
      visor.className = 'cj26-visor';
      visor.setAttribute('role', 'dialog');
      visor.setAttribute('aria-modal', 'true');
      document.body.appendChild(visor);
      document.addEventListener('keydown', e => { if(visor && !visor.classList.contains('hidden') && e.key === 'Escape') cerrar(); });
    }
    const pct = (v, t) => (v / t * 100).toFixed(2) + '%';
    const m = 3;   // margen alrededor de la fila (puntos)
    visor.innerHTML =
      '<div class="cj26-cab"><button type="button" class="cj-salir" onclick="CJ26.cerrar()" aria-label="Cerrar">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg></button>' +
        '<div class="cj26-tit"><small>Callejero Fiscal 2026 · página ' + f.pag + ' de ' + D.pags + '</small><b>' + escapeHtml(nombreFila(f)) + '</b>' +
        '<span>Código ' + escapeHtml(f.cod) + (f.nucleo && f.nucleo !== 'CORDOBA' ? ' · ' + escapeHtml(f.nucleo) : '') + '</span></div>' +
        '<button type="button" class="cj26-zoom" onclick="CJ26.ampliar()" aria-label="Ampliar">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/><path d="M11 8v6"/><path d="M8 11h6"/></svg></button></div>' +
      (indices.length > 1 ? '<div class="cj26-otras">' + indices.map((x, k) => {
        const g = D.filas[x];
        return '<button type="button"' + (k === (n || 0) ? ' class="activo"' : '') + ' onclick="CJ26.ver(' + JSON.stringify(indices) + ',' + k + ')">' +
          escapeHtml((g.nucleo === 'CORDOBA' ? 'Córdoba' : g.nucleo) + ' · pág. ' + g.pag) + '</button>';
      }).join('') + '</div>' : '') +
      '<div class="cj26-hoja"><div class="cj26-pag"><img alt="Página ' + f.pag + ' del Callejero Fiscal 2026" src="datos/callejero-2026/p' + String(f.pag).padStart(2, '0') + '.webp">' +
        '<i class="cj26-marca" style="left:' + pct(f.caja[0] - m, D.ancho) + ';top:' + pct(f.caja[1] - m, D.alto) + ';width:' + pct(f.caja[2] - f.caja[0] + 2 * m, D.ancho) +
        ';height:' + pct(f.caja[3] - f.caja[1] + 2 * m, D.alto) + '"></i></div></div>';
    visor.classList.remove('hidden');
    // En el móvil se abre ya ampliada (si no, la letra no se lee).
    visor.classList.toggle('grande', window.innerWidth < 700);
    const img = visor.querySelector('img');
    if(img.complete) centrar(); else img.addEventListener('load', centrar);
  }
  // La fila en el centro de la pantalla.
  function centrar(){
    const mk = visor && visor.querySelector('.cj26-marca'), hoja = visor && visor.querySelector('.cj26-hoja');
    if(!mk || !hoja) return;
    hoja.scrollTop = mk.offsetTop - hoja.clientHeight / 2 + mk.offsetHeight / 2;
    hoja.scrollLeft = mk.offsetLeft - Math.max(8, (hoja.clientWidth - mk.offsetWidth) / 2);
  }
  // Ampliar o reducir (la página al doble de ancho), con la fila en el centro.
  function ampliar(){
    if(!visor) return;
    visor.classList.toggle('grande');
    centrar();
  }
  function cerrar(){ if(visor) visor.classList.add('hidden'); }

  return { cargar, listo, filasDe, filasDeDireccion, nombreFila, nombreNucleo, lista, botonHtml, botonDireccion, botonFilas, ver, ampliar, cerrar, clave, SIGLA: NOMBRE_SIGLA };
})();
