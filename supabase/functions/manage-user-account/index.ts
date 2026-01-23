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

        const supabase = createClient(supabaseUrl, serviceRoleKey, {
            auth: {
                autoRefreshToken: false,
                persistSession: false
            }
        });

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

        const payload = await req.json();
        const { action, user_id, reason } = payload;

        if (!action || !user_id) {
            return json({ error: "Missing required fields: action and user_id" }, 400);
        }

        // Rate limiting - check recent actions
        const { count: recentCount } = await supabase
            .from("super_admin_audit_log")
            .select("*", { count: "exact", head: true })
            .eq("admin_user_id", user.id)
            .in("action", ["user_password_reset", "user_force_logout", "user_account_disabled", "user_account_enabled"])
            .gte("created_at", new Date(Date.now() - 60 * 60 * 1000).toISOString());

        if (recentCount !== null && recentCount >= 20) {
            console.warn(`Rate limit exceeded for super admin: ${user.id}`);
            return json({ error: "Rate limit exceeded. Maximum 20 user management actions per hour." }, 429);
        }

        // Get target user info
        const { data: targetUser, error: targetError } = await supabase
            .from("profiles")
            .select("id, email, full_name, account_status")
            .eq("id", user_id)
            .single();

        if (targetError || !targetUser) {
            return json({ error: "User not found" }, 404);
        }

        let result: any = {};
        let auditAction = "";
        let auditMetadata: any = {};

        switch (action) {
            case "reset_password": {
                // Generate password reset link
                const { data: resetData, error: resetError } = await supabase.auth.admin.generateLink({
                    type: 'recovery',
                    email: targetUser.email,
                });

                if (resetError) {
                    console.error("Password reset error:", resetError);
                    throw new Error("Failed to generate password reset link");
                }

                auditAction = "user_password_reset";
                auditMetadata = {
                    target_user_email: targetUser.email,
                    reason: reason || "Password reset requested by super admin"
                };

                result = {
                    success: true,
                    message: `Password reset email sent to ${targetUser.email}`,
                    reset_link: resetData.properties?.action_link // For testing, remove in production
                };
                break;
            }

            case "force_logout": {
                // Sign out user (revoke all sessions)
                const { error: signOutError } = await supabase.auth.admin.signOut(user_id);

                if (signOutError) {
                    console.error("Force logout error:", signOutError);
                    throw new Error("Failed to force logout user");
                }

                auditAction = "user_force_logout";
                auditMetadata = {
                    target_user_email: targetUser.email,
                    reason: reason || "Force logout by super admin"
                };

                result = {
                    success: true,
                    message: `User ${targetUser.email} has been logged out`
                };
                break;
            }

            case "disable_account": {
                // Disable user account using database function
                const { data: disableResult, error: disableError } = await supabase
                    .rpc('disable_user_account', {
                        p_user_id: user_id,
                        p_reason: reason || "Account disabled by super admin"
                    });

                if (disableError) {
                    console.error("Disable account error:", disableError);
                    throw new Error("Failed to disable user account");
                }

                if (!disableResult) {
                    return json({ error: "Account is already disabled" }, 400);
                }

                // Also sign out the user
                await supabase.auth.admin.signOut(user_id);

                auditAction = "user_account_disabled";
                auditMetadata = {
                    target_user_email: targetUser.email,
                    reason: reason || "Account disabled by super admin"
                };

                result = {
                    success: true,
                    message: `Account ${targetUser.email} has been disabled`
                };
                break;
            }

            case "enable_account": {
                // Enable user account using database function
                const { data: enableResult, error: enableError } = await supabase
                    .rpc('enable_user_account', {
                        p_user_id: user_id
                    });

                if (enableError) {
                    console.error("Enable account error:", enableError);
                    throw new Error("Failed to enable user account");
                }

                if (!enableResult) {
                    return json({ error: "Account is not disabled" }, 400);
                }

                auditAction = "user_account_enabled";
                auditMetadata = {
                    target_user_email: targetUser.email
                };

                result = {
                    success: true,
                    message: `Account ${targetUser.email} has been enabled`
                };
                break;
            }

            default:
                return json({ error: `Unknown action: ${action}` }, 400);
        }

        // Log the action manually (in addition to database function logging)
        await supabase
            .from("super_admin_audit_log")
            .insert({
                admin_user_id: user.id,
                action: auditAction,
                entity_type: "user",
                entity_id: user_id,
                metadata: auditMetadata
            });

        console.log(`User management action: ${action} by ${user.email} for ${targetUser.email}`);

        return json(result, 200);

    } catch (error: any) {
        console.error("Manage user account error:", error);
        return json({ error: error.message || "Internal server error" }, 500);
    }
});
