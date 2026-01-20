import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { startOfDay, addDays } from "date-fns";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useRestaurantContext } from "../state/restaurant-context";

function formatMoney(cents: number, currency = "USD") {
  const amount = (cents ?? 0) / 100;
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `$${amount.toFixed(2)}`;
  }
}

function shortId(id: string) {
  return id?.slice(0, 8) ?? "—";
}

export default function AdminDashboard() {
  const { restaurant } = useRestaurantContext();

  const { startISO, endISO } = useMemo(() => {
    const start = startOfDay(new Date());
    const end = addDays(start, 1);
    return { startISO: start.toISOString(), endISO: end.toISOString() };
  }, []);

  const todayOrdersQuery = useQuery({
    queryKey: ["admin", "dashboard", restaurant?.id, "todayOrders"],
    enabled: !!restaurant?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id, placed_at, completed_at, total_cents, currency_code")
        .eq("restaurant_id", restaurant!.id)
        .gte("placed_at", startISO)
        .lt("placed_at", endISO)
        .order("placed_at", { ascending: false });

      if (error) throw error;
      return data;
    },
  });

  const latestOrdersQuery = useQuery({
    queryKey: ["admin", "dashboard", restaurant?.id, "latestOrders"],
    enabled: !!restaurant?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id, status, placed_at, total_cents, currency_code")
        .eq("restaurant_id", restaurant!.id)
        .order("placed_at", { ascending: false })
        .limit(5);

      if (error) throw error;
      return data;
    },
  });

  const topSellingQuery = useQuery({
    queryKey: ["admin", "dashboard", restaurant?.id, "topSellingItem"],
    enabled: !!restaurant?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_items")
        .select("name_snapshot, quantity")
        .eq("restaurant_id", restaurant!.id)
        .limit(1000);

      if (error) throw error;
      return data;
    },
  });

  const setupQuery = useQuery({
    queryKey: ["admin", "dashboard", restaurant?.id, "setupChecklist"],
    enabled: !!restaurant?.id,
    queryFn: async () => {
      const [{ data: restaurantRow, error: restaurantErr }, menuCount, qrCount] = await Promise.all([
        supabase.from("restaurants").select("logo_url").eq("id", restaurant!.id).maybeSingle(),
        supabase.from("menu_items").select("id", { count: "exact", head: true }).eq("restaurant_id", restaurant!.id),
        supabase.from("qr_codes").select("id", { count: "exact", head: true }).eq("restaurant_id", restaurant!.id),
      ]);

      if (restaurantErr) throw restaurantErr;
      if (menuCount.error) throw menuCount.error;
      if (qrCount.error) throw qrCount.error;

      return {
        logoUrl: restaurantRow?.logo_url ?? null,
        menuItemsCount: menuCount.count ?? 0,
        qrCodesCount: qrCount.count ?? 0,
      };
    },
  });

  const kpis = useMemo(() => {
    const todayOrders = todayOrdersQuery.data ?? [];
    const currency = todayOrders[0]?.currency_code ?? "USD";

    const todaysOrdersCount = todayOrders.length;
    const todaysRevenueCents = todayOrders.reduce((sum, o) => sum + (o.total_cents ?? 0), 0);

    const completed = todayOrders
      .filter((o) => o.completed_at)
      .map((o) => {
        const placed = new Date(o.placed_at).getTime();
        const completedAt = new Date(o.completed_at as string).getTime();
        return completedAt - placed;
      })
      .filter((ms) => Number.isFinite(ms) && ms > 0);

    const avgPrepMs = completed.length >= 3 ? completed.reduce((a, b) => a + b, 0) / completed.length : null;

    const items = topSellingQuery.data ?? [];
    const counts = new Map<string, number>();
    for (const it of items) {
      const key = it.name_snapshot;
      counts.set(key, (counts.get(key) ?? 0) + (it.quantity ?? 0));
    }

    let topItem: { name: string; qty: number } | null = null;
    for (const [name, qty] of counts.entries()) {
      if (!topItem || qty > topItem.qty) topItem = { name, qty };
    }

    return {
      currency,
      todaysOrdersCount,
      todaysRevenueCents,
      avgPrepMs,
      topItem,
    };
  }, [todayOrdersQuery.data, topSellingQuery.data]);

  const avgPrepLabel = useMemo(() => {
    if (!kpis.avgPrepMs) return "Not enough data";
    const minutes = Math.round(kpis.avgPrepMs / 1000 / 60);
    return `${minutes} min`;
  }, [kpis.avgPrepMs]);

  return (
    <section className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Key metrics and quick access for {restaurant?.name}.</p>
      </header>

      {/* KPI cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Today’s Orders</CardDescription>
            <CardTitle className="text-3xl">{todayOrdersQuery.isLoading ? "…" : kpis.todaysOrdersCount}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">Placed since midnight.</CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Revenue</CardDescription>
            <CardTitle className="text-3xl">
              {todayOrdersQuery.isLoading ? "…" : formatMoney(kpis.todaysRevenueCents, kpis.currency)}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">From orders placed today.</CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Avg Prep Time</CardDescription>
            <CardTitle className="text-3xl">{todayOrdersQuery.isLoading ? "…" : avgPrepLabel}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">Requires at least 3 completed orders today.</CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Top Selling Item</CardDescription>
            <CardTitle className="text-xl">
              {topSellingQuery.isLoading
                ? "…"
                : kpis.topItem
                  ? kpis.topItem.name
                  : "No order items yet"}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            {kpis.topItem ? `${kpis.topItem.qty} sold` : "Create orders to see your top item."}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Orders Preview */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <div>
                <CardTitle>Latest Orders</CardTitle>
                <CardDescription>Most recent 5 orders for this restaurant.</CardDescription>
              </div>
              <Button variant="outline" size="sm" asChild>
                <a href="/admin/orders">View Orders</a>
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {latestOrdersQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">Loading orders…</p>
            ) : (latestOrdersQuery.data?.length ?? 0) === 0 ? (
              <div className="rounded-lg border border-dashed p-6 text-center">
                <p className="font-medium">No orders yet</p>
                <p className="text-sm text-muted-foreground">When customers place orders, they’ll show up here.</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Order</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Placed</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(latestOrdersQuery.data ?? []).map((o) => (
                    <TableRow key={o.id}>
                      <TableCell className="font-medium">{shortId(o.id)}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{o.status}</Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{new Date(o.placed_at).toLocaleString()}</TableCell>
                      <TableCell className="text-right">{formatMoney(o.total_cents ?? 0, o.currency_code ?? "USD")}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Setup Checklist + Quick Actions */}
        <Card>
          <CardHeader>
            <CardTitle>Setup</CardTitle>
            <CardDescription>Finish these steps to go live faster.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm">Branding complete</span>
                <Badge variant={setupQuery.data?.logoUrl ? "default" : "secondary"}>
                  {setupQuery.isLoading ? "…" : setupQuery.data?.logoUrl ? "Done" : "Missing"}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">First Menu Item</span>
                <Badge variant={(setupQuery.data?.menuItemsCount ?? 0) > 0 ? "default" : "secondary"}>
                  {setupQuery.isLoading ? "…" : (setupQuery.data?.menuItemsCount ?? 0) > 0 ? "Done" : "Missing"}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">QR Published</span>
                <Badge variant={(setupQuery.data?.qrCodesCount ?? 0) > 0 ? "default" : "secondary"}>
                  {setupQuery.isLoading ? "…" : (setupQuery.data?.qrCodesCount ?? 0) > 0 ? "Done" : "Missing"}
                </Badge>
              </div>
            </div>

            <Separator />

            <div className="space-y-2">
              <p className="text-sm font-medium">Quick Actions</p>
              <div className="grid gap-2">
                <Button asChild>
                  <a href="/admin/menu">Add Menu Item</a>
                </Button>
                <Button variant="outline" asChild>
                  <a href="/admin/orders">View Orders</a>
                </Button>
                <Button variant="outline" asChild>
                  <a href="/admin/qr">Generate QR</a>
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
