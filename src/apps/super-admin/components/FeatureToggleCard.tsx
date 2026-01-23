import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Info } from "lucide-react";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";

interface FeatureToggleCardProps {
    featureKey: string;
    featureName: string;
    description: string;
    enabled: boolean;
    onToggle: (enabled: boolean) => void;
    disabled?: boolean;
    source?: 'override' | 'plan' | 'global' | 'default';
    showSource?: boolean;
}

export function FeatureToggleCard({
    featureKey,
    featureName,
    description,
    enabled,
    onToggle,
    disabled = false,
    source,
    showSource = false,
}: FeatureToggleCardProps) {
    const getSourceBadgeVariant = (src?: string) => {
        switch (src) {
            case 'override':
                return 'default';
            case 'plan':
                return 'secondary';
            case 'global':
                return 'outline';
            default:
                return 'outline';
        }
    };

    const getSourceLabel = (src?: string) => {
        switch (src) {
            case 'override':
                return 'Override';
            case 'plan':
                return 'Plan';
            case 'global':
                return 'Global';
            default:
                return 'Default';
        }
    };

    return (
        <Card className="border-l-4 border-l-primary/20">
            <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 space-y-1">
                        <div className="flex items-center gap-2">
                            <Label
                                htmlFor={featureKey}
                                className="text-base font-medium cursor-pointer"
                            >
                                {featureName}
                            </Label>
                            <TooltipProvider>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Info className="h-4 w-4 text-muted-foreground" />
                                    </TooltipTrigger>
                                    <TooltipContent>
                                        <p className="max-w-xs">{description}</p>
                                    </TooltipContent>
                                </Tooltip>
                            </TooltipProvider>
                            {showSource && source && (
                                <Badge variant={getSourceBadgeVariant(source)} className="text-xs">
                                    {getSourceLabel(source)}
                                </Badge>
                            )}
                        </div>
                        <p className="text-sm text-muted-foreground">{description}</p>
                        <code className="text-xs bg-muted px-2 py-0.5 rounded">
                            {featureKey}
                        </code>
                    </div>
                    <Switch
                        id={featureKey}
                        checked={enabled}
                        onCheckedChange={onToggle}
                        disabled={disabled}
                    />
                </div>
            </CardContent>
        </Card>
    );
}
