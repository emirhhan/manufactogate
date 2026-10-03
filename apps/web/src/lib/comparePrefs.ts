import type { MarketId } from "@manufactogate/core";
import { db, getSetting, setSetting } from "./db";

/** Settings key for the user's chosen compare markets (null = automatic: proven + wave-1 + source). */
export const COMPARE_MARKETS_KEY = "compareMarkets";
/** Hard cap on markets per compare: the extension serialises tabs, 32 markets take minutes. */
export const COMPARE_CAP = 12;

export async function getCompareMarkets(): Promise<MarketId[] | null> {
  return getSetting<MarketId[] | null>(COMPARE_MARKETS_KEY, null);
}
export async function setCompareMarkets(ids: MarketId[] | null): Promise<void> {
  await setSetting(COMPARE_MARKETS_KEY, ids);
}

/** Markets that have ever produced a stored listing on this device ("kanıtlı"), with counts. */
export async function provenMarkets(ids: MarketId[]): Promise<Map<MarketId, number>> {
  const out = new Map<MarketId, number>();
  await Promise.all(
    ids.map(async (m) => {
      try {
        const n = await db.listings.where("market").equals(m).count();
        if (n > 0) out.set(m, n);
      } catch {
        /* ignore */
      }
    }),
  );
  return out;
}

/** Removes problem markets from the stored preference (or from the given automatic set when none is stored). */
export function withoutMarkets(current: MarketId[] | null, auto: MarketId[], remove: MarketId[]): MarketId[] {
  const base = current ?? auto;
  const rm = new Set(remove);
  return base.filter((m) => !rm.has(m));
}

/**
 * Default compare set: wave-1 (non-beta) markets, markets proven on this device, and the source
 * market, capped. Beta markets that never produced a result are left out unless the user opted in.
 */
export function defaultCompareSet(opts: { wave1: MarketId[]; enabled: MarketId[]; proven: Iterable<MarketId>; source: MarketId; cap?: number }): MarketId[] {
  const cap = opts.cap ?? COMPARE_CAP;
  const provenSet = new Set(opts.proven);
  const ordered = [...new Set([opts.source, ...opts.wave1, ...opts.enabled.filter((m) => provenSet.has(m)), ...opts.enabled.filter((m) => !provenSet.has(m))])];
  const out: MarketId[] = [];
  for (const m of ordered) {
    if (out.length >= cap) break;
    // Unproven beta markets fill only the remaining slots after proven ones.
    if (!provenSet.has(m) && !opts.wave1.includes(m) && m !== opts.source && out.length >= Math.max(6, cap - 4)) continue;
    out.push(m);
  }
  return out;
}
