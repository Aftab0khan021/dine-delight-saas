import { Outlet } from "react-router-dom";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AdminShell } from "./AdminShell";
import { RestaurantProvider } from "../state/restaurant-context";
import { ImpersonationBanner } from "./ImpersonationBanner";

export function AdminLayout() {
  return (
    <RestaurantProvider>
      <SidebarProvider>
        <div className="flex flex-col min-h-screen">
          <ImpersonationBanner />
          <AdminShell>
            <Outlet />
          </AdminShell>
        </div>
      </SidebarProvider>
    </RestaurantProvider>
  );
}
