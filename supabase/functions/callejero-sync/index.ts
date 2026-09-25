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
// guarda en callejero_publicado. El archivo lleva también:
//   - los barrios urbanos (DERA) y, para cada vía, en qué barrios está;
//   - los lugares importantes (DERA y, para lo que DERA no tiene,
//     OpenStreetMap: hospitales, colegios, museos, monumentos...);
//   - unas pocas vías que el INE da por oficiales y el CDAU aún no ha
//     dibujado (ver COMPLEMENTOS);
//   - la línea que reparte el término entre los dos parques de bomberos
//     y qué parque acude a cada vía y a cada lugar.
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
  "Callejero: Callejero Digital de Andalucía Unificado (CDAU) · Río, barrios y lugares: DERA — Instituto de Estadística y Cartografía de Andalucía, Junta de Andalucía (CC BY 4.0) · Otros lugares y el trazado de las vías que faltan en el CDAU: © colaboradores de OpenStreetMap (ODbL) · Nombres oficiales: Callejero del Censo Electoral (INE) · Parques de bomberos: S.E.I.S., Ayuntamiento de Córdoba.";
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

// Lugares importantes (DERA g12 Servicios, IECA, CC BY 4.0): capa →
// categoría y, si hace falta, qué registros valen y cómo se llaman.
// Los juzgados de DERA no se usan: casi todos comparten un punto y algunos
// llevan direcciones de otros pueblos (los de OpenStreetMap sí).
const LUGARES_WFS = "https://www.ideandalucia.es/services/DERA_g12_servicios/wfs";
type CapaDera = { categoria: string; nombre?: (p: any) => string | null };
const EDU_NO_LUGAR = /^(Equipo de Orientación|Aulas hospitalarias|Sección de Educación Permanente)/i;
const DEPORTE_DERA: [RegExp, string][] = [
  [/^C\.D\.M\.\s*/i, "Centro Deportivo Municipal "], [/^I\.?D\.?M\.?\s*/i, "Instalación Deportiva Municipal "],
  [/^PALACIO M\.D\.\s*/i, "Palacio Municipal de Deportes "], [/^(INSTALACION DEPORTIVA MUNICIPAL|ESTADIO|PISCINA|CIUDAD DEPORTIVA|CAMPO DE TIRO|CLUB HIPICO|REAL AEROCLUB|CAMPING MUNICIPAL|PABELL[OÓ]N|INSTALACIONES ACUATICAS|CENTRO ECUESTRE|CAMPOS? DE F[UÚ]TBOL)/i, ""],
];
const LUGARES_CAPAS: Record<string, CapaDera> = {
  g12_02_Hospital_CAE: { categoria: "Hospitales" },
  // DERA solo da el barrio («Lucano», «Fuensanta»).
  g12_01_CentroSalud: { categoria: "Centros de salud", nombre: (p) => conPrefijo(p.nombre, /^(Centro de Salud|Consultorio)/i, "Centro de Salud") },
  g12_05_CentroEducativo: {
    categoria: "Colegios e institutos",
    // Fuera las oficinas dentro de otros centros y los «nombres» que son una
    // dirección; a los nombres sueltos («Trinidad», «Puente de Alcolea») se
    // les antepone el tipo de centro.
    nombre: (p) => {
      const n = String(p.nombre || "").trim(), tipo = String(p.tipo || "");
      if (EDU_NO_LUGAR.test(tipo) || /^(C\/|Calle |Avda)/i.test(n)) return null;
      const prefijo = /^Centro Docente Privado/i.test(tipo) ? "Colegio"
        : /^Centro del profesorado/i.test(tipo) ? "Centro del Profesorado"
        : /^Residencias escolares/i.test(tipo) ? "Residencia Escolar"
        : /^Escuela de Arte/i.test(tipo) ? "Escuela de Arte" : tipo;
      return conPrefijo(n, /^(Colegio|Centro|Escuela|Academia|Instituto|Conservatorio|Secci[oó]n)/i, prefijo);
    },
  },
  g12_18_FPE: { categoria: "Colegios e institutos" },
  g12_06_Universidad: { categoria: "Universidad" },
  g12_07_Facultad: { categoria: "Universidad" },
  g12_08_Campus: { categoria: "Universidad" },
  g12_09_ArchivoBiblioteca: { categoria: "Bibliotecas y archivos" },
  g12_20_Museo: { categoria: "Museos" },
  g12_22_EstablecimientoOcio: { categoria: "Cultura y ocio" },
  g12_11_Ayuntamiento: { categoria: "Administraciones" },
  // Sin los archivos internos de cada delegación (están en el mismo edificio).
  g12_32_CentrosJuntaAndalucia: { categoria: "Administraciones", nombre: (p) => /^Archivo Central|Registro e informaci[oó]n$/i.test(String(p.nombre || "")) ? null : p.nombre },
  g12_03_SedeDistritoSanidad: { categoria: "Administraciones" },
  // «CORDOBA SUC 2. AV DE LIBIA» → «Correos Av de Libia».
  g12_28_Correos: {
    categoria: "Correos",
    nombre: (p) => {
      const n = nombreBonito(String(p.nombre || ""));
      return /^C[oó]rdoba Op$/i.test(n) ? "Correos, oficina principal" : n.replace(/^C[oó]rdoba Suc \d+\.\s*/i, "Correos ");
    },
  },
  g12_26_Policia: { categoria: "Seguridad y emergencias" },
  g12_34_GuardiaCivil: { categoria: "Seguridad y emergencias" },
  g12_29_ParqueBomberos: { categoria: "Seguridad y emergencias" },
  g12_35_GestionEmergencias: { categoria: "Seguridad y emergencias" },
  g12_27_Prision: { categoria: "Seguridad y emergencias" },
  g12_36_OrganizacionesHumanitarias: { categoria: "Seguridad y emergencias" },
  g12_12_Cementerio: { categoria: "Cementerios" },
  g12_13_EdificioReligioso: { categoria: "Edificios religiosos" },
  g12_16_Abasto: { categoria: "Mercados y comercios" },
  g12_14_GranComercio: { categoria: "Mercados y comercios" },
  // Solo hoteles (no pensiones ni apartamentos).
  g12_21_Alojamiento: {
    categoria: "Hoteles",
    nombre: (p) => {
      if (p.tipo !== "Hotel") return null;
      return conPrefijo(nombreBonito(String(p.nombre || "")), /\b(Hotel|Parador|Hostal)\b/i, "Hotel");
    },
  },
  // Solo las instalaciones con nombre propio de verdad (no gimnasios de colegio ni pistas de petanca).
  g12_24_InstalacionesDeportivas: {
    categoria: "Instalaciones deportivas",
    nombre: (p) => {
      const n = String(p.nombre || "").trim();
      const r = DEPORTE_DERA.find(([re]) => re.test(n));
      return r ? r[1] + nombreBonito(r[1] ? n.replace(r[0], "") : n) : null;
    },
  },
  g12_30_PalacioCongresos: { categoria: "Cultura y ocio" },
};
// «Lucano» → «Centro de Salud Lucano», salvo que ya empiece por un tipo.
function conPrefijo(nombre: unknown, yaTiene: RegExp, prefijo: string) {
  const n = String(nombre || "").trim();
  return !n || yaTiene.test(n) ? n : `${prefijo} ${n}`;
}
// Nombres que no dicen de qué sitio se trata.
const NOMBRE_GENERICO = /^(capilla|ermita|cementerio|iglesia|parroquia|mercado municipal)$/i;
// En OpenStreetMap, además, hace falta algo con mayúscula después de la
// primera palabra («Cisterna romana» o «Zimal alimentación» no valen).
function tieneNombrePropio(n: string) {
  return n.split(/\s+/).slice(1).some((w) => !PALABRAS_VACIAS.has(w.toLowerCase()) && /^[A-ZÁÉÍÓÚÑ0-9"«(]/.test(w));
}

// Lo que DERA no tiene (monumentos, parques, estaciones, polígonos...) o le
// falta (algunos colegios públicos y hospitales), de OpenStreetMap
// (© colaboradores de OpenStreetMap, ODbL). Solo lugares con nombre; lo que
// ya está en DERA a menos de 300 m con un nombre parecido no se repite.
// El servidor principal va a veces saturado (504): entonces, una réplica pública.
const OVERPASS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"];
const OSM_CAJA = "37.66,-5.00,38.04,-4.35";
const OSM_CONSULTA = `[out:json][timeout:120][bbox:${OSM_CAJA}];
(
  nwr["amenity"~"^(hospital|school|college|university|fire_station|police|courthouse|theatre|cinema|arts_centre|bus_station|nursing_home|library|townhall|marketplace|prison|conference_centre|exhibition_centre)$"]["name"];
  nwr["social_facility"="nursing_home"]["name"];
  nwr["tourism"~"^(museum|zoo)$"]["name"];
  nwr["shop"="mall"]["name"];
  nwr["leisure"~"^(stadium|park|water_park)$"]["name"];
  nwr["railway"="station"]["name"];
  nwr["aeroway"="aerodrome"]["name"];
  nwr["historic"~"^(castle|city_gate|citywalls|tower|monument|archaeological_site|monastery|palace)$"]["name"];
  nwr["landuse"="industrial"]["name"];
);
out tags center bb;`;
// Colegios de OpenStreetMap: solo los públicos con su nombre oficial completo.
const EDU_OFICIAL = /^(Colegio de Educación|CEIP |Instituto de Educación Secundaria|IES |Conservatorio|Escuela Oficial de Idiomas|Escuela de Arte|Escuela Superior|Centro de Educación Permanente)/i;
function categoriaOsm(t: Record<string, string>): string | null {
  const a = t.amenity, n = t.name || "";
  if (a === "hospital") return "Hospitales";
  if (a === "school" || a === "college") return EDU_OFICIAL.test(n) ? "Colegios e institutos" : null;
  if (a === "university") return "Universidad";
  if (a === "fire_station" || a === "police" || a === "prison") return "Seguridad y emergencias";
  if (a === "courthouse") return "Juzgados";
  if (a === "townhall") return "Administraciones";
  if (a === "library") return "Bibliotecas y archivos";
  if (["theatre", "cinema", "arts_centre", "conference_centre", "exhibition_centre"].includes(a) || t.tourism === "zoo") return "Cultura y ocio";
  if (t.tourism === "museum") return "Museos";
  if (a === "bus_station" || t.railway === "station" || t.aeroway === "aerodrome") return "Transporte";
  if (a === "nursing_home" || t.social_facility === "nursing_home") return "Residencias de mayores";
  if (a === "marketplace" || t.shop === "mall") return "Mercados y comercios";
  if (t.leisure === "stadium") return "Instalaciones deportivas";
  // Parques: los que se llaman parque o jardín (las plazas ya son vías).
  if (t.leisure === "park" || t.leisure === "water_park") return /^(Parque|Jard[ií]n|Arboleda|Balc[oó]n)/i.test(n) ? "Parques y jardines" : null;
  if (t.historic) return "Monumentos";
  if (t.landuse === "industrial") return "Industria y polígonos";
  return null;
}
// Nombre con el que se pregunta: las estaciones de tren se llaman como el
// pueblo («El Higuerón») y las residencias a veces como un santo.
function nombreOsm(t: Record<string, string>, categoria: string) {
  const n = t.name.split(";")[0].trim();
  if (t.railway === "station" && !/^Estaci[oó]n/i.test(n)) return `Estación de tren ${n}`;
  if (categoria === "Residencias de mayores" && !/^(Residencia|Hogar|Hermanitas|Centro)/i.test(n)) return `Residencia ${n}`;
  return n;
}

// Vías que el INE (Callejero del Censo Electoral, julio de 2026) da por
// oficiales en Córdoba y el CDAU todavía no ha dibujado, con el trazado de
// OpenStreetMap (© colaboradores de OpenStreetMap, ODbL). Se cruzaron las
// 3.711 vías del INE con el CDAU y con OpenStreetMap: estas son las únicas
// que el INE tiene, el CDAU no y OpenStreetMap sí, con el mismo nombre.
// En cuanto el CDAU dibuje una vía con el mismo nombre, se usa la suya y
// esta deja de publicarse. id_vial = ID_COMPLEMENTO + código INE de la vía.
const ID_COMPLEMENTO = 990000000;
const COMPLEMENTOS: { ine: string; tipo: string; nombre: string; geom: number[][][] }[] = [
  { ine: "04116", tipo: "CALLE", nombre: "Calle Acera de la Iglesia", geom: [[[-4.65312,37.92475],[-4.65345,37.92535],[-4.65446,37.9268]]] },
  { ine: "02980", tipo: "CALLE", nombre: "Calle Escritora Concha Lagos", geom: [[[-4.77282,37.87412],[-4.77277,37.87452]]] },
  { ine: "04730", tipo: "CALLE", nombre: "Calle de las Maestras y Maestros", geom: [[[-4.77681,37.86238],[-4.77664,37.86225],[-4.7754,37.86163],[-4.77346,37.86224]],[[-4.77723,37.86256],[-4.77835,37.86311],[-4.7785,37.86335]],[[-4.77311,37.8621],[-4.77346,37.86224]],[[-4.7771,37.8625],[-4.77723,37.86256]],[[-4.77693,37.86243],[-4.7771,37.8625]]] },
  { ine: "01369", tipo: "CALLE", nombre: "Calle Camino del Jaco", geom: [[[-4.63439,37.73351],[-4.63428,37.73363],[-4.6343,37.73432],[-4.63427,37.73448]],[[-4.63427,37.73448],[-4.63416,37.73478],[-4.63199,37.73768]]] },
  { ine: "04061", tipo: "GLORIETA", nombre: "Glorieta Huerta del Sordillo", geom: [[[-4.80997,37.88649],[-4.81,37.88645],[-4.81001,37.88636],[-4.80996,37.88628],[-4.80991,37.88625]],[[-4.8098,37.88657],[-4.80987,37.88656],[-4.80997,37.88649]],[[-4.80957,37.88643],[-4.80963,37.88652],[-4.80968,37.88655],[-4.8098,37.88657]],[[-4.80962,37.88628],[-4.80958,37.88633],[-4.80957,37.88643]],[[-4.8097,37.88623],[-4.80962,37.88628]],[[-4.8099,37.88624],[-4.80985,37.88622],[-4.8097,37.88623]],[[-4.80991,37.88625],[-4.8099,37.88624]]] },
  { ine: "04069", tipo: "GLORIETA", nombre: "Glorieta de Juan García Díaz «Juanín»", geom: [[[-4.7653,37.87467],[-4.76522,37.87464],[-4.76507,37.87463]],[[-4.76539,37.87502],[-4.76544,37.87492],[-4.76543,37.87482],[-4.76537,37.87471],[-4.7653,37.87467]],[[-4.76517,37.87514],[-4.76532,37.87508]],[[-4.76507,37.87463],[-4.76489,37.8747]],[[-4.76489,37.8747],[-4.76482,37.87477]],[[-4.76482,37.87477],[-4.7648,37.87492],[-4.76485,37.87503]],[[-4.76485,37.87503],[-4.76496,37.8751],[-4.76517,37.87514]],[[-4.76532,37.87508],[-4.76539,37.87502]]] },
  { ine: "08788", tipo: "PASEO", nombre: "Paseo Valerio Molina", geom: [[[-4.76306,37.88395],[-4.76305,37.88492]]] },
  { ine: "01323", tipo: "PASAJE", nombre: "Pasaje Calerín de Eloy", geom: [[[-4.76376,37.89315],[-4.76286,37.8918]]] },
  { ine: "04864", tipo: "PLAZA", nombre: "Plaza Manuel Rivas Díaz", geom: [[[-4.80982,37.89804],[-4.809,37.89824],[-4.80895,37.89781],[-4.80981,37.89797],[-4.80982,37.89804]]] },
];

// Nombres provisionales del planeamiento o de parcelaciones («Calle B»,
// «Calle 5 Sg-Ctim», «Calle J PP-V.1 (Villarrubia)», «Calle Trébol A»):
// se ven en el mapa pero no se preguntan.
function esNombreProvisional(nombre: string) {
  const s = nombre.replace(/\s*\([^)]*\)\s*$/, "").trim();
  return (/^\S+(\s+(de|del|la|el))?\s+([A-Za-zÑñ]|\d+)$/.test(s) && !/\s[IVX]$/.test(s)) ||
    /\s(\d+|[A-HJ-UW-Z])$/.test(s) ||
    /\((?:[A-Z]|\d+)\)$/.test(nombre.trim()) ||
    /\b(pp|ppo\d*|peri|sg-ctim|pp-v\.?\d*|pp-al-\d+|ed al-\d+|ue-?\d+|sus|pa-\w+)\b/i.test(s);
}
// Para comparar nombres de distintas fuentes: sin tildes, sin el tipo de vía
// y sin artículos («Calle de las Maestras y Maestros» = «Maestras y Maestros»).
const PALABRAS_VACIAS = new Set(["de", "del", "la", "las", "los", "el", "y", "e", "a", "en"]);
const TIPOS_VIA = /^(calle|avenida|avda|plaza|glorieta|rotonda|paseo|ronda|camino|carretera|pasaje|puente|parque|jardin|jardines|travesia|urbanizacion|calleja|callejon|plazuela|bulevar)\s+/;
function claveNombre(t: string) {
  const s = t.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9ñ ]/g, " ").replace(/\s+/g, " ").trim();
  return s.replace(TIPOS_VIA, "").split(" ").filter((w) => !PALABRAS_VACIAS.has(w)).join(" ");
}

// Parques de bomberos (tema 48). Según el documento oficial del S.E.I.S.
// (cordoba.es, «INFORMACION_S.E.I.S.pdf»), «la línea divisoria discurre de
// norte a sur por la CO-3405, Avenida del Brillante, Llanos del Pretorio,
// Plaza de Colón, Alfaros, Capitulares, San Fernando, Puente de Miraflores,
// Avenida de Granada y N-432»: al este, el Parque del Granadal; al oeste,
// el Parque Central. La línea se dibuja con el trazado de esas vías en el
// CDAU (por su id_vial). No se pregunta nada a menos de PARQUE_BANDA_M de
// la línea: ahí la respuesta puede depender de la acera.
const LINEA_PARQUES: { id: number; latMax?: number }[] = [
  { id: 167002253 }, // Carretera CO-3405
  { id: 167000847 }, // Avenida del Brillante
  { id: 167001266 }, // Avenida Llanos del Pretorio
  { id: 167000158 }, // Plaza de Colón
  { id: 167000034 }, // Calle Alfaros
  { id: 167000892 }, // Calle Capitulares
  { id: 167001442 }, // Calle San Fernando
  { id: 167002487 }, // Puente de Miraflores
  { id: 167001159 }, // Avenida de Granada
  { id: 167002400, latMax: 37.8676 }, // Carretera N-432, solo hacia Granada
];
const PARQUE_BANDA_M = 150;
const PARQUE_CENTRAL = 1, PARQUE_GRANADAL = 2;

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

// Pide una URL y devuelve el JSON. Los servidores de la Junta a veces
// cortan la conexión: se reintenta hasta 3 veces antes de dar error.
// Con `cuerpo`, la petición es un POST (Overpass).
async function pedirJson(url: string, opciones: { cabeceras?: Record<string, string>; cuerpo?: string; esperaMs?: number } = {}) {
  let ultimo: unknown = null;
  for (let intento = 0; intento < 3; intento++) {
    if (intento) await new Promise((r) => setTimeout(r, 1500 * intento));
    try {
      const resp = await fetch(url, {
        method: opciones.cuerpo ? "POST" : "GET",
        headers: opciones.cabeceras,
        body: opciones.cuerpo,
        signal: AbortSignal.timeout(opciones.esperaMs || 60000),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      return JSON.parse(await leerCuerpo(resp));
    } catch (e) {
      ultimo = e;
    }
  }
  throw new Error(`No se pudo descargar ${new URL(url).host}: ${(ultimo as Error)?.message || ultimo}`);
}

async function descargarCdau() {
  const features: any[] = [];
  let total = Infinity;
  for (let start = 0; start < total; start += PAGE) {
    const url = `${WFS}?service=WFS&version=2.0.0&request=GetFeature&typeNames=cdau:v_vial` +
      `&outputFormat=application/json&sortBy=id_vial&count=${PAGE}&startIndex=${start}` +
      `&CQL_FILTER=${encodeURIComponent(`ine_mun='${INE_MUNICIPIO}'`)}`;
    let data: any;
    try { data = await pedirJson(url); }
    catch (e) { throw new Error(`CDAU (desde la vía ${start}): ${(e as Error).message}`); }
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
    const data = await pedirJson(url);
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
  const data = await pedirJson(url);
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

// ---------------------------------------------------------------------
// Lugares importantes
// ---------------------------------------------------------------------
// radio: metros alrededor del punto que cuentan como acierto (lugares
// grandes, como un parque o un polígono; 0 = lo normal). fuente: D (DERA) u O (OSM).
type Lugar = { id: number; nombre: string; categoria: string; direccion: string; x: number; y: number; radio: number; fuente: "D" | "O" };

// «HOSPITAL LOS MORALES» → «Hospital Los Morales»; lo demás se deja igual.
function nombreBonito(t: string) {
  const s = t.trim().replace(/\s+/g, " ");
  if (s !== s.toUpperCase()) return s;
  const menores = new Set(["de", "del", "la", "las", "los", "el", "y", "e", "en", "a"]);
  return s.toLowerCase().split(" ").map((w, i) => (i > 0 && menores.has(w)) ? w : w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

async function descargarLugaresDera(): Promise<Lugar[]> {
  const lugares: Lugar[] = [];
  const vistos = new Set<string>();
  for (const [capa, def] of Object.entries(LUGARES_CAPAS)) {
    const url = `${LUGARES_WFS}?service=WFS&version=2.0.0&request=GetFeature&typeNames=DERA_g12_servicios:${capa}` +
      `&outputFormat=application/json&srsName=${encodeURIComponent("urn:ogc:def:crs:EPSG::4326")}` +
      `&CQL_FILTER=${encodeURIComponent(`cod_mun='${INE_MUNICIPIO}'`)}`;
    const data = await pedirJson(url);
    for (const f of data.features || []) {
      const p = f.properties || {};
      const crudo = def.nombre ? def.nombre(p) : String(p.nombre || "").trim();
      if (!crudo || /^sin dato$/i.test(crudo) || NOMBRE_GENERICO.test(crudo.trim())) continue;
      const nombre = nombreBonito(crudo);
      const g = f.geometry;
      const pt = g?.type === "MultiPoint" ? g.coordinates[0] : g?.type === "Point" ? g.coordinates : null;
      if (!pt || !(pt[0] >= BBOX.minLon && pt[0] <= BBOX.maxLon && pt[1] >= BBOX.minLat && pt[1] <= BBOX.maxLat)) continue;
      // Mismo nombre en el mismo sitio (p. ej. dos registros de un edificio): una sola vez.
      const clave = `${nombre.toLowerCase()}|${pt[0].toFixed(4)}|${pt[1].toFixed(4)}`;
      if (vistos.has(clave)) continue;
      vistos.add(clave);
      const dir = String(p.direccion || "").trim();
      lugares.push({
        id: Number(p.id_dera) || lugares.length + 1,
        nombre,
        categoria: def.categoria,
        direccion: /^(sin dato|no disponible)$/i.test(dir) ? "" : nombreBonito(dir),
        x: pt[0], y: pt[1], radio: 0, fuente: "D",
      });
    }
  }
  if (lugares.length < 100) throw new Error(`DERA solo ha devuelto ${lugares.length} lugares`);
  return lugares;
}

// Palabras que no sirven para saber si dos lugares son el mismo.
const PALABRAS_GENERICAS = new Set(["colegio", "educacion", "infantil", "primaria", "instituto", "secundaria", "escuela", "centro",
  "hospital", "universitario", "museo", "biblioteca", "publica", "municipal", "parque", "jardin", "jardines", "iglesia", "parroquia",
  "cordoba", "estacion", "polideportivo", "deportivo", "instalacion", "residencia", "mercado", "comercial", "provincial", "nuestra", "senora"]);
function palabrasDe(n: string) {
  return new Set(claveNombre(n).split(" ").filter((w) => w.length > 3 && !PALABRAS_GENERICAS.has(w)));
}
const comparten = (a: Set<string>, b: Set<string>) => [...a].some((w) => b.has(w));

// Overpass pide que cada aplicación se identifique.
const OSM_CABECERAS = { "User-Agent": "pjfire-callejero/1.0 (callejero de estudio; sincronizacion semanal)" };
async function descargarLugaresOsm(): Promise<Lugar[]> {
  let data: any = null, fallo: unknown = null;
  for (const servidor of OVERPASS) {
    try {
      data = await pedirJson(servidor, {
        cabeceras: { ...OSM_CABECERAS, "Content-Type": "application/x-www-form-urlencoded" },
        cuerpo: `data=${encodeURIComponent(OSM_CONSULTA)}`,
        esperaMs: 90000,
      });
      break;
    } catch (e) {
      fallo = e;
    }
  }
  if (!data) throw fallo;
  const termino = await terminoMunicipal();
  const candidatos: Lugar[] = [];
  for (const e of data.elements || []) {
    const t = e.tags || {};
    if (!t.name) continue;
    const categoria = categoriaOsm(t);
    if (!categoria) continue;
    const nombre = nombreOsm(t, categoria);
    // Nombres de una sola palabra con sentido («Anfiteatro», «Alberca») o
    // sin nombre propio («Cisterna romana») no dicen dónde.
    const palabras = claveNombre(`x ${nombre}`).split(" ").filter((w) => w.length > 2);
    if (palabras.length < 2 || !tieneNombrePropio(nombre) || NOMBRE_GENERICO.test(nombre)) continue;
    let x: number, y: number, radio = 0;
    if (typeof e.lat === "number") { x = e.lon; y = e.lat; }
    else if (e.bounds) {
      const b = e.bounds;
      x = (b.minlon + b.maxlon) / 2; y = (b.minlat + b.maxlat) / 2;
      radio = Math.round(Math.min(800, Math.min((b.maxlon - b.minlon) * KX, (b.maxlat - b.minlat) * KY) / 2));
    } else continue;
    if (termino && !termino.some((pol) => dentroDePoligono([x, y], pol))) continue;
    // ids de OSM en su propio rango para no chocar con los de DERA
    const tipo = e.type === "node" ? 0 : e.type === "way" ? 1 : 2;
    candidatos.push({ id: 8e15 + tipo * 1e14 + e.id, nombre, categoria, direccion: [t["addr:street"], t["addr:housenumber"]].filter(Boolean).join(", "), x, y, radio, fuente: "O" });
  }
  if (candidatos.length < 100) throw new Error(`OpenStreetMap solo ha devuelto ${candidatos.length} lugares`);
  return candidatos;
}
// Lo de OpenStreetMap que no repite algo de DERA de la misma categoría. El
// mismo lugar varias veces (nodo y contorno, trozos de un parque): el mayor.
function sinRepetirDera(osm: Lugar[], dera: Lugar[]) {
  const out: Lugar[] = [];
  for (const c of [...osm].sort((a, b) => b.radio - a.radio)) {
    const pc = palabrasDe(c.nombre);
    if (out.some((o) => o.nombre === c.nombre && metros([o.x, o.y], [c.x, c.y]) < 600)) continue;
    if (dera.some((d) => d.categoria === c.categoria && metros([d.x, d.y], [c.x, c.y]) < 300 && (d.nombre === c.nombre || comparten(palabrasDe(d.nombre), pc)))) continue;
    out.push(c);
  }
  return out;
}

function conPlazo<T>(promesa: Promise<T>, ms: number, mensaje: string): Promise<T> {
  let reloj: ReturnType<typeof setTimeout> | undefined;
  const plazo = new Promise<never>((_, no) => { reloj = setTimeout(() => no(new Error(mensaje)), ms); });
  return Promise.race([promesa, plazo]).finally(() => clearTimeout(reloj));
}

// Un nombre que se repite en sitios distintos («Capilla», «Cementerio»)
// no sirve para preguntar dónde está: fuera.
function sinNombresRepetidos(lugares: Lugar[]) {
  const veces = new Map<string, number>();
  lugares.forEach((l) => veces.set(l.nombre.toLowerCase(), (veces.get(l.nombre.toLowerCase()) || 0) + 1));
  return lugares.filter((l) => veces.get(l.nombre.toLowerCase()) === 1).sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}

// Término municipal de Córdoba (DERA g13), para dejar fuera lo de otros pueblos.
let terminoCache: number[][][][] | null = null;
async function terminoMunicipal() {
  if (terminoCache) return terminoCache;
  const url = `${BARRIOS_WFS}?service=WFS&version=2.0.0&request=GetFeature&typeNames=DERA_g13_limites_administrativos:g13_01_TerminoMunicipal` +
    `&outputFormat=application/json&srsName=${encodeURIComponent("urn:ogc:def:crs:EPSG::4326")}` +
    `&CQL_FILTER=${encodeURIComponent(`cod_mun='${INE_MUNICIPIO}'`)}`;
  try {
    const g = (await pedirJson(url)).features?.[0]?.geometry;
    terminoCache = g?.type === "MultiPolygon" ? g.coordinates : g?.type === "Polygon" ? [g.coordinates] : null;
  } catch (_) {
    terminoCache = null;
  }
  return terminoCache;
}
function dentroDePoligono([x, y]: number[], anillos: number[][][]) {
  let dentro = false;
  for (const r of anillos) {
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      if ((r[i][1] > y) !== (r[j][1] > y) && x < ((r[j][0] - r[i][0]) * (y - r[i][1])) / (r[j][1] - r[i][1]) + r[i][0]) dentro = !dentro;
    }
  }
  return dentro;
}

// ---------------------------------------------------------------------
// Parques de bomberos
// ---------------------------------------------------------------------
// Grafo de calles: un nodo por coordenada (redondeada a ~1 m) y aristas
// con su longitud en metros.
const KX = 111320 * Math.cos((37.88 * Math.PI) / 180), KY = 110540;
const metros = (a: number[], b: number[]) => Math.hypot((a[0] - b[0]) * KX, (a[1] - b[1]) * KY);
type Grafo = { pts: number[][]; ady: [number, number][][]; idx: Map<string, number> };
function crearGrafo(tramos: number[][][]): Grafo {
  const g: Grafo = { pts: [], ady: [], idx: new Map() };
  for (const l of tramos) {
    for (let k = 0; k < l.length - 1; k++) unir(g, nodoDe(g, l[k]), nodoDe(g, l[k + 1]), metros(l[k], l[k + 1]));
  }
  return g;
}
function nodoDe(g: Grafo, p: number[]) {
  const clave = `${Math.round(p[0] * 1e5)}|${Math.round(p[1] * 1e5)}`;
  let i = g.idx.get(clave);
  if (i === undefined) {
    i = g.pts.length;
    g.pts.push(p);
    g.ady.push([]);
    g.idx.set(clave, i);
  }
  return i;
}
function unir(g: Grafo, a: number, b: number, coste: number) {
  if (a === b) return;
  g.ady[a].push([b, coste]);
  g.ady[b].push([a, coste]);
}
// Distancias (y de dónde se llega) desde un nodo a todos los demás.
function dijkstra(g: Grafo, origen: number) {
  const dist = new Float64Array(g.pts.length).fill(Infinity), prev = new Int32Array(g.pts.length).fill(-1);
  dist[origen] = 0;
  const monton: [number, number][] = [[0, origen]];
  const subir = () => {
    let i = monton.length - 1;
    while (i > 0) {
      const padre = (i - 1) >> 1;
      if (monton[padre][0] <= monton[i][0]) break;
      [monton[padre], monton[i]] = [monton[i], monton[padre]];
      i = padre;
    }
  };
  const sacar = () => {
    const top = monton[0], ultimo = monton.pop()!;
    if (monton.length) {
      monton[0] = ultimo;
      let i = 0;
      for (;;) {
        const a = 2 * i + 1, b = a + 1;
        let m = i;
        if (a < monton.length && monton[a][0] < monton[m][0]) m = a;
        if (b < monton.length && monton[b][0] < monton[m][0]) m = b;
        if (m === i) break;
        [monton[m], monton[i]] = [monton[i], monton[m]];
        i = m;
      }
    }
    return top;
  };
  while (monton.length) {
    const [d, u] = sacar();
    if (d > dist[u]) continue;
    for (const [v, c] of g.ady[u]) {
      if (d + c < dist[v]) {
        dist[v] = d + c;
        prev[v] = u;
        monton.push([dist[v], v]);
        subir();
      }
    }
  }
  return { dist, prev };
}
function caminoHasta(g: Grafo, prev: Int32Array, destino: number) {
  const out: number[][] = [];
  for (let u = destino; u >= 0; u = prev[u]) out.push(g.pts[u]);
  return out.reverse();
}
// Si una vía viene en trozos que no se tocan, se unen por sus puntos más
// cercanos (con un coste mayor, para preferir siempre el trazado real).
function unirTrozos(g: Grafo) {
  for (;;) {
    const { dist } = dijkstra(g, 0);
    const fuera: number[] = [], dentro: number[] = [];
    dist.forEach((d, i) => (d === Infinity ? fuera : dentro).push(i));
    if (!fuera.length) return;
    let mejor = [0, 0, Infinity];
    for (const a of dentro) for (const b of fuera) {
      const d = metros(g.pts[a], g.pts[b]);
      if (d < mejor[2]) mejor = [a, b, d];
    }
    unir(g, mejor[0], mejor[1], mejor[2] * 3);
  }
}
const masCercano = (g: Grafo, p: number[]) => {
  let mejor = 0, dm = Infinity;
  g.pts.forEach((q, i) => {
    const d = metros(p, q);
    if (d < dm) { dm = d; mejor = i; }
  });
  return mejor;
};

// Línea divisoria de norte a sur, siguiendo el trazado de cada vía de la
// lista (de su punto de entrada al de salida, sin ir y volver), unida a la
// siguiente por el camino más corto por las calles y prolongada en línea
// recta hasta fuera del término.
function lineaParques(vias: { id_vial: number; geom: number[][][] }[]): number[][] | null {
  const porId = new Map(vias.map((v) => [Number(v.id_vial), v.geom]));
  if (LINEA_PARQUES.some((t) => !porId.get(t.id)?.length)) return null;
  const grafos = LINEA_PARQUES.map((t) => {
    const tramos = porId.get(t.id)!.map((l) => l.filter((p) => t.latMax === undefined || p[1] <= t.latMax)).filter((l) => l.length > 1);
    const g = crearGrafo(tramos);
    if (g.pts.length) unirTrozos(g);
    return g;
  });
  if (grafos.some((g) => !g.pts.length)) return null;
  const red = crearGrafo(vias.flatMap((v) => v.geom));
  const linea: number[][] = [];
  let anterior: number[] | null = null;
  for (let i = 0; i < grafos.length; i++) {
    const g = grafos[i], sig = grafos[i + 1];
    // Salida: el punto de esta vía más cercano a la siguiente.
    let salida = -1;
    if (sig) {
      let dm = Infinity;
      g.pts.forEach((p, k) => {
        const d = metros(p, sig.pts[masCercano(sig, p)]);
        if (d < dm) { dm = d; salida = k; }
      });
    }
    // Entrada: el punto más cercano a la anterior; en la primera vía, el
    // extremo más alejado de la salida.
    let entrada: number;
    if (anterior) entrada = masCercano(g, anterior);
    else {
      const { dist } = dijkstra(g, salida);
      entrada = dist.reduce((m, d, k) => (d > dist[m] ? k : m), 0);
    }
    // Y en la última, la salida es el extremo más alejado de la entrada.
    const desde = dijkstra(g, entrada);
    if (salida < 0) salida = desde.dist.reduce((m, d, k) => (d > desde.dist[m] ? k : m), 0);
    const tramo = caminoHasta(g, desde.prev, salida);
    // Enlace con la vía anterior por las calles (si es razonable; si no, recto).
    if (anterior && metros(anterior, tramo[0]) > 25) {
      const a = masCercano(red, anterior), b = masCercano(red, tramo[0]);
      const r = dijkstra(red, a);
      if (r.dist[b] < 2.5 * metros(anterior, tramo[0])) linea.push(...caminoHasta(red, r.prev, b));
    }
    linea.push(...tramo);
    anterior = tramo[tramo.length - 1];
  }
  // Con 10 m de precisión basta (la banda es de 150 m) y el cálculo es
  // unas 20 veces más rápido.
  const simple = simplificar(linea, 10);
  const n = simple[0], s = simple[simple.length - 1];
  return [[n[0], 38.6], ...simple, [s[0], 37.2]];
}

// Cuadrícula (celdas de ~200 m) con los tramos de la línea que pasan a
// menos de la banda de cada celda: para saber si un punto está cerca de la
// línea solo hay que mirar los tramos de su celda.
type Divisoria = { linea: number[][]; celdas: Map<string, number[]> };
const CELDA = 0.002;
const celdaDe = (x: number, y: number) => `${Math.floor(x / CELDA)}|${Math.floor(y / CELDA)}`;
function prepararDivisoria(linea: number[][]): Divisoria {
  const celdas = new Map<string, number[]>();
  const mx = PARQUE_BANDA_M / (111320 * Math.cos((37.88 * Math.PI) / 180)), my = PARQUE_BANDA_M / 110540;
  for (let k = 0; k < linea.length - 1; k++) {
    const [x0, y0] = linea[k], [x1, y1] = linea[k + 1];
    const cx0 = Math.floor((Math.min(x0, x1) - mx) / CELDA), cx1 = Math.floor((Math.max(x0, x1) + mx) / CELDA);
    const cy0 = Math.floor((Math.min(y0, y1) - my) / CELDA), cy1 = Math.floor((Math.max(y0, y1) + my) / CELDA);
    // Los tramos de prolongación (fuera del término) son muy largos: no hace falta indexarlos.
    if ((cx1 - cx0) * (cy1 - cy0) > 4000) continue;
    for (let cx = cx0; cx <= cx1; cx++) for (let cy = cy0; cy <= cy1; cy++) {
      const c = `${cx}|${cy}`;
      if (!celdas.has(c)) celdas.set(c, []);
      celdas.get(c)!.push(k);
    }
  }
  return { linea, celdas };
}

function distanciaALinea([x, y]: number[], linea: number[][], tramos?: number[]) {
  const kx = 111320 * Math.cos((37.88 * Math.PI) / 180), ky = 110540;
  let min = Infinity;
  for (const k of tramos || linea.map((_, i) => i).slice(0, -1)) {
    const ax = (linea[k][0] - x) * kx, ay = (linea[k][1] - y) * ky;
    const bx = (linea[k + 1][0] - x) * kx, by = (linea[k + 1][1] - y) * ky;
    const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
    const t = L ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / L)) : 0;
    min = Math.min(min, Math.hypot(ax + t * dx, ay + t * dy));
  }
  return min;
}

// Al este de la línea: dentro del polígono línea + borde este lejano.
function alEste([x, y]: number[], linea: number[][]) {
  const pol = [...linea, [-3.5, linea[linea.length - 1][1]], [-3.5, linea[0][1]]];
  let dentro = false;
  for (let i = 0, j = pol.length - 1; i < pol.length; j = i++) {
    const [xi, yi] = pol[i], [xj, yj] = pol[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) dentro = !dentro;
  }
  return dentro;
}

// 1 Central · 2 Granadal · 0 si algún punto cae en la banda de la línea o
// hay tramos a ambos lados. Un tramo continuo que nunca se acerca a la
// línea no puede cruzarla, así que basta con mirar el lado de su primer
// punto.
function parqueDe(tramos: number[][][], d: Divisoria) {
  let lado = 0;
  for (const pts of tramos) {
    for (const p of pts) {
      const cerca = d.celdas.get(celdaDe(p[0], p[1]));
      if (cerca && distanciaALinea(p, d.linea, cerca) < PARQUE_BANDA_M) return 0;
    }
    const l = alEste(pts[0], d.linea) ? PARQUE_GRANADAL : PARQUE_CENTRAL;
    if (lado && l !== lado) return 0;
    lado = l;
  }
  return lado;
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
  // Vías oficiales que el CDAU aún no tiene (si ya tiene una con ese nombre, manda la suya).
  const nombresCdau = new Set(vias.map((v) => claveNombre(v.nombre)));
  vias.push(...COMPLEMENTOS.filter((c) => !nombresCdau.has(claveNombre(c.nombre)))
    .map((c) => ({ id_vial: ID_COMPLEMENTO + Number(c.ine), tipo: c.tipo, nombre: c.nombre, jugable: true, geom: c.geom })));
  // [id_vial, nombre, tipo, jugable (1/0), líneas codificadas, barrios]
  const filas = vias.map((v) => {
    const jugable = v.jugable && !esNombreProvisional(v.nombre);
    const fila: unknown[] = [Number(v.id_vial), v.nombre, v.tipo, jugable ? 1 : 0, codificar(v.geom)];
    if (barrios) fila.push(barriosDeVia(v.geom, barrios));
    return fila;
  }).filter((f) => (f[4] as number[][]).length);
  const cargarPrevio = async () => {
    if (previo || !actual?.archivo) return;
    const { data: blob } = await sb.storage.from(BUCKET).download(actual.archivo);
    if (blob) previo = JSON.parse(await blob.text());
  };
  if (!barrios) {
    await cargarPrevio();
    // Se conserva la asignación del archivo anterior para las vías que ya estaban.
    const asignado = new Map<number, number[]>((previo?.vias || []).map((f: any[]) => [f[0], f[5] || []]));
    filas.forEach((f) => f.push(asignado.get(f[0] as number) || []));
  }
  // Parque de bomberos de cada vía (7.º campo).
  const linea = lineaParques(vias as any);
  const divisoria = linea ? prepararDivisoria(linea) : null;
  if (divisoria) {
    const porId = new Map<number, number[][][]>(vias.map((v) => [Number(v.id_vial), v.geom]));
    filas.forEach((f) => f.push(parqueDe(porId.get(f[0] as number)!.map((l) => muestrear([l])), divisoria)));
  } else {
    await cargarPrevio();
    const asignado = new Map<number, number>((previo?.vias || []).map((f: any[]) => [f[0], f[6] || 0]));
    filas.forEach((f) => f.push(asignado.get(f[0] as number) || 0));
  }
  // Lugares: [id, nombre, categoría, dirección, x, y (×100 000), barrios, parque, radio, fuente]
  // Si DERA no responde, todos los del archivo anterior; si solo falla
  // OpenStreetMap, los de OpenStreetMap del archivo anterior.
  let lugares: unknown[][] | null = null;
  // Como mucho 100 s para OpenStreetMap: si tarda más, se sigue con los de antes.
  const pidiendoOsm = conPlazo(descargarLugaresOsm(), 100000, "OpenStreetMap tarda demasiado").then((l) => l, (e) => e as Error);
  try {
    const dera = await descargarLugaresDera();
    let osm: Lugar[] = [];
    try {
      const r = await pidiendoOsm;
      if (r instanceof Error) throw r;
      osm = sinRepetirDera(r, dera);
    } catch (e) {
      await cargarPrevio();
      osm = (previo?.lugares || []).filter((f: any[]) => f[9] === "O").map((f: any[]) => ({
        id: f[0], nombre: f[1], categoria: f[2], direccion: f[3], x: f[4] / 1e5, y: f[5] / 1e5, radio: f[8] || 0, fuente: "O" as const,
      }));
      console.warn("Lugares de OpenStreetMap del archivo anterior:", (e as Error).message);
    }
    lugares = sinNombresRepetidos([...dera, ...osm]).map((l) => [
      l.id, l.nombre, l.categoria, l.direccion, Math.round(l.x * 1e5), Math.round(l.y * 1e5),
      barrios ? barrios.map((b, i) => (dentroDeBarrio([l.x, l.y], b) ? i : -1)).filter((i) => i >= 0) : [],
      divisoria ? parqueDe([[[l.x, l.y]]], divisoria) : 0,
      l.radio, l.fuente,
    ]);
  } catch (e) {
    await cargarPrevio();
    lugares = previo?.lugares || null;
    console.warn("Lugares del archivo anterior:", (e as Error).message);
  }
  const parques = linea ? { linea: codificar([linea], 5)[0] } : previo?.parques || null;
  const zonas = barrios
    ? { barrios: barrios.map((b) => [b.nombre, b.distrito, codificar(b.anillos, 5)]) }
    : previo?.zonas || null;
  const rio = codificar(await descargarRio(), 5);
  // El nombre del archivo depende de su contenido: nunca se sobrescribe
  // uno ya publicado (los móviles lo guardan para siempre).
  const version = await sha(JSON.stringify([filas, rio, zonas, lugares, parques]), 12);
  if (!forzar && actual?.version === version) return { publicado: false, version };

  const archivo = `${CARPETA}/${version}.json`;
  const doc = JSON.stringify({
    formato: 3,
    version,
    generado: new Date().toISOString(),
    municipio: INE_MUNICIPIO,
    atribucion: ATRIBUCION,
    // [id_vial, nombre, tipo, jugable (1/0), líneas codificadas, índices de sus barrios,
    //  parque (1 Central, 2 Granadal, 0 junto a la línea)]
    vias: filas,
    // Líneas del Guadalquivir, codificadas igual que las vías.
    rio,
    // barrios: [nombre, distrito, anillos del contorno codificados]
    zonas,
    // [id, nombre, categoría, dirección, x, y (×100 000), índices de barrios, parque,
    //  radio en metros que cuenta como acierto (0 = el normal), fuente (D DERA · O OpenStreetMap)]
    lugares,
    // linea: la divisoria entre parques, codificada como una vía
    parques,
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
