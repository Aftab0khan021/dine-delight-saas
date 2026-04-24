// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders }
  });
}

async function hmacSign(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, "0")).join("");
}

async function deliverToEndpoint(endpoint: any, event: string, payload: any, supabase: any): Promise<void> {
  const body = JSON.stringify({ event, payload, timestamp: new Date().toISOString() });

  // Compute HMAC signature using stored secret prefix (in production store full secret)
  // For now we use the secret_prefix as the signing secret (demo mode)
  const signature = await hmacSign(endpoint.secret_prefix, body);

  const deliveryId = crypto.randomUUID();

  // Insert delivery record
  await supabase.from("webhook_deliveries").insert({
    id: deliveryId,
    endpoint_id: endpoint.id,
    restaurant_id: endpoint.restaurant_id,
    event,
    payload,
    status: "pending",
    attempts: 1,
    last_attempted_at: new Date().toISOString(),
  });

  try {
    const resp = await fetch(endpoint.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Dine-Signature": `sha256=${signature}`,
        "X-Dine-Event": event,
        "User-Agent": "DineDelight-Webhook/1.0",
      },
      body,
      signal: AbortSignal.timeout(10_000),
    });

    const respBody = await resp.text().catch(() => "");
    await supabase.from("webhook_deliveries").update({
      status: resp.ok ? "success" : "failed",
      http_status: resp.status,
      response_body: respBody.slice(0, 500),
    }).eq("id", deliveryId);

  } catch (err: any) {
    await supabase.from("webhook_deliveries").update({
      status: "failed",
      response_body: err.message,
    }).eq("id", deliveryId);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { status: 200, headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { restaurant_id, event, payload } = await req.json();
    if (!restaurant_id || !event || !payload) {
      return json({ error: "restaurant_id, event, payload required" }, 400);
    }

    // Fetch active endpoints for this restaurant that subscribe to this event
    const { data: endpoints } = await supabase
      .from("webhook_endpoints")
      .select("*")
      .eq("restaurant_id", restaurant_id)
      .eq("is_active", true)
      .contains("events", [event]);

    if (!endpoints?.length) {
      return json({ delivered: 0, message: "No active endpoints for this event" });
    }

    // Fire all deliveries in parallel
    await Promise.allSettled(
      endpoints.map((ep: any) => deliverToEndpoint(ep, event, payload, supabase))
    );

    return json({ delivered: endpoints.length });

  } catch (err: any) {
    console.error("deliver-webhook error:", err);
    return json({ error: err.message }, 500);
  }
});
