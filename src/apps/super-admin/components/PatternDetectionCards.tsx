import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
    AbusePatternType,
    getPatternTypeLabel,
    getPatternTypeIcon,
    getPatternTypeDescription,
    getPatternThreshold,
    getPatternTimeWindow,
} from "../utils/abuseDetectionHelpers";

interface PatternCard {
    type: AbusePatternType;
    detected: number;
}

interface PatternDetectionCardsProps {
    patterns: PatternCard[];
    isLoading?: boolean;
}

export function PatternDetectionCards({ patterns, isLoading = false }: PatternDetectionCardsProps) {
    const allPatterns: AbusePatternType[] = [
        'excessive_orders',
        'failed_payments',
        'rapid_creation',
        'menu_spam',
        'staff_churn',
        'qr_abuse',
    ];

    const patternData = allPatterns.map((type) => {
        const pattern = patterns.find((p) => p.type === type);
        return {
            type,
            detected: pattern?.detected || 0,
        };
    });

    if (isLoading) {
        return (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {allPatterns.map((type) => (
                    <Card key={type}>
                        <CardHeader className="pb-3">
                            <div className="h-5 w-32 bg-gray-200 rounded animate-pulse" />
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-2">
                                <div className="h-4 w-full bg-gray-200 rounded animate-pulse" />
                                <div className="h-4 w-24 bg-gray-200 rounded animate-pulse" />
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>
        );
    }

    return (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {patternData.map(({ type, detected }) => {
                const threshold = getPatternThreshold(type);
                const timeWindow = getPatternTimeWindow(type);
                const icon = getPatternTypeIcon(type);
                const label = getPatternTypeLabel(type);
                const description = getPatternTypeDescription(type);

                return (
                    <Card key={type} className={detected > 0 ? "border-orange-200 bg-orange-50/30" : ""}>
                        <CardHeader className="pb-3">
                            <CardTitle className="text-base flex items-center gap-2">
                                <span className="text-xl">{icon}</span>
                                {label}
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            <p className="text-sm text-muted-foreground">{description}</p>
                            <div className="flex items-center justify-between">
                                <div className="text-sm text-muted-foreground">
                                    Threshold: <span className="font-medium text-foreground">{threshold}</span> / {timeWindow}
                                </div>
                                {detected > 0 ? (
                                    <Badge variant="destructive" className="ml-2">
                                        {detected} detected
                                    </Badge>
                                ) : (
                                    <Badge variant="secondary" className="ml-2">
                                        None
                                    </Badge>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                );
            })}
        </div>
    );
}
