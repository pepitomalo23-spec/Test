// Vigilante: para cada día ya abierto (hoy, mañana o pasado) con una hora pedida en la app
// («cogerla si se libera»), mira unas 2 veces por segundo si hay una calle libre a esa hora, con una consulta
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
const DURACION = 345 * 60_000, CADA = 200, LISTA = 3000;   // entre mirada y mirada: 0,2 s (más lo que tarda cada una, ~0,3 s): unas 2 por segundo; lo pedido en la app se lee cada 3 s
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
  vivos.push(...(await rpc('piscina_robot_por_anular', {}).catch(() => []) || []));
  const enHorario = ahora.hora < '23:20' && ahora.hora >= '06:30';
  log(vivos.length ? `Hay ${vivos.length} para vigilar` : 'Nada que vigilar ahora', enHorario ? '' : '(fuera de horario)');
  // En horario arranca siempre: se queda leyendo la app para hacer al momento lo que se pida
  if (enHorario && process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, 'hay=1\n');
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
// --ficha --fecha F --hora H: qué botones tiene la ficha de esa reserva (no pulsa nada)
if (process.argv.includes('--ficha')) {
  const { Armado } = await import('./rapido.mjs');
  const r = new Armado();
  try { await r.abrir(); log('Botones de la ficha:', (await r.verFicha(arg('--fecha'), arg('--hora'))).join(' | ')); }
  catch (e) { log('❌', e.message.split('\n')[0]); process.exitCode = 1; }
  finally { await r.cerrar(); }
  process.exit();
}
// --cambiar --fecha F --hora DESTINO --vieja ORIGEN: un cambio de verdad (anula ORIGEN y coge DESTINO;
// si DESTINO no sale, vuelve a coger ORIGEN)
if (process.argv.includes('--cambiar')) {
  const { Armado } = await import('./rapido.mjs');
  const fecha = arg('--fecha'), destino = arg('--hora'), origen = arg('--vieja');
  const r = new Armado();
  try {
    await r.abrir();
    await r.armarReserva(fecha, destino);
    await r.armarAnulacion(fecha, origen);
    log(`Preparado: ${origen} → ${destino}`);
    const t = Date.now();
    try { await r.anular(); log(`Anulada la de las ${origen} (${Date.now() - t} ms)`); }
    catch (e) { log('⚠️ Al anular:', e.message.split('\n')[0]); }
    try {
      const c = await r.reservar(); log(`✅ Reservada a las ${destino} (${c}) en ${Date.now() - t} ms en total`);
      resumen(`✅ ${fecha}: cambiada de las ${origen} a las **${destino}** (${c}).`);
    } catch (e) {
      log('❌', e.message.split('\n')[0]); process.exitCode = 1;
      log(`Recupero la de las ${origen}`);
      await r.armarReserva(fecha, origen);
      const c = await r.reservar(); log(`Recuperada la de las ${origen} (${c})`);
    }
  } catch (e) { log('❌', e.message.split('\n')[0]); process.exitCode = 1; }
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
    for (let i = 0; i < 5; i++) { t = Date.now(); const l = await r.mirar(); log(`Mirada ${i + 1} (navegador): ${l.length} libres (${Date.now() - t} ms)`); }
    t = Date.now();
    try { const calle = await r.reservar(true, true); log(`MODO PRUEBA: ${calle} seleccionada en ${Date.now() - t} ms; no pulso «Reservar»`); }
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

const UNA_SOLA = /más de 1 reservas|mas de 1 reservas/i;
const pausa = new Map();   // id|hora → hasta cuándo no intentarlo (una sola reserva en vigor, o es de pago)
const clavePausa = v => v.id + '|' + v.quiere_hora;
const DE_PAGO = /de pago \(([\d.,]+) ?€\)/i;
async function coger(v, libres, yaMirado = false) {
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
    const calle = await armado.reservar(false, yaMirado);
    log(`✅ Reservada a las ${v.quiere_hora} (${calle}) en ${Date.now() - t0} ms desde que la vi libre`);
    await apuntar(v.id, v.quiere_hora, calle, cambio ? `Cambiada desde las ${v.hora}` : 'Cogida al liberarse');
    resumen(`✅ ${v.fecha}: reservada a las **${v.quiere_hora}** (${calle})${cambio ? ', antes a las ' + v.hora : ''}, en ${((Date.now() - t0) / 1000).toFixed(1)} s.`);
  } catch (e) {
    log('❌', e.message);
    const pago = e.message.match(DE_PAGO);
    if (pago && !cambio) {
      // IMDECO la cobra (el bono no la cubre ese día): no insistir; se vuelve a mirar en 30 min
      // por si deja de cobrarla, o antes si en la app se pide otra hora
      pausa.set(clavePausa(v), Date.now() + 30 * 60_000);
      await apuntar(v.id, null, null, `De pago: IMDECO cobra ${pago[1]} € por esta hora (tu bono no la cubre ese día), así que no la cojo. Si la quieres, resérvala y págala en IMDECO`);
    }
    else if (!cambio && UNA_SOLA.test(e.message)) {
      // IMDECO no deja tener dos reservas a la vez: esperar a que pase la otra (sin insistir cada 3 s)
      pausa.set(clavePausa(v), Date.now() + 15 * 60_000);
      await apuntar(v.id, null, null, 'IMDECO solo deja una reserva en vigor a la vez y ya tienes otra. En cuanto pase esa, la cojo si sigue libre');
    }
    else if (!cambio) { await apuntar(v.id, null, null, `Se liberó pero otro la cogió antes (${e.message.slice(0, 80)}). Sigo vigilando`); }
    else {
      // La nueva no salió: recuperar la de antes
      log(`Recupero la de las ${v.hora}`);
      try {
        await armado.armarReserva(v.fecha, v.hora);
        const calle = await armado.reservar();
        if (pago) pausa.set(clavePausa(v), Date.now() + 30 * 60_000);
        await apuntar(v.id, null, null, pago ? `De pago: IMDECO cobra ${pago[1]} € por las ${v.quiere_hora} (tu bono no la cubre), así que no cambio; mantienes la de las ${v.hora} (${calle})`
          : `Se liberó pero otro la cogió antes; mantienes la de las ${v.hora} (${calle}). Sigo vigilando`);
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

// Anular lo que se ha pedido desde la app («Anular en IMDECO»)
const anulacionFallida = new Set();   // no reintentar cada 30 s la que ya falló (sí en la próxima vigilancia)
async function anularPedidas() {
  let pedidas = [];
  try { pedidas = (await rpc('piscina_robot_por_anular', {}) || []).filter(a => !anulacionFallida.has(a.id)); } catch (e) { log('No pude leer lo que hay que anular:', e.message); return; }
  for (const a of pedidas) {
    log(`Anulo la del ${a.fecha} a las ${a.hora} (pedido desde la app)`);
    try {
      if (!armado) { armado = new Armado(); await armado.abrir(); log('Sesión iniciada'); }
      await armado.armarAnulacion(a.fecha, a.hora);
      await armado.anular();
      await rpc('piscina_robot_anulada', { p_id: a.id });
      log('✅ Anulada');
      resumen(`🗑️ ${a.fecha}: anulada la de las ${a.hora}.`);
    } catch (e) {
      log('❌ No pude anularla:', e.message.split('\n')[0]);
      anulacionFallida.add(a.id);
      await apuntar(a.id, null, null, 'No pude anularla: ' + e.message.split('\n')[0].slice(0, 150));
    }
    armadoPara = null;
  }
  if (pedidas.length) correr('sincronizar.mjs', []);
}

// Sin nada que hacer sigue en marcha (leyendo la app cada 30 s), para que lo que se pida desde
// la app («Cógemela», «Anular») se haga en segundos: los avisos programados de GitHub casi nunca
// llegan a tiempo. Al acabar sus 5 h 45 min se vuelve a lanzar solo (relevo()).
const SINCRONIZAR = 10 * 60_000;
let sincronizadoAt = 0, fueraDeHorario = false;
// Lanza la siguiente vigilancia (GitHub la deja en cola hasta que acabe esta)
async function relevo() {
  const { GITHUB_TOKEN: t, GITHUB_REPOSITORY: repo } = process.env;
  if (!t || !repo || fueraDeHorario) return;
  const r = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/vigilar-piscina.yml/dispatches`, {
    method: 'POST', headers: { authorization: `Bearer ${t}`, accept: 'application/vnd.github+json' }, body: JSON.stringify({ ref: 'main' }),
  }).catch(e => ({ ok: false, status: e.message }));
  log(r.ok ? 'Relevo lanzado: sigue otra vigilancia' : `No pude lanzar el relevo (${r.status})`);
}
try {
  while (Date.now() < fin) {
    const ahora = madrid();
    if (ahora.hora >= '23:20' || ahora.hora < '06:30') { log('Fuera de horario (23:20–06:30): paro'); fueraDeHorario = true; break; }
    if (Date.now() - leidaAt > LISTA) {
      try { lista = await rpc('piscina_robot_vigilar', {}) || []; leidaAt = Date.now(); }
      catch (e) { log('No pude leer la app:', e.message); await espera(CADA); continue; }
      for (const v of lista.filter(v => v.estado === 'reservada' && v.hora === v.quiere_hora)) await apuntar(v.id, v.hora, null, null);
      await anularPedidas();
    }
    // Copiar de vez en cuando las reservas reales (lo que se haga a mano en IMDECO)
    if (Date.now() - sincronizadoAt > SINCRONIZAR) { sincronizadoAt = Date.now(); correr('sincronizar.mjs', []); }
    const vivos = ahoraVivos(lista, ahora).filter(v => !(pausa.get(clavePausa(v)) > Date.now()));
    if (!vivos.length) { await espera(LISTA); leidaAt = 0; continue; }
    if (!armadoPara || !vivos.some(v => armadoPara === v.id + '|' + v.quiere_hora + '|' + v.hora)) {
      try { await armar(vivos[0]); }
      catch (e) { log('No pude prepararlo:', e.message); await apuntar(vivos[0].id, null, null, e.message.slice(0, 200)); await espera(30_000); continue; }
    }
    vueltas++;
    const abiertos = [ahora.fecha, masDias(ahora.fecha, 1), masDias(ahora.fecha, 2)];
    for (const v of vivos) {
      // La que tiene el navegador preparado se mira en su propia página (~0,3 s) y, si hay sitio, se
      // pulsa ahí mismo; las demás, con la consulta sin sesión.
      const armadaEsta = armadoPara === v.id + '|' + v.quiere_hora + '|' + v.hora;
      let libres = [];
      try { libres = armadaEsta ? await armado.mirar() : await consulta.libres(v.fecha, v.quiere_hora, abiertos); }
      catch (e) { log('Error mirando huecos:', e.message.split('\n')[0]); if (armadaEsta) armadoPara = null; continue; }
      if (libres.length) { await coger(v, libres, armadaEsta); break; }
    }
    if (vueltas % 1000 === 0) log(`Sigo vigilando (${vueltas} miradas)`);
    try { await armado?.refrescarSiHace(12); } catch (e) { log('No pude renovar la sesión:', e.message); armadoPara = null; }
    await espera(CADA);
  }
} finally {
  await armado?.cerrar();
  await relevo();
}
