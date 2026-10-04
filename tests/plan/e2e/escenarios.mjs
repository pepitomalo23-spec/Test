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

  await paso('e2. Un test ya programado otro día se pasa a hoy (no se duplica); «18/30» no inventa la nota', async () => {
    const manana = sql("select ((now() at time zone 'Europe/Madrid')::date + 1)");
    const h = hoyMadrid();
    await pestana('tests');
    await pagina.locator('.pl-test', { hasText: 'Constitución · Test 5' }).locator('button', { hasText: 'Programar' }).click();
    await pagina.fill('.pl-hoja [name="fecha"]', manana);
    await botonHoja('Programar');
    await colaVacia();
    await pagina.locator('.pl-test', { hasText: 'Constitución · Test 5' }).locator('button', { hasText: 'Abrir' }).click();
    await pagina.waitForSelector('.pl-hoja');
    assert.match(await pagina.textContent('.pl-hoja'), /Lo tienes programado para el/);
    const [popup] = await Promise.all([ctx.waitForEvent('page'), pagina.locator('.pl-hoja-botones button', { hasText: /^Pasarlo a hoy/ }).click()]);
    await popup.close();
    await pagina.waitForSelector('.ui-confirm', { timeout: 1500 }).then(() => pagina.click('.ui-confirm-ok')).catch(() => {});
    await colaVacia();
    const t5 = sqlJson("select t.fecha::text as fecha, t.estado from plan_tareas t join plan_tests s on s.id = t.test_id where s.referencia = 'Constitución · Test 5'");
    assert.deepEqual(t5, [{ fecha: h, estado: 'en_curso' }], 'una sola tarea, movida a hoy: ' + JSON.stringify(t5));
    ok('el test programado otro día se trae a hoy, sin duplicarlo');
    // Volver y pegar «18/30»: sin fallos, la nota no se inventa
    await pagina.evaluate(id => {
      const k = 'plan_apertura_v1_' + id; const a = JSON.parse(localStorage.getItem(k)); a.at -= 25 * 60000; localStorage.setItem(k, JSON.stringify(a));
      document.dispatchEvent(new Event('visibilitychange'));
    }, ADMIN);
    await pagina.waitForSelector('.pl-hoja');
    await botonHoja('Sí, apuntar resultado');
    await pagina.evaluate(() => navigator.clipboard.writeText('Has acertado 18 de 30 preguntas'));
    await pagina.click('.pl-hoja [data-accion="pegar"]');
    await pagina.waitForFunction(() => document.querySelector('.pl-hoja [name="aciertos"]').value === '18');
    assert.equal(await pagina.inputValue('.pl-hoja [name="nota"]'), '');
    assert.match(await pagina.textContent('.pl-hoja .pl-nota-calc'), /hacen falta los fallos/);
    await botonHoja('Guardar');
    await colaVacia();
    const r = sqlJson("select r.aciertos, r.fallos, r.total, r.nota from plan_resultados r join plan_tests s on s.id = r.test_id where s.referencia = 'Constitución · Test 5'");
    assert.deepEqual(r, [{ aciertos: 18, fallos: null, total: 30, nota: null }]);
    ok('«18 de 30» se guarda sin inventar fallos ni nota');
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

  await paso('m. Importar un archivo manipulado no cuela HTML ni datos raros', async () => {
    const malo = { app: 'pj.fire', tipo: 'plan-de-estudio', version: 1, usuario: '00000000-0000-4000-8000-0000000000ff', tablas: {
      plan_temas: [{ id: '11111111-1111-4111-8111-111111111111', nombre: '<img src=x onerror="window.__xss=1">Tema raro', numero: 7 }],
      plan_tests: [
        { id: '22222222-2222-4222-8222-222222222222', plataforma: 'pjfire', nombre: 'Malicioso', tema_id: '11111111-1111-4111-8111-111111111111',
          config: { modo: 'estudio', n: '<img src=x onerror="window.__xss=2">', topic_ids: ['CE'] } },
        { id: '33333333-3333-4333-8333-333333333333', plataforma: 'tutor_bombero', nombre: 'Con enlace malo', url: 'javascript:window.__xss=3' }
      ],
      plan_resultados: [{ id: '44444444-4444-4444-8444-444444444444', fuente: 'manual', realizado_at: '2026-10-01T10:00:00Z', aciertos: '<img src=x onerror="window.__xss=4">', total: 10 }],
      plan_tareas: [{ id: '55555555-5555-4555-8555-555555555555', test_id: '22222222-2222-4222-8222-222222222222', fecha: '2026-10-20', estado: '"><img src=x onerror="window.__xss=5">' }]
    } };
    const ruta = CAPTURAS + '/malicioso.json';
    writeFileSync(ruta, JSON.stringify(malo));
    await pagina.click('#plBtnAjustes');
    const [elegir] = await Promise.all([pagina.waitForEvent('filechooser'), pagina.click('text=Importar una copia')]);
    await elegir.setFiles(ruta);
    await pagina.waitForSelector('.ui-confirm');
    await pagina.click('.ui-confirm-ok');
    await colaVacia();
    await pagina.click('text=Volver al plan');
    for(const tab of ['hoy', 'plan', 'tests', 'progreso']){ await pestana(tab); await pagina.waitForTimeout(200); }
    assert.equal(await pagina.evaluate(() => window.__xss), undefined, 'no se ha ejecutado nada');
    const cfg = sqlJson("select nombre, config->>'n' as n, url from plan_tests where nombre in ('Malicioso', 'Con enlace malo') order by nombre");
    assert.deepEqual(cfg, [{ nombre: 'Malicioso', n: '20', url: null }], 'el test del enlace malo no se importa y n se corrige: ' + JSON.stringify(cfg));
    assert.equal(sql("select count(*) from plan_resultados where aciertos is null and nota is null"), '0');
    assert.equal(sql("select count(*) from plan_tareas where fecha = '2026-10-20'"), '0', 'la tarea con estado raro no se importa');
    assert.equal(sql("select count(*) from plan_tests where id = '22222222-2222-4222-8222-222222222222'"), '0', 'de otra cuenta: ids nuevos');
    ok('lo no válido se descarta y nada se ejecuta');
  });

  await paso('n. Marcador de Tutor Bombero: tests por tema, resultado y preguntas de la corrección (sin contraseña)', async () => {
    // Páginas SIMULADAS de Tutor Bombero, servidas en su dominio real dentro del navegador de pruebas.
    const TB = 'https://tutorbomberos.es/TEST/';
    const pagTb = n => new URL('./tb/' + n, import.meta.url).pathname;
    await ctx.route(TB + 'mis-tests.jsp', r => r.fulfill({ path: pagTb('mis-tests.html'), contentType: 'text/html; charset=utf-8' }));
    await ctx.route(TB + 'resultado.jsp**', r => r.fulfill({ path: pagTb('resultado.html'), contentType: 'text/html; charset=utf-8' }));
    await ctx.route(TB + 'inicio.jsp', r => r.fulfill({ path: pagTb('vacia.html'), contentType: 'text/html; charset=utf-8' }));
    // 1) Instalar: el código del favorito carga el marcador de esta misma web
    await pestana('hoy');
    await pagina.click('.pl-tb-card >> text=Instalar el marcador');
    await captura('20-marcador-instalar');
    await botonHoja('Copiar el código');
    const codigo = await pagina.evaluate(() => navigator.clipboard.readText());
    assert.match(codigo, /^javascript:\(function\(\)\{var s=document\.createElement\('script'\);s\.src='http:\/\/127\.0\.0\.1:\d+\/marcador\/tutor-bombero\.js\?t='/);
    await botonHoja('Cerrar');
    // En producción pj.fire está en un dominio público (Vercel). Aquí está en 127.0.0.1, y
    // Chromium no deja que una web pública cargue scripts de la red local: se sirve el
    // mismo archivo desde un dominio público simulado y solo se cambia eso en el código.
    await ctx.route('https://pjfire.test/marcador/**', r => r.fulfill({ path: new URL('../../../marcador/tutor-bombero.js', import.meta.url).pathname, contentType: 'text/javascript; charset=utf-8' }));
    const codigoPublico = codigo.replace(/http:\/\/127\.0\.0\.1:\d+/, 'https://pjfire.test');
    const enPanel = p => p.evaluate(() => { const h = document.getElementById('pjfire-marcador-tb'); return h ? h.shadowRoot.textContent : ''; });
    // Tocar el favorito = ejecutar su código en la página de Tutor Bombero
    const tocarMarcador = async p => {
      await p.evaluate(c => { (0, eval)(c.replace(/^javascript:/, '')); }, codigoPublico);
      await p.waitForFunction(() => { const h = document.getElementById('pjfire-marcador-tb'); return h && h.shadowRoot && h.shadowRoot.querySelector('.p'); });
    };
    const tb = await ctx.newPage();
    vigilarErrores(tb, errores);
    // 2) Lista de tests por tema (tabla, acordeón plegado, botones y desplegables)
    await tb.goto(TB + 'mis-tests.jsp');
    await tocarMarcador(tb);
    let txt = await enPanel(tb);
    assert.match(txt, /Tests en esta página: 11/, txt);
    assert.ok(!/Resultado/.test(txt), 'una lista de tests no es un resultado: ' + txt);
    for(const g of ['Tema 1 · La constitución española de 1978 · 3', 'Tema 2 · Prevención de riesgos laborales · 2', 'Tema 3 · Ley de Emergencias · 2', 'Sin tema · 2', 'Tema 4 · Incendios · 2']) assert.ok(txt.includes(g), 'grupo «' + g + '» en: ' + txt);
    await tb.screenshot({ path: CAPTURAS + '/21-marcador-lista-tests.png' });
    await tb.locator('#pjfire-marcador-tb button', { hasText: 'Copiar para pj.fire' }).click();
    await tb.waitForFunction(() => /Copiado/.test(document.getElementById('pjfire-marcador-tb').shadowRoot.textContent));
    const lista = await tb.evaluate(() => navigator.clipboard.readText());
    assert.match(lista, /^pj\.fire · Tutor Bombero \(marcador\)\n\{"pjfire":"tutor_bombero","v":1,"tipo":"tests"/);
    assert.ok(!/pepito|correo|Hacer test|Repetir|realizado/.test(lista), 'solo nombres de tests: ' + lista);
    ok('el marcador encuentra 11 tests en 5 grupos y copia solo sus nombres');
    // En pj.fire: «Pegar de Tutor Bombero» → al catálogo, cada uno en su tema
    const antes = Number(sql("select count(*) from plan_tests"));
    await pagina.bringToFront();
    await pestana('tests');
    await pagina.click('.pl-barra-tests >> text=Pegar de Tutor Bombero');
    await pagina.waitForSelector('.pl-hoja >> text=Tests de Tutor Bombero');
    txt = await hoja().textContent();
    assert.match(txt, /He recibido 11 tests de 5 temas: 8 nuevos y 3 que ya tenías/, txt);
    assert.match(txt, /tema nuevo: «Tema 4 · Incendios»/);
    await pagina.waitForTimeout(400);
    await captura('22-marcador-importar');
    await botonHoja('Añadir al catálogo');
    await pagina.waitForSelector('.pl-hoja >> text=Planificar automáticamente');
    await botonHoja('Cancelar');
    await colaVacia();
    assert.equal(Number(sql("select count(*) from plan_tests")), antes + 8);
    const donde = sqlJson("select s.referencia, s.nombre, m.numero, m.nombre as tema from plan_tests s left join plan_temas m on m.id = s.tema_id where s.created_at > now() - interval '5 minutes' and s.plataforma = 'tutor_bombero' and s.referencia in ('Tema 1 · Test 7', 'Simulacro 2', 'Tema 4 · Test 1', 'Tema 3 · Test 2') order by s.referencia");
    assert.deepEqual(donde, [
      { referencia: 'Simulacro 2', nombre: 'Simulacro 2', numero: null, tema: null },
      { referencia: 'Tema 1 · Test 7', nombre: 'Test 7', numero: 1, tema: 'Constitución Española' },
      { referencia: 'Tema 3 · Test 2', nombre: 'Test 2', numero: 3, tema: 'Ley de Emergencias' },
      { referencia: 'Tema 4 · Test 1', nombre: 'Test 1', numero: 4, tema: 'Incendios' }]);
    assert.equal(sql("select count(*) from plan_temas where numero = 4"), '1');
    // Pegar lo mismo otra vez no duplica nada
    await pagina.click('.pl-barra-tests >> text=Pegar de Tutor Bombero');
    await pagina.waitForSelector('.pl-hoja >> text=Tests de Tutor Bombero');
    assert.match(await hoja().textContent(), /0 nuevos y 11 que ya tenías/);
    await botonHoja('Cerrar');
    ok('8 tests nuevos en su tema (el tema 4 se crea), 3 repetidos saltados; pegarlo otra vez no duplica');
    // 3) Resultado: «Tema 1 · Test 7» para hoy, hecho en Tutor Bombero, marcador y pegar
    const idT7 = sql("select id from plan_tests where referencia = 'Tema 1 · Test 7'");
    await pestana('hoy');
    pagina.evaluate(id => { PLAN.programarHoy(id); }, idT7);
    await pagina.waitForTimeout(400);
    const excepcion = pagina.locator('.ui-confirm-bg button', { hasText: 'Añadir como excepción' });
    if(await excepcion.count()) await excepcion.click();
    await colaVacia();
    assert.equal(sql("select estado from plan_tareas where test_id = '" + idT7 + "'"), 'pendiente');
    await tb.bringToFront();
    await tb.goto(TB + 'resultado.jsp;jsessionid=ABC123?id=7');
    await tocarMarcador(tb);
    txt = await enPanel(tb);
    assert.match(txt, /Resultado: TEMA 1 - TEST 7/);
    assert.ok(!/Tests en esta página/.test(txt), 'el título del test no cuenta como lista: ' + txt);
    assert.match(txt, /Preguntas en esta página: 3/, txt);
    assert.match(txt, /2 con su respuesta correcta/, txt);
    await tb.screenshot({ path: CAPTURAS + '/23-marcador-resultado.png' });
    await tb.locator('#pjfire-marcador-tb button', { hasText: 'Copiar resultado para pj.fire' }).click();
    await tb.waitForFunction(() => /Copiado/.test(document.getElementById('pjfire-marcador-tb').shadowRoot.textContent));
    const res = await tb.evaluate(() => navigator.clipboard.readText());
    assert.ok(res.includes('"lineas":["Aciertos\\tFallos\\tSin contestar\\tNota","21\\t6\\t3\\t7,00","Tiempo empleado: 24:10"]'), res);
    assert.ok(res.includes('"pagina":"/TEST/resultado.jsp"') && !/ABC123|artículo/.test(res), 'el resultado va sin sesión ni preguntas: ' + res);
    await pagina.bringToFront();
    await pagina.click('.pl-tb-card >> text=Pegar de Tutor Bombero');
    await pagina.waitForSelector('.ui-toast >> text=Guardado: Test 7 · nota 6,33');
    await colaVacia();
    const r = sqlJson("select r.aciertos, r.fallos, r.blancos, r.total, r.nota::float, r.notas, r.fuente, t.estado from plan_resultados r join plan_tareas t on t.id = r.tarea_id where r.test_id = '" + idT7 + "'");
    assert.deepEqual(r, [{ aciertos: 21, fallos: 6, blancos: 3, total: 30, nota: 6.33, notas: 'Nota en Tutor Bombero: 7,00', fuente: 'manual', estado: 'completado' }]);
    assert.equal(sql("select datos->>'fuente' from plan_eventos where tipo = 'completado' and test_id = '" + idT7 + "'"), 'marcador');
    await captura('24-marcador-guardado');
    ok('resultado guardado en su tarea (completada) con la nota de pj.fire (6,33; la de Tutor Bombero queda en las notas)');
    // Las preguntas de la corrección → «Mis preguntas» (solo las que tienen la correcta),
    // después de desplegar las explicaciones plegadas de la página
    await tb.bringToFront();
    assert.match(await enPanel(tb), /Hay 1 explicación plegada/);
    await tb.locator('#pjfire-marcador-tb button', { hasText: 'Desplegarlas y volver a leer' }).click();
    await tb.waitForFunction(() => !/Hay 1 explicación plegada/.test(document.getElementById('pjfire-marcador-tb').shadowRoot.textContent) && /Preguntas en esta página/.test(document.getElementById('pjfire-marcador-tb').shadowRoot.textContent));
    assert.equal(await tb.url(), 'https://tutorbomberos.es/TEST/resultado.jsp;jsessionid=ABC123?id=7', 'no cambia de página');
    await tb.locator('#pjfire-marcador-tb button', { hasText: 'Copiar 2 preguntas para pj.fire' }).click();
    await tb.waitForFunction(() => /Copiado/.test(document.getElementById('pjfire-marcador-tb').shadowRoot.textContent));
    await pagina.bringToFront();
    await pagina.click('.pl-tb-card >> text=Pegar de Tutor Bombero');
    await pagina.waitForSelector('.pl-hoja >> text=Preguntas de Tutor Bombero');
    assert.match(await hoja().textContent(), /2 nuevas/);
    assert.match(await hoja().textContent(), /2 van a su tema por el nombre de su test/, 'el tema sale del título');
    await captura('25-marcador-preguntas');
    await botonHoja('Guardar 2 preguntas');
    await colaVacia();
    const pq = sqlJson("select p.enunciado, p.opciones, p.correcta, p.explicacion, p.referencia, m.numero from plan_preguntas p left join plan_temas m on m.id = p.tema_id where p.fuente = 'tutor_bombero' and p.referencia = 'TEMA 1 - TEST 7' order by p.enunciado");
    assert.deepEqual(pq, [
      { enunciado: 'Según la Ley 17/2015, la protección civil es un servicio público.', opciones: ['Verdadero', 'Falso'], correcta: 0, explicacion: 'artículo 1 de la Ley 17/2015.', referencia: 'TEMA 1 - TEST 7', numero: 1 },
      { enunciado: '¿Qué artículo de la Constitución regula la defensa?', opciones: ['El 8', 'El 30', 'El 15', 'El 2'], correcta: 1, explicacion: 'El artículo 30 recoge el derecho y el deber de defender a España.', referencia: 'TEMA 1 - TEST 7', numero: 1 }]);
    const nPreg = sql("select count(*) from plan_preguntas where fuente = 'tutor_bombero' and (created_at at time zone 'Europe/Madrid')::date = (now() at time zone 'Europe/Madrid')::date");
    assert.match(await pagina.textContent('.pl-tb-cifras'), new RegExp(nPreg + '\\s*preguntas guardadas'), 'el resumen del día cuenta las preguntas de hoy');
    // Otra vez lo mismo: nada nuevo
    await tb.bringToFront();
    await tb.locator('#pjfire-marcador-tb button', { hasText: 'Copiar 2 preguntas para pj.fire' }).click();
    await pagina.bringToFront();
    await pagina.click('.pl-tb-card >> text=Pegar de Tutor Bombero');
    await pagina.waitForSelector('.pl-hoja >> text=Preguntas de Tutor Bombero');
    assert.match(await hoja().textContent(), /0 nuevas, 2 que ya tenías/);
    await botonHoja('Cerrar');
    ok('las preguntas de la corrección (con su correcta, por clase o por «Respuesta correcta») van a «Mis preguntas» de su tema, sin duplicar');
    // Un resultado de un test del catálogo que no está en el plan: se guarda igual
    await pagina.evaluate(() => navigator.clipboard.writeText('pj.fire · Tutor Bombero (marcador)\n{"pjfire":"tutor_bombero","v":1,"tipo":"resultado","titulo":"Simulacro 2","lineas":["Aciertos: 40","Fallos: 10","En blanco: 0"]}'));
    await pagina.click('.pl-tb-card >> text=Pegar de Tutor Bombero');
    await pagina.waitForSelector('.ui-toast >> text=(no estaba en tu plan)');
    await colaVacia();
    assert.deepEqual(sqlJson("select r.aciertos, r.nota::float, r.tarea_id from plan_resultados r join plan_tests s on s.id = r.test_id where s.referencia = 'Simulacro 2'"), [{ aciertos: 40, nota: 7.33, tarea_id: null }]);
    ok('un test del catálogo sin tarea: el resultado se guarda en el test');
    // 4) Página sin tests ni resultado: diagnóstico sin datos personales
    await tb.bringToFront();
    await tb.goto(TB + 'inicio.jsp');
    await tocarMarcador(tb);
    assert.match(await enPanel(tb), /no encuentro ni tests ni un resultado/);
    await tb.locator('#pjfire-marcador-tb button', { hasText: 'Copiar diagnóstico' }).click();
    await tb.waitForFunction(() => /Copiado/.test(document.getElementById('pjfire-marcador-tb').shadowRoot.textContent));
    const diag = await tb.evaluate(() => navigator.clipboard.readText());
    assert.match(diag, /^pj\.fire · diagnóstico del marcador/);
    assert.ok(diag.includes('[correo]') && diag.includes('[número]') && !/pepito|12345678/.test(diag), diag);
    ok('página sin nada: ofrece un diagnóstico sin correos ni números personales');
    // 5) Fuera de Tutor Bombero no lee nada
    await ctx.route('https://otra-web.test/', r => r.fulfill({ status: 200, contentType: 'text/html', body: '<html><body><h1>Otra web</h1><p>Test 1</p></body></html>' }));
    const otra = await ctx.newPage();
    await otra.goto('https://otra-web.test/');
    await tocarMarcador(otra);
    assert.match(await enPanel(otra), /Este marcador es para la web de Tutor Bombero/);
    await otra.close();
    await tb.close();
    ok('en otra web solo avisa de que es para Tutor Bombero');
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
