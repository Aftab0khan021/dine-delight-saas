import { ReactNode } from "react";
import { Lock, ArrowUpRight } from "lucide-react";
import { Link } from "react-router-dom";
import { useRestaurantContext } from "../state/restaurant-context";
import { useFeatureAccess } from "../hooks/useFeatureAccess";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface FeatureGateProps {
  /** The feature_flags.key to check */
  featureKey: string;
  /** Human-readable feature name for the locked banner */
  featureName: string;
  /** Optional description shown on the locked banner */
  description?: string;
  /** Content to render when the feature is enabled */
  children: ReactNode;
  /** If true, renders nothing when disabled instead of the upgrade banner */
  hideWhenDisabled?: boolean;
}

/**
 * Wraps a page or section and conditionally renders based on feature flag status.
 * When disabled, shows a premium upgrade banner.
 */
export function FeatureGate({
  featureKey,
  featureName,
  description,
  children,
  hideWhenDisabled = false,
}: FeatureGateProps) {
  const { restaurant } = useRestaurantContext();
  const { isFeatureEnabled, isLoading } = useFeatureAccess(restaurant?.id);

  // While loading, show a minimal skeleton to avoid flicker
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  // Feature is enabled — render children
  if (isFeatureEnabled(featureKey)) {
    return <>{children}</>;
  }

  // Feature is disabled + caller wants to hide completely
  if (hideWhenDisabled) {
    return null;
  }

  // Feature is disabled — show upgrade banner
  return (
    <div className="flex flex-col gap-4 w-full">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{featureName}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          This feature is not available on your current plan.
        </p>
      </div>

      <Card className="shadow-sm border-dashed">
        <CardContent className="flex flex-col items-center justify-center py-16 text-center gap-4">
          <div className="grid h-16 w-16 place-items-center rounded-2xl bg-muted">
            <Lock className="h-7 w-7 text-muted-foreground" />
          </div>

          <div className="max-w-md space-y-2">
            <h2 className="text-lg font-semibold">{featureName}</h2>
            <p className="text-sm text-muted-foreground">
              {description ||
                `Upgrade your subscription plan to unlock ${featureName}. Contact your administrator for access.`}
            </p>
          </div>

          <div className="flex gap-3 mt-2">
            <Button variant="outline" asChild>
              <Link to="/admin/billing">
                View Plans <ArrowUpRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
