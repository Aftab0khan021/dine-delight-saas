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

    const isAdmin = useMemo(() => {
        return role === "restaurant_admin" || role === "owner";
    }, [role]);

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

            // Admins have all permissions
            if (isAdmin) {
                const { data: allPermissions } = await supabase
                    .from("permissions")
                    .select("code");

                if (allPermissions) {
                    setPermissions(new Set(allPermissions.map(p => p.code)));
                }
                return;
            }

            // Staff members: get permissions via RPC function
            const { data, error } = await supabase.rpc("get_user_permissions", {
                p_user_id: user.id,
                p_restaurant_id: restaurant.id,
            });

            if (error) {
                console.error("Error loading permissions:", error);
                setPermissions(new Set());
                return;
            }

            if (data) {
                setPermissions(new Set(data.map((row: any) => row.permission_code)));
            }
        } catch (error) {
            console.error("Error loading permissions:", error);
            setPermissions(new Set());
        } finally {
            setLoading(false);
        }
    }, [restaurant?.id, isAdmin]);

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
