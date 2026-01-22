import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { addDays, startOfDay, subHours } from "date-fns";
import { Search, Download } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useRestaurantContext } from "../state/restaurant-context";
import { useToast } from "@/hooks/use-toast";

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
import { cn } from "@/lib/utils";

// --- Types & Helpers ---
type OrderStatus = "pending" | "in_progress" | "ready" | "completed";
type TimeFilter = "today" | "last_24h";

// Mapping DB status to UI Labels
const STATUS_MAP: Record<OrderStatus, string> = {
  pending: "New",
  in_progress: "Preparing",
  ready: "Ready",
  completed: "Completed",
};

// The Kanban Columns (UI Labels)
const UI_COLUMNS = ["New", "Preparing", "Ready", "Completed"];

function shortId(id: string) {
  return id ? `#${id.slice(0, 4)}` : "";
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

const statusVariant = (s: string) => {
  switch (s) {
    case "New": return "default";
    case "Preparing": return "secondary";
    case "Ready": return "outline";
    default: return "secondary";
  }
};

// --- Subcomponent: Order Card (Repo A Style) ---
function OrderCard({
  order,
  onAdvance,
  loadingId
}: {
  order: any;
  onAdvance: (id: string, currentStatus: OrderStatus) => void;
  loadingId: string | null;
}) {
  const uiStatus = STATUS_MAP[order.status as OrderStatus];
  const isLoading = loadingId === order.id;

  return (
    <div className="rounded-xl border border-border bg-background p-3 shadow-sm transition-all hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <div className="text-sm font-semibold">{shortId(order.id)}</div>
            <Badge variant={statusVariant(uiStatus)}>{uiStatus}</Badge>
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            {formatTime(order.placed_at)} • {order.table_label || "Takeaway"}
          </div>
        </div>
      </div>

      <div className="mt-2 text-sm line-clamp-2">
        {order.items_summary || "Loading items..."}
      </div>

      <div className="mt-3 grid gap-2">
        {order.status === "pending" && (
          <Button className="w-full" size="sm" onClick={() => onAdvance(order.id, "pending")} disabled={isLoading}>
            Start Preparing
          </Button>
        )}
        {order.status === "in_progress" && (
          <Button className="w-full" size="sm" onClick={() => onAdvance(order.id, "in_progress")} disabled={isLoading}>
            Mark Ready
          </Button>
        )}
        {order.status === "ready" && (
          <Button className="w-full" size="sm" onClick={() => onAdvance(order.id, "ready")} disabled={isLoading}>
            Complete
          </Button>
        )}
        {order.status === "completed" && (
          <Button className="w-full" size="sm" variant="secondary" disabled>
            Completed
          </Button>
        )}
      </div>
    </div>
  );
}

// --- Main Page Component ---
export default function AdminOrders() {
  const { restaurant } = useRestaurantContext();
  const qc = useQueryClient();
  const { toast } = useToast();

  // State
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("today");
  const [search, setSearch] = useState("");
  const [advancingId, setAdvancingId] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const ORDERS_PER_PAGE = 50;

  // Time Range Logic
  const { startISO, endISO } = useMemo(() => {
    if (timeFilter === "last_24h") {
      const start = subHours(new Date(), 24);
      return { startISO: start.toISOString(), endISO: new Date().toISOString() };
    }
    const start = startOfDay(new Date());
    const end = addDays(start, 1);
    return { startISO: start.toISOString(), endISO: end.toISOString() };
  }, [timeFilter]);

  // --- 1. Realtime Subscription ---
  useEffect(() => {
    if (!restaurant?.id) return;

    const channel = supabase.channel("admin-orders-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `restaurant_id=eq.${restaurant.id}` },
        (payload) => {
          qc.invalidateQueries({ queryKey: ["admin", "orders"] });
          if (payload.eventType === "INSERT") {
            toast({ title: "New Order!", description: `Order ${shortId((payload.new as any).id)} received.` });
          }
        })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [restaurant?.id]);

  // --- 2. Data Fetching ---
  const ordersQuery = useQuery({
    queryKey: ["admin", "orders", restaurant?.id, timeFilter],
    enabled: !!restaurant?.id,
    queryFn: async () => {
      // Fetch Orders with pagination
      const { data: orders, error, count } = await supabase
        .from("orders")
        .select("id, status, placed_at, table_label", { count: 'exact' })
        .eq("restaurant_id", restaurant!.id)
        .gte("placed_at", startISO)
        .lt("placed_at", endISO)
        .order("placed_at", { ascending: false })
        .range(page * ORDERS_PER_PAGE, (page + 1) * ORDERS_PER_PAGE - 1);

      if (error) throw error;

      // Fetch Items for these orders (to show summary)
      const orderIds = orders.map(o => o.id);
      if (orderIds.length === 0) return [];

      const { data: items } = await supabase
        .from("order_items")
        .select("order_id, name_snapshot, quantity")
        .in("order_id", orderIds);

      // Combine them
      const ordersWithSummary = orders.map(o => {
        const myItems = items?.filter(i => i.order_id === o.id) || [];
        const summary = myItems.map(i => `${i.quantity}x ${i.name_snapshot}`).join(", ");
        return { ...o, items_summary: summary };
      });

      return { orders: ordersWithSummary, totalCount: count || 0 };
    }
  });


  // --- 3. Mutation (Advance Order) ---
  const advanceMutation = useMutation({
    mutationFn: async ({ id, currentStatus }: { id: string, currentStatus: OrderStatus }) => {
      setAdvancingId(id);

      // Determine next status (existing logic preserved)
      let next: OrderStatus | null = null;
      if (currentStatus === "pending") next = "in_progress";
      else if (currentStatus === "in_progress") next = "ready";
      else if (currentStatus === "ready") next = "completed";

      // Validate transition
      if (!next) {
        throw new Error("Cannot advance order from this status");
      }

      // Update order with error checking
      const { data, error } = await supabase
        .from("orders")
        .update({
          status: next,
          completed_at: next === "completed" ? new Date().toISOString() : null
        })
        .eq("id", id)
        .eq("restaurant_id", restaurant!.id) // Security: ensure same restaurant
        .select()
        .single();

      if (error) throw error;
      if (!data) throw new Error("Order not found");

      // Log activity
      try {
        const { data: { user } } = await supabase.auth.getUser();
        await supabase.from("activity_logs").insert({
          restaurant_id: restaurant!.id,
          entity_type: "order",
          entity_id: id,
          action: "order_status_changed",
          message: `Order ${shortId(id)} moved to ${STATUS_MAP[next]}`,
          actor_user_id: user?.id,
          metadata: {
            order_id: id,
            old_status: currentStatus,
            new_status: next
          }
        });
      } catch (logError) {
        // Don't fail the mutation if logging fails
        console.error("Failed to log activity:", logError);
      }

      return data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["admin", "orders"] });
      setAdvancingId(null);
      toast({
        title: "Order updated",
        description: `Order moved to ${STATUS_MAP[data.status]}`
      });
    },
    onError: (error: Error) => {
      console.error("Order status update failed:", error);
      toast({
        title: "Failed to update order",
        description: error.message || "Please try again",
        variant: "destructive"
      });
      setAdvancingId(null);
    }
  });


  // --- 4. Filtering & Grouping ---
  const orders = ordersQuery.data?.orders || [];
  const totalCount = ordersQuery.data?.totalCount || 0;
  const totalPages = Math.ceil(totalCount / ORDERS_PER_PAGE);

  const filteredOrders = useMemo(() => {
    return orders.filter(o => {
      const matchesSearch = search ? o.id.includes(search) || o.table_label?.toLowerCase().includes(search.toLowerCase()) : true;
      const uiStatus = STATUS_MAP[o.status as OrderStatus];
      const matchesStatus = statusFilter === "all" ? true : uiStatus === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [orders, search, statusFilter]);

  const byColumn = useMemo(() => {
    const map: Record<string, any[]> = { "New": [], "Preparing": [], "Ready": [], "Completed": [] };
    filteredOrders.forEach(o => {
      const label = STATUS_MAP[o.status as OrderStatus];
      if (map[label]) map[label].push(o);
    });
    return map;
  }, [filteredOrders]);

  // --- 5. Render (Repo A Design) ---
  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Orders</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Real-time kitchen display system.
            </p>
          </div>

          <div className="inline-flex items-center gap-2 self-start rounded-full border border-border bg-background px-3 py-1.5 text-sm shadow-sm">
            <span className="relative inline-flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/40 motion-reduce:hidden" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
            </span>
            <span className="font-medium text-primary">Live Feed</span>
            <Badge variant="outline" className="text-[10px] h-5">Connected</Badge>
          </div>
        </div>

        {/* Top Toolbar (Filters) */}
        <Card className="shadow-sm">
          <CardContent className="grid gap-2 p-3 md:grid-cols-4">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="bg-background">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {UI_COLUMNS.map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={timeFilter} onValueChange={(v) => setTimeFilter(v as TimeFilter)}>
              <SelectTrigger className="bg-background">
                <SelectValue placeholder="Time" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="today">Today</SelectItem>
                <SelectItem value="last_24h">Last 24h</SelectItem>
              </SelectContent>
            </Select>

            <div className="relative md:col-span-2">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by Order ID or Table..."
                className="pl-9"
              />
            </div>
          </CardContent>
        </Card>
      </header>

      {/* Kanban Board */}
      <section className="grid gap-3 md:grid-cols-2 lg:grid-cols-4 items-start">
        {UI_COLUMNS.map((col) => (
          <Card key={col} className="shadow-sm border-0 bg-transparent shadow-none md:bg-card md:border md:shadow-sm h-full">
            <CardHeader className="pb-3 px-0 md:px-6 pt-0 md:pt-6">
              <CardTitle className="flex items-center justify-between text-sm">
                <span>{col}</span>
                <Badge variant="secondary">{byColumn[col].length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 px-0 md:px-6 pb-0 md:pb-6">
              {byColumn[col].map((o) => (
                <OrderCard
                  key={o.id}
                  order={o}
                  onAdvance={(id, status) => advanceMutation.mutate({ id, currentStatus: status })}
                  loadingId={advancingId}
                />
              ))}

              {byColumn[col].length === 0 && (
                <div className="rounded-xl border border-border border-dashed p-4 text-center text-sm text-muted-foreground bg-background/50">
                  No orders
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </section>

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage(p => Math.max(0, p - 1))}
            disabled={page === 0}
          >
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {page + 1} of {totalPages} ({totalCount} total orders)
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}