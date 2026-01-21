import { useEffect, useMemo, useRef } from "react";
import { format } from "date-fns";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type OrderRow = {
  id: string;
  restaurant_id: string;
  total_cents: number;
  table_label: string | null;
  placed_at: string;
  status: string;
  currency_code: string;
};

type ActivityRow = {
  id: string;
  created_at: string;
  restaurant_id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
};

const HIGH_TOTAL_CENTS = 25_000; // $250
const MANY_ORDERS_TABLE_COUNT = 6;
const MANY_ORDERS_TABLE_WINDOW_MIN = 60; // 1 hour
const RAPID_CREATION_COUNT = 4;
const RAPID_CREATION_WINDOW_MIN = 5;

function formatMoney(cents: number, currencyCode?: string) {
  const currency = (currencyCode || "USD").trim().toUpperCase();
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format((cents || 0) / 100);
  } catch {
    return `${((cents || 0) / 100).toFixed(2)} ${currency}`;
  }
}

function minutesBetween(a: Date, b: Date) {
  return Math.abs(a.getTime() - b.getTime()) / 1000 / 60;
}

export default function SuperAdminAbuse() {
  const { toast } = useToast();

  const query = useQuery({
    queryKey: ["superadmin", "abuse"],
    queryFn: async () => {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      const [{ data: orders, error: ordersError }, { data: logs, error: logsError }] = await Promise.all([
        supabase
          .from("orders")
          .select("id,restaurant_id,total_cents,table_label,placed_at,status,currency_code")
          .gte("placed_at", since)
          .order("placed_at", { ascending: false })
          .limit(500),
        // Included per requirements; used as a supporting signal for future iteration.
        supabase
          .from("activity_logs")
          .select("id,created_at,restaurant_id,action,entity_type,entity_id")
          .gte("created_at", since)
          .order("created_at", { ascending: false })
          .limit(500),
      ]);

      if (ordersError) throw ordersError;
      if (logsError) throw logsError;

      const orderRows = (orders ?? []) as OrderRow[];
      const activityRows = (logs ?? []) as ActivityRow[];

      const restaurantIds = Array.from(new Set(orderRows.map((o) => o.restaurant_id)));
      const { data: restaurants, error: restaurantsError } = await supabase
        .from("restaurants")
        .select("id,name")
        .in("id", restaurantIds);

      if (restaurantsError) throw restaurantsError;

      const restaurantNameById = new Map<string, string>();
      for (const r of restaurants ?? []) restaurantNameById.set(r.id, r.name);

      return { orders: orderRows, activity: activityRows, restaurantNameById };
    },
  });

  const lastErrorMessageRef = useRef<string | null>(null);
  useEffect(() => {
    if (!query.isError) return;
    const err = query.error as any;
    const message = err?.message ?? "Failed to load abuse signals";
    if (lastErrorMessageRef.current === message) return;
    lastErrorMessageRef.current = message;
    toast({ title: "Error", description: message, variant: "destructive" });
  }, [query.isError, query.error, toast]);

  const suspicious = useMemo(() => {
    if (!query.data) {
      return [] as Array<{
        order: OrderRow;
        restaurantName?: string;
        indicators: Array<{ key: string; label: string }>;
      }>;
    }

    const { orders, restaurantNameById } = query.data;
    const byRestaurantTable = new Map<string, OrderRow[]>();

    for (const o of orders) {
      const table = (o.table_label ?? "").trim();
      const key = `${o.restaurant_id}::${table || "(no-table)"}`;
      const arr = byRestaurantTable.get(key) ?? [];
      arr.push(o);
      byRestaurantTable.set(key, arr);
    }

    // Pre-sort each bucket by time asc for window checks.
    for (const arr of byRestaurantTable.values()) {
      arr.sort((a, b) => new Date(a.placed_at).getTime() - new Date(b.placed_at).getTime());
    }

    const manyOrdersTableKeys = new Set<string>();
    const rapidOrdersTableKeys = new Set<string>();

    for (const [key, arr] of byRestaurantTable.entries()) {
      // Sliding window for many orders in 60 min
      let left = 0;
      for (let right = 0; right < arr.length; right++) {
        while (
          left < right &&
          minutesBetween(new Date(arr[right].placed_at), new Date(arr[left].placed_at)) > MANY_ORDERS_TABLE_WINDOW_MIN
        ) {
          left++;
        }
        if (right - left + 1 >= MANY_ORDERS_TABLE_COUNT) {
          manyOrdersTableKeys.add(key);
          break;
        }
      }

      // Sliding window for rapid creation in 5 min
      left = 0;
      for (let right = 0; right < arr.length; right++) {
        while (
          left < right &&
          minutesBetween(new Date(arr[right].placed_at), new Date(arr[left].placed_at)) > RAPID_CREATION_WINDOW_MIN
        ) {
          left++;
        }
        if (right - left + 1 >= RAPID_CREATION_COUNT) {
          rapidOrdersTableKeys.add(key);
          break;
        }
      }
    }

    return orders
      .map((order) => {
        const indicators: Array<{ key: string; label: string }> = [];
        const table = (order.table_label ?? "").trim();
        const key = `${order.restaurant_id}::${table || "(no-table)"}`;

        if ((order.total_cents ?? 0) >= HIGH_TOTAL_CENTS) {
          indicators.push({ key: "high_total", label: "Very high total" });
        }
        if (manyOrdersTableKeys.has(key) && table) {
          indicators.push({ key: "many_same_table", label: "Many orders from same table" });
        }
        if (rapidOrdersTableKeys.has(key) && table) {
          indicators.push({ key: "rapid_creation", label: "Rapid creation" });
        }

        return {
          order,
          restaurantName: restaurantNameById.get(order.restaurant_id),
          indicators,
        };
      })
      .filter((r) => r.indicators.length > 0)
      .sort((a, b) => {
        // prioritize most indicators, then most recent
        if (b.indicators.length !== a.indicators.length) return b.indicators.length - a.indicators.length;
        return new Date(b.order.placed_at).getTime() - new Date(a.order.placed_at).getTime();
      });
  }, [query.data]);

  return (
    <section className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Abuse</h1>
        <p className="text-sm text-muted-foreground">
          Read-only suspicious order signals from the last 24 hours.
        </p>
      </header>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Suspicious orders</CardTitle>
        </CardHeader>
        <CardContent>
          {query.isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
            </div>
          ) : query.isError ? (
            <div className="text-sm text-muted-foreground">Unable to load suspicious orders.</div>
          ) : (
            <div className="w-full overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[220px]">Indicators</TableHead>
                    <TableHead className="min-w-[220px]">Order ID</TableHead>
                    <TableHead className="min-w-[240px]">Restaurant</TableHead>
                    <TableHead className="min-w-[160px]">Total</TableHead>
                    <TableHead className="min-w-[140px]">Table label</TableHead>
                    <TableHead className="min-w-[180px]">Placed</TableHead>
                    <TableHead className="min-w-[140px]">Status</TableHead>
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {suspicious.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-sm text-muted-foreground">
                        No suspicious orders detected in the current window.
                      </TableCell>
                    </TableRow>
                  ) : (
                    suspicious.map(({ order, restaurantName, indicators }) => (
                      <TableRow key={order.id}>
                        <TableCell>
                          <div className="flex flex-wrap gap-2">
                            {indicators.map((i) => (
                              <Badge key={i.key} variant="secondary">
                                {i.label}
                              </Badge>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-sm">{order.id}</TableCell>
                        <TableCell className="font-medium">{restaurantName ?? "—"}</TableCell>
                        <TableCell className="text-sm">{formatMoney(order.total_cents, order.currency_code)}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{order.table_label ?? "—"}</TableCell>
                        <TableCell className="text-sm">
                          {order.placed_at ? format(new Date(order.placed_at), "PP p") : "—"}
                        </TableCell>
                        <TableCell className="text-sm">{order.status}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
