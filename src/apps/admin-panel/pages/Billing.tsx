import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { addMonths, startOfMonth } from "date-fns";

import { supabase } from "@/integrations/supabase/client";
import { useRestaurantContext } from "../state/restaurant-context";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type SubscriptionRow = {
  id: string;
  plan_key: string;
  status: string;
  current_period_end: string | null;
  current_period_start: string | null;
  cancel_at_period_end: boolean;
  canceled_at: string | null;
};

type InvoiceRow = {
  id: string;
  status: string;
  amount_due_cents: number;
  currency_code: string;
  due_at: string | null;
  hosted_invoice_url: string | null;
  invoice_pdf_url: string | null;
  provider_invoice_id: string;
};

function formatMoney(cents: number, currency = "USD") {
  const amount = (cents ?? 0) / 100;
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(amount);
  } catch {
    return `$${amount.toFixed(2)}`;
  }
}

function shortId(id: string) {
  return id?.slice(0, 8) ?? "—";
}

function formatDate(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "2-digit" });
}

export default function AdminBilling() {
  const { restaurant } = useRestaurantContext();

  const { monthStartISO, monthEndISO } = useMemo(() => {
    const start = startOfMonth(new Date());
    const end = addMonths(start, 1);
    return { monthStartISO: start.toISOString(), monthEndISO: end.toISOString() };
  }, []);

  const subscriptionQuery = useQuery({
    queryKey: ["admin", "billing", restaurant?.id, "subscription"],
    enabled: !!restaurant?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subscriptions")
        .select(
          "id, plan_key, status, current_period_end, current_period_start, cancel_at_period_end, canceled_at, created_at",
        )
        .eq("restaurant_id", restaurant!.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      return (data ?? null) as unknown as SubscriptionRow | null;
    },
  });

  const invoicesQuery = useQuery({
    queryKey: ["admin", "billing", restaurant?.id, "invoices"],
    enabled: !!restaurant?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select(
          "id, status, amount_due_cents, currency_code, due_at, hosted_invoice_url, invoice_pdf_url, provider_invoice_id, created_at",
        )
        .eq("restaurant_id", restaurant!.id)
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) throw error;
      return (data ?? []) as unknown as InvoiceRow[];
    },
  });

  const usageQuery = useQuery({
    queryKey: ["admin", "billing", restaurant?.id, "usage"],
    enabled: !!restaurant?.id,
    queryFn: async () => {
      const [ordersCount, menuItemsCount] = await Promise.all([
        supabase
          .from("orders")
          .select("id", { count: "exact", head: true })
          .eq("restaurant_id", restaurant!.id)
          .gte("placed_at", monthStartISO)
          .lt("placed_at", monthEndISO),
        supabase
          .from("menu_items")
          .select("id", { count: "exact", head: true })
          .eq("restaurant_id", restaurant!.id),
      ]);

      if (ordersCount.error) throw ordersCount.error;
      if (menuItemsCount.error) throw menuItemsCount.error;

      return {
        ordersThisMonth: ordersCount.count ?? 0,
        menuItems: menuItemsCount.count ?? 0,
      };
    },
  });

  const usage = usageQuery.data ?? { ordersThisMonth: 0, menuItems: 0 };

  // Display-only “usage bars” (no enforcement yet)
  const ordersUsagePercent = Math.min(100, (usage.ordersThisMonth / 200) * 100);
  const menuItemsUsagePercent = Math.min(100, (usage.menuItems / 100) * 100);

  const subscription = subscriptionQuery.data;
  const invoices = invoicesQuery.data ?? [];

  return (
    <section className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Billing</h1>
        <p className="text-sm text-muted-foreground">Subscription and invoices for {restaurant?.name}.</p>
      </header>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* CURRENT PLAN */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle>Current plan</CardTitle>
                <CardDescription>Manage your subscription (UI only for now).</CardDescription>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" disabled title="Payment flow not implemented yet">
                  Upgrade / Downgrade
                </Button>
                <Button variant="outline" disabled title="Cancellation flow not implemented yet">
                  Cancel
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {subscriptionQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">Loading subscription…</p>
            ) : !subscription ? (
              <div className="rounded-lg border border-dashed p-6 text-center">
                <p className="font-medium">No active plan</p>
                <p className="text-sm text-muted-foreground">Create a subscription to see billing details here.</p>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="rounded-lg border p-4">
                  <p className="text-xs text-muted-foreground">Plan</p>
                  <p className="text-lg font-semibold break-all">{subscription.plan_key}</p>
                </div>
                <div className="rounded-lg border p-4">
                  <p className="text-xs text-muted-foreground">Status</p>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">{subscription.status}</Badge>
                    {subscription.cancel_at_period_end ? <Badge variant="secondary">Cancels at period end</Badge> : null}
                  </div>
                </div>
                <div className="rounded-lg border p-4">
                  <p className="text-xs text-muted-foreground">Current period end</p>
                  <p className="text-lg font-semibold">{formatDate(subscription.current_period_end)}</p>
                </div>
              </div>
            )}

            <Separator />

            {/* USAGE */}
            <div className="space-y-3">
              <div>
                <p className="text-sm font-medium">Usage (display only)</p>
                <p className="text-sm text-muted-foreground">Derived from current data counts. No limits are enforced yet.</p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-sm">Orders this month</p>
                    <Badge variant="secondary">{usageQuery.isLoading ? "…" : usage.ordersThisMonth}</Badge>
                  </div>
                  <Progress value={ordersUsagePercent} />
                  <p className="text-xs text-muted-foreground">Shown against a placeholder bar (200 orders).</p>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-sm">Menu items</p>
                    <Badge variant="secondary">{usageQuery.isLoading ? "…" : usage.menuItems}</Badge>
                  </div>
                  <Progress value={menuItemsUsagePercent} />
                  <p className="text-xs text-muted-foreground">Shown against a placeholder bar (100 items).</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* INVOICES */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Invoices</CardTitle>
            <CardDescription>Latest invoices for this restaurant.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {invoicesQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">Loading invoices…</p>
            ) : invoices.length === 0 ? (
              <div className="rounded-lg border border-dashed p-4 text-center">
                <p className="text-sm font-medium">No invoices</p>
                <p className="text-xs text-muted-foreground">Invoices will appear here when available.</p>
              </div>
            ) : (
              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Invoice</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {invoices.map((inv) => {
                      const link = inv.hosted_invoice_url ?? inv.invoice_pdf_url;
                      return (
                        <TableRow key={inv.id}>
                          <TableCell>
                            <div className="space-y-1">
                              <p className="font-medium">{shortId(inv.id)}</p>
                              <p className="text-xs text-muted-foreground">Due: {formatDate(inv.due_at)}</p>
                              {link ? (
                                <a
                                  href={link}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-xs underline text-muted-foreground"
                                >
                                  View invoice
                                </a>
                              ) : null}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary">{inv.status}</Badge>
                          </TableCell>
                          <TableCell className="text-right">{formatMoney(inv.amount_due_cents ?? 0, inv.currency_code ?? "USD")}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}

            {/* Mobile invoice cards */}
            {invoices.length > 0 ? (
              <div className="grid gap-3 md:hidden">
                {invoices.map((inv) => {
                  const link = inv.hosted_invoice_url ?? inv.invoice_pdf_url;
                  return (
                    <div key={inv.id} className="rounded-lg border p-4 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-medium">Invoice {shortId(inv.id)}</p>
                          <p className="text-sm text-muted-foreground">Due: {formatDate(inv.due_at)}</p>
                        </div>
                        <Badge variant="secondary">{inv.status}</Badge>
                      </div>
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold">{formatMoney(inv.amount_due_cents ?? 0, inv.currency_code ?? "USD")}</p>
                        {link ? (
                          <a href={link} target="_blank" rel="noreferrer" className="text-sm underline text-muted-foreground">
                            View invoice
                          </a>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
