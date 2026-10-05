/* Mnemotecnia: calculadora del código fonético de Ramón Campayo.
   Cada cifra es una o varias consonantes (las vocales, H, Y, W y X no
   cuentan): 0 R · 1 T D · 2 N Ñ · 3 M · 4 C K Q · 5 L · 6 S Z · 7 F ·
   8 CH J G · 9 V B P. Al escribir un número salen palabras que lo forman
   (primero sustantivos, que son los fáciles de imaginar) y, si no hay
   ninguna, el número partido en trozos con palabras para cada uno. Al
   escribir una palabra, sale su número. Las palabras (datos/mnemotecnia.json)
   salen del diccionario de LibreOffice; las genera scripts/mnemotecnia.mjs. */
const MN = (function(){
  const ARCHIVO = 'datos/mnemotecnia.json?v=4230a1c083';
  const TABLA = [['0', 'R'], ['1', 'T D'], ['2', 'N Ñ'], ['3', 'M'], ['4', 'C K Q'], ['5', 'L'], ['6', 'S Z'], ['7', 'F'], ['8', 'CH J G'], ['9', 'V B P']];
  const LETRA = { r: '0', t: '1', d: '1', n: '2', ñ: '2', m: '3', c: '4', k: '4', q: '4', l: '5', s: '6', z: '6', f: '7', j: '8', g: '8', v: '9', b: '9', p: '9' };
  let datos = null, cargando = null, numero = '', palabra = '';

  function cargar(){
    if(datos) return Promise.resolve(datos);
    if(!cargando) cargando = fetch(ARCHIVO).then(r => { if(!r.ok) throw new Error('No se pudo descargar el diccionario (' + r.status + ')'); return r.json(); })
      .then(d => { datos = d.numeros; return datos; }).finally(() => { cargando = null; });
    return cargando;
  }
  // El número de una palabra (CH = 8, RR = 0, LL no cuenta).
  function numeroDe(w){
    const p = String(w).toLowerCase().normalize('NFD').replace(/[̀-̂̄-ͯ]/g, '').normalize('NFC').replace(/ü/g, 'u');
    let out = '';
    for(let i = 0; i < p.length; i++){
      const c = p[i], sig = p[i + 1];
      if(c === 'c' && sig === 'h'){ out += '8'; i++; continue; }
      if(c === 'r' && sig === 'r'){ out += '0'; i++; continue; }
      if(c === 'l' && sig === 'l'){ i++; continue; }
      if(LETRA[c]) out += LETRA[c];
    }
    return out;
  }
  const esc = t => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  // El número partido en el menor número de trozos que tengan palabra
  // (a igualdad, trozos más parejos).
  function trozos(n){
    const L = n.length, mejor = Array(L + 1).fill(null);
    mejor[0] = { piezas: [] };
    for(let i = 0; i < L; i++){
      if(!mejor[i]) continue;
      for(let k = Math.min(8, L - i); k >= 1; k--){
        const t = n.slice(i, i + k);
        if(!datos[t]) continue;
        const cand = { piezas: mejor[i].piezas.concat([t]) };
        const actual = mejor[i + k];
        const peor = (a, b) => a.piezas.length - b.piezas.length || Math.max(...a.piezas.map(x => x.length)) - Math.max(...b.piezas.map(x => x.length));
        if(!actual || peor(cand, actual) < 0) mejor[i + k] = cand;
      }
    }
    return mejor[L] ? mejor[L].piezas : null;
  }
  const chips = lista => lista.map(w => '<span class="mn-palabra">' + esc(w) + '</span>').join('');

  function resultadoNumero(){
    if(!numero) return '<div class="mn-ayuda">Escribe un número y te digo palabras que lo forman.</div>';
    if(!datos) return '<div class="mn-ayuda">Cargando el diccionario…</div>';
    const cifras = '<div class="mn-cifras">' + numero.split('').map(c => '<span class="mn-cifra"><b>' + c + '</b><small>' + TABLA[c][1] + '</small></span>').join('') + '</div>';
    const una = datos[numero];
    let html = cifras;
    if(una) html += '<div class="mn-sub">En una palabra</div><div class="mn-palabras">' + chips(una) + '</div>';
    if(numero.length > 2){
      const ps = trozos(numero);
      if(ps && ps.length > 1) html += '<div class="mn-sub">' + (una ? 'O en varias palabras' : 'En varias palabras') + '</div>' +
        ps.map(t => '<div class="mn-trozo"><span class="mn-trozo-n">' + t + '</span><div class="mn-palabras">' + chips(datos[t].slice(0, 12)) + '</div></div>').join('');
    }
    if(!una && !(numero.length > 2)) html += '<div class="mn-ayuda">No encuentro palabras para este número.</div>';
    return html;
  }
  function resultadoPalabra(){
    if(!palabra.trim()) return '';
    const n = numeroDe(palabra);
    return '<div class="mn-al-reves"><b>' + esc(palabra.trim()) + '</b> = <span class="mn-num">' + (n || '—') + '</span></div>';
  }
  function pintarResultados(){
    const a = document.getElementById('mnResultado'), b = document.getElementById('mnReves');
    if(a) a.innerHTML = resultadoNumero();
    if(b) b.innerHTML = resultadoPalabra();
  }
  function pintar(){
    const root = document.getElementById('mnRoot');
    if(!root) return;
    if(!root.dataset.listo){
      root.dataset.listo = '1';
      root.innerHTML =
        '<div class="mn-card"><label class="mn-label" for="mnNumero">Número</label>' +
          '<input id="mnNumero" class="mn-input" type="text" inputmode="numeric" autocomplete="off" placeholder="Por ejemplo, 1972" oninput="MN.numero(this.value)">' +
          '<div id="mnResultado"></div></div>' +
        '<div class="mn-card"><label class="mn-label" for="mnPalabra">Al revés: escribe una palabra</label>' +
          '<input id="mnPalabra" class="mn-input" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Por ejemplo, daga" oninput="MN.palabra(this.value)">' +
          '<div id="mnReves"></div></div>' +
        '<div class="mn-card"><div class="mn-label">La tabla</div><div class="mn-tabla">' +
          TABLA.map(([n, l]) => '<div><b>' + n + '</b><span>' + l + '</span></div>').join('') + '</div>' +
          '<div class="mn-ayuda">Las vocales, la H, la Y, la W y la X no cuentan: sirven de relleno. CH es un 8; RR, un solo 0; LL no cuenta.</div>' +
          '<div class="mn-fuente">Código fonético de Ramón Campayo («Desarrolla una mente prodigiosa»). Palabras del diccionario de LibreOffice para español (LGPL 3).</div></div>';
    }
    pintarResultados();
  }
  function abrir(){
    pintar();
    cargar().then(pintarResultados, e => { const a = document.getElementById('mnResultado'); if(a) a.innerHTML = '<div class="mn-ayuda">' + esc(e.message) + '</div>'; });
  }
  // Para Normativas: palabras para un número (en una palabra o en trozos).
  async function sugerir(n){
    await cargar();
    n = String(n).replace(/\D/g, '');
    const una = datos[n] || [];
    const ps = !una.length && n.length > 1 ? trozos(n) : null;
    return { una, trozos: ps ? ps.map(t => [t, datos[t]]) : [] };
  }
  return {
    abrir, numeroDe, sugerir,
    numero: v => { numero = String(v).replace(/\D/g, '').slice(0, 24); const i = document.getElementById('mnNumero'); if(i && i.value !== numero) i.value = numero; pintarResultados(); },
    palabra: v => { palabra = String(v).slice(0, 60); pintarResultados(); }
  };
})();
