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

    const { restaurant_id, items, table_label, turnstileToken } = payload;

    // Detect environment based on Origin or Referer header
    const origin = req.headers.get('origin') || req.headers.get('referer') || '';
    const isProduction = origin.includes('yourdomain.com'); // Replace with your actual production domain

    // Use environment-specific secret key
    const turnstileSecret = isProduction
      ? Deno.env.get('TURNSTILE_SECRET_KEY_PROD')
      : Deno.env.get('TURNSTILE_SECRET_KEY_DEV') || '1x0000000000000000000000000000000AA';

    if (!turnstileSecret) {
      console.error("Missing Turnstile secret key for environment:", { isProduction, origin });
      return json({ error: "Server configuration error" }, 500);
    }

    if (!turnstileToken) {
      return json({ error: "Security check failed: Missing Turnstile token" }, 400);
    }

    const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim();
    const formData = new FormData();
    formData.append('secret', turnstileSecret);
    formData.append('response', turnstileToken);
    if (ip) formData.append('remoteip', ip);

    const turnstileResult = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: formData,
    });

    const turnstileOutcome = await turnstileResult.json();
    if (!turnstileOutcome.success) {
      console.error("Turnstile verification failed:", turnstileOutcome);
      return json({ error: "Security check failed. Please try again." }, 400);
    }

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
      const addonsList = [];
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

    // Coupon Logic (RPC Atomic Check-and-Increment)
    let couponId = null;
    let couponCode = null;
    let discountCents = 0;
    let discountType = null;

    if (payload.coupon_code) {
      const code = String(payload.coupon_code).trim().toUpperCase();

      // Use RPC to atomically validate and increment usage
      const { data: result, error: rpcError } = await supabase.rpc('redeem_coupon', {
        p_coupon_code: code,
        p_restaurant_id: restaurant_id,
        p_order_total_cents: totalCents
      });

      if (rpcError) {
        console.error("Coupon RPC error:", rpcError);
      } else if (result && result.valid) {
        couponId = result.coupon_id;
        couponCode = result.coupon_code;
        discountCents = result.discount_cents;
        discountType = result.discount_type;
        // Note: Usage count is already incremented in the DB by the RPC
      } else {
        console.warn("Invalid coupon:", result?.error);
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

    // Coupon usage already incremented by RPC above.

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
