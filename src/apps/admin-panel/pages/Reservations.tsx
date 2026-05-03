import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, Clock, Users, Check, X, Phone, ChevronDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useRestaurantContext } from "../state/restaurant-context";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  confirmed: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  seated: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  completed: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200",
  cancelled: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  no_show: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
};

const STATUSES = ["pending", "confirmed", "seated", "completed", "cancelled", "no_show"];

export default function AdminReservations() {
  const { restaurant } = useRestaurantContext();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [dateFilter, setDateFilter] = useState(() => new Date().toISOString().split("T")[0]);
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(0);
  const ITEMS_PER_PAGE = 20;

  const { data: reservations, isLoading } = useQuery({
    queryKey: ["admin", "reservations", restaurant?.id, dateFilter],
    enabled: !!restaurant?.id,
    queryFn: async () => {
      let q = supabase.from("reservations").select("*", { count: "exact" }).eq("restaurant_id", restaurant!.id).order("reservation_time", { ascending: true });
      if (dateFilter) q = q.eq("reservation_date", dateFilter);
      const { data, error, count } = await q;
      if (error) throw error;
      return { items: data || [], totalCount: count || 0 };
    },
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from("reservations").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast({ title: "Updated" }); qc.invalidateQueries({ queryKey: ["admin", "reservations"] }); },
    onError: (e: Error) => { toast({ title: "Error", description: e.message, variant: "destructive" }); },
  });

  const allItems = reservations?.items ?? [];

  const filtered = useMemo(() => {
    if (!allItems.length) return [];
    if (statusFilter === "all") return allItems;
    return allItems.filter(r => r.status === statusFilter);
  }, [allItems, statusFilter]);

  // Reset page on filter change
  const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE);
  const paginatedItems = filtered.slice(page * ITEMS_PER_PAGE, (page + 1) * ITEMS_PER_PAGE);

  const stats = useMemo(() => {
    if (!allItems.length) return { total: 0, pending: 0, confirmed: 0, seated: 0 };
    return {
      total: allItems.length,
      pending: allItems.filter(r => r.status === "pending").length,
      confirmed: allItems.filter(r => r.status === "confirmed").length,
      seated: allItems.filter(r => r.status === "seated").length,
    };
  }, [allItems]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Reservations</h1>
        <p className="text-sm text-muted-foreground">Manage table bookings from your customers</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="shadow-sm"><CardContent className="p-4 text-center"><p className="text-2xl font-bold">{stats.total}</p><p className="text-xs text-muted-foreground">Total Today</p></CardContent></Card>
        <Card className="shadow-sm"><CardContent className="p-4 text-center"><p className="text-2xl font-bold text-amber-600">{stats.pending}</p><p className="text-xs text-muted-foreground">Pending</p></CardContent></Card>
        <Card className="shadow-sm"><CardContent className="p-4 text-center"><p className="text-2xl font-bold text-blue-600">{stats.confirmed}</p><p className="text-xs text-muted-foreground">Confirmed</p></CardContent></Card>
        <Card className="shadow-sm"><CardContent className="p-4 text-center"><p className="text-2xl font-bold text-green-600">{stats.seated}</p><p className="text-xs text-muted-foreground">Seated</p></CardContent></Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <Input type="date" value={dateFilter} onChange={e => setDateFilter(e.target.value)} className="w-auto" />
        <div className="flex gap-1 flex-wrap">
          <Button size="sm" variant={statusFilter === "all" ? "default" : "outline"} onClick={() => { setStatusFilter("all"); setPage(0); }}>All</Button>
          {STATUSES.map(s => (
            <Button key={s} size="sm" variant={statusFilter === s ? "default" : "outline"} onClick={() => { setStatusFilter(s); setPage(0); }} className="capitalize">{s.replace("_", " ")}</Button>
          ))}
        </div>
      </div>

      {/* Reservations List */}
      {isLoading ? (
        <Card className="p-6"><p className="text-sm text-muted-foreground">Loading...</p></Card>
      ) : paginatedItems.length === 0 ? (
        <Card className="p-8 text-center">
          <CalendarDays className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-muted-foreground">No reservations for this date</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {paginatedItems.map((r: any) => (
            <Card key={r.id} className="shadow-sm">
              <CardContent className="p-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold">{r.customer_name}</span>
                      <Badge className={`text-xs ${STATUS_COLORS[r.status] || ""}`}>{r.status.replace("_", " ")}</Badge>
                    </div>
                    <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{r.reservation_time?.slice(0, 5)}</span>
                      <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" />{r.party_size} guests</span>
                      <span className="flex items-center gap-1"><Phone className="h-3.5 w-3.5" />{r.customer_phone}</span>
                    </div>
                    {r.notes && <p className="text-xs text-muted-foreground italic mt-1">{r.notes}</p>}
                  </div>
                  <div className="flex gap-2 shrink-0">
                    {r.status === "pending" && (
                      <>
                        <Button size="sm" onClick={() => updateStatus.mutate({ id: r.id, status: "confirmed" })}><Check className="mr-1 h-3.5 w-3.5" />Confirm</Button>
                        <Button size="sm" variant="destructive" onClick={() => updateStatus.mutate({ id: r.id, status: "cancelled" })}><X className="mr-1 h-3.5 w-3.5" />Decline</Button>
                      </>
                    )}
                    {r.status === "confirmed" && (
                      <Button size="sm" variant="outline" onClick={() => updateStatus.mutate({ id: r.id, status: "seated" })}>Mark Seated</Button>
                    )}
                    {r.status === "seated" && (
                      <Button size="sm" variant="outline" onClick={() => updateStatus.mutate({ id: r.id, status: "completed" })}>Complete</Button>
                    )}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild><Button size="sm" variant="ghost"><ChevronDown className="h-4 w-4" /></Button></DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {STATUSES.map(s => (
                          <DropdownMenuItem key={s} onClick={() => updateStatus.mutate({ id: r.id, status: s })} className="capitalize">{s.replace("_", " ")}</DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex flex-wrap items-center justify-center gap-2 mt-2">
          <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}>Previous</Button>
          <span className="text-sm text-muted-foreground">Page {page + 1} of {totalPages} ({filtered.length} reservations)</span>
          <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}>Next</Button>
        </div>
      )}
    </div>
  );
}
