import type { CountryProfile } from "@manufactogate/core";

/**
 * Türkiye, ticari ithalat. Oranlar başlangıç değerleridir ve kullanıcı tarafından
 * düzenlenebilir; GTİP bazlı kesin oranlar Sprint 4'te genişletilir.
 */
export const TR: CountryProfile = {
  country: "tr",
  currency: "TRY",
  asOf: "2026-10-01",
  sources: [
    "https://www.luposimport.com/blog/cinden-ithalat-vergileri/",
    "https://mukellef.co/blog/gumruk-vergisi-nedir-nasil-hesaplanir/",
  ],
  dutyByHs: {
    default: 0.1,
    "61": 0.12, // örme giyim
    "62": 0.12, // dokuma giyim
    "64": 0.17, // ayakkabı
    "85": 0.03, // elektrikli cihazlar, genel
    "8517": 0.0, // telefon ve ağ cihazları
    "9503": 0.047, // oyuncak
    "3304": 0.0, // kozmetik
  },
  taxes: [
    { key: "extra-duty", label: "İlave gümrük vergisi (Çin menşeli)", rate: 0.2, base: "cif" },
    { key: "vat", label: "KDV", rate: 0.2, base: "cif+duty+extra" },
  ],
  brokerFee: 4000,
  domesticShippingPerUnit: 60,
  shipping: [
    { key: "express", label: "Ekspres kurye", mode: "express", perKg: 450, minCharge: 900, transitDays: [4, 8] },
    { key: "air", label: "Hava kargo", mode: "air", perKg: 260, minCharge: 3500, transitDays: [7, 14] },
    { key: "rail", label: "Demiryolu", mode: "rail", perKg: 120, minCharge: 6000, transitDays: [20, 30] },
    { key: "sea", label: "Deniz yolu (LCL)", mode: "sea", perKg: 70, minCharge: 9000, transitDays: [30, 45] },
  ],
  commissions: { "tr-trendyol": 0.18, "tr-hepsiburada": 0.17, "tr-n11": 0.15 },
};
