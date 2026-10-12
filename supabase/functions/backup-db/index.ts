// =====================================================================
// backup-db
// =====================================================================
// Copia de seguridad de la base de datos: vuelca las tablas importantes
// a un JSON comprimido (gzip) en el almacén privado "backups" de Supabase
// Storage, con el nombre AAAA-MM-DD.json.gz, y borra las copias de más de
// KEEP_DAYS días.
//
// Invocación:
//   - Cada noche con pg_cron (cabecera "x-backup-secret", valor guardado
//     en app_secrets 'backup_cron_secret').
//   - Desde el panel de admin («Hacer copia ahora»), con la sesión de un
//     usuario administrador.
//
// Nunca se copian los secretos (app_secrets) ni datos que no hacen falta
// para recuperar la app (intentos de acceso, códigos de verificación,
// suscripciones a notificaciones, errores) ni lo que se vuelve a sacar de
// su fuente (callejero_vias y su registro, del callejero municipal).
//
// Las preguntas del Específico (especifico_preguntas, con sus imágenes:
// cientos de MB) no caben en la copia diaria: van aparte, un archivo por
// test en especifico/<test_id>.json.gz. Cada vez se rehacen como mucho
// ESP_POR_VEZ (primero los que falten y luego los más antiguos) y hasta unos
// ESP_MAX_BYTES (siempre al menos uno), así que en unos días están todos y
// después se van renovando; se borran los de tests que ya no existen. Cada
// test se comprime pregunta a pregunta, sin tenerlo entero en memoria.
// Siempre se guarda solo la última versión de cada test.
// =====================================================================

import { createClient } from "jsr:@supabase/supabase-js@2.117.1";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const BUCKET = "backups";
const KEEP_DAYS = 14;
const TABLES = [
  "topics", "nodos_temario", "questions",
  "profiles", "user_devices", "user_app_state", "user_activity_sessions",
  "test_sessions", "session_answers", "dismissed_fails", "question_user_data",
  "nq_sets", "nq_cards", "nq_user_progress",
  "boe_normas_seguimiento", "boe_bloques_seguimiento", "boe_cambios",
  "app_settings", "device_sync_state", "tutorias", "questions_deleted",
  "calendario_tareas", "historial_pruebas", "examen_ajustes",
  "especifico_tests", "especifico_respuestas", "especifico_marcadas", "especifico_descartadas", "especifico_notas",
  "callejero_publicado", "callejero_cambios", "callejero_fallos_reinicio", "callejero_intentos", "callejero_mensajes",
  "callejero_notas", "callejero_tareas", "callejero_tareas_hechas", "callejero_temario_preguntas", "callejero_vueltas",
  "plan_ajustes", "plan_eventos", "plan_preguntas", "plan_resultados", "plan_tareas", "plan_temas", "plan_tests",
];
const ESP_DIR = "especifico";
const ESP_POR_VEZ = 8;
const ESP_MAX_BYTES = 12_000_000;

// Un test comprimido: se piden sus preguntas de 25 en 25 (cada una puede
// llevar imágenes) y se van metiendo en el gzip según llegan.
async function testComprimido(sb: ReturnType<typeof createClient>, testId: string) {
  const gz = new CompressionStream("gzip");
  const w = gz.writable.getWriter();
  const enc = new TextEncoder();
  const salida = new Response(gz.readable).arrayBuffer();
  let bytes = 0;
  await w.write(enc.encode(`{"created_at":${JSON.stringify(new Date().toISOString())},"test_id":${JSON.stringify(testId)},"rows":[`));
  const PAGE = 25;
  let primera = true;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await sb.from("especifico_preguntas").select("*").eq("test_id", testId).order("orden").range(from, from + PAGE - 1);
    if (error) { await w.abort(); throw new Error(`especifico_preguntas ${testId}: ${error.message}`); }
    for (const r of data || []) {
      const t = JSON.stringify(r);
      bytes += t.length;
      await w.write(enc.encode((primera ? "" : ",") + t));
      primera = false;
    }
    if (!data || data.length < PAGE) break;
  }
  await w.write(enc.encode("]}"));
  await w.close();
  return { body: new Uint8Array(await salida), bytes };
}
async function copiaEspecifico(sb: ReturnType<typeof createClient>, tests: { id: string }[]) {
  const { data: files } = await sb.storage.from(BUCKET).list(ESP_DIR, { limit: 1000 });
  const hay = new Map((files || []).map((f) => [f.name, f.updated_at || f.created_at || ""]));
  const vivos = new Set(tests.map((t) => t.id + ".json.gz"));
  // Primero los que faltan; luego los de copia más antigua.
  const orden = tests.map((t) => ({ id: t.id, fecha: hay.get(t.id + ".json.gz") ?? "" })).sort((a, b) => a.fecha.localeCompare(b.fecha));
  const hechos: string[] = [];
  let total = 0;
  for (const t of orden.slice(0, ESP_POR_VEZ)) {
    if (hechos.length && total >= ESP_MAX_BYTES) break;
    const { body, bytes } = await testComprimido(sb, t.id);
    const { error } = await sb.storage.from(BUCKET).upload(`${ESP_DIR}/${t.id}.json.gz`, body, { contentType: "application/gzip", upsert: true });
    if (error) throw new Error("upload especifico: " + error.message);
    hechos.push(t.id);
    total += bytes;
  }
  const sobran = [...hay.keys()].filter((n) => n.endsWith(".json.gz") && !vivos.has(n)).map((n) => `${ESP_DIR}/${n}`);
  if (sobran.length) await sb.storage.from(BUCKET).remove(sobran);
  return { renovados: hechos.length, bytes: total, total: tests.length, sin_copia_antes: orden.filter((x) => !x.fecha).length, borrados: sobran.length };
}

async function dumpTable(sb: ReturnType<typeof createClient>, table: string) {
  const PAGE = 1000;
  let rows: unknown[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await sb.from(table).select("*").range(from, from + PAGE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows = rows.concat(data || []);
    if (!data || data.length < PAGE) break;
  }
  return rows;
}

async function gzip(text: string): Promise<Uint8Array> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // ---- Autorización: cron (secreto) o un administrador ----
  const { data: sec } = await sb.from("app_secrets").select("value").eq("name", "backup_cron_secret").maybeSingle();
  const isCron = !!sec?.value && req.headers.get("x-backup-secret") === sec.value;
  if (!isCron) {
    const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
    const { data: u } = await sb.auth.getUser(token);
    if (!u?.user) return json({ error: "unauthorized" }, 401);
    const { data: prof } = await sb.from("profiles").select("is_admin").eq("id", u.user.id).maybeSingle();
    if (!prof?.is_admin) return json({ error: "forbidden" }, 403);
  }

  try {
    const started = new Date();
    const day = started.toISOString().slice(0, 10);
    const path = `${day}.json.gz`;
    const counts: Record<string, number> = {};
    let testsEsp: { id: string }[] = [], bytes = 0, rawBytes = 0;
    // En su bloque: al terminar la copia diaria se suelta de la memoria antes de seguir.
    {
      const tables: Record<string, unknown[]> = {};
      for (const t of TABLES) {
        try {
          tables[t] = await dumpTable(sb, t);
          counts[t] = tables[t].length;
        } catch (e) {
          counts[t] = -1; // tabla inexistente o error puntual: no frena el resto
          console.error((e as Error).message);
        }
      }
      testsEsp = (tables["especifico_tests"] || []) as { id: string }[];
      const payload = JSON.stringify({ created_at: started.toISOString(), version: 1, counts, tables });
      const body = await gzip(payload);
      bytes = body.length; rawBytes = payload.length;
      const { error: upErr } = await sb.storage.from(BUCKET).upload(path, body, { contentType: "application/gzip", upsert: true });
      if (upErr) throw new Error("upload: " + upErr.message);
    }

    // Preguntas del Específico, por partes (ver arriba). Si falla, la copia diaria ya está hecha.
    let especifico: unknown = null;
    try {
      especifico = await copiaEspecifico(sb, testsEsp);
    } catch (e) {
      especifico = { error: (e as Error).message };
      console.error((e as Error).message);
    }

    // Limpieza de copias antiguas
    const { data: files } = await sb.storage.from(BUCKET).list("", { limit: 1000 });
    const cutoff = new Date(started.getTime() - KEEP_DAYS * 86400_000).toISOString().slice(0, 10);
    const old = (files || []).map((f) => f.name).filter((n) => /^\d{4}-\d{2}-\d{2}\.json\.gz$/.test(n) && n.slice(0, 10) < cutoff);
    if (old.length) await sb.storage.from(BUCKET).remove(old);

    return json({ ok: true, path, bytes, raw_bytes: rawBytes, counts, removed: old.length, especifico });
  } catch (e) {
    return json({ ok: false, error: (e as Error).message }, 500);
  }
});
