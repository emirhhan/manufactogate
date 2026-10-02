import { pct, priceRange, relTime } from "../src/lib/format";

describe("format", () => {
  it("price range", () => {
    expect(priceRange({ currency: "CNY", tiers: [{ minQty: 1, unitPrice: 10 }] })).toContain("10");
    const r = priceRange({ currency: "CNY", tiers: [{ minQty: 1, unitPrice: 10 }, { minQty: 100, unitPrice: 8 }] });
    expect(r).toContain("–");
  });
  it("pct and relTime", () => {
    expect(pct(0.856)).toBe("%86");
    expect(relTime(new Date(Date.now() - 5000).toISOString())).toBe("az önce");
  });
});
