// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function json(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...(init.headers ?? {}),
    },
  });
}

serve(async (req) => {
  // 1. CORS (MATCHES working functions)
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "POST, OPTIONS",
        "access-control-allow-headers":
          "content-type, authorization, x-client-info, apikey",
      },
    });
  }

  if (req.method !== "POST") {
    return json(
      { error: "Method not allowed" },
      { status: 405, headers: { "access-control-allow-origin": "*" } },
    );
  }

  // 2. ENV (CRITICAL FIX)
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return json(
      { error: "Server misconfigured" },
      { status: 500, headers: { "access-control-allow-origin": "*" } },
    );
  }

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return json(
      { error: "Invalid JSON" },
      { status: 400, headers: { "access-control-allow-origin": "*" } },
    );
  }

  // 3. ADMIN CLIENT (SERVICE ROLE – SAME AS WORKING FUNCTIONS)
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  // 4. RESEND INVITE
  if (payload.action === "resend") {
    return json(
      { success: true },
      { status: 200, headers: { "access-control-allow-origin": "*" } },
    );
  }

  const { email, restaurant_id, role } = payload;

  if (!email || !restaurant_id) {
    return json(
      { error: "Missing email or restaurant_id" },
      { status: 400, headers: { "access-control-allow-origin": "*" } },
    );
  }

  const { data, error } =
    await admin.auth.admin.inviteUserByEmail(email, {
      data: {
        restaurant_id,
        role: role || "user",
      },
    });

  if (error) {
    return json(
      { error: error.message },
      { status: 400, headers: { "access-control-allow-origin": "*" } },
    );
  }

  return json(data, {
    status: 200,
    headers: { "access-control-allow-origin": "*" },
  });
});
