// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders }
  });
}

// Validation constants
const MAX_ITEMS_PER_ORDER = 50;
const MAX_QUANTITY_PER_ITEM = 100;
const MIN_QUANTITY_PER_ITEM = 1;
const MAX_ORDER_VALUE_CENTS = 1000000; // $10,000
const MAX_TOTAL_ITEMS = 500; // Sum of all quantities

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { status: 200, headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error("Server misconfigured");
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // IP Rate Limit
    const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown';
    if (clientIp !== 'unknown') {
      const { count } = await supabase
        .from('orders')
        .select('*', { count: 'exact', head: true })
        .eq('ip_address', clientIp)
        .gte('created_at', new Date(Date.now() - 15 * 60 * 1000).toISOString());

      if (count !== null && count >= 15) {
        console.warn(`Rate limit exceeded for IP: ${clientIp}`);
        return json({ error: "Too many orders. Please wait." }, 429);
      }
    }

    // Parse and validate request
    let payload;
    try {
      payload = await req.json();
    } catch {
      return json({ error: "Invalid JSON" }, 400);
    }

    const { restaurant_id, items, table_label } = payload;

    // Validate required fields
    if (!restaurant_id || !items) {
      return json({ error: "Missing required fields: restaurant_id and items" }, 400);
    }

    // Validate table_label length if present
    if (table_label && typeof table_label === 'string' && table_label.length > 20) {
      return json({ error: "Table label is too long (max 20 chars)" }, 400);
    }

    // Validate items array
    if (!Array.isArray(items)) {
      return json({ error: "Items must be an array" }, 400);
    }

    if (items.length === 0) {
      return json({ error: "Order must contain at least one item" }, 400);
    }

    if (items.length > MAX_ITEMS_PER_ORDER) {
      return json({ error: `Order cannot contain more than ${MAX_ITEMS_PER_ORDER} different items` }, 400);
    }

    // Validate each item and calculate total quantity
    let totalQuantity = 0;
    for (const item of items) {
      if (!item.menu_item_id || !item.quantity) {
        return json({ error: "Each item must have menu_item_id and quantity" }, 400);
      }

      const quantity = Number(item.quantity);

      if (!Number.isInteger(quantity) || quantity < MIN_QUANTITY_PER_ITEM) {
        return json({ error: `Quantity must be a positive integer (minimum ${MIN_QUANTITY_PER_ITEM})` }, 400);
      }

      if (quantity > MAX_QUANTITY_PER_ITEM) {
        return json({ error: `Quantity cannot exceed ${MAX_QUANTITY_PER_ITEM} per item` }, 400);
      }

      totalQuantity += quantity;
    }

    // Check total items across all line items
    if (totalQuantity > MAX_TOTAL_ITEMS) {
      return json({ error: `Total items in order cannot exceed ${MAX_TOTAL_ITEMS}` }, 400);
    }

    // Validate Restaurant
    const { data: restaurant, error: restaurantError } = await supabase
      .from('restaurants')
      .select('is_accepting_orders')
      .eq('id', restaurant_id)
      .single();

    if (restaurantError || !restaurant) {
      return json({ error: "Restaurant not found" }, 404);
    }

    if (!restaurant.is_accepting_orders) {
      return json({ error: "Restaurant is not accepting orders at this time" }, 400);
    }

    // Fetch menu items and calculate totals
    const itemIds = items.map((i: any) => i.menu_item_id);
    const { data: menuItems, error: menuError } = await supabase
      .from('menu_items')
      .select('id, price_cents, name, is_active')
      .in('id', itemIds);

    if (menuError) {
      console.error("Menu items fetch error:", menuError);
      return json({ error: "Failed to fetch menu items" }, 500);
    }

    if (!menuItems || menuItems.length === 0) {
      return json({ error: "No valid menu items found" }, 400);
    }

    let totalCents = 0;
    const orderItemsData = [];

    for (const item of items) {
      const realItem = menuItems.find((dbItem) => dbItem.id === item.menu_item_id);

      if (!realItem) {
        return json({ error: `Menu item not found: ${item.menu_item_id}` }, 400);
      }

      if (realItem.is_active === false) {
        return json({ error: `Item unavailable: ${realItem.name}` }, 400);
      }

      const quantity = Number(item.quantity);
      const lineTotal = realItem.price_cents * quantity;

      // Check for arithmetic overflow
      if (lineTotal > Number.MAX_SAFE_INTEGER) {
        return json({ error: "Order value too large" }, 400);
      }

      totalCents += lineTotal;
      orderItemsData.push({
        menu_item_id: realItem.id,
        quantity,
        unit_price_cents: realItem.price_cents,
        line_total_cents: lineTotal,
        name_snapshot: realItem.name
      });
    }

    // Validate maximum order value
    if (totalCents > MAX_ORDER_VALUE_CENTS) {
      return json({ error: `Order value cannot exceed $${MAX_ORDER_VALUE_CENTS / 100}` }, 400);
    }

    // Generate secure order token for tracking
    const order_token = crypto.randomUUID();

    // Insert Order
    const { data: order, error: insertError } = await supabase
      .from('orders')
      .insert({
        restaurant_id,
        status: 'pending',
        subtotal_cents: totalCents,
        total_cents: totalCents,
        currency_code: 'USD',
        ip_address: clientIp,
        table_label: table_label || null,
        order_token: order_token
      })
      .select()
      .single();

    if (insertError) {
      console.error("Order insert error:", insertError);
      throw insertError;
    }

    // Insert Items
    const { error: itemsError } = await supabase
      .from('order_items')
      .insert(orderItemsData.map(i => ({ ...i, restaurant_id, order_id: order.id })));

    if (itemsError) {
      console.error("Order items insert error:", itemsError);
      // Attempt to delete the order if items insert failed
      await supabase.from('orders').delete().eq('id', order.id);
      throw new Error("Failed to create order items");
    }

    console.log(`Order created successfully: ${order.id}, Total: $${totalCents / 100}`);
    return json(order, 200);

  } catch (error: any) {
    console.error("Place order error:", error);
    return json({ error: error.message || "Internal server error" }, 500);
  }
});
