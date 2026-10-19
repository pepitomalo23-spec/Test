// Navegador «armado» para el vigilante: con la sesión iniciada y todo abierto antes de que se
// libere el hueco, para que coger la calle (y anular la reserva vieja, si es un cambio) sean
// unos pocos clics. Es la misma forma de reservar y anular que reservar.mjs y anular.mjs
// (probadas con la cuenta real), pero sin volver a entrar cada vez.
//   const r = new Armado(); await r.abrir();
//   await r.armarReserva('2026-10-20', '14:00');           // parrilla de esa franja, lista
//   await r.armarAnulacion('2026-10-20', '09:00');         // ficha de la reserva vieja, con «Anular» a mano
//   await r.anular(); const calle = await r.reservar();     // al liberarse
// Los registros son públicos: no se escriben datos personales.

import { chromium } from 'playwright';
import { franjaDe } from './huecos.mjs';

const BASE = 'https://gestiones.imdcordoba.es/CronosWeb';
const log = (...m) => console.log(new Date().toLocaleTimeString('es-ES', { timeZone: 'Europe/Madrid' }), '·', ...m);

// Lo que cobra el carrito (el mayor importe en € que se ve; 0 si no se ve ninguno)
export async function importe(p) {
  const t = await p.evaluate(() => document.body.innerText).catch(() => '');
  const n = [...t.matchAll(/(\d+(?:[.,]\d{1,2})?)\s*€/g)].map(m => parseFloat(m[1].replace(',', '.')));
  return n.length ? Math.max(...n) : 0;
}
// «Eliminar el carrito» (y el «Sí» del aviso, si sale)
export async function vaciar(p) {
  const b = p.locator('button:visible, input[type=submit]:visible, a.btn:visible').filter({ hasText: /eliminar (el )?carrito/i }).first();
  if (!(await b.count())) return false;
  await b.click({ timeout: 5000 }).catch(() => {});
  const si = p.locator('button:visible, a.btn:visible').filter({ hasText: /^(sí|si|aceptar|eliminar)$/i }).first();
  await si.waitFor({ timeout: 2500 }).then(() => si.click({ timeout: 3000 })).catch(() => {});
  await p.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
  return true;
}

export class Armado {
  nav = null; ctx = null; pr = null; pa = null;   // pr: página de reservar; pa: página de anular
  objetivo = null; vieja = null; sesionAt = 0;

  async abrir() {
    this.nav = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH, args: ['--headless=new'] } : {});
    this.ctx = await this.nav.newContext({ locale: 'es-ES', timezoneId: 'Europe/Madrid', viewport: { width: 1280, height: 900 } });
    this.ctx.setDefaultTimeout(20000);
    this.pr = await this.ctx.newPage();
    this.pr.on('dialog', d => d.accept());
    await this.entrar();
  }
  async cerrar() { await this.nav?.close().catch(() => {}); }

  async entrar() {
    const p = this.pr;
    await this.ctx.clearCookies();
    await p.goto(`${BASE}/Login`, { waitUntil: 'networkidle' });
    await p.click('.cc-dismiss').catch(() => {});
    await p.click('text=Acceso identificado');
    await p.fill('#ContentFixedSection_uLogin_txtIdentificador', process.env.IMD_USUARIO);
    await p.fill('#ContentFixedSection_uLogin_txtContrasena', process.env.IMD_CONTRASENA);
    await p.click('#ContentFixedSection_uLogin_btnLogin');
    await p.waitForURL(u => !/\/Login/i.test(u.pathname), { timeout: 30000 }).catch(() => {});
    if (/\/Login/i.test(new URL(p.url()).pathname)) throw new Error('No se pudo iniciar sesión');
    this.sesionAt = Date.now();
  }
  async inicio(p) {
    for (let i = 0; ; i++) {
      try { await p.goto(`${BASE}/Home`, { waitUntil: 'networkidle' }); break; }
      catch (e) { if (i >= 3) throw e; await p.waitForTimeout(500); }
    }
    if (/\/Login/i.test(new URL(p.url()).pathname)) { await this.entrar(); await p.goto(`${BASE}/Home`, { waitUntil: 'networkidle' }); }
  }
  // Renovar la sesión de vez en cuando (y volver a dejarlo todo preparado)
  async refrescarSiHace(min) {
    if (Date.now() - this.sesionAt < min * 60_000) return;
    log('Renuevo la sesión');
    await this.entrar();
    if (this.objetivo) await this.armarReserva(this.objetivo.fecha, this.objetivo.hora);
    if (this.vieja) await this.armarAnulacion(this.vieja.fecha, this.vieja.hora);
  }

  /* ---------- reservar ---------- */
  // Deja abierta la parrilla de la franja de esa hora (falta solo pedir el día y pulsar)
  async armarReserva(fecha, hora) {
    const p = this.pr;
    await this.inicio(p);
    await p.getByText('Reserva de espacios', { exact: true }).first().click();
    await p.waitForLoadState('networkidle').catch(() => {});
    await p.getByText('PMD VISTALEGRE').first().click();
    await p.waitForLoadState('networkidle').catch(() => {});
    await p.getByText(franjaDe(hora)[1], { exact: true }).first().click();
    await p.waitForSelector('[id$=uFechaSeleccionar_datetimepicker] td[data-day]');
    this.objetivo = { fecha, hora };
    // La parrilla de ese día, ya cargada (al liberarse se vuelve a pedir: 0,3 s)
    await this.pedirDia(fecha);
  }
  async pedirDia(fecha) {
    const p = this.pr;
    await p.evaluate(() => document.querySelectorAll('[id$=uReservaCuadrante_tblCasillas]').forEach(t => t.setAttribute('data-vieja', '1')));
    await p.addScriptTag({ content: `__doPostBack('ContentFixedSection_uReservaEspacios_uFechaSeleccionar_uAlert_uplAlert', JSON.stringify({ action: 'Continuar', args: '${fecha}' }));` });
    await p.waitForSelector('[id$=uReservaCuadrante_tblCasillas]:not([data-vieja])', { timeout: 10000 });
  }
  // Coge una calle libre a la hora armada. Devuelve el nombre de la calle; si no, lanza error.
  async reservar(prueba = false) {
    const p = this.pr, { fecha, hora } = this.objetivo, HHMM = hora.replace(':', '');
    if (!(await p.locator('[id$=uFechaSeleccionar_datetimepicker]').count())) await this.armarReserva(fecha, hora);
    else await this.pedirDia(fecha);
    const calles = await p.$$eval('[id$=uReservaCuadrante_tblRecintos] td[deccodrecinto]', tds => tds.map(t => ({ cod: t.getAttribute('deccodrecinto'), nombre: t.innerText.trim() })));
    let calle = null;
    for (const c of calles) {
      const img = p.locator(`img[id$="_img${c.cod}${HHMM}"]`);
      if ((await img.getAttribute('estado').catch(() => null)) !== 'Libre') continue;
      await img.click();
      if ((await img.getAttribute('estado').catch(() => null)) === 'Seleccionada') { calle = c.nombre; break; }
    }
    if (!calle) throw new Error(`Ya no queda calle libre el ${fecha} a las ${hora}`);
    if (prueba) return calle;   // prueba: seleccionada, sin pulsar «Reservar»
    await p.locator('[id$=uReservaCuadrante_btnReservar]').click();
    // Carrito: «Confirmar la compra» → página CarritoResultado
    const confirmarCompra = p.locator('button:visible, input[type=submit]:visible, a.btn:visible').filter({ hasText: /^confirmar la compra$/i }).first();
    const error = p.locator('.alert-danger:visible').first();
    await Promise.race([confirmarCompra.waitFor({ timeout: 20000 }), error.waitFor({ timeout: 20000 })]).catch(() => {});
    if (await error.count()) throw new Error('La web dice: ' + (await error.innerText()).replace(/^x\s*/, '').trim().slice(0, 200));
    // Solo horas gratis con el bono: si el carrito cobra algo, se vacía y no se compra
    const euros = await importe(p);
    if (euros > 0) { await vaciar(p); throw new Error(`Esa hora es de pago (${euros} €) y no la cubre el bono: no la cojo`); }
    await confirmarCompra.click();
    await p.waitForURL(/CarritoResultado/i, { timeout: 25000 }).catch(() => {});
    if (!/CarritoResultado/i.test(new URL(p.url()).pathname)) {
      // A veces la compra se hace pero no se llega a esa página: se mira en la lista de reservas
      log(`Sin página de confirmación (estoy en ${new URL(p.url()).pathname}); lo miro en tus reservas`);
      if (!(await this.tiene(fecha, hora))) throw new Error('No llegué a la confirmación de la compra');
    } else if (await p.locator('.alert-danger:visible').count()) throw new Error('La web dio un error al confirmar');
    this.objetivo = null;
    return calle;
  }

  /* ---------- anular ---------- */
  // Abre «Anulaciones y gestión de reservas» y busca la reserva viva de ese día y hora (su carrito)
  async buscar(fecha, hora) {
    if (!this.pa) { this.pa = await this.ctx.newPage(); this.pa.on('dialog', d => d.accept()); }
    const p = this.pa;
    await this.inicio(p);
    await p.addScriptTag({ content: "__doPostBack('uAlert_uplAlert', 'MiCuenta');" });
    await p.waitForURL(/\/Account/i, { timeout: 15000 }).catch(() => {});
    await p.waitForLoadState('networkidle').catch(() => {});
    await p.getByText('Anulaciones y gestión de reservas').first().click();
    await p.waitForLoadState('networkidle').catch(() => {});
    for (let i = 0; i < 15 && !(await p.locator('table tbody tr td').count()); i++) await p.waitForTimeout(1000);
    const clave = fecha.replace(/-/g, '');
    const carrito = await p.evaluate(({ clave, hora }) => {
      const t = document.querySelector('table.footable, table[class*=footable]');
      const ft = t && window.FooTable && window.FooTable.get(t);
      const v = ft && ft.rows.all.map(r => r.value).find(v => String(v.FECHA_ALQUILER) === clave && String(v.HORA_RESERVA).slice(0, 5) === hora && !/anulad/i.test(String(v.ESTADO_CONFIRMACION || '')));
      return v ? String(v.COD_CARRITO) : null;
    }, { clave, hora });
    return carrito;
  }
  async tiene(fecha, hora) { return !!(await this.buscar(fecha, hora).catch(() => null)); }
  // Deja abierta la ficha de la reserva vieja con el botón «Anular» a mano
  async armarAnulacion(fecha, hora) {
    const carrito = await this.buscar(fecha, hora);
    if (!carrito) throw new Error(`No encuentro tu reserva del ${fecha} a las ${hora} para poder cambiarla`);
    await this.pa.addScriptTag({ content: `__doPostBack('ContentSection_uAlquileres_uAlert_uplAlert', JSON.stringify({ action: 'Consultar', args: { cartCode: '${carrito}' } }));` });
    await this.pa.locator('#ContentSection_uAlquileres_uCarritosFicha_btnRefundCart').waitFor({ state: 'visible', timeout: 20000 });
    this.vieja = { fecha, hora };
  }
  // Abre la ficha de esa reserva (sea cual sea su estado) y dice qué botones tiene, sin pulsar nada
  async verFicha(fecha, hora) {
    const carrito = await this.buscar(fecha, hora);
    if (!carrito) throw new Error(`No encuentro la reserva del ${fecha} a las ${hora}`);
    const p = this.pa;
    await p.addScriptTag({ content: `__doPostBack('ContentSection_uAlquileres_uAlert_uplAlert', JSON.stringify({ action: 'Consultar', args: { cartCode: '${carrito}' } }));` });
    await p.waitForTimeout(4000);
    return p.$$eval('button, input[type=submit], input[type=button], a.btn', bs => bs.filter(b => b.offsetParent)
      .map(b => `${(b.innerText || b.value || '').trim().slice(0, 40)} [${(b.id || '').replace(/^ContentSection_/, '')}]`));
  }
  // prueba: abre el aviso, comprueba que está el «Sí» y pulsa «No» (no anula nada)
  async anular(prueba = false) {
    const p = this.pa;
    const btn = p.locator('#ContentSection_uAlquileres_uCarritosFicha_btnRefundCart');
    if (!(await btn.isVisible().catch(() => false))) await this.armarAnulacion(this.vieja.fecha, this.vieja.hora);
    await btn.click();
    // Aviso «¿Seguro?» → «Sí». Se pulsa una sola vez y se espera a que se cierre: mientras se
    // cierra sigue «visible» un momento y volver a buscarlo hacía fallar todo (ya anulada).
    // (la web tiene el aviso dos veces con el mismo id, uno oculto: se usa el visible)
    const si = p.locator('[id$=uWarningModal_btnYes]:visible').first();
    await si.waitFor({ state: 'visible', timeout: 8000 });   // si no sale, no se ha anulado nada
    if (prueba) {
      const no = p.locator('[id$=uWarningModal_btnNo]:visible, [id$=uWarningModal] button:visible').filter({ hasText: /^no$/i }).first();
      await no.click({ timeout: 5000 });
      await si.waitFor({ state: 'hidden', timeout: 10000 });
      return;
    }
    // Basta con que la web conteste a la anulación (antes se esperaban hasta 18 s de más)
    const respuesta = p.waitForResponse(r => r.request().method() === 'POST', { timeout: 15000 }).catch(() => null);
    await si.click({ timeout: 5000 });
    await respuesta;
    await si.waitFor({ state: 'hidden', timeout: 1500 }).catch(() => {});
    // Algún aviso de después («Aceptar»): se cierra si sale, sin esperar por él
    for (let i = 0; i < 2; i++) {
      const ok = p.locator('button:visible, a.btn:visible').filter({ hasText: /^(aceptar|cerrar|ok)$/i }).first();
      if (!(await ok.count())) break;
      await ok.click({ timeout: 2000 }).catch(() => {});
    }
    const error = await p.locator('.alert-danger:visible').first().innerText().catch(() => '');
    if (error) throw new Error('No se pudo anular: ' + error.replace(/^x\s*/, '').trim().slice(0, 200));
    this.vieja = null;
  }
}
