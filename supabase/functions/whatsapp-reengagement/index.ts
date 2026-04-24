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

async function sendReengagementWhatsApp(phone: string, restaurantName: string, couponCode: string, discount: number, mocked: boolean) {
  const token = Deno.env.get("WHATSAPP_TOKEN");
  const phoneId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID");

  if (!token || !phoneId || mocked) {
    console.log(`[WhatsApp MOCK] Re-engagement to ${phone}, coupon: ${couponCode} (${discount}% off)`);
    return { messageId: `mock_reeng_${crypto.randomUUID()}`, mocked: true };
  }

  const resp = await fetch(`https://graph.facebook.com/v18.0/${phoneId}/messages`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: phone.replace(/\s+/g, ""),
      type: "template",
      template: {
        name: "reengagement_coupon",
        language: { code: "en" },
        components: [{
          type: "body",
          parameters: [
            { type: "text", text: restaurantName },
            { type: "text", text: `${discount}%` },
            { type: "text", text: couponCode },
          ]
        }]
      }
    })
  });

  const data = await resp.json();
  if (!resp.ok) throw new Error(data.error?.message || "WhatsApp API error");
  return { messageId: data.messages?.[0]?.id, mocked: false };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { status: 200, headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const isMocked = !Deno.env.get("WHATSAPP_TOKEN");
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();

    // Find all restaurants with whatsapp_crm enabled
    const { data: enabledFlags } = await supabase
      .from("feature_flags")
      .select("is_enabled, config")
      .eq("key", "whatsapp_crm")
      .single();

    if (!enabledFlags?.is_enabled && !isMocked) {
      return json({ skipped: true, reason: "whatsapp_crm globally disabled" });
    }

    const discountPct: number = enabledFlags?.config?.reengagement_delay_days ?? 15;

    // Find orders from 7 days ago with phone, no re-engagement sent yet
    const { data: orders } = await supabase
      .from("orders")
      .select("id, restaurant_id, customer_phone, customer_name, restaurants(name)")
      .not("customer_phone", "is", null)
      .gte("placed_at", eightDaysAgo)
      .lt("placed_at", sevenDaysAgo)
      .in("status", ["completed", "ready"]);

    if (!orders?.length) {
      return json({ processed: 0, message: "No orders eligible for re-engagement" });
    }

    let sent = 0;
    let skipped = 0;

    for (const order of orders) {
      if (!order.customer_phone) continue;

      // Check if re-engagement already sent for this phone in last 30 days
      const { count } = await supabase
        .from("whatsapp_campaigns")
        .select("id", { count: "exact", head: true })
        .eq("restaurant_id", order.restaurant_id)
        .eq("phone", order.customer_phone)
        .eq("type", "reengagement")
        .gte("created_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

      if (count && count > 0) { skipped++; continue; }

      // Check restaurant-specific override
      const { data: override } = await supabase
        .from("restaurant_features")
        .select("is_enabled")
        .eq("restaurant_id", order.restaurant_id)
        .eq("feature_key", "whatsapp_crm")
        .maybeSingle();

      if (override && !override.is_enabled) { skipped++; continue; }

      // Create a coupon for this re-engagement
      const couponCode = `COMEBACK${discountPct}_${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

      try {
        await supabase.from("coupons").insert({
          restaurant_id: order.restaurant_id,
          code: couponCode,
          discount_type: "percentage",
          discount_value: discountPct,
          max_uses: 1,
          expires_at: expiresAt,
          is_active: true,
          description: `Re-engagement coupon for ${order.customer_phone}`,
        });
      } catch { /* coupon may not be insertable without more fields */ }

      const restaurantName = (order.restaurants as any)?.name || "Restaurant";
      const result = await sendReengagementWhatsApp(
        order.customer_phone,
        restaurantName,
        couponCode,
        discountPct,
        isMocked
      );

      await supabase.from("whatsapp_campaigns").insert({
        restaurant_id: order.restaurant_id,
        order_id: order.id,
        phone: order.customer_phone,
        customer_name: order.customer_name,
        type: "reengagement",
        status: "sent",
        message_id: result.messageId,
        coupon_code: couponCode,
        sent_at: new Date().toISOString(),
        metadata: { mocked: result.mocked },
      });

      sent++;
    }

    return json({ processed: orders.length, sent, skipped });

  } catch (err: any) {
    console.error("whatsapp-reengagement error:", err);
    return json({ error: err.message }, 500);
  }
});
