// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders }
  });
}

async function validateApiKey(supabase: any, rawKey: string) {
  if (!rawKey) return null;
  const keyHash = Array.from(new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(rawKey))
  )).map(b => b.toString(16).padStart(2, "0")).join("");

  const { data } = await supabase
    .from("api_keys")
    .select("restaurant_id, scopes, is_active, expires_at")
    .eq("key_hash", keyHash)
    .maybeSingle();

  if (!data?.is_active) return null;
  if (data.expires_at && new Date(data.expires_at) < new Date()) return null;
  supabase.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("key_hash", keyHash).then(() => {});
  return data;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { status: 200, headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: flag } = await supabase.from("feature_flags").select("is_enabled").eq("key", "headless_api").maybeSingle();
    if (!flag?.is_enabled) return json({ error: "Headless API not enabled" }, 403);

    const rawKey = req.headers.get("x-api-key") || new URL(req.url).searchParams.get("api_key") || "";
    const auth = await validateApiKey(supabase, rawKey);
    if (!auth) return json({ error: "Invalid or missing API key" }, 401);

    // GET: fetch order status
    if (req.method === "GET") {
      if (!auth.scopes.includes("orders:read")) return json({ error: "Insufficient scope: orders:read required" }, 403);
      const orderId = new URL(req.url).searchParams.get("id");
      if (!orderId) return json({ error: "id parameter required" }, 400);

      const { data: order } = await supabase
        .from("orders")
        .select("id, status, total_cents, currency_code, table_label, placed_at, order_items(name_snapshot, quantity, unit_price_cents)")
        .eq("id", orderId)
        .eq("restaurant_id", auth.restaurant_id)
        .single();

      if (!order) return json({ error: "Order not found" }, 404);
      return json({ order });
    }

    // POST: place order
    if (req.method === "POST") {
      if (!auth.scopes.includes("orders:write")) return json({ error: "Insufficient scope: orders:write required" }, 403);

      const payload = await req.json();
      const { items, table_label, customer_phone, customer_name } = payload;

      if (!items?.length) return json({ error: "items array required" }, 400);

      // Validate restaurant is accepting orders
      const { data: rest } = await supabase
        .from("restaurants")
        .select("is_accepting_orders")
        .eq("id", auth.restaurant_id)
        .single();

      if (!rest?.is_accepting_orders) return json({ error: "Restaurant not accepting orders" }, 400);

      // Delegate to place-order function
      const placeOrderResp = await supabase.functions.invoke("place-order", {
        body: {
          restaurant_id: auth.restaurant_id,
          items,
          table_label,
          customer_phone,
          customer_name,
          via_api: true,
        }
      });

      if (placeOrderResp.error) throw new Error(placeOrderResp.error.message);

      // Fire webhook for order.placed event
      supabase.functions.invoke("deliver-webhook", {
        body: {
          restaurant_id: auth.restaurant_id,
          event: "order.placed",
          payload: placeOrderResp.data,
        }
      }).catch(console.error);

      return json({ order: placeOrderResp.data });
    }

    return json({ error: "Method not allowed" }, 405);

  } catch (err: any) {
    console.error("api-order error:", err);
    return json({ error: err.message }, 500);
  }
});
