import type { RealMarketDef } from "../runtime";
import { makeDef } from "./generic";

/**
 * Wave-2 markets (beta): generic card extraction over the market's search page.
 */

const USD = /US\s?\$\s?([\d.,]+)|\$\s?([\d.,]+)/;
const TL = /([\d.]+,\d{2})\s*TL|₺\s?([\d.]+,\d{2})/;

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
  price: USD,
  sold: /((?:\d+(?:[.,]\d+)?)K?\+?)\s*(?:sold|orders?)/i,
  badgeMap: { "Verified Supplier": "verified-supplier", "Trade Assurance": "trade-assurance", "Gold Supplier": "gold-supplier" },
  healthQuery: "bluetooth earbuds",
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
  price: USD,
  sold: /((?:\d+(?:[.,]\d+)?)K?\+?)\s*(?:sold|satıldı)/i,
  badgeMap: { Choice: "top-rated", "Free shipping": "fast-shipping" },
  healthQuery: "bluetooth earbuds",
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
  sold: /\((\d+(?:\.\d{3})*)\)/,
  badgeMap: { "Hızlı Teslimat": "fast-shipping", "Resmi Satıcı": "official-store" },
  healthQuery: "bluetooth kulaklık",
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
  badgeMap: { "Mağaza Ücretsiz Kargo": "fast-shipping" },
  healthQuery: "bluetooth kulaklık",
});

export const defAmazonTr = makeDef({
  id: "tr-amazon",
  name: "Amazon TR",
  country: "tr",
  currency: "TRY",
  language: "tr",
  role: "target",
  hosts: ["*.amazon.com.tr"],
  searchUrl: (q, page) => `https://www.amazon.com.tr/s?k=${encodeURIComponent(q)}${page > 1 ? `&page=${page}` : ""}`,
  link: /\/dp\/([A-Z0-9]{10})/,
  detailUrl: (id) => `https://www.amazon.com.tr/dp/${id}`,
  price: TL,
  sold: /\(?(\d+(?:\.\d{3})*)\)?\s*(?:değerlendirme|yorum)/i,
  titleSelectors: ["h2 span", "h2", "[class*='title']"],
  badgeMap: { "Amazon's Choice": "top-rated", "Prime": "fast-shipping" },
  healthQuery: "bluetooth kulaklık",
  captchaMarkers: ["Robot olmadığınızı", "captcha", "api-services-support@amazon.com"],
});

export const WAVE2_DEFS: RealMarketDef[] = [defAlibaba, defAliExpress, defHepsiburada, defN11, defAmazonTr];
