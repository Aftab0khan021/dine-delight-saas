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

async function validateApiKey(supabase: any, rawKey: string): Promise<{ restaurant_id: string; scopes: string[] } | null> {
  if (!rawKey) return null;
  // Hash the key for comparison
  const encoded = new TextEncoder().encode(rawKey);
  const hashBuffer = await crypto.subtle.digest("SHA-256", encoded);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const keyHash = hashArray.map(b => b.toString(16).padStart(2, "0")).join("");

  const { data: apiKey } = await supabase
    .from("api_keys")
    .select("restaurant_id, scopes, is_active, expires_at")
    .eq("key_hash", keyHash)
    .maybeSingle();

  if (!apiKey || !apiKey.is_active) return null;
  if (apiKey.expires_at && new Date(apiKey.expires_at) < new Date()) return null;

  // Update last_used_at async
  supabase.from("api_keys").update({ last_used_at: new Date().toISOString() })
    .eq("key_hash", keyHash).then(() => {});

  return { restaurant_id: apiKey.restaurant_id, scopes: apiKey.scopes };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { status: 200, headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Check headless_api feature flag
    const { data: flag } = await supabase
      .from("feature_flags")
      .select("is_enabled")
      .eq("key", "headless_api")
      .maybeSingle();

    if (!flag?.is_enabled) {
      return json({ error: "Headless API is not enabled on this platform" }, 403);
    }

    // Validate API key
    const rawKey = req.headers.get("x-api-key") || new URL(req.url).searchParams.get("api_key") || "";
    const auth = await validateApiKey(supabase, rawKey);
    if (!auth) return json({ error: "Invalid or missing API key" }, 401);
    if (!auth.scopes.includes("menu:read")) return json({ error: "Insufficient scope: menu:read required" }, 403);

    // Rate limit: simple check (100 req/min per restaurant)
    const windowStart = new Date(Date.now() - 60_000).toISOString();
    // (In production, use Upstash Redis; here we skip for simplicity)

    // Fetch full menu
    const { data: restaurant } = await supabase
      .from("restaurants")
      .select("id, name, slug, description, logo_url, cover_url, currency_code, is_accepting_orders")
      .eq("id", auth.restaurant_id)
      .single();

    const { data: categories } = await supabase
      .from("categories")
      .select("id, name, description, sort_order")
      .eq("restaurant_id", auth.restaurant_id)
      .eq("is_active", true)
      .order("sort_order");

    const { data: items } = await supabase
      .from("menu_items")
      .select(`
        id, name, description, price_cents, currency_code, image_url,
        category_id, sort_order, tags,
        menu_item_variants(id, name, price_cents, is_active),
        menu_item_addons(id, name, price_cents, is_active)
      `)
      .eq("restaurant_id", auth.restaurant_id)
      .eq("is_active", true)
      .order("sort_order");

    // Group items into categories
    const categorizedMenu = (categories ?? []).map((cat: any) => ({
      ...cat,
      items: (items ?? [])
        .filter((item: any) => item.category_id === cat.id)
        .map((item: any) => ({
          ...item,
          variants: item.menu_item_variants?.filter((v: any) => v.is_active) ?? [],
          addons: item.menu_item_addons?.filter((a: any) => a.is_active) ?? [],
          menu_item_variants: undefined,
          menu_item_addons: undefined,
        }))
    }));

    return json({
      restaurant,
      menu: categorizedMenu,
      generated_at: new Date().toISOString(),
    });

  } catch (err: any) {
    console.error("api-menu error:", err);
    return json({ error: err.message }, 500);
  }
});
