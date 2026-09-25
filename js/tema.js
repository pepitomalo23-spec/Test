/* Tema claro / oscuro. */

/* ---------- tema claro/oscuro ---------- */
function syncThemeSwitch(){
  const sw = document.getElementById('themeSwitch');
  if(!sw) return;
  const isLight = document.documentElement.getAttribute('data-theme') === 'light';
  sw.classList.toggle('on', isLight);
}
function toggleTheme(){
  const isLight = document.documentElement.getAttribute('data-theme') === 'light';
  if(isLight){
    document.documentElement.removeAttribute('data-theme');
  }else{
    document.documentElement.setAttribute('data-theme', 'light');
  }
  try{ localStorage.setItem('pjfire_theme', isLight ? 'dark' : 'light'); }catch(e){}
  const themeColorMeta = document.querySelector('meta[name="theme-color"]');
  if(themeColorMeta) themeColorMeta.setAttribute('content', isLight ? '#000000' : '#FFFFFF');
  syncThemeSwitch();
}
syncThemeSwitch();
