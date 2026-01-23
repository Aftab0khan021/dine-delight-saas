// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      throw new Error("Server misconfigured");
    }

    // Create admin client
    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: { persistSession: false },
    });

    // 1. Get authenticated user from JWT (already verified by Supabase if verify_jwt = true)
    // When verify_jwt is enabled, Supabase injects the user info into the request
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing Authorization header");

    // Extract and verify the JWT
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      console.error("Auth error:", authError);
      throw new Error("Unauthorized");
    }

    // 2. Rate Limiting - Prevent abuse
    // Check how many invites this user has sent in the last 15 minutes
    const { count: recentInvites } = await supabase
      .from("staff_invites")
      .select("*", { count: "exact", head: true })
      .eq("invited_by", user.id)
      .gte("created_at", new Date(Date.now() - 15 * 60 * 1000).toISOString());

    if (recentInvites !== null && recentInvites >= 10) {
      console.warn(`Rate limit exceeded for user: ${user.id}`);
      return new Response(
        JSON.stringify({ error: "Too many invite requests. Please wait 15 minutes." }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 429,
        }
      );
    }

    // 3. Parse Payload
    const payload = await req.json();
    const { email, restaurant_id, role, action } = payload;

    if (!restaurant_id) throw new Error("Missing restaurant_id");

    // 4. Authorize User (Check Permissions)
    const { data: userRole, error: roleError } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("restaurant_id", restaurant_id)
      .maybeSingle();

    if (roleError || !userRole || !["owner", "restaurant_admin"].includes(userRole.role)) {
      throw new Error("Forbidden: You do not have permission to manage staff for this restaurant.");
    }

    // 5. Perform Action
    if (action === "resend") {
      if (!email) throw new Error("Missing email for resend");
      const { data, error } = await supabase.auth.admin.inviteUserByEmail(email, {
        data: { restaurant_id, role: role || "user" },
      });
      if (error) throw error;
      return new Response(JSON.stringify({ success: true, message: "Invite resent" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    // New Invite
    if (!email) throw new Error("Missing email");

    const { data, error } = await supabase.auth.admin.inviteUserByEmail(email, {
      data: {
        restaurant_id,
        role: role || "user",
      },
    });

    if (error) throw error;

    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error: any) {
    console.error("Function error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
