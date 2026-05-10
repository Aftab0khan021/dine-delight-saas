import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRestaurantContext } from "../state/restaurant-context";
import { FeatureGate } from "../components/FeatureGate";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BarChart3, TrendingUp, Clock, Users, Star, Brain, Lightbulb, ArrowUpCircle, ArrowDownCircle } from "lucide-react";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { formatMoney } from "@/lib/formatting";
import { format, subDays, startOfDay, getHours, getDay } from "date-fns";
import OrderHeatmap from "../components/OrderHeatmap";
import { forecastDemandFree, forecastDemand, type DemandForecast } from "../lib/ai-utils";
import { useAITier } from "../hooks/useAITier";

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const HOUR_LABELS = Array.from({ length: 24 }, (_, i) => `${i}:00`);

export default function Analytics() {
  return (
    <FeatureGate featureKey="analytics" featureName="Advanced Analytics" description="Revenue trends, peak hours heatmap, customer retention, and top items analysis over 90 days.">
      <AnalyticsContent />
    </FeatureGate>
  );
}

function AnalyticsContent() {
  const { restaurant } = useRestaurantContext();
  const cc = restaurant?.currency_code || "INR";
  const { tier, getAccessToken } = useAITier(restaurant?.id);
  const [aiInsights, setAiInsights] = useState<DemandForecast | null>(null);
  const [loadingInsights, setLoadingInsights] = useState(false);

  // Fetch all completed orders (last 90 days)
  const { data: orders = [] } = useQuery({
    queryKey: ["analytics-orders", restaurant?.id],
    enabled: !!restaurant?.id,
    queryFn: async () => {
      const since = subDays(new Date(), 90).toISOString();
      const { data } = await supabase
        .from("orders")
        .select("id, total_cents, status, created_at, customer_phone")
        .eq("restaurant_id", restaurant!.id)
        .gte("created_at", since)
        .order("created_at", { ascending: true });
      return data || [];
    },
  });

  // Revenue trend (daily for last 30 days)
  const revenueTrend = useMemo(() => {
    const last30 = subDays(new Date(), 30);
    const dailyMap: Record<string, number> = {};
    for (let i = 0; i < 30; i++) {
      const d = format(subDays(new Date(), 29 - i), "MMM dd");
      dailyMap[d] = 0;
    }
    orders.forEach(o => {
      const d = new Date(o.created_at);
      if (d >= last30) {
        const key = format(d, "MMM dd");
        if (dailyMap[key] !== undefined) dailyMap[key] += (o.total_cents || 0);
      }
    });
    return Object.entries(dailyMap).map(([date, cents]) => ({ date, revenue: Math.round(cents / 100) }));
  }, [orders]);

  // Peak hours heatmap data (day × hour)
  const heatmapData = useMemo(() => {
    const grid: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
    orders.forEach(o => {
      const d = new Date(o.created_at);
      grid[getDay(d)][getHours(d)]++;
    });
    const maxVal = Math.max(1, ...grid.flat());
    return { grid, maxVal };
  }, [orders]);

  // Average order value trend
  const aovTrend = useMemo(() => {
    const last30 = subDays(new Date(), 30);
    const dailyTotals: Record<string, { sum: number; count: number }> = {};
    for (let i = 0; i < 30; i++) {
      const d = format(subDays(new Date(), 29 - i), "MMM dd");
      dailyTotals[d] = { sum: 0, count: 0 };
    }
    orders.forEach(o => {
      const d = new Date(o.created_at);
      if (d >= last30) {
        const key = format(d, "MMM dd");
        if (dailyTotals[key]) { dailyTotals[key].sum += (o.total_cents || 0); dailyTotals[key].count++; }
      }
    });
    return Object.entries(dailyTotals).map(([date, v]) => ({ date, aov: v.count > 0 ? Math.round(v.sum / v.count / 100) : 0 }));
  }, [orders]);

  // Customer retention
  const retention = useMemo(() => {
    const phones = new Set<string>();
    let returning = 0;
    const phoneCounts: Record<string, number> = {};
    orders.forEach(o => {
      if (o.customer_phone) {
        phoneCounts[o.customer_phone] = (phoneCounts[o.customer_phone] || 0) + 1;
        phones.add(o.customer_phone);
      }
    });
    returning = Object.values(phoneCounts).filter(c => c > 1).length;
    return { total: phones.size, returning, rate: phones.size > 0 ? Math.round((returning / phones.size) * 100) : 0 };
  }, [orders]);

  // Top items
  const { data: topItems = [] } = useQuery({
    queryKey: ["analytics-top-items", restaurant?.id],
    enabled: !!restaurant?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("order_items")
        .select("menu_item_id, name, quantity")
        .in("order_id", orders.slice(0, 500).map(o => o.id));
      if (!data) return [];
      const map: Record<string, { name: string; qty: number }> = {};
      data.forEach(i => {
        const k = i.menu_item_id || i.name;
        if (!map[k]) map[k] = { name: i.name, qty: 0 };
        map[k].qty += i.quantity || 1;
      });
      return Object.values(map).sort((a, b) => b.qty - a.qty).slice(0, 10);
    },
  });

  const totalRevenue = orders.reduce((s, o) => s + (o.total_cents || 0), 0);
  const totalOrders = orders.length;

  return (
    <section className="flex flex-col gap-6 w-full">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2"><BarChart3 className="h-6 w-6" /> Advanced Analytics</h1>
        <p className="text-sm text-muted-foreground">Last 90 days performance overview</p>
      </header>

      {/* KPI Cards */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Revenue (90d)</p><p className="text-xl font-bold">{formatMoney(totalRevenue, cc)}</p></CardContent></Card>
        <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Orders (90d)</p><p className="text-xl font-bold">{totalOrders}</p></CardContent></Card>
        <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Unique Customers</p><p className="text-xl font-bold">{retention.total}</p></CardContent></Card>
        <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Return Rate</p><p className="text-xl font-bold">{retention.rate}%</p></CardContent></Card>
      </div>

      {/* Revenue Trend */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><TrendingUp className="h-4 w-4" /> Revenue Trend (30 days)</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={revenueTrend}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} interval={4} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip formatter={(v: number) => [`₹${v}`, "Revenue"]} />
              <Line type="monotone" dataKey="revenue" stroke="#6366f1" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div className="grid gap-6 grid-cols-1 md:grid-cols-2">
        {/* Peak Hours Heatmap */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><Clock className="h-4 w-4" /> Peak Hours Heatmap</CardTitle></CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <div className="min-w-[400px]">
                <div className="flex gap-0.5 mb-1">
                  <div className="w-10" />
                  {[6,8,10,12,14,16,18,20,22].map(h => <div key={h} className="text-[9px] text-muted-foreground" style={{ width: '16px', marginLeft: h === 6 ? `${(h)*16.5}px` : '16px' }}>{h}</div>)}
                </div>
                {heatmapData.grid.map((row, dayIdx) => (
                  <div key={dayIdx} className="flex items-center gap-0.5">
                    <div className="w-10 text-xs text-muted-foreground shrink-0">{DAY_LABELS[dayIdx]}</div>
                    {row.map((val, hourIdx) => {
                      const intensity = val / heatmapData.maxVal;
                      return <div key={hourIdx} className="w-[16px] h-[16px] rounded-sm" style={{ backgroundColor: intensity > 0 ? `rgba(99,102,241,${Math.max(0.1, intensity)})` : '#f1f5f9' }} title={`${DAY_LABELS[dayIdx]} ${hourIdx}:00 — ${val} orders`} />;
                    })}
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Top Items */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><Star className="h-4 w-4" /> Top 10 Items</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={topItems} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis type="number" tick={{ fontSize: 10 }} />
                <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 10 }} />
                <Tooltip />
                <Bar dataKey="qty" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* AOV Trend */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Average Order Value Trend</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={aovTrend}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} interval={4} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip formatter={(v: number) => [`₹${v}`, "AOV"]} />
              <Line type="monotone" dataKey="aov" stroke="#10b981" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Full-Width Order Heatmap */}
      <OrderHeatmap orders={orders} />

      {/* AI Demand Insights */}
      {orders.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <Brain className="w-4 h-4" />
                  AI Demand Insights
                  <Badge variant={tier("order_heatmap") === "paid" ? "default" : "secondary"} className="text-[10px] h-4">
                    {tier("order_heatmap") === "paid" ? "AI Pro" : "Basic"}
                  </Badge>
                </CardTitle>
                <CardDescription>Staffing and promotion recommendations based on your order patterns</CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                disabled={loadingInsights}
                onClick={async () => {
                  setLoadingInsights(true);
                  try {
                    const matrix: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
                    for (const o of orders) {
                      const d = new Date(o.created_at);
                      matrix[getDay(d)][getHours(d)]++;
                    }
                    const isPaid = tier("order_heatmap") === "paid";
                    const token = isPaid ? await getAccessToken() : null;
                    const result = await forecastDemand({
                      isPaid,
                      matrix,
                      dayLabels: DAY_LABELS,
                      hourLabels: HOUR_LABELS,
                      accessToken: token,
                    });
                    setAiInsights(result);
                  } catch {
                    // Fallback to free
                    const matrix: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
                    for (const o of orders) {
                      const d = new Date(o.created_at);
                      matrix[getDay(d)][getHours(d)]++;
                    }
                    setAiInsights(forecastDemandFree(matrix, DAY_LABELS, HOUR_LABELS));
                  } finally {
                    setLoadingInsights(false);
                  }
                }}
              >
                <Lightbulb className="w-4 h-4 mr-1" />
                {loadingInsights ? "Analyzing..." : aiInsights ? "Refresh" : "Generate Insights"}
              </Button>
            </div>
          </CardHeader>
          {aiInsights && (
            <CardContent>
              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <div className="flex items-center gap-1 text-sm font-medium text-green-600">
                    <ArrowUpCircle className="w-4 h-4" /> Peak Hours
                  </div>
                  {aiInsights.peakHours.length > 0 ? (
                    <ul className="text-sm text-muted-foreground space-y-1">
                      {aiInsights.peakHours.map((h, i) => <li key={i}>• {h}</li>)}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted-foreground">Not enough data</p>
                  )}
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-1 text-sm font-medium text-amber-500">
                    <ArrowDownCircle className="w-4 h-4" /> Slow Hours
                  </div>
                  {aiInsights.slowHours.length > 0 ? (
                    <ul className="text-sm text-muted-foreground space-y-1">
                      {aiInsights.slowHours.map((h, i) => <li key={i}>• {h}</li>)}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted-foreground">No slow periods detected</p>
                  )}
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-1 text-sm font-medium text-blue-600">
                    <Lightbulb className="w-4 h-4" /> Recommendations
                  </div>
                  <ul className="text-sm text-muted-foreground space-y-1">
                    {aiInsights.recommendations.map((r, i) => <li key={i}>💡 {r}</li>)}
                  </ul>
                </div>
              </div>
              {aiInsights.tierUsed === "paid" && (
                <p className="text-[10px] text-muted-foreground mt-3 text-right">Powered by AI Pro</p>
              )}
            </CardContent>
          )}
        </Card>
      )}
    </section>
  );
}
