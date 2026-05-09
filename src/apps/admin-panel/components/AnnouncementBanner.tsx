import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AlertTriangle, Info, AlertCircle, X } from "lucide-react";
import { useState } from "react";

export function AnnouncementBanner() {
  const [dismissed, setDismissed] = useState<string[]>([]);

  const { data: announcements = [] } = useQuery({
    queryKey: ["announcements-banner"],
    queryFn: async () => {
      const { data } = await supabase
        .from("announcements")
        .select("id, title, body, priority, created_at")
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(5);
      return data || [];
    },
    refetchInterval: 300000, // Check every 5 min
  });

  const visible = announcements.filter((a: any) => !dismissed.includes(a.id));
  if (visible.length === 0) return null;

  const priorityStyles: Record<string, string> = {
    critical: "bg-destructive/10 border-destructive/30 text-destructive",
    warning: "bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-400",
    info: "bg-blue-500/10 border-blue-500/30 text-blue-700 dark:text-blue-400",
  };

  const PriorityIcon = ({ p }: { p: string }) => {
    if (p === "critical") return <AlertCircle className="h-4 w-4 shrink-0" />;
    if (p === "warning") return <AlertTriangle className="h-4 w-4 shrink-0" />;
    return <Info className="h-4 w-4 shrink-0" />;
  };

  return (
    <div className="space-y-2">
      {visible.map((a: any) => (
        <div
          key={a.id}
          className={`flex items-start gap-3 rounded-lg border px-4 py-3 text-sm ${priorityStyles[a.priority] || priorityStyles.info}`}
        >
          <PriorityIcon p={a.priority} />
          <div className="flex-1 min-w-0">
            <p className="font-semibold">{a.title}</p>
            {a.body && <p className="text-xs mt-0.5 opacity-80 line-clamp-2">{a.body}</p>}
          </div>
          <button
            onClick={() => setDismissed(prev => [...prev, a.id])}
            className="shrink-0 p-0.5 rounded hover:bg-black/10 transition-colors"
            aria-label="Dismiss"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
