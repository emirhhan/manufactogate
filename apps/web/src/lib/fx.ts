/** Display-only exchange rates to TRY (indicative). The cost engine uses the user's own rate. */
export const FX_TO_TRY: Record<string, number> = {
  TRY: 1, CNY: 4.7, USD: 34, EUR: 37, GBP: 43, INR: 0.4, IDR: 0.0021, THB: 1.0, JPY: 0.22, KRW: 0.025, RUB: 0.36, AED: 9.3, PLN: 8.5, RON: 7.4,
};

export function toTry(amount: number, currency: string): number | null {
  const r = FX_TO_TRY[currency];
  return r ? amount * r : null;
}

/** Converts between any two currencies in the table. */
export function convert(amount: number, from: string, to: string): number | null {
  const a = FX_TO_TRY[from];
  const b = FX_TO_TRY[to];
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
