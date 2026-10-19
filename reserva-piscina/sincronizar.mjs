// Lee las reservas de piscina que hay de verdad en IMDECO («Anulaciones y gestión de reservas»)
// y las copia en la app (piscina_reservas), para que la pantalla «Piscina» enseñe lo real:
// también lo reservado a mano. Lo programado que aún no se ha reservado no se toca.
//
//   node sincronizar.mjs            lee y copia
//   node sincronizar.mjs --mirar    solo enseña cómo es la tabla (columnas y estados, sin datos personales)
//
// Variables: IMD_USUARIO, IMD_CONTRASENA, SUPABASE_URL, SUPABASE_ANON_KEY, PISCINA_CLAVE
// Los registros son públicos: no se escriben nombres ni datos personales.

import { chromium } from 'playwright';

const BASE = 'https://gestiones.imdcordoba.es/CronosWeb';
const MIRAR = process.argv.includes('--mirar');
const log = (...m) => console.log(new Date().toLocaleTimeString('es-ES', { timeZone: 'Europe/Madrid' }), '·', ...m);
const PERSONAL = /apellido|nombre|dni|nif|correo|mail|tel[eé]fono|m[oó]vil|persona|usuario|socio/i;

const navegador = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH, args: ['--headless=new'] } : {});
const page = await navegador.newPage({ locale: 'es-ES', timezoneId: 'Europe/Madrid', viewport: { width: 1280, height: 900 } });
page.setDefaultTimeout(20000);
const quieto = () => page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});

let salida = 1;
try {
  // Entrar
  await page.goto(`${BASE}/Login`, { waitUntil: 'networkidle' });
  await page.click('.cc-dismiss').catch(() => {});
  await page.click('text=Acceso identificado');
  await page.fill('#ContentFixedSection_uLogin_txtIdentificador', process.env.IMD_USUARIO);
  await page.fill('#ContentFixedSection_uLogin_txtContrasena', process.env.IMD_CONTRASENA);
  await page.click('#ContentFixedSection_uLogin_btnLogin');
  await page.waitForURL(u => !/\/Login/i.test(u.pathname), { timeout: 30000 }).catch(() => {});
  if (/\/Login/i.test(new URL(page.url()).pathname)) throw new Error('No se pudo iniciar sesión');

  // Mi cuenta → Anulaciones y gestión de reservas
  await page.addScriptTag({ content: "__doPostBack('uAlert_uplAlert', 'MiCuenta');" });
  await page.waitForURL(/\/Account/i, { timeout: 15000 }).catch(() => {});
  await quieto();
  await page.getByText('Anulaciones y gestión de reservas').first().click();
  await quieto();
  // La tabla se rellena por detrás: esperar a que tenga filas (o pedir «Actualizar»)
  const hayFilas = () => page.locator('table tbody tr td').count();
  for (let i = 0; i < 15 && !(await hayFilas()); i++) await page.waitForTimeout(1000);
  if (!(await hayFilas())) {
    await page.getByText('Actualizar').first().click().catch(() => {});
    await quieto();
    for (let i = 0; i < 10 && !(await hayFilas()); i++) await page.waitForTimeout(1000);
  }

  // Leer las filas: primero con FooTable (tiene todas, también las de otras páginas), si no, de la tabla
  const leido = await page.evaluate(() => {
    const out = { via: '', columnas: [], filas: [] };
    try {
      if (window.FooTable) {
        const t = document.querySelector('table.footable, table[class*=footable]');
        const ft = t && window.FooTable.get(t);
        if (ft && ft.rows && ft.rows.all) {
          out.via = 'footable';
          out.columnas = ft.columns.array.map(c => ({ nombre: c.name, titulo: (c.title || '').replace(/<[^>]*>/g, '').trim() }));
          out.filas = ft.rows.all.map(r => {
            const v = {};
            for (const c of ft.columns.array) {
              const x = r.value[c.name];
              v[c.name] = x == null ? '' : (typeof x === 'object' ? (x.innerText || x.textContent || JSON.stringify(x)) : String(x));
            }
            return v;
          });
          return out;
        }
      }
    } catch (e) { out.error = String(e); }
    out.via = 'tabla';
    const t = [...document.querySelectorAll('table')].find(x => x.querySelector('tbody tr td'));
    if (!t) return out;
    out.columnas = [...t.querySelectorAll('thead th')].map((th, i) => ({ nombre: 'c' + i, titulo: th.textContent.trim().replace(/\s+/g, ' ') }));
    out.filas = [...t.querySelectorAll('tbody > tr')].filter(tr => !tr.classList.contains('footable-detail-row'))
      .map(tr => Object.fromEntries([...tr.children].map((td, i) => ['c' + i, td.textContent.trim().replace(/\s+/g, ' ')])));
    return out;
  });

  // Quitar lo personal antes de hacer nada más con ello
  const privadas = new Set(leido.columnas.filter(c => PERSONAL.test(c.titulo + ' ' + c.nombre)).map(c => c.nombre));
  const columnas = leido.columnas.filter(c => !privadas.has(c.nombre));
  const filas = leido.filas.map(f => Object.fromEntries(Object.entries(f).filter(([k]) => !privadas.has(k))));
  log(`Leído por ${leido.via}: ${filas.length} filas${leido.error ? ' (aviso: ' + leido.error.slice(0, 80) + ')' : ''}`);
  log('Columnas:', columnas.map(c => `${c.nombre}=«${c.titulo}»`).join(' | '));

  if (MIRAR) {
    // Valores de ejemplo de cada columna (sin las personales), y los distintos estados
    for (const c of columnas) {
      const vals = [...new Set(filas.map(f => (f[c.nombre] || '').slice(0, 40)))].slice(0, 6);
      log(`  ${c.titulo || c.nombre}:`, vals.join(' | '));
    }
    salida = 0;
  } else {
    // Reconocer cada columna por su título
    const col = (re) => (columnas.find(c => re.test(c.titulo)) || {}).nombre;
    const cFecha = col(/fecha/i), cHora = col(/hora inicial|hora desde|inicio/i), cRecinto = col(/recinto/i), cUso = col(/^uso$/i);
    const cEstado = col(/estado/i) || (columnas[0] && columnas[0].nombre);
    if (!cFecha || !cHora) throw new Error('No reconozco las columnas de la tabla: ' + columnas.map(c => c.titulo).join(', '));
    const aIso = (s) => { const m = String(s).match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/); return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : null; };
    const reservas = filas.map(f => ({
      fecha: aIso(f[cFecha]),
      hora: (String(f[cHora]).match(/\d{1,2}:\d{2}/) || [''])[0].padStart(5, '0'),
      calle: cRecinto ? String(f[cRecinto]).slice(0, 60) : null,
      uso: cUso ? String(f[cUso]) : '',
      estado: cEstado ? String(f[cEstado]).slice(0, 40) : '',
    })).filter(r => r.fecha && r.hora && (/piscina/i.test(r.uso) || /piscina/i.test(r.calle || '')));
    log(`Reservas de piscina en IMDECO: ${reservas.length}`, reservas.map(r => `${r.fecha} ${r.hora} (${r.estado || '—'})`).join(' · '));

    const r = await fetch(`${process.env.SUPABASE_URL}/rest/v1/rpc/piscina_robot_sincronizar`, {
      method: 'POST', headers: { apikey: process.env.SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_clave: process.env.PISCINA_CLAVE, p_reservas: reservas }),
    });
    if (!r.ok) throw new Error(`Supabase: ${r.status} ${(await r.text()).slice(0, 200)}`);
    log('Copiado en la app:', await r.text());
    salida = 0;
  }
} catch (e) {
  log('❌', e.message);
} finally {
  await navegador.close();
}
process.exit(salida);
