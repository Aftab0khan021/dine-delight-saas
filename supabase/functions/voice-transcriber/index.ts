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

        const { audio_url, restaurant_id } = await req.json();

        if (!audio_url || !restaurant_id) {
            throw new Error('Missing required fields');
        }

        // Get restaurant AI config
        const { data: restaurant, error: restaurantError } = await supabaseClient
            .from('restaurants')
            .select('ai_config')
            .eq('id', restaurant_id)
            .single();

        if (restaurantError || !restaurant) {
            throw new Error('Restaurant not found');
        }

        const aiConfig = restaurant.ai_config;

        // Check if voice messages are enabled
        if (!aiConfig?.enabled || !aiConfig?.features?.voice_messages) {
            return new Response(
                JSON.stringify({ error: 'Voice messages not enabled for this restaurant' }),
                {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 403,
                }
            );
        }

        const voiceProvider = aiConfig.voice_provider || 'whisper-local';
        let transcription = '';

        if (voiceProvider === 'openai') {
            // Get OpenAI API key
            const { data: apiKeyData } = await supabaseClient
                .from('restaurant_api_keys')
                .select('api_key_encrypted')
                .eq('restaurant_id', restaurant_id)
                .eq('provider_name', 'openai')
                .eq('is_active', true)
                .single();

            if (!apiKeyData) {
                throw new Error('OpenAI API key not configured');
            }

            // Decrypt API key
            const { data: decryptedKey } = await supabaseClient
                .rpc('decrypt_api_key', { encrypted_key: apiKeyData.api_key_encrypted });

            transcription = await transcribeWithOpenAI(audio_url, decryptedKey);
        } else {
            // Use local Whisper (requires setup)
            transcription = await transcribeWithLocalWhisper(audio_url);
        }

        return new Response(
            JSON.stringify({ transcription, provider: voiceProvider }),
            {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 200,
            }
        );
    } catch (error) {
        console.error('Voice transcription error:', error);
        return new Response(
            JSON.stringify({ error: error.message }),
            {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 400,
            }
        );
    }
});

async function transcribeWithOpenAI(audioUrl: string, apiKey: string): Promise<string> {
    // Download audio file
    const audioResponse = await fetch(audioUrl);
    const audioBlob = await audioResponse.blob();

    // Create form data
    const formData = new FormData();
    formData.append('file', audioBlob, 'audio.ogg');
    formData.append('model', 'whisper-1');

    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
        },
        body: formData,
    });

    const data = await response.json();
    return data.text || '';
}

async function transcribeWithLocalWhisper(audioUrl: string): Promise<string> {
    // Placeholder for local Whisper implementation
    // In production, this would use a self-hosted Whisper model
    return '[Voice message transcription not available - please configure OpenAI Whisper API]';
}
