import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Search,
  MoreVertical,
  Eye,
  Filter,
  X,
  Plus,
  CalendarPlus,
  Percent,
  Ban,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow, format, addMonths, addYears } from "date-fns";

interface Subscription {
  id: string;
  status: string;
  current_period_start: string;
  current_period_end: string;
  is_manual_override: boolean;
  discount_percent: number;
  restaurant: {
    id: string;
    name: string;
    slug: string;
  };
  subscription_plans: {
    name: string;
    price_cents: number;
    billing_period: string;
  } | null;
}

export default function Subscriptions() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [planFilter, setPlanFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const pageSize = 20;

  // --- Assign Plan dialog state ---
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [assignRestaurantId, setAssignRestaurantId] = useState("");
  const [assignPlanId, setAssignPlanId] = useState("");
  const [assignNotes, setAssignNotes] = useState("");
  const [assignDiscount, setAssignDiscount] = useState(0);

  // --- Extend dialog state ---
  const [extendDialogOpen, setExtendDialogOpen] = useState(false);
  const [extendSubId, setExtendSubId] = useState("");
  const [extendMonths, setExtendMonths] = useState(1);

  // Fetch subscriptions with filters
  const { data: subscriptionsData, isLoading } = useQuery({
    queryKey: ['subscriptions', searchQuery, statusFilter, planFilter, page],
    queryFn: async () => {
      let query = supabase
        .from('subscriptions')
        .select(`
          id,
          status,
          current_period_start,
          current_period_end,
          is_manual_override,
          discount_percent,
          restaurant:restaurants (
            id,
            name,
            slug
          ),
          subscription_plans (
            name,
            price_cents,
            billing_period
          )
        `, { count: 'exact' })
        .order('created_at', { ascending: false })
        .range((page - 1) * pageSize, page * pageSize - 1);

      // Apply status filter
      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }

      const { data, error, count } = await query;

      if (error) throw error;

      let subscriptions = data as unknown as Subscription[];

      // Apply plan filter (JS-side, since plan comes from joined data)
      if (planFilter !== 'all') {
        subscriptions = subscriptions.filter(s => {
          const planSlug = s.subscription_plans?.name?.toLowerCase().replace(/\s+/g, '-');
          return planSlug === planFilter;
        });
      }

      // Apply search filter (JS-side, filter by restaurant name)
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        subscriptions = subscriptions.filter(s =>
          s.restaurant?.name?.toLowerCase().includes(q) ||
          s.restaurant?.slug?.toLowerCase().includes(q)
        );
      }

      return {
        subscriptions,
        total: (planFilter !== 'all' || searchQuery) ? subscriptions.length : (count || 0),
      };
    },
  });

  // Fetch subscription plans for filter
  const { data: plans } = useQuery({
    queryKey: ['subscription-plans'],
    queryFn: async () => {
      const { data } = await supabase
        .from('subscription_plans')
        .select('id, name, slug')
        .eq('is_active', true)
        .order('sort_order');
      return data || [];
    },
  });

  // Fetch restaurants (for assignment dropdown)
  const { data: restaurants } = useQuery({
    queryKey: ['restaurants-list-for-assign'],
    queryFn: async () => {
      const { data } = await supabase
        .from('restaurants')
        .select('id, name, slug')
        .eq('status', 'active')
        .order('name');
      return data || [];
    },
  });

  // --- Assign Plan Mutation ---
  const assignPlanMutation = useMutation({
    mutationFn: async () => {
      if (!assignRestaurantId || !assignPlanId) throw new Error('Select a restaurant and plan');

      const now = new Date();
      const selectedPlan = plans?.find((p: any) => p.id === assignPlanId) as any;
      const periodEnd = selectedPlan?.billing_period === 'yearly'
        ? addYears(now, 1)
        : addMonths(now, 1);

      // Deactivate any existing active subscription for this restaurant
      await supabase
        .from('subscriptions')
        .update({ status: 'canceled' })
        .eq('restaurant_id', assignRestaurantId)
        .in('status', ['active', 'trialing']);

      // Create new subscription
      const { error } = await supabase.from('subscriptions').insert({
        restaurant_id: assignRestaurantId,
        plan_id: assignPlanId,
        status: 'active',
        current_period_start: now.toISOString(),
        current_period_end: periodEnd.toISOString(),
        is_manual_override: true,
        override_reason: assignNotes || 'Cash payment — assigned by Super Admin',
        override_at: now.toISOString(),
        discount_percent: assignDiscount,
        discount_reason: assignDiscount > 0 ? (assignNotes || 'Manual discount') : null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subscriptions'] });
      toast({ title: 'Plan assigned', description: 'Subscription created successfully.' });
      setAssignDialogOpen(false);
      setAssignRestaurantId('');
      setAssignPlanId('');
      setAssignNotes('');
      setAssignDiscount(0);
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  // --- Extend Subscription Mutation ---
  const extendMutation = useMutation({
    mutationFn: async () => {
      const sub = subscriptionsData?.subscriptions.find(s => s.id === extendSubId);
      if (!sub) throw new Error('Subscription not found');

      const currentEnd = sub.current_period_end
        ? new Date(sub.current_period_end)
        : new Date();
      const newEnd = addMonths(currentEnd, extendMonths);

      const { error } = await supabase
        .from('subscriptions')
        .update({
          current_period_end: newEnd.toISOString(),
          is_manual_override: true,
          override_reason: `Extended by ${extendMonths} month(s) by Super Admin`,
          override_at: new Date().toISOString(),
        })
        .eq('id', extendSubId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subscriptions'] });
      toast({ title: 'Extended', description: `Subscription extended by ${extendMonths} month(s).` });
      setExtendDialogOpen(false);
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  // --- Cancel Subscription Mutation ---
  const cancelMutation = useMutation({
    mutationFn: async (subId: string) => {
      const { error } = await supabase
        .from('subscriptions')
        .update({ status: 'canceled', is_manual_override: true, override_reason: 'Canceled by Super Admin', override_at: new Date().toISOString() })
        .eq('id', subId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subscriptions'] });
      toast({ title: 'Canceled', description: 'Subscription has been canceled.' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      active: 'default',
      trialing: 'secondary',
      past_due: 'destructive',
      canceled: 'outline',
      unpaid: 'destructive',
    };

    return (
      <Badge variant={variants[status] || 'outline'}>
        {status}
      </Badge>
    );
  };

  const formatCurrency = (cents: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0,
    }).format(cents / 100);
  };

  const totalPages = Math.ceil((subscriptionsData?.total || 0) / pageSize);

  return (
    <section className="flex flex-col gap-4 w-full">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Subscriptions</h1>
          <p className="text-sm text-muted-foreground">
            View and manage all platform subscriptions
          </p>
        </div>
        <Button onClick={() => setAssignDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Assign Plan
        </Button>
      </header>

      {/* ═══ Assign Plan Dialog ═══ */}
      <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Assign Subscription Plan</DialogTitle>
            <DialogDescription>
              Manually assign a plan to a restaurant — for cash payments, gifts, or custom deals.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="space-y-2">
              <Label>Restaurant</Label>
              <Select value={assignRestaurantId} onValueChange={setAssignRestaurantId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select restaurant..." />
                </SelectTrigger>
                <SelectContent>
                  {restaurants?.map((r: any) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.name} <span className="text-muted-foreground ml-1">/{r.slug}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Plan</Label>
              <Select value={assignPlanId} onValueChange={setAssignPlanId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select plan..." />
                </SelectTrigger>
                <SelectContent>
                  {plans?.map((p: any) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Discount (%)</Label>
              <Input
                type="number"
                value={assignDiscount}
                onChange={(e) => setAssignDiscount(parseInt(e.target.value) || 0)}
                min={0}
                max={100}
                placeholder="0"
              />
            </div>
            <div className="space-y-2">
              <Label>Notes (optional)</Label>
              <Textarea
                value={assignNotes}
                onChange={(e) => setAssignNotes(e.target.value)}
                placeholder="e.g. Cash payment received ₹2,000 on 10-May"
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={() => assignPlanMutation.mutate()}
              disabled={!assignRestaurantId || !assignPlanId || assignPlanMutation.isPending}
            >
              {assignPlanMutation.isPending ? 'Assigning...' : 'Assign Plan'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══ Extend Subscription Dialog ═══ */}
      <Dialog open={extendDialogOpen} onOpenChange={setExtendDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Extend Subscription</DialogTitle>
            <DialogDescription>Add extra months to this subscription's current period.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label>Months to add</Label>
            <Input
              type="number"
              value={extendMonths}
              onChange={(e) => setExtendMonths(parseInt(e.target.value) || 1)}
              min={1}
              max={24}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExtendDialogOpen(false)}>Cancel</Button>
            <Button onClick={() => extendMutation.mutate()} disabled={extendMutation.isPending}>
              {extendMutation.isPending ? 'Extending...' : `Extend by ${extendMonths} month(s)`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Filter className="h-4 w-4" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search restaurants..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
              {searchQuery && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0"
                  onClick={() => setSearchQuery("")}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>

            {/* Status Filter */}
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger>
                <SelectValue placeholder="All Statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="trialing">Trialing</SelectItem>
                <SelectItem value="past_due">Past Due</SelectItem>
                <SelectItem value="canceled">Canceled</SelectItem>
                <SelectItem value="unpaid">Unpaid</SelectItem>
              </SelectContent>
            </Select>

            {/* Plan Filter */}
            <Select value={planFilter} onValueChange={setPlanFilter}>
              <SelectTrigger>
                <SelectValue placeholder="All Plans" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Plans</SelectItem>
                {plans?.map((plan) => (
                  <SelectItem key={plan.id} value={plan.slug}>
                    {plan.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Clear Filters */}
            {(searchQuery || statusFilter !== 'all' || planFilter !== 'all') && (
              <Button
                variant="outline"
                onClick={() => {
                  setSearchQuery("");
                  setStatusFilter("all");
                  setPlanFilter("all");
                }}
              >
                Clear Filters
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <div className="min-w-[600px]">
            <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Restaurant</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Price</TableHead>
                <TableHead>Current Period</TableHead>
                <TableHead>Discount</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8">
                    Loading...
                  </TableCell>
                </TableRow>
              ) : subscriptionsData?.subscriptions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    No subscriptions found
                  </TableCell>
                </TableRow>
              ) : (
                subscriptionsData?.subscriptions.map((subscription) => (
                  <TableRow key={subscription.id}>
                    <TableCell>
                      <div>
                        <div className="font-medium">{subscription.restaurant.name}</div>
                        <div className="text-sm text-muted-foreground">
                          /{subscription.restaurant.slug}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {subscription.subscription_plans?.name || (
                        <span className="text-muted-foreground">No plan</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {getStatusBadge(subscription.status)}
                        {subscription.is_manual_override && (
                          <Badge variant="outline" className="text-xs">
                            Manual
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="font-medium">
                      {subscription.subscription_plans
                        ? formatCurrency(subscription.subscription_plans.price_cents)
                        : '-'}
                    </TableCell>
                    <TableCell className="text-sm">
                      {subscription.current_period_start && subscription.current_period_end ? (
                        <div>
                          <div>
                            {format(new Date(subscription.current_period_start), 'MMM d')} -{' '}
                            {format(new Date(subscription.current_period_end), 'MMM d, yyyy')}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Ends{' '}
                            {formatDistanceToNow(new Date(subscription.current_period_end), {
                              addSuffix: true,
                            })}
                          </div>
                        </div>
                      ) : (
                        '-'
                      )}
                    </TableCell>
                    <TableCell>
                      {subscription.discount_percent > 0 ? (
                        <Badge variant="secondary">{subscription.discount_percent}% off</Badge>
                      ) : (
                        '-'
                      )}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuLabel>Actions</DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => navigate(`/superadmin/restaurants/${subscription.restaurant.id}`)}
                          >
                            <Eye className="h-4 w-4 mr-2" />
                            View Restaurant
                          </DropdownMenuItem>

                          {/* Manual Controls */}
                          {subscription.status === 'active' && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => {
                                  setExtendSubId(subscription.id);
                                  setExtendMonths(1);
                                  setExtendDialogOpen(true);
                                }}
                              >
                                <CalendarPlus className="h-4 w-4 mr-2" />
                                Extend Subscription
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onClick={() => cancelMutation.mutate(subscription.id)}
                              >
                                <Ban className="h-4 w-4 mr-2" />
                                Cancel Subscription
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          </div>
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <p className="text-sm text-muted-foreground">
            Showing {(page - 1) * pageSize + 1} to{' '}
            {Math.min(page * pageSize, subscriptionsData?.total || 0)} of{' '}
            {subscriptionsData?.total || 0} subscriptions
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
