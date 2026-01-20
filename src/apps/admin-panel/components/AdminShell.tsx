import { PropsWithChildren } from "react";
import { useNavigate } from "react-router-dom";
import { LogOut } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { supabase } from "@/integrations/supabase/client";

import { AdminSidebar } from "./AdminSidebar";
import { AdminBottomNav } from "./AdminBottomNav";
import { useRestaurantContext } from "../state/restaurant-context";

export function AdminShell({ children }: PropsWithChildren) {
  const navigate = useNavigate();
  const { loading, restaurant, role, accessDenied } = useRestaurantContext();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/admin/auth", { replace: true });
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  if (accessDenied) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="max-w-md w-full space-y-4">
          <h1 className="text-xl font-semibold">Access denied</h1>
          <p className="text-sm text-muted-foreground">
            Your account doesn’t have the <span className="font-medium">restaurant_admin</span> role.
          </p>
          <div className="flex gap-2">
            <Button onClick={handleLogout}>
              <LogOut className="mr-2 h-4 w-4" />
              Logout
            </Button>
            <Button variant="outline" onClick={() => navigate("/", { replace: true })}>
              Go to website
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full">
      <header className="h-14 border-b bg-background flex items-center">
        <div className="w-full flex items-center justify-between px-3">
          <div className="flex items-center gap-3 min-w-0">
            <SidebarTrigger />
            <div className="min-w-0">
              <p className="text-sm text-muted-foreground">Restaurant</p>
              <p className="font-semibold truncate">{restaurant?.name}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Badge variant="secondary">{role}</Badge>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">Account</Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={handleLogout}>
                  <LogOut className="mr-2 h-4 w-4" />
                  Logout
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      <div className="flex min-h-[calc(100vh-3.5rem)] w-full">
        <div className="hidden md:block">
          <AdminSidebar />
        </div>

        <main className="flex-1 p-4 md:p-6 pb-20 md:pb-6">
          {children}
        </main>
      </div>

      <AdminBottomNav />
    </div>
  );
}
