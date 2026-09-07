// =====================================================================
// gemini-proxy
// =====================================================================
// Intermediario para todas las llamadas a Gemini que hace el propio
// navegador (explicación de preguntas con IA, importación de preguntas
// con IA). Antes cada usuario tenía que pegar su propia clave de API en
// localStorage; ahora la clave vive UNA sola vez en el servidor
// (tabla app_secrets, configurada desde el panel de admin en "Cambios
// BOE") y esta función la usa por debajo, sin exponerla nunca al
// cliente.
//
// Requiere sesión iniciada (verify_jwt: true): cualquier usuario
// logueado en la app puede pedir una explicación o ayudar a importar
// preguntas, igual que antes, pero sin necesitar su propia clave.
// =====================================================================

import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function supabaseAdmin() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  try {
    const { prompt } = await req.json();
    if (!prompt || typeof prompt !== "string") {
      return new Response(JSON.stringify({ error: "Falta el prompt." }), {
        status: 400,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const sb = supabaseAdmin();
    const { data: row } = await sb.from("app_secrets").select("value").eq("name", "gemini_api_key").maybeSingle();
    const apiKey = row?.value;

    if (!apiKey) {
      return new Response(JSON.stringify({ error: "no_key", message: "No hay ninguna clave de Gemini configurada todavía. Un administrador debe añadirla en Cambios BOE → Administración." }), {
        status: 412,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      },
    );
    const data = await resp.json();
    if (!resp.ok) {
      const message = (data && data.error && data.error.message) || "Error llamando a la API de Gemini.";
      return new Response(JSON.stringify({ error: "gemini_error", message }), {
        status: 502,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    return new Response(JSON.stringify({ text }), {
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "server_error", message: (err as Error).message }), {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }
});
