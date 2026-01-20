import { Outlet } from "react-router-dom";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AdminShell } from "./AdminShell";
import { RestaurantProvider } from "../state/restaurant-context";

export function AdminLayout() {
  return (
    <RestaurantProvider>
      <SidebarProvider>
        <AdminShell>
          <Outlet />
        </AdminShell>
      </SidebarProvider>
    </RestaurantProvider>
  );
}
