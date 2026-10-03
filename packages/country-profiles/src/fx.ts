import type { FxTable } from "@manufactogate/core";

/**
 * Indicative reference rates (1 USD = x). Dated; the app should refresh or let the user pin
 * rates (PLAN §3.5). Never used for display without the asOf date.
 */
export const REFERENCE_FX: FxTable = {
  asOf: "2026-10-01",
  base: "USD",
  source: "indicative mid-market, hand-entered",
  rates: {
    USD: 1, TRY: 42.0, CNY: 7.1, EUR: 0.86, GBP: 0.74, JPY: 150, KRW: 1380, RUB: 82, INR: 88, IDR: 16400, THB: 32.5, AED: 3.6725, SAR: 3.75, PLN: 3.65, RON: 4.35, HKD: 7.8, VND: 26000, MYR: 4.2, SGD: 1.29,
  },
};
