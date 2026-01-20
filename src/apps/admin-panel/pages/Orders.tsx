import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { addDays, startOfDay, subHours } from "date-fns";

import { supabase } from "@/integrations/supabase/client";
import { useRestaurantContext } from "../state/restaurant-context";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";

import { OrderCard, type OrderCardVM, type OrderStatus } from "../components/orders/OrderCard";
import { buildItemSummary, KANBAN_STATUSES, type OrderItemRow } from "../components/orders/order-utils";

type TimeFilter = "today" | "last_24h";

type OrderRow = {
  id: string;
  status: OrderStatus;
  placed_at: string;
  completed_at: string | null;
  table_label: string | null;
  total_cents: number;
  currency_code: string;
};

const statusLabel: Record<OrderStatus, string> = {
  pending: "Pending",
  in_progress: "In Progress",
  ready: "Ready",
  completed: "Completed",
};

function shortId(id: string) {
  return id?.slice(0, 8) ?? "";
}

export default function AdminOrders() {
  const { restaurant } = useRestaurantContext();
  const qc = useQueryClient();

  const [statusFilter, setStatusFilter] = useState<OrderStatus | "all">("all");
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("today");
  const [search, setSearch] = useState("");

  const { startISO, endISO } = useMemo(() => {
    if (timeFilter === "last_24h") {
      const start = subHours(new Date(), 24);
      return { startISO: start.toISOString(), endISO: new Date().toISOString() };
    }

    const start = startOfDay(new Date());
    const end = addDays(start, 1);
    return { startISO: start.toISOString(), endISO: end.toISOString() };
  }, [timeFilter]);

  const ordersQuery = useQuery({
    queryKey: ["admin", "orders", restaurant?.id, timeFilter],
    enabled: !!restaurant?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id, status, placed_at, completed_at, table_label, total_cents, currency_code")
        .eq("restaurant_id", restaurant!.id)
        .in("status", KANBAN_STATUSES as any)
        .gte("placed_at", startISO)
        .lt("placed_at", endISO)
        .order("placed_at", { ascending: false })
        .limit(200);

      if (error) throw error;
      return (data ?? []) as OrderRow[];
    },
  });

  const orderIds = useMemo(() => (ordersQuery.data ?? []).map((o) => o.id), [ordersQuery.data]);

  const orderItemsQuery = useQuery({
    queryKey: ["admin", "orders", restaurant?.id, timeFilter, "items", orderIds.join(",")],
    enabled: !!restaurant?.id && orderIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_items")
        .select("order_id, name_snapshot, quantity")
        .eq("restaurant_id", restaurant!.id)
        .in("order_id", orderIds);

      if (error) throw error;
      return (data ?? []) as OrderItemRow[];
    },
  });

  const itemsByOrder = useMemo(() => {
    const map = new Map<string, OrderItemRow[]>();
    for (const it of orderItemsQuery.data ?? []) {
      const arr = map.get(it.order_id) ?? [];
      arr.push(it);
      map.set(it.order_id, arr);
    }
    return map;
  }, [orderItemsQuery.data]);

  const allCards = useMemo<OrderCardVM[]>(() => {
    const orders = ordersQuery.data ?? [];
    return orders.map((o) => ({
      id: o.id,
      status: o.status,
      placed_at: o.placed_at,
      table_label: o.table_label,
      total_cents: o.total_cents ?? 0,
      currency_code: o.currency_code ?? "USD",
      item_summary: buildItemSummary(itemsByOrder.get(o.id), 3),
    }));
  }, [itemsByOrder, ordersQuery.data]);

  const filteredCards = useMemo(() => {
    const s = search.trim().toLowerCase();
    return allCards.filter((c) => {
      if (statusFilter !== "all" && c.status !== statusFilter) return false;
      if (s) {
        const needle = s.replace(/^#/, "");
        const id = c.id.toLowerCase();
        const sid = shortId(c.id).toLowerCase();
        if (!id.includes(needle) && !sid.includes(needle)) return false;
      }
      return true;
    });
  }, [allCards, search, statusFilter]);

  const cardsByStatus = useMemo(() => {
    const map: Record<OrderStatus, OrderCardVM[]> = {
      pending: [],
      in_progress: [],
      ready: [],
      completed: [],
    };
    for (const c of filteredCards) map[c.status].push(c);
    return map;
  }, [filteredCards]);

  const advanceMutation = useMutation({
    mutationFn: async ({ id, from }: { id: string; from: OrderStatus }) => {
      if (!restaurant?.id) throw new Error("Missing restaurant");

      const next: OrderStatus | null =
        from === "pending" ? "in_progress" : from === "in_progress" ? "ready" : from === "ready" ? "completed" : null;

      if (!next) return;

      const patch: { status: OrderStatus; completed_at?: string | null } = { status: next };
      if (next === "completed") patch.completed_at = new Date().toISOString();

      const { error } = await supabase
        .from("orders")
        .update(patch)
        .eq("id", id)
        .eq("restaurant_id", restaurant.id);

      if (error) throw error;
    },
    onMutate: async ({ id, from }) => {
      await qc.cancelQueries({ queryKey: ["admin", "orders", restaurant?.id, timeFilter] });
      const prev = qc.getQueryData<OrderRow[]>(["admin", "orders", restaurant?.id, timeFilter]);

      const next: OrderStatus | null =
        from === "pending" ? "in_progress" : from === "in_progress" ? "ready" : from === "ready" ? "completed" : null;

      if (prev && next) {
        qc.setQueryData<OrderRow[]>(["admin", "orders", restaurant?.id, timeFilter],
          prev.map((o) =>
            o.id === id
              ? {
                  ...o,
                  status: next,
                  completed_at: next === "completed" ? new Date().toISOString() : o.completed_at,
                }
              : o,
          ),
        );
      }

      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(["admin", "orders", restaurant?.id, timeFilter], ctx.prev);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["admin", "orders", restaurant?.id, timeFilter] });
    },
  });

  const isLoading = ordersQuery.isLoading || (orderIds.length > 0 && orderItemsQuery.isLoading);
  const hasAnyOrders = (ordersQuery.data?.length ?? 0) > 0;

  return (
    <section className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Orders</h1>
        <p className="text-sm text-muted-foreground">Track and advance orders for {restaurant?.name}.</p>
      </header>

      {/* TOP TOOLBAR */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filters</CardTitle>
          <CardDescription>Search and filter the Kanban board.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 lg:grid-cols-3">
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
              <SelectTrigger>
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {KANBAN_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {statusLabel[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={timeFilter} onValueChange={(v) => setTimeFilter(v as any)}>
              <SelectTrigger>
                <SelectValue placeholder="Time" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="today">Today</SelectItem>
                <SelectItem value="last_24h">Last 24h</SelectItem>
              </SelectContent>
            </Select>

            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by Order ID…" />
          </div>

          <Separator />

          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Badge variant="secondary">{filteredCards.length} shown</Badge>
            <Button variant="outline" size="sm" onClick={() => setSearch("")}>Clear search</Button>
          </div>
        </CardContent>
      </Card>

      {/* EMPTY STATE: no orders at all */}
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading orders…</p>
      ) : !hasAnyOrders ? (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <p className="font-medium">No orders yet</p>
          <p className="text-sm text-muted-foreground">When customers place orders, they’ll appear here.</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {KANBAN_STATUSES.map((status) => {
            const col = cardsByStatus[status];
            return (
              <div key={status} className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold">{statusLabel[status]}</p>
                  <Badge variant="secondary">{col.length}</Badge>
                </div>

                {col.length === 0 ? (
                  <div className="rounded-lg border border-dashed p-4 text-center">
                    <p className="text-sm font-medium">No orders</p>
                    <p className="text-xs text-muted-foreground">Nothing in {statusLabel[status].toLowerCase()}.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {col.map((o) => (
                      <OrderCard
                        key={o.id}
                        order={o}
                        onAdvance={(id, from) => advanceMutation.mutate({ id, from })}
                        advancing={advanceMutation.isPending}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

