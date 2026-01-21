import { useEffect, useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type ActivityLogRow = {
  id: string;
  created_at: string;
  restaurant_id: string;
  actor_user_id: string | null;
  action: string;
  entity_type: string;
  message: string | null;
};

export default function SuperAdminActivity() {
  const { toast } = useToast();
  const [restaurantId, setRestaurantId] = useState<string>("all");
  const [action, setAction] = useState<string>("all");

  const restaurantsQuery = useQuery({
    queryKey: ["superadmin", "restaurants", "for-filters"],
    queryFn: async () => {
      const { data, error } = await supabase.from("restaurants").select("id,name").order("name").limit(500);
      if (error) throw error;
      return data ?? [];
    },
  });

  const restaurantNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of restaurantsQuery.data ?? []) map.set(r.id, r.name);
    return map;
  }, [restaurantsQuery.data]);

  const logsQuery = useQuery({
    queryKey: ["superadmin", "activity_logs", { restaurantId, action }],
    queryFn: async () => {
      let q = supabase
        .from("activity_logs")
        .select("id,created_at,restaurant_id,actor_user_id,action,entity_type,message")
        .order("created_at", { ascending: false })
        .limit(200);

      if (restaurantId !== "all") q = q.eq("restaurant_id", restaurantId);
      if (action !== "all") q = q.eq("action", action);

      const { data: logs, error: logsError } = await q;
      if (logsError) throw logsError;

      const rows = (logs ?? []) as ActivityLogRow[];
      const actorIds = Array.from(new Set(rows.map((r) => r.actor_user_id).filter(Boolean) as string[]));

      const { data: profiles, error: profilesError } = actorIds.length
        ? await supabase.from("profiles").select("id,email").in("id", actorIds)
        : { data: [], error: null };
      if (profilesError) throw profilesError;

      const actorEmailById = new Map<string, string>();
      for (const p of profiles ?? []) actorEmailById.set(p.id, p.email);

      return { logs: rows, actorEmailById };
    },
  });

  const actionOptions = useMemo(() => {
    const set = new Set<string>();
    for (const row of logsQuery.data?.logs ?? []) set.add(row.action);
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [logsQuery.data]);

  const lastErrorMessageRef = useRef<string | null>(null);
  useEffect(() => {
    const err = (logsQuery.error ?? restaurantsQuery.error) as any;
    const isError = logsQuery.isError || restaurantsQuery.isError;
    if (!isError) return;
    const message = err?.message ?? "Failed to load activity";
    if (lastErrorMessageRef.current === message) return;
    lastErrorMessageRef.current = message;
    toast({ title: "Error", description: message, variant: "destructive" });
  }, [logsQuery.isError, logsQuery.error, restaurantsQuery.isError, restaurantsQuery.error, toast]);

  return (
    <section className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Activity</h1>
        <p className="text-sm text-muted-foreground">Read-only audit trail (RLS-safe).</p>
      </header>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <CardTitle className="text-base">Activity logs</CardTitle>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="w-full sm:w-64">
                <Select value={restaurantId} onValueChange={setRestaurantId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Filter by restaurant" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All restaurants</SelectItem>
                    {(restaurantsQuery.data ?? []).map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="w-full sm:w-56">
                <Select value={action} onValueChange={setAction}>
                  <SelectTrigger>
                    <SelectValue placeholder="Filter by action" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All actions</SelectItem>
                    {actionOptions.map((a) => (
                      <SelectItem key={a} value={a}>
                        {a}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Button
                variant="outline"
                onClick={() => {
                  setRestaurantId("all");
                  setAction("all");
                }}
              >
                Reset
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          {logsQuery.isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
            </div>
          ) : logsQuery.isError ? (
            <div className="text-sm text-muted-foreground">Unable to load activity logs.</div>
          ) : (
            <div className="w-full overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[180px]">Timestamp</TableHead>
                    <TableHead className="min-w-[220px]">Restaurant</TableHead>
                    <TableHead className="min-w-[240px]">Actor email</TableHead>
                    <TableHead className="min-w-[180px]">Action</TableHead>
                    <TableHead className="min-w-[160px]">Entity type</TableHead>
                    <TableHead className="min-w-[320px]">Message</TableHead>
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {(logsQuery.data?.logs ?? []).length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-sm text-muted-foreground">
                        No activity logs found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    (logsQuery.data?.logs ?? []).map((row) => (
                      <TableRow key={row.id}>
                        <TableCell className="text-sm">
                          {row.created_at ? format(new Date(row.created_at), "PP p") : "—"}
                        </TableCell>
                        <TableCell className="font-medium">
                          {restaurantNameById.get(row.restaurant_id) ?? "—"}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {row.actor_user_id ? logsQuery.data?.actorEmailById.get(row.actor_user_id) ?? "—" : "—"}
                        </TableCell>
                        <TableCell className="font-mono text-sm">{row.action}</TableCell>
                        <TableCell className="text-sm">{row.entity_type}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{row.message ?? "—"}</TableCell>
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
