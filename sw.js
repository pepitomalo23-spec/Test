/* =====================================================================
   Service worker de pj.fire
   =====================================================================
   - La app (index.html, sus css/ y js/, iconos, librería de Supabase,
     fuentes) se sirve desde la caché del dispositivo, así abre al
     instante y funciona sin conexión. En segundo plano se descarga la
     versión nueva y, si ha cambiado, se avisa a la app para que ofrezca
     «Actualizar».
   - Cada css/ y js/ va enlazado con un ?v= que cambia con su contenido
     (scripts/versionar.mjs). Antes de guardar un index.html nuevo se
     descargan todos sus archivos, para que nunca se mezclen archivos de
     dos versiones y la nueva funcione también sin conexión.
   - Los datos/ (el temario del callejero) también se piden con su ?v=:
     se guardan la primera vez que se usan y, al llegar una versión
     nueva, se borra la anterior. Las páginas del documento del temario
     (almacén privado) se guardan con los datos del usuario.
   - Las consultas de datos a Supabase (preguntas, temas, historial...)
     van primero a la red; si no hay conexión (o tarda demasiado) se usa
     la última respuesta guardada, para poder seguir estudiando.
   - Los trozos del mapa de satélite del callejero (ortofotos del IGN) no
     cambian nunca (misma URL, misma foto): caché primero, sin volver a
     pedirlos, en su propia caché, que no se borra al cerrar sesión. La app
     descarga por detrás los de Córdoba (js/callejero.js) y así el mapa sale
     al momento al ampliar y alejar. Solo se guardan respuestas CORS (las
     opacas cuentan ~7 MB cada una en la cuota del navegador) y como mucho
     SAT_MAX trozos (fuera los más antiguos).
   - Nunca se guardan en caché ni el inicio de sesión, ni las funciones
     (IA), ni nada que no sea una lectura (GET).
   ===================================================================== */

const VERSION = 'v1';
// La caché de la app va en v2: la v1 guardaba la app antigua en un solo archivo.
const SHELL = 'pjfire-shell-v2';
const STATIC = 'pjfire-static-' + VERSION;
const DATA = 'pjfire-data-' + VERSION;
const SAT = 'pjfire-sat-v1';
const SAT_HOSTS = ['wms-pnoa.idee.es', 'www.ign.es'];
const SAT_MAX = 1500;   // unos 330 MB
const SUPABASE_HOST = 'tsjaaqkvncgxqtpmlugv.supabase.co';
const DATA_TIMEOUT_MS = 6000;

const SHELL_URLS = ['./', 'manifest.json', 'assets/icons/icon-192.png', 'assets/icons/icon-512.png', 'assets/icons/icon-512-splash.png', 'assets/icons/apple-touch-icon.png', 'assets/icons/favicon-32.png'];
const CDN_URLS = ['https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js'];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const shell = await caches.open(SHELL);
    await shell.addAll(SHELL_URLS);
    const html = await (await shell.match('./')).text();
    await cacheAppFiles(shell, appFiles(html));
    const stat = await caches.open(STATIC);
    await Promise.all(CDN_URLS.map(u => stat.add(new Request(u, { mode: 'cors' })).catch(() => {})));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keep = [SHELL, STATIC, DATA, SAT];
    for(const k of await caches.keys()){
      if(!keep.includes(k)) await caches.delete(k);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('message', event => {
  const msg = event.data || {};
  // Al cerrar sesión se borran los datos guardados de ese usuario.
  if(msg.type === 'clear-data') event.waitUntil(caches.delete(DATA));
  if(msg.type === 'skip-waiting') self.skipWaiting();
});

async function notifyUpdate(){
  const clients = await self.clients.matchAll({ type: 'window' });
  clients.forEach(c => c.postMessage({ type: 'update-available' }));
}

// css/ y js/ que enlaza un index.html (con su ?v=), como URLs completas.
function appFiles(html){
  const urls = new Set();
  const re = /(?:src|href)="((?:css|js)\/[^"]+)"/g;
  let m;
  while((m = re.exec(html))) urls.add(new URL(m[1], self.registration.scope).href);
  return [...urls];
}
function isAppFile(url){
  const p = new URL(url).pathname;
  return p.startsWith('/css/') || p.startsWith('/js/');
}
function isDataFile(url){ return new URL(url).pathname.startsWith('/datos/'); }
// Al guardar un datos/ con un ?v= nuevo, fuera las versiones anteriores.
async function pruneDataVersions(cache, url){
  const p = new URL(url).pathname;
  for(const req of await cache.keys()){
    if(req.url !== url && new URL(req.url).pathname === p) await cache.delete(req);
  }
}
// Descarga los que aún no estén guardados. Si alguno falla, lanza error y
// no se guarda nada más (el index.html nuevo tampoco).
async function cacheAppFiles(cache, urls){
  const missing = [];
  for(const u of urls) if(!(await cache.match(u))) missing.push(u);
  const responses = await Promise.all(missing.map(async u => {
    const res = await fetch(u, { cache: 'no-cache' });
    if(!res.ok) throw new Error('No se pudo descargar ' + u);
    return res;
  }));
  await Promise.all(responses.map((res, i) => cache.put(missing[i], res)));
}
// Borra los css/ y js/ de versiones anteriores que ya no usa el index.html.
async function pruneAppFiles(cache, keep){
  const keepSet = new Set(keep);
  for(const req of await cache.keys()){
    if(isAppFile(req.url) && !keepSet.has(req.url)) await cache.delete(req);
  }
}

// Guarda el index.html nuevo si ha cambiado, junto con sus css/ y js/.
async function updateShell(cache, cachedCopy, fresh){
  const b = await fresh.clone().text();
  const a = cachedCopy ? await cachedCopy.text() : null;
  if(a === b) return;
  const files = appFiles(b);
  await cacheAppFiles(cache, files);
  await cache.put('./', fresh);
  await pruneAppFiles(cache, files);
  if(cachedCopy) await notifyUpdate();
}

// Página principal: se sirve la guardada al instante y se comprueba en
// segundo plano si hay una versión nueva.
async function handleNavigate(event){
  const cache = await caches.open(SHELL);
  const cached = await cache.match('./');
  // Copia para comparar: el original se entrega al navegador y su
  // contenido ya no se puede volver a leer.
  const cachedCopy = cached ? cached.clone() : null;
  // Ojo: una petición de navegación no se puede reenviar con opciones
  // (el navegador lo prohíbe), así que se pide por su URL.
  const network = fetch(event.request.url, { cache: 'no-store', credentials: 'same-origin' }).then(res => {
    if(res && res.ok && res.type === 'basic'){
      // Se guarda en segundo plano: la página no espera a que termine.
      event.waitUntil(updateShell(cache, cachedCopy, res.clone()).catch(() => {}));
    }
    return res;
  });
  if(cached){
    event.waitUntil(network.catch(() => {}));
    return cached;
  }
  return network;
}

// Recursos que casi nunca cambian: caché primero, y se refrescan detrás.
// Los css/ y js/ con ?v= no cambian nunca (si cambian, cambia su ?v=), así
// que si ya están guardados no hace falta volver a pedirlos.
async function handleStatic(event, cacheName){
  const cache = await caches.open(cacheName);
  const cached = await cache.match(event.request);
  const url = event.request.url;
  const versionado = (isAppFile(url) || isDataFile(url)) && new URL(url).searchParams.has('v');
  if(cached && versionado) return cached;
  const network = fetch(event.request).then(res => {
    if(res && (res.ok || res.type === 'opaque')){
      cache.put(event.request, res.clone())
        .then(() => versionado && isDataFile(url) ? pruneDataVersions(cache, url) : null).catch(() => {});
    }
    return res;
  });
  if(cached){
    event.waitUntil(network.catch(() => {}));
    return cached;
  }
  return network;
}

// Datos de Supabase: red primero; si falla o tarda, lo último guardado.
async function handleData(event){
  const cache = await caches.open(DATA);
  try{
    const res = await Promise.race([
      fetch(event.request),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), DATA_TIMEOUT_MS))
    ]);
    if(res && res.ok) cache.put(event.request, res.clone());
    return res;
  }catch(e){
    const cached = await cache.match(event.request);
    if(cached) return cached;
    throw e;
  }
}

// Satélite: caché primero. Se guarda en segundo plano (la imagen no espera)
// y cada 50 trozos nuevos se quitan los más antiguos si pasan de SAT_MAX.
let satNuevos = 0;
async function handleSatelite(event){
  const cache = await caches.open(SAT);
  const cached = await cache.match(event.request.url);
  if(cached) return cached;
  const res = await fetch(event.request);
  const imagen = (res.headers.get('content-type') || '').startsWith('image/');
  if(res && res.ok && res.type === 'cors' && imagen){
    event.waitUntil(cache.put(event.request.url, res.clone()).then(() => recortarSatelite(cache)).catch(() => {}));
  }
  return res;
}
async function recortarSatelite(cache){
  if(++satNuevos % 50) return;
  const keys = await cache.keys();
  for(let i = 0; i < keys.length - SAT_MAX; i++) await cache.delete(keys[i]);
}

async function handlePrivateImage(event){
  const cache = await caches.open(DATA);
  const cached = await cache.match(event.request);
  if(cached) return cached;
  const res = await fetch(event.request);
  if(res && res.ok) cache.put(event.request, res.clone()).catch(() => {});
  return res;
}

self.addEventListener('fetch', event => {
  const req = event.request;
  if(req.method !== 'GET') return;
  const url = new URL(req.url);

  if(req.mode === 'navigate' && url.origin === self.location.origin){
    event.respondWith(handleNavigate(event));
    return;
  }
  if(url.origin === self.location.origin){
    if(url.pathname.endsWith('/sw.js')) return;
    event.respondWith(handleStatic(event, SHELL));
    return;
  }
  if(url.hostname === 'cdn.jsdelivr.net' || url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com'){
    event.respondWith(handleStatic(event, STATIC));
    return;
  }
  if(url.hostname === SUPABASE_HOST){
    if(url.pathname.startsWith('/rest/v1/')){
      event.respondWith(handleData(event));
      return;
    }
    if(url.pathname.startsWith('/storage/v1/object/public/')){
      event.respondWith(handleStatic(event, STATIC));
      return;
    }
    // Páginas del temario (almacén privado, con la sesión): no cambian
    // nunca (van con versión en la ruta), así que caché primero. Van con
    // los datos del usuario: se borran al cerrar sesión.
    if(url.pathname.startsWith('/storage/v1/object/temario/')){
      event.respondWith(handlePrivateImage(event));
      return;
    }
  }
  if(SAT_HOSTS.includes(url.hostname) && /[?&]request=getmap(&|$)/i.test(url.search)){
    event.respondWith(handleSatelite(event));
    return;
  }
  // Todo lo demás (inicio de sesión, funciones, etc.) va directo a la red.
});

/* ---------- Notificaciones push (recordatorio diario) ---------- */
self.addEventListener('push', event => {
  let data = {};
  try{ data = event.data ? event.data.json() : {}; }catch(e){ data = { body: event.data && event.data.text() }; }
  const title = data.title || 'pj.fire';
  event.waitUntil(self.registration.showNotification(title, {
    body: data.body || '',
    icon: 'assets/icons/icon-192.png',
    badge: 'assets/icons/favicon-32.png',
    tag: data.tag || 'pjfire',
    renotify: true,
    data: { url: data.url || './' }
  }));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || './';
  event.waitUntil((async () => {
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for(const c of clients){
      if('focus' in c){
        c.postMessage({ type: 'open', url: target });
        return c.focus();
      }
    }
    return self.clients.openWindow(target);
  })());
});
