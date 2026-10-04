/* ============================================================
   PLAN · Marcador de Tutor Bombero (PLANTB)
   Lo que se pega en pj.fire después de tocar el marcador en Tutor
   Bombero (marcador/tutor-bombero.js, que solo lee la página que tienes
   delante y la copia al portapapeles):
     - una lista de tests por tema → se añaden al catálogo, cada uno en
       su tema (se crean los temas que falten), sin duplicados, y se
       ofrece planificarlos;
     - un resultado → se guarda en su tarea, que queda completada, con
       la nota calculada como en los simulacros de pj.fire (cada fallo
       resta 1/(nº de opciones − 1)). Si no está claro de qué test es,
       se pregunta.
   Y la hoja para instalar el marcador en Safari.
   Nada de esto se conecta con Tutor Bombero: pj.fire solo lee lo que
   pegas. Usa PLAN (datos y guardado) y PLANL (lógica pura).
   ============================================================ */
const PLANTB = (function(){
  'use strict';

  const RUTA_MARCADOR = '/marcador/tutor-bombero.js';

  // El código del favorito: carga el marcador de esta misma web.
  function codigo(){
    const src = location.origin + RUTA_MARCADOR;
    return "javascript:(function(){var s=document.createElement('script');s.src='" + src +
      "?t='+Date.now();s.charset='utf-8';(document.body||document.documentElement).appendChild(s);})();void 0";
  }
  function listo(){
    const D = PLAN.datos();
    if(!D.cargado){ uiToast('Espera a que cargue tu plan y vuelve a pulsar.', 'error'); return null; }
    return D;
  }

  /* ---------- Pegar ---------- */
  async function pegar(){
    if(!listo()) return;
    let t = null;
    try{ if(navigator.clipboard && navigator.clipboard.readText) t = await navigator.clipboard.readText(); }catch(e){}
    if(t && t.trim() && procesar(t)) return;
    pedirTexto(t && t.trim() ? 'Lo que tienes copiado no es del marcador de Tutor Bombero.' : 'No he podido leer lo copiado.');
  }
  // true si el texto era algo que se puede usar (y ya se está usando).
  function procesar(texto){
    const m = PLANL.leerMarcadorTB(texto);
    if(m && m.tipo === 'tests'){ importarTests(m); return true; }
    if(m && m.tipo === 'resultado'){ guardarResultado(m); return true; }
    if(m && m.tipo === 'preguntas'){ importarPreguntas(m); return true; }
    // Texto suelto con números de resultado (p. ej. copiado con Texto en vivo).
    const r = PLANL.parsearResultado(texto || '');
    if(r.aciertos != null || r.nota != null){
      guardarResultado({ tipo: 'resultado', titulo: null, lineas: String(texto).split('\n').slice(0, 60) });
      return true;
    }
    return false;
  }
  function pedirTexto(motivo){
    PLAN.hoja({ titulo: 'Pegar de Tutor Bombero',
      html: '<p class="pl-hoja-txt">' + esc(motivo) + ' Pégalo aquí (mantén pulsado › Pegar):</p>' +
        '<label class="pl-campo"><span>Lo que copiaste con el marcador</span><textarea class="pl-input" rows="4" name="pegado" autofocus></textarea></label>' +
        '<p class="pl-error-form" role="alert"></p>' +
        '<p class="pl-pie">¿Aún no tienes el marcador? <button type="button" class="pl-enlace" data-accion="instalar">Instálalo</button>.</p>',
      botones: [{ texto: 'Usar', clase: 'primario', accion: api => {
        const v = api.el.querySelector('[name="pegado"]').value;
        if(v.trim() && PLANL.leerMarcadorTB(v) == null && PLANL.parsearResultado(v).aciertos == null && PLANL.parsearResultado(v).nota == null){
          api.el.querySelector('.pl-error-form').textContent = 'Esto no parece ni tests, ni un resultado, ni preguntas del marcador.';
          return false;
        }
        if(!v.trim()){ api.el.querySelector('.pl-error-form').textContent = 'Pega primero lo que copiaste.'; return false; }
        setTimeout(() => procesar(v), 0);
      } }, { texto: 'Cancelar' }],
      alAbrir: (panel, api) => {
        panel.querySelector('[data-accion="instalar"]').addEventListener('click', () => { api.cerrar(); instalar(); });
      } });
  }

  /* ---------- Tests por tema → catálogo ---------- */
  function etiquetaGrupo(g){
    if(g.numero != null) return 'Tema ' + g.numero + (g.nombre ? ' · ' + g.nombre : '');
    return g.nombre || 'Sin tema';
  }
  function importarTests(m){
    const D = listo();
    if(!D) return;
    const plan = PLANL.planImportacionTB(m, D.temas, D.tests);
    const filas = plan.grupos.map((g, i) => {
      const destino = g.tema_id ? 'a tu «' + PLAN.nombreTema(g.tema_id) + '»' : g.crear ? 'a un tema nuevo: «' + (g.crear.numero != null ? 'Tema ' + g.crear.numero + (PLANL.normalizar(g.crear.nombre) === 'tema ' + g.crear.numero ? '' : ' · ' + g.crear.nombre) : g.crear.nombre) + '»' : 'sin tema';
      const ej = g.nuevos.slice(0, 3).map(t => t.nombre).join(', ') + (g.nuevos.length > 3 ? '…' : '');
      return '<label class="pl-tb-grupo' + (g.nuevos.length ? '' : ' nada') + '"><input type="checkbox" data-g="' + i + '"' + (g.nuevos.length ? ' checked' : ' disabled') + '>' +
        '<span><b>' + esc(etiquetaGrupo(g)) + '</b> <span class="pl-suave">→ ' + esc(destino) + '</span><br>' +
        (g.nuevos.length ? g.nuevos.length + ' nuevo' + (g.nuevos.length === 1 ? '' : 's') + ': ' + esc(ej) : 'Nada nuevo') +
        (g.repetidos ? ' <span class="pl-suave">· ' + g.repetidos + ' ya los tenías</span>' : '') + '</span></label>';
    }).join('');
    const total = m.total;
    PLAN.hoja({ titulo: 'Tests de Tutor Bombero', ancha: true,
      html: '<p class="pl-hoja-txt">He recibido <b>' + total + ' test' + (total === 1 ? '' : 's') + '</b> de ' + plan.grupos.length + ' tema' + (plan.grupos.length === 1 ? '' : 's') + ': ' +
        '<b>' + plan.nuevos + ' nuevo' + (plan.nuevos === 1 ? '' : 's') + '</b>' + (plan.repetidos ? ' y ' + plan.repetidos + ' que ya tenías (se saltan)' : '') + '.</p>' +
        '<div class="pl-tb-grupos">' + filas + '</div>' +
        (plan.nuevos ? '<label class="pl-tb-grupo"><input type="checkbox" name="planificar" checked><span>Repartirlos por días al terminar (planificación automática, con tu límite diario)</span></label>' : '') +
        '<p class="pl-error-form" role="alert"></p>',
      botones: plan.nuevos ? [{ texto: 'Añadir al catálogo', clase: 'primario', accion: api => crear(api, plan) }, { texto: 'Cancelar' }] : [{ texto: 'Cerrar' }] });
  }
  function crear(api, plan){
    const panel = api.el;
    const elegidos = plan.grupos.filter((g, i) => g.nuevos.length && (panel.querySelector('[data-g="' + i + '"]') || {}).checked);
    if(!elegidos.length){ panel.querySelector('.pl-error-form').textContent = 'Marca al menos un tema.'; return false; }
    const temasNuevos = new Map();
    let n = 0;
    elegidos.forEach(g => {
      let temaId = g.tema_id;
      if(g.crear){
        if(!temasNuevos.has(g.crear)){
          const id = PLAN.uid();
          PLAN.guardar('plan_temas', { id, numero: g.crear.numero, nombre: g.crear.nombre, bloque: null, topic_ids: [], archivado: false });
          temasNuevos.set(g.crear, id);
        }
        temaId = temasNuevos.get(g.crear);
      }
      g.nuevos.forEach(t => {
        PLAN.guardar('plan_tests', { id: PLAN.uid(), tema_id: temaId, plataforma: 'tutor_bombero', nombre: t.nombre, referencia: t.referencia,
          url: null, num_preguntas: t.num_preguntas, config: {}, archivado: false });
        n++;
      });
    });
    const planificar = !!(panel.querySelector('[name="planificar"]') || {}).checked;
    uiToast('Añadidos ' + n + ' test' + (n === 1 ? '' : 's') + ' de Tutor Bombero' + (temasNuevos.size ? ' y ' + temasNuevos.size + ' tema' + (temasNuevos.size === 1 ? '' : 's') : '') + '.', 'success');
    PLAN.repintar();
    if(planificar) setTimeout(() => PLAN.planificarAuto(), 60);
  }

  /* ---------- Resultado → su tarea ---------- */
  function guardarResultado(m){
    const D = listo();
    if(!D) return;
    const r = PLANL.parsearResultado(m.lineas.join('\n'));
    const e = PLANL.elegirTareaTB({ titulo: m.titulo, tareas: D.tareas, tests: D.tests, hoy: PLAN.hoy() });
    if(e.seguro && e.test){ registrar(e.test, e.tarea, r); return; }
    elegir(e, r, m);
  }
  // Valores listos para guardar, o null si no cuadran (entonces se abre el formulario).
  function valores(r){
    const c = PLAN.cuentas(r.aciertos, r.fallos, r.blancos, r.total);
    if(!c) return null;
    const { a, f, b, t } = c;
    if(a == null && r.nota == null) return null;
    if(a != null && f == null && t == null && r.nota == null) return null;
    if(t === 0 || (t != null && (a || 0) + (f || 0) + (b || 0) > t)) return null;
    if([a, f, b, t].some(x => x != null && x > 1000)) return null;
    if(r.nota != null && !(r.nota >= 0 && r.nota <= 10)) return null;
    // La nota como en los simulacros de pj.fire; la de Tutor Bombero, si es otra, queda en las notas.
    const nuestra = a != null && f != null ? PLANL.notaDe(a, f, b || 0) : null;
    const nota = nuestra != null ? nuestra : r.nota;
    const notas = nuestra != null && r.nota != null && Math.abs(nuestra - r.nota) >= 0.01 ? 'Nota en Tutor Bombero: ' + formatNota(r.nota) : null;
    return { aciertos: a, fallos: f, blancos: b, total: t, nota, notas };
  }
  function registrar(test, tarea, r){
    const v = valores(r);
    if(!v){
      uiToast('No he podido leer bien tus números: revísalos y guarda.', 'info');
      PLAN.apuntarResultado(tarea, test, { prefill: { aciertos: r.aciertos, fallos: r.fallos, blancos: r.blancos, total: r.total, nota: r.nota } });
      return;
    }
    const res = PLAN.registrarResultado(tarea, test, v, null, { evento: 'marcador', silencioso: true });
    if(!res) return;
    uiToast('Guardado: ' + test.nombre + (res.nota != null ? ' · nota ' + formatNota(res.nota) : '') + (tarea ? '' : ' (no estaba en tu plan)') + '.', 'success',
      { action: 'Corregir', duration: 8000, onAction: () => PLAN.apuntarResultado(tarea && PLAN.tareaDe(tarea.id), PLAN.testDe(test.id) || test, { resultado: res }) });
  }
  // No está claro de qué test es: se elige (tareas abiertas y de hoy primero).
  function elegir(e, r, m){
    const D = PLAN.datos();
    const tb = D.tests.filter(t => t.plataforma === 'tutor_bombero' && !t.archivado)
      .sort((a, b) => PLANL.ordenNatural(PLAN.nombreTema(a.tema_id) + ' ' + a.nombre, PLAN.nombreTema(b.tema_id) + ' ' + b.nombre));
    const nombreTarea = t => { const x = PLAN.testDe(t.test_id) || {}; return (x.nombre || '?') + ' · ' + PLAN.nombreTema(x.tema_id) + (t.estado === 'en_curso' ? ' (abierto)' : t.fecha === PLAN.hoy() ? ' (hoy)' : ''); };
    const ops = (e.candidatas.length ? '<optgroup label="Tus tareas">' + e.candidatas.map(t => '<option value="t:' + esc(t.id) + '">' + esc(nombreTarea(t)) + '</option>').join('') + '</optgroup>' : '') +
      (tb.length ? '<optgroup label="Tu catálogo de Tutor Bombero">' + tb.map(t => '<option value="x:' + esc(t.id) + '">' + esc(t.nombre + ' · ' + PLAN.nombreTema(t.tema_id)) + '</option>').join('') + '</optgroup>' : '') +
      (m.titulo ? '<option value="nuevo">Nuevo test: «' + esc(m.titulo) + '»</option>' : '');
    const v = valores(r);
    const resumen = v ? [v.aciertos != null ? v.aciertos + ' aciertos' : null, v.fallos != null ? v.fallos + ' fallos' : null, v.blancos ? v.blancos + ' en blanco' : null, v.nota != null ? 'nota ' + formatNota(v.nota) : null].filter(Boolean).join(' · ') : 'sin números claros';
    if(!ops){
      uiToast('Aún no tienes tests de Tutor Bombero en el catálogo: trae tu lista con el marcador o apúntalo a mano.', 'error');
      return;
    }
    PLAN.hoja({ titulo: '¿De qué test es este resultado?',
      html: '<p class="pl-hoja-txt">' + (m.titulo ? 'En Tutor Bombero se llama «' + esc(m.titulo) + '». ' : '') + 'Resultado: <b>' + esc(resumen) + '</b>.</p>' +
        '<label class="pl-campo"><span>Test</span><select class="pl-input" name="destino" autofocus>' + ops + '</select></label>',
      botones: [{ texto: 'Guardar', clase: 'primario', accion: api => {
        const val = api.el.querySelector('[name="destino"]').value;
        let test = null, tarea = null;
        if(val.startsWith('t:')){ tarea = PLAN.tareaDe(val.slice(2)); test = tarea && PLAN.testDe(tarea.test_id); }
        else if(val.startsWith('x:')){
          test = PLAN.testDe(val.slice(2));
          if(test) tarea = PLANL.elegirTareaTB({ titulo: test.referencia || test.nombre, tareas: D.tareas.filter(t => t.test_id === test.id), tests: [test], hoy: PLAN.hoy() }).tarea;
        } else if(val === 'nuevo'){
          const num = /\btema\s*0*(\d{1,3})\b/i.exec(m.titulo);
          const tema = num ? D.temas.find(t => Number(t.numero) === Number(num[1]) && !t.archivado) : null;
          test = { id: PLAN.uid(), tema_id: tema ? tema.id : null, plataforma: 'tutor_bombero', nombre: m.titulo, referencia: m.titulo, url: null, num_preguntas: null, config: {}, archivado: false };
          PLAN.guardar('plan_tests', test);
        }
        if(!test) return false;
        setTimeout(() => registrar(test, tarea, r), 0);
      } }, { texto: 'Cancelar' }] });
  }

  /* ---------- Preguntas de la corrección → «Mis preguntas» ---------- */
  // Solo para el repaso de quien las trae: plan_preguntas es privada (RLS).
  function importarPreguntas(m){
    const D = listo();
    if(!D) return;
    const plan = PLANL.planPreguntasTB(m, D.preguntas, D.temas);
    const temas = PLAN.temasOrdenados(false);
    const opcionesTema = '<option value="">Sin tema</option>' + temas.map(t => '<option value="' + esc(t.id) + '"' + (t.id === plan.tema_id ? ' selected' : '') + '>' + esc(PLAN.nombreTema(t.id)) + '</option>').join('');
    const ej = plan.nuevas.slice(0, 4).map(q => '<li><b>' + esc(q.enunciado.length > 110 ? q.enunciado.slice(0, 109) + '…' : q.enunciado) + '</b><br><span class="pl-suave">✓ ' +
      String.fromCharCode(97 + q.correcta) + ') ' + esc(q.opciones[q.correcta]) + '</span></li>').join('');
    PLAN.hoja({ titulo: 'Preguntas de Tutor Bombero', ancha: true,
      html: '<p class="pl-hoja-txt">' + (m.titulo ? 'De «' + esc(m.titulo) + '»: ' : '') + '<b>' + plan.nuevas.length + ' nueva' + (plan.nuevas.length === 1 ? '' : 's') + '</b>' +
        (plan.repetidas ? ', ' + plan.repetidas + ' que ya tenías' : '') + (m.malas ? ', ' + m.malas + ' sin respuesta clara (no se guardan)' : '') + '.</p>' +
        (plan.nuevas.length ? '<ul class="pl-lista-txt">' + ej + (plan.nuevas.length > 4 ? '<li class="pl-suave">… y ' + (plan.nuevas.length - 4) + ' más.</li>' : '') + '</ul>' +
          '<label class="pl-campo"><span>Tema</span><select class="pl-input" name="tema">' + opcionesTema + '</select></label>' +
          '<p class="pl-pie">Van a «Mis preguntas» (Exámenes), privadas para ti, y salen en tus exámenes combinados mezcladas con las del banco. Son para tu repaso: no las compartas.</p>' : ''),
      botones: plan.nuevas.length ? [{ texto: 'Guardar ' + plan.nuevas.length + ' pregunta' + (plan.nuevas.length === 1 ? '' : 's'), clase: 'primario', accion: api => {
        const tema = api.el.querySelector('[name="tema"]').value || null;
        plan.nuevas.forEach(q => PLAN.guardar('plan_preguntas', { id: PLAN.uid(), tema_id: tema, fuente: 'tutor_bombero', referencia: m.titulo ? m.titulo.slice(0, 160) : null,
          enunciado: q.enunciado, opciones: q.opciones, correcta: q.correcta, explicacion: q.explicacion || null, archivada: false }));
        uiToast('Guardadas ' + plan.nuevas.length + ' preguntas en «Mis preguntas».', 'success');
        PLAN.repintar();
      } }, { texto: 'Cancelar' }] : [{ texto: 'Cerrar' }] });
  }

  /* ---------- Instalar el marcador ---------- */
  function instalar(){
    const cod = codigo();
    PLAN.hoja({ titulo: 'Marcador para Tutor Bombero', ancha: true,
      html: '<p class="pl-hoja-txt">Un favorito de Safari que tocas <b>estando en Tutor Bombero</b>: lee la página que tienes delante y la copia para pegarla aquí. pj.fire no necesita tu contraseña ni se conecta a Tutor Bombero.</p>' +
        '<ol class="pl-pasos">' +
        '<li>Pulsa <b>Copiar el código</b> (abajo).</li>' +
        '<li>En <b>Safari</b>, abre <b>tutorbomberos.es</b>, toca <b>Compartir</b> (el cuadrado con la flecha) › <b>Añadir a favoritos</b> y llámalo <b>pj.fire</b>.</li>' +
        '<li>Abre los favoritos (el icono del libro) › <b>Editar</b> › toca <b>pj.fire</b>, borra la dirección, <b>pega el código</b> y pulsa OK.</li>' +
        '<li>Para usarlo: en Tutor Bombero toca la barra de direcciones y elige el favorito <b>pj.fire</b>.</li></ol>' +
        '<p class="pl-hoja-txt"><b>Dónde usarlo:</b></p><ul class="pl-lista-txt">' +
        '<li>En la página donde salen <b>tus tests por temas</b>: los trae a tu catálogo, cada uno en su tema. Si están en varias páginas, usa «Juntar y seguir».</li>' +
        '<li>En la <b>pantalla de resultados</b> al terminar un test: aquí pulsas «Pegar de Tutor Bombero» y la tarea queda hecha con su nota.</li>' +
        '<li>En la <b>corrección</b> (preguntas con su respuesta correcta): las guarda en «Mis preguntas» para tus exámenes combinados, privadas para ti.</li></ul>' +
        '<p class="pl-pie">Te enseña lo que ha encontrado y no copia nada hasta que pulsas «Copiar», página a página. No envía nada a ningún sitio: va a tu portapapeles y de ahí a tu cuenta.</p>' +
        '<textarea class="pl-input pl-correo" rows="4" readonly aria-label="Código del marcador">' + esc(cod) + '</textarea>',
      botones: [{ texto: 'Copiar el código', clase: 'primario', accion: () => {
        (navigator.clipboard && navigator.clipboard.writeText ? navigator.clipboard.writeText(cod) : Promise.reject())
          .then(() => uiToast('Código copiado. Ahora pégalo en la dirección del favorito.', 'success'), () => uiToast('No se ha podido copiar: selecciona el texto de abajo y cópialo a mano.', 'error'));
        return false;
      } }, { texto: 'Cerrar' }] });
  }

  return { pegar, procesar, instalar, codigo };
})();
