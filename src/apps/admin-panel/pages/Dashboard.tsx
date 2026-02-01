import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { addDays, startOfDay, subHours } from "date-fns";
import { ArrowUpRight, Plus, QrCode, ReceiptText, Sparkles, Lock, TrendingUp } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useRestaurantContext } from "../state/restaurant-context";
import { cn } from "@/lib/utils";
import { useFeatureAccess } from "../hooks/useFeatureAccess";

// UI Components
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Link } from "react-router-dom";

// --- Visual Component: Sparkline (From Repo A) ---
function Sparkline({ values, className }: { values: number[]; className?: string }) {
  const w = 96;
  const h = 32;
  const pad = 2;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(1, max - min);

  const points = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * (w - pad * 2) + pad;
      const y = h - pad - ((v - min) / range) * (h - pad * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  const last = values[values.length - 1];
  const first = values[0];
  const up = last >= first;

  return (
    <div className={cn("w-24", className)} aria-hidden>
      <svg viewBox={`0 0 ${w} ${h}`} className="h-8 w-full">
        <polyline
          points={points}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className={cn(up ? "text-primary" : "text-muted-foreground")}
        />
      </svg>
    </div>
  );
}

// --- Helpers ---
function formatMoney(cents: number, currency = "USD") {
  const amount = (cents ?? 0) / 100;
  return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(amount);
}

function shortId(id: string) {
  return id?.slice(0, 4) ?? "—";
}

const statusVariant = (status: string) => {
  switch (status) {
    case "pending": return "default"; // New
    case "in_progress": return "secondary"; // Preparing
    case "ready": return "outline";
    default: return "secondary";
  }
};

export default function AdminDashboard() {
  const { restaurant } = useRestaurantContext();

  // Check if analytics feature is enabled
  const { isFeatureEnabled } = useFeatureAccess(restaurant?.id);
  const analyticsEnabled = isFeatureEnabled('analytics');

  // --- 1. Data Fetching (From Repo B) ---
  const { startISO, endISO } = useMemo(() => {
    const start = startOfDay(new Date());
    const end = addDays(start, 1);
    return { startISO: start.toISOString(), endISO: end.toISOString() };
  }, []);

  // Fetch Today's Orders for KPIs
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

  // Fetch Latest 5 Orders from Last 24 Hours for the List
  const last24hStart = useMemo(() => subHours(new Date(), 24).toISOString(), []);

  const latestOrdersQuery = useQuery({
    queryKey: ["admin", "dashboard", restaurant?.id, "latestOrders"],
    enabled: !!restaurant?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id, status, placed_at, total_cents, table_label")
        .eq("restaurant_id", restaurant!.id)
        .gte("placed_at", last24hStart)
        .order("placed_at", { ascending: false })
        .limit(5);
      if (error) throw error;
      return data;
    },
  });

  // Fetch Setup Status (Menu Items, QR Codes, Branding)
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

  // --- 2. KPI Calculation ---
  const kpis = useMemo(() => {
    const todayOrders = todayOrdersQuery.data ?? [];
    const count = todayOrders.length;
    const revenue = todayOrders.reduce((sum, o) => sum + (o.total_cents ?? 0), 0);
    const currency = todayOrders[0]?.currency_code ?? "USD";

    // Calculate Avg Prep Time
    const completed = todayOrders.filter((o) => o.completed_at).map((o) =>
      new Date(o.completed_at!).getTime() - new Date(o.placed_at).getTime()
    );
    const avgPrep = completed.length ? Math.round(completed.reduce((a, b) => a + b, 0) / completed.length / 1000 / 60) : 0;

    return [
      {
        label: "Today’s Orders",
        value: count.toString(),
        delta: "Since midnight",
        // Mock trend for visual flair (since we don't have historical data easily available)
        trend: [count * 0.5, count * 0.2, count * 0.8, count],
      },
      {
        label: "Revenue",
        value: formatMoney(revenue, currency),
        delta: "Gross total",
        trend: [revenue * 0.4, revenue * 0.6, revenue * 0.5, revenue],
      },
      {
        label: "Avg Prep Time",
        value: avgPrep > 0 ? `${avgPrep}m` : "—",
        delta: "Completed orders",
        trend: [15, 12, 18, avgPrep || 15],
      },
      {
        label: "Active Tables",
        value: "—", // Placeholder as we don't track "Active Sessions" yet
        delta: "Currently seated",
        trend: [2, 4, 3, 5],
      }
    ];
  }, [todayOrdersQuery.data]);

  const setupChecklist = [
    { label: "Branding", detail: "Logo + cover", status: setupQuery.data?.logoUrl ? "Done" : "Pending" },
    { label: "First Menu Item", detail: "Create at least 1 item", status: (setupQuery.data?.menuItemsCount ?? 0) > 0 ? "Done" : "Pending" },
    { label: "QR Published", detail: "Generate & print", status: (setupQuery.data?.qrCodesCount ?? 0) > 0 ? "Done" : "Pending" },
  ];

  // --- 3. Render (Repo A Layout) ---
  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            A clear snapshot of today—built for busy service.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" asChild>
            <Link to="/admin/orders">View orders <ArrowUpRight className="ml-2 h-4 w-4" /></Link>
          </Button>
          <Button asChild>
            <Link to="/admin/menu">Add menu item <Plus className="ml-2 h-4 w-4" /></Link>
          </Button>
        </div>
      </section>

      {/* KPI Cards */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {analyticsEnabled ? (
          kpis.map((k) => (
            <Card key={k.label} className="shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">{k.label}</CardTitle>
              </CardHeader>
              <CardContent className="flex items-end justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-2xl font-semibold tracking-tight">{k.value}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{k.delta}</div>
                </div>
                <div className="flex items-end gap-3 pb-1">
                  <Sparkline values={k.trend} />
                </div>
              </CardContent>
            </Card>
          ))
        ) : (
          <Card className="shadow-sm sm:col-span-2 lg:col-span-4">
            <CardContent className="p-6">
              <Alert>
                <Lock className="h-4 w-4" />
                <AlertTitle>Analytics Feature Locked</AlertTitle>
                <AlertDescription>
                  Upgrade your plan to unlock detailed analytics, revenue tracking, and performance insights.
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        )}
      </section>

      {/* Main Content Grid */}
      <section className="grid gap-3 lg:grid-cols-3">

        {/* LEFT: Live Orders */}
        <Card className="shadow-sm lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between gap-4">
            <div>
              <CardTitle className="text-base">Live orders</CardTitle>
              <div className="mt-1 text-xs text-muted-foreground">Latest 5 orders.</div>
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
                <div key={o.id} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background p-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">#{shortId(o.id)}</span>
                      <span className="text-xs text-muted-foreground">{o.table_label || "No Table"}</span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(o.placed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                  <Badge variant={statusVariant(o.status)} className="shrink-0 capitalize">
                    {o.status.replace('_', ' ')}
                  </Badge>
                </div>
              ))}
              {(latestOrdersQuery.data?.length === 0) && (
                <div className="text-center py-8 text-sm text-muted-foreground border-dashed border rounded-xl">
                  No orders today yet.
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* RIGHT: Checklist & Quick Actions */}
        <div className="space-y-3">

          {/* Setup Checklist */}
          <Card className="shadow-sm">
            <CardHeader><CardTitle className="text-base">Setup checklist</CardTitle></CardHeader>
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
                      <Badge variant={i.status === "Done" ? "default" : "secondary"} className="shrink-0">{i.status}</Badge>
                    </li>
                  ))}
                </ul>
              </div>
            </CardContent>
          </Card>

          {/* Quick Actions */}
          <Card className="shadow-sm">
            <CardHeader><CardTitle className="text-base">Quick actions</CardTitle></CardHeader>
            <CardContent className="grid gap-2">
              <Button className="w-full justify-between" variant="secondary" asChild>
                <Link to="/admin/menu">
                  <span className="flex items-center gap-2"><Plus className="h-4 w-4" /> Add Item</span>
                  <ArrowUpRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button className="w-full justify-between" variant="secondary" asChild>
                <Link to="/admin/qr">
                  <span className="flex items-center gap-2"><QrCode className="h-4 w-4" /> Print QR</span>
                  <ArrowUpRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button className="w-full justify-between" variant="secondary" asChild>
                <Link to="/admin/orders">
                  <span className="flex items-center gap-2"><ReceiptText className="h-4 w-4" /> View Orders</span>
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