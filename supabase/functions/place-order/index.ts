// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...corsHeaders } });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { status: 200, headers: corsHeaders });

  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    
    // IP Rate Limit
    const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown';
    if (clientIp !== 'unknown') {
      const { count } = await supabase.from('orders').select('*', { count: 'exact', head: true }).eq('ip_address', clientIp).gte('created_at', new Date(Date.now() - 15 * 60 * 1000).toISOString());
      if (count !== null && count >= 15) return json({ error: "Too many orders. Please wait." }, 429);
    }

    const { restaurant_id, items } = await req.json().catch(() => ({}));
    if (!restaurant_id || !items) return json({ error: "Invalid Request" }, 400);

    // Validate Restaurant
    const { data: restaurant } = await supabase.from('restaurants').select('is_accepting_orders').eq('id', restaurant_id).single();
    if (!restaurant || !restaurant.is_accepting_orders) return json({ error: "Restaurant is closed or not found." }, 400);

    // Calc Totals
    const itemIds = items.map((i: any) => i.menu_item_id);
    const { data: menuItems } = await supabase.from('menu_items').select('id, price_cents, name').in('id', itemIds);
    
    let totalCents = 0;
    const orderItemsData = [];
    for (const item of items) {
      const realItem = menuItems?.find((dbItem) => dbItem.id === item.menu_item_id);
      if (!realItem) return json({ error: `Item unavailable: ${item.menu_item_id}` }, 400);
      const lineTotal = realItem.price_cents * item.quantity;
      totalCents += lineTotal;
      orderItemsData.push({ menu_item_id: realItem.id, quantity: item.quantity, unit_price_cents: realItem.price_cents, line_total_cents: lineTotal, name_snapshot: realItem.name });
    }

    // Insert Order
    const { data: order, error: insertError } = await supabase.from('orders').insert({ restaurant_id, status: 'pending', subtotal_cents: totalCents, total_cents: totalCents, currency_code: 'USD', ip_address: clientIp }).select().single();
    if (insertError) throw insertError;

    // Insert Items
    await supabase.from('order_items').insert(orderItemsData.map(i => ({...i, restaurant_id, order_id: order.id})));

    return json(order, 200);
  } catch (error: any) {
    return json({ error: error.message }, 500);
  }
});