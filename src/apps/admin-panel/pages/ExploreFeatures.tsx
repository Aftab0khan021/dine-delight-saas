import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useRestaurantContext } from "../state/restaurant-context";
import { usePermissionContext } from "../state/permission-context";
import { useFeatureAccess } from "../hooks/useFeatureAccess";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Sparkles,
  Lock,
  ArrowUpRight,
  ChefHat,
  Ticket,
  CalendarDays,
  Star,
  Package,
  UserCheck,
  MapPin,
  MessageCircle,
  BarChart3,
  PieChart,
  Code2,
  Bot,
  Shield,
  Settings,
  Gift,
  CreditCard,
  type LucideIcon,
} from "lucide-react";

// ── Feature catalog — single source of truth for all gated features ──
type FeatureMeta = {
  key: string;
  name: string;
  description: string;
  icon: LucideIcon;
  route: string;
  tier: "core" | "growth";
  requiredPermission?: string; // Permission code required to see this feature
  adminOnly?: boolean; // Only visible to admins regardless of permissions
};

const FEATURE_CATALOG: FeatureMeta[] = [
  // Core features
  {
    key: "kitchen_display",
    name: "Kitchen Board",
    description: "Live kitchen order board with Kanban-style columns and real-time updates.",
    icon: ChefHat,
    route: "/admin/kitchen",
    tier: "core",
    requiredPermission: "view_kitchen",
  },
  {
    key: "coupons",
    name: "Coupons & Discounts",
    description: "Create promo codes, discount campaigns, and automated promotions.",
    icon: Ticket,
    route: "/admin/coupons",
    tier: "core",
    requiredPermission: "view_coupons",
  },
  {
    key: "table_reservations",
    name: "Table Reservations",
    description: "Allow customers to reserve tables online, manage bookings and seating.",
    icon: CalendarDays,
    route: "/admin/reservations",
    tier: "core",
    requiredPermission: "manage_settings",
  },
  {
    key: "reviews",
    name: "Customer Reviews",
    description: "View and manage customer reviews, ratings, and sentiment analysis.",
    icon: Star,
    route: "/admin/reviews",
    tier: "core",
    requiredPermission: "view_reviews",
    adminOnly: true,
  },
  {
    key: "inventory_management",
    name: "Inventory Management",
    description: "Track ingredients, manage stock levels, and auto-disable out-of-stock items.",
    icon: Package,
    route: "/admin/inventory",
    tier: "core",
    requiredPermission: "view_inventory",
  },
  {
    key: "customer_management",
    name: "Customer Management",
    description: "CRM database with customer profiles, order history, and lifetime value.",
    icon: UserCheck,
    route: "/admin/customers",
    tier: "core",
    adminOnly: true,
  },
  {
    key: "delivery_zones",
    name: "Delivery Zones",
    description: "Configure delivery areas, zone-based pricing, and estimated delivery times.",
    icon: MapPin,
    route: "/admin/delivery-zones",
    tier: "core",
    adminOnly: true,
  },
  {
    key: "staff_categories",
    name: "Staff Categories",
    description: "Create custom staff roles with granular permissions to control access.",
    icon: Settings,
    route: "/admin/staff-categories",
    tier: "core",
    adminOnly: true,
  },
  {
    key: "online_payments",
    name: "Online Payments",
    description: "Accept card, UPI, and digital payments from customers at checkout.",
    icon: CreditCard,
    route: "/admin/billing",
    tier: "core",
    adminOnly: true,
  },
  // Growth features
  {
    key: "whatsapp_crm",
    name: "WhatsApp CRM",
    description: "Send marketing campaigns, view delivery stats via WhatsApp.",
    icon: MessageCircle,
    route: "/admin/marketing",
    tier: "growth",
    adminOnly: true,
  },
  {
    key: "menu_insights",
    name: "Menu Insights",
    description: "AI-powered menu performance analytics, popularity rankings, and pairing suggestions.",
    icon: BarChart3,
    route: "/admin/insights",
    tier: "growth",
    adminOnly: true,
  },
  {
    key: "analytics",
    name: "Advanced Analytics",
    description: "Revenue trends, peak hours heatmap, customer retention, and top items analysis.",
    icon: PieChart,
    route: "/admin/analytics",
    tier: "growth",
    requiredPermission: "view_analytics",
  },
  {
    key: "api_access",
    name: "Developer API",
    description: "REST API access for headless POS integration, manage API keys and webhooks.",
    icon: Code2,
    route: "/admin/developer",
    tier: "growth",
    adminOnly: true,
  },
  {
    key: "whatsapp_bot",
    name: "WhatsApp Bot",
    description: "Automated WhatsApp ordering bot — manage bot settings and conversations.",
    icon: Bot,
    route: "/admin/whatsapp",
    tier: "growth",
    adminOnly: true,
  },
  {
    key: "otp_verification",
    name: "OTP Verification",
    description: "Phone number verification via SMS or WhatsApp OTP before checkout.",
    icon: Shield,
    route: "/admin/otp-settings",
    tier: "growth",
    adminOnly: true,
  },
  {
    key: "loyalty_program",
    name: "Loyalty Program",
    description: "Reward repeat customers with loyalty points and referral bonuses.",
    icon: Gift,
    route: "/admin/coupons",
    tier: "growth",
    adminOnly: true,
  },
];

export default function ExploreFeatures() {
  const { restaurant } = useRestaurantContext();
  const { hasPermission, isAdmin } = usePermissionContext();
  const { features, isLoading, isFeatureEnabled } = useFeatureAccess(restaurant?.id);

  const { activeFeatures, lockedFeatures } = useMemo(() => {
    const active: FeatureMeta[] = [];
    const locked: FeatureMeta[] = [];

    for (const feat of FEATURE_CATALOG) {
      // Non-admin users can only see features they have permission for
      if (!isAdmin) {
        if (feat.adminOnly) continue; // Skip admin-only features entirely
        if (feat.requiredPermission && !hasPermission(feat.requiredPermission as any)) continue;
      }

      if (isFeatureEnabled(feat.key)) {
        active.push(feat);
      } else {
        locked.push(feat);
      }
    }

    return { activeFeatures: active, lockedFeatures: locked };
  }, [features, isFeatureEnabled, isAdmin, hasPermission]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8 w-full">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <Sparkles className="h-6 w-6 text-amber-500" />
          Explore Features
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Discover all the tools available to grow your restaurant. Upgrade your plan to unlock premium features.
        </p>
      </div>

      {/* ── Section A: Active Features ── */}
      {activeFeatures.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-4">
            <div className="h-2 w-2 rounded-full bg-emerald-500" />
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Your Active Features
            </h2>
            <Badge variant="secondary" className="text-xs">{activeFeatures.length}</Badge>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {activeFeatures.map((feat) => (
              <Card
                key={feat.key}
                className="group relative overflow-hidden border-border/60 transition-all hover:border-primary/30 hover:shadow-md"
              >
                <CardContent className="flex flex-col gap-3 p-5">
                  <div className="flex items-start justify-between">
                    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                      <feat.icon className="h-5 w-5" />
                    </div>
                    <Badge variant="outline" className="text-xs text-emerald-600 border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800">
                      Active
                    </Badge>
                  </div>

                  <div>
                    <h3 className="font-semibold text-sm">{feat.name}</h3>
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                      {feat.description}
                    </p>
                  </div>

                  <Button variant="ghost" size="sm" className="w-fit mt-auto -ml-2" asChild>
                    <Link to={feat.route}>
                      Open <ArrowUpRight className="ml-1 h-3.5 w-3.5" />
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}

      {/* ── Section B: Locked Features ── */}
      {lockedFeatures.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-4">
            <Lock className="h-3.5 w-3.5 text-muted-foreground" />
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Unlock More Features
            </h2>
            <Badge variant="secondary" className="text-xs">{lockedFeatures.length}</Badge>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {lockedFeatures.map((feat) => (
              <Card
                key={feat.key}
                className="group relative overflow-hidden border-dashed border-border/60 bg-muted/20"
              >
                {/* Premium gradient accent */}
                <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-amber-400 via-orange-500 to-rose-500 opacity-60" />

                <CardContent className="flex flex-col gap-3 p-5">
                  <div className="flex items-start justify-between">
                    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground">
                      <feat.icon className="h-5 w-5" />
                    </div>
                    <Badge variant="outline" className="text-xs text-amber-600 border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800">
                      <Lock className="h-3 w-3 mr-1" />
                      Premium
                    </Badge>
                  </div>

                  <div>
                    <h3 className="font-semibold text-sm">{feat.name}</h3>
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                      {feat.description}
                    </p>
                  </div>

                  <Button variant="outline" size="sm" className="w-fit mt-auto -ml-0.5" asChild>
                    <Link to="/admin/billing">
                      View Plans <ArrowUpRight className="ml-1 h-3.5 w-3.5" />
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}

      {/* All unlocked state */}
      {lockedFeatures.length === 0 && (
        <Card className="border-emerald-200 bg-emerald-50/50 dark:border-emerald-900 dark:bg-emerald-950/20">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center gap-3">
            <Sparkles className="h-10 w-10 text-emerald-500" />
            <h3 className="font-semibold">You have access to all features!</h3>
            <p className="text-sm text-muted-foreground max-w-md">
              Your subscription includes every tool Dine Delight offers. Explore the sidebar to start using them.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
