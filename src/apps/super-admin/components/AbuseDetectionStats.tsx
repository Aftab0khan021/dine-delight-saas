import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertCircle, CheckCircle, Clock, AlertTriangle } from "lucide-react";

interface AbuseDetectionStatsProps {
    activeAlerts: number;
    investigating: number;
    resolvedToday: number;
    criticalAlerts: number;
    isLoading?: boolean;
}

export function AbuseDetectionStats({
    activeAlerts,
    investigating,
    resolvedToday,
    criticalAlerts,
    isLoading = false,
}: AbuseDetectionStatsProps) {
    const stats = [
        {
            label: "Active Alerts",
            value: activeAlerts,
            icon: AlertCircle,
            color: activeAlerts > 10 ? "text-red-600" : "text-yellow-600",
            bgColor: activeAlerts > 10 ? "bg-red-50" : "bg-yellow-50",
        },
        {
            label: "Under Investigation",
            value: investigating,
            icon: Clock,
            color: "text-blue-600",
            bgColor: "bg-blue-50",
        },
        {
            label: "Resolved Today",
            value: resolvedToday,
            icon: CheckCircle,
            color: "text-green-600",
            bgColor: "bg-green-50",
        },
        {
            label: "Critical Alerts",
            value: criticalAlerts,
            icon: AlertTriangle,
            color: "text-red-600",
            bgColor: "bg-red-50",
        },
    ];

    if (isLoading) {
        return (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                {[1, 2, 3, 4].map((i) => (
                    <Card key={i}>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">
                                <div className="h-4 w-24 bg-gray-200 rounded animate-pulse" />
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="h-8 w-16 bg-gray-200 rounded animate-pulse" />
                        </CardContent>
                    </Card>
                ))}
            </div>
        );
    }

    return (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {stats.map((stat) => {
                const Icon = stat.icon;
                return (
                    <Card key={stat.label}>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium text-muted-foreground">
                                {stat.label}
                            </CardTitle>
                            <div className={`p-2 rounded-lg ${stat.bgColor}`}>
                                <Icon className={`h-4 w-4 ${stat.color}`} />
                            </div>
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{stat.value}</div>
                        </CardContent>
                    </Card>
                );
            })}
        </div>
    );
}
