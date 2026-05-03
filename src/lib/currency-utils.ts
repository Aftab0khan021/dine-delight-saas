/**
 * Shared currency utilities for the admin panel.
 * Centralizes symbol mapping and example formatting to avoid duplication.
 */

const CURRENCY_SYMBOLS: Record<string, string> = {
  INR: "₹",
  USD: "$",
  EUR: "€",
  GBP: "£",
  AUD: "A$",
  CAD: "C$",
  SGD: "S$",
  AED: "د.إ",
  JPY: "¥",
  CNY: "¥",
};

/** Returns the symbol for a given ISO currency code (e.g. "INR" → "₹"). */
export function getCurrencySymbol(code: string): string {
  return CURRENCY_SYMBOLS[code] || code;
}

/** Returns a human-readable example string showing how cents map to display (e.g. "10000 = ₹100.00"). */
export function getCurrencyExample(currencyCode: string = "INR"): string {
  const examples: Record<string, { amount: number; symbol: string }> = {
    INR: { amount: 10000, symbol: "₹" },
    USD: { amount: 1000, symbol: "$" },
    EUR: { amount: 1000, symbol: "€" },
    GBP: { amount: 1000, symbol: "£" },
    AUD: { amount: 1000, symbol: "A$" },
    CAD: { amount: 1000, symbol: "C$" },
    SGD: { amount: 1000, symbol: "S$" },
    AED: { amount: 1000, symbol: "د.إ" },
    JPY: { amount: 1000, symbol: "¥" },
    CNY: { amount: 1000, symbol: "¥" },
  };
  const ex = examples[currencyCode] || examples["INR"];
  return `${ex.amount} = ${ex.symbol}${(ex.amount / 100).toFixed(2)}`;
}
