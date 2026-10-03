import type { RawListing } from "@manufactogate/core";

/**
 * Display-only exchange rates to TRY (indicative, dated). The cost engine and every "≈" figure
 * read the same table, so a rate the user overrides in Settings (CNY today) is used everywhere.
 */
export const FX_AS_OF = "2026-10-01";
export const FX_TO_TRY: Record<string, number> = {
  TRY: 1,
  CNY: 4.7,
  USD: 34,
  EUR: 37,
  GBP: 43,
  INR: 0.4,
  IDR: 0.0021,
  THB: 1.0,
  JPY: 0.22,
  KRW: 0.025,
  RUB: 0.36,
  AED: 9.3,
  PLN: 8.5,
  RON: 7.4,
  VND: 0.00135,
  MYR: 7.6,
  PHP: 0.59,
  SGD: 25.5,
  HKD: 4.36,
  TWD: 1.06,
  CAD: 24.5,
  AUD: 22.5,
  CHF: 38.5,
  SAR: 9.06,
  EGP: 0.7,
  BRL: 6.2,
  MXN: 1.8,
  SEK: 3.2,
  NOK: 3.1,
  DKK: 4.95,
  CZK: 1.47,
  HUF: 0.093,
  UAH: 0.82,
  KZT: 0.07,
  PKR: 0.12,
  BDT: 0.28,
};

const overrides = new Map<string, number>();

/** Pins a rate (1 unit of `code` = `rate` TRY); the user's own CNY rate from Settings lands here. */
export function setRateOverride(code: string, rate: number | null | undefined): void {
  if (rate === null || rate === undefined || !Number.isFinite(rate) || rate <= 0) overrides.delete(code);
  else overrides.set(code, rate);
}
export function clearRateOverrides(): void {
  overrides.clear();
}
/** Rate to TRY for a currency, overrides first; null when the code is unknown. */
export function getRate(code: string): number | null {
  const o = overrides.get(code);
  if (o !== undefined) return o;
  const r = FX_TO_TRY[code];
  return r ? r : null;
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
  const a = getRate(from);
  const b = getRate(to);
  return a && b ? (amount * a) / b : null;
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
/** Highest tier price of a listing; null when the listing has no tiers. */
export function maxOf(l: Pick<RawListing, "price">): number | null {
  const t = l.price.tiers;
  if (!t.length) return null;
  let m = -Infinity;
  for (const x of t) if (x.unitPrice > m) m = x.unitPrice;
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
