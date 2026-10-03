import { computeLandedCost, computeMargin, normalizeBadges, type RawListing } from "@manufactogate/core";
import { getCountryProfile } from "@manufactogate/country-profiles";
import { convert } from "./fx";
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
export const minPrice = (l: RawListing) => Math.min(...l.price.tiers.map((t) => t.unitPrice));

export interface RegionStats {
  key: "source" | "target";
  label: string;
  markets: string[];
  count: number;
  min: number | null;
  median: number | null;
  p25: number | null;
  sellers: number;
  topSold: number;
  currency: string;
}

export interface MarketAnalysis {
  source: RegionStats;
  target: RegionStats;
  /** Landed cost per unit (target currency) from the cheapest source listing. */
  landedPerUnit: number | null;
  landedFrom: RawListing | null;
  /** Net margin at the target median price. */
  marginAtMedian: { net: number; rate: number } | null;
  /** 0..100: how attractive this product looks for import + resale. */
  score: number;
  verdicts: { tone: "success" | "warning" | "danger" | "neutral"; text: string }[];
}

/** Summarises a result set: where it is cheapest, who sells it in the target country, and whether the margin works. */
export function analyzeResults(
  listings: RawListing[],
  opts: { targetCountry: string; fx: number; weightKg: number; shippingKey: string; overheadRate: number },
): MarketAnalysis {
  const reg = getRegistry();
  const profile = getCountryProfile(opts.targetCountry) ?? getCountryProfile("tr")!;
  const cur = profile.currency;
  const byRole = (role: "source" | "target") => listings.filter((l) => (reg.get(l.market)?.meta.role ?? "source") === role || (role === "target" && reg.get(l.market)?.meta.country === opts.targetCountry));
  const src = byRole("source").filter((l) => reg.get(l.market)?.meta.country !== opts.targetCountry);
  const tgt = listings.filter((l) => reg.get(l.market)?.meta.country === opts.targetCountry);

  const stats = (key: "source" | "target", ls: RawListing[], label: string): RegionStats => {
    const prices = ls.map((l) => convert(minPrice(l), l.price.currency, cur)).filter((n): n is number => n !== null && n > 0);
    return {
      key,
      label,
      markets: [...new Set(ls.map((l) => reg.get(l.market)?.meta.name ?? l.market))],
      count: ls.length,
      min: prices.length ? Math.min(...prices) : null,
      median: median(prices),
      p25: quantile(prices, 0.25),
      sellers: new Set(ls.map((l) => l.supplierId ?? l.supplierName ?? l.id)).size,
      topSold: Math.max(0, ...ls.map((l) => l.sold ?? 0)),
      currency: cur,
    };
  };
  const source = stats("source", src, "Tedarik pazarları");
  const target = stats("target", tgt, "Hedef pazar");

  // Landed cost from the cheapest source listing with a usable currency.
  const cheapest = [...src].filter((l) => convert(1, l.price.currency, cur) !== null).sort((a, b) => (convert(minPrice(a), a.price.currency, cur) ?? Infinity) - (convert(minPrice(b), b.price.currency, cur) ?? Infinity))[0] ?? null;
  let landedPerUnit: number | null = null;
  if (cheapest) {
    const fx = convert(1, cheapest.price.currency, cur) ?? opts.fx;
    const qty = cheapest.price.tiers[1]?.minQty ?? Math.max(cheapest.moq ?? 1, 100);
    const shippingKey = profile.shipping.some((s) => s.key === opts.shippingKey) ? opts.shippingKey : profile.shipping[0]!.key;
    landedPerUnit = computeLandedCost(profile, { quantity: qty, tiers: cheapest.price.tiers, fxRate: fx, unitWeightKg: opts.weightKg, shippingKey }).perUnit;
  }
  const marketplaceId = Object.keys(profile.commissions)[0] ?? "";
  const marginAtMedian = landedPerUnit !== null && target.median ? (() => {
    const m = computeMargin(profile, landedPerUnit, { sellPrice: target.median, marketplaceId, overheadRate: opts.overheadRate });
    return { net: m.netPerUnit, rate: m.marginRate };
  })() : null;

  // Score: margin (50), demand (25), availability (15), competition (10, inverse).
  let score = 0;
  if (marginAtMedian) score += Math.max(0, Math.min(50, (marginAtMedian.rate / 0.4) * 50));
  else if (landedPerUnit !== null) score += 15;
  score += Math.min(25, Math.log10(1 + target.topSold + source.topSold) * 6);
  score += Math.min(15, source.count / 4);
  score += target.sellers === 0 ? 10 : target.sellers < 10 ? 8 : target.sellers < 40 ? 5 : 2;
  score = Math.round(Math.max(0, Math.min(100, score)));

  const verdicts: MarketAnalysis["verdicts"] = [];
  if (target.count > 0) verdicts.push({ tone: "neutral", text: `${target.label}: ${target.count} ilan, ${target.sellers} satıcı, medyan ${target.median?.toFixed(0)} ${cur}` });
  else verdicts.push({ tone: "warning", text: "Hedef pazarda bu arama için ilan bulunamadı: ya boşluk var ya da farklı adla satılıyor" });
  if (source.min !== null) verdicts.push({ tone: "neutral", text: `En ucuz tedarik: ${source.min.toFixed(0)} ${cur} (${source.markets.join(", ")})` });
  if (marginAtMedian) verdicts.push({ tone: marginAtMedian.rate > 0.25 ? "success" : marginAtMedian.rate > 0 ? "warning" : "danger", text: `Medyan fiyattan satışta net marj ${(marginAtMedian.rate * 100).toFixed(0)}% (${marginAtMedian.net.toFixed(0)} ${cur}/adet)` });
  if (target.sellers >= 40) verdicts.push({ tone: "warning", text: "Rekabet yoğun: 40'tan fazla satıcı" });
  if (target.topSold >= 1000 || source.topSold >= 10000) verdicts.push({ tone: "success", text: "Talep var: yüksek satış adetleri görülüyor" });

  return { source, target, landedPerUnit, landedFrom: cheapest, marginAtMedian, score, verdicts };
}

/** Factory-vs-trader heuristic for a supplier listing (0..1 factory likelihood) with reasons. */
export function supplierScore(l: RawListing): { factory: number; reasons: string[] } {
  const reg = getRegistry();
  const a = reg.get(l.market);
  const badges = a ? normalizeBadges(a, l.badges) : [];
  let score = 0.3;
  const reasons: string[] = [];
  if (badges.includes("verified-factory")) { score += 0.4; reasons.push("kaynak fabrika etiketi"); }
  if (badges.includes("deep-factory-audit") || badges.includes("on-site-verified")) { score += 0.15; reasons.push("yerinde denetim"); }
  if (badges.includes("strength-merchant") || badges.includes("verified-supplier")) { score += 0.05; reasons.push("doğrulanmış satıcı"); }
  if (/实业|工厂|制造|科技有限公司|Manufactur|Factory|Industrial/i.test(l.supplierName ?? "")) { score += 0.15; reasons.push("firma adı üretim gösteriyor"); }
  if (/商贸|贸易|Trading|Trade Co/i.test(l.supplierName ?? "")) { score -= 0.2; reasons.push("firma adı ticaret gösteriyor"); }
  if ((l.moq ?? 1) >= 50) { score += 0.05; reasons.push("yüksek MOQ"); }
  if (l.price.tiers.length >= 3) { score += 0.05; reasons.push("kademeli fiyat"); }
  return { factory: Math.max(0, Math.min(1, score)), reasons };
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
