import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    ArrowLeft,
    Building2,
    Users,
    CreditCard,
    Activity,
    Ban,
    CheckCircle,
    UserCog,
    Trash2,
    Settings,
    AlertTriangle,
    Zap,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow, format } from "date-fns";
import { FeatureAccessMatrix } from "../components/FeatureAccessMatrix";
import { FeatureLimitIndicator } from "../components/FeatureLimitIndicator";
import { getFeatureDefinition, getLimitFeatures } from "../lib/features";

export default function RestaurantDetails() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { toast } = useToast();
    const queryClient = useQueryClient();

    // Feature override dialog state
    const [overrideDialogOpen, setOverrideDialogOpen] = useState(false);
    const [selectedFeature, setSelectedFeature] = useState<string | null>(null);
    const [overrideEnabled, setOverrideEnabled] = useState(false);
    const [overrideValue, setOverrideValue] = useState<boolean | number>(false);
    const [overrideReason, setOverrideReason] = useState("");

    // Fetch restaurant details
    const { data: restaurant, isLoading, refetch } = useQuery({
        queryKey: ['restaurant-details', id],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('restaurants')
                .select(`
          *,
          subscriptions (
            *,
            subscription_plans (
              name,
              price_cents,
              billing_period
            )
          ),
          user_roles (
            role,
            created_at,
            profiles (
              email,
              full_name
            )
          )
        `)
                .eq('id', id)
                .single();

            if (error) throw error;
            return data;
        },
        enabled: !!id,
    });

    // Fetch restaurant stats
    const { data: stats } = useQuery({
        queryKey: ['restaurant-stats', id],
        queryFn: async () => {
            const [ordersResult, revenueResult, menuItemsResult] = await Promise.all([
                supabase
                    .from('orders')
                    .select('id, total_cents', { count: 'exact' })
                    .eq('restaurant_id', id),
                supabase
                    .from('orders')
                    .select('total_cents')
                    .eq('restaurant_id', id)
                    .eq('status', 'completed'),
                supabase
                    .from('menu_items')
                    .select('id', { count: 'exact' })
                    .eq('restaurant_id', id),
            ]);

            const totalRevenue = revenueResult.data?.reduce(
                (sum, order) => sum + (order.total_cents || 0),
                0
            ) || 0;

            return {
                totalOrders: ordersResult.count || 0,
                totalRevenue,
                totalMenuItems: menuItemsResult.count || 0,
            };
        },
        enabled: !!id,
    });

    // Fetch restaurant feature overrides
    const { data: featureOverrides } = useQuery({
        queryKey: ['restaurant-feature-overrides', id],
        queryFn: async () => {
            const { data, error } = await (supabase as any)
                .from('restaurant_features')
                .select('*')
                .eq('restaurant_id', id);

            if (error) throw error;
            return data as Array<{
                id: string;
                restaurant_id: string;
                feature_key: string;
                is_enabled: boolean;
                config: Record<string, any>;
            }>;
        },
        enabled: !!id,
    });

    // Helper function to get effective limit (override > plan > default)
    const getEffectiveLimit = (featureKey: string, defaultValue: number): number => {
        // Check for override first
        const override = featureOverrides?.find(f => f.feature_key === featureKey);
        if (override?.config?.limit !== undefined) {
            return override.config.limit;
        }

        // Check plan features
        const planLimit = subscription?.subscription_plans?.features?.[featureKey];
        if (typeof planLimit === 'number') {
            return planLimit;
        }

        // Return default
        return defaultValue;
    };

    const handleSuspend = async () => {
        if (!id || !restaurant) return;

        const { error } = await supabase
            .from('restaurants')
            .update({
                status: 'suspended',
                suspended_at: new Date().toISOString(),
                suspension_reason: 'Suspended by super admin',
            })
            .eq('id', id);

        if (error) {
            toast({
                title: "Error",
                description: "Failed to suspend restaurant",
                variant: "destructive",
            });
        } else {
            toast({
                title: "Success",
                description: `${restaurant.name} has been suspended`,
            });
            refetch();
        }
    };

    const handleActivate = async () => {
        if (!id || !restaurant) return;

        const { error } = await supabase
            .from('restaurants')
            .update({
                status: 'active',
                suspended_at: null,
                suspension_reason: null,
            })
            .eq('id', id);

        if (error) {
            toast({
                title: "Error",
                description: "Failed to activate restaurant",
                variant: "destructive",
            });
        } else {
            toast({
                title: "Success",
                description: `${restaurant.name} has been activated`,
            });
            refetch();
        }
    };

    const handleTerminate = async () => {
        if (!id || !restaurant) return;

        const { error } = await supabase
            .from('restaurants')
            .update({
                status: 'terminated',
            })
            .eq('id', id);

        if (error) {
            toast({
                title: "Error",
                description: "Failed to terminate restaurant",
                variant: "destructive",
            });
        } else {
            toast({
                title: "Success",
                description: `${restaurant.name} has been terminated`,
            });
            navigate('/superadmin/restaurants');
        }
    };

    // Impersonation state
    const [impersonateDialogOpen, setImpersonateDialogOpen] = useState(false);
    const [impersonateReadOnly, setImpersonateReadOnly] = useState(true);
    const [impersonating, setImpersonating] = useState(false);

    const handleImpersonate = () => {
        setImpersonateDialogOpen(true);
    };

    const confirmImpersonate = async () => {
        if (!id || !restaurant) return;

        // Get the primary owner/admin user
        const owner = restaurant.user_roles?.find(ur => ur.role === 'owner' || ur.role === 'restaurant_admin');

        if (!owner) {
            toast({
                title: "Error",
                description: "No admin user found for this restaurant",
                variant: "destructive",
            });
            return;
        }

        setImpersonating(true);

        try {
            const { startImpersonation } = await import("../lib/impersonation");

            const session = await startImpersonation(
                id,
                owner.user_id,
                impersonateReadOnly
            );

            toast({
                title: "Impersonation Started",
                description: `Opening admin panel as ${owner.profiles?.email}`,
            });

            // Open in new tab
            window.open(session.impersonation_url, '_blank');

            setImpersonateDialogOpen(false);
        } catch (error: any) {
            console.error("Impersonation error:", error);
            toast({
                title: "Error",
                description: error.message || "Failed to start impersonation",
                variant: "destructive",
            });
        } finally {
            setImpersonating(false);
        }
    };

    const handleFeatureOverride = (featureKey: string) => {
        const featureDef = getFeatureDefinition(featureKey);
        const currentPlanValue = subscription?.subscription_plans?.features?.[featureKey];

        setSelectedFeature(featureKey);
        setOverrideDialogOpen(true);
        setOverrideEnabled(false);

        // Pre-populate with current plan value if it's a limit feature
        if (featureDef?.type === 'limit' && typeof currentPlanValue === 'number') {
            setOverrideValue(currentPlanValue);
        } else if (featureDef?.type === 'boolean') {
            setOverrideValue(currentPlanValue === true);
        } else {
            setOverrideValue(false);
        }

        setOverrideReason("");
    };

    const saveFeatureOverride = useMutation({
        mutationFn: async () => {
            if (!id || !selectedFeature) return;

            const featureDef = getFeatureDefinition(selectedFeature);
            const config = featureDef?.type === 'limit' ? { limit: overrideValue } : {};

            const { error } = await (supabase as any)
                .from('restaurant_features')
                .upsert({
                    restaurant_id: id,
                    feature_key: selectedFeature,
                    is_enabled: featureDef?.type === 'boolean' ? overrideValue : true,
                    config,
                }, {
                    onConflict: 'restaurant_id,feature_key'
                });

            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['restaurant-feature-access', id] });
            queryClient.invalidateQueries({ queryKey: ['restaurant-feature-overrides', id] });
            toast({
                title: "Success",
                description: "Feature override saved",
            });
            setOverrideDialogOpen(false);
        },
        onError: () => {
            toast({
                title: "Error",
                description: "Failed to save feature override",
                variant: "destructive",
            });
        },
    });

    const removeFeatureOverride = useMutation({
        mutationFn: async () => {
            if (!id || !selectedFeature) return;

            const { error } = await (supabase as any)
                .from('restaurant_features')
                .delete()
                .eq('restaurant_id', id)
                .eq('feature_key', selectedFeature);

            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['restaurant-feature-access', id] });
            queryClient.invalidateQueries({ queryKey: ['restaurant-feature-overrides', id] });
            toast({
                title: "Success",
                description: "Feature override removed",
            });
            setOverrideDialogOpen(false);
        },
        onError: () => {
            toast({
                title: "Error",
                description: "Failed to remove feature override",
                variant: "destructive",
            });
        },
    });

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <div className="animate-pulse">Loading restaurant details...</div>
            </div>
        );
    }

    if (!restaurant) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
                <p className="text-muted-foreground">Restaurant not found</p>
                <Button onClick={() => navigate('/superadmin/restaurants')}>
                    Back to Restaurants
                </Button>
            </div>
        );
    }

    const subscription = restaurant.subscriptions?.[0];
    const owner = restaurant.user_roles?.find(ur => ur.role === 'restaurant_admin');

    return (
        <section className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => navigate('/superadmin/restaurants')}
                    >
                        <ArrowLeft className="h-4 w-4 mr-2" />
                        Back
                    </Button>
                    <div>
                        <h1 className="text-2xl font-semibold tracking-tight">
                            {restaurant.name}
                        </h1>
                        <p className="text-sm text-muted-foreground">/{restaurant.slug}</p>
                    </div>
                    <Badge
                        variant={
                            restaurant.status === 'active'
                                ? 'default'
                                : restaurant.status === 'suspended'
                                    ? 'destructive'
                                    : 'secondary'
                        }
                    >
                        {restaurant.status}
                    </Badge>
                </div>

                {/* Actions */}
                <div className="flex gap-2">
                    <Button
                        variant="outline"
                        onClick={() => navigate(`/superadmin/restaurants/${id}/ai-config`)}
                    >
                        <Zap className="h-4 w-4 mr-2" />
                        AI Configuration
                    </Button>
                    <Button variant="outline" onClick={handleImpersonate}>
                        <UserCog className="h-4 w-4 mr-2" />
                        Impersonate
                    </Button>
                    {restaurant.status === 'active' ? (
                        <AlertDialog>
                            <AlertDialogTrigger asChild>
                                <Button variant="destructive">
                                    <Ban className="h-4 w-4 mr-2" />
                                    Suspend
                                </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                                <AlertDialogHeader>
                                    <AlertDialogTitle>Suspend Restaurant?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                        This will temporarily disable access for {restaurant.name}.
                                        They will not be able to accept orders or manage their restaurant.
                                    </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction onClick={handleSuspend}>
                                        Suspend
                                    </AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                    ) : (
                        <Button onClick={handleActivate}>
                            <CheckCircle className="h-4 w-4 mr-2" />
                            Activate
                        </Button>
                    )}
                </div>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
                {/* Basic Info */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Building2 className="h-5 w-5" />
                            Basic Information
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div>
                            <label className="text-sm font-medium text-muted-foreground">
                                Restaurant Name
                            </label>
                            <p className="text-base">{restaurant.name}</p>
                        </div>
                        <div>
                            <label className="text-sm font-medium text-muted-foreground">
                                Slug
                            </label>
                            <p className="text-base font-mono">/{restaurant.slug}</p>
                        </div>
                        <div>
                            <label className="text-sm font-medium text-muted-foreground">
                                Description
                            </label>
                            <p className="text-base">
                                {restaurant.description || (
                                    <span className="text-muted-foreground">No description</span>
                                )}
                            </p>
                        </div>
                        <Separator />
                        <div>
                            <label className="text-sm font-medium text-muted-foreground">
                                Created
                            </label>
                            <p className="text-base">
                                {format(new Date(restaurant.created_at), 'PPP')}
                                <span className="text-sm text-muted-foreground ml-2">
                                    ({formatDistanceToNow(new Date(restaurant.created_at), { addSuffix: true })})
                                </span>
                            </p>
                        </div>
                        <div>
                            <label className="text-sm font-medium text-muted-foreground">
                                Last Active
                            </label>
                            <p className="text-base">
                                {restaurant.last_active_at
                                    ? formatDistanceToNow(new Date(restaurant.last_active_at), {
                                        addSuffix: true,
                                    })
                                    : 'Never'}
                            </p>
                        </div>
                    </CardContent>
                </Card>

                {/* Ownership */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Users className="h-5 w-5" />
                            Ownership & Staff
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div>
                            <label className="text-sm font-medium text-muted-foreground">
                                Primary Owner
                            </label>
                            <p className="text-base">
                                {owner?.profiles?.email || (
                                    <span className="text-muted-foreground">No owner assigned</span>
                                )}
                            </p>
                            {owner?.profiles?.full_name && (
                                <p className="text-sm text-muted-foreground">
                                    {owner.profiles.full_name}
                                </p>
                            )}
                        </div>
                        <Separator />
                        <div>
                            <label className="text-sm font-medium text-muted-foreground">
                                Total Staff
                            </label>
                            <p className="text-base">{restaurant.user_roles?.length || 0} members</p>
                        </div>
                        <div>
                            <label className="text-sm font-medium text-muted-foreground">
                                Roles
                            </label>
                            <div className="flex flex-wrap gap-2 mt-2">
                                {restaurant.user_roles?.map((ur, idx) => (
                                    <Badge key={idx} variant="outline">
                                        {ur.role}
                                    </Badge>
                                ))}
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Subscription */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <CreditCard className="h-5 w-5" />
                            Subscription
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {subscription ? (
                            <>
                                <div>
                                    <label className="text-sm font-medium text-muted-foreground">
                                        Current Plan
                                    </label>
                                    <p className="text-base font-medium">
                                        {subscription.subscription_plans?.name || 'Unknown Plan'}
                                    </p>
                                    <p className="text-sm text-muted-foreground">
                                        {subscription.subscription_plans?.price_cents &&
                                            `$${(subscription.subscription_plans.price_cents / 100).toFixed(2)}/${subscription.subscription_plans.billing_period
                                            }`}
                                    </p>
                                </div>
                                <div>
                                    <label className="text-sm font-medium text-muted-foreground">
                                        Status
                                    </label>
                                    <div className="mt-1">
                                        <Badge>{subscription.status}</Badge>
                                    </div>
                                </div>
                                <Separator />
                                <div>
                                    <label className="text-sm font-medium text-muted-foreground">
                                        Current Period
                                    </label>
                                    <p className="text-sm">
                                        {subscription.current_period_start &&
                                            format(new Date(subscription.current_period_start), 'PP')}
                                        {' - '}
                                        {subscription.current_period_end &&
                                            format(new Date(subscription.current_period_end), 'PP')}
                                    </p>
                                </div>
                            </>
                        ) : (
                            <p className="text-muted-foreground">No active subscription</p>
                        )}
                    </CardContent>
                </Card>

                {/* Activity & Stats */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Activity className="h-5 w-5" />
                            Activity & Stats
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div>
                            <label className="text-sm font-medium text-muted-foreground">
                                Total Orders
                            </label>
                            <p className="text-2xl font-bold">{stats?.totalOrders || 0}</p>
                        </div>
                        <div>
                            <label className="text-sm font-medium text-muted-foreground">
                                Total Revenue
                            </label>
                            <p className="text-2xl font-bold">
                                ${((stats?.totalRevenue || 0) / 100).toFixed(2)}
                            </p>
                        </div>
                        <Separator />
                        {restaurant.status === 'suspended' && (
                            <div>
                                <label className="text-sm font-medium text-muted-foreground">
                                    Suspension Reason
                                </label>
                                <p className="text-sm">
                                    {restaurant.suspension_reason || 'No reason provided'}
                                </p>
                                {restaurant.suspended_at && (
                                    <p className="text-xs text-muted-foreground mt-1">
                                        Suspended{' '}
                                        {formatDistanceToNow(new Date(restaurant.suspended_at), {
                                            addSuffix: true,
                                        })}
                                    </p>
                                )}
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* Feature Access */}
            <FeatureAccessMatrix restaurantId={id!} onOverride={handleFeatureOverride} />

            {/* Feature Limits */}
            {id && restaurant && (
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Settings className="h-5 w-5" />
                            Feature Limits
                        </CardTitle>
                        <CardDescription>
                            Current usage vs. plan limits
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="grid gap-4 md:grid-cols-2">
                            <FeatureLimitIndicator
                                limitKey="staff_limit"
                                limitName="Staff Members"
                                currentUsage={restaurant?.user_roles?.length || 0}
                                maxLimit={getEffectiveLimit('staff_limit', 10)}
                                unit="users"
                                onEdit={() => handleFeatureOverride('staff_limit')}
                            />
                            <FeatureLimitIndicator
                                limitKey="menu_items_limit"
                                limitName="Menu Items"
                                currentUsage={stats?.totalMenuItems || 0}
                                maxLimit={getEffectiveLimit('menu_items_limit', 100)}
                                unit="items"
                                onEdit={() => handleFeatureOverride('menu_items_limit')}
                            />
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Feature Override Dialog */}
            <Dialog open={overrideDialogOpen} onOpenChange={setOverrideDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Override Feature</DialogTitle>
                        <DialogDescription>
                            Create a restaurant-specific override for {selectedFeature}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label>Feature</Label>
                            <p className="text-sm font-mono bg-muted px-2 py-1 rounded">
                                {selectedFeature}
                            </p>
                            <p className="text-sm text-muted-foreground">
                                {getFeatureDefinition(selectedFeature)?.description}
                            </p>
                        </div>

                        <Separator />

                        <div className="space-y-3">
                            <div className="space-y-2">
                                <Label className="text-base">Override Configuration</Label>
                                <p className="text-sm text-muted-foreground">
                                    Enable override to set a custom value for this restaurant, overriding the plan default.
                                </p>
                            </div>
                            <div className="flex items-center space-x-2">
                                <Switch
                                    checked={overrideEnabled}
                                    onCheckedChange={setOverrideEnabled}
                                />
                                <Label className="cursor-pointer" onClick={() => setOverrideEnabled(!overrideEnabled)}>
                                    Enable Override
                                </Label>
                            </div>
                        </div>

                        {overrideEnabled && (
                            <>
                                {getFeatureDefinition(selectedFeature)?.type === 'boolean' ? (
                                    <div className="space-y-2">
                                        <Label>Override Value</Label>
                                        <div className="flex items-center space-x-2">
                                            <Switch
                                                checked={overrideValue === true}
                                                onCheckedChange={(checked) => setOverrideValue(checked)}
                                            />
                                            <span className="text-sm">
                                                {overrideValue ? 'Enabled' : 'Disabled'}
                                            </span>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        <Label>Limit Value</Label>
                                        <Input
                                            type="number"
                                            value={typeof overrideValue === 'number' ? overrideValue : 0}
                                            onChange={(e) => setOverrideValue(parseInt(e.target.value))}
                                            placeholder="Enter limit (-1 for unlimited)"
                                            min="-1"
                                        />
                                        <p className="text-xs text-muted-foreground">
                                            Use -1 for unlimited
                                        </p>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setOverrideDialogOpen(false)}
                        >
                            Cancel
                        </Button>
                        {overrideEnabled ? (
                            <Button onClick={() => saveFeatureOverride.mutate()}>
                                Save Override
                            </Button>
                        ) : (
                            <Button
                                variant="destructive"
                                onClick={() => removeFeatureOverride.mutate()}
                            >
                                Remove Override
                            </Button>
                        )}
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Impersonation Dialog */}
            <Dialog open={impersonateDialogOpen} onOpenChange={setImpersonateDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Impersonate Restaurant Admin</DialogTitle>
                        <DialogDescription>
                            Access this restaurant's admin panel for debugging and support purposes.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4">
                            <div className="flex items-start gap-3">
                                <AlertTriangle className="h-5 w-5 text-yellow-600 mt-0.5" />
                                <div className="space-y-1">
                                    <p className="text-sm font-medium text-yellow-900">
                                        Security Notice
                                    </p>
                                    <p className="text-sm text-yellow-700">
                                        This action will be logged in the audit trail. The session will expire in 1 hour.
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-3">
                            <div>
                                <Label className="text-sm font-medium">Restaurant</Label>
                                <p className="text-sm text-muted-foreground mt-1">
                                    {restaurant.name} (/{restaurant.slug})
                                </p>
                            </div>

                            <div>
                                <Label className="text-sm font-medium">Target User</Label>
                                <p className="text-sm text-muted-foreground mt-1">
                                    {restaurant.user_roles?.find(ur => ur.role === 'owner' || ur.role === 'restaurant_admin')?.profiles?.email || 'N/A'}
                                </p>
                            </div>

                            <Separator />

                            <div className="flex items-center justify-between">
                                <div className="space-y-0.5">
                                    <Label className="text-base">Read-Only Mode</Label>
                                    <p className="text-sm text-muted-foreground">
                                        Prevent destructive actions (recommended)
                                    </p>
                                </div>
                                <Switch
                                    checked={impersonateReadOnly}
                                    onCheckedChange={setImpersonateReadOnly}
                                />
                            </div>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setImpersonateDialogOpen(false)}
                            disabled={impersonating}
                        >
                            Cancel
                        </Button>
                        <Button
                            onClick={confirmImpersonate}
                            disabled={impersonating}
                        >
                            {impersonating ? "Starting..." : "Start Impersonation"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Danger Zone */}
            <Card className="border-destructive">
                <CardHeader>
                    <CardTitle className="text-destructive">Danger Zone</CardTitle>
                    <CardDescription>
                        Irreversible actions that permanently affect this restaurant
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <AlertDialog>
                        <AlertDialogTrigger asChild>
                            <Button variant="destructive">
                                <Trash2 className="h-4 w-4 mr-2" />
                                Terminate Restaurant
                            </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                                <AlertDialogTitle>Terminate Restaurant?</AlertDialogTitle>
                                <AlertDialogDescription>
                                    This action cannot be undone. This will permanently terminate{' '}
                                    <strong>{restaurant.name}</strong> and disable all access.
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                    onClick={handleTerminate}
                                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                >
                                    Terminate
                                </AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                </CardContent>
            </Card>
        </section>
    );
}
