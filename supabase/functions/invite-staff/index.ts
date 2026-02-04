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

    // 0. IP-based Rate Limiting (Prevent Anonymous Spam)
    // Note: This is optional and will be skipped if ip_address column doesn't exist
    const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown';

    if (clientIp !== 'unknown') {
      try {
        const { count: ipInvites } = await supabase
          .from("staff_invites")
          .select("*", { count: "exact", head: true })
          .eq("ip_address", clientIp)
          .gte("created_at", new Date(Date.now() - 60 * 60 * 1000).toISOString()); // Last hour

        if (ipInvites !== null && ipInvites >= 5) {
          console.warn(`IP rate limit exceeded: ${clientIp}`);
          return new Response(
            JSON.stringify({ error: "Too many requests from this IP. Please try again later." }),
            {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
              status: 429,
            }
          );
        }
      } catch (ipError) {
        // IP rate limiting is optional - continue if column doesn't exist
        console.log("IP rate limiting skipped:", ipError);
      }
    }

    // 1. Get authenticated user from JWT (Manual verification for security)
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

    // Helper function to check if a string is a valid UUID
    const isUUID = (str: string) => {
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      return uuidRegex.test(str);
    };

    // Determine if 'role' is a staff category ID or a legacy role
    let actualRole = "user"; // Default role
    let staffCategoryId = null;

    if (role) {
      if (isUUID(role)) {
        // It's a staff category ID
        staffCategoryId = role;
        // For category-based staff, default to 'user' role
        // The permissions will be determined by the category
        actualRole = "user";
      } else if (["user", "restaurant_admin"].includes(role)) {
        // It's a legacy role
        actualRole = role;
      } else {
        throw new Error(`Invalid role: ${role}`);
      }
    }

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

      const inviteData: any = { restaurant_id, role: actualRole };
      if (staffCategoryId) {
        inviteData.staff_category_id = staffCategoryId;
      }

      const { data, error } = await supabase.auth.admin.inviteUserByEmail(email, {
        data: inviteData,
      });
      if (error) throw error;
      return new Response(JSON.stringify({ success: true, message: "Invite resent" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    // New Invite
    if (!email) throw new Error("Missing email");

    const inviteData: any = { restaurant_id, role: actualRole };
    if (staffCategoryId) {
      inviteData.staff_category_id = staffCategoryId;
    }

    const { data, error } = await supabase.auth.admin.inviteUserByEmail(email, {
      data: inviteData,
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
