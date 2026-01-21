import { useEffect, useMemo, useRef } from "react";
import { format } from "date-fns";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type InvoiceRow = {
  id: string;
  restaurant_id: string;
  subscription_id: string | null;
  provider_invoice_id: string;
  status: string;
  currency_code: string;
  amount_due_cents: number;
  amount_paid_cents: number;
  due_at: string | null;
  paid_at: string | null;
  hosted_invoice_url: string | null;
  invoice_pdf_url: string | null;
  created_at: string;
};

function formatMoney(cents: number, currencyCode?: string) {
  const currency = (currencyCode || "USD").trim().toUpperCase();
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format((cents || 0) / 100);
  } catch {
    return `${((cents || 0) / 100).toFixed(2)} ${currency}`;
  }
}

export default function SuperAdminInvoices() {
  const { toast } = useToast();

  const query = useQuery({
    queryKey: ["superadmin", "invoices"],
    queryFn: async () => {
      const { data: invoices, error: invoicesError } = await supabase
        .from("invoices")
        .select(
          "id,restaurant_id,subscription_id,provider_invoice_id,status,currency_code,amount_due_cents,amount_paid_cents,due_at,paid_at,hosted_invoice_url,invoice_pdf_url,created_at",
        )
        .order("created_at", { ascending: false })
        .limit(200);

      if (invoicesError) throw invoicesError;

      const rows = (invoices ?? []) as InvoiceRow[];
      const restaurantIds = Array.from(new Set(rows.map((i) => i.restaurant_id)));
      const subscriptionIds = Array.from(
        new Set(rows.map((i) => i.subscription_id).filter(Boolean) as string[]),
      );

      const [{ data: restaurants, error: restaurantsError }, { data: subscriptions, error: subsError }] =
        await Promise.all([
          supabase.from("restaurants").select("id,name").in("id", restaurantIds),
          // Included per requirements; used for future detail views, but still RLS-safe and read-only.
          subscriptionIds.length
            ? supabase.from("subscriptions").select("id").in("id", subscriptionIds)
            : Promise.resolve({ data: [], error: null } as any),
        ]);

      if (restaurantsError) throw restaurantsError;
      if (subsError) throw subsError;

      const restaurantNameById = new Map<string, string>();
      for (const r of restaurants ?? []) restaurantNameById.set(r.id, r.name);

      const subscriptionIdSet = new Set<string>();
      for (const s of subscriptions ?? []) subscriptionIdSet.add(s.id);

      return { invoices: rows, restaurantNameById, subscriptionIdSet };
    },
  });

  const lastErrorMessageRef = useRef<string | null>(null);
  useEffect(() => {
    if (!query.isError) return;
    const err = query.error as any;
    const message = err?.message ?? "Failed to load invoices";
    if (lastErrorMessageRef.current === message) return;
    lastErrorMessageRef.current = message;
    toast({ title: "Error", description: message, variant: "destructive" });
  }, [query.isError, query.error, toast]);

  const rows = useMemo(() => {
    if (!query.data) return [] as Array<{ invoice: InvoiceRow; restaurantName?: string }>;
    const { invoices, restaurantNameById } = query.data;
    return invoices.map((invoice) => ({
      invoice,
      restaurantName: restaurantNameById.get(invoice.restaurant_id),
    }));
  }, [query.data]);

  return (
    <section className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Invoices</h1>
        <p className="text-sm text-muted-foreground">Read-only invoices with quick links.</p>
      </header>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">All invoices</CardTitle>
        </CardHeader>
        <CardContent>
          {query.isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
            </div>
          ) : query.isError ? (
            <div className="text-sm text-muted-foreground">Unable to load invoices.</div>
          ) : (
            <div className="w-full overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[240px]">Restaurant</TableHead>
                    <TableHead className="min-w-[220px]">Invoice ID</TableHead>
                    <TableHead className="min-w-[140px]">Status</TableHead>
                    <TableHead className="min-w-[160px]">Amount due</TableHead>
                    <TableHead className="min-w-[160px]">Amount paid</TableHead>
                    <TableHead className="min-w-[160px]">Due date</TableHead>
                    <TableHead className="min-w-[160px]">Paid date</TableHead>
                    <TableHead className="min-w-[260px] text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {rows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-sm text-muted-foreground">
                        No invoices found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    rows.map(({ invoice, restaurantName }) => (
                      <TableRow key={invoice.id}>
                        <TableCell className="font-medium">{restaurantName ?? "—"}</TableCell>
                        <TableCell className="font-mono text-sm">{invoice.provider_invoice_id}</TableCell>
                        <TableCell>
                          <Badge variant="secondary">{invoice.status}</Badge>
                        </TableCell>
                        <TableCell className="text-sm">
                          {formatMoney(invoice.amount_due_cents, invoice.currency_code)}
                        </TableCell>
                        <TableCell className="text-sm">
                          {formatMoney(invoice.amount_paid_cents, invoice.currency_code)}
                        </TableCell>
                        <TableCell className="text-sm">
                          {invoice.due_at ? format(new Date(invoice.due_at), "PP") : "—"}
                        </TableCell>
                        <TableCell className="text-sm">
                          {invoice.paid_at ? format(new Date(invoice.paid_at), "PP") : "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="inline-flex flex-wrap justify-end gap-2">
                            <Button asChild size="sm" variant="outline" disabled={!invoice.hosted_invoice_url}>
                              <a
                                href={invoice.hosted_invoice_url ?? undefined}
                                target="_blank"
                                rel="noreferrer"
                              >
                                View invoice
                              </a>
                            </Button>
                            <Button asChild size="sm" variant="outline" disabled={!invoice.invoice_pdf_url}>
                              <a href={invoice.invoice_pdf_url ?? undefined} target="_blank" rel="noreferrer">
                                Download PDF
                              </a>
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
