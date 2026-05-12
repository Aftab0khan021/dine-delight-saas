import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { subDays, subWeeks, startOfDay, startOfWeek, startOfMonth, format, eachDayOfInterval, eachHourOfInterval, addDays } from "date-fns";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { formatMoney, fromCents } from "@/lib/formatting";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { X, TrendingUp, ShoppingCart, DollarSign, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

type Filter = "daily" | "weekly" | "monthly";

type Props = {
  restaurantId: string;
  currency: string;
  onClose: () => void;
};

export function RevenueDetail({ restaurantId, currency, onClose }: Props) {
  const [filter, setFilter] = useState<Filter>("daily");

  const { rangeStart, rangeEnd, dateFormat, labelFormat } = useMemo(() => {
    const now = new Date();
    if (filter === "daily") {
      return {
        rangeStart: startOfDay(now).toISOString(),
        rangeEnd: addDays(startOfDay(now), 1).toISOString(),
        dateFormat: "HH:mm",
        labelFormat: "Today (Hourly)",
      };
    }
    if (filter === "weekly") {
      return {
        rangeStart: startOfWeek(now, { weekStartsOn: 1 }).toISOString(),
        rangeEnd: now.toISOString(),
        dateFormat: "EEE",
        labelFormat: "This Week",
      };
    }
    return {
      rangeStart: startOfMonth(now).toISOString(),
      rangeEnd: now.toISOString(),
      dateFormat: "dd MMM",
      labelFormat: "This Month",
    };
  }, [filter]);

  const { data: orders, isLoading } = useQuery({
    queryKey: ["revenue-detail", restaurantId, filter],
    enabled: !!restaurantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id, placed_at, total_cents, status")
        .eq("restaurant_id", restaurantId)
        .gte("placed_at", rangeStart)
        .lt("placed_at", rangeEnd)
        .order("placed_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { chartData, totalRevenue, orderCount, avgOrder, completedCount } = useMemo(() => {
    const items = orders ?? [];
    const total = items.reduce((s, o) => s + (o.total_cents ?? 0), 0);
    const completed = items.filter(o => o.status === "completed" || o.status === "delivered");
    const avg = items.length > 0 ? Math.round(total / items.length) : 0;

    let buckets: { label: string; key: string }[] = [];
    const now = new Date();

    if (filter === "daily") {
      const hours = eachHourOfInterval({ start: startOfDay(now), end: now });
      buckets = hours.map(h => ({ label: format(h, "ha"), key: format(h, "yyyy-MM-dd-HH") }));
    } else if (filter === "weekly") {
      const days = eachDayOfInterval({ start: startOfWeek(now, { weekStartsOn: 1 }), end: now });
      buckets = days.map(d => ({ label: format(d, "EEE"), key: format(d, "yyyy-MM-dd") }));
    } else {
      const days = eachDayOfInterval({ start: startOfMonth(now), end: now });
      buckets = days.map(d => ({ label: format(d, "dd"), key: format(d, "yyyy-MM-dd") }));
    }

    const chart = buckets.map(b => {
      const bucketOrders = items.filter(o => {
        const d = new Date(o.placed_at);
        if (filter === "daily") return format(d, "yyyy-MM-dd-HH") === b.key;
        return format(d, "yyyy-MM-dd") === b.key;
      });
      const rev = bucketOrders.reduce((s, o) => s + (o.total_cents ?? 0), 0);
      return { name: b.label, revenue: rev, orders: bucketOrders.length };
    });

    return { chartData: chart, totalRevenue: total, orderCount: items.length, avgOrder: avg, completedCount: completed.length };
  }, [orders, filter]);

  const stats = [
    { label: "Total Revenue", value: formatMoney(totalRevenue, currency), icon: DollarSign, color: "text-emerald-500" },
    { label: "Orders", value: orderCount.toString(), icon: ShoppingCart, color: "text-blue-500" },
    { label: "Avg Order", value: formatMoney(avgOrder, currency), icon: TrendingUp, color: "text-amber-500" },
    { label: "Completed", value: completedCount.toString(), icon: Clock, color: "text-violet-500" },
  ];

  return (
    <Card className="shadow-lg border-primary/20 animate-in slide-in-from-top-2 duration-300">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div>
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" /> Revenue Overview
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-0.5">{labelFormat}</p>
        </div>
        <div className="flex items-center gap-2">
          {(["daily", "weekly", "monthly"] as Filter[]).map(f => (
            <Button
              key={f}
              size="sm"
              variant={filter === f ? "default" : "outline"}
              className="h-7 text-xs capitalize"
              onClick={() => setFilter(f)}
            >
              {f}
            </Button>
          ))}
          <Button size="icon" variant="ghost" className="h-7 w-7 ml-1" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Stats Row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {stats.map(s => (
            <div key={s.label} className="rounded-xl border bg-muted/30 p-3">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <s.icon className={cn("h-3.5 w-3.5", s.color)} />
                {s.label}
              </div>
              <div className="text-lg font-bold mt-1 tracking-tight">{s.value}</div>
            </div>
          ))}
        </div>

        {/* Chart */}
        <div className="h-[220px] w-full">
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          ) : chartData.length === 0 ? (
            <div className="flex items-center justify-center h-full text-sm text-muted-foreground">No data for this period</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} className="text-muted-foreground" />
                <YAxis tick={{ fontSize: 11 }} className="text-muted-foreground" tickFormatter={(val: number) => `${fromCents(val).toFixed(0)}`} />
                <Tooltip
                  contentStyle={{ borderRadius: 12, fontSize: 12, border: "1px solid hsl(var(--border))", background: "hsl(var(--card))" }}
                  formatter={(val: number) => [formatMoney(val, currency), "Revenue"]}
                />
                <Area type="monotone" dataKey="revenue" stroke="hsl(var(--primary))" fill="url(#revGrad)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
