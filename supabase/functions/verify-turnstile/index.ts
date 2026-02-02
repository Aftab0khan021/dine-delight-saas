
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
    // Handle CORS preflight requests
    if (req.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders })
    }

    try {
        const { token, ip } = await req.json()
        const secretKey = Deno.env.get('TURNSTILE_SECRET_KEY')

        if (!secretKey) {
            console.error('Missing TURNSTILE_SECRET_KEY')
            return new Response(
                JSON.stringify({ error: 'Server configuration error' }),
                { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        if (!token) {
            return new Response(
                JSON.stringify({ error: 'Token is required' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        // Verify with Cloudflare
        const formData = new FormData()
        formData.append('secret', secretKey)
        formData.append('response', token)
        if (ip) {
            formData.append('remoteip', ip)
        }

        const result = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
            method: 'POST',
            body: formData,
        })

        const outcome = await result.json()

        if (outcome.success) {
            return new Response(
                JSON.stringify({ success: true, ...outcome }),
                { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        } else {
            console.error('Turnstile verification failed:', outcome)
            return new Response(
                JSON.stringify({ success: false, error: 'Verification failed', details: outcome['error-codes'] }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }
    } catch (error) {
        console.error('Error verifying turnstile:', error)
        return new Response(
            JSON.stringify({ error: error.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    }
})
