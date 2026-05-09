import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollText, Search, ChevronLeft, ChevronRight, User, Clock } from "lucide-react";
import { format } from "date-fns";

const ACTIONS = ["all", "create", "update", "delete", "login", "approve", "reject", "suspend", "restore"];
const PAGE_SIZE = 25;

export default function AuditLog() {
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState("all");
  const [page, setPage] = useState(0);

  const { data, isLoading } = useQuery({
    queryKey: ["audit-log", actionFilter, search, page],
    queryFn: async () => {
      let query = supabase
        .from("audit_log")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      if (actionFilter !== "all") query = query.eq("action", actionFilter);
      if (search.trim()) query = query.or(`user_email.ilike.%${search}%,description.ilike.%${search}%,entity_type.ilike.%${search}%`);

      const { data, error, count } = await query;
      if (error) throw error;
      return { logs: data || [], total: count || 0 };
    },
  });

  const logs = data?.logs || [];
  const total = data?.total || 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  const actionColor = (a: string): string => {
    const map: Record<string, string> = {
      create: "bg-emerald-500/10 text-emerald-700", update: "bg-blue-500/10 text-blue-700",
      delete: "bg-red-500/10 text-red-700", login: "bg-slate-500/10 text-slate-700",
      approve: "bg-green-500/10 text-green-700", reject: "bg-orange-500/10 text-orange-700",
      suspend: "bg-red-500/10 text-red-700", restore: "bg-emerald-500/10 text-emerald-700",
    };
    return map[a] || "bg-muted text-muted-foreground";
  };

  return (
    <section className="flex flex-col gap-6 w-full">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2"><ScrollText className="h-6 w-6" /> Audit Log</h1>
        <p className="text-sm text-muted-foreground">Track all admin actions across the platform</p>
      </header>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search by email, description, entity..." value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} />
        </div>
        <Select value={actionFilter} onValueChange={v => { setActionFilter(v); setPage(0); }}>
          <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {ACTIONS.map(a => <SelectItem key={a} value={a}>{a === "all" ? "All Actions" : a.charAt(0).toUpperCase() + a.slice(1)}</SelectItem>)}
          </SelectContent>
        </Select>
        <Badge variant="outline" className="text-xs">{total} entries</Badge>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/30">
                <tr>
                  <th className="text-left p-3 font-medium">Time</th>
                  <th className="text-left p-3 font-medium">User</th>
                  <th className="text-left p-3 font-medium">Action</th>
                  <th className="text-left p-3 font-medium">Entity</th>
                  <th className="text-left p-3 font-medium">Description</th>
                </tr>
              </thead>
              <tbody>
                {isLoading && <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">Loading...</td></tr>}
                {!isLoading && logs.length === 0 && <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">No audit entries found</td></tr>}
                {logs.map((log: any) => (
                  <tr key={log.id} className="border-b hover:bg-muted/20 transition-colors">
                    <td className="p-3 whitespace-nowrap">
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {format(new Date(log.created_at), "MMM d, HH:mm")}
                      </div>
                    </td>
                    <td className="p-3">
                      <div className="flex items-center gap-1.5">
                        <User className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="truncate max-w-[180px]">{log.user_email || "System"}</span>
                      </div>
                    </td>
                    <td className="p-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${actionColor(log.action)}`}>
                        {log.action}
                      </span>
                    </td>
                    <td className="p-3">
                      <span className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">{log.entity_type}</span>
                      {log.entity_id && <span className="text-xs text-muted-foreground ml-1">#{log.entity_id.slice(0, 8)}</span>}
                    </td>
                    <td className="p-3 max-w-[300px] truncate text-muted-foreground">{log.description || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">Page {page + 1} of {totalPages}</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}><ChevronLeft className="h-4 w-4" /></Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}><ChevronRight className="h-4 w-4" /></Button>
          </div>
        </div>
      )}
    </section>
  );
}
