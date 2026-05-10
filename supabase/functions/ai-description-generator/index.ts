// supabase/functions/ai-description-generator/index.ts
// Generates appetizing menu item descriptions using the restaurant's configured AI provider
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing authorization");

    // Create Supabase client with user's JWT
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    // Verify user and get their restaurant
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) throw new Error("Unauthorized");

    const { data: userRole } = await supabaseClient
      .from("user_roles")
      .select("restaurant_id")
      .eq("user_id", user.id)
      .neq("role", "super_admin")
      .limit(1)
      .single();

    if (!userRole?.restaurant_id) throw new Error("No restaurant found");

    // Get the restaurant's AI config to determine provider
    const { data: restaurant } = await supabaseClient
      .from("restaurants")
      .select("ai_config")
      .eq("id", userRole.restaurant_id)
      .single();

    const aiConfig = restaurant?.ai_config as any || {};
    const provider = aiConfig.nlp_provider || "openai";

    // Get the API key for the provider (using service role for encrypted keys)
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: keyRow } = await adminClient
      .from("restaurant_api_keys")
      .select("api_key_encrypted")
      .eq("restaurant_id", userRole.restaurant_id)
      .eq("provider_name", provider)
      .eq("is_active", true)
      .limit(1)
      .single();

    // Try to decrypt the key, or use raw value if pgcrypto not configured
    let apiKey = keyRow?.api_key_encrypted;
    if (apiKey) {
      try {
        const { data: decrypted } = await adminClient.rpc("decrypt_api_key", {
          encrypted_key: apiKey,
        });
        if (decrypted) apiKey = decrypted;
      } catch {
        // Key might be stored raw if encryption isn't set up yet
      }
    }

    if (!apiKey) throw new Error("No API key found for provider: " + provider);

    // Parse request body
    const { item_name, category, price_cents } = await req.json();
    const priceStr = price_cents ? `₹${(price_cents / 100).toFixed(0)}` : "";

    // Build prompt
    const prompt = `Write a single appetizing menu description for a restaurant dish.
Dish: ${item_name}
Category: ${category || "General"}
Price: ${priceStr}

Rules:
- Max 2 sentences
- Make it sound delicious and inviting
- Mention cooking style or key ingredients if the name implies them
- Do NOT include the price in the description
- Return ONLY the description text, no quotes or labels`;

    let description = "";

    // Call the appropriate provider
    if (provider === "openai") {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [{ role: "user", content: prompt }],
          max_tokens: 100,
          temperature: 0.7,
        }),
      });
      const data = await res.json();
      description = data.choices?.[0]?.message?.content?.trim() || "";
    } else if (provider === "claude") {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-3-5-sonnet-20241022",
          max_tokens: 100,
          messages: [{ role: "user", content: prompt }],
        }),
      });
      const data = await res.json();
      description = data.content?.[0]?.text?.trim() || "";
    } else if (provider === "gemini") {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { maxOutputTokens: 100, temperature: 0.7 },
          }),
        }
      );
      const data = await res.json();
      description = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
    } else if (provider === "deepseek") {
      const res = await fetch("https://api.deepseek.com/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: "deepseek-chat",
          messages: [{ role: "user", content: prompt }],
          max_tokens: 100,
        }),
      });
      const data = await res.json();
      description = data.choices?.[0]?.message?.content?.trim() || "";
    } else if (provider === "huggingface") {
      const res = await fetch(
        "https://api-inference.huggingface.co/models/mistralai/Mistral-7B-Instruct-v0.2",
        {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({ inputs: prompt, parameters: { max_new_tokens: 100 } }),
        }
      );
      const data = await res.json();
      description = Array.isArray(data) ? data[0]?.generated_text?.trim() : "";
    }

    if (!description) throw new Error("Empty response from provider");

    return new Response(JSON.stringify({ description, provider }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
