import { supabase } from "@/integrations/supabase/client";
import { PlatformMetrics, RestaurantHealthScore } from "../types/super-admin";

/**
 * Fetch platform-wide metrics
 */
export async function getPlatformMetrics(): Promise<PlatformMetrics | null> {
    const { data, error } = await supabase
        .from('platform_metrics')
        .select('*')
        .single();

    if (error) {
        console.error('Error fetching platform metrics:', error);
        return null;
    }

    return data;
}

/**
 * Fetch revenue trends for the last N months
 */
export async function getRevenueTrends(months: number = 6) {
    const { data, error } = await supabase.rpc('get_revenue_trends', {
        months_back: months
    });

    if (error) {
        console.error('Error fetching revenue trends:', error);
        // Fallback to manual calculation
        return calculateRevenueTrendsManual(months);
    }

    return data;
}

/**
 * Manual calculation of revenue trends (fallback)
 */
async function calculateRevenueTrendsManual(months: number) {
    const trends = [];
    const now = new Date();

    for (let i = months - 1; i >= 0; i--) {
        const monthDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const monthStart = monthDate.toISOString();
        const monthEnd = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0).toISOString();

        // Get active subscriptions for this month
        const { data: subs } = await supabase
            .from('subscriptions')
            .select('plan_id, subscription_plans(price_cents, billing_period)')
            .eq('status', 'active')
            .gte('current_period_start', monthStart)
            .lte('current_period_start', monthEnd);

        let mrr = 0;
        if (subs) {
            mrr = subs.reduce((sum, sub: any) => {
                const plan = sub.subscription_plans;
                if (plan && plan.billing_period === 'monthly') {
                    return sum + plan.price_cents;
                } else if (plan && plan.billing_period === 'yearly') {
                    return sum + (plan.price_cents / 12);
                }
                return sum;
            }, 0);
        }

        trends.push({
            month: monthDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
            mrr: Math.round(mrr),
            arr: Math.round(mrr * 12),
        });
    }

    return trends;
}

/**
 * Fetch restaurant health scores
 */
export async function getRestaurantHealthScores(limit: number = 10): Promise<RestaurantHealthScore[]> {
    const { data, error } = await supabase
        .from('restaurant_health_scores')
        .select('*')
        .order('health_score', { ascending: false })
        .limit(limit);

    if (error) {
        console.error('Error fetching health scores:', error);
        return [];
    }

    return data || [];
}

/**
 * Fetch recent super admin activity
 */
export async function getRecentActivity(limit: number = 20) {
    const { data, error } = await supabase
        .from('super_admin_audit_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);

    if (error) {
        console.error('Error fetching activity:', error);
        return [];
    }

    return data || [];
}

/**
 * Generate system alerts based on platform state
 */
export async function getSystemAlerts() {
    const alerts = [];

    // Check for failed payments
    const { data: failedPayments } = await supabase
        .from('invoices')
        .select('id')
        .eq('status', 'failed')
        .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());

    if (failedPayments && failedPayments.length > 0) {
        alerts.push({
            id: 'failed-payments',
            title: 'Failed Payments Detected',
            description: `${failedPayments.length} payment(s) failed in the last 7 days`,
            severity: 'warning' as const,
            timestamp: new Date().toISOString(),
            action: {
                label: 'View Invoices',
                onClick: () => window.location.href = '/superadmin/invoices',
            },
        });
    }

    // Check for suspended restaurants
    const { data: suspended } = await supabase
        .from('restaurants')
        .select('id')
        .eq('status', 'suspended');

    if (suspended && suspended.length > 0) {
        alerts.push({
            id: 'suspended-restaurants',
            title: 'Suspended Restaurants',
            description: `${suspended.length} restaurant(s) currently suspended`,
            severity: 'info' as const,
            timestamp: new Date().toISOString(),
            action: {
                label: 'View Restaurants',
                onClick: () => window.location.href = '/superadmin/restaurants',
            },
        });
    }

    // Check for low health scores
    const { data: unhealthy } = await supabase
        .from('restaurant_health_scores')
        .select('id, name, health_score')
        .lt('health_score', 50);

    if (unhealthy && unhealthy.length > 0) {
        alerts.push({
            id: 'unhealthy-restaurants',
            title: 'Low Health Score Alert',
            description: `${unhealthy.length} restaurant(s) with health score below 50`,
            severity: 'warning' as const,
            timestamp: new Date().toISOString(),
            action: {
                label: 'View Details',
                onClick: () => window.location.href = '/superadmin/restaurants',
            },
        });
    }

    // Check for expiring trials
    const { data: expiringTrials } = await supabase
        .from('subscriptions')
        .select('id')
        .eq('status', 'trialing')
        .lte('current_period_end', new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString());

    if (expiringTrials && expiringTrials.length > 0) {
        alerts.push({
            id: 'expiring-trials',
            title: 'Trials Expiring Soon',
            description: `${expiringTrials.length} trial(s) expiring in the next 3 days`,
            severity: 'info' as const,
            timestamp: new Date().toISOString(),
            action: {
                label: 'View Subscriptions',
                onClick: () => window.location.href = '/superadmin/subscriptions',
            },
        });
    }

    return alerts;
}

/**
 * Calculate growth metrics
 */
export async function getGrowthMetrics() {
    const now = new Date();
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const twoMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 2, 1);

    // Get current month stats
    const { data: currentMonth } = await supabase
        .from('restaurants')
        .select('id')
        .gte('created_at', lastMonth.toISOString());

    // Get previous month stats
    const { data: previousMonth } = await supabase
        .from('restaurants')
        .select('id')
        .gte('created_at', twoMonthsAgo.toISOString())
        .lt('created_at', lastMonth.toISOString());

    const currentCount = currentMonth?.length || 0;
    const previousCount = previousMonth?.length || 0;

    const growth = previousCount > 0
        ? ((currentCount - previousCount) / previousCount) * 100
        : 0;

    return {
        currentMonth: currentCount,
        previousMonth: previousCount,
        growthPercent: Math.round(growth * 10) / 10,
        isPositive: growth >= 0,
    };
}
