// Utilidades de las pruebas E2E del Plan: navegador, intercepción de
// Supabase hacia el servidor de pruebas, sesión y consultas a la BD.
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { sesion, jwt } from './servidor.mjs';

const require = createRequire(import.meta.url);
function cargarPlaywright(){
  try{ return require('playwright'); }catch(e){}
  const raiz = execFileSync('npm', ['root', '-g']).toString().trim();
  return require(raiz + '/playwright');
}
export const { chromium } = cargarPlaywright();

export const PUERTO = Number(process.env.PUERTO || 54331);
export const APP = 'http://127.0.0.1:' + PUERTO;
export const SUPABASE = 'https://tsjaaqkvncgxqtpmlugv.supabase.co';
export const IPAD = { viewport: { width: 834, height: 1194 }, deviceScaleFactor: 2, hasTouch: true, isMobile: false,
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15' };
export const IPAD_H = { ...IPAD, viewport: { width: 1194, height: 834 } };
export const MOVIL = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true,
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' };

export const DB = process.env.DB || 'plan_e2e';
export function sql(q){
  return execFileSync('psql', ['-h', process.env.PGHOST || '/tmp', '-p', process.env.PGPORT || '54329', '-U', process.env.PGUSER || 'postgres',
    '-d', DB, '-At', '-v', 'ON_ERROR_STOP=1', '-c', q]).toString().trim();
}
export function sqlJson(q){ const t = sql('select coalesce(json_agg(x), \'[]\') from (' + q + ') x'); return JSON.parse(t || '[]'); }
export { sesion, jwt };

// Contexto con la app servida en local y Supabase interceptado.
export async function nuevoContexto(navegador, perfil, extra = {}){
  const ctx = await navegador.newContext({ ...perfil, serviceWorkers: 'block', locale: 'es-ES', timezoneId: 'Europe/Madrid', ...extra });
  await ctx.route(SUPABASE + '/**', async route => {
    const url = route.request().url().replace(SUPABASE, APP);
    try{
      const r = await route.fetch({ url });
      await route.fulfill({ response: r });
    }catch(e){ await route.abort('failed').catch(() => {}); }
  });
  // Librerías del CDN, de la copia local que deja preparar.sh; las fuentes, vacías.
  const cdn = (process.env.TMPDIR || '/tmp') + '/plan-e2e/cdn/supabase.min.js';
  await ctx.route('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/**', route => route.fulfill({ path: cdn, contentType: 'text/javascript' }));
  await ctx.route('https://fonts.googleapis.com/**', route => route.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  // Tutor Bombero: no se carga la web de verdad en las pruebas.
  await ctx.route('https://tutorbomberos.es/**', route => route.fulfill({ status: 200, contentType: 'text/html', body: '<html><body>Tutor Bombero (simulado)</body></html>' }));
  return ctx;
}
export function vigilarErrores(pagina, lista){
  pagina.on('pageerror', e => lista.push('pageerror: ' + e.message));
  pagina.on('console', m => { if(m.type() === 'error') lista.push('console: ' + m.text()); });
}
// Inicia sesión restaurando una sesión guardada (como al volver a abrir la app).
export async function entrarConSesion(ctx, email){
  const s = sesion(email);
  await ctx.addInitScript(([k, v]) => { try{ if(!localStorage.getItem(k)) localStorage.setItem(k, v); }catch(e){} },
    ['sb-tsjaaqkvncgxqtpmlugv-auth-token', JSON.stringify(s)]);
}
export async function esperarApp(pagina){
  await pagina.waitForFunction(() => typeof currentUser !== 'undefined' && !!currentUser && document.getElementById('authOverlay') && document.getElementById('authOverlay').classList.contains('hidden'), null, { timeout: 20000 });
}
// Consulta PostgREST como un usuario (para comprobar la RLS desde fuera).
export async function restComo(email, ruta, opts = {}){
  const s = sesion(email);
  const r = await fetch(APP + '/rest/v1/' + ruta, { ...opts, headers: { apikey: 'x', Authorization: 'Bearer ' + s.access_token, 'Content-Type': 'application/json', ...(opts.headers || {}) } });
  const texto = await r.text();
  let cuerpo; try{ cuerpo = JSON.parse(texto); }catch(e){ cuerpo = texto; }
  return { estado: r.status, cuerpo };
}
export function ok(msg){ console.log('  ✓ ' + msg); }
