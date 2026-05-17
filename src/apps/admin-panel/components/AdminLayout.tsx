import { Outlet } from "react-router-dom";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AdminShell } from "./AdminShell";
import { RestaurantProvider } from "../state/restaurant-context";
import { PermissionProvider } from "../state/permission-context";
import { ImpersonationBanner } from "./ImpersonationBanner";
import { SupportChat } from "./SupportChat";

export function AdminLayout() {
  return (
    <RestaurantProvider>
      <PermissionProvider>
        <SidebarProvider>
          <div className="flex flex-col min-h-screen w-full flex-1">
            <ImpersonationBanner />
            <AdminShell>
              <Outlet />
            </AdminShell>
            <SupportChat />
          </div>
        </SidebarProvider>
      </PermissionProvider>
    </RestaurantProvider>
  );
}


