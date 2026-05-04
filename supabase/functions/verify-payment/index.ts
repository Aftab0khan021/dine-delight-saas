import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { crypto } from "https://deno.land/std@0.168.0/crypto/mod.ts";
import { encode } from "https://deno.land/std@0.168.0/encoding/hex.ts";

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

async function hmacSHA256(key: string, message: string): Promise<string> {
  const encoder = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(message));
  return new TextDecoder().decode(encode(new Uint8Array(signature)));
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { status: 200, headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) throw new Error("Server misconfigured");

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      order_payload, // Same shape as place-order body
    } = await req.json();

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !order_payload) {
      return json({ error: "Missing required fields" }, 400);
    }

    const restaurant_id = order_payload.restaurant_id;
    if (!restaurant_id) return json({ error: "Missing restaurant_id" }, 400);

    // Fetch restaurant's Razorpay secret
    const { data: restaurant, error: rError } = await supabase
      .from("restaurants")
      .select("razorpay_key_secret, online_payments_enabled")
      .eq("id", restaurant_id)
      .single();

    if (rError || !restaurant) return json({ error: "Restaurant not found" }, 404);
    if (!restaurant.online_payments_enabled || !restaurant.razorpay_key_secret) {
      return json({ error: "Payments not configured" }, 400);
    }

    // Verify HMAC signature
    const expectedSignature = await hmacSHA256(
      restaurant.razorpay_key_secret,
      `${razorpay_order_id}|${razorpay_payment_id}`
    );

    if (expectedSignature !== razorpay_signature) {
      console.error("Payment signature mismatch!", { razorpay_order_id, razorpay_payment_id });
      return json({ error: "Payment verification failed" }, 403);
    }

    console.log(`Payment verified: ${razorpay_payment_id} for order ${razorpay_order_id}`);

    // Place the order via the existing place-order function internally
    // We call place-order as an internal fetch to reuse all validation logic
    const placeOrderResp = await fetch(`${supabaseUrl}/functions/v1/place-order`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceRoleKey}`,
        apikey: serviceRoleKey,
      },
      body: JSON.stringify({
        ...order_payload,
        payment_method: "online",
        payment_verified: true, // Flag so place-order knows payment is verified
      }),
    });

    const placeOrderData = await placeOrderResp.json();
    if (!placeOrderResp.ok || !placeOrderData?.id) {
      console.error("place-order failed after payment:", placeOrderData);
      return json({ error: placeOrderData?.error || "Order creation failed after payment" }, 500);
    }

    // Insert payment record
    const { error: paymentError } = await supabase.from("order_payments").insert({
      order_id: placeOrderData.id,
      restaurant_id,
      amount_cents: placeOrderData.total_cents,
      payment_method: "razorpay",
      status: "captured",
      transaction_id: razorpay_payment_id,
      metadata: {
        razorpay_order_id,
        razorpay_payment_id,
        razorpay_signature,
      },
    });

    if (paymentError) {
      console.error("Payment record insert error (non-critical):", paymentError);
    }

    // Update order payment_status
    await supabase
      .from("orders")
      .update({ payment_status: "paid", payment_method: "online" })
      .eq("id", placeOrderData.id);

    return json({
      ...placeOrderData,
      payment_status: "paid",
      razorpay_payment_id,
    });
  } catch (e) {
    console.error("verify-payment error:", e);
    return json({ error: e.message || "Internal error" }, 500);
  }
});
