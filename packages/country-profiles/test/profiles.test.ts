import { computeLandedCost } from "@manufactogate/core";
import { COUNTRY_PROFILES, getCountryProfile } from "../src";

describe("country profiles", () => {
  it("every profile is dated, sourced and computes", () => {
    for (const p of Object.values(COUNTRY_PROFILES)) {
      expect(p.asOf).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(p.sources.length).toBeGreaterThan(0);
      expect(p.shipping.length).toBeGreaterThan(0);
      const r = computeLandedCost(p, {
        quantity: 100,
        tiers: [{ minQty: 1, unitPrice: 2 }],
        fxRate: 1,
        unitWeightKg: 0.2,
        shippingKey: p.shipping[0]!.key,
      });
      expect(r.total).toBeGreaterThan(0);
    }
  });
  it("lookup is case-insensitive", () => {
    expect(getCountryProfile("TR")?.currency).toBe("TRY");
    expect(getCountryProfile("xx")).toBeUndefined();
  });
});
