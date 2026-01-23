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
import {
  Search,
  MoreVertical,
  Eye,
  Ban,
  CheckCircle,
  Download,
  Filter,
  X
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";

type RestaurantStatus = 'active' | 'suspended' | 'terminated' | 'locked';

interface Restaurant {
  id: string;
  name: string;
  slug: string;
  status: RestaurantStatus;
  created_at: string;
  last_active_at: string | null;
  subscription?: {
    status: string;
    plan?: {
      name: string;
    };
  };
  user_roles: Array<{
    user: {
      email: string;
    };
  }>;
}

export default function Restaurants() {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [planFilter, setPlanFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const pageSize = 20;

  // Fetch restaurants with filters
  const { data: restaurantsData, isLoading, refetch } = useQuery({
    queryKey: ['restaurants', searchQuery, statusFilter, planFilter, page],
    queryFn: async () => {
      let query = supabase
        .from('restaurants')
        .select(`
          id,
          name,
          slug,
          status,
          created_at,
          last_active_at,
          subscriptions (
            status,
            subscription_plans (
              name
            )
          ),
          user_roles (
            user:profiles (
              email
            )
          )
        `, { count: 'exact' })
        .order('created_at', { ascending: false })
        .range((page - 1) * pageSize, page * pageSize - 1);

      // Apply status filter
      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }

      // Apply search
      if (searchQuery) {
        query = query.or(`name.ilike.%${searchQuery}%,slug.ilike.%${searchQuery}%`);
      }

      const { data, error, count } = await query;

      if (error) throw error;

      return {
        restaurants: data as unknown as Restaurant[],
        total: count || 0,
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

  const handleSuspend = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to suspend "${name}"?`)) return;

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
        description: `${name} has been suspended`,
      });
      refetch();
    }
  };

  const handleActivate = async (id: string, name: string) => {
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
        description: `${name} has been activated`,
      });
      refetch();
    }
  };

  const handleExportCSV = () => {
    if (!restaurantsData?.restaurants) return;

    const csv = [
      ['Name', 'Slug', 'Status', 'Plan', 'Created', 'Last Active', 'Owner Email'].join(','),
      ...restaurantsData.restaurants.map(r => [
        r.name,
        r.slug,
        r.status,
        r.subscription?.plan?.name || 'None',
        new Date(r.created_at).toLocaleDateString(),
        r.last_active_at ? new Date(r.last_active_at).toLocaleDateString() : 'Never',
        r.user_roles[0]?.user?.email || 'N/A',
      ].join(',')),
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `restaurants-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  const getStatusBadge = (status: RestaurantStatus) => {
    const variants = {
      active: 'default',
      suspended: 'destructive',
      terminated: 'secondary',
      locked: 'outline',
    } as const;

    return (
      <Badge variant={variants[status] || 'default'}>
        {status}
      </Badge>
    );
  };

  const totalPages = Math.ceil((restaurantsData?.total || 0) / pageSize);

  return (
    <section className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Restaurants</h1>
          <p className="text-sm text-muted-foreground">
            Manage all restaurants on the platform
          </p>
        </div>
        <Button onClick={handleExportCSV} variant="outline">
          <Download className="h-4 w-4 mr-2" />
          Export CSV
        </Button>
      </header>

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
                <SelectItem value="suspended">Suspended</SelectItem>
                <SelectItem value="terminated">Terminated</SelectItem>
                <SelectItem value="locked">Locked</SelectItem>
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
                <TableHead>Status</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Last Active</TableHead>
                <TableHead>Owner</TableHead>
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
              ) : restaurantsData?.restaurants.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    No restaurants found
                  </TableCell>
                </TableRow>
              ) : (
                restaurantsData?.restaurants.map((restaurant) => (
                  <TableRow key={restaurant.id}>
                    <TableCell>
                      <div>
                        <div className="font-medium">{restaurant.name}</div>
                        <div className="text-sm text-muted-foreground">
                          /{restaurant.slug}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>{getStatusBadge(restaurant.status)}</TableCell>
                    <TableCell>
                      {restaurant.subscription?.plan?.name || (
                        <span className="text-muted-foreground">No plan</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      {formatDistanceToNow(new Date(restaurant.created_at), {
                        addSuffix: true,
                      })}
                    </TableCell>
                    <TableCell className="text-sm">
                      {restaurant.last_active_at
                        ? formatDistanceToNow(new Date(restaurant.last_active_at), {
                          addSuffix: true,
                        })
                        : 'Never'}
                    </TableCell>
                    <TableCell className="text-sm">
                      {restaurant.user_roles[0]?.user?.email || 'N/A'}
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
                            onClick={() => navigate(`/superadmin/restaurants/${restaurant.id}`)}
                          >
                            <Eye className="h-4 w-4 mr-2" />
                            View Details
                          </DropdownMenuItem>
                          {restaurant.status === 'active' ? (
                            <DropdownMenuItem
                              onClick={() => handleSuspend(restaurant.id, restaurant.name)}
                              className="text-destructive"
                            >
                              <Ban className="h-4 w-4 mr-2" />
                              Suspend
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem
                              onClick={() => handleActivate(restaurant.id, restaurant.name)}
                            >
                              <CheckCircle className="h-4 w-4 mr-2" />
                              Activate
                            </DropdownMenuItem>
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
            {Math.min(page * pageSize, restaurantsData?.total || 0)} of{' '}
            {restaurantsData?.total || 0} restaurants
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
