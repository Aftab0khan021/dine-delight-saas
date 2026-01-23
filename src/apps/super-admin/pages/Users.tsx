import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
    Search,
    MoreHorizontal,
    UserX,
    UserCheck,
    RefreshCw,
    Shield,
    Trash2,
    Download,
    Mail,
    LogOut,
    User as UserIcon
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
    resetUserPassword,
    forceLogoutUser,
    disableUserAccount,
    enableUserAccount
} from "../lib/user-management";

// UI Components
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

// Types
type UserRow = {
    id: string;
    email: string;
    full_name: string | null;
    avatar_url: string | null;
    created_at: string;
    last_sign_in_at: string | null;
    account_status: string;
    disabled_reason: string | null;
    roles: Array<{
        role: string;
        restaurant_id: string;
        restaurant_name: string;
    }>;
};

// Helpers
function formatDate(dateStr: string | null) {
    if (!dateStr) return "Never";
    return new Date(dateStr).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
    });
}

function getInitials(name: string | null, email: string) {
    if (name) {
        const parts = name.split(" ");
        return parts.length > 1
            ? `${parts[0][0]}${parts[1][0]}`.toUpperCase()
            : name.slice(0, 2).toUpperCase();
    }
    return email.slice(0, 2).toUpperCase();
}

const roleBadgeVariant = (role: string) => {
    if (role === "super_admin") return "default";
    if (role === "restaurant_admin") return "secondary";
    return "outline";
};

const accountStatusBadge = (status: string) => {
    if (status === "disabled") return { variant: "destructive" as const, label: "Disabled" };
    if (status === "suspended") return { variant: "secondary" as const, label: "Suspended" };
    return { variant: "default" as const, label: "Active" };
};

export default function Users() {
    const { toast } = useToast();
    const queryClient = useQueryClient();

    // State
    const [search, setSearch] = useState("");
    const [roleFilter, setRoleFilter] = useState("all");
    const [statusFilter, setStatusFilter] = useState("all");
    const [confirmDialog, setConfirmDialog] = useState<{
        open: boolean;
        action: string;
        userId: string;
        userEmail: string;
    }>({ open: false, action: "", userId: "", userEmail: "" });
    const [disableReason, setDisableReason] = useState("");

    // Fetch all users with their roles
    const { data: users, isLoading } = useQuery({
        queryKey: ["super-admin", "users"],
        queryFn: async () => {
            // Get all profiles with user roles
            const { data: profiles, error: profilesError } = await (supabase as any)
                .from("profiles")
                .select(`
          id,
          email,
          full_name,
          avatar_url,
          created_at,
          account_status,
          disabled_reason
        `)
                .order("created_at", { ascending: false });

            if (profilesError) throw profilesError;

            // Get user roles for each user
            const { data: userRoles, error: rolesError } = await (supabase as any)
                .from("user_roles")
                .select(`
          user_id,
          role,
          restaurant_id,
          restaurants (
            name
          )
        `);

            if (rolesError) throw rolesError;

            // Combine data
            const usersWithRoles = profiles.map((profile: any) => {
                const roles = userRoles
                    .filter((ur: any) => ur.user_id === profile.id)
                    .map((ur: any) => ({
                        role: ur.role,
                        restaurant_id: ur.restaurant_id,
                        restaurant_name: ur.restaurants?.name || "Unknown",
                    }));

                return {
                    ...profile,
                    roles,
                    last_sign_in_at: null, // Will be populated via RPC later
                };
            });

            return usersWithRoles as UserRow[];
        },
    });

    // Filtered users
    const filteredUsers = useMemo(() => {
        if (!users) return [];

        return users.filter((user) => {
            // Search filter
            const searchLower = search.toLowerCase();
            const matchesSearch =
                !search ||
                user.email.toLowerCase().includes(searchLower) ||
                user.full_name?.toLowerCase().includes(searchLower);

            // Role filter
            const matchesRole =
                roleFilter === "all" ||
                user.roles.some((r) => r.role === roleFilter);

            // Status filter
            const matchesStatus =
                statusFilter === "all" ||
                user.account_status === statusFilter;

            return matchesSearch && matchesRole && matchesStatus;
        });
    }, [users, search, roleFilter, statusFilter]);

    // Reset password mutation
    const resetPasswordMutation = useMutation({
        mutationFn: async (userId: string) => {
            return await resetUserPassword(userId, "Password reset requested by super admin");
        },
        onSuccess: (data) => {
            toast({
                title: "Success",
                description: data.message,
            });
            setConfirmDialog({ open: false, action: "", userId: "", userEmail: "" });
        },
        onError: (error: any) => {
            toast({
                title: "Failed to reset password",
                description: error.message,
                variant: "destructive",
            });
        },
    });

    // Force logout mutation
    const forceLogoutMutation = useMutation({
        mutationFn: async (userId: string) => {
            return await forceLogoutUser(userId, "Force logout by super admin");
        },
        onSuccess: (data) => {
            toast({
                title: "Success",
                description: data.message,
            });
            setConfirmDialog({ open: false, action: "", userId: "", userEmail: "" });
        },
        onError: (error: any) => {
            toast({
                title: "Failed to logout user",
                description: error.message,
                variant: "destructive",
            });
        },
    });

    // Disable account mutation
    const disableAccountMutation = useMutation({
        mutationFn: async ({ userId, reason }: { userId: string; reason: string }) => {
            return await disableUserAccount(userId, reason);
        },
        onSuccess: (data) => {
            toast({
                title: "Success",
                description: data.message,
            });
            queryClient.invalidateQueries({ queryKey: ["super-admin", "users"] });
            setConfirmDialog({ open: false, action: "", userId: "", userEmail: "" });
            setDisableReason("");
        },
        onError: (error: any) => {
            toast({
                title: "Failed to disable account",
                description: error.message,
                variant: "destructive",
            });
        },
    });

    // Enable account mutation
    const enableAccountMutation = useMutation({
        mutationFn: async (userId: string) => {
            return await enableUserAccount(userId);
        },
        onSuccess: (data) => {
            toast({
                title: "Success",
                description: data.message,
            });
            queryClient.invalidateQueries({ queryKey: ["super-admin", "users"] });
            setConfirmDialog({ open: false, action: "", userId: "", userEmail: "" });
        },
        onError: (error: any) => {
            toast({
                title: "Failed to enable account",
                description: error.message,
                variant: "destructive",
            });
        },
    });

    // Handle user actions
    const handleAction = (action: string, userId: string, userEmail: string) => {
        setConfirmDialog({ open: true, action, userId, userEmail });
    };

    const confirmAction = async () => {
        const { action, userId, userEmail } = confirmDialog;

        switch (action) {
            case "reset_password":
                resetPasswordMutation.mutate(userId);
                break;
            case "disable":
                if (!disableReason.trim()) {
                    toast({
                        title: "Reason required",
                        description: "Please provide a reason for disabling the account",
                        variant: "destructive",
                    });
                    return;
                }
                disableAccountMutation.mutate({ userId, reason: disableReason });
                break;
            case "enable":
                enableAccountMutation.mutate(userId);
                break;
            case "logout":
                forceLogoutMutation.mutate(userId);
                break;
        }
    };

    return (
        <div className="space-y-6">
            <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                <div>
                    <h1 className="text-2xl font-semibold tracking-tight">Users</h1>
                    <p className="mt-1 text-sm text-muted-foreground">
                        Manage all users across all restaurants
                    </p>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" size="icon">
                        <Download className="h-4 w-4" />
                    </Button>
                </div>
            </header>

            {/* Filters */}
            <Card className="shadow-sm">
                <CardContent className="pt-6">
                    <div className="grid gap-3 md:grid-cols-4">
                        <div className="relative md:col-span-2">
                            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Search by email or name..."
                                className="pl-9"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                            />
                        </div>
                        <Select value={roleFilter} onValueChange={setRoleFilter}>
                            <SelectTrigger>
                                <SelectValue placeholder="Filter by role" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Roles</SelectItem>
                                <SelectItem value="super_admin">Super Admin</SelectItem>
                                <SelectItem value="restaurant_admin">Restaurant Admin</SelectItem>
                                <SelectItem value="user">User</SelectItem>
                            </SelectContent>
                        </Select>
                        <Select value={statusFilter} onValueChange={setStatusFilter}>
                            <SelectTrigger>
                                <SelectValue placeholder="Filter by status" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Status</SelectItem>
                                <SelectItem value="active">Active</SelectItem>
                                <SelectItem value="disabled">Disabled</SelectItem>
                                <SelectItem value="suspended">Suspended</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </CardContent>
            </Card>

            {/* Users Table */}
            <Card className="shadow-sm">
                <CardHeader>
                    <CardTitle className="text-base">
                        {filteredUsers.length} {filteredUsers.length === 1 ? "User" : "Users"}
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <div className="text-center py-8 text-muted-foreground">Loading users...</div>
                    ) : filteredUsers.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">No users found</div>
                    ) : (
                        <div className="rounded-xl border">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>User</TableHead>
                                        <TableHead>Roles</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead>Created</TableHead>
                                        <TableHead className="text-right">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {filteredUsers.map((user) => (
                                        <TableRow key={user.id}>
                                            <TableCell>
                                                <div className="flex items-center gap-3">
                                                    <Avatar className="h-8 w-8">
                                                        <AvatarImage src={user.avatar_url || undefined} />
                                                        <AvatarFallback>
                                                            {getInitials(user.full_name, user.email)}
                                                        </AvatarFallback>
                                                    </Avatar>
                                                    <div>
                                                        <div className="font-medium">{user.full_name || "No name"}</div>
                                                        <div className="text-xs text-muted-foreground">{user.email}</div>
                                                    </div>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex flex-wrap gap-1">
                                                    {user.roles.length === 0 ? (
                                                        <Badge variant="outline">No roles</Badge>
                                                    ) : (
                                                        user.roles.map((role, idx) => (
                                                            <Badge key={idx} variant={roleBadgeVariant(role.role)}>
                                                                {role.role === "super_admin"
                                                                    ? "Super Admin"
                                                                    : `${role.role === "restaurant_admin" ? "Admin" : "User"} @ ${role.restaurant_name}`}
                                                            </Badge>
                                                        ))
                                                    )}
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant={accountStatusBadge(user.account_status).variant}>
                                                    {accountStatusBadge(user.account_status).label}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-sm text-muted-foreground">
                                                {formatDate(user.created_at)}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                        <Button variant="ghost" size="icon">
                                                            <MoreHorizontal className="h-4 w-4" />
                                                        </Button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end">
                                                        <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                                        <DropdownMenuSeparator />
                                                        <DropdownMenuItem
                                                            onClick={() => handleAction("reset_password", user.id, user.email)}
                                                        >
                                                            <Mail className="mr-2 h-4 w-4" />
                                                            Reset Password
                                                        </DropdownMenuItem>
                                                        <DropdownMenuItem
                                                            onClick={() => handleAction("logout", user.id, user.email)}
                                                        >
                                                            <LogOut className="mr-2 h-4 w-4" />
                                                            Force Logout
                                                        </DropdownMenuItem>
                                                        {user.account_status === "disabled" ? (
                                                            <DropdownMenuItem
                                                                onClick={() => handleAction("enable", user.id, user.email)}
                                                            >
                                                                <UserCheck className="mr-2 h-4 w-4" />
                                                                Enable Account
                                                            </DropdownMenuItem>
                                                        ) : (
                                                            <DropdownMenuItem
                                                                onClick={() => handleAction("disable", user.id, user.email)}
                                                            >
                                                                <UserX className="mr-2 h-4 w-4" />
                                                                Disable Account
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

            {/* Confirmation Dialog */}
            <Dialog open={confirmDialog.open} onOpenChange={(open) => !open && setConfirmDialog({ open: false, action: "", userId: "", userEmail: "" })}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>
                            {confirmDialog.action === "reset_password" && "Reset Password"}
                            {confirmDialog.action === "disable" && "Disable Account"}
                            {confirmDialog.action === "enable" && "Enable Account"}
                            {confirmDialog.action === "logout" && "Force Logout"}
                        </DialogTitle>
                        <DialogDescription>
                            {confirmDialog.action === "reset_password" &&
                                `Send a password reset email to ${confirmDialog.userEmail}?`}
                            {confirmDialog.action === "disable" &&
                                `Disable access for ${confirmDialog.userEmail}? They will not be able to sign in.`}
                            {confirmDialog.action === "enable" &&
                                `Re-enable access for ${confirmDialog.userEmail}? They will be able to sign in again.`}
                            {confirmDialog.action === "logout" &&
                                `Force logout ${confirmDialog.userEmail}? All their active sessions will be terminated.`}
                        </DialogDescription>
                    </DialogHeader>

                    {confirmDialog.action === "disable" && (
                        <div className="space-y-2">
                            <Label htmlFor="disable-reason">Reason for disabling (required)</Label>
                            <Textarea
                                id="disable-reason"
                                placeholder="Enter reason for disabling this account..."
                                value={disableReason}
                                onChange={(e) => setDisableReason(e.target.value)}
                                rows={3}
                            />
                        </div>
                    )}

                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => {
                                setConfirmDialog({ open: false, action: "", userId: "", userEmail: "" });
                                setDisableReason("");
                            }}
                        >
                            Cancel
                        </Button>
                        <Button
                            variant={confirmDialog.action === "disable" ? "destructive" : "default"}
                            onClick={confirmAction}
                            disabled={
                                resetPasswordMutation.isPending ||
                                forceLogoutMutation.isPending ||
                                disableAccountMutation.isPending ||
                                enableAccountMutation.isPending
                            }
                        >
                            {resetPasswordMutation.isPending ||
                                forceLogoutMutation.isPending ||
                                disableAccountMutation.isPending ||
                                enableAccountMutation.isPending
                                ? "Processing..."
                                : "Confirm"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
