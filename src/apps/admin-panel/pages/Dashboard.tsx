import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { addDays, startOfDay, subHours, eachHourOfInterval, format } from "date-fns";
import { AreaChart, Area, XAxis, Tooltip, ResponsiveContainer } from "recharts";
import { Link } from "react-router-dom";
import {
  ArrowUpRight, Plus, QrCode, ReceiptText, Sparkles, Lock,
  TrendingUp, CheckCircle2, Circle, Palette, Users, ChefHat,
  CalendarDays, Package, Ticket, Star, MapPin, Shield, Settings, RefreshCw,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useRestaurantContext } from "../state/restaurant-context";
import { usePermissionContext } from "../state/permission-context";
import { useFeatureAccess } from "../hooks/useFeatureAccess";
import { formatMoney, shortId } from "@/lib/formatting";
import { RevenueDetail } from "../components/dashboard/RevenueDetail";
import { cn } from "@/lib/utils";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const statusVariant = (s: string) => {
  switch (s) {
    case "pending": return "default";
    case "in_progress": return "secondary";
    case "ready": return "outline";
    default: return "secondary";
  }
};

export default function AdminDashboard() {
  const { restaurant } = useRestaurantContext();
  const qc = useQueryClient();
  const { hasPermission, isAdmin } = usePermissionContext();
  const { isFeatureEnabled } = useFeatureAccess(restaurant?.id);
  const [showRevenue, setShowRevenue] = useState(false);

  const canViewOrders = isAdmin || hasPermission("view_orders" as any);
  const canViewMenu = isAdmin || hasPermission("view_menu" as any);
  const canViewQr = isAdmin || hasPermission("view_qr" as any);

  const todayKey = new Date().toDateString();
  const { startISO, endISO } = useMemo(() => {
    const s = startOfDay(new Date());
    return { startISO: s.toISOString(), endISO: addDays(s, 1).toISOString() };
  }, [todayKey]);

  const todayOrdersQ = useQuery({
    queryKey: ["dashboard", restaurant?.id, "today", todayKey],
    enabled: !!restaurant?.id && canViewOrders,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id, placed_at, completed_at, total_cents, currency_code")
        .eq("restaurant_id", restaurant!.id)
        .gte("placed_at", startISO).lt("placed_at", endISO);
      if (error) throw error;
      return data ?? [];
    },
  });

  const latestOrdersQ = useQuery({
    queryKey: ["dashboard", restaurant?.id, "latest"],
    enabled: !!restaurant?.id && canViewOrders,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id, status, placed_at, total_cents, table_label")
        .eq("restaurant_id", restaurant!.id)
        .gte("placed_at", subHours(new Date(), 24).toISOString())
        .order("placed_at", { ascending: false }).limit(5);
      if (error) throw error;
      return data ?? [];
    },
  });

  const setupQ = useQuery({
    queryKey: ["dashboard", restaurant?.id, "setup"],
    enabled: !!restaurant?.id,
    queryFn: async () => {
      const [{ data: r }, menu, qr, staff, { data: sub }] = await Promise.all([
        supabase.from("restaurants").select("logo_url, currency_code").eq("id", restaurant!.id).maybeSingle(),
        supabase.from("menu_items").select("id", { count: "exact", head: true }).eq("restaurant_id", restaurant!.id),
        supabase.from("qr_codes").select("id", { count: "exact", head: true }).eq("restaurant_id", restaurant!.id),
        supabase.from("user_roles").select("id", { count: "exact", head: true }).eq("restaurant_id", restaurant!.id).eq("role", "user"),
        supabase.from("subscriptions").select("id").eq("restaurant_id", restaurant!.id).eq("status", "active").maybeSingle(),
      ]);
      return {
        currency: r?.currency_code ?? "INR",
        hasLogo: !!r?.logo_url,
        menuCount: menu.count ?? 0,
        qrCount: qr.count ?? 0,
        staffCount: staff.count ?? 0,
        hasSubscription: !!sub,
      };
    },
  });

  const currency = setupQ.data?.currency ?? "INR";
  const todayOrders = todayOrdersQ.data ?? [];
  const orderCount = todayOrders.length;
  const revenue = todayOrders.reduce((s, o) => s + (o.total_cents ?? 0), 0);
  const completed = todayOrders.filter(o => o.completed_at);
  const avgPrep = completed.length
    ? Math.round(completed.reduce((a, o) => a + (new Date(o.completed_at!).getTime() - new Date(o.placed_at).getTime()), 0) / completed.length / 60000)
    : 0;

  // Mini chart data (hourly today)
  const miniChart = useMemo(() => {
    const now = new Date();
    const hours = eachHourOfInterval({ start: startOfDay(now), end: now });
    return hours.map(h => {
      const key = format(h, "yyyy-MM-dd-HH");
      const rev = todayOrders
        .filter(o => format(new Date(o.placed_at), "yyyy-MM-dd-HH") === key)
        .reduce((s, o) => s + (o.total_cents ?? 0), 0);
      return { name: format(h, "ha"), rev: rev / 100 };
    });
  }, [todayOrders]);

  // Unified checklist items
  const checklistItems = [
    { label: "Set up branding", detail: "Upload logo & cover", done: !!setupQ.data?.hasLogo, route: "/admin/branding", icon: Palette, perm: "manage_settings" },
    { label: "Add menu items", detail: "Create your first dish", done: (setupQ.data?.menuCount ?? 0) > 0, route: "/admin/menu", icon: Salad, perm: "view_menu" },
    { label: "Generate QR code", detail: "Print & place on tables", done: (setupQ.data?.qrCount ?? 0) > 0, route: "/admin/qr", icon: QrCode, perm: "view_qr" },
    ...(isAdmin ? [
      { label: "Invite staff", detail: "Add your team members", done: (setupQ.data?.staffCount ?? 0) > 0, route: "/admin/staff", icon: Users, perm: null },
      { label: "Activate subscription", detail: "Unlock premium features", done: !!setupQ.data?.hasSubscription, route: "/admin/billing", icon: Settings, perm: null },
    ] : []),
  ].filter(item => !item.perm || isAdmin || hasPermission(item.perm as any));

  const doneCount = checklistItems.filter(i => i.done).length;
  const progress = checklistItems.length > 0 ? Math.round((doneCount / checklistItems.length) * 100) : 0;

  // Quick action buttons
  const actions = [
    canViewMenu && { to: "/admin/menu", label: "Add Item", icon: Plus },
    canViewQr && { to: "/admin/qr", label: "Print QR", icon: QrCode },
    canViewOrders && { to: "/admin/orders", label: "View Orders", icon: ReceiptText },
  ].filter(Boolean) as { to: string; label: string; icon: any }[];

  // KPI cards config
  const kpis = [
    { label: "Today's Orders", value: orderCount.toString(), sub: "Since midnight", clickable: false },
    { label: "Revenue", value: formatMoney(revenue, currency), sub: "Click for details", clickable: true },
    { label: "Avg Prep", value: avgPrep > 0 ? `${avgPrep}m` : "—", sub: "Completed orders", clickable: false },
    { label: "Completed", value: completed.length.toString(), sub: `of ${orderCount} orders`, clickable: false },
  ];

  return (
    <div className="flex flex-col gap-4 w-full">
      {/* Header */}
      <section className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between w-full">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">A clear snapshot of today.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="icon" onClick={() => { qc.invalidateQueries({ queryKey: ["admin", "dashboard"] }); qc.invalidateQueries({ queryKey: ["admin", "orders"] }); }} title="Refresh dashboard">
            <RefreshCw className="h-4 w-4" />
          </Button>
          {canViewOrders && (
            <Button variant="secondary" asChild><Link to="/admin/orders">View orders <ArrowUpRight className="ml-2 h-4 w-4" /></Link></Button>
          )}
          {canViewMenu && (
            <Button asChild><Link to="/admin/menu">Add item <Plus className="ml-2 h-4 w-4" /></Link></Button>
          )}
        </div>
      </section>

      {/* KPI Cards */}
      {canViewOrders && (
        <section className="grid gap-3 grid-cols-2 lg:grid-cols-4">
          {kpis.map(k => (
            <Card
              key={k.label}
              className={cn(
                "shadow-sm transition-all",
                k.clickable && "cursor-pointer hover:border-primary/40 hover:shadow-md group"
              )}
              onClick={k.clickable ? () => setShowRevenue(!showRevenue) : undefined}
            >
              <CardHeader className="pb-1">
                <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                  {k.label}
                  {k.clickable && <TrendingUp className="h-3 w-3 text-primary opacity-0 group-hover:opacity-100 transition-opacity" />}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold tracking-tight">{k.value}</div>
                <div className={cn("text-[11px] mt-0.5", k.clickable ? "text-primary/70" : "text-muted-foreground")}>{k.sub}</div>
                {/* Mini sparkline for revenue */}
                {k.clickable && miniChart.length > 1 && (
                  <div className="mt-2 h-8">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={miniChart} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                        <defs>
                          <linearGradient id="miniGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.25} />
                            <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <Area type="monotone" dataKey="rev" stroke="hsl(var(--primary))" fill="url(#miniGrad)" strokeWidth={1.5} dot={false} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </section>
      )}

      {/* Revenue Detail Panel */}
      {showRevenue && canViewOrders && restaurant && (
        <RevenueDetail restaurantId={restaurant.id} currency={currency} onClose={() => setShowRevenue(false)} />
      )}

      {/* Main Content */}
      <section className="grid gap-3 lg:grid-cols-3">
        {/* Live Orders */}
        {canViewOrders && (
          <Card className="shadow-sm lg:col-span-2">
            <CardHeader className="flex flex-row items-center justify-between gap-4">
              <div>
                <CardTitle className="text-base">Live orders</CardTitle>
                <div className="mt-1 text-xs text-muted-foreground">Latest 5 orders</div>
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
                {(latestOrdersQ.data ?? []).map(o => (
                  <div key={o.id} className="flex items-center justify-between gap-3 rounded-xl border bg-background p-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{shortId(o.id)}</span>
                        <span className="text-xs text-muted-foreground">{o.table_label || "No Table"}</span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {new Date(o.placed_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </div>
                    </div>
                    <Badge variant={statusVariant(o.status)} className="shrink-0 capitalize">{o.status.replace("_", " ")}</Badge>
                  </div>
                ))}
                {latestOrdersQ.data?.length === 0 && (
                  <div className="text-center py-8 text-sm text-muted-foreground border-dashed border rounded-xl">No orders today yet.</div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Unified: Setup Progress + Quick Actions */}
        <div className={cn("space-y-3", !canViewOrders && "lg:col-span-3")}>
          <Card className="shadow-sm">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" /> Getting Started
                </CardTitle>
                <Badge variant={progress === 100 ? "default" : "secondary"} className="text-xs">
                  {doneCount}/{checklistItems.length} done
                </Badge>
              </div>
              {/* Progress bar */}
              <div className="mt-2 h-1.5 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-500"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </CardHeader>
            <CardContent className="space-y-1.5">
              {checklistItems.map(item => (
                <Link
                  key={item.label}
                  to={item.done ? "#" : item.route}
                  className={cn(
                    "flex items-center justify-between gap-3 rounded-lg p-2.5 transition-colors",
                    item.done
                      ? "opacity-60"
                      : "hover:bg-accent cursor-pointer group"
                  )}
                  onClick={item.done ? (e) => e.preventDefault() : undefined}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {item.done ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                    ) : (
                      <Circle className="h-4 w-4 text-muted-foreground/50 shrink-0 group-hover:text-primary transition-colors" />
                    )}
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{item.label}</div>
                      <div className="text-xs text-muted-foreground">{item.detail}</div>
                    </div>
                  </div>
                  <div className="shrink-0">
                    {item.done ? (
                      <Badge variant="outline" className="text-xs text-emerald-600 border-emerald-200">Done</Badge>
                    ) : (
                      <ArrowUpRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                    )}
                  </div>
                </Link>
              ))}
            </CardContent>
          </Card>

          {/* Quick Actions */}
          {actions.length > 0 && (
            <Card className="shadow-sm">
              <CardHeader className="pb-2"><CardTitle className="text-base">Quick actions</CardTitle></CardHeader>
              <CardContent className="grid gap-2">
                {actions.map(a => (
                  <Button key={a.to} className="w-full justify-between" variant="secondary" asChild>
                    <Link to={a.to}>
                      <span className="flex items-center gap-2"><a.icon className="h-4 w-4" /> {a.label}</span>
                      <ArrowUpRight className="h-4 w-4" />
                    </Link>
                  </Button>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      </section>
    </div>
  );
}

// Re-export for Menu icon (used in checklist but imported from lucide above)
const Salad = (props: any) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M7 21h10"/><path d="M12 21a9 9 0 0 0 9-9H3a9 9 0 0 0 9 9Z"/><path d="M11.38 12a2.4 2.4 0 0 1-.4-4.77 2.4 2.4 0 0 1 3.2-2.77 2.4 2.4 0 0 1 3.47-.63 2.4 2.4 0 0 1 3.13 1.33l-12.56 4.4"/><path d="M13 12a2.4 2.4 0 0 0 .4-4.77 2.4 2.4 0 0 0-3.2-2.77 2.4 2.4 0 0 0-3.47-.63 2.4 2.4 0 0 0-3.13 1.33L16.16 9.6"/></svg>
);