import type { PriceInfo } from "@manufactogate/core";

export function money(amount: number, currency: string, locale = "tr-TR"): string {
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency, maximumFractionDigits: 2 }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

export function priceRange(p: PriceInfo): string {
  const prices = p.tiers.map((t) => t.unitPrice);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  return min === max ? money(min, p.currency) : `${money(min, p.currency)} – ${money(max, p.currency)}`;
}

export function pct(x: number): string {
  return `%${Math.round(x * 100)}`;
}

export function relTime(iso: string, now = Date.now()): string {
  const s = Math.max(0, (now - new Date(iso).getTime()) / 1000);
  if (s < 60) return "az önce";
  if (s < 3600) return `${Math.floor(s / 60)} dk önce`;
  if (s < 86400) return `${Math.floor(s / 3600)} sa önce`;
  return `${Math.floor(s / 86400)} gün önce`;
}
