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

    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: { persistSession: false },
    });

    const body = await req.json();
    const { token, fullName, password } = body as {
      token: string;
      fullName: string;
      password: string;
    };

    if (!token || !fullName?.trim() || !password) {
      return new Response(
        JSON.stringify({ error: "Missing required fields (token, fullName, password)" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    if (password.length < 8) {
      return new Response(
        JSON.stringify({ error: "Password must be at least 8 characters" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    // 1. Claim the token atomically using the RPC function
    const { data: claimResult, error: claimError } = await supabase
      .rpc("claim_invitation_token", { p_token: token });

    if (claimError) {
      console.error("Token claim RPC error:", claimError);
      return new Response(
        JSON.stringify({ error: "Failed to claim token: " + claimError.message }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
      );
    }

    if (!claimResult?.success) {
      return new Response(
        JSON.stringify({ error: claimResult?.error || "Token not found, expired, or already used" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    const { email, restaurant_id, staff_category_id, role } = claimResult;

    console.log("✅ Token claimed for:", email, "restaurant:", restaurant_id);

    // 2. Create user via admin API (bypasses CAPTCHA)
    const { data: authData, error: createError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // Auto-confirm since they have a valid token
      user_metadata: {
        full_name: fullName.trim(),
        restaurant_id,
        staff_category_id,
        role: role || "user",
      },
    });

    if (createError) {
      console.error("User creation error:", createError);

      // Rollback: un-claim the token so it can be used again
      await supabase
        .from("invitation_tokens")
        .update({ used_at: null })
        .eq("email", email)
        .eq("restaurant_id", restaurant_id);

      return new Response(
        JSON.stringify({ error: "Failed to create account: " + createError.message }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
      );
    }

    const userId = authData.user.id;
    console.log("✅ User created:", userId);

    // 3. Ensure user_roles entry exists
    const { data: existingRole } = await supabase
      .from("user_roles")
      .select("user_id")
      .eq("user_id", userId)
      .eq("restaurant_id", restaurant_id)
      .maybeSingle();

    if (!existingRole) {
      const { error: roleError } = await supabase
        .from("user_roles")
        .insert({
          user_id: userId,
          restaurant_id,
          role: role || "user",
          staff_category_id: staff_category_id || null,
        });

      if (roleError) {
        console.error("Role insert error:", roleError);
      } else {
        console.log("✅ User role assigned");
      }
    }

    // 4. Ensure profile exists
    const { data: existingProfile } = await supabase
      .from("profiles")
      .select("id")
      .eq("id", userId)
      .maybeSingle();

    if (!existingProfile) {
      await supabase
        .from("profiles")
        .insert({
          id: userId,
          email,
          full_name: fullName.trim(),
        });
    }

    // 5. Update staff_invites status
    await supabase
      .from("staff_invites")
      .update({ status: "accepted", accepted_at: new Date().toISOString() })
      .eq("email", email)
      .eq("restaurant_id", restaurant_id)
      .eq("status", "pending");

    console.log("✅ Invitation accepted successfully");

    return new Response(
      JSON.stringify({
        success: true,
        message: "Account created successfully",
        email,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );

  } catch (error: unknown) {
    console.error("❌ Unexpected error:", error);
    const message = error instanceof Error ? error.message : String(error);
    return new Response(
      JSON.stringify({ error: message || "Internal server error" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
