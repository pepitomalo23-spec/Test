// =====================================================================
// boe-sync
// =====================================================================
// Comprueba, para cada norma BOE en seguimiento (tabla
// boe_normas_seguimiento), si ha habido cambios desde la última
// comprobación y, si los hay, detecta EXACTAMENTE qué artículos se han
// modificado comparando las versiones que el propio BOE mantiene de
// cada bloque de texto. La IA (si hay clave configurada) solo se usa
// para traducir ese diff real a lenguaje sencillo: nunca decide si algo
// ha cambiado ni inventa el contenido del cambio.
//
// Invocación:
//   - Programada por pg_cron (ver migración) una vez al día.
//   - Manual desde el panel de admin, vía RPC admin_trigger_boe_sync().
// Autenticación: cabecera "x-boe-sync-secret" que debe coincidir con el
// valor guardado en la tabla app_secrets (nunca viaja por el repo).
// =====================================================================

import { createClient } from "jsr:@supabase/supabase-js@2";

const BOE_BASE = "https://www.boe.es/datosabiertos/api/legislacion-consolidada";

function supabaseAdmin() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

async function boeGet(path: string) {
  const resp = await fetch(`${BOE_BASE}${path}`, {
    headers: { "Accept": "application/json" },
  });
  if (!resp.ok) {
    throw new Error(`BOE ${path} -> HTTP ${resp.status}`);
  }
  return await resp.json();
}

// El texto de un bloque solo viene en XML. Lo pedimos y extraemos las
// dos últimas <version> tal cual (HTML) para guardar el "antes" / "ahora"
// exactamente como los publica el BOE, sin reinterpretarlos.
async function boeGetBloqueXml(id: string, bloqueId: string) {
  const resp = await fetch(`${BOE_BASE}/id/${id}/texto/bloque/${bloqueId}`, {
    headers: { "Accept": "application/xml" },
  });
  if (!resp.ok) throw new Error(`BOE bloque ${bloqueId} -> HTTP ${resp.status}`);
  return await resp.text();
}

// Extrae los nodos <version ...>...</version> de un bloque, en orden.
function parseVersions(xml: string): Array<{ fecha_publicacion: string; fecha_vigencia: string | null; id_norma: string; html: string }> {
  const versions: Array<{ fecha_publicacion: string; fecha_vigencia: string | null; id_norma: string; html: string }> = [];
  const re = /<version\s+([^>]*)>([\s\S]*?)<\/version>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const attrs = m[1];
    const html = m[2].trim();
    const get = (name: string) => {
      const am = new RegExp(`${name}="([^"]*)"`).exec(attrs);
      return am ? am[1] : null;
    };
    versions.push({
      fecha_publicacion: get("fecha_publicacion") || "",
      fecha_vigencia: get("fecha_vigencia"),
      id_norma: get("id_norma") || "",
      html,
    });
  }
  return versions;
}

function parseDate(d: string | null): string | null {
  if (!d || d.length !== 8) return null;
  return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
}

function htmlToPlain(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

// Extrae el número de artículo de un título de bloque tipo "Artículo 39"
// o "Artículo 39 bis" para poder emparejarlo con nodos_temario.numero.
function extraerNumeroArticulo(titulo: string): string | null {
  const m = /^Art[ií]culo\s+([0-9]+\s*(?:bis|ter|quater|quinquies)?)/i.exec(titulo.trim());
  return m ? m[1].replace(/\s+/g, " ").trim() : null;
}

async function generarResumenIA(apiKey: string, tituloNorma: string, tituloBloque: string, antes: string, ahora: string, notaOficial: string | null) {
  const prompt =
    "Eres un profesor que prepara opositores para un examen tipo test de legislación. " +
    "Te doy el ANTES y el AHORA de un artículo que acaba de cambiar en el BOE, y opcionalmente una nota oficial sobre la modificación. " +
    "NUNCA inventes ni añadas cambios que no estén en el texto proporcionado; limítate a explicar la diferencia real. " +
    "Devuelve EXCLUSIVAMENTE un objeto JSON (sin markdown, sin ```, sin texto antes ni después) con esta forma exacta:\n" +
    '{ "simple": "qué ha cambiado, en lenguaje muy sencillo y cercano", ' +
    '"tecnica": "el mismo cambio explicado con precisión jurídica", ' +
    '"afecta": "a qué procedimientos o situaciones afecta este cambio, en una frase" }\n\n' +
    "Responde siempre en español, texto plano sin markdown.\n\n" +
    `NORMA: ${tituloNorma}\nARTÍCULO: ${tituloBloque}\n\n` +
    `NOTA OFICIAL DEL BOE (si existe): ${notaOficial || "(ninguna)"}\n\n` +
    `ANTES:\n${htmlToPlain(antes)}\n\nAHORA:\n${htmlToPlain(ahora)}`;

  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    },
  );
  if (!resp.ok) return null;
  const data = await resp.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
  const clean = text.trim().replace(/^```json\s*/i, "").replace(/^```\s*/, "").replace(/```\s*$/, "").trim();
  if (!clean) return null;
  try {
    return JSON.parse(clean);
  } catch {
    return null;
  }
}

async function procesarNorma(sb: ReturnType<typeof createClient>, norma: any, geminiKey: string | null) {
  const log: string[] = [];
  try {
    const metadatos = await boeGet(`/id/${norma.boe_id}/metadatos`);
    const metaObj = Array.isArray(metadatos?.data) ? metadatos.data[0] : metadatos?.data;
    const fechaActualizacion: string = metaObj?.fecha_actualizacion;

    if (fechaActualizacion && fechaActualizacion === norma.fecha_actualizacion_boe) {
      log.push(`${norma.boe_id}: sin cambios (fecha_actualizacion igual).`);
      await sb.from("boe_normas_seguimiento").update({
        ultima_comprobacion: new Date().toISOString(),
        ultimo_error: null,
      }).eq("topic_id", norma.topic_id);
      return log;
    }

    // Índice de bloques con su fecha de actualización individual
    const indice = await boeGet(`/id/${norma.boe_id}/texto/indice`);
    const indiceObj = Array.isArray(indice?.data) ? indice.data[0] : indice?.data;
    const bloques: any[] = indiceObj?.bloque
      ? (Array.isArray(indiceObj.bloque) ? indiceObj.bloque : [indiceObj.bloque])
      : [];

    // Análisis (para intentar rescatar la nota oficial "SE MODIFICA...")
    let posteriores: any[] = [];
    try {
      const analisis = await boeGet(`/id/${norma.boe_id}/analisis`);
      const analisisObj = Array.isArray(analisis?.data) ? analisis.data[0] : analisis?.data;
      const postWrap = analisisObj?.referencias?.posteriores;
      const postWrapArr = postWrap ? (Array.isArray(postWrap) ? postWrap : [postWrap]) : [];
      posteriores = postWrapArr.flatMap((w: any) => {
        const p = w?.posterior;
        return p ? (Array.isArray(p) ? p : [p]) : [];
      });
    } catch {
      // El análisis es opcional; si falla, seguimos sin nota oficial.
    }

    // Nodos "articulo" de este topic, para emparejar por número
    const { data: nodos } = await sb
      .from("nodos_temario")
      .select("id, numero")
      .eq("topic_id", norma.topic_id)
      .eq("tipo", "articulo");

    // Últimos bloques vistos, para saber qué ha cambiado de verdad
    const { data: vistos } = await sb
      .from("boe_bloques_seguimiento")
      .select("bloque_id, fecha_actualizacion_bloque")
      .eq("topic_id", norma.topic_id);
    const vistosMap = new Map((vistos || []).map((v: any) => [v.bloque_id, v.fecha_actualizacion_bloque]));

    for (const b of bloques) {
      const bloqueId: string = b.id;
      const tituloBloque: string = b.titulo || "";
      const fechaBloque: string = b.fecha_actualizacion;
      const numero = extraerNumeroArticulo(tituloBloque);

      // Solo nos interesan artículos que están en el temario de la app
      const nodo = numero ? (nodos || []).find((n: any) => n.numero === numero) : null;
      if (!nodo) continue;

      const anterior = vistosMap.get(bloqueId);
      if (anterior === fechaBloque) continue; // este artículo concreto no ha cambiado

      // Ha cambiado (o es la primera vez que lo vemos): pedimos el bloque completo
      const xml = await boeGetBloqueXml(norma.boe_id, bloqueId);
      const versiones = parseVersions(xml);
      if (versiones.length === 0) continue;

      const actual = versiones[versiones.length - 1];
      const previa = versiones.length >= 2 ? versiones[versiones.length - 2] : null;

      // Guardamos/actualizamos el estado visto de este bloque siempre,
      // aunque sea la primera vez (para no generar una alerta "falsa"
      // la primera vez que se activa el seguimiento).
      await sb.from("boe_bloques_seguimiento").upsert({
        topic_id: norma.topic_id,
        bloque_id: bloqueId,
        nodo_id: nodo.id,
        numero_articulo: numero,
        titulo_bloque: tituloBloque,
        fecha_actualizacion_bloque: fechaBloque,
        updated_at: new Date().toISOString(),
      });

      // Si no había versión anterior conocida en nuestro seguimiento,
      // es la primera vez que vemos este artículo: no generamos alerta
      // de "cambio", solo dejamos constancia del estado inicial.
      if (anterior === undefined) {
        log.push(`${norma.boe_id} ${tituloBloque}: primer registro, sin alerta.`);
        continue;
      }

      if (!previa) {
        log.push(`${norma.boe_id} ${tituloBloque}: cambió pero no hay versión anterior que comparar.`);
        continue;
      }

      const notaMatch = posteriores.find((p) => p.id_norma === actual.id_norma);
      const notaOficial = notaMatch ? `${notaMatch.relacion?.texto || ""}: ${notaMatch.texto || ""}`.trim() : null;

      let resumenIA = null;
      if (geminiKey) {
        try {
          resumenIA = await generarResumenIA(geminiKey, norma.titulo || norma.boe_id, tituloBloque, previa.html, actual.html, notaOficial);
        } catch {
          resumenIA = null;
        }
      }

      await sb.from("boe_cambios").insert({
        topic_id: norma.topic_id,
        nodo_id: nodo.id,
        bloque_id: bloqueId,
        numero_articulo: numero,
        titulo_bloque: tituloBloque,
        texto_antes_html: previa.html,
        texto_ahora_html: actual.html,
        norma_modificadora_id: actual.id_norma,
        fecha_publicacion: parseDate(actual.fecha_publicacion),
        fecha_vigencia: parseDate(actual.fecha_vigencia),
        resumen_oficial: notaOficial,
        resumen_ia: resumenIA,
        fuente_url: norma.url_html,
      });

      log.push(`${norma.boe_id} ${tituloBloque}: CAMBIO detectado y registrado.`);
    }

    await sb.from("boe_normas_seguimiento").update({
      fecha_actualizacion_boe: fechaActualizacion,
      ultima_comprobacion: new Date().toISOString(),
      ultimo_error: null,
    }).eq("topic_id", norma.topic_id);
  } catch (err) {
    log.push(`${norma.boe_id}: ERROR ${(err as Error).message}`);
    await sb.from("boe_normas_seguimiento").update({
      ultima_comprobacion: new Date().toISOString(),
      ultimo_error: (err as Error).message,
    }).eq("topic_id", norma.topic_id);
  }
  return log;
}

Deno.serve(async (req: Request) => {
  try {
    const sb = supabaseAdmin();

    const { data: secretRow } = await sb.from("app_secrets").select("value").eq("name", "boe_sync_secret").maybeSingle();
    const expected = secretRow?.value;
    const given = req.headers.get("x-boe-sync-secret");
    if (!expected || given !== expected) {
      return new Response(JSON.stringify({ error: "No autorizado" }), { status: 401, headers: { "Content-Type": "application/json" } });
    }

    const { data: geminiRow } = await sb.from("app_secrets").select("value").eq("name", "gemini_api_key").maybeSingle();
    const geminiKey = geminiRow?.value || null;

    const { data: normas, error } = await sb.from("boe_normas_seguimiento").select("*").eq("activo", true);
    if (error) throw error;

    const resultado: Record<string, string[]> = {};
    for (const norma of normas || []) {
      resultado[norma.topic_id] = await procesarNorma(sb, norma, geminiKey);
    }

    return new Response(JSON.stringify({ ok: true, resultado }, null, 2), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: (err as Error).message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
