import type { Cluster, ScoredListing } from "../match";
import { unitPriceNormalized, type NormalizedBadge, type RawListing, type RawSupplier } from "../model";

export interface TraceContext {
  clusterMinPrice?: number;
  clusterMedianPrice?: number;
}

export interface TraceResult {
  /** 0..1 likelihood that the seller is the manufacturer rather than a trader. */
  factory: number;
  reasons: string[];
}

const FACTORY_NAME = /实业|工厂|制造|生产|科技有限公司|电子厂|服饰厂|Manufactur|Factory|Industrial|Industries|Fabrika|Üretim|Imalat|İmalat/i;
const TRADER_NAME = /商贸|贸易|经销|代理|Trading|Trade Co|Import|Export|Dış Ticaret|Dis Ticaret|Pazarlama/i;
const HUBS = /广东|浙江|江苏|福建|东莞|深圳|义乌|佛山|温州|宁波|苏州|中山|Guangdong|Zhejiang|Jiangsu|Fujian|Dongguan|Shenzhen|Yiwu|Foshan|Wenzhou|Ningbo|Suzhou|Zhongshan/i;

/** Factory-vs-trader likelihood for one listing, from badges, names, pricing and supplier data. */
export function traceScore(listing: RawListing, badges: NormalizedBadge[] = [], supplier?: RawSupplier, ctx: TraceContext = {}): TraceResult {
  let score = 0.3;
  const reasons: string[] = [];
  const name = `${listing.supplierName ?? ""} ${supplier?.name ?? ""}`.trim();
  const allBadges = new Set<NormalizedBadge>([...badges, ...((supplier?.badges ?? []) as NormalizedBadge[])]);

  if (allBadges.has("verified-factory")) { score += 0.4; reasons.push("kaynak fabrika etiketi"); }
  if (allBadges.has("deep-factory-audit") || allBadges.has("on-site-verified")) { score += 0.15; reasons.push("yerinde denetim"); }
  if (allBadges.has("strength-merchant") || allBadges.has("verified-supplier") || allBadges.has("gold-supplier")) { score += 0.05; reasons.push("doğrulanmış satıcı"); }
  if (supplier?.businessType === "factory") { score += 0.25; reasons.push("işletme türü: üretici"); }
  else if (supplier?.businessType === "trading") { score -= 0.25; reasons.push("işletme türü: ticaret"); }
  if (FACTORY_NAME.test(name)) { score += 0.15; reasons.push("firma adı üretim gösteriyor"); }
  if (TRADER_NAME.test(name)) { score -= 0.2; reasons.push("firma adı ticaret gösteriyor"); }
  if ((listing.moq ?? 1) >= 50) { score += 0.05; reasons.push("yüksek MOQ"); }
  if (listing.price.tiers.length >= 3) { score += 0.05; reasons.push("kademeli fiyat"); }
  const price = unitPriceNormalized(listing);
  if (price !== null && ctx.clusterMinPrice !== undefined && ctx.clusterMinPrice > 0 && price <= ctx.clusterMinPrice * 1.1) { score += 0.1; reasons.push("kümedeki en düşük fiyat bandında"); }
  else if (price !== null && ctx.clusterMedianPrice !== undefined && ctx.clusterMedianPrice > 0 && price > ctx.clusterMedianPrice * 1.5) { score -= 0.1; reasons.push("küme medyanının çok üstünde"); }
  const location = `${listing.location ?? ""} ${supplier?.location ?? ""}`;
  if (HUBS.test(location)) { score += 0.05; reasons.push("üretim bölgesinde"); }
  if ((supplier?.yearsOnPlatform ?? 0) >= 5) { score += 0.05; reasons.push("5+ yıl platformda"); }
  if ((supplier?.repeatPurchaseRate ?? 0) >= 0.3) { score += 0.05; reasons.push("yüksek tekrar alım oranı"); }
  if ((supplier?.responseRate ?? 0) >= 0.9) { score += 0.02; }
  return { factory: Math.max(0, Math.min(1, Math.round(score * 1000) / 1000)), reasons };
}

export interface RankedSupplier {
  member: ScoredListing;
  trace: TraceResult;
  unitPrice: number | null;
  likelyManufacturer: boolean;
}

/**
 * Members of a cluster ordered by factory likelihood then unit price. The top member is flagged
 * `likelyManufacturer` when its score is at least 0.7 and its price within 15% of the cluster minimum.
 */
export function rankManufacturers(
  cluster: Pick<Cluster, "members">,
  resolve: { badges?: (l: RawListing) => NormalizedBadge[]; supplier?: (l: RawListing) => RawSupplier | undefined } = {},
): RankedSupplier[] {
  const byCurrency = new Map<string, number[]>();
  for (const m of cluster.members) {
    const p = unitPriceNormalized(m.listing);
    if (p !== null) (byCurrency.get(m.listing.price.currency) ?? byCurrency.set(m.listing.price.currency, []).get(m.listing.price.currency)!).push(p);
  }
  const stats = new Map<string, { min: number; median: number }>();
  for (const [cur, ps] of byCurrency) {
    const s = [...ps].sort((a, b) => a - b);
    stats.set(cur, { min: s[0]!, median: s[Math.floor(s.length / 2)]! });
  }
  const ranked: RankedSupplier[] = cluster.members.map((member) => {
    const st = stats.get(member.listing.price.currency);
    const ctx: TraceContext = st ? { clusterMinPrice: st.min, clusterMedianPrice: st.median } : {};
    const trace = traceScore(member.listing, resolve.badges?.(member.listing) ?? [], resolve.supplier?.(member.listing), ctx);
    return { member, trace, unitPrice: unitPriceNormalized(member.listing), likelyManufacturer: false };
  });
  ranked.sort((a, b) => b.trace.factory - a.trace.factory || (a.unitPrice ?? Infinity) - (b.unitPrice ?? Infinity));
  const top = ranked[0];
  if (top) {
    const st = stats.get(top.member.listing.price.currency);
    const priceOk = top.unitPrice === null || !st || top.unitPrice <= st.min * 1.15;
    if (top.trace.factory >= 0.7 && priceOk) top.likelyManufacturer = true;
  }
  return ranked;
}
