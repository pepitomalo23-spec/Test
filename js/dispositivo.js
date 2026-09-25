/* Identificación del dispositivo y registro de intentos de acceso. */

/* ---------- device identification & login attempt logging ----------
   El id de dispositivo se guarda en localStorage, pero iOS puede borrar
   ese almacenamiento sin avisar (sobre todo en apps añadidas a la
   pantalla de inicio que llevan unos días sin abrirse), y eso generaba
   antes un id nuevo aleatorio cada vez, contando el mismo móvil/iPad
   como "otro dispositivo" una y otra vez. Para evitarlo, si no hay un id
   guardado, en vez de uno aleatorio se calcula uno determinista a partir
   de características propias del dispositivo (huella): si el
   almacenamiento se borra, al volver a calcularlo sale EL MISMO id, así
   que sigue contando como el dispositivo que ya era. */
function computeDeviceFingerprint(){
  try{
    const parts = [
      navigator.userAgent || '',
      navigator.platform || '',
      navigator.language || '',
      (screen.width || '') + 'x' + (screen.height || ''),
      String(screen.colorDepth || ''),
      String(window.devicePixelRatio || ''),
      String(navigator.hardwareConcurrency || ''),
      String(new Date().getTimezoneOffset())
    ].join('|');
    // Hash simple y estable (no necesita ser criptográfico, solo
    // reproducible: mismo dispositivo -> siempre el mismo resultado).
    let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for(let i=0; i<parts.length; i++){
      const ch = parts.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1>>>16), 2246822507) ^ Math.imul(h2 ^ (h2>>>13), 3266489909);
    h2 = Math.imul(h2 ^ (h2>>>16), 2246822507) ^ Math.imul(h1 ^ (h1>>>13), 3266489909);
    return 'fp-' + (4294967296 * (2097151 & h2) + (h1>>>0)).toString(36);
  }catch(e){
    return null;
  }
}
function getDeviceId(){
  let id = null;
  try{ id = localStorage.getItem('legis_device_id'); }catch(e){}
  if(!id){
    id = computeDeviceFingerprint()
      || ((window.crypto && crypto.randomUUID) ? crypto.randomUUID() : ('dev-' + Date.now().toString(36) + '-' + Math.random().toString(16).slice(2)));
    try{ localStorage.setItem('legis_device_id', id); }catch(e){}
  }
  return id;
}
async function logLoginAttempt(email, success, errorMessage, userId){
  try{
    await sb.from('login_attempts').insert({
      email: (email || '').trim() || null,
      user_id: userId || null,
      device_id: getDeviceId(),
      user_agent: navigator.userAgent,
      success: !!success,
      reason: errorMessage || null
    });
  }catch(e){
    // El registro de intentos nunca debe bloquear el flujo de login
    console.warn('No se pudo registrar el intento de acceso', e);
  }
}
