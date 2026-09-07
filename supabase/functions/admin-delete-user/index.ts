// =====================================================================
// admin-delete-user
// =====================================================================
// Borra POR COMPLETO la cuenta de un usuario (auth.users + fila en
// profiles + todo lo que dependa de ella por "on delete cascade":
// user_devices, session_answers, test_sessions, etc.). Es una acción
// irreversible.
//
// Por qué hace falta una función y no basta con una RPC normal: borrar
// de auth.users solo se puede hacer con la clave "service role", que
// nunca debe llegar al navegador. Esta función vive en el servidor,
// usa esa clave por debajo, y antes de borrar nada comprueba que quien
// llama es un administrador (usando su propio token, no la clave de
// servicio, para saber quién es).
//
// Seguridad:
//   - Requiere sesión iniciada (verify_jwt: true).
//   - Comprueba profiles.is_admin del que llama antes de hacer nada.
//   - No permite borrar cuentas de administrador (hay que quitarles el
//     rol de admin primero, desde el panel, como medida de seguridad
//     extra para no borrar sin querer al único admin).
//   - No permite que un admin se borre a sí mismo desde aquí.
//
// Body esperado: { "user_id": "uuid-del-usuario-a-borrar" }
// =====================================================================

import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function supabaseAdmin() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

// Cliente que actúa "como quien llama" (con su propio token), solo para
// averiguar quién es. Nunca se usa para saltarse RLS.
function supabaseAsCaller(authHeader: string) {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, 405);
  }

  try {
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader) {
      return jsonResponse({ error: "not_authenticated" }, 401);
    }

    const { user_id: targetUserId } = await req.json();
    if (!targetUserId || typeof targetUserId !== "string") {
      return jsonResponse({ error: "missing_user_id", message: "Falta user_id." }, 400);
    }

    const callerClient = supabaseAsCaller(authHeader);
    const { data: callerData, error: callerErr } = await callerClient.auth.getUser();
    if (callerErr || !callerData?.user) {
      return jsonResponse({ error: "not_authenticated" }, 401);
    }
    const callerId = callerData.user.id;

    const admin = supabaseAdmin();

    const { data: callerProfile, error: profErr } = await admin
      .from("profiles")
      .select("is_admin")
      .eq("id", callerId)
      .maybeSingle();
    if (profErr || !callerProfile?.is_admin) {
      return jsonResponse({ error: "not_authorized", message: "Solo un administrador puede eliminar cuentas." }, 403);
    }

    if (targetUserId === callerId) {
      return jsonResponse({ error: "cannot_delete_self", message: "No puedes eliminar tu propia cuenta desde aquí." }, 400);
    }

    const { data: targetProfile } = await admin
      .from("profiles")
      .select("is_admin")
      .eq("id", targetUserId)
      .maybeSingle();
    if (targetProfile?.is_admin) {
      return jsonResponse({
        error: "cannot_delete_admin",
        message: "No se puede eliminar una cuenta de administrador. Quítale antes el rol de admin.",
      }, 400);
    }

    const { error: deleteErr } = await admin.auth.admin.deleteUser(targetUserId);
    if (deleteErr) {
      return jsonResponse({ error: "delete_failed", message: deleteErr.message }, 500);
    }

    return jsonResponse({ ok: true });
  } catch (err) {
    return jsonResponse({ error: "server_error", message: (err as Error).message }, 500);
  }
});
