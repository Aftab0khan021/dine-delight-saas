import { usePermissionContext } from "../state/permission-context";
import type { PermissionCode } from "../components/staff/staff-utils";

export function usePermission(code: PermissionCode): boolean {
    const { hasPermission } = usePermissionContext();
    return hasPermission(code);
}
