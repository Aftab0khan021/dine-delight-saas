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

/** Send a WhatsApp message via Meta Cloud API (or mock if no creds) */
async function sendWhatsAppMessage(phone: string, template: string, params: Record<string, string>) {
  const token = Deno.env.get("WHATSAPP_TOKEN");
  const phoneId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID");

  if (!token || !phoneId) {
    // Mock mode: log the message and return a fake success
    console.log(`[WhatsApp MOCK] To: ${phone}, Template: ${template}, Params:`, params);
    return { messageId: `mock_${crypto.randomUUID()}`, mocked: true };
  }

  const body = {
    messaging_product: "whatsapp",
    to: phone.replace(/\s+/g, ""),
    type: "template",
    template: {
      name: template,
      language: { code: "en" },
      components: [{
        type: "body",
        parameters: Object.values(params).map(value => ({ type: "text", text: value }))
      }]
    }
  };

  const resp = await fetch(
    `https://graph.facebook.com/v18.0/${phoneId}/messages`,
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }
  );

  const data = await resp.json();
  if (!resp.ok) {
    throw new Error(data.error?.message || "WhatsApp API error");
  }

  return { messageId: data.messages?.[0]?.id, mocked: false };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { status: 200, headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const payload = await req.json();
    const { order_id, restaurant_id, phone, customer_name, items_summary, total, currency } = payload;

    // Check if the whatsapp_crm feature flag is enabled for this restaurant
    const { data: flag } = await supabase
      .from("feature_flags")
      .select("is_enabled")
      .eq("key", "whatsapp_crm")
      .maybeSingle();

    // Check restaurant-specific override
    const { data: override } = await supabase
      .from("restaurant_features")
      .select("is_enabled")
      .eq("restaurant_id", restaurant_id)
      .eq("feature_key", "whatsapp_crm")
      .maybeSingle();

    const isEnabled = override ? override.is_enabled : (flag?.is_enabled ?? false);
    if (!isEnabled) {
      return json({ skipped: true, reason: "whatsapp_crm feature disabled" });
    }

    // Create campaign record
    const { data: campaign, error: campErr } = await supabase
      .from("whatsapp_campaigns")
      .insert({
        restaurant_id,
        order_id,
        phone,
        customer_name,
        type: "receipt",
        status: "queued",
      })
      .select()
      .single();

    if (campErr) throw campErr;

    // Send message
    const result = await sendWhatsAppMessage(phone, "order_receipt", {
      name: customer_name || "Customer",
      order_id: order_id.slice(0, 8).toUpperCase(),
      total: `${currency || "USD"} ${(total / 100).toFixed(2)}`,
      items: items_summary || "Your items",
    });

    // Update campaign status
    await supabase
      .from("whatsapp_campaigns")
      .update({
        status: "sent",
        message_id: result.messageId,
        sent_at: new Date().toISOString(),
        metadata: { mocked: result.mocked },
      })
      .eq("id", campaign.id);

    return json({ success: true, campaign_id: campaign.id, mocked: result.mocked });

  } catch (err: any) {
    console.error("send-whatsapp error:", err);

    // Try to mark campaign as failed
    try {
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      );
      const payload = await req.clone().json().catch(() => ({}));
      if (payload.order_id) {
        await supabase
          .from("whatsapp_campaigns")
          .update({ status: "failed", error_message: err.message })
          .eq("order_id", payload.order_id)
          .eq("type", "receipt");
      }
    } catch { /* ignore */ }

    return json({ error: err.message }, 500);
  }
});
