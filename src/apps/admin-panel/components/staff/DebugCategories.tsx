import { useEffect } from "react";
import { useRestaurantContext } from "../../state/restaurant-context";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// Add this temporary debug component to InviteStaffDialog
export function DebugCategories() {
    const { restaurant } = useRestaurantContext();

    const categoriesQuery = useQuery({
        queryKey: ["debug-categories", restaurant?.id],
        queryFn: async () => {
            if (!restaurant?.id) return [];
            const { data, error } = await supabase
                .from("staff_categories")
                .select("*")
                .eq("restaurant_id", restaurant.id);

            console.log("=== CATEGORY DEBUG ===");
            console.log("Current restaurant ID:", restaurant.id);
            console.log("Categories found:", data?.length || 0);
            console.log("Categories data:", data);
            console.log("Error:", error);
            console.log("===================");

            return data;
        },
        enabled: !!restaurant?.id,
    });

    useEffect(() => {
        if (categoriesQuery.data) {
            console.log("Categories loaded:", categoriesQuery.data);
        }
    }, [categoriesQuery.data]);

    return null;
}
