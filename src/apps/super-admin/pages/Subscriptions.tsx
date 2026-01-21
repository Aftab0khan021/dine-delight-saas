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

type SubscriptionRow = {
  id: string;
  restaurant_id: string;
  plan_key: string;
  status: string;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  created_at: string;
};

export default function SuperAdminSubscriptions() {
  const { toast } = useToast();

  const query = useQuery({
    queryKey: ["superadmin", "subscriptions"],
    queryFn: async () => {
      const { data: subscriptions, error: subscriptionsError } = await supabase
        .from("subscriptions")
        .select(
          "id,restaurant_id,plan_key,status,current_period_start,current_period_end,cancel_at_period_end,created_at",
        )
        .order("created_at", { ascending: false })
        .limit(200);

      if (subscriptionsError) throw subscriptionsError;

      const rows = (subscriptions ?? []) as SubscriptionRow[];
      const restaurantIds = Array.from(new Set(rows.map((s) => s.restaurant_id)));

      const { data: restaurants, error: restaurantsError } = await supabase
        .from("restaurants")
        .select("id,name")
        .in("id", restaurantIds);

      if (restaurantsError) throw restaurantsError;

      const nameByRestaurantId = new Map<string, string>();
      for (const r of restaurants ?? []) {
        nameByRestaurantId.set(r.id, r.name);
      }

      return { subscriptions: rows, nameByRestaurantId };
    },
  });

  const lastErrorMessageRef = useRef<string | null>(null);
  useEffect(() => {
    if (!query.isError) return;
    const err = query.error as any;
    const message = err?.message ?? "Failed to load subscriptions";
    if (lastErrorMessageRef.current === message) return;
    lastErrorMessageRef.current = message;
    toast({ title: "Error", description: message, variant: "destructive" });
  }, [query.isError, query.error, toast]);

  const rows = useMemo(() => {
    if (!query.data) return [] as Array<{ subscription: SubscriptionRow; restaurantName?: string }>;
    const { subscriptions, nameByRestaurantId } = query.data;
    return subscriptions.map((subscription) => ({
      subscription,
      restaurantName: nameByRestaurantId.get(subscription.restaurant_id),
    }));
  }, [query.data]);

  return (
    <section className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Subscriptions</h1>
        <p className="text-sm text-muted-foreground">Read-only subscription overview (RLS-safe).</p>
      </header>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">All subscriptions</CardTitle>
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
            <div className="text-sm text-muted-foreground">Unable to load subscriptions.</div>
          ) : (
            <div className="w-full overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[240px]">Restaurant</TableHead>
                    <TableHead className="min-w-[180px]">Plan key</TableHead>
                    <TableHead className="min-w-[160px]">Status</TableHead>
                    <TableHead className="min-w-[180px]">Period start</TableHead>
                    <TableHead className="min-w-[180px]">Period end</TableHead>
                    <TableHead className="min-w-[180px]">Cancel at period end</TableHead>
                    <TableHead className="min-w-[240px] text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-sm text-muted-foreground">
                        No subscriptions found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    rows.map(({ subscription, restaurantName }) => (
                      <TableRow key={subscription.id}>
                        <TableCell className="font-medium">{restaurantName ?? "—"}</TableCell>
                        <TableCell className="font-mono text-sm">{subscription.plan_key}</TableCell>
                        <TableCell>
                          <Badge variant="secondary">{subscription.status}</Badge>
                        </TableCell>
                        <TableCell className="text-sm">
                          {subscription.current_period_start
                            ? format(new Date(subscription.current_period_start), "PP")
                            : "—"}
                        </TableCell>
                        <TableCell className="text-sm">
                          {subscription.current_period_end
                            ? format(new Date(subscription.current_period_end), "PP")
                            : "—"}
                        </TableCell>
                        <TableCell className="text-sm">
                          {subscription.cancel_at_period_end ? "Yes" : "No"}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="inline-flex flex-wrap justify-end gap-2">
                            <Button size="sm" variant="outline" disabled>
                              View details
                            </Button>
                            <Button size="sm" variant="outline" disabled>
                              Change plan
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
