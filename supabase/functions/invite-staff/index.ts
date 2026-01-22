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
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      throw new Error("Server misconfigured");
    }

    // 1. Authenticate User (Client Context)
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing Authorization header");

    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) throw new Error("Unauthorized");

    // 2. Parse Payload
    const payload = await req.json();
    const { email, restaurant_id, role, action } = payload;

    if (!restaurant_id) throw new Error("Missing restaurant_id");

    // 3. Authorize User (Check Permissions)
    // Check if the authenticated user is an admin/owner of this restaurant
    const { data: userRole, error: roleError } = await supabaseClient
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("restaurant_id", restaurant_id)
      .maybeSingle();

    if (roleError || !userRole || !["owner", "restaurant_admin"].includes(userRole.role)) {
      throw new Error("Forbidden: You do not have permission to manage staff for this restaurant.");
    }

    // 4. Perform Action (Admin Context)
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: { persistSession: false },
    });

    // Handle "resend" or new invite
    // inviteUserByEmail handles both (sends a new link if user exists/invited)
    if (action === "resend") {
      if (!email) throw new Error("Missing email for resend");
      // For resend, we typically just re-trigger the invite.
      // Supabase doesn't have a specific "resend" API other than `resend` on auth api 
      // but that requires email only, not context. 
      // Re-inviting often works.
      const { data, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
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

    const { data, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
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
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
