import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
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

/**
 * M3 — HMAC-based session token for customer dashboard.
 * Signs the phone + restaurant_id + expiry using the service role key as HMAC secret.
 * The resulting token can be verified server-side without storing state in the DB.
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

async function verifySessionToken(token: string, secret: string): Promise<{ valid: boolean; phone?: string; restaurantId?: string }> {
  try {
    const parts = token.split("|");
    if (parts.length !== 4) return { valid: false };
    const [phone, restaurantId, expiresAt, sigHex] = parts;
    
    // Check expiry
    if (new Date(expiresAt) < new Date()) return { valid: false };
    
    // Verify HMAC
    const payload = `${phone}|${restaurantId}|${expiresAt}`;
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const expectedSig = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(payload)));
    const expectedHex = new TextDecoder().decode(encode(expectedSig));
    
    if (sigHex !== expectedHex) return { valid: false };
    
    return { valid: true, phone, restaurantId };
  } catch {
    return { valid: false };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const body = await req.json();
    const { action, session_token } = body;

    // ---------- ACTION: update_profile ----------
    if (action === "update_profile") {
      const { name, email } = body;
      if (!session_token) return json({ error: "Session token required" }, 401);
      
      const session = await verifySessionToken(session_token, serviceRoleKey);
      if (!session.valid || !session.phone) return json({ error: "Invalid or expired session" }, 401);
      
      const { error } = await supabase
        .from("customer_profiles")
        .update({ name: name || null, email: email || null })
        .eq("phone", session.phone);
      
      if (error) throw error;
      return json({ success: true });
    }

    // ---------- ACTION: update_addresses ----------
    if (action === "update_addresses") {
      const { addresses } = body;
      if (!session_token) return json({ error: "Session token required" }, 401);
      
      const session = await verifySessionToken(session_token, serviceRoleKey);
      if (!session.valid || !session.phone) return json({ error: "Invalid or expired session" }, 401);
      
      const { error } = await supabase
        .from("customer_profiles")
        .update({ saved_addresses: addresses })
        .eq("phone", session.phone);
      
      if (error) throw error;
      return json({ success: true });
    }

    // ---------- ACTION: get_dashboard ----------
    // Returns profile, orders, and loyalty data in one call (avoids anon RLS issues)
    if (action === "get_dashboard") {
      const { restaurant_id } = body;
      if (!session_token) return json({ error: "Session token required" }, 401);
      
      const session = await verifySessionToken(session_token, serviceRoleKey);
      if (!session.valid || !session.phone) return json({ error: "Invalid or expired session" }, 401);
      if (restaurant_id && session.restaurantId !== restaurant_id) {
        return json({ error: "Session does not match restaurant" }, 403);
      }
      
      // Fetch profile
      const { data: profile } = await supabase
        .from("customer_profiles")
        .select("id, phone, name, email, saved_addresses")
        .eq("phone", session.phone)
        .maybeSingle();
      
      // Fetch orders (scoped to restaurant)
      const { data: orders } = await supabase
        .from("orders")
        .select("id, status, total_cents, placed_at, payment_method, order_type, order_token, rating, review_text, order_items(name_snapshot, quantity, line_total_cents, menu_item_id)")
        .eq("customer_phone", session.phone)
        .eq("restaurant_id", session.restaurantId!)
        .order("placed_at", { ascending: false })
        .limit(20);
      
      // Fetch loyalty (scoped to restaurant)
      const { data: loyalty } = await supabase
        .from("loyalty_points")
        .select("points, lifetime_points")
        .eq("customer_phone", session.phone)
        .eq("restaurant_id", session.restaurantId!)
        .maybeSingle();
      
      return json({ profile, orders: orders || [], loyalty });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (err) {
    console.error("customer-dashboard error:", err);
    return json({ error: (err as Error).message || "Internal error" }, 500);
  }
});
