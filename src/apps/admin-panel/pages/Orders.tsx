import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { startOfDay, subDays, subMonths } from "date-fns";
import { Search, Lock, Bell, BellOff, Printer, ChevronLeft, ChevronRight, Store, Truck, ShoppingBag, Star, RefreshCw, Plus, Clock, StickyNote, UserCheck, XCircle } from "lucide-react";
import { Link } from "react-router-dom";

import { supabase } from "@/integrations/supabase/client";
import { useRestaurantContext } from "../state/restaurant-context";
import { useToast } from "@/hooks/use-toast";
import { useFeatureAccess } from "../hooks/useFeatureAccess";
import { orderNotificationService } from "../services/OrderNotificationService";
import { ManualDiscountDialog } from "../components/orders/ManualDiscountDialog";
import { generateKOTHtml } from "../components/orders/KOTTemplate";
import { shortId, formatMoney } from "@/lib/formatting";

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
type OrderStatus = "pending" | "accepted" | "in_progress" | "ready" | "completed" | "cancelled";
type TimeFilter = "daily" | "weekly" | "monthly";

// Mapping DB status to UI column labels — matches Kitchen Dashboard
const STATUS_MAP: Record<string, string> = {
  pending: "New",
  accepted: "Accepted",
  in_progress: "Cooking",
  ready: "Ready",
  completed: "Completed",
  cancelled: "Cancelled",
};

// The Kanban Columns (UI Labels) — 4 active columns
const UI_COLUMNS = ["New", "Accepted", "Cooking", "Ready"];

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

const statusVariant = (s: string) => {
  switch (s) {
    case "New": return "default";
    case "Accepted": return "secondary";
    case "Cooking": return "secondary";
    case "Ready": return "outline";
    default: return "secondary";
  }
};

// --- Types for Order Data ---
type OrderData = {
  id: string;
  status: string;
  placed_at: string;
  table_label: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  notes: string | null;
  subtotal_cents: number;
  tax_cents: number;
  tip_cents: number;
  discount_cents: number;
  discount_type: string | null;
  discount_reason: string | null;
  payment_method: string | null;
  payment_status: string | null;
  total_cents: number;
  items_summary: string;
  item_details: any[];
  order_type: string | null;
  rating: number | null;
  delivery_address: string | null;
  bill_breakdown: any;
  metadata: Record<string, unknown> | null;
  dailyToken?: number;
};

// --- Subcomponent: Order Card ---
function OrderCard({
  order,
  onAdvance,
  onCancel,
  loadingId,
  currencyCode,
  restaurantName,
  selected,
  onToggle,
}: {
  order: OrderData;
  onAdvance: (id: string, currentStatus: OrderStatus) => void;
  onCancel?: (id: string) => void;
  loadingId: string | null;
  currencyCode: string;
  restaurantName: string;
  selected?: boolean;
  onToggle?: (id: string) => void;
}) {
  const uiStatus = STATUS_MAP[order.status] ?? order.status;
  const isLoading = loadingId === order.id;

  // OR-3: Time elapsed badge with SLA coloring
  const minutesAgo = Math.floor((Date.now() - new Date(order.placed_at).getTime()) / 60_000);
  const isActive = ["pending", "accepted", "in_progress"].includes(order.status);
  const timeColor = !isActive ? "text-muted-foreground"
    : minutesAgo >= 25 ? "text-red-600 font-bold"
    : minutesAgo >= 15 ? "text-amber-600 font-semibold"
    : "text-muted-foreground";
  const timeUrgent = isActive && minutesAgo >= 25;

  // Status colors matching Kitchen Dashboard
  const STATUS_COLORS: Record<string, string> = {
    pending: "bg-amber-50 border-amber-300 dark:bg-amber-950 dark:border-amber-700",
    accepted: "bg-blue-50 border-blue-300 dark:bg-blue-950 dark:border-blue-700",
    in_progress: "bg-orange-50 border-orange-300 dark:bg-orange-950 dark:border-orange-700",
    ready: "bg-green-50 border-green-300 dark:bg-green-950 dark:border-green-700",
    completed: "bg-muted border-border",
    cancelled: "bg-muted border-border opacity-60",
  };

  // Order type left border (matching KD)
  const ORDER_TYPE_BORDER: Record<string, string> = {
    dine_in: "border-l-4 border-l-blue-500",
    pickup: "border-l-4 border-l-emerald-500",
    delivery: "border-l-4 border-l-orange-500",
  };

  const typeBorder = ORDER_TYPE_BORDER[order.order_type ?? ""] ?? "";

  return (
    <div className={cn(
      "border-2 rounded-xl p-3 shadow-sm transition-all hover:shadow-md",
      STATUS_COLORS[order.status] || "bg-background border-border",
      typeBorder,
      timeUrgent && "ring-2 ring-red-400 animate-pulse",
      selected && "ring-2 ring-primary bg-primary/5"
    )}>
      <div className="flex items-start justify-between gap-3">
        {/* OR-8: Bulk selection checkbox */}
        {onToggle && (
          <input
            type="checkbox"
            checked={selected ?? false}
            onChange={() => onToggle(order.id)}
            className="mt-1 h-4 w-4 rounded border-border accent-primary shrink-0 cursor-pointer"
          />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-sm">
              {order.dailyToken ? `Token #${order.dailyToken}` : order.status === 'pending' ? 'NEW' : shortId(order.id)}
            </span>
            {order.payment_status === 'paid' ? (
              <Badge variant="default" className="bg-green-600 text-white text-[10px] px-1.5">Paid</Badge>
            ) : order.payment_method === 'online' || order.payment_method === 'upi' ? (
              <Badge variant="destructive" className="text-[10px] px-1.5">Unpaid</Badge>
            ) : (
              <Badge variant="outline" className="text-[10px] px-1.5 capitalize">{order.payment_method || 'Cash'}</Badge>
            )}
            {/* Staff order badge */}
            {!!(order.metadata as any)?.via_staff && (
              <Badge variant="secondary" className="text-[10px] h-5 px-1.5 gap-0.5 bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300">
                <UserCheck className="h-3 w-3" /> Staff
              </Badge>
            )}
          </div>
          <div className="mt-1 flex items-center gap-1 text-xs">
            <Clock className="h-3 w-3" />
            <span className={timeColor}>{minutesAgo}m ago</span>
            {order.table_label && (
              <span className="ml-1 text-muted-foreground">· {order.table_label}</span>
            )}
          </div>
          {/* Customer name */}
          {order.customer_name && (
            <div className="mt-0.5 text-xs font-medium">
              👤 {order.customer_name}{order.customer_phone ? ` · ${order.customer_phone}` : ''}
            </div>
          )}
          {/* Order Type Badges */}
          <div className="mt-1 flex items-center gap-1 flex-wrap">
            {order.order_type === 'dine_in' && <Badge variant="outline" className="text-[9px] h-4 px-1 gap-0.5"><Store className="h-2.5 w-2.5" /> Dine-In</Badge>}
            {order.order_type === 'pickup' && <Badge variant="outline" className="text-[9px] h-4 px-1 gap-0.5"><ShoppingBag className="h-2.5 w-2.5" /> Pickup</Badge>}
            {order.order_type === 'delivery' && <Badge variant="outline" className="text-[9px] h-4 px-1 gap-0.5"><Truck className="h-2.5 w-2.5" /> Delivery</Badge>}
            {order.rating && <Badge variant="secondary" className="text-[10px] h-5 px-1.5 gap-0.5"><Star className="h-3 w-3 text-amber-500" /> {order.rating}/5</Badge>}
          </div>
        </div>
        {/* Status badge on right (matching KD) */}
        <Badge variant="outline" className="text-xs shrink-0">{uiStatus}</Badge>

        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground"
          title="Print KOT"
          onClick={() => {
            const html = generateKOTHtml(order, restaurantName);
            const w = window.open('', '_blank', 'width=420,height=650,scrollbars=yes');
            if (w) {
              w.document.open();
              w.document.write(html);
              w.document.close();
            } else {
              const blob = new Blob([html], { type: 'text/html' });
              const url = URL.createObjectURL(blob);
              window.open(url, '_blank');
              setTimeout(() => URL.revokeObjectURL(url), 5000);
            }
          }}
        >
          <Printer className="h-4 w-4" />
        </Button>
      </div>

      <div className="mt-2 text-sm line-clamp-2">
        {order.items_summary || "Loading items..."}
      </div>

      {/* OR-4: Order-level notes */}
      {order.notes && (
        <div className="mt-1.5 flex items-start gap-1.5 text-xs bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded px-2 py-1">
          <StickyNote className="h-3 w-3 text-amber-600 shrink-0 mt-0.5" />
          <span className="text-amber-800 dark:text-amber-300">{order.notes}</span>
        </div>
      )}

      {/* Payment & Discount Info */}
      <div className="mt-2 flex flex-wrap gap-2 text-xs">
        {order.payment_method && (
          <Badge variant="secondary" className="text-[10px] h-5 px-1.5 capitalize">
            {order.payment_method}
          </Badge>
        )}
        {order.discount_cents > 0 && (
          <Badge variant="destructive" className="text-[10px] h-5 px-1.5">
            -{formatMoney(order.discount_cents, currencyCode)}
          </Badge>
        )}
      </div>

      {/* Bill Breakdown */}
      <div className="mt-2 space-y-0.5 text-[11px] text-muted-foreground border-t pt-1.5">
        <div className="flex justify-between">
          <span>Subtotal</span>
          <span>{formatMoney(order.subtotal_cents || order.total_cents, currencyCode)}</span>
        </div>
        {(order.tax_cents > 0) && (
          <div className="flex justify-between">
            <span>{order.bill_breakdown?.tax_label || 'Tax'}{order.bill_breakdown?.tax_rate_pct ? ` (${order.bill_breakdown.tax_rate_pct}%)` : ''}</span>
            <span>{formatMoney(order.tax_cents, currencyCode)}</span>
          </div>
        )}
        {order.bill_breakdown?.extra_charges?.filter((c: any) => c.cents > 0).map((c: any, idx: number) => (
          <div key={idx} className="flex justify-between">
            <span>{c.label}</span>
            <span>{formatMoney(c.cents, currencyCode)}</span>
          </div>
        ))}
        {(order.tip_cents > 0) && (
          <div className="flex justify-between">
            <span>Tip</span>
            <span>{formatMoney(order.tip_cents, currencyCode)}</span>
          </div>
        )}
        {order.discount_cents > 0 && (
          <div className="flex justify-between text-green-600">
            <span>Discount</span>
            <span>-{formatMoney(order.discount_cents, currencyCode)}</span>
          </div>
        )}
        <div className="flex justify-between font-bold text-foreground text-xs pt-0.5 border-t border-dashed">
          <span>Total</span>
          <span>{formatMoney(order.total_cents, currencyCode)}</span>
        </div>
      </div>

      {/* Delivery address */}
      {order.order_type === 'delivery' && order.delivery_address && (
        <div className="mt-1 text-xs text-muted-foreground bg-muted/50 rounded px-2 py-1">
          📍 {order.delivery_address}
        </div>
      )}

      {/* Action buttons — unified status flow */}
      <div className="mt-3 grid gap-2">
        {order.status === "pending" && (
          <Button className="w-full" size="sm" onClick={() => onAdvance(order.id, "pending")} disabled={isLoading}>
            Accept Order
          </Button>
        )}
        {order.status === "accepted" && (
          <Button className="w-full" size="sm" onClick={() => onAdvance(order.id, "accepted")} disabled={isLoading}>
            Start Cooking
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

        {/* OR-10: Cancel button (only for non-completed/non-cancelled) */}
        {onCancel && !['completed', 'cancelled'].includes(order.status) && (
          <Button variant="destructive" size="sm" className="w-full" onClick={() => onCancel(order.id)} disabled={isLoading}>
            <XCircle className="h-3.5 w-3.5 mr-1" /> Cancel
          </Button>
        )}

        {/* Manual Discount Action - Only if no discount yet and not completed */}
        {order.status !== "completed" && order.status !== "cancelled" && order.discount_cents === 0 && (
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
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("daily");
  const [search, setSearch] = useState("");
  const [advancingId, setAdvancingId] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const ORDERS_PER_PAGE = 50;
  // OR-8: Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Fetch child brands so orders across all brands are shown
  const brandsQuery = useQuery({
    queryKey: ["orders-brands", restaurant?.id],
    enabled: !!restaurant?.id,
    retry: false,
    throwOnError: false,
    queryFn: async () => {
      try {
        const { data } = await supabase
          .from("restaurants")
          .select("id")
          .eq("parent_kitchen_id", restaurant!.id);
        return data ?? [];
      } catch { return []; }
    },
  });

  const allRestaurantIds = [
    restaurant?.id,
    ...(brandsQuery.data?.map((b: any) => b.id) ?? [])
  ].filter(Boolean) as string[];

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


  // Reset page when filters change
  useEffect(() => {
    setPage(0);
  }, [statusFilter, timeFilter, search]);

  // --- 1. Realtime Subscription ---
  // Use a ref for notificationsEnabled to avoid tearing down the channel on toggle
  const notificationsEnabledRef = useRef(notificationsEnabled);
  useEffect(() => {
    notificationsEnabledRef.current = notificationsEnabled;
  }, [notificationsEnabled]);

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
              title: "\uD83D\uDD14 New Order!",
              description: `Order ${shortId(newOrder.id)} received.${newOrder.table_label ? ` Table ${newOrder.table_label}` : ''}`
            });

            // Trigger sound and desktop notification if enabled
            if (notificationsEnabledRef.current) {
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
                items_count: itemsCount,
                currency_code: restaurant?.currency_code || "INR",
              });
            }
          }
        })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [restaurant?.id, toast, qc]);

  // --- 2. Data Fetching ---
  const ordersQuery = useQuery({
    queryKey: ["admin", "orders", allRestaurantIds, timeFilter, page],
    enabled: !!restaurant?.id && allRestaurantIds.length > 0,
    refetchInterval: 15_000, // Auto-refresh every 15 seconds for live feed
    queryFn: async () => {
      // Compute time range INSIDE queryFn (fresh on every fetch — matches KD pattern)
      const now = new Date();
      let timeStart: Date;
      let timeEnd: Date | null = null;

      if (timeFilter === "yesterday") {
        timeStart = subDays(startOfDay(now), 1);
        timeEnd = startOfDay(now);
      } else if (timeFilter === "weekly") {
        timeStart = subDays(now, 7);
      } else if (timeFilter === "monthly") {
        timeStart = subMonths(now, 1);
      } else {
        // daily — start of today, no upper bound
        timeStart = startOfDay(now);
      }

      const ids = allRestaurantIds;
      console.log("[Orders DEBUG] restaurant?.id:", restaurant?.id);
      console.log("[Orders DEBUG] allRestaurantIds:", ids);
      console.log("[Orders DEBUG] timeFilter:", timeFilter, "from:", timeStart.toISOString(), "to:", timeEnd?.toISOString() ?? "none");
      console.log("[Orders DEBUG] page:", page, "range:", page * ORDERS_PER_PAGE, "-", (page + 1) * ORDERS_PER_PAGE - 1);

      // Fetch Orders with pagination — include child brands
      let q = supabase
        .from("orders")
        .select("id, status, placed_at, table_label, customer_name, customer_phone, notes, subtotal_cents, tax_cents, tip_cents, discount_cents, discount_type, discount_reason, payment_method, payment_status, total_cents, order_type, rating, delivery_address, bill_breakdown, metadata", { count: 'exact' })
        .in("restaurant_id", ids)
        .gte("placed_at", timeStart.toISOString())
        .order("placed_at", { ascending: false })
        .range(page * ORDERS_PER_PAGE, (page + 1) * ORDERS_PER_PAGE - 1);

      // Only apply upper bound for fixed ranges (e.g. yesterday)
      if (timeEnd) q = q.lt("placed_at", timeEnd.toISOString());

      const { data: orders, error, count } = await q;

      console.log("[Orders DEBUG] Query result — count:", count, "orders:", orders?.length, "error:", error);
      if (orders && orders.length > 0) {
        console.log("[Orders DEBUG] First order:", { id: orders[0].id, status: orders[0].status, placed_at: orders[0].placed_at });
      }

      if (error) throw error;

      // Fetch Items for these orders (to show summary)
      const orderIds = orders.map(o => o.id);
      if (orderIds.length === 0) return { orders: [], totalCount: count || 0 };

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

      // Combine them + compute daily token numbers
      // Tokens are ONLY for accepted orders (not cancelled/pending)
      // Tokens reset per day — group by date
      const sorted = [...orders].sort((a, b) => new Date(a.placed_at).getTime() - new Date(b.placed_at).getTime());
      const tokenMap = new Map<string, number>();
      const dailyCounters = new Map<string, number>(); // key: YYYY-MM-DD
      sorted.forEach(o => {
        if (o.status !== 'cancelled' && o.status !== 'pending') {
          const dateKey = new Date(o.placed_at).toISOString().slice(0, 10);
          const current = (dailyCounters.get(dateKey) ?? 0) + 1;
          dailyCounters.set(dateKey, current);
          tokenMap.set(o.id, current);
        }
      });

      const ordersWithSummary = orders.map(o => {
        const myItems = (items?.filter(i => i.order_id === o.id) || []).map((i: any) => ({
          ...i,
          variant_name: i.variant?.name || i.variant_name
        }));

        const summary = myItems.map(i => {
          let text = `${i.quantity}x ${i.name_snapshot}`;
          if (i.variant_name) text += ` (${i.variant_name})`;
          if (i.addons && Array.isArray(i.addons) && i.addons.length > 0) {
            text += ` + ${i.addons.map((a: any) => a.name).join(", ")}`;
          }
          if (i.notes) text += ` [Note: ${i.notes}]`;
          return text;
        }).join(", ");
        return { ...o, items_summary: summary, item_details: myItems, dailyToken: tokenMap.get(o.id) ?? 0 };
      });

      return { orders: ordersWithSummary, totalCount: count || 0 };
    }
  });


  // --- 3. Mutation (Advance Order) — unified flow matching Kitchen ---
  const advanceMutation = useMutation({
    mutationFn: async ({ id, currentStatus }: { id: string, currentStatus: OrderStatus }) => {
      setAdvancingId(id);

      // Unified status flow: pending → accepted → in_progress → ready → completed
      const NEXT_STATUS: Record<string, OrderStatus> = {
        pending: "accepted",
        accepted: "in_progress",
        in_progress: "ready",
        ready: "completed",
      };
      const next = NEXT_STATUS[currentStatus];

      if (!next) {
        throw new Error("Cannot advance order from this status");
      }

      // Update order with error checking — restaurant_id filter for security
      const { data, error } = await supabase
        .from("orders")
        .update({
          status: next,
          completed_at: next === "completed" ? new Date().toISOString() : null
        })
        .eq("id", id)
        .eq("restaurant_id", restaurant!.id)
        .select()
        .single();

      if (error) throw error;
      if (!data) throw new Error("Order not found");

      // Deduct inventory when order moves to 'accepted' (same as Kitchen)
      if (next === "accepted") {
        try {
          const { data: rpcResult, error: rpcError } = await supabase.rpc("deduct_stock_for_accepted_order", {
            p_order_id: id,
            p_restaurant_id: restaurant!.id,
          }) as any;
          if (!rpcError && rpcResult) {
            const lowAlerts = rpcResult?.low_stock_alerts || [];
            const disabled = rpcResult?.disabled_items || [];
            if (disabled.length > 0) {
              toast({ title: "⚠️ Items auto-disabled", description: disabled.join(", "), variant: "destructive" });
            } else if (lowAlerts.length > 0) {
              toast({ title: "📦 Low Stock Alert", description: lowAlerts.join(", ") });
            }
            qc.invalidateQueries({ queryKey: ["ingredients"] });
          }
        } catch {
          // Non-blocking — inventory deduction failure shouldn't block order advance
        }
      }

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
        console.error("Failed to log activity:", logError);
      }

      return data;
    },
    // OR-15: Optimistic update
    onMutate: async ({ id, currentStatus }) => {
      const queryKey = ["admin", "orders", allRestaurantIds, timeFilter, page];
      await qc.cancelQueries({ queryKey });
      const prev = qc.getQueryData(queryKey);
      qc.setQueryData(queryKey, (old: any) => {
        if (!old?.orders) return old;
        const NEXT: Record<string, string> = { pending: "accepted", accepted: "in_progress", in_progress: "ready", ready: "completed" };
        return {
          ...old,
          orders: old.orders.map((o: any) => o.id === id ? { ...o, status: NEXT[currentStatus] ?? o.status } : o),
        };
      });
      return { prev, queryKey };
    },
    onSuccess: (_data) => {
      qc.invalidateQueries({ queryKey: ["admin", "orders"] });
      qc.invalidateQueries({ queryKey: ["kitchen-orders"] });
      setAdvancingId(null);
      toast({
        title: "Order updated",
        description: `Status advanced successfully`
      });
    },
    onError: (error: Error, _vars, context) => {
      // Rollback optimistic update
      if (context?.prev && context?.queryKey) {
        qc.setQueryData(context.queryKey, context.prev);
      }
      console.error("Order status update failed:", error);
      toast({
        title: "Failed to update order",
        description: error.message || "Please try again",
        variant: "destructive"
      });
      setAdvancingId(null);
    }
  });

  // --- OR-10: Cancel order with reason ---
  const cancelMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      setAdvancingId(id);
      const { error } = await supabase
        .from("orders")
        .update({ status: "cancelled" })
        .eq("id", id)
        .eq("restaurant_id", restaurant!.id);
      if (error) throw error;
      try {
        const { data: { user } } = await supabase.auth.getUser();
        await supabase.from("activity_logs").insert({
          restaurant_id: restaurant!.id, entity_type: "order", entity_id: id,
          action: "order_cancelled",
          message: `Order ${shortId(id)} cancelled: ${reason}`,
          actor_user_id: user?.id, metadata: { order_id: id, reason }
        });
      } catch { /* non-blocking */ }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "orders"] });
      qc.invalidateQueries({ queryKey: ["kitchen-orders"] });
      setAdvancingId(null);
      toast({ title: "Order cancelled" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to cancel", description: err.message, variant: "destructive" });
      setAdvancingId(null);
    }
  });

  // --- OR-11: CSV Export ---
  function exportCSV() {
    const rows = orders.filter(o => o.status !== "cancelled");
    if (rows.length === 0) { toast({ title: "No orders to export", variant: "destructive" }); return; }
    const header = "Order ID,Token,Status,Placed At,Type,Table,Customer,Payment,Subtotal,Tax,Tip,Discount,Total\n";
    const csv = header + rows.map(o => [
      shortId(o.id), o.dailyToken ?? "", o.status, new Date(o.placed_at).toLocaleString(),
      o.order_type ?? "", o.table_label ?? "", o.customer_name ?? "", o.payment_method ?? "cash",
      (o.subtotal_cents / 100).toFixed(2), (o.tax_cents / 100).toFixed(2),
      (o.tip_cents / 100).toFixed(2), (o.discount_cents / 100).toFixed(2), (o.total_cents / 100).toFixed(2),
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url;
    a.download = `orders_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
    toast({ title: "CSV exported" });
  }

  // --- OR-8: Bulk advance ---
  async function bulkAdvance() {
    if (selectedIds.size === 0) { toast({ title: "No orders selected", variant: "destructive" }); return; }
    const selected = orders.filter(o => selectedIds.has(o.id) && !["completed", "cancelled"].includes(o.status));
    if (selected.length === 0) { toast({ title: "No advanceable orders selected" }); return; }
    for (const o of selected) {
      advanceMutation.mutate({ id: o.id, currentStatus: o.status as OrderStatus });
    }
    setSelectedIds(new Set());
  }

  function toggleSelect(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  // --- 4. Filtering & Grouping ---
  const orders = ordersQuery.data?.orders || [];
  const totalCount = ordersQuery.data?.totalCount || 0;
  const totalPages = Math.ceil(totalCount / ORDERS_PER_PAGE);

  const filteredOrders = useMemo(() => {
    return orders.filter(o => {
      const matchesSearch = search
        ? (() => {
            const q = search.toLowerCase();
            const tokenStr = o.dailyToken ? `token #${o.dailyToken}` : '';
            if (tokenStr && tokenStr.includes(q)) return true;
            if (o.dailyToken && String(o.dailyToken) === q.replace(/[^0-9]/g, '')) return true;
            if (shortId(o.id).toLowerCase().includes(q)) return true;
            if (o.table_label?.toLowerCase().includes(q)) return true;
            if (o.items_summary?.toLowerCase().includes(q)) return true;
            if (o.order_type?.toLowerCase().includes(q)) return true;
            // OR-7: Search by customer name
            if (o.customer_name?.toLowerCase().includes(q)) return true;
            return false;
          })()
        : true;
      const uiStatus = STATUS_MAP[o.status] ?? o.status;
      const matchesStatus = statusFilter === "all"
        ? o.status !== "cancelled" // "all" hides cancelled by default
        : statusFilter === "Cancelled"
        ? o.status === "cancelled"
        : uiStatus === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [orders, search, statusFilter]);

  // OR-2: Order count summary
  const orderSummary = useMemo(() => {
    const nonCancelled = orders.filter(o => o.status !== "cancelled");
    const pending = nonCancelled.filter(o => o.status === "pending").length;
    const revenue = nonCancelled.reduce((s, o) => s + (o.total_cents || 0), 0);
    return { total: nonCancelled.length, pending, revenue };
  }, [orders]);

  const byColumn = useMemo(() => {
    const map: Record<string, any[]> = { "New": [], "Accepted": [], "Cooking": [], "Ready": [] };
    filteredOrders.forEach(o => {
      const label = STATUS_MAP[o.status] ?? o.status;
      if (map[label]) map[label].push(o);
    });
    return map;
  }, [filteredOrders]);

  // When a specific status is selected, show only that column
  const visibleColumns = useMemo(() => {
    if (statusFilter === "all") return UI_COLUMNS;
    if (statusFilter === "Cancelled" || statusFilter === "Completed") return []; // Shows as list, not kanban
    return UI_COLUMNS.filter(col => col === statusFilter);
  }, [statusFilter]);

  // --- 5. Render ---
  return (
    <div className="flex flex-col gap-4 w-full">
      <header className="flex flex-col gap-3 w-full">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Orders</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Real-time order management &amp; kitchen display.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* OR-1: New Order button */}
            <Button asChild size="sm" className="gap-1.5">
              <Link to="/admin/quick-order">
                <Plus className="h-4 w-4" /> New Order
              </Link>
            </Button>
            {/* OR-11: CSV Export */}
            <Button variant="outline" size="sm" onClick={exportCSV} className="gap-1.5">
              📥 Export CSV
            </Button>
            {/* OR-8: Bulk advance */}
            {selectedIds.size > 0 && (
              <Button size="sm" onClick={bulkAdvance} className="gap-1.5">
                ⚡ Advance {selectedIds.size} Order{selectedIds.size > 1 ? 's' : ''}
              </Button>
            )}
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

            <Button variant="outline" size="icon" onClick={() => qc.invalidateQueries({ queryKey: ["admin", "orders"] })} title="Refresh orders">
              <RefreshCw className={`h-4 w-4 ${ordersQuery.isFetching ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>

        {/* Top Toolbar (Filters) */}
        {/* OR-2: Order count summary bar */}
        <div className="flex gap-4 flex-wrap text-sm">
          <div className="flex items-center gap-1.5 bg-muted rounded-full px-3 py-1">
            <span className="text-muted-foreground">Today:</span>
            <span className="font-semibold">{orderSummary.total} orders</span>
          </div>
          <div className="flex items-center gap-1.5 bg-muted rounded-full px-3 py-1">
            <span className="text-muted-foreground">Revenue:</span>
            <span className="font-semibold">{formatMoney(orderSummary.revenue, restaurant?.currency_code || 'INR')}</span>
          </div>
          {orderSummary.pending > 0 && (
            <div className="flex items-center gap-1.5 bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300 rounded-full px-3 py-1">
              <span className="font-semibold">{orderSummary.pending} pending</span>
            </div>
          )}
        </div>

        <Card className="shadow-sm">
          <CardContent className="grid gap-2 p-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="bg-background">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {UI_COLUMNS.map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
                <SelectItem value="Completed">Completed</SelectItem>
                <SelectItem value="Cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>

            <Select value={timeFilter} onValueChange={(v) => setTimeFilter(v as TimeFilter)}>
              <SelectTrigger className="bg-background">
                <SelectValue placeholder="Time" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="daily">Today</SelectItem>
                <SelectItem value="yesterday">Yesterday</SelectItem>
                <SelectItem value="weekly">This Week</SelectItem>
                <SelectItem value="monthly">This Month</SelectItem>
              </SelectContent>
            </Select>

            <div className="relative sm:col-span-2">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by token, table, or item..."
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

      {/* Kanban Board — shows only selected column when filtered, all columns when "all" */}
      <div className="overflow-x-auto w-full">
        <section className={cn(
          "grid gap-3 w-full items-start",
          statusFilter === "all"
            ? "grid-cols-2 lg:grid-cols-4"
            : "grid-cols-1 max-w-2xl"
        )} style={{minWidth: statusFilter === "all" ? '520px' : undefined}}>
          {visibleColumns.map((col) => (
            <Card key={col} className="shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center justify-between text-sm">
                  <span>{col}</span>
                  <Badge variant="secondary">{byColumn[col].length}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {byColumn[col].map((o) => (
                  <OrderCard
                    key={o.id}
                    order={o}
                    onAdvance={(id, status) => advanceMutation.mutate({ id, currentStatus: status })}
                    onCancel={(id) => {
                      const reason = prompt('Cancel reason:', 'Customer requested cancellation');
                      if (reason) cancelMutation.mutate({ id, reason });
                    }}
                    loadingId={advancingId}
                    currencyCode={restaurant?.currency_code || "INR"}
                    restaurantName={restaurant?.name || "Restaurant"}
                    selected={selectedIds.has(o.id)}
                    onToggle={toggleSelect}
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
      </div>

      {/* OR-13: Completed/Cancelled orders list view */}
      {(statusFilter === "Cancelled" || statusFilter === "Completed") && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filteredOrders.length === 0 ? (
            <div className="col-span-full rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
              <XCircle className="h-8 w-8 mx-auto mb-2 opacity-40" />
              No {statusFilter.toLowerCase()} orders found.
            </div>
          ) : filteredOrders.map((o) => (
            <OrderCard
              key={o.id}
              order={o}
              onAdvance={(id, status) => advanceMutation.mutate({ id, currentStatus: status })}
              onCancel={(id) => {
                const reason = prompt('Cancel reason:', 'Customer requested cancellation');
                if (reason) cancelMutation.mutate({ id, reason });
              }}
              loadingId={advancingId}
              currencyCode={restaurant?.currency_code || "INR"}
              restaurantName={restaurant?.name || "Restaurant"}
              selected={selectedIds.has(o.id)}
              onToggle={toggleSelect}
            />
          ))}
        </div>
      )}

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="flex flex-wrap items-center justify-center gap-2 mt-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage(p => Math.max(0, p - 1))}
            disabled={page === 0}
          >
            Previous
          </Button>
          <span className="text-sm text-muted-foreground text-center">
            Page {page + 1} of {totalPages} ({totalCount} orders)
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