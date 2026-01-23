import { useEffect, useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Download, Search } from "lucide-react";
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
  const [search, setSearch] = useState("");

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

  // Filtered logs based on search
  const filteredLogs = useMemo(() => {
    const logs = logsQuery.data?.logs ?? [];
    if (!search) return logs;

    const searchLower = search.toLowerCase();
    return logs.filter((log) => {
      const restaurantName = restaurantNameById.get(log.restaurant_id) || "";
      const actorEmail = log.actor_user_id ? logsQuery.data?.actorEmailById.get(log.actor_user_id) || "" : "";

      return (
        log.action.toLowerCase().includes(searchLower) ||
        log.entity_type.toLowerCase().includes(searchLower) ||
        log.message?.toLowerCase().includes(searchLower) ||
        restaurantName.toLowerCase().includes(searchLower) ||
        actorEmail.toLowerCase().includes(searchLower)
      );
    });
  }, [logsQuery.data, search, restaurantNameById]);

  // Export to CSV
  const handleExport = () => {
    const logs = filteredLogs;
    if (logs.length === 0) {
      toast({ title: "No data", description: "No logs to export", variant: "destructive" });
      return;
    }

    const headers = ["Timestamp", "Restaurant", "Actor Email", "Action", "Entity Type", "Message"];
    const rows = logs.map((log) => [
      log.created_at ? format(new Date(log.created_at), "yyyy-MM-dd HH:mm:ss") : "",
      restaurantNameById.get(log.restaurant_id) || "",
      log.actor_user_id ? logsQuery.data?.actorEmailById.get(log.actor_user_id) || "" : "",
      log.action,
      log.entity_type,
      log.message || "",
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map((row) => row.map((cell) => `"${cell}"`).join(",")),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `activity_logs_${format(new Date(), "yyyy-MM-dd")}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast({ title: "Exported", description: `${logs.length} logs exported to CSV` });
  };

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
      <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Activity</h1>
          <p className="text-sm text-muted-foreground">Audit trail of all super admin actions</p>
        </div>
        <Button variant="outline" onClick={handleExport}>
          <Download className="mr-2 h-4 w-4" />
          Export CSV
        </Button>
      </header>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <CardTitle className="text-base">Activity logs ({filteredLogs.length})</CardTitle>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="relative w-full sm:w-64">
                <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search logs..."
                  className="pl-9"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>

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
                  setSearch("");
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
                  {filteredLogs.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-sm text-muted-foreground">
                        No activity logs found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredLogs.map((row) => (
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
