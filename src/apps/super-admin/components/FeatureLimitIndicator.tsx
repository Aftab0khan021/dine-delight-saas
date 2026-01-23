import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertCircle, CheckCircle, Infinity, Edit } from "lucide-react";

interface FeatureLimitIndicatorProps {
    limitKey: string;
    limitName: string;
    currentUsage: number;
    maxLimit: number; // -1 for unlimited
    warningThreshold?: number; // default 80%
    unit?: string; // e.g., "users", "requests", "MB"
    onEdit?: () => void; // Optional edit callback
}

export function FeatureLimitIndicator({
    limitKey,
    limitName,
    currentUsage,
    maxLimit,
    warningThreshold = 80,
    unit = "items",
    onEdit,
}: FeatureLimitIndicatorProps) {
    const isUnlimited = maxLimit === -1;
    const percentage = isUnlimited ? 0 : (currentUsage / maxLimit) * 100;
    const isNearLimit = percentage >= warningThreshold;
    const isAtLimit = percentage >= 100;

    const getStatusColor = () => {
        if (isUnlimited) return "text-green-600";
        if (isAtLimit) return "text-destructive";
        if (isNearLimit) return "text-orange-600";
        return "text-green-600";
    };

    const getStatusIcon = () => {
        if (isUnlimited) return <Infinity className="h-4 w-4" />;
        if (isAtLimit) return <AlertCircle className="h-4 w-4" />;
        if (isNearLimit) return <AlertCircle className="h-4 w-4" />;
        return <CheckCircle className="h-4 w-4" />;
    };

    const getProgressColor = () => {
        if (isAtLimit) return "bg-destructive";
        if (isNearLimit) return "bg-orange-500";
        return "bg-primary";
    };

    return (
        <Card>
            <CardContent className="p-4">
                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <span className={getStatusColor()}>{getStatusIcon()}</span>
                            <div>
                                <p className="text-sm font-medium">{limitName}</p>
                                <code className="text-xs text-muted-foreground">{limitKey}</code>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <Badge variant={isUnlimited ? "default" : isAtLimit ? "destructive" : "secondary"}>
                                {isUnlimited ? (
                                    "Unlimited"
                                ) : (
                                    <>
                                        {currentUsage} / {maxLimit} {unit}
                                    </>
                                )}
                            </Badge>
                            {onEdit && (
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={onEdit}
                                    className="h-8 w-8 p-0"
                                >
                                    <Edit className="h-4 w-4" />
                                </Button>
                            )}
                        </div>
                    </div>

                    {!isUnlimited && (
                        <>
                            <Progress
                                value={Math.min(percentage, 100)}
                                className={`h-2 ${getProgressColor()}`}
                            />
                            <div className="flex justify-between text-xs text-muted-foreground">
                                <span>{percentage.toFixed(1)}% used</span>
                                {isAtLimit && (
                                    <span className="text-destructive font-medium">Limit reached</span>
                                )}
                                {isNearLimit && !isAtLimit && (
                                    <span className="text-orange-600 font-medium">
                                        Near limit ({(100 - percentage).toFixed(1)}% remaining)
                                    </span>
                                )}
                            </div>
                        </>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}
