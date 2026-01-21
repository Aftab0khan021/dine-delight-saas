import { PropsWithChildren, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LogOut, Store } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
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
  const { loading, restaurant, role, accessDenied, refresh } = useRestaurantContext();
  
  // Local state for the "Create Restaurant" form
  const [newRestName, setNewRestName] = useState("");
  const [newRestSlug, setNewRestSlug] = useState("");
  const [creating, setCreating] = useState(false);

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

      // 1. Create the Restaurant
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

      // 2. Link it to this user
      const { error: linkError } = await supabase
        .from("user_roles")
        .update({ restaurant_id: restData.id })
        .eq("user_id", user.id);

      if (linkError) throw linkError;

      // 3. Refresh context to log them in
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

  // CASE 1: Access Denied (No Role)
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

  // CASE 2: Onboarding (Role exists, but No Restaurant)
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

        <main className="flex-1 p-4 md:p-6 pb-20 md:pb-6 overflow-auto">
          {children}
        </main>
      </div>

      <div className="md:hidden">
        <AdminBottomNav />
      </div>
    </div>
  );
}