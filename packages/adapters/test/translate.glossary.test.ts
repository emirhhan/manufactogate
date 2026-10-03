import { brandModel, categoryIn, categoryKey, getLeaf, getLeaves, localizeQuery, localizeQueryLadder, queryLadder, renderTitleTr, titleToQuery, translateQuery, translateQueryToZh, translateTitleToTr, TAXONOMY } from "../src";
import { accessoryNoun } from "../src/translate";
import { LEAF_ALIASES } from "../src/mock/taxonomy";

describe("taxonomy (C22/C23)", () => {
  it("every leaf has Turkish, Chinese and English names, keys are unique, groups have English names", () => {
    const leaves = getLeaves();
    for (const l of leaves) {
      expect(l.tr.length).toBeGreaterThan(0);
      expect(l.zh.length).toBeGreaterThan(0);
      expect(l.en.length, l.key).toBeGreaterThan(0);
    }
    expect(new Set(leaves.map((l) => l.tr.toLowerCase())).size).toBe(leaves.length);
    for (const g of TAXONOMY) expect(g.en.length).toBeGreaterThan(0);
  });
  it("has the generic sourcing leaves and resolves renamed keys through aliases", () => {
    for (const key of ["telefon", "tablet", "laptop", "monitor", "televizyon", "kulaklik", "canta", "saat", "pil", "ampul", "priz", "kedi-mamasi", "kablosuz-supurge", "mikrodalga", "kask", "oto-paspasi"]) expect(getLeaf(key), key).toBeDefined();
    expect(LEAF_ALIASES["auto-paspas"]).toBe("oto-paspasi");
    expect(getLeaf("auto-paspas")?.zh).toBe("汽车脚垫");
    expect(getLeaf("paspas")?.zh).toBe("拖把");
  });
});

describe("Turkish → Chinese queries (C02/C03/C04/C20)", () => {
  it("matches whole words, not substrings", () => {
    expect(translateQueryToZh("iphone 15 kılıf")).toBe("iphone 15 保护壳");
    expect(translateQueryToZh("telefon kılıfı samsung s24")).toBe("samsung 手机壳 s24");
    expect(translateQueryToZh("mat siyah kask")).toBe("头盔 哑光 黑色");
    expect(translateQueryToZh("Kablosuz Süpürge")).toBe("无线吸尘器");
    expect(categoryIn("Kablosuz Süpürge Dyson", "tr")).toBe("Kablosuz Süpürge");
  });
  it("a code-only query stays a code", () => {
    expect(translateQueryToZh("A1234")).toBe("A1234");
    expect(translateQueryToZh("HD9252/90")).toBe("HD9252/90");
  });
  it("keeps brand tokens and model codes on Chinese markets", () => {
    expect(translateQueryToZh("Xiaomi powerbank 20000mAh")).toBe("Xiaomi 移动电源 20000mAh");
    expect(translateQueryToZh("stanley termos")).toBe("stanley 保温杯");
    expect(translateQueryToZh("Dyson V15 Detect Kablosuz Süpürge")).toBe("Dyson Detect 无线吸尘器 V15");
    expect(translateQueryToZh("kulaklık TWS-X15")).toBe("耳机 TWS-X15");
  });
  it("renders attributes and numbers with units", () => {
    expect(translateQueryToZh("erkek spor ayakkabı")).toBe("运动鞋 男");
    expect(translateQueryToZh("güneş gözlüğü polarize")).toBe("太阳镜 偏光");
    expect(translateQueryToZh("yoga matı 10mm")).toBe("瑜伽垫 10mm");
    expect(translateQueryToZh("led şerit 5m")).toBe("灯带 5m");
    expect(translateQueryToZh("kadın elbise yazlık")).toBe("连衣裙 女 夏季");
    expect(translateQueryToZh("kedi maması")).toBe("猫粮");
    expect(translateQueryToZh("ucuz kulaklık")).toBe("耳机");
  });
  it("ranks the leaf that matches the most query words", () => {
    expect(translateQueryToZh("paspas")).toBe("拖把");
    expect(translateQueryToZh("oto paspası")).toBe("汽车脚垫");
    expect(translateQueryToZh("bebek arabası")).toBe("婴儿车");
  });
  it("falls back to the original when nothing is known", () => {
    expect(translateQueryToZh("çekyat")).toBe("çekyat");
    expect(translateQueryToZh("zxqv")).toBe("zxqv");
  });
});

describe("other languages (C01/C19)", () => {
  it("English markets get English, never the Turkish query", () => {
    expect(localizeQuery("kablosuz kulaklık", "en")).toBe("wireless earbuds");
    expect(localizeQuery("motosiklet kaskı", "en")).toBe("motorcycle helmet");
    expect(localizeQuery("akü takviye", "en")).toBe("jump starter");
    expect(localizeQuery("göğüs pompası", "en")).toBe("breast pump");
    expect(localizeQueryLadder("kablosuz kulaklık", "en")).toEqual({ rungs: ["wireless earbuds"], translated: true, language: "en", categoryKey: "kablosuz-kulaklik" });
  });
  it("native glossaries for ja/ko/ru/de/id/th with English as the second rung", () => {
    expect(localizeQueryLadder("kablosuz kulaklık", "ja").rungs).toEqual(["ワイヤレスイヤホン", "wireless earbuds"]);
    expect(localizeQueryLadder("motosiklet kaskı", "ko").rungs).toEqual(["오토바이 헬멧", "motorcycle helmet"]);
    expect(localizeQueryLadder("motosiklet kaskı", "ru").rungs).toEqual(["мотошлем", "motorcycle helmet"]);
    expect(localizeQueryLadder("kask", "de").rungs).toEqual(["Helm", "helmet"]);
    expect(localizeQueryLadder("kedi maması", "th").rungs).toEqual(["อาหารแมว", "cat food"]);
    expect(localizeQueryLadder("elbise", "id").rungs).toEqual(["dress"]);
    expect(localizeQuery("siyah elbise", "de")).toBe("schwarz Kleid");
  });
  it("reports when a query could not be translated, and leaves brand-only queries alone", () => {
    expect(localizeQueryLadder("çekyat", "en")).toMatchObject({ rungs: ["çekyat"], translated: false });
    expect(localizeQueryLadder("Stanley", "en")).toMatchObject({ rungs: ["Stanley"], translated: true });
    expect(localizeQuery("kask", "tr")).toBe("kask");
    expect(translateQuery("", "en")).toEqual({ text: "", translated: false });
    expect(localizeQueryLadder("蓝牙耳机", "zh")).toMatchObject({ rungs: ["蓝牙耳机"], translated: true });
  });
});

describe("brand/model tokenizer (C06)", () => {
  it("keeps decimals, slash codes and series suffixes, drops materials, units and category words", () => {
    expect(brandModel("Stanley Quencher 1.18L Termos")).toEqual({ brand: "Stanley", models: ["Quencher"], attrs: ["1.18L"] });
    expect(brandModel("Philips Airfryer HD9252/90 Essential")).toEqual({ brand: "Philips", models: ["HD9252/90"], attrs: [] });
    expect(brandModel("2 Adet Paslanmaz Çelik Termos").brand).toBe("");
    expect(brandModel("Apple iPhone 15 Pro Max 256GB Siyah")).toEqual({ brand: "Apple", models: ["iPhone", "15", "Pro", "Max"], attrs: ["256GB"] });
    expect(brandModel("Xiaomi Redmi Buds 4 Pro Kablosuz Kulaklık Siyah").models).toEqual(["Redmi", "Buds", "4", "Pro"]);
    expect(brandModel("500ml Termos").brand).toBe("");
  });
});

describe("accessory nouns in ladders (C05)", () => {
  it("never drops the accessory noun of the source title", () => {
    expect(queryLadder("Samsung Galaxy S24 Ultra Kılıf Şeffaf", "en")[0]).toBe("Samsung Galaxy S24 Ultra case");
    expect(queryLadder("Samsung Galaxy S24 Ultra Kılıf Şeffaf", "zh")[0]).toBe("Samsung Galaxy S24 Ultra 保护壳");
    expect(queryLadder("Samsung Galaxy S24 Ultra Kılıf Şeffaf", "tr")[0]).toBe("Samsung Galaxy S24 Ultra Kılıf");
    expect(queryLadder("Blessed Kask Sticker – Motor Kaskı İçin Premium Yazı Kaligrafik Sticker", "zh")).toEqual(["Blessed 头盔 贴纸", "头盔 贴纸"]);
    expect(queryLadder("Blessed Kask Sticker – Motor Kaskı İçin Premium Yazı Kaligrafik Sticker", "en")[0]).toBe("Blessed helmet sticker");
    expect(accessoryNoun("LS2 RAPID 2 RACE MAT SİYAH KASK (siyah vizörlü + Spoıler)")).toBeNull();
    expect(accessoryNoun("Kask Taşıma ve Koruma Çantası – Siyah")).toBeNull();
    expect(accessoryNoun("Dyson V15 Detect Filtre")?.zh).toBe("滤芯");
  });
});

describe("ladders (C04)", () => {
  it("Chinese ladder keeps brand and model tokens and goes from specific to broad", () => {
    expect(queryLadder("Xiaomi Redmi Buds 4 Pro Kablosuz Kulaklık Siyah", "zh")).toEqual(["Xiaomi Redmi Buds 4 Pro 无线耳机", "Xiaomi 无线耳机", "无线耳机"]);
    expect(queryLadder("Xiaomi powerbank 20000mAh", "zh")).toEqual(["Xiaomi 移动电源 20000mAh", "Xiaomi 移动电源", "移动电源"]);
    expect(queryLadder("Apple iPhone 15 Pro Max 256GB Siyah", "zh")[0]).toBe("Apple iPhone 15 Pro Max");
    expect(queryLadder("Dyson V15 Detect Kablosuz Süpürge", "zh")).toEqual(["Dyson V15 Detect 无线吸尘器", "Dyson 无线吸尘器", "无线吸尘器"]);
  });
  it("English and native ladders", () => {
    expect(queryLadder("Stanley Quencher 1.18L Termos", "en")).toEqual(["Stanley Quencher thermos 1.18L", "Stanley thermos", "thermos", "Stanley Quencher"]);
    expect(queryLadder("Philips Airfryer HD9252/90", "en")[0]).toBe("Philips HD9252/90 air fryer");
    expect(queryLadder("2 Adet Paslanmaz Çelik Termos 500ml", "en")).toEqual(["thermos 500ml", "thermos"]);
    expect(queryLadder("Xiaomi Redmi Buds 4 Pro Kablosuz Kulaklık Siyah", "ja").slice(0, 3)).toEqual(["Xiaomi Redmi Buds 4 Pro ワイヤレスイヤホン", "Xiaomi ワイヤレスイヤホン", "ワイヤレスイヤホン"]);
    expect(queryLadder("", "en")).toEqual([]);
  });
});

describe("Chinese titles in Turkish (C21)", () => {
  it("renders material, feature words and units; the plain form stays short", () => {
    expect(translateTitleToTr("不锈钢保温杯500ml")).toBe("Termos");
    expect(renderTitleTr("不锈钢保温杯500ml")).toBe("Paslanmaz çelik Termos 500ml");
    expect(renderTitleTr("跨境新款厂家直销无线蓝牙耳机TWS运动防水")).toBe("TWS Kablosuz Bluetooth Spor Su geçirmez Kulaklık");
    expect(renderTitleTr("Arai RX7 摩托车头盔女男机车全盔")).toBe("Arai RX7 Kapalı Motosiklet Kaskı");
  });
  it("falls back to the head noun at the end of the title, not marketing prefixes", () => {
    expect(titleToQuery("厂家直销 塑料收纳盒 桌面杂物盒", "zh")).toBe("杂物盒");
    expect(titleToQuery("跨境新款2024爆款儿童电动牙刷软毛", "zh")).toBe("电动牙刷");
  });
  it("exposes a language-neutral category key", () => {
    expect(categoryKey("Xiaomi Redmi Buds 4 Pro Kablosuz Kulaklık")).toBe("kablosuz-kulaklik");
    expect(categoryKey("小米无线耳机")).toBe("kablosuz-kulaklik");
    expect(categoryKey("Soundcore wireless earbuds")).toBe("kablosuz-kulaklik");
    expect(categoryKey("zxqv")).toBeUndefined();
  });
});
