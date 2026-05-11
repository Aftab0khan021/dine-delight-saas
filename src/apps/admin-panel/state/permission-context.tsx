import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
} from "react";
import { supabase } from "@/integrations/supabase/client";
import { useRestaurantContext } from "./restaurant-context";
import type { PermissionCode } from "../components/staff/staff-utils";

type PermissionContextValue = {
    permissions: Set<string>;
    hasPermission: (code: PermissionCode) => boolean;
    loading: boolean;
    isAdmin: boolean;
};

const PermissionContext = createContext<PermissionContextValue | null>(null);

export function PermissionProvider({ children }: { children: React.ReactNode }) {
    const { restaurant, role } = useRestaurantContext();
    const [permissions, setPermissions] = useState<Set<string>>(new Set());
    const [loading, setLoading] = useState(true);
    // Independently verify admin status from the database, NOT just from
    // restaurant-context role — this prevents misidentification bugs.
    const [dbIsAdmin, setDbIsAdmin] = useState(false);

    const isAdmin = useMemo(() => {
        // True if EITHER the restaurant-context says admin OR the DB confirms it
        return dbIsAdmin || role === "restaurant_admin" || role === "super_admin";
    }, [role, dbIsAdmin]);

    const loadPermissions = useCallback(async () => {
        if (!restaurant?.id) {
            setPermissions(new Set());
            setLoading(false);
            return;
        }

        try {
            setLoading(true);
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
                setPermissions(new Set());
                return;
            }

            // ALWAYS use the RPC — it already checks for restaurant_admin internally
            // and returns ALL permissions for admins, or category-specific ones for staff.
            const { data, error } = await supabase.rpc("get_user_permissions", {
                p_user_id: user.id,
                p_restaurant_id: restaurant.id,
            });

            console.log("🔍 [PermissionContext] get_user_permissions result:", {
                userId: user.id,
                email: user.email,
                restaurantId: restaurant.id,
                roleFromContext: role,
                permissionCount: data?.length ?? 0,
                error: error?.message,
                permissions: data?.map((r: any) => r.permission_code),
            });

            if (error) {
                console.error("Error loading permissions:", error);
                setPermissions(new Set());
                return;
            }

            if (data && data.length > 0) {
                const permSet = new Set(data.map((row: any) => row.permission_code));
                setPermissions(permSet);

                // Also independently check: if the RPC returned ALL permissions,
                // it means the SQL function detected this user as restaurant_admin.
                // Use this to set dbIsAdmin as a safety net.
                const { data: allPerms } = await supabase
                    .from("permissions")
                    .select("code");
                
                if (allPerms) {
                    const totalPermissions = allPerms.length;
                    // If user has ALL permissions, they're admin per the SQL function
                    if (permSet.size >= totalPermissions) {
                        console.log("🔍 [PermissionContext] DB confirms user is ADMIN (has all permissions)");
                        setDbIsAdmin(true);
                    } else {
                        console.log(`🔍 [PermissionContext] User has ${permSet.size}/${totalPermissions} permissions — STAFF`);
                        setDbIsAdmin(false);
                    }
                }
            } else {
                setPermissions(new Set());
                setDbIsAdmin(false);
            }
        } catch (error) {
            console.error("Error loading permissions:", error);
            setPermissions(new Set());
        } finally {
            setLoading(false);
        }
    }, [restaurant?.id, role]);

    useEffect(() => {
        loadPermissions();
    }, [loadPermissions]);

    const hasPermission = useCallback(
        (code: PermissionCode) => {
            // Admins always have permission
            if (isAdmin) return true;
            return permissions.has(code);
        },
        [permissions, isAdmin]
    );

    const value = useMemo<PermissionContextValue>(
        () => ({
            permissions,
            hasPermission,
            loading,
            isAdmin,
        }),
        [permissions, hasPermission, loading, isAdmin]
    );

    return (
        <PermissionContext.Provider value={value}>
            {children}
        </PermissionContext.Provider>
    );
}

export function usePermissionContext() {
    const context = useContext(PermissionContext);
    if (!context) {
        throw new Error("usePermissionContext must be used within a PermissionProvider");
    }
    return context;
}
