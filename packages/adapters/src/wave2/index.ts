import type { RealMarketDef } from "../runtime";
import { amazonDef } from "./amazon";
import { makeDef } from "./generic";

/**
 * Wave-2 markets (beta): generic card extraction over the market's search page.
 * All run through the search URL; a market opts into the human-like typed search only when
 * its results page refuses direct URLs.
 */

export const USD = /US\s?\$\s?([\d.,]+)|\$\s?([\d.,]+)/;
export const TL = /([\d.]+(?:,\d{2})?)\s*TL\b|₺\s?([\d.]+(?:,\d{2})?)/;
/** AliExpress / Alibaba show the account's currency: USD by default, TRY/EUR for localised sessions. */
const MULTI = /US\s?\$\s?([\d.,]+)|\$\s?([\d.,]+)|(?:TRY|₺|€|EUR)\s?([\d.,]+)|([\d.,]+)\s?(?:TL|₺|€)/;

export const defAlibaba = makeDef({
  id: "cn-alibaba",
  name: "Alibaba.com",
  country: "cn",
  currency: "USD",
  language: "en",
  role: "source",
  hosts: ["*.alibaba.com"],
  searchUrl: (q, page) => `https://www.alibaba.com/trade/search?SearchText=${encodeURIComponent(q)}${page > 1 ? `&page=${page}` : ""}`,
  link: /alibaba\.com\/product-detail\/[^"?#]*?_(\d{9,})\.html/,
  detailUrl: (id) => `https://www.alibaba.com/product-detail/_${id}.html`,
  price: MULTI,
  sold: /((?:\d+(?:[.,]\d+)?)K?\+?)\s*(?:sold|satıldı)\b/i,
  moq: /(?:Min\.?\s*order|MOQ)\.?:?\s*([\d,]+)/i,
  years: /(\d{1,2})\s*(?:yrs?|years?|yıl)\b/i,
  titleSelectors: ["h2", "[class*='subject' i]", "[class*='title' i] a", "[class*='title' i]"],
  shopSelectors: ["[class*='supplier' i] a", "[class*='company' i]", "[class*='supplier' i]"],
  badgeMap: { "Verified Supplier": "verified-supplier", "Verified": "verified-supplier", "Trade Assurance": "trade-assurance", "Gold Supplier": "gold-supplier", "Manufacturer": "verified-factory", "Üretici": "verified-factory", "Doğrulanmış": "verified-supplier" },
  searchBoxSelectors: ["input[name='SearchText']", ".search-bar-input", "input[placeholder*='What are you looking for' i]"],
  resultsUrlPattern: /alibaba\.com\/(?:trade\/search|products\/|[^/?#]+_[^/?#]*\.html|showroom\/)/i,
  noResultsMarkers: ["No results found", "Sorry, no matching", "we couldn't find"],
  resultCountRegex: /([\d,]+)\s*(?:products|results)\s*(?:found|for)/i,
  healthQuery: "bluetooth earbuds",
  calibration: "none",
});

export const defAliExpress = makeDef({
  id: "cn-aliexpress",
  name: "AliExpress",
  country: "cn",
  currency: "USD",
  language: "en",
  role: "source",
  hosts: ["*.aliexpress.com", "*.aliexpress.us"],
  searchUrl: (q, page) => `https://www.aliexpress.com/w/wholesale-${encodeURIComponent(q.trim().replace(/\s+/g, "-"))}.html${page > 1 ? `?page=${page}` : ""}`,
  link: /aliexpress\.(?:com|us)\/item\/(\d{10,})\.html/,
  detailUrl: (id) => `https://www.aliexpress.com/item/${id}.html`,
  price: MULTI,
  sold: /((?:\d+(?:[.,]\d+)?)K?\+?)\s*(?:sold|satıldı|vendidos|verkauft)\b/i,
  ratingSelectors: ["[class*='evaluation' i]", "[class*='rating' i]", "[class*='star' i]"],
  badgeMap: { Choice: "top-rated", "Free shipping": "fast-shipping", "Ücretsiz kargo": "fast-shipping", "Ücretsiz Gönderim": "fast-shipping" },
  searchBoxSelectors: ["input[name='SearchText']", "input[placeholder*='Search' i]", "input[placeholder*='Ara' i]"],
  resultsUrlPattern: /aliexpress\.(?:com|us)\/(?:w\/wholesale-|wholesale\?|af\/|category\/|.*SearchText=)/i,
  noResultsMarkers: ["Sorry, we couldn't find", "Sorry, your search", "Üzgünüz", "No results found"],
  resultCountRegex: /([\d,.]+\+?)\s*(?:results|sonuç|items)/i,
  healthQuery: "bluetooth earbuds",
  calibration: "none",
});

export const defHepsiburada = makeDef({
  id: "tr-hepsiburada",
  name: "Hepsiburada",
  country: "tr",
  currency: "TRY",
  language: "tr",
  role: "target",
  hosts: ["*.hepsiburada.com"],
  searchUrl: (q, page) => `https://www.hepsiburada.com/ara?q=${encodeURIComponent(q)}${page > 1 ? `&sayfa=${page}` : ""}`,
  link: /(?:hepsiburada\.com)?\/[^"?#]*-p-([A-Z0-9]{6,})(?:[?#]|$)/,
  detailUrl: (id) => `https://www.hepsiburada.com/p-${id}`,
  price: TL,
  ratingCount: /\((\d+(?:\.\d{3})*)\)/,
  priceSelectors: ["[data-test-id='price-current-price']", "[data-test-id*='price' i]", "[class*='price' i]"],
  titleSelectors: ["[data-test-id='product-card-name']", "h3", "[class*='title' i]", "[class*='name' i]"],
  shopSelectors: ["[data-test-id*='merchant' i]", "[class*='merchant' i]", "[class*='seller' i]"],
  ratingSelectors: ["[data-test-id*='rating' i]", "[class*='rating' i]"],
  badgeMap: { "Hızlı Teslimat": "fast-shipping", "Resmi Satıcı": "official-store", "Çok Satan": "top-rated", "Yetkili Satıcı": "official-store" },
  searchBoxSelectors: ["input[data-test-id='search-input']", "#SearchBoxOld", "input[placeholder*='Ürün, kategori' i]"],
  resultsUrlPattern: /hepsiburada\.com\/ara\?|hepsiburada\.com\/[^?#]*-c-\d+/i,
  noResultsMarkers: ["için sonuç bulunamadı", "Sonuç bulunamadı", "ürün bulunamadı"],
  resultCountRegex: /([\d.]+)\s*sonuç/i,
  healthQuery: "bluetooth kulaklık",
  calibration: "live",
});

export const defN11 = makeDef({
  id: "tr-n11",
  name: "n11",
  country: "tr",
  currency: "TRY",
  language: "tr",
  role: "target",
  hosts: ["*.n11.com"],
  searchUrl: (q, page) => `https://www.n11.com/arama?q=${encodeURIComponent(q)}${page > 1 ? `&pg=${page}` : ""}`,
  link: /(?:n11\.com)?\/urun\/[^"?#]*?-(\d{6,})(?:[?#/]|$)/,
  detailUrl: (id) => `https://www.n11.com/urun/-${id}`,
  price: TL,
  ratingCount: /\((\d+(?:\.\d{3})*)\)/,
  priceSelectors: [".newPrice", "[class*='newPrice' i]", ".priceContainer", "[class*='price' i]"],
  titleSelectors: ["h3.productName", "[class*='productName' i]", "h3", "[class*='name' i]"],
  shopSelectors: [".sallerName", "[class*='sallerName' i]", "[class*='sellerName' i]", "[class*='seller' i]"],
  ratingSelectors: [".ratingText", "[class*='rating' i]"],
  badgeMap: { "Mağaza Ücretsiz Kargo": "fast-shipping", "Ücretsiz Kargo": "fast-shipping", "Çok Satan": "top-rated" },
  searchBoxSelectors: ["#searchData", "input[name='q']"],
  resultsUrlPattern: /n11\.com\/arama\?|n11\.com\/[^?#]+\?q=/i,
  noResultsMarkers: ["Sonuç bulunamadı", "için sonuç bulunamadı", "ürün bulunamadı"],
  resultCountRegex: /([\d.]+)\s*(?:ürün|sonuç)/i,
  healthQuery: "bluetooth kulaklık",
  calibration: "none",
});

export const defAmazonTr = amazonDef({
  id: "tr-amazon",
  name: "Amazon TR",
  country: "tr",
  currency: "TRY",
  language: "tr",
  host: "amazon.com.tr",
  price: TL,
  healthQuery: "bluetooth kulaklık",
  noResults: ["için sonuç bulunamadı", "sonuç bulunamadı", "No results for"],
  calibration: "live",
});

export const WAVE2_DEFS: RealMarketDef[] = [defAlibaba, defAliExpress, defHepsiburada, defN11, defAmazonTr];
export { amazonDef } from "./amazon";
export { makeDef, resultsPatternFor, GENERIC_CAPTCHA_MARKERS, GENERIC_NO_RESULTS_MARKERS, type GenericDef } from "./generic";
