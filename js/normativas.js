/* ============================================================
   NORMATIVAS · Fichas estilo Quizlet
   Temas de tarjetas (término → normativa) con los modos Fichas,
   Aprender, Probar y Combinar. Los temas y tarjetas viven en Supabase
   (tablas nq_sets / nq_cards): los crea y edita solo el admin y los ven
   todos. El avance de estudio de cada usuario se guarda en su
   dispositivo (localStorage), indexado por el id de cada tarjeta, y se
   sincroniza con su cuenta (nq_user_progress) para verlo en todos sus
   dispositivos.
   ============================================================ */
let NQ_SETS = [];

const NQ = (function(){
  const STORE_KEY = 'nq_progress_v2';
  const CACHE_KEY = 'nq_sets_cache_v1';
  const ROUND_SIZE = 7;
  let db = {};
  try{ db = JSON.parse(localStorage.getItem(STORE_KEY)) || {}; }catch(e){ db = {}; }
  function save(){
    try{ localStorage.setItem(STORE_KEY, JSON.stringify(db)); }catch(e){}
    schedulePush();
  }

  let view = { name: 'library' };   // library | set
  let study = null;                 // estado del modo de estudio abierto
  let matchTimer = null;
  let loaded = false, loading = false, loadError = false, busy = false;

  /* ---------- datos (Supabase) ---------- */
  function buildSets(sets, cards){
    NQ_SETS = sets.map(s => {
      const cs = cards.filter(c => c.set_id === s.id);
      return { id: s.id, title: s.title, cards: cs, ids: cs.map(c => c.id), terms: cs.map(c => [c.term, c.definition]) };
    });
  }
  try{
    const cached = JSON.parse(localStorage.getItem(CACHE_KEY));
    if(cached && cached.sets){ buildSets(cached.sets, cached.cards || []); loaded = true; }
  }catch(e){}

  // sb y currentUserIsAdmin viven en el script principal; los leemos con
  // try por si ese script no llegó a inicializarlos (p. ej. sin conexión).
  function client(){ try{ return sb; }catch(e){ return null; } }
  function uid(){ try{ return (currentUser && currentUser.id) || null; }catch(e){ return null; } }
  // Ninguna petición puede dejar la pantalla en «Cargando…» para siempre.
  function withTimeout(promise, ms){
    return Promise.race([promise, new Promise((_, rej) => setTimeout(() => rej(new Error('Tiempo de espera agotado')), ms))]);
  }
  let pendingLoad = false;
  async function load(){
    if(!client()) return;
    // Si ya hay una carga en marcha (p. ej. la del arranque, antes de
    // tener sesión), se repite al terminar en vez de descartar esta.
    if(loading){ pendingLoad = true; return; }
    loading = true;
    try{
      const [rs, rc] = await withTimeout(Promise.all([
        sb.from('nq_sets').select('id,title,orden,created_at').order('orden').order('created_at'),
        sb.from('nq_cards').select('id,set_id,term,definition,trampas,orden,created_at').order('orden').order('created_at')
      ]), 15000);
      if(rs.error || rc.error) throw (rs.error || rc.error);
      buildSets(rs.data || [], rc.data || []);
      loaded = true; loadError = false;
      try{ localStorage.setItem(CACHE_KEY, JSON.stringify({ sets: rs.data, cards: rc.data })); }catch(e){}
    }catch(e){
      loadError = true;
      console.warn('No se pudieron cargar los temas de Normativas', e);
      try{ reportClientError('normativas', 'No se pudieron cargar los temas: ' + (e.message || e)); }catch(err){}
    }finally{
      loading = false;
    }
    if(view.name === 'set' && !getSet(view.setId)) view = { name: 'library' };
    if(!study) render();
    if(pendingLoad){ pendingLoad = false; load(); }
    else pullProgress();
  }

  /* ---------- avance sincronizado entre dispositivos ----------
     Cada tarjeta guarda cuándo cambió (u). Al entrar se descarga el avance
     de la cuenta y se fusiona con el del dispositivo: de cada tarjeta gana
     la versión más reciente (igual con destacadas y opciones); luego se
     sube el resultado. Cada cambio posterior se sube a los pocos segundos. */
  let pushTimer = null, pulledFor = null, pulling = false;
  function mergeProgress(remote){
    let changed = false;
    Object.keys(remote || {}).forEach(setId => {
      if(setId.startsWith('__')) return;
      const r = remote[setId] || {};
      const l = db[setId] || (db[setId] = {});
      l.t = l.t || {};
      const rt = r.t || {};
      const resetU = Math.max(l.resetU || 0, r.resetU || 0);
      if(resetU !== (l.resetU || 0)){ l.resetU = resetU; changed = true; }
      Object.keys(rt).forEach(id => {
        const a = l.t[id], b = rt[id];
        if(!a || (b && (b.u || 0) > (a.u || 0))){ l.t[id] = b; changed = true; }
      });
      Object.keys(l.t).forEach(id => { if((l.t[id].u || 0) < resetU){ delete l.t[id]; changed = true; } });
      if(r.stars && (r.starsU || 0) > (l.starsU || 0)){ l.stars = r.stars; l.starsU = r.starsU; changed = true; }
      if(r.opt && (r.optU || 0) > (l.optU || 0)){ l.opt = r.opt; l.optU = r.optU; changed = true; }
      if(r.bestMatch && (!l.bestMatch || r.bestMatch < l.bestMatch)){ l.bestMatch = r.bestMatch; changed = true; }
    });
    return changed;
  }
  async function pullProgress(){
    const me = uid(), cl = client();
    if(!me || !cl || pulling || pulledFor === me) return;
    pulling = true;
    try{
      const { data, error } = await withTimeout(cl.from('nq_user_progress').select('data').eq('user_id', me).maybeSingle(), 15000);
      if(error) throw error;
      // El avance guardado en este dispositivo era de otra cuenta: no se mezcla.
      if(db.__owner && db.__owner !== me) db = {};
      db.__owner = me;
      const remote = (data && data.data) || {};
      mergeProgress(remote);
      try{ localStorage.setItem(STORE_KEY, JSON.stringify(db)); }catch(e){}
      pulledFor = me;
      if(JSON.stringify(remote) !== JSON.stringify(db)) pushProgress();
      if(!study) render();
    }catch(e){
      console.warn('No se pudo sincronizar el avance de Normativas', e);
    }finally{
      pulling = false;
    }
  }
  function schedulePush(){
    if(pulledFor !== uid()) return; // hasta fusionar con la nube no se sube nada
    clearTimeout(pushTimer);
    pushTimer = setTimeout(pushProgress, 1500);
  }
  async function pushProgress(){
    clearTimeout(pushTimer); pushTimer = null;
    const me = uid(), cl = client();
    if(!me || !cl || pulledFor !== me) return;
    try{
      const { error } = await withTimeout(cl.from('nq_user_progress').upsert({ user_id: me, data: db, updated_at: new Date().toISOString() }), 15000);
      if(error) throw error;
    }catch(e){
      console.warn('No se pudo subir el avance de Normativas', e);
      pushTimer = setTimeout(pushProgress, 20000);
    }
  }
  // Al salir o mandar la app a segundo plano se sube lo pendiente.
  document.addEventListener('visibilitychange', () => {
    if(document.visibilityState === 'hidden' && pushTimer) pushProgress();
    // Al volver a la app (p. ej. después de estudiar en otro dispositivo) se trae lo último.
    if(document.visibilityState === 'visible' && pulledFor){ pulledFor = null; pullProgress(); }
  });
  function isAdmin(){ try{ return !!currentUserIsAdmin; }catch(e){ return false; } }
  async function run(fn){
    if(busy) return false;
    busy = true;
    try{
      const { error } = await fn();
      if(error) throw error;
      return true;
    }catch(e){
      uiToast('No se pudo guardar el cambio: ' + (e.message || e));
      return false;
    }finally{
      busy = false;
    }
  }

  /* ---------- utilidades ---------- */
  const $root = () => document.getElementById('nqRoot');
  const $ov = () => document.getElementById('nqStudy');
  function esc(s){ return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function shuffle(a){ a = a.slice(); for(let i = a.length - 1; i > 0; i--){ const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  function getSet(id){ return NQ_SETS.find(s => s.id === id); }
  function norm(s){ return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, ''); }
  function speak(text){
    if(!('speechSynthesis' in window)) return;
    try{
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'es-ES';
      speechSynthesis.speak(u);
    }catch(e){}
  }

  const I = {
    back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
    gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
    chev: '<svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>',
    speaker: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>',
    star: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>',
    expand: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
    x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
    undo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/></svg>',
    shuffle: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/><line x1="4" y1="4" x2="9" y2="9"/></svg>',
    plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
    pencil: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>',
    trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>',
    // Mismo emblema que la tarjeta «Test Inteligente» de Inicio.
    bell: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10.268 21a2 2 0 0 0 3.464 0"/><path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326"/></svg>',
    brain: '<svg viewBox="5 5 14 14" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"> <path d="M-10.5 20.5a2 2 0 01-4 0"/> <path d="M-6.5-1.5a2 2 0 00-2 2"/> <path d="M-6.5-5a2 2 0 012-2"/> <path d="M-9 16.5a1 1 0 01-1-1"/> <path d="M-9.5-.5a1 1 0 011-1"/> <path d="m17.5 15.5-1.888-.755a1 1 0 00-1.078.221l-1.827 1.827a.5.5 0 01-.848-.283l-.21-1.473a2 2 0 00-1.086-1.506l-2.169-1.084a.5.5 0 010-.894l2.169-1.084a2 2 0 001.085-1.506L12 6.5"/> <path d="m17.5 8.5-2.328.388a1 1 0 01-1.022-.472L13 6.5"/> <path d="M18-8.5a1 1 0 011 1"/> <path d="M21.5-5a2 2 0 00-2-2"/> <path d="M26 10a1 1 0 01-1 1"/> <path d="M9 32.5a2 2 0 002-2"/> <rect x="6.5" y="6.5" width="11" height="11" rx="1"/> </svg>',
    cards: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="6" width="14" height="14" rx="2"/><path d="M7 6V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-2"/></svg>',
    mFichas: '<svg viewBox="0 0 24 24"><rect x="6" y="3" width="15" height="13" rx="2.5" fill="#7FB3FF"/><rect x="3" y="7" width="15" height="13" rx="2.5" fill="#4255FF"/></svg>',
    mAprender: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2.6" stroke-linecap="round"><path d="M12 3a9 9 0 0 1 9 9" stroke="#4255FF"/><path d="M21 12a9 9 0 0 1-9 9" stroke="#98E3FF" stroke-dasharray="2 3.2"/><path d="M12 21a9 9 0 0 1-9-9" stroke="#4255FF" stroke-dasharray="2 3.2"/><path d="M3 12a9 9 0 0 1 9-9" stroke="#98E3FF"/></svg>',
    mProbar: '<svg viewBox="0 0 24 24"><path d="M6 2h9l5 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z" fill="#4255FF"/><path d="M15 2v5h5" fill="#98B8FF"/><rect x="7.5" y="11" width="9" height="1.8" rx=".9" fill="#fff"/><rect x="7.5" y="15" width="6" height="1.8" rx=".9" fill="#fff"/></svg>',
    mCombinar: '<svg viewBox="0 0 24 24"><rect x="2" y="3" width="15" height="10" rx="2.5" fill="#4255FF"/><rect x="7" y="11" width="15" height="10" rx="2.5" fill="#2FBFAE"/><rect x="5" y="6.5" width="7" height="1.8" rx=".9" fill="#fff"/><rect x="10" y="14.5" width="8" height="1.8" rx=".9" fill="#fff"/></svg>'
  };

  /* ---------- avance guardado ---------- */
  function sp(set){
    if(!db[set.id]) db[set.id] = {};
    const p = db[set.id];
    if(!p.t) p.t = {};
    if(!p.stars) p.stars = [];
    if(!p.opt) p.opt = {};
    p.opt = Object.assign({ shuffle: false, starred: false, answerWith: 'def', written: false, fcFront: 'term', testN: 0, testTF: true, aiHard: true }, p.opt);
    return p;
  }
  // Todo el avance se indexa por el id de la tarjeta (no por su posición),
  // para que editar o borrar tarjetas no mezcle el progreso de otras.
  function tstate(set, i){ return Object.assign({ s: 0, seen: false }, sp(set).t[set.ids[i]]); }
  function setT(set, i, patch){ const p = sp(set); p.t[set.ids[i]] = Object.assign(tstate(set, i), patch, { u: Date.now() }); save(); }
  function restoreT(set, i, prev){ sp(set).t[set.ids[i]] = Object.assign({ s: 0, seen: false }, prev, { u: Date.now() }); save(); }
  function status(set, i){ const t = tstate(set, i); if(!t.seen) return 'new'; return t.s >= 2 ? 'mastered' : 'learning'; }
  function isStar(set, i){ return sp(set).stars.includes(set.ids[i]); }
  function toggleStar(set, i){
    const p = sp(set), id = set.ids[i];
    p.stars = p.stars.includes(id) ? p.stars.filter(x => x !== id) : p.stars.concat(id);
    p.starsU = Date.now();
    save();
  }
  function hasStars(set){ return set.ids.some(id => sp(set).stars.includes(id)); }
  function counts(set){
    const c = { new: 0, learning: 0, mastered: 0 };
    set.terms.forEach((_, i) => c[status(set, i)]++);
    return c;
  }
  function opts(set){ return sp(set).opt; }
  function pool(set){
    const all = set.terms.map((_, i) => i);
    if(opts(set).starred){
      const st = all.filter(i => isStar(set, i));
      if(st.length) return st;
    }
    return all;
  }
  function qa(set, i){
    const [t, d] = set.terms[i];
    return opts(set).answerWith === 'term' ? { prompt: d, answer: t } : { prompt: t, answer: d };
  }
  function makeChoices(set, i){
    const correct = qa(set, i).answer;
    const others = shuffle(set.terms.map((_, j) => j).filter(j => j !== i))
      .map(j => qa(set, j).answer)
      .filter((a, k, arr) => a !== correct && arr.indexOf(a) === k)
      .slice(0, 3);
    return shuffle([correct].concat(others));
  }

  /* ---------- Opciones difíciles ("trampas") ----------
     Cuando un término ya se sabe bastante bien (lo has acertado al
     menos una vez), las preguntas dejan de mezclar normativas de otras
     tarjetas y pasan a usar opciones casi idénticas a la correcta en
     las que SOLO cambian los números (dígitos traspuestos o cambiados,
     año o día cercanos); el resto del texto queda exactamente igual.
     1) Gemini (vía gemini-proxy) las genera una vez por tarjeta y se
        guardan en nq_cards.trampas para todos los usuarios.
     2) Mientras no existan (o si la IA falla), un generador local crea
        variaciones al momento, así nunca hay que esperar. */
  const aiBusy = {};      // id de tarjeta -> true mientras se genera
  const aiFailed = {};    // id de tarjeta -> true si la IA ya falló en esta sesión

  // Misma "forma" = mismo texto con los dígitos tapados: solo pueden
  // cambiar los números, y cada número conserva su cantidad de cifras.
  function shape(s){ return String(s).trim().replace(/\s+/g, ' ').replace(/\d/g, '#'); }
  function cleanTrampas(list, correct){
    if(!Array.isArray(list)) return [];
    const seen = new Set([norm(correct)]);
    const out = [];
    list.forEach(x => {
      if(typeof x !== 'string') return;
      const s = x.trim().replace(/\s+/g, ' ');
      const k = norm(s);
      if(!s || s.length > 150 || !k || seen.has(k)) return;
      if(/\d/.test(correct) && shape(s) !== shape(correct)) return;
      seen.add(k); out.push(s);
    });
    return out.slice(0, 8);
  }
  function cardTrampas(set, i){
    const c = set.cards[i];
    return c ? cleanTrampas(c.trampas, c.definition) : [];
  }

  function nearMisses(ans){
    // Solo se tocan los números. Se agrupan por número (p. ej. en
    // «RD 371/2010 del 14 de...» el 371, el 2010 y el 14) y luego se
    // intercalan, para que cada opción cambie un número distinto.
    const groups = [];
    let out = [];
    const push = s => { if(s && s !== ans) out.push(s); };
    const group = () => { if(out.length) groups.push(shuffle(out)); out = []; };
    const nums = [...ans.matchAll(/\d+/g)];
    nums.forEach(m => {
      group();
      const s = m[0], at = m.index;
      const put = v => push(ans.slice(0, at) + v + ans.slice(at + s.length));
      const n = +s;
      if(s.length === 4 && n >= 1900 && n <= 2100){ [1, -1, 2, -2].forEach(d => put(String(n + d))); return; }
      if(s.length <= 2 && n >= 1 && n <= 31 && /de\s/i.test(ans.slice(at + s.length, at + s.length + 4))){
        [1, -1, 2, -2].forEach(d => { const v = n + d; if(v >= 1 && v <= 31) put(String(v)); });
        return;
      }
      for(let k = 0; k < s.length - 1; k++){
        if(s[k] === s[k + 1]) continue;
        const a = s.split(''); [a[k], a[k + 1]] = [a[k + 1], a[k]];
        if(a[0] !== '0') put(a.join(''));
      }
      for(let k = 0; k < s.length; k++){
        [1, -1].forEach(d => {
          const dd = +s[k] + d;
          if(dd < 0 || dd > 9 || (k === 0 && dd === 0)) return;
          put(s.slice(0, k) + dd + s.slice(k + 1));
        });
      }
    });
    group();
    const mixed = [];
    const gs = shuffle(groups);
    for(let k = 0; gs.some(g => g.length > k); k++) gs.forEach(g => { if(g[k]) mixed.push(g[k]); });
    return cleanTrampas(mixed, ans);
  }

  function isHard(set, level){
    return opts(set).aiHard && opts(set).answerWith === 'def' && level >= 1;
  }
  function hardChoices(set, i){
    const correct = qa(set, i).answer;
    const seen = new Set([norm(correct)]);
    const pick = [];
    const add = a => { const k = norm(a); if(a && k && !seen.has(k) && pick.length < 3){ seen.add(k); pick.push(a); } };
    shuffle(cardTrampas(set, i)).forEach(add);
    nearMisses(correct).forEach(add);
    // último recurso: normativas de otras tarjetas
    shuffle(set.terms.map((_, j) => j).filter(j => j !== i)).forEach(j => add(qa(set, j).answer));
    return shuffle([correct].concat(pick));
  }

  function trampasPrompt(items){
    return 'Eres un experto en normativa técnica y legislación española de bomberos, emergencias y EPIs (normas UNE, EN, ISO, Reales Decretos, Decretos, Leyes...).\n' +
      'Estoy haciendo un test de estudio. Para CADA elemento de la lista te doy un concepto y su normativa CORRECTA. ' +
      'Genera 6 respuestas INCORRECTAS que se parezcan MUCHÍSIMO a la correcta, para que sea difícil distinguirlas.\n' +
      'REGLA PRINCIPAL: cambia SOLO los números. Todo el texto que no sea un número (siglas como UNE, EN, ISO, RD, «del», «de», el mes, espacios, barras...) debe quedar EXACTAMENTE igual, letra por letra.\n' +
      '- Cada número debe conservar la misma cantidad de cifras.\n' +
      '- Cambios pequeños y creíbles: dos cifras traspuestas (16689 → 16698), una cifra cambiada por la de al lado (443 → 433), año o día cercanos (2010 → 2011, 14 → 15).\n' +
      '- Si puedes, usa números de normas reales parecidas que se suelan confundir, siempre que cumplan las reglas anteriores.\n' +
      '- NUNCA repitas la respuesta correcta. Sin explicaciones.\n' +
      'Responde SOLO con un objeto JSON cuyas claves sean los números de la lista y cuyos valores sean arrays de 6 strings. Ejemplo: {"1":["...","..."],"2":[...]}\n\n' +
      items.map((c, k) => (k + 1) + '. Concepto: ' + c.term + '\n   Correcta: ' + c.definition).join('\n');
  }
  function parseJsonLoose(text){
    if(!text) return null;
    const t = String(text).replace(/```(?:json)?/gi, '');
    const a = t.indexOf('{'), b = t.lastIndexOf('}');
    if(a < 0 || b <= a) return null;
    try{ return JSON.parse(t.slice(a, b + 1)); }catch(e){ return null; }
  }
  async function generateTrampas(cards, force){
    const cl = client();
    let ai = null;
    try{ ai = callGeminiProxy; }catch(e){ ai = null; }
    if(!cl || typeof ai !== 'function') return;
    const todo = cards.filter(c => !aiBusy[c.id] && (force || (!aiFailed[c.id] && cleanTrampas(c.trampas, c.definition).length < 3)));
    if(!todo.length) return;
    todo.forEach(c => { aiBusy[c.id] = true; });
    if(!study) render();
    try{
      for(let k = 0; k < todo.length; k += 12){
        const chunk = todo.slice(k, k + 12);
        let map = null;
        try{ map = parseJsonLoose(await ai(trampasPrompt(chunk))); }catch(e){ console.warn('IA (opciones parecidas):', e.message || e); }
        for(let j = 0; j < chunk.length; j++){
          const c = chunk[j];
          const list = cleanTrampas(map && map[String(j + 1)], c.definition);
          if(list.length < 3){ aiFailed[c.id] = true; continue; }
          c.trampas = list;
          try{ await cl.rpc('nq_set_trampas', { p_card: c.id, p_trampas: list }); }catch(e){}
        }
      }
    }finally{
      todo.forEach(c => { delete aiBusy[c.id]; });
      try{
        const cached = JSON.parse(localStorage.getItem(CACHE_KEY));
        if(cached && cached.cards){
          cached.cards.forEach(cc => { const c = todo.find(x => x.id === cc.id); if(c && c.trampas) cc.trampas = c.trampas; });
          localStorage.setItem(CACHE_KEY, JSON.stringify(cached));
        }
      }catch(e){}
      if(!study) render();
    }
  }
  function prefetchTrampas(set){
    if(opts(set).aiHard) generateTrampas(set.cards, false);
  }
  function regenTrampas(set, i){
    const c = set.cards[i];
    if(!c) return;
    delete aiFailed[c.id];
    generateTrampas([c], true).then(() => {
      if(aiFailed[c.id]) uiToast('La IA no ha podido generar opciones para esta tarjeta. Inténtalo de nuevo en un momento.');
    });
  }
  function trampasLine(set, i){
    const c = set.cards[i];
    if(!c) return '';
    if(aiBusy[c.id]) return '<div class="nq-trampas"><span class="nq-spin"></span>Generando opciones parecidas con IA…</div>';
    const list = cardTrampas(set, i);
    if(list.length >= 3){
      return '<div class="nq-trampas"><div class="nq-trampas-head"><span>🔥 Opciones difíciles (IA)</span><button class="nq-mini" data-act="regen" data-i="' + i + '">Regenerar</button></div>' +
        '<div class="nq-trampas-list">' + list.map(x => '<span>' + esc(x) + '</span>').join('') + '</div></div>';
    }
    return '<div class="nq-trampas muted"><div class="nq-trampas-head"><span>Sin opciones difíciles todavía (se generan solas al estudiar)</span><button class="nq-mini" data-act="regen" data-i="' + i + '">Generar ahora</button></div></div>';
  }
  function ring(count, total, color, zero){
    const r = 17, c = 2 * Math.PI * r, f = total ? count / total : 0;
    return '<svg class="nq-ring" viewBox="0 0 44 44"><circle cx="22" cy="22" r="' + r + '" fill="none" stroke="var(--line)" stroke-width="4"/>' +
      (f > 0 ? '<circle cx="22" cy="22" r="' + r + '" fill="none" stroke="' + color + '" stroke-width="4" stroke-linecap="round" stroke-dasharray="' + (c * f).toFixed(2) + ' ' + c.toFixed(2) + '" transform="rotate(-90 22 22)"/>' : '') +
      '<text x="22" y="26.5" text-anchor="middle"' + (zero ? ' style="fill:var(--muted-2)"' : '') + '>' + count + '</text></svg>';
  }

  /* ============================================================
     BIBLIOTECA Y UNIDAD
     ============================================================ */
  function render(){
    const root = $root();
    if(!root) return;
    const set = view.name === 'set' ? getSet(view.setId) : null;
    // Si se está editando una tarjeta, no perdemos lo que el admin lleva escrito.
    const drafts = {};
    root.querySelectorAll('[data-draft]').forEach(el => { drafts[el.dataset.draft] = el.value; });
    root.innerHTML = (set ? renderSet(set) : renderLibrary()) + renderRootSheet();
    Object.keys(drafts).forEach(k => {
      const el = root.querySelector('[data-draft="' + k + '"]');
      if(el && !el.value) el.value = drafts[k];
    });
    if(set) bindCarousel();
    const f = root.querySelector('[data-autofocus]');
    if(f) setTimeout(() => f.focus(), 30);
  }

  function renderLibrary(){
    const admin = isAdmin();
    let list;
    if(!loaded && !loadError) list = skelList(3);
    else if(!NQ_SETS.length) list = '<div class="empty">' + (loadError ? 'No se pudieron cargar los temas. Revisa la conexión.<br><br><button class="nq-btn nq-btn-sm" data-act="retry-load">Reintentar</button>' : admin ? 'Aún no hay temas. Crea el primero con «Nuevo tema».' : 'Todavía no hay temas disponibles.') + '</div>';
    else list = '<div class="nq-lib-list">' + NQ_SETS.map(set => {
      const c = counts(set), n = set.terms.length || 1;
      return '<button class="nq-lib-item" data-act="open-set" data-set="' + set.id + '">' +
        '<span class="nq-lib-ico">' + I.cards + '</span>' +
        '<span class="nq-lib-main"><div class="nq-lib-name">' + esc(set.title) + '</div>' +
        '<div class="nq-lib-meta">' + set.terms.length + ' tarjetas · ' + c.mastered + ' dominadas</div>' +
        '<div class="nq-lib-bar"><i style="width:' + (c.mastered / n * 100) + '%;background:var(--green)"></i><i style="width:' + (c.learning / n * 100) + '%;background:var(--orange)"></i></div></span>' +
        I.chev.replace('class="chev"', '') + '</button>';
    }).join('') + '</div>';
    return '<div class="nq-lib-head"><h1>Normativas</h1>' +
      (admin ? '<button class="nq-btn nq-btn-sm" data-act="new-set">' + I.plus + 'Nuevo tema</button>' : '') + '</div>' +
      (loaded && (NQ_SETS.length || testSet()) ? srsPanel() : '') +
      '<div class="nq-lib-sub">Temas</div>' + list;
  }

  function renderRootSheet(){
    const sh = view.sheet;
    if(!sh) return '';
    const set = sh.setId ? getSet(sh.setId) : null;
    const isNew = sh.type === 'new-set';
    return '<div class="nq-sheet-bg" data-act="root-sheet-bg"><form class="nq-sheet" data-submit="' + (isNew ? 'create-set' : 'rename-set') + '" autocomplete="off">' +
      '<div class="nq-sheet-grip"></div><h3>' + (isNew ? 'Nuevo tema' : 'Renombrar tema') + '</h3>' +
      '<p>' + (isNew ? 'Ponle un nombre (por ejemplo «EPIs» o «Vehículos»). Después podrás añadirle tarjetas.' : 'Cambia el nombre del tema.') + '</p>' +
      '<input class="nq-input" name="title" maxlength="120" placeholder="Nombre del tema" required data-autofocus value="' + (set ? esc(set.title) : '') + '">' +
      '<div class="nq-sum-actions" style="margin-top:16px"><button class="nq-btn block" type="submit">' + (isNew ? 'Crear tema' : 'Guardar') + '</button>' +
      '<button class="nq-btn ghost block" type="button" data-act="root-sheet-close">Cancelar</button></div></form></div>';
  }

  function renderSet(set){
    const admin = isAdmin();
    const n = set.terms.length, c = counts(set);
    const sort = view.sort || 'original';
    let idxs = set.terms.map((_, i) => i);
    if(view.filter) idxs = idxs.filter(i => status(set, i) === view.filter);
    if(sort === 'alpha') idxs.sort((a, b) => set.terms[a][0].localeCompare(set.terms[b][0], 'es'));
    if(sort === 'starred') idxs = idxs.filter(i => isStar(set, i));
    const filterNames = { new: 'No estudiados', learning: 'En progreso', mastered: 'Dominados' };
    const canStudy = n >= 2;

    const carousel = n ? '<div class="nq-carousel" id="nqCarousel">' + set.terms.map(([t, d], i) =>
      '<div class="nq-ccard" data-act="flip-c"><div class="nq-ccard-inner">' +
        '<div class="nq-ccard-face">' + esc(t) + '<button class="nq-ccard-exp" data-act="fc-at" data-i="' + i + '" title="Pantalla completa">' + I.expand + '</button></div>' +
        '<div class="nq-ccard-face nq-ccard-back">' + esc(d) + '<button class="nq-ccard-exp" data-act="fc-at" data-i="' + i + '" title="Pantalla completa">' + I.expand + '</button></div>' +
      '</div></div>').join('') + '</div>' +
      '<div class="nq-dots" id="nqDots">' + set.terms.map((_, i) => '<i' + (i === 0 ? ' class="on"' : '') + '></i>').join('') + '</div>'
      : '<div class="nq-ccard nq-ccard-empty"><div class="nq-ccard-face">' + (admin ? 'Este tema aún no tiene tarjetas.<br>Pulsa «Editar» (abajo, en Términos) para añadirlas.' : 'Este tema aún no tiene tarjetas.') + '</div></div><div class="nq-dots"></div>';

    const mode = (m, icon, label) => '<button class="nq-mode" data-act="study" data-mode="' + m + '"' + (canStudy ? '' : ' disabled') + '>' + icon + label + '</button>';
    const modes = '<div class="nq-modes">' + mode('fc', I.mFichas, 'Fichas') + mode('learn', I.mAprender, 'Aprender') +
      mode('test', I.mProbar, 'Probar') + mode('match', I.mCombinar, 'Combinar') + '</div>' +
      (canStudy ? '' : '<div class="nq-hint" style="text-align:left">Hacen falta al menos 2 tarjetas para estudiar este tema.</div>');

    const av = (key, label, color) => {
      const k = c[key];
      return '<button class="nq-av' + (k === 0 ? ' zero' : '') + (view.filter === key ? ' sel' : '') + '" data-act="filter" data-f="' + key + '">' +
        ring(k, n, color, k === 0) + '<span class="lbl">' + label + '</span>' + I.chev + '</button>';
    };
    const avance = n ? '<div class="nq-sec"><div class="nq-sec-title">Tu avance</div>' +
      (c.new < n ? '<button class="nq-sec-link" data-act="reset">Reiniciar avance</button>' : '') + '</div>' +
      '<div class="nq-avance">' + av('new', 'No estudiados', 'var(--blue)') + av('learning', 'En progreso', 'var(--orange)') + av('mastered', 'Dominados', 'var(--green)') + '</div>' : '';

    const edit = admin && !!view.editMode;
    const row = i => {
      const [t, d] = set.terms[i], id = set.ids[i];
      if(edit && view.editing === id){
        return '<form class="nq-term nq-term-edit" data-submit="save-card" data-i="' + i + '" autocomplete="off"><div class="nq-term-main">' +
          '<label class="nq-edit-lbl">Término</label><textarea class="nq-input nq-ta" name="term" rows="2" required data-autofocus>' + esc(t) + '</textarea>' +
          '<label class="nq-edit-lbl">Normativa</label><textarea class="nq-input nq-ta" name="definition" rows="2" required>' + esc(d) + '</textarea>' +
          '<div class="nq-edit-actions"><button class="nq-btn ghost nq-btn-sm" type="button" data-act="cancel-edit">Cancelar</button><button class="nq-btn nq-btn-sm" type="submit">Guardar</button></div>' +
          '</div></form>';
      }
      return '<div class="nq-term"><div class="nq-term-main"><div class="nq-term-t">' + esc(t) + '</div><div class="nq-term-d">' + esc(d) + '</div>' + (edit ? trampasLine(set, i) : '') + '</div>' +
        '<div class="nq-term-tools"><button class="nq-ib" data-act="speak" data-i="' + i + '" title="Escuchar">' + I.speaker + '</button>' +
        '<button class="nq-ib' + (isStar(set, i) ? ' star-on' : '') + '" data-act="star" data-i="' + i + '" title="Destacar">' + I.star + '</button>' +
        (edit ? '<button class="nq-ib" data-act="edit-card" data-i="' + i + '" title="Editar">' + I.pencil + '</button>' +
          '<button class="nq-ib nq-ib-del" data-act="del-card" data-i="' + i + '" title="Eliminar">' + I.trash + '</button>' : '') +
        '</div></div>';
    };
    const addForm = !edit ? '' : !view.adding
      ? '<button class="nq-add-btn" data-act="open-add">' + I.plus + 'Añadir tarjeta</button>'
      : '<form class="nq-term nq-term-edit nq-add" data-submit="add-card" autocomplete="off"><div class="nq-term-main">' +
      '<div class="nq-add-title">' + I.plus + 'Nueva tarjeta</div>' +
      '<label class="nq-edit-lbl">Término</label><textarea class="nq-input nq-ta" name="term" rows="2" required placeholder="Ej.: Normativa de los guantes de bombero" data-draft="new-term" data-autofocus></textarea>' +
      '<label class="nq-edit-lbl">Normativa</label><textarea class="nq-input nq-ta" name="definition" rows="2" required placeholder="Ej.: UNE EN 659" data-draft="new-def"></textarea>' +
      '<div class="nq-edit-actions"><button class="nq-btn ghost nq-btn-sm" type="button" data-act="close-add">Cerrar</button><button class="nq-btn nq-btn-sm" type="submit">Añadir</button></div>' +
      '</div></form>';

    const terms = '<div class="nq-sec" id="nqTermsHead"><div class="nq-sec-title">Términos</div><div class="nq-sec-right">' +
      (admin ? '<button class="nq-edit-toggle' + (edit ? ' on' : '') + '" data-act="toggle-edit">' + (edit ? I.check + 'Hecho' : I.pencil + 'Editar') + '</button>' : '') +
      (n ? '<select class="nq-select" data-change="sort" aria-label="Ordenar términos">' +
        '<option value="original"' + (sort === 'original' ? ' selected' : '') + '>Original</option>' +
        '<option value="alpha"' + (sort === 'alpha' ? ' selected' : '') + '>Alfabético</option>' +
        '<option value="starred"' + (sort === 'starred' ? ' selected' : '') + '>Destacados</option>' +
      '</select>' : '') + '</div></div>' +
      (view.filter ? '<button class="nq-filter-chip" data-act="filter" data-f="' + view.filter + '">Mostrando: ' + filterNames[view.filter] + ' ✕</button>' : '') +
      '<div class="nq-terms">' + (idxs.length ? idxs.map(row).join('') :
        (n ? '<div class="nq-empty-terms">' + (sort === 'starred' ? 'Aún no has destacado ningún término. Pulsa la estrella de un término para destacarlo.' : 'No hay términos en esta categoría.') + '</div>' : '')) +
      addForm + '</div>';

    return '<button class="nq-back" data-act="library">' + I.back + 'Normativas</button>' +
      carousel +
      '<div class="nq-set-title">' + esc(set.title) + '</div>' +
      '<div class="nq-set-meta"><span>Normativas</span><span class="sep"></span><span>' + n + ' tarjetas</span>' +
        (edit ? '<span class="sep"></span><button class="nq-sec-link" data-act="rename-set">Renombrar</button><button class="nq-sec-link nq-danger" data-act="del-set">Eliminar tema</button>' : '') + '</div>' +
      modes + avance + terms +
      (canStudy ? '<div class="nq-cta-wrap"><button class="nq-btn block" data-act="study" data-mode="learn">Estudiar este tema</button></div>' : '');
  }

  /* ---------- edición (solo admin; la base de datos lo exige igualmente) ---------- */
  async function createSet(title){
    const orden = NQ_SETS.length;
    let newId = null;
    const ok = await run(async () => {
      const r = await sb.from('nq_sets').insert({ title, orden }).select('id').single();
      if(r.data) newId = r.data.id;
      return r;
    });
    if(!ok) return;
    uiToast('Tema creado', 'success');
    view = { name: 'set', setId: newId };
    await load();
  }
  async function renameSet(set, title){
    if(await run(() => sb.from('nq_sets').update({ title }).eq('id', set.id))){ view.sheet = null; uiToast('Tema renombrado', 'success'); await load(); }
  }
  async function deleteSet(set){
    if(!await uiConfirm('¿Eliminar el tema «' + set.title + '»?\n\nSe borrarán también sus ' + set.terms.length + ' tarjetas. No se puede deshacer.')) return;
    if(await run(() => sb.from('nq_sets').delete().eq('id', set.id))){ view = { name: 'library' }; uiToast('Tema eliminado', 'success'); await load(); }
  }
  async function addCard(set, term, definition){
    const orden = set.cards.reduce((m, c) => Math.max(m, c.orden || 0), -1) + 1;
    return run(() => sb.from('nq_cards').insert({ set_id: set.id, term, definition, orden }));
  }
  async function saveCard(set, i, term, definition){
    if(await run(() => sb.from('nq_cards').update({ term, definition, trampas: null }).eq('id', set.ids[i]))){ view.editing = null; uiToast('Cambios guardados', 'success'); await load(); }
  }
  async function deleteCard(set, i){
    if(!await uiConfirm('¿Eliminar esta tarjeta?\n\n' + set.terms[i][0] + ' → ' + set.terms[i][1])) return;
    if(await run(() => sb.from('nq_cards').delete().eq('id', set.ids[i]))){ uiToast('Tarjeta eliminada', 'success'); await load(); }
  }
  async function onRootSubmit(e){
    const form = e.target;
    const kind = form.dataset.submit;
    if(!kind) return;
    e.preventDefault();
    const val = name => (form.elements[name] ? form.elements[name].value : '').trim();
    const set = view.setId ? getSet(view.setId) : null;
    if(kind === 'create-set'){ const t = val('title'); if(t){ view.sheet = null; await createSet(t); } }
    else if(kind === 'rename-set' && set){ const t = val('title'); if(t) await renameSet(set, t); }
    else if(kind === 'save-card' && set){
      const t = val('term'), d = val('definition');
      if(t && d) await saveCard(set, +form.dataset.i, t, d);
    } else if(kind === 'add-card' && set){
      const t = val('term'), d = val('definition');
      if(!t || !d) return;
      if(await addCard(set, t, d)){
        uiToast('Tarjeta añadida', 'success');
        form.reset();
        await load();
        const f = $root().querySelector('[data-draft="new-term"]');
        if(f){ f.focus(); f.scrollIntoView({ block: 'center' }); }
      }
    }
  }

  function bindCarousel(){
    const car = document.getElementById('nqCarousel');
    const dots = document.getElementById('nqDots');
    if(!car || !dots) return;
    car.addEventListener('scroll', () => {
      const w = car.firstElementChild ? car.firstElementChild.offsetWidth + 14 : 1;
      const k = Math.round(car.scrollLeft / w);
      [...dots.children].forEach((d, i) => d.classList.toggle('on', i === k));
    }, { passive: true });
  }

  /* ============================================================
     MODOS DE ESTUDIO (pantalla completa)
     ============================================================ */
  function openStudy(mode, set, extra){
    stopMatchTimer();
    if(mode === 'fc') study = fcInit(set, extra && extra.start);
    else if(mode === 'learn') study = lnInit(set);
    else if(mode === 'test') study = { mode: 'test', set, phase: 'config' };
    else if(mode === 'match') study = mtInit(set);
    if(mode === 'learn' || mode === 'test') prefetchTrampas(set);
    $ov().classList.remove('hidden');
    $ov().scrollTop = 0;
    renderStudy();
  }
  function closeStudy(){
    stopMatchTimer();
    if('speechSynthesis' in window){ try{ speechSynthesis.cancel(); }catch(e){} }
    study = null;
    $ov().classList.add('hidden');
    $ov().innerHTML = '';
    render();
  }
  function restartStudy(){ if(study) openStudy(study.mode, study.set); }
  function wantsExitConfirm(){
    if(!study) return false;
    if(study.mode === 'learn') return study.answeredCount > 0 && !study.finished;
    if(study.mode === 'test') return study.phase === 'doing' && Object.keys(study.ans).length > 0;
    return false;
  }
  function tryClose(){
    if(wantsExitConfirm()){ study.sheet = 'confirm'; renderStudy(); }
    else closeStudy();
  }

  function studyHeader(title, withGear){
    return '<div class="nq-sh"><button class="nq-ib" data-act="close" title="Cerrar">' + I.close + '</button>' +
      '<div class="nq-sh-title">' + title + '</div>' +
      (withGear ? '<button class="nq-ib" data-act="settings" title="Opciones">' + I.gear + '</button>' : '<span></span>') + '</div>';
  }

  function renderStudy(){
    const ov = $ov();
    if(!study){ ov.innerHTML = ''; return; }
    let html = '';
    if(study.mode === 'fc') html = renderFc();
    else if(study.mode === 'srs') html = renderSrs();
    else if(study.mode === 'learn') html = renderLearn();
    else if(study.mode === 'test') html = renderTest();
    else if(study.mode === 'match') html = renderMatch();
    ov.innerHTML = '<div class="nq-si">' + html + '</div>' + renderSheet();
    if(study.mode === 'fc') bindFcDrag();
    const inp = ov.querySelector('#nqWritten');
    if(inp) setTimeout(() => inp.focus(), 30);
  }

  function renderSheet(){
    if(!study || !study.sheet) return '';
    if(study.sheet === 'confirm'){
      const name = study.mode === 'learn' ? 'Aprender' : 'Probar';
      const msg = study.mode === 'learn'
        ? 'Tu avance en los términos que ya has respondido se ha guardado. Podrás seguir donde lo dejaste.'
        : 'No se guardarán las respuestas de esta prueba.';
      return '<div class="nq-sheet-bg" data-act="sheet-bg"><div class="nq-sheet"><div class="nq-sheet-grip"></div>' +
        '<h3>Confirma si quieres salir del modo ' + name + '</h3><p>' + msg + '</p>' +
        '<div class="nq-sum-actions"><button class="nq-btn danger block" data-act="close-force">Salir</button>' +
        '<button class="nq-btn ghost block" data-act="sheet-close">Cancelar</button></div></div></div>';
    }
    const o = opts(study.set);
    const anyStars = hasStars(study.set);
    const tog = (key, label, on, disabled) => '<div class="nq-cfg-row"><span>' + label + '</span><label class="nq-toggle"><input type="checkbox" data-opt="' + key + '"' + (on ? ' checked' : '') + (disabled ? ' disabled' : '') + '><span></span></label></div>';
    let rows = tog('shuffle', 'Mezclar términos', o.shuffle) +
      tog('starred', 'Estudiar solo destacados' + (anyStars ? '' : ' <small style="color:var(--muted-2)">(no hay)</small>'), o.starred && anyStars, !anyStars);
    if(study.mode === 'fc'){
      rows += '<div class="nq-cfg-row"><span>Mostrar primero</span><select class="nq-select" data-opt="fcFront"><option value="term"' + (o.fcFront === 'term' ? ' selected' : '') + '>Término</option><option value="def"' + (o.fcFront === 'def' ? ' selected' : '') + '>Normativa</option></select></div>';
    } else {
      rows += '<div class="nq-cfg-row"><span>Responder con</span><select class="nq-select" data-opt="answerWith"><option value="def"' + (o.answerWith === 'def' ? ' selected' : '') + '>Normativa</option><option value="term"' + (o.answerWith === 'term' ? ' selected' : '') + '>Término</option></select></div>';
      if(study.mode === 'learn') rows += tog('written', 'Preguntas escritas (2ª vuelta)', o.written);
      rows += tog('aiHard', '🔥 Opciones difíciles con IA cuando ya te lo sabes', o.aiHard && o.answerWith === 'def', o.answerWith !== 'def');
    }
    return '<div class="nq-sheet-bg" data-act="sheet-bg"><div class="nq-sheet"><div class="nq-sheet-grip"></div><h3>Opciones</h3>' +
      '<p>Al cambiar una opción se reinicia la sesión actual.</p>' + rows +
      '<div class="nq-sum-actions" style="margin-top:18px"><button class="nq-btn block" data-act="sheet-close">Listo</button></div></div></div>';
  }

  /* ---------- REPASO (estilo Anki) ----------
     Repetición espaciada de TODAS las tarjetas que ya has estudiado
     alguna vez (en cualquier tema y modo); las que aún no has visto no
     entran nunca. Cada tarjeta guarda su propio calendario (srs) junto a
     su avance en localStorage: intervalo en días, facilidad y fecha del
     próximo repaso. Una tarjeta vista pero sin calendario está pendiente
     desde ya. */
  const DAY = 86400000;
  const SRS_SESSION_MAX = 100;
  function startOfDay(t){ const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); }
  function srsOf(set, i){ return tstate(set, i).srs || null; }
  /* Preguntas falladas en los tests: entran en el Repaso diario como un
     mazo más («Tests»). Su calendario se guarda junto al resto del avance
     (clave 'tests', sincronizada entre dispositivos). */
  const TESTS_KEY = 'tests';
  function poolQuestions(){ try{ return QUESTIONS_POOL || []; }catch(e){ return []; } }
  function testSet(){
    const p = db[TESTS_KEY];
    if(!p || !p.t) return null;
    const byId = new Map(poolQuestions().map(q => [String(q.id), q]));
    const ids = Object.keys(p.t).filter(id => byId.has(id) && p.t[id] && p.t[id].seen);
    if(!ids.length) return null;
    const qs = ids.map(id => byId.get(id));
    return { id: TESTS_KEY, title: 'Pregunta fallada', ids, qs, cards: [], terms: qs.map(q => [q.q, (q.options || [])[q.correct] || '']) };
  }
  function testsStore(){
    const p = db[TESTS_KEY] || (db[TESTS_KEY] = {});
    if(!p.t) p.t = {};
    return p;
  }
  // Se llama al terminar un test por cada pregunta fallada (o en blanco):
  // vuelve a salir en el repaso desde ya y su intervalo se reinicia.
  function addFailedQuestion(qid){
    const p = testsStore(), id = String(qid), prev = p.t[id];
    const srs = prev && prev.srs
      ? Object.assign({}, prev.srs, { ivl: 0, reps: 0, lapses: (prev.srs.lapses || 0) + 1, ease: Math.max(1.3, (prev.srs.ease || 2.5) - 0.2), due: Date.now() })
      : null;
    p.t[id] = { s: 0, seen: true, srs, u: Date.now() };
    save();
  }
  // Primera vez: se añaden las preguntas que ya estaban en Fallos. Con u=1
  // para que, si otro dispositivo ya las repasó, gane su avance al fusionar.
  function seedFailed(){
    const p = testsStore();
    if(p.seeded) return;
    const qs = poolQuestions();
    if(!qs.length) return;
    qs.filter(q => q.masteryStatus === 'red' && !q.fallosHidden).forEach(q => {
      const id = String(q.id);
      if(!p.t[id]) p.t[id] = { s: 0, seen: true, srs: null, u: 1 };
    });
    p.seeded = true;
    save();
    if(!study) render();
  }
  function srsItems(){
    const now = Date.now();
    const due = [], later = [];
    const ts = testSet();
    (ts ? NQ_SETS.concat([ts]) : NQ_SETS).forEach(set => set.terms.forEach((_, i) => {
      const t = tstate(set, i);
      if(!t.seen) return;
      const s = t.srs;
      const when = s ? s.due : 0;
      (when <= now ? due : later).push({ set, i, when });
    }));
    due.sort((a, b) => a.when - b.when);
    later.sort((a, b) => a.when - b.when);
    return { due, later };
  }
  function srsNext(s, r){
    // r: 0 otra vez · 1 difícil · 2 bien · 3 fácil
    const cur = Object.assign({ ivl: 0, ease: 2.5, reps: 0, lapses: 0 }, s);
    const n = Object.assign({}, cur);
    const today = startOfDay(Date.now());
    if(r === 0){
      n.lapses++; n.reps = 0; n.ivl = 0; n.ease = Math.max(1.3, cur.ease - 0.2);
      n.due = Date.now() + 60000;
      return n;
    }
    if(r === 1){ n.ivl = cur.reps === 0 ? 1 : Math.max(cur.ivl + 1, Math.round(cur.ivl * 1.2)); n.ease = Math.max(1.3, cur.ease - 0.15); }
    if(r === 2){ n.ivl = cur.reps === 0 ? 1 : cur.reps === 1 ? 3 : Math.max(cur.ivl + 1, Math.round(cur.ivl * cur.ease)); }
    if(r === 3){ n.ivl = cur.reps === 0 ? 4 : Math.max(cur.ivl + 2, Math.round(cur.ivl * cur.ease * 1.3)); n.ease = cur.ease + 0.15; }
    n.reps = cur.reps + 1;
    n.due = today + n.ivl * DAY;
    return n;
  }
  function fmtIvl(s){
    if(!s || !s.ivl) return '<1 min';
    const d = s.ivl;
    if(d < 30) return d + ' d';
    if(d < 365) return Math.round(d / 30) + ' mes' + (Math.round(d / 30) > 1 ? 'es' : '');
    return (d / 365).toFixed(1).replace('.0', '') + ' año' + (d >= 730 ? 's' : '');
  }
  function fmtWhen(t){
    const days = Math.round((startOfDay(t) - startOfDay(Date.now())) / DAY);
    if(days <= 0){
      const m = Math.max(1, Math.round((t - Date.now()) / 60000));
      return m < 60 ? 'en ' + m + ' min' : 'hoy';
    }
    if(days === 1) return 'mañana';
    return 'en ' + days + ' días';
  }

  function srsPanel(){
    const { due, later } = srsItems();
    const total = due.length + later.length;
    let body, btn = '';
    if(!total){
      body = '<div class="nq-srs-sub">Aquí aparecerán las tarjetas que ya hayas estudiado en algún tema y las preguntas que falles en los tests, para repasarlas justo antes de olvidarlas. Las nuevas no entran.</div>';
    } else if(due.length){
      const nq = due.filter(x => x.set.id === TESTS_KEY).length;
      body = '<div class="nq-srs-sub">' + total + ' tarjeta' + (total === 1 ? '' : 's') + ' en tu mazo de repaso' +
        (nq ? ' · hoy: ' + [due.length - nq ? (due.length - nq) + ' de normativas' : '', nq + ' pregunta' + (nq === 1 ? '' : 's') + ' fallada' + (nq === 1 ? '' : 's') + ' en tests'].filter(Boolean).join(' y ') : '') + '</div>';
      btn = '<button class="nq-btn" data-act="srs-start">Repasar</button>';
    } else {
      body = '<div class="nq-srs-sub">¡Al día! Próximo repaso ' + fmtWhen(later[0].when) + ' · ' + total + ' en tu mazo</div>';
    }
    btn = '<button class="nq-ib nq-srs-bell" data-act="reminder" title="Recordatorio diario" aria-label="Recordatorio diario">' + I.bell + '</button>' + btn;
    return '<div class="nq-srs-panel' + (due.length ? ' due' : '') + '">' +
      '<div class="nq-srs-ico">' + I.brain + '</div>' +
      '<div class="nq-srs-main"><div class="nq-srs-title">Repaso diario' +
        (due.length ? ' <span class="nq-srs-count">' + due.length + ' pendiente' + (due.length === 1 ? '' : 's') + '</span>' : '') + '</div>' + body + '</div>' +
      btn + '</div>';
  }

  function srsInit(){
    const { due } = srsItems();
    const queue = due.slice(0, SRS_SESSION_MAX).map(x => ({ set: x.set, i: x.i, id: x.set.ids[x.i] }));
    return { mode: 'srs', set: null, queue, shown: false, done: 0, total: queue.length, counts: [0, 0, 0, 0], hist: [] };
  }
  function srsCur(){ return study && study.queue[0]; }
  function srsShow(){
    if(!study || study.mode !== 'srs' || !srsCur() || study.shown) return;
    study.shown = true;
    renderStudy();
  }
  function srsRate(r){
    const st = study;
    const it = srsCur();
    if(!st || st.mode !== 'srs' || !it || !st.shown) return;
    const prev = tstate(it.set, it.i);
    const next = srsNext(prev.srs, r);
    const patch = { srs: next };
    if(r === 0) patch.s = Math.min(prev.s, 1);
    setT(it.set, it.i, patch);
    st.counts[r]++;
    st.queue.shift();
    if(r === 0){
      // «Otra vez»: vuelve a salir en esta misma sesión, un poco más tarde.
      st.queue.splice(Math.min(3, st.queue.length), 0, it);
    } else {
      st.done++;
    }
    st.shown = false;
    renderStudy();
  }
  function renderSrs(){
    const st = study;
    const it = srsCur();
    if(!it){
      const { later } = srsItems();
      return studyHeader('Repaso', false) +
        '<div class="nq-sum"><div class="nq-sum-emoji">🧠</div>' +
        '<div class="nq-sum-title">' + (st.total ? '¡Repaso de hoy completado!' : 'Nada que repasar') + '</div>' +
        '<div class="nq-sum-sub">' + (st.total ? 'Has repasado ' + st.done + ' tarjeta' + (st.done === 1 ? '' : 's') + '. ' : '') +
          (later.length ? 'El próximo repaso es ' + fmtWhen(later[0].when) + '.' : '') + '</div>' +
        (st.total ? '<div class="nq-sum-stats nq-srs-stats">' +
          '<div class="nq-stat"><b style="color:#E5484D">' + st.counts[0] + '</b><span>Otra vez</span></div>' +
          '<div class="nq-stat"><b class="nq-c-orange">' + st.counts[1] + '</b><span>Difícil</span></div>' +
          '<div class="nq-stat"><b class="nq-c-green">' + st.counts[2] + '</b><span>Bien</span></div>' +
          '<div class="nq-stat"><b style="color:var(--blue)">' + st.counts[3] + '</b><span>Fácil</span></div></div>' : '') +
        '<div class="nq-sum-actions"><button class="nq-btn block" data-act="close">Volver a Normativas</button></div></div>';
    }
    const [t, d] = it.set.terms[it.i];
    const s = srsOf(it.set, it.i);
    const labels = ['Otra vez', 'Difícil', 'Bien', 'Fácil'];
    const cls = ['again', 'hard', 'good', 'easy'];
    const left = st.queue.length;
    const rateBtns = '<div class="nq-srs-btns">' + labels.map((l, r) =>
        '<button class="nq-srs-btn ' + cls[r] + '" data-act="srs-rate" data-r="' + r + '"><b>' + l + '</b><span>' + fmtIvl(srsNext(s, r)) + '</span></button>').join('') + '</div>' +
      '<div class="nq-hint">Teclas 1 · 2 · 3 · 4</div>';
    if(it.set.id === TESTS_KEY){
      // Pregunta de test: enunciado + opciones; al mostrar, la correcta en verde.
      const q = it.set.qs[it.i];
      const opts2 = (q.options || []).map((o, k) =>
        '<div class="nq-srsq-opt' + (st.shown ? (k === q.correct ? ' ok' : ' dim') : '') + '"><span class="k">' + String.fromCharCode(65 + k) + '</span><span>' + esc(o) + '</span>' + (st.shown && k === q.correct ? I.check : '') + '</div>').join('');
      const exp = st.shown && q.explain ? '<div class="nq-srsq-exp">' + esc(String(q.explain).slice(0, 900)) + (String(q.explain).length > 900 ? '…' : '') + '</div>' : '';
      return studyHeader('Repaso · ' + left + ' restante' + (left === 1 ? '' : 's'), false) +
        '<div class="nq-pbar"><i style="width:' + (st.total ? st.done / st.total * 100 : 0) + '%"></i></div>' +
        '<div class="nq-srsq"><div class="nq-srsq-head"><span class="nq-srs-set">❌ Fallada en un test</span>' + (q.art ? '<span class="nq-srsq-art">' + esc(q.art) + '</span>' : '') + '</div>' +
          '<div class="nq-srsq-text">' + esc(q.q) + '</div><div class="nq-srsq-opts">' + opts2 + '</div>' + exp + '</div>' +
        (st.shown ? rateBtns
          : '<div class="nq-srs-btns one"><button class="nq-btn block" data-act="srs-show">Mostrar respuesta</button></div>' +
            '<div class="nq-hint">Piensa cuál es la correcta y luego pulsa (o espacio)</div>');
    }
    const tools = '<div class="nq-fc-tools"><button class="nq-ib" data-act="srs-speak" title="Escuchar">' + I.speaker + '</button><span class="nq-srs-set">' + esc(it.set.title) + '</span></div>';
    return studyHeader('Repaso · ' + left + ' restante' + (left === 1 ? '' : 's'), false) +
      '<div class="nq-pbar"><i style="width:' + (st.total ? st.done / st.total * 100 : 0) + '%"></i></div>' +
      '<div class="nq-fc-stage nq-srs-stage"><div class="nq-fc-card' + (st.shown ? ' flipped' : '') + '" data-act="srs-show"><div class="nq-fc-inner">' +
        '<div class="nq-fc-face">' + tools + '<div>' + esc(t) + '</div><div class="nq-fc-side">¿Qué normativa es?</div></div>' +
        '<div class="nq-fc-face nq-fc-back">' + tools + '<div><div class="nq-srs-q">' + esc(t) + '</div>' + esc(d) + '</div><div class="nq-fc-side">Normativa</div></div>' +
      '</div></div></div>' +
      (st.shown
        ? rateBtns
        : '<div class="nq-srs-btns one"><button class="nq-btn block" data-act="srs-show">Mostrar respuesta</button></div>' +
          '<div class="nq-hint">Piensa la respuesta y luego pulsa (o espacio)</div>');
  }

  /* ---------- FICHAS ---------- */
  function fcInit(set, start){
    let order = pool(set);
    if(opts(set).shuffle) order = shuffle(order);
    if(start != null){
      const k = order.indexOf(start);
      if(k > 0) order = order.slice(k).concat(order.slice(0, k));
    }
    return { mode: 'fc', set, order, pos: 0, flipped: false, known: [], learning: [], hist: [], done: false };
  }
  function renderFc(){
    const st = study, set = st.set, n = st.order.length;
    if(st.done){
      const k = st.known.length, l = st.learning.length;
      return studyHeader('Fichas', true) +
        '<div class="nq-sum">' +
          '<div class="nq-sum-emoji">' + (l === 0 ? '🏆' : '💪') + '</div>' +
          '<div class="nq-sum-title">' + (l === 0 ? '¡Te las sabes todas!' : '¡Buen trabajo!') + '</div>' +
          '<div class="nq-sum-sub">Has repasado las ' + n + ' fichas. ' + (l ? 'Sigue practicando las que aún tienes en progreso.' : 'Pasa a Aprender para dominarlas del todo.') + '</div>' +
          '<div class="nq-sum-stats"><div class="nq-stat"><b class="nq-c-green">' + k + '</b><span>Conocidas</span></div><div class="nq-stat"><b class="nq-c-orange">' + l + '</b><span>En progreso</span></div></div>' +
          '<div class="nq-sum-actions">' +
            (l ? '<button class="nq-btn block" data-act="fc-again-learning">Repasar las ' + l + ' en progreso</button>' : '<button class="nq-btn block" data-act="goto-learn">Ir a Aprender</button>') +
            '<button class="nq-btn ghost block" data-act="restart">Reiniciar fichas</button>' +
            '<button class="nq-btn ghost block" data-act="fc-undo">' + 'Volver a la última ficha' + '</button>' +
          '</div></div>';
    }
    const i = st.order[st.pos];
    const [t, d] = set.terms[i];
    const defFirst = opts(set).fcFront === 'def';
    const front = defFirst ? d : t, back = defFirst ? t : d;
    const tools = '<div class="nq-fc-tools"><button class="nq-ib" data-act="speak-fc" title="Escuchar">' + I.speaker + '</button>' +
      '<button class="nq-ib' + (isStar(set, i) ? ' star-on' : '') + '" data-act="star" data-i="' + i + '" title="Destacar">' + I.star + '</button></div>';
    return studyHeader((st.pos + 1) + ' / ' + n, true) +
      '<div class="nq-pbar"><i style="width:' + (st.pos / n * 100) + '%"></i></div>' +
      '<div class="nq-fc-counts"><span class="nq-c-orange"><span class="nq-pill orange">' + st.learning.length + '</span>En progreso</span>' +
        '<span class="nq-c-green">Conocida<span class="nq-pill green">' + st.known.length + '</span></span></div>' +
      '<div class="nq-fc-stage"><div class="nq-fc-card' + (st.flipped ? ' flipped' : '') + '" id="nqFcCard"><div class="nq-fc-inner">' +
        '<div class="nq-fc-face">' + tools + '<div>' + esc(front) + '</div><div class="nq-fc-side">' + (defFirst ? 'Normativa' : 'Término') + '</div></div>' +
        '<div class="nq-fc-face nq-fc-back">' + tools + '<div>' + esc(back) + '</div><div class="nq-fc-side">' + (defFirst ? 'Término' : 'Normativa') + '</div></div>' +
      '</div></div></div>' +
      '<div class="nq-fc-controls">' +
        '<button class="nq-ib" data-act="fc-undo" title="Deshacer"' + (st.hist.length ? '' : ' disabled style="opacity:.35"') + '>' + I.undo + '</button>' +
        '<div class="nq-fc-mid"><button class="nq-round x" data-act="fc-mark" data-know="0" title="Aún no me la sé">' + I.x + '</button>' +
        '<button class="nq-round ok" data-act="fc-mark" data-know="1" title="Me la sé">' + I.check + '</button></div>' +
        '<button class="nq-ib" data-act="fc-shuffle" title="Mezclar"' + (opts(set).shuffle ? ' style="color:var(--blue)"' : '') + '>' + I.shuffle + '</button>' +
      '</div>' +
      '<div class="nq-hint">Toca la ficha para darle la vuelta · desliza → si te la sabes, ← si aún no</div>';
  }
  function fcFlip(){
    if(!study || study.mode !== 'fc' || study.done) return;
    study.flipped = !study.flipped;
    const card = document.getElementById('nqFcCard');
    if(card) card.classList.toggle('flipped', study.flipped);
  }
  function fcMark(know){
    const st = study;
    if(!st || st.mode !== 'fc' || st.done) return;
    const i = st.order[st.pos];
    (know ? st.known : st.learning).push(i);
    const prev = tstate(st.set, i);
    st.hist.push({ pos: st.pos, know, prev });
    setT(st.set, i, { seen: true, s: know ? Math.max(prev.s, 1) : Math.min(prev.s, 1) });
    st.pos++;
    st.flipped = false;
    if(st.pos >= st.order.length) st.done = true;
    renderStudy();
  }
  function fcUndo(){
    const st = study;
    if(!st || !st.hist.length) return;
    const h = st.hist.pop();
    const i = st.order[h.pos];
    const list = h.know ? st.known : st.learning;
    list.splice(list.lastIndexOf(i), 1);
    restoreT(st.set, i, h.prev);
    st.pos = h.pos; st.done = false; st.flipped = false;
    renderStudy();
  }
  function bindFcDrag(){
    const card = document.getElementById('nqFcCard');
    if(!card) return;
    let x0 = null, y0 = 0, dx = 0, dragging = false, pid = null;
    card.addEventListener('pointerdown', e => {
      if(e.target.closest('button')) return;
      x0 = e.clientX; y0 = e.clientY; dx = 0; dragging = false; pid = e.pointerId;
    });
    card.addEventListener('pointermove', e => {
      if(x0 === null || e.pointerId !== pid) return;
      dx = e.clientX - x0;
      const dy = e.clientY - y0;
      if(!dragging && Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)){
        dragging = true;
        try{ card.setPointerCapture(pid); }catch(err){}
        card.classList.add('dragging');
      }
      if(dragging){
        card.style.transform = 'translateX(' + dx + 'px) rotate(' + (dx / 28) + 'deg)';
        card.dataset.tint = dx > 70 ? 'know' : dx < -70 ? 'learn' : '';
      }
    });
    const end = e => {
      if(x0 === null) return;
      const wasDrag = dragging;
      x0 = null; dragging = false;
      card.classList.remove('dragging');
      if(!wasDrag){ if(e.type === 'pointerup') fcFlip(); return; }
      if(Math.abs(dx) > 100){
        const know = dx > 0;
        card.style.transition = 'transform .22s ease-in, opacity .22s';
        card.style.transform = 'translateX(' + (know ? 1 : -1) * window.innerWidth + 'px) rotate(' + (know ? 18 : -18) + 'deg)';
        card.style.opacity = '0';
        setTimeout(() => fcMark(know), 200);
      } else {
        card.style.transition = 'transform .2s';
        card.style.transform = '';
        card.dataset.tint = '';
        setTimeout(() => { card.style.transition = ''; }, 220);
      }
    };
    card.addEventListener('pointerup', end);
    card.addEventListener('pointercancel', end);
  }

  /* ---------- APRENDER ---------- */
  function lnInit(set){
    let terms = pool(set);
    if(opts(set).shuffle) terms = shuffle(terms);
    const level = {};
    terms.forEach(i => { level[i] = Math.min(2, tstate(set, i).s || 0); });
    const st = { mode: 'learn', set, terms, level, round: 0, queue: [], roundItems: [], cur: null, answered: null, summary: false, finished: false, answeredCount: 0, qid: 0 };
    if(terms.every(i => level[i] >= 2)) st.finished = true;
    else lnNextRound(st);
    return st;
  }
  function lnNextRound(st){
    const rem = st.terms.filter(i => st.level[i] < 2).sort((a, b) => st.level[a] - st.level[b]).slice(0, ROUND_SIZE);
    if(!rem.length){ st.finished = true; st.summary = false; return; }
    st.round++;
    st.roundItems = rem.slice();
    st.queue = rem.map(i => ({ i, retry: false }));
    st.summary = false;
    lnNextQ(st);
  }
  function lnNextQ(st){
    st.answered = null;
    st.qid++;
    if(!st.queue.length){
      st.cur = null;
      if(st.terms.every(i => st.level[i] >= 2)) st.finished = true;
      else st.summary = true;
      return;
    }
    const it = st.queue.shift();
    const type = (st.level[it.i] >= 1 && opts(st.set).written) ? 'written' : 'mc';
    const q = qa(st.set, it.i);
    const hard = type === 'mc' && isHard(st.set, st.level[it.i]);
    st.cur = { i: it.i, retry: it.retry, type, hard, prompt: q.prompt, answer: q.answer, choices: type === 'mc' ? (hard ? hardChoices(st.set, it.i) : makeChoices(st.set, it.i)) : null };
  }
  function lnAnswer(value){
    const st = study;
    if(!st || st.mode !== 'learn' || !st.cur || st.answered) return;
    const cur = st.cur;
    let correct;
    if(value === null) correct = false;
    else if(cur.type === 'mc') correct = cur.choices[value] === cur.answer;
    else correct = norm(value) !== '' && norm(value) === norm(cur.answer);
    lnResolve(correct, value);
  }
  function lnResolve(correct, value){
    const st = study, cur = st.cur;
    st.answered = { value, correct };
    st.answeredCount++;
    if(correct) st.level[cur.i] = Math.min(2, st.level[cur.i] + 1);
    else st.queue.push({ i: cur.i, retry: true });
    setT(st.set, cur.i, { seen: true, s: st.level[cur.i] });
    renderStudy();
    if(correct){
      const qid = st.qid;
      setTimeout(() => { if(study === st && st.qid === qid && st.answered){ lnNextQ(st); renderStudy(); } }, 950);
    }
  }
  function lnOverride(){
    // En preguntas escritas: "Contar como correcta" si la respuesta era válida con otra redacción.
    const st = study;
    if(!st || !st.answered || st.answered.correct) return;
    const cur = st.cur;
    // deshacer el fallo y darla por buena
    const k = st.queue.map(q => q.i).lastIndexOf(cur.i);
    if(k >= 0) st.queue.splice(k, 1);
    st.answered = null;
    st.answeredCount--;
    lnResolve(true, st.cur.type === 'mc' ? null : '');
  }
  function lnContinue(){
    const st = study;
    if(!st || st.mode !== 'learn') return;
    if(st.summary){ lnNextRound(st); }
    else if(st.answered){ lnNextQ(st); }
    renderStudy();
  }
  function renderLearn(){
    const st = study, set = st.set;
    const total = st.terms.length * 2;
    const done = st.terms.reduce((a, i) => a + st.level[i], 0);
    const mastered = st.terms.filter(i => st.level[i] >= 2).length;
    const last = st.answered;
    const prog = '<div class="nq-lprog"><span class="nq-num ' + (last && !last.correct ? 'orange' : 'green') + '">' + done + '</span>' +
      '<div class="nq-pbar"><i style="width:' + (done / total * 100) + '%"></i></div><span class="nq-num">' + total + '</span></div>';

    if(st.finished){
      return studyHeader('Aprender', true) + prog +
        '<div class="nq-sum"><div class="nq-sum-emoji">🎉</div><div class="nq-sum-title">¡Lo has conseguido!</div>' +
        '<div class="nq-sum-sub">Has dominado los ' + st.terms.length + ' términos de «' + esc(set.title) + '». Repásalos de vez en cuando para no olvidarlos.</div>' +
        '<div class="nq-sum-actions"><button class="nq-btn block" data-act="study" data-mode="test">Hacer una prueba</button>' +
        '<button class="nq-btn ghost block" data-act="learn-reset">Reiniciar Aprender</button>' +
        '<button class="nq-btn ghost block" data-act="close">Volver a la unidad</button></div></div>';
    }
    if(st.summary){
      return studyHeader('Ronda ' + st.round, true) + prog +
        '<div class="nq-sum"><div class="nq-sum-title">Ronda ' + st.round + ' completada</div>' +
        '<div class="nq-sum-sub">Has dominado ' + mastered + ' de ' + st.terms.length + ' términos. ¡Sigue así!</div>' +
        '<div class="nq-sum-list">' + st.roundItems.map(i => {
          const ok = st.level[i] >= 2;
          return '<div class="nq-sum-row"><span class="' + (ok ? 'nq-c-green' : 'nq-c-orange') + '">' + (ok ? I.check : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="12" cy="12" r="8"/></svg>') + '</span>' +
            '<div><div>' + esc(set.terms[i][0]) + '</div><div class="d">' + esc(set.terms[i][1]) + '</div></div></div>';
        }).join('') + '</div>' +
        '<div class="nq-sum-actions"><button class="nq-btn block" data-act="learn-continue">Continuar</button></div></div>';
    }

    const cur = st.cur;
    let body = '';
    let msg = '';
    if(last) msg = last.correct ? '<div class="nq-q-msg ok">¡Genial!</div>' : '<div class="nq-q-msg bad">¡No hay problema, todavía estás aprendiendo!</div>';
    if(cur.type === 'mc'){
      body = (msg || '<div class="nq-q-msg">Selecciona la respuesta</div>') + '<div class="nq-opts">' + cur.choices.map((c, k) => {
        let cls = '', icon = '<span class="k">' + (k + 1) + '</span>';
        if(last){
          const isAns = c === cur.answer;
          if(k === last.value && last.correct){ cls = 'correct'; icon = I.check; }
          else if(k === last.value){ cls = 'wrong'; icon = I.x; }
          else if(isAns && !last.correct){ cls = 'reveal'; icon = I.check; }
          else cls = 'dim';
        }
        return '<button class="nq-opt ' + cls + '" data-act="ln-pick" data-k="' + k + '"' + (last ? ' disabled' : '') + '>' + icon + '<span>' + esc(c) + '</span></button>';
      }).join('') + '</div>';
    } else {
      if(!last){
        body = '<div class="nq-q-msg">Escribe la respuesta</div>' +
          '<form data-submit="ln-written" autocomplete="off"><input class="nq-input" id="nqWritten" placeholder="Escribe la respuesta" autocapitalize="off" spellcheck="false"></form>';
      } else {
        body = msg + (last.correct
          ? '<div class="nq-answer-box good"><small>Tu respuesta</small>' + esc(cur.answer) + '</div>'
          : '<div class="nq-answer-box bad"><small>Tu respuesta</small>' + (last.value ? esc(last.value) : '<i style="color:var(--muted)">Sin respuesta</i>') + '</div>' +
            '<div class="nq-answer-box good"><small>Respuesta correcta</small>' + esc(cur.answer) + '</div>');
      }
    }
    let foot;
    if(!last){
      foot = '<button class="nq-link" data-act="ln-skip">¿No lo sabes?</button>' +
        (cur.type === 'written' ? '<button class="nq-btn" data-act="ln-written-go">Responder</button>' : '<span></span>');
    } else if(!last.correct){
      foot = (cur.type === 'written' && last.value ? '<button class="nq-link" data-act="ln-override">Contar como correcta</button>' : '<span></span>') +
        '<button class="nq-btn" data-act="learn-continue">Continuar</button>';
    } else foot = '<span></span>';

    return studyHeader('Ronda ' + st.round, true) + prog +
      '<div class="nq-q">' +
        ((cur.retry || cur.hard) ? '<div class="nq-q-tags">' + (cur.retry ? '<span class="nq-q-tag">Vuelve a intentarlo</span>' : '') + (cur.hard ? '<span class="nq-q-tag hard">🔥 Nivel difícil · opciones parecidas</span>' : '') + '</div>' : '') +
        '<div class="nq-q-lbl">' + (opts(set).answerWith === 'term' ? 'Normativa' : 'Término') + '</div>' +
        '<div class="nq-q-prompt">' + esc(cur.prompt) + '</div>' +
        body +
        '<div class="nq-q-foot">' + foot + '</div>' +
      '</div>';
  }

  /* ---------- PROBAR ---------- */
  function tsStart(){
    const st = study, set = st.set, o = opts(set);
    let idxs = shuffle(pool(set));
    const n = o.testN > 0 ? Math.min(o.testN, idxs.length) : idxs.length;
    idxs = idxs.slice(0, n);
    st.questions = idxs.map(i => {
      const q = qa(set, i);
      if(o.testTF && Math.random() < 0.35){
        const truth = Math.random() < 0.5;
        let shown = q.answer;
        if(!truth){
          const alts = makeChoices(set, i).filter(c => c !== q.answer);
          if(alts.length) shown = alts[0];
        }
        return { i, type: 'tf', prompt: q.prompt, shown, answer: shown === q.answer, correctText: q.answer };
      }
      const hard = isHard(set, tstate(set, i).s);
      return { i, type: 'mc', hard, prompt: q.prompt, choices: hard ? hardChoices(set, i) : makeChoices(set, i), answer: q.answer };
    });
    st.ans = {};
    st.phase = 'doing';
    renderStudy();
    $ov().scrollTop = 0;
  }
  function tsCorrect(q, a){
    if(a === undefined) return false;
    return q.type === 'mc' ? q.choices[a] === q.answer : a === q.answer;
  }
  function tsSubmit(){
    const st = study;
    st.phase = 'result';
    st.questions.forEach((q, k) => {
      const ok = tsCorrect(q, st.ans[k]);
      const prev = tstate(st.set, q.i);
      setT(st.set, q.i, { seen: true, s: ok ? Math.max(prev.s, 1) : Math.min(prev.s, 1) });
    });
    renderStudy();
    $ov().scrollTop = 0;
  }
  function renderTest(){
    const st = study, set = st.set, o = opts(set);
    if(st.phase === 'config'){
      const n = set.terms.length;
      const counts = [5, 10, 20].filter(x => x < pool(set).length);
      return studyHeader('Probar', true) +
        '<div class="nq-sum"><div class="nq-sum-title">Prepara tu prueba</div>' +
        '<div class="nq-sum-sub">Pon a prueba lo que sabes de «' + esc(set.title) + '» (' + n + ' términos).</div>' +
        '<div class="nq-cfg-row"><span>Preguntas</span><select class="nq-select" data-opt="testN">' +
          counts.map(c => '<option value="' + c + '"' + (o.testN === c ? ' selected' : '') + '>' + c + '</option>').join('') +
          '<option value="0"' + (!counts.includes(o.testN) ? ' selected' : '') + '>Todas (' + pool(set).length + ')</option></select></div>' +
        '<div class="nq-cfg-row"><span>Incluir verdadero / falso</span><label class="nq-toggle"><input type="checkbox" data-opt="testTF"' + (o.testTF ? ' checked' : '') + '><span></span></label></div>' +
        '<div class="nq-sum-actions" style="margin-top:24px"><button class="nq-btn block" data-act="test-start">Empezar prueba</button></div></div>';
    }
    const total = st.questions.length;
    if(st.phase === 'doing'){
      const answered = Object.keys(st.ans).length;
      return studyHeader(answered + ' / ' + total, true) +
        '<div class="nq-pbar"><i style="width:' + (answered / total * 100) + '%"></i></div>' +
        st.questions.map((q, k) => tsQuestion(q, k, false)).join('') +
        '<div class="nq-sum-actions" style="margin-top:6px"><button class="nq-btn block" data-act="test-submit">Enviar prueba' + (answered < total ? ' (' + (total - answered) + ' sin responder)' : '') + '</button></div>';
    }
    const ok = st.questions.filter((q, k) => tsCorrect(q, st.ans[k])).length;
    const pct = Math.round(ok / total * 100);
    const r = 40, c = 2 * Math.PI * r;
    const col = pct >= 80 ? 'var(--green)' : pct >= 50 ? 'var(--amber)' : 'var(--orange)';
    return studyHeader('Resultado', false) +
      '<div class="nq-score"><svg viewBox="0 0 96 96"><circle cx="48" cy="48" r="' + r + '" fill="none" stroke="var(--line)" stroke-width="8"/>' +
        '<circle cx="48" cy="48" r="' + r + '" fill="none" stroke="' + col + '" stroke-width="8" stroke-linecap="round" stroke-dasharray="' + (c * pct / 100).toFixed(2) + ' ' + c.toFixed(2) + '" transform="rotate(-90 48 48)"/>' +
        '<text x="48" y="55" text-anchor="middle">' + pct + '%</text></svg>' +
        '<div><div class="nq-sum-title" style="margin-bottom:4px">' + (pct === 100 ? '¡Perfecto!' : pct >= 80 ? '¡Muy bien!' : pct >= 50 ? 'Vas por buen camino' : 'Sigue practicando') + '</div>' +
        '<div class="nq-sum-sub" style="margin:0"><span class="nq-c-green">' + ok + ' correctas</span> · <span class="nq-c-orange">' + (total - ok) + ' incorrectas</span></div></div></div>' +
      '<div class="nq-sum-actions" style="margin-bottom:22px"><button class="nq-btn block" data-act="restart">Nueva prueba</button>' +
        (ok < total ? '<button class="nq-btn ghost block" data-act="goto-learn">Practicar con Aprender</button>' : '') +
        '<button class="nq-btn ghost block" data-act="close">Volver a la unidad</button></div>' +
      st.questions.map((q, k) => tsQuestion(q, k, true)).join('');
  }
  function tsQuestion(q, k, review){
    const st = study, a = st.ans[k], total = st.questions.length;
    const lbl = opts(st.set).answerWith === 'term' ? 'Normativa' : 'Término';
    let body;
    if(q.type === 'mc'){
      body = '<div class="nq-opts">' + q.choices.map((c, j) => {
        let cls = '', icon = '<span class="k">' + (j + 1) + '</span>';
        if(review){
          if(c === q.answer){ cls = a === j ? 'correct' : 'reveal'; icon = I.check; }
          else if(a === j){ cls = 'wrong'; icon = I.x; }
          else cls = 'dim';
        } else if(a === j) cls = 'sel';
        return '<button class="nq-opt ' + cls + '" data-act="ts-pick" data-q="' + k + '" data-v="' + j + '"' + (review ? ' disabled' : '') + '>' + icon + '<span>' + esc(c) + '</span></button>';
      }).join('') + '</div>';
    } else {
      const btn = (v, text) => {
        let cls = '';
        if(review){
          if(v === q.answer) cls = a === v ? 'correct' : 'reveal';
          else if(a === v) cls = 'wrong';
          else cls = 'dim';
        } else if(a === v) cls = 'sel';
        return '<button class="nq-opt ' + cls + '" data-act="ts-pick" data-q="' + k + '" data-v="' + v + '"' + (review ? ' disabled' : '') + ' style="justify-content:center">' + text + '</button>';
      };
      body = '<div class="nq-test-tf-def">' + esc(q.shown) + '</div><div class="nq-tf">' + btn(true, 'Verdadero') + btn(false, 'Falso') + '</div>' +
        (review && !q.answer ? '<div class="nq-answer-box good" style="margin-top:12px"><small>Respuesta correcta</small>' + esc(q.correctText) + '</div>' : '');
    }
    const status = review ? (tsCorrect(q, a) ? '<span class="nq-c-green">Correcta</span>' : '<span class="nq-c-orange">' + (a === undefined ? 'Sin responder' : 'Incorrecta') + '</span>') : (q.type === 'tf' ? 'Verdadero o falso' : 'Elige la respuesta');
    return '<div class="nq-test-q"><div class="nq-test-head"><span>' + lbl + (q.hard ? ' · <span class="nq-c-orange">🔥 Difícil</span>' : '') + '</span><span>' + status + ' · ' + (k + 1) + ' de ' + total + '</span></div>' +
      '<div class="nq-test-prompt">' + esc(q.prompt) + '</div>' + body + '</div>';
  }

  /* ---------- COMBINAR ---------- */
  function mtInit(set){
    const idxs = shuffle(pool(set)).slice(0, 6);
    const tiles = shuffle(idxs.flatMap(i => [{ i, text: set.terms[i][0] }, { i, text: set.terms[i][1] }]));
    return { mode: 'match', set, tiles, sel: null, gone: [], bad: [], start: 0, end: 0 };
  }
  function stopMatchTimer(){ if(matchTimer){ clearInterval(matchTimer); matchTimer = null; } }
  function mtTime(st){ return ((st.end || Date.now()) - st.start) / 1000; }
  function renderMatch(){
    const st = study;
    if(st.end){
      const t = mtTime(st);
      const p = sp(st.set);
      const best = p.bestMatch;
      return studyHeader('Combinar', true) +
        '<div class="nq-sum"><div class="nq-sum-emoji">⚡</div><div class="nq-sum-title">¡' + t.toFixed(1) + ' segundos!</div>' +
        '<div class="nq-sum-sub">' + (st.newRecord ? '¡Nuevo récord personal!' : 'Tu récord es de ' + best.toFixed(1) + ' s. ¿Puedes batirlo?') + '</div>' +
        '<div class="nq-sum-actions"><button class="nq-btn block" data-act="restart">Jugar otra vez</button>' +
        '<button class="nq-btn ghost block" data-act="close">Volver a la unidad</button></div></div>';
    }
    return studyHeader('Combinar', true) +
      '<div class="nq-match-time" id="nqMatchTime">' + (st.start ? mtTime(st).toFixed(1) : '0.0') + ' s</div>' +
      '<div class="nq-match">' + st.tiles.map((tl, k) =>
        '<button class="nq-tile' + (st.gone.includes(k) ? ' gone' : '') + (st.sel === k ? ' sel' : '') + (st.bad.includes(k) ? ' bad' : '') + '" data-act="mt-pick" data-k="' + k + '">' + esc(tl.text) + '</button>'
      ).join('') + '</div>' +
      '<div class="nq-hint">Une cada término con su normativa lo más rápido que puedas</div>';
  }
  function mtPick(k){
    const st = study;
    if(!st || st.mode !== 'match' || st.end || st.gone.includes(k)) return;
    if(!st.start){
      st.start = Date.now();
      matchTimer = setInterval(() => {
        const el = document.getElementById('nqMatchTime');
        if(el && study === st) el.textContent = mtTime(st).toFixed(1) + ' s';
      }, 100);
    }
    st.bad = [];
    if(st.sel === null){ st.sel = k; renderStudy(); return; }
    if(st.sel === k){ st.sel = null; renderStudy(); return; }
    const a = st.tiles[st.sel], b = st.tiles[k];
    if(a.i === b.i){
      st.gone.push(st.sel, k);
      const i = a.i, prev = tstate(st.set, i);
      setT(st.set, i, { seen: true, s: Math.max(prev.s, 1) });
      st.sel = null;
      if(st.gone.length === st.tiles.length){
        st.end = Date.now();
        stopMatchTimer();
        const p = sp(st.set), t = mtTime(st);
        st.newRecord = !p.bestMatch || t < p.bestMatch;
        if(st.newRecord){ p.bestMatch = t; save(); }
      }
    } else {
      st.bad = [st.sel, k];
      st.sel = null;
      setTimeout(() => { if(study === st && st.bad.length){ st.bad = []; renderStudy(); } }, 450);
    }
    renderStudy();
  }

  /* ============================================================
     EVENTOS
     ============================================================ */
  function onAction(act, el, e){
    const set = view.setId ? getSet(view.setId) : null;
    const sset = study ? study.set : set;
    const i = el.dataset.i != null ? +el.dataset.i : null;
    switch(act){
      case 'retry-load': loadError = false; render(); load(); break;
      case 'new-set': view.sheet = { type: 'new-set' }; render(); break;
      case 'rename-set': view.sheet = { type: 'rename', setId: set.id }; render(); break;
      case 'root-sheet-close': view.sheet = null; render(); break;
      case 'root-sheet-bg': if(e.target === el){ view.sheet = null; render(); } break;
      case 'del-set': deleteSet(set); break;
      case 'edit-card': view.editing = set.ids[i]; render(); break;
      case 'toggle-edit': view.editMode = !view.editMode; view.editing = null; view.adding = false; render(); break;
      case 'open-add': view.adding = true; render(); break;
      case 'close-add': view.adding = false; render(); break;
      case 'regen': regenTrampas(set, i); break;
      case 'cancel-edit': view.editing = null; render(); break;
      case 'del-card': deleteCard(set, i); break;
      case 'open-set': view = { name: 'set', setId: el.dataset.set }; render(); document.getElementById('app').scrollTop = 0; break;
      case 'library': view = { name: 'library' }; render(); break;
      case 'flip-c': el.classList.toggle('flipped'); break;
      case 'fc-at': e.stopPropagation(); openStudy('fc', set, { start: i }); break;
      case 'study': openStudy(el.dataset.mode, sset); break;
      case 'filter': {
        view.filter = view.filter === el.dataset.f ? null : el.dataset.f;
        render();
        const h = document.getElementById('nqTermsHead');
        if(h && view.filter) h.scrollIntoView({ behavior: 'smooth', block: 'start' });
        break;
      }
      case 'reset':
        uiConfirm('¿Reiniciar tu avance en este tema?\n\nSe perderá el progreso de todas sus tarjetas.').then(ok => {
          if(!ok) return;
          sp(set).t = {}; sp(set).resetU = Date.now(); save(); view.filter = null; render();
        });
        break;
      case 'speak': speak(sset.terms[i][0] + '. ' + sset.terms[i][1]); break;
      case 'star':
        toggleStar(sset, i);
        if(study) renderStudy(); else render();
        break;
      case 'close': closeStudy(); break;
      case 'close-force': closeStudy(); break;
      case 'settings': study.sheet = 'settings'; renderStudy(); break;
      case 'sheet-close': study.sheet = null; renderStudy(); break;
      case 'sheet-bg': if(e.target === el){ study.sheet = null; renderStudy(); } break;
      case 'restart': restartStudy(); break;
      case 'goto-learn': openStudy('learn', sset); break;
      case 'speak-fc': {
        const idx = study.order[study.pos];
        const defFirst = opts(sset).fcFront === 'def';
        const showingTerm = defFirst ? study.flipped : !study.flipped;
        speak(sset.terms[idx][showingTerm ? 0 : 1]);
        break;
      }
      case 'fc-mark': fcMark(el.dataset.know === '1'); break;
      case 'fc-undo': fcUndo(); break;
      case 'fc-shuffle': opts(sset).shuffle = !opts(sset).shuffle; sp(sset).optU = Date.now(); save(); restartStudy(); break;
      case 'fc-again-learning': {
        const learning = study.learning.slice();
        study = { mode: 'fc', set: sset, order: opts(sset).shuffle ? shuffle(learning) : learning, pos: 0, flipped: false, known: [], learning: [], hist: [], done: false };
        renderStudy();
        break;
      }
      case 'ln-pick': lnAnswer(+el.dataset.k); break;
      case 'ln-skip': lnAnswer(null); break;
      case 'ln-written-go': { const inp = document.getElementById('nqWritten'); lnAnswer(inp ? inp.value : ''); break; }
      case 'ln-override': lnOverride(); break;
      case 'learn-continue': lnContinue(); break;
      case 'learn-reset':
        pool(sset).forEach(k => setT(sset, k, { s: 0 }));
        openStudy('learn', sset);
        break;
      case 'test-start': tsStart(); break;
      case 'test-submit': tsSubmit(); break;
      case 'ts-pick': {
        const v = el.dataset.v;
        study.ans[+el.dataset.q] = v === 'true' ? true : v === 'false' ? false : +v;
        const y = $ov().scrollTop;
        renderStudy();
        $ov().scrollTop = y;
        break;
      }
      case 'mt-pick': mtPick(+el.dataset.k); break;
      case 'srs-start':
        study = srsInit();
        $ov().classList.remove('hidden'); $ov().scrollTop = 0;
        renderStudy();
        break;
      case 'srs-show': srsShow(); break;
      case 'reminder': openReminderSheet(); break;
      case 'srs-rate': srsRate(+el.dataset.r); break;
      case 'srs-speak': { e.stopPropagation(); const it = srsCur(); if(it) speak(it.set.terms[it.i][study.shown ? 1 : 0]); break; }
    }
  }

  function onClick(e){
    const el = e.target.closest('[data-act]');
    if(!el || el.disabled) return;
    // Los botones dentro de la ficha del carrusel no deben girarla.
    if(el.dataset.act === 'flip-c' && e.target.closest('button')) return;
    onAction(el.dataset.act, el, e);
  }

  function onChange(e){
    const el = e.target;
    if(el.dataset.change === 'sort'){ view.sort = el.value; render(); return; }
    if(el.dataset.opt && study){
      const o = opts(study.set);
      const key = el.dataset.opt;
      if(el.type === 'checkbox') o[key] = el.checked;
      else if(key === 'testN') o[key] = +el.value;
      else o[key] = el.value;
      sp(study.set).optU = Date.now();
      save();
      if(study.mode === 'test' && study.phase === 'config') return;
      const keepSheet = study.sheet;
      openStudy(study.mode, study.set);
      study.sheet = keepSheet;
      renderStudy();
    }
  }

  function onKey(e){
    if(!study){
      if(e.key === 'Escape' && (view.sheet || view.editing)){ view.sheet = null; view.editing = null; render(); }
      return;
    }
    const tag = (e.target.tagName || '').toLowerCase();
    if(e.key === 'Escape'){
      if(study.sheet){ study.sheet = null; renderStudy(); } else tryClose();
      return;
    }
    if(study.sheet) return;
    if(tag === 'input' || tag === 'select' || tag === 'textarea') return;
    if(study.mode === 'fc' && !study.done){
      if(e.key === ' ' || e.key === 'ArrowUp' || e.key === 'ArrowDown'){ e.preventDefault(); fcFlip(); }
      else if(e.key === 'ArrowRight'){ fcMark(true); }
      else if(e.key === 'ArrowLeft'){ fcMark(false); }
    } else if(study.mode === 'srs'){
      if(!study.shown && (e.key === ' ' || e.key === 'Enter')){ e.preventDefault(); srsShow(); }
      else if(study.shown && /^[1-4]$/.test(e.key)){ srsRate(+e.key - 1); }
    } else if(study.mode === 'learn'){
      if(study.cur && !study.answered && study.cur.type === 'mc' && /^[1-4]$/.test(e.key)){
        const k = +e.key - 1;
        if(k < study.cur.choices.length) lnAnswer(k);
      } else if(e.key === 'Enter' && (study.summary || (study.answered && !study.answered.correct))){
        e.preventDefault(); lnContinue();
      }
    }
  }

  function init(){
    const root = $root(), ov = $ov();
    if(!root || !ov) return;
    root.addEventListener('click', onClick);
    root.addEventListener('change', onChange);
    root.addEventListener('submit', onRootSubmit);
    ov.addEventListener('click', e => {
      const el = e.target.closest('[data-act]');
      if(el && el.dataset.act === 'close'){ e.preventDefault(); tryClose(); return; }
      onClick(e);
    });
    ov.addEventListener('change', onChange);
    ov.addEventListener('submit', e => {
      if(e.target.dataset.submit === 'ln-written'){
        e.preventDefault();
        const inp = document.getElementById('nqWritten');
        lnAnswer(inp ? inp.value : '');
      }
    });
    document.addEventListener('keydown', onKey);
    render();
    load();
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  function startReview(){
    if(study) return true;
    if(!srsItems().due.length) return false;
    study = srsInit();
    $ov().classList.remove('hidden'); $ov().scrollTop = 0;
    renderStudy();
    return true;
  }
  return { render, load, close: closeStudy, startReview, addFailedQuestion, seedFailed };
})();
