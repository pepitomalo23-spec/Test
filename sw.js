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
   - Las consultas de datos a Supabase (preguntas, temas, historial...)
     van primero a la red; si no hay conexión (o tarda demasiado) se usa
     la última respuesta guardada, para poder seguir estudiando.
   - Nunca se guardan en caché ni el inicio de sesión, ni las funciones
     (IA), ni nada que no sea una lectura (GET).
   ===================================================================== */

const VERSION = 'v1';
// La caché de la app va en v2: la v1 guardaba la app antigua en un solo archivo.
const SHELL = 'pjfire-shell-v2';
const STATIC = 'pjfire-static-' + VERSION;
const DATA = 'pjfire-data-' + VERSION;
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
    const keep = [SHELL, STATIC, DATA];
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
  if(cached && isAppFile(event.request.url) && new URL(event.request.url).searchParams.has('v')) return cached;
  const network = fetch(event.request).then(res => {
    if(res && (res.ok || res.type === 'opaque')) cache.put(event.request, res.clone());
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
