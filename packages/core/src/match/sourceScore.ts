/**
 * "En uygun kaynak" score (PLAN §3.3): one number per listing that weighs match confidence,
 * unit price, MOQ fit, supplier trust and shipping, with user-adjustable weights. The web app's
 * sliders feed `SourceWeights`; every factor reports its value, weight and contribution so the
 * card can explain the ranking in Turkish.
 */
import { unitPriceNormalized, type CountryCode, type CurrencyCode, type NormalizedBadge, type RawListing, type RawSupplier } from "../model";
import { traceScore, type TraceResult } from "../supplier/trace";

export interface SourceWeights {
  match: number;
  price: number;
  moq: number;
  supplier: number;
  shipping: number;
}

export type SourceFactor = keyof SourceWeights;

export const SOURCE_FACTORS: readonly SourceFactor[] = ["match", "price", "moq", "supplier", "shipping"] as const;

export const DEFAULT_SOURCE_WEIGHTS: Readonly<SourceWeights> = Object.freeze({ match: 0.35, price: 0.25, moq: 0.15, supplier: 0.15, shipping: 0.1 });

export const SOURCE_FACTOR_LABELS_TR: Record<SourceFactor, string> = {
  match: "Eşleşme güveni",
  price: "Birim fiyat",
  moq: "MOQ uyumu",
  supplier: "Tedarikçi güveni",
  shipping: "Kargo ve teslimat",
};

/** Short hint shown under each slider. */
export const SOURCE_FACTOR_HINTS_TR: Record<SourceFactor, string> = {
  match: "Aynı ürün olduğundan ne kadar eminiz",
  price: "Kümedeki en düşük birim fiyata yakınlık",
  moq: "Minimum sipariş adedi istenen adede uyuyor mu",
  supplier: "Fabrika olasılığı, doğrulama, yıl ve puan",
  shipping: "Çıkış ülkesi, teslim süresi, kargo rozetleri",
};

/**
 * Clamps negatives and NaN to 0 and rescales so the five weights sum to 1. All-zero (or empty)
 * input falls back to the defaults, so a slider set cannot silence every factor at once.
 */
export function normalizeSourceWeights(weights: Partial<SourceWeights> | undefined): SourceWeights {
  const clean = (v: number | undefined) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0);
  const w: SourceWeights = {
    match: clean(weights?.match),
    price: clean(weights?.price),
    moq: clean(weights?.moq),
    supplier: clean(weights?.supplier),
    shipping: clean(weights?.shipping),
  };
  const sum = w.match + w.price + w.moq + w.supplier + w.shipping;
  if (sum <= 0) return { ...DEFAULT_SOURCE_WEIGHTS };
  for (const k of SOURCE_FACTORS) w[k] = w[k] / sum;
  return w;
}

export interface SourceContext {
  /** Match confidence of the listing against the query (0..1). */
  matchScore?: number;
  /** Planned order quantity, for the price tier and MOQ fit. */
  quantity?: number;
  /**
   * Reference unit prices of the cluster (min and, optionally, median). In the listing's currency,
   * or in the common currency when `toCommon` is given.
   */
  priceRef?: { min: number; median?: number };
  /** Converts a listing price to the reference currency; null when the rate is unknown. */
  toCommon?: (amount: number, currency: CurrencyCode) => number | null;
  /** Where the goods must arrive (ISO alpha-2, lower case). */
  targetCountry?: CountryCode;
  /** Estimated door-to-door days for this listing's shipping option. */
  shippingDays?: number;
  badges?: NormalizedBadge[];
  supplier?: RawSupplier;
  /** Precomputed factory trace; computed from the listing when missing. */
  trace?: TraceResult;
}

export interface SourceFactorResult {
  factor: SourceFactor;
  /** Turkish label. */
  label: string;
  /** 0..1 factor value. */
  value: number;
  /** Normalised weight. */
  weight: number;
  /** value × weight. */
  contribution: number;
  /** Why the factor got this value (Turkish). */
  note: string;
}

export interface SourceScore {
  /** 0..1 weighted sum. */
  score: number;
  weights: SourceWeights;
  factors: SourceFactorResult[];
}

const EU = new Set(["de", "nl", "pl", "ro", "fr", "it", "es", "be", "at", "cz", "sk", "hu", "bg", "hr", "si", "se", "dk", "fi", "ie", "pt", "gr", "lt", "lv", "ee", "lu", "mt", "cy"]);
const NEAR_TR = new Set(["tr", "ge", "az", "bg", "gr", "ro", "ir", "iq"]);

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}
const r2 = (x: number) => Math.round(x * 100) / 100;

/** Unit price at the planned quantity (the highest tier whose minQty is reached), pack-normalised. */
export function unitPriceAtQuantity(listing: Pick<RawListing, "price" | "packQty">, quantity?: number): number | null {
  const tiers = listing.price.tiers;
  if (!tiers.length) return null;
  if (quantity === undefined || !Number.isFinite(quantity)) return unitPriceNormalized(listing);
  const sorted = [...tiers].sort((a, b) => a.minQty - b.minQty);
  let chosen = sorted[0]!;
  for (const t of sorted) if (t.minQty <= quantity) chosen = t;
  const pack = listing.packQty && listing.packQty > 0 ? listing.packQty : 1;
  return chosen.unitPrice / pack;
}

function matchFactor(ctx: SourceContext): { value: number; note: string } {
  if (ctx.matchScore === undefined || !Number.isFinite(ctx.matchScore)) return { value: 0.5, note: "eşleşme skoru yok" };
  const v = clamp01(ctx.matchScore);
  return { value: v, note: v >= 0.85 ? "aynı ürün" : v >= 0.6 ? "büyük olasılıkla aynı" : v >= 0.35 ? "benzer olabilir" : "zayıf eşleşme" };
}

function priceFactor(listing: RawListing, ctx: SourceContext): { value: number; note: string } {
  const raw = unitPriceAtQuantity(listing, ctx.quantity);
  if (raw === null) return listing.priceOnRequest ? { value: 0.3, note: "fiyat teklifle alınır" } : { value: 0.2, note: "fiyat yok" };
  let price = raw;
  if (ctx.toCommon) {
    const c = ctx.toCommon(raw, listing.price.currency);
    if (c === null || !Number.isFinite(c)) return { value: 0.5, note: `${listing.price.currency} kuru bilinmiyor` };
    price = c;
  }
  const ref = ctx.priceRef;
  if (!ref || !(ref.min > 0)) return { value: 0.6, note: "karşılaştırma fiyatı yok" };
  if (price <= 0) return { value: 0.2, note: "fiyat yok" };
  const ratio = ref.min / price;
  const value = clamp01(ratio);
  const pct = Math.round((price / ref.min - 1) * 100);
  const note = pct <= 2 ? "kümedeki en düşük fiyat" : `en düşük fiyatın %${pct} üstünde`;
  if (ref.median !== undefined && ref.median > 0 && price > ref.median * 1.5) return { value: Math.min(value, 0.4), note: `${note}, medyanın çok üstünde` };
  return { value, note };
}

function moqFactor(listing: RawListing, ctx: SourceContext): { value: number; note: string } {
  const moq = listing.moq;
  if (moq === undefined || !Number.isFinite(moq) || moq <= 0) return { value: 0.8, note: "MOQ belirtilmemiş" };
  const q = ctx.quantity;
  if (q !== undefined && Number.isFinite(q) && q > 0) {
    if (moq <= q) return { value: 1, note: `MOQ ${moq} ≤ istenen ${q} adet` };
    return { value: clamp01(q / moq), note: `MOQ ${moq} > istenen ${q} adet` };
  }
  if (moq <= 1) return { value: 1, note: "tek adet alınabilir" };
  if (moq <= 10) return { value: 0.9, note: `MOQ ${moq}` };
  if (moq <= 100) return { value: 0.75, note: `MOQ ${moq}` };
  if (moq <= 500) return { value: 0.6, note: `MOQ ${moq}` };
  return { value: 0.4, note: `MOQ ${moq}, yüksek` };
}

function supplierFactor(listing: RawListing, ctx: SourceContext): { value: number; note: string } {
  const trace = ctx.trace ?? traceScore(listing, ctx.badges ?? [], ctx.supplier);
  const parts: string[] = [];
  let v = trace.factory * 0.5;
  if (trace.factory >= 0.7) parts.push("muhtemel üretici");
  else if (trace.factory <= 0.3) parts.push("muhtemel aracı");
  const info = listing.supplier;
  const verified = info?.verified === true || (ctx.badges ?? []).some((b) => b === "verified-supplier" || b === "verified-factory" || b === "trade-assurance" || b === "gold-supplier");
  if (verified) {
    v += 0.2;
    parts.push("doğrulanmış");
  }
  const years = info?.years ?? ctx.supplier?.yearsOnPlatform;
  if (years !== undefined && Number.isFinite(years) && years > 0) {
    v += (Math.min(years, 10) / 10) * 0.15;
    parts.push(`${Math.round(years)} yıl`);
  }
  const rating = info?.rating ?? listing.rating;
  if (rating !== undefined && Number.isFinite(rating)) {
    const max = listing.ratingMax ?? (rating > 5 ? 100 : 5);
    const r5 = (rating / max) * 5;
    const count = info?.ratingCount ?? listing.reviewCount ?? 0;
    const weight = count >= 50 ? 1 : count >= 10 ? 0.7 : 0.4;
    v += clamp01((r5 - 3) / 2) * 0.15 * weight;
    parts.push(`puan ${r5.toFixed(1)}`);
  }
  if ((ctx.supplier?.repeatPurchaseRate ?? 0) >= 0.3) {
    v += 0.05;
    parts.push("yüksek tekrar alım");
  }
  return { value: clamp01(v), note: parts.length ? parts.join(", ") : "tedarikçi bilgisi az" };
}

function shippingFactor(listing: RawListing, ctx: SourceContext): { value: number; note: string } {
  const parts: string[] = [];
  let v: number | null = null;
  const from = listing.shipFrom ?? listing.market.split("-")[0];
  const to = ctx.targetCountry;
  if (from && to) {
    if (from === to) {
      v = 1;
      parts.push("yurt içi gönderim");
    } else if (EU.has(from) && EU.has(to)) {
      v = 0.85;
      parts.push("AB içi gönderim");
    } else if (NEAR_TR.has(from) && NEAR_TR.has(to)) {
      v = 0.7;
      parts.push("yakın bölge");
    } else {
      v = 0.45;
      parts.push(`${from.toUpperCase()} → ${to.toUpperCase()}`);
    }
  }
  if (ctx.shippingDays !== undefined && Number.isFinite(ctx.shippingDays)) {
    const d = ctx.shippingDays;
    const dv = d <= 7 ? 1 : d <= 15 ? 0.8 : d <= 30 ? 0.6 : d <= 45 ? 0.45 : 0.3;
    v = v === null ? dv : (v + dv) / 2;
    parts.push(`~${Math.round(d)} gün`);
  }
  if (v === null) {
    v = 0.5;
    parts.push("kargo bilgisi yok");
  }
  const badges = ctx.badges ?? [];
  if (badges.includes("fast-shipping")) {
    v += 0.15;
    parts.push("hızlı kargo rozeti");
  }
  if (badges.includes("cross-border-ready")) {
    v += 0.1;
    parts.push("sınır ötesi hazır");
  }
  return { value: clamp01(v), note: parts.join(", ") };
}

/** Weighted source score for one listing; weights are normalised before use. */
export function scoreSource(listing: RawListing, ctx: SourceContext = {}, weights: Partial<SourceWeights> = DEFAULT_SOURCE_WEIGHTS): SourceScore {
  const w = normalizeSourceWeights(weights);
  const raw: Record<SourceFactor, { value: number; note: string }> = {
    match: matchFactor(ctx),
    price: priceFactor(listing, ctx),
    moq: moqFactor(listing, ctx),
    supplier: supplierFactor(listing, ctx),
    shipping: shippingFactor(listing, ctx),
  };
  const factors: SourceFactorResult[] = SOURCE_FACTORS.map((factor) => {
    const value = r2(clamp01(raw[factor].value));
    const weight = w[factor];
    return { factor, label: SOURCE_FACTOR_LABELS_TR[factor], value, weight, contribution: value * weight, note: raw[factor].note };
  });
  const score = clamp01(factors.reduce((s, f) => s + f.contribution, 0));
  return { score: Math.round(score * 1000) / 1000, weights: w, factors };
}

export interface SourceExplanation {
  factor: SourceFactor;
  label: string;
  /** Percent, 0..100. */
  value: number;
  /** Percent of the total weight, 0..100. */
  weight: number;
  /** Points out of 100 this factor added to the score. */
  points: number;
  note: string;
  /** "Eşleşme güveni %90 × ağırlık %35 → +32 puan (aynı ürün)". */
  text: string;
}

/** Per-factor contributions in Turkish, largest first, for the source card and the weight sliders. */
export function explainSourceScore(result: SourceScore): SourceExplanation[] {
  return result.factors
    .map((f) => {
      const value = Math.round(f.value * 100);
      const weight = Math.round(f.weight * 100);
      const points = Math.round(f.contribution * 100);
      return { factor: f.factor, label: f.label, value, weight, points, note: f.note, text: `${f.label} %${value} × ağırlık %${weight} → +${points} puan (${f.note})` };
    })
    .sort((a, b) => b.points - a.points || a.label.localeCompare(b.label, "tr"));
}

export interface RankedSource<T> {
  item: T;
  result: SourceScore;
}

/** Scores and sorts several listings with the same weights; ties keep input order. */
export function rankSources<T extends { listing: RawListing; ctx?: SourceContext }>(items: T[], weights: Partial<SourceWeights> = DEFAULT_SOURCE_WEIGHTS): RankedSource<T>[] {
  const w = normalizeSourceWeights(weights);
  return items
    .map((item, i) => ({ item, result: scoreSource(item.listing, item.ctx ?? {}, w), i }))
    .sort((a, b) => b.result.score - a.result.score || a.i - b.i)
    .map(({ item, result }) => ({ item, result }));
}
