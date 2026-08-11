import type { Currency } from "../mocks/data";

/** KRW/JPY: whole units (rounded). USD: 2 decimal places. */
export function formatMoney(
  amount: number,
  currency: Currency,
  options?: { withSymbol?: boolean },
): string {
  const rounded =
    currency === "USD" ? amount : Math.round(amount);
  const digits = currency === "USD" ? 2 : 0;
  const number = rounded.toLocaleString(undefined, {
    minimumFractionDigits: currency === "USD" ? 2 : 0,
    maximumFractionDigits: digits,
  });
  if (!options?.withSymbol) return number;
  const symbol = { KRW: "₩", JPY: "¥", USD: "$" }[currency];
  return `${symbol}${number}`;
}
