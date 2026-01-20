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

    const userId = session.user.id;

    const { data: userRoleRow, error: roleError } = await supabase
      .from("user_roles")
      .select("role, restaurant_id")
      .eq("user_id", userId)
      .eq("role", "restaurant_admin")
      .not("restaurant_id", "is", null)
      .limit(1)
      .maybeSingle();

    if (roleError) {
      // Treat unexpected errors as denial so we don't leak access.
      setRestaurant(null);
      setRole(null);
      setAccessDenied(true);
      setLoading(false);
      return;
    }

    if (!userRoleRow?.restaurant_id) {
      setRestaurant(null);
      setRole(null);
      setAccessDenied(true);
      setLoading(false);
      return;
    }

    const { data: restaurantRow, error: restaurantError } = await supabase
      .from("restaurants")
      .select("id, name, slug")
      .eq("id", userRoleRow.restaurant_id)
      .maybeSingle();

    if (restaurantError || !restaurantRow) {
      setRestaurant(null);
      setRole(null);
      setAccessDenied(true);
      setLoading(false);
      return;
    }

    setRestaurant(restaurantRow);
    setRole("restaurant_admin");
    setAccessDenied(false);
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

  return <RestaurantContext.Provider value={value}>{children}</RestaurantContext.Provider>;
}

export function useRestaurantContext() {
  const ctx = useContext(RestaurantContext);
  if (!ctx) throw new Error("useRestaurantContext must be used within RestaurantProvider");
  return ctx;
}
