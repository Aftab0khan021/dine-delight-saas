
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import {
    MoreHorizontal,
    Ticket,
    Trash,
    Plus,
    Calendar,
    Percent,
    DollarSign
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useRestaurantContext } from "../state/restaurant-context";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

// UI Components
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Switch } from "@/components/ui/switch";

// --- Validation ---
const couponSchema = z.object({
    code: z.string().min(3, "Code must be at least 3 characters").regex(/^[A-Z0-9_-]+$/, "Code must be uppercase alphanumeric"),
    description: z.string().optional(),
    discount_type: z.enum(["percentage", "fixed"]),
    discount_value: z.coerce.number().min(0, "Value must be positive"),
    min_order_value: z.coerce.number().min(0, "Value must be positive").default(0),
    usage_limit: z.coerce.number().optional(),
    is_active: z.boolean().default(true),
});

type CouponForm = z.infer<typeof couponSchema>;

export default function AdminCoupons() {
    const { restaurant } = useRestaurantContext();
    const qc = useQueryClient();
    const { toast } = useToast();

    const [dialogOpen, setDialogOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);

    const form = useForm<CouponForm>({
        resolver: zodResolver(couponSchema),
        defaultValues: {
            code: "",
            discount_type: "percentage",
            discount_value: 0,
            min_order_value: 0,
            is_active: true,
        },
    });

    // --- 1. Data Query ---
    const couponsQuery = useQuery({
        queryKey: ["admin", "coupons", restaurant?.id],
        enabled: !!restaurant?.id,
        queryFn: async () => {
            // NOTE: Ensure 'coupons' table exists via migration
            const { data, error } = await supabase
                .from("coupons")
                .select("*")
                .eq("restaurant_id", restaurant!.id)
                .order("created_at", { ascending: false });

            if (error) {
                console.error("Error fetching coupons:", error);
                throw error;
            }
            return data || [];
        },
    });

    // --- 2. Mutations ---
    const saveMutation = useMutation({
        mutationFn: async (values: CouponForm) => {
            if (!restaurant?.id) throw new Error("Missing restaurant");

            const dbValues = {
                restaurant_id: restaurant.id,
                code: values.code.toUpperCase(),
                description: values.description,
                discount_type: values.discount_type,
                discount_value: values.discount_type === 'fixed'
                    ? Math.round(values.discount_value * 100) // dollars to cents
                    : values.discount_value, // percentage as is
                min_order_cents: Math.round(values.min_order_value * 100),
                usage_limit: values.usage_limit || null,
                is_active: values.is_active,
            };

            if (editingId) {
                const { error } = await supabase
                    .from("coupons")
                    .update(dbValues)
                    .eq("id", editingId);
                if (error) throw error;
            } else {
                const { error } = await supabase
                    .from("coupons")
                    .insert(dbValues);
                if (error) throw error;
            }
        },
        onSuccess: () => {
            setDialogOpen(false);
            form.reset();
            setEditingId(null);
            toast({ title: editingId ? "Coupon updated" : "Coupon created" });
            qc.invalidateQueries({ queryKey: ["admin", "coupons"] });
        },
        onError: (error: Error) => {
            toast({
                title: "Error",
                description: error.message || "Failed to save coupon.",
                variant: "destructive"
            });
        }
    });

    const deleteMutation = useMutation({
        mutationFn: async (id: string) => {
            const { error } = await supabase
                .from("coupons")
                .delete()
                .eq("id", id);
            if (error) throw error;
        },
        onSuccess: () => {
            toast({ title: "Coupon deleted" });
            qc.invalidateQueries({ queryKey: ["admin", "coupons"] });
        },
        onError: (error) => {
            toast({ title: "Error", description: error.message, variant: "destructive" });
        }
    });

    const handleEdit = (coupon: any) => {
        setEditingId(coupon.id);
        form.reset({
            code: coupon.code,
            description: coupon.description || "",
            discount_type: coupon.discount_type,
            discount_value: coupon.discount_type === 'fixed'
                ? coupon.discount_value / 100
                : coupon.discount_value,
            min_order_value: (coupon.min_order_cents || 0) / 100,
            usage_limit: coupon.usage_limit || undefined,
            is_active: coupon.is_active,
        });
        setDialogOpen(true);
    };

    const clearForm = () => {
        setEditingId(null);
        form.reset({
            code: "",
            discount_type: "percentage",
            discount_value: 0,
            min_order_value: 0,
            is_active: true,
        });
    };

    return (
        <div className="space-y-6">
            <header className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-semibold tracking-tight">Coupons & Discounts</h1>
                    <p className="mt-1 text-sm text-muted-foreground">
                        Manage promo codes and discounts for your customers.
                    </p>
                </div>
                <Button onClick={() => { clearForm(); setDialogOpen(true); }}>
                    <Plus className="mr-2 h-4 w-4" /> Create Coupon
                </Button>
            </header>

            <Card className="shadow-soft">
                <CardHeader>
                    <CardTitle className="text-base">Active Coupons</CardTitle>
                    <CardDescription>
                        {couponsQuery.data?.length || 0} coupons found
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {couponsQuery.isLoading ? (
                        <div className="py-8 text-center text-sm text-muted-foreground">Loading coupons...</div>
                    ) : couponsQuery.data?.length === 0 ? (
                        <div className="py-12 text-center border dashed border-border rounded-lg">
                            <Ticket className="mx-auto h-10 w-10 text-muted-foreground/30 mb-3" />
                            <h3 className="text-sm font-medium">No coupons yet</h3>
                            <p className="text-xs text-muted-foreground mt-1">Create your first discount code to boost sales.</p>
                            <Button variant="outline" size="sm" className="mt-4" onClick={() => { clearForm(); setDialogOpen(true); }}>
                                Create Coupon
                            </Button>
                        </div>
                    ) : (
                        <div className="rounded-xl border border-border bg-background overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Code</TableHead>
                                        <TableHead>Discount</TableHead>
                                        <TableHead>Min. Order</TableHead>
                                        <TableHead>Usage</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead className="text-right">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {couponsQuery.data?.map((coupon: any) => (
                                        <TableRow key={coupon.id}>
                                            <TableCell>
                                                <div className="font-mono font-bold text-primary">{coupon.code}</div>
                                                {coupon.description && (
                                                    <div className="text-xs text-muted-foreground">{coupon.description}</div>
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant="outline">
                                                    {coupon.discount_type === 'percentage'
                                                        ? `${coupon.discount_value}% OFF`
                                                        : `$${(coupon.discount_value / 100).toFixed(2)} OFF`}
                                                </Badge>
                                            </TableCell>
                                            <TableCell>
                                                {coupon.min_order_cents > 0
                                                    ? `$${(coupon.min_order_cents / 100).toFixed(2)}`
                                                    : "None"}
                                            </TableCell>
                                            <TableCell>
                                                {coupon.usage_count}
                                                {coupon.usage_limit ? ` / ${coupon.usage_limit}` : " used"}
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant={coupon.is_active ? "default" : "secondary"}>
                                                    {coupon.is_active ? "Active" : "Inactive"}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                        <Button variant="ghost" size="icon">
                                                            <MoreHorizontal className="h-4 w-4" />
                                                        </Button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end">
                                                        <DropdownMenuItem onClick={() => handleEdit(coupon)}>
                                                            Edit details
                                                        </DropdownMenuItem>
                                                        <DropdownMenuSeparator />
                                                        <DropdownMenuItem
                                                            className="text-destructive"
                                                            onClick={() => {
                                                                if (confirm("Are you sure you want to delete this coupon?")) {
                                                                    deleteMutation.mutate(coupon.id);
                                                                }
                                                            }}
                                                        >
                                                            <Trash className="mr-2 h-4 w-4" /> Delete
                                                        </DropdownMenuItem>
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

            {/* Create/Edit Dialog */}
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>{editingId ? "Edit Coupon" : "Create Coupon"}</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={form.handleSubmit((v) => saveMutation.mutate(v))} className="space-y-4 py-2">

                        <div className="space-y-2">
                            <Label htmlFor="code">Coupon Code</Label>
                            <Input
                                id="code"
                                placeholder="SUMMER2024"
                                className="font-mono uppercase"
                                {...form.register("code")}
                            />
                            {form.formState.errors.code && (
                                <p className="text-xs text-destructive">{form.formState.errors.code.message}</p>
                            )}
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="description">Description (Optional)</Label>
                            <Input
                                id="description"
                                placeholder="Summer Sale Discount"
                                {...form.register("description")}
                            />
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Type</Label>
                                <Select
                                    value={form.watch("discount_type")}
                                    onValueChange={(v: "percentage" | "fixed") => form.setValue("discount_type", v)}
                                >
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="percentage">Percentage (%)</SelectItem>
                                        <SelectItem value="fixed">Fixed Amount ($)</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-2">
                                <Label>Value</Label>
                                <div className="relative">
                                    <Input
                                        type="number"
                                        {...form.register("discount_value")}
                                        className="pl-8"
                                    />
                                    <div className="absolute left-2.5 top-2.5 text-muted-foreground">
                                        {form.watch("discount_type") === 'percentage' ? <Percent className="h-4 w-4" /> : <DollarSign className="h-4 w-4" />}
                                    </div>
                                </div>
                                {form.formState.errors.discount_value && (
                                    <p className="text-xs text-destructive">{form.formState.errors.discount_value.message}</p>
                                )}
                            </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Min Order ($)</Label>
                                <Input type="number" step="0.01" {...form.register("min_order_value")} />
                            </div>
                            <div className="space-y-2">
                                <Label>Usage Limit</Label>
                                <Input
                                    type="number"
                                    placeholder="Unlimited"
                                    {...form.register("usage_limit")}
                                />
                            </div>
                        </div>

                        <div className="flex items-center justify-between rounded-lg border p-3">
                            <div className="space-y-0.5">
                                <Label className="text-base">Active Status</Label>
                                <div className="text-xs text-muted-foreground">
                                    Enable or disable this coupon
                                </div>
                            </div>
                            <Switch
                                checked={form.watch("is_active")}
                                onCheckedChange={(c) => form.setValue("is_active", c)}
                            />
                        </div>

                        <DialogFooter className="pt-4">
                            <Button type="button" variant="ghost" onClick={() => setDialogOpen(false)}>Cancel</Button>
                            <Button type="submit" disabled={saveMutation.isPending}>
                                {saveMutation.isPending ? "Saving..." : "Save Coupon"}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </div>
    );
}
