/* ============================================================
   PLAN · Lógica (PLANL)
   Funciones PURAS del Plan de estudio, sin DOM, sin red y sin azar:
     - fechas en Europe/Madrid (días civiles 'AAAA-MM-DD'),
     - ajustes y reglas, orden del día, límite diario,
     - qué pasa al abrir un test (¿está en el plan de hoy?),
     - planificación automática (determinista),
     - estadísticas (solo con datos reales: nada inventado),
     - lectura de un resultado pegado (texto de otra web),
     - exámenes combinados: generar (azar con semilla), corregir y
       errores recurrentes.
   Todo aguanta datos a medio cargar: null, listas vacías o filas
   incompletas no rompen nada (devuelven vacío o null).
   Lo usan js/plan.js (PLAN), js/plan-examen.js (PLANX) y
   js/plan-progreso.js (PLANP). Se prueba en Node con
   tests/plan/logica.test.mjs (por eso el module.exports del final).
   ============================================================ */
const PLANL = (function(){
  'use strict';

  // ---------- Constantes ----------
  const ZONA = 'Europe/Madrid';
  const REGLAS_DEF = {
    avisar_fuera_plan: true,     // avisar al abrir un test que no toca hoy
    respetar_limite: true,       // no añadir por encima del límite diario
    evitar_repetir: true,        // avisar al abrir un test ya hecho
    mostrar_atrasadas: true,     // enseñar (y recolocar) lo que se quedó sin hacer
    proponer_repasos: true,      // sugerir repasos de los temas flojos
    priorizar_pendientes: true,  // a igual prioridad, primero lo aplazado
    umbral_repaso: 60            // % de aciertos por debajo del cual un tema necesita repaso
  };
  const AJUSTES_DEF = { limite_diario: 3, dias_estudio: [1, 2, 3, 4, 5, 6], reglas: {} };
  const TB_URL = 'https://tutorbomberos.es/TEST/index.jsp';
  const PLATAFORMAS = { tutor_bombero: 'Tutor Bombero', pjfire: 'pj.fire', otra: 'Otra' };
  const ESTADOS = { pendiente: 'Pendiente', en_curso: 'En curso', completado: 'Completado', aplazado: 'Aplazado' };
  const PRIORIDADES = { 1: 'Alta', 2: 'Media', 3: 'Baja' };

  const DIA_MS = 86400000;
  const HORA_MS = 3600000;
  const RE_DIA = /^(\d{4})-(\d{2})-(\d{2})$/;
  const MAX_DIAS_RANGO = 4000;   // tope de seguridad para rango() (unos 11 años)
  const DIAS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
  const DIAS_CORTOS = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'];
  const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic'];

  // ---------- Utilidades internas ----------
  // Lista de filas (objetos) a partir de lo que llegue: null o basura → [].
  function lista(x){
    return Array.isArray(x) ? x.filter(function(v){ return v && typeof v === 'object'; }) : [];
  }
  // Número o null (los numeric de PostgREST pueden llegar como texto).
  function num(x){
    if(x === null || x === undefined || x === '' || typeof x === 'boolean') return null;
    const n = Number(x);
    return isFinite(n) ? n : null;
  }
  function redondear2(x){
    const s = x < 0 ? -1 : 1;
    return s * Math.round((Math.abs(x) + Number.EPSILON) * 100) / 100;
  }
  function cmpTexto(a, b){
    a = a == null ? '' : String(a);
    b = b == null ? '' : String(b);
    return a < b ? -1 : a > b ? 1 : 0;
  }
  function cmpNum(a, b){ return a < b ? -1 : a > b ? 1 : 0; }
  function pad(n, w){ let s = String(n); while(s.length < w) s = '0' + s; return s; }
  function sinTildes(s){ return String(s).normalize('NFD').replace(/[̀-ͯ]/g, ''); }
  // Claves seguras para objetos usados como diccionario.
  function claveSegura(k){ return k !== '__proto__' && k !== 'constructor' && k !== 'prototype'; }

  // ---------- Fechas ----------
  // 'AAAA-MM-DD' → ms UTC de ese día a las 00:00, o NaN si no es una fecha real.
  function msDia(dia){
    if(typeof dia !== 'string') return NaN;
    const m = RE_DIA.exec(dia);
    if(!m) return NaN;
    const y = +m[1], mo = +m[2], d = +m[3];
    const ms = Date.UTC(y, mo - 1, d);
    const f = new Date(ms);
    if(f.getUTCFullYear() !== y || f.getUTCMonth() !== mo - 1 || f.getUTCDate() !== d) return NaN;
    return ms;
  }
  function esDia(dia){ return !isNaN(msDia(dia)); }
  function diaDeMs(ms){
    const f = new Date(ms);
    return pad(f.getUTCFullYear(), 4) + '-' + pad(f.getUTCMonth() + 1, 2) + '-' + pad(f.getUTCDate(), 2);
  }
  // Instante (Date, ms o texto ISO de PostgREST) → ms, o NaN.
  function msInstante(x){
    if(x instanceof Date) return x.getTime();
    if(typeof x === 'number') return isFinite(x) ? x : NaN;
    if(typeof x !== 'string' || !x.trim()) return NaN;
    // Formatos que algunos navegadores no leen bien: espacio en vez de «T»,
    // más de 3 decimales en los segundos o zona «+00» sin minutos.
    const s = x.trim().replace(' ', 'T').replace(/(\.\d{3})\d+/, '$1').replace(/([+-]\d{2})$/, '$1:00');
    const ms = Date.parse(s);
    return isNaN(ms) ? Date.parse(x) : ms;
  }

  // Cambio de hora de la UE: último domingo de marzo y de octubre a las 01:00 UTC.
  function cambioHoraUE(anio, mes){
    const ultimo = Date.UTC(anio, mes + 1, 0);            // último día del mes
    const dow = new Date(ultimo).getUTCDay();             // 0 = domingo
    return ultimo - dow * DIA_MS + HORA_MS;
  }
  // Día civil en Madrid sin Intl (por si el navegador no trae zonas horarias).
  function diaMadridSinIntl(ms){
    const anio = new Date(ms).getUTCFullYear();
    const verano = ms >= cambioHoraUE(anio, 2) && ms < cambioHoraUE(anio, 9);
    return diaDeMs(ms + (verano ? 2 : 1) * HORA_MS);
  }

  const formateadores = {};
  function formateador(zona){
    if(!Object.prototype.hasOwnProperty.call(formateadores, zona)){
      try {
        formateadores[zona] = new Intl.DateTimeFormat('en-CA', { timeZone: zona, year: 'numeric', month: '2-digit', day: '2-digit' });
      } catch(e){
        formateadores[zona] = null;
      }
    }
    return formateadores[zona];
  }

  // Día civil ('AAAA-MM-DD') de un instante en la zona dada (Madrid por
  // defecto). Sirve también para saber el día de un realizado_at.
  function hoy(ahora = new Date(), zona = ZONA){
    const ms = ahora == null ? Date.now() : msInstante(ahora);
    if(isNaN(ms)) return null;
    const z = zona || ZONA;
    const f = formateador(z);
    if(f){
      try {
        // formatToParts y no format(): el formato de 'en-CA' ha cambiado
        // entre versiones de ICU; las partes sueltas no.
        const p = {};
        f.formatToParts(new Date(ms)).forEach(function(x){ p[x.type] = x.value; });
        const d = pad(p.year, 4) + '-' + pad(p.month, 2) + '-' + pad(p.day, 2);
        if(esDia(d)) return d;
      } catch(e){ /* sigue abajo */ }
    }
    return z === ZONA ? diaMadridSinIntl(ms) : diaDeMs(ms);
  }

  // Aritmética en UTC sobre la fecha civil: no le afectan los cambios de hora.
  function sumarDias(dia, n){
    const ms = msDia(dia);
    if(isNaN(ms)) return null;
    const k = Math.trunc(Number(n)) || 0;
    return diaDeMs(ms + k * DIA_MS);
  }
  // 1 = lunes … 7 = domingo (ISO).
  function diaSemana(dia){
    const ms = msDia(dia);
    if(isNaN(ms)) return null;
    return (new Date(ms).getUTCDay() + 6) % 7 + 1;
  }
  function lunesDe(dia){
    const d = diaSemana(dia);
    return d == null ? null : sumarDias(dia, 1 - d);
  }
  // Todos los días de desde a hasta, ambos incluidos.
  function rango(desde, hasta){
    const a = msDia(desde), b = msDia(hasta);
    if(isNaN(a) || isNaN(b) || b < a) return [];
    const out = [];
    for(let ms = a; ms <= b && out.length < MAX_DIAS_RANGO; ms += DIA_MS) out.push(diaDeMs(ms));
    return out;
  }
  // Días de a hasta b (b - a): positivo si b es posterior.
  function diasEntre(a, b){
    const x = msDia(a), y = msDia(b);
    if(isNaN(x) || isNaN(y)) return null;
    return Math.round((y - x) / DIA_MS);
  }
  function primeroDeMes(dia){ return esDia(dia) ? dia.slice(0, 8) + '01' : null; }
  function diasDelMes(dia){
    if(!esDia(dia)) return [];
    const y = +dia.slice(0, 4), m = +dia.slice(5, 7);
    return rango(primeroDeMes(dia), diaDeMs(Date.UTC(y, m, 0)));
  }
  function nombreDia(dia){ const d = diaSemana(dia); return d ? DIAS[d - 1] : ''; }
  // 'lun 6 oct'
  function fechaCorta(dia){
    const d = diaSemana(dia);
    if(!d) return '';
    return DIAS_CORTOS[d - 1] + ' ' + (+dia.slice(8, 10)) + ' ' + MESES_CORTOS[+dia.slice(5, 7) - 1];
  }
  // 'lunes, 6 de octubre'
  function fechaLarga(dia){
    const d = diaSemana(dia);
    if(!d) return '';
    return DIAS[d - 1] + ', ' + (+dia.slice(8, 10)) + ' de ' + MESES[+dia.slice(5, 7) - 1];
  }

  // ---------- Ajustes ----------
  // Ajustes completos a partir de la fila de plan_ajustes (o null): lo que
  // falte o no valga se rellena con los valores por defecto. Las reglas
  // guardadas se mezclan con REGLAS_DEF (las que no conoce esta versión se
  // conservan). Siempre devuelve objetos nuevos.
  function ajustesDe(fila){
    const f = fila && typeof fila === 'object' ? fila : {};
    let lim = num(f.limite_diario);
    lim = lim == null ? AJUSTES_DEF.limite_diario : Math.min(20, Math.max(1, Math.round(lim)));
    let dias = f.dias_estudio;
    if(typeof dias === 'string') dias = dias.replace(/[{}\[\]\s]/g, '').split(',');
    dias = Array.isArray(dias) ? dias.map(Number).filter(function(n){ return Number.isInteger(n) && n >= 1 && n <= 7; }) : [];
    dias = dias.filter(function(n, i){ return dias.indexOf(n) === i; }).sort(cmpNum);
    if(!dias.length) dias = AJUSTES_DEF.dias_estudio.slice();
    let guardadas = f.reglas;
    if(typeof guardadas === 'string'){
      try { guardadas = JSON.parse(guardadas); } catch(e){ guardadas = null; }
    }
    const reglas = Object.assign({}, REGLAS_DEF);
    if(guardadas && typeof guardadas === 'object' && !Array.isArray(guardadas)){
      Object.keys(guardadas).forEach(function(k){
        if(!claveSegura(k)) return;
        const v = guardadas[k];
        if(k === 'umbral_repaso'){
          const u = num(v);
          if(u != null) reglas[k] = Math.min(100, Math.max(0, u));
        } else if(typeof REGLAS_DEF[k] === 'boolean'){
          if(typeof v === 'boolean') reglas[k] = v;
        } else {
          reglas[k] = v;
        }
      });
    }
    return { limite_diario: lim, dias_estudio: dias, reglas: reglas };
  }
  function esDiaDeEstudio(dia, ajustes){
    const d = diaSemana(dia);
    return d != null && ajustesDe(ajustes).dias_estudio.indexOf(d) >= 0;
  }

  // ---------- Tareas ----------
  function abierta(t){
    return !!(t && (t.estado === 'pendiente' || t.estado === 'en_curso' || t.estado === 'aplazado'));
  }
  function fechaDe(t){
    if(!t || typeof t.fecha !== 'string') return null;
    const d = t.fecha.slice(0, 10);
    return esDia(d) ? d : null;
  }
  function prioridadDe(t){
    const p = Number(t && t.prioridad);
    return p === 1 || p === 2 || p === 3 ? p : 2;
  }
  function ordenDe(t){ const o = num(t && t.orden); return o == null ? 0 : o; }
  // Desempate estable y determinista: orden, alta, id.
  function cmpDesempate(a, b){
    return cmpNum(ordenDe(a), ordenDe(b)) || cmpTexto(a.created_at, b.created_at) || cmpTexto(a.id, b.id);
  }
  // Por fecha y prioridad (lo que usan atrasadas y la planificación).
  function cmpFechaPrioridad(a, b){
    return cmpTexto(fechaDe(a), fechaDe(b)) || cmpNum(prioridadDe(a), prioridadDe(b)) || cmpDesempate(a, b);
  }

  function tareasDelDia(tareas, dia){
    return lista(tareas).filter(function(t){ return fechaDe(t) === dia; });
  }
  // Abiertas de días anteriores a hoy: por fecha y, a igual fecha, prioridad.
  function atrasadas(tareas, diaHoy){
    const h = esDia(diaHoy) ? diaHoy : hoy();
    return lista(tareas).filter(function(t){
      const f = fechaDe(t);
      return abierta(t) && f && f < h;
    }).sort(cmpFechaPrioridad);
  }
  // Orden de la lista de un día (copia): en curso primero; luego prioridad
  // (1 = alta antes); con priorizar_pendientes, a igual prioridad lo
  // aplazado (o atrasado) antes; luego «orden» y la fecha de alta. Las
  // completadas, al final.
  function ordenarDia(tareas, diaHoy, reglas){
    let r = reglas;
    if(r && r.reglas && typeof r.reglas === 'object') r = r.reglas;   // por si llegan los ajustes enteros
    const priorizar = !(r && r.priorizar_pendientes === false);
    const h = esDia(diaHoy) ? diaHoy : null;
    function retrasada(t){
      const f = fechaDe(t);
      return Number(t.veces_aplazada) > 0 || t.estado === 'aplazado' || !!(h && f && f < h);
    }
    return lista(tareas).slice().sort(function(a, b){
      const ca = a.estado === 'completado' ? 1 : 0, cb = b.estado === 'completado' ? 1 : 0;
      if(ca !== cb) return ca - cb;
      if(!ca){
        const ea = a.estado === 'en_curso' ? 0 : 1, eb = b.estado === 'en_curso' ? 0 : 1;
        if(ea !== eb) return ea - eb;
      }
      const p = cmpNum(prioridadDe(a), prioridadDe(b));
      if(p) return p;
      if(priorizar && !ca){
        const ra = retrasada(a) ? 0 : 1, rb = retrasada(b) ? 0 : 1;
        if(ra !== rb) return ra - rb;
      }
      return cmpDesempate(a, b);
    });
  }
  // Carga del día: todas sus tareas, también las completadas.
  function ocupacion(tareas, dia){ return tareasDelDia(tareas, dia).length; }
  function puedeAnadir(tareas, dia, ajustes){
    const a = ajustesDe(ajustes);
    const usados = ocupacion(tareas, dia);
    return { ok: a.reglas.respetar_limite ? usados < a.limite_diario : true, usados: usados, limite: a.limite_diario };
  }

  // ---------- Resultados (utilidades) ----------
  function msResultado(r){
    let ms = msInstante(r && r.realizado_at);
    if(isNaN(ms)) ms = msInstante(r && r.created_at);
    return ms;
  }
  // Más antiguo primero; los que no tienen fecha, delante (nunca son «el último»).
  function cmpResultado(a, b){
    const x = msResultado(a), y = msResultado(b);
    const xa = isNaN(x) ? -Infinity : x, ya = isNaN(y) ? -Infinity : y;
    return cmpNum(xa, ya) || cmpTexto(a.id, b.id);
  }
  function detalleDe(r){
    let d = r && r.detalle;
    if(typeof d === 'string'){
      try { d = JSON.parse(d); } catch(e){ d = null; }
    }
    return lista(d);
  }
  // Recuento de un resultado: {a, f, b, n} (n = preguntas que cuentan para
  // el %), o null si no hay aciertos. Lo que falta se deduce del total solo
  // cuando sale una única cuenta posible; si faltan fallos Y blancos, la
  // diferencia cuenta en n pero no se reparte (no se inventa).
  function recuento(r){
    if(!r) return null;
    const a = num(r.aciertos);
    if(a == null || a < 0) return null;
    let f = num(r.fallos), b = num(r.blancos);
    const tot = num(r.total);
    // Sin fallos ni total no se sabe sobre cuántas preguntas: no hay %.
    if(f == null && tot == null) return null;
    if(tot != null){
      if(f != null && b == null && tot - a - f >= 0) b = tot - a - f;
      else if(b != null && f == null && tot - a - b >= 0) f = tot - a - b;
    }
    const conocidas = a + (f || 0) + (b || 0);
    const n = tot != null && (f == null || b == null) ? Math.max(tot, conocidas) : conocidas;
    return { a: a, f: f || 0, b: b || 0, n: n };
  }

  // ---------- Al abrir un test ----------
  // ¿Qué hacer cuando se abre un test desde el panel? Ver el contrato:
  // en_plan | completado_hoy | repetido | fuera_plan | libre.
  function evaluarApertura(o){
    o = o || {};
    const a = ajustesDe(o.ajustes);
    const h = esDia(o.hoy) ? o.hoy : hoy();
    const test = o.test;
    const testId = test && typeof test === 'object' ? test.id : test;
    if(!testId) return { tipo: 'libre' };
    const tareas = lista(o.tareas);
    const suyas = tareas.filter(function(t){ return t.test_id === testId; });
    const deHoy = suyas.filter(function(t){ return fechaDe(t) === h; });
    const abiertaHoy = deHoy.filter(abierta)[0];
    if(abiertaHoy) return { tipo: 'en_plan', tarea: abiertaHoy };

    const todos = lista(o.resultados);
    const suyos = todos.filter(function(r){ return r.test_id === testId; }).sort(cmpResultado);
    const hechaHoy = deHoy.filter(function(t){ return t.estado === 'completado'; })[0];
    if(hechaHoy){
      // Ya está hecho hoy. Sin evitar_repetir, se abre sin más.
      if(!a.reglas.evitar_repetir) return { tipo: 'libre' };
      let res = null;
      if(hechaHoy.resultado_id) res = todos.filter(function(r){ return r.id === hechaHoy.resultado_id; })[0] || null;
      if(!res){
        const deTarea = todos.filter(function(r){ return r.tarea_id === hechaHoy.id; }).sort(cmpResultado);
        res = deTarea[deTarea.length - 1] || null;
      }
      if(!res){
        const deHoyRes = suyos.filter(function(r){ const ms = msResultado(r); return !isNaN(ms) && hoy(ms) === h; });
        res = deHoyRes[deHoyRes.length - 1] || null;
      }
      return { tipo: 'completado_hoy', tarea: hechaHoy, resultado: res };
    }
    // Ya hecho otro día: con resultado o completado sin nota.
    const hechaAntes = suyas.filter(function(t){ return t.estado === 'completado'; }).sort(cmpFechaPrioridad);
    if((suyos.length || hechaAntes.length) && a.reglas.evitar_repetir){
      return { tipo: 'repetido', resultado: suyos[suyos.length - 1] || null, tarea: hechaAntes[hechaAntes.length - 1] || null };
    }
    if(!a.reglas.avisar_fuera_plan) return { tipo: 'libre' };
    // Fuera del plan de hoy: la próxima abierta de otro día o, si no hay, la atrasada más reciente.
    const futuras = suyas.filter(function(t){ const f = fechaDe(t); return abierta(t) && f && f > h; }).sort(cmpFechaPrioridad);
    const pasadas = suyas.filter(function(t){ const f = fechaDe(t); return abierta(t) && f && f < h; }).sort(cmpFechaPrioridad);
    const p = puedeAnadir(tareas, h, a);
    return {
      tipo: 'fuera_plan',
      otra: futuras[0] || pasadas[pasadas.length - 1] || null,
      puedeAnadirHoy: p.ok,
      usados: p.usados,
      limite: p.limite
    };
  }

  // ---------- Planificación automática ----------
  // Propone qué mover y qué añadir para rellenar los días de estudio de
  // [desde, desde + dias - 1] sin pasar del límite (contando lo que ya hay).
  // Nunca usa días anteriores a hoy (o.hoy, opcional: por defecto el día
  // de hoy en Madrid). Determinista: con los mismos datos, lo mismo.
  function proponerPlan(o){
    o = o || {};
    const a = ajustesDe(o.ajustes);
    const h = esDia(o.hoy) ? o.hoy : hoy();
    const desde = esDia(o.desde) ? o.desde : h;
    let nDias = Math.floor(Number(o.dias));
    if(!(nDias >= 1)) nDias = 7;
    nDias = Math.min(nDias, 366);
    const inicio = desde < h ? h : desde;
    const fin = sumarDias(desde, nDias - 1);
    const dias = rango(inicio, fin).filter(function(d){ return esDiaDeEstudio(d, a); });
    const tareas = lista(o.tareas);
    const tests = lista(o.tests);
    const temas = lista(o.temas);
    const resultados = lista(o.resultados);

    const libres = {};
    dias.forEach(function(d){ libres[d] = Math.max(0, a.limite_diario - ocupacion(tareas, d)); });
    const ocupado = {};   // 'test|día' que ya tiene tarea (único en la base de datos)
    tareas.forEach(function(t){ const f = fechaDe(t); if(t.test_id && f) ocupado[t.test_id + '|' + f] = true; });
    function huecos(){ let n = 0; dias.forEach(function(d){ n += libres[d]; }); return n; }
    function colocar(testId){
      for(let i = 0; i < dias.length; i++){
        const d = dias[i];
        if(libres[d] > 0 && !ocupado[testId + '|' + d]){
          libres[d]--;
          ocupado[testId + '|' + d] = true;
          return d;
        }
      }
      return null;
    }
    const mover = [], nuevas = [];

    // 1) Las atrasadas, en los primeros huecos (si su test no está ya programado de hoy en adelante).
    if(a.reglas.mostrar_atrasadas){
      const programado = {};
      tareas.forEach(function(t){ const f = fechaDe(t); if(abierta(t) && f && f >= h) programado[t.test_id] = true; });
      atrasadas(tareas, h).forEach(function(t){
        if(!t.id || !t.test_id || programado[t.test_id]) return;
        const d = colocar(t.test_id);
        if(d){
          mover.push({ tarea_id: t.id, fecha: d });
          programado[t.test_id] = true;
        }
      });
    }

    // 2) Tests nuevos: no archivados, sin tarea abierta y nunca hechos.
    const temaPorId = {};
    temas.forEach(function(t){ if(t.id) temaPorId[t.id] = t; });
    const conAbierta = {}, hechos = {};
    tareas.forEach(function(t){
      if(abierta(t)) conAbierta[t.test_id] = true;
      if(t.estado === 'completado') hechos[t.test_id] = true;
    });
    resultados.forEach(function(r){ if(r.test_id) hechos[r.test_id] = true; });
    const candidatos = tests.filter(function(t){
      if(!t.id || t.archivado || conAbierta[t.id] || hechos[t.id]) return false;
      const tema = t.tema_id ? temaPorId[t.tema_id] : null;
      return !(tema && tema.archivado);
    });
    if(!candidatos.length || !huecos()) return { mover: mover, nuevas: nuevas };

    // Agrupados por tema; los temas flojos primero (los que no tienen
    // datos, en medio: después de los flojos y antes de los que van bien).
    const stats = statsTemas({ temas: temas, tests: tests, resultados: resultados });
    const umbral = a.reglas.umbral_repaso;
    const grupos = {}, claves = [];
    candidatos.forEach(function(t){
      const k = t.tema_id ? String(t.tema_id) : 'sin_tema';
      if(!grupos[k]){ grupos[k] = []; claves.push(k); }
      grupos[k].push(t);
    });
    function pctDeGrupo(k){ return stats[k] && stats[k].pct != null ? stats[k].pct : null; }
    function cubo(k){ const p = pctDeGrupo(k); return p == null ? 1 : (p < umbral ? 0 : 2); }
    function numeroDe(k){ const t = temaPorId[k]; const n = t ? num(t.numero) : null; return n == null ? Infinity : n; }
    claves.sort(function(x, y){
      return cmpNum(cubo(x), cubo(y)) ||
        cmpNum(pctDeGrupo(x) == null ? 0 : pctDeGrupo(x), pctDeGrupo(y) == null ? 0 : pctDeGrupo(y)) ||
        cmpNum(numeroDe(x), numeroDe(y)) ||
        ordenNatural(temaPorId[x] ? temaPorId[x].nombre : '', temaPorId[y] ? temaPorId[y].nombre : '') ||
        cmpTexto(x, y);
    });
    claves.forEach(function(k){
      grupos[k].sort(function(x, y){
        return ordenNatural(x.nombre, y.nombre) || ordenNatural(x.referencia, y.referencia) || cmpTexto(x.id, y.id);
      });
    });
    // Por turnos: uno de cada tema en cada vuelta.
    const pos = claves.map(function(){ return 0; });
    let quedan = true;
    while(quedan && huecos() > 0){
      quedan = false;
      for(let i = 0; i < claves.length && huecos() > 0; i++){
        const g = grupos[claves[i]];
        if(pos[i] >= g.length) continue;
        quedan = true;
        const t = g[pos[i]++];
        const d = colocar(t.id);
        if(d) nuevas.push({ test_id: t.id, fecha: d, prioridad: 2, origen: 'auto' });
      }
    }
    return { mover: mover, nuevas: nuevas };
  }

  // ---------- Resultados y estadísticas ----------
  // Nota sobre 10 con penalización: cada fallo resta 1/(nOpciones-1) de
  // acierto. Mínimo 0, máximo 10, 2 decimales. null si no hay preguntas.
  function notaDe(aciertos, fallos, blancos, nOpciones = 4){
    const a = Math.max(0, num(aciertos) || 0);
    const f = Math.max(0, num(fallos) || 0);
    const b = Math.max(0, num(blancos) || 0);
    const total = a + f + b;
    if(!(total > 0)) return null;
    const k = num(nOpciones) == null ? 4 : num(nOpciones);
    const pen = k > 1 ? f / (k - 1) : 0;
    return redondear2(Math.min(10, Math.max(0, (a - pen) / total * 10)));
  }
  // % de aciertos de un resultado, o null si no tiene recuento.
  function pctDe(r){
    const c = recuento(r);
    return c && c.n > 0 ? c.a / c.n * 100 : null;
  }

  // Por tema: {aciertos, fallos, blancos, respondidas, pct, resultados,
  // notaMedia, ultima}. «respondidas» = preguntas que cuentan para el %
  // (aciertos + fallos + blancos, o el total si no se sabe el reparto).
  // Con detalle, cada pregunta cuenta para su tema (t); las del banco sin
  // tema no se atribuyen y las propias sin tema van a 'sin_tema'. Sin
  // detalle, el resultado entero va al tema de su test. Los resultados sin
  // recuento (solo nota) cuentan en notaMedia pero no en el %.
  function statsTemas(o){
    o = o || {};
    const temas = lista(o.temas);
    const mapa = o.mapaTopicTema && typeof o.mapaTopicTema === 'object' ? o.mapaTopicTema : {};
    const conocidos = {};
    temas.forEach(function(t){ if(t.id) conocidos[t.id] = true; });
    const hayTemas = temas.length > 0;
    const testPorId = {};
    lista(o.tests).forEach(function(t){ if(t.id) testPorId[t.id] = t; });
    const out = {};
    const notas = {};
    function entrada(k){
      if(!Object.prototype.hasOwnProperty.call(out, k)){
        out[k] = { aciertos: 0, fallos: 0, blancos: 0, respondidas: 0, pct: null, resultados: 0, notaMedia: null, ultima: null };
        notas[k] = [];
      }
      return out[k];
    }
    temas.forEach(function(t){ if(t.id) entrada(t.id); });
    // Un tema que ya no existe (borrado) cuenta como «sin tema».
    function clave(t){
      if(!t || !claveSegura(String(t))) return 'sin_tema';
      return !hayTemas || conocidos[t] ? String(t) : 'sin_tema';
    }
    function topicATema(tp){
      return tp != null && Object.prototype.hasOwnProperty.call(mapa, tp) ? mapa[tp] : null;
    }
    // Tema de un test: el suyo o, si no tiene y es de pj.fire, el único al
    // que apuntan sus temas del banco.
    function temaDeTest(test){
      if(!test) return null;
      if(test.tema_id) return test.tema_id;
      const ids = test.config && Array.isArray(test.config.topic_ids) ? test.config.topic_ids : [];
      const ts = [];
      ids.forEach(function(id){ const t = topicATema(id); if(t && ts.indexOf(t) < 0) ts.push(t); });
      return ts.length === 1 ? ts[0] : null;
    }
    function marcar(s, r){
      const ms = msResultado(r);
      if(isNaN(ms)) return;
      if(s.ultima == null || ms >= msInstante(s.ultima)) s.ultima = r.realizado_at || r.created_at;
    }
    lista(o.resultados).slice().sort(cmpResultado).forEach(function(r){
      const det = detalleDe(r);
      if(det.length){
        const porTema = {}, orden = [];
        det.forEach(function(e){
          let t = e.t || topicATema(e.topic_id);
          if(!t && typeof e.k === 'string' && e.k.indexOf('b:') === 0) return;   // del banco sin tema
          const k = clave(t);
          if(!porTema[k]){ porTema[k] = { a: 0, f: 0, b: 0 }; orden.push(k); }
          if(e.ok === true) porTema[k].a++;
          else if(e.ok === false) porTema[k].f++;
          else porTema[k].b++;
        });
        orden.forEach(function(k){
          const c = porTema[k], s = entrada(k);
          s.aciertos += c.a; s.fallos += c.f; s.blancos += c.b;
          s.respondidas += c.a + c.f + c.b;
          s.resultados++;
          const n = notaDe(c.a, c.f, c.b);
          if(n != null) notas[k].push(n);
          marcar(s, r);
        });
      } else {
        const k = clave(temaDeTest(testPorId[r.test_id]));
        const s = entrada(k);
        const c = recuento(r);
        if(c){
          s.aciertos += c.a; s.fallos += c.f; s.blancos += c.b;
          s.respondidas += c.n;
        }
        const nota = num(r.nota);
        if(nota != null) notas[k].push(nota);
        s.resultados++;
        marcar(s, r);
      }
    });
    Object.keys(out).forEach(function(k){
      const s = out[k];
      s.pct = s.respondidas > 0 ? s.aciertos / s.respondidas * 100 : null;
      const ns = notas[k];
      s.notaMedia = ns.length ? redondear2(ns.reduce(function(x, y){ return x + y; }, 0) / ns.length) : null;
    });
    return out;
  }

  // Temas con % por debajo del umbral y bastantes preguntas, de peor a mejor.
  function temasAReforzar(stats, umbral, minRespondidas = 10){
    const u = num(umbral) == null ? REGLAS_DEF.umbral_repaso : num(umbral);
    const m = num(minRespondidas) == null ? 10 : num(minRespondidas);
    const s = stats && typeof stats === 'object' ? stats : {};
    return Object.keys(s).filter(function(k){ return k !== 'sin_tema' && s[k] && typeof s[k] === 'object'; })
      .map(function(k){ return { tema_id: k, pct: num(s[k].pct), respondidas: num(s[k].respondidas) || 0 }; })
      .filter(function(x){ return x.pct != null && x.respondidas >= m && x.pct < u; })
      .sort(function(a, b){ return cmpNum(a.pct, b.pct) || cmpNum(b.respondidas, a.respondidas) || cmpTexto(a.tema_id, b.tema_id); });
  }

  // Repasos para los temas flojos (máx. 5): repetir su test ya hecho con
  // peor nota (la del último intento) que no esté ya programado, o test_id
  // null si no hay ninguno (la UI ofrecerá un test de fallos de pj.fire).
  // Un tema que ya tiene un repaso abierto no se vuelve a proponer.
  function proponerRepasos(o){
    o = o || {};
    const a = ajustesDe(o.ajustes);
    if(!a.reglas.proponer_repasos) return [];
    const stats = o.stats && typeof o.stats === 'object' ? o.stats : statsTemas(o);
    const temaPorId = {};
    lista(o.temas).forEach(function(t){ if(t.id) temaPorId[t.id] = t; });
    const tests = lista(o.tests);
    const testPorId = {};
    tests.forEach(function(t){ if(t.id) testPorId[t.id] = t; });
    const programado = {}, hecho = {}, conRepaso = {}, ultimo = {};
    lista(o.tareas).forEach(function(t){
      if(abierta(t)){
        programado[t.test_id] = true;
        const test = testPorId[t.test_id];
        if(t.origen === 'repaso' && test && test.tema_id) conRepaso[test.tema_id] = true;
      }
      if(t.estado === 'completado') hecho[t.test_id] = true;
    });
    lista(o.resultados).slice().sort(cmpResultado).forEach(function(r){
      if(r.test_id){ hecho[r.test_id] = true; ultimo[r.test_id] = r; }
    });
    // Para ordenar por nota: la del último resultado (o su % /10); sin nota, al final.
    function notaOrden(t){
      const r = ultimo[t.id];
      if(!r) return Infinity;
      const n = num(r.nota);
      if(n != null) return n;
      const p = pctDe(r);
      return p != null ? p / 10 : Infinity;
    }
    return temasAReforzar(stats, a.reglas.umbral_repaso)
      .filter(function(x){
        const tema = temaPorId[x.tema_id];
        return !(tema && tema.archivado) && !conRepaso[x.tema_id];
      })
      .slice(0, 5)
      .map(function(x){
        const cands = tests.filter(function(t){
          return t.tema_id === x.tema_id && !t.archivado && hecho[t.id] && !programado[t.id];
        }).sort(function(p, q){
          return cmpNum(notaOrden(p), notaOrden(q)) || ordenNatural(p.nombre, q.nombre) || cmpTexto(p.id, q.id);
        });
        return {
          tema_id: x.tema_id,
          pct: x.pct,
          respondidas: x.respondidas,
          motivo: Math.round(x.pct) + ' % de aciertos en ' + x.respondidas + ' preguntas',
          test_id: cands.length ? cands[0].id : null
        };
      });
  }

  // % del plan cumplido entre desde y hasta (solo días hasta hoy). Cada
  // tarea cuenta en su fecha actual (una aplazada, en la nueva).
  function cumplimiento(o){
    o = o || {};
    const h = esDia(o.hoy) ? o.hoy : hoy();
    const tareas = lista(o.tareas).filter(function(t){ return fechaDe(t); });
    let hasta = esDia(o.hasta) ? o.hasta : h;
    if(hasta > h) hasta = h;
    let desde = esDia(o.desde) ? o.desde : null;
    if(!desde){
      tareas.forEach(function(t){ const f = fechaDe(t); if(f <= hasta && (!desde || f < desde)) desde = f; });
    }
    const vacio = { previstas: 0, completadas: 0, pct: null, porDia: [] };
    if(!desde || desde > hasta) return vacio;
    const porDia = {};
    rango(desde, hasta).forEach(function(d){ porDia[d] = { dia: d, previstas: 0, completadas: 0 }; });
    let previstas = 0, completadas = 0;
    tareas.forEach(function(t){
      const x = porDia[fechaDe(t)];
      if(!x) return;
      x.previstas++; previstas++;
      if(t.estado === 'completado'){ x.completadas++; completadas++; }
    });
    return {
      previstas: previstas,
      completadas: completadas,
      pct: previstas ? completadas / previstas * 100 : null,
      porDia: Object.keys(porDia).sort().map(function(d){ return porDia[d]; })
    };
  }

  // Evolución: un punto por resultado, del más antiguo al más reciente.
  // nota es la guardada (sin calcular nada); pct, el % de aciertos si hay recuento.
  function serie(resultados, desde){
    const d0 = esDia(desde) ? desde : null;
    return lista(resultados).map(function(r){
      const ms = msResultado(r);
      if(isNaN(ms)) return null;
      const dia = hoy(ms);
      if(d0 && dia < d0) return null;
      return {
        r: r, ms: ms,
        p: { dia: dia, at: r.realizado_at || r.created_at, nota: num(r.nota), pct: pctDe(r), fuente: r.fuente || null,
             titulo: r.titulo || null, id: r.id || null, test_id: r.test_id || null }
      };
    }).filter(Boolean).sort(function(x, y){ return cmpNum(x.ms, y.ms) || cmpTexto(x.r.id, y.r.id); })
      .map(function(x){ return x.p; });
  }

  // Tiempo de estudio registrado: el medido por la app y el apuntado a mano, por separado.
  function tiempo(resultados, desde){
    const d0 = esDia(desde) ? desde : null;
    const out = { medido_seg: 0, apuntado_seg: 0, n_medidos: 0, n_apuntados: 0 };
    lista(resultados).forEach(function(r){
      const s = num(r.duracion_seg);
      if(s == null || s < 0) return;
      if(d0){
        const ms = msResultado(r);
        if(isNaN(ms) || hoy(ms) < d0) return;
      }
      if(r.duracion_medida === true){ out.medido_seg += s; out.n_medidos++; }
      else { out.apuntado_seg += s; out.n_apuntados++; }
    });
    return out;
  }

  // Historial por día o por semana (clave = el lunes), lo más reciente
  // primero. Solo grupos con algo: tareas previstas, resultados, tests
  // abiertos desde el panel o excepciones.
  function historial(o){
    o = o || {};
    const semana = o.agrupar === 'semana';
    const desde = esDia(o.desde) ? o.desde : null;
    const hasta = esDia(o.hasta) ? o.hasta : hoy();
    const grupos = {};
    function grupo(dia){
      if(!dia || (desde && dia < desde) || dia > hasta) return null;
      const k = semana ? lunesDe(dia) : dia;
      if(!grupos[k]) grupos[k] = { clave: k, previstas: 0, completadas: 0, resultados: [], excepciones: 0, abiertos: 0 };
      return grupos[k];
    }
    lista(o.tareas).forEach(function(t){
      const g = grupo(fechaDe(t));
      if(!g) return;
      g.previstas++;
      if(t.estado === 'completado') g.completadas++;
    });
    lista(o.resultados).slice().sort(cmpResultado).forEach(function(r){
      const ms = msResultado(r);
      if(isNaN(ms)) return;
      const g = grupo(hoy(ms));
      if(g) g.resultados.push(r);
    });
    lista(o.eventos).forEach(function(e){
      if(e.tipo !== 'excepcion' && e.tipo !== 'abierto') return;
      const ms = msInstante(e.at);
      if(isNaN(ms)) return;
      const g = grupo(hoy(ms));
      if(!g) return;
      if(e.tipo === 'excepcion') g.excepciones++;
      else g.abiertos++;
    });
    return Object.keys(grupos).sort().reverse().map(function(k){ return grupos[k]; });
  }

  // ---------- Texto pegado: leer un resultado ----------
  // Etiquetas (minúsculas, sin tildes; un espacio vale por varios). Las
  // de 'ignorar' se reconocen para que su número no se tome por otra cosa
  // («Tema 5», «Ley 31/1995», «25 minutos»).
  const ETIQUETAS = (function(){
    const base = {
      aciertos: ['aciertos', 'acierto', 'acertadas', 'acertados', 'acertada', 'correctas', 'correctos', 'correcta', 'bien', 'buenas',
        'has acertado', 'acertaste'],
      fallos: ['fallos', 'fallo', 'falladas', 'fallados', 'fallada', 'errores', 'error', 'erroneas', 'erroneos', 'erronea',
        'incorrectas', 'incorrectos', 'incorrecta', 'mal', 'malas', 'has fallado', 'fallaste'],
      blancos: ['en blanco', 'blancos', 'blancas', 'blanco', 'blanca', 'sin contestar', 'sin responder', 'sin respuesta',
        'no contestadas', 'no contestados', 'no contestada', 'no respondidas', 'no respondidos', 'no respondida',
        'omitidas', 'omitidos', 'dejadas en blanco']
    };
    const out = {
      total: ['total', 'total de preguntas', 'total preguntas', 'preguntas totales', 'numero de preguntas', 'numero preguntas',
        'n de preguntas', 'n preguntas', 'num de preguntas', 'num preguntas', 'preguntas'],
      nota: ['nota', 'nota final', 'nota obtenida', 'nota total', 'nota media', 'tu nota', 'puntuacion', 'puntuacion final',
        'puntuacion obtenida', 'puntuacion total', 'calificacion', 'calificacion final', 'calificacion obtenida'],
      ignorar: ['contestadas', 'respondidas', 'preguntas contestadas', 'preguntas respondidas', 'test', 'tema', 'simulacro',
        'examen', 'tiempo', 'minutos', 'minuto', 'min', 'segundos', 'seg', 'intento', 'pregunta', 'fecha', 'dia', 'hora',
        'porcentaje', 'ley', 'decreto', 'real decreto', 'rd', 'articulo', 'art', 'orden', 'reglamento', 'directiva']
    };
    // «preguntas acertadas», «respuestas en blanco», «pregunta fallada»…
    Object.keys(base).forEach(function(cat){
      const l = base[cat].slice();
      base[cat].forEach(function(e){
        if(/^(has|acertaste|fallaste|dejadas)/.test(e)) return;
        ['preguntas', 'pregunta', 'respuestas', 'respuesta'].forEach(function(p){ l.push(p + ' ' + e); });
      });
      out[cat] = l;
    });
    return out;
  })();
  const CAT_DE_ETIQUETA = {};
  Object.keys(ETIQUETAS).forEach(function(cat){
    ETIQUETAS[cat].forEach(function(e){ CAT_DE_ETIQUETA[e] = cat; });
  });
  const FUENTE_ETIQUETAS = Object.keys(CAT_DE_ETIQUETA).sort(function(a, b){ return b.length - a.length || cmpTexto(a, b); })
    .map(function(e){ return e.replace(/ /g, '[ \\t]+'); }).join('|');
  // Sin «lookbehind» (no lo tienen los Safari antiguos): el borde izquierdo va en el grupo 1.
  const RE_ETIQUETA = new RegExp('(^|[^a-z0-9])(' + FUENTE_ETIQUETAS + ')(?=[^a-z0-9]|$)', 'g');
  const RE_ETIQUETA_EXACTA = new RegExp('^(' + FUENTE_ETIQUETAS + ')$');
  // Números: fechas y horas (se saltan); «18», «6,45», «64,5 %», «6.45/10», «7,5 sobre 10», «18 de 30».
  const RE_NUMERO = /(\d{1,4}([\/.\-])\d{1,2}\2\d{2,4})|(\d{1,2}:\d{2}(?::\d{2})?)|(\d+(?:[.,']\d+)?)(?:[ \t]*(%)|[ \t]*\/[ \t]*(\d+(?:[.,]\d+)?)|[ \t]+sobre[ \t]+(\d+(?:[.,]\d+)?)|[ \t]+de[ \t]+(\d+)(?![\d.,']))?/g;
  const CUENTAS = { aciertos: 1, fallos: 1, blancos: 1, total: 1 };

  function catDe(texto){ return CAT_DE_ETIQUETA[texto.replace(/[ \t]+/g, ' ')] || null; }
  function aNumero(s){ return s == null ? null : Number(String(s).replace(/[,']/g, '.')); }

  function normalizarPegado(texto){
    return sinTildes(String(texto).slice(0, 20000)).toLowerCase()
      .replace(/\r\n?|[\u2028\u2029]/g, '\n')
      .replace(/[  -​  　]/g, ' ')
      .replace(/[º°ª]/g, '')
      .replace(/[’‘´`]/g, "'")
      .replace(/[«»"“”*_]/g, ' ');
  }

  // Números de un trozo de texto (con su posición).
  function numerosDe(texto, base){
    const out = [];
    RE_NUMERO.lastIndex = 0;
    let m;
    while((m = RE_NUMERO.exec(texto))){
      if(m[1] || m[3]) continue;                     // fecha u hora
      const ini = m.index;
      const antes = ini > 0 ? texto.charAt(ini - 1) : '';
      if(/[a-z]/.test(antes)) continue;              // «tema5», «x18»
      const v = aNumero(m[4]);
      const antes2 = ini > 1 ? texto.charAt(ini - 2) : '';
      const neg = antes === '-' && (ini < 2 || /[\s:(=]/.test(antes2));
      let den = null, comp = null;
      if(m[6] != null){ den = aNumero(m[6]); comp = '/'; }
      else if(m[7] != null){ den = aNumero(m[7]); comp = 'sobre'; }
      else if(m[8] != null){ den = aNumero(m[8]); comp = 'de'; }
      out.push({
        tipo: 'num', ini: base + ini, fin: base + ini + m[0].length,
        v: v, neg: neg, pct: !!m[5], den: den, comp: comp,
        entero: /^\d+$/.test(m[4]), denEntero: den != null && /^\d+$/.test(m[6] || m[7] || m[8] || '')
      });
    }
    return out;
  }
  function etiquetasDe(texto, base){
    const out = [];
    RE_ETIQUETA.lastIndex = 0;
    let m;
    while((m = RE_ETIQUETA.exec(texto))){
      const ini = m.index + m[1].length;
      out.push({ tipo: 'et', ini: base + ini, fin: base + ini + m[2].length, cat: catDe(m[2]) });
      if(m[0].length === 0) RE_ETIQUETA.lastIndex++;
    }
    return out;
  }
  // ¿Puede esta etiqueta llevarse este número?
  function compatible(cat, n){
    if(!n || n.tipo !== 'num') return false;
    if(cat === 'ignorar' || cat === 'nota') return true;
    if(n.pct || n.comp === 'sobre' || !n.entero) return false;   // un recuento es un entero, no un %
    if(n.comp && !n.denEntero) return false;
    return true;
  }
  // Nota a partir del número que acompaña a «Nota», o undefined si no vale como nota.
  function notaDeNumero(n){
    let v = n.neg ? -n.v : n.v;
    if(n.pct) v = v / 10;
    else if(n.comp){
      if(n.den === 10) { /* sobre 10 */ }
      else if(n.den === 100) v = v / 10;
      else return undefined;
    } else if(v > 10){
      if(v <= 100) v = v / 10;     // sobre 100
      else return undefined;
    }
    return redondear2(Math.min(10, Math.max(0, v)));
  }

  // Lee aciertos, fallos, blancos, total y nota de un texto copiado de
  // otra web (Tutor Bombero u otra). Lo que no aparece queda null.
  function parsearResultado(texto){
    const res = { aciertos: null, fallos: null, blancos: null, total: null, nota: null };
    if(texto == null || (typeof texto !== 'string' && typeof texto !== 'number')) return res;
    let t = normalizarPegado(texto);
    let totalCompuesto = null;
    const compuestosSueltos = [];

    function asignar(cat, n){
      if(cat === 'ignorar') return true;
      if(cat === 'nota'){
        const v = notaDeNumero(n);
        if(v === undefined){
          if(n.comp && n.entero && n.denEntero) compuestosSueltos.push(n);   // «Nota: 18/30» → como «18/30»
          return true;
        }
        if(res.nota == null) res.nota = v;
        return true;
      }
      if(cat === 'total'){
        const v = n.comp ? n.den : n.v;
        if(res.total == null && v > 0) res.total = v;
        return true;
      }
      if(res[cat] == null) res[cat] = Math.abs(n.v);
      if(n.comp && n.den >= n.v && totalCompuesto == null) totalCompuesto = n.den;
      return true;
    }

    // 1) Tabla copiada: una fila de títulos («Aciertos | Fallos | Nota») y
    //    debajo la de valores. Se lee por columnas y se quitan las dos filas.
    const lineas = t.split('\n');
    function celdas(linea){
      let c;
      if(linea.indexOf('\t') >= 0) c = linea.split('\t');
      else if(linea.indexOf('|') >= 0){
        c = linea.split('|');
        if(c.length && !c[0].trim()) c.shift();
        if(c.length && !c[c.length - 1].trim()) c.pop();
      }
      else if(linea.indexOf(';') >= 0) c = linea.split(';');
      else c = linea.trim().split(/ {2,}/);
      return c.map(function(s){ return s.trim(); });
    }
    for(let i = 0; i < lineas.length; i++){
      const cab = celdas(lineas[i]);
      if(cab.length < 2 || /\d/.test(lineas[i])) continue;
      const cats = cab.map(function(c){
        const e = c.replace(/[:.]+$/, '').trim();
        return RE_ETIQUETA_EXACTA.test(e) ? catDe(e) : null;
      });
      if(cats.filter(function(c){ return c && c !== 'ignorar'; }).length < 2) continue;
      let j = i + 1;
      while(j < lineas.length && (!lineas[j].trim() || /^[\s|:\-–—+=]+$/.test(lineas[j]))) j++;
      if(j >= lineas.length) continue;
      const val = celdas(lineas[j]);
      if(val.length !== cab.length) continue;
      let usada = false;
      cats.forEach(function(cat, k){
        if(!cat || cat === 'ignorar') return;
        const n = numerosDe(val[k], 0)[0];
        if(n && compatible(cat, n)){ asignar(cat, n); usada = true; }
      });
      if(usada){
        lineas[i] = '';
        lineas[j] = '';
        break;
      }
    }
    t = lineas.join('\n');

    // 2) Etiquetas y números, línea a línea.
    const porLinea = [];
    let base = 0;
    lineas.forEach(function(linea){
      const toks = etiquetasDe(linea, base).concat(numerosDe(linea, base)).sort(function(a, b){ return a.ini - b.ini; });
      porLinea.push(toks);
      base += linea.length + 1;
    });
    function sepOk(cat, s){
      if(cat === 'nota') s = s.replace(/(^|[^a-z])(es|de|del|un|una|fue|ha|sido)(?=[^a-z]|$)/g, '$1');
      return /^[ \t:=\-–—|·.()\[\]#>]*$/.test(s);
    }
    function vincular(et, n){ et.n = n; n.usado = true; }

    porLinea.forEach(function(toks){
      // 2a) «Etiqueta: número» (o separados por tabulador): seguro.
      toks.forEach(function(et, i){
        if(et.tipo !== 'et' || et.n) return;
        const sig = toks[i + 1];
        if(!sig || sig.tipo !== 'num' || sig.usado) return;
        const sep = t.slice(et.fin, sig.ini);
        if(/^[ \t]*[:=]/.test(sep) || /^\t/.test(sep)){
          if(sepOk(et.cat, sep) && compatible(et.cat, sig)) vincular(et, sig);
        }
      });
      // 2b) El resto: «Aciertos 18» o «18 aciertos». Se prueban las dos
      //     maneras y se queda la que empareja más (si empatan, la primera).
      function simular(numeroDetras){
        const pares = [];
        const usados = {};
        toks.forEach(function(et, i){
          if(et.tipo !== 'et' || et.n) return;
          const sig = toks[i + 1], ant = toks[i - 1];
          const okSig = sig && sig.tipo === 'num' && !sig.usado && !usados[i + 1] &&
            sepOk(et.cat, t.slice(et.fin, sig.ini)) && compatible(et.cat, sig);
          const okAnt = ant && ant.tipo === 'num' && !ant.usado && !usados[i - 1] && et.cat !== 'nota' &&
            /^[ \t]*$/.test(t.slice(ant.fin, et.ini)) && compatible(et.cat, ant);
          let elegido = null;
          if(numeroDetras){ if(okSig) elegido = i + 1; else if(okAnt) elegido = i - 1; }
          else { if(okAnt) elegido = i - 1; else if(okSig) elegido = i + 1; }
          if(elegido != null){ usados[elegido] = true; pares.push([i, elegido]); }
        });
        return pares;
      }
      const a = simular(true), b = simular(false);
      (b.length > a.length ? b : a).forEach(function(p){ vincular(toks[p[0]], toks[p[1]]); });
    });

    // 2c) En columna: «Aciertos» en una línea y «18» en la siguiente (o al revés).
    const conTokens = porLinea.filter(function(toks){ return toks.length; });
    let estilo = null;
    for(let i = 0; i < conTokens.length && !estilo; i++){
      const toks = conTokens[i];
      if(toks.length !== 1) continue;
      if(toks[0].tipo === 'et' && !toks[0].n) estilo = 'etiqueta';
      else if(toks[0].tipo === 'num' && !toks[0].usado) estilo = 'numero';
    }
    for(let i = 0; i + 1 < conTokens.length; i++){
      const una = conTokens[i], otra = conTokens[i + 1];
      if(una.length !== 1) continue;
      if(estilo === 'etiqueta' && una[0].tipo === 'et' && !una[0].n){
        const n = otra[0];
        if(n.tipo === 'num' && !n.usado && compatible(una[0].cat, n)) vincular(una[0], n);
      } else if(estilo === 'numero' && una[0].tipo === 'num' && !una[0].usado && otra.length === 1){
        const et = otra[0];
        if(et.tipo === 'et' && !et.n && et.cat !== 'nota' && compatible(et.cat, una[0])) vincular(et, una[0]);
      }
    }

    // Se aplican en el orden del texto: si algo sale dos veces, vale la primera.
    porLinea.forEach(function(toks){
      toks.forEach(function(et){ if(et.tipo === 'et' && et.n) asignar(et.cat, et.n); });
    });

    // 3) Lo que quedó suelto.
    porLinea.forEach(function(toks){
      toks.forEach(function(n){
        if(n.tipo !== 'num' || n.usado) return;
        // Un «%» suelto no se toma como nota: puede ser el % de aciertos.
        if(n.comp === '/') compuestosSueltos.push(n);
      });
    });
    // «18/30»: aciertos/total, si no había otros aciertos; «6,45/10» suelto, la nota.
    compuestosSueltos.forEach(function(n){
      if(n.entero && n.denEntero && n.den > 0 && n.v <= n.den && n.den <= 1000){
        if(res.aciertos == null){
          res.aciertos = n.v;
          if(res.total == null && totalCompuesto == null) totalCompuesto = n.den;
        } else if(res.aciertos === n.v && totalCompuesto == null){
          totalCompuesto = n.den;
        }
      } else if(!n.entero && (n.den === 10 || n.den === 100) && res.nota == null){
        res.nota = notaDeNumero(n);
      }
    });
    if(res.total == null && totalCompuesto != null) res.total = totalCompuesto;
    // Con total, los blancos que faltan se deducen.
    if(res.blancos == null && res.total != null && res.aciertos != null && res.fallos != null){
      const b = res.total - res.aciertos - res.fallos;
      if(b >= 0) res.blancos = b;
    }
    return res;
  }

  // ---------- Preguntas y exámenes ----------
  let RE_NO_LETRA;
  try { RE_NO_LETRA = new RegExp('[^\\p{L}\\p{N}\\s]+', 'gu'); }
  catch(e){ RE_NO_LETRA = /[^a-z0-9\s]+/g; }
  // Minúsculas, sin tildes, sin signos de puntuación y con espacios simples.
  function normalizar(texto){
    if(texto == null) return '';
    return sinTildes(texto).toLowerCase().replace(RE_NO_LETRA, ' ').replace(/\s+/g, ' ').trim();
  }

  // Generador pseudoaleatorio con semilla (mulberry32): mismo número, misma secuencia.
  function mulberry32(a){
    return function(){
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function semillaNumero(s){
    if(typeof s === 'number' && isFinite(s)) return Math.floor(s) >>> 0;
    // Texto: FNV-1a de 32 bits.
    let h = 2166136261;
    const str = String(s);
    for(let i = 0; i < str.length; i++){ h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function barajar(arr, rnd){
    const a = arr.slice();
    for(let i = a.length - 1; i > 0; i--){
      const j = Math.floor(rnd() * (i + 1));
      const x = a[i]; a[i] = a[j]; a[j] = x;
    }
    return a;
  }

  // Examen combinado. pool: [{k, f, t, q, options, correct, explain, ref?}]
  // (el banco primero: si dos preguntas son la misma, gana la primera).
  // Dos preguntas son la misma si coinciden el enunciado normalizado y el
  // texto de la respuesta correcta (así no se pierden las del banco con el
  // mismo enunciado genérico, «Señale la respuesta correcta»). Reparte n
  // entre los temas por turnos; dentro de cada tema, al azar con la
  // semilla (con priorizarFallos, primero las más falladas).
  function generarExamen(o){
    o = o || {};
    const semilla = o.semilla == null ? (Date.now() >>> 0) : o.semilla;
    const rnd = mulberry32(semillaNumero(semilla));
    const temaIds = Array.isArray(o.temaIds) && o.temaIds.length ? o.temaIds.map(function(x){ return x == null ? null : x; }) : null;
    const fuentes = Array.isArray(o.fuentes) && o.fuentes.length ? o.fuentes : null;
    const fallos = o.fallosPorClave && typeof o.fallosPorClave === 'object' ? o.fallosPorClave : {};
    function fallosDe(p){
      const v = Object.prototype.hasOwnProperty.call(fallos, p.k) ? num(fallos[p.k]) : null;
      return v != null && v > 0 ? v : 0;
    }
    const vistasK = new Set(), vistasQ = new Set();
    let duplicadas = 0;
    const validas = [];
    lista(o.pool).forEach(function(p){
      if(p.k == null || p.k === '' || !Array.isArray(p.options) || p.options.length < 2) return;
      const nq = normalizar(p.q);
      if(!nq) return;
      const t = p.t == null ? null : p.t;
      if(temaIds && temaIds.indexOf(t) < 0) return;
      if(fuentes && fuentes.indexOf(p.f) < 0) return;
      const c = Number(p.correct);
      const huella = nq + '\u0001' + (Number.isInteger(c) && c >= 0 && c < p.options.length ? normalizar(p.options[c]) : '');
      if(vistasK.has(String(p.k)) || vistasQ.has(huella)){ duplicadas++; return; }
      vistasK.add(String(p.k));
      vistasQ.add(huella);
      validas.push(p);
    });
    const disponibles = validas.length;
    let n = o.n == null ? disponibles : Math.floor(Number(o.n));
    if(!(n > 0)) n = 0;
    n = Math.min(n, disponibles);

    // Grupos por tema, en el orden pedido (sin temas pedidos, por orden de aparición y «sin tema» al final).
    const grupos = new Map();
    if(temaIds) temaIds.forEach(function(t){ if(!grupos.has(t)) grupos.set(t, []); });
    validas.forEach(function(p){
      const t = p.t == null ? null : p.t;
      if(!grupos.has(t)) grupos.set(t, []);
      grupos.get(t).push(p);
    });
    if(!temaIds && grupos.has(null)){
      const sinTema = grupos.get(null);
      grupos.delete(null);
      grupos.set(null, sinTema);
    }
    const colas = [];
    grupos.forEach(function(g){
      let l = barajar(g, rnd);
      if(o.priorizarFallos){
        // sort es estable: a igual nº de fallos se mantiene el orden al azar.
        l = l.sort(function(a, b){ return fallosDe(b) - fallosDe(a); });
      }
      colas.push(l);
    });
    const preguntas = [];
    const pos = colas.map(function(){ return 0; });
    while(preguntas.length < n){
      let alguna = false;
      for(let i = 0; i < colas.length && preguntas.length < n; i++){
        if(pos[i] >= colas[i].length) continue;
        preguntas.push(Object.assign({}, colas[i][pos[i]++]));
        alguna = true;
      }
      if(!alguna) break;
    }
    const porFuente = {}, porTema = {};
    preguntas.forEach(function(p){
      const f = p.f || 'otra';
      const t = p.t == null ? 'sin_tema' : String(p.t);
      porFuente[f] = (porFuente[f] || 0) + 1;
      porTema[t] = (porTema[t] || 0) + 1;
    });
    return { preguntas: preguntas, porFuente: porFuente, porTema: porTema, duplicadas: duplicadas, disponibles: disponibles, semilla: semilla };
  }

  // Corrige: respuestas[i] = índice elegido (en el orden de options) o null.
  // Cada fallo resta 1/(nº de opciones de esa pregunta - 1).
  function corregir(preguntas, respuestas){
    const ps = lista(preguntas);
    const rs = respuestas && typeof respuestas === 'object' ? respuestas : [];
    let aciertos = 0, fallos = 0, blancos = 0, puntos = 0;
    const detalle = ps.map(function(p, i){
      const nOp = Array.isArray(p.options) ? p.options.length : 4;
      const r = rs[i];
      const elegida = r === null || r === undefined || r === '' ? null : Number(r);
      let ok = null;
      if(elegida != null && Number.isInteger(elegida) && elegida >= 0 && elegida < nOp){
        ok = elegida === Number(p.correct);
        if(ok){ aciertos++; puntos += 1; }
        else { fallos++; puntos -= nOp > 1 ? 1 / (nOp - 1) : 0; }
      } else {
        blancos++;
      }
      return { k: p.k, t: p.t == null ? null : p.t, f: p.f || null, ok: ok };
    });
    const total = ps.length;
    return {
      aciertos: aciertos, fallos: fallos, blancos: blancos, total: total,
      nota: total ? redondear2(Math.min(10, Math.max(0, puntos / total * 10))) : null,
      detalle: detalle
    };
  }

  // Preguntas que se fallan una y otra vez (según el detalle de los
  // resultados, en orden de realización). Las respuestas en blanco no cuentan.
  function erroresRecurrentes(resultados, minFallos = 2){
    const m = num(minFallos) == null ? 2 : num(minFallos);
    const porK = new Map();
    lista(resultados).slice().sort(cmpResultado).forEach(function(r){
      const at = r.realizado_at || r.created_at || null;
      detalleDe(r).forEach(function(e){
        if(e.k == null || e.k === '' || (e.ok !== true && e.ok !== false)) return;
        const k = String(e.k);
        let x = porK.get(k);
        if(!x){ x = { k: k, fallos: 0, aciertos: 0, ultima: null, ultimaOk: false, t: null, f: null }; porK.set(k, x); }
        if(e.ok) x.aciertos++; else x.fallos++;
        x.ultima = at;
        x.ultimaOk = e.ok;
        if(e.t != null) x.t = e.t;
        if(e.f) x.f = e.f;
      });
    });
    function ms(x){ const v = msInstante(x.ultima); return isNaN(v) ? -Infinity : v; }
    return Array.from(porK.values())
      .filter(function(x){ return x.fallos >= m && (!x.ultimaOk || x.fallos >= x.aciertos); })
      .sort(function(a, b){ return b.fallos - a.fallos || cmpNum(ms(b), ms(a)) || cmpTexto(a.k, b.k); });
  }

  // Comparador «natural»: 'Test 2' antes que 'Test 10'; sin tildes ni mayúsculas.
  function ordenNatural(a, b){
    const x = a == null ? '' : sinTildes(a).toLowerCase().replace(/\s+/g, ' ').trim();
    const y = b == null ? '' : sinTildes(b).toLowerCase().replace(/\s+/g, ' ').trim();
    if(x !== y){
      const pa = x.split(/(\d+)/), pb = y.split(/(\d+)/);
      const n = Math.min(pa.length, pb.length);
      for(let i = 0; i < n; i++){
        const ca = pa[i], cb = pb[i];
        if(ca === cb) continue;
        if(i % 2 === 1){
          // Trozo numérico: por valor (sin ceros a la izquierda), y si vale lo mismo, el más corto antes.
          const na = ca.replace(/^0+/, '') || '0', nb = cb.replace(/^0+/, '') || '0';
          if(na.length !== nb.length) return na.length < nb.length ? -1 : 1;
          if(na !== nb) return na < nb ? -1 : 1;
          return ca.length < cb.length ? -1 : 1;
        }
        return ca < cb ? -1 : 1;
      }
      return pa.length < pb.length ? -1 : 1;
    }
    // Iguales sin tildes ni mayúsculas: desempate fijo con el texto original.
    return cmpTexto(a == null ? '' : String(a), b == null ? '' : String(b));
  }

  // ---------- Marcador de Tutor Bombero ----------
  // Lo que copia marcador/tutor-bombero.js: una línea de cabecera y un JSON
  // {pjfire:'tutor_bombero', v:1, tipo:'tests'|'resultado', …}. Devuelve el
  // contenido validado y recortado, o null si el texto no es eso.
  function leerMarcadorTB(texto){
    if(typeof texto !== 'string') return null;
    const s = texto.slice(0, 400000);
    const i = s.indexOf('{'), j = s.lastIndexOf('}');
    if(i < 0 || j <= i) return null;
    let o;
    try{ o = JSON.parse(s.slice(i, j + 1)); }catch(e){ return null; }
    if(!o || typeof o !== 'object' || o.pjfire !== 'tutor_bombero' || o.v !== 1) return null;
    const txt = (v, n) => {
      if(typeof v !== 'string') return null;
      const t = v.replace(/\s+/g, ' ').trim();
      return t ? t.slice(0, n) : null;
    };
    const ent = (v, min, max) => Number.isInteger(v) && v >= min && v <= max ? v : null;
    if(o.tipo === 'resultado'){
      // Las líneas tal cual (con sus tabuladores: parsearResultado lee tablas).
      const lineas = (Array.isArray(o.lineas) ? o.lineas : []).filter(l => typeof l === 'string' && l.trim()).slice(0, 60).map(l => l.slice(0, 200));
      return lineas.length ? { tipo: 'resultado', titulo: txt(o.titulo, 160), lineas } : null;
    }
    if(o.tipo === 'tests'){
      const temas = [];
      let total = 0;
      (Array.isArray(o.temas) ? o.temas : []).slice(0, 300).forEach(g => {
        if(!g || typeof g !== 'object') return;
        const tests = [];
        (Array.isArray(g.tests) ? g.tests : []).forEach(t => {
          if(total >= 2000 || !t || typeof t !== 'object') return;
          const nombre = txt(t.nombre, 160);
          if(!nombre) return;
          tests.push({ nombre, preguntas: ent(t.preguntas, 1, 500) });
          total++;
        });
        if(tests.length) temas.push({ numero: ent(g.numero, 0, 999), nombre: txt(g.nombre, 150), tests });
      });
      return temas.length ? { tipo: 'tests', temas, total } : null;
    }
    return null;
  }
  // La misma clave que impide tener dos veces un test (plan_tests.clave).
  function claveTest(plataforma, referencia, nombre){
    const r = String(referencia || '').trim();
    return plataforma + '|' + (r || String(nombre || '')).trim().toLowerCase();
  }
  // ¿Contiene «a» a «b» como palabras enteras? («tema 5 test 10» no contiene «tema 5 test 1»)
  function contienePalabras(a, b){
    return !!a && !!b && (' ' + a + ' ').includes(' ' + b + ' ');
  }
  // Qué hacer con una lista de tests traída con el marcador: a qué tema tuyo
  // va cada tema de Tutor Bombero (mismo número; si no, mismo nombre; si no,
  // uno nuevo) y qué tests son nuevos (los que ya tienes se saltan, aunque
  // los escribieras con otros signos: «Tema 5 - Test 3» = «Tema 5 · Test 3»).
  // referencia = lo que hay que buscar en Tutor Bombero («Tema 5 · Test 3»).
  function planImportacionTB(payload, temas, tests){
    const mios = (temas || []).filter(t => t && t.id);
    const deTb = (tests || []).filter(t => t && t.plataforma === 'tutor_bombero');
    const vistos = new Set(deTb.map(t => normalizar(t.referencia || t.nombre)));
    const porTemaNombre = new Set(deTb.map(t => (t.tema_id || '') + '|' + normalizar(t.nombre)));
    const exactas = new Set((tests || []).filter(Boolean).map(t => claveTest(t.plataforma, t.referencia, t.nombre)));
    const temaPorNombre = new Map();
    mios.forEach(t => { if(t.nombre) temaPorNombre.set(normalizar(t.nombre), t); });
    const porCrear = new Map();
    const grupos = [];
    let nuevosTotal = 0, repetidosTotal = 0;
    ((payload && payload.temas) || []).forEach(g => {
      let tema = null, crear = null;
      if(g.numero != null){
        const c = mios.filter(t => Number(t.numero) === g.numero);
        tema = c.find(t => !t.archivado) || c[0] || null;
      }
      if(!tema && g.nombre) tema = temaPorNombre.get(normalizar(g.nombre)) || null;
      if(!tema && (g.numero != null || g.nombre)){
        const nombre = String(g.nombre || ('Tema ' + g.numero)).slice(0, 160);
        tema = temaPorNombre.get(normalizar(nombre)) || null;
        if(!tema){
          const k = g.numero != null ? 'n' + g.numero : 'x' + normalizar(nombre);
          crear = porCrear.get(k) || { numero: g.numero, nombre };
          porCrear.set(k, crear);
        }
      }
      const etiqueta = g.numero != null ? 'Tema ' + g.numero : (g.nombre || '');
      const reTema = g.numero != null ? new RegExp('\\btema\\s*0*' + g.numero + '\\b') : null;
      const nuevos = [];
      let repetidos = 0;
      g.tests.forEach(t => {
        const n = normalizar(t.nombre);
        const yaLleva = reTema ? reTema.test(n) : (!!g.nombre && contienePalabras(n, normalizar(g.nombre)));
        const referencia = (!etiqueta || yaLleva ? t.nombre : etiqueta + ' · ' + t.nombre).slice(0, 160);
        const kn = normalizar(referencia);
        const exacta = claveTest('tutor_bombero', referencia, t.nombre);
        if(vistos.has(kn) || exactas.has(exacta) || (tema && porTemaNombre.has(tema.id + '|' + n))){ repetidos++; return; }
        vistos.add(kn);
        exactas.add(exacta);
        nuevos.push({ nombre: t.nombre, referencia, num_preguntas: t.preguntas || null });
      });
      nuevosTotal += nuevos.length;
      repetidosTotal += repetidos;
      grupos.push({ numero: g.numero, nombre: g.nombre, tema_id: tema ? tema.id : null, crear, nuevos, repetidos });
    });
    return { grupos, nuevos: nuevosTotal, repetidos: repetidosTotal, temasNuevos: porCrear.size };
  }
  // A qué test y tarea va un resultado traído con el marcador. Primero por el
  // título (si coincide con un test de Tutor Bombero de tu catálogo); si no,
  // la tarea de Tutor Bombero que abriste desde el plan (en curso).
  // seguro = sin dudas (se guarda directamente); si no, candidatas para elegir.
  function elegirTareaTB(o){
    o = o || {};
    const h = o.hoy || hoy();
    const ahora = o.ahora != null ? o.ahora : Date.now();
    const tests = (o.tests || []).filter(t => t && t.plataforma === 'tutor_bombero' && !t.archivado);
    const tareas = (o.tareas || []).filter(t => t && t.test_id);
    const testDe = id => tests.find(t => t.id === id) || null;
    const ms = iso => { const v = Date.parse(iso); return Number.isFinite(v) ? v : 0; };
    const tit = normalizar(o.titulo || '');
    let porTitulo = [];
    if(tit.length >= 3){
      porTitulo = tests.filter(t => normalizar(t.referencia || '') === tit || normalizar(t.nombre) === tit);
      if(!porTitulo.length) porTitulo = tests.filter(t => { const r = normalizar(t.referencia || ''); return r.length >= 5 && contienePalabras(tit, r); });
    }
    const pendienteDe = test => {
      const l = tareas.filter(t => t.test_id === test.id && t.estado !== 'completado');
      return l.find(t => t.estado === 'en_curso') || l.find(t => t.fecha === h) ||
        l.filter(t => t.fecha < h).sort((a, b) => a.fecha < b.fecha ? 1 : -1)[0] || l.sort((a, b) => a.fecha < b.fecha ? -1 : 1)[0] || null;
    };
    const abiertas = tareas.filter(t => t.estado === 'en_curso' && testDe(t.test_id)).sort((a, b) => ms(b.abierta_at) - ms(a.abierta_at));
    if(porTitulo.length === 1) return { test: porTitulo[0], tarea: pendienteDe(porTitulo[0]), seguro: true, candidatas: [] };
    const entre = porTitulo.length ? abiertas.filter(t => porTitulo.some(x => x.id === t.test_id)) : abiertas;
    const reciente = t => ahora - ms(t.abierta_at) <= 12 * 3600 * 1000;
    if(entre.length === 1 && (porTitulo.length || reciente(entre[0]))) return { test: testDe(entre[0].test_id), tarea: entre[0], seguro: true, candidatas: [] };
    // Con dudas: lo abierto, lo de hoy y lo que coincide con el título.
    const cand = [];
    const meter = t => { if(t && !cand.some(x => x.id === t.id)) cand.push(t); };
    abiertas.forEach(meter);
    porTitulo.forEach(t => meter(pendienteDe(t)));
    tareas.filter(t => t.fecha === h && t.estado !== 'completado' && testDe(t.test_id)).forEach(meter);
    return { test: null, tarea: null, seguro: false, candidatas: cand.slice(0, 12), porTitulo };
  }

  return {
    ZONA: ZONA, REGLAS_DEF: REGLAS_DEF, AJUSTES_DEF: AJUSTES_DEF, TB_URL: TB_URL,
    PLATAFORMAS: PLATAFORMAS, ESTADOS: ESTADOS, PRIORIDADES: PRIORIDADES,
    // Fechas
    hoy: hoy, sumarDias: sumarDias, diaSemana: diaSemana, lunesDe: lunesDe, rango: rango, diasEntre: diasEntre,
    primeroDeMes: primeroDeMes, diasDelMes: diasDelMes, nombreDia: nombreDia, fechaCorta: fechaCorta, fechaLarga: fechaLarga,
    // Ajustes
    ajustesDe: ajustesDe, esDiaDeEstudio: esDiaDeEstudio,
    // Tareas
    abierta: abierta, tareasDelDia: tareasDelDia, atrasadas: atrasadas, ordenarDia: ordenarDia, ocupacion: ocupacion,
    puedeAnadir: puedeAnadir, evaluarApertura: evaluarApertura, proponerPlan: proponerPlan,
    // Resultados y estadísticas
    notaDe: notaDe, pctDe: pctDe, statsTemas: statsTemas, temasAReforzar: temasAReforzar, proponerRepasos: proponerRepasos,
    cumplimiento: cumplimiento, serie: serie, tiempo: tiempo, historial: historial,
    // Texto pegado
    parsearResultado: parsearResultado,
    // Marcador de Tutor Bombero
    leerMarcadorTB: leerMarcadorTB, planImportacionTB: planImportacionTB, elegirTareaTB: elegirTareaTB, claveTest: claveTest,
    // Preguntas y exámenes
    normalizar: normalizar, generarExamen: generarExamen, corregir: corregir, erroresRecurrentes: erroresRecurrentes,
    ordenNatural: ordenNatural,
    // Solo para las pruebas: el día en Madrid calculado sin Intl.
    _diaMadridSinIntl: diaMadridSinIntl
  };
})();
if(typeof module !== 'undefined' && module.exports) module.exports = PLANL;
