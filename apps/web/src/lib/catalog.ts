import {
  getCatalog,
  getLeaves,
  listingFor,
  searchCatalog,
  TAXONOMY,
  type CatalogProduct,
  type Leaf,
} from "@manufactogate/adapters";
import type { MarketId, RawListing } from "@manufactogate/core";

export const PAGE_SIZE = 30;
export const SOURCE_MARKETS: MarketId[] = ["cn-1688", "cn-taobao", "cn-pinduoduo"];
export const TARGET_MARKET: MarketId = "tr-trendyol";

export type SortKey = "popular" | "price-asc" | "price-desc" | "margin";

export interface FeedItem {
  product: CatalogProduct;
  leaf: Leaf | undefined;
  /** Cheapest source listing (1688 price ladder minimum). */
  source: RawListing;
  /** Target-market retail listing. */
  target: RawListing | null;
  sourceMinCny: number;
  /** Rough retail-to-source ratio, display only. */
  priceRatio: number | null;
  sold: number;
}

const leafMap = new Map(getLeaves().map((l) => [l.key, l]));

export function toFeedItem(p: CatalogProduct): FeedItem {
  const source = listingFor(p, "cn-1688")!;
  const target = listingFor(p, TARGET_MARKET);
  const sourceMinCny = Math.min(...source.price.tiers.map((t) => t.unitPrice));
  // Mock FX for display: 1 CNY ≈ 4.7 TRY; the cost engine uses a user-set rate.
  const priceRatio = target ? target.price.tiers[0]!.unitPrice / (sourceMinCny * 4.7) : null;
  return { product: p, leaf: leafMap.get(p.category), source, target, sourceMinCny, priceRatio, sold: source.sold ?? 0 };
}

export interface FeedQuery {
  q?: string;
  group?: string;
  leaf?: string;
  sort?: SortKey;
  page?: number;
}

export interface FeedPage {
  items: FeedItem[];
  total: number;
  page: number;
  pages: number;
}

export function queryFeed(fq: FeedQuery): FeedPage {
  const opts: { leaf?: string; group?: string } = {};
  if (fq.leaf) opts.leaf = fq.leaf;
  else if (fq.group) opts.group = fq.group;
  const products = fq.q || fq.leaf || fq.group ? searchCatalog(fq.q ?? "", opts) : getCatalog();
  const items = products.map(toFeedItem);
  const sort = fq.sort ?? "popular";
  items.sort((a, b) =>
    sort === "price-asc"
      ? a.sourceMinCny - b.sourceMinCny
      : sort === "price-desc"
        ? b.sourceMinCny - a.sourceMinCny
        : sort === "margin"
          ? (b.priceRatio ?? 0) - (a.priceRatio ?? 0)
          : b.product.popularity - a.product.popularity,
  );
  const total = items.length;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(Math.max(1, fq.page ?? 1), pages);
  return { items: items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), total, page, pages };
}

/** Page numbers to render: first, last, and a window around the current page, with gaps as null. */
export function pageWindow(page: number, pages: number, radius = 2): (number | null)[] {
  const set = new Set<number>([1, pages]);
  for (let p = page - radius; p <= page + radius; p++) if (p >= 1 && p <= pages) set.add(p);
  const sorted = [...set].sort((a, b) => a - b);
  const out: (number | null)[] = [];
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i]! - sorted[i - 1]! > 1) out.push(null);
    out.push(sorted[i]!);
  }
  return out;
}

export function groupOf(key: string) {
  return TAXONOMY.find((g) => g.key === key);
}
export function leavesOf(groupKey: string): Leaf[] {
  return getLeaves().filter((l) => l.group === groupKey);
}
export function leafOf(key: string): Leaf | undefined {
  return leafMap.get(key);
}

/** Inline SVG placeholder used when the remote image cannot load. */
export function placeholder(label: string): string {
  const safe = label.replace(/[<>&"]/g, "");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="480"><rect width="100%" height="100%" fill="#e9e7e2"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="Inter,system-ui" font-size="22" fill="#8a8a88">${safe}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
