// =====================================================================
// Genera datos/callejero-osm.json: lo que el estilo «Plano bonito» del
// Callejero dibuja debajo de las calles (edificios, parques y zonas verdes,
// instalaciones deportivas, agua y vías del tren) en el término municipal
// de Córdoba, sacado de OpenStreetMap (© colaboradores de OpenStreetMap,
// ODbL: https://www.openstreetmap.org/copyright).
//
// Uso:
//   node scripts/osm-callejero.mjs                 (lo pide a Overpass)
//   node scripts/osm-callejero.mjs osm.json        (una respuesta de Overpass ya descargada)
// La consulta está en CONSULTA (se puede copiar para descargarla a mano).
// Después: node scripts/versionar.mjs
//
// Formato: { v, fecha, fuente, capas: { edificios, verde, deporte, agua, tren } }.
// Cada polígono es una lista de anillos (se rellenan con la regla «evenodd»:
// los de dentro de otro son huecos) y cada anillo o línea, enteros en cienmilésimas de grado: el primer
// punto entero (lon, lat) y los demás, la diferencia con el anterior (como
// las vías del callejero publicado). Los polígonos sin cierre repetido.
// =====================================================================
import { readFileSync, writeFileSync } from 'node:fs';

const SALIDA = new URL('../datos/callejero-osm.json', import.meta.url);
const SERVIDORES = ['https://overpass-api.de/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
// La caja del término municipal (la misma que usa callejero-sync). Por nombre
// no: «Córdoba» es también la ciudad de Argentina.
const CAJA = '37.66,-5.00,38.04,-4.35';
export const CONSULTA = `[out:json][timeout:300][bbox:${CAJA}];
(
  way["building"];
  relation["building"]["type"="multipolygon"];
  nwr["leisure"~"^(park|garden|playground|dog_park|nature_reserve)$"];
  nwr["landuse"~"^(grass|forest|meadow|recreation_ground|village_green|cemetery|allotments)$"];
  nwr["natural"~"^(wood|water)$"];
  nwr["leisure"~"^(pitch|sports_centre|stadium|track|swimming_pool)$"];
  nwr["waterway"="riverbank"];
  nwr["landuse"~"^(reservoir|basin)$"];
  way["railway"="rail"][!"service"];
);
out geom;`;

function capaDe(t){
  if(t.railway === 'rail') return 'tren';
  if(t.building) return 'edificios';
  if(t.natural === 'water' || t.waterway === 'riverbank' || t.landuse === 'reservoir' || t.landuse === 'basin' || t.leisure === 'swimming_pool') return 'agua';
  if(['pitch', 'sports_centre', 'stadium', 'track'].includes(t.leisure)) return 'deporte';
  return 'verde';
}

// Puntos en cienmilésimas, sin repetidos seguidos (y sin el de cierre).
const q = p => [Math.round(p.lon * 1e5), Math.round(p.lat * 1e5)];
function limpiar(geom, cerrado){
  const out = [];
  for(const p of geom){
    const x = q(p), u = out[out.length - 1];
    if(!u || u[0] !== x[0] || u[1] !== x[1]) out.push(x);
  }
  if(cerrado && out.length > 1){ const a = out[0], b = out[out.length - 1]; if(a[0] === b[0] && a[1] === b[1]) out.pop(); }
  return out;
}
// Douglas-Peucker en metros (aprox.): quita los puntos que no cambian la forma.
const KX = 0.877, KY = 1.11;   // metros por cienmilésima de grado a la latitud de Córdoba
function simplificar(pts, tol){
  if(pts.length < 4) return pts;
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const pila = [[0, pts.length - 1]];
  while(pila.length){
    const [i, j] = pila.pop();
    const [ax, ay] = pts[i], [bx, by] = pts[j];
    const dx = (bx - ax) * KX, dy = (by - ay) * KY, l2 = dx * dx + dy * dy;
    let max = -1, k = -1;
    for(let m = i + 1; m < j; m++){
      const px = (pts[m][0] - ax) * KX, py = (pts[m][1] - ay) * KY;
      let d;
      if(!l2) d = Math.hypot(px, py);
      else { const t = Math.max(0, Math.min(1, (px * dx + py * dy) / l2)); d = Math.hypot(px - t * dx, py - t * dy); }
      if(d > max){ max = d; k = m; }
    }
    if(max > tol){ keep[k] = 1; pila.push([i, k], [k, j]); }
  }
  return pts.filter((_, i) => keep[i]);
}
function delta(pts){
  const out = [];
  let x = 0, y = 0;
  for(const [a, b] of pts){ out.push(a - x, b - y); x = a; y = b; }
  return out;
}
// Une los trozos de un anillo de una relación (vienen sueltos y en cualquier sentido).
function unirAnillos(trozos){
  const anillos = [];
  const quedan = trozos.map(t => t.slice()).filter(t => t.length > 1);
  const igual = (a, b) => a[0] === b[0] && a[1] === b[1];
  while(quedan.length){
    let r = quedan.shift();
    let cambia = true;
    while(!igual(r[0], r[r.length - 1]) && cambia){
      cambia = false;
      for(let i = 0; i < quedan.length; i++){
        const t = quedan[i];
        if(igual(r[r.length - 1], t[0])) r = r.concat(t.slice(1));
        else if(igual(r[r.length - 1], t[t.length - 1])) r = r.concat(t.slice(0, -1).reverse());
        else if(igual(r[0], t[t.length - 1])) r = t.concat(r.slice(1));
        else if(igual(r[0], t[0])) r = t.slice(1).reverse().concat(r);
        else continue;
        quedan.splice(i, 1); cambia = true; break;
      }
    }
    if(igual(r[0], r[r.length - 1])) anillos.push(r);
  }
  return anillos;
}

async function descargar(){
  for(const s of SERVIDORES){
    try{
      const r = await fetch(s, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'pjfire-callejero/1.0' }, body: 'data=' + encodeURIComponent(CONSULTA) });
      if(r.ok) return await r.json();
      console.warn(s, r.status);
    }catch(e){ console.warn(s, e.message); }
  }
  throw new Error('Ningún servidor de Overpass ha respondido');
}

const crudo = process.argv[2] ? JSON.parse(readFileSync(process.argv[2], 'utf8')) : await descargar();
const capas = { edificios: [], verde: [], deporte: [], agua: [], tren: [] };
const TOL = { edificios: 0.6, verde: 1.5, deporte: 1, agua: 1.5, tren: 2 };
let puntos = 0;
for(const e of crudo.elements || []){
  const t = e.tags || {}, capa = capaDe(t);
  if(capa === 'tren'){
    if(e.type !== 'way' || !e.geometry) continue;
    const l = simplificar(limpiar(e.geometry, false), TOL.tren);
    if(l.length > 1){ capas.tren.push(delta(l)); puntos += l.length; }
    continue;
  }
  let anillos = [];
  if(e.type === 'way' && e.geometry) anillos = [limpiar(e.geometry, true)];
  else if(e.type === 'relation' && e.members){
    // Todos los anillos juntos (los de fuera y los huecos): el lienzo los rellena con «evenodd».
    const rol = interior => unirAnillos(e.members.filter(m => m.type === 'way' && m.geometry && (m.role === 'inner') === interior).map(m => limpiar(m.geometry, false)));
    anillos = rol(false).concat(rol(true)).map(r => r.slice(0, -1));
  }
  if(!anillos.length) continue;
  const pol = anillos.map(r => simplificar(r, TOL[capa])).filter(r => r.length >= 3);
  if(!pol.length) continue;
  capas[capa].push(pol.map(delta));
  puntos += pol.reduce((n, r) => n + r.length, 0);
}
const doc = { v: 1, fecha: new Date().toISOString().slice(0, 10), fuente: '© colaboradores de OpenStreetMap (ODbL)', capas };
const txt = JSON.stringify(doc);
writeFileSync(SALIDA, txt);
console.log(Object.entries(capas).map(([k, v]) => k + ': ' + v.length).join(' · ') + ' · ' + puntos + ' puntos · ' + (txt.length / 1e6).toFixed(2) + ' MB');
