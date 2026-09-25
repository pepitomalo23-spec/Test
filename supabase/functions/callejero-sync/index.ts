// =====================================================================
// callejero-sync
// =====================================================================
// Mantiene al día el callejero de Córdoba a partir del Callejero Digital
// de Andalucía Unificado (CDAU, IECA — Junta de Andalucía, CC BY 4.0).
//
// Acciones (cuerpo JSON {"accion": ...}):
//   - "sincronizar": descarga las vías del CDAU, las valida y las compara
//     con las guardadas:
//       · vía nueva               → se añade sola (queda anotada)
//       · cambio de trazado       → se aplica solo (queda anotado)
//       · cambio de nombre / tipo → queda PENDIENTE de un administrador
//       · vía que ya no está      → queda PENDIENTE de un administrador
//     Si la descarga parece incompleta (menos del 90 % de las vías que ya
//     hay), no se toca nada y se anota el error.
//   - "aprobar" / "rechazar" {id}: el administrador decide un cambio.
//   - "publicar": vuelve a generar el archivo que descarga la app.
// Después de cualquier cambio se publica en el almacén público
// «callejero» un archivo compacto con las vías activas, y su ruta se
// guarda en callejero_publicado. El archivo lleva también los barrios
// urbanos (DERA) y, para cada vía, en qué barrios está.
//
// Invocación:
//   - Cada lunes con pg_cron (cabecera "x-callejero-secret", valor en
//     app_secrets 'callejero_sync_secret').
//   - Desde Administración → Callejero, con la sesión de un administrador.
// =====================================================================

// Versión fijada: la última publicada en JSR no se puede empaquetar.
import { createClient, SupabaseClient } from "jsr:@supabase/supabase-js@2.117.1";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const INE_MUNICIPIO = "14021"; // Córdoba
const WFS = "https://www.callejerodeandalucia.es/servicios/cdau/wfs";
const PAGE = 1000;
const BUCKET = "callejero";
const CARPETA = "cordoba";
// Caja que envuelve el término municipal de Córdoba (con margen): una
// coordenada fuera de aquí es un dato corrupto.
const BBOX = { minLon: -5.4, maxLon: -4.2, minLat: 37.4, maxLat: 38.4 };
// Tipos que no son calles que se estudien (fincas y zonas rurales).
const TIPOS_NO_JUGABLES = new Set(["CORTIJO", "EXTRARRADIO"]);
// Tolerancia para simplificar el trazado del archivo publicado (metros).
const SIMPLIFICAR_M = 1.5;
const ATRIBUCION =
  "Callejero: Callejero Digital de Andalucía Unificado (CDAU) · Río y barrios: DERA — Instituto de Estadística y Cartografía de Andalucía, Junta de Andalucía (CC BY 4.0).";
// El Guadalquivir, solo para orientarse en el mapa (DERA, IECA, CC BY 4.0).
const RIO_WFS = "https://www.ideandalucia.es/services/DERA_g3_hidrografia/wfs";
const RIO_NOMBRE = "Río Guadalquivir";
const RIO_CAJA = { minLon: -5.12, maxLon: -4.33, minLat: 37.65, maxLat: 38.15 };
// Barrios urbanos de Córdoba, con su distrito (DERA g13_24, IECA, CC BY 4.0).
const BARRIOS_WFS = "https://www.ideandalucia.es/services/DERA_g13_limites_administrativos/wfs";
// Una vía está en un barrio si al menos esta parte de su trazado cae dentro.
const BARRIO_MIN_FRACCION = 0.2;
const MUESTREO_M = 25;
// Los distritos de DERA no siempre coinciden con los del Ayuntamiento, que
// son los que valen en el examen. Correcciones comprobadas con las fichas
// de cada distrito en participa.cordoba.es (septiembre de 2026):
//   - DERA llama «Norte Centro» al distrito que el Ayuntamiento llama
//     «Noroeste» (mismos barrios).
//   - San Rafael de la Albaida es del distrito Poniente Norte, no del
//     Noroeste.
const DISTRITO_AYUNTAMIENTO: Record<string, string> = { "Norte Centro": "Noroeste" };
const BARRIO_DISTRITO_AYUNTAMIENTO: Record<string, string> = { "San Rafael de la Albaida": "Poniente Norte" };

type Via = {
  id_vial: number;
  tipo: string;
  nombre_oficial: string;
  nombre: string;
  sobrenombre: string | null;
  acceso: string | null;
  competencia: string | null;
  fuente: string | null;
  geom: number[][][];
  geom_hash: string;
  jugable: boolean;
  activa: boolean;
};

// ---------------------------------------------------------------------
// Descarga y validación
// ---------------------------------------------------------------------
async function sha(text: string, len = 16) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, len);
}

function esJugable(tipo: string, nombreOficial: string) {
  return !TIPOS_NO_JUGABLES.has(tipo) && !/^SIN NOMBRE/i.test(nombreOficial);
}

// El servidor del CDAU no indica el tamaño de la respuesta y cierra la
// conexión de golpe al terminar, lo que Deno trata como error. Se lee a
// mano y se acepta lo recibido: si llegara cortado, JSON.parse falla y
// el recuento de vías de abajo lo detectaría igualmente.
async function leerCuerpo(resp: Response) {
  const partes: Uint8Array[] = [];
  const reader = resp.body!.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      partes.push(value);
    }
  } catch { /* cierre brusco de la conexión */ }
  const buf = new Uint8Array(partes.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of partes) { buf.set(p, o); o += p.length; }
  return new TextDecoder().decode(buf);
}

async function descargarCdau() {
  const features: any[] = [];
  let total = Infinity;
  for (let start = 0; start < total; start += PAGE) {
    const url = `${WFS}?service=WFS&version=2.0.0&request=GetFeature&typeNames=cdau:v_vial` +
      `&outputFormat=application/json&sortBy=id_vial&count=${PAGE}&startIndex=${start}` +
      `&CQL_FILTER=${encodeURIComponent(`ine_mun='${INE_MUNICIPIO}'`)}`;
    const resp = await fetch(url, { signal: AbortSignal.timeout(60000) });
    if (!resp.ok) throw new Error(`CDAU respondió HTTP ${resp.status}`);
    let data: any;
    try { data = JSON.parse(await leerCuerpo(resp)); }
    catch { throw new Error(`Respuesta del CDAU incompleta (desde la vía ${start})`); }
    if (!data || data.type !== "FeatureCollection" || !Array.isArray(data.features)) {
      throw new Error("El CDAU no devolvió una lista de vías válida");
    }
    total = Number(data.numberMatched ?? data.totalFeatures ?? 0);
    features.push(...data.features);
    if (data.features.length === 0) break;
  }
  if (features.length !== total) throw new Error(`Descarga incompleta del CDAU: ${features.length} de ${total} vías`);
  return features;
}

async function validar(features: any[]) {
  const vias = new Map<number, Omit<Via, "jugable" | "activa">>();
  const descartadas: Record<string, number> = {};
  const descartar = (motivo: string) => { descartadas[motivo] = (descartadas[motivo] || 0) + 1; };
  for (const f of features) {
    const p = f.properties || {};
    const id = Number(p.id_vial);
    if (!Number.isSafeInteger(id) || id <= 0) { descartar("sin identificador"); continue; }
    if (vias.has(id)) { descartar("identificador repetido"); continue; }
    if (String(p.ine_mun) !== INE_MUNICIPIO) { descartar("de otro municipio"); continue; }
    const tipo = String(p.nom_tip_via || "").trim();
    const nombreOficial = String(p.nom_via || "").trim();
    if (!tipo || !nombreOficial) { descartar("sin nombre o tipo"); continue; }
    const g = f.geometry;
    let lineas: number[][][] | null = null;
    if (g && g.type === "MultiLineString") lineas = g.coordinates;
    else if (g && g.type === "LineString") lineas = [g.coordinates];
    if (!lineas || !lineas.length) { descartar("sin trazado"); continue; }
    let ok = true;
    const geom = lineas.map((l) => l.map(([x, y]) => {
      if (!(x >= BBOX.minLon && x <= BBOX.maxLon && y >= BBOX.minLat && y <= BBOX.maxLat)) ok = false;
      return [Math.round(x * 1e6) / 1e6, Math.round(y * 1e6) / 1e6];
    })).filter((l) => l.length >= 2);
    if (!ok || !geom.length) { descartar("trazado fuera de Córdoba"); continue; }
    const nombre = String(p.nom_normalizado || "").trim() || `${tipo} ${nombreOficial}`;
    vias.set(id, {
      id_vial: id,
      tipo,
      nombre_oficial: nombreOficial,
      nombre,
      sobrenombre: p.sobrenombre || null,
      acceso: p.acceso || null,
      competencia: p.competencia || null,
      fuente: p.fuente || null,
      geom,
      geom_hash: await sha(JSON.stringify(geom)),
    });
  }
  return { vias, descartadas };
}

// ---------------------------------------------------------------------
// Base de datos
// ---------------------------------------------------------------------
async function leerTodo(sb: SupabaseClient, tabla: string, columnas: string, filtro?: (q: any) => any) {
  const filas: any[] = [];
  for (let from = 0; ; from += PAGE) {
    let q = sb.from(tabla).select(columnas).order("id_vial").range(from, from + PAGE - 1);
    if (filtro) q = filtro(q);
    const { data, error } = await q;
    if (error) throw new Error(`${tabla}: ${error.message}`);
    filas.push(...(data || []));
    if (!data || data.length < PAGE) break;
  }
  return filas;
}

async function enLotes<T>(filas: T[], fn: (lote: T[]) => Promise<void>, tam = 500) {
  for (let i = 0; i < filas.length; i += tam) await fn(filas.slice(i, i + tam));
}

async function sincronizar(sb: SupabaseClient) {
  const { vias: cdau, descartadas } = await validar(await descargarCdau());
  const actuales = await leerTodo(sb, "callejero_vias",
    "id_vial, tipo, nombre_oficial, nombre, sobrenombre, acceso, competencia, fuente, geom_hash, jugable, activa");
  const porId = new Map<number, any>(actuales.map((v) => [Number(v.id_vial), v]));
  const activas = actuales.filter((v) => v.activa).length;
  if (activas > 0 && cdau.size < activas * 0.9) {
    throw new Error(`El CDAU ha devuelto ${cdau.size} vías válidas y hay ${activas} activas: parece una descarga incompleta, no se cambia nada.`);
  }
  const cargaInicial = actuales.length === 0;

  // Últimos cambios de cada vía, para no repetir avisos ya pendientes o rechazados.
  const { data: previos, error: errPrev } = await sb.from("callejero_cambios")
    .select("id, id_vial, tipo_cambio, despues, estado, revisado_por")
    .in("tipo_cambio", ["renombrada", "desaparecida"])
    .in("estado", ["pendiente", "rechazado"])
    .order("id", { ascending: false });
  if (errPrev) throw new Error(errPrev.message);
  // Un «rechazado» sin revisado_por lo cerró la propia sincronización (el
  // CDAU volvió atrás): no cuenta como decisión del administrador.
  const decidido = (c: any) => c && (c.estado === "pendiente" || (c.estado === "rechazado" && c.revisado_por));
  const ultimoCambio = new Map<string, any>();
  for (const c of previos || []) {
    const k = `${c.id_vial}:${c.tipo_cambio}`;
    if (!ultimoCambio.has(k)) ultimoCambio.set(k, c);
  }

  const ahora = new Date().toISOString();
  const nuevas: any[] = [];
  const actualizar: any[] = [];
  const cambios: any[] = [];
  const cerrar: number[] = []; // pendientes que ya no tienen sentido
  const resumen = { nuevas: 0, trazados: 0, renombradas: 0, desaparecidas: 0, reaparecidas: 0, datos: 0 };

  for (const v of cdau.values()) {
    const actual = porId.get(v.id_vial);
    if (!actual) {
      nuevas.push({ ...v, jugable: esJugable(v.tipo, v.nombre_oficial), activa: true, alta_at: ahora, actualizada_at: ahora });
      resumen.nuevas++;
      if (!cargaInicial) cambios.push({ id_vial: v.id_vial, tipo_cambio: "nueva", despues: { tipo: v.tipo, nombre: v.nombre }, estado: "automatico" });
      continue;
    }
    const pendDesap = ultimoCambio.get(`${v.id_vial}:desaparecida`);
    if (pendDesap && pendDesap.estado === "pendiente") cerrar.push(pendDesap.id);

    const nombreDistinto = actual.tipo !== v.tipo || actual.nombre_oficial !== v.nombre_oficial || actual.nombre !== v.nombre;
    const pendRen = ultimoCambio.get(`${v.id_vial}:renombrada`);
    if (nombreDistinto) {
      const despues = { tipo: v.tipo, nombre_oficial: v.nombre_oficial, nombre: v.nombre };
      // Campo a campo: jsonb no conserva el orden de las claves.
      const d = pendRen?.despues || {};
      const mismo = decidido(pendRen) && d.tipo === despues.tipo && d.nombre_oficial === despues.nombre_oficial && d.nombre === despues.nombre;
      if (!mismo) {
        if (pendRen && pendRen.estado === "pendiente") cerrar.push(pendRen.id);
        cambios.push({
          id_vial: v.id_vial, tipo_cambio: "renombrada", estado: "pendiente",
          antes: { tipo: actual.tipo, nombre_oficial: actual.nombre_oficial, nombre: actual.nombre }, despues,
        });
        resumen.renombradas++;
      }
    } else if (pendRen && pendRen.estado === "pendiente") {
      cerrar.push(pendRen.id); // el CDAU ha vuelto al nombre que ya teníamos
    }

    const trazado = actual.geom_hash !== v.geom_hash;
    const datos = actual.sobrenombre !== v.sobrenombre || actual.acceso !== v.acceso ||
      actual.competencia !== v.competencia || actual.fuente !== v.fuente;
    const reaparece = !actual.activa;
    if (trazado || datos || reaparece) {
      // El nombre y el tipo se quedan como estaban: solo cambian si un admin lo aprueba.
      actualizar.push({
        ...v, tipo: actual.tipo, nombre_oficial: actual.nombre_oficial, nombre: actual.nombre,
        jugable: actual.jugable, activa: true, actualizada_at: ahora,
      });
      if (trazado) { resumen.trazados++; cambios.push({ id_vial: v.id_vial, tipo_cambio: "trazado", estado: "automatico", despues: { nombre: actual.nombre } }); }
      else if (datos) resumen.datos++;
      if (reaparece) { resumen.reaparecidas++; cambios.push({ id_vial: v.id_vial, tipo_cambio: "reaparecida", estado: "automatico", despues: { nombre: actual.nombre } }); }
    }
  }
  for (const actual of actuales) {
    if (!actual.activa || cdau.has(Number(actual.id_vial))) continue;
    const prev = ultimoCambio.get(`${actual.id_vial}:desaparecida`);
    if (decidido(prev)) continue; // ya avisada (pendiente) o el admin decidió mantenerla
    cambios.push({ id_vial: actual.id_vial, tipo_cambio: "desaparecida", estado: "pendiente", antes: { tipo: actual.tipo, nombre: actual.nombre } });
    resumen.desaparecidas++;
  }

  await enLotes(nuevas, async (lote) => {
    const { error } = await sb.from("callejero_vias").insert(lote);
    if (error) throw new Error(`Guardando vías nuevas: ${error.message}`);
  });
  // Todas las filas llevan las mismas columnas (sin alta_at, que no se toca).
  await enLotes(actualizar, async (lote) => {
    const { error } = await sb.from("callejero_vias").upsert(lote, { onConflict: "id_vial" });
    if (error) throw new Error(`Actualizando vías: ${error.message}`);
  });
  if (cerrar.length) {
    const { error } = await sb.from("callejero_cambios").update({ estado: "rechazado", revisado_at: ahora }).in("id", cerrar);
    if (error) throw new Error(error.message);
  }
  await enLotes(cambios, async (lote) => {
    const { error } = await sb.from("callejero_cambios").insert(lote);
    if (error) throw new Error(`Guardando cambios: ${error.message}`);
  });

  return { carga_inicial: cargaInicial, vias_cdau: cdau.size, descartadas, ...resumen, escritas: nuevas.length + actualizar.length };
}

// ---------------------------------------------------------------------
// Archivo publicado para la app
// ---------------------------------------------------------------------
// Douglas-Peucker en metros (aproximación plana, suficiente a esta escala).
function simplificar(pts: number[][], tolM: number): number[][] {
  if (pts.length < 3) return pts;
  const kx = 111320 * Math.cos((37.88 * Math.PI) / 180), ky = 110540;
  const dist = (p: number[], a: number[], b: number[]) => {
    const px = (p[0] - a[0]) * kx, py = (p[1] - a[1]) * ky;
    const bx = (b[0] - a[0]) * kx, by = (b[1] - a[1]) * ky;
    const L = bx * bx + by * by;
    const t = L ? Math.max(0, Math.min(1, (px * bx + py * by) / L)) : 0;
    return Math.hypot(px - t * bx, py - t * by);
  };
  const guardar = new Uint8Array(pts.length);
  guardar[0] = guardar[pts.length - 1] = 1;
  const pila: [number, number][] = [[0, pts.length - 1]];
  while (pila.length) {
    const [a, b] = pila.pop()!;
    let max = 0, idx = -1;
    for (let i = a + 1; i < b; i++) {
      const d = dist(pts[i], pts[a], pts[b]);
      if (d > max) { max = d; idx = i; }
    }
    if (max > tolM && idx > 0) { guardar[idx] = 1; pila.push([a, idx], [idx, b]); }
  }
  return pts.filter((_, i) => guardar[i]);
}

// Cada línea se guarda como enteros (grados × 100 000, ~1 m) con
// diferencias entre puntos consecutivos: ocupa mucho menos.
function codificar(lineas: number[][][], tolM = SIMPLIFICAR_M) {
  return lineas.map((l) => {
    const out: number[] = [];
    let px = 0, py = 0;
    for (const [x, y] of simplificar(l, tolM)) {
      const ix = Math.round(x * 1e5), iy = Math.round(y * 1e5);
      if (out.length && ix === px && iy === py) continue;
      out.push(ix - px, iy - py);
      px = ix; py = iy;
    }
    return out;
  }).filter((l) => l.length >= 4);
}

// Tramo del Guadalquivir que pasa por el término municipal. Si no se puede
// descargar, el archivo se publica sin él (solo sirve para orientarse).
async function descargarRio(): Promise<number[][][]> {
  try {
    const url = `${RIO_WFS}?service=WFS&version=2.0.0&request=GetFeature&typeNames=DERA_g3_hidrografia:g03_01_Rio` +
      `&outputFormat=application/json&srsName=${encodeURIComponent("urn:ogc:def:crs:EPSG::4326")}` +
      `&CQL_FILTER=${encodeURIComponent(`nombre='${RIO_NOMBRE}'`)}`;
    const resp = await fetch(url, { signal: AbortSignal.timeout(60000) });
    if (!resp.ok) return [];
    const data = JSON.parse(await leerCuerpo(resp));
    const dentro = ([x, y]: number[]) => x >= RIO_CAJA.minLon && x <= RIO_CAJA.maxLon && y >= RIO_CAJA.minLat && y <= RIO_CAJA.maxLat;
    const tramos: number[][][] = [];
    for (const f of data.features || []) {
      const g = f.geometry;
      const lineas: number[][][] = g?.type === "MultiLineString" ? g.coordinates : g?.type === "LineString" ? [g.coordinates] : [];
      for (const l of lineas) {
        let actual: number[][] = [];
        for (const p of l) {
          if (dentro(p)) actual.push(p);
          else { if (actual.length > 1) tramos.push(actual); actual = []; }
        }
        if (actual.length > 1) tramos.push(actual);
      }
    }
    return tramos;
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------
// Barrios
// ---------------------------------------------------------------------
type Barrio = { nombre: string; distrito: string; anillos: number[][][]; caja: number[] };

async function descargarBarrios(): Promise<Barrio[]> {
  const url = `${BARRIOS_WFS}?service=WFS&version=2.0.0&request=GetFeature&typeNames=DERA_g13_limites_administrativos:g13_24_BarrioUrbano` +
    `&outputFormat=application/json&srsName=${encodeURIComponent("urn:ogc:def:crs:EPSG::4326")}` +
    `&CQL_FILTER=${encodeURIComponent(`cod_mun='${INE_MUNICIPIO}'`)}`;
  const resp = await fetch(url, { signal: AbortSignal.timeout(60000) });
  if (!resp.ok) throw new Error(`DERA respondió HTTP ${resp.status}`);
  const data = JSON.parse(await leerCuerpo(resp));
  const barrios: Barrio[] = [];
  for (const f of data.features || []) {
    const p = f.properties || {};
    const g = f.geometry;
    const poligonos: number[][][][] = g?.type === "MultiPolygon" ? g.coordinates : g?.type === "Polygon" ? [g.coordinates] : [];
    const anillos = poligonos.flat().filter((r) => r.length >= 4);
    if (!p.nombre || !anillos.length) continue;
    const pts = anillos.flat();
    const nombre = String(p.nombre).trim();
    const distritoDera = String(p.distrito || "").trim();
    barrios.push({
      nombre,
      distrito: BARRIO_DISTRITO_AYUNTAMIENTO[nombre] || DISTRITO_AYUNTAMIENTO[distritoDera] || distritoDera,
      anillos,
      caja: [Math.min(...pts.map((q) => q[0])), Math.min(...pts.map((q) => q[1])), Math.max(...pts.map((q) => q[0])), Math.max(...pts.map((q) => q[1]))],
    });
  }
  // Por debajo de esto, la respuesta está incompleta: no se usa.
  if (barrios.length < 50) throw new Error(`DERA solo ha devuelto ${barrios.length} barrios`);
  return barrios.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}

// Punto dentro de un barrio (regla par-impar: los huecos quedan fuera).
function dentroDeBarrio([x, y]: number[], b: Barrio) {
  if (x < b.caja[0] || x > b.caja[2] || y < b.caja[1] || y > b.caja[3]) return false;
  let dentro = false;
  for (const r of b.anillos) {
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const [xi, yi] = r[i], [xj, yj] = r[j];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) dentro = !dentro;
    }
  }
  return dentro;
}

// Puntos cada MUESTREO_M metros a lo largo del trazado de una vía.
function muestrear(lineas: number[][][]) {
  const kx = 111320 * Math.cos((37.88 * Math.PI) / 180), ky = 110540;
  const pts: number[][] = [];
  for (const l of lineas) {
    for (let k = 0; k < l.length - 1; k++) {
      const [x0, y0] = l[k], [x1, y1] = l[k + 1];
      const n = Math.max(1, Math.ceil(Math.hypot((x1 - x0) * kx, (y1 - y0) * ky) / MUESTREO_M));
      for (let t = 0; t < n; t++) pts.push([x0 + ((x1 - x0) * t) / n, y0 + ((y1 - y0) * t) / n]);
    }
    pts.push(l[l.length - 1]);
  }
  return pts;
}

// Índices (en `barrios`) de los barrios por los que pasa la vía.
function barriosDeVia(lineas: number[][][], barrios: Barrio[]) {
  const pts = muestrear(lineas);
  const cuenta = new Map<number, number>();
  for (const p of pts) {
    for (let i = 0; i < barrios.length; i++) {
      if (dentroDeBarrio(p, barrios[i])) { cuenta.set(i, (cuenta.get(i) || 0) + 1); break; }
    }
  }
  const out = [...cuenta].filter(([, n]) => n / pts.length >= BARRIO_MIN_FRACCION).map(([i]) => i);
  if (!out.length && cuenta.size) out.push([...cuenta].sort((a, b) => b[1] - a[1])[0][0]);
  return out.sort((a, b) => a - b);
}

async function publicar(sb: SupabaseClient, forzar = false) {
  const vias = await leerTodo(sb, "callejero_vias", "id_vial, tipo, nombre, jugable, geom", (q) => q.eq("activa", true));
  const { data: actual } = await sb.from("callejero_publicado").select("version, archivo").eq("id", 1).maybeSingle();
  // Barrios: de DERA; si no responde, los del archivo ya publicado (así
  // una caída de DERA nunca deja la app sin barrios).
  let barrios: Barrio[] | null = null;
  let previo: any = null;
  try {
    barrios = await descargarBarrios();
  } catch (e) {
    if (actual?.archivo) {
      const { data: blob } = await sb.storage.from(BUCKET).download(actual.archivo);
      if (blob) previo = JSON.parse(await blob.text());
    }
    if (!previo?.zonas) console.warn("Sin barrios:", (e as Error).message);
  }
  // [id_vial, nombre, tipo, jugable (1/0), líneas codificadas, barrios]
  const filas = vias.map((v) => {
    const fila: unknown[] = [Number(v.id_vial), v.nombre, v.tipo, v.jugable ? 1 : 0, codificar(v.geom)];
    if (barrios) fila.push(barriosDeVia(v.geom, barrios));
    return fila;
  }).filter((f) => (f[4] as number[][]).length);
  if (!barrios && previo?.zonas) {
    // Se conserva la asignación del archivo anterior para las vías que ya estaban.
    const asignado = new Map<number, number[]>((previo.vias || []).map((f: any[]) => [f[0], f[5] || []]));
    filas.forEach((f) => f.push(asignado.get(f[0] as number) || []));
  }
  const zonas = barrios
    ? { barrios: barrios.map((b) => [b.nombre, b.distrito, codificar(b.anillos, 5)]) }
    : previo?.zonas || null;
  const rio = codificar(await descargarRio(), 5);
  // El nombre del archivo depende de su contenido: nunca se sobrescribe
  // uno ya publicado (los móviles lo guardan para siempre).
  const version = await sha(JSON.stringify([filas, rio, zonas]), 12);
  if (!forzar && actual?.version === version) return { publicado: false, version };

  const archivo = `${CARPETA}/${version}.json`;
  const doc = JSON.stringify({
    formato: 2,
    version,
    generado: new Date().toISOString(),
    municipio: INE_MUNICIPIO,
    atribucion: ATRIBUCION,
    // [id_vial, nombre, tipo, jugable (1/0), líneas codificadas, índices de sus barrios]
    vias: filas,
    // Líneas del Guadalquivir, codificadas igual que las vías.
    rio,
    // barrios: [nombre, distrito, anillos del contorno codificados]
    zonas,
  });
  const { error: errUp } = await sb.storage.from(BUCKET).upload(archivo, new Blob([doc], { type: "application/json" }), {
    contentType: "application/json", cacheControl: "31536000", upsert: true,
  });
  if (errUp) throw new Error(`Subiendo el archivo: ${errUp.message}`);
  const { error } = await sb.from("callejero_publicado").upsert({
    id: 1, version, archivo, total_vias: filas.length,
    jugables: filas.filter((f) => f[3] === 1).length, publicado_at: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);

  // Se conservan solo el archivo actual y el anterior.
  const { data: lista } = await sb.storage.from(BUCKET).list(CARPETA, { limit: 100, sortBy: { column: "created_at", order: "desc" } });
  const viejos = (lista || []).map((f) => `${CARPETA}/${f.name}`).filter((p) => p !== archivo).slice(1);
  if (viejos.length) await sb.storage.from(BUCKET).remove(viejos);
  return { publicado: true, version, bytes: doc.length, vias: filas.length };
}

// ---------------------------------------------------------------------
// Decisiones del administrador
// ---------------------------------------------------------------------
async function decidir(sb: SupabaseClient, id: number, aprobar: boolean, adminId: string | null) {
  const { data: c, error } = await sb.from("callejero_cambios").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!c) throw new Error("Ese cambio no existe");
  if (c.estado !== "pendiente") throw new Error("Ese cambio ya está decidido");
  const ahora = new Date().toISOString();
  if (aprobar) {
    let upd: Record<string, unknown> | null = null;
    if (c.tipo_cambio === "renombrada") {
      const d = c.despues || {};
      upd = { tipo: d.tipo, nombre_oficial: d.nombre_oficial, nombre: d.nombre, jugable: esJugable(d.tipo, d.nombre_oficial), actualizada_at: ahora };
    } else if (c.tipo_cambio === "desaparecida") {
      upd = { activa: false, actualizada_at: ahora };
    }
    if (upd) {
      const { error: e2 } = await sb.from("callejero_vias").update(upd).eq("id_vial", c.id_vial);
      if (e2) throw new Error(e2.message);
    }
  }
  const { error: e3 } = await sb.from("callejero_cambios")
    .update({ estado: aprobar ? "aplicado" : "rechazado", revisado_at: ahora, revisado_por: adminId })
    .eq("id", id);
  if (e3) throw new Error(e3.message);
}

// ---------------------------------------------------------------------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // ---- Autorización: cron (secreto) o un administrador ----
  let adminId: string | null = null;
  const { data: sec } = await sb.from("app_secrets").select("value").eq("name", "callejero_sync_secret").maybeSingle();
  const esCron = !!sec?.value && req.headers.get("x-callejero-secret") === sec.value;
  if (!esCron) {
    const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
    const { data: u } = await sb.auth.getUser(token);
    if (!u?.user) return json({ error: "unauthorized" }, 401);
    const { data: prof } = await sb.from("profiles").select("is_admin").eq("id", u.user.id).maybeSingle();
    if (!prof?.is_admin) return json({ error: "forbidden" }, 403);
    adminId = u.user.id;
  }

  let body: any = {};
  try { body = await req.json(); } catch { /* sin cuerpo */ }
  const accion = body.accion || "sincronizar";

  if (accion === "aprobar" || accion === "rechazar") {
    if (!adminId) return json({ error: "forbidden" }, 403);
    try {
      await decidir(sb, Number(body.id), accion === "aprobar", adminId);
      const pub = accion === "aprobar" ? await publicar(sb) : null;
      return json({ ok: true, publicacion: pub });
    } catch (e) {
      return json({ ok: false, error: (e as Error).message }, 400);
    }
  }
  if (accion === "publicar") {
    try {
      return json({ ok: true, publicacion: await publicar(sb, true) });
    } catch (e) {
      return json({ ok: false, error: (e as Error).message }, 500);
    }
  }
  if (accion !== "sincronizar") return json({ error: "acción desconocida" }, 400);

  const { data: log } = await sb.from("callejero_sync_log")
    .insert({ origen: esCron ? "cron" : "admin" }).select("id").single();
  try {
    const resumen = await sincronizar(sb);
    const publicacion = await publicar(sb);
    const res = { ...resumen, publicacion };
    await sb.from("callejero_sync_log").update({ ok: true, terminada_at: new Date().toISOString(), resumen: res }).eq("id", log?.id);
    return json({ ok: true, resumen: res });
  } catch (e) {
    const msg = (e as Error).message;
    await sb.from("callejero_sync_log").update({ ok: false, terminada_at: new Date().toISOString(), error: msg }).eq("id", log?.id);
    return json({ ok: false, error: msg }, 500);
  }
});
