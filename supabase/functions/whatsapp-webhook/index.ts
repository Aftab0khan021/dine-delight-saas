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

        case 'searching_menu':
            return await handleMenuSearch(conversationId, content, supabase, restaurant);

        case 'browsing_menu':
            return await handleMenuBrowsing(conversationId, content, supabase, restaurant);

        case 'viewing_category':
            return await handleCategoryView(conversationId, content, context, supabase, restaurant);

        case 'viewing_item':
            return await handleItemView(conversationId, content, context, supabase, restaurant);

        case 'selecting_variant':
            return await handleVariantSelection(conversationId, content, context, supabase, restaurant);

        case 'selecting_addons':
            return await handleAddonSelection(conversationId, content, context, supabase, restaurant);

        case 'adding_instructions':
            return await handleSpecialInstructions(conversationId, content, context, supabase, restaurant);

        case 'selecting_quantity':
            return await handleQuantitySelection(conversationId, content, context, supabase, restaurant);

        case 'reviewing_cart':
            return await handleCartReview(conversationId, content, supabase, restaurant);

        case 'viewing_history':
            return await handleOrderHistory(conversationId, content, supabase, restaurant);

        case 'confirming_reorder':
            return await handleReorderConfirmation(conversationId, content, context, supabase, restaurant);

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

    // Search command
    if (input.startsWith('search ')) {
        const query = input.replace('search ', '').trim();
        return await handleMenuSearch(conversationId, query, supabase, restaurant);
    }

    // History command
    if (input === 'history' || input === 'orders') {
        return await handleOrderHistory(conversationId, 'view', supabase, restaurant);
    }

    return { type: 'text', text: { body: 'Reply with a number to view a category, or type "search [item]" to find something specific.' } };
}

// Handle Menu Search
async function handleMenuSearch(conversationId: string, content: string, supabase: any, restaurant: any) {
    const query = content.trim();

    if (query.length < 3) {
        return { type: 'text', text: { body: 'Please enter at least 3 characters to search.' } };
    }

    const { data: items } = await supabase
        .from('menu_items')
        .select('id, name, description, price_cents')
        .eq('restaurant_id', restaurant.id)
        .eq('is_active', true)
        .ilike('name', `%${query}%`)
        .limit(10);

    if (!items || items.length === 0) {
        return { type: 'text', text: { body: `🔍 No items found for "${query}". Try browsing our menu categories instead.` } };
    }

    // Reset state to viewing item if only one found, or list them ??
    // For now, let's list them as a pure text list with IDs isn't easy as we rely on category context usually.
    // Instead, we can simulate a "Dynamic Category" called Search Results.

    // Update context
    await supabase
        .from('whatsapp_conversations')
        .update({
            state: 'viewing_item',
            context: { search_results: items, is_search: true }
        })
        .eq('id', conversationId);

    let message = `🔍 Search Results for "${query}":\n\n`;
    items.forEach((item: any, idx: number) => {
        const price = (item.price_cents / 100).toFixed(2);
        message += `${idx + 1}. ${item.name} - $${price}\n`;
    });
    message += '\nReply with item number to select.';

    return { type: 'text', text: { body: message } };
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
    let selectedItem: any;

    if (context.is_search) {
        const items = context.search_results;
        if (!items || itemNumber < 0 || itemNumber >= items.length) {
            return { type: 'text', text: { body: '❌ Invalid item number. Please try again.' } };
        }
        selectedItem = items[itemNumber];

        // Fetch full details for selected item including variants/addons/allergens
        const { data: fullItem } = await supabase
            .from('menu_items')
            .select('*, menu_item_variants(id, name, price_adjustment_cents), menu_item_addons(id, name, price_cents)')
            .eq('id', selectedItem.id)
            .single();

        if (fullItem) selectedItem = fullItem;

    } else {
        // Fetch items again to get the full list for index
        const { data: items } = await supabase
            .from('menu_items')
            .select('*, menu_item_variants(id, name, price_adjustment_cents), menu_item_addons(id, name, price_cents)')
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
        selectedItem = items[itemNumber];
    }


    // Check if item has variants
    const variants = selectedItem.menu_item_variants || [];
    if (variants.length > 0) {
        // Go to selecting_variant
        await supabase
            .from('whatsapp_conversations')
            .update({
                state: 'selecting_variant',
                context: {
                    ...context,
                    selected_item: selectedItem,
                    variants: variants
                }
            })
            .eq('id', conversationId);

        let message = `🍽️ ${selectedItem.name}\nSelect Size/Variant:\n\n`;
        variants.forEach((v: any, idx: number) => {
            const adj = v.price_adjustment_cents > 0 ? ` (+ $${(v.price_adjustment_cents / 100).toFixed(2)})` : '';
            message += `${idx + 1}. ${v.name}${adj}\n`;
        });
        return { type: 'text', text: { body: message } };
    }

    // Check if item has addons (if no variants, or after variants)
    // Actually if no variants, check addons immediately. 
    // BUT consistent flow: Item -> (Variant?) -> (Addons?) -> (Instructions?) -> Quantity

    const addons = selectedItem.menu_item_addons || [];
    if (addons.length > 0) {
        // Go to selecting_addons
        await supabase
            .from('whatsapp_conversations')
            .update({
                state: 'selecting_addons',
                context: {
                    ...context,
                    selected_item: selectedItem,
                    addons: addons,
                    selected_addons: [] // Initialize empty
                }
            })
            .eq('id', conversationId);

        return await showAddonsMenu(selectedItem, addons, []);
    }

    // Default flow: Move to quantity
    return await proceedToQuantity(conversationId, selectedItem, context, supabase);
}

// Helper to show addons menu
function showAddonsMenu(item: any, addons: any[], selectedIds: string[]) {
    let message = `🍽️ ${item.name}\nSelect Add-ons (Reply with number to toggle, or '0' when done):\n\n`;
    addons.forEach((addon: any, idx: number) => {
        const isSelected = selectedIds.includes(addon.id) ? '✅ ' : '';
        message += `${isSelected}${idx + 1}. ${addon.name} (+$${(addon.price_cents / 100).toFixed(2)})\n`;
    });
    message += `\n0. Done / Continue`;
    return { type: 'text', text: { body: message } };
}

// Helper to transition to Quantity state
async function proceedToQuantity(conversationId: string, item: any, context: any, supabase: any) {
    // Check for special instructions?
    // Let's add that step before quantity

    await supabase
        .from('whatsapp_conversations')
        .update({
            state: 'adding_instructions',
            context: {
                ...context,
                selected_item: item
            }
        })
        .eq('id', conversationId);

    const allergens = item.allergens && item.allergens.length > 0 ? `\n⚠️ Allergens: ${item.allergens.join(', ')}` : '';
    const imageMsg = item.image_url ? ` 🖼️ ` : ''; // We can send image message separately if supported

    let message = `🍽️ ${item.name}${imageMsg}\n`;
    // Add variant/addons info to summary if exists
    if (context.selected_variant) message += `Option: ${context.selected_variant.name}\n`;
    if (context.selected_addons && context.selected_addons.length > 0) {
        const addonNames = context.selected_addons.map((a: any) => a.name).join(', ');
        message += `Add-ons: ${addonNames}\n`;
    }

    message += `${allergens}\n\nAny special instructions? (Type 'none' or 'skip')`;

    // If item has image, we could theoretically return an image message here, but let's stick to text for stability first.
    // If user wants image, we can try to send it.
    if (item.image_url) {
        return {
            type: 'image',
            image: { link: item.image_url },
            caption: message
        };
    }

    return { type: 'text', text: { body: message } };
}

// Handle variant selection
async function handleVariantSelection(
    conversationId: string,
    content: string,
    context: any,
    supabase: any,
    restaurant: any
) {
    const selection = parseInt(content);
    const variants = context.variants || [];

    if (isNaN(selection) || selection < 1 || selection > variants.length) {
        return { type: 'text', text: { body: '❌ Invalid selection. Please choose a valid number.' } };
    }

    const selectedVariant = variants[selection - 1];

    // Update context with selection
    const updatedContext = {
        ...context,
        selected_variant: selectedVariant
    };

    // Check for addons next
    const item = context.selected_item;
    // We already have the item from context, but checking if we need to fetch addons?
    // In handleItemView we fetched everything.
    const addons = item.menu_item_addons || [];

    if (addons.length > 0) {
        // Go to selecting_addons
        await supabase
            .from('whatsapp_conversations')
            .update({
                state: 'selecting_addons',
                context: {
                    ...updatedContext,
                    addons: addons,
                    selected_addons: []
                }
            })
            .eq('id', conversationId);

        return await showAddonsMenu(item, addons, []);
    }

    // Otherwise go to quantity/instructions
    return await proceedToQuantity(conversationId, item, updatedContext, supabase);
}

// Handle Add-on selection
async function handleAddonSelection(
    conversationId: string,
    content: string,
    context: any,
    supabase: any,
    restaurant: any
) {
    const input = content.trim();

    // Check if done
    if (input === '0' || input.toLowerCase() === 'done') {
        return await proceedToQuantity(conversationId, context.selected_item, context, supabase);
    }

    const selection = parseInt(input);
    const addons = context.addons || [];

    if (isNaN(selection) || selection < 1 || selection > addons.length) {
        return { type: 'text', text: { body: '❌ Invalid selection. Reply with number to toggle or 0 to finish.' } };
    }

    const selectedAddon = addons[selection - 1];

    // Toggle addon
    let currentSelected = context.selected_addons || [];
    // Check if already selected by ID
    const existingIdx = currentSelected.findIndex((a: any) => a.id === selectedAddon.id);

    if (existingIdx >= 0) {
        // Remove
        currentSelected.splice(existingIdx, 1);
    } else {
        // Add
        currentSelected.push(selectedAddon);
    }

    // Update context
    await supabase
        .from('whatsapp_conversations')
        .update({
            context: {
                ...context,
                selected_addons: currentSelected
            }
        })
        .eq('id', conversationId);

    // Show updated menu
    const selectedIds = currentSelected.map((a: any) => a.id);
    return await showAddonsMenu(context.selected_item, addons, selectedIds);
}

// Handle special instructions
async function handleSpecialInstructions(
    conversationId: string,
    content: string,
    context: any,
    supabase: any,
    restaurant: any
) {
    const input = content.trim();
    let instructions = '';

    if (input.toLowerCase() !== 'none' && input.toLowerCase() !== 'skip' && input.toLowerCase() !== 'no') {
        instructions = input;
    }

    // Update context
    const updatedContext = {
        ...context,
        special_instructions: instructions
    };

    // Move to quantity
    const item = context.selected_item;
    const price = (item.price_cents / 100).toFixed(2);

    // Update state to selecting_quantity
    await supabase
        .from('whatsapp_conversations')
        .update({
            state: 'selecting_quantity',
            context: updatedContext
        })
        .eq('id', conversationId);

    // Calculate total price with extras for display
    let basePrice = item.price_cents;
    if (updatedContext.selected_variant) basePrice += updatedContext.selected_variant.price_adjustment_cents;
    if (updatedContext.selected_addons) {
        updatedContext.selected_addons.forEach((a: any) => basePrice += a.price_cents);
    }
    const totalPrice = (basePrice / 100).toFixed(2);

    let message = `🍽️ ${item.name}`;
    if (updatedContext.selected_variant) message += ` (${updatedContext.selected_variant.name})`;
    message += `\n💰 $${totalPrice} per item\n\n`;

    if (updatedContext.selected_addons && updatedContext.selected_addons.length > 0) {
        const addonNames = updatedContext.selected_addons.map((a: any) => a.name).join(', ');
        message += `Add-ons: ${addonNames}\n`;
    }
    if (instructions) message += `Note: ${instructions}\n`;

    message += `\nHow many would you like? (1-10)`;

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

    // Note: We should probably only merge if variants/addons match. 
    // But for now, simple ID check might be insufficient if we have variants.
    // Let's just always add as new item if it has variants/addons to avoid complexity.
    // Or check if same variant/addons.

    // For MVP, if it has variants/addons, always add new.
    const hasCustomization = context.selected_variant || (context.selected_addons && context.selected_addons.length > 0) || context.special_instructions;

    if (existingIndex >= 0 && !hasCustomization) {
        // Update existing item quantity
        cart.items[existingIndex].quantity += quantity;
    } else {
        // Add new item
        let price = selectedItem.price_cents;
        if (context.selected_variant) price += context.selected_variant.price_adjustment_cents;
        if (context.selected_addons) context.selected_addons.forEach((a: any) => price += a.price_cents);

        cart.items.push({
            id: selectedItem.id,
            name: selectedItem.name,
            price: price,
            quantity: quantity,
            selected_variant: context.selected_variant || null,
            selected_addons: context.selected_addons || [],
            special_instructions: context.special_instructions || null
        });
    }

    cart.total += cart.items[cart.items.length - 1].price * quantity; // Re-calc total properly? 
    // Re-calc cart total from scratch to be safe
    cart.total = cart.items.reduce((sum: number, i: any) => sum + (i.price * i.quantity), 0);

    // Update cart and state
    await supabase
        .from('whatsapp_conversations')
        .update({
            cart: cart,
            state: 'reviewing_cart',
            context: {} // Clear context
        })
        .eq('id', conversationId);

    const itemTotal = (cart.items[cart.items.length - 1].price * quantity / 100).toFixed(2);
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

// Handle Cart Review
async function handleCartReview(conversationId: string, content: string, supabase: any, restaurant: any) {
    const input = content.toLowerCase().trim();

    // Handle "Add More" button
    if (input.includes('add') || input === '➕ add more' || input === 'menu') {
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

// Handle quantity selection


// Handle Cart Review
async function handleCartReview(conversationId: string, content: string, supabase: any, restaurant: any) {
    const input = content.toLowerCase().trim();

    // Handle "Add More" button
    if (input.includes('add') || input === '➕ add more' || input === 'menu') {
        await supabase
            .from('whatsapp_conversations')
            .update({ state: 'browsing_menu' })
            .eq('id', conversationId);

        return await handleMenuBrowsing(conversationId, 'menu', supabase, restaurant);
    }

    // Handle "Checkout" button
    if (input.includes('checkout') || input === '🛒 checkout') {
        await supabase
            .from('whatsapp_conversations')
            .update({ state: 'confirming_order' })
            .eq('id', conversationId);

        return {
            type: 'interactive',
            interactive: {
                type: 'button',
                body: { text: 'Are you sure you want to place this order?' },
                action: {
                    buttons: [
                        { type: 'reply', reply: { id: 'confirm', title: '✅ Confirm' } },
                        { type: 'reply', reply: { id: 'cancel', title: '❌ Cancel' } }
                    ]
                }
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

    // Remove item: "remove 2"
    if (input.startsWith('remove ')) {
        const itemNum = parseInt(input.replace('remove ', '')) - 1;

        const { data: conversation } = await supabase
            .from('whatsapp_conversations')
            .select('cart')
            .eq('id', conversationId)
            .single();

        const cart = conversation.cart || { items: [], total: 0 };

        if (itemNum >= 0 && itemNum < cart.items.length) {
            const removedItem = cart.items.splice(itemNum, 1)[0];
            cart.total = cart.items.reduce((sum: number, item: any) => sum + (item.price * item.quantity), 0);

            await supabase
                .from('whatsapp_conversations')
                .update({ cart: cart })
                .eq('id', conversationId);

            return { type: 'text', text: { body: `🗑️ Removed ${removedItem.name}.` } };
        }
    }

    const { data: conversation } = await supabase
        .from('whatsapp_conversations')
        .select('cart, state')
        .eq('id', conversationId)
        .single();

    const cart = conversation.cart || { items: [], total: 0 };

    if (!cart.items || cart.items.length === 0) {
        return { type: 'text', text: { body: 'Your cart is empty! checkout our menu by typing "menu".' } };
    }

    let message = '🛒 **Your Cart**\n\n';

    cart.items.forEach((item: any, idx: number) => {
        const itemTotal = (item.price * item.quantity / 100).toFixed(2);
        message += `${idx + 1}. ${item.name} x${item.quantity} - $${itemTotal}\n`;

        // Show details
        if (item.selected_variant) message += `   + ${item.selected_variant.name}\n`;
        if (item.selected_addons && item.selected_addons.length > 0) {
            const addons = item.selected_addons.map((a: any) => a.name).join(', ');
            message += `   + ${addons}\n`;
        }
        if (item.special_instructions) message += `   📝 "${item.special_instructions}"\n`;
    });

    const total = (cart.total / 100).toFixed(2);
    message += `\n**Total: $${total}**\n\n`;
    message += 'Reply "checkout" to place order, or "menu" to add more items.';

    // Update state if not already
    if (conversation.state !== 'reviewing_cart') {
        await supabase
            .from('whatsapp_conversations')
            .update({ state: 'reviewing_cart' })
            .eq('id', conversationId);
    }

    return {
        type: 'interactive',
        interactive: {
            type: 'button',
            body: { text: message },
            action: {
                buttons: [
                    { type: 'reply', reply: { id: 'checkout', title: '✅ Checkout' } },
                    { type: 'reply', reply: { id: 'menu', title: '➕ Add More' } },
                    { type: 'reply', reply: { id: 'clear_cart', title: '🗑️ Clear Cart' } }
                ]
            }
        }
    };
}

// Handle Order Confirmation (Step before address)
async function handleOrderConfirmation(conversationId: string, content: string, supabase: any, restaurant: any) {
    const input = content.toLowerCase();

    if (input === 'clear_cart' || input === 'clear') {
        await supabase
            .from('whatsapp_conversations')
            .update({
                cart: { items: [], total: 0 },
                state: 'browsing_menu'
            })
            .eq('id', conversationId);
        return { type: 'text', text: { body: '🗑️ Cart cleared. Type "menu" to start over.' } };
    }

    if (input === 'menu' || input === 'add more') {
        // Return to menu
        return await handleMenuBrowsing(conversationId, 'menu', supabase, restaurant);
    }

    if (input === 'checkout' || input === 'confirm') {
        // Proceed to address/table check
        return await handleCheckoutAddress(conversationId, '', supabase, restaurant);
    }

    return { type: 'text', text: { body: 'Please select an option: Checkout, Add More, or Clear Cart.' } };
}

// Handle User History
async function handleOrderHistory(conversationId: string, content: string, supabase: any, restaurant: any) {
    // 1. Get customer ID from conversation
    const { data: conversation } = await supabase
        .from('whatsapp_conversations')
        .select('whatsapp_customer_id')
        .eq('id', conversationId)
        .single();

    if (!conversation) return { type: 'text', text: { body: '❌ Error fetching profile.' } };

    // 2. Find all conversations for this customer
    const { data: conversations } = await supabase
        .from('whatsapp_conversations')
        .select('id')
        .eq('whatsapp_customer_id', conversation.whatsapp_customer_id);

    const conversationIds = conversations.map((c: any) => c.id);

    // 3. Find orders linked to these conversations
    const { data: whatsappOrders } = await supabase
        .from('whatsapp_orders')
        .select('order_id')
        .in('conversation_id', conversationIds);

    const orderIds = whatsappOrders.map((o: any) => o.order_id);

    if (orderIds.length === 0) {
        return { type: 'text', text: { body: '❌ No previous orders found.' } };
    }

    // 4. Fetch last 5 orders
    const { data: orders } = await supabase
        .from('orders')
        .select('id, total_cents, created_at, status, order_items(quantity, menu_items(name))')
        .in('id', orderIds)
        .order('created_at', { ascending: false })
        .limit(5);

    // 5. Display history
    await supabase
        .from('whatsapp_conversations')
        .update({
            state: 'viewing_history',
            context: { history_orders: orders }
        })
        .eq('id', conversationId);

    let message = '📜 **Order History**\n\n';
    orders.forEach((order: any, idx: number) => {
        const date = new Date(order.created_at).toLocaleDateString();
        const total = (order.total_cents / 100).toFixed(2);
        const description = order.order_items.map((i: any) => `${i.quantity}x ${i.menu_items?.name}`).join(', ');

        message += `${idx + 1}. ${date} - $${total} (${order.status})\n`;
        message += `   ${description.substring(0, 50)}${description.length > 50 ? '...' : ''}\n\n`;
    });

    message += 'Reply with order number to reorder.';

    return { type: 'text', text: { body: message } };
}

// Handle reorder confirmation
async function handleReorderConfirmation(
    conversationId: string,
    content: string,
    context: any,
    supabase: any,
    restaurant: any
) {
    const selection = parseInt(content);
    const orders = context.history_orders || [];

    // Check if we are selecting an order
    if (context.reorder_selected_id) {
        if (content.toLowerCase() === 'yes' || content.toLowerCase() === 'confirm' || content === '✅ yes') {
            // Execute Reorder
            const orderId = context.reorder_selected_id;

            const { data: orderItems } = await supabase
                .from('order_items')
                .select('menu_item_id, quantity, unit_price_cents, menu_items(name), variant_name, addons, special_instructions')
                .eq('order_id', orderId);

            // Construct cart items
            const newItems = orderItems.map((item: any) => ({
                id: item.menu_item_id,
                name: item.menu_items?.name,
                price: item.unit_price_cents,
                quantity: item.quantity,
                selected_variant: item.variant_name ? { name: item.variant_name, price_adjustment_cents: 0 } : null,
                selected_addons: item.addons || [],
                special_instructions: item.special_instructions
            }));

            // Calculate total
            const total = newItems.reduce((sum: number, item: any) => sum + (item.price * item.quantity), 0);

            // Update Cart
            await supabase
                .from('whatsapp_conversations')
                .update({
                    state: 'reviewing_cart',
                    cart: { items: newItems, total: total },
                    context: {}
                })
                .eq('id', conversationId);

            return await handleCartReview(conversationId, 'cart', supabase, restaurant);
        } else {
            await supabase
                .from('whatsapp_conversations')
                .update({ state: 'browsing_menu', context: {} })
                .eq('id', conversationId);
            return { type: 'text', text: { body: 'Reorder cancelled. Type "menu" to browse.' } };
        }
    }

    if (isNaN(selection) || selection < 1 || selection > orders.length) {
        return { type: 'text', text: { body: '❌ Invalid selection. Please choose an order number.' } };
    }

    const selectedOrder = orders[selection - 1];

    await supabase
        .from('whatsapp_conversations')
        .update({
            state: 'confirming_reorder',
            context: { ...context, reorder_selected_id: selectedOrder.id }
        })
        .eq('id', conversationId);

    return {
        type: 'interactive',
        interactive: {
            type: 'button',
            body: { text: `Reorder items from ${new Date(selectedOrder.created_at).toLocaleDateString()}?\nTotal: $${(selectedOrder.total_cents / 100).toFixed(2)}` },
            action: {
                buttons: [
                    { type: 'reply', reply: { id: 'yes', title: '✅ Yes' } },
                    { type: 'reply', reply: { id: 'no', title: '❌ No' } }
                ]
            }
        }
    };
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
            placed_at: new Date().toISOString(),
            // Add estimated time default? Or null.
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
                unit_price_cents: item.price,
                // Add customization fields
                variant_name: item.selected_variant?.name || null,
                addons: item.selected_addons || [],
                special_instructions: item.special_instructions || null
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
