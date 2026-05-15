import { useMemo, useState, useEffect } from "react";
import { format } from "date-fns";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";

import { supabase } from "@/integrations/supabase/client";
import { useRestaurantContext } from "../state/restaurant-context";
import { useToast } from "@/hooks/use-toast";
import { FeatureGate } from "../components/FeatureGate";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatMoney } from "@/lib/formatting";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle, DollarSign, CreditCard, Percent, X, Plus, Check, Crown, Zap, Rocket } from "lucide-react";

type SubscriptionRow = {
  id: string;
  plan_id: string;
  restaurant_id: string;
  status: string;
  current_period_end: string | null;
  trial_ends_at: string | null;
  created_at: string;
};

type PlanRow = {
  id: string;
  name: string;
  slug: string;
  price_cents: number;
  currency: string;
  billing_period: "monthly" | "yearly";
  trial_days: number;
  features: Record<string, any>;
};

type InvoiceRow = {
  id: string;
  provider_invoice_id: string;
  status: string;
  currency_code: string;
  amount_due_cents: number;
  amount_paid_cents: number;
  created_at: string;
  due_at: string | null;
  paid_at: string | null;
  hosted_invoice_url: string | null;
  invoice_pdf_url: string | null;
};

// ── Feature keys shown in the plan comparison grid ──
const COMPARISON_FEATURES: { key: string; label: string }[] = [
  { key: 'online_ordering', label: 'Online Ordering' },
  { key: 'qr_menu', label: 'QR Menu' },
  { key: 'table_ordering', label: 'Table Ordering' },
  { key: 'kitchen_display', label: 'Kitchen Display' },
  { key: 'reviews', label: 'Customer Reviews' },
  { key: 'coupons', label: 'Coupons & Discounts' },
  { key: 'online_payments', label: 'Online Payments' },
  { key: 'table_reservations', label: 'Table Reservations' },
  { key: 'delivery_zones', label: 'Delivery Zones' },
  { key: 'inventory_management', label: 'Inventory Mgmt' },
  { key: 'customer_management', label: 'Customer CRM' },
  { key: 'analytics', label: 'Advanced Analytics' },
  { key: 'menu_insights', label: 'Menu Insights (AI)' },
  { key: 'smart_ranking', label: 'Smart Menu Ranking' },
  { key: 'order_heatmap', label: 'Order Heatmap' },
  { key: 'ai_descriptions', label: 'AI Descriptions' },
  { key: 'sentiment_analysis', label: 'Review Sentiment' },
  { key: 'whatsapp_crm', label: 'WhatsApp CRM' },
  { key: 'whatsapp_bot', label: 'WhatsApp Bot' },
  { key: 'api_access', label: 'Developer API' },
  { key: 'otp_verification', label: 'OTP Verification' },
  { key: 'loyalty_program', label: 'Loyalty Program' },
  { key: 'staff_categories', label: 'Staff Categories' },
  { key: 'email_marketing', label: 'Email Marketing' },
  { key: 'custom_domain', label: 'Custom Domain' },
  { key: 'multi_location', label: 'Multi-Location' },
  { key: 'priority_support', label: 'Priority Support' },
  { key: 'white_label', label: 'White Label' },
];

const PLAN_ICONS: Record<string, React.ReactNode> = {
  starter: <Zap className="h-5 w-5" />,
  professional: <Rocket className="h-5 w-5" />,
  enterprise: <Crown className="h-5 w-5" />,
};

const PLAN_GRADIENTS: Record<string, string> = {
  starter: 'from-orange-400 via-amber-400 to-yellow-400',
  professional: 'from-blue-500 via-cyan-500 to-teal-500',
  enterprise: 'from-violet-500 via-purple-500 to-fuchsia-500',
};

function AllPlansComparison({ currentPlanSlug }: { currentPlanSlug?: string }) {
  const { data: plans, isLoading } = useQuery({
    queryKey: ['billing', 'all-plans'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('subscription_plans')
        .select('id, name, slug, price_cents, currency, billing_period, trial_days, features, description')
        .eq('is_active', true)
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[1, 2, 3].map(i => (
          <Card key={i} className="animate-pulse">
            <CardContent className="p-6 space-y-4">
              <div className="h-6 w-24 bg-muted rounded" />
              <div className="h-8 w-32 bg-muted rounded" />
              <div className="space-y-2">
                {[1, 2, 3, 4, 5].map(j => <div key={j} className="h-3 w-full bg-muted rounded" />)}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (!plans?.length) return null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {plans.map((plan: any) => {
        const isCurrent = plan.slug === currentPlanSlug;
        const features = plan.features || {};
        const gradient = PLAN_GRADIENTS[plan.slug] || PLAN_GRADIENTS.starter;
        const icon = PLAN_ICONS[plan.slug];

        return (
          <Card
            key={plan.id}
            className={`relative overflow-hidden transition-all ${
              isCurrent ? 'ring-2 ring-primary shadow-lg' : 'hover:shadow-md'
            }`}
          >
            {/* Gradient bar */}
            <div className={`h-1.5 w-full bg-gradient-to-r ${gradient}`} />

            {/* Current badge */}
            {isCurrent && (
              <div className="absolute top-3 right-3">
                <Badge className="bg-primary text-primary-foreground text-[10px]">Current Plan</Badge>
              </div>
            )}

            <CardContent className="p-5 space-y-4">
              {/* Plan header */}
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-muted-foreground">
                  {icon}
                  <span className="text-xs font-medium uppercase tracking-wider">{plan.name}</span>
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="text-2xl font-bold">
                    {formatMoney(plan.price_cents, plan.currency)}
                  </span>
                  <span className="text-xs text-muted-foreground">/ {plan.billing_period}</span>
                </div>
                {plan.trial_days > 0 && (
                  <p className="text-xs text-muted-foreground">{plan.trial_days}-day free trial</p>
                )}
              </div>

              {plan.description && (
                <p className="text-xs text-muted-foreground leading-relaxed">{plan.description}</p>
              )}

              <Separator />

              {/* Limits */}
              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Staff</span>
                  <span className="font-medium">{features.staff_limit === -1 ? 'Unlimited' : features.staff_limit ?? '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Menu Items</span>
                  <span className="font-medium">{features.menu_items_limit === -1 ? 'Unlimited' : features.menu_items_limit ?? '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">API Rate</span>
                  <span className="font-medium">{features.api_rate_limit === -1 ? 'Unlimited' : features.api_rate_limit ? `${features.api_rate_limit}/min` : '—'}</span>
                </div>
              </div>

              <Separator />

              {/* Feature checklist */}
              <div className="space-y-1.5">
                {COMPARISON_FEATURES.map(f => {
                  const enabled = features[f.key] === true;
                  return (
                    <div key={f.key} className="flex items-center gap-2 text-xs">
                      {enabled ? (
                        <Check className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                      ) : (
                        <X className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />
                      )}
                      <span className={enabled ? 'text-foreground' : 'text-muted-foreground/60 line-through'}>{f.label}</span>
                    </div>
                  );
                })}
              </div>

              {/* CTA */}
              {!isCurrent && (
                <Button variant="outline" size="sm" className="w-full mt-2">
                  Contact to upgrade
                </Button>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

export default function RestaurantBilling() {
  const { restaurant } = useRestaurantContext();
  const { toast } = useToast();
  const qc = useQueryClient();

  // ─── Tax & Tip State ───────────────────────────────────────────
  type BillCharge = { label: string; type: 'percentage' | 'flat'; value: number };
  const [taxRate, setTaxRate] = useState(5);
  const [taxLabel, setTaxLabel] = useState('GST');
  const [billCharges, setBillCharges] = useState<BillCharge[]>([]);
  const [tipEnabled, setTipEnabled] = useState(true);
  const [tipMode, setTipMode] = useState<'percentage' | 'amount' | 'both'>('percentage');
  const [tipPercentages, setTipPercentages] = useState('10,15,20');
  const [tipAmounts, setTipAmounts] = useState('20,50,100');
  const [savingTax, setSavingTax] = useState(false);

  // ─── Payment State ─────────────────────────────────────────────
  const [payEnabled, setPayEnabled] = useState(false);
  const [razorpayKeyId, setRazorpayKeyId] = useState('');
  const [razorpayKeySecret, setRazorpayKeySecret] = useState('');
  const [savingPayment, setSavingPayment] = useState(false);

  // ─── Restaurant Settings Query ─────────────────────────────────
  const settingsQuery = useQuery({
    queryKey: ['admin', 'billing-settings', restaurant?.id],
    enabled: !!restaurant?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from('restaurants')
        .select('settings, online_payments_enabled, razorpay_key_id')
        .eq('id', restaurant!.id)
        .single();
      return data;
    },
  });

  useEffect(() => {
    if (!settingsQuery.data) return;
    const s = (settingsQuery.data as any)?.settings || {};
    setTaxRate(s.tax_rate ?? 5);
    setTaxLabel(s.tax_label || 'GST');
    setBillCharges(Array.isArray(s.bill_charges) ? s.bill_charges : []);
    setTipEnabled(s.tip_config?.enabled ?? true);
    setTipMode(s.tip_config?.mode || 'percentage');
    setTipPercentages((s.tip_config?.percentage_options || [10, 15, 20]).join(','));
    setTipAmounts((s.tip_config?.amount_options || [20, 50, 100]).join(','));
    setPayEnabled(!!(settingsQuery.data as any).online_payments_enabled);
    setRazorpayKeyId((settingsQuery.data as any).razorpay_key_id || '');
    // Secret is write-only — never read back to client. Show placeholder if key_id exists.
    setRazorpayKeySecret('');
  }, [settingsQuery.data]);

  const handleSaveTax = async () => {
    if (!restaurant?.id) return;
    setSavingTax(true);
    try {
      const currentSettings = (settingsQuery.data as any)?.settings || {};
      const { error } = await supabase
        .from('restaurants')
        .update({
          settings: {
            ...currentSettings,
            tax_rate: taxRate,
            tax_label: taxLabel,
            bill_charges: billCharges,
            tip_config: {
              enabled: tipEnabled,
              mode: tipMode,
              percentage_options: tipPercentages.split(',').map(Number).filter(n => n > 0),
              amount_options: tipAmounts.split(',').map(Number).filter(n => n > 0),
            },
          },
        } as any)
        .eq('id', restaurant.id);
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ['admin', 'billing-settings'] });
      qc.invalidateQueries({ queryKey: ['admin', 'restaurant'] });
      toast({ title: 'Tax & Tip settings saved' });
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setSavingTax(false);
    }
  };

  const handleSavePayment = async () => {
    if (!restaurant?.id) return;
    setSavingPayment(true);
    try {
      const updatePayload: any = {
          online_payments_enabled: payEnabled,
          razorpay_key_id: razorpayKeyId.trim() || null,
        };
        // Only update secret if user entered a new value (not empty placeholder)
        if (razorpayKeySecret.trim()) {
          updatePayload.razorpay_key_secret = razorpayKeySecret.trim();
        }
        const { error } = await supabase
        .from('restaurants')
        .update(updatePayload)
        .eq('id', restaurant.id);
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ['admin', 'billing-settings'] });
      qc.invalidateQueries({ queryKey: ['admin', 'restaurant'] });
      toast({ title: 'Payment settings saved' });
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setSavingPayment(false);
    }
  };

  // FIX: Was 2 sequential queries (subscription then plan). Now one embedded join.
  const subscriptionQuery = useQuery({
    queryKey: ["admin", "billing", restaurant?.id, "subscription"],
    enabled: !!restaurant?.id,
    retry: false,
    queryFn: async () => {
      const restaurantId = restaurant!.id;
      try {
        const { data: subscription, error: subError } = await supabase
          .from("subscriptions")
          .select(
            "id, plan_id, restaurant_id, status, current_period_end, trial_ends_at, created_at, subscription_plans(id, name, slug, price_cents, currency, billing_period, trial_days, features)",
          )
          .eq("restaurant_id", restaurantId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (subError) {
          if (import.meta.env.DEV) console.warn("Subscription query error (non-fatal):", subError.message);
          return { subscription: null, plan: null };
        }
        if (!subscription) return { subscription: null, plan: null };

        const { subscription_plans: plan, ...sub } = subscription as any;
        return { subscription: sub as SubscriptionRow, plan: plan as PlanRow | null };
      } catch (e) {
        if (import.meta.env.DEV) console.warn("Subscription fetch failed:", e);
        return { subscription: null, plan: null };
      }
    },
  });

  const invoicesQuery = useQuery({
    queryKey: ["admin", "billing", restaurant?.id, "invoices"],
    enabled: !!restaurant?.id,
    retry: false,
    queryFn: async () => {
      const restaurantId = restaurant!.id;
      try {
        const { data, error } = await supabase
          .from("invoices")
          .select(
            "id,provider_invoice_id,status,currency_code,amount_due_cents,amount_paid_cents,created_at,due_at,paid_at,hosted_invoice_url,invoice_pdf_url",
          )
          .eq("restaurant_id", restaurantId)
          .order("created_at", { ascending: false })
          .limit(50);

        if (error) {
          if (import.meta.env.DEV) console.warn("Invoices query error (non-fatal):", error.message);
          return [] as InvoiceRow[];
        }
        return (data ?? []) as InvoiceRow[];
      } catch (e) {
        if (import.meta.env.DEV) console.warn("Invoices fetch failed:", e);
        return [] as InvoiceRow[];
      }
    },
  });

  const planSummary = useMemo(() => {
    if (!subscriptionQuery.data) return null;
    const { subscription, plan } = subscriptionQuery.data;
    if (!subscription) return null;

    const statusLabel =
      subscription.status === "active"
        ? "Active"
        : subscription.status === "trialing"
        ? "Trialing"
        : subscription.status === "past_due"
        ? "Past due"
        : subscription.status === "canceled"
        ? "Cancelled"
        : subscription.status ?? "Unknown";

    const nextRenewal =
      subscription.current_period_end &&
      format(new Date(subscription.current_period_end), "PP");

    const trialEnds =
      subscription.trial_ends_at &&
      format(new Date(subscription.trial_ends_at), "PP");

    return {
      subscription,
      plan,
      statusLabel,
      nextRenewal,
      trialEnds,
    };
  }, [subscriptionQuery.data]);

  return (
    <div className="flex flex-col gap-4 w-full">
      <section className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Billing</h1>
        <p className="text-sm text-muted-foreground">
          Manage your subscription, review invoices, and understand your
          current plan.
        </p>
      </section>

      <section className="grid gap-4 grid-cols-1 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <Card className="shadow-sm overflow-hidden">
          {/* Plan tier color bar */}
          <div className={`h-1.5 w-full ${
            planSummary?.plan?.slug === 'enterprise' ? 'bg-gradient-to-r from-violet-500 via-purple-500 to-fuchsia-500' :
            planSummary?.plan?.slug === 'professional' ? 'bg-gradient-to-r from-blue-500 via-cyan-500 to-teal-500' :
            'bg-gradient-to-r from-orange-400 via-amber-400 to-yellow-400'
          }`} />
          <CardHeader>
            <CardTitle className="text-base">Current Plan</CardTitle>
            <CardDescription>
              Your restaurant&apos;s subscription and renewal details.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!restaurant?.id ? (
              <p className="text-sm text-muted-foreground">
                Select a restaurant to view billing information.
              </p>
            ) : subscriptionQuery.isLoading ? (
              <div className="space-y-3">
                <div className="h-6 w-32 rounded bg-muted animate-pulse" />
                <div className="h-4 w-48 rounded bg-muted animate-pulse" />
                <div className="h-4 w-40 rounded bg-muted animate-pulse" />
              </div>
            ) : subscriptionQuery.isError ? (
              <p className="text-sm text-destructive">
                Unable to load subscription details.
              </p>
            ) : !planSummary ? (
              <div className="space-y-3">
                <div className="p-4 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800">
                  <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
                    No active subscription
                  </p>
                  <p className="text-xs text-amber-700 dark:text-amber-400 mt-1">
                    Contact support to choose a plan and activate billing for this restaurant.
                  </p>
                </div>
                <Button type="button" variant="default" size="sm" className="w-full">
                  Contact support about billing
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Plan name + status */}
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm text-muted-foreground">Plan</p>
                    <p className="text-xl font-bold">
                      {planSummary.plan?.name ?? "Custom plan"}
                    </p>
                    {planSummary.plan && (
                      <p className="text-sm text-muted-foreground">
                        {formatMoney(planSummary.plan.price_cents, planSummary.plan.currency)}{" "}
                        / {planSummary.plan.billing_period}
                      </p>
                    )}
                  </div>
                  <Badge
                    variant="secondary"
                    className={
                      planSummary.subscription.status === 'active' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400' :
                      planSummary.subscription.status === 'trialing' ? 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400' :
                      planSummary.subscription.status === 'past_due' ? 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400' :
                      ''
                    }
                  >
                    {planSummary.statusLabel}
                  </Badge>
                </div>

                {/* Trial countdown */}
                {planSummary.subscription.status === 'trialing' && planSummary.subscription.trial_ends_at && (() => {
                  const daysLeft = Math.max(0, Math.ceil((new Date(planSummary.subscription.trial_ends_at).getTime() - Date.now()) / 86400000));
                  return (
                    <div className={`p-3 rounded-lg border text-sm ${daysLeft <= 3 ? 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800 text-red-700 dark:text-red-400' : 'bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-400'}`}>
                      <p className="font-medium">⏳ {daysLeft} day{daysLeft !== 1 ? 's' : ''} left in trial</p>
                      <p className="text-xs mt-0.5 opacity-80">Trial ends {planSummary.trialEnds}</p>
                    </div>
                  );
                })()}

                <Separator />

                {/* Key dates */}
                <dl className="grid grid-cols-2 gap-3 text-sm">
                  <div className="space-y-0.5">
                    <dt className="text-xs text-muted-foreground">Restaurant</dt>
                    <dd className="font-medium text-sm">{restaurant?.name}</dd>
                  </div>
                  {planSummary.nextRenewal && (
                    <div className="space-y-0.5">
                      <dt className="text-xs text-muted-foreground">Next renewal</dt>
                      <dd className="font-medium text-sm">{planSummary.nextRenewal}</dd>
                    </div>
                  )}
                  <div className="space-y-0.5">
                    <dt className="text-xs text-muted-foreground">Member since</dt>
                    <dd className="font-medium text-sm">
                      {planSummary.subscription.created_at
                        ? format(new Date(planSummary.subscription.created_at), "PP")
                        : "—"}
                    </dd>
                  </div>
                </dl>

                <Separator />

                {/* Usage meters */}
                {planSummary.plan && (() => {
                  const planFeatures = (planSummary.plan as any)?.features || (subscriptionQuery.data as any)?.plan?.features;
                  if (!planFeatures) return null;
                  const staffLimit = planFeatures.staff_limit;
                  const menuLimit = planFeatures.menu_items_limit;
                  return (
                    <div className="space-y-3">
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Plan Limits</p>
                      {staffLimit !== undefined && (
                        <div className="space-y-1">
                          <div className="flex justify-between text-xs">
                            <span className="text-muted-foreground">Staff members</span>
                            <span className="font-medium">{staffLimit === -1 ? 'Unlimited' : `Up to ${staffLimit}`}</span>
                          </div>
                          {staffLimit !== -1 && (
                            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                              <div className="h-full rounded-full bg-primary/70 transition-all" style={{ width: '0%' }} />
                            </div>
                          )}
                        </div>
                      )}
                      {menuLimit !== undefined && (
                        <div className="space-y-1">
                          <div className="flex justify-between text-xs">
                            <span className="text-muted-foreground">Menu items</span>
                            <span className="font-medium">{menuLimit === -1 ? 'Unlimited' : `Up to ${menuLimit}`}</span>
                          </div>
                          {menuLimit !== -1 && (
                            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                              <div className="h-full rounded-full bg-primary/70 transition-all" style={{ width: '0%' }} />
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })()}

                <div className="pt-1">
                  <p className="text-xs text-muted-foreground mb-2">
                    Plan changes are managed by the platform team.
                  </p>
                  <div className="flex gap-2 flex-wrap">
                    <Button type="button" variant="outline" size="sm" className="flex-1 min-w-0">
                      Contact support
                    </Button>
                    <Button type="button" variant="default" size="sm" className="flex-1 min-w-0" asChild>
                      <Link to="/admin/explore-features">View all features</Link>
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Invoices</CardTitle>
            <CardDescription>
              Recent invoices for this restaurant.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {invoicesQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">Loading invoices…</p>
            ) : invoicesQuery.isError ? (
              <p className="text-sm text-destructive">
                Unable to load invoices.
              </p>
            ) : invoicesQuery.data?.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No invoices found yet.
              </p>
            ) : (
              <div className="w-full overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[180px]">
                        Invoice
                      </TableHead>
                      <TableHead className="min-w-[120px]">
                        Status
                      </TableHead>
                      <TableHead className="min-w-[140px]">
                        Amount due
                      </TableHead>
                      <TableHead className="min-w-[140px]">
                        Amount paid
                      </TableHead>
                      <TableHead className="min-w-[140px]">
                        Issued
                      </TableHead>
                      <TableHead className="min-w-[140px]">
                        Paid
                      </TableHead>
                      <TableHead className="min-w-[140px] text-right">
                        Actions
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {invoicesQuery.data!.map((invoice) => (
                      <TableRow key={invoice.id}>
                        <TableCell className="font-mono text-xs">
                          {invoice.provider_invoice_id}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">{invoice.status}</Badge>
                        </TableCell>
                        <TableCell className="text-sm">
                          {formatMoney(
                            invoice.amount_due_cents,
                            invoice.currency_code,
                          )}
                        </TableCell>
                        <TableCell className="text-sm">
                          {formatMoney(
                            invoice.amount_paid_cents,
                            invoice.currency_code,
                          )}
                        </TableCell>
                        <TableCell className="text-sm">
                          {invoice.created_at
                            ? format(new Date(invoice.created_at), "PP")
                            : "—"}
                        </TableCell>
                        <TableCell className="text-sm">
                          {invoice.paid_at
                            ? format(new Date(invoice.paid_at), "PP")
                            : "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="inline-flex flex-wrap justify-end gap-2">
                            <Button
                              asChild
                              size="sm"
                              variant="outline"
                              disabled={!invoice.hosted_invoice_url}
                            >
                              <a
                                href={invoice.hosted_invoice_url ?? undefined}
                                target="_blank"
                                rel="noreferrer"
                              >
                                View
                              </a>
                            </Button>
                            <Button
                              asChild
                              size="sm"
                              variant="outline"
                              disabled={!invoice.invoice_pdf_url}
                            >
                              <a
                                href={invoice.invoice_pdf_url ?? undefined}
                                target="_blank"
                                rel="noreferrer"
                              >
                                PDF
                              </a>
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      {/* ─── Plan Comparison ─── */}
      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Compare Plans</h2>
          <p className="text-sm text-muted-foreground">See what&apos;s included in each plan and find the right fit for your restaurant.</p>
        </div>

        <AllPlansComparison currentPlanSlug={planSummary?.plan?.slug} />
      </section>
      {/* ─── Tax & Bill Charges ─── */}
      <section className="space-y-1">
        <h2 className="text-lg font-semibold tracking-tight flex items-center gap-2">
          <DollarSign className="h-5 w-5 text-muted-foreground" /> Taxes & Bill Charges
        </h2>
        <p className="text-sm text-muted-foreground">Configure GST, service charges, packing fees shown on the customer bill.</p>
      </section>

      <section className="grid gap-4 grid-cols-1 lg:grid-cols-2">
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Primary Tax</CardTitle>
            <CardDescription>Your main tax shown on all orders</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Label</Label>
                <Input value={taxLabel} onChange={e => setTaxLabel(e.target.value)} placeholder="GST" className="h-8" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Rate (%)</Label>
                <Input type="number" min={0} max={30} step={0.5} value={taxRate} onChange={e => setTaxRate(Number(e.target.value))} className="h-8" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">Add extra charges below for CGST, SGST, service fees, etc.</p>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Tip for Staff</CardTitle>
            <CardDescription>Let customers tip your staff at checkout</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm">Enable Tips</Label>
              <Switch checked={tipEnabled} onCheckedChange={setTipEnabled} />
            </div>
            {tipEnabled && (
              <>
                <div className="grid grid-cols-3 gap-1.5">
                  {(['percentage', 'amount', 'both'] as const).map(m => (
                    <button key={m} onClick={() => setTipMode(m)}
                      className={`rounded-md border py-1.5 text-xs font-medium capitalize ${
                        tipMode === m ? 'border-primary bg-primary/10 text-primary' : 'border-muted text-muted-foreground'
                      }`}>
                      {m}
                    </button>
                  ))}
                </div>
                {(tipMode === 'percentage' || tipMode === 'both') && (
                  <div className="space-y-1">
                    <Label className="text-xs">% Options (comma-separated)</Label>
                    <Input value={tipPercentages} onChange={e => setTipPercentages(e.target.value)} placeholder="10,15,20" className="h-8" />
                  </div>
                )}
                {(tipMode === 'amount' || tipMode === 'both') && (
                  <div className="space-y-1">
                    <Label className="text-xs">Amount Options ₹ (comma-separated)</Label>
                    <Input value={tipAmounts} onChange={e => setTipAmounts(e.target.value)} placeholder="20,50,100" className="h-8" />
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </section>

      {/* Additional charges */}
      <Card className="shadow-sm">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Additional Bill Charges</CardTitle>
              <CardDescription>CGST, SGST, service charge, packing fee, delivery fee, etc.</CardDescription>
            </div>
            <Button type="button" size="sm" variant="outline"
              onClick={() => setBillCharges(prev => [...prev, { label: '', type: 'percentage', value: 0 }])}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Add Charge
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {billCharges.length === 0 && (
            <p className="text-sm text-muted-foreground italic">No additional charges. Click "Add Charge" above.</p>
          )}
          {billCharges.map((charge, idx) => (
            <div key={idx} className="flex items-end gap-2 border rounded-lg p-3 bg-muted/30">
              <div className="flex-1 space-y-1">
                <Label className="text-[11px]">Label</Label>
                <Input value={charge.label}
                  onChange={e => setBillCharges(prev => prev.map((c, i) => i === idx ? { ...c, label: e.target.value } : c))}
                  placeholder="e.g. CGST, Service Charge" className="h-8 text-sm" />
              </div>
              <div className="w-28 space-y-1">
                <Label className="text-[11px]">Type</Label>
                <select value={charge.type}
                  onChange={e => setBillCharges(prev => prev.map((c, i) => i === idx ? { ...c, type: e.target.value as any } : c))}
                  className="flex h-8 w-full rounded-md border border-input bg-transparent px-2 py-1 text-sm">
                  <option value="percentage">%</option>
                  <option value="flat">₹ Flat</option>
                </select>
              </div>
              <div className="w-20 space-y-1">
                <Label className="text-[11px]">{charge.type === 'percentage' ? 'Rate' : 'Amount'}</Label>
                <Input type="number" min={0} step={charge.type === 'percentage' ? 0.5 : 1}
                  value={charge.value}
                  onChange={e => setBillCharges(prev => prev.map((c, i) => i === idx ? { ...c, value: Number(e.target.value) } : c))}
                  className="h-8 text-sm" />
              </div>
              <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-destructive"
                onClick={() => setBillCharges(prev => prev.filter((_, i) => i !== idx))}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
          <Button onClick={handleSaveTax} disabled={savingTax} className="w-full mt-2">
            {savingTax ? 'Saving…' : 'Save Tax & Charges'}
          </Button>
        </CardContent>
      </Card>

      {/* ─── Payment Gateway (gated by online_payments) ─── */}
      <FeatureGate featureKey="online_payments" featureName="Online Payments" description="Accept UPI, cards, and wallets via Razorpay. Upgrade your plan to enable online payment collection." mode="inline">
      <section className="space-y-1">
        <h2 className="text-lg font-semibold tracking-tight flex items-center gap-2">
          <CreditCard className="h-5 w-5 text-muted-foreground" /> Payment Gateway
        </h2>
        <p className="text-sm text-muted-foreground">Accept UPI, cards, and wallets via Razorpay.</p>
      </section>

      <Card className="shadow-sm">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Razorpay Integration</CardTitle>
              <CardDescription>Enable online payments for your customers (UPI, cards, wallets)</CardDescription>
            </div>
            <Switch checked={payEnabled} onCheckedChange={setPayEnabled} />
          </div>
        </CardHeader>
        {payEnabled && (
          <CardContent className="space-y-3 border-t pt-4">
            {razorpayKeyId.startsWith('rzp_test_') && (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>Test Mode — no real charges will be made.</AlertDescription>
              </Alert>
            )}
            <div className="space-y-1">
              <Label className="text-sm">Razorpay Key ID</Label>
              <Input value={razorpayKeyId} onChange={e => setRazorpayKeyId(e.target.value)}
                placeholder="rzp_test_xxxxxxxxxxxx" className="font-mono text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-sm">Razorpay Key Secret</Label>
              <Input type="password" value={razorpayKeySecret} onChange={e => setRazorpayKeySecret(e.target.value)}
                placeholder="••••••••••••••••" className="font-mono text-sm" />
            </div>
            <p className="text-xs text-muted-foreground">
              Get your keys from{' '}
              <a href="https://dashboard.razorpay.com/app/keys" target="_blank" rel="noopener noreferrer" className="underline text-primary">
                Razorpay Dashboard → Settings → API Keys
              </a>
            </p>
          </CardContent>
        )}
        <CardContent className={payEnabled ? 'border-t pt-4' : ''}>
          <Button onClick={handleSavePayment} disabled={savingPayment} variant="outline" className="w-full">
            {savingPayment ? 'Saving…' : 'Save Payment Settings'}
          </Button>
        </CardContent>
      </Card>
      </FeatureGate>
    </div>
  );
}