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

  // Rate Limiting - Prevent QR code scanning abuse
  const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown';

  if (clientIp !== 'unknown') {
    const { count } = await admin
      .from('activity_logs')
      .select('*', { count: 'exact', head: true })
      .eq('action', 'qr_resolve')
      .eq('ip', clientIp)
      .gte('created_at', new Date(Date.now() - 60 * 1000).toISOString());

    if (count !== null && count >= 60) {
      console.warn(`Rate limit exceeded for QR resolve, IP: ${clientIp}`);
      return json(
        { error: "Too many requests. Please wait 1 minute." },
        { status: 429, headers: { "access-control-allow-origin": "*" } }
      );
    }

    // Log the resolution attempt (fire and forget)
    admin.from('activity_logs').insert({
      action: 'qr_resolve',
      entity_type: 'qr_code',
      ip: clientIp,
      metadata: { code_length: code.length }
    }).then();
  }

  const { data: qr, error } = await admin
    .from("qr_codes")
    .select("destination_path,is_active, restaurant:restaurants(slug)")
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

  let finalPath = qr.destination_path;

  // Fix legacy paths that are missing the restaurant slug
  if ((finalPath === "/menu" || finalPath.startsWith("/menu?")) && qr.restaurant?.slug) {
    finalPath = `/r/${qr.restaurant.slug}${finalPath}`;
  }

  return json(
    { destination_path: finalPath },
    { status: 200, headers: { "access-control-allow-origin": "*" } },
  );
});
