// Servidor de las pruebas E2E del Plan (Node 22, sin dependencias):
//  - sirve los archivos del repositorio (la app tal cual),
//  - hace de «Supabase falso»: /auth/v1/* (sesiones con JWT HS256 como
//    GoTrue) y /rest/v1/* (proxy a un PostgREST local con la base de
//    datos de pruebas), /functions/v1/* → {} y /storage/v1/* → 404.
// Uso: node servidor.mjs <puerto> <puerto_postgrest> <jwt_secret>
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { createHmac, randomUUID } from 'node:crypto';
import { join, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const [PUERTO, PUERTO_PGRST, SECRETO] = [Number(process.argv[2] || 54331), Number(process.argv[3] || 54330), process.argv[4] || 'secreto-de-pruebas-del-plan-de-estudio-32+'];
const RAIZ = normalize(join(fileURLToPath(import.meta.url), '../../../..'));
export const USUARIOS = {
  'admin@prueba.es': { id: '00000000-0000-4000-8000-0000000000a1', clave: 'clave-admin' },
  'alumno@prueba.es': { id: '00000000-0000-4000-8000-0000000000a2', clave: 'clave-alumno' },
  'alumna@prueba.es': { id: '00000000-0000-4000-8000-0000000000a3', clave: 'clave-alumna' },
};
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.mp4': 'video/mp4', '.webp': 'image/webp', '.ico': 'image/x-icon' };
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS,HEAD',
  'Access-Control-Allow-Headers': 'authorization,apikey,content-type,prefer,range,accept,accept-profile,content-profile,x-client-info,x-supabase-api-version,range-unit',
  'Access-Control-Expose-Headers': 'content-range,content-location,preference-applied,location',
};

const b64 = x => Buffer.from(typeof x === 'string' ? x : JSON.stringify(x)).toString('base64url');
export function jwt(sub, email, secreto = SECRETO){
  const ahora = Math.floor(Date.now() / 1000);
  const cuerpo = b64({ alg: 'HS256', typ: 'JWT' }) + '.' + b64({ sub, email, role: 'authenticated', aud: 'authenticated', iat: ahora, exp: ahora + 3600 });
  return cuerpo + '.' + createHmac('sha256', secreto).update(cuerpo).digest('base64url');
}
function usuarioDe(email){
  const u = USUARIOS[email];
  return u && { id: u.id, aud: 'authenticated', role: 'authenticated', email, email_confirmed_at: '2026-01-01T00:00:00Z',
    app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: {}, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' };
}
export function sesion(email){
  const u = usuarioDe(email);
  return { access_token: jwt(u.id, email), token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600,
    refresh_token: 'refresco-' + Buffer.from(email).toString('base64url'), user: u };
}
const REFRESCOS = t => Buffer.from(String(t || '').replace(/^refresco-/, ''), 'base64url').toString();
function emailDeToken(auth){
  try{
    const p = JSON.parse(Buffer.from(String(auth || '').replace(/^Bearer /i, '').split('.')[1], 'base64url').toString());
    return p.email;
  }catch(e){ return null; }
}
const leerCuerpo = req => new Promise(res => { const c = []; req.on('data', x => c.push(x)); req.on('end', () => res(Buffer.concat(c))); });
function json(res, estado, cuerpo){ res.writeHead(estado, { ...CORS, 'Content-Type': 'application/json' }); res.end(cuerpo === undefined ? '' : JSON.stringify(cuerpo)); }

async function auth(req, res, url){
  const cuerpo = (await leerCuerpo(req)).toString();
  const datos = cuerpo ? JSON.parse(cuerpo) : {};
  if(url.pathname === '/auth/v1/token'){
    const tipo = url.searchParams.get('grant_type');
    if(tipo === 'password'){
      const u = USUARIOS[datos.email];
      if(!u || u.clave !== datos.password) return json(res, 400, { error: 'invalid_grant', error_description: 'Invalid login credentials', msg: 'Invalid login credentials' });
      return json(res, 200, sesion(datos.email));
    }
    if(tipo === 'refresh_token'){
      const email = REFRESCOS(datos.refresh_token);
      if(!USUARIOS[email]) return json(res, 400, { error: 'invalid_grant', error_description: 'Invalid Refresh Token' });
      return json(res, 200, sesion(email));
    }
  }
  if(url.pathname === '/auth/v1/user'){
    const email = emailDeToken(req.headers.authorization);
    return email && USUARIOS[email] ? json(res, 200, usuarioDe(email)) : json(res, 401, { msg: 'invalid JWT' });
  }
  if(url.pathname === '/auth/v1/logout') { res.writeHead(204, CORS); return res.end(); }
  return json(res, 404, { msg: 'no implementado en el servidor de pruebas' });
}

async function rest(req, res, url){
  const cuerpo = ['GET', 'HEAD'].includes(req.method) ? undefined : await leerCuerpo(req);
  const cab = {};
  for(const k of ['authorization', 'content-type', 'prefer', 'range', 'range-unit', 'accept', 'accept-profile', 'content-profile']){
    if(req.headers[k]) cab[k] = req.headers[k];
  }
  // Como Supabase: sin sesión, se entra como anon.
  if(!cab.authorization || !/^Bearer .+\..+\..+/.test(cab.authorization)) delete cab.authorization;
  const r = await fetch('http://127.0.0.1:' + PUERTO_PGRST + url.pathname.replace(/^\/rest\/v1/, '') + url.search, { method: req.method, headers: cab, body: cuerpo });
  const salida = { ...CORS };
  r.headers.forEach((v, k) => { if(!['content-encoding', 'transfer-encoding', 'connection', 'content-length'].includes(k)) salida[k] = v; });
  const buf = Buffer.from(await r.arrayBuffer());
  res.writeHead(r.status, salida);
  res.end(req.method === 'HEAD' ? undefined : buf);
}

async function estatico(req, res, url){
  let ruta = decodeURIComponent(url.pathname);
  if(ruta === '/' || ruta === '') ruta = '/index.html';
  const archivo = normalize(join(RAIZ, ruta));
  if(!archivo.startsWith(RAIZ) || /\/\.git\//.test(archivo)){ res.writeHead(403); return res.end(); }
  try{
    const buf = await readFile(archivo);
    res.writeHead(200, { 'Content-Type': TIPOS[extname(archivo)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(buf);
  }catch(e){ res.writeHead(404); res.end('no encontrado'); }
}

const servidor = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try{
    if(req.method === 'OPTIONS'){ res.writeHead(204, CORS); return res.end(); }
    if(url.pathname.startsWith('/auth/v1/')) return await auth(req, res, url);
    if(url.pathname.startsWith('/rest/v1/')) return await rest(req, res, url);
    if(url.pathname.startsWith('/functions/v1/')) return json(res, 200, {});
    if(url.pathname.startsWith('/storage/v1/')) return json(res, 404, { message: 'no hay almacenamiento en las pruebas' });
    return await estatico(req, res, url);
  }catch(e){
    console.error('servidor de pruebas:', e);
    json(res, 500, { message: String(e) });
  }
});
if(process.argv[1] && fileURLToPath(import.meta.url) === normalize(process.argv[1])){
  servidor.listen(PUERTO, '127.0.0.1', () => console.log('Servidor de pruebas en http://127.0.0.1:' + PUERTO));
}
