// =====================================================================
// push-reminders
// =====================================================================
// Envía notificaciones push (Web Push estándar, RFC 8030/8291/8292):
//
//  1) Cada hora (pg_cron, cabecera "x-push-secret"):
//     - Recordatorio diario a quien lo tenga activado y le toque a esa
//       hora en su zona horaria: «Tienes N tarjetas para repasar hoy»
//       (Repaso diario de Normativas) o, si no tiene nada pendiente, un
//       recordatorio suave para estudiar.
//     - A los administradores: aviso si ha habido errores nuevos en la
//       app (tabla client_errors) desde el último aviso.
//  2) Desde la app, con la sesión del usuario ({ "test": true }): envía
//     una notificación de prueba a sus propios dispositivos.
//
// Las claves VAPID y el secreto del cron viven en app_secrets; nunca en
// el repo. El cifrado del mensaje y la firma VAPID se hacen con WebCrypto,
// sin dependencias externas.
// =====================================================================

import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const enc = new TextEncoder();
function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function unb64url(s: string): Uint8Array {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}
async function hmac(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, data));
}

// ---- VAPID (RFC 8292): JWT firmado con ES256 ----
async function vapidHeader(endpoint: string, jwk: JsonWebKey, publicKey: string): Promise<string> {
  const aud = new URL(endpoint).origin;
  const header = b64url(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const payload = b64url(enc.encode(JSON.stringify({
    aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: "mailto:admin@pjfire.app",
  })));
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, enc.encode(`${header}.${payload}`)));
  return `vapid t=${header}.${payload}.${b64url(sig)}, k=${publicKey}`;
}

// ---- Cifrado del mensaje (RFC 8291, aes128gcm) ----
async function encryptPayload(p256dh: string, authSecret: string, plaintext: Uint8Array): Promise<Uint8Array> {
  const uaPublic = unb64url(p256dh);
  const auth = unb64url(authSecret);
  const asKeys = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]) as CryptoKeyPair;
  const asPublic = new Uint8Array(await crypto.subtle.exportKey("raw", asKeys.publicKey));
  const uaKey = await crypto.subtle.importKey("raw", uaPublic, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const ecdhSecret = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, asKeys.privateKey, 256));

  const prkKey = await hmac(auth, ecdhSecret);
  const keyInfo = concat(enc.encode("WebPush: info\0"), uaPublic, asPublic, new Uint8Array([1]));
  const ikm = (await hmac(prkKey, keyInfo)).slice(0, 32);

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const prk = await hmac(salt, ikm);
  const cek = (await hmac(prk, concat(enc.encode("Content-Encoding: aes128gcm\0"), new Uint8Array([1])))).slice(0, 16);
  const nonce = (await hmac(prk, concat(enc.encode("Content-Encoding: nonce\0"), new Uint8Array([1])))).slice(0, 12);

  const aesKey = await crypto.subtle.importKey("raw", cek, { name: "AES-GCM" }, false, ["encrypt"]);
  const record = concat(plaintext, new Uint8Array([2])); // 0x02 = último registro
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, aesKey, record));

  const rs = new Uint8Array([0, 0, 16, 0]); // 4096
  return concat(salt, rs, new Uint8Array([asPublic.length]), asPublic, cipher);
}

type Sub = { id: number; user_id: string; endpoint: string; p256dh: string; auth: string; remind_hour: number; tz: string; last_sent_on: string | null; last_error_alert_at: string | null };
type Vapid = { jwk: JsonWebKey; pub: string };

// Devuelve el código HTTP del servicio push (201 = entregado).
async function sendPush(sub: Sub, vapid: Vapid, message: Record<string, unknown>): Promise<number> {
  const body = await encryptPayload(sub.p256dh, sub.auth, enc.encode(JSON.stringify(message)));
  const res = await fetch(sub.endpoint, {
    method: "POST",
    headers: {
      "Authorization": await vapidHeader(sub.endpoint, vapid.jwk, vapid.pub),
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      "TTL": "43200",
      "Urgency": "normal",
    },
    body,
  });
  await res.body?.cancel();
  return res.status;
}

function localParts(tz: string, d = new Date()) {
  try {
    const f = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" });
    const p = Object.fromEntries(f.formatToParts(d).map((x) => [x.type, x.value]));
    return { date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) };
  } catch (_e) {
    return localParts("Europe/Madrid", d);
  }
}

// Tarjetas del Repaso diario pendientes para un usuario (misma regla que
// la app: vistas alguna vez y sin calendario o con fecha ya cumplida).
function dueCards(progress: Record<string, any> | null, validIds: Set<string>): number {
  if (!progress) return 0;
  const now = Date.now();
  let n = 0;
  for (const [setId, set] of Object.entries(progress)) {
    if (setId.startsWith("__") || !set || typeof set !== "object") continue;
    for (const [cardId, t] of Object.entries((set as any).t || {})) {
      const st = t as any;
      // «tests» = preguntas falladas en los tests (no son tarjetas de nq_cards).
      if (!st || !st.seen || (setId !== "tests" && !validIds.has(cardId))) continue;
      if (!st.srs || !st.srs.due || st.srs.due <= now) n++;
    }
  }
  return n;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: secrets } = await sb.from("app_secrets").select("name,value")
    .in("name", ["vapid_private_jwk", "vapid_public_key", "push_cron_secret"]);
  const sec = Object.fromEntries((secrets || []).map((r: any) => [r.name, r.value]));
  if (!sec.vapid_private_jwk || !sec.vapid_public_key) return json({ error: "no_vapid" }, 500);
  const vapid: Vapid = { jwk: JSON.parse(sec.vapid_private_jwk), pub: sec.vapid_public_key };

  const dropIfGone = async (sub: Sub, status: number) => {
    if (status === 404 || status === 410) await sb.from("push_subscriptions").delete().eq("id", sub.id);
  };

  // ---- Prueba desde la app (sesión del propio usuario) ----
  const isCron = !!sec.push_cron_secret && req.headers.get("x-push-secret") === sec.push_cron_secret;
  if (!isCron) {
    const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
    const { data: u } = await sb.auth.getUser(token);
    if (!u?.user) return json({ error: "unauthorized" }, 401);
    const { data: subs } = await sb.from("push_subscriptions").select("*").eq("user_id", u.user.id);
    let sent = 0;
    for (const s of (subs || []) as Sub[]) {
      try {
        const st = await sendPush(s, vapid, { title: "🔔 Notificaciones activadas", body: "Así te llegará el recordatorio de estudio cada día.", tag: "pjfire-test" });
        if (st >= 200 && st < 300) sent++;
        await dropIfGone(s, st);
      } catch (_e) { /* sigue con el resto */ }
    }
    return json({ sent });
  }

  // ---- Ejecución horaria (cron) ----
  const { data: subs } = await sb.from("push_subscriptions").select("*");
  const all = (subs || []) as Sub[];
  if (!all.length) return json({ reminders: 0, errorAlerts: 0 });

  const { data: cards } = await sb.from("nq_cards").select("id");
  const validIds = new Set((cards || []).map((c: any) => c.id as string));
  const { data: admins } = await sb.from("profiles").select("id").eq("is_admin", true);
  const adminIds = new Set((admins || []).map((a: any) => a.id as string));

  let reminders = 0, errorAlerts = 0;
  const progressCache = new Map<string, number>();

  for (const s of all) {
    // 1) Recordatorio diario
    const { date, hour } = localParts(s.tz || "Europe/Madrid");
    if (hour === s.remind_hour && s.last_sent_on !== date) {
      try {
        if (!progressCache.has(s.user_id)) {
          // Quien no tiene Normativas (ni, por tanto, el Repaso diario) recibe
          // solo el recordatorio genérico: no debe enterarse de que existe.
          const { data: pf } = await sb.from("profiles").select("is_admin, feature_flags").eq("id", s.user_id).maybeSingle();
          const canReview = !!(pf as any)?.is_admin || (pf as any)?.feature_flags?.normativas !== false;
          let due = 0;
          if (canReview) {
            const { data: p } = await sb.from("nq_user_progress").select("data").eq("user_id", s.user_id).maybeSingle();
            due = dueCards((p as any)?.data || null, validIds);
          }
          progressCache.set(s.user_id, due);
        }
        const due = progressCache.get(s.user_id) || 0;
        const msg = due > 0
          ? { title: `🔥 Tienes ${due} tarjeta${due === 1 ? "" : "s"} para repasar hoy`, body: "Tu Repaso diario (normativas y preguntas falladas) te espera. ¡Unos minutos y listo!", tag: "pjfire-daily", url: "./?repaso=1" }
          : { title: "📚 ¿Un ratito de estudio hoy?", body: "Un test rápido al día marca la diferencia. ¡Tú puedes!", tag: "pjfire-daily", url: "./" };
        const st = await sendPush(s, vapid, msg);
        await dropIfGone(s, st);
        if (st >= 200 && st < 300) {
          reminders++;
          await sb.from("push_subscriptions").update({ last_sent_on: date }).eq("id", s.id);
        }
      } catch (_e) { /* sigue con el resto */ }
    }

    // 2) Avisos de errores nuevos a los administradores
    if (adminIds.has(s.user_id)) {
      try {
        const since = s.last_error_alert_at || new Date(Date.now() - 3600_000).toISOString();
        const { count } = await sb.from("client_errors").select("id", { count: "exact", head: true })
          .eq("seen", false).gt("created_at", since);
        if (count && count > 0) {
          const st = await sendPush(s, vapid, {
            title: `⚠️ ${count} error${count === 1 ? "" : "es"} nuevo${count === 1 ? "" : "s"} en la app`,
            body: "Míralos en Administración → Errores.",
            tag: "pjfire-errors",
            url: "./?admin=errores",
          });
          await dropIfGone(s, st);
          if (st >= 200 && st < 300) errorAlerts++;
        }
        await sb.from("push_subscriptions").update({ last_error_alert_at: new Date().toISOString() }).eq("id", s.id);
      } catch (_e) { /* sigue */ }
    }
  }
  return json({ reminders, errorAlerts });
});
