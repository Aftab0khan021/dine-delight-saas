import { useMemo, useState, useEffect } from "react";
import { format } from "date-fns";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { useRestaurantContext } from "../state/restaurant-context";
import { useToast } from "@/hooks/use-toast";

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
import { AlertTriangle, DollarSign, CreditCard, Percent, X, Plus } from "lucide-react";

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
    queryFn: async () => {
      const restaurantId = restaurant!.id;

      const { data: subscription, error: subError } = await supabase
        .from("subscriptions")
        .select(
          "id, plan_id, restaurant_id, status, current_period_end, trial_ends_at, created_at, subscription_plans(id, name, slug, price_cents, currency, billing_period, trial_days)",
        )
        .eq("restaurant_id", restaurantId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (subError) throw subError;
      if (!subscription) return { subscription: null, plan: null };

      const { subscription_plans: plan, ...sub } = subscription as any;
      return { subscription: sub as SubscriptionRow, plan: plan as PlanRow | null };
    },
  });

  const invoicesQuery = useQuery({
    queryKey: ["admin", "billing", restaurant?.id, "invoices"],
    enabled: !!restaurant?.id,
    queryFn: async () => {
      const restaurantId = restaurant!.id;
      const { data, error } = await supabase
        .from("invoices")
        .select(
          "id,provider_invoice_id,status,currency_code,amount_due_cents,amount_paid_cents,created_at,due_at,paid_at,hosted_invoice_url,invoice_pdf_url",
        )
        .eq("restaurant_id", restaurantId)
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) throw error;
      return (data ?? []) as InvoiceRow[];
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
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Current plan</CardTitle>
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
              <p className="text-sm text-muted-foreground">Loading plan…</p>
            ) : subscriptionQuery.isError ? (
              <p className="text-sm text-destructive">
                Unable to load subscription details.
              </p>
            ) : !planSummary ? (
              <div className="space-y-2">
                <p className="text-sm font-medium">
                  No active subscription found.
                </p>
                <p className="text-sm text-muted-foreground">
                  Contact support to choose a plan and activate billing
                  for this restaurant.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm text-muted-foreground">
                      Plan
                    </p>
                    <p className="text-lg font-semibold">
                      {planSummary.plan?.name ?? "Custom plan"}
                    </p>
                    {planSummary.plan && (
                      <p className="text-sm text-muted-foreground">
                        {formatMoney(
                          planSummary.plan.price_cents,
                          planSummary.plan.currency,
                        )}{" "}
                        / {planSummary.plan.billing_period}
                      </p>
                    )}
                  </div>
                  <Badge variant="secondary">{planSummary.statusLabel}</Badge>
                </div>

                <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                  <div className="space-y-1">
                    <dt className="text-muted-foreground">Restaurant</dt>
                    <dd className="font-medium">{restaurant?.name}</dd>
                  </div>
                  {planSummary.trialEnds && (
                    <div className="space-y-1">
                      <dt className="text-muted-foreground">
                        Trial ends
                      </dt>
                      <dd className="font-medium">{planSummary.trialEnds}</dd>
                    </div>
                  )}
                  {planSummary.nextRenewal && (
                    <div className="space-y-1">
                      <dt className="text-muted-foreground">
                        Next renewal
                      </dt>
                      <dd className="font-medium">
                        {planSummary.nextRenewal}
                      </dd>
                    </div>
                  )}
                  <div className="space-y-1">
                    <dt className="text-muted-foreground">
                      Subscription since
                    </dt>
                    <dd className="font-medium">
                      {planSummary.subscription.created_at
                        ? format(
                            new Date(planSummary.subscription.created_at),
                            "PP",
                          )
                        : "—"}
                    </dd>
                  </div>
                </dl>

                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">
                    Changes to plan, billing cadence, or payment method
                    are currently managed by the platform team.
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full sm:w-auto"
                  >
                    Contact support about billing
                  </Button>
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

      {/* ─── Payment Gateway ─── */}
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
    </div>
  );
}