import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Building2,
  Users,
  DollarSign,
  TrendingUp,
  AlertTriangle,
  Activity
} from "lucide-react";
import { MetricCard } from "../components/MetricCard";
import { RevenueChart } from "../components/RevenueChart";
import { ActivityFeed } from "../components/ActivityFeed";
import { AlertsList } from "../components/AlertsList";
import {
  getPlatformMetrics,
  getRevenueTrends,
  getRecentActivity,
  getSystemAlerts,
  getGrowthMetrics,
} from "../lib/analytics";

export default function SuperAdminDashboard() {
  const [dismissedAlerts, setDismissedAlerts] = useState<string[]>([]);

  // Fetch platform metrics
  const { data: metrics, isLoading: metricsLoading } = useQuery({
    queryKey: ['platform-metrics'],
    queryFn: getPlatformMetrics,
    refetchInterval: 60000, // Refetch every minute
  });

  // Fetch revenue trends
  const { data: revenueTrends, isLoading: revenueLoading } = useQuery({
    queryKey: ['revenue-trends'],
    queryFn: () => getRevenueTrends(6),
    refetchInterval: 300000, // Refetch every 5 minutes
  });

  // Fetch recent activity
  const { data: recentActivity, isLoading: activityLoading } = useQuery({
    queryKey: ['recent-activity'],
    queryFn: () => getRecentActivity(20),
    refetchInterval: 30000, // Refetch every 30 seconds
  });

  // Fetch system alerts
  const { data: systemAlerts, isLoading: alertsLoading } = useQuery({
    queryKey: ['system-alerts'],
    queryFn: getSystemAlerts,
    refetchInterval: 60000, // Refetch every minute
  });

  // Fetch growth metrics
  const { data: growth } = useQuery({
    queryKey: ['growth-metrics'],
    queryFn: getGrowthMetrics,
    refetchInterval: 300000, // Refetch every 5 minutes
  });

  // Filter out dismissed alerts
  const activeAlerts = systemAlerts?.filter(
    (alert) => !dismissedAlerts.includes(alert.id)
  ) || [];

  const handleDismissAlert = (id: string) => {
    setDismissedAlerts((prev) => [...prev, id]);
  };

  // Format currency
  const formatCurrency = (cents: number | undefined) => {
    if (!cents) return '$0';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(cents / 100);
  };

  return (
    <section className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Platform overview and key metrics
        </p>
      </header>

      {/* Key Metrics */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
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
      <div className="grid gap-6 md:grid-cols-2">
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
        <div className="space-y-4">
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

      {/* Additional Metrics */}
      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard
          title="Average Health Score"
          value={metricsLoading ? "..." : "85"}
          description="Platform-wide average"
          icon={Activity}
        />
        <MetricCard
          title="ARR"
          value={metricsLoading ? "..." : formatCurrency((metrics?.mrr_cents || 0) * 12)}
          description="Annual Run Rate"
          icon={DollarSign}
        />
        <MetricCard
          title="Churn Rate"
          value={metricsLoading ? "..." : "2.5%"}
          description="Last 30 days"
          icon={TrendingUp}
        />
      </div>
    </section>
  );
}
