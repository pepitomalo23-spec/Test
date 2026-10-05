// Genera datos/mnemotecnia.json: palabras en español agrupadas por su número
// según el código fonético de Ramón Campayo («Desarrolla una mente
// prodigiosa»):
//   0 R · 1 T D · 2 N Ñ · 3 M · 4 C K Q · 5 L · 6 S Z · 7 F · 8 CH J G · 9 V B P
// Las vocales, H, Y, W y X no cuentan; CH es un 8 (no 4); RR y LL suenan como
// una sola letra (RR = 0, LL no cuenta, como la Y).
//
// Las palabras salen del diccionario de LibreOffice para español (es_ES,
// licencia GPL 3 / LGPL 3 / MPL 1.1 a elegir; se usa bajo la LGPL 3):
//   https://github.com/wooorm/dictionaries/tree/main/dictionaries/es
// Uso: node scripts/mnemotecnia.mjs ruta/a/index.dic
// Se ordenan para que salgan primero las fáciles de imaginar: sustantivos,
// luego adjetivos, verbos y el resto; dentro de cada grupo, las más cortas.
import { readFileSync, writeFileSync } from 'node:fs';

const TABLA = { r: '0', t: '1', d: '1', n: '2', ñ: '2', m: '3', c: '4', k: '4', q: '4', l: '5', s: '6', z: '6', f: '7', j: '8', g: '8', v: '9', b: '9', p: '9' };
export function numeroDe(palabra){
  const p = palabra.toLowerCase().normalize('NFD').replace(/[̀-̂̄-ͯ]/g, '').normalize('NFC')
    .replace(/ñ/g, 'ñ').replace(/ü/g, 'u');
  let out = '';
  for(let i = 0; i < p.length; i++){
    const c = p[i], sig = p[i + 1];
    if(c === 'c' && sig === 'h'){ out += '8'; i++; continue; }
    if(c === 'r' && sig === 'r'){ out += '0'; i++; continue; }
    if(c === 'l' && sig === 'l'){ i++; continue; }
    if(TABLA[c]) out += TABLA[c];
  }
  return out;
}

const ruta = process.argv[2];
if(!ruta){ console.error('Uso: node scripts/mnemotecnia.mjs ruta/a/index.dic'); process.exit(1); }
const lineas = readFileSync(ruta, 'utf8').split('\n').slice(1);
const vistas = new Set(), grupos = new Map();
const plural = w => /[aeiouáéó]$/.test(w) ? w + 's' : /z$/.test(w) ? w.slice(0, -1) + 'ces' : /[lnrdj]$/.test(w) ? w + 'es' : null;
function poner(w, rango){
  if(vistas.has(w) || !/^[a-zñáéíóúü]{2,14}$/.test(w) || !/[aeiouáéíóú]/.test(w)) return;
  const n = numeroDe(w);
  if(!n || n.length > 8) return;
  vistas.add(w);
  if(!grupos.has(n)) grupos.set(n, []);
  grupos.get(n).push([rango, w]);
}
for(const l of lineas){
  const [w, f = ''] = l.trim().split('/');
  if(!w || w !== w.toLowerCase()) continue;     // fuera nombres propios y siglas
  const verbo = /[RE]/.test(f) && /(ar|er|ir)$/.test(w);
  const sustantivo = f.includes('S') && !f.includes('G') && !verbo;
  const adjetivo = f.includes('S') && f.includes('G');
  const rango = sustantivo ? 0 : adjetivo ? 1 : verbo ? 2 : 3;
  poner(w, rango);
  if(sustantivo){ const pl = plural(w); if(pl) poner(pl, 4); }
}
const datos = {};
[...grupos.keys()].sort((a, b) => a.length - b.length || a.localeCompare(b)).forEach(n => {
  datos[n] = grupos.get(n).sort((a, b) => a[0] - b[0] || a[1].length - b[1].length || a[1].localeCompare(b[1], 'es')).slice(0, 30).map(x => x[1]);
});
writeFileSync(new URL('../datos/mnemotecnia.json', import.meta.url), JSON.stringify({
  fuente: 'Diccionario de LibreOffice para español (es_ES), LGPL 3. Código fonético de Ramón Campayo.',
  numeros: datos
}));
console.log(Object.keys(datos).length, 'números,', [...grupos.values()].reduce((a, g) => a + g.length, 0), 'palabras');
