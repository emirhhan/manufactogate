import { fxAgeDays, fxIsStale, fxRate, withOverrides, type FxTable, type RawListing } from "@manufactogate/core";
import { REFERENCE_FX } from "@manufactogate/country-profiles";

/**
 * Display and cost exchange rates, built on the core `FxTable` machinery: the dated reference
 * table from country-profiles (`REFERENCE_FX`, 1 USD = x) extended with a few currencies the
 * reference does not list, plus the user's pinned TRY rates from Settings applied with
 * `withOverrides`. Every "≈" figure, the analysis card, exports and the landed-cost engine read
 * the same effective table, so a rate the user overrides is used everywhere.
 */

/** Currencies of markets the registry knows that the core reference table does not carry (1 USD = x, same date). */
export const EXTRA_USD_RATES: Record<string, number> = {
  PHP: 57.5, TWD: 32.0, CAD: 1.39, AUD: 1.51, CHF: 0.88, EGP: 48.5, BRL: 5.5, MXN: 18.9, SEK: 10.6, NOK: 10.9, DKK: 6.9, CZK: 23.1, HUF: 365, UAH: 41.5, KZT: 480, PKR: 280, BDT: 121,
};

/** The app's reference table: core reference rates first, extras only where the reference is silent. */
export const FX_TABLE: FxTable = {
  ...REFERENCE_FX,
  rates: { ...EXTRA_USD_RATES, ...REFERENCE_FX.rates },
};
export const FX_AS_OF = FX_TABLE.asOf;
export const FX_SOURCE = FX_TABLE.source ?? "gösterge";
/** Older than this many days, the table is flagged as stale in the UI. */
export const FX_STALE_DAYS = 7;

/** Reference TRY rate per unit of each currency (1 unit = x TRY), derived from the table; Settings shows these as defaults. */
export const FX_TO_TRY: Record<string, number> = Object.fromEntries(
  Object.keys(FX_TABLE.rates)
    .map((code) => [code, fxRate(code, "TRY", FX_TABLE)] as const)
    .filter((e): e is readonly [string, number] => e[1] !== null),
);

const overrides = new Map<string, number>();
let effective: FxTable = FX_TABLE;
let version = 0;

function rebuild(): void {
  const pairs: Record<string, number> = {};
  const direct: Partial<Record<string, number>> = {};
  for (const [code, rate] of overrides) {
    // A pin on the base currency (1 USD = x TRY) moves the TRY rate itself; crosses against USD stay as in the reference.
    if (code === FX_TABLE.base) direct.TRY = rate;
    else pairs[`${code}/TRY`] = rate;
  }
  effective = overrides.size ? withOverrides(FX_TABLE, direct, pairs) : FX_TABLE;
  version++;
}

/** Pins a rate (1 unit of `code` = `rate` TRY); the user's own rates from Settings land here. */
export function setRateOverride(code: string, rate: number | null | undefined): void {
  const key = code.toUpperCase();
  if (rate === null || rate === undefined || !Number.isFinite(rate) || rate <= 0) {
    if (!overrides.delete(key)) return;
  } else {
    if (overrides.get(key) === rate) return;
    overrides.set(key, rate);
  }
  rebuild();
}
export function clearRateOverrides(): void {
  if (!overrides.size) return;
  overrides.clear();
  rebuild();
}
/** Currencies the user pinned, with their TRY rate. */
export function rateOverrides(): Record<string, number> {
  return Object.fromEntries(overrides);
}
/** Changes whenever an override is set or cleared; memos that convert money can depend on it. */
export function fxVersion(): number {
  return version;
}

/**
 * The table in force (reference + user pins), in the core `FxTable` shape so the cost engine can
 * take it as `fx: { listingCurrency, table }` and report the date it used.
 */
export function effectiveFxTable(): FxTable {
  return effective;
}

export interface FxStaleness {
  asOf: string;
  ageDays: number;
  stale: boolean;
  source: string;
  /** Currencies the user pinned (those rates are never stale). */
  pinned: string[];
}
/** How old the reference rates are; `stale` after `FX_STALE_DAYS`. Pure for a given `now`. */
export function fxStaleness(now: Date | string = new Date()): FxStaleness {
  return { asOf: FX_AS_OF, ageDays: fxAgeDays(FX_TABLE, now), stale: fxIsStale(FX_TABLE, FX_STALE_DAYS, now), source: FX_SOURCE, pinned: [...overrides.keys()] };
}

/** Rate to TRY for a currency, overrides first; null when the code is unknown. */
export function getRate(code: string): number | null {
  return fxRate(code, "TRY", effective);
}
export function hasRate(code: string): boolean {
  return getRate(code) !== null;
}

export function toTry(amount: number, currency: string): number | null {
  const r = getRate(currency);
  return r ? amount * r : null;
}

/** Converts between any two currencies in the table; null when either rate is unknown. */
export function convert(amount: number, from: string, to: string): number | null {
  if (from === to) return amount;
  const r = fxRate(from, to, effective);
  return r === null ? null : amount * r;
}

export const DISPLAY_CURRENCIES = ["TRY", "USD", "EUR", "GBP"] as const;
export type DisplayCurrency = (typeof DISPLAY_CURRENCIES)[number];

let display: DisplayCurrency = "TRY";
export function setDisplayCurrency(c: DisplayCurrency) {
  display = c;
}
export function getDisplayCurrency(): DisplayCurrency {
  return display;
}
/** Amount in the user's display currency, or null when the rate is unknown. */
export function toDisplay(amount: number, currency: string): number | null {
  return convert(amount, currency, display);
}

/** Lowest tier price of a listing in its own currency; null for price-on-request listings (no tiers). */
export function minOf(l: Pick<RawListing, "price">): number | null {
  const t = l.price.tiers;
  if (!t.length) return null;
  let m = Infinity;
  for (const x of t) if (x.unitPrice < m) m = x.unitPrice;
  return Number.isFinite(m) ? m : null;
}
/** Highest tier price of a listing (or its `priceMax` range top when larger); null when the listing has no tiers. */
export function maxOf(l: Pick<RawListing, "price"> & { priceMax?: number | undefined }): number | null {
  const t = l.price.tiers;
  if (!t.length) return null;
  let m = -Infinity;
  for (const x of t) if (x.unitPrice > m) m = x.unitPrice;
  if (l.priceMax !== undefined && Number.isFinite(l.priceMax) && l.priceMax > m) m = l.priceMax;
  return Number.isFinite(m) ? m : null;
}

/**
 * Lowest price converted to the display currency. Null when the listing has no price or the
 * currency has no rate: callers render "—" and sort such rows last instead of mixing currencies.
 */
export function minDisplay(l: Pick<RawListing, "price">): number | null {
  const m = minOf(l);
  if (m === null) return null;
  return toDisplay(m, l.price.currency);
}

/** Sort comparator for "price ascending" that keeps unknown-currency and price-on-request rows at the end. */
export function compareDisplayAsc(a: number | null, b: number | null): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a - b;
}
