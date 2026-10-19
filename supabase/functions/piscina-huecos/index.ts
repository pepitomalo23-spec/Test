// =====================================================================
// piscina-huecos
// =====================================================================
// Huecos de la piscina del PMD Vista Alegre en IMDECO (gestiones.imdcordoba.es)
// para los días ya abiertos (hoy, mañana y pasado), leídos de la «Consulta de
// espacios» pública (sin iniciar sesión, sin navegador: los mismos postbacks
// asíncronos de ASP.NET que hace la web).
//
//  - Desde la app (sesión de un administrador): devuelve la última foto si es
//    de hace menos de 25 s; si no, la saca de nuevo. Con las calles que se
//    han liberado en las últimas horas.
//  - Cada 5 minutos (pg_cron, cabecera "x-piscina-secret"): saca la foto para
//    notar las calles que se liberan aunque nadie tenga la pantalla abierta.
//    De 1:00 a 6:59 (hora de Madrid) no hace nada.
//
// Una calle «se libera» cuando en la foto anterior estaba ocupada y ahora está
// libre (alguien ha anulado). Tablas: piscina_huecos (la última foto) y
// piscina_liberados. El secreto del cron vive en app_secrets.
// =====================================================================

import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2.117.1";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const IMD = "https://gestiones.imdcordoba.es";
const CENTRO = "1"; // PMD VISTALEGRE
const FRANJAS: [string, string][] = [["60", "Piscina Mañana"], ["71", "Piscina Medio Día"], ["61", "Piscina Tarde"]];
const CACHE_MS = 25_000;

type Hora = { hora: string; franja: string; total: number; libres: string[] };
type Dia = { fecha: string; horas: Hora[] };

// ---------------- sesión con IMDECO (cookies + campos ocultos de ASP.NET) ----------------
class Imdeco {
  jar = new Map<string, string>();
  campos: Record<string, string> = {};
  url = IMD + "/CronosWeb/Login";

  private guardar(res: Response) {
    for (const c of res.headers.getSetCookie()) {
      const kv = c.split(";")[0];
      const i = kv.indexOf("=");
      this.jar.set(kv.slice(0, i).trim(), kv.slice(i + 1));
    }
  }
  private cookie() { return [...this.jar].map(([k, v]) => `${k}=${v}`).join("; "); }
  private static ocultos(html: string) {
    const o: Record<string, string> = {};
    for (const m of html.matchAll(/<input[^>]*type="hidden"[^>]*>/gi)) {
      const n = (m[0].match(/name="([^"]*)"/) || [])[1];
      const v = (m[0].match(/value="([^"]*)"/) || [, ""])[1] as string;
      if (n) o[n] = v.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
    }
    return o;
  }
  async get(u: string): Promise<string> {
    const r = await fetch(u, { headers: { cookie: this.cookie(), "user-agent": "Mozilla/5.0 pj.fire" }, redirect: "manual" });
    this.guardar(r);
    if (r.status >= 300 && r.status < 400) { await r.body?.cancel(); return this.get(new URL(r.headers.get("location")!, u).href); }
    const html = await r.text();
    this.url = u;
    this.campos = Imdeco.ocultos(html);
    return html;
  }
  // Respuesta de un postback asíncrono: «largo|tipo|id|contenido|» repetido
  private static delta(t: string) {
    const out: { tipo: string; id: string; contenido: string }[] = [];
    let i = 0;
    while (i < t.length) {
      const a = t.indexOf("|", i); if (a < 0) break;
      const len = Number(t.slice(i, a));
      const b = t.indexOf("|", a + 1), c = t.indexOf("|", b + 1);
      out.push({ tipo: t.slice(a + 1, b), id: t.slice(b + 1, c), contenido: t.substr(c + 1, len) });
      i = c + 1 + len + 1;
    }
    return out;
  }
  // El UpdatePanel «X_Y_uplAlert» es el control «ctl00$X$Y$uplAlert»
  async postback(panel: string, arg: unknown): Promise<string> {
    const body = new URLSearchParams({
      ...this.campos,
      "ctl00$ScriptManager1": "ctl00$" + panel.split("_").join("$") + "|" + panel,
      __EVENTTARGET: panel, __EVENTARGUMENT: JSON.stringify(arg), __ASYNCPOST: "true",
    });
    const r = await fetch(this.url, {
      method: "POST", body,
      headers: {
        cookie: this.cookie(), "user-agent": "Mozilla/5.0 pj.fire",
        "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
        "x-microsoftajax": "Delta=true", "x-requested-with": "XMLHttpRequest",
      },
    });
    this.guardar(r);
    const d = Imdeco.delta(await r.text());
    for (const x of d) if (x.tipo === "hiddenField") this.campos[x.id] = x.contenido;
    const err = d.find((x) => x.tipo === "error");
    if (err) throw new Error("IMDECO: " + err.contenido.slice(0, 200));
    const red = d.find((x) => x.tipo === "pageRedirect");
    if (red) return this.get(new URL(decodeURIComponent(red.contenido), this.url).href);
    return d.map((x) => x.contenido).join("\n");
  }
}

function parrilla(html: string, franja: string): Hora[] {
  const horas = [...html.matchAll(/HoraDesde="([\d:]+)"/gi)].map((m) => m[1]);
  const calles = [...html.matchAll(/DecCodRecinto="(\d+)"><span[^>]*>([^<]+)</gi)].map((m) => ({ cod: m[1], nombre: m[2].trim() }));
  const libre = new Set<string>();
  for (const m of html.matchAll(/<img[^>]*id="[^"]*_img(\d+)(\d{4})"[^>]*>/gi)) {
    if (/Estado="Libre"/i.test(m[0])) libre.add(m[1] + "|" + m[2].slice(0, 2) + ":" + m[2].slice(2));
  }
  return horas.map((h) => ({ hora: h, franja, total: calles.length, libres: calles.filter((c) => libre.has(c.cod + "|" + h)).map((c) => c.nombre) }));
}

function madrid(d = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(d).map((x) => [x.type, x.value]));
  return { fecha: `${p.year}-${p.month}-${p.day}`, hora: `${p.hour}:${p.minute}`, h: Number(p.hour) };
}
const masDias = (iso: string, n: number) => { const d = new Date(iso + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

async function sacarFoto(): Promise<Dia[]> {
  const s = new Imdeco();
  await s.get(s.url);
  await s.postback("ContentFixedSection_uSecciones_uAlert_uplAlert", { action: "SelectMenu", args: { menu_code: "23", menu_title: "Acceso no identificado", menu_type: 30, submenu_code: null } });
  await s.postback("ContentFixedSection_uSecciones_uAlert_uplAlert", { action: "SelectMenu", args: { menu_code: "15", menu_title: "Consulta de espacios", menu_type: 16, submenu_code: null } });
  await s.postback("ContentFixedSection_uReservaEspacios_uCentrosSeleccionar_uAlert_uplAlert", { action: "SelectFacility", args: { menu_code: "15", facility_code: CENTRO, date: null } });
  const hoy = madrid().fecha;
  const fechas = [0, 1, 2].map((n) => masDias(hoy, n));
  const dias: Dia[] = fechas.map((fecha) => ({ fecha, horas: [] }));
  for (const [code, name] of FRANJAS) {
    await s.postback("ContentFixedSection_uReservaEspacios_uUsosSeleccionar_uAlert_uplAlert", {
      action: "Seleccionar", args: { reservation_type_code: code, reservation_type_name: name, icon: "", icon_mime_type: "image/jpeg", dates: fechas, resources: [] },
    });
    for (const d of dias) {
      const html = await s.postback("ContentFixedSection_uReservaEspacios_uFechaSeleccionar_uAlert_uplAlert", { action: "Continuar", args: d.fecha });
      d.horas.push(...parrilla(html, name.replace("Piscina ", "")));
    }
  }
  for (const d of dias) d.horas.sort((a, b) => a.hora < b.hora ? -1 : 1);
  if (!dias.some((d) => d.horas.length)) throw new Error("IMDECO no ha devuelto ninguna parrilla");
  return dias;
}

// Saca la foto, la guarda y apunta las calles que se han liberado desde la anterior.
async function actualizar(sb: SupabaseClient) {
  const { data: previa } = await sb.from("piscina_huecos").select("datos").eq("id", 1).maybeSingle();
  const dias = await sacarFoto();
  const ahora = madrid();
  const antes = new Map<string, Set<string>>();
  for (const d of ((previa as any)?.datos?.dias || []) as Dia[]) for (const h of d.horas) antes.set(d.fecha + "|" + h.hora, new Set(h.libres));
  const liberados: { fecha: string; hora: string; calle: string }[] = [];
  for (const d of dias) for (const h of d.horas) {
    const ya = antes.get(d.fecha + "|" + h.hora);
    if (!ya) continue; // día u hora nuevos (se acaban de abrir): no es una anulación
    if (d.fecha === ahora.fecha && h.hora <= ahora.hora) continue; // ya empezó
    for (const c of h.libres) if (!ya.has(c)) liberados.push({ fecha: d.fecha, hora: h.hora, calle: c });
  }
  const actualizado = new Date().toISOString();
  await sb.from("piscina_huecos").upsert({ id: 1, datos: { dias }, actualizado });
  if (liberados.length) await sb.from("piscina_liberados").insert(liberados);
  return { dias, actualizado };
}

async function liberadosRecientes(sb: SupabaseClient) {
  const desde = new Date(Date.now() - 6 * 3600_000).toISOString();
  const { data } = await sb.from("piscina_liberados").select("fecha, hora, calle, visto")
    .gte("visto", desde).gte("fecha", madrid().fecha).order("visto", { ascending: false }).limit(30);
  return data || [];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  try {
    const { data: sec } = await sb.from("app_secrets").select("value").eq("name", "piscina_cron_secret").maybeSingle();
    const esCron = !!(sec as any)?.value && req.headers.get("x-piscina-secret") === (sec as any).value;
    if (esCron) {
      const h = madrid().h;
      if (h >= 1 && h < 7) return json({ ok: true, omitido: "noche" });
      const r = await actualizar(sb);
      return json({ ok: true, actualizado: r.actualizado });
    }
    // Desde la app: solo administradores
    const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
    const { data: u } = await sb.auth.getUser(token);
    if (!u?.user) return json({ error: "unauthorized" }, 401);
    const { data: pf } = await sb.from("profiles").select("is_admin").eq("id", u.user.id).maybeSingle();
    if (!(pf as any)?.is_admin) return json({ error: "forbidden" }, 403);

    const { data: foto } = await sb.from("piscina_huecos").select("datos, actualizado").eq("id", 1).maybeSingle();
    let res: { dias: Dia[]; actualizado: string };
    const hoy = madrid().fecha;
    const vieja = !foto || Date.now() - new Date((foto as any).actualizado).getTime() > CACHE_MS || (foto as any).datos?.dias?.[0]?.fecha !== hoy;
    if (vieja) {
      try { res = await actualizar(sb); }
      catch (e) {
        if (!foto) throw e;
        res = { dias: (foto as any).datos.dias, actualizado: (foto as any).actualizado };
        return json({ ...res, liberados: await liberadosRecientes(sb), aviso: "No se pudo actualizar: " + String((e as Error).message).slice(0, 150) });
      }
    } else res = { dias: (foto as any).datos.dias, actualizado: (foto as any).actualizado };
    return json({ ...res, liberados: await liberadosRecientes(sb) });
  } catch (e) {
    return json({ error: String((e as Error).message || e).slice(0, 300) }, 502);
  }
});
