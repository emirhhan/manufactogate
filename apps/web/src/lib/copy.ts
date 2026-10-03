/**
 * One vocabulary for the result and listing surfaces, so the same concept reads the same
 * everywhere: "eşleşme" is the cross-market cluster confidence (image + title + model number),
 * "benzerlik" is title-only relevance to the query or source listing.
 */
export const COPY = {
  match: "eşleşme",
  relevance: "benzerlik",
  bands: { same: "Aynı ürün", likely: "Büyük olasılıkla aynı", similar: "Benzer olabilir", hidden: "Gösterilmez" },
  relBands: { exact: "Aynı model", close: "Yakın", loose: "Olası", weak: "Benzer değil" },
  sorts: { relevance: "Pazarın sıralaması", match: "En yakın eşleşme", "price-asc": "Fiyat artan", "price-desc": "Fiyat azalan", sold: "En çok satan", moq: "MOQ artan", rating: "Puan" },
  sellability: { title: "Satılabilirlik", sub: "marj · talep · bulunabilirlik · rekabet" },
  countryCompare: { title: "Ülke karşılaştırması", sub: "indirilmiş maliyet ve net marj, ülke başına" },
  emptyResults: { title: "Sonuç yok", hint: "Filtreleri gevşet, sorunlu pazarları yeniden dene ya da sorguyu pazar dilinde yaz." },
  detail: { idle: "Özellikler, tam galeri ve fiyat merdiveni pazardan henüz çekilmedi.", empty: "Pazar bu ilan için ek özellik vermedi.", loading: "Detay pazardan çekiliyor…" },
  noRate: (code: string) => `kur yok (${code})`,
} as const;

/** Relevance band from a 0..1 title relevance score. */
export function relBand(r: number | undefined): keyof typeof COPY.relBands {
  if (r === undefined) return "weak";
  if (r >= 0.8) return "exact";
  if (r >= 0.65) return "close";
  if (r >= 0.5) return "loose";
  return "weak";
}
