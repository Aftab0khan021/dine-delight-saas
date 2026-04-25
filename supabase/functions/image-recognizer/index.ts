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

        const { image_url, restaurant_id } = await req.json();

        if (!image_url || !restaurant_id) {
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

        // Check if image recognition is enabled
        if (!aiConfig?.enabled || !aiConfig?.features?.image_recognition) {
            return new Response(
                JSON.stringify({ error: 'Image recognition not enabled for this restaurant' }),
                {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 403,
                }
            );
        }

        const imageProvider = aiConfig.image_provider || 'tensorflow';
        let recognition: any = null;

        if (imageProvider === 'google') {
            // Get Google Cloud API key
            const { data: apiKeyData } = await supabaseClient
                .from('restaurant_api_keys')
                .select('api_key_encrypted')
                .eq('restaurant_id', restaurant_id)
                .eq('provider_name', 'google')
                .eq('is_active', true)
                .single();

            if (!apiKeyData) {
                throw new Error('Google Cloud API key not configured');
            }

            // Decrypt API key
            const { data: decryptedKey } = await supabaseClient
                .rpc('decrypt_api_key', { encrypted_key: apiKeyData.api_key_encrypted });

            recognition = await recognizeWithGoogleVision(image_url, decryptedKey);
        } else if (imageProvider === 'huggingface') {
            const { data: apiKeyData } = await supabaseClient
                .from('restaurant_api_keys')
                .select('api_key_encrypted')
                .eq('restaurant_id', restaurant_id)
                .eq('provider_name', 'huggingface')
                .eq('is_active', true)
                .single();

            const decryptedKey = apiKeyData ?
                (await supabaseClient.rpc('decrypt_api_key', { encrypted_key: apiKeyData.api_key_encrypted })).data :
                null;

            recognition = await recognizeWithHuggingFace(image_url, decryptedKey);
        } else {
            // TensorFlow.js (client-side, placeholder)
            recognition = {
                labels: ['food'],
                confidence: 0.5,
                message: 'Client-side TensorFlow.js recognition - implement in frontend'
            };
        }

        return new Response(
            JSON.stringify({ recognition, provider: imageProvider }),
            {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 200,
            }
        );
    } catch (error) {
        console.error('Image recognition error:', error);
        return new Response(
            JSON.stringify({ error: error.message }),
            {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 400,
            }
        );
    }
});

async function recognizeWithGoogleVision(imageUrl: string, apiKey: string) {
    const response = await fetch(
        `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                requests: [{
                    image: { source: { imageUri: imageUrl } },
                    features: [
                        { type: 'LABEL_DETECTION', maxResults: 10 },
                        { type: 'TEXT_DETECTION' }
                    ]
                }]
            }),
        }
    );

    const data = await response.json();
    const labels = data.responses[0].labelAnnotations?.map((l: any) => ({
        label: l.description,
        confidence: l.score
    })) || [];

    return {
        labels,
        text: data.responses[0].textAnnotations?.[0]?.description || '',
    };
}

async function recognizeWithHuggingFace(imageUrl: string, apiKey: string | null) {
    const imageResponse = await fetch(imageUrl);
    const imageBlob = await imageResponse.blob();
    const imageBuffer = await imageBlob.arrayBuffer();

    const response = await fetch(
        'https://api-inference.huggingface.co/models/google/vit-base-patch16-224',
        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/octet-stream',
                ...(apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {}),
            },
            body: imageBuffer,
        }
    );

    const data = await response.json();

    return {
        labels: data.map((item: any) => ({
            label: item.label,
            confidence: item.score
        })),
    };
}
