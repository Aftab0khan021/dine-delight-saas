import { useState, useEffect } from "react";
import { Outlet } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { useToast } from "@/hooks/use-toast";
import { Menu, X } from "lucide-react";
import { SuperAdminSidebar } from "./SuperAdminSidebar";
import { SuperAdminProvider, useSuperAdminContext } from "../state/super-admin-context";

function SuperAdminShell() {
  const { toast } = useToast();
  const { loading, accessDenied, userEmail } = useSuperAdminContext();
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  // Close sidebar on Escape key
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileSidebarOpen(false);
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

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

        {/* Mobile sidebar backdrop */}
        {mobileSidebarOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/50 md:hidden"
            onClick={() => setMobileSidebarOpen(false)}
            aria-hidden="true"
          />
        )}

        {/* Mobile sidebar drawer */}
        <div
          className={`fixed inset-y-0 left-0 z-50 md:hidden transform transition-transform duration-300 ease-in-out ${
            mobileSidebarOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="relative h-full">
            <button
              className="absolute top-3 right-[-40px] z-10 flex h-8 w-8 items-center justify-center rounded-md bg-background border text-muted-foreground hover:bg-accent"
              onClick={() => setMobileSidebarOpen(false)}
              aria-label="Close sidebar"
            >
              <X className="h-4 w-4" />
            </button>
            <SuperAdminSidebar />
          </div>
        </div>

        {/* Desktop sidebar */}
        <div className="hidden md:block">
          <SuperAdminSidebar />
        </div>

        <div className="flex min-w-0 flex-1 flex-col w-full">
          <header className="border-b shrink-0 sticky top-0 z-30 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <div className="flex h-12 items-center justify-between px-3 sm:px-4">
              <div className="flex items-center gap-2">
                {/* Mobile hamburger */}
                <button
                  className="md:hidden -ml-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
                  onClick={() => setMobileSidebarOpen(true)}
                  aria-label="Open sidebar"
                >
                  <Menu className="h-5 w-5" />
                </button>
                {/* Desktop sidebar trigger */}
                <div className="hidden md:block">
                  <SidebarTrigger />
                </div>
                <span className="text-sm font-medium">Super Admin</span>
              </div>

              <div className="flex items-center gap-3">
                <span className="hidden sm:inline text-sm text-muted-foreground truncate max-w-[180px]">{userEmail}</span>
                <Button variant="outline" size="sm" onClick={handleSignOut}>
                  Sign out
                </Button>
              </div>
            </div>
          </header>

          <main className="flex-1 min-w-0 w-full overflow-y-auto p-4 md:p-6 lg:p-8">
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
