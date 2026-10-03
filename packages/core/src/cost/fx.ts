import type { CurrencyCode } from "../model";

/** Dated exchange-rate table: every rate is "1 USD = rates[code] units of code". */
export interface FxTable {
  /** ISO date the rates were observed. */
  asOf: string;
  base: "USD";
  rates: Record<CurrencyCode, number>;
  /** Where the rates came from (URL or "user"). */
  source?: string;
}

export class FxError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FxError";
  }
}

/** 1 unit of `from` expressed in `to`, or null when either currency is unknown. */
export function fxRate(from: CurrencyCode, to: CurrencyCode, table: FxTable): number | null {
  const f = from.toUpperCase();
  const t = to.toUpperCase();
  if (f === t) return 1;
  const a = f === table.base ? 1 : table.rates[f];
  const b = t === table.base ? 1 : table.rates[t];
  if (!a || !b || a <= 0 || b <= 0) return null;
  return b / a;
}

/** Converts an amount between two currencies of the table; null when a rate is missing. */
export function convert(amount: number, from: CurrencyCode, to: CurrencyCode, table: FxTable): number | null {
  const r = fxRate(from, to, table);
  return r === null ? null : amount * r;
}

/**
 * Applies user-pinned rates on top of a reference table. Overrides are expressed in the
 * table's base ("1 USD = x"), except that a `TRY`-style pair map may be given via
 * `pairs` ({ "CNY/TRY": 4.7 }) which is converted using the base rate of the quote currency.
 */
export function withOverrides(table: FxTable, overrides: Partial<Record<CurrencyCode, number>>, pairs: Record<string, number> = {}): FxTable {
  const rates: Record<CurrencyCode, number> = { ...table.rates };
  for (const [code, v] of Object.entries(overrides)) if (v && v > 0) rates[code.toUpperCase()] = v;
  for (const [pair, v] of Object.entries(pairs)) {
    const [from, to] = pair.toUpperCase().split("/");
    if (!from || !to || !v || v <= 0) continue;
    const toRate = to === table.base ? 1 : rates[to];
    if (!toRate) continue;
    // 1 from = v to  ⇒  1 USD = toRate to  ⇒  1 USD = toRate / v from
    rates[from] = toRate / v;
  }
  return { ...table, rates, source: "user" };
}

/** Age of the table in whole days relative to `now` (ISO date or Date). */
export function fxAgeDays(table: FxTable, now: Date | string = new Date()): number {
  const n = typeof now === "string" ? new Date(now) : now;
  const t = new Date(table.asOf);
  return Math.max(0, Math.floor((n.getTime() - t.getTime()) / 86_400_000));
}

/** True when the table is older than `maxDays` (default 7). */
export function fxIsStale(table: FxTable, maxDays = 7, now: Date | string = new Date()): boolean {
  return fxAgeDays(table, now) > maxDays;
}
