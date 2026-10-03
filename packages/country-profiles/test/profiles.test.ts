import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { computeLandedCost, computeMargin, convert, dutyRateFor, HS_BY_GROUP, HS_BY_LEAF, type CountryProfile } from "@manufactogate/core";
import { COUNTRY_NAMES_TR, COUNTRY_PROFILES, getCountryProfile, marketplacesOf, profilesForMarket, REFERENCE_FX } from "../src";

const here = dirname(fileURLToPath(import.meta.url));

/** Registry market ids → country, read from the adapters sources (no package dependency). */
function registryMarkets(): Record<string, string> {
  const out: Record<string, string> = {};
  const files = ["markets.ts", "wave2/index.ts", "wave3/index.ts"].map((f) => join(here, "../../adapters/src", f));
  for (const f of files) {
    let src = "";
    try {
      src = readFileSync(f, "utf8");
    } catch {
      continue;
    }
    for (const m of src.matchAll(/id:\s*"([a-z]+-[a-z0-9]+)"[\s\S]{0,200}?country:\s*"([a-z]{2})"/g)) out[m[1]!] = m[2]!;
  }
  // markets.ts defines the four wave-1 metas without ids.
  Object.assign(out, { "cn-1688": "cn", "cn-taobao": "cn", "cn-pinduoduo": "cn", "tr-trendyol": "tr" });
  return out;
}
/** Marketplaces that sell in a country other than their registry country. */
const PAN_REGION: Record<string, string[]> = { "de-amazon": ["nl", "pl", "ro", "fr", "it", "es"], "us-ebay": ["gb"], "ae-noon": ["sa"] };

describe("country profiles", () => {
  const all = Object.values(COUNTRY_PROFILES);
  it("every profile is dated, sourced, named and computes", () => {
    for (const p of all) {
      expect(p.asOf).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(p.sources.length).toBeGreaterThan(0);
      expect(p.shipping.length).toBeGreaterThan(0);
      expect(COUNTRY_NAMES_TR[p.country]).toBeDefined();
      expect(p.salesVatRate).toBeDefined();
      expect(REFERENCE_FX.rates[p.currency]).toBeGreaterThan(0);
      const r = computeLandedCost(p, { quantity: 100, tiers: [{ minQty: 1, unitPrice: 2 }], fxRate: 1, unitWeightKg: 0.2, shippingKey: p.shipping[0]!.key });
      expect(r.total).toBeGreaterThan(0);
    }
  });
  it("covers every target-market country in the registry", () => {
    const reg = registryMarkets();
    expect(Object.keys(reg).length).toBeGreaterThan(20);
    for (const country of new Set(Object.values(reg))) if (country !== "cn") expect(COUNTRY_PROFILES[country], country).toBeDefined();
  });
  it("commission keys are registry ids that sell in the profile's country", () => {
    const reg = registryMarkets();
    for (const p of all) {
      for (const id of Object.keys(p.commissions)) {
        expect(reg[id], `${p.country}: ${id}`).toBeDefined();
        const ok = reg[id] === p.country || PAN_REGION[id]?.includes(p.country);
        expect(ok, `${p.country} lists ${id} (${reg[id]})`).toBe(true);
      }
      for (const id of marketplacesOf(p)) expect(p.commissions[id], `${p.country}: ${id} has no commission`).toBeDefined();
      for (const [mk, groups] of Object.entries(p.commissionsByGroup ?? {})) {
        expect(p.commissions[mk]).toBeDefined();
        for (const rate of Object.values(groups)) expect(rate).toBeLessThan(0.4);
      }
    }
    expect(profilesForMarket("de-amazon").map((p) => p.country)).toContain("nl");
    expect(profilesForMarket("tr-trendyol").map((p) => p.country)).toEqual(["tr"]);
  });
  it("tax lines are ordered by their base and rates are sane", () => {
    const order = { cif: 0, "cif+duty": 1, "cif+duty+extra": 2 };
    for (const p of all) {
      let last = -1;
      for (const t of p.taxes) {
        expect(order[t.base], `${p.country}: ${t.key}`).toBeGreaterThanOrEqual(last);
        last = Math.max(last, order[t.base]);
        expect(t.rate).toBeGreaterThanOrEqual(0);
        expect(t.rate).toBeLessThan(1);
        for (const r of Object.values(t.rateByHs ?? {})) expect(r).toBeLessThan(1);
      }
      expect(p.taxes.filter((t) => t.key === "vat").length).toBeLessThanOrEqual(1);
      for (const r of Object.values(p.dutyByHs)) expect(r).toBeLessThan(1);
      expect(p.deMinimis).toBeUndefined();
    }
  });
  it("duty tables cover every chapter the HS suggestion uses (TR and EU)", () => {
    for (const p of [COUNTRY_PROFILES["tr"]!, COUNTRY_PROFILES["de"]!]) {
      for (const [hs] of Object.values(HS_BY_GROUP)) {
        const keys = Object.keys(p.dutyByHs).filter((k) => k !== "default" && hs.startsWith(k));
        expect(keys.length, `${p.country} lacks chapter for ${hs}`).toBeGreaterThan(0);
      }
    }
    const tr = COUNTRY_PROFILES["tr"]!;
    const covered = Object.values(HS_BY_LEAF).filter(([hs]) => Object.keys(tr.dutyByHs).some((k) => k !== "default" && hs.startsWith(k))).length;
    expect(covered / Object.keys(HS_BY_LEAF).length).toBeGreaterThan(0.95);
  });
  it("asOf is not older than 12 months (warn)", () => {
    const stale = all.filter((p) => Date.now() - new Date(p.asOf).getTime() > 366 * 86_400_000);
    if (stale.length) console.warn(`stale profiles: ${stale.map((p) => p.country).join(", ")}`);
    expect(stale.length).toBeLessThanOrEqual(all.length);
  });
  it("lookup is case-insensitive", () => {
    expect(getCountryProfile("TR")?.currency).toBe("TRY");
    expect(getCountryProfile("xx")).toBeUndefined();
    expect(getCountryProfile("jp")?.currency).toBe("JPY");
  });
  it("reference fx converts between every profile currency", () => {
    for (const p of all) expect(convert(1, "CNY", p.currency, REFERENCE_FX)).toBeGreaterThan(0);
    expect(convert(1, "USD", "TRY", REFERENCE_FX)).toBe(42);
  });
});

/** Hand-computed scenarios: 100 units × 2 (profile currency), 0.2 kg/unit, cheapest listed mode, insurance 0, China origin, air (not consignment). */
describe("worked golden calculations", () => {
  const input = (p: CountryProfile, shippingKey: string, extra: Record<string, unknown> = {}) => ({ quantity: 100, tiers: [{ minQty: 1, unitPrice: 2 }], fxRate: 1, unitWeightKg: 0.2, shippingKey, insuranceRate: 0, ...extra });
  const by = (p: CountryProfile, shippingKey: string, extra: Record<string, unknown> = {}) => {
    const r = computeLandedCost(p, input(p, shippingKey, extra));
    return { r, by: Object.fromEntries(r.lines.map((l) => [l.key, l.amount])) };
  };

  it("TR: generic product (default 10% duty, no İGV for ch. 85, KDV 20%)", () => {
    const tr = COUNTRY_PROFILES["tr"]!;
    // goods 200, freight max(3500, 260×20)=5200, cif 5400. duty 3% (ch.85 default) = 162; İGV 0; KDV 20% × 5562 = 1112.4; broker 4000; domestic 6000.
    const { r, by: b } = by(tr, "air", { hsCode: "8518.30" });
    expect(b["goods"]).toBe(200);
    expect(b["freight"]).toBe(5200);
    expect(b["duty"]).toBeCloseTo(5400 * 0.02);
    expect(b["extra-duty"]).toBeUndefined();
    expect(b["otv"]).toBeUndefined();
    expect(b["kkdf"]).toBeUndefined();
    expect(b["vat"]).toBeCloseTo((5400 + 108) * 0.2);
    expect(r.total).toBeCloseTo(200 + 5200 + 108 + (5400 + 108) * 0.2 + 4000 + 6000);
  });
  it("TR: apparel from China carries 12% duty, 30% İGV and 10% KDV", () => {
    const tr = COUNTRY_PROFILES["tr"]!;
    const { by: b } = by(tr, "air", { hsCode: "6109.10" });
    expect(b["duty"]).toBeCloseTo(5400 * 0.12);
    expect(b["extra-duty"]).toBeCloseTo(5400 * 0.3);
    expect(b["vat"]).toBeCloseTo((5400 + 648 + 1620) * 0.1);
    // Same goods from Türkiye-friendly origin: no İGV.
    const { by: v } = by(tr, "air", { hsCode: "6109.10", originCountry: "vn" });
    expect(v["extra-duty"]).toBeCloseTo(5400 * 0.3);
    const { by: d } = by(tr, "air", { hsCode: "6109.10", originCountry: "de" });
    expect(d["extra-duty"]).toBeUndefined();
  });
  it("TR: smartphones carry ÖTV 50% and TRT 12% on the duty-paid value; KKDF only on deferred payment", () => {
    const tr = COUNTRY_PROFILES["tr"]!;
    const { by: b } = by(tr, "air", { hsCode: "851713" });
    expect(b["duty"]).toBe(0);
    expect(b["trt"]).toBeCloseTo(5400 * 0.12);
    // ÖTV base includes the TRT fee; both enter the KDV base.
    expect(b["otv"]).toBeCloseTo((5400 + 648) * 0.5);
    expect(b["kkdf"]).toBeUndefined();
    expect(b["vat"]).toBeCloseTo((5400 + 648 + 3024) * 0.2);
    const { by: k } = by(tr, "air", { hsCode: "851713", deferredPayment: true });
    expect(k["kkdf"]).toBeCloseTo(5400 * 0.06);
  });
  it("TR: express parcel uses the courier's brokerage fee and the Trendyol margin follows the worked example", () => {
    const tr = COUNTRY_PROFILES["tr"]!;
    const { r, by: b } = by(tr, "express");
    expect(b["broker"]).toBe(1200);
    expect(r.approximate).toBe(true);
    // Margin at 240 TRY (KDV dahil) with 18% commission: net 200 − 43.2 − landedExVat.
    const m = computeMargin(tr, r, { sellPrice: 240, marketplaceId: "tr-trendyol" });
    expect(m.lines.netPrice).toBeCloseTo(200);
    expect(m.commission).toBeCloseTo(43.2);
    expect(m.lines.landedExVat).toBeCloseTo(r.landedExVatPerUnit);
    expect(m.netPerUnit).toBeCloseTo(200 - 43.2 - r.landedExVatPerUnit);
    expect(computeMargin(tr, r, { sellPrice: 240, marketplaceId: "tr-trendyol", groupKey: "electronics" }).commissionRate).toBe(0.1);
  });
  it("DE: VAT applies on every consignment, 150 € threshold no longer removes duty", () => {
    const de = COUNTRY_PROFILES["de"]!;
    // Express 10 × 1.3 €: goods 13, freight max(25, 9×2)=25, cif 38; duty 4% = 1.52; VAT 19% × 39.52 = 7.5088; broker 20 (courier); domestic 45.
    const r = computeLandedCost(de, { quantity: 10, tiers: [{ minQty: 1, unitPrice: 1.3 }], fxRate: 1, unitWeightKg: 0.2, shippingKey: "express", insuranceRate: 0 });
    const b = Object.fromEntries(r.lines.map((l) => [l.key, l.amount]));
    expect(b["duty"]).toBeCloseTo(38 * 0.04);
    expect(b["vat"]).toBeCloseTo((38 + 1.52) * 0.19);
    expect(b["broker"]).toBe(20);
    expect(r.total).toBeCloseTo(13 + 25 + 1.52 + 7.5088 + 20 + 45);
    // 100 × 2 € air: cif 200 + max(120, 5.5×20=110) = 320; apparel 12% duty 38.4; VAT 19% × 358.4.
    const { by: a } = by(de, "air", { hsCode: "6109" });
    expect(a["duty"]).toBeCloseTo(320 * 0.12);
    expect(a["vat"]).toBeCloseTo(358.4 * 0.19);
  });
  it("GB: 135 £ courier threshold waives duty but never VAT", () => {
    const gb = COUNTRY_PROFILES["gb"]!;
    const r = computeLandedCost(gb, { quantity: 10, tiers: [{ minQty: 1, unitPrice: 5 }], fxRate: 1, unitWeightKg: 0.2, shippingKey: "express", insuranceRate: 0 });
    const b = Object.fromEntries(r.lines.map((l) => [l.key, l.amount]));
    expect(b["duty"]).toBe(0);
    expect(b["vat"]).toBeCloseTo((50 + 22) * 0.2);
    const { by: air } = by(gb, "air");
    expect(air["duty"]).toBeGreaterThan(0);
  });
  it("US: no de minimis, Section 301 only for Chinese origin, MPF on every entry", () => {
    const us = COUNTRY_PROFILES["us"]!;
    // Express 10 × 1.3 $: goods 13, freight max(30, 11×2)=30, cif 43; duty 5% 2.15; 301 25% 10.75; MPF 0.3464%.
    const r = computeLandedCost(us, { quantity: 10, tiers: [{ minQty: 1, unitPrice: 1.3 }], fxRate: 1, unitWeightKg: 0.2, shippingKey: "express", insuranceRate: 0 });
    const b = Object.fromEntries(r.lines.map((l) => [l.key, l.amount]));
    expect(b["duty"]).toBeCloseTo(43 * 0.05);
    expect(b["extra-duty"]).toBeCloseTo(43 * 0.25);
    expect(b["mpf"]).toBeCloseTo(43 * 0.003464);
    expect(b["vat"]).toBeUndefined();
    const { by: vn } = by(us, "air", { originCountry: "vn" });
    expect(vn["extra-duty"]).toBeUndefined();
    const { by: list4a } = by(us, "air", { hsCode: "6109" });
    expect(list4a["extra-duty"]).toBeCloseTo((200 + 150) * 0.075);
    expect(computeMargin(us, 10, { sellPrice: 30, marketplaceId: "us-amazon" }).lines.outputVat).toBe(0);
  });
  it("RU: 22% VAT with 10% on children's goods; JP: 10% consumption tax; IN: SWS and IGST", () => {
    const { by: ru } = by(COUNTRY_PROFILES["ru"]!, "air");
    expect(ru["vat"]).toBeCloseTo((200 + 12000 + (200 + 12000) * 0.08) * 0.22);
    const { by: ruKids } = by(COUNTRY_PROFILES["ru"]!, "air", { hsCode: "9503" });
    expect(ruKids["vat"]).toBeCloseTo((12200 + 12200 * 0.05) * 0.1);
    const { by: jp } = by(COUNTRY_PROFILES["jp"]!, "air");
    expect(jp["vat"]).toBeCloseTo((200 + 15000 + 15200 * 0.05) * 0.1);
    const { by: ind } = by(COUNTRY_PROFILES["in"]!, "air");
    expect(ind["sws"]).toBeCloseTo((200 + 7000) * 0.02);
    expect(ind["vat"]).toBeCloseTo((7200 + 7200 * 0.2 + 7200 * 0.02) * 0.18);
  });
  it("dotted GTİP codes resolve to the same rate as digit strings", () => {
    const tr = COUNTRY_PROFILES["tr"]!;
    expect(dutyRateFor(tr, "8517.13")).toBe(dutyRateFor(tr, "851713"));
    expect(dutyRateFor(tr, "6506.10")).toBe(0.027);
    expect(dutyRateFor(tr, "4202.92")).toBe(0.03);
  });
});
