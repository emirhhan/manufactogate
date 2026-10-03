import { afterEach, describe, expect, it } from "vitest";
import { clearRateOverrides, compareDisplayAsc, convert, getRate, minDisplay, minOf, setDisplayCurrency, setRateOverride, toDisplay, toTry } from "./fx";

afterEach(() => {
  clearRateOverrides();
  setDisplayCurrency("TRY");
});

const L = (currency: string, ...prices: number[]) => ({ price: { currency, tiers: prices.map((p, i) => ({ minQty: i + 1, unitPrice: p })) } });

describe("fx", () => {
  it("unknown currencies return null instead of 1:1", () => {
    expect(toTry(10, "XYZ")).toBeNull();
    expect(convert(10, "XYZ", "TRY")).toBeNull();
    expect(minDisplay(L("XYZ", 5))).toBeNull();
  });
  it("newly added rates exist", () => {
    for (const c of ["VND", "MYR", "PHP", "SGD", "HKD", "TWD", "CAD", "AUD", "CHF"]) expect(getRate(c)).not.toBeNull();
  });
  it("overrides take precedence and feed convert/toDisplay", () => {
    expect(toTry(1, "CNY")).toBe(4.7);
    setRateOverride("CNY", 5);
    expect(toTry(1, "CNY")).toBe(5);
    expect(convert(10, "CNY", "TRY")).toBe(50);
    setDisplayCurrency("USD");
    expect(toDisplay(34, "TRY")).toBeCloseTo(1, 6);
    expect(toDisplay(1, "CNY")).toBeCloseTo(5 / 34, 6);
    setRateOverride("CNY", null);
    expect(toTry(1, "CNY")).toBe(4.7);
  });
  it("minOf/minDisplay handle price-on-request listings", () => {
    expect(minOf(L("CNY"))).toBeNull();
    expect(minOf(L("CNY", 12, 8, 10))).toBe(8);
    expect(minDisplay(L("CNY", 12, 8))).toBeCloseTo(8 * 4.7, 6);
  });
  it("compareDisplayAsc sorts nulls last", () => {
    const xs: (number | null)[] = [5, null, 1, null, 3];
    expect([...xs].sort(compareDisplayAsc)).toEqual([1, 3, 5, null, null]);
  });
});
