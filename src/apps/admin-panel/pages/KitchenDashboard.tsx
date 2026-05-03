import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRestaurantContext } from "../state/restaurant-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RefreshCw, ChefHat, Clock, Store, Filter } from "lucide-react";
import { formatMoney } from "@/lib/formatting";
import { shortId } from "@/lib/formatting";
import { useQueryClient } from "@tanstack/react-query";

type OrderStatus = "pending" | "accepted" | "in_progress" | "ready" | "completed" | "cancelled";

const STATUS_LABELS: Record<string, string> = {
  pending: "New",
  accepted: "Accepted",
  in_progress: "Cooking",
  ready: "Ready",
  completed: "Done",
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

export default function KitchenDashboard() {
  const { restaurant } = useRestaurantContext();
  const qc = useQueryClient();
  const [brandFilter, setBrandFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("active");

  // Get child brands if this is a cloud kitchen.
  // Uses parent_kitchen_id from 20260424_cloud_kitchen.sql migration.
  // Returns [] gracefully if migration not yet applied.
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
        if (error) return []; // column may not exist yet
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
    queryKey: ["kitchen-orders", restaurant?.id, brandFilter, statusFilter],
    enabled: !!restaurant?.id && allRestaurantIds.length > 0,
    refetchInterval: 15_000,
    queryFn: async () => {
      const ids = brandFilter === "all" ? allRestaurantIds : [brandFilter];
      // Guard: never call .in() with empty array — PostgREST throws
      if (ids.length === 0) return [];
      let q = supabase
        .from("orders")
        .select(`
          id, status, table_label, placed_at, total_cents, currency_code, restaurant_id,
          restaurants(name, brand_color),
          order_items(name_snapshot, quantity)
        `)
        .in("restaurant_id", ids)
        .order("placed_at", { ascending: false })
        .limit(80);

      if (statusFilter === "active") {
        q = q.in("status", ["pending", "accepted", "in_progress", "ready"]);
      } else if (statusFilter !== "all") {
        q = q.eq("status", statusFilter);
      }

      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  // Realtime subscription
  useEffect(() => {
    if (!restaurant?.id) return;
    const channel = supabase
      .channel(`kitchen:${restaurant.id}`)
      .on("postgres_changes", {
        event: "*", schema: "public", table: "orders",
        filter: `restaurant_id=eq.${restaurant.id}`,
      }, () => qc.invalidateQueries({ queryKey: ["kitchen-orders"] }))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [restaurant?.id, qc]);

  const orders = ordersQuery.data ?? [];
  const brands = brandsQuery.data ?? [];
  const currency = restaurant?.currency_code || "INR";

  const brandMap: Record<string, { name: string; brand_color: string }> = {};
  for (const b of brands) {
    brandMap[(b as any).id] = { name: (b as any).name, brand_color: (b as any).brand_color || "#6366f1" };
  }

  const activeStatuses = ["pending", "accepted", "in_progress", "ready"];
  const counts = activeStatuses.map(s => ({
    status: s,
    count: orders.filter(o => o.status === s).length,
  }));

  return (
    <div className="flex flex-col gap-4 w-full">
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
          <Button variant="outline" size="sm" onClick={() => qc.invalidateQueries({ queryKey: ["kitchen-orders"] })}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </section>

      {/* Status summary pills */}
      <div className="flex gap-3 flex-wrap">
        {counts.map(({ status, count }) => (
          <div key={status} className="flex items-center gap-1.5 bg-muted rounded-full px-3 py-1 text-sm">
            <span className="font-medium">{STATUS_LABELS[status]}</span>
            <Badge className="h-5 px-1.5 text-xs">{count}</Badge>
          </div>
        ))}
      </div>

      {/* Order cards by status column (Kanban-style on large screens) */}
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
    </div>
  );
}

function OrderKOTCard({ order, brandMap, currency, qc }: {
  order: any;
  brandMap: Record<string, { name: string; brand_color: string }>;
  currency: string;
  qc: any;
}) {
  const brand = brandMap[order.restaurant_id];
  const minutesAgo = Math.floor((Date.now() - new Date(order.placed_at).getTime()) / 60_000);
  const isUrgent = minutesAgo > 15 && ["pending", "accepted"].includes(order.status);

  const statusMutation = async (newStatus: string) => {
    await supabase.from("orders").update({ status: newStatus }).eq("id", order.id);
    qc.invalidateQueries({ queryKey: ["kitchen-orders"] });
  };

  const nextStatus: Record<string, string> = {
    pending: "accepted",
    accepted: "in_progress",
    in_progress: "ready",
    ready: "completed",
  };

  return (
    <div className={`border-2 rounded-xl p-3 space-y-2 transition-all ${STATUS_COLORS[order.status] || ""} ${isUrgent ? "ring-2 ring-red-400 animate-pulse" : ""}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-sm">#{shortId(order.id)}</span>
            {brand && (
              <span
                className="text-xs px-1.5 py-0.5 rounded font-medium text-white"
                style={{ backgroundColor: brand.brand_color }}
              >
                {(order.restaurants as any)?.name || brand.name}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
            <Clock className="h-3 w-3" />
            {minutesAgo}m ago
            {order.table_label && (
              <span className="ml-1">· {order.table_label}</span>
            )}
          </div>
        </div>
        <Badge variant="outline" className="text-xs shrink-0">
          {STATUS_LABELS[order.status]}
        </Badge>
      </div>

      <div className="space-y-1">
        {(order.order_items ?? []).map((item: any, i: number) => (
          <div key={i} className="flex gap-2 text-sm">
            <span className="font-bold w-5 text-right">{item.quantity}×</span>
            <span className="text-foreground">{item.name_snapshot}</span>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between pt-1 border-t border-border/50">
        <span className="text-sm font-medium">{formatMoney(order.total_cents, currency)}</span>
        {nextStatus[order.status] && (
          <Button size="sm" className="h-7 text-xs" onClick={() => statusMutation(nextStatus[order.status])}>
            Mark {STATUS_LABELS[nextStatus[order.status]]}
          </Button>
        )}
      </div>
    </div>
  );
}
