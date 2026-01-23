import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
    // Handle CORS preflight requests
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        // Create Supabase client with service role key for admin operations
        const supabaseAdmin = createClient(
            Denv.get("SUPABASE_URL") ?? "",
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
            {
                auth: {
                    autoRefreshToken: false,
                    persistSession: false,
                },
            }
        );

        // Verify the requesting user is a super admin
        const authHeader = req.headers.get("Authorization")!;
        const token = authHeader.replace("Bearer ", "");
        const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

        if (authError || !user) {
            return new Response(
                JSON.stringify({ error: "Unauthorized" }),
                { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        // Check if user is super admin
        const { data: roles } = await supabaseAdmin
            .from("user_roles")
            .select("role")
            .eq("user_id", user.id)
            .eq("role", "super_admin")
            .single();

        if (!roles) {
            return new Response(
                JSON.stringify({ error: "Forbidden - Super admin access required" }),
                { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        // Parse request body
        const { action, userId, reason } = await req.json();

        if (!action || !userId) {
            return new Response(
                JSON.stringify({ error: "Missing required parameters: action, userId" }),
                { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        let result;

        switch (action) {
            case "disable":
                // Ban user (sets banned_until to far future)
                const { data: disableData, error: disableError } = await supabaseAdmin.auth.admin.updateUserById(
                    userId,
                    { ban_duration: "876000h" } // 100 years
                );

                if (disableError) throw disableError;

                // Log the action
                await supabaseAdmin.from("super_admin_audit_log").insert({
                    admin_user_id: user.id,
                    action: "user_disabled",
                    entity_type: "user",
                    entity_id: userId,
                    metadata: { reason: reason || "No reason provided" },
                });

                result = { success: true, message: "User disabled successfully" };
                break;

            case "enable":
                // Remove ban
                const { data: enableData, error: enableError } = await supabaseAdmin.auth.admin.updateUserById(
                    userId,
                    { ban_duration: "none" }
                );

                if (enableError) throw enableError;

                // Log the action
                await supabaseAdmin.from("super_admin_audit_log").insert({
                    admin_user_id: user.id,
                    action: "user_enabled",
                    entity_type: "user",
                    entity_id: userId,
                    metadata: { reason: reason || "No reason provided" },
                });

                result = { success: true, message: "User enabled successfully" };
                break;

            case "force_logout":
                // Sign out user from all sessions
                const { error: signOutError } = await supabaseAdmin.auth.admin.signOut(userId);

                if (signOutError) throw signOutError;

                // Log the action
                await supabaseAdmin.from("super_admin_audit_log").insert({
                    admin_user_id: user.id,
                    action: "user_force_logout",
                    entity_type: "user",
                    entity_id: userId,
                    metadata: { reason: reason || "Forced logout by admin" },
                });

                result = { success: true, message: "User logged out from all sessions" };
                break;

            case "delete":
                // Get user info before deletion for logging
                const { data: userToDelete } = await supabaseAdmin.auth.admin.getUserById(userId);

                // Delete user (this will cascade delete related records based on your DB schema)
                const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(userId);

                if (deleteError) throw deleteError;

                // Log the action
                await supabaseAdmin.from("super_admin_audit_log").insert({
                    admin_user_id: user.id,
                    action: "user_deleted",
                    entity_type: "user",
                    entity_id: userId,
                    metadata: {
                        reason: reason || "No reason provided",
                        deleted_email: userToDelete?.user?.email
                    },
                });

                result = { success: true, message: "User deleted successfully" };
                break;

            default:
                return new Response(
                    JSON.stringify({ error: `Unknown action: ${action}` }),
                    { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
                );
        }

        return new Response(
            JSON.stringify(result),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );

    } catch (error) {
        console.error("Error in manage-user function:", error);
        return new Response(
            JSON.stringify({ error: error.message }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
});
