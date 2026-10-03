import { describe, expect, it } from "vitest";
import type { RawListing } from "@manufactogate/core";
import { money } from "./format";
import { counterLines, listingHint, PRICE_ON_REQUEST_TEXT, priceText, ratingText, supplierFromListing, supplierSignals, titleLangNote, unitText } from "./listingFields";

const L = (over: Partial<RawListing> = {}): RawListing => ({
  market: "cn-alibaba",
  id: "1",
  url: "https://www.alibaba.com/product-detail/1.html",
  title: "Wireless Earbuds",
  images: [],
  price: { currency: "USD", tiers: [{ minQty: 1, unitPrice: 14.49 }] },
  badges: [],
  fetchedAt: "2026-10-01T00:00:00Z",
  ...over,
});

describe("listing fields", () => {
  it("listingHint carries the seen URL and the seller id for seller-specific detail pages", () => {
    expect(listingHint(L({ url: "https://www.trendyol.com/x/y-p-123?merchantId=77", supplierId: "77" }))).toEqual({ url: "https://www.trendyol.com/x/y-p-123?merchantId=77", supplierId: "77" });
    expect(listingHint(L({ url: "" }))).toEqual({});
    expect(listingHint(L())).toEqual({ url: "https://www.alibaba.com/product-detail/1.html" });
  });
  it("priceText shows ranges from priceMax and 'Fiyat teklifle' for price-on-request", () => {
    expect(priceText(L())).toBe(money(14.49, "USD"));
    expect(priceText(L({ priceMax: 14.99 }))).toBe(`${money(14.49, "USD")} – ${money(14.99, "USD")}`);
    expect(priceText(L({ price: { currency: "USD", tiers: [] }, priceOnRequest: true }))).toBe(PRICE_ON_REQUEST_TEXT);
    expect(priceText(L({ price: { currency: "USD", tiers: [] } }))).toBe(PRICE_ON_REQUEST_TEXT);
    expect(priceText(L({ price: { currency: "CNY", tiers: [{ minQty: 1, unitPrice: 20 }, { minQty: 100, unitPrice: 15 }] } }))).toBe(`${money(15, "CNY")} – ${money(20, "CNY")}`);
  });
  it("unitText describes pack prices and unit labels", () => {
    expect(unitText(L())).toBe("");
    expect(unitText(L({ packQty: 10 }))).toBe("10 adetlik paket");
    expect(unitText(L({ packQty: 10, unitLabel: "套" }))).toBe("10 adetlik paket · birim: 套");
  });
  it("counterLines labels sold and review counts from the real fields, falling back to the market default", () => {
    expect(counterLines(L({ market: "tr-trendyol", sold: 844 }))).toEqual([{ key: "reviews", text: "844 değerlendirme" }]);
    expect(counterLines(L({ market: "cn-1688", sold: 1250, soldPeriod: "30d" }))).toEqual([{ key: "sold", text: "1.250 satış/30 gün" }]);
    expect(counterLines(L({ market: "cn-1688", sold: 1250, soldPeriod: "total", reviewCount: 30 }))).toEqual([
      { key: "sold", text: "1.250 satış" },
      { key: "reviews", text: "30 değerlendirme" },
    ]);
    // Trendyol: sold is the review count and reviewCount carries the same number: one line only.
    expect(counterLines(L({ market: "tr-trendyol", sold: 844, soldPeriod: "reviews", reviewCount: 844 }))).toEqual([{ key: "reviews", text: "844 değerlendirme" }]);
    expect(counterLines(L({ market: "cn-alibaba", reviewCount: 12 }))).toEqual([{ key: "reviews", text: "12 değerlendirme" }]);
    expect(counterLines(L())).toEqual([]);
  });
  it("ratingText normalises percent ratings to 5", () => {
    expect(ratingText(L())).toBe("");
    expect(ratingText(L({ rating: 4.7 }))).toBe("Puan 4.7");
    expect(ratingText(L({ rating: 96, ratingMax: 100 }))).toBe("Puan 4.8 (%96)");
  });
  it("supplierSignals reads years, verified, business type and shop rating, with the profile filling gaps", () => {
    expect(supplierSignals(L())).toEqual([]);
    const s = supplierSignals(L({ supplier: { years: 16, verified: true, businessType: "factory", rating: 4.8, ratingCount: 120 } }));
    expect(s.map((x) => x.label)).toEqual(["16 yıldır pazarda", "Doğrulanmış tedarikçi", "Üretici", "Mağaza puanı 4.8 (120)"]);
    expect(s.map((x) => x.tone)).toEqual(["success", "success", "success", "success"]);
    const fromProfile = supplierSignals(L(), { market: "cn-1688", id: "s", url: "", name: "x", badges: [], yearsOnPlatform: 1, businessType: "trading" });
    expect(fromProfile.map((x) => `${x.key}:${x.tone}`)).toEqual(["years:warning", "businessType:neutral"]);
    expect(supplierSignals(L({ supplier: { rating: 90 } }))[0]!.label).toBe("Mağaza puanı 4.5");
  });
  it("supplierFromListing builds a profile from card signals and merges into a fetched profile", () => {
    expect(supplierFromListing(L())).toBeUndefined();
    const built = supplierFromListing(L({ supplierId: "77", supplierName: "Shenzhen Co", location: "Guangdong", supplier: { years: 8, verified: true, businessType: "factory" } }))!;
    expect(built).toMatchObject({ market: "cn-alibaba", id: "77", name: "Shenzhen Co", location: "Guangdong", yearsOnPlatform: 8, businessType: "factory", badges: ["verified-supplier"] });
    const profile = { market: "cn-alibaba" as const, id: "77", url: "u", name: "Real", badges: ["gold-supplier"], businessType: "unknown" as const };
    const merged = supplierFromListing(L({ supplier: { years: 8, verified: true, businessType: "factory" } }), profile)!;
    expect(merged.name).toBe("Real");
    expect(merged.yearsOnPlatform).toBe(8);
    expect(merged.businessType).toBe("factory");
    expect(merged.badges).toEqual(["gold-supplier", "verified-supplier"]);
    expect(supplierFromListing(L(), profile)).toBe(profile);
  });
  it("titleLangNote only speaks up when the page language differs from the market's", () => {
    expect(titleLangNote(L(), "en")).toBe("");
    expect(titleLangNote(L({ titleLang: "en" }), "en")).toBe("");
    expect(titleLangNote(L({ titleLang: "en-US" }), "zh")).toBe("Başlık pazarda İngilizce gösterildi");
    expect(titleLangNote(L({ titleLang: "xx" }), "zh")).toBe("");
  });
});
