import type { OrderStatus } from "./OrderCard";

export type OrderItemRow = {
  order_id: string;
  name_snapshot: string;
  quantity: number;
};

export function buildItemSummary(items: OrderItemRow[] | undefined, maxLines = 3) {
  const list = items ?? [];
  if (list.length === 0) return "No items";

  const counts = new Map<string, number>();
  for (const it of list) {
    if (!it.name_snapshot) continue;
    counts.set(it.name_snapshot, (counts.get(it.name_snapshot) ?? 0) + (it.quantity ?? 0));
  }

  const pairs = [...counts.entries()]
    .map(([name, qty]) => ({ name, qty }))
    .sort((a, b) => b.qty - a.qty || a.name.localeCompare(b.name));

  const visible = pairs.slice(0, maxLines);
  const remaining = pairs.length - visible.length;

  const base = visible.map((p) => `${p.qty}× ${p.name}`).join(", ");
  return remaining > 0 ? `${base} +${remaining} more` : base;
}

export const KANBAN_STATUSES: OrderStatus[] = ["pending", "in_progress", "ready", "completed"];