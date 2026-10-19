// Vigilante: para cada día ya abierto (hoy, mañana o pasado) con una hora pedida en la app
// («cogerla si se libera»), mira cada 20 s si hay una calle libre a esa hora. Si la hay:
//   - si ya tenías reserva ese día a otra hora: anula esa (IMDECO solo deja una) y reserva la nueva;
//     si la nueva no sale, vuelve a reservar la de antes;
//   - si no tenías: la reserva.
// Luego apunta en la app cómo fue y copia las reservas reales de IMDECO.
// Para a los 50 minutos (lo vuelve a lanzar GitHub) y antes de las 23:20, para no estorbar al
// robot de las 00:00.
//
// Variables: IMD_USUARIO, IMD_CONTRASENA, SUPABASE_URL, SUPABASE_ANON_KEY, PISCINA_CLAVE
// Los registros son públicos: no se escriben datos personales.

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { appendFileSync } from 'node:fs';
import { huecos } from './huecos.mjs';

const AQUI = dirname(fileURLToPath(import.meta.url));
const DURACION = 50 * 60_000, PAUSA = 20_000;
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

async function cambiar(v, libres) {
  const swap = v.estado === 'reservada' && v.hora && v.hora !== v.quiere_hora;
  log(`¡Libre! ${v.fecha} a las ${v.quiere_hora} (${libres.length} calles)${swap ? ` → cambio desde las ${v.hora}` : ''}`);
  if (swap) {
    // Justo antes de soltar la tuya, comprobar que sigue libre
    const otra = (await huecos([v.fecha], [v.quiere_hora])).get(v.fecha + '|' + v.quiere_hora) || [];
    if (!otra.length) { log('Ya no está libre; sigo vigilando'); return; }
    const a = await correr('anular.mjs', ['--fecha', v.fecha, '--hora', v.hora]);
    if (!a.ok) { await apuntar(v.id, null, null, `No pude anular la de las ${v.hora} para cambiarla; sigo vigilando`); return; }
  }
  const r = await correr('reservar.mjs', ['--fecha', v.fecha, '--hora', v.quiere_hora]);
  if (r.ok) {
    const calle = calleDe(r.salida);
    await apuntar(v.id, v.quiere_hora, calle, swap ? `Cambiada desde las ${v.hora}` : 'Cogida al liberarse');
    resumen(`✅ ${v.fecha}: reservada a las **${v.quiere_hora}**${calle ? ' (' + calle + ')' : ''}${swap ? ', antes a las ' + v.hora : ''}.`);
    return;
  }
  if (!swap) { log('No salió; sigo vigilando'); return; }
  // La nueva no salió: recuperar la de antes
  log(`No salió la de las ${v.quiere_hora}; recupero la de las ${v.hora}`);
  const vuelta = await correr('reservar.mjs', ['--fecha', v.fecha, '--hora', v.hora]);
  if (vuelta.ok) {
    await apuntar(v.id, null, null, `Se liberó pero otro la cogió antes; mantienes la de las ${v.hora}. Sigo vigilando`);
    resumen(`⚠️ ${v.fecha}: no salió el cambio a las ${v.quiere_hora}; mantienes la de las ${v.hora}.`);
  } else {
    await apuntar(v.id, null, null, `Perdí el cambio: anulé la de las ${v.hora} y no pude coger ni la de las ${v.quiere_hora} ni volver a la de antes. Sigo vigilando las ${v.quiere_hora}`);
    resumen(`❌ ${v.fecha}: anulé la de las ${v.hora} y no pude coger ninguna. Sigo vigilando.`);
    process.exitCode = 1;
  }
}

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

const fin = Date.now() + DURACION;
let vueltas = 0;
while (Date.now() < fin) {
  const ahora = madrid();
  if (ahora.hora >= '23:20' || ahora.hora < '06:30') { log('Fuera de horario (23:20–06:30): paro'); break; }
  let lista;
  try { lista = await rpc('piscina_robot_vigilar', {}) || []; }
  catch (e) { log('No pude leer la app:', e.message); await espera(PAUSA); continue; }
  const abiertos = [ahora.fecha, masDias(ahora.fecha, 1), masDias(ahora.fecha, 2)];
  // Ya conseguido (la reserva ya está a la hora pedida): quitar el aviso
  for (const v of lista.filter(v => v.estado === 'reservada' && v.hora === v.quiere_hora)) await apuntar(v.id, v.hora, null, null);
  const vivos = lista.filter(v => abiertos.includes(v.fecha) && !(v.estado === 'reservada' && v.hora === v.quiere_hora)
    && !(v.fecha === ahora.fecha && v.quiere_hora <= ahora.hora));
  if (!vivos.length) { log(vueltas ? 'Ya no queda nada que vigilar' : 'Nada que vigilar ahora'); break; }
  if (!vueltas) log('Vigilando:', vivos.map(v => `${v.fecha} ${v.quiere_hora}${v.estado === 'reservada' ? ' (tienes las ' + v.hora + ')' : ''}`).join(' · '));
  vueltas++;
  try {
    const m = await huecos([...new Set(vivos.map(v => v.fecha))], [...new Set(vivos.map(v => v.quiere_hora))]);
    let hecho = false;
    for (const v of vivos) {
      const libres = m.get(v.fecha + '|' + v.quiere_hora) || [];
      if (libres.length) { await cambiar(v, libres); hecho = true; }
    }
    if (hecho) await correr('sincronizar.mjs', []);
  } catch (e) { log('Error mirando huecos:', e.message); }
  await espera(PAUSA);
}
