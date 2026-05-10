import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRestaurantContext } from "../state/restaurant-context";

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
 * Logic:
 *  1. Restaurant has ai_config.enabled = true
 *  2. The specific feature flag is turned on in ai_config.features
 *  3. At least one active API key exists for the restaurant
 *
 * If all three conditions are met → paid tier.
 * Otherwise → free tier (always works, no API key needed).
 */
export function useAITier() {
  const { restaurant } = useRestaurantContext();
  const restaurantId = restaurant?.id;

  // Fetch ai_config from restaurants table
  const { data: aiConfig } = useQuery({
    queryKey: ["ai-config", restaurantId],
    enabled: !!restaurantId,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    queryFn: async () => {
      const { data, error } = await supabase
        .from("restaurants")
        .select("ai_config")
        .eq("id", restaurantId!)
        .single();

      if (error || !data?.ai_config) return DEFAULT_CONFIG;
      return { ...DEFAULT_CONFIG, ...(data.ai_config as unknown as AIConfig) };
    },
  });

  // Check if restaurant has any active API keys
  const { data: hasApiKeys } = useQuery({
    queryKey: ["ai-api-keys-exist", restaurantId],
    enabled: !!restaurantId && !!aiConfig?.enabled,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("restaurant_api_keys")
        .select("id", { count: "exact", head: true })
        .eq("restaurant_id", restaurantId!)
        .eq("is_active", true);

      if (error) return false;
      return (count ?? 0) > 0;
    },
  });

  // Get current session token for edge function calls
  const getAccessToken = async (): Promise<string | null> => {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  };

  const config = aiConfig ?? DEFAULT_CONFIG;

  /**
   * Returns true if paid AI is available for a specific feature.
   */
  const isPaidAvailable = (featureKey: string): boolean => {
    if (!config.enabled) return false;
    if (!config.features[featureKey]) return false;
    if (!hasApiKeys) return false;
    return true;
  };

  /**
   * Returns 'paid' or 'free' for a feature.
   */
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
