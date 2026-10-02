import type { CountryProfile } from "@manufactogate/core";

export const DE: CountryProfile = {
  country: "de",
  currency: "EUR",
  asOf: "2026-10-01",
  sources: ["https://trade.ec.europa.eu/access-to-markets/"],
  dutyByHs: { default: 0.04, "61": 0.12, "62": 0.12, "64": 0.17, "8517": 0.0, "9503": 0.047 },
  taxes: [{ key: "vat", label: "Umsatzsteuer", rate: 0.19, base: "cif+duty" }],
  deMinimis: 150,
  brokerFee: 120,
  domesticShippingPerUnit: 4.5,
  shipping: [
    { key: "express", label: "Express courier", mode: "express", perKg: 9, minCharge: 25, transitDays: [4, 8] },
    { key: "air", label: "Air freight", mode: "air", perKg: 5.5, minCharge: 120, transitDays: [7, 14] },
    { key: "rail", label: "Rail", mode: "rail", perKg: 2.6, minCharge: 200, transitDays: [18, 28] },
    { key: "sea", label: "Sea (LCL)", mode: "sea", perKg: 1.4, minCharge: 300, transitDays: [35, 50] },
  ],
  commissions: { "de-amazon": 0.15, "de-ebay": 0.12 },
};
