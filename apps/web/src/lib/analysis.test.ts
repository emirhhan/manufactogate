import { beforeAll, describe, expect, it } from "vitest";
import type { RawListing } from "@manufactogate/core";
import { getCountryProfile } from "@manufactogate/country-profiles";
import { analyzeResults, bestByRole, buildChain, histogram, hsSuggest, median, pickQty, quantile, rankManufacturers, rateFor, scenario, sellersOf, supplierRisk, supplierScore } from "./analysis";
import { setDataSource } from "./registry";

beforeAll(() => setDataSource("mock"));

const L = (p: Omit<Partial<RawListing>, "price"> & { market: RawListing["market"]; id: string; price: number | number[]; currency?: string }): RawListing => {
  const prices = Array.isArray(p.price) ? p.price : [p.price];
  const rest: Omit<typeof p, "price" | "currency"> & { price?: unknown; currency?: unknown } = { ...p };
  const currency = p.currency;
  delete rest.price;
  delete rest.currency;
  return { url: `https://x/${p.id}`, title: p.title ?? "Kablosuz Kulaklık", images: [], badges: [], fetchedAt: "2026-10-01T00:00:00Z", ...rest, price: { currency: currency ?? "TRY", tiers: prices.map((v, i) => ({ minQty: i === 0 ? 1 : i * 100, unitPrice: v })) } };
};
const OPTS = { targetCountry: "tr", fx: 4.7, weightKg: 0.3, shippingKey: "air", overheadRate: 0.08 };

describe("analysis helpers", () => {
  it("median handles odd/even/empty", () => {
    expect(median([])).toBeNull();
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
  });
  it("quantile clamps", () => {
    expect(quantile([10, 20, 30, 40], 0.25)).toBe(20);
    expect(quantile([5], 0.9)).toBe(5);
  });
  it("hs suggestion by group", () => {
    expect(hsSuggest("motorcycle")?.hs).toBe("6506");
    expect(hsSuggest("nope")).toBeNull();
    expect(hsSuggest(undefined)).toBeNull();
  });
  it("pickQty: user, second tier, max(moq,100)", () => {
    const tiers = [{ minQty: 1, unitPrice: 10 }, { minQty: 50, unitPrice: 9 }, { minQty: 500, unitPrice: 8 }];
    expect(pickQty(tiers, 2, 300)).toBe(300);
    expect(pickQty(tiers, 2)).toBe(50);
    expect(pickQty([{ minQty: 1, unitPrice: 10 }], 2)).toBe(100);
    expect(pickQty([{ minQty: 1, unitPrice: 10 }], 250)).toBe(250);
  });
  it("rateFor prefers the user's CNY rate", () => {
    expect(rateFor("CNY", "TRY", 5)).toBe(5);
    expect(rateFor("CNY", "USD", 5)).toBeCloseTo(5 / 34, 6);
    expect(rateFor("USD", "TRY", 5)).toBe(34);
    expect(rateFor("XYZ", "TRY", 5)).toBeNull();
    expect(rateFor("TRY", "TRY", 5)).toBe(1);
  });
});

describe("analyzeResults", () => {
  const source = [L({ market: "cn-1688", id: "a", price: [20, 18, 15], currency: "CNY", sold: 500, supplierName: "深圳工厂" }), L({ market: "cn-taobao", id: "b", price: 30, currency: "CNY" })];
  const target = [L({ market: "tr-trendyol", id: "t1", price: 400, supplierId: "1" }), L({ market: "tr-trendyol", id: "t2", price: 450, supplierId: "2" }), L({ market: "tr-trendyol", id: "t3", price: 500 })];
  it("counts sellers only when known and reports unknown listings", () => {
    const a = analyzeResults([...source, ...target], OPTS);
    expect(a.target.sellers).toBe(2);
    expect(a.target.sellersUnknownListings).toBe(1);
    expect(a.target.count).toBe(3);
    expect(a.verdicts.some((v) => v.text.includes("≥2 satıcı"))).toBe(true);
  });
  it("does not warn about competition when most sellers are unknown", () => {
    const many = Array.from({ length: 60 }, (_, i) => L({ market: "tr-hepsiburada", id: `h${i}`, price: 400 + i }));
    const a = analyzeResults([...source, ...many], OPTS);
    expect(a.verdicts.some((v) => v.text.startsWith("Rekabet yoğun"))).toBe(false);
    expect(a.sub.competition).toBe(6);
  });
  it("uses the Settings CNY rate for the landed cost", () => {
    const a1 = analyzeResults([...source, ...target], { ...OPTS, fx: 4.7 });
    const a2 = analyzeResults([...source, ...target], { ...OPTS, fx: 6 });
    expect(a2.landedPerUnit!).toBeGreaterThan(a1.landedPerUnit!);
    expect(a1.landedFrom?.id).toBe("a");
  });
  it("filters by relevance when at least 5 remain and reports basedOn", () => {
    const noise = Array.from({ length: 6 }, (_, i) => L({ market: "tr-trendyol", id: `n${i}`, price: 5, title: "Vizör" }));
    const rel = (l: RawListing) => (l.title === "Vizör" ? 0.2 : 0.9);
    const a = analyzeResults([...source, ...target, ...noise], { ...OPTS, relevanceOf: rel });
    expect(a.basedOn).toEqual({ used: 5, total: 11, filtered: true });
    expect(a.target.median).toBe(450);
    const b = analyzeResults([...source, ...noise.slice(0, 2)], { ...OPTS, relevanceOf: rel });
    expect(b.basedOn.filtered).toBe(false);
  });
  it("scores: margin component scales to 50 at 30 %, demand neutral without counters, score is the sum", () => {
    const a = analyzeResults([L({ market: "cn-1688", id: "a", price: 2, currency: "CNY" }), ...target], { ...OPTS, weightKg: 0.05 });
    expect(a.sub.demand).toBe(10);
    expect(a.marginAtMedian!.rate).toBeGreaterThan(0);
    // Margin component is linear up to 30 % (then capped at 50); the engine's exact figures belong to core's tests.
    expect(a.sub.margin).toBe(Math.round(Math.min(50, (a.marginAtMedian!.rate / 0.3) * 50) * 10) / 10);
    expect(a.score).toBe(Math.round(a.sub.margin + a.sub.demand + a.sub.availability + a.sub.competition));
    expect(a.sub.competition).toBe(8);
    expect(a.chain?.map((s) => s.key)).toEqual(["source", "landed", "sell", "net"]);
  });
  it("bestByRole respects relevance and currency", () => {
    const all = [...source, ...target, L({ market: "cn-1688", id: "zz", price: 1, currency: "XYZ" })];
    expect(bestByRole(all, "source", { targetCountry: "tr", currency: "TRY", cnyTry: 4.7 })?.id).toBe("a");
    expect(bestByRole(all, "target", { targetCountry: "tr", currency: "TRY" })?.id).toBe("t1");
    expect(bestByRole(all, "source", { targetCountry: "tr", currency: "TRY", relevanceOf: (l) => (l.id === "a" ? 0.1 : 0.9) })?.id).toBe("b");
  });
});

describe("chain, scenario, histogram, sellers", () => {
  it("buildChain computes deltas and net margin", () => {
    const steps = buildChain({ sourceLabel: "1688", sourceUnit: 10, sourceCurrency: "CNY", landedPerUnit: 100, sell: { label: "TY", price: 200 }, net: 50, currency: "TRY", cnyTry: 5 });
    expect(steps.map((s) => s.key)).toEqual(["source", "landed", "sell", "net"]);
    expect(steps[0]!.amount).toBe(50);
    expect(steps[1]!.delta).toBeCloseTo(1, 6);
    expect(steps[3]!.delta).toBeCloseTo(0.25, 6);
  });
  it("scenario picks the tier for the quantity and guards the shipping key", () => {
    const tr = getCountryProfile("tr")!;
    const l = L({ market: "cn-1688", id: "a", price: [20, 18, 15], currency: "CNY" });
    const sc = scenario(tr, l, { qty: 150, shippingKey: "nope", weightKg: 0.3, cnyTry: 5 })!;
    expect(sc.qty).toBe(150);
    expect(sc.tierIndex).toBe(1);
    expect(sc.shippingKey).toBe(tr.shipping[0]!.key);
    expect(sc.cost.tierUsed.unitPrice).toBe(18);
    expect(scenario(tr, L({ market: "cn-1688", id: "b", price: 1, currency: "XYZ" }), { weightKg: 0.3 })).toBeNull();
    expect(scenario(tr, { price: { currency: "CNY", tiers: [] } }, { weightKg: 0.3 })).toBeNull();
  });
  it("histogram switches to log bins for wide ranges", () => {
    const lin = histogram([1, 2, 3, 4, 5, 6], 3)!;
    expect(lin.log).toBe(false);
    expect(lin.bins.reduce((s, b) => s + b.count, 0)).toBe(6);
    const log = histogram([1, 10, 100, 1000, 10000], 4)!;
    expect(log.log).toBe(true);
    expect(log.bins.length).toBe(4);
    expect(log.bins.reduce((s, b) => s + b.count, 0)).toBe(5);
    expect(histogram([])).toBeNull();
    expect(histogram([5, 5])!.bins).toHaveLength(1);
  });
  it("sellersOf groups by seller with cheapest offer and store link", () => {
    const rows = sellersOf([
      L({ market: "tr-trendyol", id: "1", price: 300, supplierId: "77" }),
      L({ market: "tr-trendyol", id: "2", price: 250, supplierId: "77", sold: 120, soldPeriod: "reviews" }),
      L({ market: "tr-trendyol", id: "3", price: 100 }),
      L({ market: "tr-hepsiburada", id: "4", price: 280, supplierName: "ABC Store" }),
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0]!.name).toBe("Mağaza #77");
    expect(rows[0]!.minPrice).toBe(250);
    expect(rows[0]!.listings).toBe(2);
    expect(rows[0]!.reviews).toBe(120);
    expect(rows[0]!.url).toContain("trendyol.com/magaza/-m-77");
    expect(rows[1]!.name).toBe("ABC Store");
  });
});

describe("supplier intelligence", () => {
  it("supplierScore uses profile fields", () => {
    const l = L({ market: "cn-1688", id: "a", price: [10, 9, 8], currency: "CNY", supplierName: "深圳市实业有限公司", moq: 100 });
    const base = supplierScore(l).factory;
    const withFactory = supplierScore(l, { market: "cn-1688", id: "s", url: "", name: "x", badges: [], businessType: "factory", yearsOnPlatform: 8, repeatPurchaseRate: 0.4 }).factory;
    expect(withFactory).toBeGreaterThan(base);
    expect(supplierScore(L({ market: "cn-1688", id: "t", price: 10, currency: "CNY", supplierName: "义乌商贸" })).factory).toBeLessThan(base);
  });
  it("supplierRisk flags new stores, missing badges and inconsistent prices", () => {
    const peers = [10, 11, 12, 13, 9].map((p, i) => L({ market: "cn-1688", id: `p${i}`, price: p, currency: "CNY" }));
    const l = L({ market: "cn-1688", id: "me", price: 2, currency: "CNY" });
    const flags = supplierRisk(l, { market: "cn-1688", id: "s", url: "", name: "x", badges: [], yearsOnPlatform: 1, responseRate: 0.5 }, peers);
    const texts = flags.map((f) => f.text);
    expect(texts.some((t) => t.startsWith("Yeni mağaza"))).toBe(true);
    expect(texts.some((t) => t.includes("tutarsız fiyat"))).toBe(true);
    expect(texts.some((t) => t.startsWith("Yanıt oranı"))).toBe(true);
    expect(texts).toContain("Doğrulama etiketi yok");
  });
  it("rankManufacturers puts verified, cheaper, tiered suppliers first", () => {
    const a = L({ market: "cn-1688", id: "a", price: [10, 9, 8], currency: "CNY", supplierName: "工厂", badges: ["源头工厂"], moq: 100 });
    const b = L({ market: "cn-1688", id: "b", price: 14, currency: "CNY", supplierName: "商贸" });
    const c = L({ market: "cn-taobao", id: "c", price: 12, currency: "CNY" });
    const r = rankManufacturers([b, c, a]);
    expect(r[0]!.listing.id).toBe("a");
    expect(r[0]!.factory).toBeGreaterThan(r[2]!.factory);
    expect(r[0]!.pricePosition).toBeLessThan(1);
  });
});
