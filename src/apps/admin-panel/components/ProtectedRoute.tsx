import { Navigate } from "react-router-dom";
import { usePermissionContext } from "../state/permission-context";
import type { PermissionCode } from "./staff/staff-utils";

type ProtectedRouteProps = {
    permission?: PermissionCode;
    adminOnly?: boolean;
    children: React.ReactNode;
};

/**
 * Route guard that checks user permissions before rendering the page.
 * - If `adminOnly` is set, only admins can see the page.
 * - If `permission` is set, the user must have that specific permission.
 * - Admins always pass all checks.
 * - Unauthorized users are redirected to the dashboard.
 */
export function ProtectedRoute({ permission, adminOnly, children }: ProtectedRouteProps) {
    const { hasPermission, isAdmin, loading } = usePermissionContext();

    // While permissions are loading, show nothing (prevents flash)
    if (loading) {
        return (
            <div className="flex items-center justify-center py-20">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
        );
    }

    // Admins bypass all checks
    if (isAdmin) return <>{children}</>;

    // Admin-only pages
    if (adminOnly) {
        return <Navigate to="/admin/dashboard" replace />;
    }

    // Permission-gated pages
    if (permission && !hasPermission(permission)) {
        return <Navigate to="/admin/dashboard" replace />;
    }

    return <>{children}</>;
}
