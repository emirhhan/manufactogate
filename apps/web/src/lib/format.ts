import type { PriceInfo, RawListing } from "@manufactogate/core";

export function money(amount: number, currency: string, locale = "tr-TR"): string {
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency, maximumFractionDigits: 2 }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

/** "1,2 bin" style compact numbers for dense cells. */
export function compact(n: number, locale = "tr-TR"): string {
  try {
    return new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 }).format(n);
  } catch {
    return String(Math.round(n));
  }
}

export function priceRange(p: PriceInfo): string {
  if (!p.tiers.length) return "teklif iste";
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

/**
 * Markets whose "sold" counter is really a review/rating count (Trendyol `ratingScore.totalCount`,
 * Hepsiburada "(345)", Amazon "N değerlendirme"). The number is still useful as a demand signal,
 * but the label must say what it is.
 */
export const REVIEW_COUNT_MARKETS: ReadonlySet<string> = new Set([
  "tr-trendyol",
  "tr-hepsiburada",
  "tr-n11",
  "tr-amazon",
  "de-amazon",
  "gb-amazon",
  "us-amazon",
  "us-walmart",
  "ae-noon",
  "ru-ozon",
  "ru-wildberries",
  "jp-rakuten",
  "kr-coupang",
  "kr-gmarket",
]);

/** Human label for a listing's `sold` figure: "satış", "satış/30 gün" or "değerlendirme". */
export function soldLabel(market: string, soldPeriod?: RawListing["soldPeriod"]): string {
  if (soldPeriod === "reviews") return "değerlendirme";
  if (soldPeriod === "30d") return "satış/30 gün";
  if (soldPeriod === "total") return "satış";
  return REVIEW_COUNT_MARKETS.has(market) ? "değerlendirme" : "satış";
}

/** "1.250 satış" / "320 değerlendirme" / "" when the listing has no counter. */
export function soldText(l: Pick<RawListing, "market" | "sold" | "soldPeriod" | "reviewCount">): string {
  if (l.sold !== undefined && Number.isFinite(l.sold)) return `${l.sold.toLocaleString("tr-TR")} ${soldLabel(l.market, l.soldPeriod)}`;
  if (l.reviewCount !== undefined && Number.isFinite(l.reviewCount)) return `${l.reviewCount.toLocaleString("tr-TR")} değerlendirme`;
  return "";
}

/** A listing id for breadcrumbs: long numeric ids are shortened, slugs kept readable. */
export function shortId(id: string, max = 14): string {
  if (id.length <= max) return id;
  return `${id.slice(0, Math.max(4, max - 5))}…${id.slice(-4)}`;
}
