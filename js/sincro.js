/* Seguir en otro dispositivo: lo que va a medias (un test de Legislación,
   un simulacro, un test del Específico, cómo se repasa el callejero…) se
   guarda en el dispositivo, como siempre, y un momento después también en
   la cuenta (tabla progreso_en_curso). Al entrar o al volver a la app, si en
   la cuenta hay algo más nuevo (de otro dispositivo), se coge eso. Gana lo
   más nuevo; si se termina o se descarta en uno, desaparece en los demás.
   Cada módulo registra lo suyo: SINC.registrar(nombre, claveLocal, alLlegar)
   y avisa con SINC.cambiado(nombre) cada vez que lo guarda o lo borra. */
const SINC = (function(){
  const reg = new Map();     // nombre → { clave: () => clave en localStorage, llega: () => al llegar de otro dispositivo }
  const esperas = new Map(); // nombre → temporizador de la subida
  const sello = n => 'pj_sinc_at:' + (currentUser ? currentUser.id : '') + ':' + n;
  function leerSello(n){ try{ return Number(localStorage.getItem(sello(n))) || 0; }catch(e){ return 0; } }
  function ponerSello(n, at){ try{ localStorage.setItem(sello(n), String(at)); }catch(e){} }
  function leerLocal(k){ try{ return localStorage.getItem(k); }catch(e){ return null; } }

  function registrar(nombre, clave, llega){ reg.set(nombre, { clave, llega: llega || (() => {}) }); }
  function cambiado(nombre){
    if(!currentUser || !reg.has(nombre)) return;
    ponerSello(nombre, Date.now());
    clearTimeout(esperas.get(nombre));
    esperas.set(nombre, setTimeout(() => subir(nombre), 700));
  }
  async function subir(nombre){
    esperas.delete(nombre);
    const r = reg.get(nombre), k = r && currentUser ? r.clave() : null;
    if(!k) return;
    let datos = null;
    const v = leerLocal(k);
    try{ datos = v == null ? null : JSON.parse(v); }catch(e){ return; }
    try{
      const { error } = await sb.from('progreso_en_curso').upsert({ user_id: currentUser.id, clave: nombre, datos, at: leerSello(nombre), updated_at: new Date().toISOString() });
      if(error) console.warn('No se pudo guardar en la cuenta (' + nombre + ')', error.message);
    }catch(e){}   // sin conexión: se sube al volver (bajar() lo ve más nuevo aquí)
  }
  // Al irse de la app (o cambiar de app en el móvil): lo pendiente, ya.
  function subirYa(){ [...esperas.keys()].forEach(n => { clearTimeout(esperas.get(n)); subir(n); }); }

  let bajando = null;
  function bajar(){
    if(!currentUser) return Promise.resolve();
    if(bajando) return bajando;
    bajando = (async () => {
      const { data, error } = await sb.from('progreso_en_curso').select('clave, datos, at');
      if(error) return;
      const remoto = new Map((data || []).map(x => [x.clave, x]));
      for(const [n, r] of reg){
        const k = r.clave();
        if(!k || esperas.has(n)) continue;   // con un cambio aquí sin subir, manda este
        const x = remoto.get(n), atRemoto = x ? Number(x.at) || 0 : 0;
        let local = leerSello(n);
        // Lo que había en el dispositivo de antes de esto (sin sello): cuenta como de ahora.
        if(!local && leerLocal(k) != null && !x){ local = Date.now(); ponerSello(n, local); }
        if(x && atRemoto > local){
          try{ x.datos == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(x.datos)); }catch(e){ continue; }
          ponerSello(n, atRemoto);
          try{ r.llega(); }catch(e){ console.warn('Al seguir lo de otro dispositivo (' + n + ')', e); }
        }else if(local > atRemoto) subir(n);
      }
    })().catch(() => {}).finally(() => { bajando = null; });
    return bajando;
  }
  document.addEventListener('visibilitychange', () => { if(document.visibilityState === 'visible') bajar(); else subirYa(); });
  addEventListener('pagehide', subirYa);
  addEventListener('online', () => { bajar(); });
  // ¿Se está viendo esa pantalla ahora?
  const enPantalla = id => { const s = document.getElementById(id); return !!(s && s.classList.contains('active')); };
  return { registrar, cambiado, bajar, enPantalla };
})();
