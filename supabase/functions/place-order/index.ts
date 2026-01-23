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

    // Fetch menu items, variants, and addons
    const itemIds = items.map((i: any) => i.menu_item_id);

    // 1. Fetch Items
    const { data: menuItems, error: menuError } = await supabase
      .from('menu_items')
      .select('id, price_cents, name, is_active')
      .in('id', itemIds);

    if (menuError || !menuItems) {
      return json({ error: "Failed to fetch menu items" }, 500);
    }

    // 2. Fetch Variants for these items
    const { data: allVariants, error: variantError } = await supabase
      .from('menu_item_variants')
      .select('id, menu_item_id, price_cents, name, is_active')
      .in('menu_item_id', itemIds)
      .eq('is_active', true);

    if (variantError) {
      return json({ error: "Failed to fetch variants" }, 500);
    }

    // 3. Fetch Addons for these items
    const { data: allAddons, error: addonError } = await supabase
      .from('menu_item_addons')
      .select('id, menu_item_id, price_cents, name, is_active')
      .in('menu_item_id', itemIds)
      .eq('is_active', true);

    if (addonError) {
      return json({ error: "Failed to fetch addons" }, 500);
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

      // Base Price Logic
      let unitPrice = realItem.price_cents;
      let variantId = null;

      // Handle Variant
      if (item.variant_id) {
        const variant = allVariants?.find(v => v.id === item.variant_id && v.menu_item_id === realItem.id);
        if (!variant) {
          return json({ error: `Invalid variant for ${realItem.name}` }, 400);
        }
        unitPrice = variant.price_cents; // Variant overrides base price
        variantId = variant.id;
      }

      // Handle Addons
      let addonsList = [];
      if (item.addons && Array.isArray(item.addons)) {
        for (const addonReq of item.addons) {
          const addonDb = allAddons?.find(a => a.id === addonReq.id && a.menu_item_id === realItem.id);
          if (!addonDb) {
            return json({ error: `Invalid add-on for ${realItem.name}` }, 400);
          }
          unitPrice += addonDb.price_cents;
          addonsList.push({
            id: addonDb.id,
            name: addonDb.name,
            price_cents: addonDb.price_cents
          });
        }
      }

      const quantity = Number(item.quantity);
      const lineTotal = unitPrice * quantity;

      // Check for arithmetic overflow
      if (lineTotal > Number.MAX_SAFE_INTEGER) {
        return json({ error: "Order value too large" }, 400);
      }

      totalCents += lineTotal;
      orderItemsData.push({
        menu_item_id: realItem.id,
        quantity,
        unit_price_cents: unitPrice,
        line_total_cents: lineTotal,
        name_snapshot: realItem.name,
        variant_id: variantId,
        addons: addonsList.length > 0 ? addonsList : [], // Store as JSONB
        notes: item.notes || null
      });
    }

    // Validate maximum order value
    if (totalCents > MAX_ORDER_VALUE_CENTS) {
      return json({ error: `Order value cannot exceed $${MAX_ORDER_VALUE_CENTS / 100}` }, 400);
    }

    // Coupon Logic
    let couponId = null;
    let couponCode = null;
    let discountCents = 0;
    let discountType = null;

    if (payload.coupon_code) {
      const code = String(payload.coupon_code).trim().toUpperCase();
      const { data: coupon, error: couponError } = await supabase
        .from('coupons')
        .select('*')
        .eq('restaurant_id', restaurant_id)
        .eq('code', code)
        .eq('is_active', true)
        .maybeSingle();

      if (couponError) {
        console.error("Coupon fetch error:", couponError);
      } else if (coupon) {
        // Validate Coupon Constraints
        const now = new Date();
        const expiresAt = coupon.expires_at ? new Date(coupon.expires_at) : null;
        let isValid = true;

        if (expiresAt && expiresAt < now) isValid = false;
        if (coupon.usage_limit !== null && (coupon.usage_count || 0) >= coupon.usage_limit) isValid = false;
        if (coupon.min_order_cents && totalCents < coupon.min_order_cents) isValid = false;

        if (isValid) {
          couponId = coupon.id;
          couponCode = coupon.code;
          discountType = 'coupon';

          if (coupon.discount_type === 'fixed') {
            discountCents = Math.min(coupon.discount_value, totalCents);
          } else if (coupon.discount_type === 'percentage') {
            let d = Math.round((totalCents * coupon.discount_value) / 100);
            if (coupon.max_discount_cents) d = Math.min(d, coupon.max_discount_cents);
            discountCents = d;
          }

          // Apply Discount
          // Note: total_cents in database is the FINAL amount to pay.
          // subtotal_cents should be the amount BEFORE discount.
          // But our current logic set totalCents as the sum of items.
          // Let's adjust variable names for clarity or just update totalCents.

          // Current totalCents IS the subtotal.
        }
      }
    }

    // Final Calculation
    const subtotal = totalCents;
    const finalTotal = Math.max(0, subtotal - discountCents);

    // Generate secure order token for tracking
    const order_token = crypto.randomUUID();

    // Insert Order
    const { data: order, error: insertError } = await supabase
      .from('orders')
      .insert({
        restaurant_id,
        status: 'pending',
        subtotal_cents: subtotal,
        discount_cents: discountCents,
        total_cents: finalTotal,
        coupon_id: couponId,
        coupon_code: couponCode,
        discount_type: discountType,
        currency_code: 'USD',
        ip_address: clientIp,
        table_label: table_label || null,
        order_token: order_token,
        payment_method: 'cash' // Default to cash for now, update later
      })
      .select()
      .single();

    // Increment Coupon Usage (Optimistic)
    if (couponId) {
      await supabase.rpc('increment_coupon_usage', { coupon_id: couponId });
      // Note: If RPC fails or doesn't exist, we might miss a count. 
      // Ideally we create an RPC or just update directly.
      // Since I didn't create an RPC in my plan, I'll do a direct update.
      await supabase
        .from('coupons')
        .update({ usage_count: (await supabase.from('coupons').select('usage_count').eq('id', couponId).single()).data?.usage_count + 1 })
        .eq('id', couponId);
    }

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
