import { usePermissionContext } from "../state/permission-context";
import type { PermissionCode } from "./staff/staff-utils";

type CanAccessProps = {
    permission: PermissionCode;
    children: React.ReactNode;
    fallback?: React.ReactNode;
};

export function CanAccess({ permission, children, fallback = null }: CanAccessProps) {
    const { hasPermission } = usePermissionContext();

    if (!hasPermission(permission)) {
        return <>{fallback}</>;
    }

    return <>{children}</>;
}
