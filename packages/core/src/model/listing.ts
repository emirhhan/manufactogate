import type { CountryCode, CurrencyCode, IsoDateTime, MarketId } from "./ids";

export interface PriceTier {
  minQty: number;
  unitPrice: number;
}

export interface PriceInfo {
  currency: CurrencyCode;
  /** Single-price listings carry one tier with minQty 1 (or the MOQ). */
  tiers: PriceTier[];
}

/** What a market's "sold" counter measures. */
export type SoldPeriod = "30d" | "total" | "reviews";

/** A listing as an adapter returns it: normalized fields, original language. */
export interface RawListing {
  market: MarketId;
  id: string;
  url: string;
  title: string;
  images: string[];
  price: PriceInfo;
  moq?: number;
  sold?: number;
  /** What `sold` counts: 1688 reports 30-day deals, Taobao lifetime sales, Trendyol review counts. */
  soldPeriod?: SoldPeriod;
  rating?: number;
  /** Scale of `rating`: 5 (stars) or 100 (percent). Defaults to 5. */
  ratingMax?: 5 | 100;
  reviewCount?: number;
  /** Units per listed price when the listing is a pack ("10 adet", "x3", "10pcs"). */
  packQty?: number;
  /** Unit the price is quoted per: 件, 套, adet, pair. */
  unitLabel?: string;
  /** Country the item ships from, when the market shows it. */
  shipFrom?: CountryCode;
  variantCount?: number;
  supplierId?: string;
  supplierName?: string;
  location?: string;
  badges: string[];
  fetchedAt: IsoDateTime;
}

export interface ListingVariant {
  name: string;
  options: string[];
}

export interface RawListingDetail extends RawListing {
  description?: string;
  variants?: ListingVariant[];
  stock?: number;
  shippingFrom?: string;
  attributes?: Record<string, string>;
}

export type BusinessType = "factory" | "trading" | "unknown";

export interface RawSupplier {
  market: MarketId;
  id: string;
  url: string;
  name: string;
  location?: string;
  yearsOnPlatform?: number;
  badges: string[];
  repeatPurchaseRate?: number;
  responseRate?: number;
  responseTime?: string;
  mainCategories?: string[];
  businessType?: BusinessType;
}

/** Badges normalized across markets. Adapters map their raw badges to these. */
export type NormalizedBadge =
  | "verified-factory"
  | "deep-factory-audit"
  | "on-site-verified"
  | "strength-merchant"
  | "cross-border-ready"
  | "verified-supplier"
  | "trade-assurance"
  | "gold-supplier"
  | "top-rated"
  | "fast-shipping"
  | "official-store";

/**
 * Rough monthly sales from whatever counter the market exposes, so listings from
 * different markets become comparable: lifetime counters are spread over two years,
 * review counts are multiplied by a typical review rate.
 */
export function monthlySalesEstimate(listing: Pick<RawListing, "sold" | "soldPeriod" | "reviewCount">): number | null {
  const sold = listing.sold;
  if (sold === undefined || sold === null || !Number.isFinite(sold)) {
    if (listing.reviewCount !== undefined) return Math.round(listing.reviewCount * 8);
    return null;
  }
  switch (listing.soldPeriod) {
    case "30d":
      return Math.round(sold);
    case "reviews":
      return Math.round(sold * 8);
    case "total":
      return Math.round(sold / 24);
    default:
      // Unknown period: treat as lifetime (conservative).
      return Math.round(sold / 24);
  }
}

/** Rating normalised to a 0..5 scale, or null when the listing has none. */
export function ratingOutOf5(listing: Pick<RawListing, "rating" | "ratingMax">): number | null {
  const r = listing.rating;
  if (r === undefined || r === null || !Number.isFinite(r)) return null;
  const max = listing.ratingMax ?? (r > 5 ? 100 : 5);
  const v = (r / max) * 5;
  return Math.max(0, Math.min(5, Math.round(v * 100) / 100));
}

/** Lowest tier price divided by the pack quantity: the price of one unit. */
export function unitPriceNormalized(listing: Pick<RawListing, "price" | "packQty">, tierIndex?: number): number | null {
  const tiers = listing.price.tiers;
  if (!tiers.length) return null;
  const tier = tierIndex !== undefined ? tiers[tierIndex] : [...tiers].sort((a, b) => a.unitPrice - b.unitPrice)[0];
  if (!tier) return null;
  const pack = listing.packQty && listing.packQty > 0 ? listing.packQty : 1;
  return tier.unitPrice / pack;
}
