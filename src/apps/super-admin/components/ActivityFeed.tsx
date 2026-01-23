import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from "date-fns";

interface ActivityItem {
    id: string;
    action: string;
    admin_user_id: string;
    entity_type: string | null;
    restaurant_id: string | null;
    created_at: string;
    metadata?: Record<string, any>;
}

interface ActivityFeedProps {
    activities: ActivityItem[];
    isLoading?: boolean;
}

export function ActivityFeed({ activities, isLoading }: ActivityFeedProps) {
    if (isLoading) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>Recent Activity</CardTitle>
                    <CardDescription>Latest super admin actions</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="space-y-4">
                        {[...Array(5)].map((_, i) => (
                            <div key={i} className="flex items-center space-x-4 animate-pulse">
                                <div className="h-8 w-8 rounded-full bg-muted" />
                                <div className="flex-1 space-y-2">
                                    <div className="h-4 bg-muted rounded w-3/4" />
                                    <div className="h-3 bg-muted rounded w-1/2" />
                                </div>
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle>Recent Activity</CardTitle>
                <CardDescription>Latest super admin actions</CardDescription>
            </CardHeader>
            <CardContent>
                <ScrollArea className="h-[400px] pr-4">
                    {activities.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">
                            No recent activity
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {activities.map((activity) => (
                                <div
                                    key={activity.id}
                                    className="flex items-start space-x-4 pb-4 border-b last:border-0"
                                >
                                    <div className="flex-1 space-y-1">
                                        <div className="flex items-center gap-2">
                                            <p className="text-sm font-medium leading-none">
                                                {formatAction(activity.action)}
                                            </p>
                                            {activity.entity_type && (
                                                <Badge variant="outline" className="text-xs">
                                                    {activity.entity_type}
                                                </Badge>
                                            )}
                                        </div>
                                        <p className="text-xs text-muted-foreground">
                                            {formatDistanceToNow(new Date(activity.created_at), {
                                                addSuffix: true,
                                            })}
                                        </p>
                                        {activity.metadata && Object.keys(activity.metadata).length > 0 && (
                                            <p className="text-xs text-muted-foreground">
                                                {JSON.stringify(activity.metadata, null, 2).substring(0, 100)}
                                            </p>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </ScrollArea>
            </CardContent>
        </Card>
    );
}

function formatAction(action: string): string {
    return action
        .split('_')
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}
