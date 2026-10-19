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

// Abrir la ficha (carrito) de la próxima reserva activa, como el «ojo» de la tabla, SIN anular nada
for (let i = 0; i < 15 && !(await page.locator('table tbody tr td').count()); i++) await page.waitForTimeout(1000);
const objetivo = await page.evaluate(() => {
  const t = document.querySelector('table.footable, table[class*=footable]');
  const ft = t && window.FooTable && window.FooTable.get(t);
  if (!ft) return null;
  const hoy = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const filas = ft.rows.all.map(r => r.value).filter(v => !/anulad/i.test(v.ESTADO_CONFIRMACION || '') && String(v.FECHA_ALQUILER) >= hoy);
  filas.sort((a, b) => String(a.FECHA_ALQUILER).localeCompare(String(b.FECHA_ALQUILER)));
  return filas[0] ? { carrito: String(filas[0].COD_CARRITO), fecha: String(filas[0].FECHA_ALQUILER), hora: String(filas[0].HORA_RESERVA) } : null;
});
log('Próxima reserva activa:', objetivo ? `${objetivo.fecha} ${objetivo.hora}` : 'ninguna');
if (objetivo) {
  await page.addScriptTag({ content: `__doPostBack('ContentSection_uAlquileres_uAlert_uplAlert', JSON.stringify({ action: 'Consultar', args: { cartCode: '${objetivo.carrito}' } }));` });
  await quieto(); await page.waitForTimeout(2500);
  await describir('Ficha de la reserva (sin anular)');
  // Textos visibles de la ficha (avisos de plazos, etc.), sin datos personales
  const textos = await page.evaluate(() => [...document.querySelectorAll('[id*=uCarritosFicha] *')]
    .filter(e => e.offsetParent && e.children.length === 0).map(e => e.textContent.trim().replace(/\s+/g, ' ')).filter(t => t && t.length < 120));
  log('  Textos de la ficha:', [...new Set(textos)].map(limpio).slice(0, 60).join(' | '));
  // Qué hace el botón «Anular» (su código), sin pulsarlo
  const codigo = await page.evaluate(() => {
    const out = [];
    for (const f of ['ContentSection_uAlquileres_uCarritosFicha_doPostBackRefundCart', 'ContentSection_uAlquileres_uCarritosFicha_doPostBackRefundCartItem']) if (window[f]) out.push(String(window[f]).replace(/\s+/g, ' ').slice(0, 400));
    const b = [...document.querySelectorAll('button, a, input[type=button]')].filter(x => /anular/i.test(x.textContent || x.value || '')).map(x => (x.outerHTML || '').replace(/\s+/g, ' ').slice(0, 300));
    return out.concat(b);
  });
  log('  Código de anular:', codigo.join(' || '));
}
await navegador.close();
