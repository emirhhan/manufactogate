import type { RawListing } from "@manufactogate/core";
import type { MatchRecord } from "./db";
import { convert, minOf } from "./fx";

/** A target price below 2× the source is not interesting; above 25× it is almost always a mismatch. */
export const MIN_MARGIN_RATIO = 2;
export const MAX_MARGIN_RATIO = 25;

export interface MarginPair {
  sourceKey: string;
  targetKey: string;
  /** Target unit price divided by the source unit price, both in the target currency. */
  ratio: number;
  matchScore: number;
  targetPrice: number;
  targetCurrency: string;
}

/** Retail-to-source ratio when both prices convert; null outside the plausible band. Pure. */
export function marginRatio(source: Pick<RawListing, "price">, target: Pick<RawListing, "price">): number | null {
  const sp = minOf(source);
  const tp = minOf(target);
  if (sp === null || tp === null || sp <= 0) return null;
  const converted = convert(sp, source.price.currency, target.price.currency);
  if (!converted || converted <= 0) return null;
  const ratio = tp / converted;
  if (ratio < MIN_MARGIN_RATIO || ratio > MAX_MARGIN_RATIO) return null;
  return ratio;
}

/**
 * Best margin pair per source listing from stored cluster matches (image + title agreement
 * ≥ `minScore`), using the newest copy of every listing. Pure.
 */
export function pairsFromMatches(
  matches: MatchRecord[],
  latest: Map<string, RawListing>,
  isTarget: (market: string) => boolean,
  isSource: (market: string) => boolean,
  minScore = 0.85,
): Map<string, MarginPair> {
  const out = new Map<string, MarginPair>();
  for (const rec of matches) {
    const ms = rec.members.filter((m) => m.score >= minScore);
    const ts = ms.filter((m) => isTarget(m.market));
    if (!ts.length) continue;
    const ss = ms.filter((m) => !isTarget(m.market) && isSource(m.market));
    for (const a of ss) {
      const s = latest.get(a.key);
      if (!s) continue;
      for (const b of ts) {
        const t = latest.get(b.key);
        if (!t) continue;
        const ratio = marginRatio(s, t);
        if (ratio === null) continue;
        const prev = out.get(a.key);
        if (prev && prev.ratio >= ratio) continue;
        out.set(a.key, { sourceKey: a.key, targetKey: b.key, ratio, matchScore: Math.min(a.score, b.score), targetPrice: minOf(t)!, targetCurrency: t.price.currency });
      }
    }
  }
  return out;
}
