import { useState, useEffect, useRef, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRestaurantContext } from "../state/restaurant-context";
import { FeatureGate } from "../components/FeatureGate";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RefreshCw, ChefHat, Clock, Store, Truck, ShoppingBag, AlertTriangle, Package, StickyNote, BarChart3 } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { formatMoney } from "@/lib/formatting";
import { shortId } from "@/lib/formatting";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

type OrderStatus = "pending" | "accepted" | "in_progress" | "ready" | "completed" | "cancelled";

const STATUS_LABELS: Record<string, string> = {
  pending: "New",
  accepted: "Accepted",
  in_progress: "Cooking",
  ready: "Ready",
  completed: "Served",
  cancelled: "Cancelled",
};

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-amber-50 border-amber-300 dark:bg-amber-950 dark:border-amber-700",
  accepted: "bg-blue-50 border-blue-300 dark:bg-blue-950 dark:border-blue-700",
  in_progress: "bg-orange-50 border-orange-300 dark:bg-orange-950 dark:border-orange-700",
  ready: "bg-green-50 border-green-300 dark:bg-green-950 dark:border-green-700",
  completed: "bg-muted border-border",
  cancelled: "bg-muted border-border opacity-60",
};

// KD-6: Color-coded order type left borders
const ORDER_TYPE_BORDER: Record<string, string> = {
  dine_in: "border-l-4 border-l-blue-500",
  pickup: "border-l-4 border-l-emerald-500",
  delivery: "border-l-4 border-l-orange-500",
};

export default function KitchenDashboard() {
  return (
    <FeatureGate featureKey="kitchen_display" featureName="Kitchen Display" description="Live kitchen order board with Kanban-style columns, real-time updates, and inventory impact previews.">
      <KitchenDashboardContent />
    </FeatureGate>
  );
}

function KitchenDashboardContent() {
  const { restaurant } = useRestaurantContext();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [brandFilter, setBrandFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("active");
  const [timeFilter, setTimeFilter] = useState<string>("daily");
  // KD-2: Dark mode — sync with admin-wide dark mode (from AdminShell)
  const [forceDark, setForceDark] = useState(() => {
    return localStorage.getItem('admin-theme') === 'dark';
  });
  // KD-1: Full-screen mode
  const [fullScreen, setFullScreen] = useState(false);
  // KD-14: Idle screen detection
  const [isIdle, setIsIdle] = useState(false);

  // KD-14: Idle timer — overlay after 5 min of no interaction
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const reset = () => { setIsIdle(false); timer = setTimeout(() => setIsIdle(true), 5 * 60_000); };
    reset();
    const events = ["mousedown", "mousemove", "keydown", "touchstart", "scroll"];
    events.forEach(e => window.addEventListener(e, reset, { passive: true }));
    return () => { clearTimeout(timer); events.forEach(e => window.removeEventListener(e, reset)); };
  }, []);

  // KD-2: Apply/remove dark class — syncs both admin-wide and kitchen-local toggle
  useEffect(() => {
    const root = document.documentElement;
    if (forceDark) {
      root.classList.add("dark");
      localStorage.setItem("admin-theme", "dark");
    } else {
      root.classList.remove("dark");
      localStorage.setItem("admin-theme", "light");
    }
  }, [forceDark]);

  // Cloud kitchen brands
  const brandsQuery = useQuery({
    queryKey: ["cloud-kitchen-brands", restaurant?.id],
    enabled: !!restaurant?.id,
    retry: false,
    throwOnError: false,
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from("restaurants")
          .select("id, name, brand_color, slug")
          .eq("parent_kitchen_id", restaurant!.id);
        if (error) return [];
        return data ?? [];
      } catch {
        return [];
      }
    },
  });

  const allRestaurantIds = [
    restaurant?.id,
    ...(brandsQuery.data?.map((b) => b.id) ?? [])
  ].filter(Boolean) as string[];

  const ordersQuery = useQuery({
    queryKey: ["kitchen-orders", restaurant?.id, brandFilter, statusFilter, timeFilter],
    enabled: !!restaurant?.id && allRestaurantIds.length > 0,
    refetchInterval: 30_000, // Let realtime do the heavy lifting
    queryFn: async () => {
      const ids = brandFilter === "all" ? allRestaurantIds : [brandFilter];
      if (ids.length === 0) return [];

      const now = new Date();
      let timeStart: Date;
      let timeEnd: Date | null = null;
      if (timeFilter === "yesterday") {
        const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
        timeStart = yesterday;
        timeEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      } else if (timeFilter === "weekly") {
        timeStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      } else if (timeFilter === "monthly") {
        timeStart = new Date(now.getFullYear(), now.getMonth(), 1);
      } else {
        timeStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      }

      let q = supabase
        .from("orders")
        .select(`
          id, status, table_label, placed_at, total_cents, currency_code, restaurant_id, order_type, delivery_address, customer_name, notes,
          restaurants(name, brand_color),
          order_items(name_snapshot, quantity, notes, menu_items(food_type))
        `)
        .in("restaurant_id", ids)
        .gte("placed_at", timeStart.toISOString())
        .order("placed_at", { ascending: false })
        .limit(200);

      if (timeEnd) {
        q = q.lt("placed_at", timeEnd.toISOString());
      }

      if (statusFilter === "active") {
        q = q.in("status", ["pending", "accepted", "in_progress", "ready"]);
      } else if (statusFilter !== "all") {
        q = q.eq("status", statusFilter);
      }

      const { data, error } = await q;
      if (error) throw error;

      // Assign daily token numbers
      const items = data ?? [];
      const sorted = [...items].sort((a, b) => new Date(a.placed_at).getTime() - new Date(b.placed_at).getTime());
      const dailyCounters = new Map<string, number>();
      sorted.forEach((o: any) => {
        if (o.status !== 'cancelled' && o.status !== 'pending') {
          const dateKey = new Date(o.placed_at).toISOString().slice(0, 10);
          const current = (dailyCounters.get(dateKey) ?? 0) + 1;
          dailyCounters.set(dateKey, current);
          o.dailyToken = current;
        } else {
          o.dailyToken = null;
        }
      });
      return items;
    },
  });

  // Realtime subscription — also invalidates admin orders for cross-page sync
  // KD-12: Track pending count for audio alert
  const prevPendingCountRef = useRef(0);
  useEffect(() => {
    if (!restaurant?.id) return;
    const channel = supabase
      .channel(`kitchen:${restaurant.id}`)
      .on("postgres_changes", {
        event: "INSERT", schema: "public", table: "orders",
        filter: `restaurant_id=eq.${restaurant.id}`,
      }, () => {
        qc.invalidateQueries({ queryKey: ["kitchen-orders"] });
        qc.invalidateQueries({ queryKey: ["admin", "orders"] });
        // KD-12: Play audio alert for new orders
        try {
          const ctx = new AudioContext();
          const osc = ctx.createOscillator();
          osc.type = "sine"; osc.frequency.value = 880;
          osc.connect(ctx.destination);
          osc.start(); osc.stop(ctx.currentTime + 0.15);
          setTimeout(() => { osc.disconnect(); ctx.close(); }, 300);
        } catch { /* Audio not available */ }
      })
      .on("postgres_changes", {
        event: "UPDATE", schema: "public", table: "orders",
        filter: `restaurant_id=eq.${restaurant.id}`,
      }, () => {
        qc.invalidateQueries({ queryKey: ["kitchen-orders"] });
        qc.invalidateQueries({ queryKey: ["admin", "orders"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [restaurant?.id, qc]);

  // KD-3: Configurable SLA threshold (from restaurant settings, default 20 min)
  const slaMinutes = useMemo(() => {
    const s = (restaurant?.settings as any) ?? {};
    return Number(s.sla_minutes ?? 20);
  }, [restaurant?.settings]);

  // KD-13: SLA breach detection
  const slaAlertedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const orders = ordersQuery.data ?? [];
    orders.forEach((o: any) => {
      if (!["pending", "accepted"].includes(o.status)) return;
      const minutesAgo = Math.floor((Date.now() - new Date(o.placed_at).getTime()) / 60_000);
      if (minutesAgo >= slaMinutes && !slaAlertedRef.current.has(o.id)) {
        slaAlertedRef.current.add(o.id);
        toast({
          title: "⏰ SLA Breach",
          description: `Order ${(o as any).dailyToken ? `Token #${(o as any).dailyToken}` : `#${shortId(o.id)}`}${o.table_label ? ` (${o.table_label})` : ''} has been waiting ${minutesAgo} minutes!`,
          variant: "destructive",
        });
      }
    });
  }, [ordersQuery.data, toast, slaMinutes]);

  const orders = ordersQuery.data ?? [];
  const brands = brandsQuery.data ?? [];
  const currency = restaurant?.currency_code || "INR";

  const brandMap: Record<string, { name: string; brand_color: string }> = {};
  for (const b of brands) {
    brandMap[(b as any).id] = { name: (b as any).name, brand_color: (b as any).brand_color || "#6366f1" };
  }

  // 4 active columns: New, Accepted, Cooking, Ready (matches Orders page)
  const activeStatuses = ["pending", "accepted", "in_progress", "ready"];
  const counts = activeStatuses.map(s => ({
    status: s,
    count: orders.filter(o => o.status === s).length,
    // KD-4: Item count per column
    itemCount: orders.filter(o => o.status === s).reduce((sum, o: any) =>
      sum + ((o.order_items ?? []) as any[]).reduce((s2: number, i: any) => s2 + (i.quantity || 0), 0), 0),
  }));

  // KD-16: Hourly throughput chart data
  const [showChart, setShowChart] = useState(false);
  const throughputData = useMemo(() => {
    const completed = orders.filter(o => o.status === "completed");
    const buckets: Record<string, number> = {};
    for (let h = 0; h < 24; h++) buckets[`${h.toString().padStart(2, '0')}:00`] = 0;
    for (const o of completed) {
      const hour = new Date(o.placed_at).getHours();
      const key = `${hour.toString().padStart(2, '0')}:00`;
      buckets[key] = (buckets[key] ?? 0) + 1;
    }
    // Only return hours that have at least one surrounding hour with data, to reduce noise
    return Object.entries(buckets)
      .map(([hour, count]) => ({ hour, count }))
      .filter((_, i, arr) => {
        // Show hours 8-23 by default to cover restaurant hours
        const h = parseInt(arr[i].hour);
        return h >= 8 || arr[i].count > 0;
      });
  }, [orders]);

  return (
    <div className={cn("flex flex-col gap-4 w-full", fullScreen && "fixed inset-0 z-50 bg-background p-4 overflow-y-auto")}>
      <section className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <ChefHat className="h-6 w-6 text-orange-500" /> Kitchen Dashboard
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {brands.length > 0
              ? `Unified view across ${brands.length + 1} brands`
              : "Live order board for your kitchen"}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {brands.length > 0 && (
            <Select value={brandFilter} onValueChange={setBrandFilter}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="All Brands" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Brands</SelectItem>
                  {brands.map((b: any) => (
                  <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active Orders</SelectItem>
              <SelectItem value="all">All Orders</SelectItem>
              {Object.entries(STATUS_LABELS).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={timeFilter} onValueChange={setTimeFilter}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="daily">Today</SelectItem>
              <SelectItem value="yesterday">Yesterday</SelectItem>
              <SelectItem value="weekly">This Week</SelectItem>
              <SelectItem value="monthly">This Month</SelectItem>
            </SelectContent>
          </Select>
          {/* KD-2: Dark mode toggle */}
          <Button variant={forceDark ? "default" : "outline"} size="sm" onClick={() => setForceDark(!forceDark)} title="Toggle dark mode">
            {forceDark ? "🌙" : "☀️"}
          </Button>
          {/* KD-1: Full-screen toggle */}
          <Button variant={fullScreen ? "default" : "outline"} size="sm" onClick={() => setFullScreen(!fullScreen)} title="Full screen KDS">
            {fullScreen ? "⏏️" : "📺"}
          </Button>
          <Button variant="outline" size="sm" onClick={() => qc.invalidateQueries({ queryKey: ["kitchen-orders"] })}>
            <RefreshCw className={`h-4 w-4 ${ordersQuery.isFetching ? 'animate-spin' : ''}`} />
          </Button>
          {/* KD-16: Throughput chart toggle */}
          <Button variant={showChart ? "default" : "outline"} size="sm" onClick={() => setShowChart(!showChart)} className="gap-1.5">
            <BarChart3 className="h-4 w-4" /> {showChart ? 'Hide' : 'Stats'}
          </Button>
        </div>
      </section>

      {/* KD-15: Average prep time */}
      {(() => {
        const completed = orders.filter((o: any) => o.status === "completed" && o.placed_at);
        const avgMins = completed.length > 0
          ? Math.round(completed.reduce((sum: number, o: any) => {
              const placed = new Date(o.placed_at).getTime();
              // If completed_at is not fetched, estimate from now
              return sum + (Date.now() - placed) / 60_000;
            }, 0) / completed.length)
          : 0;
        return avgMins > 0 ? (
          <div className="text-sm text-muted-foreground">
            ⏱️ Avg prep time today: <span className="font-semibold text-foreground">{avgMins}m</span>
          </div>
        ) : null;
      })()}

      {/* KD-16: Throughput chart */}
      {showChart && (
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <BarChart3 className="h-4 w-4" /> Hourly Throughput (Completed Orders)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-40">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={throughputData}>
                  <XAxis dataKey="hour" tick={{ fontSize: 10 }} interval={1} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 10 }} width={24} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#f97316" radius={[3, 3, 0, 0]} name="Orders" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* KD-4: Status summary pills with item counts */}
      <div className="flex gap-3 flex-wrap">
        {counts.filter(c => c.count > 0 || ["pending", "accepted", "in_progress", "ready"].includes(c.status)).map(({ status, count, itemCount }) => (
          <div key={status} className="flex items-center gap-1.5 bg-muted rounded-full px-3 py-1 text-sm">
            <span className="font-medium">{STATUS_LABELS[status]}</span>
            <Badge className="h-5 px-1.5 text-xs">{count}</Badge>
            {itemCount > 0 && (
              <span className="text-xs text-muted-foreground">({itemCount} items)</span>
            )}
          </div>
        ))}
      </div>

      {/* Order cards by status column (Kanban) */}
      {statusFilter === "active" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {activeStatuses.map(status => (
            <div key={status} className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm">{STATUS_LABELS[status]}</span>
                <Badge variant="outline">{orders.filter(o => o.status === status).length}</Badge>
              </div>
              {orders
                .filter(o => o.status === status)
                .map((order: any) => (
                  <OrderKOTCard key={order.id} order={order} brandMap={brandMap} currency={currency} qc={qc} />
                ))}
              {orders.filter(o => o.status === status).length === 0 && (
                <div className="border border-dashed rounded-lg p-4 text-center text-sm text-muted-foreground">
                  No orders
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {orders.map((order: any) => (
            <OrderKOTCard key={order.id} order={order} brandMap={brandMap} currency={currency} qc={qc} />
          ))}
          {orders.length === 0 && (
            <div className="col-span-full text-center py-12 text-muted-foreground">
              No orders found
            </div>
          )}
        </div>
      )}

      {/* KD-14: Idle screen overlay */}
      {isIdle && (
        <div
          className="fixed inset-0 z-[60] bg-black/80 flex flex-col items-center justify-center cursor-pointer"
          onClick={() => setIsIdle(false)}
        >
          <ChefHat className="h-20 w-20 text-orange-400 animate-bounce mb-4" />
          <p className="text-2xl font-bold text-white">Kitchen Display Paused</p>
          <p className="text-lg text-white/60 mt-2">Tap anywhere to wake up</p>
        </div>
      )}
    </div>
  );
}

function OrderKOTCard({ order, brandMap, currency, qc }: {
  order: any;
  brandMap: Record<string, { name: string; brand_color: string }>;
  currency: string;
  qc: any;
}) {
  const { toast } = useToast();
  const brand = brandMap[order.restaurant_id];
  const minutesAgo = Math.floor((Date.now() - new Date(order.placed_at).getTime()) / 60_000);
  const isUrgent = minutesAgo > 15 && ["pending", "accepted"].includes(order.status);

  // OR-3 equivalent: Time color for kitchen
  const timeColor = minutesAgo >= 25 ? "text-red-500 font-bold"
    : minutesAgo >= 15 ? "text-amber-500 font-semibold"
    : "text-muted-foreground";

  // KD-6: Order type border
  const typeBorder = ORDER_TYPE_BORDER[order.order_type] ?? "";

  // Ingredient impact preview for pending orders
  const ingredientPreviewQuery = useQuery({
    queryKey: ["ingredient-preview", order.id],
    enabled: order.status === "pending",
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_ingredient_preview")
        .select("ingredient_name, storage_unit, current_stock, total_needed, stock_after, low_stock_threshold")
        .eq("order_id", order.id);
      if (error) return [];
      return data || [];
    },
  });

  const ingredientWarnings = (ingredientPreviewQuery.data || []).filter(
    (i: any) => i.stock_after <= 0
  );
  const ingredientLow = (ingredientPreviewQuery.data || []).filter(
    (i: any) => i.stock_after > 0 && i.stock_after <= i.low_stock_threshold
  );

  const statusMutation = async (newStatus: string) => {
    await supabase.from("orders").update({
      status: newStatus,
      completed_at: newStatus === "completed" ? new Date().toISOString() : null,
    }).eq("id", order.id);

    // Deduct inventory when order moves to 'accepted'
    if (newStatus === "accepted") {
      try {
        const { data, error } = await supabase.rpc("deduct_stock_for_accepted_order", {
          p_order_id: order.id,
          p_restaurant_id: order.restaurant_id,
        }) as any;
        if (!error && data) {
          const lowAlerts = data?.low_stock_alerts || [];
          const disabled = data?.disabled_items || [];
          if (disabled.length > 0) {
            toast({ title: "⚠️ Items auto-disabled", description: disabled.join(", "), variant: "destructive" });
          } else if (lowAlerts.length > 0) {
            toast({ title: "📦 Low Stock Alert", description: lowAlerts.join(", ") });
          }
          qc.invalidateQueries({ queryKey: ["ingredients"] });
        }
      } catch {
        // Non-blocking
      }
    }

    qc.invalidateQueries({ queryKey: ["kitchen-orders"] });
    qc.invalidateQueries({ queryKey: ["admin", "orders"] }); // Cross-page sync
  };

  const nextStatus: Record<string, string> = {
    pending: "accepted",
    accepted: "in_progress",
    in_progress: "ready",
    ready: "completed",
  };

  return (
    <div className={cn(
      `border-2 rounded-xl p-3 space-y-2 transition-all`,
      STATUS_COLORS[order.status] || "",
      isUrgent && "ring-2 ring-red-400 animate-pulse",
      typeBorder,
    )}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-sm">
              {(order as any).dailyToken ? `Token #${(order as any).dailyToken}` : order.status === 'pending' ? 'NEW' : `#${shortId(order.id)}`}
            </span>
            {brand && (
              <span
                className="text-xs px-1.5 py-0.5 rounded font-medium text-white"
                style={{ backgroundColor: brand.brand_color }}
              >
                {(order.restaurants as any)?.name || brand.name}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1 text-xs mt-0.5">
            <Clock className="h-3 w-3" />
            <span className={timeColor}>{minutesAgo}m ago</span>
            {order.table_label && (
              <span className="ml-1 text-muted-foreground">· {order.table_label}</span>
            )}
          </div>
          {/* Customer name */}
          {order.customer_name && (
            <div className="text-xs font-medium mt-0.5">👤 {order.customer_name}</div>
          )}
          {/* Order Type */}
          <div className="flex gap-1 mt-0.5">
            {order.order_type === 'dine_in' && <Badge variant="outline" className="text-[9px] h-4 px-1 gap-0.5"><Store className="h-2.5 w-2.5" /> Dine-In</Badge>}
            {order.order_type === 'pickup' && <Badge variant="outline" className="text-[9px] h-4 px-1 gap-0.5"><ShoppingBag className="h-2.5 w-2.5" /> Pickup</Badge>}
            {order.order_type === 'delivery' && <Badge variant="outline" className="text-[9px] h-4 px-1 gap-0.5"><Truck className="h-2.5 w-2.5" /> Delivery</Badge>}
          </div>
        </div>
        <Badge variant="outline" className="text-xs shrink-0">
          {STATUS_LABELS[order.status]}
        </Badge>
      </div>

      {/* KD-11: Items with special instructions highlighted */}
      <div className="space-y-1">
        {(order.order_items ?? []).map((item: any, i: number) => (
          <div key={i}>
            <div className="flex gap-2 text-sm items-center">
              <span className="font-bold w-5 text-right">{item.quantity}×</span>
              {/* KD-5: Food type dot */}
              {item.menu_items?.food_type === 'veg' && <span className="inline-block h-2.5 w-2.5 rounded-sm border-2 border-green-600 bg-green-500 shrink-0" />}
              {item.menu_items?.food_type === 'non_veg' && <span className="inline-block h-2.5 w-2.5 rounded-sm border-2 border-red-600 bg-red-500 shrink-0" />}
              {item.menu_items?.food_type === 'egg' && <span className="inline-block h-2.5 w-2.5 rounded-sm border-2 border-yellow-500 bg-yellow-400 shrink-0" />}
              <span className="text-foreground">{item.name_snapshot}</span>
            </div>
            {/* KD-11: Special instructions highlight */}
            {item.notes && (
              <div className="ml-7 flex items-start gap-1 text-[10px] bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded px-1.5 py-0.5 mt-0.5">
                <StickyNote className="h-2.5 w-2.5 text-amber-600 shrink-0 mt-0.5" />
                <span className="text-amber-800 dark:text-amber-300 font-medium">{item.notes}</span>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Order-level notes */}
      {order.notes && (
        <div className="flex items-start gap-1.5 text-[10px] bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded px-2 py-1">
          <StickyNote className="h-3 w-3 text-amber-600 shrink-0 mt-0.5" />
          <span className="text-amber-800 dark:text-amber-300 font-medium">{order.notes}</span>
        </div>
      )}

      {/* Inventory impact preview */}
      {order.status === "pending" && (ingredientPreviewQuery.data || []).length > 0 && (
        <div className="space-y-1">
          {ingredientWarnings.length > 0 && (
            <div className="text-[10px] bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded px-2 py-1 flex items-start gap-1">
              <AlertTriangle className="h-3 w-3 text-red-500 shrink-0 mt-0.5" />
              <span className="text-red-700 dark:text-red-400">
                <strong>Will run out:</strong> {ingredientWarnings.map((i: any) => `${i.ingredient_name}`).join(", ")}
              </span>
            </div>
          )}
          {ingredientLow.length > 0 && (
            <div className="text-[10px] bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded px-2 py-1 flex items-start gap-1">
              <Package className="h-3 w-3 text-amber-500 shrink-0 mt-0.5" />
              <span className="text-amber-700 dark:text-amber-400">
                <strong>Will go low:</strong> {ingredientLow.map((i: any) => `${i.ingredient_name} (${Number(i.stock_after).toFixed(1)} ${i.storage_unit} left)`).join(", ")}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Delivery address */}
      {order.order_type === 'delivery' && order.delivery_address && (
        <div className="text-[10px] text-muted-foreground bg-muted/50 rounded px-2 py-0.5">
          📍 {order.delivery_address}
        </div>
      )}

      <div className="flex items-center justify-between pt-1 border-t border-border/50">
        <span className="text-sm font-medium">{formatMoney(order.total_cents, currency)}</span>
        <div className="flex gap-1.5">
          {/* KD-9: Recall completed order back to ready */}
          {order.status === "completed" && (
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => statusMutation("ready")}>
              ↩ Recall
            </Button>
          )}
          {nextStatus[order.status] && (
            <Button size="sm" className="h-7 text-xs" onClick={() => statusMutation(nextStatus[order.status])}>
              Mark {STATUS_LABELS[nextStatus[order.status]]}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
