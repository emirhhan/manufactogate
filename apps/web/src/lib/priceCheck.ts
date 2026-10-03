import type { RawListing } from "@manufactogate/core";
import { minOf } from "./fx";

/** How far from the market's median a price may sit before it is flagged (×8 either way). */
const FACTOR = 8;
/** A market needs this many priced results before its median means anything. */
const MIN_SAMPLE = 5;

/**
 * Prices that are probably mis-read: zero/negative, or more than ×8 away from the median of the
 * same market's results in the same currency (a quantity, a "sold" count or a coupon read as the
 * price). Keys are "market:id". Pure.
 */
export function suspiciousPrices(listings: Pick<RawListing, "market" | "id" | "price">[]): Set<string> {
  const out = new Set<string>();
  const groups = new Map<string, { key: string; p: number }[]>();
  for (const l of listings) {
    const p = minOf(l);
    if (p === null) continue;
    const key = `${l.market}:${l.id}`;
    if (!(p > 0)) {
      out.add(key);
      continue;
    }
    const g = `${l.market}|${l.price.currency}`;
    const arr = groups.get(g) ?? [];
    arr.push({ key, p });
    groups.set(g, arr);
  }
  for (const arr of groups.values()) {
    if (arr.length < MIN_SAMPLE) continue;
    const sorted = arr.map((x) => x.p).sort((a, b) => a - b);
    const mid = sorted.length >> 1;
    const median = sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
    for (const x of arr) if (x.p > median * FACTOR || x.p < median / FACTOR) out.add(x.key);
  }
  return out;
}
