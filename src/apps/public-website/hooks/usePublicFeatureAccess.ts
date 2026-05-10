import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Lightweight public-side hook to check feature flags for a restaurant.
 * Uses the restaurant_feature_access view (same as admin FeatureGate)
 * but doesn't depend on RestaurantContext.
 */
export function usePublicFeatureAccess(restaurantId: string | undefined) {
  const { data: features, isLoading } = useQuery({
    queryKey: ["public-features", restaurantId],
    queryFn: async () => {
      if (!restaurantId) return [];
      const { data, error } = await supabase
        .from("restaurant_feature_access")
        .select("feature_key, is_enabled")
        .eq("restaurant_id", restaurantId);
      if (error) return [];
      return data ?? [];
    },
    enabled: !!restaurantId,
    staleTime: 10 * 60 * 1000, // 10 min cache — public pages rarely need fresh flags
  });

  const isFeatureEnabled = (featureKey: string): boolean => {
    const feature = features?.find((f) => f.feature_key === featureKey);
    return feature?.is_enabled ?? false;
  };

  return { isFeatureEnabled, isLoading };
}
