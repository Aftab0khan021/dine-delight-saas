// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
};

// Gmail SMTP configuration
const GMAIL_USER = Deno.env.get("GMAIL_USER") ?? "";
const GMAIL_APP_PASSWORD = Deno.env.get("GMAIL_APP_PASSWORD") ?? "";

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

    // Check if user is restaurant_admin and load all restaurants they manage
    const { data: userRoles, error: rolesError } = await supabase
      .from("user_roles")
      .select("role, restaurant_id")
      .eq("user_id", user.id)
      .eq("role", "restaurant_admin");

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

    // Parse request body
    const body = await req.json();
    const {
      email,
      restaurantId,
      staffCategoryId,
      role,
      action,
    } = body as {
      email?: string;
      restaurantId?: string;
      staffCategoryId?: string | null;
      role?: string | null;
      action?: string | null;
    };

    if (!email) {
      return new Response(
        JSON.stringify({ error: "Missing email" }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        }
      );
    }

    // Determine target restaurant: prefer explicit restaurantId from client, but
    // ensure it belongs to the authenticated admin.
    const targetRestaurantId = restaurantId ?? userRoles[0].restaurant_id;
    const hasAccessToRestaurant = userRoles.some(
      (r) => r.restaurant_id === targetRestaurantId,
    );

    if (!hasAccessToRestaurant) {
      return new Response(
        JSON.stringify({ error: "You do not manage this restaurant" }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 403,
        },
      );
    }

    console.log("🏢 Restaurant ID:", targetRestaurantId);
    console.log("📧 Inviting:", email);
    console.log("📋 Staff Category ID:", staffCategoryId);
    console.log("🛡 Role (if provided):", role);
    console.log("🔁 Action:", action);

    // Check if user already exists (use direct lookup instead of paginated list)
    const { data: existingUser, error: existingUserError } =
      await supabase.auth.admin.getUserByEmail(email);

    if (existingUserError) {
      console.error("getUserByEmail error:", existingUserError);
      return new Response(
        JSON.stringify({ error: "Failed to verify existing users" }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 500,
        },
      );
    }

    if (existingUser) {
      // If this is a resend/new invite for someone who already has an account,
      // they should just log in instead.
      return new Response(
        JSON.stringify({ error: "A user with this email already exists. They can log in directly." }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        },
      );
    }

    // ── RESEND FLOW ──
    // If action === "resend", expire the old token and continue to create a new one.
    if (action === "resend") {
      // Mark all old tokens for this email+restaurant as expired
      await supabase
        .from("invitation_tokens")
        .update({ used_at: new Date().toISOString() })
        .eq("email", email)
        .eq("restaurant_id", targetRestaurantId)
        .is("used_at", null);

      // Update existing staff_invites to 'expired'
      await supabase
        .from("staff_invites")
        .update({ status: "expired" })
        .eq("email", email)
        .eq("restaurant_id", targetRestaurantId)
        .eq("status", "pending");

      console.log("🔁 Resend: old tokens expired, creating new ones");
    }

    // Enforce staff limit on the backend as well
    const { data: staffLimit, error: staffLimitError } = await supabase.rpc(
      "get_feature_limit_for_restaurant",
      {
        p_restaurant_id: targetRestaurantId,
        p_feature_key: "staff_limit",
      },
    );

    if (staffLimitError) {
      console.error("Staff limit RPC error:", staffLimitError);
      return new Response(
        JSON.stringify({ error: "Failed to check staff limit" }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 500,
        },
      );
    }

    if (typeof staffLimit === "number" && staffLimit !== -1) {
      // Count current active staff
      const { count: activeStaffCount, error: staffCountError } = await supabase
        .from("user_roles")
        .select("user_id", { count: "exact", head: true })
        .eq("restaurant_id", targetRestaurantId)
        .in("role", ["restaurant_admin", "user"]);

      if (staffCountError) {
        console.error("Staff count error:", staffCountError);
        return new Response(
          JSON.stringify({ error: "Failed to check staff limit" }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 500,
          },
        );
      }

      // Count pending invites
      const { count: pendingInvitesCount, error: invitesCountError } =
        await supabase
          .from("staff_invites")
          .select("id", { count: "exact", head: true })
          .eq("restaurant_id", targetRestaurantId)
          .eq("status", "pending");

      if (invitesCountError) {
        console.error("Invites count error:", invitesCountError);
        return new Response(
          JSON.stringify({ error: "Failed to check staff limit" }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 500,
          },
        );
      }

      const totalPlannedStaff =
        (activeStaffCount ?? 0) + (pendingInvitesCount ?? 0);

      if (totalPlannedStaff >= staffLimit) {
        return new Response(
          JSON.stringify({
            error:
              "Staff limit reached for this restaurant. Please upgrade your plan to invite more staff.",
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 400,
          },
        );
      }
    }

    // Basic IP-based rate limiting using staff_invites.ip_address
    const forwardedFor = req.headers.get("x-forwarded-for") || "";
    const ipAddress = forwardedFor.split(",")[0]?.trim() || null;

    if (ipAddress) {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const { count: recentFromIp, error: rateError } = await supabase
        .from("staff_invites")
        .select("id", { count: "exact", head: true })
        .eq("ip_address", ipAddress)
        .gte("created_at", oneHourAgo);

      if (rateError) {
        console.error("Rate limiting query error:", rateError);
      } else if ((recentFromIp ?? 0) > 20) {
        // More than 20 invites from same IP in last hour
        return new Response(
          JSON.stringify({
            error:
              "Too many invitations sent from this IP address. Please try again later.",
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 429,
          },
        );
      }
    }

    // Generate secure invitation token
    const invitationToken = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    console.log("🔑 Generated token:", invitationToken);
    console.log("⏰ Expires at:", expiresAt.toISOString());

    // Store invitation token in database. Role defaults to 'user' if not provided.
    const effectiveRole = role && role.length > 0 ? role : "user";

    // Store invitation token in database
    const { error: tokenError } = await supabase
      .from("invitation_tokens")
      .insert({
        email,
        token: invitationToken,
        restaurant_id: targetRestaurantId,
        staff_category_id: staffCategoryId || null,
        role: effectiveRole,
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
      .eq("id", targetRestaurantId)
      .single();

    const restaurantName = restaurant?.name || "the restaurant";

    // Create invitation link
    const appUrl =
      Deno.env.get("APP_BASE_URL") ??
      "https://dine-delight-saas.vercel.app";
    const invitationLink = `${appUrl}/auth/accept-invitation?token=${invitationToken}`;

    console.log("🔗 Invitation link:", invitationLink);

    // Create email HTML
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
    
    <p class="expiry">⏰ This invitation expires in 24 hours.</p>
    
    <p class="footer">
      If you didn't expect this invitation, you can safely ignore this email.
    </p>
  </div>
</body>
</html>
    `;

    if (!GMAIL_USER || !GMAIL_APP_PASSWORD) {
      console.warn("⚠️ Gmail SMTP not configured, skipping email send");
      return new Response(
        JSON.stringify({
          success: true,
          message: "Invitation created (email not sent - Gmail SMTP not configured)",
          invitationLink // Return link for testing
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        }
      );
    }

    // Send email via Gmail SMTP
    try {
      const client = new SMTPClient({
        connection: {
          hostname: "smtp.gmail.com",
          port: 465,
          tls: true,
          auth: {
            username: GMAIL_USER,
            password: GMAIL_APP_PASSWORD,
          },
        },
      });

      await client.send({
        from: `Dine Delight <${GMAIL_USER}>`,
        to: email,
        subject: `You're invited to join ${restaurantName}`,
        content: emailHtml,
        html: emailHtml,
      });

      await client.close();

      console.log("✅ Email sent via Gmail SMTP");
    } catch (emailError: unknown) {
      console.error("❌ Email send error:", emailError);

      const emailErrorMessage =
        emailError instanceof Error
          ? emailError.message
          : String(emailError);

      // Delete the token since email failed
      await supabase
        .from("invitation_tokens")
        .delete()
        .eq("token", invitationToken);

      return new Response(
        JSON.stringify({
          error: "Failed to send invitation email: " + emailErrorMessage,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 500,
        }
      );
    }

    // Helper: compute a stable token hash for staff_invites tracking
    async function sha256Hex(value: string): Promise<string> {
      const encoder = new TextEncoder();
      const data = encoder.encode(value);
      const hash = await crypto.subtle.digest("SHA-256", data);
      return Array.from(new Uint8Array(hash))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    }

    const tokenHash = await sha256Hex(invitationToken);

    // Record invitation in staff_invites table (for tracking)
    try {
      await supabase
        .from("staff_invites")
        .insert({
          email,
          restaurant_id: targetRestaurantId,
          invited_by: user.id,
          role: effectiveRole,
          status: 'pending',
          token_hash: tokenHash,
          expires_at: expiresAt.toISOString(),
          ip_address: ipAddress,
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

  } catch (error: unknown) {
    console.error("❌ Unexpected error:", error);
    const message = error instanceof Error ? error.message : String(error);
    return new Response(
      JSON.stringify({ error: message || "Internal server error" }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
