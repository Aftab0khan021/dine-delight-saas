import { useEffect, useMemo, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";

type LookupOrder = {
  id: string;
  status: string;
  placed_at: string;
  subtotal_cents: number;
  total_cents: number;
  currency_code: string;
};

type LookupOrderItem = {
  id: string;
  name_snapshot: string;
  quantity: number;
  unit_price_cents: number;
  line_total_cents: number;
};

function formatMoney(cents: number, currency = "USD") {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
    }).format((cents ?? 0) / 100);
  } catch {
    return `$${((cents ?? 0) / 100).toFixed(2)}`;
  }
}

export default function TrackOrder() {
  const [params] = useSearchParams();
  const initialToken = (params.get("token") ?? "").trim();

  const [token, setToken] = useState(initialToken);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [order, setOrder] = useState<LookupOrder | null>(null);
  const [items, setItems] = useState<LookupOrderItem[]>([]);

  const currency = useMemo(() => order?.currency_code ?? "USD", [order?.currency_code]);

  useEffect(() => {
    document.title = "Track Order";
  }, []);

  const lookup = async (t: string) => {
    const cleaned = t.trim();
    if (!cleaned) {
      setError("Enter your order token.");
      setOrder(null);
      setItems([]);
      return;
    }

    setLoading(true);
    setError(null);
    setOrder(null);
    setItems([]);

    const { data, error: fnError } = await supabase.functions.invoke("order-lookup", {
      body: { token: cleaned },
    });

    if (fnError) {
      setLoading(false);
      setError(fnError.message || "Could not look up that order.");
      return;
    }

    if (!data?.order) {
      setLoading(false);
      setError("Order not found.");
      return;
    }

    setOrder(data.order as LookupOrder);
    setItems((data.items ?? []) as LookupOrderItem[]);
    setLoading(false);
  };

  useEffect(() => {
    if (initialToken) void lookup(initialToken);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="min-h-screen bg-background">
      <header className="border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4 max-w-3xl flex items-center justify-between gap-3">
          <h1 className="text-xl font-semibold tracking-tight">Track order</h1>
          <Link to="/menu">
            <Button variant="outline" size="sm">
              Back to menu
            </Button>
          </Link>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8 max-w-3xl">
        <Card className="p-4">
          <form
            className="flex flex-col sm:flex-row gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              void lookup(token);
            }}
          >
            <Input
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Paste your order token"
              autoComplete="off"
            />
            <Button type="submit" disabled={loading}>
              {loading ? "Looking up…" : "Lookup"}
            </Button>
          </form>

          {error ? (
            <p className="mt-3 text-sm text-destructive">{error}</p>
          ) : null}
        </Card>

        {order ? (
          <section className="mt-6 space-y-3" aria-label="Order details">
            <Card className="p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm text-muted-foreground">Status</p>
                  <p className="font-medium">{order.status}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-muted-foreground">Total</p>
                  <p className="font-medium tabular-nums">{formatMoney(order.total_cents, currency)}</p>
                </div>
              </div>

              <Separator className="my-4" />

              <div className="space-y-2">
                {items.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No items found.</p>
                ) : (
                  items.map((it) => (
                    <div key={it.id} className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium truncate">{it.name_snapshot}</p>
                        <p className="text-sm text-muted-foreground">
                          {it.quantity} × {formatMoney(it.unit_price_cents, currency)}
                        </p>
                      </div>
                      <p className="font-medium tabular-nums whitespace-nowrap">
                        {formatMoney(it.line_total_cents, currency)}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </Card>
          </section>
        ) : null}
      </div>
    </main>
  );
}
