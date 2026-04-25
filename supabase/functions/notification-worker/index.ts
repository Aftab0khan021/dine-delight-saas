// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

serve(async (req) => {
    try {
        const supabase = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '' // Use service role for background jobs
        );

        // Fetch pending notifications
        const { data: notifications } = await supabase
            .from('notification_queue')
            .select(`
        *,
        whatsapp_customers!customer_id (
          phone_number,
          restaurant_id,
          restaurants!restaurant_id (
            whatsapp_config
          )
        )
      `)
            .eq('status', 'pending')
            .lte('scheduled_for', new Date().toISOString())
            .limit(50);

        if (!notifications || notifications.length === 0) {
            return new Response(JSON.stringify({ processed: 0 }), {
                headers: { 'Content-Type': 'application/json' }
            });
        }

        let processed = 0;
        let failed = 0;

        for (const notif of notifications) {
            try {
                const customer = notif.whatsapp_customers;
                const restaurant = customer.restaurants;
                const whatsappConfig = restaurant.whatsapp_config;

                // Send WhatsApp message
                await sendWhatsAppMessage(
                    customer.phone_number,
                    notif.message,
                    whatsappConfig.access_token,
                    whatsappConfig.phone_number_id
                );

                // Mark as sent
                await supabase
                    .from('notification_queue')
                    .update({
                        status: 'sent',
                        sent_at: new Date().toISOString()
                    })
                    .eq('id', notif.id);

                processed++;
            } catch (error) {
                // Mark as failed
                await supabase
                    .from('notification_queue')
                    .update({
                        status: 'failed',
                        error_message: error.message,
                        retry_count: notif.retry_count + 1
                    })
                    .eq('id', notif.id);

                failed++;
            }
        }

        return new Response(
            JSON.stringify({ processed, failed, total: notifications.length }),
            { headers: { 'Content-Type': 'application/json' } }
        );

    } catch (error) {
        return new Response(
            JSON.stringify({ error: error.message }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
    }
});

async function sendWhatsAppMessage(
    to: string,
    message: string,
    accessToken: string,
    phoneNumberId: string
) {
    const url = `https://graph.facebook.com/v17.0/${phoneNumberId}/messages`;

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            messaging_product: 'whatsapp',
            to: to,
            type: 'text',
            text: { body: message }
        })
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(`WhatsApp API error: ${JSON.stringify(error)}`);
    }

    return await response.json();
}
