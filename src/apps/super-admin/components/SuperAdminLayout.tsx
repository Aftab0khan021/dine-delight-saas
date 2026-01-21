import { Outlet } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { useToast } from "@/hooks/use-toast";
import { SuperAdminSidebar } from "./SuperAdminSidebar";
import { SuperAdminProvider, useSuperAdminContext } from "../state/super-admin-context";

function SuperAdminShell() {
  const { toast } = useToast();
  const { loading, accessDenied, userEmail } = useSuperAdminContext();

  const handleSignOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">Loading…</div>;
  }

  if (accessDenied) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="max-w-md w-full space-y-3">
          <h1 className="text-2xl font-semibold tracking-tight">Access denied</h1>
          <p className="text-sm text-muted-foreground">
            Your account does not have permission to access the Super Admin portal.
          </p>
          <Button variant="outline" onClick={handleSignOut}>
            Sign out
          </Button>
        </div>
      </div>
    );
  }

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <SuperAdminSidebar />

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="border-b">
            <div className="flex h-12 items-center justify-between px-4">
              <div className="flex items-center gap-2">
                <SidebarTrigger />
                <span className="text-sm font-medium">Super Admin</span>
              </div>

              <div className="flex items-center gap-3">
                <span className="hidden sm:inline text-sm text-muted-foreground">{userEmail}</span>
                <Button variant="outline" size="sm" onClick={handleSignOut}>
                  Sign out
                </Button>
              </div>
            </div>
          </header>

          <main className="flex-1 min-w-0 p-4 md:p-6">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}

export function SuperAdminLayout() {
  return (
    <SuperAdminProvider>
      <SuperAdminShell />
    </SuperAdminProvider>
  );
}
