import { computeLandedCost, computeMargin, normalizeBadges, pickTier, type CostResult, type CountryProfile, type MarketAdapter, type MarketId, type NormalizedBadge, type PriceTier, type RawListing, type RawSupplier } from "@manufactogate/core";
import { getCountryProfile } from "@manufactogate/country-profiles";
import { convert, getRate, minOf } from "./fx";
import { sellerDisplayName, storeUrl } from "./markets";
import { getRegistry } from "./registry";

/** Robust central tendency helpers. */
export function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}
export function quantile(xs: number[], q: number): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.round((s.length - 1) * q)))]!;
}
/** Lowest tier price; Infinity for price-on-request listings so Math.min-style callers keep working. */
export const minPrice = (l: RawListing) => minOf(l) ?? Infinity;

/** Rate "1 unit of `from` = x units of `to`", preferring the user's CNY rate from Settings. */
export function rateFor(from: string, to: string, cnyTry: number | undefined): number | null {
  if (from === to) return 1;
  if (from === "CNY" && cnyTry && cnyTry > 0) {
    if (to === "TRY") return cnyTry;
    const r = getRate(to);
    return r ? cnyTry / r : null;
  }
  return convert(1, from, to);
}

/** Quantity to cost at: the user's number, else the second tier's MOQ, else max(MOQ, 100). */
export function pickQty(tiers: PriceTier[], moq: number | undefined, user?: number | null): number {
  if (user && Number.isFinite(user) && user > 0) return Math.floor(user);
  const sorted = [...tiers].sort((a, b) => a.minQty - b.minQty);
  const second = sorted[1]?.minQty;
  if (second && second > 1) return second;
  return Math.max(moq ?? 1, 100);
}

/** A shipping key that exists in the profile (settings may hold a key from another country). */
export function shippingKeyFor(profile: CountryProfile, key: string | undefined): string {
  return key && profile.shipping.some((s) => s.key === key) ? key : profile.shipping[0]!.key;
}

/** Marketplace commission key for a market id within a profile (falls back to the first entry). */
export function marketplaceFor(profile: CountryProfile, market: string | undefined): string {
  const keys = Object.keys(profile.commissions);
  if (market && keys.includes(market)) return market;
  return keys[0] ?? "";
}

/** Role of a market relative to the target country: markets of the target country are "target". */
export function roleOf(adapter: Pick<MarketAdapter, "meta"> | undefined, targetCountry: string): "source" | "target" {
  if (!adapter) return "source";
  if (adapter.meta.country === targetCountry) return "target";
  if (adapter.meta.role === "target") return "target";
  return "source";
}

/** Cheapest listing (in `currency`) among those with a usable currency; optional minimum relevance. */
export function bestByRole(
  listings: RawListing[],
  role: "source" | "target",
  opts: { targetCountry: string; currency: string; cnyTry?: number; relevanceOf?: (l: RawListing) => number | undefined; minRelevance?: number },
): RawListing | null {
  const reg = getRegistry();
  let best: RawListing | null = null;
  let bestPrice = Infinity;
  for (const l of listings) {
    if (roleOf(reg.get(l.market), opts.targetCountry) !== role) continue;
    if (opts.relevanceOf && (opts.relevanceOf(l) ?? 0) < (opts.minRelevance ?? 0.5)) continue;
    const m = minOf(l);
    if (m === null) continue;
    const r = rateFor(l.price.currency, opts.currency, opts.cnyTry);
    if (r === null) continue;
    const p = m * r;
    if (p < bestPrice) {
      bestPrice = p;
      best = l;
    }
  }
  return best;
}

export interface RegionStats {
  key: "source" | "target";
  label: string;
  markets: string[];
  count: number;
  min: number | null;
  median: number | null;
  p25: number | null;
  /** Distinct sellers among listings whose seller is known. */
  sellers: number;
  sellersKnown: number;
  /** Listings whose seller could not be read from the card. */
  sellersUnknownListings: number;
  topSold: number;
  /** True when at least one listing carries a sales/review counter. */
  hasSoldData: boolean;
  currency: string;
}

export interface SubScores {
  margin: number;
  demand: number;
  availability: number;
  competition: number;
}

export interface ChainStep {
  key: "source" | "landed" | "sell" | "net";
  label: string;
  amount: number;
  currency: string;
  /** Change versus the previous step (fraction), undefined for the first. */
  delta?: number;
  note?: string;
}

export interface MarketAnalysis {
  source: RegionStats;
  target: RegionStats;
  /** Landed cost per unit (target currency) from the cheapest source listing. */
  landedPerUnit: number | null;
  landedFrom: RawListing | null;
  landedQty: number | null;
  /** Net margin at the target median price. */
  marginAtMedian: { net: number; rate: number } | null;
  /** 0..100: how attractive this product looks for import + resale. */
  score: number;
  sub: SubScores;
  verdicts: { tone: "success" | "warning" | "danger" | "neutral"; text: string }[];
  /** How many listings fed the numbers after the relevance filter. */
  basedOn: { used: number; total: number; filtered: boolean };
  chain: ChainStep[] | null;
  currency: string;
}

export interface AnalyzeOptions {
  targetCountry: string;
  /** User's CNY→TRY rate from Settings. */
  fx: number;
  weightKg: number;
  shippingKey: string;
  overheadRate: number;
  /** Title relevance per listing; listings under `minRelevance` are left out (fallback to all when < 5 remain). */
  relevanceOf?: (l: RawListing) => number | undefined;
  minRelevance?: number;
}

/** Builds the factory → landed → retail → net chain in one currency, with step deltas. */
export function buildChain(input: { sourceLabel: string; sourceUnit: number; sourceCurrency: string; landedPerUnit: number; sell?: { label: string; price: number } | null; net?: number | null; currency: string; cnyTry?: number }): ChainStep[] {
  const steps: ChainStep[] = [];
  const r = rateFor(input.sourceCurrency, input.currency, input.cnyTry);
  const src = r !== null ? input.sourceUnit * r : null;
  if (src !== null) steps.push({ key: "source", label: input.sourceLabel, amount: src, currency: input.currency, ...(input.sourceCurrency !== input.currency ? { note: `${input.sourceUnit.toFixed(2)} ${input.sourceCurrency}` } : {}) });
  steps.push({ key: "landed", label: "İndirilmiş maliyet", amount: input.landedPerUnit, currency: input.currency });
  if (input.sell && input.sell.price > 0) steps.push({ key: "sell", label: input.sell.label, amount: input.sell.price, currency: input.currency });
  if (input.net !== undefined && input.net !== null && input.sell) steps.push({ key: "net", label: "Net kazanç / adet", amount: input.net, currency: input.currency, note: "komisyon ve gider sonrası" });
  for (let i = 1; i < steps.length; i++) {
    const prev = steps[i - 1]!.amount;
    const cur = steps[i]!;
    if (cur.key === "net") {
      if (input.sell && input.sell.price > 0) cur.delta = cur.amount / input.sell.price;
    } else if (prev > 0) cur.delta = cur.amount / prev - 1;
  }
  return steps;
}

/** Summarises a result set: where it is cheapest, who sells it in the target country, and whether the margin works. */
export function analyzeResults(all: RawListing[], opts: AnalyzeOptions): MarketAnalysis {
  const reg = getRegistry();
  const profile = getCountryProfile(opts.targetCountry) ?? getCountryProfile("tr")!;
  const cur = profile.currency;
  const minRel = opts.minRelevance ?? 0.5;
  let listings = all;
  let filtered = false;
  if (opts.relevanceOf) {
    const kept = all.filter((l) => (opts.relevanceOf!(l) ?? 1) >= minRel);
    if (kept.length >= 5) {
      listings = kept;
      filtered = kept.length !== all.length;
    }
  }
  const src = listings.filter((l) => roleOf(reg.get(l.market), opts.targetCountry) === "source");
  const tgt = listings.filter((l) => roleOf(reg.get(l.market), opts.targetCountry) === "target");
  const toCur = (l: RawListing): number | null => {
    const m = minOf(l);
    if (m === null) return null;
    const r = rateFor(l.price.currency, cur, opts.fx);
    return r === null ? null : m * r;
  };

  const stats = (key: "source" | "target", ls: RawListing[], label: string): RegionStats => {
    const prices = ls.map(toCur).filter((n): n is number => n !== null && n > 0);
    const known = new Set<string>();
    let unknown = 0;
    for (const l of ls) {
      const k = l.supplierId ?? l.supplierName;
      if (k) known.add(`${l.market}:${k}`);
      else unknown++;
    }
    const soldValues = ls.map((l) => l.sold).filter((n): n is number => n !== undefined && Number.isFinite(n));
    return {
      key,
      label,
      markets: [...new Set(ls.map((l) => reg.get(l.market)?.meta.name ?? l.market))],
      count: ls.length,
      min: prices.length ? Math.min(...prices) : null,
      median: median(prices),
      p25: quantile(prices, 0.25),
      sellers: known.size,
      sellersKnown: ls.length - unknown,
      sellersUnknownListings: unknown,
      topSold: soldValues.length ? Math.max(...soldValues) : 0,
      hasSoldData: soldValues.length > 0,
      currency: cur,
    };
  };
  const source = stats("source", src, "Tedarik pazarları");
  const target = stats("target", tgt, "Hedef pazar");

  // Landed cost from the cheapest source listing with a usable currency.
  const cheapest = bestByRole(src, "source", { targetCountry: opts.targetCountry, currency: cur, cnyTry: opts.fx });
  let landedPerUnit: number | null = null;
  let landedQty: number | null = null;
  if (cheapest) {
    const fx = rateFor(cheapest.price.currency, cur, opts.fx) ?? 1;
    const qty = pickQty(cheapest.price.tiers, cheapest.moq);
    landedQty = qty;
    landedPerUnit = computeLandedCost(profile, { quantity: qty, tiers: cheapest.price.tiers, fxRate: fx, unitWeightKg: opts.weightKg, shippingKey: shippingKeyFor(profile, opts.shippingKey) }).perUnit;
  }
  const tgtBest = bestByRole(tgt, "target", { targetCountry: opts.targetCountry, currency: cur, cnyTry: opts.fx });
  const marketplaceId = marketplaceFor(profile, tgtBest?.market);
  const marginAtMedian =
    landedPerUnit !== null && target.median
      ? (() => {
          const m = computeMargin(profile, landedPerUnit, { sellPrice: target.median!, marketplaceId, overheadRate: opts.overheadRate });
          return { net: m.netPerUnit, rate: m.marginRate };
        })()
      : null;

  // Sub-scores: margin 50 (full at 30 %), demand 25 (neutral 10 when no counter), availability 15, competition 10 (inverse).
  const sub: SubScores = { margin: 0, demand: 0, availability: 0, competition: 0 };
  if (marginAtMedian) sub.margin = Math.max(0, Math.min(50, (marginAtMedian.rate / 0.3) * 50));
  else if (landedPerUnit !== null) sub.margin = 15;
  const anySold = target.hasSoldData || source.hasSoldData;
  sub.demand = anySold ? Math.min(25, Math.log10(1 + target.topSold + source.topSold) * 6) : 10;
  sub.availability = Math.min(15, source.count / 4);
  const sellersKnownRatio = target.count ? target.sellersKnown / target.count : 0;
  const competitionKnown = target.count > 0 && sellersKnownRatio >= 0.5;
  sub.competition = target.count === 0 ? 10 : !competitionKnown ? 6 : target.sellers < 10 ? 8 : target.sellers < 40 ? 5 : 2;
  for (const k of Object.keys(sub) as (keyof SubScores)[]) sub[k] = Math.round(sub[k] * 10) / 10;
  const score = Math.round(Math.max(0, Math.min(100, sub.margin + sub.demand + sub.availability + sub.competition)));

  const verdicts: MarketAnalysis["verdicts"] = [];
  if (target.count > 0) {
    const sellerTxt = target.sellersUnknownListings > 0 ? `≥${target.sellers} satıcı (${target.sellersUnknownListings} ilanda satıcı okunamadı)` : `${target.sellers} satıcı`;
    verdicts.push({ tone: "neutral", text: `${target.label}: ${target.count} ilan, ${sellerTxt}, medyan ${target.median?.toFixed(0)} ${cur}` });
  } else verdicts.push({ tone: "warning", text: "Hedef pazarda bu arama için ilan bulunamadı: ya boşluk var ya da farklı adla satılıyor" });
  if (source.min !== null) verdicts.push({ tone: "neutral", text: `En ucuz tedarik: ${source.min.toFixed(0)} ${cur} (${source.markets.join(", ")})` });
  if (marginAtMedian) verdicts.push({ tone: marginAtMedian.rate > 0.25 ? "success" : marginAtMedian.rate > 0 ? "warning" : "danger", text: `Medyan fiyattan satışta net marj %${(marginAtMedian.rate * 100).toFixed(0)} (${marginAtMedian.net.toFixed(0)} ${cur}/adet)` });
  if (competitionKnown && target.sellers >= 40) verdicts.push({ tone: "warning", text: "Rekabet yoğun: 40'tan fazla satıcı" });
  if (target.topSold >= 1000 || source.topSold >= 10000) verdicts.push({ tone: "success", text: "Talep var: yüksek satış veya değerlendirme adetleri görülüyor" });
  if (!anySold) verdicts.push({ tone: "neutral", text: "Satış sinyali yok: pazarlar bu ilanlar için sayaç göstermiyor" });
  if (filtered) verdicts.push({ tone: "neutral", text: `${listings.length}/${all.length} ilan hesaba katıldı (benzer olmayanlar hariç)` });

  const chain =
    cheapest && landedPerUnit !== null && minOf(cheapest) !== null
      ? buildChain({
          sourceLabel: `${reg.get(cheapest.market)?.meta.name ?? cheapest.market} birim`,
          sourceUnit: pickTier(cheapest.price.tiers, landedQty ?? 1).unitPrice,
          sourceCurrency: cheapest.price.currency,
          landedPerUnit,
          sell: target.median ? { label: "Hedef pazar medyanı", price: target.median } : null,
          net: marginAtMedian?.net ?? null,
          currency: cur,
          cnyTry: opts.fx,
        })
      : null;

  return { source, target, landedPerUnit, landedFrom: cheapest, landedQty, marginAtMedian, score, sub, verdicts, basedOn: { used: listings.length, total: all.length, filtered }, chain, currency: cur };
}

export interface ScenarioInput {
  qty?: number | null;
  shippingKey?: string;
  weightKg: number;
  /** User's CNY→TRY rate. */
  cnyTry?: number;
  hsCode?: string;
  insuranceRate?: number;
  extraPerUnit?: number;
}
export interface Scenario {
  cost: CostResult;
  qty: number;
  tierIndex: number;
  shippingKey: string;
  shippingLabel: string;
  transitDays: [number, number] | null;
  fx: number;
  /** True when the listing's currency had no rate and 1:1 was NOT assumed (scenario unavailable). */
  ok: boolean;
}

/** Landed-cost scenario for one listing at a quantity, with the tier it falls into highlighted. */
export function scenario(profile: CountryProfile, listing: Pick<RawListing, "price" | "moq">, input: ScenarioInput): Scenario | null {
  if (!listing.price.tiers.length) return null;
  const fx = rateFor(listing.price.currency, profile.currency, input.cnyTry);
  if (fx === null) return null;
  const qty = pickQty(listing.price.tiers, listing.moq, input.qty);
  const shippingKey = shippingKeyFor(profile, input.shippingKey);
  const cost = computeLandedCost(profile, {
    quantity: qty,
    tiers: listing.price.tiers,
    fxRate: fx,
    unitWeightKg: input.weightKg,
    shippingKey,
    ...(input.hsCode ? { hsCode: input.hsCode } : {}),
    ...(input.insuranceRate !== undefined ? { insuranceRate: input.insuranceRate } : {}),
    ...(input.extraPerUnit ? { extraPerUnit: input.extraPerUnit } : {}),
  });
  const sorted = [...listing.price.tiers].sort((a, b) => a.minQty - b.minQty);
  const tierIndex = Math.max(0, sorted.findIndex((t) => t.minQty === cost.tierUsed.minQty && t.unitPrice === cost.tierUsed.unitPrice));
  const ship = profile.shipping.find((s) => s.key === shippingKey) ?? profile.shipping[0]!;
  return { cost, qty, tierIndex, shippingKey, shippingLabel: ship.label, transitDays: ship.transitDays ?? null, fx, ok: true };
}

export interface HistogramBin {
  from: number;
  to: number;
  count: number;
}
export interface Histogram {
  bins: HistogramBin[];
  log: boolean;
  min: number;
  max: number;
  total: number;
}

/** Price histogram; log-spaced bins when the range spans more than ~30×, so IDR and TRY sets stay readable. */
export function histogram(values: number[], binCount = 12): Histogram | null {
  const xs = values.filter((v) => Number.isFinite(v) && v > 0);
  if (!xs.length) return null;
  const min = Math.min(...xs);
  const max = Math.max(...xs);
  if (min === max) return { bins: [{ from: min, to: max, count: xs.length }], log: false, min, max, total: xs.length };
  const log = max / min > 30;
  const n = Math.max(1, Math.min(binCount, xs.length));
  const lo = log ? Math.log(min) : min;
  const hi = log ? Math.log(max) : max;
  const step = (hi - lo) / n;
  const bins: HistogramBin[] = Array.from({ length: n }, (_, i) => {
    const a = lo + i * step;
    const b = lo + (i + 1) * step;
    return { from: log ? Math.exp(a) : a, to: log ? Math.exp(b) : b, count: 0 };
  });
  for (const v of xs) {
    const x = log ? Math.log(v) : v;
    const i = Math.min(n - 1, Math.max(0, Math.floor((x - lo) / step)));
    bins[i]!.count++;
  }
  return { bins, log, min, max, total: xs.length };
}

export interface SellerRow {
  key: string;
  market: MarketId;
  marketName: string;
  name: string;
  id: string | undefined;
  url: string | null;
  listings: number;
  /** Cheapest listing of this seller. */
  cheapest: RawListing;
  minPrice: number | null;
  currency: string;
  reviews: number | null;
  rating: number | null;
  badges: NormalizedBadge[];
}

/** "Satan var mı": distinct sellers across listings with their cheapest offer and store link. */
export function sellersOf(listings: RawListing[], opts: { markets?: ReadonlySet<string>; relevanceOf?: (l: RawListing) => number | undefined; minRelevance?: number } = {}): SellerRow[] {
  const reg = getRegistry();
  const rows = new Map<string, SellerRow>();
  for (const l of listings) {
    if (opts.markets && !opts.markets.has(l.market)) continue;
    if (opts.relevanceOf && (opts.relevanceOf(l) ?? 1) < (opts.minRelevance ?? 0.5)) continue;
    const name = sellerDisplayName(l);
    if (!name) continue;
    const key = `${l.market}:${l.supplierId ?? l.supplierName}`;
    const p = minOf(l);
    const reviews = l.reviewCount ?? (l.soldPeriod === "reviews" ? l.sold : undefined) ?? null;
    const a = reg.get(l.market);
    const cur = rows.get(key);
    if (!cur) {
      rows.set(key, {
        key,
        market: l.market,
        marketName: a?.meta.name ?? l.market,
        name,
        id: l.supplierId,
        url: storeUrl(l.market, l.supplierId),
        listings: 1,
        cheapest: l,
        minPrice: p,
        currency: l.price.currency,
        reviews,
        rating: l.rating ?? null,
        badges: a ? normalizeBadges(a, l.badges) : [],
      });
    } else {
      cur.listings++;
      if (p !== null && (cur.minPrice === null || p < cur.minPrice)) {
        cur.minPrice = p;
        cur.cheapest = l;
      }
      if (reviews !== null) cur.reviews = Math.max(cur.reviews ?? 0, reviews);
      if (l.rating !== undefined) cur.rating = Math.max(cur.rating ?? 0, l.rating);
    }
  }
  return [...rows.values()].sort((a, b) => (a.minPrice ?? Infinity) - (b.minPrice ?? Infinity));
}

/** Factory-vs-trader heuristic for a supplier listing (0..1 factory likelihood) with reasons. */
export function supplierScore(l: RawListing, profile?: RawSupplier | null): { factory: number; reasons: string[] } {
  const reg = getRegistry();
  const a = reg.get(l.market);
  const badges = a ? normalizeBadges(a, l.badges) : [];
  let score = 0.3;
  const reasons: string[] = [];
  if (badges.includes("verified-factory")) { score += 0.4; reasons.push("kaynak fabrika etiketi"); }
  if (badges.includes("deep-factory-audit") || badges.includes("on-site-verified")) { score += 0.15; reasons.push("yerinde denetim"); }
  if (badges.includes("strength-merchant") || badges.includes("verified-supplier")) { score += 0.05; reasons.push("doğrulanmış satıcı"); }
  const name = `${l.supplierName ?? ""} ${profile?.name ?? ""}`;
  if (/实业|工厂|制造|科技有限公司|Manufactur|Factory|Industrial/i.test(name)) { score += 0.15; reasons.push("firma adı üretim gösteriyor"); }
  if (/商贸|贸易|Trading|Trade Co/i.test(name)) { score -= 0.2; reasons.push("firma adı ticaret gösteriyor"); }
  if ((l.moq ?? 1) >= 50) { score += 0.05; reasons.push("yüksek MOQ"); }
  if (l.price.tiers.length >= 3) { score += 0.05; reasons.push("kademeli fiyat"); }
  if (profile) {
    if (profile.businessType === "factory") { score += 0.25; reasons.push("mağaza profili: üretici"); }
    else if (profile.businessType === "trading") { score -= 0.15; reasons.push("mağaza profili: ticaret"); }
    if ((profile.yearsOnPlatform ?? 0) >= 5) { score += 0.05; reasons.push(`${profile.yearsOnPlatform} yıldır pazarda`); }
    if ((profile.repeatPurchaseRate ?? 0) >= 0.3) { score += 0.05; reasons.push(`tekrar alım %${Math.round((profile.repeatPurchaseRate ?? 0) * 100)}`); }
  }
  return { factory: Math.max(0, Math.min(1, score)), reasons };
}

export interface RiskFlag {
  tone: "warning" | "danger" | "success" | "neutral";
  text: string;
}

/** Risk summary for a supplier listing: new store, no verification, price far below peers, slow responses. */
export function supplierRisk(l: RawListing, profile: RawSupplier | null | undefined, peers: RawListing[] = []): RiskFlag[] {
  const reg = getRegistry();
  const a = reg.get(l.market);
  const badges = a ? normalizeBadges(a, l.badges) : [];
  const flags: RiskFlag[] = [];
  if (!badges.length && !(profile?.badges.length)) flags.push({ tone: "warning", text: "Doğrulama etiketi yok" });
  if (profile?.yearsOnPlatform !== undefined && profile.yearsOnPlatform < 2) flags.push({ tone: "warning", text: `Yeni mağaza (${profile.yearsOnPlatform} yıl)` });
  if (profile?.yearsOnPlatform !== undefined && profile.yearsOnPlatform >= 5) flags.push({ tone: "success", text: `${profile.yearsOnPlatform} yıldır pazarda` });
  if (profile?.repeatPurchaseRate !== undefined) flags.push({ tone: profile.repeatPurchaseRate >= 0.3 ? "success" : "neutral", text: `Tekrar alım %${Math.round(profile.repeatPurchaseRate * 100)}` });
  if (profile?.responseRate !== undefined && profile.responseRate < 0.8) flags.push({ tone: "warning", text: `Yanıt oranı %${Math.round(profile.responseRate * 100)}` });
  const mine = minOf(l);
  if (mine !== null && peers.length >= 4) {
    const same = peers.filter((p) => p.price.currency === l.price.currency && !(p.market === l.market && p.id === l.id)).map(minOf).filter((n): n is number => n !== null && n > 0);
    const med = median(same);
    if (med && mine < med * 0.4) flags.push({ tone: "danger", text: `Fiyat emsal medyanının %${Math.round((mine / med) * 100)}'i: tutarsız fiyat` });
  }
  if (!l.supplierName && !profile?.name) flags.push({ tone: "neutral", text: "Satıcı adı karttan okunamadı" });
  return flags;
}

export interface ManufacturerCandidate {
  listing: RawListing;
  factory: number;
  reasons: string[];
  /** Price relative to the group's median (1 = median). */
  pricePosition: number | null;
  /** Combined ranking score, higher first. */
  rank: number;
}

/**
 * "Üreticiye izleme": ranks the suppliers of a product cluster by factory likelihood and price level.
 * The likely manufacturer is verified, prices under the median, and sells in tiers.
 */
export function rankManufacturers(listings: RawListing[], profiles: Partial<Record<string, RawSupplier | null>> = {}): ManufacturerCandidate[] {
  const prices = listings.map(minOf).filter((n): n is number => n !== null && n > 0);
  const med = median(prices);
  return listings
    .map((l) => {
      const s = supplierScore(l, profiles[`${l.market}:${l.supplierId ?? l.supplierName ?? ""}`] ?? null);
      const m = minOf(l);
      const pricePosition = med && m !== null ? m / med : null;
      const priceBonus = pricePosition === null ? 0 : Math.max(-0.2, Math.min(0.2, (1 - pricePosition) * 0.4));
      return { listing: l, factory: s.factory, reasons: s.reasons, pricePosition, rank: s.factory + priceBonus };
    })
    .sort((a, b) => b.rank - a.rank);
}

/** Rough HS chapter suggestion from the taxonomy group of a title (refined per product in the cost settings). */
const HS_BY_GROUP: Record<string, { hs: string; label: string }> = {
  electronics: { hs: "8517", label: "Elektronik cihazlar ve aksesuarları" },
  computer: { hs: "8471", label: "Bilgisayar ve çevre birimleri" },
  home: { hs: "7323", label: "Ev eşyası" },
  kitchen: { hs: "8516", label: "Elektrikli mutfak aletleri" },
  appliances: { hs: "8509", label: "Küçük ev aletleri" },
  "fashion-women": { hs: "6204", label: "Kadın giyim" },
  "fashion-men": { hs: "6203", label: "Erkek giyim" },
  shoes: { hs: "6402", label: "Ayakkabı" },
  bags: { hs: "4202", label: "Çanta ve valiz" },
  accessories: { hs: "9004", label: "Gözlük ve aksesuar" },
  beauty: { hs: "3304", label: "Kozmetik" },
  health: { hs: "9018", label: "Tıbbi cihaz" },
  sports: { hs: "9506", label: "Spor malzemesi" },
  motorcycle: { hs: "6506", label: "Kask ve koruyucu başlık" },
  auto: { hs: "8708", label: "Oto yedek parça" },
  tools: { hs: "8205", label: "El aletleri" },
  garden: { hs: "8201", label: "Bahçe aletleri" },
  toys: { hs: "9503", label: "Oyuncak" },
  baby: { hs: "8715", label: "Bebek ürünleri" },
  pet: { hs: "4201", label: "Evcil hayvan ürünleri" },
  office: { hs: "9608", label: "Kırtasiye" },
  industrial: { hs: "4819", label: "Ambalaj" },
};
export function hsSuggest(groupKey: string | undefined): { hs: string; label: string } | null {
  return groupKey ? (HS_BY_GROUP[groupKey] ?? null) : null;
}
export const HS_OPTIONS = Object.entries(HS_BY_GROUP).map(([group, v]) => ({ group, ...v }));
