import type { CountryProfile } from "@manufactogate/core";
import { EU_DUTY, EU_SOURCES } from "./eu";

/**
 * Almanya (AB). 1 Temmuz 2021'den beri ithalat KDV'si her gönderide alınır (150 € eşiği yalnız
 * gümrük vergisi içindi); 150 € altı gönderilerde gümrük vergisi muafiyeti 2026'da kaldırılma
 * sürecindedir, bu yüzden hesapta muafiyet uygulanmaz.
 */
export const DE: CountryProfile = {
  country: "de",
  currency: "EUR",
  asOf: "2026-10-01",
  sources: [...EU_SOURCES, "https://www.zoll.de/"],
  dutyApproximate: true,
  dutyByHs: EU_DUTY,
  taxes: [{ key: "vat", label: "Einfuhrumsatzsteuer", rate: 0.19, base: "cif+duty", rateByHs: { "4901": 0.07, "2309": 0.07 } }],
  brokerFee: 120,
  domesticShippingPerUnit: 4.5,
  shipping: [
    { key: "express", label: "Express courier", mode: "express", perKg: 9, minCharge: 25, transitDays: [4, 8], volumetricDivisor: 5000, brokerFee: 20 },
    { key: "air", label: "Air freight", mode: "air", perKg: 5.5, minCharge: 120, transitDays: [7, 14], volumetricDivisor: 6000 },
    { key: "rail", label: "Rail", mode: "rail", perKg: 2.6, minCharge: 200, transitDays: [18, 28], perCbm: 260 },
    { key: "sea", label: "Sea (LCL)", mode: "sea", perKg: 1.4, minCharge: 300, transitDays: [35, 50], perCbm: 180 },
  ],
  salesVatRate: 0.19,
  commissionVatRate: 0,
  marketplaces: ["de-amazon"],
  commissions: { "de-amazon": 0.15 },
  commissionsByGroup: { "de-amazon": { electronics: 0.07, computer: 0.07, "fashion-women": 0.15, "fashion-men": 0.15, shoes: 0.15, home: 0.15, toys: 0.15, beauty: 0.08 } },
  notes: ["AB'de ithalat KDV'si her gönderide alınır; 150 € eşiği yalnız gümrük vergisi içindir ve kaldırılma sürecindedir.", "Amazon komisyonları kategoriye göre %7–%15."],
};
