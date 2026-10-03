import type { CountryProfile } from "@manufactogate/core";

/**
 * Additional target countries. Rates are approximate starting points (dated), meant to be
 * refined per HS code; the UI marks them as editable assumptions.
 */
const base = (p: Partial<CountryProfile> & Pick<CountryProfile, "country" | "currency" | "dutyByHs" | "taxes" | "brokerFee" | "domesticShippingPerUnit" | "shipping" | "commissions">): CountryProfile => ({
  asOf: "2026-10-01",
  sources: ["https://trade.ec.europa.eu/access-to-markets/", "https://hts.usitc.gov/", "https://www.customs.gov.ae/"],
  ...p,
});

export const US = base({
  country: "us",
  currency: "USD",
  dutyByHs: { default: 0.05, "61": 0.16, "62": 0.16, "64": 0.12, "8517": 0.0, "9503": 0.0 },
  taxes: [{ key: "extra-duty", label: "Section 301 ek vergi (Çin menşeli)", rate: 0.25, base: "cif" }],
  deMinimis: 800,
  brokerFee: 150,
  domesticShippingPerUnit: 6,
  shipping: [
    { key: "express", label: "Express courier", mode: "express", perKg: 11, minCharge: 30, transitDays: [4, 8] },
    { key: "air", label: "Air freight", mode: "air", perKg: 6.5, minCharge: 150, transitDays: [7, 14] },
    { key: "sea", label: "Sea (LCL)", mode: "sea", perKg: 1.6, minCharge: 350, transitDays: [30, 45] },
  ],
  commissions: { "us-amazon": 0.15, "us-ebay": 0.13, "us-walmart": 0.15 },
});

export const GB = base({
  country: "gb",
  currency: "GBP",
  dutyByHs: { default: 0.04, "61": 0.12, "62": 0.12, "64": 0.16, "8517": 0.0, "9503": 0.0 },
  taxes: [{ key: "vat", label: "VAT", rate: 0.2, base: "cif+duty" }],
  deMinimis: 135,
  brokerFee: 100,
  domesticShippingPerUnit: 4,
  shipping: [
    { key: "express", label: "Express courier", mode: "express", perKg: 8, minCharge: 22, transitDays: [4, 8] },
    { key: "air", label: "Air freight", mode: "air", perKg: 5, minCharge: 110, transitDays: [7, 14] },
    { key: "sea", label: "Sea (LCL)", mode: "sea", perKg: 1.3, minCharge: 280, transitDays: [35, 50] },
  ],
  commissions: { "gb-amazon": 0.15, "us-ebay": 0.13 },
});

export const AE = base({
  country: "ae",
  currency: "AED",
  dutyByHs: { default: 0.05 },
  taxes: [{ key: "vat", label: "VAT", rate: 0.05, base: "cif+duty" }],
  deMinimis: 1000,
  brokerFee: 400,
  domesticShippingPerUnit: 15,
  shipping: [
    { key: "express", label: "Express courier", mode: "express", perKg: 32, minCharge: 90, transitDays: [3, 6] },
    { key: "air", label: "Air freight", mode: "air", perKg: 18, minCharge: 400, transitDays: [5, 10] },
    { key: "sea", label: "Sea (LCL)", mode: "sea", perKg: 5, minCharge: 900, transitDays: [20, 30] },
  ],
  commissions: { "ae-noon": 0.12, "us-amazon": 0.15 },
});

export const NL = base({
  country: "nl",
  currency: "EUR",
  dutyByHs: { default: 0.04, "61": 0.12, "62": 0.12, "64": 0.17, "8517": 0.0, "9503": 0.047 },
  taxes: [{ key: "vat", label: "BTW", rate: 0.21, base: "cif+duty" }],
  deMinimis: 150,
  brokerFee: 110,
  domesticShippingPerUnit: 4,
  shipping: [
    { key: "express", label: "Express courier", mode: "express", perKg: 9, minCharge: 25, transitDays: [4, 8] },
    { key: "air", label: "Air freight", mode: "air", perKg: 5.5, minCharge: 120, transitDays: [7, 14] },
    { key: "rail", label: "Rail", mode: "rail", perKg: 2.6, minCharge: 200, transitDays: [18, 28] },
    { key: "sea", label: "Sea (LCL)", mode: "sea", perKg: 1.4, minCharge: 300, transitDays: [35, 50] },
  ],
  commissions: { "de-amazon": 0.15 },
});

export const PL = base({
  country: "pl",
  currency: "PLN",
  dutyByHs: { default: 0.04, "61": 0.12, "62": 0.12, "64": 0.17, "8517": 0.0, "9503": 0.047 },
  taxes: [{ key: "vat", label: "VAT", rate: 0.23, base: "cif+duty" }],
  deMinimis: 150,
  brokerFee: 450,
  domesticShippingPerUnit: 16,
  shipping: [
    { key: "express", label: "Express courier", mode: "express", perKg: 38, minCharge: 110, transitDays: [4, 8] },
    { key: "air", label: "Air freight", mode: "air", perKg: 24, minCharge: 500, transitDays: [7, 14] },
    { key: "rail", label: "Rail", mode: "rail", perKg: 11, minCharge: 850, transitDays: [16, 26] },
    { key: "sea", label: "Sea (LCL)", mode: "sea", perKg: 6, minCharge: 1300, transitDays: [35, 50] },
  ],
  commissions: { "de-amazon": 0.15 },
});

export const RO = base({
  country: "ro",
  currency: "RON",
  dutyByHs: { default: 0.04, "61": 0.12, "62": 0.12, "64": 0.17, "8517": 0.0, "9503": 0.047 },
  taxes: [{ key: "vat", label: "TVA", rate: 0.19, base: "cif+duty" }],
  deMinimis: 150,
  brokerFee: 550,
  domesticShippingPerUnit: 20,
  shipping: [
    { key: "express", label: "Express courier", mode: "express", perKg: 45, minCharge: 130, transitDays: [4, 8] },
    { key: "air", label: "Air freight", mode: "air", perKg: 28, minCharge: 600, transitDays: [7, 14] },
    { key: "sea", label: "Sea (LCL)", mode: "sea", perKg: 7, minCharge: 1500, transitDays: [35, 50] },
  ],
  commissions: { "de-amazon": 0.15 },
});
