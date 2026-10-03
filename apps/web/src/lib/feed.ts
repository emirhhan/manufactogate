import type { HealthResult, RawListing } from "@manufactogate/core";
import { foldTr } from "@manufactogate/core";
import { getLeaves } from "@manufactogate/adapters";
import { db, listingsWriteVersion, type MatchRecord, type SearchRecord } from "./db";
import { minOf } from "./fx";
import { marginRatio, pairsFromMatches } from "./margin";
import { classifyTitle } from "./realCatalog";
import { getRegistry } from "./registry";
import { relevance } from "./relevance";

/**
 * Discover feed built from everything the user has already pulled from real markets.
 * Signals: freshness, sales, rating, source→target price gap (margin potential),
 * market diversity, and a watch/project boost. No server, no tracking.
 */
export interface MarginPick {
  listing: RawListing;
  /** The target-market listing the price comes from. */
  target: RawListing;
  targetPrice: number;
  targetCurrency: string;
  ratio: number;
  matchScore: number;
}

export interface FeaturedItem {
  listing: RawListing;
  /** Why it is here: "taze · 1,2 bin satış · izleniyor". */
  reason: string;
}

export interface MarketRail {
  market: string;
  name: string;
  count: number;
  items: RawListing[];
}

export interface FeedSections {
  featured: FeaturedItem[];
  marginPicks: MarginPick[];
  bestSellers: RawListing[];
  /** Newest listings (this week when there are any). */
  fresh: RawListing[];
  /** Low-MOQ source listings with a factory or verified-supplier badge. */
  supplyDeals: RawListing[];
  /** Best sellers on the target-country markets. */
  targetBestSellers: RawListing[];
  rails: MarketRail[];
  categories: { key: string; tr: string; count: number }[];
  stats: { listings: number; markets: number; searches: number; thisWeek: number };
}

export const EMPTY_FEED: FeedSections = { featured: [], marginPicks: [], bestSellers: [], fresh: [], supplyDeals: [], targetBestSellers: [], rails: [], categories: [], stats: { listings: 0, markets: 0, searches: 0, thisWeek: 0 } };

/** Words that never identify a product in a title overlap. */
const STOP = new Set(["ve", "ile", "icin", "set", "seti", "takim", "takimi", "adet", "adetli", "yeni", "new", "for", "with", "the", "and", "pcs", "pack", "orijinal", "original", "hot", "sale", "free", "shipping", "wholesale", "ucretsiz", "kargo"]);

/**
 * Title tokens for the margin fallback: folded Latin words of ≥3 letters (so "gözlük" and
 * "kulaklık" survive) and overlapping CJK bigrams ("蓝牙耳机" → 蓝牙, 牙耳, 耳机). Pure.
 */
export function tokensOf(title: string): Set<string> {
  const out = new Set<string>();
  const folded = foldTr(title);
  for (const m of folded.match(/[a-z0-9]{3,}/g) ?? []) {
    if (STOP.has(m) || /^\d+$/.test(m)) continue;
    out.add(m);
    if (out.size >= 14) break;
  }
  for (const run of title.match(/[㐀-鿿]{2,}/g) ?? []) {
    for (let i = 0; i + 2 <= run.length && out.size < 24; i++) out.add(run.slice(i, i + 2));
  }
  return out;
}

const FACTORY_BADGE = /verified|factory|fabrika|实力|深度验厂|认证|工厂|gold|trade assurance|源头|厂家/i;

export interface FeedInput {
  listings: RawListing[];
  matches: MatchRecord[];
  watched: ReadonlySet<string>;
  inProjects: ReadonlySet<string>;
  searches: number;
  targetCountry: string;
  limit?: number;
  now?: number;
  /** Market facts; defaults to the registry. */
  meta?: (market: string) => { country: string; role: "source" | "target" | "both"; name: string } | undefined;
  /** Category classifier; defaults to the real catalog's. */
  classify?: (title: string) => { key: string; tr: string } | null;
}

/** Builds every section from in-memory data; the DB loader below feeds it. Pure. */
export function buildFeedFrom(input: FeedInput): FeedSections {
  const limit = input.limit ?? 12;
  const now = input.now ?? Date.now();
  const reg = getRegistry();
  const meta = input.meta ?? ((m: string) => {
    const a = reg.get(m as RawListing["market"]);
    return a ? { country: a.meta.country, role: a.meta.role, name: a.meta.name } : undefined;
  });
  const classify = input.classify ?? classifyTitle;
  const keyOf = (l: RawListing) => `${l.market}:${l.id}`;

  // Newest copy of each listing, newest first.
  const latest = new Map<string, RawListing>();
  for (const l of input.listings) {
    const k = keyOf(l);
    const prev = latest.get(k);
    if (!prev || prev.fetchedAt < l.fetchedAt) latest.set(k, l);
  }
  const items = [...latest.values()].filter((l) => l.images[0]).sort((a, b) => (a.fetchedAt < b.fetchedAt ? 1 : a.fetchedAt > b.fetchedAt ? -1 : 0));
  const isTarget = (m: string) => meta(m)?.country === input.targetCountry && meta(m)?.role !== "source";
  const isSource = (m: string) => meta(m)?.role !== "target";

  const ageH = (l: RawListing) => (now - new Date(l.fetchedAt).getTime()) / 36e5;
  const score = (l: RawListing): number => {
    const fresh = Math.max(0, 1 - ageH(l) / (24 * 14));
    const sold = Math.log10(1 + (l.sold ?? 0)) / 5;
    const rating = (l.rating ?? 4) / 5;
    const k = keyOf(l);
    const boost = (input.watched.has(k) ? 0.3 : 0) + (input.inProjects.has(k) ? 0.2 : 0);
    return 0.35 * fresh + 0.3 * sold + 0.15 * rating + boost;
  };
  const reasonOf = (l: RawListing): string => {
    const parts: string[] = [];
    if (ageH(l) < 48) parts.push("taze");
    if ((l.sold ?? 0) > 0) parts.push(`${compactTr(l.sold!)} ${l.soldPeriod === "reviews" ? "değerlendirme" : "satış"}`);
    if ((l.rating ?? 0) >= 4.7) parts.push(`${l.rating!.toFixed(1)} puan`);
    const k = keyOf(l);
    if (input.watched.has(k)) parts.push("izleniyor");
    if (input.inProjects.has(k)) parts.push("projede");
    if (!parts.length) parts.push(meta(l.market)?.name ?? l.market);
    return parts.join(" · ");
  };

  // Margin picks. Primary source: stored matches (pHash + title ≥ 0.85 across source and target).
  const sources = items.filter((l) => isSource(l.market) && !isTarget(l.market)).slice(0, 1500);
  const targets = items.filter((l) => isTarget(l.market));
  const picks = new Map<string, MarginPick>();
  const consider = (s: RawListing, t: RawListing, matchScore: number) => {
    const ratio = marginRatio(s, t);
    if (ratio === null) return;
    const k = keyOf(s);
    const prev = picks.get(k);
    if (prev && prev.ratio >= ratio) return;
    picks.set(k, { listing: s, target: t, targetPrice: minOf(t)!, targetCurrency: t.price.currency, ratio, matchScore });
  };
  for (const p of pairsFromMatches(input.matches, latest, isTarget, isSource).values()) {
    const s = latest.get(p.sourceKey);
    const t = latest.get(p.targetKey);
    if (s && t) consider(s, t, p.matchScore);
  }
  // Fallback: strong title agreement (≥3 shared tokens and relevance ≥ 0.75).
  if (targets.length) {
    const index = new Map<string, number[]>();
    targets.forEach((t, i) => {
      for (const tok of tokensOf(t.title)) (index.get(tok) ?? index.set(tok, []).get(tok)!).push(i);
    });
    for (const s of sources) {
      if (picks.has(keyOf(s))) continue;
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
  }
  const marginPicks = [...picks.values()].sort((a, b) => b.ratio - a.ratio).slice(0, limit);

  const sorted = [...items].sort((a, b) => score(b) - score(a));
  // Featured: top scores with market diversity (no more than 3 per market).
  const featured: FeaturedItem[] = [];
  const perMarket = new Map<string, number>();
  for (const l of sorted) {
    const n = perMarket.get(l.market) ?? 0;
    if (n >= 3) continue;
    perMarket.set(l.market, n + 1);
    featured.push({ listing: l, reason: reasonOf(l) });
    if (featured.length >= limit) break;
  }
  const bySold = (xs: RawListing[]) => xs.filter((l) => (l.sold ?? 0) > 0).sort((a, b) => (b.sold ?? 0) - (a.sold ?? 0));
  const bestSellers = bySold(items).slice(0, limit);
  const targetBestSellers = bySold(targets).slice(0, limit);
  const week = items.filter((l) => ageH(l) < 24 * 7);
  const fresh = (week.length ? week : items).slice(0, limit);
  const supplyDeals = sources
    .filter((l) => (l.moq ?? 1) <= 10 && (l.badges.some((b) => FACTORY_BADGE.test(b)) || l.price.tiers.length > 1))
    .sort((a, b) => (b.sold ?? 0) - (a.sold ?? 0))
    .slice(0, limit);

  // Per-market rails for the three largest markets.
  const marketCounts = new Map<string, number>();
  for (const l of items) marketCounts.set(l.market, (marketCounts.get(l.market) ?? 0) + 1);
  const rails: MarketRail[] = [...marketCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([market, count]) => ({ market, name: meta(market)?.name ?? market, count, items: sorted.filter((l) => l.market === market).slice(0, limit) }));

  // Categories seen in the user's data.
  const counts = new Map<string, { tr: string; count: number }>();
  for (const l of items.slice(0, 2000)) {
    const leaf = classify(l.title);
    if (!leaf) continue;
    const cur = counts.get(leaf.key);
    if (cur) cur.count++;
    else counts.set(leaf.key, { tr: leaf.tr, count: 1 });
  }
  const categories = [...counts.entries()]
    .map(([key, { tr, count }]) => ({ key, tr, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 12);

  return {
    featured,
    marginPicks,
    bestSellers,
    fresh,
    supplyDeals,
    targetBestSellers,
    rails,
    categories,
    stats: { listings: items.length, markets: marketCounts.size, searches: input.searches, thisWeek: week.length },
  };
}

function compactTr(n: number): string {
  try {
    return new Intl.NumberFormat("tr-TR", { notation: "compact", maximumFractionDigits: 1 }).format(n);
  } catch {
    return String(n);
  }
}

/** Responsive section size: 12 on phones, 18 on laptops, 24 on wide screens. Pure. */
export function feedLimitFor(width: number): number {
  return width >= 1600 ? 24 : width >= 1100 ? 18 : 12;
}

let feedCache: { key: string; sections: FeedSections } | null = null;

/** Forgets the cached feed (tests, imports). */
export function invalidateFeed(): void {
  feedCache = null;
}

/** Runs `fn` when the browser is idle (or soon), so the home can paint first. */
export function whenIdle<T>(fn: () => Promise<T>, timeout = 800): Promise<T> {
  return new Promise((resolve, reject) => {
    const run = () => fn().then(resolve, reject);
    const ric = (globalThis as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
    if (ric) ric(run, { timeout });
    else setTimeout(run, 30);
  });
}

/**
 * Loads bounded inputs (newest 4000 listings, the last 30 searches' matches) and builds the
 * feed; cached per listing-write version, so back-navigation is instant.
 */
export async function buildFeed(targetCountry = "tr", limit = 12): Promise<FeedSections> {
  const key = `${listingsWriteVersion()}:${targetCountry}:${limit}:${await db.watches.count()}:${await db.projectItems.count()}`;
  if (feedCache && feedCache.key === key) return feedCache.sections;
  const listings = await db.listings.orderBy("fetchedAt").reverse().limit(4000).toArray();
  const searches = await db.searches.count();
  const watched = new Set((await db.watches.toArray()).map((w) => w.listingKey));
  const inProjects = new Set((await db.projectItems.toArray()).map((p) => p.listingKey));
  const recent = (await db.searches.orderBy("startedAt").reverse().limit(30).primaryKeys()) as string[];
  const matches = recent.length ? await db.matches.where("searchId").anyOf(recent).toArray() : [];
  const sections = buildFeedFrom({ listings, matches, watched, inProjects, searches, targetCountry, limit });
  feedCache = { key, sections };
  return sections;
}

/* ------------------------------------------------------------------------------------------ */
/* Dashboard helpers                                                                           */

export interface MarketReliability {
  market: string;
  /** Searches that included this market. */
  runs: number;
  /** Runs that finished with at least one listing. */
  ok: number;
  /** Runs that ended in an error, by type. */
  errors: Record<string, number>;
  lastOkAt?: string;
  lastErrorType?: string;
  lastErrorMessage?: string;
  health?: HealthResult;
}

/** Per-market success rate over recent searches plus the last persisted health check. Pure. */
export function marketReliability(searches: SearchRecord[], health: Partial<Record<string, HealthResult>> = {}): MarketReliability[] {
  const out = new Map<string, MarketReliability>();
  const get = (m: string) => out.get(m) ?? out.set(m, { market: m, runs: 0, ok: 0, errors: {} }).get(m)!;
  const sorted = [...searches].sort((a, b) => (a.startedAt < b.startedAt ? -1 : 1));
  for (const s of sorted) {
    if (!s.marketStatus) continue;
    for (const [m, st] of Object.entries(s.marketStatus)) {
      const r = get(m);
      r.runs++;
      if (st.state === "done" && st.received > 0) {
        r.ok++;
        r.lastOkAt = s.finishedAt ?? s.startedAt;
      } else if (st.state === "error") {
        r.errors[st.type] = (r.errors[st.type] ?? 0) + 1;
        r.lastErrorType = st.type;
        r.lastErrorMessage = st.message;
      }
    }
  }
  for (const [m, h] of Object.entries(health)) {
    if (!h) continue;
    const r = get(m);
    r.health = h;
    if (h.ok && (!r.lastOkAt || r.lastOkAt < h.checkedAt)) r.lastOkAt = h.checkedAt;
  }
  return [...out.values()].sort((a, b) => b.runs - a.runs || a.market.localeCompare(b.market));
}

/** Leaf label lookup for dashboards. */
export function leafLabel(key: string): string {
  return getLeaves().find((l) => l.key === key)?.tr ?? key;
}
