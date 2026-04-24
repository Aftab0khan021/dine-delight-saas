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

type WeatherCtx = { isRainy: boolean; isCold: boolean; isHot: boolean };
type TimeCtx = { isLunch: boolean; isDinner: boolean; isBreakfast: boolean; isLateNight: boolean };

async function getWeatherContext(lat: number, lng: number): Promise<WeatherCtx> {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=precipitation,temperature_2m,weather_code&timezone=auto`;
    const resp = await fetch(url, { signal: AbortSignal.timeout(3000) });
    if (!resp.ok) throw new Error("Weather API error");
    const data = await resp.json();
    const precip = data.current?.precipitation ?? 0;
    const temp = data.current?.temperature_2m ?? 25;
    const code = data.current?.weather_code ?? 0;
    return {
      isRainy: precip > 0.5 || [51, 53, 55, 61, 63, 65, 80, 81, 82, 85, 86, 95, 96, 99].includes(code),
      isCold: temp < 15,
      isHot: temp > 32,
    };
  } catch {
    return { isRainy: false, isCold: false, isHot: false };
  }
}

function getTimeContext(timezone?: string): TimeCtx {
  const now = new Date();
  let hour = now.getHours();
  if (timezone) {
    try {
      hour = parseInt(new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: false, timeZone: timezone }).format(now));
    } catch { /* use UTC */ }
  }
  return {
    isBreakfast: hour >= 6 && hour < 11,
    isLunch: hour >= 11 && hour < 15,
    isDinner: hour >= 17 && hour < 22,
    isLateNight: hour >= 22 || hour < 6,
  };
}

function computeTagBoost(tags: string[], weather: WeatherCtx, time: TimeCtx): number {
  let boost = 0;
  const t = (tags || []).map(x => x.toLowerCase());

  if (weather.isRainy || weather.isCold) {
    if (t.some(x => ["hot", "comfort", "soup", "warm", "spicy"].includes(x))) boost += 2;
  }
  if (weather.isHot) {
    if (t.some(x => ["cold", "refreshing", "salad", "light", "drink"].includes(x))) boost += 1;
  }
  if (time.isBreakfast) {
    if (t.some(x => ["breakfast", "light", "quick"].includes(x))) boost += 1;
  }
  if (time.isLunch) {
    if (t.some(x => ["quick", "light", "lunch"].includes(x))) boost += 1;
  }
  if (time.isDinner) {
    if (t.some(x => ["dinner", "heavy", "comfort", "family"].includes(x))) boost += 1;
  }
  if (time.isLateNight) {
    if (t.some(x => ["quick", "snack", "light"].includes(x))) boost += 1;
  }
  return boost;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { status: 200, headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const url = new URL(req.url);
    const restaurant_id = url.searchParams.get("restaurant_id");
    if (!restaurant_id) return json({ error: "restaurant_id required" }, 400);

    // Check feature flag
    const { data: flag } = await supabase
      .from("feature_flags")
      .select("is_enabled, config")
      .eq("key", "smart_menu_ranking")
      .maybeSingle();

    const { data: override } = await supabase
      .from("restaurant_features")
      .select("is_enabled")
      .eq("restaurant_id", restaurant_id)
      .eq("feature_key", "smart_menu_ranking")
      .maybeSingle();

    const isEnabled = override ? override.is_enabled : (flag?.is_enabled ?? true);
    if (!isEnabled) return json({ ranked_ids: null, reason: "feature_disabled" });

    // Fetch restaurant location
    const { data: restaurant } = await supabase
      .from("restaurants")
      .select("latitude, longitude, id")
      .eq("id", restaurant_id)
      .single();

    // Get contexts
    const [weather, popularity] = await Promise.all([
      restaurant?.latitude && restaurant?.longitude
        ? getWeatherContext(restaurant.latitude, restaurant.longitude)
        : Promise.resolve({ isRainy: false, isCold: false, isHot: false }),
      supabase
        .from("menu_item_popularity")
        .select("menu_item_id, order_count_7d, total_qty_7d")
        .eq("restaurant_id", restaurant_id)
        .then(({ data }) => data ?? [])
    ]);

    const time = getTimeContext();

    // Build popularity map
    const popularityMap: Record<string, number> = {};
    const maxPop = Math.max(1, ...popularity.map((p: any) => p.order_count_7d ?? 0));
    for (const p of popularity as any[]) {
      popularityMap[p.menu_item_id] = (p.order_count_7d ?? 0) / maxPop * 10; // normalize 0-10
    }

    // Fetch all active items with tags
    const { data: items } = await supabase
      .from("menu_items")
      .select("id, tags, sort_order")
      .eq("restaurant_id", restaurant_id)
      .eq("is_active", true);

    if (!items?.length) return json({ ranked_ids: null, reason: "no_items" });

    const config = flag?.config ?? {};
    const weatherW = config.weather_boost_weight ?? 0.3;
    const popularityW = config.popularity_weight ?? 0.5;
    const timeW = config.time_weight ?? 0.2;

    // Score each item
    const scored = items.map((item: any) => {
      const tagBoost = computeTagBoost(item.tags ?? [], weather, time);
      const popScore = popularityMap[item.id] ?? 0;
      const score =
        tagBoost * (weatherW + timeW) * 5 +
        popScore * popularityW +
        (Math.random() * 0.1); // tiny noise to avoid flat ties
      return { id: item.id, score, sort_order: item.sort_order };
    });

    scored.sort((a, b) => b.score - a.score || a.sort_order - b.sort_order);

    const ranked_ids = scored.map(s => s.id);
    const popular_ids = scored.filter(s => s.score > 5).slice(0, 5).map(s => s.id);

    return json({ ranked_ids, popular_ids, weather, time });

  } catch (err: any) {
    console.error("smart-menu-rank error:", err);
    return json({ error: err.message }, 500);
  }
});
