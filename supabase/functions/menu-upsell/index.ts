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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { status: 200, headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const url = new URL(req.url);
    const item_id = url.searchParams.get("item_id");
    const restaurant_id = url.searchParams.get("restaurant_id");

    if (!item_id || !restaurant_id) {
      return json({ error: "item_id and restaurant_id required" }, 400);
    }

    // Check feature flag
    const { data: flag } = await supabase
      .from("feature_flags")
      .select("is_enabled, config")
      .eq("key", "menu_upsell_suggestions")
      .maybeSingle();

    const { data: override } = await supabase
      .from("restaurant_features")
      .select("is_enabled")
      .eq("restaurant_id", restaurant_id)
      .eq("feature_key", "menu_upsell_suggestions")
      .maybeSingle();

    const isEnabled = override ? override.is_enabled : (flag?.is_enabled ?? true);
    if (!isEnabled) return json({ suggestions: [] });

    const maxSuggestions = flag?.config?.max_suggestions ?? 3;
    const minCoOrders = flag?.config?.min_co_orders ?? 2;

    // Find items frequently ordered WITH this item (either as item_a or item_b)
    const { data: pairsA } = await supabase
      .from("order_item_pairs")
      .select("item_b_id, co_order_count")
      .eq("restaurant_id", restaurant_id)
      .eq("item_a_id", item_id)
      .gte("co_order_count", minCoOrders)
      .order("co_order_count", { ascending: false })
      .limit(maxSuggestions);

    const { data: pairsB } = await supabase
      .from("order_item_pairs")
      .select("item_a_id, co_order_count")
      .eq("restaurant_id", restaurant_id)
      .eq("item_b_id", item_id)
      .gte("co_order_count", minCoOrders)
      .order("co_order_count", { ascending: false })
      .limit(maxSuggestions);

    // Merge and sort by co_order_count
    const candidates: { id: string; count: number }[] = [
      ...(pairsA ?? []).map((p: any) => ({ id: p.item_b_id, count: p.co_order_count })),
      ...(pairsB ?? []).map((p: any) => ({ id: p.item_a_id, count: p.co_order_count })),
    ].sort((a, b) => b.count - a.count).slice(0, maxSuggestions);

    if (!candidates.length) return json({ suggestions: [] });

    // Fetch full item details
    const { data: items } = await supabase
      .from("menu_items")
      .select("id, name, description, price_cents, image_url, category_id")
      .in("id", candidates.map(c => c.id))
      .eq("is_active", true);

    // Merge count info and maintain rank order
    const suggestions = candidates
      .map(c => ({
        ...items?.find((i: any) => i.id === c.id),
        co_order_count: c.count,
      }))
      .filter((s: any) => s.id);

    return json({ suggestions });

  } catch (err: any) {
    console.error("menu-upsell error:", err);
    return json({ error: err.message }, 500);
  }
});
