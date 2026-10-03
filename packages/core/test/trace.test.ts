import { rankManufacturers, traceScore, type RawListing, type RawSupplier, type ScoredListing } from "../src";

const l = (id: string, supplierName: string, price: number, extra: Partial<RawListing> = {}): RawListing => ({
  market: "cn-1688",
  id,
  url: "",
  title: "x",
  images: [],
  price: { currency: "CNY", tiers: [{ minQty: 1, unitPrice: price }] },
  supplierName,
  badges: [],
  fetchedAt: "2026-01-01T00:00:00Z",
  ...extra,
});

describe("traceScore", () => {
  it("rewards factory signals and penalises trader names", () => {
    const f = traceScore(l("a", "东莞市某某实业有限公司", 10, { moq: 100, location: "广东 东莞", price: { currency: "CNY", tiers: [{ minQty: 100, unitPrice: 10 }, { minQty: 500, unitPrice: 9 }, { minQty: 1000, unitPrice: 8 }] } }), ["verified-factory", "deep-factory-audit"]);
    expect(f.factory).toBeGreaterThanOrEqual(0.9);
    expect(f.reasons).toEqual(expect.arrayContaining(["kaynak fabrika etiketi", "yerinde denetim", "firma adı üretim gösteriyor", "yüksek MOQ", "kademeli fiyat", "üretim bölgesinde"]));
    const t = traceScore(l("b", "义乌市某某商贸有限公司", 15));
    expect(t.factory).toBeLessThan(0.3);
    expect(t.reasons).toContain("firma adı ticaret gösteriyor");
  });
  it("uses supplier profile data and cluster price context", () => {
    const sup: RawSupplier = { market: "cn-1688", id: "s", url: "", name: "x", badges: [], yearsOnPlatform: 8, repeatPurchaseRate: 0.4, businessType: "factory" };
    const r = traceScore(l("a", "Shenzhen Tech Co", 10), [], sup, { clusterMinPrice: 10, clusterMedianPrice: 14 });
    expect(r.reasons).toEqual(expect.arrayContaining(["işletme türü: üretici", "5+ yıl platformda", "yüksek tekrar alım oranı", "kümedeki en düşük fiyat bandında"]));
    expect(r.factory).toBeGreaterThan(0.7);
    const trading = traceScore(l("b", "x", 30), [], { ...sup, businessType: "trading", yearsOnPlatform: 1, repeatPurchaseRate: 0 }, { clusterMinPrice: 10, clusterMedianPrice: 14 });
    expect(trading.reasons).toContain("küme medyanının çok üstünde");
    expect(trading.factory).toBeLessThan(0.3);
  });
});

describe("rankManufacturers", () => {
  const member = (listing: RawListing): ScoredListing => ({ listing, fingerprint: {}, match: { score: 0.9, signals: {}, reasons: [] }, band: "same" });
  it("orders by factory score then price and flags the likely manufacturer", () => {
    const cluster = {
      members: [
        member(l("t", "义乌某某贸易有限公司", 9.5)),
        member(l("f", "东莞某某实业有限公司", 10, { moq: 100, price: { currency: "CNY", tiers: [{ minQty: 100, unitPrice: 10 }, { minQty: 500, unitPrice: 9.6 }, { minQty: 1000, unitPrice: 9.5 }] } })),
        member(l("x", "Some Shop", 20)),
      ],
    };
    const ranked = rankManufacturers(cluster, { badges: (li) => (li.id === "f" ? ["verified-factory"] : []) });
    expect(ranked.map((r) => r.member.listing.id)).toEqual(["f", "t", "x"]);
    expect(ranked[0]!.likelyManufacturer).toBe(true);
    expect(ranked[1]!.likelyManufacturer).toBe(false);
  });
  it("does not flag a factory-looking seller priced far above the cluster", () => {
    const cluster = { members: [member(l("f", "东莞某某实业有限公司", 20)), member(l("t", "Shop", 10))] };
    const ranked = rankManufacturers(cluster, { badges: (li) => (li.id === "f" ? ["verified-factory"] : []) });
    expect(ranked[0]!.member.listing.id).toBe("f");
    expect(ranked[0]!.likelyManufacturer).toBe(false);
  });
});
