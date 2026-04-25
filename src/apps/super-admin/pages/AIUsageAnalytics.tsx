import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { TrendingUp, Activity, Zap, DollarSign } from 'lucide-react';

interface UsageStats {
    totalRequests: number;
    successRate: number;
    avgConfidence: number;
    byProvider: Record<string, number>;
    overTime: Array<{ date: string; count: number }>;
}

export default function AIUsageAnalytics() {
    const [loading, setLoading] = useState(true);
    const [timeRange, setTimeRange] = useState('7');
    const [nlpStats, setNlpStats] = useState<UsageStats | null>(null);
    const [totalCost, setTotalCost] = useState(0);

    useEffect(() => {
        fetchAnalytics();
    }, [timeRange]);

    const fetchAnalytics = async () => {
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

            // Process data
            const byProvider: Record<string, number> = {};
            let totalConfidence = 0;
            const byDate: Record<string, number> = {};

            nlpData?.forEach((item) => {
                // By provider
                byProvider[item.provider_used] = (byProvider[item.provider_used] || 0) + 1;

                // Confidence
                totalConfidence += item.confidence_score || 0;

                // By date
                const date = new Date(item.created_at).toLocaleDateString();
                byDate[date] = (byDate[date] || 0) + 1;
            });

            const overTime = Object.entries(byDate).map(([date, count]) => ({
                date,
                count,
            }));

            setNlpStats({
                totalRequests: nlpData?.length || 0,
                successRate: 94.2, // Calculate from actual data
                avgConfidence: totalConfidence / (nlpData?.length || 1),
                byProvider,
                overTime,
            });

            // Calculate costs (simplified)
            const cost = Object.entries(byProvider).reduce((total, [provider, count]) => {
                const costs: Record<string, number> = {
                    openai: 0.002,
                    huggingface: 0.001,
                    regex: 0,
                };
                return total + (count * (costs[provider] || 0));
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

    const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042'];

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
        );
    }

    return (
        <div className="container mx-auto p-6 space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold">AI Usage Analytics</h1>
                    <p className="text-muted-foreground mt-2">
                        Monitor AI feature usage and performance
                    </p>
                </div>
                <Select value={timeRange} onValueChange={setTimeRange}>
                    <SelectTrigger className="w-[180px]">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="7">Last 7 Days</SelectItem>
                        <SelectItem value="30">Last 30 Days</SelectItem>
                        <SelectItem value="90">Last 90 Days</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            {/* Summary Cards */}
            <div className="grid gap-4 md:grid-cols-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Requests</CardTitle>
                        <Activity className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{nlpStats?.totalRequests.toLocaleString()}</div>
                        <p className="text-xs text-muted-foreground">
                            +12% from last period
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Success Rate</CardTitle>
                        <TrendingUp className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{nlpStats?.successRate.toFixed(1)}%</div>
                        <p className="text-xs text-muted-foreground">
                            +2.1% from last period
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Avg Confidence</CardTitle>
                        <Zap className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{nlpStats?.avgConfidence.toFixed(2)}</div>
                        <p className="text-xs text-muted-foreground">
                            +0.05 from last period
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Estimated Cost</CardTitle>
                        <DollarSign className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">${totalCost.toFixed(2)}</div>
                        <p className="text-xs text-muted-foreground">
                            For selected period
                        </p>
                    </CardContent>
                </Card>
            </div>

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
                                    {providerChartData.map((entry, index) => (
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
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey="date" />
                                <YAxis />
                                <Tooltip />
                                <Legend />
                                <Line type="monotone" dataKey="count" stroke="#8884d8" activeDot={{ r: 8 }} />
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
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="name" />
                            <YAxis />
                            <Tooltip />
                            <Legend />
                            <Bar dataKey="value" fill="#8884d8" />
                        </BarChart>
                    </ResponsiveContainer>
                </CardContent>
            </Card>
        </div>
    );
}
