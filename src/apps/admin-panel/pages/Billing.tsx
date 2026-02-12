import { useMemo } from "react";
import { format } from "date-fns";
import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { useRestaurantContext } from "../state/restaurant-context";

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

  const subscriptionQuery = useQuery({
    queryKey: ["admin", "billing", restaurant?.id, "subscription"],
    enabled: !!restaurant?.id,
    queryFn: async () => {
      const restaurantId = restaurant!.id;

      const { data: subscription, error: subError } = await supabase
        .from("subscriptions")
        .select(
          "id, plan_id, restaurant_id, status, current_period_end, trial_ends_at, created_at",
        )
        .eq("restaurant_id", restaurantId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (subError) throw subError;

      let plan: PlanRow | null = null;
      if (subscription?.plan_id) {
        const { data: planRow, error: planError } = await supabase
          .from("subscription_plans")
          .select(
            "id, name, slug, price_cents, currency, billing_period, trial_days",
          )
          .eq("id", subscription.plan_id)
          .maybeSingle();
        if (planError) throw planError;
        plan = planRow as PlanRow | null;
      }

      return { subscription: subscription as SubscriptionRow | null, plan };
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
    <div className="space-y-6">
      <section className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Billing</h1>
        <p className="text-sm text-muted-foreground">
          Manage your subscription, review invoices, and understand your
          current plan.
        </p>
      </section>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
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
    </div>
  );
}