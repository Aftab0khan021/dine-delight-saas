import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

interface RevenueDataPoint {
    month: string;
    mrr: number;
    arr: number;
}

interface RevenueChartProps {
    data: RevenueDataPoint[];
    isLoading?: boolean;
}

export function RevenueChart({ data, isLoading }: RevenueChartProps) {
    if (isLoading) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>Revenue Trends</CardTitle>
                    <CardDescription>Monthly Recurring Revenue (MRR) and Annual Run Rate (ARR)</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="h-[300px] flex items-center justify-center">
                        <div className="animate-pulse text-muted-foreground">Loading chart...</div>
                    </div>
                </CardContent>
            </Card>
        );
    }

    // Format currency
    const formatCurrency = (value: number) => {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0,
        }).format(value / 100);
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle>Revenue Trends</CardTitle>
                <CardDescription>Monthly Recurring Revenue (MRR) and Annual Run Rate (ARR)</CardDescription>
            </CardHeader>
            <CardContent>
                {data.length === 0 ? (
                    <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                        No revenue data available
                    </div>
                ) : (
                    <ResponsiveContainer width="100%" height={300}>
                        <LineChart data={data}>
                            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                            <XAxis
                                dataKey="month"
                                className="text-xs"
                                tick={{ fill: 'hsl(var(--muted-foreground))' }}
                            />
                            <YAxis
                                className="text-xs"
                                tick={{ fill: 'hsl(var(--muted-foreground))' }}
                                tickFormatter={formatCurrency}
                            />
                            <Tooltip
                                contentStyle={{
                                    backgroundColor: 'hsl(var(--background))',
                                    border: '1px solid hsl(var(--border))',
                                    borderRadius: '8px',
                                }}
                                formatter={(value: number) => formatCurrency(value)}
                            />
                            <Legend />
                            <Line
                                type="monotone"
                                dataKey="mrr"
                                stroke="hsl(var(--primary))"
                                strokeWidth={2}
                                name="MRR"
                                dot={{ fill: 'hsl(var(--primary))' }}
                            />
                            <Line
                                type="monotone"
                                dataKey="arr"
                                stroke="hsl(var(--chart-2))"
                                strokeWidth={2}
                                name="ARR"
                                dot={{ fill: 'hsl(var(--chart-2))' }}
                            />
                        </LineChart>
                    </ResponsiveContainer>
                )}
            </CardContent>
        </Card>
    );
}
