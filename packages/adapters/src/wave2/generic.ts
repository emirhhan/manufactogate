import type { LinkInfo, MarketMeta, NormalizedBadge, RawListing, RawListingDetail } from "@manufactogate/core";
import { clean, extractCards, parsePrice, textOf } from "../dom";
import { detectSession, type PageExtractor, type RealMarketDef, type SearchItem } from "../runtime";

/** Generic text-search market definition built on card extraction; used by all beta markets. */
const RL = { minIntervalMs: 3000, maxPerHour: 100 };

export interface GenericDef {
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

export function makeDef(g: GenericDef): RealMarketDef {
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

