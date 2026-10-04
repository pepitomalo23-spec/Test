/* Registro de errores de los usuarios en Supabase (client_errors). */

/* ---------- Registro de errores (client_errors) ----------
   Apunta en Supabase los fallos que sufren los usuarios para que el admin
   los vea en Administración → Errores sin esperar a que se los cuenten.
   Se evitan duplicados y se limita a unos pocos por sesión. */
const APP_VERSION = '2026.09.24';
const reportedErrors = new Set();
let reportedCount = 0;

/* ---------- Pasos del arranque ----------
   Si la app tarda en entrar, el aviso «atasco» lleva en «Detalles técnicos»
   cuándo acabó cada paso (en segundos desde que se abrió), cuánto rato
   estuvo la pestaña en segundo plano y el tipo de conexión: así se sabe en
   qué paso se queda colgada. */
const ARRANQUE_T0 = Date.now();
const arranquePasos = [];
let arranqueOculta = 0, arranqueOcultaDesde = document.hidden ? Date.now() : null;
document.addEventListener('visibilitychange', () => {
  if(document.hidden) arranqueOcultaDesde = Date.now();
  else if(arranqueOcultaDesde){ arranqueOculta += Date.now() - arranqueOcultaDesde; arranqueOcultaDesde = null; }
});
function pasoArranque(nombre){
  if(arranquePasos.length < 40) arranquePasos.push(nombre + ' ' + ((Date.now() - ARRANQUE_T0) / 1000).toFixed(1) + ' s');
}
function segundosOculta(){ return (arranqueOculta + (arranqueOcultaDesde ? Date.now() - arranqueOcultaDesde : 0)) / 1000; }
function resumenArranque(pendiente){
  const c = navigator.connection || {};
  return (pendiente ? 'Sin terminar: ' + pendiente + '\n' : '') +
    'Pasos: ' + (arranquePasos.join(' · ') || 'ninguno') + '\n' +
    'En segundo plano: ' + segundosOculta().toFixed(1) + ' s · conexión: ' + (navigator.onLine ? (c.effectiveType || 'sí') : 'sin conexión') +
    (c.downlink ? ' (' + c.downlink + ' Mb/s)' : '');
}
// Si la pestaña estuvo en segundo plano, la espera no la ha visto nadie
// (Safari frena las pestañas ocultas): no se avisa de atasco.
function reportarAtasco(mensaje, pendiente){
  if(segundosOculta() >= 3) return;
  reportClientError('atasco', mensaje, resumenArranque(pendiente));
}
function reportClientError(kind, message, stack){
  try{
    const msg = String(message || '').slice(0, 1000);
    if(!msg) return;
    // Ruido que no indica ningún fallo real de la app.
    if(/ResizeObserver loop|^Script error\.?$|AbortError|The user aborted/i.test(msg)) return;
    if(!navigator.onLine && /fetch|network|load failed|conexi/i.test(msg)) return;
    const key = kind + '|' + msg;
    if(reportedErrors.has(key) || reportedCount >= 15) return;
    reportedErrors.add(key);
    reportedCount++;
    let email = null;
    try{ email = (currentUser && currentUser.email) || null; }catch(e){}
    sb.from('client_errors').insert({
      kind: String(kind || 'error').slice(0, 40),
      message: msg,
      stack: stack ? String(stack).slice(0, 4000) : null,
      url: String(location.pathname + location.hash).slice(0, 500),
      user_agent: String(navigator.userAgent || '').slice(0, 400),
      app_version: APP_VERSION,
      email: email ? String(email).slice(0, 200) : null
    }).then(() => {}, () => {});
  }catch(e){ /* registrar un error nunca debe provocar otro */ }
}
(window.__errQ || []).forEach(e => reportClientError(e.kind, e.message, e.stack));
window.__errQ = { push: e => reportClientError(e.kind, e.message, e.stack) };
