// AI Features Integration Helpers
// deno-lint-ignore-file no-explicit-any

// ============================================================
// PERSONALIZED GREETING
// ============================================================
export async function getPersonalizedGreeting(
    customerId: string,
    restaurantName: string,
    supabase: any
): Promise<{ greeting: string; hasUsualOrder: boolean; usualOrder: any }> {
    const { data: customer } = await supabase
        .from('whatsapp_customers')
        .select('name, birthday, anniversary')
        .eq('id', customerId)
        .single();

    let greeting = `Welcome to ${restaurantName}! 👋`;

    if (customer?.name) {
        greeting = `Welcome back, ${customer.name}! 👋`;

        // Check birthday
        const { data: isBirthday } = await supabase
            .rpc('is_birthday_today', { p_customer_id: customerId });

        if (isBirthday) {
            greeting += `\n\n🎂 Happy Birthday! Enjoy 20% off today with code: BDAY20`;
        }
    }

    // Check for usual order
    const { data: usualOrder } = await supabase
        .rpc('get_usual_order', { p_customer_id: customerId });

    return {
        greeting,
        hasUsualOrder: !!usualOrder,
        usualOrder
    };
}

// ============================================================
// NLP ORDER PROCESSING
// ============================================================
export async function processNaturalLanguageOrder(
    text: string,
    restaurantId: string,
    aiConfig: any
): Promise<any> {
    if (!aiConfig?.features?.natural_language_ordering) {
        return null;
    }

    const response = await fetch(
        `${Deno.env.get('SUPABASE_URL')}/functions/v1/nlp-parser`,
        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}`
            },
            body: JSON.stringify({ text, restaurant_id: restaurantId })
        }
    );

    return await response.json();
}

// ============================================================
// VOICE MESSAGE PROCESSING
// ============================================================
export async function processVoiceMessage(
    audioUrl: string,
    restaurantId: string,
    aiConfig: any
): Promise<string | null> {
    if (!aiConfig?.features?.voice_messages) {
        return null;
    }

    const response = await fetch(
        `${Deno.env.get('SUPABASE_URL')}/functions/v1/voice-transcriber`,
        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}`
            },
            body: JSON.stringify({ audio_url: audioUrl, restaurant_id: restaurantId })
        }
    );

    const result = await response.json();
    return result.transcription;
}

// ============================================================
// IMAGE RECOGNITION
// ============================================================
export async function processImageMessage(
    imageUrl: string,
    restaurantId: string,
    aiConfig: any
): Promise<any> {
    if (!aiConfig?.features?.image_recognition) {
        return null;
    }

    const response = await fetch(
        `${Deno.env.get('SUPABASE_URL')}/functions/v1/image-recognizer`,
        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}`
            },
            body: JSON.stringify({ image_url: imageUrl, restaurant_id: restaurantId })
        }
    );

    return await response.json();
}

// ============================================================
// PERSONALIZED RECOMMENDATIONS
// ============================================================
export async function getPersonalizedRecommendations(
    customerId: string,
    restaurantId: string,
    supabase: any
): Promise<any[]> {
    // Get order history
    const { data: orders } = await supabase
        .from('orders')
        .select(`
      id,
      order_items (
        menu_item_id,
        quantity,
        menu_items (
          id,
          name,
          category_id
        )
      )
    `)
        .eq('customer_id', customerId)
        .eq('restaurant_id', restaurantId)
        .order('created_at', { ascending: false })
        .limit(10);

    if (!orders || orders.length === 0) {
        return [];
    }

    // Analyze frequency
    const itemFrequency: Record<string, number> = {};
    const categoryFrequency: Record<string, number> = {};

    for (const order of orders) {
        for (const item of order.order_items) {
            const menuItem = item.menu_items;
            itemFrequency[menuItem.id] = (itemFrequency[menuItem.id] || 0) + item.quantity;
            if (menuItem.category_id) {
                categoryFrequency[menuItem.category_id] = (categoryFrequency[menuItem.category_id] || 0) + 1;
            }
        }
    }

    // Get most frequent category
    const topCategory = Object.entries(categoryFrequency)
        .sort(([, a], [, b]) => b - a)[0]?.[0];

    if (!topCategory) {
        return [];
    }

    // Get similar items from top category
    const { data: recommendations } = await supabase
        .from('menu_items')
        .select('id, name, description, price_cents, image_url')
        .eq('restaurant_id', restaurantId)
        .eq('category_id', topCategory)
        .eq('is_available', true)
        .limit(3);

    return recommendations || [];
}

// ============================================================
// QUEUE NOTIFICATION
// ============================================================
export async function queueOrderStatusNotification(
    orderId: string,
    status: string,
    supabase: any
): Promise<void> {
    const { data: order } = await supabase
        .from('orders')
        .select('customer_id, restaurant_id')
        .eq('id', orderId)
        .single();

    if (!order) return;

    const statusMessages: Record<string, string> = {
        'confirmed': '✅ Your order is confirmed and being prepared!',
        'preparing': '👨‍🍳 Your order is being prepared...',
        'ready': '🎉 Your order is ready for pickup/delivery!',
        'out_for_delivery': '🚗 Your order is on the way!',
        'delivered': '✅ Order delivered! Enjoy your meal! 🍽️'
    };

    const message = statusMessages[status] || `Order status updated to: ${status}`;

    await supabase.rpc('queue_notification', {
        p_restaurant_id: order.restaurant_id,
        p_customer_id: order.customer_id,
        p_notification_type: 'order_status',
        p_message: message,
        p_scheduled_for: new Date().toISOString(),
        p_order_id: orderId
    });
}

// ============================================================
// UPDATE CUSTOMER PREFERENCES
// ============================================================
export async function updateUsualOrder(
    customerId: string,
    cartItems: any[],
    supabase: any
): Promise<void> {
    // Check if this order pattern exists
    const { data: existing } = await supabase
        .from('customer_preferences')
        .select('id, frequency')
        .eq('customer_id', customerId)
        .eq('preference_type', 'usual_order')
        .single();

    if (existing) {
        // Update frequency
        await supabase
            .from('customer_preferences')
            .update({
                frequency: existing.frequency + 1,
                last_used_at: new Date().toISOString()
            })
            .eq('id', existing.id);
    } else {
        // Create new preference
        await supabase
            .from('customer_preferences')
            .insert({
                customer_id: customerId,
                preference_type: 'usual_order',
                preference_data: { items: cartItems },
                frequency: 1
            });
    }
}
