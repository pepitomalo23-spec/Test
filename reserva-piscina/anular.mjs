// Anula en IMDECO la reserva de piscina de un día y hora («Anulaciones y gestión de reservas»
// → ficha del carrito → «Anular» → «Sí»).
//
//   node anular.mjs --fecha 2026-10-20 --hora 09:00            anula
//   node anular.mjs --fecha 2026-10-20 --hora 09:00 --prueba   llega hasta el botón «Anular» y NO lo pulsa
//
// Variables: IMD_USUARIO, IMD_CONTRASENA. Sale con 0 si queda anulada (o con --prueba si todo está en su sitio).
// Los registros son públicos: no se escriben datos personales.

import { chromium } from 'playwright';

const BASE = 'https://gestiones.imdcordoba.es/CronosWeb';
const args = process.argv.slice(2);
const arg = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const fecha = arg('--fecha'), hora = arg('--hora'), PRUEBA = args.includes('--prueba');
const log = (...m) => console.log(new Date().toLocaleTimeString('es-ES', { timeZone: 'Europe/Madrid' }), '· anular ·', ...m);
if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha || '') || !/^\d{2}:\d{2}$/.test(hora || '')) { console.error('Uso: --fecha AAAA-MM-DD --hora HH:MM'); process.exit(1); }

const navegador = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH, args: ['--headless=new'] } : {});
const page = await navegador.newPage({ locale: 'es-ES', timezoneId: 'Europe/Madrid', viewport: { width: 1280, height: 900 } });
page.setDefaultTimeout(20000);
page.on('dialog', d => { log('Aviso de la web:', d.message().slice(0, 200)); d.accept(); });
const quieto = () => page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});

// Las reservas de la tabla (FooTable), sin datos personales
async function leerTabla() {
  for (let i = 0; i < 15 && !(await page.locator('table tbody tr td').count()); i++) await page.waitForTimeout(1000);
  return page.evaluate(() => {
    const t = document.querySelector('table.footable, table[class*=footable]');
    const ft = t && window.FooTable && window.FooTable.get(t);
    if (!ft) return [];
    return ft.rows.all.map(r => r.value).map(v => ({
      carrito: String(v.COD_CARRITO), fecha: String(v.FECHA_ALQUILER), hora: String(v.HORA_RESERVA).slice(0, 5),
      anulada: /anulad/i.test(String(v.ESTADO_CONFIRMACION || '')),
    }));
  });
}
async function irAAnulaciones() {
  await page.goto(`${BASE}/Home`, { waitUntil: 'networkidle' });
  await page.addScriptTag({ content: "__doPostBack('uAlert_uplAlert', 'MiCuenta');" });
  await page.waitForURL(/\/Account/i, { timeout: 15000 }).catch(() => {});
  await quieto();
  await page.getByText('Anulaciones y gestión de reservas').first().click();
  await quieto();
}

let salida = 1;
try {
  await page.goto(`${BASE}/Login`, { waitUntil: 'networkidle' });
  await page.click('.cc-dismiss').catch(() => {});
  await page.click('text=Acceso identificado');
  await page.fill('#ContentFixedSection_uLogin_txtIdentificador', process.env.IMD_USUARIO);
  await page.fill('#ContentFixedSection_uLogin_txtContrasena', process.env.IMD_CONTRASENA);
  await page.click('#ContentFixedSection_uLogin_btnLogin');
  await page.waitForURL(u => !/\/Login/i.test(u.pathname), { timeout: 30000 }).catch(() => {});
  if (/\/Login/i.test(new URL(page.url()).pathname)) throw new Error('No se pudo iniciar sesión');

  await irAAnulaciones();
  const clave = fecha.replace(/-/g, '');
  const fila = (await leerTabla()).find(r => r.fecha === clave && r.hora === hora && !r.anulada);
  if (!fila) throw new Error(`No hay ninguna reserva activa el ${fecha} a las ${hora}`);
  log(`Reserva encontrada (${fecha} ${hora})`);

  // La ficha del carrito, como el «ojo» de la tabla
  await page.addScriptTag({ content: `__doPostBack('ContentSection_uAlquileres_uAlert_uplAlert', JSON.stringify({ action: 'Consultar', args: { cartCode: '${fila.carrito}' } }));` });
  const btn = page.locator('#ContentSection_uAlquileres_uCarritosFicha_btnRefundCart');
  await btn.waitFor({ state: 'visible', timeout: 20000 });
  if (PRUEBA) { log('MODO PRUEBA: el botón «Anular» está ahí; no lo pulso'); salida = 0; }
  else {
    await btn.click();
    // Confirmación: «Sí» (y si avisa de algo, se acepta)
    for (let i = 0; i < 3; i++) {
      const si = page.locator('button:visible, a.btn:visible').filter({ hasText: /^(sí|si|aceptar|confirmar)$/i }).first();
      if (!(await si.count())) break;
      log(`Pulso «${(await si.innerText()).trim()}»`);
      await si.click();
      await quieto(); await page.waitForTimeout(1500);
    }
    const error = await page.locator('.alert-danger:visible').first().innerText().catch(() => '');
    if (error) throw new Error('La web dice: ' + error.replace(/^x\s*/, '').trim().slice(0, 200));
    // Comprobar en la tabla que ya sale anulada
    await irAAnulaciones();
    const ahora = (await leerTabla()).filter(r => r.fecha === clave && r.hora === hora);
    if (ahora.some(r => !r.anulada)) throw new Error('Pulsé «Anular» pero la reserva sigue activa');
    log(`✅ Anulada (${fecha} ${hora})`);
    salida = 0;
  }
} catch (e) {
  log('❌', e.message);
} finally {
  await navegador.close();
}
process.exit(salida);
