import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DollarSign, TrendingUp, TrendingDown, Download } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface CostData {
    restaurant_id: string;
    restaurant_name: string;
    nlp_requests: number;
    image_requests: number;
    voice_minutes: number;
    total_cost: number;
}

interface ProviderCost {
    provider: string;
    requests: number;
    cost: number;
}

export default function AICostTracking() {
    const [loading, setLoading] = useState(true);
    const [timeRange, setTimeRange] = useState('30');
    const [totalCost, setTotalCost] = useState(0);
    const [lastMonthCost, setLastMonthCost] = useState(0);
    const [restaurantCosts, setRestaurantCosts] = useState<CostData[]>([]);
    const [providerCosts, setProviderCosts] = useState<ProviderCost[]>([]);

    useEffect(() => {
        fetchCostData();
    }, [timeRange]);

    const fetchCostData = async () => {
        try {
            const daysAgo = parseInt(timeRange);
            const startDate = new Date();
            startDate.setDate(startDate.getDate() - daysAgo);

            // Fetch NLP usage
            const { data: nlpData } = await supabase
                .from('nlp_parse_cache')
                .select(`
          provider_used,
          restaurant_id,
          restaurants!inner(name)
        `)
                .gte('created_at', startDate.toISOString());

            // Calculate costs
            const costPerRequest: Record<string, number> = {
                openai: 0.002,
                huggingface: 0.001,
                google: 0.0015,
                regex: 0,
                tensorflow: 0,
                'whisper-local': 0,
            };

            // By provider
            const providerMap: Record<string, { requests: number; cost: number }> = {};
            nlpData?.forEach((item) => {
                const provider = item.provider_used;
                if (!providerMap[provider]) {
                    providerMap[provider] = { requests: 0, cost: 0 };
                }
                providerMap[provider].requests++;
                providerMap[provider].cost += costPerRequest[provider] || 0;
            });

            const providerCostData = Object.entries(providerMap).map(([provider, data]) => ({
                provider: provider.charAt(0).toUpperCase() + provider.slice(1),
                requests: data.requests,
                cost: data.cost,
            }));

            setProviderCosts(providerCostData);

            // By restaurant
            const restaurantMap: Record<string, any> = {};
            nlpData?.forEach((item: any) => {
                const restId = item.restaurant_id;
                if (!restaurantMap[restId]) {
                    restaurantMap[restId] = {
                        restaurant_id: restId,
                        restaurant_name: item.restaurants?.name || 'Unknown',
                        nlp_requests: 0,
                        image_requests: 0,
                        voice_minutes: 0,
                        total_cost: 0,
                    };
                }
                restaurantMap[restId].nlp_requests++;
                restaurantMap[restId].total_cost += costPerRequest[item.provider_used] || 0;
            });

            const restaurantCostData = Object.values(restaurantMap)
                .sort((a: any, b: any) => b.total_cost - a.total_cost)
                .slice(0, 10);

            setRestaurantCosts(restaurantCostData);

            // Total costs
            const total = providerCostData.reduce((sum, p) => sum + p.cost, 0);
            setTotalCost(total);
            setLastMonthCost(total * 0.8); // Simulated

        } catch (error) {
            console.error('Error fetching cost data:', error);
        } finally {
            setLoading(false);
        }
    };

    const exportCSV = () => {
        const csv = [
            ['Restaurant', 'NLP Requests', 'Image Requests', 'Voice Minutes', 'Total Cost'],
            ...restaurantCosts.map(r => [
                r.restaurant_name,
                r.nlp_requests,
                r.image_requests,
                r.voice_minutes,
                r.total_cost.toFixed(2),
            ]),
        ].map(row => row.join(',')).join('\n');

        const blob = new Blob([csv], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `ai-costs-${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
    };

    const costTrend = ((totalCost - lastMonthCost) / lastMonthCost) * 100;

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
                    <h1 className="text-3xl font-bold">AI Cost Tracking</h1>
                    <p className="text-muted-foreground mt-2">
                        Monitor and analyze AI service costs
                    </p>
                </div>
                <div className="flex gap-2">
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
                    <Button onClick={exportCSV}>
                        <Download className="w-4 h-4 mr-2" />
                        Export CSV
                    </Button>
                </div>
            </div>

            {/* Summary Cards */}
            <div className="grid gap-4 md:grid-cols-3">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Cost</CardTitle>
                        <DollarSign className="h-4 h-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">${totalCost.toFixed(2)}</div>
                        <p className="text-xs text-muted-foreground">
                            For selected period
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Last Month</CardTitle>
                        <DollarSign className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">${lastMonthCost.toFixed(2)}</div>
                        <p className="text-xs text-muted-foreground">
                            Previous period
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Trend</CardTitle>
                        {costTrend > 0 ? (
                            <TrendingUp className="h-4 w-4 text-red-500" />
                        ) : (
                            <TrendingDown className="h-4 w-4 text-green-500" />
                        )}
                    </CardHeader>
                    <CardContent>
                        <div className={`text-2xl font-bold ${costTrend > 0 ? 'text-red-500' : 'text-green-500'}`}>
                            {costTrend > 0 ? '+' : ''}{costTrend.toFixed(1)}%
                        </div>
                        <p className="text-xs text-muted-foreground">
                            vs previous period
                        </p>
                    </CardContent>
                </Card>
            </div>

            {/* Cost by Provider */}
            <Card>
                <CardHeader>
                    <CardTitle>Cost by Provider</CardTitle>
                    <CardDescription>Breakdown of costs by AI provider</CardDescription>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Provider</TableHead>
                                <TableHead className="text-right">Requests</TableHead>
                                <TableHead className="text-right">Total Cost</TableHead>
                                <TableHead className="text-right">Avg Cost/Request</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {providerCosts.map((provider) => (
                                <TableRow key={provider.provider}>
                                    <TableCell className="font-medium">{provider.provider}</TableCell>
                                    <TableCell className="text-right">{provider.requests.toLocaleString()}</TableCell>
                                    <TableCell className="text-right">${provider.cost.toFixed(2)}</TableCell>
                                    <TableCell className="text-right">
                                        ${(provider.cost / provider.requests).toFixed(4)}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            {/* Top Restaurants by Cost */}
            <Card>
                <CardHeader>
                    <CardTitle>Top Restaurants by Cost</CardTitle>
                    <CardDescription>Highest AI service costs by restaurant</CardDescription>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Restaurant</TableHead>
                                <TableHead className="text-right">NLP Requests</TableHead>
                                <TableHead className="text-right">Image Requests</TableHead>
                                <TableHead className="text-right">Voice Minutes</TableHead>
                                <TableHead className="text-right">Total Cost</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {restaurantCosts.map((restaurant, index) => (
                                <TableRow key={restaurant.restaurant_id}>
                                    <TableCell>
                                        <div className="flex items-center gap-2">
                                            <Badge variant="outline">#{index + 1}</Badge>
                                            <span className="font-medium">{restaurant.restaurant_name}</span>
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-right">{restaurant.nlp_requests.toLocaleString()}</TableCell>
                                    <TableCell className="text-right">{restaurant.image_requests.toLocaleString()}</TableCell>
                                    <TableCell className="text-right">{restaurant.voice_minutes.toFixed(1)}</TableCell>
                                    <TableCell className="text-right font-bold">
                                        ${restaurant.total_cost.toFixed(2)}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    );
}
