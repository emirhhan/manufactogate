import type { CurrencyCode, IsoDateTime, MarketId } from "./ids";

export interface PriceTier {
  minQty: number;
  unitPrice: number;
}

export interface PriceInfo {
  currency: CurrencyCode;
  /** Single-price listings carry one tier with minQty 1 (or the MOQ). */
  tiers: PriceTier[];
}

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
  rating?: number;
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
