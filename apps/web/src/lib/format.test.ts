import { describe, expect, it } from "vitest";
import { compact, priceRange, shortId, soldLabel, soldText } from "./format";

describe("format: sold labels", () => {
  it("labels review-count markets as değerlendirme", () => {
    expect(soldLabel("tr-trendyol")).toBe("değerlendirme");
    expect(soldLabel("tr-hepsiburada")).toBe("değerlendirme");
    expect(soldLabel("tr-amazon")).toBe("değerlendirme");
    expect(soldLabel("cn-1688")).toBe("satış");
  });
  it("explicit soldPeriod wins over the market set", () => {
    expect(soldLabel("cn-1688", "30d")).toBe("satış/30 gün");
    expect(soldLabel("tr-trendyol", "total")).toBe("satış");
    expect(soldLabel("cn-taobao", "reviews")).toBe("değerlendirme");
  });
  it("soldText formats numbers and falls back to reviewCount", () => {
    expect(soldText({ market: "tr-trendyol", sold: 1250 })).toBe("1.250 değerlendirme");
    expect(soldText({ market: "cn-1688", sold: 30, soldPeriod: "30d" })).toBe("30 satış/30 gün");
    expect(soldText({ market: "cn-1688", reviewCount: 7 })).toBe("7 değerlendirme");
    expect(soldText({ market: "cn-1688" })).toBe("");
  });
  it("priceRange handles price-on-request", () => {
    expect(priceRange({ currency: "USD", tiers: [] })).toBe("teklif iste");
  });
  it("shortId and compact", () => {
    expect(shortId("1234567890123456789")).toMatch(/^123456789…6789$/);
    expect(shortId("abc")).toBe("abc");
    expect(compact(1250)).toMatch(/1,[23]/);
  });
});
