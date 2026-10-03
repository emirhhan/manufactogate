import type { RawListing } from "@manufactogate/core";
import { getLeaves } from "@manufactogate/adapters";
import { db } from "./db";
import { convert } from "./fx";
import { getRegistry } from "./registry";
import { relevance } from "./relevance";

/**
 * Discover feed built from everything the user has already pulled from real markets.
 * Signals: freshness, sales, rating, source→target price gap (margin potential),
 * market diversity, and a watch/project boost. No server, no tracking.
 */
export interface FeedSections {
  featured: RawListing[];
  marginPicks: { listing: RawListing; targetPrice: number; ratio: number; matchScore: number }[];
  bestSellers: RawListing[];
  fresh: RawListing[];
  categories: { key: string; tr: string; count: number }[];
  stats: { listings: number; markets: number; searches: number };
}

const minPrice = (l: RawListing) => Math.min(...l.price.tiers.map((t) => t.unitPrice));

function tokensOf(title: string): Set<string> {
  return new Set((title.toLowerCase().match(/[a-z0-9]{3,}|[㐀-鿿]{2}/g) ?? []).slice(0, 12));
}

export async function buildFeed(targetCountry = "tr", limit = 12): Promise<FeedSections> {
  const reg = getRegistry();
  const all = await db.listings.toArray();
  const searches = await db.searches.count();
  const watched = new Set((await db.watches.toArray()).map((w) => w.listingKey));
  const inProjects = new Set((await db.projectItems.toArray()).map((p) => p.listingKey));
  const now = Date.now();

  // Dedupe by market:id (latest fetch wins).
  const latest = new Map<string, RawListing>();
  for (const l of all) {
    const k = `${l.market}:${l.id}`;
    const prev = latest.get(k);
    if (!prev || prev.fetchedAt < l.fetchedAt) latest.set(k, l);
  }
  const items = [...latest.values()].filter((l) => l.images[0]);

  const score = (l: RawListing): number => {
    const ageH = (now - new Date(l.fetchedAt).getTime()) / 36e5;
    const fresh = Math.max(0, 1 - ageH / (24 * 14));
    const sold = Math.log10(1 + (l.sold ?? 0)) / 5;
    const rating = (l.rating ?? 4) / 5;
    const boost = (watched.has(`${l.market}:${l.id}`) ? 0.3 : 0) + (inProjects.has(`${l.market}:${l.id}`) ? 0.2 : 0);
    return 0.35 * fresh + 0.3 * sold + 0.15 * rating + boost;
  };

  // Margin picks. Primary source: stored clusters, where members were matched by image fingerprint
  // (pHash) plus title, so a badge only appears on a ≥0.85 ("aynı ürün") match across source and target markets.
  const sources = items.filter((l) => reg.get(l.market)?.meta.role !== "target").slice(-1500);
  const targets = items.filter((l) => reg.get(l.market)?.meta.country === targetCountry);
  const marginPicks: FeedSections["marginPicks"] = [];
  const picked = new Set<string>();
  const isTarget = (m: string) => reg.get(m as RawListing["market"])?.meta.country === targetCountry;
  const consider = (s: RawListing, t: RawListing, matchScore: number) => {
    const sp = convert(minPrice(s), s.price.currency, t.price.currency);
    if (!sp || sp <= 0) return;
    const ratio = minPrice(t) / sp;
    // ≥2× is interesting; >25× is almost always a mismatch (helmet vs. motorcycle), not a margin.
    if (ratio < 2 || ratio > 25) return;
    const key = `${s.market}:${s.id}`;
    const prev = marginPicks.find((m) => `${m.listing.market}:${m.listing.id}` === key);
    if (prev) {
      if (ratio > prev.ratio) Object.assign(prev, { targetPrice: minPrice(t), ratio, matchScore });
      return;
    }
    picked.add(key);
    marginPicks.push({ listing: s, targetPrice: minPrice(t), ratio, matchScore });
  };
  for (const rec of await db.clusters.toArray()) {
    const ms = rec.cluster.members.filter((m) => m.match.score >= 0.85);
    const ts = ms.filter((m) => isTarget(m.listing.market));
    const ss = ms.filter((m) => !isTarget(m.listing.market) && reg.get(m.listing.market)?.meta.role !== "target");
    for (const a of ss) for (const b of ts) consider(latest.get(`${a.listing.market}:${a.listing.id}`) ?? a.listing, b.listing, Math.min(a.match.score, b.match.score));
  }
  // Fallback: strong title agreement (model numbers / ≥3 shared tokens and relevance ≥0.75).
  const tTokens = targets.map((t) => tokensOf(t.title));
  const index = new Map<string, number[]>();
  tTokens.forEach((set, i) => { for (const tok of set) (index.get(tok) ?? index.set(tok, []).get(tok)!).push(i); });
  for (const s of sources) {
    if (picked.has(`${s.market}:${s.id}`)) continue;
    const hits = new Map<number, number>();
    for (const tok of tokensOf(s.title)) for (const i of index.get(tok) ?? []) hits.set(i, (hits.get(i) ?? 0) + 1);
    for (const [i, overlap] of hits) {
      if (overlap < 3) continue;
      const t = targets[i]!;
      const r = relevance(s.title, t);
      if (r < 0.75) continue;
      consider(s, t, r);
    }
  }
  marginPicks.sort((a, b) => b.ratio - a.ratio);

  const sorted = [...items].sort((a, b) => score(b) - score(a));
  // Featured: top scores with market diversity (no more than 3 per market in the first dozen).
  const featured: RawListing[] = [];
  const perMarket = new Map<string, number>();
  for (const l of sorted) {
    const n = perMarket.get(l.market) ?? 0;
    if (n >= 3) continue;
    perMarket.set(l.market, n + 1);
    featured.push(l);
    if (featured.length >= limit) break;
  }
  const bestSellers = [...items].filter((l) => (l.sold ?? 0) > 0).sort((a, b) => (b.sold ?? 0) - (a.sold ?? 0)).slice(0, limit);
  const fresh = [...items].sort((a, b) => (a.fetchedAt < b.fetchedAt ? 1 : -1)).slice(0, limit);

  // Categories seen in the user's data.
  const counts = new Map<string, number>();
  const leaves = getLeaves();
  const leafTr = leaves.map((x) => x.tr.toLowerCase());
  for (const l of items.slice(-2000)) {
    const t = l.title;
    const tl = t.toLowerCase();
    const leaf = leaves.find((x, i) => t.includes(x.zh) || tl.includes(leafTr[i]!));
    if (leaf) counts.set(leaf.key, (counts.get(leaf.key) ?? 0) + 1);
  }
  const categories = [...counts.entries()]
    .map(([key, count]) => ({ key, tr: leaves.find((x) => x.key === key)!.tr, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 12);

  return { featured, marginPicks: marginPicks.slice(0, limit), bestSellers, fresh, categories, stats: { listings: items.length, markets: new Set(items.map((l) => l.market)).size, searches } };
}
