
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { useRealtimeSync } from "@/hooks/useRealtimeSync";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import {
    MoreHorizontal,
    Ticket,
    Trash,
    Plus,
    Calendar,
    Percent,
    Star,
    Users,
    Gift
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { parseSettings } from "@/types/restaurant-settings";
import { useRestaurantContext } from "../state/restaurant-context";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { formatMoney, toCents, fromCents } from "@/lib/formatting";
import { getCurrencySymbol } from "@/lib/currency-utils";
import { FeatureGate } from "../components/FeatureGate";

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
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
import { Separator } from "@/components/ui/separator";

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
    return (
        <FeatureGate featureKey="coupons" featureName="Rewards & Offers" description="Create and manage promo codes, discount campaigns, loyalty points, and referral programs.">
            <CouponsContent />
        </FeatureGate>
    );
}

function CouponsContent() {
    const { restaurant } = useRestaurantContext();
    const qc = useQueryClient();
    const { toast } = useToast();

    // Fetch restaurant currency
    const currencyCode = restaurant?.currency_code || "INR";
    const currencySymbol = getCurrencySymbol(currencyCode);

    const [dialogOpen, setDialogOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [deleteId, setDeleteId] = useState<string | null>(null);

    // ── Real-time: coupon usage counts and status update live ──
    useRealtimeSync(restaurant?.id, [
        { table: "coupons", queryKey: ["admin", "coupons"] },
    ]);

    // Loyalty & Referral state
    const [loyaltyEnabled, setLoyaltyEnabled] = useState(false);
    const [loyaltyEarnRate, setLoyaltyEarnRate] = useState(10);
    const [loyaltyRedeemRate, setLoyaltyRedeemRate] = useState(10);
    const [loyaltyMinRedeem, setLoyaltyMinRedeem] = useState(100);
    const [referralEnabled, setReferralEnabled] = useState(false);
    const [referrerReward, setReferrerReward] = useState(50);
    const [refereeReward, setRefereeReward] = useState(25);
    const [savingLoyalty, setSavingLoyalty] = useState(false);

    // Fetch restaurant settings for loyalty/referral
    const restaurantQuery = useQuery({
        queryKey: ["admin", "restaurant-settings", restaurant?.id],
        enabled: !!restaurant?.id,
        queryFn: async () => {
            const { data } = await supabase
                .from("restaurants")
                .select("settings")
                .eq("id", restaurant!.id)
                .single();
            return data;
        },
        select: (data) => {
            const s = parseSettings(data?.settings);
            setLoyaltyEnabled(!!s.loyalty_config?.enabled);
            setLoyaltyEarnRate(Number(s.loyalty_config?.points_per_100_spent) || 10);
            setLoyaltyRedeemRate(Number(s.loyalty_config?.points_to_currency) || 10);
            setLoyaltyMinRedeem(Number(s.loyalty_config?.min_redeem_points) || 100);
            const rc = s.referral_config as Record<string, unknown> | undefined;
            setReferralEnabled(!!rc?.enabled);
            setReferrerReward(fromCents(Number(rc?.referrer_reward_cents) || 5000));
            setRefereeReward(fromCents(Number(rc?.referee_reward_cents) || 2500));
            return data;
        },
    });

    const handleSaveLoyalty = async () => {
        if (!restaurant?.id) return;
        setSavingLoyalty(true);
        try {
            const currentSettings = parseSettings(restaurantQuery.data?.settings);
            const { error } = await supabase
                .from("restaurants")
                .update({
                    settings: {
                        ...currentSettings,
                        loyalty_config: {
                            enabled: loyaltyEnabled,
                            points_per_100_spent: loyaltyEarnRate,
                            points_to_currency: loyaltyRedeemRate,
                            min_redeem_points: loyaltyMinRedeem,
                        },
                        referral_config: {
                            enabled: referralEnabled,
                            referrer_reward_cents: toCents(referrerReward),
                            referee_reward_cents: toCents(refereeReward),
                        },
                    } as Record<string, unknown>,
                })
                .eq("id", restaurant.id);
            if (error) throw error;
            qc.invalidateQueries({ queryKey: ["admin", "restaurant-settings"] });
            toast({ title: "Loyalty & Referral settings saved" });
        } catch (e: any) {
            toast({ title: "Error", description: e.message, variant: "destructive" });
        } finally {
            setSavingLoyalty(false);
        }
    };

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
                .select("id, code, description, discount_type, discount_value, min_order_cents, max_discount_cents, is_active, expires_at, usage_count, usage_limit, restaurant_id, created_at")
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
                    ? toCents(values.discount_value)
                    : values.discount_value, // percentage as is
                min_order_cents: toCents(values.min_order_value),
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
                ? fromCents(coupon.discount_value)
                : coupon.discount_value,
            min_order_value: fromCents(coupon.min_order_cents || 0),
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
        <div className="flex flex-col gap-4 w-full">
            <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <h1 className="text-2xl font-semibold tracking-tight">Rewards & Offers</h1>
                    <p className="mt-1 text-sm text-muted-foreground">
                        Manage promo codes, discounts, and reward programs for your customers.
                    </p>
                </div>
                <Button onClick={() => { clearForm(); setDialogOpen(true); }} className="shrink-0">
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
                                                        : formatMoney(coupon.discount_value, currencyCode) + ' OFF'}
                                                </Badge>
                                            </TableCell>
                                            <TableCell>
                                                {coupon.min_order_cents > 0
                                                    ? formatMoney(coupon.min_order_cents, currencyCode)
                                                    : "None"}
                                            </TableCell>
                                            <TableCell>
                                                {coupon.usage_count}
                                                {coupon.usage_limit ? ` / ${coupon.usage_limit}` : " used"}
                                            </TableCell>
                                            <TableCell>
                                                {(() => {
                                                    const exhausted = coupon.usage_limit && coupon.usage_count >= coupon.usage_limit;
                                                    return (
                                                        <Badge variant={exhausted ? "destructive" : coupon.is_active ? "default" : "secondary"}>
                                                            {exhausted ? "Limit Reached" : coupon.is_active ? "Active" : "Inactive"}
                                                        </Badge>
                                                    );
                                                })()}
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
                                                            onClick={() => setDeleteId(coupon.id)}
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

            {/* Loyalty Program — gated by loyalty_program flag */}
            <FeatureGate featureKey="loyalty_program" featureName="Loyalty Program" description="Reward repeat customers with loyalty points and referral bonuses." mode="inline">
            <Card className="shadow-sm">
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle className="text-base flex items-center gap-2"><Star className="h-4 w-4 text-amber-500" /> Loyalty Points Program</CardTitle>
                            <CardDescription>Reward repeat customers with points on every order</CardDescription>
                        </div>
                        <Switch checked={loyaltyEnabled} onCheckedChange={setLoyaltyEnabled} />
                    </div>
                </CardHeader>
                {loyaltyEnabled && (
                    <CardContent className="space-y-4 border-t pt-4">
                        <div className="grid grid-cols-3 gap-4">
                            <div className="space-y-1.5">
                                <Label className="text-xs">Points earned per ₹100 spent</Label>
                                <Input type="number" min={1} max={100} value={loyaltyEarnRate} onChange={e => setLoyaltyEarnRate(Number(e.target.value))} className="h-8" />
                                <p className="text-[10px] text-muted-foreground">e.g. 10 pts per ₹100</p>
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-xs">Points needed for ₹1 discount</Label>
                                <Input type="number" min={1} max={200} value={loyaltyRedeemRate} onChange={e => setLoyaltyRedeemRate(Number(e.target.value))} className="h-8" />
                                <p className="text-[10px] text-muted-foreground">e.g. 10 pts = ₹1</p>
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-xs">Minimum points to redeem</Label>
                                <Input type="number" min={10} max={1000} value={loyaltyMinRedeem} onChange={e => setLoyaltyMinRedeem(Number(e.target.value))} className="h-8" />
                                <p className="text-[10px] text-muted-foreground">e.g. min 100 pts</p>
                            </div>
                        </div>
                    </CardContent>
                )}
            </Card>

            {/* Referral Program */}
            <Card className="shadow-sm">
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle className="text-base flex items-center gap-2"><Gift className="h-4 w-4 text-purple-500" /> Referral Program</CardTitle>
                            <CardDescription>Reward customers who refer friends to your restaurant</CardDescription>
                        </div>
                        <Switch checked={referralEnabled} onCheckedChange={setReferralEnabled} />
                    </div>
                </CardHeader>
                {referralEnabled && (
                    <CardContent className="space-y-4 border-t pt-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                                <Label className="text-xs">Referrer gets (₹)</Label>
                                <Input type="number" min={0} max={500} value={referrerReward} onChange={e => setReferrerReward(Number(e.target.value))} className="h-8" />
                                <p className="text-[10px] text-muted-foreground">Customer who shared the link</p>
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-xs">New customer gets (₹)</Label>
                                <Input type="number" min={0} max={500} value={refereeReward} onChange={e => setRefereeReward(Number(e.target.value))} className="h-8" />
                                <p className="text-[10px] text-muted-foreground">First-time customer from referral</p>
                            </div>
                        </div>
                    </CardContent>
                )}
            </Card>

            <Button onClick={handleSaveLoyalty} disabled={savingLoyalty} className="w-full">
                {savingLoyalty ? "Saving…" : "Save Loyalty & Referral Settings"}
            </Button>
            </FeatureGate>

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
                                {...form.register("code", {
                                  onChange: (e: any) => {
                                    e.target.value = e.target.value.toUpperCase();
                                  }
                                })}
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
                                        <SelectItem value="fixed">Fixed Amount ({currencySymbol})</SelectItem>
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
                                        {form.watch("discount_type") === 'percentage' ? <Percent className="h-4 w-4" /> : <span className="text-sm font-medium">{currencySymbol}</span>}
                                    </div>
                                </div>
                                {form.formState.errors.discount_value && (
                                    <p className="text-xs text-destructive">{form.formState.errors.discount_value.message}</p>
                                )}
                            </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Min Order ({currencySymbol})</Label>
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

            {/* Delete Confirmation */}
            <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete Coupon</AlertDialogTitle>
                        <AlertDialogDescription>
                            Are you sure you want to delete this coupon? This action cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => { if (deleteId) { deleteMutation.mutate(deleteId); setDeleteId(null); } }}
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
