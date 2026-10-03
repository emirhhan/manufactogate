import { ratingOutOf5, type ListingHint, type ListingSupplierInfo, type RawListing, type RawSupplier } from "@manufactogate/core";
import { money } from "./format";
import { maxOf, minOf } from "./fx";
import { soldLabel } from "./format";

/**
 * Pure presentation helpers for the listing page, reading the real RawListing fields the
 * adapters now populate (priceMax, priceOnRequest, reviewCount, soldPeriod, packQty, unitLabel,
 * supplier.*). Older stored listings without those fields fall back to the market defaults.
 */

export const PRICE_ON_REQUEST_TEXT = "Fiyat teklifle";

/**
 * Hint for `MarketAdapter.fetchListing(id, hint)`: the URL the listing was seen at and its seller,
 * so markets that serve one page per seller (Trendyol merchantId) open that seller's own offer
 * instead of the buy-box winner (P0-7). Pure.
 */
export function listingHint(l: Pick<RawListing, "url" | "supplierId">): ListingHint {
  return { ...(l.url ? { url: l.url } : {}), ...(l.supplierId ? { supplierId: l.supplierId } : {}) };
}

/** "₺120", "US$ 14.49 – 14.99" (priceMax or tier spread) or "Fiyat teklifle"; never `Math.min()` → Infinity. */
export function priceText(l: Pick<RawListing, "price" | "priceMax" | "priceOnRequest">): string {
  if (l.priceOnRequest || !l.price.tiers.length) return PRICE_ON_REQUEST_TEXT;
  const min = minOf(l);
  const max = maxOf(l);
  if (min === null || max === null) return PRICE_ON_REQUEST_TEXT;
  return min === max ? money(min, l.price.currency) : `${money(min, l.price.currency)} – ${money(max, l.price.currency)}`;
}

/** "/ 10 adet (paket)" style suffix when the price is per pack or quoted per unit label. */
export function unitText(l: Pick<RawListing, "packQty" | "unitLabel">): string {
  const parts: string[] = [];
  if (l.packQty && l.packQty > 1) parts.push(`${l.packQty} adetlik paket`);
  if (l.unitLabel) parts.push(`birim: ${l.unitLabel}`);
  return parts.join(" · ");
}

export interface CounterLine {
  key: "sold" | "reviews";
  text: string;
}

/**
 * Sales and review counters from the real fields: `sold` with its period label, and
 * `reviewCount` separately when the market reports both. When `sold` is a review count
 * (soldPeriod "reviews") and `reviewCount` is absent, only one line is shown.
 */
export function counterLines(l: Pick<RawListing, "market" | "sold" | "soldPeriod" | "reviewCount">): CounterLine[] {
  const out: CounterLine[] = [];
  const hasSold = l.sold !== undefined && Number.isFinite(l.sold);
  const hasReviews = l.reviewCount !== undefined && Number.isFinite(l.reviewCount);
  if (hasSold) {
    const label = soldLabel(l.market, l.soldPeriod);
    out.push({ key: label === "değerlendirme" ? "reviews" : "sold", text: `${l.sold!.toLocaleString("tr-TR")} ${label}` });
  }
  if (hasReviews && !(hasSold && l.soldPeriod === "reviews" && l.reviewCount === l.sold) && !out.some((o) => o.key === "reviews")) out.push({ key: "reviews", text: `${l.reviewCount!.toLocaleString("tr-TR")} değerlendirme` });
  return out;
}

/** "Puan 4.7" (normalised to 5) with the count when the market gave one. */
export function ratingText(l: Pick<RawListing, "rating" | "ratingMax" | "reviewCount">): string {
  const r = ratingOutOf5(l);
  if (r === null) return "";
  return `Puan ${r.toFixed(1)}${l.ratingMax === 100 ? ` (%${Math.round(l.rating ?? 0)})` : ""}`;
}

export interface SupplierSignal {
  key: "years" | "verified" | "businessType" | "rating";
  label: string;
  tone: "success" | "warning" | "neutral";
}

const BUSINESS_TYPE_TR: Record<NonNullable<ListingSupplierInfo["businessType"]>, string> = { factory: "Üretici", trading: "Ticaret firması", unknown: "" };

/** Supplier signals read from the card (years, verified, business type, shop rating), with the profile filling gaps. */
export function supplierSignals(l: Pick<RawListing, "supplier">, profile?: RawSupplier | null): SupplierSignal[] {
  const s = l.supplier ?? {};
  const out: SupplierSignal[] = [];
  const years = s.years ?? profile?.yearsOnPlatform;
  if (years !== undefined && years > 0) out.push({ key: "years", label: `${years} yıldır pazarda`, tone: years >= 5 ? "success" : years < 2 ? "warning" : "neutral" });
  if (s.verified) out.push({ key: "verified", label: "Doğrulanmış tedarikçi", tone: "success" });
  const bt = s.businessType ?? profile?.businessType;
  if (bt && bt !== "unknown") out.push({ key: "businessType", label: BUSINESS_TYPE_TR[bt], tone: bt === "factory" ? "success" : "neutral" });
  if (s.rating !== undefined && Number.isFinite(s.rating)) {
    const r = s.rating > 5 ? s.rating / 20 : s.rating;
    out.push({ key: "rating", label: `Mağaza puanı ${r.toFixed(1)}${s.ratingCount ? ` (${s.ratingCount.toLocaleString("tr-TR")})` : ""}`, tone: r >= 4.5 ? "success" : r < 3.5 ? "warning" : "neutral" });
  }
  return out;
}

/**
 * Merges the card-level supplier signals into a profile shape the core trace scorer understands,
 * so years/verified/business type count even when the market has no shop page.
 */
export function supplierFromListing(l: Pick<RawListing, "market" | "supplierId" | "supplierName" | "supplier" | "location">, profile?: RawSupplier | null): RawSupplier | undefined {
  const s = l.supplier;
  if (profile) {
    if (!s) return profile;
    return {
      ...profile,
      ...(profile.yearsOnPlatform === undefined && s.years !== undefined ? { yearsOnPlatform: s.years } : {}),
      ...((profile.businessType === undefined || profile.businessType === "unknown") && s.businessType ? { businessType: s.businessType } : {}),
      badges: s.verified && !profile.badges.includes("verified-supplier") ? [...profile.badges, "verified-supplier"] : profile.badges,
    };
  }
  if (!s || !Object.keys(s).length) return undefined;
  return {
    market: l.market,
    id: l.supplierId ?? l.supplierName ?? "",
    url: "",
    name: l.supplierName ?? "",
    badges: s.verified ? ["verified-supplier"] : [],
    ...(l.location ? { location: l.location } : {}),
    ...(s.years !== undefined ? { yearsOnPlatform: s.years } : {}),
    ...(s.businessType ? { businessType: s.businessType } : {}),
  };
}

/** Language hint for the title ("Başlık sayfada İngilizce gösterildi"), only when it differs from the market's own language. */
export function titleLangNote(l: Pick<RawListing, "titleLang">, marketLanguage: string | undefined): string {
  if (!l.titleLang || !marketLanguage || l.titleLang.toLowerCase().startsWith(marketLanguage.toLowerCase())) return "";
  const names: Record<string, string> = { en: "İngilizce", tr: "Türkçe", de: "Almanca", zh: "Çince", ja: "Japonca", ko: "Korece", ru: "Rusça", id: "Endonezce", th: "Tayca", ar: "Arapça" };
  const n = names[l.titleLang.toLowerCase().slice(0, 2)];
  return n ? `Başlık pazarda ${n} gösterildi` : "";
}
