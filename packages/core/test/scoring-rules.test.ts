/**
 * Unit tests for the scoring rules added during the ≥300-case golden calibration: model-code
 * suffix tolerance, standard codes that are not models, lookalike markers, accessory families,
 * audience / pack-size variants, phrase relations with descriptors, brand conflicts and full
 * query coverage. The golden test measures them in aggregate; these pin each rule on its own.
 */
import {
  accessoryKind,
  accessoryTerms,
  attributes,
  brandModelPhrase,
  confidenceBand,
  foldTr,
  isModelQualifier,
  lookalikeTerms,
  modelNumbers,
  phraseRelation,
  sameModelCode,
  scoreMatch,
  tokens,
  type Fingerprint,
} from "../src";

const t = (title: string, extra: Partial<Fingerprint> = {}): Fingerprint => ({ title, ...extra });
const band = (a: Fingerprint, b: Fingerprint) => confidenceBand(scoreMatch(a, b).score);

describe("model codes", () => {
  it("sameModelCode tolerates regional / kit suffixes and sub-SKUs", () => {
    expect(sameModelCode("AF300", "AF300EU")).toBe(true);
    expect(sameModelCode("DHP484", "DHP484Z")).toBe(true);
    expect(sameModelCode("KI730", "KI730D30")).toBe(true);
    expect(sameModelCode("SM-SA48", "SM-SA48-BA")).toBe(true);
    expect(sameModelCode("MU-PC1T0T", "MU-PC1T0T/WW")).toBe(true);
    expect(sameModelCode("DCD771", "DCD791")).toBe(false);
    expect(sameModelCode("AX55", "AX5500")).toBe(false);
    expect(sameModelCode("K2", "K2PRO")).toBe(false);
  });
  it("standards and ratings are not model numbers", () => {
    expect(modelNumbers("Philips Hue E27 Smart Bulb GU10 Spot")).toEqual([]);
    expect(modelNumbers("Osram Night Breaker H7 and H4 bulbs")).toEqual([]);
    expect(modelNumbers("Anker 7-in-1 USB-C Hub USB3 HDMI2")).toEqual([]);
    expect(modelNumbers("La Roche-Posay Anthelios SPF50+ UV400 IP67 PD3.0 11th gen")).toEqual([]);
    expect(modelNumbers("TP-Link Archer AX55 AX3000")).toEqual(["AX55", "AX3000"]);
    expect(modelNumbers("APC Back-UPS BX650MI 650VA 4200Pa 48QT")).toEqual(["BX650MI"]);
  });
  it("a shared code with an SKU suffix counts as a hit, a different brand does not", () => {
    const hit = scoreMatch(t("Ninja Foodi AF300 Dual Zone Airfryer"), t("Ninja Foodi AF300EU Dual Zone 7.6 L Çift Hazneli Airfryer"));
    expect(hit.signals.modelNumberHit).toBe(true);
    expect(confidenceBand(hit.score)).toBe("same");
    const other = scoreMatch(t("Dyson V12 Detect Slim Kablosuz Süpürge"), t("Dreame V12 Kablosuz Süpürge"));
    expect(other.signals.brandConflict).toBe(true);
    expect(other.signals.modelNumberHit).toBe(false);
    expect(other.reasons).toContain("marka farklı");
    expect(confidenceBand(other.score)).not.toBe("same");
    expect(confidenceBand(other.score)).not.toBe("likely");
  });
});

describe("tokens", () => {
  it("merges and splits glued model words, drops possessives and keeps hyphenated codes whole", () => {
    expect(tokens("JBL Flip 6")).toEqual(expect.arrayContaining(["flip", "6", "flip6"]));
    expect(tokens("JBL FLIP6")).toEqual(expect.arrayContaining(["flip6", "flip", "6"]));
    expect(tokens("Kindle 16 GB")).toEqual(expect.arrayContaining(["16", "gb", "16gb"]));
    expect(tokens("Levi's Men's 501")).toEqual(expect.arrayContaining(["lev", "men", "501"]));
    expect(tokens("Levi's Men's 501")).not.toContain("s");
    expect(tokens("TWS-X15 USB-C").sort()).toEqual(["tws-x15", "usb", "usb-c"]);
    expect(tokens("q")).toEqual(["q"]);
  });
  it("folds western diacritics as well as Turkish ones", () => {
    expect(foldTr("Fjällräven Kånken Zoë")).toBe("fjallraven kanken zoe");
    expect(tokens("Fjällräven Kanken")).toEqual(tokens("Fjallraven Kanken"));
  });
});

describe("phrases", () => {
  it("skips generic words, years and revision numbers, and stops at CJK or units", () => {
    expect(brandModelPhrase("Xiaomi Smart Band 8 Global Version")).toBe("xiaomi band 8");
    expect(brandModelPhrase("DJI Mini 4 Pro Drone")).toBe("dji mini 4 pro drone");
    expect(brandModelPhrase("Fjällräven Kanken Classic Sırt Çantası")).toBe("fjallraven kanken classic sirt cantasi");
    expect(brandModelPhrase("Keychron K8 无线机械键盘 87键 RGB")).toBe("keychron k8");
    expect(brandModelPhrase("Keychron K2 Version 2 Wireless Mechanical Keyboard")).toBe("keychron k2 mechanical");
    expect(brandModelPhrase("Zojirushi SM-SA48 480 ml Termos")).toBe("zojirushi sm-sa48");
    expect(brandModelPhrase("Secretlab Titan Evo 2022 XL")).toBe("secretlab titan evo xl");
    expect(brandModelPhrase("Theragun Mini 2nd Generation")).toBe("theragun mini 2");
    expect(brandModelPhrase("Lacoste L.12.12 Erkek Polo")).toBe("lacoste l1212 polo");
    expect(brandModelPhrase("Philips OneBlade QP2520/30 Tıraş Makinesi")).toBe("philips oneblade qp2520 tiras makinesi");
    expect(brandModelPhrase("Roborock Q7 Max+ Robot Süpürge")).toBe("roborock q7 max+ robot");
    expect(brandModelPhrase("TP-Link Archer AX55 Wi-Fi 6 Router")).toBe("tp-link archer ax55 router");
  });
  it("trailing descriptors are exact, series words or numbers are variants, two numbered tails conflict", () => {
    expect(phraseRelation("ls2 rapid 2", "ls2 rapid 2 race")).toBe("exact");
    expect(phraseRelation("sony wh-1000xm5 kulak ustu", "sony wh-1000xm5")).toBe("exact");
    expect(phraseRelation("nike air max 270", "nike air max 270 react")).toBe("variant");
    expect(phraseRelation("samsung galaxy s24", "samsung galaxy s24 ultra")).toBe("variant");
    expect(phraseRelation("xiaomi humidifier 2 nemlendirici", "xiaomi humidifier 2 lite")).toBe("variant");
    expect(phraseRelation("ninja bn495 pro", "ninja bn495 nutri pro compact personal")).toBe("exact");
    expect(phraseRelation("roborock q7 max", "roborock q7 max+ robot")).toBe("conflict");
    expect(phraseRelation("agv k6 kask", "agv k1 s")).toBe("conflict");
    expect(phraseRelation("ninja foodi af300 dual zone", "ninja foodi af300eu dual zone")).toBe("exact");
    expect(phraseRelation("philips hue", "philips hue")).toBe("none");
    expect(phraseRelation("dyson airwrap complete long", "dyson airwrap complete long")).toBe("exact");
  });
  it("isModelQualifier ignores ratings, classes and units", () => {
    for (const q of ["pro", "lite", "270", "k8", "max+", "shield"]) expect(isModelQualifier(q)).toBe(true);
    for (const q of ["ip67", "ax3000", "spf50", "1080p", "100w", "race", "hiking"]) expect(isModelQualifier(q)).toBe(false);
  });
});

describe("accessories", () => {
  it("matches on folded text, so Turkish suffixes do not split words", () => {
    expect(accessoryTerms("alüminyum laptop standı")).toEqual(["standi"]);
    expect(accessoryTerms("Yastık Kılıfı 50x70 Pamuk")).toEqual(["kilifi"]);
    expect(accessoryTerms("DJI Mini 4 Pro Pervane Seti")).toEqual(["pervane"]);
    expect(accessoryTerms("Keychron K8 Ahşap Bilek Desteği")).toEqual(["bilek destegi"]);
    expect(accessoryTerms("Dedica EC685 Bottomless Portafilter 51 mm")).toEqual(["portafilter"]);
    expect(accessoryTerms("Cube bag for GAN 356")).toEqual(["bag for"]);
    expect(accessoryTerms("Bosch Rotak 32 grass box")).toEqual(["grass box"]);
  });
  it("features and bundles are not accessories: Alexa uyumlu, ciltler için, with travel case, resin strap, stand mixer", () => {
    expect(accessoryTerms("Govee H6159 LED Şerit Alexa Uyumlu")).toEqual([]);
    expect(accessoryTerms("CeraVe Nemlendirici Krem Kuru Ciltler İçin")).toEqual([]);
    expect(accessoryTerms("Oral-B iO 9 Toothbrush with Charging Travel Case")).toEqual([]);
    expect(accessoryTerms("Casio F91W-1 Classic Resin Strap Digital Watch")).toEqual([]);
    expect(accessoryTerms("Bosch MUM5 Stand Mixer 1000W")).toEqual([]);
    expect(accessoryTerms("Ugreen Nexode 100W GaN charger")).toEqual([]);
    expect(accessoryTerms("Columbia Watertight II Erkek Yağmurluk")).toEqual([]);
    expect(accessoryTerms("Bebek Arabası Yağmurluğu")).toEqual(["yagmurlugu"]);
    expect(accessoryTerms("Redmi Buds 4 Pro için kılıf")).toEqual(expect.arrayContaining(["kilif", "icin"]));
  });
  it("accessoryKind groups synonyms across languages", () => {
    expect(accessoryKind("kilif")).toBe("case");
    expect(accessoryKind("手机壳")).toBe("case");
    expect(accessoryKind("ekran koruyucu")).toBe("protector");
    expect(accessoryKind("icin")).toBeUndefined();
  });
  it("two different accessories of the same product are not the same accessory", () => {
    const m = scoreMatch(t("Samsung Galaxy S24 Ultra Kılıf"), t("Samsung Galaxy S24 Ultra Ekran Koruyucu"));
    expect(m.signals.accessoryKindMismatch).toBe(true);
    expect(confidenceBand(m.score)).not.toBe("same");
    expect(confidenceBand(m.score)).not.toBe("likely");
    const same = scoreMatch(t("iPhone 15 kılıf"), t("iPhone 15 Case Clear Silicone"));
    expect(same.signals.accessoryKindMismatch).toBeUndefined();
  });
});

describe("variants: pack size, audience, lookalikes", () => {
  it("attributes read pack quantity, audience and the larger storage figure", () => {
    expect(attributes("Kingston Exodia 64GB USB Bellek 3'lü Paket")).toMatchObject({ storageGb: 64, packQty: 3 });
    expect(attributes("Samsung Galaxy A54 5G 8GB+128GB").storageGb).toBe(128);
    expect(attributes("Columbia Men's Watertight II").audience).toBe(1);
    expect(attributes("Columbia Watertight II Kadın Yağmurluk").audience).toBe(2);
    expect(attributes("Nike Futura Çocuk Tişört").audience).toBe(3);
    expect(attributes("挪客 云尚2 双人 帐篷").packQty).toBeUndefined();
    expect(attributes("Casio F-91W-1 Saat").powerW).toBeUndefined();
  });
  it("a multipack of a single-unit query is a variant, never same", () => {
    const m = scoreMatch(t("JBL Go 3 Bluetooth Hoparlör"), t("JBL Go 3 Bluetooth Hoparlör 2'li Paket"));
    expect(m.signals.packMismatch).toBe(true);
    expect(m.reasons).toContain("paket adedi farklı (1 vs 2)");
    expect(confidenceBand(m.score)).toBe("likely");
    const both = scoreMatch(t("Stabilo Boss Fosforlu Kalem 4'lü"), t("Stabilo Boss Original Fosforlu Kalem 8'li Set"));
    expect(both.reasons).toContain("paket adedi farklı (4 vs 8)");
    // Large counts are the product's own unit (diapers, gloves): no mismatch when the query names none.
    expect(scoreMatch(t("Pampers Premium Care 4 Numara"), t("Pampers Premium Care 4 Beden 52 Adet Bebek Bezi")).signals.packMismatch).toBeUndefined();
  });
  it("men's vs women's editions are variants", () => {
    const m = scoreMatch(t("Columbia Watertight II Erkek Yağmurluk"), t("Columbia Watertight II Kadın Yağmurluk"));
    expect(m.signals.audienceMismatch).toBe(true);
    expect(m.reasons).toContain("hedef kitle farklı (erkek vs kadın)");
    expect(confidenceBand(m.score)).toBe("likely");
  });
  it("lookalike markers cap a candidate below likely", () => {
    expect(lookalikeTerms("Flip 6 tarzı taşınabilir hoparlör A+ kalite replika")).toEqual(expect.arrayContaining(["tarzi", "a+ kalite", "replika"]));
    expect(lookalikeTerms("574 style retro running shoes")).toEqual(["style"]);
    expect(lookalikeTerms("De'Longhi Dedica Style EC685.M")).toEqual([]);
    expect(lookalikeTerms("10281 compatible bonsai blocks")).toEqual(["compatible"]);
    expect(lookalikeTerms("Case compatible with iPhone 15")).toEqual([]);
    const m = scoreMatch(t("JBL Flip 6 Bluetooth Hoparlör"), t("Flip 6 tarzı taşınabilir bluetooth hoparlör A+ kalite replika"));
    expect(m.signals.lookalike).toBe(true);
    expect(m.reasons.some((r) => r.startsWith("replika/benzeri görünüyor"))).toBe(true);
    expect(confidenceBand(m.score)).toBe("similar");
    // A query that itself says "replika" is not penalised for matching replicas.
    expect(scoreMatch(t("Nike Air Max 270 replika"), t("Nike Air Max 270 Replika A+ Kalite")).signals.lookalike).toBeUndefined();
  });
});

describe("identity from text", () => {
  it("full query coverage with a numbered brand phrase reaches same; a generic query does not", () => {
    const m = scoreMatch(t("Xiaomi Mi Band 8 Akıllı Bileklik", { altTitles: ["Xiaomi Smart Band 8 fitness tracker"] }), t("Xiaomi Smart Band 8 Global Version Fitness Tracker AMOLED"));
    expect(m.signals.fullCoverage).toBe(true);
    expect(m.reasons[0]).toBe("sorgunun tamamı başlıkta");
    expect(confidenceBand(m.score)).toBe("same");
    expect(band(t("kablosuz kulaklık 2'li"), t("Kablosuz Kulaklık 2'li Paket TWS"))).not.toBe("same");
    expect(band(t("zımba makinesi 24/6"), t("Zımba Makinesi 24/6 Metal 25 Sayfa"))).not.toBe("same");
    expect(band(t("Huawei Band 8 Akıllı Bileklik"), t("Xiaomi Smart Band 8 Global Version"))).not.toBe("same");
  });
  it("a numbered exact phrase is same unless the image contradicts it", () => {
    // No number in the phrase: the floor does not apply, the text score alone decides.
    expect(scoreMatch(t("Dyson Airwrap"), t("Dyson Airwrap Multi-Styler Complete Long Nickel Copper Hair Styler")).score).toBeLessThan(0.85);
    expect(band(t("Levi's 501 Original Fit Erkek Jean"), t("Levi's Men's 501 Original Fit Jeans Stonewash"))).toBe("same");
    const contradicted = scoreMatch(t("Levi's 501 Original Fit Erkek Jean", { phash: "ffff0000ffff0000" }), t("Levi's Men's 501 Original Fit Jeans", { phash: "0f0f0f0f0f0f0f0f" }));
    expect(confidenceBand(contradicted.score)).not.toBe("same");
  });
  it("same product words with another brand are a brand conflict even without a number", () => {
    const m = scoreMatch(t("Fjällräven Kanken Classic Sırt Çantası"), t("Herschel Classic Sırt Çantası"));
    expect(m.signals.brandConflict).toBe(true);
    expect(confidenceBand(m.score)).toBe("similar");
    expect(scoreMatch(t("Soundcore by Anker P20i"), t("Anker Soundcore P20i Kablosuz Kulaklık")).signals.brandConflict).toBeUndefined();
  });
});
