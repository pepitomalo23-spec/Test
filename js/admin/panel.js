/* Administración: estado del panel, apertura y pestañas. */

const adminData = { topics: [], articles: [], nodes: [], questions: [], users: [], loginAttempts: [], verifications: [] };
const adminEditing = { topic: null, question: null, node: null };
let adminTreeTopicId = null;   // tema seleccionado en la pestaña Estructura
let treeAddParentId = null;    // padre del nodo que se está creando (null = raíz del tema)
let treeQuestionNodeId = null; // nodo donde se añadirá la pregunta desde el árbol (null = pregunta general de todo el tema)
let treeQuestionTopicId = null;
let treeQuestionLocationSet = false; // true en cuanto se ha elegido explícitamente una ubicación (incluso "todo el tema")

/* ==================== ADMIN PANEL ==================== */

async function openAdminPanel(){
  if(!currentUserIsAdmin) return;
  closeUserMenu();
  showScreen('screen-admin');
  await adminLoadAllData();
}
async function adminLoadAllData(){
  await Promise.all([adminLoadTopics(), adminLoadQuestions()]);
  refreshTreeTopicSelect();
}
function switchAdminTab(name){
  ['topics','articles','users','activity','boe','callejero','backups','errors'].forEach(t => {
    document.getElementById('adminTabBtn-'+t).classList.toggle('active', t===name);
    document.getElementById('adminSection-'+t).classList.toggle('active', t===name);
  });
  if(name === 'boe'){
    initBoeAdminPanel();
  }
  if(name === 'errors'){
    adminLoadErrors();
  }
  if(name === 'backups'){
    adminLoadBackups();
  }
  if(name === 'callejero'){
    adminLoadCallejero();
  }
  if(name === 'activity'){
    startActivityLive();
  } else {
    stopActivityLive();
  }
  if(name === 'users'){
    adminLoadDefaultFlags();
    adminLoadUsers();
    adminLoadVerifications();
    adminLoadLoginAttempts();
  }
}
function toggleAdminForm(type){
  const form = document.getElementById('adminForm-'+type);
  const willShow = form.classList.contains('hidden');
  form.classList.toggle('hidden');
  if(willShow){ adminResetForm(type); } else { adminEditing[type] = null; }
}
function adminResetForm(type){
  adminEditing[type] = null;
  document.getElementById('adminStatus-'+type).textContent = '';
  if(type==='topic'){
    document.getElementById('adminTopicId').value = '';
    document.getElementById('adminTopicId').disabled = false;
    document.getElementById('adminTopicCategory').value = '';
    document.getElementById('adminTopicName').value = '';
    document.getElementById('adminTopicDesc').value = '';
    document.getElementById('adminTopicEnabled').checked = true;
    document.getElementById('adminTopicSort').value = '0';
  }
}
function showAdminStatus(type, msg, isError){
  const el = document.getElementById('adminStatus-'+type);
  el.textContent = msg;
  el.className = 'admin-status ' + (isError ? 'err' : 'ok');
}
