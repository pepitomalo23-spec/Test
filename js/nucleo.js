/* Núcleo: avisos y confirmaciones propios, esqueletos de carga, cliente de
   Supabase, resultados de tests pendientes de subir y usuario actual. */

/* ==================== SUPABASE SETUP ==================== */
/* ---------- Avisos y confirmaciones propios ----------
   uiToast(): aviso pequeño que desaparece solo (sustituye a alert()).
   uiConfirm(): ventana de confirmación con el estilo de la app; devuelve
   una promesa con true/false (sustituye a confirm()). */
/* Esqueletos de carga: filas grises animadas con la forma del contenido. */
function skelList(n, withIcon){
  let out = '<div class="skel-list" aria-busy="true" aria-label="Cargando">';
  for(let i = 0; i < (n || 3); i++){
    out += '<div class="skel-row">' + (withIcon === false ? '' : '<span class="skel skel-dot"></span>') +
      '<span class="skel-lines"><span class="skel skel-line" style="width:' + (55 + (i * 17) % 35) + '%"></span>' +
      '<span class="skel skel-line" style="width:' + (30 + (i * 23) % 30) + '%;opacity:.7"></span></span></div>';
  }
  return out + '</div>';
}
const SKEL_INLINE = '<span class="skel skel-inline" aria-label="Cargando"></span>';

function uiToast(message, type, opts){
  opts = opts || {};
  const msg = String(message == null ? '' : message);
  if(!type){
    type = /^(no se|no has|no hay|error|ha ocurrido)|no se pudo|no se ha podido|falt|selecciona|elige|introduce/i.test(msg) ? 'error'
         : /^(gracias|guardad|listo|hecho|añadid|eliminad|borrad)/i.test(msg) ? 'success' : 'info';
  }
  let box = document.getElementById('uiToasts');
  if(!box){
    box = document.createElement('div');
    box.id = 'uiToasts';
    box.className = 'ui-toasts';
    box.setAttribute('role', 'status');
    box.setAttribute('aria-live', 'polite');
    document.body.appendChild(box);
  }
  const el = document.createElement('div');
  el.className = 'ui-toast ' + type;
  const ico = type === 'success' ? '✓' : type === 'error' ? '!' : 'i';
  el.innerHTML = '<span class="ui-toast-ico">' + ico + '</span><span class="ui-toast-msg"></span>' +
    (opts.action ? '<button class="ui-toast-action" type="button"></button>' : '');
  el.querySelector('.ui-toast-msg').textContent = msg;
  let closed = false;
  const close = () => {
    if(closed) return;
    closed = true;
    el.classList.add('out');
    setTimeout(() => el.remove(), 220);
  };
  if(opts.action){
    const b = el.querySelector('.ui-toast-action');
    b.textContent = opts.action;
    b.addEventListener('click', ev => { ev.stopPropagation(); close(); if(opts.onAction) opts.onAction(); });
  }
  el.addEventListener('click', close);
  box.appendChild(el);
  while(box.children.length > 3) box.firstElementChild.remove();
  const ms = opts.duration != null ? opts.duration : (type === 'error' ? 6000 : 3500);
  if(ms > 0) setTimeout(close, ms);
  return close;
}
function uiConfirm(message, opts){
  opts = opts || {};
  const parts = String(message).split(/\n\n/);
  const title = opts.title || parts[0];
  const body = opts.title ? String(message) : parts.slice(1).join('\n\n');
  const danger = opts.danger != null ? opts.danger : /borrar|eliminar|quitar|bloquear|reiniciar|salir/i.test(title);
  const okText = opts.ok || (danger ? (/(bloquear)/i.test(title) ? 'Bloquear' : /(reiniciar)/i.test(title) ? 'Reiniciar' : /(quitar)/i.test(title) ? 'Quitar' : 'Eliminar') : 'Aceptar');
  return new Promise(resolve => {
    const prevFocus = document.activeElement;
    const bg = document.createElement('div');
    bg.className = 'ui-confirm-bg';
    bg.innerHTML = '<div class="ui-confirm" role="alertdialog" aria-modal="true" aria-labelledby="uiConfirmTitle">' +
      '<h3 id="uiConfirmTitle"></h3>' + (body ? '<p></p>' : '') +
      '<div class="ui-confirm-actions"><button type="button" class="ui-confirm-cancel">' + (opts.cancel || 'Cancelar') + '</button>' +
      '<button type="button" class="ui-confirm-ok' + (danger ? ' danger' : '') + '"></button></div></div>';
    bg.querySelector('h3').textContent = title;
    if(body) bg.querySelector('p').textContent = body;
    bg.querySelector('.ui-confirm-ok').textContent = okText;
    const done = v => {
      document.removeEventListener('keydown', onKey, true);
      bg.remove();
      try{ if(prevFocus && prevFocus.focus) prevFocus.focus(); }catch(e){}
      resolve(v);
    };
    const onKey = e => {
      if(e.key === 'Escape'){ e.preventDefault(); e.stopPropagation(); done(false); }
      else if(e.key === 'Enter' && document.activeElement && document.activeElement.classList.contains('ui-confirm-ok')){ e.preventDefault(); e.stopPropagation(); done(true); }
    };
    bg.querySelector('.ui-confirm-cancel').addEventListener('click', () => done(false));
    bg.querySelector('.ui-confirm-ok').addEventListener('click', () => done(true));
    bg.addEventListener('click', e => { if(e.target === bg) done(false); });
    document.addEventListener('keydown', onKey, true);
    document.body.appendChild(bg);
    // En acciones destructivas el foco queda en «Cancelar» por seguridad.
    setTimeout(() => bg.querySelector(danger ? '.ui-confirm-cancel' : '.ui-confirm-ok').focus(), 30);
  });
}

const SUPABASE_URL = 'https://tsjaaqkvncgxqtpmlugv.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_F9-gdlx34vn7FQ_1hSHwcQ__L5EGMOS';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* ---------- Resultados de tests hechos sin conexión ----------
   Se guardan en el dispositivo y se suben en cuanto hay conexión (al
   volver internet o al abrir la app). */
const PENDING_RESULTS_KEY = 'pjfire_pending_results';
function readPendingResults(){ try{ return JSON.parse(localStorage.getItem(PENDING_RESULTS_KEY)) || []; }catch(e){ return []; } }
function writePendingResults(list){ try{ localStorage.setItem(PENDING_RESULTS_KEY, JSON.stringify(list)); }catch(e){} }
function queuePendingResult(item){
  const list = readPendingResults();
  list.push(Object.assign({ at: Date.now(), user_id: currentUser && currentUser.id }, item));
  writePendingResults(list);
}
let flushingResults = false;
async function flushPendingResults(){
  if(flushingResults || !currentUser || !navigator.onLine) return;
  const mine = readPendingResults().filter(r => r.user_id === currentUser.id);
  if(!mine.length) return;
  flushingResults = true;
  let saved = 0;
  try{
    for(const item of mine){
      try{
        let sid = item.sessionId;
        if(!sid){
          const { data, error } = await sb.from('test_sessions').insert(item.session).select('id').single();
          if(error) throw error;
          sid = data.id;
          // Si fallan las respuestas, que no se vuelva a crear el test.
          item.sessionId = sid;
          writePendingResults(readPendingResults().map(r => r.at === item.at ? item : r));
        }
        const rows = (item.answers || []).map(r => Object.assign({}, r, { session_id: sid }));
        if(rows.length){
          const { error } = await sb.from('session_answers').insert(rows);
          if(error) throw error;
        }
        writePendingResults(readPendingResults().filter(r => r.at !== item.at));
        saved++;
      }catch(e){
        console.warn('No se pudo subir un resultado pendiente', e);
        break; // se reintentará más tarde
      }
    }
  }finally{
    flushingResults = false;
  }
  if(saved){
    uiToast(saved === 1 ? 'Se ha guardado el test que hiciste sin conexión.' : 'Se han guardado los ' + saved + ' tests que hiciste sin conexión.', 'success');
    try{ await loadAppData(); await loadHistory(); await refreshGlobalStats(); }catch(e){}
  }
}
window.addEventListener('online', () => { flushPendingResults(); });

let currentUser = null;
let currentUserIsAdmin = false;
let adminPollInterval = null;
