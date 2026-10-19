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

// Entrar en cada opción que tenga que ver con compras, carritos o reservas
const opciones = await page.$$eval('a, .cronos-box, [onclick]', els => [...new Set(els.filter(e => e.offsetParent)
  .map(e => (e.innerText || '').trim().replace(/\s+/g, ' ')).filter(t => t && t.length < 60))]);
const interesantes = opciones.filter(t => /carrito|compra|pedido|reserva|anulaci|pendiente|historial|movimiento/i.test(t));
log('Opciones interesantes en Mi cuenta:', interesantes.map(limpio).join(' | '));

for (const op of interesantes.slice(0, 6)) {
  await irAMiCuenta();
  const el = page.getByText(op, { exact: true }).first();
  if (!(await el.isVisible().catch(() => false))) continue;
  await el.click();
  await quieto();
  await page.waitForTimeout(1500);
  await describir(`Opción «${limpio(op)}»`);

  // Si hay algo «Pendiente» que se pueda abrir, abrirlo
  const pend = page.getByText(/^Pendiente$/).first();
  if (await pend.isVisible().catch(() => false)) {
    await pend.click().catch(() => {});
    await quieto(); await page.waitForTimeout(1500);
    await describir(`Dentro de lo pendiente («${limpio(op)}»)`);
    if (CONFIRMAR) {
      const b = page.getByRole('button', { name: /confirmar la compra/i }).or(page.getByText(/^Confirmar la compra$/)).first();
      if (await b.isVisible().catch(() => false)) {
        log('Pulso «Confirmar la compra»');
        await b.click();
        await quieto(); await page.waitForTimeout(2500);
        await describir('Después de confirmar');
        await navegador.close();
        process.exit(0);
      }
    }
  }
}
await navegador.close();
