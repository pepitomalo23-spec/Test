// Pruebas del marcador de Tutor Bombero: las funciones de texto de
// marcador/tutor-bombero.js y lo que hace pj.fire con lo copiado
// (PLANL.leerMarcadorTB, planImportacionTB y elegirTareaTB).
// Ejecutar: node --test tests/plan/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const M = require('../../marcador/tutor-bombero.js');
const P = require('../../js/plan-logica.js');

test('marcador: reconoce títulos de tema', () => {
  assert.deepEqual(M.esTema('Tema 5'), { numero: 5, nombre: null });
  assert.deepEqual(M.esTema('TEMA 05.- LA CONSTITUCIÓN ESPAÑOLA'), { numero: 5, nombre: 'La constitución española' });
  assert.deepEqual(M.esTema('Tema 12: Incendios forestales'), { numero: 12, nombre: 'Incendios forestales' });
  assert.deepEqual(M.esTema('Tests del tema 7'), { numero: 7, nombre: null });
  assert.equal(M.esTema('Tema 5 - Test 3'), null, 'es un test del tema 5, no un título');
  assert.equal(M.esTema('Temario'), null);
  assert.equal(M.esTema('El tema 5 trata de…'), null);
});

test('marcador: reconoce tests y limpia su nombre', () => {
  const si = { 'Test 3': 'Test 3', 'TEST 03 (30 preguntas)': 'Test 03', 'Test nº 12 - Realizado': 'Test nº 12', 'Simulacro 2': 'Simulacro 2',
    'Examen 2019 Ayto. Madrid': 'Examen 2019 Ayto. Madrid', 'Tema 5 - Test 3 · Nota 7,5': 'Tema 5 - Test 3', 'Test 4 ✓': 'Test 4', 'Test 5 12/09/2026': 'Test 5' };
  for(const [txt, nombre] of Object.entries(si)){
    assert.ok(M.esTest(txt), txt);
    assert.equal(M.nombreTest(txt).nombre, nombre, txt);
  }
  assert.equal(M.nombreTest('TEST 03 (30 preguntas)').preguntas, 30);
  for(const no of ['Tests realizados (12)', 'Mis tests', 'Hacer test', 'Aciertos 23', 'Tests del tema 7', 'Configurar test 5', '12', 'Estadísticas de tests 2026', 'x'.repeat(130) + ' test 1']){
    assert.ok(!M.esTest(no), no);
  }
});

test('marcador: del resultado solo copia las líneas de números, nunca preguntas', () => {
  const pagina = 'Inicio  Tests  Simulacros\nTema 5 - Test 3\nResultado del test\nAciertos: 23\nFallos: 5\nEn blanco: 2\nNota: 7,11\nTiempo: 25:13\n' +
    'Pregunta 1 Correcta\n1. ¿Cuál es el artículo 2? Correcta\n¿Qué dice el artículo 155 sobre la nota?\nUsuario: pepito';
  assert.deepEqual(M.lineasResultado(pagina), ['Aciertos: 23', 'Fallos: 5', 'En blanco: 2', 'Nota: 7,11', 'Tiempo: 25:13']);
  assert.equal(M.tituloResultado(pagina, 'TOB'), 'Tema 5 - Test 3');
  assert.equal(M.tituloResultado('Resultado\nAciertos 3', 'Test 9 - TOB'), 'Test 9 - TOB');
  // Tabla: fila de títulos y fila de números
  assert.deepEqual(M.lineasResultado('Aciertos\tFallos\tEn blanco\tNota\n18\t7\t5\t5,22'), ['Aciertos\tFallos\tEn blanco\tNota', '18\t7\t5\t5,22']);
  // Sin aciertos, fallos ni nota no es un resultado
  assert.deepEqual(M.lineasResultado('Bienvenido\nTienes 3 tests nuevos\nTotal de temas: 25'), []);
  // Una lista de tests no es un resultado (aunque diga «preguntas» o «Nota»)
  assert.deepEqual(M.lineasResultado('Test 1\t30 preguntas\nTest 2\t30 preguntas\nSimulacro 2 · Nota 6,5'), []);
  assert.deepEqual(M.lineasResultado('Nota: 7,5'), [], 'solo la nota no basta');
  // Y lo que copia, pj.fire lo lee igual que un resultado pegado
  const r = P.parsearResultado(M.lineasResultado(pagina).join('\n'));
  assert.equal(r.aciertos, 23); assert.equal(r.fallos, 5); assert.equal(r.blancos, 2); assert.equal(r.nota, 7.11);
});

test('marcador: agrupa por tema sin repetir y no deja rastro de la sesión', () => {
  const g = M.agrupar([
    { tema: { numero: 5, nombre: 'La Constitución' }, test: { nombre: 'Test 1' } },
    { tema: { numero: 5, nombre: null }, test: { nombre: 'Test 1' } },
    { tema: { numero: 5, nombre: null }, test: { nombre: 'Test 2', preguntas: 30 } },
    { tema: null, test: { nombre: 'Simulacro 2' } }
  ], [{ numero: 9, nombre: null, tests: [{ nombre: 'Test 1' }] }]);
  assert.equal(g.total, 4);
  assert.deepEqual(g.temas.map(t => [t.numero, t.nombre, t.tests.map(x => x.nombre)]),
    [[9, null, ['Test 1']], [5, 'La Constitución', ['Test 1', 'Test 2']], [null, null, ['Simulacro 2']]]);
  assert.equal(M.sinSesion('/TEST/lista.jsp;jsessionid=ABC123?tema=5#x'), '/TEST/lista.jsp');
});

test('leerMarcadorTB: acepta lo del marcador y rechaza lo demás', () => {
  const tests = P.leerMarcadorTB(M.texto('tests', { temas: [{ numero: 5, nombre: 'Constitución', tests: [{ nombre: ' Test   1 ' }, { nombre: '' }, { nombre: 'Test 2', preguntas: 9999 }] }, { numero: 'x', tests: [] }] }));
  assert.deepEqual(tests, { tipo: 'tests', total: 2, temas: [{ numero: 5, nombre: 'Constitución', tests: [{ nombre: 'Test 1', preguntas: null }, { nombre: 'Test 2', preguntas: null }] }] });
  const res = P.leerMarcadorTB(M.texto('resultado', { titulo: 'Tema 5 - Test 1', lineas: ['Aciertos\tFallos', '20\t5', 42, ''] }));
  assert.deepEqual(res, { tipo: 'resultado', titulo: 'Tema 5 - Test 1', lineas: ['Aciertos\tFallos', '20\t5'] });
  for(const malo of [null, '', 'hola', '{"pjfire":"otro","v":1,"tipo":"tests"}', '{"pjfire":"tutor_bombero","v":2,"tipo":"tests"}',
    '{"pjfire":"tutor_bombero","v":1,"tipo":"borrar"}', '{"pjfire":"tutor_bombero","v":1,"tipo":"resultado","lineas":[]}', '{roto']){
    assert.equal(P.leerMarcadorTB(malo), null, String(malo));
  }
  // Límite de tamaño: como mucho 2000 tests
  const muchos = P.leerMarcadorTB(M.texto('tests', { temas: [{ numero: 1, tests: Array.from({ length: 2500 }, (_, i) => ({ nombre: 'Test ' + i })) }] }));
  assert.equal(muchos.total, 2000);
});

test('planImportacionTB: cada tema a su sitio y sin duplicados', () => {
  const pay = P.leerMarcadorTB(M.texto('tests', { temas: [
    { numero: 5, nombre: 'La Constitución', tests: [{ nombre: 'Test 1' }, { nombre: 'Test 2', preguntas: 30 }, { nombre: 'Tema 5 - Test 3' }, { nombre: 'Test 10' }] },
    { numero: 9, nombre: null, tests: [{ nombre: 'Test 1' }] },
    { numero: null, nombre: 'Incendios', tests: [{ nombre: 'Simulacro 1' }] },
    { numero: 12, nombre: 'Rescate', tests: [{ nombre: 'Test 1' }] },
    { numero: 12, nombre: null, tests: [{ nombre: 'Test 2' }] },
    { numero: null, nombre: null, tests: [{ nombre: 'Simulacro general 1' }] }
  ] }));
  const temas = [{ id: 't5', numero: 5, nombre: 'Constitución' }, { id: 't7', numero: 7, nombre: 'Incendios' }, { id: 'tv', numero: 5, nombre: 'Viejo', archivado: true }];
  const tests = [
    { id: 'x1', plataforma: 'tutor_bombero', nombre: 'Test 1', referencia: 'Tema 5 - Test 1', tema_id: 't5' },   // otros signos: es el mismo
    { id: 'x2', plataforma: 'tutor_bombero', nombre: 'Test 2', referencia: null, tema_id: 't5' },                // mismo tema y nombre
    { id: 'x3', plataforma: 'pjfire', nombre: 'Tema 9 · Test 1', referencia: null, tema_id: null }              // otra plataforma: no cuenta
  ];
  const p = P.planImportacionTB(pay, temas, tests);
  const g = p.grupos;
  assert.equal(g[0].tema_id, 't5', 'por número, el no archivado');
  assert.deepEqual(g[0].nuevos.map(x => [x.nombre, x.referencia]), [['Tema 5 - Test 3', 'Tema 5 - Test 3'], ['Test 10', 'Tema 5 · Test 10']]);
  assert.equal(g[0].repetidos, 2);
  assert.deepEqual(g[1].crear, { numero: 9, nombre: 'Tema 9' });
  assert.deepEqual(g[1].nuevos.map(x => x.referencia), ['Tema 9 · Test 1']);
  assert.equal(g[2].tema_id, 't7', 'por nombre');
  assert.deepEqual(g[2].nuevos.map(x => x.referencia), ['Incendios · Simulacro 1']);
  assert.ok(g[3].crear && g[3].crear === g[4].crear, 'el tema 12 se crea una sola vez');
  assert.deepEqual(g[3].crear, { numero: 12, nombre: 'Rescate' });
  assert.equal(g[5].tema_id, null); assert.equal(g[5].crear, null);
  assert.deepEqual(g[5].nuevos.map(x => x.referencia), ['Simulacro general 1']);
  assert.equal(p.nuevos, 7); assert.equal(p.repetidos, 2); assert.equal(p.temasNuevos, 2);
  // Repetido dentro de la misma lista: se cuenta una vez
  const dos = P.planImportacionTB({ temas: [{ numero: 1, nombre: null, tests: [{ nombre: 'Test 1' }, { nombre: 'TEST 1' }] }] }, [], []);
  assert.equal(dos.nuevos, 1); assert.equal(dos.repetidos, 1);
  // Lo importado pasa la regla de la base de datos (clave única)
  const claves = new Set();
  p.grupos.forEach(x => x.nuevos.forEach(t => { const k = P.claveTest('tutor_bombero', t.referencia, t.nombre); assert.ok(!claves.has(k)); claves.add(k); }));
});

test('elegirTareaTB: por el título, si no por lo abierto; con dudas, pregunta', () => {
  const h = '2026-10-06';
  const ahora = Date.parse('2026-10-06T10:00:00Z');
  const tests = [
    { id: 'a', plataforma: 'tutor_bombero', nombre: 'Test 1', referencia: 'Tema 5 · Test 1' },
    { id: 'b', plataforma: 'tutor_bombero', nombre: 'Test 10', referencia: 'Tema 5 · Test 10' },
    { id: 'c', plataforma: 'tutor_bombero', nombre: 'Test 2', referencia: 'Tema 6 · Test 2' },
    { id: 'd', plataforma: 'pjfire', nombre: 'Tema 5 · Test 1', referencia: null }
  ];
  const tareas = [
    { id: 'ta', test_id: 'a', fecha: h, estado: 'pendiente' },
    { id: 'tb', test_id: 'b', fecha: '2026-10-05', estado: 'pendiente' },
    { id: 'tc', test_id: 'c', fecha: h, estado: 'en_curso', abierta_at: '2026-10-06T09:30:00Z' },
    { id: 'tv', test_id: 'a', fecha: '2026-10-01', estado: 'completado' }
  ];
  let e = P.elegirTareaTB({ titulo: 'TEMA 5 · TEST 1 (Constitución)', tareas, tests, hoy: h, ahora });
  assert.equal(e.test.id, 'a'); assert.equal(e.tarea.id, 'ta'); assert.ok(e.seguro);
  e = P.elegirTareaTB({ titulo: 'Tema 5 - Test 10', tareas, tests, hoy: h, ahora });
  assert.equal(e.test.id, 'b', '«Test 10» no se confunde con «Test 1»'); assert.equal(e.tarea.id, 'tb', 'atrasada');
  e = P.elegirTareaTB({ titulo: 'Resultados', tareas, tests, hoy: h, ahora });
  assert.equal(e.tarea.id, 'tc', 'sin título reconocible: la abierta'); assert.ok(e.seguro);
  e = P.elegirTareaTB({ titulo: null, tareas, tests, hoy: h, ahora: ahora + 13 * 3600 * 1000 });
  assert.ok(!e.seguro, 'abierta hace más de 12 h: se pregunta');
  assert.deepEqual(e.candidatas.map(t => t.id), ['tc', 'ta']);
  e = P.elegirTareaTB({ titulo: 'Test 3', tareas: [], tests, hoy: h, ahora });
  assert.ok(!e.seguro); assert.equal(e.test, null); assert.deepEqual(e.candidatas, []);
});

test('marcador: preguntas de la corrección con su respuesta correcta', () => {
  const t = 'Corrección\n1. ¿Qué artículo regula la defensa?\na) El 8\nb) El 30\nc) El 15 ✓\nd) El 2\nTu respuesta: a\n' +
    '2. Según la Ley 17/2015, la protección civil es\nun servicio público.\na) Verdadero\nb) Falso\nTu respuesta: b. Correcta: a\nExplicación: art. 1.\n' +
    'Pregunta 3: ¿Cuántos?\na) Uno\nb) Dos\n4. Sin opciones\n5. Con marca en la página\na) Rojo\nb) Verde';
  const q = M.preguntasDeTexto(t, ['verde']);
  assert.deepEqual(q.map(x => [x.enunciado, x.opciones.length, x.correcta, x.explicacion]), [
    ['¿Qué artículo regula la defensa?', 4, 2, null],
    ['Según la Ley 17/2015, la protección civil es un servicio público.', 2, 0, 'art. 1.'],
    ['¿Cuántos?', 2, null, null],
    ['Con marca en la página', 2, 1, null]]);
  assert.equal(q[0].opciones[2], 'El 15', 'sin la marca ✓');
  // «Tu respuesta» no es la correcta; dos opciones marcadas: no se sabe
  assert.equal(M.preguntasDeTexto('1. Pregunta\na) Uno\nb) Dos\nTu respuesta: b')[0].correcta, null);
  assert.equal(M.preguntasDeTexto('1. Pregunta\na) Uno\nb) Uno', ['uno'])[0].correcta, null);
  assert.deepEqual(M.preguntasDeTexto('Aciertos: 20\nFallos: 3'), []);
});

test('leerMarcadorTB y planPreguntasTB: preguntas válidas, sin duplicados y con su tema', () => {
  const m = P.leerMarcadorTB(M.texto('preguntas', { titulo: 'TEMA 5 - TEST 2', preguntas: [
    { enunciado: '  ¿Uno   o dos? ', opciones: ['Uno', 'Dos'], correcta: 1, explicacion: 'Porque sí' },
    { enunciado: '¿Sin correcta?', opciones: ['a', 'b'], correcta: null },
    { enunciado: '¿Cinco opciones?', opciones: ['a', 'b', 'c', 'd', 'e'], correcta: 0 },
    { enunciado: '¿Correcta fuera?', opciones: ['a', 'b'], correcta: 2 },
    { enunciado: 'Ya la tengo', opciones: ['Sí', 'No'], correcta: 0 },
    { enunciado: '¿UNO O DOS?', opciones: ['Uno', 'Dos'], correcta: 1 }] }));
  assert.equal(m.tipo, 'preguntas'); assert.equal(m.malas, 3); assert.equal(m.preguntas.length, 3);
  assert.equal(m.preguntas[0].enunciado, '¿Uno o dos?');
  const p = P.planPreguntasTB(m, [{ enunciado: 'Ya  la tengo' }], [{ id: 't5', numero: 5 }, { id: 'v5', numero: 5, archivado: true }]);
  assert.deepEqual(p.nuevas.map(x => x.enunciado), ['¿Uno o dos?']);
  assert.equal(p.repetidas, 2); assert.equal(p.tema_id, 't5');
  assert.equal(P.huellaPregunta('  Hola\n  Mundo '), 'hola mundo');
});
