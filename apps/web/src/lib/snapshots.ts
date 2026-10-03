import type { MarketId, RawListing } from "@manufactogate/core";
import type { SnapshotOffer } from "@manufactogate/adapters";
import { sendSnapshot } from "./bridge";
import { db } from "./db";
import { minOf } from "./fx";
import { getDataSource, getRegistry } from "./registry";

/**
 * Price snapshots for the extension overlay (P1-5): "bu ürün şu pazarlarda şu fiyattan var" on the
 * market's own product page. Offers come from the listings the app matched to this one, either
 * live (the compare table's best per market) or from stored cluster matches on this device.
 */

/** Minimum stored match score for an offer to be trusted on the overlay. */
export const SNAPSHOT_MIN_SCORE = 0.85;
export const SNAPSHOT_MAX_OFFERS = 12;

/** One offer per market from the best listings of a compare, cheapest first; the source's own market is left out. Pure. */
export function offersFromBest(best: Iterable<RawListing | undefined>, source: Pick<RawListing, "market" | "id">, name: (m: MarketId) => string | undefined): SnapshotOffer[] {
  const out: SnapshotOffer[] = [];
  const seen = new Set<string>();
  for (const l of best) {
    if (!l || l.market === source.market || seen.has(l.market)) continue;
    const p = minOf(l);
    if (p === null) continue;
    seen.add(l.market);
    const n = name(l.market);
    out.push({ market: l.market, ...(n ? { name: n } : {}), price: p, currency: l.price.currency, url: l.url });
  }
  return out.sort((a, b) => a.price - b.price).slice(0, SNAPSHOT_MAX_OFFERS);
}

/** Offers for a listing from stored matches (cheapest listing per other market with score ≥ `minScore`). */
export async function offersFromMatches(key: string, minScore = SNAPSHOT_MIN_SCORE): Promise<SnapshotOffer[]> {
  const recs = await db.matches.filter((m) => m.members.some((x) => x.key === key)).toArray();
  const [market, id] = key.split(":", 2) as [MarketId, string];
  const keys = new Set<string>();
  for (const r of recs) {
    const mine = r.members.find((x) => x.key === key);
    if (!mine || mine.score < minScore) continue;
    for (const m of r.members) if (m.key !== key && m.score >= minScore) keys.add(m.key);
  }
  if (!keys.size) return [];
  const rows = (await db.listings.bulkGet([...keys])).filter((r): r is NonNullable<typeof r> => !!r);
  const bestByMarket = new Map<string, RawListing>();
  for (const r of rows) {
    const p = minOf(r);
    if (p === null) continue;
    const cur = bestByMarket.get(r.market);
    if (!cur || (minOf(cur) ?? Infinity) > p) bestByMarket.set(r.market, r);
  }
  const reg = getRegistry();
  return offersFromBest(bestByMarket.values(), { market, id }, (m) => reg.get(m)?.meta.name);
}

/**
 * Pushes the overlay snapshot for a listing (fire-and-forget, extension mode only). With no live
 * offers given, stored matches are used. Resolves true when the extension acknowledged it.
 */
export async function pushListingSnapshot(listing: Pick<RawListing, "market" | "id" | "title">, live?: SnapshotOffer[]): Promise<boolean> {
  if (getDataSource() !== "extension") return false;
  try {
    const offers = live && live.length ? live : await offersFromMatches(`${listing.market}:${listing.id}`);
    if (!offers.length) return false;
    return await sendSnapshot({ market: listing.market, listingId: listing.id, title: listing.title }, offers);
  } catch {
    return false;
  }
}
