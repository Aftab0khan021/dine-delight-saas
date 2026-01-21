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

type RestaurantRow = {
  id: string;
  name: string;
  slug: string;
  created_at: string;
};

export default function SuperAdminRestaurants() {
  const { toast } = useToast();

  const query = useQuery({
    queryKey: ["superadmin", "restaurants"],
    queryFn: async () => {
      const { data: restaurants, error: restaurantsError } = await supabase
        .from("restaurants")
        .select("id,name,slug,created_at")
        .order("created_at", { ascending: false })
        .limit(200);

      if (restaurantsError) throw restaurantsError;

      const rows = (restaurants ?? []) as RestaurantRow[];
      const restaurantIds = rows.map((r) => r.id);

      const { data: roles, error: rolesError } = await supabase
        .from("user_roles")
        .select("user_id,restaurant_id,role")
        .in("restaurant_id", restaurantIds)
        .eq("role", "restaurant_admin");

      if (rolesError) throw rolesError;

      // If multiple restaurant_admins exist, prefer the first row returned.
      const ownerByRestaurantId = new Map<string, string>();
      for (const role of roles ?? []) {
        if (!role.restaurant_id) continue;
        if (!ownerByRestaurantId.has(role.restaurant_id)) {
          ownerByRestaurantId.set(role.restaurant_id, role.user_id);
        }
      }

      const ownerIds = Array.from(new Set(Array.from(ownerByRestaurantId.values())));
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("id,email")
        .in("id", ownerIds);

      if (profilesError) throw profilesError;

      const emailByUserId = new Map<string, string>();
      for (const p of profiles ?? []) {
        emailByUserId.set(p.id, p.email);
      }

      return {
        restaurants: rows,
        ownerByRestaurantId,
        emailByUserId,
      };
    },
  });

  const lastErrorMessageRef = useRef<string | null>(null);
  useEffect(() => {
    if (!query.isError) return;
    const err = query.error as any;
    const message = err?.message ?? "Failed to load restaurants";
    if (lastErrorMessageRef.current === message) return;
    lastErrorMessageRef.current = message;
    toast({ title: "Error", description: message, variant: "destructive" });
  }, [query.isError, query.error, toast]);

  const rows = useMemo(() => {
    if (!query.data) return [] as Array<{
      restaurant: RestaurantRow;
      ownerEmail?: string;
    }>;

    const { restaurants, ownerByRestaurantId, emailByUserId } = query.data;
    return restaurants.map((restaurant) => {
      const ownerId = ownerByRestaurantId.get(restaurant.id);
      const ownerEmail = ownerId ? emailByUserId.get(ownerId) : undefined;
      return { restaurant, ownerEmail };
    });
  }, [query.data]);

  return (
    <section className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Restaurants</h1>
        <p className="text-sm text-muted-foreground">
          View restaurants, owners, and basic status (read-only).
        </p>
      </header>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">All restaurants</CardTitle>
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
            <div className="text-sm text-muted-foreground">Unable to load restaurants.</div>
          ) : (
            <div className="w-full overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[220px]">Restaurant name</TableHead>
                    <TableHead className="min-w-[160px]">Slug</TableHead>
                    <TableHead className="min-w-[240px]">Owner email</TableHead>
                    <TableHead className="min-w-[160px]">Created</TableHead>
                    <TableHead className="min-w-[140px]">Status</TableHead>
                    <TableHead className="min-w-[220px] text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {rows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-sm text-muted-foreground">
                        No restaurants found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    rows.map(({ restaurant, ownerEmail }) => (
                      <TableRow key={restaurant.id}>
                        <TableCell className="font-medium">{restaurant.name}</TableCell>
                        <TableCell className="font-mono text-sm">{restaurant.slug}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {ownerEmail ?? "—"}
                        </TableCell>
                        <TableCell className="text-sm">
                          {restaurant.created_at ? format(new Date(restaurant.created_at), "PP") : "—"}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">Active</Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="inline-flex flex-wrap justify-end gap-2">
                            <Button size="sm" variant="outline" disabled>
                              View
                            </Button>
                            <Button size="sm" variant="outline" disabled>
                              Suspend
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
