// Pruebas de extremo a extremo del Plan de estudio, en Chromium con
// tamaño de iPad, contra la app real servida en local, un PostgREST local
// con la migración del Plan y un «Supabase falso» (servidor.mjs).
// Antes: bash tests/plan/e2e/preparar.sh   ·   Uso: node tests/plan/e2e/escenarios.mjs
// Cada escenario comprueba la interfaz Y la base de datos.
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync } from 'node:fs';
import { chromium, nuevoContexto, IPAD, IPAD_H, MOVIL, APP, vigilarErrores, esperarApp, entrarConSesion, sql, sqlJson, restComo, ok } from './ayuda.mjs';

const CAPTURAS = process.env.CAPTURAS || ((process.env.TMPDIR || '/tmp') + '/plan-e2e/capturas');
mkdirSync(CAPTURAS, { recursive: true });
const ADMIN = '00000000-0000-4000-8000-0000000000a1';
const errores = [];
const ESPERADOS = [/admin_list_users|admin_list_activity|admin_|PGRST202|callejero_|404 \(Not Found\)|Failed to load resource/];
let pagina, ctx, nav;

const hoja = () => pagina.locator('.pl-hoja');
async function botonHoja(texto){ await pagina.locator('.pl-hoja-botones button', { hasText: texto }).first().click(); }
async function captura(nombre){ await pagina.screenshot({ path: CAPTURAS + '/' + nombre + '.png', fullPage: true }); }
async function pestana(id){ await pagina.click('#plTab-' + id); await pagina.waitForTimeout(150); }
// Espera a que la cola del Plan esté vacía (todo subido al servidor).
async function colaVacia(){
  await pagina.waitForFunction(id => { try{ return !(JSON.parse(localStorage.getItem('plan_cola_v1_' + id)) || []).length; }catch(e){ return false; } }, ADMIN, { timeout: 15000 });
}
const hoyMadrid = () => sql("select (now() at time zone 'Europe/Madrid')::date");
async function paso(nombre, fn){
  console.log('▶ ' + nombre);
  try{ await fn(); }
  catch(e){ await captura('FALLO-' + nombre.replace(/[^a-z0-9]+/gi, '-').slice(0, 50)).catch(() => {}); throw e; }
}

nav = await chromium.launch();
try{
  ctx = await nuevoContexto(nav, IPAD, { permissions: ['clipboard-read', 'clipboard-write'] });
  pagina = await ctx.newPage();
  vigilarErrores(pagina, errores);

  await paso('a. Acceso: el admin ve el Plan; quien no tiene el permiso, no', async () => {
    await pagina.goto(APP + '/index.html');
    await pagina.fill('#authEmail', 'admin@prueba.es');
    await pagina.fill('#authPassword', 'clave-admin');
    await pagina.click('#authLoginBtn');
    await esperarApp(pagina);
    assert.ok(await pagina.isVisible('#navPlan'), 'el admin debe ver «Plan»');
    ok('el admin ve «Plan»');
    // Alumno sin permiso: no lo ve y la base de datos no le deja leer ni escribir.
    const c2 = await nuevoContexto(nav, IPAD);
    await entrarConSesion(c2, 'alumno@prueba.es');
    const p2 = await c2.newPage();
    await p2.goto(APP + '/index.html');
    await esperarApp(p2);
    assert.equal(await p2.isVisible('#navPlan'), false, 'el alumno sin permiso no debe ver «Plan»');
    await p2.evaluate(() => showScreen('screen-plan'));
    assert.equal(await p2.evaluate(() => document.querySelector('.screen.active').id), 'screen-home', 'si entra a la fuerza, vuelve a Inicio');
    await c2.close();
    const lect = await restComo('alumno@prueba.es', 'plan_temas?select=*');
    assert.ok(lect.estado === 200 && Array.isArray(lect.cuerpo) && lect.cuerpo.length === 0, 'el alumno no lee plan_temas: ' + JSON.stringify(lect));
    const esc = await restComo('alumno@prueba.es', 'plan_temas', { method: 'POST', body: JSON.stringify({ nombre: 'intruso' }) });
    assert.ok(esc.estado >= 400, 'el alumno no puede escribir en plan_temas: ' + esc.estado);
    ok('el alumno sin permiso no ve el Plan ni puede leer o escribir sus tablas');
    // La alumna con el permiso sí lo ve.
    const c3 = await nuevoContexto(nav, IPAD);
    await entrarConSesion(c3, 'alumna@prueba.es');
    const p3 = await c3.newPage();
    await p3.goto(APP + '/index.html');
    await esperarApp(p3);
    assert.ok(await p3.isVisible('#navPlan'), 'la alumna con permiso debe ver «Plan»');
    await c3.close();
    ok('quien tiene el permiso activado lo ve');
  });

  await paso('b. Temas y tests (con duplicados rechazados)', async () => {
    await pagina.click('#navPlan');
    await pagina.waitForSelector('.pl-empezar');
    await captura('01-hoy-vacio');
    await pagina.click('text=Crear mis temas');
    await pagina.fill('.pl-hoja [name="lista"]', '1. Constitución Española\n2. Prevención de Riesgos Laborales\nTema 3: Ley de Emergencias\n2. Prevención de Riesgos Laborales');
    await botonHoja('Crear');
    await colaVacia();
    const temas = sqlJson("select numero, nombre from plan_temas order by numero");
    assert.deepEqual(temas, [{ numero: 1, nombre: 'Constitución Española' }, { numero: 2, nombre: 'Prevención de Riesgos Laborales' }, { numero: 3, nombre: 'Ley de Emergencias' }]);
    ok('3 temas creados con su número (el repetido no)');
    // Vincular el tema 1 con el banco (CE) y el 2 con PRL
    await pagina.click('#plBtnAjustes');
    await pagina.locator('.pl-fila', { hasText: 'Constitución' }).locator('button', { hasText: 'Editar' }).click();
    await pagina.check('.pl-hoja [name="topic"][value="CE"]');
    await botonHoja('Guardar');
    await pagina.locator('.pl-fila', { hasText: 'Prevención' }).locator('button', { hasText: 'Editar' }).click();
    await pagina.check('.pl-hoja [name="topic"][value="PRL"]');
    await botonHoja('Guardar');
    await colaVacia();
    assert.equal(sql("select topic_ids::text from plan_temas where numero = 1"), '{CE}');
    await captura('02-ajustes');
    ok('temas vinculados con el banco');
    // Un test de Tutor Bombero, uno a uno
    await pagina.click('text=Volver al plan');
    await pestana('tests');
    await pagina.click('text=+ Nuevo test');
    await pagina.selectOption('.pl-hoja [name="tema"]', { label: 'Tema 1 · Constitución Española' });
    await pagina.fill('.pl-hoja [name="nombre"]', 'Test 1');
    await pagina.fill('.pl-hoja [name="referencia"]', 'Constitución · Test 1');
    await botonHoja('Guardar');
    // Varios de golpe (Test 1 ya existe con otra referencia: «Constitución · Test #» lo detecta)
    await pagina.click('text=Añadir varios');
    await pagina.selectOption('.pl-hoja [name="tema"]', { label: 'Tema 1 · Constitución Española' });
    await pagina.fill('.pl-hoja [name="desde"]', '1');
    await pagina.fill('.pl-hoja [name="hasta"]', '6');
    await pagina.fill('.pl-hoja [name="ref"]', 'Constitución · Test #');
    const previa = await pagina.textContent('.pl-hoja .pl-previa');
    assert.match(previa, /Se crearán 5/);
    assert.match(previa, /1 ya los tienes/);
    await botonHoja('Crear');
    // Y otros para el tema 2
    await pagina.click('text=Añadir varios');
    await pagina.selectOption('.pl-hoja [name="tema"]', { label: 'Tema 2 · Prevención de Riesgos Laborales' });
    await pagina.fill('.pl-hoja [name="desde"]', '1');
    await pagina.fill('.pl-hoja [name="hasta"]', '4');
    await pagina.fill('.pl-hoja [name="ref"]', 'PRL · Test #');
    await botonHoja('Crear');
    // Duplicado uno a uno: rechazado con aviso
    await pagina.click('text=+ Nuevo test');
    await pagina.fill('.pl-hoja [name="nombre"]', 'Otro nombre');
    await pagina.fill('.pl-hoja [name="referencia"]', '  constitución · test 1 ');
    await botonHoja('Guardar');
    assert.match(await pagina.textContent('.pl-hoja .pl-error-form'), /Ya tienes ese test/);
    await botonHoja('Cancelar');
    // Test de pj.fire
    await pagina.click('text=+ Nuevo test');
    await pagina.click('.pl-hoja [data-plat="pjfire"]');
    await pagina.selectOption('.pl-hoja [name="tema"]', { label: 'Tema 1 · Constitución Española' });
    await pagina.fill('.pl-hoja [name="nombre"]', 'Repaso CE en pj.fire');
    await pagina.fill('.pl-hoja [name="n"]', '5');
    await botonHoja('Guardar');
    await colaVacia();
    assert.equal(sql("select count(*) from plan_tests"), '11');
    assert.equal(sql("select count(*) from plan_tests where plataforma = 'pjfire' and config->>'modo' = 'estudio' and (config->>'n')::int = 5"), '1');
    await captura('03-tests');
    ok('11 tests en el catálogo, sin duplicados (también en la base de datos)');
  });

  await paso('c. Límite diario y excepción autorizada', async () => {
    const h = hoyMadrid();
    for(const nombre of ['Test 1', 'Test 2', 'Test 3']){
      await pagina.locator('.pl-test', { hasText: nombre }).first().locator('button', { hasText: 'Programar' }).click();
      await botonHoja('Programar');
    }
    await colaVacia();
    assert.equal(sql(`select count(*) from plan_tareas where fecha = '${h}'`), '3');
    // El cuarto pide excepción: primero se rechaza…
    await pagina.locator('.pl-test', { hasText: 'Test 4' }).first().locator('button', { hasText: 'Programar' }).click();
    await botonHoja('Programar');
    await pagina.waitForSelector('.ui-confirm');
    assert.match(await pagina.textContent('.ui-confirm'), /límite diario/);
    await pagina.click('.ui-confirm-cancel');
    await colaVacia();
    assert.equal(sql(`select count(*) from plan_tareas where fecha = '${h}'`), '3');
    assert.equal(sql(`select count(*) from plan_eventos where tipo = 'aviso_limite'`), '1');
    // …y luego se autoriza
    await pagina.locator('.pl-test', { hasText: 'PRL · Test 1' }).first().locator('button', { hasText: 'Programar' }).click().catch(async () => {
      await pagina.locator('.pl-test', { hasText: 'Test 1' }).nth(1).locator('button', { hasText: 'Programar' }).click();
    });
    await botonHoja('Programar');
    await pagina.waitForSelector('.ui-confirm');
    await pagina.click('.ui-confirm-ok');
    await colaVacia();
    assert.equal(sql(`select count(*) from plan_tareas where fecha = '${h}'`), '4');
    assert.equal(sql(`select count(*) from plan_tareas where fecha = '${h}' and origen = 'excepcion'`), '1');
    assert.equal(sql(`select count(*) from plan_eventos where tipo = 'excepcion'`), '1');
    ok('el límite se respeta y la excepción queda apuntada');
  });

  await paso('d. Abrir un test de Tutor Bombero no lo completa; al volver se apunta el resultado', async () => {
    await pestana('hoy');
    await captura('04-hoy');
    const primera = pagina.locator('.pl-tarea', { hasText: 'Test 1' }).first();
    const [popup] = await Promise.all([ctx.waitForEvent('page'), primera.locator('button', { hasText: 'Abrir' }).click()]);
    assert.match(popup.url(), /^https:\/\/tutorbomberos\.es\/TEST\/index\.jsp/);
    await popup.close();
    await colaVacia();
    const t = sqlJson("select t.estado, t.abierta_at is not null as abierta, t.completada_at from plan_tareas t join plan_tests s on s.id = t.test_id where s.referencia = 'Constitución · Test 1'")[0];
    assert.deepEqual(t, { estado: 'en_curso', abierta: true, completada_at: null }, 'abrir no completa');
    assert.equal(sql("select count(*) from plan_eventos where tipo = 'abierto'"), '1');
    assert.equal(sql("select count(*) from plan_resultados"), '0');
    ok('abierto ≠ completado: la tarea queda «en curso» y hay evento «abierto»');
    // Vuelta inmediata (<20 s): no pregunta
    await pagina.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await pagina.waitForTimeout(300);
    assert.equal(await hoja().count(), 0, 'volver enseguida no pregunta');
    // Vuelta tras un rato: pregunta
    await pagina.evaluate(id => {
      const k = 'plan_apertura_v1_' + id; const a = JSON.parse(localStorage.getItem(k)); a.at -= 25 * 60000; localStorage.setItem(k, JSON.stringify(a));
      document.dispatchEvent(new Event('visibilitychange'));
    }, ADMIN);
    await pagina.waitForSelector('.pl-hoja');
    assert.match(await pagina.textContent('.pl-hoja h2'), /¿Has terminado «Test 1»\?/);
    await captura('05-has-terminado');
    await botonHoja('Sí, apuntar resultado');
    // Pegar un resultado copiado (con Texto en vivo, por ejemplo)
    await pagina.evaluate(() => navigator.clipboard.writeText('RESULTADO DEL TEST\nAciertos: 18\nFallos: 7\nSin contestar: 5'));
    await pagina.click('.pl-hoja [data-accion="pegar"]');
    await pagina.waitForFunction(() => document.querySelector('.pl-hoja [name="aciertos"]').value === '18');
    assert.equal(await pagina.inputValue('.pl-hoja [name="fallos"]'), '7');
    assert.equal(await pagina.inputValue('.pl-hoja [name="blancos"]'), '5');
    assert.match(await pagina.textContent('.pl-hoja .pl-nota-calc'), /5,22/);
    await captura('06-apuntar-resultado');
    await botonHoja('Guardar');
    await colaVacia();
    const r = sqlJson("select r.aciertos, r.fallos, r.blancos, r.total, r.nota::float, r.fuente, t.estado from plan_resultados r join plan_tareas t on t.id = r.tarea_id")[0];
    assert.deepEqual(r, { aciertos: 18, fallos: 7, blancos: 5, total: 30, nota: 5.22, fuente: 'manual', estado: 'completado' });
    assert.equal(sql("select count(*) from plan_tareas where resultado_id is not null"), '1');
    ok('resultado guardado (nota 5,22 con penalización) y tarea completada');
  });

  await paso('e. Avisos: test fuera del plan de hoy y test repetido', async () => {
    await pestana('tests');
    await pagina.locator('.pl-test', { hasText: 'Test 5' }).first().locator('button', { hasText: 'Abrir' }).click();
    await pagina.waitForSelector('.pl-hoja');
    assert.match(await pagina.textContent('.pl-hoja h2'), /no está en tu plan de hoy/);
    assert.ok(await pagina.isVisible('.pl-hoja-botones button:has-text("Ver mis tareas de hoy")'));
    await captura('07-fuera-de-plan');
    await botonHoja('Ver mis tareas de hoy');
    assert.equal(await pagina.getAttribute('#plTab-hoy', 'aria-selected'), 'true');
    await pestana('tests');
    await pagina.locator('.pl-test', { hasText: 'Constitución · Test 1' }).first().locator('button', { hasText: 'Abrir' }).click();
    await pagina.waitForSelector('.pl-hoja');
    assert.match(await pagina.textContent('.pl-hoja h2'), /Ya lo has hecho hoy|Ya hiciste/);
    await botonHoja('No, volver');
    await colaVacia();
    assert.equal(sql("select count(*) from plan_eventos where tipo = 'aviso_fuera_plan'"), '1');
    assert.equal(sql("select count(*) from plan_eventos where tipo = 'aviso_repetido'"), '1');
    ok('avisa de lo que no toca hoy y de lo ya hecho, y lo apunta');
  });

  await paso('f. Test de pj.fire: se registra solo al terminar', async () => {
    await pagina.locator('.pl-test', { hasText: 'Repaso CE en pj.fire' }).locator('button', { hasText: 'Programar' }).click();
    await botonHoja('Programar');
    await pagina.waitForSelector('.ui-confirm');   // el día ya está lleno: excepción
    await pagina.click('.ui-confirm-ok');
    await pestana('hoy');
    await pagina.locator('.pl-tarea', { hasText: 'Repaso CE en pj.fire' }).locator('button', { hasText: 'Abrir' }).click();
    await pagina.waitForSelector('#screen-quiz.active');
    for(let i = 0; i < 5; i++){
      await pagina.evaluate(k => { selectOption(k % 2 === 0 ? ACTIVE_QUESTIONS[quizState.index].correct : (ACTIVE_QUESTIONS[quizState.index].correct + 1) % 4); }, i);
      if(i < 4) await pagina.evaluate(() => nextQuestion());
    }
    await pagina.evaluate(() => confirmFinishQuiz());
    await pagina.waitForSelector('#screen-result.active', { timeout: 20000 });
    await colaVacia();
    const r = sqlJson("select r.fuente, r.aciertos, r.fallos, r.total, r.session_id is not null as con_sesion, jsonb_array_length(r.detalle) as det, t.estado from plan_resultados r join plan_tareas t on t.id = r.tarea_id where r.fuente = 'pjfire'");
    assert.equal(r.length, 1, 'un resultado de pj.fire');
    assert.deepEqual(r[0], { fuente: 'pjfire', aciertos: 3, fallos: 2, total: 5, con_sesion: true, det: 5, estado: 'completado' });
    assert.equal(sql("select count(*) from test_sessions where user_id = '" + ADMIN + "'"), '1');
    assert.equal(sql("select count(*) from plan_resultados where session_id = (select id from test_sessions limit 1)"), '1');
    ok('resultado de pj.fire con su sesión del banco y tarea completada');
    await pagina.reload();
    await esperarApp(pagina);
    await pagina.waitForTimeout(1500);
    assert.equal(sql("select count(*) from plan_resultados where fuente = 'pjfire'"), '1', 'no se duplica al recargar');
    ok('no se duplica al recargar');
  });

  await paso('g. Examen combinado: banco + preguntas propias', async () => {
    await pagina.click('#navPlan');
    await pestana('examenes');
    await captura('08-examenes');
    await pagina.click('text=+ Nueva pregunta');
    await pagina.selectOption('.pl-hoja [name="tema"]', { label: 'Tema 1 · Constitución Española' });
    await pagina.click('.pl-hoja [data-fuente="tutor_bombero"]');
    assert.ok(await pagina.isVisible('.pl-hoja .plx-aviso-tb'), 'aviso de no copiar tests enteros');
    await pagina.fill('.pl-hoja [name="referencia"]', 'TB · Test 4 · p. 7');
    await pagina.fill('.pl-hoja [name="enunciado"]', '¿Qué artículo de la Constitución regula la defensa de España?');
    await pagina.fill('.pl-hoja [name="op0"]', 'El 8');
    await pagina.fill('.pl-hoja [name="op1"]', 'El 30');
    await pagina.fill('.pl-hoja [name="op2"]', 'El 149');
    await pagina.check('.pl-hoja [name="correcta"][value="1"]');
    await pagina.fill('.pl-hoja [name="explicacion"]', 'Art. 30: derecho y deber de defender a España.');
    await botonHoja('Guardar');
    await pagina.click('text=+ Nueva pregunta');
    await pagina.fill('.pl-hoja [name="enunciado"]', '¿qué artículo de la constitución regula la defensa de españa');
    await pagina.fill('.pl-hoja [name="op0"]', 'a'); await pagina.fill('.pl-hoja [name="op1"]', 'b');
    await botonHoja('Guardar');
    assert.match(await pagina.textContent('.pl-hoja .pl-error-form'), /Ya tienes esta pregunta/);
    await botonHoja('Cancelar');
    await colaVacia();
    assert.equal(sql("select count(*) from plan_preguntas"), '1');
    ok('pregunta propia guardada y la duplicada rechazada');
    await pagina.click('.pl-chip:has-text("1. Constitución Española")');
    await pagina.click('.pl-chip[role="radio"]:has-text("60")');
    await pagina.click('text=Generar examen');
    await pagina.waitForSelector('.pl-hoja');
    assert.match(await pagina.textContent('.pl-hoja'), /41 preguntas/);
    await botonHoja('Empezar');
    await pagina.waitForSelector('#screen-plan-examen.active .plx-preg');
    const n = await pagina.locator('.plx-preg').count();
    assert.equal(n, 41);
    const fuentes = await pagina.locator('.plx-preg .pl-plat').allTextContents();
    assert.ok(fuentes.some(f => /Tutor Bombero/.test(f)) && fuentes.some(f => /Banco pj\.fire/.test(f)), 'mezcla de fuentes: ' + fuentes.join(','));
    await captura('09-examen-en-curso');
    // Responde todas: la primera opción
    for(let i = 0; i < n; i++) await pagina.locator('#plxP' + i + ' .plx-op').first().click();
    assert.match(await pagina.textContent('#plxCuenta'), /41 \/ 41/);
    await pagina.click('.plx-barra button:has-text("Terminar")');
    await pagina.waitForSelector('.plx-resumen');
    await captura('10-correccion');
    await colaVacia();
    await pagina.waitForTimeout(800);
    const r = sqlJson("select fuente, total, aciertos + fallos + blancos as suma, jsonb_array_length(detalle) as det, session_id is not null as con_sesion from plan_resultados where fuente = 'examen'");
    assert.deepEqual(r, [{ fuente: 'examen', total: 41, suma: 41, det: 41, con_sesion: true }]);
    assert.equal(sql("select total from test_sessions where id = (select session_id from plan_resultados where fuente = 'examen')"), '40', 'al historial del banco solo van las 40 del banco');
    ok('examen guardado en el Plan (41) y la parte del banco en Legislación (40)');
    // Errores recurrentes: fallar la propia otra vez
    await pagina.click('.plx-barra button:has-text("Volver al plan")');
    await pagina.click('.pl-chip:has-text("1. Constitución Española")');   // quitar el filtro
    await pagina.click('.pl-chip:has-text("Banco de pj.fire")');          // solo mis preguntas
    await pagina.click('text=Generar examen');
    await botonHoja('Empezar');
    await pagina.locator('#plxP0 .plx-op').first().click();   // «El 8»: mal
    await pagina.click('.plx-barra button:has-text("Terminar")');
    await pagina.waitForSelector('.plx-resumen');
    await pagina.click('.plx-barra button:has-text("Volver al plan")');
    await pagina.waitForSelector('text=Errores recurrentes');
    assert.match(await pagina.textContent('.pl-card:has(.pl-seccion:has-text("Errores recurrentes"))'), /defensa de España/);
    ok('la pregunta fallada dos veces aparece en errores recurrentes');
  });

  await paso('h. Progreso cuadra con la base de datos', async () => {
    await pestana('progreso');
    await pagina.waitForSelector('.plp-kpis');
    await captura('11-progreso');
    const hechos = Number(sql("select count(*) from plan_resultados"));
    const kpi = await pagina.locator('.plp-kpi', { hasText: 'Tests hechos' }).locator('.plp-kpi-val').textContent();
    assert.equal(Number(kpi), hechos, 'tests hechos = resultados en BD');
    const media = Number(sql("select round(avg(nota), 4) from plan_resultados where nota is not null"));
    const kpiNota = (await pagina.locator('.plp-kpi', { hasText: 'Nota media' }).locator('.plp-kpi-val').textContent()).replace(',', '.');
    assert.ok(Math.abs(Number(kpiNota) - media) < 0.006, 'nota media ' + kpiNota + ' ≈ ' + media);
    const h = hoyMadrid();
    const prev = Number(sql(`select count(*) from plan_tareas where fecha <= '${h}'`));
    const comp = Number(sql(`select count(*) from plan_tareas where fecha <= '${h}' and estado = 'completado'`));
    const kpiPlan = await pagina.locator('.plp-kpi', { hasText: 'Plan cumplido' }).locator('.plp-kpi-sub').textContent();
    assert.match(kpiPlan, new RegExp('^' + comp + ' de ' + prev));
    assert.ok(await pagina.locator('svg.plp-svg').count() >= 2, 'gráficos pintados');
    ok('las cifras de Progreso cuadran con la base de datos');
  });

  await paso('i. Exportar e importar sin duplicar', async () => {
    await pagina.click('#plBtnAjustes');
    const [descarga] = await Promise.all([pagina.waitForEvent('download'), pagina.click('text=Exportar (JSON)')]);
    const ruta = CAPTURAS + '/copia-plan.json';
    await descarga.saveAs(ruta);
    const copia = JSON.parse((await import('node:fs')).readFileSync(ruta, 'utf8'));
    assert.equal(copia.tipo, 'plan-de-estudio');
    assert.equal(copia.tablas.plan_tests.length, 11);
    const antes = sql("select (select count(*) from plan_temas) || '-' || (select count(*) from plan_tests) || '-' || (select count(*) from plan_tareas) || '-' || (select count(*) from plan_resultados)");
    // Borrar un test (con su tarea) y reimportar: vuelve, sin duplicar lo demás
    await pagina.click('text=Volver al plan');
    await pestana('tests');
    await pagina.locator('.pl-test', { hasText: 'Test 6' }).first().locator('.pl-icono').click();
    await botonHoja('Borrar');
    await pagina.click('.ui-confirm-ok');
    await colaVacia();
    assert.equal(sql("select count(*) from plan_tests"), '10');
    await pagina.click('#plBtnAjustes');
    const [elegir] = await Promise.all([pagina.waitForEvent('filechooser'), pagina.click('text=Importar una copia')]);
    await elegir.setFiles(ruta);
    await pagina.waitForSelector('.ui-confirm');
    await pagina.click('.ui-confirm-ok');
    await colaVacia();
    const despues = sql("select (select count(*) from plan_temas) || '-' || (select count(*) from plan_tests) || '-' || (select count(*) from plan_tareas) || '-' || (select count(*) from plan_resultados)");
    assert.equal(despues, antes, 'tras importar queda igual que antes de borrar (sin duplicados)');
    ok('copia exportada (' + antes + ') y reimportada sin duplicar');
  });

  await paso('j. Sin conexión: se guarda en el dispositivo y se sube una sola vez', async () => {
    await pagina.click('text=Volver al plan');
    await pestana('plan');
    const manana = sql("select ((now() at time zone 'Europe/Madrid')::date + 1)");
    const antes = Number(sql(`select count(*) from plan_tareas where fecha = '${manana}'`));
    await ctx.setOffline(true);
    await pagina.evaluate(() => window.dispatchEvent(new Event('offline')));
    await pagina.evaluate(f => PLAN.anadirTarea(f), manana);
    await pagina.locator('.pl-elegir-item:not([disabled])').first().click();
    await botonHoja('Añadir');
    await pagina.waitForTimeout(500);
    const enCola = await pagina.evaluate(id => (JSON.parse(localStorage.getItem('plan_cola_v1_' + id)) || []).length, ADMIN);
    assert.ok(enCola >= 1, 'el cambio queda en la cola del dispositivo');
    assert.equal(Number(sql(`select count(*) from plan_tareas where fecha = '${manana}'`)), antes, 'aún no está en el servidor');
    await ctx.setOffline(false);
    await pagina.evaluate(() => window.dispatchEvent(new Event('online')));
    await colaVacia();
    assert.equal(Number(sql(`select count(*) from plan_tareas where fecha = '${manana}'`)), antes + 1, 'subido una vez');
    await pagina.evaluate(() => window.dispatchEvent(new Event('online')));
    await pagina.waitForTimeout(800);
    assert.equal(Number(sql(`select count(*) from plan_tareas where fecha = '${manana}'`)), antes + 1, 'sin duplicados al reintentar');
    ok('sin conexión se guarda y se sube una sola vez');
  });

  await paso('k. Recargar en el Plan vuelve al Plan con los datos', async () => {
    await pagina.reload();
    await esperarApp(pagina);
    await pagina.waitForSelector('#screen-plan.active .pl-pestanas');
    assert.ok(await pagina.locator('.pl-dia, .pl-tarea').count() > 0);
    ok('tras recargar sigue en el Plan');
  });

  await paso('l. Capturas: iPad vertical y horizontal, móvil, claro y oscuro', async () => {
    for(const [nombre, perfil] of [['ipad-v', IPAD], ['ipad-h', IPAD_H], ['movil', MOVIL]]){
      for(const tema of ['oscuro', 'claro']){
        const c = await nuevoContexto(nav, perfil);
        await entrarConSesion(c, 'admin@prueba.es');
        await c.addInitScript(t => { try{ localStorage.setItem('pjfire_theme', t); localStorage.setItem('legis_last_screen', 'screen-plan'); }catch(e){} }, tema === 'claro' ? 'light' : 'dark');
        const p = await c.newPage();
        vigilarErrores(p, errores);
        await p.goto(APP + '/index.html');
        await esperarApp(p);
        for(const tab of ['hoy', 'plan', 'tests', 'examenes', 'progreso']){
          await p.click('#plTab-' + tab);
          await p.waitForTimeout(250);
          await p.screenshot({ path: CAPTURAS + '/v-' + nombre + '-' + tema + '-' + tab + '.png', fullPage: tab !== 'progreso' });
        }
        await p.click('#plTab-plan');
        await p.click('.pl-segmento button:has-text("Mes")');
        await p.screenshot({ path: CAPTURAS + '/v-' + nombre + '-' + tema + '-mes.png' });
        await p.click('.pl-segmento button:has-text("Semana")');
        await c.close();
      }
    }
    ok('capturas guardadas en ' + CAPTURAS);
  });

  const inesperados = errores.filter(e => !ESPERADOS.some(re => re.test(e)));
  writeFileSync(CAPTURAS + '/errores-consola.txt', errores.join('\n'));
  assert.deepEqual(inesperados, [], 'errores inesperados en la consola');
  console.log('\nTODO BIEN: todos los escenarios E2E del Plan han pasado.');
} finally {
  await nav.close();
}
