import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRestaurantContext } from "../state/restaurant-context";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TrendingUp, BarChart3, Clock, Star } from "lucide-react";
import { formatMoney } from "@/lib/formatting";

type PopularItem = {
  menu_item_id: string;
  order_count_7d: number;
  total_qty_7d: number;
  revenue_cents_7d: number;
  last_ordered_at: string;
};

export default function MenuInsights() {
  const { restaurant } = useRestaurantContext();
  const [view, setView] = useState<"popularity" | "pairs">("popularity");

  const popularQuery = useQuery({
    queryKey: ["menu-insights", "popular", restaurant?.id],
    enabled: !!restaurant?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("menu_item_popularity")
        .select("*")
        .eq("restaurant_id", restaurant!.id)
        .order("order_count_7d", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data ?? [];
    },
  });

  const itemsQuery = useQuery({
    queryKey: ["menu-items-map", restaurant?.id],
    enabled: !!restaurant?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("menu_items")
        .select("id, name, price_cents")
        .eq("restaurant_id", restaurant!.id);
      if (error) throw error;
      const map: Record<string, { name: string; price_cents: number }> = {};
      for (const i of data ?? []) map[i.id] = i;
      return map;
    },
  });

  const pairsQuery = useQuery({
    queryKey: ["menu-insights", "pairs", restaurant?.id],
    enabled: !!restaurant?.id && view === "pairs",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_item_pairs")
        .select("item_a_id, item_b_id, co_order_count, last_seen_at")
        .eq("restaurant_id", restaurant!.id)
        .order("co_order_count", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data ?? [];
    },
  });

  const items = itemsQuery.data ?? {};
  const popular = popularQuery.data ?? [];
  const totalRevenue = popular.reduce((s, i) => s + (i.revenue_cents_7d ?? 0), 0);
  const totalOrders = popular.reduce((s, i) => s + (i.order_count_7d ?? 0), 0);
  const currency = restaurant?.currency_code || "USD";

  return (
    <div className="flex flex-col gap-4 w-full">
      <section className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <BarChart3 className="h-6 w-6 text-blue-500" /> Menu Insights
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            AI-powered popularity data from the last 7 days
          </p>
        </div>
        <Select value={view} onValueChange={(v: any) => setView(v)}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="popularity">Item Popularity</SelectItem>
            <SelectItem value="pairs">Frequently Ordered Together</SelectItem>
          </SelectContent>
        </Select>
      </section>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">7-day Revenue</p>
            <p className="text-2xl font-bold">{formatMoney(totalRevenue, currency)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">7-day Orders</p>
            <p className="text-2xl font-bold">{totalOrders}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Tracked Items</p>
            <p className="text-2xl font-bold">{popular.length}</p>
          </CardContent>
        </Card>
      </div>

      {view === "popularity" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><TrendingUp className="h-4 w-4" /> Top Items — Last 7 Days</CardTitle>
            <CardDescription>Ranked by order frequency. Used by AI Smart Menu ranking.</CardDescription>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <div className="min-w-[560px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8">#</TableHead>
                    <TableHead>Item</TableHead>
                    <TableHead>Orders</TableHead>
                    <TableHead>Qty Sold</TableHead>
                    <TableHead>Revenue</TableHead>
                    <TableHead>Last Ordered</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {popularQuery.isLoading && (
                    <TableRow><TableCell colSpan={6} className="text-center py-8">Loading...</TableCell></TableRow>
                  )}
                  {!popularQuery.isLoading && popular.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        No order data yet. Complete some orders to see insights.
                      </TableCell>
                    </TableRow>
                  )}
                  {popular.map((item, idx) => (
                    <TableRow key={item.menu_item_id}>
                      <TableCell>
                        {idx === 0 ? <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" /> : idx + 1}
                      </TableCell>
                      <TableCell className="font-medium">
                        {items[item.menu_item_id]?.name ?? item.menu_item_id.slice(0, 8)}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div
                            className="h-2 rounded bg-primary"
                            style={{ width: `${Math.max(4, (item.order_count_7d / (popular[0]?.order_count_7d || 1)) * 80)}px` }}
                          />
                          {item.order_count_7d}
                        </div>
                      </TableCell>
                      <TableCell>{item.total_qty_7d}</TableCell>
                      <TableCell className="font-medium">{formatMoney(item.revenue_cents_7d ?? 0, currency)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {item.last_ordered_at
                          ? new Date(item.last_ordered_at).toLocaleDateString()
                          : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {view === "pairs" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Frequently Ordered Together</CardTitle>
            <CardDescription>Item pairs that customers commonly order in the same visit. Powers upsell suggestions.</CardDescription>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <div className="min-w-[480px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item A</TableHead>
                    <TableHead>Item B</TableHead>
                    <TableHead>Times Co-ordered</TableHead>
                    <TableHead>Last Seen</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pairsQuery.isLoading && (
                    <TableRow><TableCell colSpan={4} className="text-center py-8">Loading...</TableCell></TableRow>
                  )}
                  {!pairsQuery.isLoading && (pairsQuery.data?.length ?? 0) === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                        No pair data yet. Pairs are computed as orders are completed.
                      </TableCell>
                    </TableRow>
                  )}
                  {pairsQuery.data?.map((pair: any) => (
                    <TableRow key={`${pair.item_a_id}-${pair.item_b_id}`}>
                      <TableCell className="font-medium">{items[pair.item_a_id]?.name ?? "—"}</TableCell>
                      <TableCell className="font-medium">{items[pair.item_b_id]?.name ?? "—"}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{pair.co_order_count}x</Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(pair.last_seen_at).toLocaleDateString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
