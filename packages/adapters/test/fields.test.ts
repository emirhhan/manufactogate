import { countryOfPlace, foldName, normalizeUnit, parsePack, parsePackQty, parseShipFrom, parseUnitLabel, parseVariantCount, supplierKey } from "../src";

describe("pack quantity", () => {
  it.each([
    ["TWS蓝牙耳机 2件装", 2, "件"],
    ["收纳盒 10个装 透明", 10, "个"],
    ["运动袜 3双入", 3, "双"],
    ["厨房刀具5件套", 5, "件"],
    ["Islak Mendil 10 adet", 10, "adet"],
    ["Pil 10'lu paket", 10, "adet"],
    ["Akım Korumalı Çoklu Priz (6’lı)", 6, "adet"],
    ["Çorap 3 çift", 3, "pair"],
    ["Set of 4 coasters", 4, "set"],
    ["Pack of 12 markers", 12, "set"],
    ["Hooks 4-pack stainless", 4, "pack"],
    ["Screws 12 pcs M4", 12, "pcs"],
    ["Earrings 2 pairs", 2, "pair"],
    ["15 pack of Mewtwo promo", 15, "pack"],
    ["Капсулы для стирки, 52 шт", 52, "шт"],
    ["ゴム手袋 10個入り", 10, "個"],
    ["마스크 3개입", 3, "개"],
  ] as const)("%s → %d %s", (text, qty, unit) => {
    expect(parsePack(text)).toEqual({ qty, unit });
  });
  it("reads bare multipliers that are not dimensions", () => {
    expect(parsePackQty("USB kablo x5")).toBe(5);
    expect(parsePackQty("Kablo 5x hızlı şarj")).toBe(5);
    expect(parsePackQty("Lamba x 3")).toBe(3);
    expect(parsePackQty("Kutu 10x20cm")).toBeNull();
    expect(parsePackQty("Kablo 1.5 x 2m")).toBeNull();
  });
  it("does not read MOQ, sold counts, ranges, model names or single items as packs", () => {
    expect(parsePackQty("Min. order: 200 Pieces")).toBeNull();
    expect(parsePackQty("minimum sipariş miktarı 1")).toBeNull();
    expect(parsePackQty("500个起购")).toBeNull();
    expect(parsePackQty("50-300pcs Iron Jingle Bells")).toBeNull();
    expect(parsePackQty("1.234 adet satıldı")).toBeNull();
    expect(parsePackQty("跨境12in1新款i60套装智能手表")).toBeNull();
    expect(parsePackQty("蓝牙耳机 1件装")).toBeNull();
    expect(parsePackQty("Kablo 2024 model")).toBeNull();
    expect(parsePackQty("")).toBeNull();
    expect(parsePackQty(null)).toBeNull();
  });
});

describe("unit label", () => {
  it.each([
    ["US$ 14.49 - 14.99 Min. order: 200 Pieces", "pcs"],
    ["MOQ: 10 pairs", "pair"],
    ["Minimum Order Quantity 50 Piece/Pieces", "pcs"],
    ["58 .00 元 500个起购", "个"],
    ["1副起购", "副"],
    ["起订量 2套", "套"],
    ["₹ 48,000/Piece", "pcs"],
    ["58.00 元/件", "件"],
    ["¥12.5/套", "套"],
    ["12,50 TL / adet", "adet"],
    ["US$ 2.10 per pair", "pair"],
    ["$3.20/kg", "kg"],
    ["Unit of Price: Piece/Pieces", "pcs"],
  ] as const)("%s → %s", (text, unit) => {
    expect(parseUnitLabel(text)).toBe(unit);
  });
  it("is null without an explicit unit; pack wording carries its own unit", () => {
    expect(parseUnitLabel("Bluetooth kulaklık 333,86 TL")).toBeNull();
    expect(parseUnitLabel("2件装")).toBeNull();
    expect(parsePack("2件装")?.unit).toBe("件");
  });
  it("normalises unit words", () => {
    expect(normalizeUnit("Pack/Packs")).toBe("pack");
    expect(normalizeUnit("Pieces")).toBe("pcs");
    expect(normalizeUnit("Unit/Units")).toBe("unit");
    expect(normalizeUnit("套")).toBe("套");
    expect(normalizeUnit("adet")).toBe("adet");
    expect(normalizeUnit("foo")).toBeNull();
    expect(normalizeUnit("")).toBeNull();
  });
});

describe("ship-from country", () => {
  it.each([
    ["Ships from China · Ships to Türkiye", "cn"],
    ["Ships from: HK", "hk"],
    ["Ships from United Kingdom", "gb"],
    ["Gönderim yeri: Türkiye", "tr"],
    ["发货地 浙江 杭州", "cn"],
    ["发货地：广东省深圳市", "cn"],
    ["Отправка из Китая", "cn"],
    ["Free shipping from China", "cn"],
    ["Located in: United States", "us"],
    ["発送元: 日本", "jp"],
  ] as const)("%s → %s", (text, code) => {
    expect(parseShipFrom(text)).toBe(code);
  });
  it("ignores destinations and unknown places", () => {
    expect(parseShipFrom("Ships to Türkiye")).toBeNull();
    expect(parseShipFrom("Dikirim dari Jakarta Barat")).toBeNull();
    expect(parseShipFrom("Bluetooth kulaklık 333,86 TL")).toBeNull();
    expect(parseShipFrom(null)).toBeNull();
  });
  it("maps Chinese provinces, cities and country names to alpha-2 codes", () => {
    expect(countryOfPlace("广东 佛山")).toBe("cn");
    expect(countryOfPlace("浙江省金华市")).toBe("cn");
    expect(countryOfPlace("陕西西安")).toBe("cn");
    expect(countryOfPlace("Shenzhen, Guangdong")).toBe("cn");
    expect(countryOfPlace("香港")).toBe("hk");
    expect(countryOfPlace("Hong Kong")).toBe("hk");
    expect(countryOfPlace("Almanya")).toBe("de");
    expect(countryOfPlace("UK")).toBe("gb");
    expect(countryOfPlace("de")).toBe("de");
    expect(countryOfPlace("Istanbul")).toBeNull();
    expect(countryOfPlace("")).toBeNull();
  });
});

describe("variant count", () => {
  it.each([
    ["Available in 5 colors", 5],
    ["+3 renk", 4],
    ["2 Farklı Renk", 2],
    ["12 Renk Seçeneği", 12],
    ["3 sizes available", 3],
    ["4色", 4],
    ["Доступно 6 цветов", 6],
  ] as const)("%s → %d", (text, n) => {
    expect(parseVariantCount(text)).toBe(n);
  });
  it("is null for single options and unrelated numbers", () => {
    expect(parseVariantCount("1 color")).toBeNull();
    expect(parseVariantCount("2024 model kask")).toBeNull();
    expect(parseVariantCount("333,86 TL")).toBeNull();
    expect(parseVariantCount("")).toBeNull();
  });
});

describe("supplier key", () => {
  it("folds Chinese company names: legal form, trading and generic words stripped, country prefixed", () => {
    expect(supplierKey({ name: "深圳市示例电子有限公司", country: "cn" })).toBe("cn:深圳市示例电子");
    expect(supplierKey({ name: "义乌市示例商贸有限公司", country: "cn" })).toBe("cn:义乌市示例");
    expect(supplierKey({ name: "永康市匠派户外休闲用品有限公司", country: "cn" })).toBe("cn:永康市匠派户外休闲用品");
    expect(supplierKey({ name: "东莞市耳机实业股份有限公司", country: "cn" })).toBe("cn:东莞市耳机");
    expect(supplierKey({ name: "KASK运动户外旗舰店", country: "cn" })).toBe("cn:kask运动户外");
    expect(supplierKey({ name: "星耀数码专营店", country: "CN" })).toBe("cn:星耀数码");
  });
  it("folds Latin and Turkish names so the same company matches across markets", () => {
    const a = supplierKey({ name: "Shenzhen Shili Electronics Co., Ltd.", country: "cn" });
    expect(a).toBe("cn:shenzhenshilielectronics");
    expect(supplierKey({ name: "SHENZHEN SHILI ELECTRONICS CO.,LTD", country: "cn" })).toBe(a);
    expect(supplierKey({ name: "Shenzhen Shili Electronics Technology Co Ltd", country: "cn" })).toBe(a);
    expect(supplierKey({ name: "Shenzhen N+1 Intelligent Technology Co. Ltd", country: "cn" })).toBe("cn:shenzhenn1intelligent");
    expect(supplierKey({ name: "Pramukh Impex LLC", country: "in" })).toBe("in:pramukhimpex");
    expect(supplierKey({ name: "Örnek Dış Ticaret Ltd. Şti.", country: "tr" })).toBe("tr:ornek");
    expect(supplierKey({ name: "ÖRNEK SANAYİ VE TİCARET A.Ş.", country: "tr" })).toBe("tr:ornek");
    expect(supplierKey({ name: "Endro Store", country: "tr" })).toBe("tr:endro");
    expect(supplierKey({ name: "ENDRO", country: "tr" })).toBe("tr:endro");
    expect(supplierKey({ name: "Müller GmbH & Co. KG", country: "de" })).toBe("de:mullerkg");
  });
  it("keeps a generic-only name rather than returning nothing, and omits an unknown country", () => {
    expect(supplierKey({ name: "Trading Co., Ltd." })).toBe("tradingcoltd");
    expect(supplierKey({ name: "深圳市示例电子" })).toBe("深圳市示例电子");
    expect(supplierKey({ name: "深圳市示例电子", country: "china" })).toBe("深圳市示例电子");
    expect(supplierKey({ name: "   " })).toBeNull();
    expect(supplierKey({ name: null, country: "cn" })).toBeNull();
    expect(supplierKey({})).toBeNull();
  });
  it("foldName lowercases, strips diacritics (Turkish aware) and punctuation", () => {
    expect(foldName("İSTANBUL Çelik-Ürün A.Ş.")).toBe("istanbulcelikurunas");
    expect(foldName("Müller & Söhne")).toBe("mullersohne");
  });
});
