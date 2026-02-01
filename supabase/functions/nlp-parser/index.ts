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

        const { text, restaurant_id } = await req.json();

        if (!text || !restaurant_id) {
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

        // Check if NLP is enabled
        if (!aiConfig?.enabled || !aiConfig?.features?.natural_language_ordering) {
            return new Response(
                JSON.stringify({ error: 'NLP feature not enabled for this restaurant' }),
                {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 403,
                }
            );
        }

        const nlpProvider = aiConfig.nlp_provider || 'regex';
        let parsedIntent: any = null;

        // Check cache first
        const { data: cached } = await supabaseClient
            .from('nlp_parse_cache')
            .select('parsed_intent, confidence_score')
            .eq('restaurant_id', restaurant_id)
            .eq('input_text', text)
            .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
            .single();

        if (cached) {
            return new Response(
                JSON.stringify({
                    intent: cached.parsed_intent,
                    confidence: cached.confidence_score,
                    cached: true
                }),
                {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 200,
                }
            );
        }

        // Process based on provider
        if (nlpProvider === 'regex') {
            parsedIntent = parseWithRegex(text);
        } else if (nlpProvider === 'openai') {
            // Get API key
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

            parsedIntent = await parseWithOpenAI(text, decryptedKey);
        } else if (nlpProvider === 'huggingface') {
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

            parsedIntent = await parseWithHuggingFace(text, decryptedKey);
        }

        // Cache the result
        await supabaseClient
            .from('nlp_parse_cache')
            .insert({
                restaurant_id,
                input_text: text,
                parsed_intent: parsedIntent.intent,
                provider_used: nlpProvider,
                confidence_score: parsedIntent.confidence,
            });

        return new Response(
            JSON.stringify(parsedIntent),
            {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 200,
            }
        );
    } catch (error) {
        console.error('NLP Error:', error);
        return new Response(
            JSON.stringify({ error: error.message }),
            {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 400,
            }
        );
    }
});

// Simple regex-based parser (free)
function parseWithRegex(text: string) {
    const lowerText = text.toLowerCase();

    // Extract quantities
    const quantityMatch = text.match(/(\d+)\s*x\s*(.+)|(\d+)\s+(.+)/i);
    const quantity = quantityMatch ? parseInt(quantityMatch[1] || quantityMatch[3]) : 1;

    // Extract item names (simple keyword matching)
    const items: string[] = [];
    const commonItems = ['pizza', 'burger', 'pasta', 'salad', 'sandwich', 'coffee', 'tea'];

    for (const item of commonItems) {
        if (lowerText.includes(item)) {
            items.push(item);
        }
    }

    return {
        intent: {
            action: 'order',
            items: items.length > 0 ? items : [text],
            quantity,
        },
        confidence: items.length > 0 ? 0.7 : 0.4,
        provider: 'regex',
    };
}

// OpenAI GPT-based parser
async function parseWithOpenAI(text: string, apiKey: string) {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [
                {
                    role: 'system',
                    content: 'You are a restaurant order parser. Extract items and quantities from customer messages. Return JSON: {action: "order", items: ["item1"], quantity: 1}'
                },
                {
                    role: 'user',
                    content: text
                }
            ],
            temperature: 0.3,
        }),
    });

    const data = await response.json();
    const content = data.choices[0].message.content;

    try {
        const parsed = JSON.parse(content);
        return {
            intent: parsed,
            confidence: 0.95,
            provider: 'openai',
        };
    } catch {
        return {
            intent: { action: 'order', items: [text], quantity: 1 },
            confidence: 0.5,
            provider: 'openai',
        };
    }
}

// Hugging Face parser
async function parseWithHuggingFace(text: string, apiKey: string | null) {
    // Use free inference API
    const response = await fetch(
        'https://api-inference.huggingface.co/models/facebook/bart-large-mnli',
        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {}),
            },
            body: JSON.stringify({
                inputs: text,
                parameters: {
                    candidate_labels: ['order food', 'ask question', 'cancel order', 'track order']
                }
            }),
        }
    );

    const data = await response.json();

    return {
        intent: {
            action: data.labels?.[0] || 'unknown',
            items: [text],
            quantity: 1,
        },
        confidence: data.scores?.[0] || 0.5,
        provider: 'huggingface',
    };
}
