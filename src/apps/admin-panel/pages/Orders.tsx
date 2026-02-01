import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { addDays, startOfDay, subHours, subDays, subMonths, subQuarters, subYears } from "date-fns";
import { Search, Download, Lock, Bell, BellOff, Printer } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useRestaurantContext } from "../state/restaurant-context";
import { useToast } from "@/hooks/use-toast";
import { useFeatureAccess } from "../hooks/useFeatureAccess";
import { orderNotificationService } from "../services/OrderNotificationService";
import { ManualDiscountDialog } from "../components/orders/ManualDiscountDialog";
import { generateKOTHtml } from "../components/orders/KOTTemplate";

// UI Components
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
type TimeFilter = "last_24h" | "week" | "month" | "quarter" | "year";

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

        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground"
          title="Print KOT"
          onClick={() => {
            const popup = window.open('', '_blank', 'width=400,height=600');
            if (popup) {
              popup.document.write(generateKOTHtml(order));
              popup.document.close();
            }
          }}
        >
          <Printer className="h-4 w-4" />
        </Button>
      </div>

      <div className="mt-2 text-sm line-clamp-2">
        {order.items_summary || "Loading items..."}
      </div>

      {/* Payment & Discount Info */}
      <div className="mt-2 flex flex-wrap gap-2 text-xs">
        {order.payment_method && (
          <Badge variant="secondary" className="text-[10px] h-5 px-1.5 capitalize">
            {order.payment_method}
          </Badge>
        )}
        {order.discount_cents > 0 && (
          <Badge variant="destructive" className="text-[10px] h-5 px-1.5">
            -${(order.discount_cents / 100).toFixed(2)}
            {/* {order.discount_reason && ` (${order.discount_reason})`} */}
          </Badge>
        )}
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

        {/* Manual Discount Action - Only if no discount yet and not completed */}
        {order.status !== "completed" && order.discount_cents === 0 && (
          <ManualDiscountDialog orderId={order.id} orderTotalCents={order.total_cents} />
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
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("last_24h");
  const [search, setSearch] = useState("");
  const [advancingId, setAdvancingId] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const ORDERS_PER_PAGE = 50;

  // Notification state
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>('default');

  // Check if online ordering is enabled
  const { isFeatureEnabled } = useFeatureAccess(restaurant?.id);
  const onlineOrderingEnabled = isFeatureEnabled('online_ordering');

  // Request notification permission on mount
  useEffect(() => {
    if (orderNotificationService.isSupported()) {
      setNotificationPermission(orderNotificationService.getPermissionStatus());
      if (orderNotificationService.getPermissionStatus() === 'granted') {
        setNotificationsEnabled(true);
      }
    }
  }, []);

  // Handle notification toggle
  const toggleNotifications = async () => {
    if (!notificationsEnabled) {
      const granted = await orderNotificationService.requestPermission();
      if (granted) {
        setNotificationsEnabled(true);
        setNotificationPermission('granted');
        toast({ title: "Notifications Enabled", description: "You'll receive alerts for new orders." });
      } else {
        toast({
          title: "Permission Denied",
          description: "Please enable notifications in your browser settings.",
          variant: "destructive"
        });
      }
    } else {
      setNotificationsEnabled(false);
      toast({ title: "Notifications Disabled", description: "You won't receive order alerts." });
    }
  };

  // Time Range Logic
  const { startISO, endISO } = useMemo(() => {
    const now = new Date();
    let start: Date;

    switch (timeFilter) {
      case "last_24h":
        start = subHours(now, 24);
        break;
      case "week":
        start = subDays(now, 7);
        break;
      case "month":
        start = subMonths(now, 1);
        break;
      case "quarter":
        start = subMonths(now, 3);
        break;
      case "year":
        start = subYears(now, 1);
        break;
      default:
        start = subHours(now, 24);
    }

    return { startISO: start.toISOString(), endISO: now.toISOString() };
  }, [timeFilter]);

  // --- 1. Realtime Subscription ---
  useEffect(() => {
    if (!restaurant?.id) return;

    const channel = supabase.channel("admin-orders-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `restaurant_id=eq.${restaurant.id}` },
        async (payload) => {
          qc.invalidateQueries({ queryKey: ["admin", "orders"] });

          if (payload.eventType === "INSERT") {
            const newOrder = payload.new as any;

            // Show toast notification
            toast({
              title: "🔔 New Order!",
              description: `Order ${shortId(newOrder.id)} received.${newOrder.table_label ? ` Table ${newOrder.table_label}` : ''}`
            });

            // Trigger sound and desktop notification if enabled
            if (notificationsEnabled) {
              // Fetch order items count for better notification
              const { data: items } = await supabase
                .from("order_items")
                .select("quantity")
                .eq("order_id", newOrder.id);

              const itemsCount = items?.reduce((sum, item) => sum + item.quantity, 0) || 0;

              orderNotificationService.notifyNewOrder({
                id: newOrder.id,
                table_label: newOrder.table_label,
                total_cents: newOrder.total_cents || 0,
                items_count: itemsCount
              });
            }
          }
        })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [restaurant?.id, notificationsEnabled]);

  // --- 2. Data Fetching ---
  const ordersQuery = useQuery({
    queryKey: ["admin", "orders", restaurant?.id, timeFilter],
    enabled: !!restaurant?.id,
    queryFn: async () => {
      // Fetch Orders with pagination
      const { data: orders, error, count } = await supabase
        .from("orders")
        .select("id, status, placed_at, table_label, discount_cents, discount_type, discount_reason, payment_method, total_cents", { count: 'exact' })
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
        .select(`
          order_id, 
          name_snapshot, 
          quantity, 
          addons, 
          notes,
          variant:menu_item_variants(name)
        `)
        .in("order_id", orderIds);

      // Combine them
      const ordersWithSummary = orders.map(o => {
        // Flatten variant name for consistency (KOT template expects variant_name)
        const myItems = (items?.filter(i => i.order_id === o.id) || []).map((i: any) => ({
          ...i,
          variant_name: i.variant?.name || i.variant_name
        }));

        // Helper for concise summary
        const summary = myItems.map(i => {
          let text = `${i.quantity}x ${i.name_snapshot}`;
          if (i.variant_name) text += ` (${i.variant_name})`;
          if (i.addons && Array.isArray(i.addons) && i.addons.length > 0) {
            text += ` + ${i.addons.map((a: any) => a.name).join(", ")}`;
          }
          if (i.notes) text += ` [Note: ${i.notes}]`;
          return text;
        }).join(", ");
        return { ...o, items_summary: summary, item_details: myItems };
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

          <div className="flex items-center gap-2">
            <div className="inline-flex items-center gap-2 self-start rounded-full border border-border bg-background px-3 py-1.5 text-sm shadow-sm">
              <span className="relative inline-flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/40 motion-reduce:hidden" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
              </span>
              <span className="font-medium text-primary">Live Feed</span>
              <Badge variant="outline" className="text-[10px] h-5">Connected</Badge>
            </div>

            <Button
              variant={notificationsEnabled ? "default" : "outline"}
              size="sm"
              onClick={toggleNotifications}
              className="gap-2"
            >
              {notificationsEnabled ? (
                <>
                  <Bell className="h-4 w-4" />
                  Alerts On
                </>
              ) : (
                <>
                  <BellOff className="h-4 w-4" />
                  Alerts Off
                </>
              )}
            </Button>
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
                <SelectItem value="last_24h">Last 24 Hours</SelectItem>
                <SelectItem value="week">Last Week</SelectItem>
                <SelectItem value="month">Last Month</SelectItem>
                <SelectItem value="quarter">Last Quarter</SelectItem>
                <SelectItem value="year">Last Year</SelectItem>
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

      {/* Online Ordering Feature Check */}
      {!onlineOrderingEnabled && (
        <Alert variant="destructive">
          <Lock className="h-4 w-4" />
          <AlertTitle>Online Ordering Disabled</AlertTitle>
          <AlertDescription>
            Online ordering is not enabled for your plan. Upgrade to start accepting online orders.
          </AlertDescription>
        </Alert>
      )}

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