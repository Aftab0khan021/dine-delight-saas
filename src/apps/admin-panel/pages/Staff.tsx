import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { MoreHorizontal, RefreshCw, Shield, UserPlus, UserX, AlertCircle, XCircle, RotateCcw, Settings, Plus, Loader2, Users } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useRestaurantContext } from "../state/restaurant-context";
import { useToast } from "@/hooks/use-toast";
import { type StaffRole, type StaffCategory, type Permission } from "../components/staff/staff-utils";
import { InviteStaffDialog } from "../components/staff/InviteStaffDialog";
import { CategoryDialog } from "../components/staff/CategoryDialog";
import { CategoryCard } from "../components/staff/CategoryCard";
import { FeatureGate } from "../components/FeatureGate";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

// UI Components
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

// --- Validation --- (Removed - now handled by InviteStaffDialog)

// --- Helper Functions ---
function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const roleBadgeVariant = (role: string) => {
  if (role === "restaurant_admin" || role === "Owner") return "default";
  return "secondary";
};

const statusBadgeVariant = (status: string) => {
  if (status === "Active") return "default";
  if (status === "Revoked") return "destructive";
  return "secondary";
};

export default function AdminStaff() {
  const { restaurant } = useRestaurantContext();
  const qc = useQueryClient();
  const { toast } = useToast();

  // State
  const [inviteOpen, setInviteOpen] = useState(false);
  const [roleDialogOpen, setRoleDialogOpen] = useState(false);
  const [roleTarget, setRoleTarget] = useState<{ id: string; name: string; role: string } | null>(null);
  const [newRole, setNewRole] = useState<StaffRole>("user");
  const [activeTab, setActiveTab] = useState("team");

  // Categories tab state
  const [catDialogOpen, setCatDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<StaffCategory | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // --- 1. Data Queries ---
  const staffQuery = useQuery({
    queryKey: ["admin", "staff", restaurant?.id, "roles"],
    enabled: !!restaurant?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_roles")
        .select("user_id, role, staff_category_id, profiles(full_name, email), staff_categories(id, name, color)")
        .eq("restaurant_id", restaurant!.id)
        .in("role", ["restaurant_admin", "user"])
        .order("role", { ascending: true });

      if (error) throw error;
      return (data ?? []).map((row: any) => ({
        user_id: row.user_id,
        role: row.role,
        staff_category_id: row.staff_category_id,
        profiles: { full_name: row.profiles?.full_name || "", email: row.profiles?.email || "" },
        staff_categories: row.staff_categories ? { id: row.staff_categories.id, name: row.staff_categories.name, color: row.staff_categories.color } : null,
      }));
    },
  });

  const invitesQuery = useQuery({
    queryKey: ["admin", "staff", restaurant?.id, "invites"],
    enabled: !!restaurant?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staff_invites")
        .select("id, email, role, status, updated_at, staff_category_id, staff_categories(id, name, color)")
        .eq("restaurant_id", restaurant!.id)
        .in("status", ["pending", "revoked"])
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  // Fetch staff categories for Change Role dialog
  const categoriesQuery = useQuery({
    queryKey: ["staff-categories", restaurant?.id],
    queryFn: async () => {
      if (!restaurant?.id) return [];
      const { data, error } = await supabase
        .from("staff_categories")
        .select("*")
        .eq("restaurant_id", restaurant.id)
        .order("name", { ascending: true });

      if (error) throw error;
      return data ?? [];
    },
    enabled: !!restaurant?.id,
  });

  // Permissions for categories tab
  const permissionsQuery = useQuery({
    queryKey: ["permissions"],
    queryFn: async () => {
      const { data, error } = await supabase.from("permissions").select("*").order("category", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Permission[];
    },
  });

  const categoryPermissionsQuery = useQuery({
    queryKey: ["category-permissions", restaurant?.id],
    queryFn: async () => {
      if (!restaurant?.id) return [];
      const { data, error } = await supabase
        .from("category_permissions")
        .select("category_id, permission_id, staff_categories!inner(restaurant_id)")
        .eq("staff_categories.restaurant_id", restaurant.id);
      if (error) throw error;
      return (data ?? []).map(({ category_id, permission_id }: any) => ({ category_id, permission_id }));
    },
    enabled: !!restaurant?.id,
  });

  const deleteCategoryMutation = useMutation({
    mutationFn: async (categoryId: string) => {
      const { error } = await supabase.from("staff_categories").delete().eq("id", categoryId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Category deleted", description: "Staff category has been removed." });
      qc.invalidateQueries({ queryKey: ["staff-categories"] });
      qc.invalidateQueries({ queryKey: ["category-permissions"] });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to delete", description: error.message, variant: "destructive" });
    },
  });

  // Category helpers
  const getCategoryPermissions = (categoryId: string): string[] =>
    categoryPermissionsQuery.data?.filter((cp: any) => cp.category_id === categoryId).map((cp: any) => cp.permission_id) || [];
  const getPermissionDetails = (permissionIds: string[]): Permission[] =>
    permissionsQuery.data?.filter((p) => permissionIds.includes(p.id)) || [];

  const activityQuery = useQuery({
    queryKey: ["admin", "staff", restaurant?.id, "activity"],
    enabled: !!restaurant?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("activity_logs")
        .select("id, action, message, created_at, actor_user_id, profiles(full_name, email)")
        .eq("restaurant_id", restaurant!.id)
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data ?? [];
    },
  });

  // Fetch staff limit from plan/override
  const { data: staffLimit } = useQuery({
    queryKey: ["admin", "staff", restaurant?.id, "limit"],
    enabled: !!restaurant?.id,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_feature_limit_for_restaurant', {
        p_restaurant_id: restaurant!.id,
        p_feature_key: 'staff_limit'
      });
      if (error) throw error;
      return data as number;
    },
  });

  // Calculate current staff count and check if at limit
  const currentStaffCount = staffQuery.data?.length || 0;
  const isAtLimit = staffLimit !== undefined && staffLimit !== -1 && currentStaffCount >= staffLimit;
  const isUnlimited = staffLimit === -1;

  // --- 2. Mutations (From Repo B) --- (Invite mutation removed - handled by InviteStaffDialog)

  const changeRoleMutation = useMutation({
    mutationFn: async () => {
      if (!restaurant?.id || !roleTarget) throw new Error("Missing data");

      // When staff categories exist, the select value is a category UUID.
      // Write it to staff_category_id (not role). Role stays "user".
      const hasCategories = categoriesQuery.data && categoriesQuery.data.length > 0;
      const isCategory = hasCategories && categoriesQuery.data!.some((c: any) => c.id === newRole);

      const updatePayload = isCategory
        ? { staff_category_id: newRole, role: "user" as const }
        : { role: newRole, staff_category_id: null };

      const { error } = await supabase.from("user_roles")
        .update(updatePayload)
        .eq("restaurant_id", restaurant.id)
        .eq("user_id", roleTarget.id);

      if (error) throw error;

      // Log activity
      try {
        const { data: { user } } = await supabase.auth.getUser();
        await supabase.from("activity_logs").insert({
          restaurant_id: restaurant.id,
          entity_type: "user_role",
          entity_id: roleTarget.id,
          action: "role_changed",
          message: `Changed ${roleTarget.name}'s role to ${newRole}`,
          actor_user_id: user?.id
        });
      } catch (logError) {
        console.error("Failed to log activity:", logError);
      }
    },
    onSuccess: () => {
      setRoleDialogOpen(false);
      toast({ title: "Role updated", description: `${roleTarget?.name} is now ${newRole}` });
      qc.invalidateQueries({ queryKey: ["admin", "staff"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to update role",
        description: error.message || "Please try again",
        variant: "destructive"
      });
    }
  });

  const deactivateMutation = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase
        .from("user_roles")
        .delete()
        .eq("restaurant_id", restaurant!.id)
        .eq("user_id", userId);

      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Staff removed", description: "User has been removed from your team" });
      qc.invalidateQueries({ queryKey: ["admin", "staff"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to remove staff",
        description: error.message || "Please try again",
        variant: "destructive"
      });
    }
  });

  const resendInviteMutation = useMutation({
    mutationFn: async ({ id, email }: { id: string, email: string }) => {
      if (!restaurant?.id) throw new Error("Missing restaurant");

      const { data, error } = await supabase.functions.invoke("invite-staff", {
        body: {
          email: email,
          restaurantId: restaurant.id,
          action: "resend",
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (_, variables) => {
      toast({ title: `Resent to ${variables.email}` });
      qc.invalidateQueries({ queryKey: ["admin", "staff"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to resend invitation.",
        variant: "destructive"
      });
    }
  });

  // Revoke an invite — sets status to 'revoked'
  const revokeInviteMutation = useMutation({
    mutationFn: async (inviteId: string) => {
      if (!restaurant?.id) throw new Error("Missing restaurant");
      const { error } = await supabase
        .from("staff_invites")
        .update({ status: "revoked" as any })
        .eq("id", inviteId)
        .eq("restaurant_id", restaurant.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Invite revoked", description: "The staff member can no longer accept this invitation." });
      qc.invalidateQueries({ queryKey: ["admin", "staff"] });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to revoke", description: error.message, variant: "destructive" });
    },
  });

  // Re-invite a revoked invite — sets status back to 'pending'
  const reinviteMutation = useMutation({
    mutationFn: async (inviteId: string) => {
      if (!restaurant?.id) throw new Error("Missing restaurant");
      const { error } = await supabase
        .from("staff_invites")
        .update({ status: "pending" as any })
        .eq("id", inviteId)
        .eq("restaurant_id", restaurant.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Invite restored", description: "The invitation is active again." });
      qc.invalidateQueries({ queryKey: ["admin", "staff"] });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to restore", description: error.message, variant: "destructive" });
    },
  });

  // --- 3. Merging Data for the UI ---
  const tableData = useMemo(() => {
    const active = (staffQuery.data || []).map(s => ({
      id: s.user_id,
      name: s.profiles?.full_name || "Unknown",
      contact: s.profiles?.email || "—",
      role: s.role,
      category: s.staff_categories?.name || null,
      categoryColor: s.staff_categories?.color || null,
      status: "Active" as const,
      type: "active" as const
    }));

    const invited = (invitesQuery.data || []).map((i: any) => ({
      id: i.id,
      name: i.status === "revoked" ? "Revoked" : "Pending Accept",
      contact: i.email,
      role: i.role,
      category: i.staff_categories?.name || null,
      categoryColor: i.staff_categories?.color || null,
      status: i.status === "revoked" ? "Revoked" as const : "Invited" as const,
      type: "invited" as const
    }));

    return [...active, ...invited];
  }, [staffQuery.data, invitesQuery.data]);

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Staff Management</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Invite staff, manage roles, categories, and review activity.
          </p>
          {staffLimit !== undefined && (
            <p className="mt-2 text-sm font-medium">
              Staff: {currentStaffCount} / {isUnlimited ? '∞' : staffLimit}
              {isAtLimit && <span className="text-destructive ml-2">• Limit reached</span>}
            </p>
          )}
        </div>

        <div className="flex gap-2">
          <Button variant="outline" size="icon" onClick={() => { qc.invalidateQueries({ queryKey: ["admin", "staff"] }); qc.invalidateQueries({ queryKey: ["staff-categories"] }); }} title="Refresh">
            <RefreshCw className={`h-4 w-4 ${staffQuery.isFetching || invitesQuery.isFetching ? 'animate-spin' : ''}`} />
          </Button>
          {activeTab === "team" && (
            <Button disabled={isAtLimit} onClick={() => setInviteOpen(true)}>
              <UserPlus className="mr-2 h-4 w-4" /> Invite staff
            </Button>
          )}
          {activeTab === "categories" && (
            <Button onClick={() => { setEditingCategory(null); setCatDialogOpen(true); }}>
              <Plus className="mr-2 h-4 w-4" /> Create Category
            </Button>
          )}
        </div>

        <InviteStaffDialog open={inviteOpen} onOpenChange={setInviteOpen} />
      </header>

      {/* Staff Limit Warning */}
      {isAtLimit && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Staff Limit Reached</AlertTitle>
          <AlertDescription>
            You've reached your plan's staff limit of {staffLimit} members.
            To add more staff, please upgrade your subscription plan.
          </AlertDescription>
        </Alert>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="team"><Users className="mr-1.5 h-4 w-4" /> Team</TabsTrigger>
          <TabsTrigger value="categories"><Settings className="mr-1.5 h-4 w-4" /> Categories</TabsTrigger>
        </TabsList>

        {/* ── TEAM TAB ── */}
        <TabsContent value="team" className="mt-4">
      <section className="grid gap-3 lg:grid-cols-3">
        {/* Staff List */}
        <Card className="shadow-soft lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Team</CardTitle>
            {staffLimit !== undefined && !isUnlimited && (
              <CardDescription>
                {currentStaffCount} of {staffLimit} staff members used
              </CardDescription>
            )}
          </CardHeader>
          <CardContent>
            {tableData.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground border-dashed border rounded-lg">No staff found. Invite someone!</div>
            ) : (
              <div className="rounded-xl border border-border bg-background overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Staff</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tableData.map((s) => (
                      <TableRow key={s.id} className="align-middle">
                        <TableCell>
                          <div className="font-medium">{s.name}</div>
                          <div className="mt-0.5 text-xs text-muted-foreground">{s.contact}</div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={roleBadgeVariant(s.role)}>{s.role === 'restaurant_admin' ? 'Admin' : 'Staff'}</Badge>
                        </TableCell>
                        <TableCell>
                          {s.category ? (
                            <Badge
                              variant="outline"
                              style={{
                                borderColor: s.categoryColor,
                                color: s.categoryColor
                              }}
                            >
                              {s.category}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground text-sm">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant={statusBadgeVariant(s.status)}>{s.status}</Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuLabel>Actions</DropdownMenuLabel>
                              <DropdownMenuSeparator />

                              {/* Actions for ACTIVE users */}
                              {s.type === 'active' && (
                                <>
                                  <DropdownMenuItem onClick={() => {
                                    setRoleTarget({ id: s.id, name: s.name, role: s.role });
                                    setNewRole(s.role as StaffRole);
                                    setRoleDialogOpen(true);
                                  }}>
                                    <Shield className="mr-2 h-4 w-4" /> Change role
                                  </DropdownMenuItem>
                                  <DropdownMenuItem className="text-destructive" onClick={() => deactivateMutation.mutate(s.id)}>
                                    <UserX className="mr-2 h-4 w-4" /> Deactivate
                                  </DropdownMenuItem>
                                </>
                              )}

                              {/* Actions for INVITED users */}
                              {s.type === 'invited' && s.status === 'Invited' && (
                                <>
                                  <DropdownMenuItem onClick={() => resendInviteMutation.mutate({ id: s.id, email: s.contact })}>
                                    <RefreshCw className="mr-2 h-4 w-4" /> Resend invite
                                  </DropdownMenuItem>
                                  <DropdownMenuItem className="text-destructive" onClick={() => revokeInviteMutation.mutate(s.id)}>
                                    <XCircle className="mr-2 h-4 w-4" /> Revoke invite
                                  </DropdownMenuItem>
                                </>
                              )}

                              {/* Actions for REVOKED invites */}
                              {s.type === 'invited' && s.status === 'Revoked' && (
                                <DropdownMenuItem onClick={() => reinviteMutation.mutate(s.id)}>
                                  <RotateCcw className="mr-2 h-4 w-4" /> Re-invite
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Activity Feed */}
        <Card className="shadow-soft lg:col-span-1">
          <CardHeader><CardTitle className="text-base">Activity</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {(activityQuery.data || []).map((a: any) => (
              <div key={a.id} className="rounded-xl border border-border bg-background p-3">
                <div className="text-xs text-muted-foreground">{formatTime(a.created_at)}</div>
                <div className="mt-1 text-sm">{a.message}</div>
              </div>
            ))}
            {(activityQuery.data || []).length === 0 && (
              <div className="text-xs text-muted-foreground p-2">No recent activity.</div>
            )}
          </CardContent>
        </Card>
      </section>
        </TabsContent>

        {/* ── CATEGORIES TAB ── */}
        <TabsContent value="categories" className="mt-4">
          {categoriesQuery.isLoading || permissionsQuery.isLoading ? (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : categoriesQuery.data && categoriesQuery.data.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {categoriesQuery.data.map((category: any) => {
                const pIds = getCategoryPermissions(category.id);
                const perms = getPermissionDetails(pIds);
                return (
                  <CategoryCard
                    key={category.id}
                    category={category}
                    permissions={perms}
                    onEdit={(cat) => { setEditingCategory(cat); setCatDialogOpen(true); }}
                    onDelete={(id) => setDeleteId(id)}
                  />
                );
              })}
            </div>
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center justify-center h-64 text-center">
                <Users className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">No staff categories yet</h3>
                <p className="text-sm text-muted-foreground mb-4 max-w-sm">
                  Create your first staff category to start managing permissions for your team members.
                </p>
                <Button onClick={() => { setEditingCategory(null); setCatDialogOpen(true); }}>
                  <Plus className="mr-2 h-4 w-4" /> Create First Category
                </Button>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Change Role Dialog */}
      <Dialog open={roleDialogOpen} onOpenChange={setRoleDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Change role</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="rounded-xl border border-border bg-muted/40 p-3">
              <div className="text-sm font-medium">Staff member</div>
              <div className="text-sm text-muted-foreground">{roleTarget?.name}</div>
            </div>
            <div className="space-y-2">
              <Label>{categoriesQuery.data && categoriesQuery.data.length > 0 ? "Staff Category" : "Role"}</Label>
              <Select value={newRole} onValueChange={(v) => setNewRole(v as StaffRole)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {categoriesQuery.data && categoriesQuery.data.length > 0 ? (
                    <>
                      {categoriesQuery.data.map((category: any) => (
                        <SelectItem key={category.id} value={category.id}>
                          <div className="flex items-center gap-2">
                            <div
                              className="w-3 h-3 rounded-full"
                              style={{ backgroundColor: category.color }}
                            />
                            <span>{category.name}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </>
                  ) : (
                    <>
                      <SelectItem value="user">User (Staff)</SelectItem>
                      <SelectItem value="restaurant_admin">Admin (Manager)</SelectItem>
                    </>
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setRoleDialogOpen(false)}>Cancel</Button>
            <Button onClick={() => changeRoleMutation.mutate()} disabled={changeRoleMutation.isPending}>
              {changeRoleMutation.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Category Dialog */}
      {restaurant && (
        <CategoryDialog
          open={catDialogOpen}
          onOpenChange={(open) => { setCatDialogOpen(open); if (!open) setEditingCategory(null); }}
          category={editingCategory}
          permissions={permissionsQuery.data || []}
          restaurantId={restaurant.id}
        />
      )}

      {/* Delete Category Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Category</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure? Staff assigned to this category will lose it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { if (deleteId) { deleteCategoryMutation.mutate(deleteId); setDeleteId(null); } }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}