import type { CountryProfile } from "@manufactogate/core";
import { EU_DUTY, EU_SOURCES } from "./eu";

/**
 * Additional target countries. Rates are approximate starting points (dated), meant to be
 * refined per HS code; the UI marks them as editable assumptions.
 */
const base = (p: Partial<CountryProfile> & Pick<CountryProfile, "country" | "currency" | "dutyByHs" | "taxes" | "brokerFee" | "domesticShippingPerUnit" | "shipping" | "commissions">): CountryProfile => ({
  asOf: "2026-10-01",
  sources: [],
  dutyApproximate: true,
  ...p,
});

const US_DUTY: Record<string, number> = {
  default: 0.05, "33": 0.0, "39": 0.05, "3924": 0.034, "3926": 0.053, "42": 0.1, "4202": 0.17, "61": 0.16, "62": 0.16, "63": 0.09, "64": 0.12, "6402": 0.2, "65": 0.07, "6506": 0.0,
  "70": 0.05, "7117": 0.11, "73": 0.0, "7323": 0.03, "82": 0.05, "8205": 0.04, "84": 0.0, "8471": 0.0, "8509": 0.042, "8516": 0.027, "85": 0.02, "8504": 0.0, "8507": 0.034, "8517": 0.0, "8518": 0.049,
  "87": 0.025, "8708": 0.025, "8712": 0.11, "8715": 0.044, "90": 0.0, "9004": 0.02, "9018": 0.0, "91": 0.05, "94": 0.0, "9405": 0.039, "95": 0.0, "9503": 0.0, "9506": 0.04, "96": 0.04,
};

export const US = base({
  country: "us",
  currency: "USD",
  sources: ["https://hts.usitc.gov/", "https://www.cbp.gov/trade/programs-administration/trade-remedies (Section 301)", "https://www.whitehouse.gov/ (EO 14324: de minimis 29 Ağustos 2025'te tüm menşeler için kaldırıldı)"],
  dutyByHs: US_DUTY,
  taxes: [
    { key: "extra-duty", label: "Section 301 ek vergi (Çin menşeli)", rate: 0.25, base: "cif", origins: ["cn", "hk"], approximate: true, rateByHs: { "61": 0.075, "62": 0.075, "64": 0.075, "8517": 0.075, "8518": 0.075, "9503": 0.075, "9506": 0.075 } },
    { key: "mpf", label: "Merchandise Processing Fee", rate: 0.003464, base: "cif", approximate: true },
  ],
  brokerFee: 150,
  domesticShippingPerUnit: 6,
  shipping: [
    { key: "express", label: "Express courier", mode: "express", perKg: 11, minCharge: 30, transitDays: [4, 8], volumetricDivisor: 5000, brokerFee: 25 },
    { key: "air", label: "Air freight", mode: "air", perKg: 6.5, minCharge: 150, transitDays: [7, 14], volumetricDivisor: 6000 },
    { key: "sea", label: "Sea (LCL)", mode: "sea", perKg: 1.6, minCharge: 350, transitDays: [30, 45], perCbm: 200 },
  ],
  salesVatRate: 0,
  commissionVatRate: 0,
  marketplaces: ["us-amazon", "us-ebay", "us-walmart", "us-temu", "jp-mercari"],
  commissions: { "us-amazon": 0.15, "us-ebay": 0.136, "us-walmart": 0.15, "us-temu": 0.1, "jp-mercari": 0.1 },
  notes: [
    "ABD'de 800 $ de minimis muafiyeti 29 Ağustos 2025'te tüm menşeler için kaldırıldı (Çin için 2 Mayıs 2025).",
    "Section 301 listeleri: çoğu kalemde %25, 4A listesinde %7,5; IEEPA/karşılıklı tarifeler değişkendir ve ayrıca kontrol edilmelidir.",
    "Satış vergisi eyalete göre %0–%10 arasında kasada eklenir; marj hesabında KDV 0 alınır.",
  ],
});

export const GB = base({
  country: "gb",
  currency: "GBP",
  sources: ["https://www.trade-tariff.service.gov.uk/", "https://www.gov.uk/guidance/vat-and-overseas-goods-sold-directly-to-customers-in-the-uk (135 £ eşiği: KDV satış noktasında)"],
  dutyByHs: { ...EU_DUTY, "64": 0.16 },
  taxes: [{ key: "vat", label: "VAT", rate: 0.2, base: "cif+duty", rateByHs: { "6111": 0.0, "6209": 0.0 } }],
  dutyDeMinimis: 135,
  brokerFee: 100,
  domesticShippingPerUnit: 4,
  shipping: [
    { key: "express", label: "Express courier", mode: "express", perKg: 8, minCharge: 22, transitDays: [4, 8], volumetricDivisor: 5000, brokerFee: 15 },
    { key: "air", label: "Air freight", mode: "air", perKg: 5, minCharge: 110, transitDays: [7, 14], volumetricDivisor: 6000 },
    { key: "sea", label: "Sea (LCL)", mode: "sea", perKg: 1.3, minCharge: 280, transitDays: [35, 50], perCbm: 170 },
  ],
  salesVatRate: 0.2,
  commissionVatRate: 0,
  marketplaces: ["gb-amazon", "us-ebay"],
  commissions: { "gb-amazon": 0.15, "us-ebay": 0.128 },
  notes: ["135 £ altı gönderilerde gümrük vergisi alınmaz, KDV satış noktasında satıcı tarafından tahsil edilir (kaldırılmaz)."],
});

export const AE = base({
  country: "ae",
  currency: "AED",
  sources: ["https://www.customs.gov.ae/", "https://tax.gov.ae/"],
  dutyByHs: { default: 0.05, "33": 0.05, "2309": 0.0, "8471": 0.0, "8517": 0.0 },
  taxes: [{ key: "vat", label: "VAT", rate: 0.05, base: "cif+duty" }],
  dutyDeMinimis: 1000,
  brokerFee: 400,
  domesticShippingPerUnit: 15,
  shipping: [
    { key: "express", label: "Express courier", mode: "express", perKg: 32, minCharge: 90, transitDays: [3, 6], volumetricDivisor: 5000, brokerFee: 80 },
    { key: "air", label: "Air freight", mode: "air", perKg: 18, minCharge: 400, transitDays: [5, 10], volumetricDivisor: 6000 },
    { key: "sea", label: "Sea (LCL)", mode: "sea", perKg: 5, minCharge: 900, transitDays: [20, 30], perCbm: 650 },
  ],
  salesVatRate: 0.05,
  commissionVatRate: 0.05,
  marketplaces: ["ae-noon"],
  commissions: { "ae-noon": 0.12 },
});

export const SA = base({
  country: "sa",
  currency: "SAR",
  sources: ["https://zatca.gov.sa/ (gümrük tarifesi ve %15 KDV)"],
  dutyByHs: { default: 0.05, "61": 0.15, "62": 0.15, "64": 0.15, "4202": 0.15, "94": 0.15, "8471": 0.0, "8517": 0.0 },
  taxes: [{ key: "vat", label: "VAT", rate: 0.15, base: "cif+duty" }],
  dutyDeMinimis: 1000,
  brokerFee: 450,
  domesticShippingPerUnit: 18,
  shipping: [
    { key: "express", label: "Express courier", mode: "express", perKg: 34, minCharge: 95, transitDays: [3, 7], volumetricDivisor: 5000, brokerFee: 90 },
    { key: "air", label: "Air freight", mode: "air", perKg: 19, minCharge: 420, transitDays: [5, 10], volumetricDivisor: 6000 },
    { key: "sea", label: "Sea (LCL)", mode: "sea", perKg: 5.5, minCharge: 950, transitDays: [22, 32], perCbm: 700 },
  ],
  salesVatRate: 0.15,
  commissionVatRate: 0.15,
  marketplaces: ["ae-noon"],
  commissions: { "ae-noon": 0.12 },
});

const euProfile = (country: string, currency: string, vatLabel: string, vat: number, fx: number, extra: Partial<CountryProfile> = {}): CountryProfile =>
  base({
    country,
    currency,
    sources: EU_SOURCES,
    dutyByHs: EU_DUTY,
    taxes: [{ key: "vat", label: vatLabel, rate: vat, base: "cif+duty" }],
    brokerFee: Math.round(110 * fx),
    domesticShippingPerUnit: Math.round(4 * fx * 10) / 10,
    shipping: [
      { key: "express", label: "Express courier", mode: "express", perKg: Math.round(9 * fx * 10) / 10, minCharge: Math.round(25 * fx), transitDays: [4, 8], volumetricDivisor: 5000, brokerFee: Math.round(20 * fx) },
      { key: "air", label: "Air freight", mode: "air", perKg: Math.round(5.5 * fx * 10) / 10, minCharge: Math.round(120 * fx), transitDays: [7, 14], volumetricDivisor: 6000 },
      { key: "rail", label: "Rail", mode: "rail", perKg: Math.round(2.6 * fx * 10) / 10, minCharge: Math.round(200 * fx), transitDays: [18, 28], perCbm: Math.round(260 * fx) },
      { key: "sea", label: "Sea (LCL)", mode: "sea", perKg: Math.round(1.4 * fx * 10) / 10, minCharge: Math.round(300 * fx), transitDays: [35, 50], perCbm: Math.round(180 * fx) },
    ],
    salesVatRate: vat,
    commissionVatRate: 0,
    marketplaces: ["de-amazon"],
    commissions: { "de-amazon": 0.15 },
    notes: ["AB'de ithalat KDV'si her gönderide alınır. Amazon'un AB pazarı (amazon.de üzerinden pan-Avrupa) komisyonu temsil eder."],
    ...extra,
  });

export const NL = euProfile("nl", "EUR", "BTW", 0.21, 1);
export const PL = euProfile("pl", "PLN", "VAT", 0.23, 4.25);
export const RO = euProfile("ro", "RON", "TVA", 0.21, 5.05, { notes: ["Romanya KDV'si 1 Ağustos 2025'ten itibaren %21.", "AB'de ithalat KDV'si her gönderide alınır."] });
export const FR = euProfile("fr", "EUR", "TVA", 0.2, 1);
export const IT = euProfile("it", "EUR", "IVA", 0.22, 1);
export const ES = euProfile("es", "EUR", "IVA", 0.21, 1);

export const RU = base({
  country: "ru",
  currency: "RUB",
  sources: ["https://www.alta.ru/tnved/ (EAEU gümrük tarifesi)", "https://www.nalog.gov.ru/ (KDV 1 Ocak 2026'dan itibaren %22)"],
  dutyByHs: { default: 0.08, "61": 0.1, "62": 0.1, "64": 0.1, "4202": 0.1, "8471": 0.0, "8517": 0.0, "8518": 0.05, "8509": 0.05, "8516": 0.05, "9503": 0.05, "94": 0.1, "7323": 0.1 },
  taxes: [{ key: "vat", label: "НДС", rate: 0.22, base: "cif+duty", rateByHs: { "6111": 0.1, "6209": 0.1, "9503": 0.1 } }],
  dutyDeMinimis: 18000,
  brokerFee: 25000,
  domesticShippingPerUnit: 450,
  shipping: [
    { key: "express", label: "Express courier", mode: "express", perKg: 900, minCharge: 2500, transitDays: [5, 10], volumetricDivisor: 5000, brokerFee: 3000 },
    { key: "air", label: "Air freight", mode: "air", perKg: 550, minCharge: 12000, transitDays: [7, 14], volumetricDivisor: 6000 },
    { key: "rail", label: "Rail", mode: "rail", perKg: 180, minCharge: 18000, transitDays: [14, 25], perCbm: 20000 },
    { key: "sea", label: "Sea", mode: "sea", perKg: 140, minCharge: 25000, transitDays: [35, 50], perCbm: 16000 },
  ],
  salesVatRate: 0.22,
  commissionVatRate: 0,
  marketplaces: ["ru-ozon", "ru-wildberries"],
  commissions: { "ru-ozon": 0.17, "ru-wildberries": 0.2 },
  commissionsByGroup: { "ru-ozon": { electronics: 0.1, "fashion-women": 0.2, "fashion-men": 0.2, shoes: 0.2, home: 0.17, toys: 0.15 }, "ru-wildberries": { electronics: 0.12, "fashion-women": 0.25, "fashion-men": 0.25, shoes: 0.25, home: 0.2 } },
  notes: ["Rusya KDV'si 1 Ocak 2026'dan itibaren %22 (çocuk ürünlerinde %10).", "EAEU 200 € (yaklaşık 18.000 ₽) altı bireysel gönderilerde gümrük vergisi yoktur; ticari ithalatta uygulanmaz."],
});

export const JP = base({
  country: "jp",
  currency: "JPY",
  sources: ["https://www.customs.go.jp/english/tariff/", "https://www.nta.go.jp/ (消費税 %10)"],
  dutyByHs: { default: 0.05, "61": 0.1, "62": 0.1, "64": 0.3, "4202": 0.1, "8471": 0.0, "8517": 0.0, "8518": 0.0, "8509": 0.0, "8516": 0.0, "9503": 0.0, "94": 0.0, "7323": 0.0, "9004": 0.0, "6506": 0.0 },
  taxes: [{ key: "vat", label: "消費税", rate: 0.1, base: "cif+duty" }],
  dutyDeMinimis: 10000,
  vatDeMinimis: 10000,
  brokerFee: 15000,
  domesticShippingPerUnit: 700,
  shipping: [
    { key: "express", label: "Express courier", mode: "express", perKg: 1300, minCharge: 3500, transitDays: [3, 6], volumetricDivisor: 5000, brokerFee: 3000 },
    { key: "air", label: "Air freight", mode: "air", perKg: 700, minCharge: 15000, transitDays: [5, 9], volumetricDivisor: 6000 },
    { key: "sea", label: "Sea (LCL)", mode: "sea", perKg: 150, minCharge: 30000, transitDays: [10, 20], perCbm: 18000 },
  ],
  salesVatRate: 0.1,
  commissionVatRate: 0.1,
  marketplaces: ["jp-rakuten", "jp-yahooauctions"],
  commissions: { "jp-rakuten": 0.1, "jp-yahooauctions": 0.1 },
  notes: ["10.000 ¥ altı gönderilerde gümrük vergisi ve tüketim vergisi muafiyeti vardır (ticari ithalatta uygulanmaz).", "Mercari ABD sürümü ABD profili altında listelenir."],
});

export const KR = base({
  country: "kr",
  currency: "KRW",
  sources: ["https://unipass.customs.go.kr/ (관세율표)", "https://www.nts.go.kr/ (부가가치세 %10)"],
  dutyByHs: { default: 0.08, "61": 0.13, "62": 0.13, "64": 0.13, "4202": 0.08, "8471": 0.0, "8517": 0.0, "8518": 0.08, "8509": 0.08, "8516": 0.08, "9503": 0.08, "94": 0.08, "7323": 0.08, "9004": 0.08, "6506": 0.08 },
  taxes: [{ key: "vat", label: "부가가치세", rate: 0.1, base: "cif+duty" }],
  dutyDeMinimis: 200000,
  brokerFee: 180000,
  domesticShippingPerUnit: 3500,
  shipping: [
    { key: "express", label: "Express courier", mode: "express", perKg: 12000, minCharge: 35000, transitDays: [3, 6], volumetricDivisor: 5000, brokerFee: 30000 },
    { key: "air", label: "Air freight", mode: "air", perKg: 6500, minCharge: 150000, transitDays: [5, 9], volumetricDivisor: 6000 },
    { key: "sea", label: "Sea (LCL)", mode: "sea", perKg: 1500, minCharge: 300000, transitDays: [7, 15], perCbm: 170000 },
  ],
  salesVatRate: 0.1,
  commissionVatRate: 0.1,
  marketplaces: ["kr-coupang", "kr-gmarket"],
  commissions: { "kr-coupang": 0.11, "kr-gmarket": 0.12 },
  notes: ["150 $ (≈200.000 ₩) altı bireysel gönderilerde muafiyet vardır; ticari ithalatta uygulanmaz."],
});

export const ID = base({
  country: "id",
  currency: "IDR",
  sources: ["https://www.beacukai.go.id/ (BTKI tarifesi, PPh 22 ithalat)", "https://pajak.go.id/ (PPN %11 efektif)"],
  dutyByHs: { default: 0.075, "61": 0.25, "62": 0.25, "64": 0.25, "4202": 0.2, "8471": 0.0, "8517": 0.0, "8518": 0.1, "8509": 0.1, "8516": 0.1, "9503": 0.1, "94": 0.15, "7323": 0.15, "9004": 0.1, "6506": 0.1 },
  taxes: [
    { key: "pph", label: "PPh 22 (ithalat gelir vergisi stopajı)", rate: 0.1, base: "cif+duty", approximate: true },
    { key: "vat", label: "PPN", rate: 0.11, base: "cif+duty" },
  ],
  brokerFee: 2500000,
  domesticShippingPerUnit: 25000,
  shipping: [
    { key: "express", label: "Express courier", mode: "express", perKg: 180000, minCharge: 500000, transitDays: [4, 8], volumetricDivisor: 5000, brokerFee: 400000 },
    { key: "air", label: "Air freight", mode: "air", perKg: 95000, minCharge: 2000000, transitDays: [6, 10], volumetricDivisor: 6000 },
    { key: "sea", label: "Sea (LCL)", mode: "sea", perKg: 20000, minCharge: 4000000, transitDays: [12, 25], perCbm: 2500000 },
  ],
  salesVatRate: 0.11,
  commissionVatRate: 0.11,
  marketplaces: ["id-tokopedia", "id-shopee"],
  commissions: { "id-tokopedia": 0.065, "id-shopee": 0.08 },
  notes: ["PPh 22 ithalat stopajı API'li ithalatçıda %2,5–%10 arasındadır; API'siz %10 alındı.", "PPN resmi oranı %12, efektif matrah düzenlemesiyle %11 uygulanır."],
});

export const TH = base({
  country: "th",
  currency: "THB",
  sources: ["https://www.customs.go.th/ (ภาษีศุลกากร)", "https://www.rd.go.th/ (VAT %7)"],
  dutyByHs: { default: 0.1, "61": 0.3, "62": 0.3, "64": 0.3, "4202": 0.2, "8471": 0.0, "8517": 0.0, "8518": 0.1, "8509": 0.1, "8516": 0.1, "9503": 0.1, "94": 0.2, "7323": 0.2, "9004": 0.05, "6506": 0.1 },
  taxes: [{ key: "vat", label: "VAT", rate: 0.07, base: "cif+duty" }],
  brokerFee: 6000,
  domesticShippingPerUnit: 60,
  shipping: [
    { key: "express", label: "Express courier", mode: "express", perKg: 350, minCharge: 900, transitDays: [3, 7], volumetricDivisor: 5000, brokerFee: 800 },
    { key: "air", label: "Air freight", mode: "air", perKg: 180, minCharge: 4000, transitDays: [5, 9], volumetricDivisor: 6000 },
    { key: "sea", label: "Sea (LCL)", mode: "sea", perKg: 40, minCharge: 8000, transitDays: [10, 20], perCbm: 5000 },
  ],
  salesVatRate: 0.07,
  commissionVatRate: 0.07,
  marketplaces: ["th-lazada"],
  commissions: { "th-lazada": 0.08 },
  notes: ["ASEAN–Çin STA kapsamında birçok kalemde menşe belgesiyle (Form E) gümrük vergisi 0 olabilir; tabloda MFN oranı alındı."],
});

export const IN = base({
  country: "in",
  currency: "INR",
  sources: ["https://www.cbic.gov.in/ (gümrük tarifesi, SWS %10)", "https://www.gst.gov.in/ (IGST)"],
  dutyByHs: { default: 0.2, "61": 0.2, "62": 0.2, "64": 0.2, "4202": 0.2, "8471": 0.0, "8517": 0.2, "851713": 0.2, "8518": 0.2, "8509": 0.2, "8516": 0.2, "9503": 0.7, "94": 0.25, "7323": 0.2, "9004": 0.2, "6506": 0.2 },
  taxes: [
    { key: "sws", label: "Social Welfare Surcharge (%10 of duty)", rate: 0.02, base: "cif", approximate: true },
    { key: "vat", label: "IGST", rate: 0.18, base: "cif+duty+extra", rateByHs: { "61": 0.05, "62": 0.05, "64": 0.12, "9503": 0.12 } },
  ],
  brokerFee: 9000,
  domesticShippingPerUnit: 90,
  shipping: [
    { key: "express", label: "Express courier", mode: "express", perKg: 650, minCharge: 1800, transitDays: [4, 8], volumetricDivisor: 5000, brokerFee: 1500 },
    { key: "air", label: "Air freight", mode: "air", perKg: 320, minCharge: 7000, transitDays: [6, 10], volumetricDivisor: 6000 },
    { key: "sea", label: "Sea (LCL)", mode: "sea", perKg: 80, minCharge: 15000, transitDays: [14, 28], perCbm: 9000 },
  ],
  salesVatRate: 0.18,
  commissionVatRate: 0.18,
  marketplaces: [],
  commissions: {},
  notes: ["Hindistan hesaplarında kaynak pazarlar (IndiaMART, TradeIndia) için ithalat yönü modellenir; hedef pazar komisyonu yoktur.", "SWS gümrük vergisinin %10'udur; tabloda CIF üzerinden %2 ile yaklaşık alınmıştır."],
});
