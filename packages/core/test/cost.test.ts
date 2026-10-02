import { computeLandedCost, computeMargin, pickTier, type CountryProfile } from "../src";

const profile: CountryProfile = {
  country: "tr",
  currency: "TRY",
  asOf: "2026-01-01",
  sources: [],
  dutyByHs: { default: 0.1, "8518": 0.0 },
  taxes: [
    { key: "extra-duty", label: "İlave gümrük vergisi", rate: 0.2, base: "cif" },
    { key: "vat", label: "KDV", rate: 0.2, base: "cif+duty+extra" },
  ],
  brokerFee: 1000,
  domesticShippingPerUnit: 10,
  shipping: [{ key: "air", label: "Hava", mode: "air", perKg: 100, minCharge: 500, transitDays: [7, 12] }],
  commissions: { "tr-trendyol": 0.15 },
};

describe("cost engine", () => {
  it("picks the right tier", () => {
    const tiers = [
      { minQty: 1, unitPrice: 10 },
      { minQty: 100, unitPrice: 8 },
      { minQty: 500, unitPrice: 6 },
    ];
    expect(pickTier(tiers, 50).unitPrice).toBe(10);
    expect(pickTier(tiers, 100).unitPrice).toBe(8);
    expect(pickTier(tiers, 999).unitPrice).toBe(6);
  });
  it("computes landed cost line by line", () => {
    const r = computeLandedCost(profile, {
      quantity: 100,
      tiers: [{ minQty: 1, unitPrice: 10 }],
      fxRate: 5,
      unitWeightKg: 0.1,
      shippingKey: "air",
      insuranceRate: 0,
    });
    // goods 5000, freight max(500, 100*0.1*100=1000)=1000, cif 6000
    // duty 600, extra 1200, vat (6000+600+1200)*0.2=1560, broker 1000, domestic 1000
    const by = Object.fromEntries(r.lines.map((l) => [l.key, l.amount]));
    expect(by["goods"]).toBe(5000);
    expect(by["freight"]).toBe(1000);
    expect(by["duty"]).toBeCloseTo(600);
    expect(by["extra-duty"]).toBeCloseTo(1200);
    expect(by["vat"]).toBeCloseTo(1560);
    expect(r.total).toBeCloseTo(5000 + 1000 + 600 + 1200 + 1560 + 1000 + 1000);
    expect(r.perUnit).toBeCloseTo(r.total / 100);
  });
  it("uses HS-specific duty", () => {
    const r = computeLandedCost(profile, {
      quantity: 1,
      tiers: [{ minQty: 1, unitPrice: 100 }],
      fxRate: 1,
      unitWeightKg: 1,
      shippingKey: "air",
      hsCode: "851830",
      insuranceRate: 0,
    });
    expect(r.lines.find((l) => l.key === "duty")!.amount).toBe(0);
  });
  it("computes margin", () => {
    const m = computeMargin(profile, 100, { sellPrice: 200, marketplaceId: "tr-trendyol" });
    expect(m.commission).toBe(30);
    expect(m.netPerUnit).toBe(70);
    expect(m.marginRate).toBeCloseTo(0.35);
  });
});
