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
    return json({ error: "Method not allowed" }, { status: 405, headers: { "access-control-allow-origin": "*" } });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return json({ error: "Server misconfigured" }, { status: 500, headers: { "access-control-allow-origin": "*" } });
  }

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, { status: 400, headers: { "access-control-allow-origin": "*" } });
  }

  const token = String(payload?.token ?? "").trim();
  if (!token || token.length < 16 || token.length > 128) {
    return json({ error: "Invalid token" }, { status: 400, headers: { "access-control-allow-origin": "*" } });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const { data: order, error: orderError } = await admin
    .from("orders")
    .select("id,status,placed_at,subtotal_cents,total_cents,currency_code")
    .eq("order_token", token)
    .maybeSingle();

  if (orderError) {
    return json({ error: orderError.message }, { status: 500, headers: { "access-control-allow-origin": "*" } });
  }

  if (!order) {
    return json({ error: "Order not found" }, { status: 404, headers: { "access-control-allow-origin": "*" } });
  }

  const { data: items, error: itemsError } = await admin
    .from("order_items")
    .select("id,name_snapshot,quantity,unit_price_cents,line_total_cents")
    .eq("order_id", order.id)
    .order("created_at", { ascending: true });

  if (itemsError) {
    return json({ error: itemsError.message }, { status: 500, headers: { "access-control-allow-origin": "*" } });
  }

  return json(
    { order, items: items ?? [] },
    {
      status: 200,
      headers: {
        "access-control-allow-origin": "*",
      },
    },
  );
});
