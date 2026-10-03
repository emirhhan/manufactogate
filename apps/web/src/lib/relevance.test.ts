import { describe, expect, it } from "vitest";
import { categoryAgreement, categoryKeys, clearRelevanceCache, pickBest, relevance, relevanceDetail, titleSignals } from "./relevance";

const r = (a: string, b: string) => relevance(a, { title: b });

describe("relevance: cross-script category bridging", () => {
  const zh = "无线蓝牙耳机 TWS 运动 降噪";
  it("Chinese source vs Turkish earbuds is a near match, not noise", () => {
    expect(r(zh, "Kablosuz Kulaklık Bluetooth")).toBeGreaterThanOrEqual(0.6);
  });
  it("Chinese source vs Chinese earbuds (no latin tokens) scores through CJK overlap + category", () => {
    expect(r(zh, "蓝牙耳机 无线 入耳式")).toBeGreaterThanOrEqual(0.55);
  });
  it("Chinese source vs English earbuds", () => {
    expect(r(zh, "TWS Wireless Earbuds Bluetooth 5.3 Noise Cancelling")).toBeGreaterThanOrEqual(0.6);
  });
  it("Chinese source vs an unrelated Turkish product is weak", () => {
    expect(r(zh, "Motosiklet Kaskı Kapalı Full Face")).toBeLessThan(0.4);
    expect(r(zh, "Paslanmaz Çelik Termos 500 ml")).toBeLessThan(0.4);
  });
  it("Chinese helmet title vs Turkish helmet", () => {
    expect(r("摩托车头盔 全盔 男 四季通用", "Motosiklet Kaskı Kapalı Full Face Siyah")).toBeGreaterThanOrEqual(0.6);
  });
  it("English candidate with exact model is strong against the Turkish source", () => {
    const tr = "LS2 FF353 Rapid Motosiklet Kaskı Mat Siyah XL";
    expect(r(tr, "LS2 FF353 Rapid Full Face Motorcycle Helmet")).toBeGreaterThanOrEqual(0.8);
  });
});

describe("relevance: exact model beats generic", () => {
  it("LS2 FF353 exact model ranks above the generic LS2 helmet", () => {
    const src = "LS2 FF353 Rapid Motosiklet Kaskı Mat Siyah XL";
    const exact = r(src, "LS2 FF353 Rapid Kask Mat Siyah");
    const generic = r(src, "LS2 Motosiklet Kaskı");
    expect(exact).toBeGreaterThan(generic);
    expect(exact).toBeGreaterThanOrEqual(0.8);
    expect(generic).toBeGreaterThanOrEqual(0.5);
  });
  it("Redmi Buds 4 Pro beats generic bluetooth earbuds (no model-number token available)", () => {
    const src = "Xiaomi Redmi Buds 4 Pro Kablosuz Kulaklık";
    const exact = r(src, "Redmi Buds 4 Pro Kulaklık");
    const generic = r(src, "Kablosuz Kulaklık Bluetooth 5.3");
    expect(exact).toBeGreaterThan(generic);
    expect(exact).toBeGreaterThanOrEqual(0.75);
    expect(generic).toBeLessThan(0.65);
  });
  it("colour and size tokens do not dilute", () => {
    const src = "LS2 FF353 Rapid Motosiklet Kaskı Mat Siyah XL";
    expect(r(src, "LS2 FF353 Rapid Motosiklet Kaskı Parlak Beyaz L")).toBeGreaterThanOrEqual(0.85);
  });
  it("a different model of the same brand/family scores lower than the same model", () => {
    const src = "LS2 FF353 Rapid Motosiklet Kaskı";
    expect(r(src, "LS2 FF320 Stream Motosiklet Kaskı")).toBeLessThan(r(src, "LS2 FF353 Rapid Kask"));
  });
});

describe("relevance: accessories and unrelated items", () => {
  it("accessory for the product is penalised", () => {
    const src = "LS2 FF353 Rapid Motosiklet Kaskı";
    expect(r(src, "LS2 FF353 Rapid Kask Vizörü Füme")).toBeLessThan(0.4);
    expect(r(src, "Motosiklet Kaskı İç Astar Yedek Parça")).toBeLessThan(0.4);
  });
  it("different category, same brand, is weak", () => {
    expect(r("Xiaomi Redmi Buds 4 Pro Kablosuz Kulaklık", "Xiaomi Mi Band 8 Akıllı Bileklik")).toBeLessThan(0.5);
  });
  it("unknown categories on both sides fall back to token overlap", () => {
    expect(r("Zorlu Gadget XQ-100 Pro", "Zorlu Gadget XQ-100 Pro Yeni")).toBeGreaterThanOrEqual(0.8);
    expect(r("Zorlu Gadget XQ-100 Pro", "Başka Bir Şey")).toBeLessThan(0.4);
  });
  it("reasons explain the score", () => {
    const d = relevanceDetail("LS2 FF353 Rapid Motosiklet Kaskı", "LS2 FF353 Rapid Kask");
    expect(d.modelHit).toBe(true);
    expect(d.reasons[0]).toBe("model numarası eşleşti");
  });
});

describe("relevance helpers", () => {
  it("categoryKeys bridges scripts and ignores false substrings", () => {
    expect(categoryKeys("无线蓝牙耳机 TWS")).toContain("kulaklik");
    expect(categoryKeys("Kablosuz Kulaklık Bluetooth")[0]).toBe("kablosuz kulaklik");
    expect(categoryKeys("LS2 FF353 Rapid Full Face Motorcycle Helmet")[0]).toBe("motosiklet kaski");
    // "helmet" must not match the glossary word "el" (hand) by substring.
    expect(categoryKeys("Motorcycle Helmet")).not.toContain("el");
  });
  it("categoryAgreement", () => {
    expect(categoryAgreement(["kask"], ["kask"])).toBe(1);
    expect(categoryAgreement(["motosiklet kaski"], ["kask"])).toBe(0.8);
    expect(categoryAgreement(["kask"], ["termos"])).toBe(0);
    expect(categoryAgreement([], ["termos"])).toBe(0.5);
  });
  it("pickBest takes the cheapest within the highest band", () => {
    const best = pickBest([
      { item: "cheap-generic", score: 0.55, price: 10 },
      { item: "exact-expensive", score: 0.9, price: 50 },
      { item: "exact-cheaper", score: 0.85, price: 40 },
      { item: "no-price", score: 0.95, price: null },
    ]);
    expect(best).toBe("exact-cheaper");
    expect(pickBest([{ item: "x", score: 0.3, price: 1 }])).toBeUndefined();
  });
  it("signals are cached and scoring 5000 pairs stays fast", () => {
    clearRelevanceCache();
    const src = "LS2 FF353 Rapid Motosiklet Kaskı Mat Siyah XL";
    const cands = Array.from({ length: 250 }, (_, i) => `Kask Model ${i} Motosiklet Kaskı Full Face ${i % 3 ? "Siyah" : "Beyaz"} ${i % 5 ? "LS2" : "AGV"}`);
    const t0 = performance.now();
    let n = 0;
    for (let k = 0; k < 20; k++) for (const c of cands) { r(src, c); n++; }
    const ms = performance.now() - t0;
    expect(n).toBe(5000);
    expect(ms).toBeLessThan(300);
    expect(titleSignals(src)).toBe(titleSignals(src));
  });
});
