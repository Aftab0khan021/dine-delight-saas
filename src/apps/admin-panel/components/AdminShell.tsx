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
  Menu
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
  const { loading, restaurant, role, accessDenied, refresh } = useRestaurantContext();

  const [userEmail, setUserEmail] = useState<string>("Admin");

  // Local state for the "Create Restaurant" form
  const [newRestName, setNewRestName] = useState("");
  const [newRestSlug, setNewRestSlug] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user?.email) setUserEmail(data.user.email);
    });
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
    // Refresh every minute to check for new activity
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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  // CASE 1: Access Denied
  if (accessDenied) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="max-w-md w-full space-y-4 text-center">
          <h1 className="text-xl font-semibold">Access denied</h1>
          <p className="text-sm text-muted-foreground">
            Your account doesn’t have the <span className="font-medium">restaurant_admin</span> role.
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
                  <span className="text-sm text-muted-foreground">.../menu/</span>
                  <Input
                    id="rest-slug"
                    placeholder="joes-burgers"
                    value={newRestSlug}
                    onChange={e => setNewRestSlug(e.target.value.toLowerCase().replace(/\s+/g, '-'))}
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

  // CASE 3: Normal Dashboard (Has Role & Restaurant)
  return (
    <div className="min-h-screen w-full bg-muted/10">

      {/* --- HEADER --- */}
      <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex h-14 items-center gap-3 px-4 lg:px-8">

          {/* Mobile Menu Icon */}
          <div className="md:hidden -ml-2 p-2 text-muted-foreground">
            <Menu className="h-5 w-5" />
          </div>

          {/* Restaurant Switcher */}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <Select value={restaurant?.id} disabled>
                <SelectTrigger className="h-9 w-auto min-w-[200px] max-w-[340px] bg-transparent border-0 shadow-none hover:bg-accent/50 focus:ring-0 font-medium">
                  <SelectValue placeholder="Select restaurant" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={restaurant?.id || "current"}>
                    {restaurant?.name}
                  </SelectItem>
                </SelectContent>
              </Select>

              <Badge variant="secondary" className="hidden sm:inline-flex h-6 rounded-full px-2.5 text-[10px] uppercase tracking-wide">
                {role === 'restaurant_admin' ? 'Admin' : 'Staff'}
              </Badge>
            </div>
          </div>

          <Separator orientation="vertical" className="hidden h-6 md:block" />

          {/* Notifications (REAL DATA) */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="relative h-9 w-9">
                <Bell className="h-5 w-5 text-muted-foreground" />
                {notifications.length > 0 && (
                  <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-primary ring-2 ring-background" />
                )}
                <span className="sr-only">Notifications</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-[340px]">
              <DropdownMenuLabel>Notifications</DropdownMenuLabel>
              <DropdownMenuSeparator />

              {/* Loop through REAL Activity Logs */}
              {notifications.length > 0 ? (
                notifications.map((n: any) => (
                  <DropdownMenuItem key={n.id} className="flex flex-col items-start gap-1 p-3 cursor-pointer">
                    <div className="flex w-full items-center justify-between gap-4">
                      <span className="text-sm font-medium line-clamp-1">{n.message}</span>
                      <span className="text-[10px] text-muted-foreground shrink-0">{timeAgo(n.created_at)}</span>
                    </div>
                    {/* Activity logs don't usually have a separate 'detail' field, so we just use message */}
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
              <Button variant="ghost" className="h-9 gap-2 px-2 hover:bg-accent/50">
                <Avatar className="h-7 w-7 border">
                  <AvatarImage src="" />
                  <AvatarFallback className="bg-primary/10 text-primary text-xs">
                    {userEmail.substring(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <span className="hidden text-sm font-medium md:inline max-w-[120px] truncate">
                  {userEmail}
                </span>
                <ChevronDown className="h-4 w-4 text-muted-foreground opacity-50" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col space-y-1">
                  <p className="text-sm font-medium leading-none">My Account</p>
                  <p className="text-xs leading-none text-muted-foreground">{userEmail}</p>
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
        <div className="hidden md:block">
          <AdminSidebar />
        </div>

        <main className="flex-1 p-4 md:p-8 pb-20 md:pb-8 overflow-auto">
          {children}
        </main>
      </div>

      <div className="md:hidden">
        <AdminBottomNav />
      </div>
    </div>
  );
}