import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { encode } from "https://deno.land/std@0.168.0/encoding/hex.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * M3 — Create an HMAC-signed session token for the customer dashboard.
 * This replaces the unsigned { phone, expires_at } JSON that was previously
 * stored in localStorage, which was trivially forgeable via XSS.
 */
async function createSessionToken(phone: string, restaurantId: string, secret: string): Promise<{ token: string; expires_at: string }> {
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
  const payload = `${phone}|${restaurantId}|${expiresAt.toISOString()}`;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(payload)));
  const sigHex = new TextDecoder().decode(encode(sig));
  return { token: `${payload}|${sigHex}`, expires_at: expiresAt.toISOString() };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { phone, otp_code, restaurant_id } = await req.json();
    if (!phone || !otp_code || !restaurant_id) throw new Error("phone, otp_code, restaurant_id required");

    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      serviceRoleKey
    );

    // Find matching unexpired OTP
    const { data: otpRecord } = await supabase
      .from("otp_verifications")
      .select("id, expires_at, verified")
      .eq("phone", phone)
      .eq("otp_code", otp_code)
      .eq("restaurant_id", restaurant_id)
      .eq("verified", false)
      .gte("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!otpRecord) {
      return new Response(JSON.stringify({ verified: false, error: "Invalid or expired OTP" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Mark as verified
    await supabase
      .from("otp_verifications")
      .update({ verified: true })
      .eq("id", otpRecord.id);

    // Upsert customer profile
    await supabase
      .from("customer_profiles")
      .upsert({ phone }, { onConflict: "phone" });

    // M3 — Generate a signed session token instead of returning raw phone + expires_at
    const { token, expires_at } = await createSessionToken(phone, restaurant_id, serviceRoleKey);

    return new Response(JSON.stringify({ verified: true, session_token: token, expires_at }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
