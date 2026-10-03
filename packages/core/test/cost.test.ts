import { computeLandedCost, computeMargin, CostError, dutyRateFor, pickTier, pickTierInfo, taxLineRate, type CountryProfile, type FxTable } from "../src";

const profile: CountryProfile = {
  country: "tr",
  currency: "TRY",
  asOf: "2026-01-01",
  sources: [],
  dutyByHs: { default: 0.1, "8518": 0.0, "6506": 0.027 },
  taxes: [
    { key: "extra-duty", label: "İlave gümrük vergisi", rate: 0.2, base: "cif" },
    { key: "vat", label: "KDV", rate: 0.2, base: "cif+duty+extra" },
  ],
  brokerFee: 1000,
  domesticShippingPerUnit: 10,
  shipping: [
    { key: "air", label: "Hava", mode: "air", perKg: 100, minCharge: 500, transitDays: [7, 12] },
    { key: "express", label: "Kurye", mode: "express", perKg: 200, minCharge: 300, transitDays: [3, 6], brokerFee: 50 },
    { key: "sea", label: "Deniz", mode: "sea", perKg: 10, minCharge: 100, transitDays: [30, 40], perCbm: 5000 },
  ],
  commissions: { "tr-trendyol": 0.15 },
  salesVatRate: 0.2,
  commissionVatRate: 0.2,
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
  it("raises quantities below the MOQ and warns, and refuses empty tiers", () => {
    const info = pickTierInfo([{ minQty: 100, unitPrice: 5 }, { minQty: 500, unitPrice: 4 }], 10);
    expect(info).toEqual({ tier: { minQty: 100, unitPrice: 5 }, belowMoq: true, effectiveQuantity: 100, moq: 100 });
    expect(() => pickTier([], 5)).toThrow(CostError);
    expect(() => computeLandedCost(profile, { quantity: 5, tiers: [], fxRate: 1, unitWeightKg: 1, shippingKey: "air" })).toThrow(CostError);
    const r = computeLandedCost(profile, { quantity: 10, tiers: [{ minQty: 100, unitPrice: 5 }], fxRate: 1, unitWeightKg: 0.1, shippingKey: "air", insuranceRate: 0 });
    expect(r.effectiveQuantity).toBe(100);
    expect(r.moq).toBe(100);
    expect(r.warnings).toContain("MOQ 100: hesap 100 adet için yapıldı");
    expect(r.lines.find((l) => l.key === "goods")!.amount).toBe(500);
    const zero = computeLandedCost(profile, { quantity: 0, tiers: [{ minQty: 1, unitPrice: 5 }], fxRate: 1, unitWeightKg: 0.1, shippingKey: "air" });
    expect(zero.effectiveQuantity).toBe(1);
    expect(zero.warnings).toContain("Adet 1 olarak alındı");
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
    expect(r.cif).toBe(6000);
    expect(r.dutyRate).toBe(0.1);
    expect(r.vatPerUnit).toBeCloseTo(15.6);
    expect(r.landedExVatPerUnit).toBeCloseTo((r.total - 1560) / 100);
    expect(r.fxUsed).toBe(5);
    expect(r.approximate).toBe(false);
  });
  it("insures goods plus freight at 110%", () => {
    const r = computeLandedCost(profile, { quantity: 100, tiers: [{ minQty: 1, unitPrice: 10 }], fxRate: 5, unitWeightKg: 0.1, shippingKey: "air", insuranceRate: 0.01 });
    expect(r.lines.find((l) => l.key === "insurance")!.amount).toBeCloseTo((5000 + 1000) * 1.1 * 0.01);
  });
  it("uses HS-specific duty, matching dotted codes too", () => {
    const r = computeLandedCost(profile, { quantity: 1, tiers: [{ minQty: 1, unitPrice: 100 }], fxRate: 1, unitWeightKg: 1, shippingKey: "air", hsCode: "851830", insuranceRate: 0 });
    expect(r.lines.find((l) => l.key === "duty")!.amount).toBe(0);
    expect(dutyRateFor(profile, "8518.30")).toBe(0);
    expect(dutyRateFor(profile, "6506.10.10")).toBe(0.027);
    expect(dutyRateFor(profile, "4202")).toBe(0.1);
  });
  it("applies origin-specific and HS-specific tax lines", () => {
    const line = { key: "extra-duty", label: "x", rate: 0.2, base: "cif" as const, origins: ["cn"], rateByHs: { "61": 0.3, "85": 0 } };
    expect(taxLineRate(line, {})).toBe(0.2);
    expect(taxLineRate(line, { originCountry: "tr" })).toBeNull();
    expect(taxLineRate(line, { hsCode: "6109.10" })).toBe(0.3);
    expect(taxLineRate(line, { hsCode: "851830" })).toBeNull();
    expect(taxLineRate({ key: "kkdf", label: "k", rate: 0.06, base: "cif", deferredPaymentOnly: true }, {})).toBeNull();
    expect(taxLineRate({ key: "kkdf", label: "k", rate: 0.06, base: "cif", deferredPaymentOnly: true }, { deferredPayment: true })).toBe(0.06);
    expect(taxLineRate({ key: "otv", label: "o", rate: 0, base: "cif", hsPrefixes: ["851713"], rateByHs: { "851713": 0.5 } }, { hsCode: "851713" })).toBe(0.5);
    expect(taxLineRate({ key: "otv", label: "o", rate: 0, base: "cif", hsPrefixes: ["851713"], rateByHs: { "851713": 0.5 } }, { hsCode: "6109" })).toBeNull();
    const p: CountryProfile = { ...profile, taxes: [{ ...line }, { key: "vat", label: "KDV", rate: 0.2, base: "cif+duty+extra" }] };
    const tr = computeLandedCost(p, { quantity: 1, tiers: [{ minQty: 1, unitPrice: 100 }], fxRate: 1, unitWeightKg: 1, shippingKey: "air", insuranceRate: 0, originCountry: "tr" });
    expect(tr.lines.some((l) => l.key === "extra-duty")).toBe(false);
  });
  it("de minimis only on courier consignments and separately for duty and VAT", () => {
    const p: CountryProfile = { ...profile, dutyDeMinimis: 1000 };
    const express = computeLandedCost(p, { quantity: 1, tiers: [{ minQty: 1, unitPrice: 100 }], fxRate: 1, unitWeightKg: 0.1, shippingKey: "express", insuranceRate: 0 });
    expect(express.lines.find((l) => l.key === "duty")!.amount).toBe(0);
    expect(express.lines.find((l) => l.key === "vat")!.amount).toBeGreaterThan(0);
    expect(express.warnings.some((w) => w.includes("eşiğinin altında"))).toBe(true);
    const air = computeLandedCost(p, { quantity: 1, tiers: [{ minQty: 1, unitPrice: 100 }], fxRate: 1, unitWeightKg: 0.1, shippingKey: "air", insuranceRate: 0 });
    expect(air.lines.find((l) => l.key === "duty")!.amount).toBeGreaterThan(0);
    const legacy: CountryProfile = { ...profile, deMinimis: 1000 };
    const both = computeLandedCost(legacy, { quantity: 1, tiers: [{ minQty: 1, unitPrice: 100 }], fxRate: 1, unitWeightKg: 0.1, shippingKey: "express", insuranceRate: 0 });
    expect(both.lines.find((l) => l.key === "vat")).toBeUndefined();
  });
  it("prices volumetric weight on air/express and CBM on sea; mode broker fee overrides", () => {
    const input = { quantity: 10, tiers: [{ minQty: 1, unitPrice: 10 }], fxRate: 1, unitWeightKg: 1, insuranceRate: 0 };
    const air = computeLandedCost(profile, { ...input, shippingKey: "air", unitVolumeM3: 0.012 }); // 12000 cm³ / 6000 = 2 kg volumetric per unit
    expect(air.lines.find((l) => l.key === "freight")!.amount).toBe(100 * 2 * 10);
    expect(air.warnings.some((w) => w.includes("Hacimsel"))).toBe(true);
    const sea = computeLandedCost(profile, { ...input, shippingKey: "sea", unitVolumeM3: 0.1 }); // 1 cbm × 5000 > 10 kg × 10
    expect(sea.lines.find((l) => l.key === "freight")!.amount).toBe(5000);
    const noVol = computeLandedCost(profile, { ...input, shippingKey: "air" });
    expect(noVol.lines.find((l) => l.key === "freight")!.amount).toBe(1000);
    const express = computeLandedCost(profile, { ...input, shippingKey: "express" });
    expect(express.lines.find((l) => l.key === "broker")!.amount).toBe(50);
  });
  it("derives the rate from a dated fx table and records it", () => {
    const table: FxTable = { asOf: "2026-09-30", base: "USD", rates: { TRY: 40, CNY: 8 } };
    const r = computeLandedCost(profile, { quantity: 1, tiers: [{ minQty: 1, unitPrice: 8 }], fx: { listingCurrency: "CNY", table }, unitWeightKg: 0.1, shippingKey: "air", insuranceRate: 0 });
    expect(r.fxUsed).toBe(5);
    expect(r.fxAsOf).toBe("2026-09-30");
    expect(r.lines.find((l) => l.key === "goods")!.amount).toBe(40);
    expect(() => computeLandedCost(profile, { quantity: 1, tiers: [{ minQty: 1, unitPrice: 8 }], fx: { listingCurrency: "XXX", table }, unitWeightKg: 0.1, shippingKey: "air" })).toThrow(CostError);
    expect(() => computeLandedCost(profile, { quantity: 1, tiers: [{ minQty: 1, unitPrice: 8 }], unitWeightKg: 0.1, shippingKey: "air" })).toThrow(CostError);
  });
  it("divides pack prices and flags approximate lines", () => {
    const r = computeLandedCost({ ...profile, dutyApproximate: true }, { quantity: 10, tiers: [{ minQty: 1, unitPrice: 50 }], fxRate: 1, unitWeightKg: 0.1, shippingKey: "air", packQty: 10, insuranceRate: 0 });
    expect(r.lines.find((l) => l.key === "goods")!.amount).toBe(50);
    expect(r.approximate).toBe(true);
    expect(r.lines.find((l) => l.key === "duty")!.approximate).toBe(true);
  });
});

describe("margin", () => {
  it("keeps the simple path when the profile has no VAT configured", () => {
    const m = computeMargin({ ...profile, salesVatRate: 0, commissionVatRate: 0 }, 100, { sellPrice: 200, marketplaceId: "tr-trendyol" });
    expect(m.commission).toBe(30);
    expect(m.netPerUnit).toBe(70);
    expect(m.marginRate).toBeCloseTo(0.35);
  });
  it("worked Turkish example: VAT-inclusive price, commission KDV, recoverable import VAT", () => {
    // Sell 240 TRY incl. 20% KDV → net 200. Commission 15% of 240 = 36 (its KDV is recoverable for a registered seller).
    // Landed 100/unit of which 12 is import KDV → 88 ex VAT. Net = 200 − 36 − 88 = 76.
    const landed = { perUnit: 100, vatPerUnit: 12 } as unknown as Parameters<typeof computeMargin>[1];
    const m = computeMargin(profile, landed, { sellPrice: 240, marketplaceId: "tr-trendyol" });
    expect(m.lines.netPrice).toBeCloseTo(200);
    expect(m.lines.outputVat).toBeCloseTo(40);
    expect(m.commission).toBeCloseTo(36);
    expect(m.lines.landedExVat).toBeCloseTo(88);
    expect(m.netPerUnit).toBeCloseTo(76);
    expect(m.marginRate).toBeCloseTo(76 / 240);
    // Not registered: VAT stays in the price and in the landed cost, commission KDV is a cost.
    const u = computeMargin(profile, landed, { sellPrice: 240, marketplaceId: "tr-trendyol", vatRegistered: false });
    expect(u.lines.netPrice).toBe(240);
    expect(u.lines.commissionVat).toBeCloseTo(7.2);
    expect(u.netPerUnit).toBeCloseTo(240 - 36 - 7.2 - 100);
  });
  it("uses category commissions, fixed fees and explicit overrides", () => {
    const p: CountryProfile = { ...profile, commissionsByGroup: { "tr-trendyol": { electronics: 0.1 } } };
    expect(computeMargin(p, 0, { sellPrice: 100, marketplaceId: "tr-trendyol", groupKey: "electronics", sellPriceIncludesVat: false }).commissionRate).toBe(0.1);
    expect(computeMargin(p, 0, { sellPrice: 100, marketplaceId: "tr-trendyol", groupKey: "shoes", sellPriceIncludesVat: false }).commissionRate).toBe(0.15);
    expect(computeMargin(p, 0, { sellPrice: 100, marketplaceId: "tr-trendyol", commissionRate: 0.05, sellPriceIncludesVat: false }).commission).toBe(5);
    const f = computeMargin(p, 0, { sellPrice: 100, marketplaceId: "tr-trendyol", fixedFeePerOrder: 9, sellPriceIncludesVat: false });
    expect(f.lines.fees).toBe(9);
    expect(f.netPerUnit).toBe(100 - 15 - 9);
  });
});
