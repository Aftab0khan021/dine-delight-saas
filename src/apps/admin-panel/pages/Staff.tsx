import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { addDays } from "date-fns";
import { MoreHorizontal, Plus, RefreshCw, UserMinus } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useRestaurantContext } from "../state/restaurant-context";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { useToast } from "@/hooks/use-toast";
import { InviteStaffDialog } from "../components/staff/InviteStaffDialog";
import { buildInviteToken, sha256Hex, type StaffRole } from "../components/staff/staff-utils";
import type { InviteValues } from "../components/staff/validation";

type StaffRow = {
  user_id: string;
  role: StaffRole;
  profiles: { full_name: string | null; email: string } | null;
};

type InviteRow = {
  id: string;
  email: string;
  role: StaffRole;
  status: "pending" | "accepted" | "expired" | "revoked";
  accepted_at: string | null;
  expires_at: string;
  updated_at: string;
};

type ActivityRow = {
  id: string;
  action: string;
  message: string | null;
  created_at: string;
  actor_user_id: string | null;
  profiles: { full_name: string | null; email: string } | null;
};

function shortId(id: string) {
  return id?.slice(0, 8) ?? "—";
}

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AdminStaff() {
  const { restaurant } = useRestaurantContext();
  const qc = useQueryClient();
  const { toast } = useToast();

  const [inviteOpen, setInviteOpen] = useState(false);

  const staffQuery = useQuery({
    queryKey: ["admin", "staff", restaurant?.id, "roles"],
    enabled: !!restaurant?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_roles")
        .select("user_id, role, profiles(full_name, email)")
        .eq("restaurant_id", restaurant!.id)
        .in("role", ["restaurant_admin", "user"]) // avoid super_admin
        .order("created_at", { ascending: true });

      if (error) throw error;
      return (data ?? []) as unknown as StaffRow[];
    },
  });

  const invitesQuery = useQuery({
    queryKey: ["admin", "staff", restaurant?.id, "invites"],
    enabled: !!restaurant?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staff_invites")
        .select("id, email, role, status, accepted_at, expires_at, updated_at")
        .eq("restaurant_id", restaurant!.id)
        .order("created_at", { ascending: false })
        .limit(200);

      if (error) throw error;
      return (data ?? []) as InviteRow[];
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
        .limit(20);

      if (error) throw error;
      return (data ?? []) as unknown as ActivityRow[];
    },
  });

  const createInviteMutation = useMutation({
    mutationFn: async (values: InviteValues) => {
      if (!restaurant?.id) throw new Error("Missing restaurant");

      const {
        data: { session },
      } = await supabase.auth.getSession();

      const actorId = session?.user?.id ?? null;

      const token = buildInviteToken();
      const token_hash = await sha256Hex(token);
      const expires_at = addDays(new Date(), 7).toISOString();

      // Basic de-dupe: don’t create a second pending invite for same email
      const { data: existing, error: existingErr } = await supabase
        .from("staff_invites")
        .select("id")
        .eq("restaurant_id", restaurant.id)
        .eq("email", values.email)
        .eq("status", "pending")
        .limit(1)
        .maybeSingle();

      if (existingErr) throw existingErr;
      if (existing?.id) {
        return { inviteId: existing.id, created: false };
      }

      const { data: inserted, error } = await supabase
        .from("staff_invites")
        .insert({
          restaurant_id: restaurant.id,
          email: values.email,
          role: values.role,
          status: "pending",
          token_hash,
          expires_at,
          invited_by: actorId,
        })
        .select("id")
        .single();

      if (error) throw error;

      const inviteId = inserted.id as string;

      const { error: logErr } = await supabase.from("activity_logs").insert({
        restaurant_id: restaurant.id,
        action: "staff_invited",
        entity_type: "staff_invite",
        entity_id: inviteId,
        actor_user_id: actorId,
        message: `Invited ${values.email} as ${values.role}`,
        metadata: { email: values.email, role: values.role },
      });

      if (logErr) throw logErr;

      return { inviteId, created: true };
    },
    onSuccess: async (res) => {
      setInviteOpen(false);
      toast({
        title: res.created ? "Invite created" : "Invite already exists",
        description: res.created ? "Invite saved." : "There is already a pending invite for that email.",
      });
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["admin", "staff", restaurant?.id, "invites"] }),
        qc.invalidateQueries({ queryKey: ["admin", "staff", restaurant?.id, "activity"] }),
      ]);
    },
  });

  const changeRoleMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: StaffRole }) => {
      if (!restaurant?.id) throw new Error("Missing restaurant");

      const {
        data: { session },
      } = await supabase.auth.getSession();
      const actorId = session?.user?.id ?? null;

      const { error } = await supabase
        .from("user_roles")
        .update({ role })
        .eq("restaurant_id", restaurant.id)
        .eq("user_id", userId)
        .in("role", ["restaurant_admin", "user"]);
      if (error) throw error;

      const { error: logErr } = await supabase.from("activity_logs").insert({
        restaurant_id: restaurant.id,
        action: "staff_role_changed",
        entity_type: "user_role",
        entity_id: null,
        actor_user_id: actorId,
        message: `Changed role for ${userId} to ${role}`,
        metadata: { user_id: userId, role },
      });
      if (logErr) throw logErr;
    },
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: ["admin", "staff", restaurant?.id, "roles"] }),
        qc.invalidateQueries({ queryKey: ["admin", "staff", restaurant?.id, "activity"] }),
      ]),
  });

  const deactivateMutation = useMutation({
    mutationFn: async ({ userId }: { userId: string }) => {
      if (!restaurant?.id) throw new Error("Missing restaurant");

      const {
        data: { session },
      } = await supabase.auth.getSession();
      const actorId = session?.user?.id ?? null;

      const { error } = await supabase
        .from("user_roles")
        .delete()
        .eq("restaurant_id", restaurant.id)
        .eq("user_id", userId)
        .in("role", ["restaurant_admin", "user"]);
      if (error) throw error;

      const { error: logErr } = await supabase.from("activity_logs").insert({
        restaurant_id: restaurant.id,
        action: "staff_deactivated",
        entity_type: "user_role",
        entity_id: null,
        actor_user_id: actorId,
        message: `Removed staff access for ${userId}`,
        metadata: { user_id: userId },
      });
      if (logErr) throw logErr;
    },
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: ["admin", "staff", restaurant?.id, "roles"] }),
        qc.invalidateQueries({ queryKey: ["admin", "staff", restaurant?.id, "activity"] }),
      ]),
  });

  const resendInviteMutation = useMutation({
    mutationFn: async ({ id, email, role }: { id: string; email: string; role: StaffRole }) => {
      if (!restaurant?.id) throw new Error("Missing restaurant");

      const {
        data: { session },
      } = await supabase.auth.getSession();
      const actorId = session?.user?.id ?? null;

      const { error } = await supabase
        .from("staff_invites")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("restaurant_id", restaurant.id);
      if (error) throw error;

      const { error: logErr } = await supabase.from("activity_logs").insert({
        restaurant_id: restaurant.id,
        action: "staff_invite_resent",
        entity_type: "staff_invite",
        entity_id: id,
        actor_user_id: actorId,
        message: `Resent invite to ${email} as ${role}`,
        metadata: { email, role },
      });
      if (logErr) throw logErr;
    },
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: ["admin", "staff", restaurant?.id, "invites"] }),
        qc.invalidateQueries({ queryKey: ["admin", "staff", restaurant?.id, "activity"] }),
      ]),
  });

  const staff = staffQuery.data ?? [];
  const invites = (invitesQuery.data ?? []).filter((i) => i.status === "pending");

  const staffEmpty = !staffQuery.isLoading && staff.length === 0 && invites.length === 0;

  const rolesByUser = useMemo(() => {
    const map = new Map<string, StaffRole>();
    for (const s of staff) map.set(s.user_id, s.role);
    return map;
  }, [staff]);

  return (
    <section className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Staff</h1>
        <p className="text-sm text-muted-foreground">Invite and manage staff access for {restaurant?.name}.</p>
      </header>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Staff list + Invites */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle>Team</CardTitle>
                <CardDescription>Active staff and pending invites.</CardDescription>
              </div>
              <Button onClick={() => setInviteOpen(true)}>
                <Plus className="h-4 w-4" />
                Invite
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {staffEmpty ? (
              <div className="rounded-lg border border-dashed p-6 text-center">
                <p className="font-medium">No staff yet</p>
                <p className="text-sm text-muted-foreground">Invite someone to get started.</p>
              </div>
            ) : (
              <>
                <div className="hidden md:block">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Role</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(staffQuery.isLoading ? [] : staff).map((s) => (
                        <TableRow key={`staff-${s.user_id}`}>
                          <TableCell className="font-medium">{s.profiles?.full_name ?? "—"}</TableCell>
                          <TableCell className="text-muted-foreground">{s.profiles?.email ?? "—"}</TableCell>
                          <TableCell>
                            <Select
                              value={rolesByUser.get(s.user_id) ?? "user"}
                              onValueChange={(v) => changeRoleMutation.mutate({ userId: s.user_id, role: v as StaffRole })}
                            >
                              <SelectTrigger className="w-[200px]">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="user">User</SelectItem>
                                <SelectItem value="restaurant_admin">Restaurant admin</SelectItem>
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary">Active</Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="outline" size="sm">
                                  <MoreHorizontal className="h-4 w-4" />
                                  Manage
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                  onClick={() => deactivateMutation.mutate({ userId: s.user_id })}
                                  className="text-destructive focus:text-destructive"
                                >
                                  <UserMinus className="mr-2 h-4 w-4" />
                                  Deactivate
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      ))}

                      {invites.map((i) => (
                        <TableRow key={`invite-${i.id}`}>
                          <TableCell className="font-medium">—</TableCell>
                          <TableCell className="text-muted-foreground">{i.email}</TableCell>
                          <TableCell>
                            <Badge variant="secondary">{i.role}</Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary">Invited</Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="inline-flex items-center gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => resendInviteMutation.mutate({ id: i.id, email: i.email, role: i.role })}
                              >
                                <RefreshCw className="h-4 w-4" />
                                Resend
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}

                      {staffQuery.isLoading || invitesQuery.isLoading ? (
                        <TableRow>
                          <TableCell colSpan={5} className="text-sm text-muted-foreground">
                            Loading…
                          </TableCell>
                        </TableRow>
                      ) : null}
                    </TableBody>
                  </Table>
                </div>

                {/* Mobile cards */}
                <div className="grid gap-3 md:hidden">
                  {staff.map((s) => (
                    <Card key={`staff-m-${s.user_id}`}>
                      <CardContent className="pt-6 space-y-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-medium">{s.profiles?.full_name ?? "—"}</p>
                            <p className="text-sm text-muted-foreground">{s.profiles?.email ?? "—"}</p>
                          </div>
                          <Badge variant="secondary">Active</Badge>
                        </div>

                        <div className="grid gap-2">
                          <div className="grid gap-1">
                            <p className="text-xs text-muted-foreground">Role</p>
                            <Select
                              value={rolesByUser.get(s.user_id) ?? "user"}
                              onValueChange={(v) => changeRoleMutation.mutate({ userId: s.user_id, role: v as StaffRole })}
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="user">User</SelectItem>
                                <SelectItem value="restaurant_admin">Restaurant admin</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>

                          <Button
                            variant="outline"
                            onClick={() => deactivateMutation.mutate({ userId: s.user_id })}
                            className="justify-start"
                          >
                            <UserMinus className="h-4 w-4" />
                            Deactivate
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}

                  {invites.map((i) => (
                    <Card key={`invite-m-${i.id}`}>
                      <CardContent className="pt-6 space-y-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-medium">{i.email}</p>
                            <p className="text-sm text-muted-foreground">{i.role}</p>
                          </div>
                          <Badge variant="secondary">Invited</Badge>
                        </div>
                        <Separator />
                        <Button
                          variant="outline"
                          onClick={() => resendInviteMutation.mutate({ id: i.id, email: i.email, role: i.role })}
                          className="justify-start"
                        >
                          <RefreshCw className="h-4 w-4" />
                          Resend invite
                        </Button>
                      </CardContent>
                    </Card>
                  ))}

                  {staffQuery.isLoading || invitesQuery.isLoading ? (
                    <p className="text-sm text-muted-foreground">Loading…</p>
                  ) : null}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Activity panel */}
        <Card>
          <CardHeader>
            <CardTitle>Recent activity</CardTitle>
            <CardDescription>Latest changes for this restaurant.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {activityQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">Loading activity…</p>
            ) : (activityQuery.data?.length ?? 0) === 0 ? (
              <div className="rounded-lg border border-dashed p-4 text-center">
                <p className="text-sm font-medium">No activity yet</p>
                <p className="text-xs text-muted-foreground">Invites and role changes will appear here.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {(activityQuery.data ?? []).map((a) => (
                  <div key={a.id} className="rounded-lg border p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{a.action}</p>
                        <p className="text-xs text-muted-foreground">
                          {a.profiles?.full_name ?? a.profiles?.email ?? (a.actor_user_id ? shortId(a.actor_user_id) : "System")}
                          {a.message ? ` — ${a.message}` : ""}
                        </p>
                      </div>
                      <p className="text-xs text-muted-foreground shrink-0">{formatTime(a.created_at)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <InviteStaffDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        saving={createInviteMutation.isPending}
        onSubmit={async (values) => {
          await createInviteMutation.mutateAsync(values);
        }}
      />
    </section>
  );
}
