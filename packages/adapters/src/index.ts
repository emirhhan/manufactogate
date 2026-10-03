import type { MarketAdapter } from "@manufactogate/core";
import { BADGES_1688, BADGES_PINDUODUO, BADGES_TAOBAO, BADGES_TRENDYOL } from "./badges";
import { META_1688, META_PINDUODUO, META_TAOBAO, META_TRENDYOL } from "./markets";
import { createMockAdapter, type MockOptions } from "./mock/mockAdapter";
import { AdapterRegistry } from "./registry";
import { WAVE2_DEFS } from "./wave2";

export * from "./registry";
export * from "./dom";
export * from "./runtime";
export * from "./real";
export * from "./translate";
export * from "./wave2";
export { def1688, extractor1688, LINK_1688 } from "./cn-1688";
export { defTaobao, extractorTaobao, LINK_TAOBAO } from "./cn-taobao";
export { defPinduoduo, extractorPinduoduo, LINK_PDD } from "./cn-pinduoduo";
export { defTrendyol, extractorTrendyol, LINK_TRENDYOL } from "./tr-trendyol";
export * from "./badges";
export * from "./markets";
export * from "./mock/mockAdapter";
export { getCatalog, getProduct, listingFor, searchCatalog, productsInLeaf, productsInGroup, leafCounts, CATEGORIES, MARKET_PROFILE, TAXONOMY, getLeaves, getLeaf, slug } from "./mock/data";
export type { CatalogProduct, Category, CategoryGroup, Leaf } from "./mock/data";

/** Sprint 0: all four wave-1 markets backed by the mock adapter. */
export function createMockRegistry(opts: Partial<Record<string, MockOptions>> = {}): AdapterRegistry {
  const r = new AdapterRegistry();
  const mk = (id: MarketAdapter["id"], meta: typeof META_1688, badges: typeof BADGES_1688) =>
    r.register(createMockAdapter(id, meta, badges, opts[id] ?? {}));
  mk("cn-1688", META_1688, BADGES_1688);
  mk("cn-taobao", META_TAOBAO, BADGES_TAOBAO);
  mk("cn-pinduoduo", META_PINDUODUO, BADGES_PINDUODUO);
  mk("tr-trendyol", META_TRENDYOL, BADGES_TRENDYOL);
  for (const d of WAVE2_DEFS) r.register(createMockAdapter(d.id, d.meta, d.badgeMap, opts[d.id] ?? { latencyMs: 200 }));
  return r;
}
