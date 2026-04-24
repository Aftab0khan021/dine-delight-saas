import { PropsWithChildren, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  LogOut,
  Store,
  Bell,
  ChevronDown,
  Settings,
  User,
  Menu,
  X
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";

import { AdminSidebar } from "./AdminSidebar";
import { AdminBottomNav } from "./AdminBottomNav";
import { PendingApprovalScreen } from "./PendingApprovalScreen";
import { useRestaurantContext } from "../state/restaurant-context";

// --- Helper: Time Ago ---
function timeAgo(dateString: string) {
  const date = new Date(dateString);
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  let interval = seconds / 31536000;
  if (interval > 1) return Math.floor(interval) + "y";
  interval = seconds / 2592000;
  if (interval > 1) return Math.floor(interval) + "mo";
  interval = seconds / 86400;
  if (interval > 1) return Math.floor(interval) + "d";
  interval = seconds / 3600;
  if (interval > 1) return Math.floor(interval) + "h";
  interval = seconds / 60;
  if (interval > 1) return Math.floor(interval) + "m";
  return "now";
}

export function AdminShell({ children }: PropsWithChildren) {
  const navigate = useNavigate();
  const { loading, restaurant, role, staffCategory, accessDenied, refresh } = useRestaurantContext();

  const [userEmail, setUserEmail] = useState<string>("Admin");
  const [accountStatus, setAccountStatus] = useState<string | null>(null);
  const [checkingStatus, setCheckingStatus] = useState(true);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  // Local state for the "Create Restaurant" form
  const [newRestName, setNewRestName] = useState("");
  const [newRestSlug, setNewRestSlug] = useState("");
  const [creating, setCreating] = useState(false);

  // Close sidebar on escape key
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileSidebarOpen(false);
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  // Check account status on mount
  useEffect(() => {
    const checkAccountStatus = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUserEmail(user.email || "Admin");

        const { data: profile } = await supabase
          .from('profiles')
          .select('account_status')
          .eq('id', user.id)
          .single();

        setAccountStatus(profile?.account_status || null);
      }
      setCheckingStatus(false);
    };

    checkAccountStatus();
  }, []);

  // --- Real Data: Notifications (Activity Logs) ---
  const { data: notifications = [] } = useQuery({
    queryKey: ["admin", "notifications", restaurant?.id],
    enabled: !!restaurant?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("activity_logs")
        .select("id, message, created_at")
        .eq("restaurant_id", restaurant!.id)
        .order("created_at", { ascending: false })
        .limit(5);
      return data || [];
    },
    refetchInterval: 60000
  });

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/admin/auth", { replace: true });
  };

  const handleCreateRestaurant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRestName || !newRestSlug) return;

    try {
      setCreating(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("No user");

      const { data: restData, error: restError } = await supabase
        .from("restaurants")
        .insert({
          name: newRestName,
          slug: newRestSlug,
          is_accepting_orders: true
        })
        .select()
        .single();

      if (restError) throw restError;

      const { error: linkError } = await supabase
        .from("user_roles")
        .update({ restaurant_id: restData.id })
        .eq("user_id", user.id);

      if (linkError) throw linkError;

      await refresh();

    } catch (err: any) {
      alert("Error creating restaurant: " + err.message);
    } finally {
      setCreating(false);
    }
  };

  if (loading || checkingStatus) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Loading…</p>
        </div>
      </div>
    );
  }

  // CASE 0: Pending or Denied Account
  if (accountStatus === 'pending' || accountStatus === 'denied') {
    return <PendingApprovalScreen userEmail={userEmail} />;
  }

  // CASE 1: Access Denied
  if (accessDenied) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="max-w-md w-full space-y-4 text-center">
          <h1 className="text-xl font-semibold">Access denied</h1>
          <p className="text-sm text-muted-foreground">
            Your account doesn't have access to the admin panel.
            Please contact your restaurant administrator.
          </p>
          <Button onClick={handleLogout}>Logout</Button>
        </div>
      </div>
    );
  }

  // CASE 2: Onboarding
  if (!restaurant && role === "restaurant_admin") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/40 p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <div className="flex items-center gap-2 mb-2">
              <div className="p-2 bg-primary/10 rounded-full">
                <Store className="h-6 w-6 text-primary" />
              </div>
            </div>
            <CardTitle>Create your Restaurant</CardTitle>
            <CardDescription>
              You don't have a restaurant linked yet. Create one to get started.
            </CardDescription>
          </CardHeader>
          <form onSubmit={handleCreateRestaurant}>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="rest-name">Restaurant Name</Label>
                <Input
                  id="rest-name"
                  placeholder="e.g. Joe's Burgers"
                  value={newRestName}
                  onChange={e => setNewRestName(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="rest-slug">URL Slug</Label>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground shrink-0">.../menu/</span>
                  <Input
                    id="rest-slug"
                    placeholder="joes-burgers"
                    value={newRestSlug}
                    onChange={e => setNewRestSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '').replace(/\s+/g, '-'))}
                    required
                  />
                </div>
              </div>
            </CardContent>
            <CardFooter className="flex justify-between">
              <Button type="button" variant="ghost" onClick={handleLogout}>Logout</Button>
              <Button type="submit" disabled={creating}>
                {creating ? "Creating..." : "Create Restaurant"}
              </Button>
            </CardFooter>
          </form>
        </Card>
      </div>
    );
  }

  // Get role display name
  const getRoleBadge = () => {
    if (role === 'restaurant_admin' || role === 'super_admin') return 'Admin';
    return staffCategory?.name || 'Staff';
  };

  // CASE 3: Normal Dashboard (Has Role & Restaurant)
  return (
    <div className="min-h-screen w-full bg-muted/10">

      {/* --- MOBILE SIDEBAR OVERLAY (backdrop) --- */}
      {mobileSidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setMobileSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* --- MOBILE SIDEBAR DRAWER --- */}
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
          <AdminSidebar />
        </div>
      </div>

      {/* --- HEADER --- */}
      <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex h-14 items-center gap-2 px-3 sm:px-4 lg:px-8">

          {/* Mobile Hamburger */}
          <button
            className="md:hidden -ml-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
            onClick={() => setMobileSidebarOpen(true)}
            aria-label="Open sidebar"
          >
            <Menu className="h-5 w-5" />
          </button>

          {/* Restaurant Name Switcher */}
          <div className="min-w-0 flex-1 overflow-hidden">
            <div className="flex items-center gap-2">
              <Select value={restaurant?.id} disabled>
                <SelectTrigger className="h-9 w-auto min-w-0 max-w-[150px] sm:max-w-[240px] bg-transparent border-0 shadow-none hover:bg-accent/50 focus:ring-0 font-medium">
                  <SelectValue placeholder="Select restaurant" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={restaurant?.id || "current"}>
                    {restaurant?.name}
                  </SelectItem>
                </SelectContent>
              </Select>

              <Badge
                variant="secondary"
                className="hidden sm:inline-flex h-6 rounded-full px-2.5 text-[10px] uppercase tracking-wide shrink-0"
                style={staffCategory?.color ? { backgroundColor: staffCategory.color + '20', color: staffCategory.color } : {}}
              >
                {getRoleBadge()}
              </Badge>
            </div>
          </div>

          <Separator orientation="vertical" className="hidden h-6 md:block shrink-0" />

          {/* Notifications */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="relative h-9 w-9 shrink-0">
                <Bell className="h-5 w-5 text-muted-foreground" />
                {notifications.length > 0 && (
                  <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-primary ring-2 ring-background" />
                )}
                <span className="sr-only">Notifications</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-[min(340px,90vw)]">
              <DropdownMenuLabel>Notifications</DropdownMenuLabel>
              <DropdownMenuSeparator />

              {notifications.length > 0 ? (
                (notifications as any[]).map((n) => (
                  <DropdownMenuItem key={n.id} className="flex flex-col items-start gap-1 p-3 cursor-pointer">
                    <div className="flex w-full items-center justify-between gap-4">
                      <span className="text-sm font-medium line-clamp-1">{n.message}</span>
                      <span className="text-[10px] text-muted-foreground shrink-0">{timeAgo(n.created_at)}</span>
                    </div>
                  </DropdownMenuItem>
                ))
              ) : (
                <div className="p-4 text-center text-sm text-muted-foreground">
                  No new notifications
                </div>
              )}

              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-xs justify-center text-primary font-medium">
                View Activity Log
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Account Menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-9 gap-1.5 px-2 hover:bg-accent/50 shrink-0">
                <Avatar className="h-7 w-7 border">
                  <AvatarImage src="" />
                  <AvatarFallback className="bg-primary/10 text-primary text-xs">
                    {userEmail.substring(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <span className="hidden text-sm font-medium sm:inline max-w-[100px] truncate">
                  {userEmail}
                </span>
                <ChevronDown className="h-4 w-4 text-muted-foreground opacity-50" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col space-y-1">
                  <p className="text-sm font-medium leading-none">My Account</p>
                  <p className="text-xs leading-none text-muted-foreground truncate">{userEmail}</p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem>
                <User className="mr-2 h-4 w-4" /> Profile
              </DropdownMenuItem>
              <DropdownMenuItem>
                <Settings className="mr-2 h-4 w-4" /> Settings
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout} className="text-destructive focus:text-destructive">
                <LogOut className="mr-2 h-4 w-4" /> Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

        </div>
      </header>

      {/* Main Content Layout */}
      <div className="flex min-h-[calc(100vh-3.5rem)] w-full">
        <div className="hidden md:block shrink-0">
          <AdminSidebar />
        </div>

        <main className="flex-1 min-w-0 p-4 sm:p-6 lg:p-8 pb-20 md:pb-8 overflow-auto">
          {children}
        </main>
      </div>

      <div className="md:hidden">
        <AdminBottomNav />
      </div>
    </div>
  );
}