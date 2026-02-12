export function formatMoney(
  cents: number,
  currency: string = "USD",
  options?: Intl.NumberFormatOptions,
) {
  const safeCurrency = (currency || "USD").toUpperCase();
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

export function shortId(id: string | null | undefined) {
  if (!id) return "—";
  return `#${id.slice(0, 4)}`;
}

