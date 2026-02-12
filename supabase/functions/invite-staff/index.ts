// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
};

// Resend API configuration
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";

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

    // Get authorization header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 401,
        }
      );
    }

    // Verify the user
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      console.error("Auth error:", authError);
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 401,
        }
      );
    }

    console.log("✅ User authenticated:", user.id);

    // Check if user is restaurant_admin
    const { data: userRoles, error: rolesError } = await supabase
      .from("user_roles")
      .select("role, restaurant_id")
      .eq("user_id", user.id)
      .or("role.eq.restaurant_admin,role.eq.owner");

    if (rolesError) {
      console.error("Roles query error:", rolesError);
      return new Response(
        JSON.stringify({ error: "Failed to verify permissions" }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 500,
        }
      );
    }

    if (!userRoles || userRoles.length === 0) {
      return new Response(
        JSON.stringify({ error: "Insufficient permissions" }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 403,
        }
      );
    }

    const restaurant_id = userRoles[0].restaurant_id;
    console.log("🏢 Restaurant ID:", restaurant_id);

    // Parse request body
    const { email, staffCategoryId } = await req.json();

    if (!email) {
      return new Response(
        JSON.stringify({ error: "Missing email" }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        }
      );
    }

    console.log("📧 Inviting:", email);
    console.log("📋 Staff Category ID:", staffCategoryId);

    // Check if user already exists
    const { data: existingUsers } = await supabase.auth.admin.listUsers();
    const existingUser = existingUsers?.users.find(u => u.email === email);

    if (existingUser) {
      return new Response(
        JSON.stringify({ error: "User with this email already exists" }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        }
      );
    }

    // Generate secure invitation token
    const invitationToken = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes from now

    console.log("🔑 Generated token:", invitationToken);
    console.log("⏰ Expires at:", expiresAt.toISOString());

    // Store invitation token in database
    const { error: tokenError } = await supabase
      .from("invitation_tokens")
      .insert({
        email,
        token: invitationToken,
        restaurant_id,
        staff_category_id: staffCategoryId || null,
        role: 'user',
        expires_at: expiresAt.toISOString(),
        created_by: user.id,
      });

    if (tokenError) {
      console.error("❌ Token creation error:", tokenError);
      return new Response(
        JSON.stringify({ error: "Failed to create invitation token" }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 500,
        }
      );
    }

    console.log("✅ Token stored in database");

    // Get restaurant name for email
    const { data: restaurant } = await supabase
      .from("restaurants")
      .select("name")
      .eq("id", restaurant_id)
      .single();

    const restaurantName = restaurant?.name || "the restaurant";

    // Create invitation link
    const appUrl = supabaseUrl.replace('.supabase.co', '.vercel.app');
    const invitationLink = `${appUrl}/auth/accept-invitation?token=${invitationToken}`;

    console.log("🔗 Invitation link:", invitationLink);

    // Send custom email via Resend
    const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 600px;
      margin: 0 auto;
      padding: 20px;
    }
    .container {
      background: #ffffff;
      border-radius: 8px;
      padding: 40px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    h1 {
      color: #1a1a1a;
      margin-bottom: 20px;
    }
    .button {
      display: inline-block;
      background: #2563eb;
      color: #ffffff !important;
      padding: 14px 28px;
      text-decoration: none;
      border-radius: 6px;
      margin: 20px 0;
      font-weight: 600;
    }
    .expiry {
      color: #666;
      font-size: 14px;
      margin-top: 20px;
    }
    .footer {
      color: #999;
      font-size: 12px;
      margin-top: 30px;
      padding-top: 20px;
      border-top: 1px solid #eee;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>🎉 You're Invited!</h1>
    <p>You've been invited to join <strong>${restaurantName}</strong> as a staff member.</p>
    
    <p>Click the button below to accept your invitation and set your password:</p>
    
    <a href="${invitationLink}" class="button">Accept Invitation</a>
    
    <p class="expiry">⏰ This invitation expires in 30 minutes.</p>
    
    <p class="footer">
      If you didn't expect this invitation, you can safely ignore this email.
    </p>
  </div>
</body>
</html>
    `;

    if (!RESEND_API_KEY) {
      console.warn("⚠️ RESEND_API_KEY not configured, skipping email send");
      return new Response(
        JSON.stringify({
          success: true,
          message: "Invitation created (email not sent - RESEND_API_KEY missing)",
          invitationLink // Return link for testing
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        }
      );
    }

    // Send email via Resend
    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Dine Delight <onboarding@resend.dev>", // Replace with your verified domain
        to: [email],
        subject: `You're invited to join ${restaurantName}`,
        html: emailHtml,
      }),
    });

    if (!emailResponse.ok) {
      const errorText = await emailResponse.text();
      console.error("❌ Email send error:", errorText);

      // Delete the token since email failed
      await supabase
        .from("invitation_tokens")
        .delete()
        .eq("token", invitationToken);

      return new Response(
        JSON.stringify({ error: "Failed to send invitation email" }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 500,
        }
      );
    }

    const emailResult = await emailResponse.json();
    console.log("✅ Email sent:", emailResult);

    // Record invitation in staff_invites table (for tracking)
    try {
      await supabase
        .from("staff_invites")
        .insert({
          email,
          restaurant_id,
          invited_by: user.id,
          status: 'pending',
        });
    } catch (inviteError) {
      console.warn("⚠️ Failed to record in staff_invites:", inviteError);
      // Non-critical, continue
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "Invitation sent successfully",
        expiresAt: expiresAt.toISOString(),
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );

  } catch (error) {
    console.error("❌ Unexpected error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
