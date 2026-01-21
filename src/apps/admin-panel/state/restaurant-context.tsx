import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type CurrentRestaurant = Pick<Tables<"restaurants">, "id" | "name" | "slug">;

type RestaurantAdminRole = "restaurant_admin";

type RestaurantContextValue = {
  loading: boolean;
  restaurant: CurrentRestaurant | null;
  role: RestaurantAdminRole | null;
  accessDenied: boolean;
  refresh: () => Promise<void>;
};

const RestaurantContext = createContext<RestaurantContextValue | null>(null);

export function RestaurantProvider({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [restaurant, setRestaurant] = useState<CurrentRestaurant | null>(null);
  const [role, setRole] = useState<RestaurantAdminRole | null>(null);
  const [accessDenied, setAccessDenied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      navigate("/admin/auth", { replace: true });
      return;
    }

    // 1. Check if the user has the role (We removed the restaurant_id check!)
    const { data: userRoleRow, error: roleError } = await supabase
      .from("user_roles")
      .select("role, restaurant_id")
      .eq("user_id", session.user.id)
      .eq("role", "restaurant_admin")
      .maybeSingle();

    if (roleError || !userRoleRow) {
      console.warn("Access Denied: No 'restaurant_admin' role found for this user.");
      setRestaurant(null);
      setRole(null);
      setAccessDenied(true);
      setLoading(false);
      return;
    }

    // 2. Fetch restaurant details (Only if they have one linked)
    let finalRestaurant: CurrentRestaurant | null = null;

    if (userRoleRow.restaurant_id) {
      const { data: restaurantRow, error: restaurantError } = await supabase
        .from("restaurants")
        .select("id, name, slug")
        .eq("id", userRoleRow.restaurant_id)
        .maybeSingle();

      finalRestaurant = restaurantRow;

      // Fallback if RLS hides it but ID exists
      if (restaurantError || !finalRestaurant) {
        console.warn("Restaurant details hidden by RLS. Using fallback.");
        finalRestaurant = {
          id: userRoleRow.restaurant_id,
          name: "My Restaurant",
          slug: "",
        };
      }
    }

    setRestaurant(finalRestaurant);
    setRole("restaurant_admin");
    setAccessDenied(false); // ✅ Allowed in, even if restaurant is null
    setLoading(false);
  }, [navigate]);

  useEffect(() => {
    load();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        navigate("/admin/auth", { replace: true });
      }
    });

    return () => subscription.unsubscribe();
  }, [load, navigate]);

  const value = useMemo<RestaurantContextValue>(
    () => ({
      loading,
      restaurant,
      role,
      accessDenied,
      refresh: load,
    }),
    [accessDenied, loading, restaurant, role, load],
  );

  return (
    <RestaurantContext.Provider value={value}>
      {children}
    </RestaurantContext.Provider>
  );
}

export function useRestaurantContext() {
  const context = useContext(RestaurantContext);
  if (!context) {
    throw new Error("useRestaurantContext must be used within a RestaurantProvider");
  }
  return context;
}