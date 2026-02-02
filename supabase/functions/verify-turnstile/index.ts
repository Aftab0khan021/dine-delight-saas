
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
        const { token } = await req.json()

        // Detect environment based on Origin or Referer header
        const origin = req.headers.get('origin') || req.headers.get('referer') || ''
        const isProduction = origin.includes('yourdomain.com') // Replace with your actual production domain

        // Use environment-specific secret key
        // For preview/development: use testing key
        // For production: use real secret key
        const secretKey = isProduction
            ? Deno.env.get('TURNSTILE_SECRET_KEY_PROD')
            : Deno.env.get('TURNSTILE_SECRET_KEY_DEV') || '1x0000000000000000000000000000000AA'

        if (!secretKey) {
            console.error('Missing Turnstile secret key for environment:', { isProduction, origin })
            return new Response(
                JSON.stringify({ error: 'Server configuration error' }),
                { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        console.log('Turnstile verification:', { isProduction, origin: origin.substring(0, 50) })

        if (!token) {
            return new Response(
                JSON.stringify({ error: 'Token is required' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        // Extract real IP from edge runtime headers (prevent spoofing)
        const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0].trim()
            || req.headers.get('cf-connecting-ip')
            || 'unknown';

        // Verify with Cloudflare
        const formData = new FormData()
        formData.append('secret', secretKey)
        formData.append('response', token)
        formData.append('remoteip', clientIp) // Use server-extracted IP

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
