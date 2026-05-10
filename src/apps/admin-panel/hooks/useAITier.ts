import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * AI Configuration shape stored in restaurants.ai_config JSONB
 */
export interface AIConfig {
  enabled: boolean;
  nlp_provider: string;
  image_provider: string;
  voice_provider: string;
  features: Record<string, boolean>;
}

const DEFAULT_CONFIG: AIConfig = {
  enabled: false,
  nlp_provider: "regex",
  image_provider: "tensorflow",
  voice_provider: "whisper-local",
  features: {},
};

/**
 * Hook that determines whether paid AI is available for a given feature.
 * 
 * IMPORTANT: Does NOT call useRestaurantContext internally — takes restaurantId
 * as an optional parameter to avoid context-throw crashes during render.
 */
export function useAITier(restaurantId?: string | null) {
  // Fetch ai_config from restaurants table
  const { data: aiConfig } = useQuery({
    queryKey: ["ai-config", restaurantId ?? "none"],
    enabled: !!restaurantId,
    staleTime: 5 * 60 * 1000,
    retry: false,
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from("restaurants")
          .select("ai_config")
          .eq("id", restaurantId!)
          .single();

        if (error || !data?.ai_config) return DEFAULT_CONFIG;
        return { ...DEFAULT_CONFIG, ...(data.ai_config as unknown as AIConfig) };
      } catch {
        return DEFAULT_CONFIG;
      }
    },
  });

  // Check if restaurant has any active API keys
  const { data: hasApiKeys } = useQuery({
    queryKey: ["ai-api-keys-exist", restaurantId ?? "none"],
    enabled: !!restaurantId && !!aiConfig?.enabled,
    staleTime: 5 * 60 * 1000,
    retry: false,
    queryFn: async () => {
      try {
        const { count, error } = await (supabase as any)
          .from("restaurant_api_keys")
          .select("id", { count: "exact", head: true })
          .eq("restaurant_id", restaurantId!)
          .eq("is_active", true);

        if (error) return false;
        return (count ?? 0) > 0;
      } catch {
        return false;
      }
    },
  });

  // Get current session token for edge function calls
  const getAccessToken = async (): Promise<string | null> => {
    try {
      const { data } = await supabase.auth.getSession();
      return data.session?.access_token ?? null;
    } catch {
      return null;
    }
  };

  const config = aiConfig ?? DEFAULT_CONFIG;

  const isPaidAvailable = (featureKey: string): boolean => {
    if (!config.enabled) return false;
    if (!config.features[featureKey]) return false;
    if (!hasApiKeys) return false;
    return true;
  };

  const tier = (featureKey: string): "free" | "paid" => {
    return isPaidAvailable(featureKey) ? "paid" : "free";
  };

  return {
    aiConfig: config,
    isPaidAvailable,
    tier,
    getAccessToken,
    restaurantId: restaurantId ?? null,
  };
}
