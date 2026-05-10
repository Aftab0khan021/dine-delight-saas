import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { TrendingUp, Activity, Zap, DollarSign, Inbox } from 'lucide-react';

interface UsageStats {
    totalRequests: number;
    successRate: number;
    avgConfidence: number;
    byProvider: Record<string, number>;
    overTime: Array<{ date: string; count: number }>;
}

interface ProviderCost {
    provider_name: string;
    estimated_cost_per_1k: string;
    is_free: boolean;
}

export default function AIUsageAnalytics() {
    const [loading, setLoading] = useState(true);
    const [timeRange, setTimeRange] = useState('7');
    const [nlpStats, setNlpStats] = useState<UsageStats | null>(null);
    const [totalCost, setTotalCost] = useState(0);
    const [providerCosts, setProviderCosts] = useState<ProviderCost[]>([]);

    useEffect(() => {
        fetchProviderCosts();
    }, []);

    useEffect(() => {
        if (providerCosts.length > 0 || true) {
            fetchAnalytics();
        }
    }, [timeRange, providerCosts]);

    // Bug Fix #3: Fetch real costs from DB instead of hardcoding
    const fetchProviderCosts = async () => {
        try {
            const { data } = await supabase
                .from('ai_providers')
                .select('provider_name, estimated_cost_per_1k, is_free');
            setProviderCosts(data || []);
        } catch (error) {
            console.error('Error fetching provider costs:', error);
        }
    };

    // Parse cost string like "$0.002" or "Free" or "$0.006/min" into numeric per-request cost
    const parseCostPerRequest = (costStr: string, isFree: boolean): number => {
        if (isFree || !costStr || costStr.toLowerCase() === 'free') return 0;
        const match = costStr.match(/[\d.]+/);
        if (!match) return 0;
        const perThousand = parseFloat(match[0]);
        return perThousand / 1000; // Convert per-1K to per-request
    };

    const fetchAnalytics = async () => {
        setLoading(true);
        try {
            const daysAgo = parseInt(timeRange);
            const startDate = new Date();
            startDate.setDate(startDate.getDate() - daysAgo);

            // Fetch NLP usage
            const { data: nlpData, error: nlpError } = await supabase
                .from('nlp_parse_cache')
                .select('provider_used, confidence_score, created_at')
                .gte('created_at', startDate.toISOString());

            if (nlpError) throw nlpError;

            const records = nlpData || [];

            // Process data
            const byProvider: Record<string, number> = {};
            let totalConfidence = 0;
            let validConfidenceCount = 0;
            const byDate: Record<string, number> = {};

            records.forEach((item) => {
                // By provider
                byProvider[item.provider_used] = (byProvider[item.provider_used] || 0) + 1;

                // Confidence — only count non-null values
                if (item.confidence_score != null) {
                    totalConfidence += item.confidence_score;
                    validConfidenceCount++;
                }

                // By date
                const date = new Date(item.created_at).toLocaleDateString();
                byDate[date] = (byDate[date] || 0) + 1;
            });

            const overTime = Object.entries(byDate)
                .map(([date, count]) => ({ date, count }))
                .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

            // Bug Fix #2: Calculate real success rate (confidence > 0.5 = success)
            const successCount = records.filter(r => (r.confidence_score ?? 0) > 0.5).length;
            const successRate = records.length > 0 ? (successCount / records.length) * 100 : 0;

            // Bug Fix #2: Calculate real avg confidence (avoid NaN)
            const avgConfidence = validConfidenceCount > 0
                ? totalConfidence / validConfidenceCount
                : 0;

            setNlpStats({
                totalRequests: records.length,
                successRate,
                avgConfidence,
                byProvider,
                overTime,
            });

            // Bug Fix #3: Calculate costs from DB provider data
            const cost = Object.entries(byProvider).reduce((total, [provider, count]) => {
                const providerInfo = providerCosts.find(p => p.provider_name === provider);
                if (!providerInfo) return total;
                const costPerReq = parseCostPerRequest(providerInfo.estimated_cost_per_1k, providerInfo.is_free);
                return total + (count * costPerReq);
            }, 0);

            setTotalCost(cost);

        } catch (error) {
            console.error('Error fetching analytics:', error);
        } finally {
            setLoading(false);
        }
    };

    const providerChartData = nlpStats
        ? Object.entries(nlpStats.byProvider).map(([name, value]) => ({
            name: name.charAt(0).toUpperCase() + name.slice(1),
            value,
        }))
        : [];

    const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];
    const hasData = (nlpStats?.totalRequests ?? 0) > 0;

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
        );
    }

    return (
        <div className="w-full space-y-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <h1 className="text-2xl sm:text-3xl font-bold">AI Usage Analytics</h1>
                    <p className="text-muted-foreground mt-1">
                        Monitor AI feature usage, performance, and costs
                    </p>
                </div>
                <Select value={timeRange} onValueChange={setTimeRange}>
                    <SelectTrigger className="w-full sm:w-[180px]">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="7">Last 7 Days</SelectItem>
                        <SelectItem value="30">Last 30 Days</SelectItem>
                        <SelectItem value="90">Last 90 Days</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            {/* Summary Cards — Bug Fix #2: Real data, no fake growth stats */}
            <div className="grid gap-4 md:grid-cols-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Requests</CardTitle>
                        <Activity className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{nlpStats?.totalRequests.toLocaleString() ?? 0}</div>
                        <p className="text-xs text-muted-foreground">
                            Last {timeRange} days
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Success Rate</CardTitle>
                        <TrendingUp className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            {hasData ? `${nlpStats!.successRate.toFixed(1)}%` : '—'}
                        </div>
                        <p className="text-xs text-muted-foreground">
                            Confidence &gt; 0.5 threshold
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Avg Confidence</CardTitle>
                        <Zap className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            {hasData ? nlpStats!.avgConfidence.toFixed(2) : '—'}
                        </div>
                        <p className="text-xs text-muted-foreground">
                            Scale 0.0 — 1.0
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Estimated Cost</CardTitle>
                        <DollarSign className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">${totalCost.toFixed(4)}</div>
                        <p className="text-xs text-muted-foreground">
                            Based on provider rates
                        </p>
                    </CardContent>
                </Card>
            </div>

            {/* Bug Fix #8: Show empty state when no data */}
            {!hasData ? (
                <Card>
                    <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                        <Inbox className="h-12 w-12 text-muted-foreground/40 mb-4" />
                        <h3 className="text-lg font-semibold">No AI Usage Data Yet</h3>
                        <p className="text-muted-foreground mt-2 max-w-md">
                            AI usage analytics will appear here once restaurants start using AI features 
                            like NLP ordering, image recognition, or voice transcription.
                        </p>
                    </CardContent>
                </Card>
            ) : (
                <>
                    {/* Charts */}
                    <div className="grid gap-4 md:grid-cols-2">
                        <Card>
                            <CardHeader>
                                <CardTitle>Requests by Provider</CardTitle>
                                <CardDescription>Distribution of AI provider usage</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <ResponsiveContainer width="100%" height={300}>
                                    <PieChart>
                                        <Pie
                                            data={providerChartData}
                                            cx="50%"
                                            cy="50%"
                                            labelLine={false}
                                            label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                                            outerRadius={80}
                                            fill="#8884d8"
                                            dataKey="value"
                                        >
                                            {providerChartData.map((_, index) => (
                                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                            ))}
                                        </Pie>
                                        <Tooltip />
                                    </PieChart>
                                </ResponsiveContainer>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <CardTitle>Requests Over Time</CardTitle>
                                <CardDescription>Daily request volume</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <ResponsiveContainer width="100%" height={300}>
                                    <LineChart data={nlpStats?.overTime || []}>
                                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                                        <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                                        <YAxis tick={{ fontSize: 10 }} />
                                        <Tooltip />
                                        <Line type="monotone" dataKey="count" stroke="#6366f1" strokeWidth={2} dot={false} />
                                    </LineChart>
                                </ResponsiveContainer>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Provider Breakdown */}
                    <Card>
                        <CardHeader>
                            <CardTitle>Provider Performance</CardTitle>
                            <CardDescription>Detailed breakdown by provider</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <ResponsiveContainer width="100%" height={300}>
                                <BarChart data={providerChartData}>
                                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                                    <XAxis dataKey="name" />
                                    <YAxis />
                                    <Tooltip />
                                    <Bar dataKey="value" fill="#6366f1" radius={[4, 4, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </CardContent>
                    </Card>
                </>
            )}
        </div>
    );
}
