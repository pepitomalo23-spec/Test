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
// suscripciones a notificaciones, errores).
// =====================================================================

import { createClient } from "jsr:@supabase/supabase-js@2";

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
];

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
    const tables: Record<string, unknown[]> = {};
    const counts: Record<string, number> = {};
    for (const t of TABLES) {
      try {
        tables[t] = await dumpTable(sb, t);
        counts[t] = tables[t].length;
      } catch (e) {
        counts[t] = -1; // tabla inexistente o error puntual: no frena el resto
        console.error((e as Error).message);
      }
    }
    const payload = JSON.stringify({ created_at: started.toISOString(), version: 1, counts, tables });
    const body = await gzip(payload);
    const day = started.toISOString().slice(0, 10);
    const path = `${day}.json.gz`;
    const { error: upErr } = await sb.storage.from(BUCKET).upload(path, body, { contentType: "application/gzip", upsert: true });
    if (upErr) throw new Error("upload: " + upErr.message);

    // Limpieza de copias antiguas
    const { data: files } = await sb.storage.from(BUCKET).list("", { limit: 1000 });
    const cutoff = new Date(started.getTime() - KEEP_DAYS * 86400_000).toISOString().slice(0, 10);
    const old = (files || []).map((f) => f.name).filter((n) => /^\d{4}-\d{2}-\d{2}\.json\.gz$/.test(n) && n.slice(0, 10) < cutoff);
    if (old.length) await sb.storage.from(BUCKET).remove(old);

    return json({ ok: true, path, bytes: body.length, raw_bytes: payload.length, counts, removed: old.length });
  } catch (e) {
    return json({ ok: false, error: (e as Error).message }, 500);
  }
});
