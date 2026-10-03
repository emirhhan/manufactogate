import type { RawListing } from "@manufactogate/core";
import { getLeaves, type Leaf } from "@manufactogate/adapters";
import { db } from "./db";
import { toTry } from "./fx";
import { matchesTr } from "@manufactogate/core";
import type { SortKey } from "./catalog";

/** Real-data catalog: every listing pulled so far, classified into the taxonomy once and cached. */
interface Classified {
  listing: RawListing;
  leaf: Leaf | null;
}
let cache: { at: number; count: number; items: Classified[] } | null = null;

function classify(l: RawListing, leaves: Leaf[], leafTr: string[]): Leaf | null {
  const t = l.title;
  const tl = t.toLowerCase();
  // Prefer the longest matching leaf label so "motosiklet kaskı" beats "kask".
  let best: Leaf | null = null;
  let bestLen = 0;
  for (let i = 0; i < leaves.length; i++) {
    const x = leaves[i]!;
    const hit = (x.zh && t.includes(x.zh)) || tl.includes(leafTr[i]!) || matchesTr(tl, x.tr);
    if (hit && x.tr.length > bestLen) {
      best = x;
      bestLen = x.tr.length;
    }
  }
  return best;
}

export async function loadRealCatalog(): Promise<Classified[]> {
  const count = await db.listings.count();
  if (cache && cache.count === count && Date.now() - cache.at < 60_000) return cache.items;
  const all = await db.listings.toArray();
  const latest = new Map<string, RawListing>();
  for (const l of all) {
    const prev = latest.get(l.key);
    if (!prev || prev.fetchedAt < l.fetchedAt) latest.set(l.key, l);
  }
  const leaves = getLeaves();
  const leafTr = leaves.map((x) => x.tr.toLowerCase());
  const items = [...latest.values()].map((listing) => ({ listing, leaf: classify(listing, leaves, leafTr) }));
  cache = { at: Date.now(), count, items };
  return items;
}

export interface RealFeedPage {
  items: RawListing[];
  total: number;
  page: number;
  pages: number;
  /** How many listings fall into each group / leaf, for the sidebar. */
  groupCounts: Record<string, number>;
  leafCounts: Record<string, number>;
}

const minTry = (l: RawListing) => toTry(Math.min(...l.price.tiers.map((t) => t.unitPrice)), l.price.currency) ?? Infinity;

export function queryRealCatalog(items: Classified[], fq: { q?: string; group?: string; leaf?: string; sort?: SortKey; page?: number; perPage?: number }): RealFeedPage {
  const groupCounts: Record<string, number> = {};
  const leafCounts: Record<string, number> = {};
  for (const it of items) {
    if (!it.leaf) continue;
    groupCounts[it.leaf.group] = (groupCounts[it.leaf.group] ?? 0) + 1;
    leafCounts[it.leaf.key] = (leafCounts[it.leaf.key] ?? 0) + 1;
  }
  let v = items;
  if (fq.leaf) v = v.filter((it) => it.leaf?.key === fq.leaf);
  else if (fq.group) v = v.filter((it) => it.leaf?.group === fq.group);
  if (fq.q) {
    const q = fq.q.toLowerCase();
    v = v.filter((it) => it.listing.title.toLowerCase().includes(q) || matchesTr(it.listing.title, q) || (it.leaf && it.leaf.tr.toLowerCase().includes(q)));
  }
  let ls = v.map((it) => it.listing);
  const sort = fq.sort ?? "popular";
  if (sort === "price-asc") ls = [...ls].sort((a, b) => minTry(a) - minTry(b));
  else if (sort === "price-desc") ls = [...ls].sort((a, b) => minTry(b) - minTry(a));
  else if (sort === "margin") ls = [...ls].sort((a, b) => minTry(a) - minTry(b));
  else ls = [...ls].sort((a, b) => (b.sold ?? 0) * (b.rating ?? 4) - (a.sold ?? 0) * (a.rating ?? 4) || (a.fetchedAt < b.fetchedAt ? 1 : -1));
  const perPage = fq.perPage ?? 30;
  const pages = Math.max(1, Math.ceil(ls.length / perPage));
  const page = Math.min(Math.max(1, fq.page ?? 1), pages);
  return { items: ls.slice((page - 1) * perPage, page * perPage), total: ls.length, page, pages, groupCounts, leafCounts };
}
