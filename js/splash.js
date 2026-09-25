/* Pantalla de carga al arrancar (splash). */

/* Splash de arranque (ver #appSplash arriba): se queda en negro/blanco liso
   mientras caen los primeros reintentos de forceResetPinchZoom, luego
   aparece el logo con su mini barra de carga, y esta última avanza sola
   (progreso simulado, sin frenar la app) hasta que se confirma que todo lo
   necesario para entrar ya está listo: si no había sesión guardada, en
   cuanto se sabe eso (rápido); si la había, solo cuando el perfil, la
   comprobación de dispositivo y los datos de la app (preguntas, historial,
   estadísticas) han terminado de cargar — así nunca se entra a una
   pantalla que todavía está cargando por dentro. */
let splashProgress = 0;
let splashDone = false;
let splashTimer = null;
function startSplashProgress(){
  const bar = document.getElementById('appSplashBar');
  const fill = document.getElementById('appSplashBarFill');
  if(bar) bar.classList.add('show');
  if(splashTimer) clearInterval(splashTimer);
  splashTimer = setInterval(() => {
    if(splashDone || !fill) return;
    // Avanza más rápido al principio y va frenando al acercarse al 90%,
    // dejando el último tramo (90% → 100%) para cuando de verdad termine.
    const remaining = 90 - splashProgress;
    splashProgress += Math.max(0.6, remaining * 0.07);
    if(splashProgress > 90) splashProgress = 90;
    fill.style.width = splashProgress + '%';
  }, 90);
}
function finishSplash(){
  if(splashDone) return;
  splashDone = true;
  if(splashTimer){ clearInterval(splashTimer); splashTimer = null; }
  const fill = document.getElementById('appSplashBarFill');
  if(fill) fill.style.width = '100%';
  setTimeout(() => {
    const splash = document.getElementById('appSplash');
    if(splash) splash.classList.add('hidden');
  }, 250); // deja verse la barra completa un instante antes de desvanecer
}
startSplashProgress();
setTimeout(() => {
  const logo = document.getElementById('appSplashLogo');
  if(logo) logo.classList.add('show');
}, 550);
// Red de seguridad: si algo se queda colgado (sin red, Supabase caído…),
// no se deja a nadie mirando el logo para siempre.
setTimeout(() => {
  if(!splashDone) reportClientError('atasco', 'La app llevaba 12 s en la pantalla de carga al arrancar (se quitó por seguridad).');
  finishSplash();
}, 12000);
