import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, AlertCircle, Info, XCircle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

type AlertSeverity = 'critical' | 'warning' | 'info';

interface SystemAlert {
    id: string;
    title: string;
    description: string;
    severity: AlertSeverity;
    timestamp: string;
    action?: {
        label: string;
        onClick: () => void;
    };
}

interface AlertsListProps {
    alerts: SystemAlert[];
    onDismiss?: (id: string) => void;
}

export function AlertsList({ alerts, onDismiss }: AlertsListProps) {
    const getAlertIcon = (severity: AlertSeverity) => {
        switch (severity) {
            case 'critical':
                return <XCircle className="h-4 w-4" />;
            case 'warning':
                return <AlertTriangle className="h-4 w-4" />;
            case 'info':
                return <Info className="h-4 w-4" />;
        }
    };

    const getAlertVariant = (severity: AlertSeverity) => {
        switch (severity) {
            case 'critical':
                return 'destructive';
            case 'warning':
                return 'default';
            case 'info':
                return 'default';
        }
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle>System Alerts</CardTitle>
                <CardDescription>Important notifications and warnings</CardDescription>
            </CardHeader>
            <CardContent>
                {alerts.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                        <AlertCircle className="h-12 w-12 mx-auto mb-2 opacity-20" />
                        <p>No active alerts</p>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {alerts.map((alert) => (
                            <Alert key={alert.id} variant={getAlertVariant(alert.severity)}>
                                <div className="flex items-start gap-3">
                                    {getAlertIcon(alert.severity)}
                                    <div className="flex-1 space-y-1">
                                        <div className="flex items-center justify-between">
                                            <AlertTitle className="mb-0">{alert.title}</AlertTitle>
                                            <Badge
                                                variant={
                                                    alert.severity === 'critical'
                                                        ? 'destructive'
                                                        : alert.severity === 'warning'
                                                            ? 'default'
                                                            : 'secondary'
                                                }
                                                className="text-xs"
                                            >
                                                {alert.severity}
                                            </Badge>
                                        </div>
                                        <AlertDescription>{alert.description}</AlertDescription>
                                        <div className="flex items-center justify-between mt-2">
                                            <p className="text-xs text-muted-foreground">
                                                {formatDistanceToNow(new Date(alert.timestamp), {
                                                    addSuffix: true,
                                                })}
                                            </p>
                                            <div className="flex gap-2">
                                                {alert.action && (
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        onClick={alert.action.onClick}
                                                    >
                                                        {alert.action.label}
                                                    </Button>
                                                )}
                                                {onDismiss && (
                                                    <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        onClick={() => onDismiss(alert.id)}
                                                    >
                                                        Dismiss
                                                    </Button>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </Alert>
                        ))}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
