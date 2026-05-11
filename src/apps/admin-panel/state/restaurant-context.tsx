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

export type CurrentRestaurant = Pick<Tables<"restaurants">, "id" | "name" | "slug" | "currency_code">;

type RestaurantContextValue = {
  loading: boolean;
  restaurant: CurrentRestaurant | null;
  role: StaffRole | null;
  staffCategory: StaffCategory | null;
  isAdmin: boolean;
  accessDenied: boolean;
  refresh: () => Promise<void>;
  // Multi-brand: allows switching the active brand without logging out
  selectedBrandId: string | null;
  setSelectedBrandId: (id: string | null) => void;
  // The original restaurant from user_roles — never changes on brand switch
  originalRestaurantId: string | null;
};

const RestaurantContext = createContext<RestaurantContextValue | null>(null);

export function RestaurantProvider({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [restaurant, setRestaurant] = useState<CurrentRestaurant | null>(null);
  const [role, setRole] = useState<StaffRole | null>(null);
  const [staffCategory, setStaffCategory] = useState<StaffCategory | null>(null);
  const [accessDenied, setAccessDenied] = useState(false);
  // Multi-brand switcher: null means use the default restaurant from user_roles
  const [selectedBrandId, setSelectedBrandId] = useState<string | null>(null);
  const [brandOverride, setBrandOverride] = useState<CurrentRestaurant | null>(null);

  const load = useCallback(async () => {
    setLoading(true);

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      navigate("/admin/auth", { replace: true });
      return;
    }

    // 1. Fetch ALL roles for this user (excluding super_admin)
    const { data: allUserRoles, error: roleError } = await supabase
      .from("user_roles")
      .select("role, restaurant_id, staff_category_id")
      .eq("user_id", session.user.id)
      .neq("role", "super_admin");

    console.log("🔍 [RestaurantContext] User:", session.user.email, "| Roles:", JSON.stringify(allUserRoles));

    if (roleError || !allUserRoles || allUserRoles.length === 0) {
      console.warn("Access Denied: No restaurant role found for this user.");
      setRestaurant(null);
      setRole(null);
      setStaffCategory(null);
      setAccessDenied(true);
      setLoading(false);
      return;
    }

    // 2. Determine effective role:
    //    - If ANY row has role='restaurant_admin', this user IS admin
    //    - Use the admin row for restaurant_id; ignore staff_category_id for admins
    const adminRow = allUserRoles.find(r => r.role === "restaurant_admin");
    const staffRow = allUserRoles.find(r => r.role === "user");

    let effectiveRole: StaffRole;
    let effectiveRestaurantId: string | null;
    let effectiveCategoryId: string | null;

    if (adminRow) {
      // User IS an admin — always treat them as admin
      effectiveRole = "restaurant_admin";
      effectiveRestaurantId = adminRow.restaurant_id;
      effectiveCategoryId = null; // Admins don't use staff categories
      console.log("🔍 [RestaurantContext] ✅ User is ADMIN for restaurant:", effectiveRestaurantId);
    } else if (staffRow) {
      // User is staff only
      effectiveRole = "user";
      effectiveRestaurantId = staffRow.restaurant_id;
      effectiveCategoryId = staffRow.staff_category_id;
      console.log("🔍 [RestaurantContext] 👤 User is STAFF with category:", effectiveCategoryId);
    } else {
      // Fallback: pick the first available role
      const firstRow = allUserRoles[0];
      effectiveRole = firstRow.role as StaffRole;
      effectiveRestaurantId = firstRow.restaurant_id;
      effectiveCategoryId = firstRow.staff_category_id;
      console.log("🔍 [RestaurantContext] ⚠️ Fallback role:", effectiveRole);
    }

    // 3. Set role
    setRole(effectiveRole);

    // 4. Fetch restaurant details
    let finalRestaurant: CurrentRestaurant | null = null;

    if (effectiveRestaurantId) {
      const { data: restaurantRow, error: restaurantError } = await supabase
        .from("restaurants")
        .select("id, name, slug, currency_code")
        .eq("id", effectiveRestaurantId)
        .maybeSingle();

      finalRestaurant = restaurantRow;

      // Fallback if RLS hides it but ID exists
      if (restaurantError || !finalRestaurant) {
        console.warn("Restaurant details hidden by RLS. Using fallback.");
        finalRestaurant = {
          id: effectiveRestaurantId,
          name: "My Restaurant",
          slug: "",
          currency_code: "INR",
        };
      }
    }

    // 5. Fetch staff category (only for non-admin users)
    let finalStaffCategory: StaffCategory | null = null;

    if (effectiveCategoryId && effectiveRole !== "restaurant_admin") {
      const { data: categoryRow } = await supabase
        .from("staff_categories")
        .select("*")
        .eq("id", effectiveCategoryId)
        .maybeSingle();

      if (categoryRow) {
        finalStaffCategory = categoryRow as StaffCategory;
      }
    }

    setRestaurant(finalRestaurant);
    setStaffCategory(finalStaffCategory);
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

  const isAdmin = useMemo(() => {
    return role === "restaurant_admin" || role === "super_admin";
  }, [role]);

  // When selectedBrandId changes, fetch that brand's details and override
  useEffect(() => {
    if (!selectedBrandId) {
      setBrandOverride(null);
      return;
    }
    supabase
      .from("restaurants")
      .select("id, name, slug, currency_code")
      .eq("id", selectedBrandId)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setBrandOverride(data as CurrentRestaurant);
      });
  }, [selectedBrandId]);

  // Effective restaurant: brand override if switching, else the default
  const effectiveRestaurant = brandOverride ?? restaurant;

  const value = useMemo<RestaurantContextValue>(
    () => ({
      loading,
      restaurant: effectiveRestaurant,
      role,
      staffCategory,
      isAdmin,
      accessDenied,
      refresh: load,
      selectedBrandId,
      setSelectedBrandId,
      originalRestaurantId: restaurant?.id ?? null,
    }),
    [accessDenied, loading, effectiveRestaurant, role, staffCategory, isAdmin, load, selectedBrandId, restaurant?.id],
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
