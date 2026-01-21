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
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "POST, OPTIONS",
        "access-control-allow-headers": "content-type, authorization",
      },
    });
  }

  if (req.method !== "POST") {
    return json(
      { error: "Method not allowed" },
      { status: 405, headers: { "access-control-allow-origin": "*" } },
    );
  }

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

  const code = String(payload?.code ?? "").trim();
  if (!code || code.length < 3 || code.length > 200) {
    return json(
      { error: "Invalid code" },
      { status: 400, headers: { "access-control-allow-origin": "*" } },
    );
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const { data: qr, error } = await admin
    .from("qr_codes")
    .select("destination_path,is_active")
    .eq("code", code)
    .maybeSingle();

  if (error) {
    return json(
      { error: error.message },
      { status: 500, headers: { "access-control-allow-origin": "*" } },
    );
  }

  if (!qr || !qr.is_active) {
    return json(
      { error: "Invalid or expired QR code" },
      { status: 404, headers: { "access-control-allow-origin": "*" } },
    );
  }

  return json(
    { destination_path: qr.destination_path },
    { status: 200, headers: { "access-control-allow-origin": "*" } },
  );
});
