import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { status: 200, headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) throw new Error("Server misconfigured");

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const { restaurant_id, amount_cents, currency, turnstileToken } = await req.json();

    // Validate
    if (!restaurant_id || !amount_cents || amount_cents <= 0) {
      return json({ error: "Invalid request" }, 400);
    }

    // Verify Turnstile
    if (turnstileToken) {
      const turnstileSecret = Deno.env.get("TURNSTILE_SECRET_KEY");
      if (turnstileSecret) {
        const tvResp = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: `secret=${turnstileSecret}&response=${turnstileToken}`,
        });
        const tvData = await tvResp.json();
        if (!tvData.success) return json({ error: "Security check failed" }, 403);
      }
    }

    // Fetch restaurant payment config
    const { data: restaurant, error: rError } = await supabase
      .from("restaurants")
      .select("razorpay_key_id, razorpay_key_secret, online_payments_enabled, currency_code")
      .eq("id", restaurant_id)
      .single();

    if (rError || !restaurant) return json({ error: "Restaurant not found" }, 404);
    if (!restaurant.online_payments_enabled) return json({ error: "Online payments not enabled" }, 400);
    if (!restaurant.razorpay_key_id || !restaurant.razorpay_key_secret) {
      return json({ error: "Payment gateway not configured" }, 400);
    }

    const orderCurrency = currency || restaurant.currency_code || "INR";

    // Create Razorpay order
    const receiptId = `rcpt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const rzpAuth = btoa(`${restaurant.razorpay_key_id}:${restaurant.razorpay_key_secret}`);
    const rzpResp = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${rzpAuth}`,
      },
      body: JSON.stringify({
        amount: amount_cents, // Razorpay uses paise (same as cents for INR)
        currency: orderCurrency,
        receipt: receiptId,
      }),
    });

    if (!rzpResp.ok) {
      const errBody = await rzpResp.text();
      console.error("Razorpay order creation failed:", errBody);
      return json({ error: "Payment gateway error" }, 502);
    }

    const rzpOrder = await rzpResp.json();

    return json({
      razorpay_order_id: rzpOrder.id,
      amount: rzpOrder.amount,
      currency: rzpOrder.currency,
      key_id: restaurant.razorpay_key_id,
      receipt: receiptId,
    });
  } catch (e) {
    console.error("create-razorpay-order error:", e);
    return json({ error: e.message || "Internal error" }, 500);
  }
});
