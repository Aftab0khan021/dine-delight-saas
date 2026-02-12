import { useMemo } from "react";
import { Clock, Hash, Layers3, Utensils } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { formatMoney, shortId } from "@/lib/formatting";

export type OrderStatus = "pending" | "in_progress" | "ready" | "completed";

export type OrderCardVM = {
  id: string;
  status: OrderStatus;
  placed_at: string;
  table_label: string | null;
  total_cents: number;
  currency_code: string;
  item_summary: string;
};

function formatPlacedTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const statusLabel: Record<OrderStatus, string> = {
  pending: "Pending",
  in_progress: "In Progress",
  ready: "Ready",
  completed: "Completed",
};

type Props = {
  order: OrderCardVM;
  onAdvance?: (orderId: string, from: OrderStatus) => void;
  advancing?: boolean;
};

export function OrderCard({ order, onAdvance, advancing }: Props) {
  const next = useMemo(() => {
    if (order.status === "pending") return "in_progress" as const;
    if (order.status === "in_progress") return "ready" as const;
    if (order.status === "ready") return "completed" as const;
    return null;
  }, [order.status]);

  return (
    <Card>
      <CardHeader className="space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-semibold flex items-center gap-2">
              <Hash className="h-4 w-4 text-muted-foreground" />
              <span className="truncate">{shortId(order.id)}</span>
            </p>
            <p className="text-xs text-muted-foreground flex items-center gap-2">
              <Clock className="h-4 w-4" />
              {formatPlacedTime(order.placed_at)}
            </p>
          </div>
          <Badge variant="secondary">{statusLabel[order.status]}</Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        <div className="grid gap-2">
          <p className="text-sm flex items-center gap-2">
            <Layers3 className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">Table:</span>
            <span className="font-medium">{order.table_label ?? "QR"}</span>
          </p>
          <p className="text-sm flex items-start gap-2">
            <Utensils className="mt-0.5 h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">Items:</span>
            <span className="min-w-0">{order.item_summary}</span>
          </p>
        </div>

        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold">{formatMoney(order.total_cents ?? 0, order.currency_code ?? "INR")}</p>
          {next ? (
            <Button size="sm" onClick={() => onAdvance?.(order.id, order.status)} disabled={advancing}>
              {advancing ? "Updating…" : `Move to ${statusLabel[next]}`}
            </Button>
          ) : (
            <Button size="sm" variant="outline" disabled>
              Completed
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
