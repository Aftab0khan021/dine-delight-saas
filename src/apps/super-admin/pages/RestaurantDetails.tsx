import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
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
    ArrowLeft,
    Building2,
    Users,
    CreditCard,
    Activity,
    Ban,
    CheckCircle,
    UserCog,
    Trash2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow, format } from "date-fns";

export default function RestaurantDetails() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { toast } = useToast();

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
            const [ordersResult, revenueResult] = await Promise.all([
                supabase
                    .from('orders')
                    .select('id, total_cents', { count: 'exact' })
                    .eq('restaurant_id', id),
                supabase
                    .from('orders')
                    .select('total_cents')
                    .eq('restaurant_id', id)
                    .eq('status', 'completed'),
            ]);

            const totalRevenue = revenueResult.data?.reduce(
                (sum, order) => sum + (order.total_cents || 0),
                0
            ) || 0;

            return {
                totalOrders: ordersResult.count || 0,
                totalRevenue,
            };
        },
        enabled: !!id,
    });

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

    const handleImpersonate = () => {
        // TODO: Implement impersonation
        toast({
            title: "Coming Soon",
            description: "Impersonation feature will be implemented next",
        });
    };

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
