/* Visor de imágenes a pantalla completa y red de seguridad contra el zoom. */

/* Visor de imagen a pantalla completa. La web en general no se puede
   ampliar (pellizcar/doble toque desactivado), pero al tocar una imagen
   de una nota se abre aquí a tamaño grande, y dentro de este visor sí se
   puede acercar/alejar tocando la propia imagen. */
/* Visor de imagen a pantalla completa. La web en general no se puede
   ampliar (viewport bloqueado), pero mientras este visor está abierto se
   libera el viewport para que el pellizco de ampliar funcione de verdad
   sobre la imagen; al cerrar, se vuelve a bloquear para el resto de la web. */
function setViewportZoomable(enabled){
  const meta = document.getElementById('viewportMeta');
  if(!meta) return;
  meta.setAttribute('content', enabled
    ? 'width=device-width, initial-scale=1.0, maximum-scale=5.0, user-scalable=yes'
    : 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no'
  );
  if(!enabled) forceResetPinchZoom();
}
/* Cambiar el atributo "content" del viewport (arriba) avisa a Safari de que
   ya no se puede hacer zoom, pero NO deshace un pellizco de ampliar que ya
   estuviera aplicado en pantalla: eso se queda tal cual hasta que algo
   fuerza a Safari a recalcular. En una web instalada en pantalla de inicio
   (apple-mobile-web-app-capable) ese recálculo puede no llegar a pasar
   nunca por sí solo, así que la próxima vez que se abre la app arranca ya
   con ese zoom pellizcado puesto ("super ampliada"), hasta que algún
   evento posterior (scroll, giro...) lo corrige por su cuenta. Este truco
   (mover initial-scale una micra y devolverlo) obliga a Safari a
   recalcular el zoom real de la página, no solo a anotar el nuevo valor. */
/* El pellizco de ampliar solo existe en pantallas táctiles con WebKit
   (Safari/iOS; en iPadOS el user-agent se anuncia como "Macintosh" pero
   trae pantalla táctil, así que se distingue por maxTouchPoints). En
   escritorio (ratón) este bug no puede darse nunca, así que ahí NO
   merece la pena tocar el viewport: hacerlo fuerza a todos los
   navegadores a recalcular el zoom/layout de toda la página, lo que en
   algunos provoca un parpadeo gris de un par de fotogramas mientras
   recomponen la pantalla. Al limitar el truco a donde de verdad hace
   falta evitamos ese parpadeo en el resto de dispositivos. */
function isTouchWebKit(){
  const ua = navigator.userAgent || '';
  const isWebKitMobile = /iPhone|iPad|iPod/i.test(ua) ||
    (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1);
  return isWebKitMobile;
}
function forceResetPinchZoom(){
  if(!isTouchWebKit()) return;
  const meta = document.getElementById('viewportMeta');
  if(!meta) return;
  const finalContent = meta.getAttribute('content');
  meta.setAttribute('content', 'width=device-width, initial-scale=1.0001, maximum-scale=1.0, user-scalable=no');
  requestAnimationFrame(() => { meta.setAttribute('content', finalContent); });
}
function openImageLightbox(url){
  const box = document.getElementById('imageLightbox');
  const img = document.getElementById('imageLightboxImg');
  if(!box || !img) return;
  img.src = url;
  box.classList.add('show');
  setViewportZoomable(true);
}
function closeImageLightbox(e){
  if(e) e.stopPropagation();
  const box = document.getElementById('imageLightbox');
  if(box) box.classList.remove('show');
  setViewportZoomable(false);
}
function toggleImageLightboxZoom(img){
  img.classList.toggle('zoomed');
}

/* Red de seguridad para el bug de "web super ampliada" al abrir la app:
   si el visor de imagen se queda abierto (con el zoom liberado) porque el
   usuario sale de la app pellizcando la imagen -sin llegar a pulsar
   "cerrar"-, lo cerramos nosotros mismos en cuanto la app pasa a segundo
   plano, y forzamos además un recálculo del zoom en cuanto vuelve a
   primer plano (por si el pellizco ya se había aplicado antes de que le
   diera tiempo a cerrarse). Cubre tanto "se bloquea la pantalla"/"se
   cambia de app" (visibilitychange) como "se retoma la app ya abierta en
   segundo plano" (pageshow, con bfcache incluido). */
function handleAppBackgrounded(){
  const box = document.getElementById('imageLightbox');
  if(box && box.classList.contains('show')) closeImageLightbox();
}
function handleAppForegrounded(){
  if(document.getElementById('imageLightbox').classList.contains('show')) return;
  forceResetPinchZoom();
}
document.addEventListener('visibilitychange', () => {
  if(document.visibilityState === 'hidden') handleAppBackgrounded();
  else handleAppForegrounded();
});
window.addEventListener('pageshow', handleAppForegrounded);
// iOS puede reaplicar el zoom pellizcado de la sesión anterior DESPUÉS de
// que se ejecute este script (parece hacerlo de forma asíncrona al
// restaurar la página desde el icono de inicio), así que una sola
// llamada a forceResetPinchZoom() al cargar puede llegar demasiado
// pronto y quedar pisada. Como red de seguridad adicional, se reintenta
// varias veces durante los primeros 2 segundos: si no había nada que
// corregir no se nota (es una operación barata e inofensiva), y si sí lo
// había, alguno de estos reintentos cae después de que iOS lo reaplique.
[100, 300, 600, 1000, 1500, 2000].forEach(delay => {
  setTimeout(() => {
    if(!document.getElementById('imageLightbox').classList.contains('show')) forceResetPinchZoom();
  }, delay);
});
