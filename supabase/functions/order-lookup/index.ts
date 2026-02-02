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
  // 1. Handle CORS (Allowing all necessary headers)
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "POST, OPTIONS",
        "access-control-allow-headers": "content-type, authorization, x-client-info, apikey",
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

  // --- TURNSTILE VERIFICATION START ---
  const turnstileToken = payload?.turnstileToken;
  const TURNSTILE_SECRET_KEY = Deno.env.get("TURNSTILE_SECRET_KEY");

  // Enforce Turnstile
  if (!turnstileToken) {
    return json({ error: "Security check failed. Please refresh." }, { status: 400, headers: { "access-control-allow-origin": "*" } });
  }

  if (TURNSTILE_SECRET_KEY) {
    const formData = new FormData();
    formData.append('secret', TURNSTILE_SECRET_KEY);
    formData.append('response', turnstileToken);
    formData.append('remoteip', req.headers.get('x-forwarded-for')?.split(',')[0].trim() || '');

    try {
      const result = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST',
        body: formData,
      });
      const outcome = await result.json();
      if (!outcome.success) {
        console.error('Turnstile verification failed', outcome);
        return json({ error: "Security verification failed" }, { status: 403, headers: { "access-control-allow-origin": "*" } });
      }
    } catch (err) {
      console.error('Turnstile error', err);
      // Fail open or closed? Closed for security.
      return json({ error: "Security check error" }, { status: 500, headers: { "access-control-allow-origin": "*" } });
    }
  }
  // --- TURNSTILE VERIFICATION END ---

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  // Rate Limiting - Prevent token enumeration attacks
  const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown';

  if (clientIp !== 'unknown') {
    const { count } = await admin
      .from('activity_logs')
      .select('*', { count: 'exact', head: true })
      .eq('action', 'order_lookup')
      .eq('ip', clientIp)
      .gte('created_at', new Date(Date.now() - 5 * 60 * 1000).toISOString());

    if (count !== null && count >= 30) {
      console.warn(`Rate limit exceeded for order lookup, IP: ${clientIp}`);
      return json(
        { error: "Too many lookup requests. Please wait 5 minutes." },
        { status: 429, headers: { "access-control-allow-origin": "*" } }
      );
    }

    // Log the lookup attempt (fire and forget - don't await)
    admin.from('activity_logs').insert({
      action: 'order_lookup',
      entity_type: 'order',
      ip: clientIp,
      metadata: { token_length: token.length }
    }).then();
  }

  // 2. Fetch Order AND Restaurant Details (FIX: Added restaurant join)
  const { data: order, error: orderError } = await admin
    .from("orders")
    .select(`
      id,
      status,
      placed_at,
      subtotal_cents,
      total_cents,
      currency_code,
      restaurant:restaurants (
        name,
        slug
      )
    `)
    .eq("order_token", token)
    .maybeSingle();

  if (orderError) {
    return json({ error: orderError.message }, { status: 500, headers: { "access-control-allow-origin": "*" } });
  }

  if (!order) {
    return json({ error: "Order not found" }, { status: 404, headers: { "access-control-allow-origin": "*" } });
  }

  // 3. Fetch Items
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