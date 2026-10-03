import type { LinkInfo, MarketMeta, NormalizedBadge, RawListing, RawListingDetail } from "@manufactogate/core";
import { clean, extractCards, parsePrice, textOf } from "../dom";
import { detectSession, type PageExtractor, type RealMarketDef, type SearchItem } from "../runtime";

/**
 * Wave-2 markets (beta): generic card extraction over the market's search page.
 * No embedded-state parsing yet; selectors are calibrated with captured fixtures as they arrive.
 */

const RL = { minIntervalMs: 3000, maxPerHour: 100 };

interface GenericDef {
  id: `${string}-${string}`;
  name: string;
  country: string;
  currency: string;
  language: string;
  role: MarketMeta["role"];
  hosts: string[];
  searchUrl: (q: string, page: number) => string;
  link: RegExp;
  detailUrl: (id: string) => string;
  price: RegExp;
  sold?: RegExp;
  titleSelectors?: string[];
  shopSelectors?: string[];
  badgeMap?: Record<string, NormalizedBadge>;
  healthQuery: string;
  captchaMarkers?: string[];
}

function makeDef(g: GenericDef): RealMarketDef {
  const extractor: PageExtractor = {
    session(doc) {
      return detectSession(doc, {
        loginHosts: /\/login|\/signin|passport|giris/i,
        captchaMarkers: g.captchaMarkers ?? ["captcha", "robot check", "Erişim engellendi", "unusual traffic"],
        loggedInMarkers: [],
      });
    },
    search(doc): SearchItem[] {
      return extractCards(doc, {
        link: g.link,
        price: g.price,
        ...(g.sold ? { sold: g.sold } : {}),
        titleSelectors: g.titleSelectors ?? ["h2", "h3", "[class*='title']", "[class*='name']", "a[title]"],
        shopSelectors: g.shopSelectors ?? ["[class*='supplier']", "[class*='store']", "[class*='seller']", "[class*='merchant']", "[class*='shop']"],
        badgeWords: Object.keys(g.badgeMap ?? {}),
      }).map((c) => ({ ...c, currency: g.currency }));
    },
    detail(doc) {
      const body = doc.body ? textOf(doc.body) : "";
      const title = clean(doc.querySelector("h1")?.textContent) || clean(doc.title);
      const m = g.price.exec(body);
      const price = m ? parsePrice(m[1] ?? m[0]) : null;
      if (!title || price === null) return null;
      const images = [...doc.querySelectorAll<HTMLImageElement>("img")].map((i) => i.getAttribute("src") ?? "").filter((u) => /^https?:/.test(u) && !/\.svg|sprite|icon|logo/i.test(u)).slice(0, 8);
      return { strategy: "dom", title, price, images, badges: [] };
    },
  };
  const detailUrl = g.detailUrl;
  return {
    id: g.id,
    meta: {
      name: g.name,
      country: g.country,
      currency: g.currency,
      language: g.language,
      role: g.role,
      capabilities: { imageSearch: false, textSearch: true, linkResolve: true, supplierProfile: false, priceTiers: false },
      rateLimit: RL,
      version: "0.1.0-beta",
      hosts: g.hosts,
    },
    badgeMap: g.badgeMap ?? {},
    healthQuery: g.healthQuery,
    searchUrl: (q, page = 1) => g.searchUrl(q, page),
    maxPages: 2,
    detailUrl,
    resolveLink(url): LinkInfo | null {
      if (!g.hosts.some((h) => url.includes(h.replace("*.", "")))) return null;
      const m = g.link.exec(url);
      return m?.[1] ? { market: g.id, listingId: m[1], canonicalUrl: detailUrl(m[1]) } : null;
    },
    extractor,
    toListing(item, fetchedAt): RawListing | null {
      if (!item.id || !item.title || item.price === null) return null;
      return {
        market: g.id,
        id: item.id,
        url: item.url,
        title: item.title,
        images: item.image ? [item.image] : [],
        price: { currency: g.currency, tiers: [{ minQty: item.moq ?? 1, unitPrice: item.price }] },
        ...(item.moq ? { moq: item.moq } : {}),
        ...(item.sold !== null && item.sold !== undefined ? { sold: item.sold } : {}),
        ...(item.shop ? { supplierName: item.shop } : {}),
        ...(item.location ? { location: item.location } : {}),
        badges: item.badges,
        fetchedAt,
      };
    },
    toDetail(d, id, fetchedAt): RawListingDetail | null {
      if (!d["title"] || typeof d["price"] !== "number") return null;
      return {
        market: g.id,
        id,
        url: detailUrl(id),
        title: String(d["title"]),
        images: (d["images"] as string[]) ?? [],
        price: { currency: g.currency, tiers: [{ minQty: 1, unitPrice: d["price"] as number }] },
        badges: [],
        fetchedAt,
      };
    },
  };
}

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
