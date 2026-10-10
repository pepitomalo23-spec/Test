// =====================================================================
// imagen-externa
// =====================================================================
// Descarga imágenes de otras webs y las devuelve incrustadas (data:image/…;
// base64). La usa la importación del Específico (js/importar-especifico.js):
// algunas preguntas de tutorbomberos.es enlazan imágenes de otros sitios
// (p. ej. pinimg.com) que el navegador no puede leer desde allí (CORS), y la
// CSP de pj.fire no deja mostrar imágenes externas, así que sin incrustarlas
// los alumnos no las verían.
//
// Seguridad:
//   - Requiere sesión iniciada (verify_jwt: true) y que quien llama sea
//     administrador (profiles.is_admin, leído con su propio token).
//   - Solo https, sin IPs ni nombres internos, como mucho 6 MB por imagen,
//     y solo se devuelve si el contenido es de verdad PNG, JPEG, GIF o WebP.
//
// Body: { "urls": ["https://…", …] }  (como mucho 20)
// Respuesta: { "imagenes": { "https://…": "data:image/png;base64,…" | null } }
// =====================================================================

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const MAX_BYTES = 6 * 1024 * 1024;
const MAX_URLS = 20;

async function esAdmin(auth: string): Promise<boolean> {
  const url = Deno.env.get("SUPABASE_URL")!, anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const h = { Authorization: auth, apikey: anon };
  const u = await fetch(url + "/auth/v1/user", { headers: h });
  if (!u.ok) return false;
  const { id } = await u.json();
  if (!id) return false;
  const p = await fetch(url + "/rest/v1/profiles?select=is_admin&id=eq." + encodeURIComponent(id), { headers: h });
  if (!p.ok) return false;
  const rows = await p.json();
  return Array.isArray(rows) && rows.length === 1 && rows[0].is_admin === true;
}

function urlPermitida(s: string): URL | null {
  let u: URL;
  try { u = new URL(s); } catch { return null; }
  if (u.protocol !== "https:" || u.username || u.password) return null;
  const h = u.hostname.toLowerCase();
  if (!h.includes(".") || h.endsWith(".local") || h.endsWith(".internal") || h === "localhost") return null;
  if (/^[\d.]+$/.test(h) || h.includes(":") || h.startsWith("[")) return null;   // IPs
  return u;
}

// Tipo real por los primeros bytes (no nos fiamos de la cabecera).
function tipoImagen(b: Uint8Array): string | null {
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return "image/gif";
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
      b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "image/webp";
  return null;
}

function base64(b: Uint8Array): string {
  let s = "";
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
}

async function descargar(s: string): Promise<string | null> {
  const u = urlPermitida(s);
  if (!u) return null;
  try {
    const r = await fetch(u, {
      redirect: "follow",
      signal: AbortSignal.timeout(15000),
      headers: { "User-Agent": "Mozilla/5.0 (pj.fire)", Accept: "image/*" },
    });
    if (!r.ok || !r.body || !urlPermitida(r.url)) return null;
    const trozos: Uint8Array[] = [];
    let n = 0;
    for await (const t of r.body) {
      n += t.length;
      if (n > MAX_BYTES) return null;
      trozos.push(t);
    }
    const b = new Uint8Array(n);
    let o = 0;
    for (const t of trozos) { b.set(t, o); o += t.length; }
    const tipo = tipoImagen(b);
    return tipo ? "data:" + tipo + ";base64," + base64(b) : null;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  try {
    const auth = req.headers.get("Authorization") || "";
    if (!auth || !(await esAdmin(auth))) return json({ error: "forbidden" }, 403);
    const body = await req.json().catch(() => ({}));
    const urls = Array.isArray(body.urls) ? [...new Set(body.urls.filter((x: unknown) => typeof x === "string"))] as string[] : [];
    if (!urls.length || urls.length > MAX_URLS) return json({ error: "bad_request" }, 400);
    const imagenes: Record<string, string | null> = {};
    await Promise.all(urls.map(async (s) => { imagenes[s] = await descargar(s); }));
    return json({ imagenes });
  } catch (e) {
    return json({ error: String((e as Error).message || e) }, 500);
  }
});
