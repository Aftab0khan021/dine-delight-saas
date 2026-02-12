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
import type { StaffCategory, StaffRole } from "../components/staff/staff-utils";

export type CurrentRestaurant = Pick<Tables<"restaurants">, "id" | "name" | "slug">;

type RestaurantContextValue = {
  loading: boolean;
  restaurant: CurrentRestaurant | null;
  role: StaffRole | null;
  staffCategory: StaffCategory | null;
  isAdmin: boolean;
  accessDenied: boolean;
  refresh: () => Promise<void>;
};

const RestaurantContext = createContext<RestaurantContextValue | null>(null);

export function RestaurantProvider({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [restaurant, setRestaurant] = useState<CurrentRestaurant | null>(null);
  const [role, setRole] = useState<StaffRole | null>(null);
  const [staffCategory, setStaffCategory] = useState<StaffCategory | null>(null);
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

    // 1. Check if the user has any role in user_roles table
    const { data: userRoleRow, error: roleError } = await supabase
      .from("user_roles")
      .select("role, restaurant_id, staff_category_id")
      .eq("user_id", session.user.id)
      .maybeSingle();

    if (roleError || !userRoleRow) {
      console.warn("Access Denied: No role found for this user.");
      setRestaurant(null);
      setRole(null);
      setStaffCategory(null);
      setAccessDenied(true);
      setLoading(false);
      return;
    }

    // 2. Set role
    setRole(userRoleRow.role as StaffRole);

    // 3. Fetch restaurant details (if they have one linked)
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

    // 4. Fetch staff category (if assigned)
    let finalStaffCategory: StaffCategory | null = null;

    if (userRoleRow.staff_category_id) {
      const { data: categoryRow } = await supabase
        .from("staff_categories")
        .select("*")
        .eq("id", userRoleRow.staff_category_id)
        .maybeSingle();

      if (categoryRow) {
        finalStaffCategory = categoryRow as StaffCategory;
      }
    }

    setRestaurant(finalRestaurant);
    setStaffCategory(finalStaffCategory);
    setAccessDenied(false); // ✅ Allowed in for all roles
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

  const isAdmin = useMemo(() => {
    return role === "restaurant_admin" || role === "super_admin";
  }, [role]);

  const value = useMemo<RestaurantContextValue>(
    () => ({
      loading,
      restaurant,
      role,
      staffCategory,
      isAdmin,
      accessDenied,
      refresh: load,
    }),
    [accessDenied, loading, restaurant, role, staffCategory, isAdmin, load],
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
