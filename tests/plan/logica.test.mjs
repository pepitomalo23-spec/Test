// Pruebas de js/plan-logica.js (PLANL). Ejecutar: node --test tests/plan/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const P = require('../../js/plan-logica.js');

const AJ = (o = {}) => ({ limite_diario: 3, dias_estudio: [1, 2, 3, 4, 5, 6], reglas: {}, ...o });
const tarea = (o) => ({ id: o.id || 't' + Math.random().toString(36).slice(2), test_id: 'x', fecha: '2026-10-06',
  estado: 'pendiente', prioridad: 2, orden: 0, veces_aplazada: 0, created_at: '2026-10-01T10:00:00Z', ...o });

test('hoy: día civil en Madrid alrededor de medianoche y de los cambios de hora', () => {
  assert.equal(P.hoy(new Date('2026-10-03T21:59:59Z')), '2026-10-03');   // 23:59:59 en verano (UTC+2)
  assert.equal(P.hoy(new Date('2026-10-03T22:00:00Z')), '2026-10-04');   // 00:00 en Madrid
  assert.equal(P.hoy(new Date('2026-12-31T22:59:59Z')), '2026-12-31');   // invierno (UTC+1)
  assert.equal(P.hoy(new Date('2026-12-31T23:00:00Z')), '2027-01-01');
  assert.equal(P.hoy(new Date('2026-03-29T00:59:59Z')), '2026-03-29');   // día del cambio a verano
  assert.equal(P.hoy(new Date('2026-10-25T22:59:59Z')), '2026-10-25');   // día del cambio a invierno
  // El cálculo sin Intl coincide con Intl
  for(const iso of ['2026-03-29T00:59:59Z', '2026-03-29T01:00:00Z', '2026-10-25T00:59:59Z', '2026-10-25T01:00:00Z', '2026-07-01T22:30:00Z']){
    assert.equal(P._diaMadridSinIntl(Date.parse(iso)), P.hoy(new Date(iso)), iso);
  }
});

test('aritmética de fechas', () => {
  assert.equal(P.sumarDias('2026-10-31', 1), '2026-11-01');
  assert.equal(P.sumarDias('2026-03-28', 2), '2026-03-30');
  assert.equal(P.diaSemana('2026-10-05'), 1);   // lunes
  assert.equal(P.diaSemana('2026-10-04'), 7);   // domingo
  assert.equal(P.lunesDe('2026-10-04'), '2026-09-28');
  assert.deepEqual(P.rango('2026-10-30', '2026-11-02'), ['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02']);
  assert.equal(P.diasEntre('2026-10-01', '2026-10-31'), 30);
  assert.equal(P.diasDelMes('2026-02-10').length, 28);
  assert.equal(P.fechaLarga('2026-10-06'), 'martes, 6 de octubre');
  assert.equal(P.sumarDias('no', 1), null);
});

test('ajustes: valores por defecto y reglas mezcladas', () => {
  const a = P.ajustesDe(null);
  assert.equal(a.limite_diario, 3);
  assert.deepEqual(a.dias_estudio, [1, 2, 3, 4, 5, 6]);
  assert.equal(a.reglas.respetar_limite, true);
  const b = P.ajustesDe({ limite_diario: 50, dias_estudio: '{7,1,1}', reglas: { respetar_limite: false, umbral_repaso: 150, __proto__x: 1 } });
  assert.equal(b.limite_diario, 20);
  assert.deepEqual(b.dias_estudio, [1, 7]);
  assert.equal(b.reglas.respetar_limite, false);
  assert.equal(b.reglas.umbral_repaso, 100);
  assert.equal(P.esDiaDeEstudio('2026-10-04', a), false);   // domingo
});

test('atrasadas y orden del día', () => {
  const h = '2026-10-06';
  const ts = [
    tarea({ id: 'a', fecha: '2026-10-04', prioridad: 2 }),
    tarea({ id: 'b', fecha: '2026-10-05', estado: 'completado', completada_at: 'x' }),
    tarea({ id: 'c', fecha: '2026-10-03', prioridad: 1 }),
    tarea({ id: 'd', fecha: h }),
  ];
  assert.deepEqual(P.atrasadas(ts, h).map(t => t.id), ['c', 'a']);
  const dia = [
    tarea({ id: '1', fecha: h, prioridad: 3 }),
    tarea({ id: '2', fecha: h, prioridad: 2 }),
    tarea({ id: '3', fecha: h, prioridad: 2, veces_aplazada: 1, estado: 'aplazado' }),
    tarea({ id: '4', fecha: h, prioridad: 3, estado: 'en_curso' }),
    tarea({ id: '5', fecha: h, prioridad: 1, estado: 'completado', completada_at: 'x' }),
  ];
  assert.deepEqual(P.ordenarDia(dia, h, P.REGLAS_DEF).map(t => t.id), ['4', '3', '2', '1', '5']);
  assert.deepEqual(P.ordenarDia(dia, h, { priorizar_pendientes: false }).map(t => t.id), ['4', '2', '3', '1', '5']);
});

test('límite diario', () => {
  const ts = [tarea({ fecha: '2026-10-06' }), tarea({ fecha: '2026-10-06', estado: 'completado', completada_at: 'x' }), tarea({ fecha: '2026-10-06' })];
  assert.deepEqual(P.puedeAnadir(ts, '2026-10-06', AJ()), { ok: false, usados: 3, limite: 3 });
  assert.equal(P.puedeAnadir(ts, '2026-10-06', AJ({ reglas: { respetar_limite: false } })).ok, true);
  assert.equal(P.puedeAnadir(ts, '2026-10-07', AJ()).ok, true);
});

test('evaluarApertura: todos los casos', () => {
  const h = '2026-10-06';
  const test1 = { id: 'T1' };
  const base = { test: test1, hoy: h, ajustes: AJ() };
  // En el plan de hoy
  const enPlan = P.evaluarApertura({ ...base, tareas: [tarea({ id: 'k', test_id: 'T1', fecha: h })], resultados: [] });
  assert.equal(enPlan.tipo, 'en_plan');
  assert.equal(enPlan.tarea.id, 'k');
  // Completado hoy
  const hecho = P.evaluarApertura({ ...base, tareas: [tarea({ id: 'k', test_id: 'T1', fecha: h, estado: 'completado', completada_at: 'x', resultado_id: 'R' })],
    resultados: [{ id: 'R', test_id: 'T1', realizado_at: '2026-10-06T08:00:00Z', nota: 7 }] });
  assert.equal(hecho.tipo, 'completado_hoy');
  assert.equal(hecho.resultado.id, 'R');
  // Repetido (hecho otro día, sin tarea hoy)
  const rep = P.evaluarApertura({ ...base, tareas: [], resultados: [{ id: 'R0', test_id: 'T1', realizado_at: '2026-09-01T08:00:00Z' }, { id: 'R1', test_id: 'T1', realizado_at: '2026-09-20T08:00:00Z' }] });
  assert.equal(rep.tipo, 'repetido');
  assert.equal(rep.resultado.id, 'R1');
  // Fuera de plan, con otra fecha programada y el día lleno
  const lleno = [1, 2, 3].map(i => tarea({ test_id: 'o' + i, fecha: h }));
  const fuera = P.evaluarApertura({ ...base, tareas: lleno.concat([tarea({ id: 'fut', test_id: 'T1', fecha: '2026-10-09' })]), resultados: [] });
  assert.equal(fuera.tipo, 'fuera_plan');
  assert.equal(fuera.otra.id, 'fut');
  assert.equal(fuera.puedeAnadirHoy, false);
  // Sin avisos
  assert.equal(P.evaluarApertura({ ...base, ajustes: AJ({ reglas: { avisar_fuera_plan: false } }), tareas: [], resultados: [] }).tipo, 'libre');
  // Completado otro día sin nota: también es «ya hecho»
  const sinNota = P.evaluarApertura({ ...base, tareas: [tarea({ id: 'v', test_id: 'T1', fecha: '2026-10-01', estado: 'completado', completada_at: 'x' })], resultados: [] });
  assert.equal(sinNota.tipo, 'repetido');
  assert.equal(sinNota.resultado, null);
  assert.equal(sinNota.tarea.id, 'v');
  // Sin evitar_repetir, un test hecho fuera de plan avisa de fuera de plan
  assert.equal(P.evaluarApertura({ ...base, ajustes: AJ({ reglas: { evitar_repetir: false } }), tareas: [], resultados: [{ id: 'r', test_id: 'T1', realizado_at: '2026-09-01T00:00:00Z' }] }).tipo, 'fuera_plan');
});

test('proponerPlan: atrasadas primero, límite, días de estudio, orden natural y por turnos', () => {
  const h = '2026-10-05';   // lunes
  const temas = [{ id: 'A', numero: 1, nombre: 'Tema A' }, { id: 'B', numero: 2, nombre: 'Tema B' }];
  const tests = [
    { id: 'a10', tema_id: 'A', nombre: 'Test 10', plataforma: 'tutor_bombero' },
    { id: 'a2', tema_id: 'A', nombre: 'Test 2', plataforma: 'tutor_bombero' },
    { id: 'b1', tema_id: 'B', nombre: 'Test 1', plataforma: 'tutor_bombero' },
    { id: 'hecho', tema_id: 'B', nombre: 'Test 0', plataforma: 'tutor_bombero' },
    { id: 'arch', tema_id: 'B', nombre: 'Test 9', plataforma: 'tutor_bombero', archivado: true },
    { id: 'atr', tema_id: 'A', nombre: 'Atrasado', plataforma: 'tutor_bombero' },
  ];
  const tareas = [tarea({ id: 'tatr', test_id: 'atr', fecha: '2026-10-02' })];
  const resultados = [{ id: 'r', test_id: 'hecho', aciertos: 5, fallos: 5, total: 10, realizado_at: '2026-10-01T10:00:00Z' }];
  const p = P.proponerPlan({ tests, tareas, resultados, temas, ajustes: AJ({ limite_diario: 2 }), desde: h, dias: 7, hoy: h });
  assert.deepEqual(p.mover, [{ tarea_id: 'tatr', fecha: h }]);
  const ids = p.nuevas.map(n => n.test_id);
  assert.ok(!ids.includes('hecho') && !ids.includes('arch') && !ids.includes('atr'));
  assert.deepEqual(ids.slice().sort(), ['a10', 'a2', 'b1']);
  assert.ok(ids.indexOf('a2') < ids.indexOf('a10'), 'orden natural dentro del tema');
  // Con el límite de 2 y la atrasada ya en el lunes, solo cabe un nuevo el lunes
  assert.equal(p.nuevas.filter(n => n.fecha === h).length, 1);
  // Determinista
  assert.deepEqual(P.proponerPlan({ tests, tareas, resultados, temas, ajustes: AJ({ limite_diario: 2 }), desde: h, dias: 7, hoy: h }), p);
  // No usa domingos (día 7) si no son de estudio
  const p2 = P.proponerPlan({ tests, tareas: [], resultados, temas, ajustes: AJ({ limite_diario: 1, dias_estudio: [7] }), desde: h, dias: 7, hoy: h });
  assert.ok(p2.nuevas.every(n => P.diaSemana(n.fecha) === 7));
});

test('notaDe con penalización 1/3 y mínimo 0', () => {
  assert.equal(P.notaDe(18, 7, 5), 5.22);
  assert.equal(P.notaDe(30, 0, 0), 10);
  assert.equal(P.notaDe(0, 10, 0), 0);
  assert.equal(P.notaDe(10, 10, 0, 2), 0);
  assert.equal(P.notaDe(0, 0, 0), null);
});

test('estadísticas por tema, a reforzar y repasos', () => {
  const temas = [{ id: 'A', nombre: 'A' }, { id: 'B', nombre: 'B' }];
  const tests = [{ id: 'tA', tema_id: 'A', nombre: 'x' }, { id: 'tB', tema_id: 'B', nombre: 'y' }];
  const resultados = [
    { id: '1', test_id: 'tA', aciertos: 4, fallos: 6, blancos: 0, total: 10, nota: 2, realizado_at: '2026-10-01T10:00:00Z' },
    { id: '2', test_id: 'tB', aciertos: 9, fallos: 1, total: 10, nota: 8.67, realizado_at: '2026-10-02T10:00:00Z' },
    { id: '3', fuente: 'examen', realizado_at: '2026-10-03T10:00:00Z', aciertos: 1, fallos: 1, total: 2,
      detalle: [{ k: 'b:1', t: 'A', ok: true }, { k: 'p:z', t: 'B', ok: false }, { k: 'b:2', t: null, ok: false }] },
    { id: '4', test_id: 'tA', nota: 5, realizado_at: '2026-10-04T10:00:00Z' },
  ];
  const s = P.statsTemas({ temas, tests, resultados });
  assert.equal(s.A.aciertos, 5);
  assert.equal(s.A.respondidas, 11);
  assert.equal(s.B.respondidas, 11);
  assert.equal(s.A.resultados, 3);
  assert.ok(Math.abs(s.A.pct - 5 / 11 * 100) < 1e-9);
  // Sin fallos ni total no hay %: no se inventa un 100 %
  assert.equal(P.pctDe({ aciertos: 18 }), null);
  assert.equal(P.pctDe({ aciertos: 18, total: 30 }), 60);
  assert.equal(P.statsTemas({ temas, tests, resultados: [{ id: 'x', test_id: 'tA', aciertos: 18, realizado_at: '2026-10-01T00:00:00Z' }] }).A.pct, null);
  const flojos = P.temasAReforzar(s, 60);
  assert.deepEqual(flojos.map(x => x.tema_id), ['A']);
  const rep = P.proponerRepasos({ stats: s, temas, tests, tareas: [], resultados, ajustes: AJ() });
  assert.equal(rep.length, 1);
  assert.equal(rep[0].tema_id, 'A');
  assert.equal(rep[0].test_id, 'tA');
  assert.equal(P.proponerRepasos({ stats: s, temas, tests, tareas: [], resultados, ajustes: AJ({ reglas: { proponer_repasos: false } }) }).length, 0);
});

test('cumplimiento, serie, tiempo e historial', () => {
  const h = '2026-10-06';
  const tareas = [
    tarea({ fecha: '2026-10-05', estado: 'completado', completada_at: 'x' }),
    tarea({ fecha: '2026-10-05' }),
    tarea({ fecha: h, estado: 'completado', completada_at: 'x' }),
    tarea({ fecha: '2026-10-09' }),   // futura: no cuenta
  ];
  const c = P.cumplimiento({ tareas, hoy: h });
  assert.equal(c.previstas, 3);
  assert.equal(c.completadas, 2);
  assert.ok(Math.abs(c.pct - 200 / 3) < 1e-9);
  const res = [
    { id: 'b', nota: 6, realizado_at: '2026-10-05T10:00:00Z', duracion_seg: 600, duracion_medida: true },
    { id: 'a', nota: 4, realizado_at: '2026-10-01T10:00:00Z', duracion_seg: 300, duracion_medida: false },
  ];
  assert.deepEqual(P.serie(res).map(p => p.nota), [4, 6]);
  assert.deepEqual(P.tiempo(res), { medido_seg: 600, apuntado_seg: 300, n_medidos: 1, n_apuntados: 1 });
  assert.deepEqual(P.tiempo(res, '2026-10-02'), { medido_seg: 600, apuntado_seg: 0, n_medidos: 1, n_apuntados: 0 });
  const hs = P.historial({ tareas, resultados: res, eventos: [{ tipo: 'excepcion', at: '2026-10-05T09:00:00Z' }], hasta: h, agrupar: 'semana' });
  assert.equal(hs[0].clave, '2026-10-05');
  assert.equal(hs[0].excepciones, 1);
  assert.equal(hs[0].previstas, 3);
});

test('parsearResultado: textos copiados de distintas formas', () => {
  const casos = [
    ['Aciertos: 18\nFallos: 7\nEn blanco: 5\nNota: 6,45', { aciertos: 18, fallos: 7, blancos: 5, nota: 6.45 }],
    ['ACIERTOS 18 FALLOS 7 SIN CONTESTAR 5', { aciertos: 18, fallos: 7, blancos: 5 }],
    ['Correctas: 20 · Incorrectas: 6 · No contestadas: 4 · Total: 30', { aciertos: 20, fallos: 6, blancos: 4, total: 30 }],
    ['Has acertado 18 preguntas y has fallado 7', { aciertos: 18, fallos: 7 }],
    ['18 aciertos, 7 errores, 5 en blanco', { aciertos: 18, fallos: 7, blancos: 5 }],
    ['Puntuación: 6.45/10', { nota: 6.45 }],
    ['Calificación 7,5 sobre 10', { nota: 7.5 }],
    ['Nota 64,5 %', { nota: 6.45 }],
    ['Resultado: 18/30 (60%)', { aciertos: 18, total: 30, nota: null }],
    ['Has acertado 18 de 30 preguntas', { aciertos: 18, nota: null }],
    ['Bien 22 Mal 3 Blanco 5', { aciertos: 22, fallos: 3, blancos: 5 }],
    ['Aciertos\t18\nErrores\t7\nBlancas\t5\nTotal\t30', { aciertos: 18, fallos: 7, blancos: 5, total: 30 }],
  ];
  for(const [texto, esperado] of casos){
    const r = P.parsearResultado(texto);
    for(const k of Object.keys(esperado)) assert.equal(r[k], esperado[k], texto + ' → ' + k + ' = ' + JSON.stringify(r));
  }
  const fraccion = P.parsearResultado('Resultado: 18/30');
  assert.equal(fraccion.aciertos, 18);
  assert.equal(fraccion.total, 30);
  // Total y blancos deducidos
  assert.equal(P.parsearResultado('Total: 30 Aciertos: 20 Fallos: 6').blancos, 4);
  // Sin números: nada inventado
  assert.deepEqual(P.parsearResultado('Hola, esto no tiene resultado'), { aciertos: null, fallos: null, blancos: null, total: null, nota: null });
  // Números que no son resultados no se toman como tal
  assert.equal(P.parsearResultado('Tema 5 · Test 3 · 25 minutos').aciertos, null);
});

test('normalizar y orden natural', () => {
  assert.equal(P.normalizar('  ¿Qué   ARTÍCULO? '), 'que articulo');
  assert.deepEqual(['Test 10', 'test 2', 'Test 1'].sort(P.ordenNatural), ['Test 1', 'test 2', 'Test 10']);
});

test('generarExamen: sin repetidas, sin duplicados, por temas, con semilla y fallos primero', () => {
  const pool = [];
  for(let i = 0; i < 10; i++) pool.push({ k: 'b:' + i, f: 'pjfire', t: 'A', q: 'Pregunta A ' + i, options: ['x', 'y', 'z', 'w'], correct: 0 });
  for(let i = 0; i < 4; i++) pool.push({ k: 'p:' + i, f: 'propia', t: 'B', q: 'Pregunta B ' + i, options: ['x', 'y'], correct: 1 });
  pool.push({ k: 'p:dup', f: 'propia', t: 'A', q: '  pregunta a 3 ', options: ['x', 'y', 'z', 'w'], correct: 0 });   // igual que b:3
  const e = P.generarExamen({ pool, n: 6, temaIds: ['A', 'B'], semilla: 42 });
  assert.equal(e.preguntas.length, 6);
  assert.equal(new Set(e.preguntas.map(p => p.k)).size, 6);
  assert.equal(e.duplicadas, 1);
  assert.equal(e.porTema.A, 3);
  assert.equal(e.porTema.B, 3);
  assert.deepEqual(P.generarExamen({ pool, n: 6, temaIds: ['A', 'B'], semilla: 42 }).preguntas.map(p => p.k), e.preguntas.map(p => p.k));
  const todos = P.generarExamen({ pool, n: 100, semilla: 1 });
  assert.equal(todos.preguntas.length, 14);
  const soloPropias = P.generarExamen({ pool, n: 10, fuentes: ['propia'], semilla: 1 });
  assert.ok(soloPropias.preguntas.every(p => p.f === 'propia'));
  const fallos = P.generarExamen({ pool, n: 2, temaIds: ['A'], priorizarFallos: true, fallosPorClave: { 'b:7': 3, 'b:2': 1 }, semilla: 9 });
  assert.deepEqual(fallos.preguntas.map(p => p.k), ['b:7', 'b:2']);
});

test('corregir y errores recurrentes', () => {
  const ps = [
    { k: 'b:1', t: 'A', f: 'pjfire', options: ['a', 'b', 'c', 'd'], correct: 2 },
    { k: 'p:1', t: 'B', f: 'propia', options: ['a', 'b'], correct: 0 },
    { k: 'b:2', t: 'A', f: 'pjfire', options: ['a', 'b', 'c', 'd'], correct: 1 },
  ];
  const c = P.corregir(ps, [2, 1, null]);
  assert.equal(c.aciertos, 1);
  assert.equal(c.fallos, 1);
  assert.equal(c.blancos, 1);
  assert.equal(c.nota, 0);   // 1 - 1/(2-1) = 0
  assert.deepEqual(c.detalle.map(d => d.ok), [true, false, null]);
  const res = [
    { realizado_at: '2026-10-01T10:00:00Z', detalle: [{ k: 'b:1', ok: false }, { k: 'p:1', ok: false }] },
    { realizado_at: '2026-10-02T10:00:00Z', detalle: [{ k: 'b:1', ok: false }, { k: 'p:1', ok: true }] },
    { realizado_at: '2026-10-03T10:00:00Z', detalle: [{ k: 'b:1', ok: true }, { k: 'p:1', ok: true }, { k: 'b:9', ok: null }] },
  ];
  const err = P.erroresRecurrentes(res);
  assert.deepEqual(err.map(e => e.k), ['b:1']);   // 2 fallos ≥ 1 acierto; p:1 tiene 1 fallo
  assert.equal(err[0].fallos, 2);
});

test('tolera datos vacíos o a medio cargar', () => {
  assert.deepEqual(P.atrasadas(null, '2026-10-06'), []);
  assert.deepEqual(P.ordenarDia(undefined, '2026-10-06'), []);
  assert.deepEqual(P.statsTemas({}), {});
  assert.deepEqual(P.cumplimiento({ tareas: null, hoy: '2026-10-06' }), { previstas: 0, completadas: 0, pct: null, porDia: [] });
  assert.deepEqual(P.proponerPlan({ hoy: '2026-10-06' }), { mover: [], nuevas: [] });
  assert.deepEqual(P.erroresRecurrentes(null), []);
  assert.equal(P.generarExamen({ pool: null, n: 5 }).preguntas.length, 0);
});
