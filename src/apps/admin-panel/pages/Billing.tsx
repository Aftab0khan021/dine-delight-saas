import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { startOfDay, addDays } from "date-fns";
import {
  ArrowUpRight,
  ClipboardList,
  Plus,
  QrCode,
  ReceiptText,
  Sparkles,
} from "lucide-react";
import { Link } from "react-router-dom";

import { supabase } from "@/integrations/supabase/client";
import { useRestaurantContext } from "../state/restaurant-context";
import { useFeatureLimit } from "../hooks/useFeatureAccess";

// UI Components
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

// --- Helpers ---
function formatMoney(cents: number, currency = "USD") {
  const amount = (cents ?? 0) / 100;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0
  }).format(amount);
}

function shortId(id: string) {
  return id ? `#${id.slice(0, 4)}` : "—";
}

function formatTime(dateStr: string) {
  return new Date(dateStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

const statusVariant = (status: string) => {
  switch (status) {
    case "pending": return "default";
    case "in_progress": return "secondary";
    case "ready": return "outline";
    default: return "secondary";
  }
};

export default function AdminDashboard() {
  const { restaurant } = useRestaurantContext();

  // Fetch feature limits
  const { limit: staffLimit, isUnlimited: staffUnlimited } = useFeatureLimit(restaurant?.id, 'staff_limit');
  const { limit: menuItemsLimit, isUnlimited: menuUnlimited } = useFeatureLimit(restaurant?.id, 'menu_items_limit');

  // --- 1. Data Fetching (Real Data) ---
  const { startISO, endISO } = useMemo(() => {
    const start = startOfDay(new Date());
    const end = addDays(start, 1);
    return { startISO: start.toISOString(), endISO: end.toISOString() };
  }, []);

  // KPI Data: Today's Orders
  const todayOrdersQuery = useQuery({
    queryKey: ["admin", "dashboard", restaurant?.id, "todayOrders"],
    enabled: !!restaurant?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id, placed_at, completed_at, total_cents, currency_code")
        .eq("restaurant_id", restaurant!.id)
        .gte("placed_at", startISO)
        .lt("placed_at", endISO);
      if (error) throw error;
      return data;
    },
  });

  // List Data: Latest 5 Orders
  const latestOrdersQuery = useQuery({
    queryKey: ["admin", "dashboard", restaurant?.id, "latestOrders"],
    enabled: !!restaurant?.id,
    queryFn: async () => {
      // Added table_label to the selection
      const { data, error } = await supabase
        .from("orders")
        .select("id, status, placed_at, total_cents, table_label, currency_code")
        .eq("restaurant_id", restaurant!.id)
        .order("placed_at", { ascending: false })
        .limit(5);
      if (error) throw error;
      return data;
    },
  });

  // KPI Data: Top Selling Item (All Time)
  const topSellingQuery = useQuery({
    queryKey: ["admin", "dashboard", restaurant?.id, "topSellingItem"],
    enabled: !!restaurant?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_items")
        .select("name_snapshot, quantity")
        .eq("restaurant_id", restaurant!.id)
        .limit(1000); // Fetch sample to calculate client-side for now
      if (error) throw error;
      return data;
    },
  });

  // Checklist Data
  const setupQuery = useQuery({
    queryKey: ["admin", "dashboard", restaurant?.id, "setupChecklist"],
    enabled: !!restaurant?.id,
    queryFn: async () => {
      const [{ data: restaurantRow }, menuCount, qrCount] = await Promise.all([
        supabase.from("restaurants").select("logo_url").eq("id", restaurant!.id).maybeSingle(),
        supabase.from("menu_items").select("id", { count: "exact", head: true }).eq("restaurant_id", restaurant!.id),
        supabase.from("qr_codes").select("id", { count: "exact", head: true }).eq("restaurant_id", restaurant!.id),
      ]);
      return {
        logoUrl: restaurantRow?.logo_url ?? null,
        menuItemsCount: menuCount.count ?? 0,
        qrCodesCount: qrCount.count ?? 0,
      };
    },
  });

  // --- 2. Calculations ---
  const kpis = useMemo(() => {
    const todayOrders = todayOrdersQuery.data ?? [];
    const currency = todayOrders[0]?.currency_code ?? "USD";

    // Revenue
    const revenue = todayOrders.reduce((sum, o) => sum + (o.total_cents ?? 0), 0);

    // Avg Prep Time
    const completed = todayOrders.filter((o) => o.completed_at).map((o) =>
      new Date(o.completed_at!).getTime() - new Date(o.placed_at).getTime()
    );
    const avgPrepMs = completed.length ? completed.reduce((a, b) => a + b, 0) / completed.length : 0;
    const avgPrepMins = Math.round(avgPrepMs / 1000 / 60);

    // Top Item Calculation
    const items = topSellingQuery.data ?? [];
    const counts = new Map<string, number>();
    items.forEach(i => {
      const k = i.name_snapshot;
      counts.set(k, (counts.get(k) || 0) + (i.quantity || 1));
    });

    let topItem = { name: "No sales yet", qty: 0 };
    counts.forEach((qty, name) => {
      if (qty > topItem.qty) topItem = { name, qty };
    });

    return [
      {
        label: "Today’s Orders",
        value: todayOrders.length.toString(),
        delta: "Since midnight",
        tone: "neutral",
      },
      {
        label: "Revenue",
        value: formatMoney(revenue, currency),
        delta: "Gross total",
        tone: "good",
      },
      {
        label: "Avg Prep Time",
        value: avgPrepMins > 0 ? `${avgPrepMins}m` : "—",
        delta: "Completed orders",
        tone: "neutral",
      },
      {
        label: "Top Selling Item",
        value: topItem.qty > 0 ? topItem.name : "—",
        delta: topItem.qty > 0 ? `${topItem.qty} sold` : "All time",
        tone: "neutral",
      },
    ];
  }, [todayOrdersQuery.data, topSellingQuery.data]);

  const setupChecklist = [
    {
      label: "Branding",
      detail: "Logo uploaded",
      status: setupQuery.data?.logoUrl ? "Done" : "Pending",
      isDone: !!setupQuery.data?.logoUrl
    },
    {
      label: "First Menu Item",
      detail: "At least 1 item",
      status: (setupQuery.data?.menuItemsCount ?? 0) > 0 ? "Done" : "Pending",
      isDone: (setupQuery.data?.menuItemsCount ?? 0) > 0
    },
    {
      label: "QR Published",
      detail: "Codes generated",
      status: (setupQuery.data?.qrCodesCount ?? 0) > 0 ? "Done" : "Pending",
      isDone: (setupQuery.data?.qrCodesCount ?? 0) > 0
    },
  ];

  // --- 3. Render ---
  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            A clear snapshot of today—built for busy service.
          </p>
        </div>

        {/* Quick actions (top) */}
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" asChild>
            <Link to="/admin/orders">
              View orders <ArrowUpRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
          <Button asChild>
            <Link to="/admin/menu">
              Add menu item <Plus className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </section>

      {/* KPI cards */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((k) => (
          <Card key={k.label} className="shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {k.label}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex items-end justify-between gap-3">
              <div className="min-w-0">
                <div className="text-2xl font-semibold tracking-tight truncate" title={k.value}>
                  {k.value}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">{k.delta}</div>
              </div>
            </CardContent>
          </Card>
        ))}
      </section>

      {/* Feature Limits Card */}
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Plan Features & Limits</CardTitle>
          <CardDescription>Your current plan's feature limits and usage</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="font-medium">Staff Members</span>
              <span className="text-muted-foreground">
                {staffUnlimited ? 'Unlimited' : `Limit: ${staffLimit}`}
              </span>
            </div>
            {!staffUnlimited && staffLimit !== undefined && (
              <Progress value={0} className="h-2" />
            )}
          </div>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="font-medium">Menu Items</span>
              <span className="text-muted-foreground">
                {menuUnlimited ? 'Unlimited' : `Limit: ${menuItemsLimit}`}
              </span>
            </div>
            {!menuUnlimited && menuItemsLimit !== undefined && (
              <Progress value={0} className="h-2" />
            )}
          </div>
          <Button variant="outline" className="w-full mt-4" asChild>
            <Link to="/admin/staff">View Staff Usage</Link>
          </Button>
        </CardContent>
      </Card>

      {/* Body grid */}
      <section className="grid gap-3 lg:grid-cols-3">
        {/* Live Orders */}
        <Card className="shadow-sm lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between gap-4">
            <div>
              <CardTitle className="text-base">Live orders</CardTitle>
              <div className="mt-1 text-xs text-muted-foreground">
                Latest 5 orders.
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="relative inline-flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/40 motion-reduce:hidden" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
              </span>
              <span className="text-xs text-muted-foreground">Live</span>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {(latestOrdersQuery.data ?? []).map((o) => (
                <div
                  key={o.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background p-3"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">#{shortId(o.id)}</span>
                      <span className="text-xs text-muted-foreground">
                        {o.table_label ? o.table_label : "Takeaway"}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {formatTime(o.placed_at)} • {formatMoney(o.total_cents, o.currency_code)}
                    </div>
                  </div>
                  <Badge variant={statusVariant(o.status)} className="shrink-0 capitalize">
                    {o.status.replace("_", " ")}
                  </Badge>
                </div>
              ))}
              {(latestOrdersQuery.data?.length === 0) && (
                <div className="text-center py-8 text-sm text-muted-foreground border-dashed border rounded-xl">
                  No orders today yet.
                </div>
              )}
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" asChild>
                <Link to="/admin/orders">
                  View full board <ReceiptText className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button variant="secondary" size="sm" asChild>
                <Link to="/admin/qr">
                  Print QR <QrCode className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Setup + quick actions */}
        <div className="space-y-3">
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">Setup checklist</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-xl border border-border bg-background p-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  <div className="text-sm font-medium">Ready in 3 steps</div>
                </div>
                <ul className="mt-3 space-y-2 text-sm">
                  {setupChecklist.map((i) => (
                    <li key={i.label} className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-medium">{i.label}</div>
                        <div className="text-xs text-muted-foreground">{i.detail}</div>
                      </div>
                      <Badge variant={i.isDone ? "default" : "secondary"} className="shrink-0">
                        {i.status}
                      </Badge>
                    </li>
                  ))}
                </ul>
              </div>
              <Button className="w-full" variant="secondary" asChild>
                <Link to="/admin/branding">
                  Open setup <ClipboardList className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">Quick actions</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2">
              <Button className="w-full justify-between" variant="secondary" asChild>
                <Link to="/admin/menu">
                  <span className="flex items-center gap-2">
                    <Plus className="h-4 w-4" />
                    Add Menu Item
                  </span>
                  <ArrowUpRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button className="w-full justify-between" variant="secondary" asChild>
                <Link to="/admin/qr">
                  <span className="flex items-center gap-2">
                    <QrCode className="h-4 w-4" />
                    Print QR
                  </span>
                  <ArrowUpRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button className="w-full justify-between" variant="secondary" asChild>
                <Link to="/admin/orders">
                  <span className="flex items-center gap-2">
                    <ReceiptText className="h-4 w-4" />
                    View Orders
                  </span>
                  <ArrowUpRight className="h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}