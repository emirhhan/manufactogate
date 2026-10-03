import { convert, fxAgeDays, fxIsStale, fxRate, withOverrides, type FxTable } from "../src";

const table: FxTable = { asOf: "2026-10-01", base: "USD", rates: { TRY: 40, CNY: 8, EUR: 0.8 } };

describe("fx", () => {
  it("converts through the base and is symmetric", () => {
    expect(fxRate("CNY", "TRY", table)).toBe(5);
    expect(convert(100, "CNY", "TRY", table)).toBe(500);
    expect(convert(500, "TRY", "CNY", table)).toBeCloseTo(100);
    expect(convert(1, "USD", "EUR", table)).toBeCloseTo(0.8);
    expect(convert(1, "eur", "usd", table)).toBeCloseTo(1.25);
    expect(convert(1, "TRY", "TRY", table)).toBe(1);
    expect(convert(1, "XXX", "TRY", table)).toBeNull();
  });
  it("overrides take precedence and pairs are converted to the base", () => {
    const o = withOverrides(table, { CNY: 7 });
    expect(fxRate("CNY", "TRY", o)).toBeCloseTo(40 / 7);
    expect(fxRate("CNY", "TRY", table)).toBe(5);
    const pinned = withOverrides(table, {}, { "CNY/TRY": 4.7 });
    expect(fxRate("CNY", "TRY", pinned)).toBeCloseTo(4.7);
    expect(pinned.source).toBe("user");
    expect(withOverrides(table, { CNY: 0 }).rates["CNY"]).toBe(8);
  });
  it("reports staleness", () => {
    expect(fxAgeDays(table, "2026-10-05")).toBe(4);
    expect(fxIsStale(table, 7, "2026-10-05")).toBe(false);
    expect(fxIsStale(table, 7, "2026-10-20")).toBe(true);
  });
});
