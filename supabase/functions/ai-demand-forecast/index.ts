// supabase/functions/ai-demand-forecast/index.ts
// AI-powered demand forecasting — staffing & prep recommendations
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

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

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

    const { data: restaurant } = await supabaseClient
      .from("restaurants")
      .select("ai_config")
      .eq("id", userRole.restaurant_id)
      .single();

    const aiConfig = restaurant?.ai_config as any || {};
    const provider = aiConfig.nlp_provider || "openai";

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

    let apiKey = keyRow?.api_key_encrypted;
    if (apiKey) {
      try {
        const { data: decrypted } = await adminClient.rpc("decrypt_api_key", { encrypted_key: apiKey });
        if (decrypted) apiKey = decrypted;
      } catch { /* raw key fallback */ }
    }
    if (!apiKey) throw new Error("No API key for provider: " + provider);

    const { matrix, dayLabels, hourLabels } = await req.json();

    // Summarize the matrix as a compact string
    const summary = dayLabels.map((day: string, d: number) => {
      const hours = matrix[d]
        .map((count: number, h: number) => count > 0 ? `${hourLabels[h]}:${count}` : null)
        .filter(Boolean)
        .join(", ");
      return hours ? `${day}: ${hours}` : null;
    }).filter(Boolean).join("\n");

    const prompt = `You are a restaurant operations advisor. Analyze this order heatmap data and provide actionable insights.

Order data (day: hour=order_count):
${summary || "No order data available"}

Return a JSON object with:
- "peakHours": array of top 5 busiest time slots (e.g., ["Fri 7pm", "Sat 1pm"])
- "slowHours": array of 5 slowest time slots that have some orders
- "recommendations": array of 3-5 specific, actionable recommendations for the restaurant (staffing, prep, promotions)

Return ONLY valid JSON.`;

    let result = { peakHours: [], slowHours: [], recommendations: ["Not enough data"] };

    if (provider === "openai") {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [{ role: "user", content: prompt }],
          max_tokens: 400,
          temperature: 0.4,
          response_format: { type: "json_object" },
        }),
      });
      const data = await res.json();
      const content = data.choices?.[0]?.message?.content;
      if (content) result = JSON.parse(content);
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
          max_tokens: 400,
          messages: [{ role: "user", content: prompt }],
        }),
      });
      const data = await res.json();
      const content = data.content?.[0]?.text;
      if (content) {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) result = JSON.parse(jsonMatch[0]);
      }
    } else if (provider === "gemini") {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { maxOutputTokens: 400, temperature: 0.4 },
          }),
        }
      );
      const data = await res.json();
      const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (content) {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) result = JSON.parse(jsonMatch[0]);
      }
    } else if (provider === "deepseek") {
      const res = await fetch("https://api.deepseek.com/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: "deepseek-chat",
          messages: [{ role: "user", content: prompt }],
          max_tokens: 400,
          response_format: { type: "json_object" },
        }),
      });
      const data = await res.json();
      const content = data.choices?.[0]?.message?.content;
      if (content) result = JSON.parse(content);
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
