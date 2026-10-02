import type { MarketId, RawListing, RawSupplier } from "@manufactogate/core";
import { getCatalog, listingFor, searchCatalog } from "./catalog";

export { getCatalog, getProduct, listingFor, searchCatalog, productsInLeaf, productsInGroup, leafCounts, CATEGORIES, MARKET_PROFILE, TAXONOMY, getLeaves, getLeaf, slug } from "./catalog";
export type { CatalogProduct, Category, CategoryGroup, Leaf } from "./catalog";

/** Listings on a market, optionally filtered by query; popular first. */
export function mockListings(market: MarketId, query?: string): RawListing[] {
  const products = (query ? searchCatalog(query) : getCatalog()).slice().sort((a, b) => b.popularity - a.popularity);
  const out: RawListing[] = [];
  for (const p of products) {
    const l = listingFor(p, market, new Date().toISOString());
    if (l) out.push(l);
  }
  return out;
}

export function mockSupplier(market: MarketId, id: string): RawSupplier {
  const factory = id.endsWith("-f");
  return {
    market,
    id,
    url: `https://${market}.example/shop/${id}`,
    name: factory ? "深圳市示例电子有限公司" : "义乌市示例商贸有限公司",
    location: factory ? "广东 深圳" : "浙江 义乌",
    yearsOnPlatform: factory ? 9 : 3,
    badges: factory ? ["源头工厂", "深度验厂", "实力商家"] : ["实力商家"],
    repeatPurchaseRate: factory ? 0.42 : 0.21,
    responseRate: 0.96,
    responseTime: "1 saat içinde",
    mainCategories: ["消费电子", "家居用品"],
    businessType: factory ? "factory" : "trading",
  };
}
