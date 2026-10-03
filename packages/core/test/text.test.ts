import { accessoryTerms, attributeMismatches, attributes, brandModelPhrase, isUnitToken, jaccard, modelNumbers, overlap, phraseRelation, stripZhMarketing, tokens, ZH_STOP } from "../src";

describe("text signals", () => {
  it("tokenizes latin and CJK, folding Turkish and adding light stems", () => {
    expect(tokens("Wireless Earbuds TWS X15 Pro")).toEqual(["wireless", "earbud", "tws", "x15", "pro"]);
    expect(tokens("无线蓝牙耳机")).toEqual(["无线", "线蓝", "蓝牙", "牙耳", "耳机"]);
    // Turkish: dotted İ, diacritics and inflection fold to the same tokens.
    expect(tokens("Güneş Gözlüğü İstanbul")).toEqual(["gunes", "gozluk", "istanbul"]);
    expect(tokens("Motosiklet Kaskı")).toEqual(["motosiklet", "kask"]);
    expect(tokens("gozluk")).toEqual(["gozluk"]);
    expect(tokens("Kulaklığı")).toEqual(["kulaklik"]);
    // Both readings of an ambiguous suffix are kept.
    expect(tokens("Termosu")).toEqual(expect.arrayContaining(["termos"]));
    // Tokens with digits are never stemmed.
    expect(tokens("TWS-X15")).toEqual(["tws-x15"]);
  });
  it("bigrams kana and hangul runs and drops particles", () => {
    expect(tokens("ヘルメット バイク用")).toEqual(["ヘル", "ルメ", "メッ", "ット", "バイ", "イク", "ク用"]);
    expect(tokens("오토바이 헬멧을")).toEqual(["오토", "토바", "바이", "헬멧"]);
    expect(tokens("バイクのヘルメット")).toContain("ヘル");
  });
  it("strips Chinese marketing filler before tokenizing", () => {
    expect(ZH_STOP).toContain("一件代发");
    expect(stripZhMarketing("跨境新款厂家直销无线耳机2024")).toBe("无线耳机");
    expect(tokens("跨境新款厂家直销无线耳机")).toEqual(["无线", "线耳", "耳机"]);
  });
  it("extracts model numbers but not units, years or resolutions", () => {
    expect(modelNumbers("Bluetooth kulaklık TWS-X15 Pro ANC 2024")).toEqual(["TWS-X15"]);
    expect(modelNumbers("Model A1B2 and XK-900")).toEqual(["A1B2", "XK-900"]);
    expect(modelNumbers("no codes here")).toEqual([]);
    expect(modelNumbers("Xiaomi 256GB 100W powerbank 20000mAh 1080P 500ML 4K")).toEqual([]);
    expect(modelNumbers("Samsung Galaxy S24 Ultra, Dyson V15 Detect")).toEqual(["S24", "V15"]);
    expect(modelNumbers("X15 alone")).toEqual([]);
    expect(isUnitToken("20000mah")).toBe(true);
    expect(isUnitToken("2023")).toBe(true);
    expect(isUnitToken("hd9252")).toBe(false);
  });
  it("parses attributes with unit normalisation", () => {
    const a = attributes("Stanley Quencher 1.18L Termos 2 Adet 65W 20000mAh 256GB 12V 500g 5m");
    expect(a).toEqual({ capacityMl: 1180, powerW: 65, batteryMah: 20000, storageGb: 256, voltageV: 12, weightG: 500, lengthMm: 5000, packQty: 2 });
    expect(attributes("40oz tumbler").capacityMl).toBe(1183);
    expect(attributes("usb kablo 10pcs").packQty).toBe(10);
    expect(attributes("3'lü termal maske").packQty).toBe(3);
    expect(attributes("kablo x3").packQty).toBe(3);
    expect(attributes("5G telefon").weightG).toBeUndefined();
    expect(attributeMismatches(attributes("termos 500ml"), attributes("termos 1000ml"))).toEqual([{ kind: "capacityMl", a: 500, b: 1000 }]);
    expect(attributeMismatches(attributes("Stanley 1.18L"), attributes("Stanley 40oz"))).toEqual([]);
  });
  it("detects accessory terms, ignoring 'with X' forms and parentheses", () => {
    expect(accessoryTerms("Samsung Galaxy S24 Ultra Kılıf Şeffaf")).toEqual(["kilif"]);
    expect(accessoryTerms("LS2 RAPID 2 RACE MAT SİYAH KASK (siyah vizörlü + Spoıler)")).toEqual([]);
    expect(accessoryTerms("LS2 RAPID 2 vizör")).toContain("vizor");
    expect(accessoryTerms("Philips HD9252 filtre")).toContain("filtre");
    expect(accessoryTerms("头盔镜片 适用于LS2")).toEqual(expect.arrayContaining(["镜片", "适用于"]));
    expect(accessoryTerms("Blessed Kask Sticker – Motor Kaskı İçin")).toEqual(expect.arrayContaining(["sticker", "icin"]));
    expect(accessoryTerms("Xiaomi Redmi Buds 4 Pro")).toEqual([]);
    expect(accessoryTerms("Kablosuz Kulaklık Şarj Kutusu")).toContain("sarj kutusu");
  });
  it("extracts the brand+model phrase and relates phrases", () => {
    expect(brandModelPhrase("Xiaomi Redmi Buds 4 Pro Kablosuz Kulaklık Siyah")).toBe("xiaomi redmi buds 4 pro");
    expect(brandModelPhrase("小米 Redmi Buds 4 Pro 无线蓝牙耳机")).toBe("redmi buds 4 pro");
    expect(brandModelPhrase("LS2 RAPID 2 RACE MAT SİYAH KASK")).toBe("ls2 rapid 2 race");
    expect(brandModelPhrase("Stanley Quencher 1.18L Termos")).toBe("stanley quencher");
    expect(phraseRelation("xiaomi redmi buds 4 pro", "redmi buds 4 pro")).toBe("exact");
    expect(phraseRelation("nike air max 270", "nike air max 270 react")).toBe("variant");
    expect(phraseRelation("nike air max 270", "adidas ultraboost 22")).toBe("none");
    expect(phraseRelation("", "x")).toBe("none");
  });
  it("jaccard and overlap", () => {
    expect(jaccard(["a", "b"], ["b", "c"])).toBeCloseTo(1 / 3);
    expect(jaccard([], [])).toBe(0);
    expect(overlap(["a", "b"], ["a", "b", "c", "d", "e"])).toBe(1);
    expect(overlap([], ["a"])).toBe(0);
  });
});
