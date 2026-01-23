import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { CheckCircle, XCircle, Edit } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface FeatureAccessMatrixProps {
    restaurantId: string;
    onOverride?: (featureKey: string) => void;
}

interface FeatureAccess {
    feature_key: string;
    feature_name: string;
    feature_description: string | null;
    is_enabled: boolean;
    source: 'override' | 'plan' | 'global' | 'default';
    plan_name: string | null;
    override_config: Record<string, any> | null;
}

export function FeatureAccessMatrix({ restaurantId, onOverride }: FeatureAccessMatrixProps) {
    const { data: features, isLoading } = useQuery({
        queryKey: ['restaurant-feature-access', restaurantId],
        queryFn: async () => {
            const { data, error } = await (supabase as any)
                .from('restaurant_feature_access')
                .select('*')
                .eq('restaurant_id', restaurantId)
                .order('feature_key');

            if (error) throw error;
            return data as FeatureAccess[];
        },
        enabled: !!restaurantId,
    });

    const getSourceBadge = (source: string) => {
        const variants: Record<string, any> = {
            override: { variant: 'default', label: 'Override', className: 'bg-purple-600' },
            plan: { variant: 'secondary', label: 'Plan', className: '' },
            global: { variant: 'outline', label: 'Global', className: '' },
            default: { variant: 'outline', label: 'Default', className: 'opacity-60' },
        };

        const config = variants[source] || variants.default;
        return (
            <Badge variant={config.variant} className={config.className}>
                {config.label}
            </Badge>
        );
    };

    if (isLoading) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>Feature Access</CardTitle>
                    <CardDescription>Loading feature access information...</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="space-y-2">
                        {[1, 2, 3, 4, 5].map((i) => (
                            <Skeleton key={i} className="h-12 w-full" />
                        ))}
                    </div>
                </CardContent>
            </Card>
        );
    }

    if (!features || features.length === 0) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>Feature Access</CardTitle>
                    <CardDescription>No features configured</CardDescription>
                </CardHeader>
                <CardContent>
                    <p className="text-sm text-muted-foreground">
                        No feature flags have been created yet. Create feature flags in the Feature Flags page.
                    </p>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle>Feature Access</CardTitle>
                <CardDescription>
                    Features enabled for this restaurant based on plan, overrides, and global settings
                </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Feature</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Source</TableHead>
                            <TableHead>Plan</TableHead>
                            <TableHead className="w-[100px]">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {features.map((feature) => (
                            <TableRow key={feature.feature_key}>
                                <TableCell>
                                    <div>
                                        <div className="font-medium">{feature.feature_name}</div>
                                        <div className="text-sm text-muted-foreground">
                                            {feature.feature_description || feature.feature_key}
                                        </div>
                                    </div>
                                </TableCell>
                                <TableCell>
                                    <div className="flex items-center gap-2">
                                        {feature.is_enabled ? (
                                            <>
                                                <CheckCircle className="h-4 w-4 text-green-600" />
                                                <span className="text-green-600 font-medium">Enabled</span>
                                            </>
                                        ) : (
                                            <>
                                                <XCircle className="h-4 w-4 text-muted-foreground" />
                                                <span className="text-muted-foreground">Disabled</span>
                                            </>
                                        )}
                                    </div>
                                </TableCell>
                                <TableCell>{getSourceBadge(feature.source)}</TableCell>
                                <TableCell>
                                    {feature.plan_name ? (
                                        <span className="text-sm">{feature.plan_name}</span>
                                    ) : (
                                        <span className="text-sm text-muted-foreground">No plan</span>
                                    )}
                                </TableCell>
                                <TableCell>
                                    {onOverride && (
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => onOverride(feature.feature_key)}
                                        >
                                            <Edit className="h-4 w-4" />
                                        </Button>
                                    )}
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </CardContent>
        </Card>
    );
}
