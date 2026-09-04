// Legislación — lógica de la app
const SAMPLE_QUESTIONS = [
  { art:"Art. 81.2", general:false, failCount:3, avgTime:"8s", difficulty:"media",
    q:"Según el artículo 81.2, ¿qué naturaleza tienen los convenios interadministrativos por defecto?",
    options:["Indefinida", "4 años prorrogables", "1 año renovable tácitamente", "Coincide con la legislatura"],
    correct:1,
    explain:"El art. 81.2 fija una duración determinada de <b>4 años</b>, prorrogable por acuerdo expreso, salvo que la ley específica del convenio prevea otra cosa." },
  { art:"General", general:true, failCount:1, avgTime:"5s", difficulty:"facil",
    q:"¿Qué principio NO figura entre los principios generales de actuación de las Administraciones Públicas?",
    options:["Buena fe y confianza legítima", "Responsabilidad por la gestión pública", "Beneficio económico del órgano actuante", "Racionalización y agilidad de procedimientos"],
    correct:2,
    explain:"El <b>beneficio económico del órgano actuante</b> no es un principio recogido en la norma; los demás sí aparecen listados expresamente." },
  { art:"Art. 47.1.b", general:false, failCount:6, avgTime:"11s", difficulty:"dificil",
    q:"Un acto administrativo dictado prescindiendo total y absolutamente del procedimiento es:",
    options:["Anulable", "Nulo de pleno derecho", "Válido si no se recurre", "Rectificable de oficio sin más trámite"],
    correct:1,
    explain:"El art. 47.1.b califica estos actos como <b>nulos de pleno derecho</b>, a diferencia de otros vicios que solo generan anulabilidad." },
  { art:"Art. 3.1", general:false, failCount:0, avgTime:"4s", difficulty:"facil",
    q:"¿Cuál de estos es un principio de actuación recogido en el artículo 3.1?",
    options:["Confidencialidad absoluta", "Servicio efectivo a los ciudadanos", "Centralización total de competencias", "Prioridad presupuestaria sobre la legalidad"],
    correct:1,
    explain:"El <b>servicio efectivo a los ciudadanos</b> encabeza la lista de principios generales del art. 3.1." }
];

const TOPIC_CATEGORIES = [
  { id:"normativa", name:"Normativa específica" },
  { id:"generales", name:"Conocimientos generales" }
];

const FLAG_ANDALUCIA = '<svg viewBox="0 0 30 20" xmlns="http://www.w3.org/2000/svg"><rect width="30" height="20" fill="#00954C"/><rect y="6.67" width="30" height="6.67" fill="#fff"/></svg>';
const FLAG_MADRID = '<svg viewBox="0 0 30 20" xmlns="http://www.w3.org/2000/svg"><rect width="30" height="20" fill="#C60B1E"/><g fill="#fff">' +
  [0,1,2,3,4,5,6].map(i => { const a = (-70 + i*23.3) * Math.PI/180, cx=15+9*Math.cos(a), cy=8+7*Math.sin(a); return '<circle cx="'+cx.toFixed(1)+'" cy="'+cy.toFixed(1)+'" r="1"/>'; }).join('') +
  '</g></svg>';

const REGIONS = {
  andalucia: {
    id:"andalucia", name:"Andalucía", flag: FLAG_ANDALUCIA,
    topics: [
      { id:"ley39", category:"normativa", name:"Ley 39/2015", desc:"Procedimiento administrativo común", qIndexes:[2], fails:9, enabled:true },
      { id:"ley40", category:"normativa", name:"Ley 40/2015", desc:"Régimen jurídico del sector público", qIndexes:[0,3], fails:14, enabled:true },
      { id:"lcsp", category:"normativa", name:"Ley de Contratos del Sector Público", desc:"Procedimientos de contratación", qIndexes:[], fails:0, enabled:false },
      { id:"ebep", category:"normativa", name:"Estatuto Básico del Empleado Público", desc:"Derechos y deberes del personal", qIndexes:[], fails:0, enabled:false },
      { id:"principios", category:"generales", name:"Principios generales", desc:"Actuación de las Administraciones Públicas", qIndexes:[1], fails:8, enabled:true },
      { id:"ce", category:"generales", name:"Constitución Española", desc:"Título preliminar y derechos fundamentales", qIndexes:[], fails:0, enabled:false }
    ]
  },
  madrid: {
    id:"madrid", name:"Comunidad de Madrid", flag: FLAG_MADRID,
    topics: [
      { id:"ebep-cm", category:"normativa", name:"Función Pública CM", desc:"Ley de Función Pública de la Comunidad de Madrid", qIndexes:[], fails:0, enabled:true },
      { id:"gobierno-cm", category:"normativa", name:"Ley de Gobierno CM", desc:"Gobierno y Administración de la Comunidad de Madrid", qIndexes:[], fails:0, enabled:false },
      { id:"principios", category:"generales", name:"Principios generales", desc:"Actuación de las Administraciones Públicas", qIndexes:[1], fails:8, enabled:true },
      { id:"ce", category:"generales", name:"Constitución Española", desc:"Título preliminar y derechos fundamentales", qIndexes:[], fails:0, enabled:false }
    ]
  }
};

let currentRegion = "andalucia";
let TOPICS = REGIONS[currentRegion].topics;

const ARTICLES = {
  ley39: ["Art. 1 - Objeto y ámbito de aplicación", "Art. 21 - Obligación de resolver", "Art. 47 - Nulidad de pleno derecho"],
  ley40: ["Art. 3 - Principios generales de actuación", "Art. 81 - Convenios interadministrativos"],
  lcsp: [],
  ebep: [],
  "ebep-cm": [],
  "gobierno-cm": [],
  principios: ["Art. 3.1 - Principios generales de actuación"],
  ce: []
};

const COUNT_OPTIONS = [10, 20, 30, 40];
const TIME_OPTIONS = [15, 30, 45, 60];
const MINUTOS_OPTIONS = [null, 10, 20, 30, 45, 60];
const PREGUNTAS_OPTIONS = [null, 10, 20, 30, 40];
const DIFICULTAD_OPTIONS = ["aleatoria", "facil", "media", "dificil"];
const DIFICULTAD_LABELS = { aleatoria:"Aleatoria", facil:"Fácil", media:"Media", dificil:"Difícil" };
const AYUDA_OPTIONS = ["ocultar", "mostrar"];
const AYUDA_LABELS = { ocultar:"Ocultar tema", mostrar:"Mostrar tema" };
const REPASO_OPTIONS = [false, true];

const HISTORY = [
  { id:"h1", date:"Hace 1 hora", type:"examen", title:"Examen", nota:"7,50", time:"14:20", ok:15, bad:5, pending:0, review:null },
  { id:"h2", date:"Hace 23 horas", type:"estudio", title:"Estudio", nota:"9,00", time:"6:40", ok:18, bad:2, pending:0, review:null },
  { id:"h3", date:"Hace 3 días", type:"fallos", title:"Fallos", nota:"3,27", time:"9:12", ok:18, bad:12, pending:13, review:null }
];
let lastFinishedReviewId = null;

const ICONS = {
  estudio: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 7v14"/><path d="M16 12h2"/><path d="M16 8h2"/><path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"/><path d="M6 12h2"/><path d="M6 8h2"/></svg>',
  fallos: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="m15 7-6 6"/><path d="M20 17H6.5a1 1 0 000 5H19a1 1 0 001-1V3a1 1 0 00-1-1H6.5A2.5 2.5 0 004 4.5v15"/><path d="m9 7 6 6"/></svg>',
  examen: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M13.4 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7.4"/><path d="M2 6h4"/><path d="M2 10h4"/><path d="M2 14h4"/><path d="M2 18h4"/><path d="M21.378 5.626a1 1 0 1 0-3.004-3.004l-5.01 5.012a2 2 0 0 0-.506.854l-.837 2.87a.5.5 0 0 0 .62.62l2.87-.837a2 2 0 0 0 .854-.506z"/></svg>',
  simulacro: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M16 22h2a2 2 0 0 0 2-2V8a2.4 2.4 0 0 0-.706-1.706l-3.588-3.588A2.4 2.4 0 0 0 14 2H6a2 2 0 0 0-2 2v2.85"/><path d="M14 2v5a1 1 0 0 0 1 1h5"/><path d="M8 14v2.2l1.6 1"/><circle cx="8" cy="16" r="6"/></svg>',
  clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8"/><line x1="12" y1="12" x2="12" y2="7.8"/><line x1="12" y1="12" x2="15" y2="13.5"/></svg>',
  ok: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8"/><polyline points="8.3,12.5 11,15.2 16,9.3"/></svg>',
  bad: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8"/><line x1="9.3" y1="9.3" x2="14.7" y2="14.7"/><line x1="14.7" y1="9.3" x2="9.3" y2="14.7"/></svg>',
  pending: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-dasharray="2.8 3.2"><circle cx="12" cy="12" r="8"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="5,13 10,18 19,6"/></svg>',
  cross: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/></svg>',
  seal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="7.2"/><circle cx="12" cy="12" r="3"/></svg>',
  warn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 2 21h20L12 3Z"/><line x1="12" y1="9.5" x2="12" y2="14"/><circle cx="12" cy="17" r="0.9" fill="currentColor" stroke="none"/></svg>',
  timer: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><line x1="10" y1="2" x2="14" y2="2"/><line x1="12" y1="2" x2="12" y2="5"/><circle cx="12" cy="13.5" r="8"/><line x1="12" y1="13.5" x2="12" y2="9"/><line x1="12" y1="13.5" x2="15" y2="14.8"/></svg>',
  doc: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3.5h9L20 8v12.5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-16a1 1 0 0 1 1-1Z"/><path d="M14.5 3.5V8H19"/><line x1="8" y1="12.5" x2="16" y2="12.5"/><line x1="8" y1="16" x2="16" y2="16"/></svg>',
  chart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="20" x2="19" y2="20"/><rect x="6" y="14" width="3.4" height="6"/><rect x="10.3" y="9.5" width="3.4" height="10.5"/><rect x="14.6" y="5" width="3.4" height="15"/></svg>',
  info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8"/><line x1="12" y1="11" x2="12" y2="16"/><circle cx="12" cy="8" r="0.9" fill="currentColor" stroke="none"/></svg>',
  brain: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="7" cy="6.5" r="2.1"/><circle cx="17" cy="6.5" r="2.1"/><circle cx="7" cy="17.5" r="2.1"/><circle cx="17" cy="17.5" r="2.1"/><circle cx="12" cy="12" r="2.1"/><line x1="8.7" y1="7.6" x2="10.4" y2="10.6"/><line x1="15.3" y1="7.6" x2="13.6" y2="10.6"/><line x1="8.7" y1="16.4" x2="10.4" y2="13.4"/><line x1="15.3" y1="16.4" x2="13.6" y2="13.4"/></svg>',
  chevron: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="9,6 15,12 9,18"/></svg>'
};

let quizState = { mode:null, index:0, correctCount:0, answered:false };
let ACTIVE_QUESTIONS = SAMPLE_QUESTIONS;
let configState = { mode:null, topics:new Set(), count:20, time:30, minutos:null, preguntas:null, dificultad:'aleatoria', ayuda:'ocultar', repaso:false };
let expandedCategories = new Set(['generales']);
let timerInterval = null;

/* ---------- landing / region switching ---------- */
function updateLandingFlag(){
  const r = REGIONS[currentRegion];
  const switchFlag = document.getElementById('landingSwitchFlag');
  const enterFlag = document.getElementById('landingEnterFlag');
  const regionName = document.getElementById('landingRegionName');
  const headerFlag = document.getElementById('headerRegionFlag');
  if(switchFlag) switchFlag.innerHTML = r.flag;
  if(enterFlag) enterFlag.innerHTML = r.flag;
  if(regionName) regionName.textContent = r.name;
  if(headerFlag) headerFlag.innerHTML = r.flag;
}
let pendingRegion = currentRegion;
function renderRegionGrid(){
  const list = document.getElementById('regionList');
  list.innerHTML = '';
  Object.values(REGIONS).forEach(r => {
    const row = document.createElement('div');
    row.className = 'region-row' + (r.id === pendingRegion ? ' selected' : '');
    row.setAttribute('role','button'); row.setAttribute('tabindex','0');
    row.innerHTML =
      '<span class="landing-flag">' + r.flag + '</span>' +
      '<span class="region-name">' + r.name + '</span>' +
      '<span class="region-check">' + ICONS.check + '</span>';
    row.onclick = () => { pendingRegion = r.id; renderRegionGrid(); };
    row.onkeydown = (e) => { if(e.key === 'Enter'){ pendingRegion = r.id; renderRegionGrid(); } };
    list.appendChild(row);
  });
}
function openRegionSheet(){
  pendingRegion = currentRegion;
  renderRegionGrid();
  document.getElementById('regionSheetOverlay').classList.add('show');
}
function closeRegionSheet(){
  document.getElementById('regionSheetOverlay').classList.remove('show');
}
function confirmRegionSelect(){
  selectRegion(pendingRegion);
}
function selectRegion(id){
  currentRegion = id;
  TOPICS = REGIONS[id].topics;
  configState.topics = new Set(TOPICS.filter(t => t.enabled).map(t => t.id));
  updateLandingFlag();
  renderTopicStats();
  closeRegionSheet();
}
function enterApp(screenId){
  document.getElementById('landingScreen').classList.add('hidden');
  showScreen(screenId);
}
function backToLanding(){
  document.getElementById('landingScreen').classList.remove('hidden');
}

/* ---------- topic stats (current region only) ---------- */
function renderTopicStats(){
  const el = document.getElementById('topicStatsList');
  el.innerHTML = '';
  TOPICS.forEach(t => {
    const row = document.createElement('div');
    row.className = 'topic-stat-row';
    row.innerHTML =
      '<div class="topic-stat-name">' + t.name + '</div>' +
      '<div class="topic-stat-fails">' + t.fails + ' fallos</div>';
    el.appendChild(row);
  });
}


function renderHistory(){
  const el = document.getElementById('historyList');
  el.innerHTML = '';
  HISTORY.forEach(h => {
    const dateEl = document.createElement('div');
    dateEl.className = 'hist-date';
    dateEl.textContent = h.date;
    el.appendChild(dateEl);

    const item = document.createElement('div');
    item.className = 'hist-item t-' + h.type;
    item.setAttribute('role','button');
    item.setAttribute('tabindex','0');
    item.innerHTML =
      '<div class="hist-icon">' + ICONS[h.type] + '</div>' +
      '<div class="hist-content">' +
        '<div class="hist-top">' +
          '<div class="hist-title">' + h.title + '</div>' +
          '<div class="hist-score">Nota <b>' + h.nota + '</b></div>' +
        '</div>' +
        '<div class="hist-bottom">' +
          '<div class="hist-meta">' + ICONS.clock + h.time + '</div>' +
          '<div class="hist-counts">' +
            '<span class="c-ok">' + ICONS.ok + h.ok + '</span>' +
            '<span class="c-bad">' + ICONS.bad + h.bad + '</span>' +
            '<span class="c-pending">' + ICONS.pending + h.pending + '</span>' +
          '</div>' +
        '</div>' +
      '</div>';
    item.onclick = () => {
      if(h.review){ openReview(h.review, h.title + ' · Nota ' + h.nota); }
      else { alert('Este test no tiene datos de corrección guardados.'); }
    };
    item.onkeydown = (e) => { if(e.key === 'Enter') item.onclick(); };
    el.appendChild(item);
  });
}

/* ---------- navigation ---------- */
function showScreen(id){
  if(id !== 'screen-quiz'){ clearInterval(timerInterval); }
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  document.getElementById('navNormativas').classList.toggle('active', id === 'screen-normativas');
  document.getElementById('navHome').classList.toggle('active', id === 'screen-home');
  document.getElementById('navStats').classList.toggle('active', id === 'screen-stats');
}
function showHome(){ showScreen('screen-home'); }
function openOverlay(id){
  document.getElementById(id).classList.add('active');
}

/* ---------- config screen (estudio / examen / simulacro) ---------- */
function openConfig(mode){
  configState.mode = mode;
  if((mode === 'estudio' || mode === 'examen') && configState.topics.size === 0){
    TOPICS.forEach(t => { if(t.enabled) configState.topics.add(t.id); });
  }
  document.getElementById('screen-config').setAttribute('data-mode', mode);

  const titles = {
    estudio: 'Estudio',
    examen: 'Configura tu examen',
    simulacro: 'Configura tu simulacro'
  };
  const subs = {
    estudio: 'Selecciona uno o varios temas. El test se generará solo con preguntas de la legislación elegida.',
    examen: 'Elige los temas, cuántas preguntas quieres y de cuánto tiempo dispones.',
    simulacro: 'Preguntas de toda la legislación. Elige cuántas quieres y de cuánto tiempo dispones.'
  };
  document.getElementById('configTitle').textContent = titles[mode];
  document.getElementById('configSub').textContent = subs[mode];

  document.getElementById('configTopicsBlock').style.display = (mode === 'estudio' || mode === 'examen') ? 'block' : 'none';
  document.getElementById('configParamsBlock').style.display = (mode === 'examen' || mode === 'simulacro') ? 'block' : 'none';
  document.getElementById('configTimeBlock').style.display = (mode === 'examen' || mode === 'simulacro') ? 'block' : 'none';
  document.getElementById('configSettingsBlock').style.display = (mode === 'estudio') ? 'block' : 'none';
  document.getElementById('configSub').style.display = (mode === 'estudio') ? 'none' : 'block';

  renderSettings();
  renderTemas();
  renderParamOptions();
  showScreen('screen-home');
  openOverlay('screen-config');
}

/* ---------- ajustes (minutos / preguntas / dificultad / ayuda / repaso) ---------- */
function renderSettings(){
  if(configState.mode !== 'estudio') return;
  const rows = [
    { key:'minutos', icon: ICONS.timer, label:'Minutos',
      options: MINUTOS_OPTIONS.map(v => ({ value:v, label: v ? (v + ' min') : 'Sin límite' })) },
    { key:'preguntas', icon: ICONS.doc, label:'Preguntas',
      options: PREGUNTAS_OPTIONS.map(v => ({ value:v, label: v ? (v + ' preguntas') : 'Sin límite' })) },
    { key:'dificultad', icon: ICONS.chart, label:'Dificultad',
      options: DIFICULTAD_OPTIONS.map(v => ({ value:v, label: DIFICULTAD_LABELS[v] })) },
    { key:'ayuda', icon: ICONS.info, label:'Ayuda',
      options: AYUDA_OPTIONS.map(v => ({ value:v, label: AYUDA_LABELS[v] })) },
    { key:'repaso', icon: ICONS.brain, label:'Repaso Inteligente',
      options: REPASO_OPTIONS.map(v => ({ value:v, label: v ? 'Sí' : 'No' })) }
  ];
  const el = document.getElementById('settingsList');
  el.innerHTML = '';
  rows.forEach(r => {
    const current = r.options.find(o => o.value === configState[r.key]);
    const row = document.createElement('div');
    row.className = 'settings-row';
    row.setAttribute('role','button'); row.setAttribute('tabindex','0');
    row.innerHTML =
      '<span class="settings-row-icon">' + r.icon + '</span>' +
      '<span class="settings-row-label">' + r.label + '</span>' +
      '<span class="settings-row-value">' + (current ? current.label : '') + '</span>' +
      '<span class="settings-row-chevron">' + ICONS.chevron + '</span>';
    row.onclick = () => openSettingSheet(r.key, r.label, r.options);
    el.appendChild(row);
  });
}

/* ---------- hoja de selección (Minutos / Preguntas / Dificultad / Ayuda / Repaso) ---------- */
function openSettingSheet(key, label, options){
  document.getElementById('sheetTitle').textContent = label;
  const el = document.getElementById('sheetOptions');
  el.innerHTML = '';
  options.forEach(opt => {
    const row = document.createElement('div');
    const isSelected = configState[key] === opt.value;
    row.className = 'sheet-option' + (isSelected ? ' selected' : '');
    row.setAttribute('role','button'); row.setAttribute('tabindex','0');
    row.innerHTML = '<span>' + opt.label + '</span><span class="sheet-check">' + ICONS.check + '</span>';
    row.onclick = () => { configState[key] = opt.value; closeSettingSheet(); renderSettings(); };
    el.appendChild(row);
  });
  document.getElementById('sheetOverlay').classList.add('show');
}
function closeSettingSheet(){
  document.getElementById('sheetOverlay').classList.remove('show');
}

/* ---------- detalle de tema (artículos) — recuadro en la misma página ---------- */
function openTopicDetail(topicId){
  const t = TOPICS.find(x => x.id === topicId);
  if(!t) return;
  document.getElementById('topicDetailTitle').textContent = t.name;
  document.getElementById('topicDetailSub').textContent = t.desc;
  const list = ARTICLES[topicId] || [];
  const el = document.getElementById('articleList');
  el.innerHTML = '';
  if(!list.length){
    el.innerHTML = '<div class="article-empty">Aún no hay artículos añadidos en este tema.</div>';
  } else {
    list.forEach(label => {
      const row = document.createElement('div');
      row.className = 'article-row';
      row.setAttribute('role','checkbox'); row.setAttribute('aria-checked','false'); row.setAttribute('tabindex','0');
      row.innerHTML = '<span class="article-check">' + ICONS.check + '</span><span class="article-name">' + label + '</span>';
      row.onclick = () => {
        const nowSelected = row.classList.toggle('selected');
        row.setAttribute('aria-checked', nowSelected ? 'true' : 'false');
      };
      el.appendChild(row);
    });
  }
  document.getElementById('topicDetailOverlay').classList.add('show');
}
function closeTopicDetail(){
  document.getElementById('topicDetailOverlay').classList.remove('show');
}

function renderTemas(){
  const el = document.getElementById('temasList');
  el.innerHTML = '';
  TOPIC_CATEGORIES.forEach(cat => {
    const catTopics = TOPICS.filter(t => t.category === cat.id);
    const enabledTopics = catTopics.filter(t => t.enabled);
    const selectedCount = enabledTopics.filter(t => configState.topics.has(t.id)).length;
    const allSelected = enabledTopics.length > 0 && selectedCount === enabledTopics.length;
    const someSelected = selectedCount > 0 && !allSelected;
    const isExpanded = expandedCategories.has(cat.id);

    const catEl = document.createElement('div');
    catEl.className = 'topic-category' + (isExpanded ? ' expanded' : '');

    const head = document.createElement('div');
    head.className = 'topic-category-head';
    head.setAttribute('role','button'); head.setAttribute('tabindex','0');
    head.innerHTML =
      '<span class="topic-check' + (allSelected || someSelected ? ' indeterminate' : '') + '" role="checkbox" aria-checked="' + allSelected + '">' + ICONS.check + '</span>' +
      '<span class="topic-category-name">' + cat.name + '</span>' +
      '<span class="topic-category-chevron">' + ICONS.chevron + '</span>';
    head.querySelector('.topic-check').onclick = (e) => { e.stopPropagation(); toggleCategoryTopics(cat.id); };
    head.onclick = () => toggleCategoryExpand(cat.id);
    catEl.appendChild(head);

    const children = document.createElement('div');
    children.className = 'topic-category-children';
    catTopics.forEach((t,idx) => {
      const row = document.createElement('div');
      row.className = 'topic-row' + (t.enabled ? '' : ' disabled') + (configState.topics.has(t.id) ? ' selected' : '');
      row.setAttribute('role','checkbox');
      row.setAttribute('aria-checked', configState.topics.has(t.id) ? 'true' : 'false');
      if(t.enabled){ row.setAttribute('tabindex','0'); row.onclick = () => toggleTopic(t.id); }
      row.innerHTML =
        '<span class="topic-check">' + ICONS.check + '</span>' +
        '<span class="topic-text"><span class="topic-name">' + (idx+1) + ' - ' + t.name + '</span></span>' +
        '<span class="topic-row-chevron">' + ICONS.chevron + '</span>';
      children.appendChild(row);
      row.querySelector('.topic-row-chevron').onclick = (e) => { e.stopPropagation(); openTopicDetail(t.id); };
    });
    catEl.appendChild(children);
    el.appendChild(catEl);
  });
  updateConfigFooter();
}

function toggleCategoryExpand(id){
  if(expandedCategories.has(id)) expandedCategories.delete(id); else expandedCategories.add(id);
  renderTemas();
}

function toggleCategoryTopics(id){
  const ids = TOPICS.filter(t => t.category === id && t.enabled).map(t => t.id);
  const allSelected = ids.length > 0 && ids.every(tid => configState.topics.has(tid));
  ids.forEach(tid => allSelected ? configState.topics.delete(tid) : configState.topics.add(tid));
  renderTemas();
}

function toggleTopic(id){
  if(configState.topics.has(id)) configState.topics.delete(id); else configState.topics.add(id);
  renderTemas();
}

function toggleAllTopics(){
  const enabledIds = TOPICS.filter(t => t.enabled).map(t => t.id);
  const allSelected = enabledIds.length > 0 && enabledIds.every(id => configState.topics.has(id));
  enabledIds.forEach(id => allSelected ? configState.topics.delete(id) : configState.topics.add(id));
  renderTemas();
}

function renderParamOptions(){
  const countEl = document.getElementById('countOptions');
  countEl.innerHTML = '';
  COUNT_OPTIONS.forEach(n => {
    const b = document.createElement('span');
    b.className = 'param-opt' + (configState.count === n ? ' selected' : '');
    b.setAttribute('role','button'); b.setAttribute('tabindex','0');
    b.textContent = n + ' preguntas';
    b.onclick = () => { configState.count = n; renderParamOptions(); };
    countEl.appendChild(b);
  });

  const timeEl = document.getElementById('timeOptions');
  timeEl.innerHTML = '';
  TIME_OPTIONS.forEach(m => {
    const b = document.createElement('span');
    b.className = 'param-opt' + (configState.time === m ? ' selected' : '');
    b.setAttribute('role','button'); b.setAttribute('tabindex','0');
    b.textContent = m + ' min';
    b.onclick = () => { configState.time = m; renderParamOptions(); };
    timeEl.appendChild(b);
  });
  updateConfigFooter();
}

function updateConfigFooter(){
  const mode = configState.mode;
  const btn = document.getElementById('startConfigBtn');
  const needsTopics = (mode === 'estudio' || mode === 'examen');
  const topicsChosen = TOPICS.filter(t => configState.topics.has(t.id));

  if(needsTopics && topicsChosen.length === 0){
    btn.disabled = true;
    btn.textContent = mode === 'estudio' ? 'Iniciar test' : 'Selecciona un tema';
  }else{
    btn.disabled = false;
    if(mode === 'estudio'){
      const totalQ = topicsChosen.reduce((s,t) => s + t.qIndexes.length, 0);
      btn.disabled = totalQ === 0;
      btn.textContent = 'Iniciar test';
    } else if(mode === 'examen'){
      btn.textContent = 'Comenzar examen (' + configState.count + ' preguntas, ' + configState.time + ' min)';
    } else if(mode === 'simulacro'){
      btn.textContent = 'Comenzar simulacro (' + configState.count + ' preguntas, ' + configState.time + ' min)';
    }
  }

  if(mode === 'estudio' || mode === 'examen'){
    const enabledIds = TOPICS.filter(t => t.enabled).map(t => t.id);
    const allSelected = enabledIds.length > 0 && enabledIds.every(id => configState.topics.has(id));
    const sw = document.getElementById('selectAllSwitch');
    if(sw) sw.classList.toggle('on', allSelected);
    const selAllBtn = document.getElementById('selectAllBtn');
    if(selAllBtn) selAllBtn.setAttribute('aria-checked', allSelected ? 'true' : 'false');
  }
}

function buildQuestionsFromTopics(topicIdSet){
  const indexes = [];
  TOPICS.forEach(t => { if(topicIdSet.has(t.id)) indexes.push(...t.qIndexes); });
  const unique = [...new Set(indexes)].sort((a,b) => a-b);
  return unique.map(i => SAMPLE_QUESTIONS[i]);
}

function buildQuestionSet(pool, count){
  if(!pool.length) return [];
  const out = [];
  for(let i = 0; i < count; i++){ out.push(pool[i % pool.length]); }
  return out;
}

function startFromConfig(){
  const mode = configState.mode;
  if(mode === 'estudio'){
    const questions = buildQuestionsFromTopics(configState.topics);
    startQuiz('estudio', questions, null);
  } else if(mode === 'examen'){
    const pool = buildQuestionsFromTopics(configState.topics);
    const questions = buildQuestionSet(pool, configState.count);
    startQuiz('examen', questions, configState.time);
  } else if(mode === 'simulacro'){
    const questions = buildQuestionSet(SAMPLE_QUESTIONS, configState.count);
    startQuiz('simulacro', questions, configState.time);
  }
}

/* ---------- fallos intro screen ---------- */
function openFallos(){
  const total = TOPICS.filter(t => t.enabled).reduce((s,t) => s + t.fails, 0);
  document.getElementById('fallosTotal').textContent = total;
  const el = document.getElementById('fallosBreakdown');
  el.innerHTML = '';
  TOPICS.filter(t => t.enabled).forEach(t => {
    const row = document.createElement('div');
    row.className = 'fallos-row';
    row.innerHTML = '<span class="fallos-row-name">' + t.name + '</span><span class="fallos-row-count">' + t.fails + ' falladas</span>';
    el.appendChild(row);
  });
  showScreen('screen-home');
  openOverlay('screen-fallos');
}

function startFallosReview(){
  startQuiz('fallos', SAMPLE_QUESTIONS, null);
}

/* ---------- quiz ---------- */
function startQuiz(mode, questions, timeMinutes){
  ACTIVE_QUESTIONS = (questions && questions.length) ? questions : SAMPLE_QUESTIONS;
  quizState = { mode, index:0, correctCount:0, answered:false, answers:new Array(ACTIVE_QUESTIONS.length).fill(null), startedAt:Date.now() };
  showScreen('screen-quiz');
  startTimer(timeMinutes);
  renderQuestion();
}

function startTimer(minutes){
  clearInterval(timerInterval);
  const timerEl = document.getElementById('quizTimer');
  if(!minutes){
    timerEl.style.display = 'none';
    return;
  }
  timerEl.style.display = 'flex';
  timerEl.classList.remove('urgent');
  let secondsLeft = minutes * 60;
  updateTimerDisplay(secondsLeft);
  timerInterval = setInterval(() => {
    secondsLeft--;
    if(secondsLeft <= 0){
      clearInterval(timerInterval);
      updateTimerDisplay(0);
      finishQuiz();
      return;
    }
    if(secondsLeft <= 60) timerEl.classList.add('urgent');
    updateTimerDisplay(secondsLeft);
  }, 1000);
}

function updateTimerDisplay(s){
  const m = Math.floor(s / 60);
  const sec = s % 60;
  document.getElementById('quizTimerText').textContent = String(m).padStart(2,'0') + ':' + String(sec).padStart(2,'0');
}

function renderQuestion(){
  const q = ACTIVE_QUESTIONS[quizState.index];
  quizState.answered = false;
  document.getElementById('quizCount').textContent = (quizState.index+1) + ' / ' + ACTIVE_QUESTIONS.length;
  const tag = document.getElementById('articleTag');
  document.getElementById('articleTagText').textContent = q.general ? 'General' : q.art;
  tag.className = 'article-tag' + (q.general ? ' general' : '');
  document.getElementById('qFailCount').textContent = q.failCount;
  document.getElementById('qAvgTime').textContent = q.avgTime;
  document.getElementById('quizQuestion').textContent = q.q;

  const optsEl = document.getElementById('quizOptions');
  optsEl.innerHTML = '';
  const letters = ['A','B','C','D'];
  q.options.forEach((opt,i) => {
    const div = document.createElement('div');
    div.className = 'option';
    div.setAttribute('role','button');
    div.setAttribute('tabindex','0');
    div.innerHTML = '<span class="opt-badge">' + letters[i] + '</span><span class="opt-text">' + opt + '</span><span class="opt-result"></span>';
    div.onclick = () => selectOption(i);
    optsEl.appendChild(div);
  });
  document.getElementById('quizExplain').classList.remove('show');
  document.getElementById('quizExplain').innerHTML = '';
  document.getElementById('nextBtn').disabled = true;
  document.getElementById('nextBtn').textContent = (quizState.index === ACTIVE_QUESTIONS.length-1) ? 'Ver resultado' : 'Siguiente';
}

function selectOption(i){
  if(quizState.answered) return;
  quizState.answered = true;
  quizState.answers[quizState.index] = i;
  const q = ACTIVE_QUESTIONS[quizState.index];
  document.querySelectorAll('#quizOptions .option').forEach((el,idx) => {
    el.onclick = null;
    if(idx === q.correct){
      el.classList.add('correct');
      el.querySelector('.opt-result').innerHTML = ICONS.check;
    } else if(idx === i){
      el.classList.add('incorrect');
      el.querySelector('.opt-result').innerHTML = ICONS.cross;
    }
  });
  if(i === q.correct) quizState.correctCount++;
  const explainEl = document.getElementById('quizExplain');
  explainEl.innerHTML = q.explain + '<span class="cite">' + ICONS.seal + (q.general ? 'Sin artículo asociado' : q.art) + '</span>';
  explainEl.classList.add('show');
  document.getElementById('nextBtn').disabled = false;
}

function nextQuestion(){
  if(quizState.index < ACTIVE_QUESTIONS.length - 1){
    quizState.index++;
    renderQuestion();
  } else {
    finishQuiz();
  }
}

function finishQuiz(){
  clearInterval(timerInterval);
  const total = ACTIVE_QUESTIONS.length;
  document.getElementById('resultScore').textContent = quizState.correctCount;
  document.getElementById('resultTotal').textContent = total;

  const blank = quizState.answers.filter(a => a === null || a === undefined).length;
  const bad = total - quizState.correctCount - blank;
  const nota = (total ? (quizState.correctCount / total * 10) : 0).toFixed(2).replace('.', ',');
  const elapsedSec = quizState.startedAt ? Math.round((Date.now() - quizState.startedAt) / 1000) : 0;
  const mm = Math.floor(elapsedSec / 60), ss = elapsedSec % 60;
  const timeStr = String(mm).padStart(2,'0') + ':' + String(ss).padStart(2,'0');
  const MODE_LABELS = { examen:'Examen', estudio:'Estudio', simulacro:'Simulacro', fallos:'Fallos' };

  const entry = {
    id: 'r' + Date.now(),
    date: 'Ahora',
    type: quizState.mode,
    title: MODE_LABELS[quizState.mode] || 'Test',
    nota: nota,
    time: timeStr,
    ok: quizState.correctCount,
    bad: bad,
    pending: blank,
    review: { questions: ACTIVE_QUESTIONS.slice(), answers: quizState.answers.slice() }
  };
  HISTORY.unshift(entry);
  renderHistory();
  lastFinishedReviewId = entry.id;

  showScreen('screen-result');
}
function openLastReview(){
  const entry = HISTORY.find(h => h.id === lastFinishedReviewId);
  if(entry && entry.review) openReview(entry.review, entry.title + ' · Nota ' + entry.nota);
}

/* ---------- review / corrección ---------- */
let currentReview = null;
let reviewFilter = 'todas';
let reviewIndex = 0;

function computeReviewCounts(review){
  let correct = 0, bad = 0, blank = 0;
  review.questions.forEach((q, i) => {
    const a = review.answers[i];
    if(a === null || a === undefined) blank++;
    else if(a === q.correct) correct++;
    else bad++;
  });
  return { total: review.questions.length, correct, bad, blank };
}
function reviewFilteredIndexes(){
  const idxs = [];
  currentReview.questions.forEach((q, i) => {
    const a = currentReview.answers[i];
    const isBlank = (a === null || a === undefined);
    const isCorrect = !isBlank && a === q.correct;
    if(reviewFilter === 'todas') idxs.push(i);
    else if(reviewFilter === 'correctas' && isCorrect) idxs.push(i);
    else if(reviewFilter === 'incorrectas' && !isBlank && !isCorrect) idxs.push(i);
    else if(reviewFilter === 'blanco' && isBlank) idxs.push(i);
  });
  return idxs;
}
function openReview(review, title){
  currentReview = review;
  reviewFilter = 'todas';
  reviewIndex = 0;
  document.getElementById('reviewTitle').textContent = title || 'Corrección';
  renderReviewFilters();
  renderReviewQuestion();
  showScreen('screen-review');
}
function renderReviewFilters(){
  const c = computeReviewCounts(currentReview);
  const wrap = document.getElementById('reviewFilters');
  const defs = [
    { id:'todas', label:'Todas', count:c.total },
    { id:'correctas', label:'Correctas', count:c.correct },
    { id:'incorrectas', label:'Incorrectas', count:c.bad },
    { id:'blanco', label:'En blanco', count:c.blank }
  ];
  wrap.innerHTML = '';
  defs.forEach(d => {
    const el = document.createElement('div');
    el.className = 'param-opt' + (reviewFilter === d.id ? ' selected' : '');
    el.setAttribute('role','button'); el.setAttribute('tabindex','0');
    el.textContent = d.label + ' · ' + d.count;
    el.onclick = () => { reviewFilter = d.id; reviewIndex = 0; renderReviewFilters(); renderReviewQuestion(); };
    el.onkeydown = (e) => { if(e.key === 'Enter') el.onclick(); };
    wrap.appendChild(el);
  });
}
function renderReviewQuestion(){
  const idxs = reviewFilteredIndexes();
  const body = document.getElementById('reviewBody');
  const nav = document.getElementById('reviewNav');
  if(idxs.length === 0){
    body.innerHTML = '<div class="empty">No hay preguntas en este filtro.</div>';
    nav.style.display = 'none';
    return;
  }
  nav.style.display = 'flex';
  if(reviewIndex >= idxs.length) reviewIndex = 0;
  const qi = idxs[reviewIndex];
  const q = currentReview.questions[qi];
  const userAnswer = currentReview.answers[qi];
  const showExplain = document.getElementById('reviewExplainToggle').classList.contains('on');
  const letters = ['A','B','C','D'];

  let html = '';
  html += '<div class="review-report" role="button" tabindex="0" onclick="reportReviewQuestion()">' + ICONS.warn + ' Impugnar</div>';
  html += '<div class="article-tag' + (q.general ? ' general' : '') + '">' + ICONS.seal + '<span>' + (q.general ? 'General' : q.art) + '</span></div>';
  html += '<div class="question">' + (qi + 1) + '. ' + q.q + '</div>';
  html += '<div class="options">';
  q.options.forEach((opt, i) => {
    let cls = 'option', icon = '';
    if(i === q.correct){ cls += ' correct'; icon = '<span class="opt-result" style="display:block">' + ICONS.check + '</span>'; }
    else if(i === userAnswer){ cls += ' incorrect'; icon = '<span class="opt-result" style="display:block">' + ICONS.cross + '</span>'; }
    html += '<div class="' + cls + '"><span class="opt-badge">' + letters[i] + '</span><span class="opt-text">' + opt + '</span>' + icon + '</div>';
  });
  html += '</div>';
  if(userAnswer === null || userAnswer === undefined){
    html += '<div style="font-size:12.5px; color:var(--muted-2); margin-top:12px;">No respondiste esta pregunta.</div>';
  }
  if(showExplain){
    html += '<div class="explain show">' + q.explain + '<span class="cite">' + ICONS.seal + (q.general ? 'Sin artículo asociado' : q.art) + '</span></div>';
  }
  body.innerHTML = html;

  document.getElementById('reviewCounter').textContent = (reviewIndex + 1) + ' / ' + idxs.length;
  document.getElementById('reviewPrev').disabled = reviewIndex === 0;
  document.getElementById('reviewNext').disabled = reviewIndex === idxs.length - 1;
}
function reviewGo(delta){
  reviewIndex += delta;
  renderReviewQuestion();
}
function toggleReviewExplain(){
  document.getElementById('reviewExplainToggle').classList.toggle('on');
  renderReviewQuestion();
}
function reportReviewQuestion(){
  alert('Gracias, hemos recibido tu impugnación de esta pregunta.');
}

document.addEventListener('keydown', function(e){
  if(e.key === 'Escape'){
    closeSettingSheet();
    closeTopicDetail();
  }
  if(e.key === 'Enter' || e.key === ' '){
    const el = e.target;
    if(el && el.matches && el.matches('[role="button"]')){
      e.preventDefault();
      el.click();
    }
  }
});

// initial render
renderHistory();
updateLandingFlag();
renderTopicStats();
