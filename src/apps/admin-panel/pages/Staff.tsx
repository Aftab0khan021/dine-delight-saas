import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { MoreHorizontal, RefreshCw, Shield, UserPlus, UserX } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useRestaurantContext } from "../state/restaurant-context";
import { useToast } from "@/hooks/use-toast";
import { type StaffRole } from "../components/staff/staff-utils";

// UI Components
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

// --- Validation ---
const inviteSchema = z.object({
  email: z.string().email("Enter a valid email"),
  role: z.enum(["restaurant_admin", "user"]),
});
type InviteForm = z.infer<typeof inviteSchema>;

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

  const inviteForm = useForm<InviteForm>({
    resolver: zodResolver(inviteSchema),
    defaultValues: { email: "", role: "user" },
  });

  // --- 1. Data Queries (From Repo B) ---
  const staffQuery = useQuery({
    queryKey: ["admin", "staff", restaurant?.id, "roles"],
    enabled: !!restaurant?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_roles")
        .select("user_id, role, profiles(full_name, email)")
        .eq("restaurant_id", restaurant!.id)
        .in("role", ["restaurant_admin", "user"]);
      if (error) throw error;
      return data ?? [];
    },
  });

  const invitesQuery = useQuery({
    queryKey: ["admin", "staff", restaurant?.id, "invites"],
    enabled: !!restaurant?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staff_invites")
        .select("id, email, role, status, updated_at")
        .eq("restaurant_id", restaurant!.id)
        .eq("status", "pending")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

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

  // --- 2. Mutations (From Repo B) ---
  const createInviteMutation = useMutation({
    mutationFn: async (values: InviteForm) => {
      if (!restaurant?.id) throw new Error("Missing restaurant");

      const { data, error } = await supabase.functions.invoke("invite-staff", {
        body: {
          email: values.email,
          role: values.role,
          restaurant_id: restaurant.id,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      setInviteOpen(false);
      inviteForm.reset();
      toast({ title: "Invitation sent", description: "Staff member invited successfully." });
      qc.invalidateQueries({ queryKey: ["admin", "staff"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to invite staff.",
        variant: "destructive"
      });
    }
  });

  const changeRoleMutation = useMutation({
    mutationFn: async () => {
      if (!restaurant?.id || !roleTarget) throw new Error("Missing data");

      const { error } = await supabase.from("user_roles")
        .update({ role: newRole })
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
          restaurant_id: restaurant.id,
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

  // --- 3. Merging Data for the UI ---
  const tableData = useMemo(() => {
    const active = (staffQuery.data || []).map(s => ({
      id: s.user_id,
      name: s.profiles?.full_name || "Unknown",
      contact: s.profiles?.email || "—",
      role: s.role,
      status: "Active",
      type: "active" as const
    }));

    const invited = (invitesQuery.data || []).map(i => ({
      id: i.id,
      name: "Pending Accept",
      contact: i.email,
      role: i.role,
      status: "Invited",
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
            Invite staff, change roles, and review recent activity.
          </p>
        </div>

        <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
          <DialogTrigger asChild>
            <Button>
              <UserPlus className="mr-2 h-4 w-4" /> Invite staff
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader><DialogTitle>Invite staff</DialogTitle></DialogHeader>
            <form className="mt-2 space-y-4" onSubmit={inviteForm.handleSubmit((v) => createInviteMutation.mutate(v))}>
              <div className="space-y-2">
                <Label htmlFor="email">Email address</Label>
                <Input id="email" placeholder="colleague@example.com" {...inviteForm.register("email")} />
              </div>
              <div className="space-y-2">
                <Label>Role</Label>
                <Select value={inviteForm.watch("role")} onValueChange={(v) => inviteForm.setValue("role", v as any)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="user">User (Staff)</SelectItem>
                    <SelectItem value="restaurant_admin">Admin (Manager)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <DialogFooter>
                <Button type="button" variant="secondary" onClick={() => setInviteOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={createInviteMutation.isPending}>
                  {createInviteMutation.isPending ? "Sending..." : "Invite"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </header>

      <section className="grid gap-3 lg:grid-cols-3">
        {/* Staff List */}
        <Card className="shadow-soft lg:col-span-2">
          <CardHeader><CardTitle className="text-base">Team</CardTitle></CardHeader>
          <CardContent>
            {tableData.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground border-dashed border rounded-lg">No staff found. Invite someone!</div>
            ) : (
              <div className="rounded-xl border border-border bg-background">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Staff</TableHead>
                      <TableHead>Role</TableHead>
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
                              {s.type === 'invited' && (
                                <DropdownMenuItem onClick={() => resendInviteMutation.mutate({ id: s.id, email: s.contact })}>
                                  <RefreshCw className="mr-2 h-4 w-4" /> Resend invite
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
              <Label>Role</Label>
              <Select value={newRole} onValueChange={(v) => setNewRole(v as StaffRole)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">User (Staff)</SelectItem>
                  <SelectItem value="restaurant_admin">Admin (Manager)</SelectItem>
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
    </div>
  );
}