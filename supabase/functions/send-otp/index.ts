import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { phone, restaurant_id } = await req.json();
    if (!phone || !restaurant_id) throw new Error("phone and restaurant_id required");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Get restaurant OTP config
    const { data: restaurant } = await supabase
      .from("restaurants")
      .select("settings")
      .eq("id", restaurant_id)
      .single();

    const settings = restaurant?.settings as any;
    const otpConfig = settings?.otp_config;
    if (!otpConfig?.enabled) {
      return new Response(JSON.stringify({ error: "OTP not enabled for this restaurant" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Generate 6-digit OTP
    const otp = String(Math.floor(100000 + Math.random() * 900000));
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString(); // 5 min

    // Store OTP
    await supabase.from("otp_verifications").insert({
      phone,
      otp_code: otp,
      restaurant_id,
      channel: otpConfig.channel || "sms",
      expires_at: expiresAt,
    });

    // Send via configured channel
    const channel = otpConfig.channel || "sms";

    if (channel === "sms" || channel === "both") {
      if (otpConfig.sms_provider === "msg91") {
        // MSG91 API
        const apiKey = otpConfig.sms_api_key;
        if (apiKey) {
          await fetch("https://api.msg91.com/api/v5/flow/", {
            method: "POST",
            headers: { "authkey": apiKey, "Content-Type": "application/json" },
            body: JSON.stringify({
              flow_id: otpConfig.sms_flow_id || "",
              sender: otpConfig.sms_sender_id || "DINEDL",
              mobiles: phone.replace(/[^0-9]/g, ""),
              otp: otp,
            }),
          });
        }
      } else if (otpConfig.sms_provider === "twilio") {
        // Twilio SMS
        const sid = otpConfig.sms_account_sid;
        const token = otpConfig.sms_auth_token;
        const from = otpConfig.sms_from_number;
        if (sid && token && from) {
          await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
            method: "POST",
            headers: {
              "Authorization": `Basic ${btoa(`${sid}:${token}`)}`,
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams({
              To: phone,
              From: from,
              Body: `Your OTP is ${otp}. Valid for 5 minutes.`,
            }),
          });
        }
      }
    }

    if (channel === "whatsapp" || channel === "both") {
      if (otpConfig.whatsapp_provider === "meta") {
        const waKey = otpConfig.whatsapp_api_key;
        const phoneId = otpConfig.whatsapp_phone_number_id;
        if (waKey && phoneId) {
          await fetch(`https://graph.facebook.com/v17.0/${phoneId}/messages`, {
            method: "POST",
            headers: { "Authorization": `Bearer ${waKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              messaging_product: "whatsapp",
              to: phone.replace(/[^0-9]/g, ""),
              type: "template",
              template: {
                name: "otp_verification",
                language: { code: "en" },
                components: [{ type: "body", parameters: [{ type: "text", text: otp }] }],
              },
            }),
          });
        }
      }
    }

    return new Response(JSON.stringify({ success: true, message: "OTP sent" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
