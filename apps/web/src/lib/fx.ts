/** Display-only exchange rates to TRY. The cost engine uses the user's own rate; these only order and compare lists. */
export const FX_TO_TRY: Record<string, number> = { TRY: 1, CNY: 4.7, USD: 34, EUR: 37, GBP: 43 };

export function toTry(amount: number, currency: string): number | null {
  const r = FX_TO_TRY[currency];
  return r ? amount * r : null;
}
