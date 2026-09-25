/* Registro de errores de los usuarios en Supabase (client_errors). */

/* ---------- Registro de errores (client_errors) ----------
   Apunta en Supabase los fallos que sufren los usuarios para que el admin
   los vea en Administración → Errores sin esperar a que se los cuenten.
   Se evitan duplicados y se limita a unos pocos por sesión. */
const APP_VERSION = '2026.09.24';
const reportedErrors = new Set();
let reportedCount = 0;
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
