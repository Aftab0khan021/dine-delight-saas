import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const WHATSAPP_API_URL = "https://graph.facebook.com/v18.0";

serve(async (req) => {
    try {
        const url = new URL(req.url);

        // Handle webhook verification (GET request from Meta)
        if (req.method === 'GET') {
            const mode = url.searchParams.get('hub.mode');
            const token = url.searchParams.get('hub.verify_token');
            const challenge = url.searchParams.get('hub.challenge');

            const VERIFY_TOKEN = Deno.env.get('WHATSAPP_VERIFY_TOKEN') || 'dine-delight-verify-token';

            if (mode === 'subscribe' && token === VERIFY_TOKEN) {
                console.log('Webhook verified successfully');
                return new Response(challenge, { status: 200 });
            }

            return new Response('Forbidden', { status: 403 });
        }

        // Handle incoming messages (POST request)
        if (req.method === 'POST') {
            const body = await req.json();

            // Log the webhook payload
            console.log('Webhook received:', JSON.stringify(body, null, 2));

            // Extract message data
            const entry = body.entry?.[0];
            const changes = entry?.changes?.[0];
            const value = changes?.value;

            if (!value?.messages) {
                return new Response('No messages', { status: 200 });
            }

            const message = value.messages[0];
            const from = message.from; // Phone number
            const messageId = message.id;
            const messageType = message.type;
            const timestamp = message.timestamp;

            // Get message content based on type
            let content = '';
            if (messageType === 'text') {
                content = message.text.body;
            } else if (messageType === 'button') {
                content = message.button.text;
            } else if (messageType === 'interactive') {
                if (message.interactive.type === 'button_reply') {
                    content = message.interactive.button_reply.title;
                } else if (message.interactive.type === 'list_reply') {
                    content = message.interactive.list_reply.title;
                }
            }

            // Get business phone number ID
            const businessPhoneNumberId = value.metadata.phone_number_id;

            // Initialize Supabase client
            const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
            const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
            const supabase = createClient(supabaseUrl, supabaseKey);

            // Find restaurant by business phone number ID
            const { data: restaurant } = await supabase
                .from('restaurants')
                .select('id, name, whatsapp_config')
                .eq('whatsapp_config->>phone_number_id', businessPhoneNumberId)
                .single();

            if (!restaurant) {
                console.error('Restaurant not found for business phone:', businessPhoneNumberId);
                return new Response('Restaurant not found', { status: 404 });
            }

            // Check if WhatsApp is enabled
            if (!restaurant.whatsapp_config?.enabled) {
                console.log('WhatsApp bot is disabled for restaurant:', restaurant.id);
                return new Response('Bot disabled', { status: 200 });
            }

            // Get or create WhatsApp customer
            const { data: customerId } = await supabase
                .rpc('get_or_create_whatsapp_customer', {
                    p_phone_number: `+${from}`,
                    p_restaurant_id: restaurant.id,
                    p_name: value.contacts?.[0]?.profile?.name || null
                });

            // Get or create conversation
            const { data: conversationId } = await supabase
                .rpc('get_or_create_conversation', {
                    p_whatsapp_customer_id: customerId,
                    p_restaurant_id: restaurant.id
                });

            // Save incoming message
            await supabase
                .from('whatsapp_messages')
                .insert({
                    conversation_id: conversationId,
                    direction: 'inbound',
                    message_type: messageType,
                    content: content,
                    whatsapp_message_id: messageId,
                    metadata: { timestamp, from }
                });

            // Update conversation last_message_at
            await supabase
                .from('whatsapp_conversations')
                .update({ last_message_at: new Date().toISOString() })
                .eq('id', conversationId);

            // Process message and generate response
            const response = await processMessage(
                conversationId,
                content,
                messageType,
                supabase,
                restaurant
            );

            // Send WhatsApp reply
            if (response) {
                await sendWhatsAppMessage(
                    from,
                    response,
                    restaurant.whatsapp_config.access_token,
                    businessPhoneNumberId,
                    supabase,
                    conversationId
                );
            }

            return new Response('OK', { status: 200 });
        }

        return new Response('Method not allowed', { status: 405 });

    } catch (error) {
        console.error('Webhook error:', error);
        return new Response('Internal server error', { status: 500 });
    }
});

// Process incoming message and generate response
async function processMessage(
    conversationId: string,
    content: string,
    messageType: string,
    supabase: any,
    restaurant: any
) {
    // Get current conversation state
    const { data: conversation } = await supabase
        .from('whatsapp_conversations')
        .select('state, context, cart')
        .eq('id', conversationId)
        .single();

    if (!conversation) return null;

    const state = conversation.state;
    const context = conversation.context || {};

    // Global commands (work in any state)
    const input = content.toLowerCase().trim();

    if (input === 'help' || input === '?' || input === 'commands') {
        return {
            type: 'text',
            text: {
                body: `📖 Available Commands:\n\n` +
                    `🏠 menu - View main menu\n` +
                    `🛒 cart - View your cart\n` +
                    `📦 track - Track order\n` +
                    `❓ help - Show this message\n` +
                    `🔄 start - Start over\n\n` +
                    `You can also type naturally!`
            }
        };
    }

    if (input === 'menu' || input === 'start') {
        await supabase
            .from('whatsapp_conversations')
            .update({ state: 'browsing_menu' })
            .eq('id', conversationId);

        return await handleMenuBrowsing(conversationId, 'menu', supabase, restaurant);
    }

    if (input === 'cart') {
        await supabase
            .from('whatsapp_conversations')
            .update({ state: 'reviewing_cart' })
            .eq('id', conversationId);

        return await handleCartReview(conversationId, 'view', supabase, restaurant);
    }

    // State machine for conversation flow
    switch (state) {
        case 'greeting':
            return await handleGreeting(conversationId, supabase, restaurant);

        case 'selecting_order_type':
            return await handleOrderTypeSelection(conversationId, content, supabase, restaurant);

        case 'entering_table_number':
            return await handleTableNumberEntry(conversationId, content, context, supabase, restaurant);

        case 'browsing_menu':
            return await handleMenuBrowsing(conversationId, content, supabase, restaurant);

        case 'viewing_category':
            return await handleCategoryView(conversationId, content, context, supabase, restaurant);

        case 'viewing_item':
            return await handleItemView(conversationId, content, context, supabase, restaurant);

        case 'selecting_quantity':
            return await handleQuantitySelection(conversationId, content, context, supabase, restaurant);

        case 'reviewing_cart':
            return await handleCartReview(conversationId, content, supabase, restaurant);

        case 'confirming_order':
            return await handleOrderConfirmation(conversationId, content, supabase, restaurant);

        case 'checkout_address':
            return await handleCheckoutAddress(conversationId, content, supabase, restaurant);

        case 'tracking_order':
            return await handleOrderTracking(conversationId, content, supabase, restaurant);

        default:
            return await handleGreeting(conversationId, supabase, restaurant);
    }
}

// Handle greeting state
async function handleGreeting(conversationId: string, supabase: any, restaurant: any) {
    // Update state to selecting_order_type
    await supabase
        .from('whatsapp_conversations')
        .update({ state: 'selecting_order_type' })
        .eq('id', conversationId);

    const greeting = restaurant.whatsapp_config?.greeting_message ||
        `Welcome to ${restaurant.name}! 👋`;

    return {
        type: 'interactive',
        interactive: {
            type: 'button',
            body: { text: `${greeting}\n\nDining In or Ordering for Delivery/Pickup?` },
            action: {
                buttons: [
                    { type: 'reply', reply: { id: 'dine_in', title: '🍽️ Dine In' } },
                    { type: 'reply', reply: { id: 'delivery', title: '🚗 Delivery' } },
                    { type: 'reply', reply: { id: 'pickup', title: '🏪 Pickup' } }
                ]
            }
        }
    };
}

// Handle order type selection
async function handleOrderTypeSelection(conversationId: string, content: string, supabase: any, restaurant: any) {
    const input = content.toLowerCase().trim();

    // Dine In - Ask for table number
    if (input.includes('dine') || input === '🍽️ dine in') {
        await supabase
            .from('whatsapp_conversations')
            .update({
                state: 'entering_table_number',
                context: { order_type: 'dine_in' }
            })
            .eq('id', conversationId);

        return {
            type: 'text',
            text: { body: '🍽️ Great! Please enter your table number:' }
        };
    }

    // Delivery - Show menu
    if (input.includes('delivery') || input === '🚗 delivery') {
        await supabase
            .from('whatsapp_conversations')
            .update({
                state: 'browsing_menu',
                context: { order_type: 'delivery' }
            })
            .eq('id', conversationId);

        return await handleMenuBrowsing(conversationId, 'menu', supabase, restaurant);
    }

    // Pickup - Show menu
    if (input.includes('pickup') || input === '🏪 pickup') {
        await supabase
            .from('whatsapp_conversations')
            .update({
                state: 'browsing_menu',
                context: { order_type: 'pickup' }
            })
            .eq('id', conversationId);

        return await handleMenuBrowsing(conversationId, 'menu', supabase, restaurant);
    }

    return {
        type: 'text',
        text: { body: '❌ Please select a valid option: Dine In, Delivery, or Pickup.' }
    };
}

// Handle table number entry
async function handleTableNumberEntry(
    conversationId: string,
    content: string,
    context: any,
    supabase: any,
    restaurant: any
) {
    const tableNumber = content.trim();

    // Validate table number (alphanumeric, 1-20 characters)
    if (!tableNumber || tableNumber.length > 20) {
        return {
            type: 'text',
            text: { body: '❌ Please enter a valid table number (1-20 characters).' }
        };
    }

    // Save table number to context and move to menu
    await supabase
        .from('whatsapp_conversations')
        .update({
            state: 'browsing_menu',
            context: {
                ...context,
                order_type: 'dine_in',
                table_number: tableNumber
            }
        })
        .eq('id', conversationId);

    return {
        type: 'text',
        text: {
            body: `✅ Perfect! Table ${tableNumber} confirmed.\n\n` +
                `Let me show you our menu...`
        }
    };
}

// Handle menu browsing
async function handleMenuBrowsing(conversationId: string, content: string, supabase: any, restaurant: any) {
    const input = content.toLowerCase().trim();

    if (input.includes('menu') || input.includes('view') || input === '📋 view menu') {
        // Fetch categories (only those visible in WhatsApp)
        const { data: categories } = await supabase
            .from('categories')
            .select('id, name, description')
            .eq('restaurant_id', restaurant.id)
            .eq('is_active', true)
            .eq('show_in_whatsapp', true)
            .order('sort_order');

        if (!categories || categories.length === 0) {
            return { type: 'text', text: { body: 'Sorry, no menu available at the moment.' } };
        }

        // Update state
        await supabase
            .from('whatsapp_conversations')
            .update({ state: 'viewing_category' })
            .eq('id', conversationId);

        // Create interactive list
        const rows = categories.slice(0, 10).map((cat, idx) => ({
            id: cat.id,
            title: cat.name,
            description: cat.description?.substring(0, 72) || ''
        }));

        return {
            type: 'interactive',
            interactive: {
                type: 'list',
                body: { text: '🍽️ Our Menu Categories:' },
                action: {
                    button: 'Select Category',
                    sections: [{
                        title: 'Categories',
                        rows: rows
                    }]
                }
            }
        };
    }

    if (input.includes('track') || input === '📦 track order') {
        await supabase
            .from('whatsapp_conversations')
            .update({ state: 'tracking_order' })
            .eq('id', conversationId);

        return { type: 'text', text: { body: 'Please share your order ID (e.g., #9161)' } };
    }

    return { type: 'text', text: { body: 'Please select an option from the menu.' } };
}

// Handle category view
async function handleCategoryView(
    conversationId: string,
    content: string,
    context: any,
    supabase: any,
    restaurant: any
) {
    // Fetch items in selected category (only those visible in WhatsApp)
    const { data: items } = await supabase
        .from('menu_items')
        .select('id, name, description, price_cents, image_url')
        .eq('category_id', content)
        .eq('is_active', true)
        .eq('show_in_whatsapp', true)
        .order('name')
        .limit(10);

    if (!items || items.length === 0) {
        return { type: 'text', text: { body: 'No items available in this category.' } };
    }

    // Update context with selected category
    await supabase
        .from('whatsapp_conversations')
        .update({
            state: 'viewing_item',
            context: { ...context, category_id: content }
        })
        .eq('id', conversationId);

    // Create list of items
    let message = '🍽️ Menu Items:\n\n';
    items.forEach((item, idx) => {
        const price = (item.price_cents / 100).toFixed(2);
        message += `${idx + 1}. ${item.name} - $${price}\n`;
        if (item.description) {
            message += `   ${item.description.substring(0, 50)}...\n`;
        }
        message += '\n';
    });
    message += 'Reply with item number to add to cart.';

    return { type: 'text', text: { body: message } };
}

// Handle item view and quantity selection
async function handleItemView(
    conversationId: string,
    content: string,
    context: any,
    supabase: any,
    restaurant: any
) {
    // Parse item number
    const itemNumber = parseInt(content) - 1;

    // Fetch items again
    const { data: items } = await supabase
        .from('menu_items')
        .select('*')
        .eq('category_id', context.category_id)
        .eq('is_active', true)
        .eq('show_in_whatsapp', true)
        .order('name')
        .limit(10);

    if (!items || items.length === 0) {
        return { type: 'text', text: { body: '❌ No items available.' } };
    }

    if (itemNumber < 0 || itemNumber >= items.length) {
        return { type: 'text', text: { body: '❌ Invalid item number. Please try again.' } };
    }

    const selectedItem = items[itemNumber];
    const price = (selectedItem.price_cents / 100).toFixed(2);

    // Update state to selecting_quantity
    await supabase
        .from('whatsapp_conversations')
        .update({
            state: 'selecting_quantity',
            context: {
                ...context,
                selected_item: selectedItem
            }
        })
        .eq('id', conversationId);

    // Send item image if available
    let message = `🍽️ ${selectedItem.name}\n💰 $${price}\n\n`;
    if (selectedItem.description) {
        message += `${selectedItem.description}\n\n`;
    }
    message += `How many would you like? (1-10)`;

    return {
        type: 'text',
        text: { body: message }
    };
}

// Handle quantity selection
async function handleQuantitySelection(
    conversationId: string,
    content: string,
    context: any,
    supabase: any,
    restaurant: any
) {
    const quantity = parseInt(content);

    if (isNaN(quantity) || quantity < 1 || quantity > 10) {
        return {
            type: 'text',
            text: { body: '❌ Please enter a valid quantity between 1 and 10.' }
        };
    }

    const selectedItem = context.selected_item;

    if (!selectedItem) {
        return { type: 'text', text: { body: '❌ Item not found. Please start over.' } };
    }

    // Get current cart
    const { data: conversation } = await supabase
        .from('whatsapp_conversations')
        .select('cart')
        .eq('id', conversationId)
        .single();

    const cart = conversation.cart || { items: [], total: 0 };

    // Check if item already in cart
    const existingIndex = cart.items.findIndex((i: any) => i.id === selectedItem.id);

    if (existingIndex >= 0) {
        // Update existing item quantity
        cart.items[existingIndex].quantity += quantity;
    } else {
        // Add new item
        cart.items.push({
            id: selectedItem.id,
            name: selectedItem.name,
            price: selectedItem.price_cents,
            quantity: quantity
        });
    }

    cart.total += selectedItem.price_cents * quantity;

    // Update cart and state
    await supabase
        .from('whatsapp_conversations')
        .update({
            cart: cart,
            state: 'reviewing_cart',
            context: {} // Clear context
        })
        .eq('id', conversationId);

    const itemTotal = (selectedItem.price_cents * quantity / 100).toFixed(2);
    const cartTotal = (cart.total / 100).toFixed(2);

    return {
        type: 'interactive',
        interactive: {
            type: 'button',
            body: {
                text: `✅ Added ${quantity}x ${selectedItem.name} ($${itemTotal})!\n\nCart Total: $${cartTotal}`
            },
            action: {
                buttons: [
                    { type: 'reply', reply: { id: 'add_more', title: '➕ Add More' } },
                    { type: 'reply', reply: { id: 'checkout', title: '🛒 Checkout' } },
                    { type: 'reply', reply: { id: 'view_cart', title: '👁️ View Cart' } }
                ]
            }
        }
    };
}

// Handle cart review
async function handleCartReview(conversationId: string, content: string, supabase: any, restaurant: any) {
    const input = content.toLowerCase().trim();

    // Handle "Add More" button
    if (input.includes('add') || input === '➕ add more') {
        await supabase
            .from('whatsapp_conversations')
            .update({ state: 'browsing_menu' })
            .eq('id', conversationId);

        return await handleMenuBrowsing(conversationId, 'menu', supabase, restaurant);
    }

    // Handle "Checkout" button
    if (input.includes('checkout') || input === '🛒 checkout') {
        // Get cart to check if empty
        const { data: conversation } = await supabase
            .from('whatsapp_conversations')
            .select('cart')
            .eq('id', conversationId)
            .single();

        const cart = conversation.cart || { items: [], total: 0 };

        if (!cart.items || cart.items.length === 0) {
            return {
                type: 'text',
                text: { body: '🛒 Your cart is empty!\n\nType "menu" to start ordering.' }
            };
        }

        // Move to order confirmation
        await supabase
            .from('whatsapp_conversations')
            .update({ state: 'confirming_order' })
            .eq('id', conversationId);

        return await showOrderConfirmation(conversationId, supabase);
    }

    // Remove item: "remove 2"
    if (input.startsWith('remove ')) {
        const itemNum = parseInt(input.replace('remove ', '')) - 1;

        const { data: conversation } = await supabase
            .from('whatsapp_conversations')
            .select('cart')
            .eq('id', conversationId)
            .single();

        const cart = conversation.cart || { items: [], total: 0 };

        if (itemNum < 0 || itemNum >= cart.items.length) {
            return {
                type: 'text',
                text: { body: '❌ Invalid item number. Type "cart" to see your items.' }
            };
        }

        const removedItem = cart.items[itemNum];
        cart.total -= removedItem.price * removedItem.quantity;
        cart.items.splice(itemNum, 1);

        await supabase
            .from('whatsapp_conversations')
            .update({ cart: cart })
            .eq('id', conversationId);

        return {
            type: 'text',
            text: { body: `🗑️ Removed ${removedItem.name} from cart.\n\nType "cart" to view updated cart.` }
        };
    }

    // Change quantity: "change 1 to 3"
    if (input.includes('change') && input.includes('to')) {
        const match = input.match(/change\s+(\d+)\s+to\s+(\d+)/);

        if (!match) {
            return {
                type: 'text',
                text: { body: '❌ Invalid format. Use: "change 1 to 3"' }
            };
        }

        const itemNum = parseInt(match[1]) - 1;
        const newQuantity = parseInt(match[2]);

        if (newQuantity < 1 || newQuantity > 10) {
            return {
                type: 'text',
                text: { body: '❌ Quantity must be between 1 and 10.' }
            };
        }

        const { data: conversation } = await supabase
            .from('whatsapp_conversations')
            .select('cart')
            .eq('id', conversationId)
            .single();

        const cart = conversation.cart || { items: [], total: 0 };

        if (itemNum < 0 || itemNum >= cart.items.length) {
            return {
                type: 'text',
                text: { body: '❌ Invalid item number. Type "cart" to see your items.' }
            };
        }

        const item = cart.items[itemNum];
        const oldQuantity = item.quantity;

        // Update total: remove old quantity, add new quantity
        cart.total -= item.price * oldQuantity;
        cart.total += item.price * newQuantity;

        // Update item quantity
        item.quantity = newQuantity;

        await supabase
            .from('whatsapp_conversations')
            .update({ cart: cart })
            .eq('id', conversationId);

        const itemTotal = (item.price * newQuantity / 100).toFixed(2);
        const cartTotal = (cart.total / 100).toFixed(2);

        return {
            type: 'text',
            text: {
                body: `✅ Updated ${item.name} quantity: ${oldQuantity} → ${newQuantity}\n\n` +
                    `Item Total: $${itemTotal}\n` +
                    `Cart Total: $${cartTotal}\n\n` +
                    `Type "cart" to view updated cart.`
            }
        };
    }

    // Clear cart
    if (input.includes('clear')) {
        await supabase
            .from('whatsapp_conversations')
            .update({ cart: { items: [], total: 0 } })
            .eq('id', conversationId);

        return {
            type: 'text',
            text: { body: '🗑️ Cart cleared!\n\nType "menu" to start ordering.' }
        };
    }

    // View cart (default)
    const { data: conversation } = await supabase
        .from('whatsapp_conversations')
        .select('cart')
        .eq('id', conversationId)
        .single();

    const cart = conversation.cart || { items: [], total: 0 };

    if (!cart.items || cart.items.length === 0) {
        return {
            type: 'text',
            text: { body: '🛒 Your cart is empty!\n\nType "menu" to start ordering.' }
        };
    }

    let message = '🛒 Your Cart:\n\n';
    cart.items.forEach((item: any, idx: number) => {
        const itemTotal = (item.price * item.quantity / 100).toFixed(2);
        message += `${idx + 1}. ${item.name} x${item.quantity} - $${itemTotal}\n`;
    });
    message += `\n💰 Total: $${(cart.total / 100).toFixed(2)}\n\n`;
    message += `Commands:\n`;
    message += `• "change 1 to 3" - Update quantity\n`;
    message += `• "remove 1" - Remove item\n`;
    message += `• "clear" - Clear cart\n`;
    message += `• "checkout" - Place order`;

    return { type: 'text', text: { body: message } };
}

// Show order confirmation
async function showOrderConfirmation(conversationId: string, supabase: any) {
    const { data: conversation } = await supabase
        .from('whatsapp_conversations')
        .select('cart')
        .eq('id', conversationId)
        .single();

    const cart = conversation.cart;

    if (!cart || !cart.items || cart.items.length === 0) {
        return { type: 'text', text: { body: '❌ Your cart is empty!' } };
    }

    let message = '📋 Order Summary:\n\n';
    cart.items.forEach((item: any) => {
        const itemTotal = (item.price * item.quantity / 100).toFixed(2);
        message += `• ${item.name} x${item.quantity} - $${itemTotal}\n`;
    });
    message += `\n💰 Total: $${(cart.total / 100).toFixed(2)}\n\n`;
    message += `Confirm your order?`;

    return {
        type: 'interactive',
        interactive: {
            type: 'button',
            body: { text: message },
            action: {
                buttons: [
                    { type: 'reply', reply: { id: 'confirm_yes', title: '✅ Confirm' } },
                    { type: 'reply', reply: { id: 'confirm_no', title: '❌ Cancel' } }
                ]
            }
        }
    };
}

// Handle order confirmation
async function handleOrderConfirmation(conversationId: string, content: string, supabase: any, restaurant: any) {
    const input = content.toLowerCase();

    if (input.includes('confirm') || input === '✅ confirm') {
        // Proceed to delivery/pickup selection
        await supabase
            .from('whatsapp_conversations')
            .update({ state: 'checkout_address' })
            .eq('id', conversationId);

        return {
            type: 'interactive',
            interactive: {
                type: 'button',
                body: { text: '📍 Delivery or Pickup?' },
                action: {
                    buttons: [
                        { type: 'reply', reply: { id: 'delivery', title: '🚗 Delivery' } },
                        { type: 'reply', reply: { id: 'pickup', title: '🏪 Pickup' } }
                    ]
                }
            }
        };
    }

    if (input.includes('cancel') || input === '❌ cancel') {
        await supabase
            .from('whatsapp_conversations')
            .update({ state: 'reviewing_cart' })
            .eq('id', conversationId);

        return {
            type: 'text',
            text: { body: '❌ Order cancelled.\n\nType "cart" to review or "menu" to add more items.' }
        };
    }

    return { type: 'text', text: { body: 'Please confirm or cancel your order.' } };
}

// Handle checkout address
async function handleCheckoutAddress(conversationId: string, content: string, supabase: any, restaurant: any) {
    // Get conversation context to check order type
    const { data: conversation } = await supabase
        .from('whatsapp_conversations')
        .select('context')
        .eq('id', conversationId)
        .single();

    const context = conversation?.context || {};
    const orderType = context.order_type;

    // If dine-in, use table number from context
    if (orderType === 'dine_in') {
        const tableNumber = context.table_number;
        return await createOrder(conversationId, 'dine_in', null, tableNumber, supabase, restaurant);
    }

    // If pickup, no address needed
    if (orderType === 'pickup') {
        return await createOrder(conversationId, 'pickup', null, null, supabase, restaurant);
    }

    // If delivery, ask for address (or use provided address)
    const input = content.toLowerCase();

    if (input.includes('delivery') || input === '🚗 delivery' || !context.address_requested) {
        // First time - ask for address
        await supabase
            .from('whatsapp_conversations')
            .update({
                context: { ...context, address_requested: true }
            })
            .eq('id', conversationId);

        return { type: 'text', text: { body: '📍 Please share your delivery address:' } };
    }

    // User provided address
    return await createOrder(conversationId, 'delivery', content, null, supabase, restaurant);
}

// Handle order tracking
async function handleOrderTracking(conversationId: string, content: string, supabase: any, restaurant: any) {
    // Extract order ID
    const orderId = content.replace('#', '').trim();

    // Find order
    const { data: order } = await supabase
        .from('orders')
        .select('id, status, placed_at, total_cents')
        .eq('restaurant_id', restaurant.id)
        .ilike('id', `${orderId}%`)
        .single();

    if (!order) {
        return { type: 'text', text: { body: '❌ Order not found. Please check the order ID.' } };
    }

    const statusEmoji = {
        pending: '🆕',
        in_progress: '👨‍🍳',
        ready: '✅',
        completed: '🎉'
    };

    const statusText = {
        pending: 'New - Being prepared',
        in_progress: 'Preparing',
        ready: 'Ready for pickup/delivery',
        completed: 'Completed'
    };

    const message = `📦 Order Status: #${order.id.substring(0, 4)}\n\n` +
        `${statusEmoji[order.status as keyof typeof statusEmoji]} ${statusText[order.status as keyof typeof statusText]}\n\n` +
        `Total: $${(order.total_cents / 100).toFixed(2)}\n` +
        `Placed: ${new Date(order.placed_at).toLocaleString()}`;

    return { type: 'text', text: { body: message } };
}

// Create order from cart
async function createOrder(
    conversationId: string,
    orderType: string,
    address: string | null,
    tableNumber: string | null,
    supabase: any,
    restaurant: any
) {
    const { data: conversation } = await supabase
        .from('whatsapp_conversations')
        .select('cart, whatsapp_customer_id')
        .eq('id', conversationId)
        .single();

    const cart = conversation.cart;

    if (!cart || cart.items.length === 0) {
        return { type: 'text', text: { body: '❌ Your cart is empty!' } };
    }

    // Determine table_label and table_number based on order type
    let tableLabel = 'Pickup';
    let orderTableNumber = null;

    if (orderType === 'dine_in') {
        tableLabel = `Table ${tableNumber}`;
        orderTableNumber = tableNumber;
    } else if (orderType === 'delivery') {
        tableLabel = 'Delivery';
    }

    // Create order
    const { data: order, error } = await supabase
        .from('orders')
        .insert({
            restaurant_id: restaurant.id,
            source: 'whatsapp',
            status: 'pending',
            total_cents: cart.total,
            table_label: tableLabel,
            table_number: orderTableNumber,
            placed_at: new Date().toISOString()
        })
        .select()
        .single();

    if (error) {
        console.error('Order creation error:', error);
        return { type: 'text', text: { body: '❌ Failed to create order. Please try again.' } };
    }

    // Create order items
    for (const item of cart.items) {
        await supabase
            .from('order_items')
            .insert({
                order_id: order.id,
                menu_item_id: item.id,
                quantity: item.quantity,
                unit_price_cents: item.price
            });
    }

    // Link order to conversation
    await supabase
        .from('whatsapp_orders')
        .insert({
            conversation_id: conversationId,
            order_id: order.id
        });

    // Clear cart and update state
    await supabase
        .from('whatsapp_conversations')
        .update({
            cart: { items: [], total: 0 },
            state: 'order_placed'
        })
        .eq('id', conversationId);

    // Build confirmation message
    let message = `🎉 Order placed successfully!\n\n` +
        `Order ID: #${order.id.substring(0, 4)}\n` +
        `Total: $${(cart.total / 100).toFixed(2)}\n`;

    if (orderType === 'dine_in') {
        message += `Table: ${tableNumber}\n`;
    } else if (orderType === 'delivery') {
        message += `Delivery to: ${address}\n`;
    } else if (orderType === 'pickup') {
        message += `Type: Pickup\n`;
    }

    message += `\nWe'll notify you when your order is ready!`;

    return { type: 'text', text: { body: message } };
}

// Send WhatsApp message
async function sendWhatsAppMessage(
    to: string,
    message: any,
    accessToken: string,
    phoneNumberId: string,
    supabase: any,
    conversationId: string
) {
    try {
        const response = await fetch(
            `${WHATSAPP_API_URL}/${phoneNumberId}/messages`,
            {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    messaging_product: 'whatsapp',
                    to: to,
                    ...message
                })
            }
        );

        const result = await response.json();

        // Save outbound message
        await supabase
            .from('whatsapp_messages')
            .insert({
                conversation_id: conversationId,
                direction: 'outbound',
                message_type: message.type,
                content: message.type === 'text' ? message.text.body : JSON.stringify(message),
                whatsapp_message_id: result.messages?.[0]?.id,
                status: 'sent'
            });

        return result;
    } catch (error) {
        console.error('Failed to send WhatsApp message:', error);
        throw error;
    }
}
