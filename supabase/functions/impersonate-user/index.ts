// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status: number) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json", ...corsHeaders }
    });
}

serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { status: 200, headers: corsHeaders });

    try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL');
        const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

        if (!supabaseUrl || !serviceRoleKey) {
            throw new Error("Server misconfigured");
        }

        const supabase = createClient(supabaseUrl, serviceRoleKey);

        // Get authenticated user
        const authHeader = req.headers.get("Authorization");
        if (!authHeader) throw new Error("Missing Authorization header");

        const token = authHeader.replace("Bearer ", "");
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);

        if (authError || !user) {
            console.error("Auth error:", authError);
            throw new Error("Unauthorized");
        }

        // Verify user is super admin
        const { data: userRole, error: roleError } = await supabase
            .from("user_roles")
            .select("role")
            .eq("user_id", user.id)
            .eq("role", "super_admin")
            .maybeSingle();

        if (roleError || !userRole) {
            throw new Error("Forbidden: Super admin access required");
        }

        const url = new URL(req.url);
        const action = url.pathname.split('/').pop();

        // Handle end impersonation
        if (action === 'end-impersonation' && req.method === 'POST') {
            const { session_id } = await req.json();

            if (!session_id) {
                return json({ error: "Missing session_id" }, 400);
            }

            const { data: result, error: endError } = await supabase
                .rpc('end_impersonation_session', { p_session_id: session_id });

            if (endError) {
                console.error("End impersonation error:", endError);
                throw new Error("Failed to end impersonation session");
            }

            if (!result) {
                return json({ error: "Session not found or already ended" }, 404);
            }

            return json({
                success: true,
                ended_at: new Date().toISOString()
            }, 200);
        }

        // Handle start impersonation
        if (req.method === 'POST') {
            const payload = await req.json();
            const { restaurant_id, target_user_id, is_read_only = true } = payload;

            if (!restaurant_id || !target_user_id) {
                return json({ error: "Missing required fields: restaurant_id and target_user_id" }, 400);
            }

            // Rate limiting - check recent impersonations
            const { count: recentCount } = await supabase
                .from("impersonation_sessions")
                .select("*", { count: "exact", head: true })
                .eq("super_admin_id", user.id)
                .gte("created_at", new Date(Date.now() - 60 * 60 * 1000).toISOString());

            if (recentCount !== null && recentCount >= 10) {
                console.warn(`Rate limit exceeded for super admin: ${user.id}`);
                return json({ error: "Rate limit exceeded. Maximum 10 impersonations per hour." }, 429);
            }

            // Verify target user exists and has access to restaurant
            const { data: targetUserRole, error: targetError } = await supabase
                .from("user_roles")
                .select("role, user_id, profiles(email, full_name)")
                .eq("user_id", target_user_id)
                .eq("restaurant_id", restaurant_id)
                .maybeSingle();

            if (targetError || !targetUserRole) {
                return json({ error: "Target user not found or does not have access to this restaurant" }, 404);
            }

            // Verify restaurant exists
            const { data: restaurant, error: restaurantError } = await supabase
                .from("restaurants")
                .select("id, name, slug")
                .eq("id", restaurant_id)
                .single();

            if (restaurantError || !restaurant) {
                return json({ error: "Restaurant not found" }, 404);
            }

            // End any existing active sessions for this super admin
            await supabase
                .from("impersonation_sessions")
                .update({ ended_at: new Date().toISOString() })
                .eq("super_admin_id", user.id)
                .is("ended_at", null);

            // Generate unique session token
            const sessionToken = crypto.randomUUID();

            // Get client info
            const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown';
            const userAgent = req.headers.get('user-agent') || 'unknown';

            // Create impersonation session
            const { data: session, error: sessionError } = await supabase
                .from("impersonation_sessions")
                .insert({
                    super_admin_id: user.id,
                    target_user_id,
                    restaurant_id,
                    is_read_only,
                    session_token: sessionToken,
                    ip_address: clientIp,
                    user_agent: userAgent,
                    metadata: {
                        super_admin_email: user.email,
                        target_user_email: targetUserRole.profiles?.email,
                        restaurant_name: restaurant.name
                    }
                })
                .select()
                .single();

            if (sessionError) {
                console.error("Session creation error:", sessionError);
                throw new Error("Failed to create impersonation session");
            }

            // Generate impersonation URL
            const baseUrl = supabaseUrl.replace('.supabase.co', '.app') || 'http://localhost:8080';
            const impersonationUrl = `${baseUrl}/admin?impersonate_token=${sessionToken}`;

            console.log(`Impersonation session created: ${session.id} by ${user.email} for ${targetUserRole.profiles?.email}`);

            return json({
                session_id: session.id,
                impersonation_url: impersonationUrl,
                expires_at: session.expires_at,
                is_read_only: session.is_read_only,
                restaurant: {
                    id: restaurant.id,
                    name: restaurant.name,
                    slug: restaurant.slug
                },
                target_user: {
                    id: target_user_id,
                    email: targetUserRole.profiles?.email,
                    full_name: targetUserRole.profiles?.full_name
                }
            }, 200);
        }

        return json({ error: "Method not allowed" }, 405);

    } catch (error: any) {
        console.error("Impersonate user error:", error);
        return json({ error: error.message || "Internal server error" }, 500);
    }
});
