import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const supabaseClient = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        );

        const { restaurant_id, provider_name, api_key } = await req.json();

        if (!restaurant_id || !provider_name || !api_key) {
            throw new Error('Missing required fields');
        }

        // Get encryption key from Supabase Vault
        const { data: secretData, error: secretError } = await supabaseClient
            .rpc('get_secret', { secret_name: 'api_key_encryption_key' });

        if (secretError) {
            console.error('Error fetching encryption key:', secretError);
            throw new Error('Encryption key not configured');
        }

        const encryptionKey = secretData;

        // Encrypt the API key using pgcrypto
        const { data: encryptedKey, error: encryptError } = await supabaseClient
            .rpc('encrypt_api_key', { key: api_key });

        if (encryptError) {
            console.error('Encryption error:', encryptError);
            throw new Error('Failed to encrypt API key');
        }

        // Store encrypted key
        const { error: insertError } = await supabaseClient
            .from('restaurant_api_keys')
            .upsert({
                restaurant_id,
                provider_name,
                api_key_encrypted: encryptedKey,
                is_active: true,
                updated_at: new Date().toISOString(),
            }, {
                onConflict: 'restaurant_id,provider_name'
            });

        if (insertError) {
            console.error('Insert error:', insertError);
            throw new Error('Failed to store API key');
        }

        return new Response(
            JSON.stringify({ success: true, message: 'API key stored successfully' }),
            {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 200,
            }
        );
    } catch (error) {
        console.error('Error:', error);
        return new Response(
            JSON.stringify({ error: error.message }),
            {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 400,
            }
        );
    }
});
