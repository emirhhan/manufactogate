import { afterEach, describe, expect, it } from "vitest";
import type { RawListing } from "@manufactogate/core";
import { compareToCsv, csvCell, listingsToCsv, listingsToXls, metaLines, sellersToCsv } from "./export";
import { clearRateOverrides, convert, setDisplayCurrency, setRateOverride } from "./fx";

afterEach(() => {
  clearRateOverrides();
  setDisplayCurrency("TRY");
});

const L = (over: Partial<RawListing> = {}): RawListing => ({
  market: "cn-1688",
  id: "1",
  url: "https://detail.1688.com/offer/1.html",
  title: "无线耳机; TWS",
  images: [],
  price: { currency: "CNY", tiers: [{ minQty: 1, unitPrice: 10 }, { minQty: 100, unitPrice: 8 }] },
  badges: ["源头工厂"],
  fetchedAt: "2026-10-01T00:00:00Z",
  ...over,
});
const name = (m: string) => m.toUpperCase();

describe("export", () => {
  it("csvCell neutralises formula injection and quotes separators", () => {
    expect(csvCell("=SUM(A1)")).toBe("'=SUM(A1)");
    expect(csvCell("+1")).toBe("'+1");
    expect(csvCell("@cmd")).toBe("'@cmd");
    expect(csvCell("-5")).toBe("-5");
    expect(csvCell(-5)).toBe("-5");
    expect(csvCell("a;b")).toBe('"a;b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell(null)).toBe("");
  });
  it("listingsToCsv carries meta, score, display currency and sold label", () => {
    setRateOverride("CNY", 5);
    const csv = listingsToCsv([L({ sold: 120, soldPeriod: "reviews" }), L({ id: "2", market: "tr-trendyol", price: { currency: "TRY", tiers: [{ minQty: 1, unitPrice: 300 }] }, sold: 40 })], name, { score: (l) => (l.id === "1" ? 0.87 : undefined), meta: { query: "kulaklık", markets: ["1688"] } });
    const lines = csv.replace("﻿", "").split("\n");
    expect(lines[0]).toContain("# Manufactogate");
    expect(lines[1]).toBe("# sorgu: kulaklık");
    expect(lines[2]).toBe("# pazarlar: 1688");
    expect(lines[3]).toContain("1 CNY = 5.0000 TRY");
    const head = lines.find((l) => l.startsWith("pazar;"))!;
    expect(head).toContain("yaklasik_try");
    expect(head).toContain("sayac_turu");
    expect(head).toContain("eslesme_yuzde");
    const row1 = lines[lines.indexOf(head) + 1]!;
    expect(row1).toContain('"无线耳机; TWS"');
    expect(row1).toContain(";40;"); // ≈ TRY: 8 * 5
    expect(row1).toContain(";değerlendirme;");
    expect(row1).toContain(";87;");
    const row2 = lines[lines.indexOf(head) + 2]!;
    expect(row2).toContain(";değerlendirme;"); // tr-trendyol sold = review count
  });
  it("display currency changes the ≈ column", () => {
    setDisplayCurrency("USD");
    const csv = listingsToCsv([L()], name);
    expect(csv).toContain("yaklasik_usd");
    expect(csv).toContain(`;${convert(8, "CNY", "USD")!.toFixed(2)};`);
  });
  it("xls has a second sheet with assumptions and typed numbers", () => {
    const xml = listingsToXls([L()], name, { meta: { query: "q" } });
    expect(xml).toContain('<Worksheet ss:Name="Varsayımlar">');
    expect(xml).toContain('<Data ss:Type="Number">8</Data>');
    expect(xml).toContain("sorgu: q");
  });
  it("compareToCsv is one column per listing", () => {
    const csv = compareToCsv([{ listing: L(), marketName: "1688", landedPerUnit: 123.4, landedCurrency: "TRY", qty: 100, score: 0.9 }, { listing: L({ id: "2" }), marketName: "1688", landedPerUnit: null, landedCurrency: "TRY", qty: null }]);
    expect(csv).toContain("Alan;İlan 1;İlan 2");
    expect(csv).toContain("İndirilmiş maliyet / adet;123.40 TRY;");
    expect(csv).toContain("Eşleşme %;90;");
  });
  it("sellersToCsv", () => {
    const csv = sellersToCsv([{ key: "k", market: "tr-trendyol", marketName: "Trendyol", name: "Mağaza #1", id: "1", url: "https://t/1", listings: 2, cheapest: L(), minPrice: 250, currency: "TRY", reviews: 10, rating: 4.5, badges: [] }]);
    expect(csv).toContain("pazar;satici;satici_id");
    expect(csv).toContain("Trendyol;Mağaza #1;1;2;250;TRY;10;4.5;;https://t/1;");
  });
  it("metaLines lists unknown rates", () => {
    expect(metaLines(undefined, ["XYZ"]).join("\n")).toContain("XYZ: kur yok");
  });
});
