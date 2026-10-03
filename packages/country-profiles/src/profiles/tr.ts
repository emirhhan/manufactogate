import type { CountryProfile } from "@manufactogate/core";

/**
 * Türkiye, ticari ithalat (Çin menşeli varsayılan). Oranlar GTİP faslına göre yaklaşık
 * başlangıç değerleridir ve kullanıcı tarafından düzenlenebilir; kesin oran için ilgili
 * GTİP'in Gümrük Tarife Cetveli ve İthalat Rejimi Kararı eki listelere bakılmalıdır.
 *
 * Modellenen kalemler (2026-10-01 itibarıyla):
 *  - Gümrük vergisi: GTİP faslı/pozisyonuna göre (üçüncü ülke oranı).
 *  - İlave gümrük vergisi (İGV): yalnız Çin vb. menşe için, fasıl bazında (tekstil/konfeksiyon/ayakkabı/çanta
 *    yüksek, elektronik çoğunlukla 0).
 *  - ÖTV: cep telefonu (8517.13) %50, TV (8528.72) %1 gibi; TRT bandrolü: telefon %12, TV %10 (fiyatın
 *    bant kademesine göre değişir, yaklaşık).
 *  - KKDF: vadeli ödemede %6 (peşin/akreditif ödemede uygulanmaz).
 *  - KDV: genel %20; tekstil, konfeksiyon ve ayakkabı %10.
 */
export const TR: CountryProfile = {
  country: "tr",
  currency: "TRY",
  asOf: "2026-10-01",
  sources: [
    "https://www.resmigazete.gov.tr/ (İthalat Rejimi Kararı ve ekleri, İlave Gümrük Vergisi kararları)",
    "https://ticaret.gov.tr/ithalat/ithalat-rejimi",
    "https://www.gib.gov.tr/ (KDV ve ÖTV oranları)",
    "https://uygulama.gtb.gov.tr/Tara/ (Gümrük tarife cetveli)",
  ],
  dutyApproximate: true,
  dutyByHs: {
    default: 0.1,
    "23": 0.1, "2309": 0.07, // hayvan yemleri (pet maması)
    "25": 0.0, // kedi kumu (mineral)
    "33": 0.0, "3304": 0.0, "3303": 0.0, "3305": 0.0, // kozmetik
    "34": 0.04, "3406": 0.0, // mum
    "39": 0.065, "3924": 0.065, "3926": 0.065, "3919": 0.065, "3920": 0.065, "3923": 0.065, // plastik ev eşyası, kılıf, film, poşet
    "40": 0.03, "4011": 0.045, "4014": 0.0, // lastik, kauçuk
    "42": 0.03, "4201": 0.027, "4202": 0.03, "4203": 0.04, // çanta, tasma, deri giyim
    "44": 0.0, "4415": 0.04, // ahşap, palet
    "48": 0.0, "4819": 0.0, "4820": 0.0, "4821": 0.0, // kağıt, kutu, defter
    "56": 0.08, "5607": 0.08, // ip, hamak
    "57": 0.08, // halı
    "58": 0.08, // kurdele
    "61": 0.12, "62": 0.12, "63": 0.12, // örme, dokuma giyim, ev tekstili
    "64": 0.17, "6402": 0.17, "6403": 0.08, "6404": 0.17, "6406": 0.03, // ayakkabı
    "65": 0.027, "6505": 0.027, "6506": 0.027, // şapka, kask
    "66": 0.047, // şemsiye
    "70": 0.05, "7007": 0.03, "7010": 0.05, "7013": 0.11, // cam, temperli cam
    "71": 0.0, "7117": 0.04, // imitasyon takı
    "73": 0.027, "7318": 0.037, "7321": 0.027, "7323": 0.03, "7326": 0.027, // çelik ev eşyası, vida, mangal
    "76": 0.06, "7615": 0.06, "7616": 0.06, // alüminyum
    "82": 0.027, "8201": 0.017, "8204": 0.027, "8205": 0.027, "8206": 0.027, "8211": 0.085, "8213": 0.047, // el aletleri, bıçak, makas
    "83": 0.027, "8301": 0.027, // kilit
    "84": 0.02, "8414": 0.022, "8415": 0.022, "8418": 0.019, "8419": 0.017, "8421": 0.017, "8422": 0.017, "8423": 0.017, "8424": 0.017,
    "8433": 0.0, "8443": 0.0, "8450": 0.03, "8452": 0.0, "8467": 0.027, "8470": 0.0, "8471": 0.0, "8472": 0.0, "8479": 0.017, "8481": 0.022, // makineler, bilgisayar
    "85": 0.03, "8504": 0.033, "8506": 0.047, "8507": 0.027, "8508": 0.022, "8509": 0.022, "8510": 0.022, "8511": 0.032, "8512": 0.027, "8513": 0.057, "8515": 0.027,
    "8516": 0.027, "8517": 0.0, "8518": 0.02, "8519": 0.0, "8523": 0.0, "8525": 0.0, "8527": 0.1, "8528": 0.14, "8531": 0.022, "8536": 0.023, "8539": 0.027, "8544": 0.033, // elektrikli cihazlar
    "87": 0.1, "8708": 0.03, "8711": 0.08, "8712": 0.15, "8714": 0.037, "8715": 0.027, // oto parça, motosiklet, bisiklet, bebek arabası
    "88": 0.0, "8806": 0.0, // drone
    "90": 0.0, "9004": 0.029, "9005": 0.042, "9015": 0.027, "9017": 0.027, "9018": 0.0, "9019": 0.0, "9021": 0.0, "9025": 0.032, "9030": 0.0, "9031": 0.027, // optik, tıbbi, ölçü
    "91": 0.045, "9102": 0.045, "9105": 0.045, "9113": 0.037, // saat
    "92": 0.032, // müzik aleti
    "94": 0.0, "9401": 0.0, "9403": 0.0, "9404": 0.037, "9405": 0.047, // mobilya, yastık, aydınlatma
    "95": 0.047, "9503": 0.047, "9504": 0.0, "9505": 0.027, "9506": 0.027, "9507": 0.037, // oyuncak, spor
    "96": 0.027, "9603": 0.037, "9608": 0.037, "9610": 0.027, "9617": 0.066, "9619": 0.0, // fırça, kalem, termos, bebek bezi
  },
  taxes: [
    {
      key: "extra-duty",
      label: "İlave gümrük vergisi (Çin vb. menşeli)",
      rate: 0,
      base: "cif",
      origins: ["cn", "hk", "vn", "bd", "in", "id", "th", "my", "pk"],
      approximate: true,
      rateByHs: {
        "39": 0.1, "3924": 0.2, "3926": 0.2, "42": 0.3, "4202": 0.3, "4203": 0.3, "44": 0.1, "57": 0.3, "58": 0.2,
        "61": 0.3, "62": 0.3, "63": 0.3, "64": 0.3, "6402": 0.5, "6404": 0.5, "65": 0.3, "66": 0.3, "70": 0.1, "7013": 0.2, "7117": 0.2,
        "73": 0.2, "7323": 0.2, "76": 0.2, "82": 0.2, "83": 0.2, "84": 0.0, "8414": 0.2, "8415": 0.2, "8418": 0.2, "8509": 0.2, "8510": 0.2, "8516": 0.2,
        "85": 0.0, "8504": 0.0, "8507": 0.0, "8513": 0.2, "8518": 0.0, "8528": 0.0, "8539": 0.2, "8544": 0.1, "87": 0.1, "8711": 0.25, "8712": 0.25, "8714": 0.25, "8715": 0.3,
        "90": 0.0, "9004": 0.2, "91": 0.2, "94": 0.3, "9405": 0.3, "95": 0.2, "9503": 0.2, "9506": 0.2, "96": 0.2,
      },
    },
    { key: "kkdf", label: "KKDF (vadeli ödeme)", rate: 0.06, base: "cif", deferredPaymentOnly: true },
    { key: "trt", label: "TRT bandrolü", rate: 0, base: "cif+duty+extra", rateByHs: { "851713": 0.12, "851714": 0.12, "852872": 0.1, "8527": 0.1, "8519": 0.1 }, approximate: true },
    { key: "otv", label: "ÖTV", rate: 0, base: "cif+duty+extra", rateByHs: { "851713": 0.5, "851714": 0.5, "852872": 0.01, "8415": 0.0 }, approximate: true },
    { key: "vat", label: "KDV", rate: 0.2, base: "cif+duty+extra", rateByHs: { "61": 0.1, "62": 0.1, "63": 0.1, "64": 0.1, "2309": 0.2 } },
  ],
  brokerFee: 4000,
  domesticShippingPerUnit: 60,
  shipping: [
    { key: "express", label: "Ekspres kurye", mode: "express", perKg: 450, minCharge: 900, transitDays: [4, 8], volumetricDivisor: 5000, brokerFee: 1200 },
    { key: "air", label: "Hava kargo", mode: "air", perKg: 260, minCharge: 3500, transitDays: [7, 14], volumetricDivisor: 6000 },
    { key: "rail", label: "Demiryolu", mode: "rail", perKg: 120, minCharge: 6000, transitDays: [20, 30], perCbm: 11000 },
    { key: "sea", label: "Deniz yolu (LCL)", mode: "sea", perKg: 70, minCharge: 9000, transitDays: [30, 45], perCbm: 7500 },
  ],
  salesVatRate: 0.2,
  commissionVatRate: 0.2,
  marketplaces: ["tr-trendyol", "tr-hepsiburada", "tr-n11", "tr-amazon"],
  commissions: { "tr-trendyol": 0.18, "tr-hepsiburada": 0.17, "tr-n11": 0.15, "tr-amazon": 0.15 },
  commissionsByGroup: {
    "tr-trendyol": {
      electronics: 0.1, computer: 0.08, home: 0.2, textile: 0.21, furniture: 0.17, kitchen: 0.12, appliances: 0.1, "fashion-women": 0.21, "fashion-men": 0.21, "fashion-kids": 0.21,
      shoes: 0.2, bags: 0.21, accessories: 0.21, beauty: 0.2, health: 0.15, sports: 0.17, motorcycle: 0.14, auto: 0.14, tools: 0.14, garden: 0.16, toys: 0.16, baby: 0.14, pet: 0.14, office: 0.16, industrial: 0.14,
    },
    "tr-hepsiburada": { electronics: 0.09, computer: 0.08, "fashion-women": 0.2, "fashion-men": 0.2, shoes: 0.18, home: 0.17, toys: 0.15 },
  },
  notes: [
    "Gümrük vergisi ve İGV oranları fasıl bazında yaklaşıktır; kesin oran GTİP'e göre değişir.",
    "KDV: tekstil, konfeksiyon ve ayakkabı %10, diğer ürünler %20.",
    "Cep telefonunda TRT bandrolü %12 (bant kademesine göre değişir) ve ÖTV %50; ÖTV matrahına gümrük vergisi, İGV ve bandrol dahildir.",
    "KKDF %6 yalnız vadeli (mal mukabili) ödemede uygulanır; peşin ve akreditifli ödemede yoktur.",
    "Trendyol komisyonları kategoriye göre %8–%21 arasındadır ve komisyona %20 KDV eklenir; satış fiyatları KDV dahildir.",
  ],
};
