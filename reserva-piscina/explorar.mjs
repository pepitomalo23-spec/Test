// Recorre «Mi cuenta» con la sesión del usuario y describe cada pantalla (para depurar el robot).
// Si se le pasa --confirmar-carrito, además pulsa «Confirmar la compra» en el carrito pendiente.
// Los registros son públicos: se quitan nombres propios, correos, DNI y teléfonos.

import { chromium } from 'playwright';

const BASE = 'https://gestiones.imdcordoba.es/CronosWeb';
const CONFIRMAR = process.argv.includes('--confirmar-carrito');
const log = (...m) => console.log(new Date().toLocaleTimeString('es-ES', { timeZone: 'Europe/Madrid' }), '·', ...m);

const PRIVADO = [/\S+@\S+/, /\b\d{8}[A-Z]\b/i, /\b[XYZ]\d{7}[A-Z]\b/i, /\b\d{9}\b/,
  /([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+ ){2,}[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+/]; // 3 o más palabras con mayúscula = nombre
const limpio = (t) => PRIVADO.some(r => r.test(t)) ? '[oculto]' : t;

const navegador = await chromium.launch();
const page = await navegador.newPage({ locale: 'es-ES', timezoneId: 'Europe/Madrid', viewport: { width: 1280, height: 900 } });
page.setDefaultTimeout(20000);
page.on('dialog', d => { log('Aviso de la web:', limpio(d.message().slice(0, 200))); d.accept(); });
const quieto = () => page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});

async function describir(etiqueta) {
  await quieto();
  const d = await page.evaluate(() => {
    const vis = (e) => e.offsetParent && !e.closest('footer, .cc-window');
    const txt = (e) => (e.innerText || e.value || e.title || e.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ');
    return {
      titulos: [...document.querySelectorAll('h1,h2,h3,h4,h5,.alert,.label,.badge,[class*=title],[class*=estado]')].filter(vis).map(txt).filter(Boolean),
      botones: [...document.querySelectorAll('button, input[type=submit], input[type=button], a.btn')].filter(vis).map(e => `${txt(e)}${e.disabled ? ' (inactivo)' : ''}`).filter(Boolean),
      enlaces: [...document.querySelectorAll('a')].filter(vis).map(a => `${txt(a)} → ${(a.getAttribute('href') || '').slice(0, 90)}`).filter(s => !/^ → $/.test(s)),
      ocultosConTexto: [...document.querySelectorAll('button, a.btn, input[type=submit]')].filter(e => !e.offsetParent && txt(e)).map(txt),
    };
  });
  const uniq = (a) => [...new Set(a.map(s => limpio(s.slice(0, 100))))];
  log(`=== ${etiqueta} · ${new URL(page.url()).pathname}`);
  log('  Títulos/estados:', uniq(d.titulos).join(' | '));
  log('  Botones:', uniq(d.botones).join(' | '));
  log('  Botones ocultos:', uniq(d.ocultosConTexto).join(' | '));
  log('  Enlaces:', uniq(d.enlaces).join(' | '));
}

// Entrar
await page.goto(`${BASE}/Login`, { waitUntil: 'networkidle' });
await page.click('.cc-dismiss').catch(() => {});
await page.click('text=Acceso identificado');
await page.fill('#ContentFixedSection_uLogin_txtIdentificador', process.env.IMD_USUARIO);
await page.fill('#ContentFixedSection_uLogin_txtContrasena', process.env.IMD_CONTRASENA);
await page.click('#ContentFixedSection_uLogin_btnLogin');
await page.waitForURL(u => !/\/Login/i.test(u.pathname), { timeout: 30000 }).catch(() => {});
await describir('Portada');

// Mi cuenta (enlace de la barra superior)
async function irAMiCuenta() {
  await page.goto(`${BASE}/Home`, { waitUntil: 'networkidle' });
  await page.addScriptTag({ content: "__doPostBack('uAlert_uplAlert', 'MiCuenta');" });
  await page.waitForURL(u => !/\/Home$/i.test(u.pathname), { timeout: 15000 }).catch(() => {});
  await quieto();
}
await irAMiCuenta();
await describir('Mi cuenta');

// Acciones de la página escondidas en el código (postbacks y funciones), sin datos personales
async function acciones(etiqueta) {
  const html = await page.content();
  const pb = [...new Set([...html.matchAll(/__doPostBack\(([^)]{0,160})\)/g)].map(m => m[1].replace(/\s+/g, ' ')))];
  const fn = [...new Set([...html.matchAll(/function\s+([\w$]*(?:Carrito|Compra|Confirmar|Pagar|Anular|Eliminar|Pendiente)[\w$]*)\s*\(/gi)].map(m => m[1]))];
  log(`  Postbacks en ${etiqueta}:`, pb.slice(0, 40).join(' || '));
  log(`  Funciones en ${etiqueta}:`, fn.join(' | '));
}

// 1) Reserva de espacios: ¿enseña el carrito pendiente con «Confirmar la compra»?
await page.goto(`${BASE}/Home`, { waitUntil: 'networkidle' });
await page.getByText('Reserva de espacios', { exact: true }).first().click();
await quieto(); await page.waitForTimeout(2000);
await describir('Reserva de espacios');
await acciones('Reserva de espacios');
if (CONFIRMAR) {
  const b = page.locator('button:visible, a:visible, input[type=submit]:visible').filter({ hasText: /^confirmar la compra$/i }).first();
  if (await b.count()) {
    log('Pulso «Confirmar la compra»');
    await b.click();
    await quieto(); await page.waitForTimeout(3000);
    await describir('Después de confirmar');
    await acciones('Después de confirmar');
  }
}

// 2) Anulaciones y gestión de reservas
await irAMiCuenta();
await page.getByText('Anulaciones y gestión de reservas').first().click();
await quieto(); await page.waitForTimeout(1500);
await page.getByText('Pendiente').first().waitFor({ timeout: 10000 }).catch(() => {});
await describir('Anulaciones y gestión de reservas');
await acciones('Anulaciones');

// Abrir la fila pendiente y su detalle (icono del ojo)
const fila = page.locator('tr', { hasText: 'Pendiente' }).first();
if (await fila.count()) {
  await fila.click().catch(() => {});
  await page.waitForTimeout(800);
  const ojos = page.locator('button:visible, a:visible').filter({ has: page.locator('.glyphicon-eye-open, .material-icons, [class*=eye], i, span') });
  log('  Botones con icono visibles:', await ojos.count());
  const ojo = page.locator('tr', { hasText: 'Pendiente' }).first().locator('xpath=following-sibling::tr[1]').locator('button, a').first();
  const objetivo = (await ojo.count()) ? ojo : ojos.first();
  await objetivo.click().catch(e => log('  No pude pulsar el ojo:', e.message.slice(0, 80)));
  await quieto(); await page.waitForTimeout(2000);
  await describir('Detalle de la reserva pendiente');
  await acciones('Detalle');
  // Bajar del todo por si los botones están abajo
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(800);
  await describir('Detalle (abajo del todo)');

  if (CONFIRMAR) {
    const b = page.locator('button, a, input[type=submit]').filter({ hasText: /confirmar la compra|confirmar/i }).first();
    if (await b.isVisible().catch(() => false)) {
      log('Pulso «Confirmar la compra»');
      await b.click();
      await quieto(); await page.waitForTimeout(2500);
      await describir('Después de confirmar');
    } else log('No hay botón de confirmar visible');
  }
} else log('No hay ninguna fila «Pendiente»');
await navegador.close();
