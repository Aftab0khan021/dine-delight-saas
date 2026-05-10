import { ReactNode } from "react";
import { Lock, ArrowUpRight, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { useRestaurantContext } from "../state/restaurant-context";
import { useFeatureAccess } from "../hooks/useFeatureAccess";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

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
  /**
   * Display mode when the feature is locked:
   * - "page" (default): Full-page upgrade banner with heading
   * - "inline": Compact locked card within a page section
   */
  mode?: "page" | "inline";
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
  mode = "page",
}: FeatureGateProps) {
  const { restaurant } = useRestaurantContext();
  const { isFeatureEnabled, isLoading } = useFeatureAccess(restaurant?.id);

  // While loading, show a minimal skeleton to avoid flicker
  if (isLoading) {
    // Inline mode: compact loader that doesn't disrupt page layout
    if (mode === "inline") {
      return (
        <div className="flex items-center justify-center py-4">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      );
    }
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

  // ── Inline locked card ──
  if (mode === "inline") {
    return (
      <Card className="relative overflow-hidden border-dashed border-border/60 bg-muted/20">
        {/* Premium accent bar */}
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-amber-400 via-orange-500 to-rose-500 opacity-60" />

        <CardContent className="flex items-center gap-4 p-5">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-muted">
            <Lock className="h-5 w-5 text-muted-foreground" />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold text-sm">{featureName}</h3>
              <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800">
                <Lock className="h-2.5 w-2.5 mr-0.5" />
                Premium
              </Badge>
            </div>
            {description && (
              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                {description}
              </p>
            )}
          </div>

          <Button variant="outline" size="sm" className="shrink-0" asChild>
            <Link to="/admin/billing">
              Upgrade <ArrowUpRight className="ml-1 h-3.5 w-3.5" />
            </Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  // ── Full-page locked banner (default mode="page") ──
  return (
    <div className="flex flex-col gap-4 w-full">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{featureName}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          This feature is not available on your current plan.
        </p>
      </div>

      <Card className="relative overflow-hidden shadow-sm border-dashed">
        {/* Premium gradient accent */}
        <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-amber-400 via-orange-500 to-rose-500 opacity-70" />

        <CardContent className="flex flex-col items-center justify-center py-16 text-center gap-4">
          <div className="relative">
            <div className="grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/40 dark:to-orange-950/40 border border-amber-200/50 dark:border-amber-800/50">
              <Lock className="h-7 w-7 text-amber-600 dark:text-amber-400" />
            </div>
            <div className="absolute -top-1 -right-1 grid h-5 w-5 place-items-center rounded-full bg-amber-500 text-white">
              <Sparkles className="h-3 w-3" />
            </div>
          </div>

          <div className="max-w-md space-y-2">
            <h2 className="text-lg font-semibold">{featureName}</h2>
            <p className="text-sm text-muted-foreground">
              {description ||
                `Upgrade your subscription plan to unlock ${featureName}. Contact your administrator for access.`}
            </p>
          </div>

          <div className="flex gap-3 mt-2">
            <Button asChild>
              <Link to="/admin/billing">
                View Plans <ArrowUpRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link to="/admin/explore">
                <Sparkles className="mr-2 h-4 w-4" />
                All Features
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
