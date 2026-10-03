import { beforeAll, describe, expect, it } from "vitest";
import { applyCountryOverrides, type RawListing } from "@manufactogate/core";
import { getCountryProfile } from "@manufactogate/country-profiles";
import { scenario } from "./analysis";
import { listingEconomics } from "./listingEconomics";
import { setDataSource } from "./registry";
import { DEFAULT_COST } from "@/store/settings";

beforeAll(() => setDataSource("mock"));

const L = (market: RawListing["market"], id: string, currency: string, ...prices: number[]): RawListing => ({
  market,
  id,
  url: `https://x/${id}`,
  title: "Kablosuz Kulaklık",
  images: [],
  price: { currency, tiers: prices.map((p, i) => ({ minQty: i === 0 ? 1 : i * 100, unitPrice: p })) },
  badges: [],
  fetchedAt: "2026-10-01T00:00:00Z",
});
const tr = getCountryProfile("tr")!;
const cost = { ...DEFAULT_COST, fxCnyTry: 5 };
const name = (m: string) => m.toUpperCase();

describe("listingEconomics", () => {
  const source = L("cn-1688", "a", "CNY", 20, 18, 15);
  const target = L("tr-trendyol", "t", "TRY", 600);
  it("source listing: scenario → landed → best target → VAT-aware net", () => {
    const sc = scenario(tr, source, { qty: 200, shippingKey: "air", weightKg: 0.2, cnyTry: 5 })!;
    const e = listingEconomics({ isSource: true, profile: tr, listing: source, bestTarget: target, bestSource: undefined, scenario: sc, calc: null, cost, marketName: name })!;
    expect(e.qty).toBe(200);
    expect(e.landed).toBe(sc.cost.perUnit);
    expect(e.sell).toBe(600);
    expect(e.marketplaceId).toBe("tr-trendyol");
    expect(e.chain.map((s) => s.key)).toEqual(["source", "landed", "sell", "net"]);
    // Import VAT inside the landed cost is recovered: net is higher than a margin computed from the plain per-unit figure.
    const naiveNet = 600 / (1 + (tr.salesVatRate ?? 0)) - 600 * e.margin!.commissionRate - 600 * cost.overheadRate - sc.cost.perUnit;
    expect(e.margin!.netPerUnit).toBeGreaterThan(naiveNet);
    expect(e.margin!.netPerUnit).toBeCloseTo(naiveNet + sc.cost.vatPerUnit, 6);
  });
  it("source listing without a scenario or without a target match", () => {
    expect(listingEconomics({ isSource: true, profile: tr, listing: source, bestTarget: target, bestSource: undefined, scenario: null, calc: null, cost, marketName: name })).toBeNull();
    const sc = scenario(tr, source, { qty: 200, weightKg: 0.2, cnyTry: 5 })!;
    const e = listingEconomics({ isSource: true, profile: tr, listing: source, bestTarget: undefined, bestSource: undefined, scenario: sc, calc: null, cost, marketName: name })!;
    expect(e.sell).toBeNull();
    expect(e.margin).toBeNull();
    expect(e.chain.map((s) => s.key)).toEqual(["source", "landed"]);
  });
  it("target listing: best source → landed at the calculator's inputs → margin at this listing's price", () => {
    const e = listingEconomics({ isSource: false, profile: tr, listing: target, bestTarget: undefined, bestSource: source, scenario: null, calc: { qty: 500, shippingKey: "sea", weightKg: 0.1, hsCode: "851830" }, cost, marketName: name })!;
    expect(e.qty).toBe(500);
    expect(e.sourceListing).toBe(source);
    expect(e.sellFrom).toBe(target);
    expect(e.sell).toBe(600);
    expect(e.chain[0]!.label).toBe("CN-1688 birim (500 adet)");
    expect(e.chain[2]!.label).toBe("TR-TRENDYOL bu ilan");
    expect(e.margin!.marginRate).toBeLessThan(1);
    expect(listingEconomics({ isSource: false, profile: tr, listing: target, bestTarget: undefined, bestSource: undefined, scenario: null, calc: null, cost, marketName: name })).toBeNull();
    expect(listingEconomics({ isSource: false, profile: tr, listing: target, bestTarget: undefined, bestSource: L("cn-1688", "z", "XYZ", 1), scenario: null, calc: null, cost, marketName: name })).toBeNull();
  });
  it("the user's country overrides change the numbers", () => {
    const edited = applyCountryOverrides(tr, { vatRate: 0.01, commissions: { "tr-trendyol": 0.01 } });
    const base = listingEconomics({ isSource: false, profile: tr, listing: target, bestTarget: undefined, bestSource: source, scenario: null, calc: null, cost, marketName: name })!;
    const over = listingEconomics({ isSource: false, profile: edited, listing: target, bestTarget: undefined, bestSource: source, scenario: null, calc: null, cost, marketName: name })!;
    expect(over.margin!.commissionRate).toBe(0.01);
    expect(over.margin!.netPerUnit).toBeGreaterThan(base.margin!.netPerUnit);
  });
});
