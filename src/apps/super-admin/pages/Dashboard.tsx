import { useEffect, useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRealtimeSync } from "@/hooks/useRealtimeSync";
import {
  Building2,
  Users,
  DollarSign,
  TrendingUp,
  AlertTriangle,
  Activity,
  PieChart as PieChartIcon
} from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { MetricCard } from "../components/MetricCard";
import { RevenueChart } from "../components/RevenueChart";
import { ActivityFeed } from "../components/ActivityFeed";
import { AlertsList } from "../components/AlertsList";
import { formatMoney } from "@/lib/formatting";
import {
  getPlatformMetrics,
  getRevenueTrends,
  getRecentActivity,
  getSystemAlerts,
  getGrowthMetrics,
} from "../lib/analytics";

const PIE_COLORS = ["#6366f1", "#8b5cf6", "#ec4899", "#f59e0b", "#10b981", "#3b82f6", "#ef4444"];

export default function SuperAdminDashboard() {
  const [dismissedAlerts, setDismissedAlerts] = useState<string[]>([]);
  const qc = useQueryClient();

  // ── Real-time: new restaurant signups and subscription changes appear live ──
  // Super admin has no restaurant_id filter — we watch all changes platform-wide.
  useRealtimeSync(
    "platform", // Sentinel ID so the channel is unique; filter is disabled below
    [
      { table: "restaurants",  queryKey: ["platform-metrics"],  filterColumn: null },
      { table: "subscriptions", queryKey: ["platform-metrics"], filterColumn: null },
      { table: "subscriptions", queryKey: ["plan-distribution"], filterColumn: null },
    ]
  );

  // Fetch platform metrics
  const { data: metrics, isLoading: metricsLoading } = useQuery({
    queryKey: ['platform-metrics'],
    queryFn: getPlatformMetrics,
    refetchInterval: 60000,
  });

  // Fetch revenue trends
  const { data: revenueTrends, isLoading: revenueLoading } = useQuery({
    queryKey: ['revenue-trends'],
    queryFn: () => getRevenueTrends(6),
    refetchInterval: 300000,
  });

  // Fetch recent activity
  const { data: recentActivity, isLoading: activityLoading } = useQuery({
    queryKey: ['recent-activity'],
    queryFn: () => getRecentActivity(20),
    refetchInterval: 30000,
  });

  // Fetch system alerts
  const { data: systemAlerts, isLoading: alertsLoading } = useQuery({
    queryKey: ['system-alerts'],
    queryFn: getSystemAlerts,
    refetchInterval: 60000,
  });

  // Fetch growth metrics
  const { data: growth } = useQuery({
    queryKey: ['growth-metrics'],
    queryFn: getGrowthMetrics,
    refetchInterval: 300000,
  });

  // S1: Plan distribution for pie chart
  const { data: planDist = [] } = useQuery({
    queryKey: ['plan-distribution'],
    queryFn: async () => {
      const { data } = await supabase
        .from('subscriptions')
        .select('plan_id, subscription_plans(name)')
        .eq('status', 'active');
      if (!data) return [];
      const counts: Record<string, number> = {};
      data.forEach((s: any) => {
        const name = s.subscription_plans?.name || 'Unknown';
        counts[name] = (counts[name] || 0) + 1;
      });
      return Object.entries(counts).map(([name, value]) => ({ name, value }));
    },
    refetchInterval: 300000,
  });

  // S1: Churn rate (cancelled in last 30d / active at start of month)
  const { data: churnRate } = useQuery({
    queryKey: ['churn-rate'],
    queryFn: async () => {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();
      const { count: cancelled } = await supabase
        .from('subscriptions')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'cancelled')
        .gte('updated_at', thirtyDaysAgo);
      const { count: total } = await supabase
        .from('subscriptions')
        .select('id', { count: 'exact', head: true })
        .in('status', ['active', 'cancelled']);
      if (!total || total === 0) return 0;
      return Math.round(((cancelled || 0) / total) * 1000) / 10;
    },
    refetchInterval: 300000,
  });

  // Filter out dismissed alerts
  const activeAlerts = systemAlerts?.filter(
    (alert) => !dismissedAlerts.includes(alert.id)
  ) || [];

  const handleDismissAlert = (id: string) => {
    setDismissedAlerts((prev) => [...prev, id]);
  };

  // Format currency — uses INR as platform default, override per restaurant where needed
  const formatCurrency = (cents: number | undefined) => {
    if (!cents) return '₹0';
    return formatMoney(cents, 'INR');
  };

  return (
    <section className="flex flex-col gap-4 w-full">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Platform overview and key metrics
        </p>
      </header>

      {/* Key Metrics */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title="Total Restaurants"
          value={metricsLoading ? "..." : metrics?.total_restaurants || 0}
          description={`${metrics?.active_restaurants || 0} active`}
          icon={Building2}
          trend={growth ? {
            value: growth.growthPercent,
            isPositive: growth.isPositive,
          } : undefined}
        />
        <MetricCard
          title="Active Subscriptions"
          value={metricsLoading ? "..." : metrics?.active_subscriptions || 0}
          description="Paying customers"
          icon={Users}
        />
        <MetricCard
          title="Monthly Recurring Revenue"
          value={metricsLoading ? "..." : formatCurrency(metrics?.mrr_cents)}
          description="MRR"
          icon={DollarSign}
        />
        <MetricCard
          title="Orders (30 days)"
          value={metricsLoading ? "..." : metrics?.orders_30d || 0}
          description={`${metrics?.total_orders || 0} total orders`}
          icon={TrendingUp}
        />
      </div>

      {/* Alerts */}
      {activeAlerts.length > 0 && (
        <AlertsList alerts={activeAlerts} onDismiss={handleDismissAlert} />
      )}

      {/* Charts and Activity */}
      <div className="grid gap-6 grid-cols-1 md:grid-cols-2">
        {/* Revenue Chart */}
        <div className="md:col-span-2">
          <RevenueChart
            data={revenueTrends || []}
            isLoading={revenueLoading}
          />
        </div>

        {/* Recent Activity */}
        <ActivityFeed
          activities={recentActivity || []}
          isLoading={activityLoading}
        />

        {/* Quick Stats */}
        <div className="flex flex-col gap-4 w-full">
          <div className="grid gap-4">
            <MetricCard
              title="New Restaurants (30d)"
              value={metricsLoading ? "..." : metrics?.new_restaurants_30d || 0}
              description="New signups this month"
              icon={Building2}
            />
            <MetricCard
              title="Total Users"
              value={metricsLoading ? "..." : metrics?.total_users || 0}
              description="Across all restaurants"
              icon={Users}
            />
            <MetricCard
              title="Suspended Accounts"
              value={metricsLoading ? "..." : metrics?.suspended_restaurants || 0}
              description="Requires attention"
              icon={AlertTriangle}
              className={
                (metrics?.suspended_restaurants || 0) > 0
                  ? "border-destructive"
                  : ""
              }
            />
          </div>
        </div>
      </div>

      {/* S1: Plan Distribution + Additional Metrics */}
      <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2"><PieChartIcon className="h-4 w-4" /> Plan Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            {planDist.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={planDist} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, value }) => `${name} (${value})`}>
                    {planDist.map((_: any, i: number) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-muted-foreground text-sm text-center py-8">No active subscriptions</p>
            )}
          </CardContent>
        </Card>

        <div className="grid gap-4 grid-cols-1">
          <MetricCard
            title="ARR"
            value={metricsLoading ? "..." : formatCurrency((metrics?.mrr_cents || 0) * 12)}
            description="Annual Run Rate"
            icon={DollarSign}
          />
          <MetricCard
            title="Churn Rate (30d)"
            value={churnRate != null ? `${churnRate}%` : "..."}
            description={churnRate != null && churnRate > 5 ? "⚠️ Above 5% threshold" : "Healthy"}
            icon={TrendingUp}
            className={churnRate != null && churnRate > 5 ? "border-amber-500" : ""}
          />
          <MetricCard
            title="Avg Revenue/Restaurant"
            value={metricsLoading ? "..." : formatCurrency(Math.round((metrics?.mrr_cents || 0) / Math.max(metrics?.active_restaurants || 1, 1)))}
            description="Per active restaurant"
            icon={Activity}
          />
        </div>
      </div>
    </section>
  );
}
