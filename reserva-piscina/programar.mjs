// Apunta o quita una reserva en reservas.json (lo usa el formulario «Programar piscina» de GitHub Actions).
// Variables de entorno: FECHA (2026-10-23, 23/10/2026 o 23/10), HORA (08:00… o «Quitar» o «Solo ver la lista»)

import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const RUTA = join(dirname(fileURLToPath(import.meta.url)), 'reservas.json');
const HORAS = ['08:00', '09:00', '13:00', '14:00', '15:00', '22:00'];
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

const resumen = (t) => { console.log(t); if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, t + '\n'); };
const fallo = (t) => { resumen('❌ ' + t); process.exit(1); };

const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date()); // AAAA-MM-DD
const sumarDias = (iso, n) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const diaSemana = (iso) => DIAS[new Date(iso + 'T12:00:00Z').getUTCDay()];
const bonita = (iso) => `${diaSemana(iso)} ${iso.split('-').reverse().join('/')}`;

function normalizarFecha(txt) {
  txt = (txt || '').trim();
  let m = txt.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = txt.match(/^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?$/);
  if (m) {
    let anio = m[3] ? (m[3].length === 2 ? '20' + m[3] : m[3]) : hoy.slice(0, 4);
    let iso = `${anio}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    if (!m[3] && iso < hoy) iso = `${+anio + 1}${iso.slice(4)}`; // 02/01 escrito en diciembre = el año que viene
    return iso;
  }
  return null;
}

const plan = JSON.parse(readFileSync(RUTA, 'utf8'));
plan.reservas ||= {};
// Fuera lo que ya pasó
for (const f of Object.keys(plan.reservas)) if (f < hoy) delete plan.reservas[f];

const hora = (process.env.HORA || '').trim();
if (!/^solo ver/i.test(hora)) {
  const fecha = normalizarFecha(process.env.FECHA);
  if (!fecha || isNaN(new Date(fecha + 'T12:00:00Z'))) fallo(`No entiendo la fecha «${process.env.FECHA || ''}». Escríbela así: 23/10/2026`);
  if (/^quitar/i.test(hora)) {
    if (plan.reservas[fecha]) { delete plan.reservas[fecha]; resumen(`🗑️ Quitada la reserva del **${bonita(fecha)}**.`); }
    else resumen(`No había nada apuntado el **${bonita(fecha)}**.`);
  } else {
    if (!HORAS.includes(hora)) fallo(`Hora no válida: ${hora}`);
    // El día D se abre a las 00:00 del día D-2: si eso ya pasó, el robot ya no llega
    if (fecha <= sumarDias(hoy, 2)) {
      fallo(`El **${bonita(fecha)}** ya está abierto para reservar (se abre 2 días antes a las 00:00). Resérvalo a mano en la web, o con «Reservar piscina» poniendo la fecha y quitando la casilla de prueba.`);
    }
    plan.reservas[fecha] = hora;
    const aviso = ['sábado', 'domingo'].includes(diaSemana(fecha)) ? ' (ojo: es fin de semana)' : '';
    resumen(`✅ Apuntado: **${bonita(fecha)} a las ${hora}**${aviso}. Se reservará sola el ${bonita(sumarDias(fecha, -2))} a las 00:00.`);
  }
}

plan.reservas = Object.fromEntries(Object.entries(plan.reservas).sort());
writeFileSync(RUTA, JSON.stringify(plan, null, 2) + '\n');

const lista = Object.entries(plan.reservas);
resumen('\n### Reservas apuntadas\n' + (lista.length ? lista.map(([f, h]) => `- ${bonita(f)} a las ${h}`).join('\n') : '_Ninguna_'));
