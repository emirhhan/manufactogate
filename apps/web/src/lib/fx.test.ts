import { afterEach, describe, expect, it } from "vitest";
import { REFERENCE_FX } from "@manufactogate/country-profiles";
import { clearRateOverrides, compareDisplayAsc, convert, effectiveFxTable, FX_AS_OF, FX_TABLE, FX_TO_TRY, fxStaleness, fxVersion, getRate, maxOf, minDisplay, minOf, rateOverrides, setDisplayCurrency, setRateOverride, toDisplay, toTry } from "./fx";

afterEach(() => {
  clearRateOverrides();
  setDisplayCurrency("TRY");
});

const L = (currency: string, ...prices: number[]) => ({ price: { currency, tiers: prices.map((p, i) => ({ minQty: i + 1, unitPrice: p })) } });
const CNY_TRY = REFERENCE_FX.rates.TRY! / REFERENCE_FX.rates.CNY!;
const USD_TRY = REFERENCE_FX.rates.TRY!;

describe("fx", () => {
  it("is built on the core reference table (date, source, USD base) and extends it", () => {
    expect(FX_AS_OF).toBe(REFERENCE_FX.asOf);
    expect(FX_TABLE.base).toBe("USD");
    for (const [code, v] of Object.entries(REFERENCE_FX.rates)) expect(FX_TABLE.rates[code]).toBe(v);
    expect(FX_TO_TRY.CNY).toBeCloseTo(CNY_TRY, 9);
    expect(FX_TO_TRY.USD).toBe(USD_TRY);
    expect(FX_TO_TRY.TRY).toBe(1);
  });
  it("unknown currencies return null instead of 1:1", () => {
    expect(toTry(10, "XYZ")).toBeNull();
    expect(convert(10, "XYZ", "TRY")).toBeNull();
    expect(minDisplay(L("XYZ", 5))).toBeNull();
  });
  it("currencies the reference lacks are still covered", () => {
    for (const c of ["VND", "MYR", "PHP", "SGD", "HKD", "TWD", "CAD", "AUD", "CHF"]) expect(getRate(c)).not.toBeNull();
  });
  it("overrides take precedence and feed convert/toDisplay", () => {
    expect(toTry(1, "CNY")).toBeCloseTo(CNY_TRY, 9);
    const v0 = fxVersion();
    setRateOverride("CNY", 5);
    expect(fxVersion()).toBe(v0 + 1);
    expect(toTry(1, "CNY")).toBe(5);
    expect(convert(10, "CNY", "TRY")).toBeCloseTo(50, 9);
    expect(rateOverrides()).toEqual({ CNY: 5 });
    setDisplayCurrency("USD");
    expect(toDisplay(USD_TRY, "TRY")).toBeCloseTo(1, 6);
    expect(toDisplay(1, "CNY")).toBeCloseTo(5 / USD_TRY, 6);
    setRateOverride("CNY", null);
    expect(toTry(1, "CNY")).toBeCloseTo(CNY_TRY, 9);
    // Setting the same value again does not bump the version (no needless re-renders).
    const v1 = fxVersion();
    setRateOverride("CNY", null);
    expect(fxVersion()).toBe(v1);
  });
  it("a pinned USD rate moves the base pair and keeps other crosses against USD", () => {
    setRateOverride("USD", 40);
    expect(getRate("USD")).toBeCloseTo(40, 9);
    expect(convert(1, "EUR", "USD")).toBeCloseTo(1 / REFERENCE_FX.rates.EUR!, 9);
    expect(getRate("EUR")).toBeCloseTo(40 / REFERENCE_FX.rates.EUR!, 9);
    setRateOverride("CNY", 5);
    expect(getRate("CNY")).toBeCloseTo(5, 9);
    expect(getRate("USD")).toBeCloseTo(40, 9);
  });
  it("effectiveFxTable is the core-shaped table with pins applied (for the cost engine)", () => {
    expect(effectiveFxTable()).toBe(FX_TABLE);
    setRateOverride("CNY", 5);
    const t = effectiveFxTable();
    expect(t).not.toBe(FX_TABLE);
    expect(t.source).toBe("user");
    expect(t.rates.TRY! / t.rates.CNY!).toBeCloseTo(5, 9);
  });
  it("fxStaleness reports the table age and flags it after 7 days; pinned codes are listed", () => {
    const fresh = fxStaleness(new Date(`${FX_AS_OF}T12:00:00Z`));
    expect(fresh.ageDays).toBe(0);
    expect(fresh.stale).toBe(false);
    const old = fxStaleness(new Date(new Date(FX_AS_OF).getTime() + 9 * 86_400_000));
    expect(old.ageDays).toBe(9);
    expect(old.stale).toBe(true);
    setRateOverride("USD", 40);
    expect(fxStaleness().pinned).toEqual(["USD"]);
  });
  it("minOf/minDisplay handle price-on-request listings; maxOf honours priceMax", () => {
    expect(minOf(L("CNY"))).toBeNull();
    expect(minOf(L("CNY", 12, 8, 10))).toBe(8);
    expect(minDisplay(L("CNY", 12, 8))).toBeCloseTo(8 * CNY_TRY, 6);
    expect(maxOf(L("USD", 14.49))).toBe(14.49);
    expect(maxOf({ ...L("USD", 14.49), priceMax: 14.99 })).toBe(14.99);
    expect(maxOf({ ...L("USD", 14.49), priceMax: 10 })).toBe(14.49);
    expect(maxOf({ ...L("USD"), priceMax: 10 })).toBeNull();
  });
  it("compareDisplayAsc sorts nulls last", () => {
    const xs: (number | null)[] = [5, null, 1, null, 3];
    expect([...xs].sort(compareDisplayAsc)).toEqual([1, 3, 5, null, null]);
  });
});
