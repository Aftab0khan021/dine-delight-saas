export function formatMoney(
  cents: number,
  currency: string = "INR",
  options?: Intl.NumberFormatOptions,
) {
  const safeCurrency = (currency || "INR").toUpperCase();
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: safeCurrency,
      maximumFractionDigits: 2,
      ...(options ?? {}),
    }).format((cents ?? 0) / 100);
  } catch {
    return `${((cents ?? 0) / 100).toFixed(2)} ${safeCurrency}`;
  }
}

/** Convert a user-entered price (e.g. 100, 100.05, .04) to cents for DB storage */
export function toCents(value: number | string): number {
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(num)) return 0;
  return Math.round(num * 100);
}

/** Convert cents from DB back to a display-friendly number (e.g. 10005 → 100.05) */
export function fromCents(cents: number | null | undefined): number {
  return (cents ?? 0) / 100;
}

export function shortId(id: string | null | undefined) {
  if (!id) return "—";
  return `#${id.slice(0, 4)}`;
}
