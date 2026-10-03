import { compareStorefronts, foldLocation, foldSupplierName, identityOf, locationAgreement, mergeSuppliers, nameRelation, storefrontsOf, type RawListing } from "../src";

const l = (market: string, id: string, title: string, extra: Partial<RawListing> = {}): RawListing => ({
  market: market as RawListing["market"],
  id,
  url: `https://example/${market}/${id}`,
  title,
  images: [],
  price: { currency: market.startsWith("cn-") && market !== "cn-alibaba" && market !== "cn-aliexpress" && market !== "cn-madeinchina" ? "CNY" : "USD", tiers: [{ minQty: 1, unitPrice: 10 }] },
  badges: [],
  fetchedAt: "2026-01-01T00:00:00Z",
  ...extra,
});

describe("foldSupplierName", () => {
  it("strips Chinese city prefix, legal form and industry words", () => {
    const f = foldSupplierName("深圳市奥鑫科技有限公司");
    expect(f.cjk).toBe("奥鑫");
    expect(f.core).toBe("奥鑫");
    expect(f.placeKey).toBe("shenzhen");
    expect(foldSupplierName("广东省东莞市宏达塑料制品厂").cjk).toBe("宏达");
    expect(foldSupplierName("奥鑫科技旗舰店").core).toBe("奥鑫");
    expect(foldSupplierName("义乌市某某商贸有限公司").placeKey).toBe("yiwu");
  });
  it("strips latin legal forms, store suffixes and places, keeps the brand token", () => {
    expect(foldSupplierName("Shenzhen Aoxin Technology Co., Ltd.")).toMatchObject({ core: "aoxin", tokens: ["aoxin"], placeKey: "shenzhen" });
    expect(foldSupplierName("AOXIN Official Store").core).toBe("aoxin");
    expect(foldSupplierName("Dongguan Hongda Plastic Products Co Ltd").tokens).toEqual(["hongda"]);
    expect(foldSupplierName("Yiwu Mingrui Trading Company Limited").tokens).toEqual(["mingrui"]);
  });
  it("handles Turkish company forms", () => {
    expect(foldSupplierName("Yıldız Tekstil San. ve Tic. Ltd. Şti.").tokens).toEqual(["yildiz"]);
    expect(foldSupplierName("Yıldız Tekstil A.Ş.").tokens).toEqual(["yildiz"]);
    expect(foldSupplierName("Yıldız Mağazası").core).toBe("yildiz");
  });
  it("does not eat letters inside words", () => {
    expect(foldSupplierName("Texas Instruments Inc.").tokens).toEqual(["texas", "instruments"]);
    expect(foldSupplierName("Costco Wholesale").tokens).toEqual(["costco", "wholesale"]);
  });
  it("returns an empty core for an empty name", () => {
    expect(foldSupplierName("  ")).toEqual({ core: "", tokens: [], cjk: "" });
  });
});

describe("foldLocation / locationAgreement", () => {
  it("reads Chinese and pinyin locations into the same keys", () => {
    expect(foldLocation("广东 深圳")).toMatchObject({ city: "shenzhen", province: "guangdong" });
    expect(foldLocation("Shenzhen, Guangdong, China")).toMatchObject({ city: "shenzhen", province: "guangdong" });
    expect(foldLocation("Guangdong, China")).toMatchObject({ province: "guangdong" });
    expect(foldLocation("Guangdong, China").city).toBeUndefined();
    expect(foldLocation("İstanbul / Türkiye")).toMatchObject({ city: "istanbul", province: "turkiye" });
    expect(foldLocation("浙江省金华市义乌市")).toMatchObject({ city: "yiwu", province: "zhejiang" });
    expect(foldLocation("Yiwu, Jinhua, Zhejiang, China")).toMatchObject({ city: "yiwu", province: "zhejiang" });
    expect(foldLocation("Mars Colony")).toEqual({ raw: "Mars Colony" });
  });
  it("agrees at city, province, conflict or unknown", () => {
    expect(locationAgreement(foldLocation("广东 深圳"), foldLocation("Shenzhen, China"))).toBe("city");
    expect(locationAgreement(foldLocation("Guangdong"), foldLocation("广东 东莞"))).toBe("province");
    expect(locationAgreement(foldLocation("广东 深圳"), foldLocation("Dongguan, Guangdong"))).toBe("conflict");
    expect(locationAgreement(foldLocation("Zhejiang"), foldLocation("广东 深圳"))).toBe("conflict");
    expect(locationAgreement(undefined, foldLocation("广东 深圳"))).toBe("unknown");
    expect(locationAgreement(foldLocation("somewhere"), foldLocation("广东 深圳"))).toBe("unknown");
  });
});

describe("nameRelation", () => {
  const n = (a: string, b: string) => nameRelation(foldSupplierName(a), foldSupplierName(b));
  it("exact across storefront suffixes and legal forms", () => {
    expect(n("Shenzhen Aoxin Technology Co., Ltd.", "AOXIN Official Store")).toBe("exact");
    expect(n("深圳市奥鑫科技有限公司", "奥鑫科技旗舰店")).toBe("exact");
    expect(n("深圳市奥鑫科技有限公司", "AOXIN 奥鑫 Store")).toBe("exact");
  });
  it("partial when one distinctive word is shared, none otherwise", () => {
    expect(n("Shenzhen Aoxin Electronics Co., Ltd.", "Aoxin Mingda Trading Co., Ltd.")).toBe("partial");
    expect(n("Shenzhen Aoxin Technology Co., Ltd.", "Shenzhen Mingda Technology Co., Ltd.")).toBe("none");
    expect(n("义乌市某某商贸有限公司", "义乌市另一商贸有限公司")).toBe("none");
    expect(n("", "Aoxin")).toBe("none");
  });
});

describe("mergeSuppliers", () => {
  const sameFactory = [
    l("cn-1688", "a1", "奥鑫 TWS-X15 真无线蓝牙耳机 工厂直销", { supplierId: "s-1688-1", supplierName: "深圳市奥鑫科技有限公司", location: "广东 深圳", price: { currency: "CNY", tiers: [{ minQty: 100, unitPrice: 28 }] } }),
    l("cn-1688", "a2", "奥鑫 TWS-X20 降噪蓝牙耳机 现货", { supplierId: "s-1688-1", supplierName: "深圳市奥鑫科技有限公司", location: "广东 深圳", price: { currency: "CNY", tiers: [{ minQty: 100, unitPrice: 36 }] } }),
    l("cn-alibaba", "b1", "Aoxin TWS-X15 True Wireless Earbuds Bluetooth 5.3 OEM", { supplierId: "s-ali-9", supplierName: "Shenzhen Aoxin Technology Co., Ltd.", location: "Guangdong, China", price: { currency: "USD", tiers: [{ minQty: 50, unitPrice: 4.2 }] } }),
    l("cn-alibaba", "b2", "Aoxin TWS-X20 ANC Earbuds OEM ODM", { supplierId: "s-ali-9", supplierName: "Shenzhen Aoxin Technology Co., Ltd.", location: "Guangdong, China", price: { currency: "USD", tiers: [{ minQty: 50, unitPrice: 5.6 }] } }),
    l("cn-aliexpress", "c1", "AOXIN TWS-X15 Earbuds ENC Low Latency", { supplierId: "store-77", supplierName: "AOXIN Official Store", price: { currency: "USD", tiers: [{ minQty: 1, unitPrice: 9.9 }] } }),
    l("cn-madeinchina", "d1", "TWS-X15 Wireless Earphone with Charging Case", { supplierName: "Shenzhen Aoxin Technology Co., Ltd.", location: "Shenzhen, Guangdong", price: { currency: "USD", tiers: [{ minQty: 500, unitPrice: 3.9 }] } }),
  ];
  it("merges one factory's storefronts across 1688 / Alibaba / AliExpress / Made-in-China", () => {
    const ids = mergeSuppliers(sameFactory);
    expect(ids).toHaveLength(1);
    const id = ids[0]!;
    expect(id.markets.sort()).toEqual(["cn-1688", "cn-alibaba", "cn-aliexpress", "cn-madeinchina"]);
    expect(id.names).toEqual(expect.arrayContaining(["深圳市奥鑫科技有限公司", "Shenzhen Aoxin Technology Co., Ltd.", "AOXIN Official Store"]));
    expect(id.listingKeys).toHaveLength(6);
    expect(id.locations).toContain("shenzhen");
    expect(id.priceSpan["USD"]).toEqual({ min: 3.9, max: 9.9 });
    expect(id.priceSpan["CNY"]).toEqual({ min: 28, max: 36 });
    expect(id.merges.length).toBeGreaterThanOrEqual(3);
    expect(id.confidence).toBeGreaterThanOrEqual(0.6);
    expect(id.merges.some((m) => m.reasons.some((r) => r.startsWith("mağaza adı aynı")))).toBe(true);
    expect(id.merges.some((m) => m.reasons.some((r) => r.startsWith("ortak model numarası (TWS-X15, TWS-X20), farklı pazarlarda")))).toBe(true);
    // The Chinese-script 1688 shop joined through shared models + city, not through its name.
    const cross = id.merges.find((m) => m.pair.includes("cn-1688:s-1688-1"))!;
    expect(cross.reasons.some((r) => r.startsWith("mağaza adı"))).toBe(false);
    expect(cross.reasons).toContain("konum aynı (shenzhen)");
    expect(id.bestTrace.reasons).toContain("firma adı üretim gösteriyor");
    expect(identityOf(ids, { market: "cn-aliexpress", id: "c1" })?.key).toBe(id.key);
  });
  it("merges a Chinese-script 1688 shop with its English Alibaba storefront through shared models and city", () => {
    const ids = mergeSuppliers([
      l("cn-1688", "a", "宏达 HD-2200 不锈钢保温杯 500ml", { supplierName: "东莞市宏达实业有限公司", location: "广东 东莞" }),
      l("cn-1688", "a2", "宏达 HD-2300 保温壶 1L", { supplierName: "东莞市宏达实业有限公司", location: "广东 东莞" }),
      l("cn-alibaba", "b", "HD-2200 Stainless Steel Vacuum Flask 500ml OEM", { supplierName: "Dongguan Hongda Industrial Co., Ltd.", location: "Guangdong, China" }),
      l("cn-alibaba", "b2", "HD-2300 Vacuum Jug 1L Custom Logo", { supplierName: "Dongguan Hongda Industrial Co., Ltd.", location: "Guangdong, China" }),
    ]);
    expect(ids).toHaveLength(1);
    const m = ids[0]!.merges[0]!;
    expect(m.reasons).toEqual(expect.arrayContaining([expect.stringContaining("ortak model numarası (HD-2200, HD-2300), farklı pazarlarda"), "konum aynı (dongguan)"]));
    expect(m.confidence).toBeGreaterThanOrEqual(0.6);
  });
  it("keeps two companies in the same city apart", () => {
    const ids = mergeSuppliers([
      l("cn-1688", "a", "TWS-X15 蓝牙耳机", { supplierName: "深圳市奥鑫科技有限公司", location: "广东 深圳" }),
      l("cn-1688", "b", "BT-900 蓝牙音箱", { supplierName: "深圳市明达电子有限公司", location: "广东 深圳" }),
      l("cn-alibaba", "c", "Shenzhen Mingda BT-900 Speaker", { supplierName: "Shenzhen Mingda Electronics Co., Ltd.", location: "Shenzhen, Guangdong" }),
      l("cn-alibaba", "d", "Portable Speaker BT-901", { supplierName: "Shenzhen Kaida Electronics Co., Ltd.", location: "Shenzhen, Guangdong" }),
    ]);
    const keys = ids.map((i) => i.names.sort().join("|")).sort();
    expect(keys).toEqual(["Shenzhen Kaida Electronics Co., Ltd.", "Shenzhen Mingda Electronics Co., Ltd.", "深圳市明达电子有限公司", "深圳市奥鑫科技有限公司"].sort());
  });
  it("does not merge on a single shared model across markets without a name link", () => {
    const ids = mergeSuppliers([
      l("cn-1688", "a", "Redmi Buds 4 Pro 无线耳机", { supplierName: "深圳市甲科技有限公司", location: "广东 深圳" }),
      l("cn-aliexpress", "b", "Xiaomi Redmi Buds 4 Pro TWS", { supplierName: "Shenzhen Yi Trading Co., Ltd.", location: "Shenzhen, China" }),
    ]);
    expect(ids).toHaveLength(2);
    expect(ids.every((i) => i.merges.length === 0 && i.confidence === 1)).toBe(true);
  });
  it("same name in different cities is not merged, with the conflict reported in the evidence", () => {
    const fronts = storefrontsOf([
      l("cn-alibaba", "a", "Mug", { supplierName: "Hongda Trading Co., Ltd.", location: "Yiwu, Zhejiang" }),
      l("cn-madeinchina", "b", "Mug", { supplierName: "Hongda Trading Co., Ltd.", location: "Dongguan, Guangdong" }),
    ]);
    const ev = compareStorefronts(fronts[0]!, fronts[1]!);
    expect(ev.name).toBe("exact");
    expect(ev.location).toBe("conflict");
    expect(ev.confidence).toBeLessThan(0.6);
    expect(mergeSuppliers(fronts.flatMap((f) => f.listings))).toHaveLength(2);
  });
  it("groups listings of one market by supplier id, falling back to the folded name", () => {
    const fronts = storefrontsOf([
      l("tr-trendyol", "1", "Termos", { supplierId: "m1", supplierName: "Yıldız Mağazası" }),
      l("tr-trendyol", "2", "Bardak", { supplierId: "m1", supplierName: "Yıldız Mağazası" }),
      l("tr-hepsiburada", "3", "Termos", { supplierName: "Yıldız Ev Yaşam" }),
      l("tr-hepsiburada", "4", "Bardak", { supplierName: "yildiz ev yasam" }),
      l("tr-n11", "5", "Bardak" ),
    ]);
    expect(fronts.map((f) => `${f.key}=${f.listings.length}`).sort()).toEqual(["tr-hepsiburada:name:yildiz=2", "tr-n11:listing:5=1", "tr-trendyol:m1=2"]);
    const ids = mergeSuppliers(fronts.flatMap((f) => f.listings));
    const yildiz = ids.find((i) => i.names.includes("Yıldız Mağazası"))!;
    expect(yildiz.markets.sort()).toEqual(["tr-hepsiburada", "tr-trendyol"]);
    expect(yildiz.merges[0]!.reasons[0]).toBe("mağaza adı aynı (yildiz)");
  });
  it("orders identities by market count and respects a custom threshold", () => {
    const ids = mergeSuppliers(sameFactory.concat(l("tr-n11", "z", "Kulaklık", { supplierName: "Tek Mağaza" })));
    expect(ids[0]!.markets.length).toBe(4);
    expect(ids[1]!.names).toEqual(["Tek Mağaza"]);
    expect(mergeSuppliers(sameFactory, { threshold: 0.99 })).toHaveLength(4);
    expect(mergeSuppliers([])).toEqual([]);
  });
});
