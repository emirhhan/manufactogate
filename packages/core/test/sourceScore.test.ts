import { DEFAULT_SOURCE_WEIGHTS, explainSourceScore, normalizeSourceWeights, rankSources, scoreSource, unitPriceAtQuantity, type RawListing } from "../src";

const l = (id: string, extra: Partial<RawListing> = {}): RawListing => ({
  market: "cn-1688",
  id,
  url: "",
  title: "x",
  images: [],
  price: { currency: "CNY", tiers: [{ minQty: 1, unitPrice: 10 }] },
  badges: [],
  fetchedAt: "2026-01-01T00:00:00Z",
  ...extra,
});
const factor = (r: ReturnType<typeof scoreSource>, k: string) => r.factors.find((f) => f.factor === k)!;

describe("normalizeSourceWeights", () => {
  it("rescales to a sum of 1 and drops negatives / NaN", () => {
    const w = normalizeSourceWeights({ match: 2, price: 2, moq: -1, supplier: Number.NaN, shipping: 0 });
    expect(w).toEqual({ match: 0.5, price: 0.5, moq: 0, supplier: 0, shipping: 0 });
  });
  it("falls back to the defaults when every weight is zero or missing", () => {
    expect(normalizeSourceWeights({})).toEqual(DEFAULT_SOURCE_WEIGHTS);
    expect(normalizeSourceWeights(undefined)).toEqual(DEFAULT_SOURCE_WEIGHTS);
    expect(normalizeSourceWeights({ match: 0, price: 0, moq: 0, supplier: 0, shipping: 0 })).toEqual(DEFAULT_SOURCE_WEIGHTS);
    const sum = Object.values(DEFAULT_SOURCE_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1);
  });
});

describe("unitPriceAtQuantity", () => {
  const tiers = { currency: "CNY", tiers: [{ minQty: 100, unitPrice: 10 }, { minQty: 500, unitPrice: 9 }, { minQty: 1000, unitPrice: 8 }] };
  it("picks the highest tier reached by the quantity and normalises packs", () => {
    expect(unitPriceAtQuantity({ price: tiers }, 50)).toBe(10);
    expect(unitPriceAtQuantity({ price: tiers }, 500)).toBe(9);
    expect(unitPriceAtQuantity({ price: tiers }, 5000)).toBe(8);
    expect(unitPriceAtQuantity({ price: tiers, packQty: 2 }, 5000)).toBe(4);
    expect(unitPriceAtQuantity({ price: tiers })).toBe(8);
    expect(unitPriceAtQuantity({ price: { currency: "CNY", tiers: [] } }, 10)).toBeNull();
  });
});

describe("scoreSource", () => {
  it("weights the five factors and explains each in Turkish", () => {
    const listing = l("a", { moq: 100, supplierName: "东莞市某某实业有限公司", location: "广东 东莞", shipFrom: "cn", supplier: { years: 8, verified: true, rating: 4.9, ratingCount: 320 } });
    const r = scoreSource(listing, { matchScore: 0.92, quantity: 500, priceRef: { min: 10, median: 14 }, targetCountry: "tr", shippingDays: 12 }, DEFAULT_SOURCE_WEIGHTS);
    expect(r.score).toBeGreaterThan(0.8);
    expect(r.factors.map((f) => f.factor)).toEqual(["match", "price", "moq", "supplier", "shipping"]);
    expect(factor(r, "match")).toMatchObject({ value: 0.92, weight: 0.35, note: "aynı ürün" });
    expect(factor(r, "price")).toMatchObject({ value: 1, note: "kümedeki en düşük fiyat" });
    expect(factor(r, "moq")).toMatchObject({ value: 1, note: "MOQ 100 ≤ istenen 500 adet" });
    expect(factor(r, "supplier").value).toBeGreaterThan(0.75);
    expect(factor(r, "supplier").note).toContain("doğrulanmış");
    expect(factor(r, "supplier").note).toContain("8 yıl");
    expect(factor(r, "shipping").note).toBe("CN → TR, ~12 gün");
    expect(r.factors.reduce((s, f) => s + f.contribution, 0)).toBeCloseTo(r.score, 2);
    const ex = explainSourceScore(r);
    expect(ex[0]!.factor).toBe("match");
    expect(ex[0]!.text).toBe("Eşleşme güveni %92 × ağırlık %35 → +32 puan (aynı ürün)");
    expect(ex.map((e) => e.label)).toEqual(expect.arrayContaining(["Birim fiyat", "MOQ uyumu", "Tedarikçi güveni", "Kargo ve teslimat"]));
    expect(ex.reduce((s, e) => s + e.points, 0)).toBeGreaterThanOrEqual(Math.round(r.score * 100) - 3);
  });
  it("price factor compares against the cluster minimum and punishes far-above-median offers", () => {
    const cheap = scoreSource(l("a"), { priceRef: { min: 10, median: 12 } });
    const pricey = scoreSource(l("b", { price: { currency: "CNY", tiers: [{ minQty: 1, unitPrice: 20 }] } }), { priceRef: { min: 10, median: 12 } });
    expect(factor(cheap, "price").value).toBe(1);
    expect(factor(pricey, "price").value).toBeLessThanOrEqual(0.4);
    expect(factor(pricey, "price").note).toBe("en düşük fiyatın %100 üstünde, medyanın çok üstünde");
    const quote = scoreSource(l("c", { price: { currency: "USD", tiers: [] }, priceOnRequest: true }), { priceRef: { min: 10 } });
    expect(factor(quote, "price")).toMatchObject({ value: 0.3, note: "fiyat teklifle alınır" });
    const noRef = scoreSource(l("d"), {});
    expect(factor(noRef, "price")).toMatchObject({ value: 0.6, note: "karşılaştırma fiyatı yok" });
  });
  it("converts to the reference currency when a converter is given, and reports unknown rates", () => {
    const usd = l("a", { price: { currency: "USD", tiers: [{ minQty: 1, unitPrice: 2 }] } });
    const r = scoreSource(usd, { priceRef: { min: 10 }, toCommon: (amt, cur) => (cur === "USD" ? amt * 7 : null) });
    expect(factor(r, "price").note).toBe("en düşük fiyatın %40 üstünde");
    const unknown = scoreSource(l("b", { price: { currency: "XXX", tiers: [{ minQty: 1, unitPrice: 2 }] } }), { priceRef: { min: 10 }, toCommon: () => null });
    expect(factor(unknown, "price")).toMatchObject({ value: 0.5, note: "XXX kuru bilinmiyor" });
  });
  it("moq factor scales with the requested quantity", () => {
    expect(factor(scoreSource(l("a", { moq: 1000 }), { quantity: 250 }), "moq")).toMatchObject({ value: 0.25, note: "MOQ 1000 > istenen 250 adet" });
    expect(factor(scoreSource(l("b"), {}), "moq")).toMatchObject({ value: 0.8, note: "MOQ belirtilmemiş" });
    expect(factor(scoreSource(l("c", { moq: 2000 }), {}), "moq")).toMatchObject({ value: 0.4, note: "MOQ 2000, yüksek" });
    expect(factor(scoreSource(l("d", { moq: 1 }), {}), "moq").value).toBe(1);
  });
  it("shipping factor: domestic beats cross-border, badges add, unknown is neutral", () => {
    const domestic = factor(scoreSource(l("a", { market: "tr-trendyol" }), { targetCountry: "tr" }), "shipping");
    expect(domestic).toMatchObject({ value: 1, note: "yurt içi gönderim" });
    const eu = factor(scoreSource(l("b", { market: "de-amazon" }), { targetCountry: "nl" }), "shipping");
    expect(eu).toMatchObject({ value: 0.85, note: "AB içi gönderim" });
    const far = factor(scoreSource(l("c", { shipFrom: "cn" }), { targetCountry: "de", badges: ["fast-shipping", "cross-border-ready"] }), "shipping");
    expect(far.value).toBeCloseTo(0.7);
    expect(far.note).toBe("CN → DE, hızlı kargo rozeti, sınır ötesi hazır");
    const unknown = factor(scoreSource(l("d", { market: "cn-1688" }), {}), "shipping");
    expect(unknown).toMatchObject({ value: 0.5, note: "kargo bilgisi yok" });
    expect(factor(scoreSource(l("e"), { shippingDays: 40 }), "shipping")).toMatchObject({ value: 0.45, note: "~40 gün" });
  });
  it("supplier factor reads card signals, badges, profile and a precomputed trace", () => {
    const weak = factor(scoreSource(l("a", { supplierName: "义乌市某某商贸有限公司" }), {}), "supplier");
    expect(weak.value).toBeLessThan(0.3);
    expect(weak.note).toContain("muhtemel aracı");
    const strong = factor(scoreSource(l("b", { supplierName: "深圳某某实业有限公司", supplier: { years: 12, rating: 98, ratingCount: 1000 }, ratingMax: 100 }), { badges: ["verified-factory"], supplier: { market: "cn-1688", id: "s", url: "", name: "x", badges: [], repeatPurchaseRate: 0.45 } }), "supplier");
    expect(strong.value).toBeGreaterThan(0.9);
    expect(strong.note).toBe("muhtemel üretici, doğrulanmış, 12 yıl, puan 4.9, yüksek tekrar alım");
    const given = factor(scoreSource(l("c"), { trace: { factory: 1, reasons: [] } }), "supplier");
    expect(given.value).toBe(0.5);
  });
  it("weights change the ranking; zero weight removes a factor", () => {
    const cheapTrader = { listing: l("t", { supplierName: "义乌市某某商贸有限公司", price: { currency: "CNY", tiers: [{ minQty: 1, unitPrice: 10 }] } }), ctx: { matchScore: 0.9, priceRef: { min: 10 } } };
    const pricierFactory = { listing: l("f", { supplierName: "东莞市某某实业有限公司", moq: 100, price: { currency: "CNY", tiers: [{ minQty: 100, unitPrice: 13 }, { minQty: 500, unitPrice: 12 }, { minQty: 1000, unitPrice: 11 }] }, supplier: { verified: true, years: 10 } }), ctx: { matchScore: 0.9, priceRef: { min: 10 }, badges: ["verified-factory"] as const } };
    const byPrice = rankSources([pricierFactory, cheapTrader], { match: 0, price: 1, moq: 0, supplier: 0, shipping: 0 });
    expect(byPrice.map((r) => r.item.listing.id)).toEqual(["t", "f"]);
    expect(byPrice[0]!.result.factors.find((f) => f.factor === "supplier")!.weight).toBe(0);
    const bySupplier = rankSources([cheapTrader, pricierFactory], { match: 0, price: 0, moq: 0, supplier: 1, shipping: 0 });
    expect(bySupplier.map((r) => r.item.listing.id)).toEqual(["f", "t"]);
    expect(bySupplier[0]!.result.score).toBeGreaterThan(bySupplier[1]!.result.score);
  });
  it("match factor without a score is neutral", () => {
    expect(factor(scoreSource(l("a")), "match")).toMatchObject({ value: 0.5, note: "eşleşme skoru yok" });
    expect(factor(scoreSource(l("a"), { matchScore: 0.7 }), "match").note).toBe("büyük olasılıkla aynı");
  });
});
