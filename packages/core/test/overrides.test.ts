import { applyCountryOverrides, computeLandedCost, computeMargin, dutyRateFor, hasCountryOverrides, referenceOverrides, sanitizeCountryOverrides, taxLineRate, type CountryProfile } from "../src";

const profile: CountryProfile = {
  country: "tr",
  currency: "TRY",
  asOf: "2026-01-01",
  sources: ["ref"],
  dutyByHs: { default: 0.1, "8518": 0.0 },
  taxes: [
    { key: "extra-duty", label: "İlave gümrük vergisi", rate: 0.2, base: "cif" },
    { key: "vat", label: "KDV", rate: 0.2, base: "cif+duty+extra", rateByHs: { "61": 0.1 } },
  ],
  brokerFee: 1000,
  domesticShippingPerUnit: 10,
  shipping: [
    { key: "air", label: "Hava", mode: "air", perKg: 100, minCharge: 500, transitDays: [7, 12] },
    { key: "express", label: "Kurye", mode: "express", perKg: 200, minCharge: 300, transitDays: [3, 6], brokerFee: 50 },
  ],
  commissions: { "tr-trendyol": 0.15, "tr-n11": 0.12 },
  commissionsByGroup: { "tr-trendyol": { electronics: 0.1 }, "tr-n11": { electronics: 0.08 } },
  salesVatRate: 0.2,
  commissionVatRate: 0.2,
};

describe("country overrides", () => {
  it("sanitizes: rates in [0,1), amounts ≥ 0, empty maps dropped", () => {
    expect(sanitizeCountryOverrides(undefined)).toEqual({});
    expect(sanitizeCountryOverrides({ vatRate: 1.2, dutyDefaultRate: -0.1, brokerFee: Number.NaN, commissions: {}, shippingKey: "  " })).toEqual({});
    expect(sanitizeCountryOverrides({ vatRate: 0.18, dutyDefaultRate: 0, brokerFee: 0, domesticShippingPerUnit: 25, commissions: { "tr-trendyol": 0.2, bad: 2 }, shippingKey: " sea " })).toEqual({
      vatRate: 0.18,
      dutyDefaultRate: 0,
      brokerFee: 0,
      domesticShippingPerUnit: 25,
      commissions: { "tr-trendyol": 0.2 },
      shippingKey: "sea",
    });
    expect(hasCountryOverrides({ shippingKey: "sea" })).toBe(false);
    expect(hasCountryOverrides({ vatRate: 0.1 })).toBe(true);
  });
  it("returns the same profile when nothing applies and never mutates the reference", () => {
    expect(applyCountryOverrides(profile, {})).toBe(profile);
    expect(applyCountryOverrides(profile, { shippingKey: "air" })).toBe(profile);
    const before = JSON.stringify(profile);
    applyCountryOverrides(profile, { vatRate: 0.1, dutyDefaultRate: 0.05, commissions: { "tr-trendyol": 0.2 }, brokerFee: 1, domesticShippingPerUnit: 2 });
    expect(JSON.stringify(profile)).toBe(before);
  });
  it("applies KDV uniformly, replaces the default duty and keeps HS-specific duties", () => {
    const p = applyCountryOverrides(profile, { vatRate: 0.1, dutyDefaultRate: 0.05 });
    const vat = p.taxes.find((t) => t.key === "vat")!;
    expect(vat.rate).toBe(0.1);
    expect(vat.rateByHs).toBeUndefined();
    expect(taxLineRate(vat, { hsCode: "6109" })).toBe(0.1);
    expect(taxLineRate(vat, { hsCode: "8518" })).toBe(0.1);
    expect(p.salesVatRate).toBe(0.1);
    expect(dutyRateFor(p, "999999")).toBe(0.05);
    expect(dutyRateFor(p, "851830")).toBe(0);
    expect(p.sources).toContain("user");
    // Other lines are untouched.
    expect(p.taxes[0]).toEqual(profile.taxes[0]);
  });
  it("commission override wins over the category table, other marketplaces keep theirs", () => {
    const p = applyCountryOverrides(profile, { commissions: { "tr-trendyol": 0.25 } });
    expect(computeMargin(p, 100, { sellPrice: 300, marketplaceId: "tr-trendyol", groupKey: "electronics" }).commissionRate).toBe(0.25);
    expect(computeMargin(p, 100, { sellPrice: 300, marketplaceId: "tr-n11", groupKey: "electronics" }).commissionRate).toBe(0.08);
    expect(computeMargin(profile, 100, { sellPrice: 300, marketplaceId: "tr-trendyol", groupKey: "electronics" }).commissionRate).toBe(0.1);
  });
  it("broker fee and domestic shipping flow into the landed cost", () => {
    const input = { quantity: 100, tiers: [{ minQty: 1, unitPrice: 2 }], fxRate: 1, unitWeightKg: 0.2, shippingKey: "express" };
    const ref = computeLandedCost(profile, input);
    const p = applyCountryOverrides(profile, { brokerFee: 500, domesticShippingPerUnit: 0 });
    const mine = computeLandedCost(p, input);
    expect(mine.lines.find((l) => l.key === "broker")!.amount).toBe(500);
    expect(ref.lines.find((l) => l.key === "broker")!.amount).toBe(50);
    expect(mine.lines.find((l) => l.key === "domestic")!.amount).toBe(0);
    expect(ref.lines.find((l) => l.key === "domestic")!.amount).toBe(1000);
    // Shipping options without their own broker fee keep inheriting the profile fee.
    expect(computeLandedCost(p, { ...input, shippingKey: "air" }).lines.find((l) => l.key === "broker")!.amount).toBe(500);
  });
  it("referenceOverrides mirrors the dated figures", () => {
    expect(referenceOverrides(profile)).toEqual({ vatRate: 0.2, dutyDefaultRate: 0.1, commissions: { "tr-trendyol": 0.15, "tr-n11": 0.12 }, brokerFee: 1000, domesticShippingPerUnit: 10 });
  });
});
