export type QrType = "general" | "table";

export function buildDestinationPath(type: QrType, tableLabel?: string | null) {
  if (type === "general") return "/menu";
  const label = tableLabel ?? "";
  const encoded = encodeURIComponent(label);
  return `/menu?table=${encoded}`;
}

export function buildTableLabel(prefix: string | undefined, tableNumber: number) {
  const p = (prefix ?? "").trim();
  return `${p}${tableNumber}`;
}
