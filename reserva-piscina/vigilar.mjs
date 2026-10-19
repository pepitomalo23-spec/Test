// Vigilante: para cada día ya abierto (hoy, mañana o pasado) con una hora pedida en la app
// («cogerla si se libera»), mira cada 3 s si hay una calle libre a esa hora, con una consulta
// a IMDECO que se queda abierta (unas décimas de segundo por mirada). Tiene además un navegador
// con la sesión iniciada y todo preparado (rapido.mjs): la parrilla de ese día y, si es un cambio,
// la ficha de tu reserva vieja con «Anular» a mano. Al liberarse:
//   - si ya tenías reserva ese día a otra hora: anula esa (IMDECO solo deja una) y coge la nueva
//     en el momento; si la nueva no sale, vuelve a coger la de antes;
//   - si no tenías: la coge.
// Luego apunta en la app cómo fue y copia las reservas reales de IMDECO.
// Dura hasta 5 h 45 min (GitHub lo vuelve a lanzar) y para a las 23:20, para no estorbar al
// robot de las 00:00.
//
// Variables: IMD_USUARIO, IMD_CONTRASENA, SUPABASE_URL, SUPABASE_ANON_KEY, PISCINA_CLAVE
// Los registros son públicos: no se escriben datos personales.

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { appendFileSync } from 'node:fs';
import { Consulta } from './huecos.mjs';

const AQUI = dirname(fileURLToPath(import.meta.url));
const DURACION = 345 * 60_000, CADA = 3000, LISTA = 30_000;
const log = (...m) => console.log(new Date().toLocaleTimeString('es-ES', { timeZone: 'Europe/Madrid' }), '·', ...m);
const resumen = (t) => { if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, t + '\n'); };
const espera = ms => new Promise(r => setTimeout(r, ms));

function madrid(d = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(d).map(x => [x.type, x.value]));
  return { fecha: `${p.year}-${p.month}-${p.day}`, hora: `${p.hour}:${p.minute}` };
}
const masDias = (iso, n) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

async function rpc(fn, cuerpo) {
  const r = await fetch(`${process.env.SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST', headers: { apikey: process.env.SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_clave: process.env.PISCINA_CLAVE, ...cuerpo }),
  });
  if (!r.ok) throw new Error(`Supabase ${fn}: ${r.status} ${(await r.text()).slice(0, 200)}`);
  const t = await r.text();
  return t ? JSON.parse(t) : null;
}
const apuntar = (id, hora, calle, detalle) => rpc('piscina_robot_cambiado', { p_id: id, p_hora: hora, p_calle: calle, p_detalle: detalle })
  .catch(e => log('No pude apuntar en la app:', e.message));

// Ejecuta otro script del robot y devuelve { ok, salida }
function correr(script, args) {
  return new Promise(res => {
    const p = spawn(process.execPath, [join(AQUI, script), ...args], { env: { ...process.env, SIN_APP: '1' } });
    let salida = '';
    const eco = d => { const t = d.toString(); salida += t; process.stdout.write(t); };
    p.stdout.on('data', eco); p.stderr.on('data', eco);
    p.on('close', code => res({ ok: code === 0, salida }));
  });
}
const calleDe = salida => (salida.match(/RESERVADO: [^,]+, (.+)/) || [])[1]?.trim() || null;

// --comprobar: solo dice si ahora hay algo que vigilar (sin navegador), para no prepararlo en balde
if (process.argv.includes('--comprobar')) {
  const ahora = madrid(), abiertos = [ahora.fecha, masDias(ahora.fecha, 1), masDias(ahora.fecha, 2)];
  const lista = await rpc('piscina_robot_vigilar', {}).catch(e => { log('No pude leer la app:', e.message); return []; }) || [];
  const vivos = lista.filter(v => abiertos.includes(v.fecha) && !(v.fecha === ahora.fecha && v.quiere_hora <= ahora.hora));
  const enHorario = ahora.hora < '23:20' && ahora.hora >= '06:30';
  log(vivos.length ? `Hay ${vivos.length} para vigilar` : 'Nada que vigilar', enHorario ? '' : '(fuera de horario)');
  if (vivos.length && enHorario && process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, 'hay=1\n');
  process.exit(0);
}

const ahoraVivos = (lista, ahora) => {
  const abiertos = [ahora.fecha, masDias(ahora.fecha, 1), masDias(ahora.fecha, 2)];
  return lista.filter(v => abiertos.includes(v.fecha) && !(v.estado === 'reservada' && v.hora === v.quiere_hora)
    && !(v.fecha === ahora.fecha && v.quiere_hora <= ahora.hora));
};
const esCambio = v => v.estado === 'reservada' && v.hora && v.hora !== v.quiere_hora;

// --prueba --fecha F --hora H [--vieja HH:MM]: se prepara, mira 5 veces y llega a seleccionar
// la calle, sin pulsar «Anular» ni «Reservar». Para medir tiempos con la cuenta real.
const arg = n => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : undefined; };
// --ida-y-vuelta --fecha F --hora DESTINO --vieja ORIGEN: prueba real del cambio, de ORIGEN a DESTINO y
// enseguida de vuelta a ORIGEN (todo seguido, para que la calle de ORIGEN quede libre lo menos posible).
if (process.argv.includes('--ida-y-vuelta')) {
  const { Armado } = await import('./rapido.mjs');
  const fecha = arg('--fecha'), destino = arg('--hora'), origen = arg('--vieja');
  const r = new Armado();
  try {
    await r.abrir();
    await r.armarReserva(fecha, destino);
    await r.armarAnulacion(fecha, origen);
    log(`Preparado. Ida: ${origen} → ${destino}`);
    let t = Date.now();
    await r.anular(); log(`Anulada la de las ${origen} (${Date.now() - t} ms)`);
    const c1 = await r.reservar(); log(`✅ Reservada a las ${destino} (${c1}) en ${Date.now() - t} ms en total`);
    resumen(`Ida: ${origen} → ${destino} en ${((Date.now() - t) / 1000).toFixed(1)} s (${c1}).`);
    log(`Vuelta: ${destino} → ${origen}`);
    const t2 = Date.now();
    await r.armarReserva(fecha, origen);
    await r.armarAnulacion(fecha, destino);
    log(`Preparada la vuelta (${Date.now() - t2} ms)`);
    t = Date.now();
    await r.anular(); log(`Anulada la de las ${destino} (${Date.now() - t} ms)`);
    const c2 = await r.reservar(); log(`✅ De vuelta a las ${origen} (${c2}) en ${Date.now() - t} ms; la calle de las ${origen} estuvo libre ${((Date.now() - t2 + (t - t2)) / 1000).toFixed(1)} s como mucho`);
    resumen(`Vuelta: ${destino} → ${origen} (${c2}).`);
  } catch (e) { log('❌', e.message); process.exitCode = 1; }
  finally { await r.cerrar(); }
  await correr('sincronizar.mjs', []);
  process.exit();
}
if (process.argv.includes('--prueba')) {
  const { Armado } = await import('./rapido.mjs');
  const fecha = arg('--fecha'), hora = arg('--hora'), vieja = arg('--vieja');
  const r = new Armado(), c = new Consulta();
  try {
    let t = Date.now(); await r.abrir(); log(`Sesión iniciada (${Date.now() - t} ms)`);
    t = Date.now(); await r.armarReserva(fecha, hora); log(`Parrilla preparada (${Date.now() - t} ms)`);
    if (vieja) { t = Date.now(); await r.armarAnulacion(fecha, vieja); log(`Ficha de la de las ${vieja} con «Anular» a mano (${Date.now() - t} ms)`); }
    if (vieja) { t = Date.now(); await r.anular(true); log(`Aviso «¿Seguro?» con «Sí» encontrado y cerrado con «No» (${Date.now() - t} ms); no se anula nada`); }
    for (let i = 0; i < 5; i++) { t = Date.now(); const l = await c.libres(fecha, hora); log(`Mirada ${i + 1}: ${l.length} libres (${Date.now() - t} ms)`); }
    t = Date.now();
    try { const calle = await r.reservar(true); log(`MODO PRUEBA: ${calle} seleccionada en ${Date.now() - t} ms; no pulso «Reservar»`); }
    catch (e) { log('Al seleccionar:', e.message, `(${Date.now() - t} ms)`); }
  } catch (e) { log('❌', e.message); process.exitCode = 1; }
  finally { await r.cerrar(); }
  process.exit();
}

const { Armado } = await import('./rapido.mjs');
const consulta = new Consulta();
let armado = null, armadoPara = null;   // armadoPara: id de lo que tiene preparado el navegador
let lista = [], leidaAt = 0, vueltas = 0;
const fin = Date.now() + DURACION;

// Deja el navegador preparado para esa vigilancia
async function armar(v) {
  if (!armado) { armado = new Armado(); await armado.abrir(); log('Sesión iniciada'); }
  await armado.armarReserva(v.fecha, v.quiere_hora);
  armado.vieja = null;
  if (esCambio(v)) await armado.armarAnulacion(v.fecha, v.hora);
  armadoPara = v.id + '|' + v.quiere_hora + '|' + v.hora;
  log(`Preparado: ${v.fecha} a las ${v.quiere_hora}${esCambio(v) ? ` (cambiando la de las ${v.hora})` : ''}`);
}

async function coger(v, libres) {
  const cambio = esCambio(v), t0 = Date.now();
  log(`¡Libre! ${v.fecha} a las ${v.quiere_hora} (${libres.length} calles)${cambio ? ` → cambio desde las ${v.hora}` : ''}`);
  if (armadoPara !== v.id + '|' + v.quiere_hora + '|' + v.hora) await armar(v);
  if (cambio) {
    try { await armado.anular(); log(`Anulada la de las ${v.hora} (${Date.now() - t0} ms)`); }
    // Aunque dé error puede haberse anulado ya: se intenta coger igual (si la vieja sigue, IMDECO
    // no deja otra ese día y abajo se intenta «recuperar», que en ese caso no cambia nada)
    catch (e) { log('⚠️ Al anular:', e.message.split('\n')[0]); }
  }
  try {
    const calle = await armado.reservar();
    log(`✅ Reservada a las ${v.quiere_hora} (${calle}) en ${Date.now() - t0} ms desde que la vi libre`);
    await apuntar(v.id, v.quiere_hora, calle, cambio ? `Cambiada desde las ${v.hora}` : 'Cogida al liberarse');
    resumen(`✅ ${v.fecha}: reservada a las **${v.quiere_hora}** (${calle})${cambio ? ', antes a las ' + v.hora : ''}, en ${((Date.now() - t0) / 1000).toFixed(1)} s.`);
  } catch (e) {
    log('❌', e.message);
    if (!cambio) { await apuntar(v.id, null, null, `Se liberó pero otro la cogió antes (${e.message.slice(0, 80)}). Sigo vigilando`); }
    else {
      // La nueva no salió: recuperar la de antes
      log(`Recupero la de las ${v.hora}`);
      try {
        await armado.armarReserva(v.fecha, v.hora);
        const calle = await armado.reservar();
        await apuntar(v.id, null, null, `Se liberó pero otro la cogió antes; mantienes la de las ${v.hora} (${calle}). Sigo vigilando`);
        resumen(`⚠️ ${v.fecha}: no salió el cambio a las ${v.quiere_hora}; mantienes la de las ${v.hora}.`);
      } catch (e2) {
        await apuntar(v.id, null, null, `Perdí el cambio: anulé la de las ${v.hora} y no pude coger ni la de las ${v.quiere_hora} ni volver a la de antes. Sigo vigilando las ${v.quiere_hora}`);
        resumen(`❌ ${v.fecha}: anulé la de las ${v.hora} y no pude coger ninguna. Sigo vigilando.`);
        process.exitCode = 1;
      }
    }
  }
  armadoPara = null;
  leidaAt = 0;   // volver a leer la lista ya
  correr('sincronizar.mjs', []);   // por detrás: copiar las reservas reales en la app
}

try {
  while (Date.now() < fin) {
    const ahora = madrid();
    if (ahora.hora >= '23:20' || ahora.hora < '06:30') { log('Fuera de horario (23:20–06:30): paro'); break; }
    if (Date.now() - leidaAt > LISTA) {
      try { lista = await rpc('piscina_robot_vigilar', {}) || []; leidaAt = Date.now(); }
      catch (e) { log('No pude leer la app:', e.message); await espera(CADA); continue; }
      for (const v of lista.filter(v => v.estado === 'reservada' && v.hora === v.quiere_hora)) await apuntar(v.id, v.hora, null, null);
    }
    const vivos = ahoraVivos(lista, ahora);
    if (!vivos.length) { log(vueltas ? 'Ya no queda nada que vigilar' : 'Nada que vigilar ahora'); break; }
    if (!armadoPara || !vivos.some(v => armadoPara === v.id + '|' + v.quiere_hora + '|' + v.hora)) {
      try { await armar(vivos[0]); }
      catch (e) { log('No pude prepararlo:', e.message); await apuntar(vivos[0].id, null, null, e.message.slice(0, 200)); await espera(30_000); continue; }
    }
    vueltas++;
    const abiertos = [ahora.fecha, masDias(ahora.fecha, 1), masDias(ahora.fecha, 2)];
    for (const v of vivos) {
      let libres = [];
      try { libres = await consulta.libres(v.fecha, v.quiere_hora, abiertos); }
      catch (e) { log('Error mirando huecos:', e.message); continue; }
      if (libres.length) { await coger(v, libres); break; }
    }
    if (vueltas % 200 === 0) log(`Sigo vigilando (${vueltas} miradas)`);
    try { await armado?.refrescarSiHace(12); } catch (e) { log('No pude renovar la sesión:', e.message); armadoPara = null; }
    await espera(CADA);
  }
} finally {
  await armado?.cerrar();
}
