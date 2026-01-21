import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS (Browser pre-flight checks)
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // 1. Get User IP (Restored)
    const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown'

    // 2. RATE LIMIT CHECK: Count orders from this IP in last 15 minutes (Restored)
    if (clientIp !== 'unknown') {
      const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString()
      
      const { count, error: countError } = await supabase
        .from('orders')
        .select('*', { count: 'exact', head: true })
        .eq('ip_address', clientIp)
        .gte('created_at', fifteenMinutesAgo)

      if (countError) console.error('Rate limit check failed', countError)

      // LIMIT: 5 orders per 15 mins
      if (count !== null && count >= 5) {
        return new Response(
          JSON.stringify({ error: "Too many orders. Please wait a few minutes." }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    }

    // 3. Parse Request
    const { restaurant_id, items } = await req.json()

    // 4. CHECK IF RESTAURANT IS OPEN
    const { data: restaurant, error: restaurantError } = await supabase
      .from('restaurants')
      .select('is_accepting_orders')
      .eq('id', restaurant_id)
      .single()

    if (restaurantError || !restaurant) {
      return new Response(
        JSON.stringify({ error: "Restaurant not found" }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (restaurant.is_accepting_orders === false) {
      return new Response(
        JSON.stringify({ error: "Restaurant is currently closed." }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 5. Fetch Real Prices (Security Step)
    const itemIds = items.map((i: any) => i.menu_item_id)
    const { data: menuItems } = await supabase
      .from('menu_items')
      .select('id, price_cents, name')
      .in('id', itemIds)
      .is('deleted_at', null) 

    let totalCents = 0
    const orderItemsData = []

    for (const item of items) {
      const realItem = menuItems?.find((dbItem) => dbItem.id === item.menu_item_id)
      if (!realItem) {
        return new Response(
          JSON.stringify({ error: `Item not available: ${item.menu_item_id}` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      const lineTotal = realItem.price_cents * item.quantity
      totalCents += lineTotal

      orderItemsData.push({
        menu_item_id: realItem.id,
        quantity: item.quantity,
        unit_price_cents: realItem.price_cents,
        line_total_cents: lineTotal,
        name_snapshot: realItem.name
      })
    }

    // 6. Insert Order (With IP Address)
    const { data: order, error: insertError } = await supabase
      .from('orders')
      .insert({
        restaurant_id,
        status: 'pending',
        subtotal_cents: totalCents,
        total_cents: totalCents,
        currency_code: 'USD',
        ip_address: clientIp // <-- This will work now if you ran Step 1
      })
      .select()
      .single()

    if (insertError) throw insertError

    // 7. Insert Items
    const itemsWithOrderId = orderItemsData.map(i => ({...i, restaurant_id, order_id: order.id}))
    const { error: itemsError } = await supabase.from('order_items').insert(itemsWithOrderId)
    
    if (itemsError) throw itemsError

    return new Response(
      JSON.stringify(order),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})