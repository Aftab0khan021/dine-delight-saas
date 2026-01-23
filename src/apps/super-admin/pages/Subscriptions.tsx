import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
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
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Search,
  MoreVertical,
  Eye,
  Filter,
  X,
  Lock,
  Info
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatDistanceToNow, format } from "date-fns";

// Feature flag for manual controls (disabled for now)
const MANUAL_CONTROLS_ENABLED = false;

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

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [planFilter, setPlanFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const pageSize = 20;

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

      return {
        subscriptions: data as unknown as Subscription[],
        total: count || 0,
      };
    },
  });

  // Fetch subscription plans for filter
  const { data: plans } = useQuery({
    queryKey: ['subscription-plans'],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from('subscription_plans')
        .select('id, name, slug')
        .eq('is_active', true)
        .order('sort_order');
      return data || [];
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
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
    }).format(cents / 100);
  };

  const totalPages = Math.ceil((subscriptionsData?.total || 0) / pageSize);

  return (
    <section className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Subscriptions</h1>
          <p className="text-sm text-muted-foreground">
            View and manage all platform subscriptions
          </p>
        </div>
      </header>

      {/* Manual Controls Notice */}
      {!MANUAL_CONTROLS_ENABLED && (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            Manual subscription controls are currently disabled. Enable them in Settings when you have more users.
            <span className="block text-xs text-muted-foreground mt-1">
              Features like extend subscription, apply discounts, and force upgrades will be available after enabling.
            </span>
          </AlertDescription>
        </Alert>
      )}

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Filter className="h-4 w-4" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-4">
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
        <CardContent className="p-0">
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

                          {/* Manual Controls (Disabled) */}
                          {!MANUAL_CONTROLS_ENABLED && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem disabled>
                                <Lock className="h-4 w-4 mr-2" />
                                Extend Subscription
                              </DropdownMenuItem>
                              <DropdownMenuItem disabled>
                                <Lock className="h-4 w-4 mr-2" />
                                Apply Discount
                              </DropdownMenuItem>
                              <DropdownMenuItem disabled>
                                <Lock className="h-4 w-4 mr-2" />
                                Force Upgrade
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
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
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
