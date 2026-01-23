import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface FeatureAccess {
    feature_key: string;
    feature_name: string;
    is_enabled: boolean;
    source: 'override' | 'plan' | 'global' | 'default';
}

/**
 * Hook to check feature access for a restaurant
 * Uses the restaurant_feature_access view which implements the priority system:
 * Override > Plan > Global > Default
 */
export function useFeatureAccess(restaurantId: string | undefined) {
    // Fetch all features for the restaurant
    const { data: features, isLoading } = useQuery({
        queryKey: ['restaurant-features', restaurantId],
        queryFn: async () => {
            if (!restaurantId) return [];

            const { data, error } = await (supabase as any)
                .from('restaurant_feature_access')
                .select('*')
                .eq('restaurant_id', restaurantId);

            if (error) throw error;
            return data as FeatureAccess[];
        },
        enabled: !!restaurantId,
    });

    // Check if a boolean feature is enabled
    const isFeatureEnabled = (featureKey: string): boolean => {
        const feature = features?.find(f => f.feature_key === featureKey);
        return feature?.is_enabled ?? false;
    };

    // Get a feature limit value
    const getFeatureLimit = async (featureKey: string): Promise<number> => {
        if (!restaurantId) return 0;

        const { data, error } = await supabase.rpc('get_feature_limit_for_restaurant', {
            p_restaurant_id: restaurantId,
            p_feature_key: featureKey
        });

        if (error) throw error;
        return data as number;
    };

    // Get feature source (where it's coming from)
    const getFeatureSource = (featureKey: string): string => {
        const feature = features?.find(f => f.feature_key === featureKey);
        return feature?.source ?? 'default';
    };

    return {
        features,
        isLoading,
        isFeatureEnabled,
        getFeatureLimit,
        getFeatureSource,
    };
}

/**
 * Hook specifically for feature limits (staff_limit, menu_items_limit, etc.)
 */
export function useFeatureLimit(restaurantId: string | undefined, featureKey: string) {
    const { data: limit, isLoading } = useQuery({
        queryKey: ['feature-limit', restaurantId, featureKey],
        queryFn: async () => {
            if (!restaurantId) return 0;

            const { data, error } = await supabase.rpc('get_feature_limit_for_restaurant', {
                p_restaurant_id: restaurantId,
                p_feature_key: featureKey
            });

            if (error) throw error;
            return data as number;
        },
        enabled: !!restaurantId,
    });

    const isUnlimited = limit === -1;
    const isAtLimit = (currentUsage: number) => {
        if (isUnlimited) return false;
        return currentUsage >= (limit ?? 0);
    };

    return {
        limit,
        isLoading,
        isUnlimited,
        isAtLimit,
    };
}
