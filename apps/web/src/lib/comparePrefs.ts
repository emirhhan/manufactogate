import type { MarketId } from "@manufactogate/core";
import { db, getSetting, setSetting } from "./db";
import { migrateMarketIds } from "./markets";

/** Settings key for the user's chosen compare markets (null = automatic: proven + wave-1 + source). */
export const COMPARE_MARKETS_KEY = "compareMarkets";
/** Hard cap on markets per compare: the extension serialises tabs, 32 markets take minutes. */
export const COMPARE_CAP = 12;

/** Stored compare markets, with renamed ids migrated (`jp-mercari` → `us-mercari`); null when the user never chose. */
export async function getCompareMarkets(): Promise<MarketId[] | null> {
  const stored = await getSetting<readonly string[] | null>(COMPARE_MARKETS_KEY, null);
  if (!stored || !Array.isArray(stored)) return null;
  return migrateMarketIds(stored.filter((x): x is string => typeof x === "string"));
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

export interface DefaultCompareInput {
  /** Wave-1 (hand-calibrated) markets. */
  wave1: MarketId[];
  enabled: MarketId[];
  /** Markets that produced results on this device. */
  proven: Iterable<MarketId>;
  source: MarketId;
  /** Beta markets verified live in the calibration round (Settings `VERIFIED_MARKETS`). */
  verified?: MarketId[];
  /** Markets selling in the user's target country, so a "pazarda satılır mı" answer is always possible. */
  targetMarkets?: MarketId[];
  cap?: number;
}

/**
 * Default compare set, in priority order: the source market, wave-1, verified beta markets,
 * the target country's markets, markets proven on this device, then (into the last few slots
 * only) other enabled markets. Beta markets that never produced a result are left out unless
 * the user opted in, so a compare never fans out to 32 markets by default. Pure.
 */
export function defaultCompareSet(opts: DefaultCompareInput): MarketId[] {
  const cap = opts.cap ?? COMPARE_CAP;
  const provenSet = new Set(opts.proven);
  const verified = opts.verified ?? [];
  const targetMarkets = opts.targetMarkets ?? [];
  const preferred = new Set<MarketId>([opts.source, ...opts.wave1, ...verified, ...targetMarkets]);
  const ordered = [...new Set([opts.source, ...opts.wave1, ...verified, ...targetMarkets, ...opts.enabled.filter((m) => provenSet.has(m)), ...opts.enabled.filter((m) => !provenSet.has(m))])];
  const out: MarketId[] = [];
  for (const m of ordered) {
    if (out.length >= cap) break;
    // Unproven, unverified beta markets fill only the remaining slots after the preferred ones.
    if (!provenSet.has(m) && !preferred.has(m) && out.length >= Math.max(6, cap - 4)) continue;
    out.push(m);
  }
  return out;
}
