/* Alturas reales de la cabecera y de la cabecera del test (variables CSS). */

/* ---------- Altura real de <header>, usada por .quiz-head (sticky) para
   quedar pegada justo debajo, tanto en la barra superior de escritorio
   como en la cabecera compacta de móvil.
   Se usa ResizeObserver (en vez de solo resize/load) porque la altura de
   <header> puede cambiar por motivos que esos eventos no detectan (la
   fuente tarda en cargar, cambia el zoom, el viewport del navegador móvil
   se contrae/expande al hacer scroll, etc.). Si --header-h se queda
   desajustada aunque sea 1px, se abre un hueco por el que se cuela el
   contenido de la pregunta al hacer scroll; con ResizeObserver se
   recalcula al instante cada vez que el tamaño real cambia. ---------- */
function updateHeaderHeightVar(){
  const header = document.querySelector('header');
  if(!header) return;
  document.documentElement.style.setProperty('--header-h', header.offsetHeight + 'px');
}
const headerEl = document.querySelector('header');
if(headerEl && 'ResizeObserver' in window){
  new ResizeObserver(updateHeaderHeightVar).observe(headerEl);
} else {
  window.addEventListener('resize', updateHeaderHeightVar);
  window.addEventListener('orientationchange', updateHeaderHeightVar);
  window.addEventListener('load', updateHeaderHeightVar);
}
updateHeaderHeightVar();
if(document.fonts && document.fonts.ready){ document.fonts.ready.then(updateHeaderHeightVar); }

/* ---------- Altura real de la .quiz-head activa (position:fixed), usada
   para reservar en la pantalla el hueco que ocupa debajo de <header>,
   igual que --header-h. Hay dos <div class="quiz-head"> distintos (uno en
   screen-quiz y otro en screen-review) y solo uno está visible cada vez,
   así que hay que reenganchar el ResizeObserver al que corresponda cada
   vez que se cambia de pantalla (ver showScreen). También puede pasar a
   dos líneas en pantallas estrechas, de ahí el ResizeObserver en vez de
   solo resize/load. ---------- */
let quizHeadObserver = null;
function updateQuizHeadHeightVar(){
  const activeHead = document.querySelector('.screen.active .quiz-head');
  document.documentElement.style.setProperty('--quiz-head-h', (activeHead ? activeHead.offsetHeight : 0) + 'px');
}
function observeActiveQuizHead(){
  if(quizHeadObserver) quizHeadObserver.disconnect();
  const activeHead = document.querySelector('.screen.active .quiz-head');
  if(activeHead && 'ResizeObserver' in window){
    quizHeadObserver = new ResizeObserver(updateQuizHeadHeightVar);
    quizHeadObserver.observe(activeHead);
  }
  updateQuizHeadHeightVar();
}
window.addEventListener('resize', updateQuizHeadHeightVar);
window.addEventListener('orientationchange', updateQuizHeadHeightVar);
if(document.fonts && document.fonts.ready){ document.fonts.ready.then(updateQuizHeadHeightVar); }
