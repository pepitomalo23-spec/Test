// Reserva automática de piscina en IMDECO (PMD Vista Alegre).
//
// Uso:
//   node reservar.mjs                      espera a las 00:00 de Madrid y reserva lo que diga reservas.json
//                                          para el día que se abre (dentro de 2 días)
//   node reservar.mjs --fecha 2026-10-21 --hora 08:00   reserva ese día y hora ya, sin esperar
//   añadir --prueba    llega hasta elegir la calle pero NO confirma la reserva
//   añadir --anonimo   sin iniciar sesión (solo para probar la navegación; implica --prueba)
//   --carrito          entra y confirma lo que haya en el carrito (si una reserva se quedó a medias)
//   --comprobar        solo dice si esta noche hay algo que reservar (sin abrir el navegador)
//
// Variables de entorno: IMD_USUARIO, IMD_CONTRASENA, RESERVAS_JSON (ruta, por defecto ./reservas.json)
//
// El repo es público: los registros no deben mostrar datos personales.

import { readFileSync, existsSync, appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const BASE = 'https://gestiones.imdcordoba.es/CronosWeb';
const CENTRO = 'PMD VISTALEGRE';
const DIAS_ANTELACION = 2;
// Cuánto tiempo seguir intentando tras las 00:00 si el día aún no aparece
const MINUTOS_REINTENTO = 4;

// Errores de la web tras los que tiene sentido reintentar
class ErrorWeb extends Error {}

const args = process.argv.slice(2);
const arg = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const ANONIMO = args.includes('--anonimo');
const CARRITO = args.includes('--carrito');
const PRUEBA = ANONIMO || args.includes('--prueba');

const log = (...m) => console.log(new Date().toLocaleTimeString('es-ES', { timeZone: 'Europe/Madrid' }), '·', ...m);
const resumen = (t) => { if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, t + '\n'); };

// ---------- fechas en hora de Madrid ----------
function partesMadrid(d = new Date()) {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
  const p = Object.fromEntries(f.formatToParts(d).map(x => [x.type, x.value]));
  return { fecha: `${p.year}-${p.month}-${p.day}`, h: +p.hour, m: +p.minute, s: +p.second };
}
const sumarDias = (iso, n) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

// Las 00:00 que toca: la próxima si faltan menos de 70 min, o la que acaba de pasar (hasta 30 min después,
// por si GitHub arranca tarde). Devuelve { abre: Date de las 00:00, fecha: día que se abre } o null.
function medianocheObjetivo() {
  const ahora = Date.now();
  const p = partesMadrid(new Date(ahora));
  const desde = p.h * 3600 + p.m * 60 + p.s; // segundos desde las 00:00 de hoy
  if (p.h === 0 && p.m < 30) return { abre: new Date(ahora - desde * 1000), fecha: sumarDias(p.fecha, DIAS_ANTELACION) };
  const falta = 86400 - desde;
  if (falta <= 70 * 60) return { abre: new Date(ahora + falta * 1000), fecha: sumarDias(p.fecha, 1 + DIAS_ANTELACION) };
  return null;
}

function franjaDeHora(hora) {
  const h = parseInt(hora, 10);
  if (h < 12) return 'Piscina Mañana';
  if (h < 18) return 'Piscina Medio Día';
  return 'Piscina Tarde';
}

// ---------- qué reservar ----------
let fecha = arg('--fecha');
let hora = arg('--hora');
let abre = null;
if (CARRITO) { fecha = '0000-00-00'; hora = '00:00'; }
if (!fecha) {
  const obj = medianocheObjetivo();
  if (!obj) { log('No es la hora: esto se ejecuta cerca de las 00:00 de Madrid. Nada que hacer.'); process.exit(0); }
  fecha = obj.fecha; abre = obj.abre;
  const ruta = process.env.RESERVAS_JSON || join(dirname(fileURLToPath(import.meta.url)), 'reservas.json');
  const plan = existsSync(ruta) ? JSON.parse(readFileSync(ruta, 'utf8')) : { reservas: {} };
  hora = plan.reservas?.[fecha];
  if (!hora) { log(`No hay reserva apuntada para el ${fecha}. Nada que hacer.`); process.exit(0); }
}
// Para ensayar la espera: --abre 2026-10-19T00:30:00+02:00 hace como si el día se abriera a esa hora
if (arg('--abre')) abre = new Date(arg('--abre'));
if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || !/^\d{2}:\d{2}$/.test(hora)) { console.error('Fecha u hora mal escritas'); process.exit(1); }
if (args.includes('--comprobar')) {
  log(`Esta noche toca reservar: ${fecha} a las ${hora}`);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, 'hay=1\n');
  process.exit(0);
}
const HHMM = hora.replace(':', '');
const franja = franjaDeHora(hora);
log(CARRITO ? 'Objetivo: confirmar el carrito' : `Objetivo: ${fecha} a las ${hora} (${franja})${PRUEBA ? ' — MODO PRUEBA, no se confirma' : ''}`);

if (!ANONIMO && (!process.env.IMD_USUARIO || !process.env.IMD_CONTRASENA)) {
  console.error('Faltan IMD_USUARIO / IMD_CONTRASENA'); process.exit(1);
}

// ---------- navegador ----------
const { chromium } = await import('playwright');
const navegador = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH, args: ['--headless=new'] } : {});
const page = await navegador.newPage({ locale: 'es-ES', timezoneId: 'Europe/Madrid', viewport: { width: 1280, height: 900 } });
page.setDefaultTimeout(20000);
page.on('dialog', d => { log('Aviso de la web:', d.message().slice(0, 200)); d.accept(); });

const quieto = () => page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
const textoVisible = async () => (await page.innerText('#form1').catch(() => '')).replace(/\s+/g, ' ');

// Lista de botones y enlaces visibles (para entender la pantalla en los registros sin volcar datos)
async function botones() {
  return page.$$eval('button, a, input[type=submit], input[type=button]', els => els
    .filter(e => e.offsetParent && !e.closest('footer, .cc-window, nav, header'))
    .map(e => (e.innerText || e.value || e.title || '').trim().replace(/\s+/g, ' '))
    .filter(t => t && t.length < 60 && !/@/.test(t)));
}

async function iniciarSesion() {
  await page.context().clearCookies(); // siempre con sesión nueva
  await page.goto(`${BASE}/Login`, { waitUntil: 'networkidle' });
  await page.click('.cc-dismiss').catch(() => {});
  if (ANONIMO) { await page.click('text=Acceso no identificado'); await page.waitForURL(/\/Home/i); await quieto(); return; }
  await page.click('text=Acceso identificado');
  await page.fill('#ContentFixedSection_uLogin_txtIdentificador', process.env.IMD_USUARIO);
  await page.fill('#ContentFixedSection_uLogin_txtContrasena', process.env.IMD_CONTRASENA);
  await page.click('#ContentFixedSection_uLogin_btnLogin');
  await page.waitForURL(u => !/\/Login/i.test(u.pathname), { timeout: 30000 }).catch(() => {});
  await quieto();
  if (/\/Login/i.test(new URL(page.url()).pathname)) throw new Error('No se pudo iniciar sesión (¿usuario o contraseña mal?)');
  log('Sesión iniciada');
}

// Desde la portada hasta el calendario de la franja de piscina
async function irAlCalendario() {
  for (let i = 0; ; i++) {
    try { await page.goto(`${BASE}/Home`, { waitUntil: 'networkidle' }); break; }
    catch (e) { if (i >= 3) throw e; await page.waitForTimeout(500); }
  }
  if (!ANONIMO && /\/Login/i.test(new URL(page.url()).pathname)) {
    log('La sesión se había cerrado; vuelvo a entrar');
    await iniciarSesion();
    await page.goto(`${BASE}/Home`, { waitUntil: 'networkidle' });
  }
  const entradas = [/reserva de espacios/i, /reserva.*(espacio|instalaci|piscina)/i, /alquiler/i, /consulta de espacios/i];
  let entrado = false;
  for (const re of entradas) {
    const el = page.getByText(re).first();
    if (await el.isVisible().catch(() => false)) { await el.click(); entrado = true; break; }
  }
  if (!entrado) throw new Error('No encuentro la opción de reservar espacios en la portada. Opciones: ' + (await botones()).join(' | '));
  await quieto();
  await page.getByText(CENTRO, { exact: false }).first().click();
  await quieto();
  await page.getByText(franja, { exact: true }).first().click();
  await page.waitForSelector('[id$=uFechaSeleccionar_datetimepicker] td[data-day]');
}

// Pide al servidor la parrilla del día (lo mismo que hace el botón «Continuar» del calendario).
// Es muy rápido (~0,3 s) y no depende de que el calendario ya muestre el día activo.
// Devuelve true cuando la parrilla nueva está en pantalla.
async function pedirDia() {
  const panel = '#ContentFixedSection_uReservaEspacios_uFechaSeleccionar_uAlert_uplAlert';
  if (!(await page.locator(panel).count())) return false;
  await page.evaluate(() => document.querySelectorAll('[id$=uReservaCuadrante_tblCasillas]').forEach(t => t.setAttribute('data-vieja', '1')));
  // addScriptTag y no evaluate: __doPostBack de ASP.NET falla en modo estricto
  await page.addScriptTag({ content: `__doPostBack('ContentFixedSection_uReservaEspacios_uFechaSeleccionar_uAlert_uplAlert', JSON.stringify({ action: 'Continuar', args: '${fecha}' }));` });
  const ok = await page.waitForSelector('[id$=uReservaCuadrante_tblCasillas]:not([data-vieja])', { timeout: 10000 }).then(() => true, () => false);
  if (!ok) {
    const aviso = await page.locator('.alert-danger:visible').first().innerText().catch(() => '');
    if (aviso) log('La web dice:', aviso.replace(/^x\s*/, '').trim().slice(0, 200));
  }
  return ok;
}

async function esperarA(t) {
  for (;;) {
    const falta = t.getTime() - Date.now();
    if (falta <= 0) return;
    if (falta > 60000) log(`Esperando a las 00:00… faltan ${Math.round(falta / 60000)} min`);
    await new Promise(r => setTimeout(r, Math.min(falta, 60000)));
  }
}

// Elige una calle libre a la hora pedida. Devuelve el nombre de la calle o null.
async function elegirCalle() {
  const horas = await page.$$eval('[id$=uReservaCuadrante_tblHoras] td[horadesde]', tds => tds.map(t => t.getAttribute('horadesde')));
  if (!horas.includes(hora)) throw new Error(`La hora ${hora} no existe ese día. Horas: ${horas.join(', ')}`);
  const calles = await page.$$eval('[id$=uReservaCuadrante_tblRecintos] td[deccodrecinto]', tds => tds.map(t => ({ cod: t.getAttribute('deccodrecinto'), nombre: t.innerText.trim() })));
  let libres = 0;
  for (const c of calles) {
    const img = page.locator(`img[id$="_img${c.cod}${HHMM}"]`);
    if ((await img.getAttribute('estado').catch(() => null)) !== 'Libre') continue;
    libres++;
    // La web marca la casilla con estado="Seleccionada" y activa el botón «Reservar (1)»
    await img.click();
    if ((await img.getAttribute('estado').catch(() => null)) === 'Seleccionada') return c.nombre;
  }
  if (libres) throw new ErrorWeb(`Hay ${libres} calles libres pero la web no deja seleccionarlas`);
  return null;
}

// Pulsa los botones de seguir hasta que la web diga que la reserva está hecha
async function confirmar(desdeCarrito = false) {
  if (!desdeCarrito) {
    await page.locator('[id$=uReservaCuadrante_btnReservar]').click();
    log('Pulso «Reservar»');
  }
  const OK = /(reserva|compra) (realizada|confirmada|efectuada|finalizada)|realizad[ao] correctamente|se ha (realizado|registrado)|localizador|operaci[oó]n realizada|justificante/i;
  // Tras «Reservar» la calle va a un carrito: «Eliminar el carrito | Confirmar la compra | Seguir comprando»
  const SIGUE = /^(continuar|siguiente|confirmar|confirmar reserva|confirmar la compra|reservar( \(\d+\))?|aceptar|finalizar|pagar con (bono|abono)|bono|abono|usar bono|terminar)$/i;
  const NO = /tarjeta|tpv|cancelar|atr[aá]s|volver|cerrar sesi|eliminar|borrar|seguir comprando/i;
  for (let paso = 0; paso < 8; paso++) {
    await quieto();
    if (OK.test(await textoVisible())) return true;
    // Normativa / condiciones: marcar las casillas de aceptación que haya
    const checks = page.locator('input[type=checkbox]:visible:not(:checked)');
    for (let i = 0; i < await checks.count(); i++) {
      const c = checks.nth(i);
      const etiqueta = await c.evaluate(e => (e.closest('label, div, tr')?.innerText || '').trim()).catch(() => '');
      if (/normativa|acepto|condiciones|le[ií]do/i.test(etiqueta)) { await c.check().catch(() => {}); log('Acepto la normativa'); }
    }
    const error = await page.locator('.alert-danger:visible').first().innerText().catch(() => '');
    if (error) throw new ErrorWeb('La web dice: ' + error.replace(/^x\s*/, '').trim().slice(0, 200));
    const cands = page.locator('button:visible, input[type=submit]:visible, input[type=button]:visible, a.btn:visible');
    const n = await cands.count();
    let pulsado = false;
    for (let i = n - 1; i >= 0; i--) {
      const b = cands.nth(i);
      const t = ((await b.innerText().catch(() => '')) || (await b.getAttribute('value')) || '').trim();
      if (!SIGUE.test(t) || NO.test(t) || !(await b.isEnabled().catch(() => false))) continue;
      log(`Pulso «${t}»`);
      await b.click();
      pulsado = true;
      break;
    }
    if (!pulsado) break;
    await page.waitForTimeout(1200);
  }
  return OK.test(await textoVisible());
}

async function describirPantalla() {
  const titulos = await page.$$eval('h1, h2, h3, h4, .alert', els => els.filter(e => e.offsetParent && !e.closest('footer'))
    .map(e => e.innerText.trim().replace(/\s+/g, ' ').slice(0, 80)).filter(t => t && !/@/.test(t))).catch(() => []);
  return `Página: ${new URL(page.url()).host}${new URL(page.url()).pathname} · Títulos: ${titulos.join(' | ')} · Botones: ${(await botones()).join(' | ')}`;
}

// Abre el carrito y confirma la compra
async function confirmarCarrito() {
  await page.goto(`${BASE}/Home`, { waitUntil: 'networkidle' });
  const enlace = page.locator('a, button').filter({ hasText: /carrito|cesta|shopping_cart/i })
    .or(page.locator('[title*=arrito i], [aria-label*=arrito i], a[href*=arrito i]')).first();
  if (!(await enlace.count())) {
    const hrefs = await page.$$eval('a[href]', as => [...new Set(as.map(a => a.getAttribute('href')).filter(h => h && !/^(mailto|http|#|javascript:void)/.test(h)))]);
    throw new Error('No encuentro el carrito. Enlaces: ' + hrefs.join(' | ') + ' · ' + await describirPantalla());
  }
  await enlace.click();
  await quieto();
  log('Carrito abierto. ' + await describirPantalla());
  return confirmar(true);
}

// ---------- marcha ----------
let salida = 1;
try {
  await iniciarSesion();
  if (CARRITO) {
    if (!(await confirmarCarrito())) throw new Error('No he visto el mensaje de compra hecha. ' + await describirPantalla());
    log('✅ Carrito confirmado. ' + await describirPantalla());
    resumen('✅ Carrito confirmado.');
    await navegador.close();
    process.exit(0);
  }
  await irAlCalendario();
  log('Calendario listo');

  if (abre) {
    // Ensayo antes de las 00:00: comprobar que la parrilla del día carga y que existe la hora
    if (await pedirDia()) {
      const horas = await page.$$eval('[id$=uReservaCuadrante_tblHoras] td[horadesde]', t => t.map(x => x.getAttribute('horadesde')));
      log('Ensayo: horas de ese día:', horas.join(', '));
    }
    // La sesión puede caducar en la espera: se vuelve a entrar con una nueva hora y media antes
    await esperarA(new Date(abre.getTime() - 90000));
    if (Date.now() < abre.getTime() - 30000) {
      await iniciarSesion();
      await irAlCalendario();
      await pedirDia();
      log('Sesión renovada, todo listo');
    }
    await esperarA(new Date(abre.getTime() + 300));
    log('¡Son las 00:00!');
  }
  // En la de las 00:00 se reintenta unos minutos, por si el servidor tarda en abrir el día
  const limite = abre ? Date.now() + MINUTOS_REINTENTO * 60000 : 0;
  let hecho = false;
  for (let intento = 1; !hecho; intento++) {
    try {
      if (!(await pedirDia())) {
        await irAlCalendario();
        if (!(await pedirDia())) throw new ErrorWeb(`No consigo abrir la parrilla del ${fecha}`);
      }
      const calle = await elegirCalle();
      if (!calle) throw new ErrorWeb(`No queda ninguna calle libre el ${fecha} a las ${hora}`);
      log(`Calle elegida: ${calle}`);

      if (PRUEBA) {
        const br = page.locator('[id$=uReservaCuadrante_btnReservar]');
        log('MODO PRUEBA: no confirmo. Botón:', await br.innerText().catch(() => '¿no está?'), (await br.isEnabled().catch(() => false)) ? '(activo)' : '(inactivo)');
        log('Botones en pantalla:', (await botones()).join(' | '));
        resumen(`Prueba correcta: llegué a elegir **${calle}** el **${fecha}** a las **${hora}** (sin confirmar).`);
        salida = 0; hecho = true;
      } else if (await confirmar()) {
        log(`✅ RESERVADO: ${fecha} ${hora}, ${calle}`);
        resumen(`✅ Reservada la piscina el **${fecha}** a las **${hora}** (${calle}).`);
        salida = 0; hecho = true;
      } else {
        // Sin mensaje de éxito ni de error: no reintentar, por no reservar dos veces
        throw new Error('No he visto el mensaje de reserva hecha; revisa tus reservas en la web. ' + await describirPantalla());
      }
    } catch (e) {
      // Reintentar no arregla tener ya una reserva pendiente (IMDECO solo deja 1 a la vez)
      if (/m[aá]s de \d+ reservas/i.test(e.message)) throw new Error(e.message + ' Ya tienes otra reserva pendiente; IMDECO solo deja una a la vez.');
      if (!(e instanceof ErrorWeb) || Date.now() >= limite) throw e;
      log(`Intento ${intento}: ${e.message}. Reintento…`);
      await page.waitForTimeout(1000);
      await irAlCalendario().catch(() => {});
    }
  }
} catch (e) {
  log('❌', e.message);
  resumen(`❌ No se pudo reservar el **${fecha}** a las **${hora}**: ${e.message}`);
} finally {
  await navegador.close();
}
process.exit(salida);
