import type { LinkInfo, RawListing, RawListingDetail } from "@manufactogate/core";
import { BADGES_TRENDYOL } from "../badges";
import { clean, extractCards, get, parseCount, parsePrice, readEmbedded } from "../dom";
import { META_TRENDYOL } from "../markets";
import { detectSession, type PageExtractor, type RealMarketDef, type SearchItem } from "../runtime";

/**
 * Trendyol. Target market for price comparison.
 *  - search: https://www.trendyol.com/sr?q=<q>  (embeds window.__SEARCH_APP_INITIAL_STATE__)
 *  - detail: https://www.trendyol.com/<brand>/<slug>-p-<id>  (embeds window.__PRODUCT_DETAIL_APP_INITIAL_STATE__)
 */

export const LINK_TRENDYOL = /(?:trendyol\.com)?\/[^?#]*-p-(\d+)(?:[?#]|$)/;

const BADGE_WORDS = Object.keys(BADGES_TRENDYOL);

export const extractorTrendyol: PageExtractor = {
  session(doc) {
    return detectSession(doc, {
      loginHosts: /\/giris|\/login/,
      captchaMarkers: ["cf-challenge", "Erişim engellendi", "captcha"],
      loggedInMarkers: ["Hesabım", "account-user"],
    });
  },
  search(doc): SearchItem[] {
    const state = readEmbedded<Record<string, unknown>>(doc, [
      '"__single-search-result__PROPS"]',
      "window.__SEARCH_APP_INITIAL_STATE__",
      "__SEARCH_APP_INITIAL_STATE__",
    ]);
    const products = (get(state, "data.products") ?? get(state, "products")) as unknown[] | undefined;
    if (Array.isArray(products) && products.length) {
      const items: SearchItem[] = [];
      for (const p of products) {
        const r = p as Record<string, unknown>;
        const id = String(get(r, "id") ?? "");
        if (!/^\d+$/.test(id)) continue;
        const price = Number(get(r, "price.discountedPrice") ?? get(r, "price.sellingPrice") ?? get(r, "price.current") ?? NaN);
        const url = String(get(r, "url") ?? "");
        const img = (get(r, "image") as string) ?? (get(r, "images.0") as string) ?? "";
        const brand = get(r, "brand");
        const brandName = typeof brand === "string" ? brand : ((get(r, "brand.name") as string) ?? "");
        items.push({
          id,
          url: url.startsWith("http") ? url : `https://www.trendyol.com${url}`,
          title: clean(`${brandName} ${get(r, "name") ?? ""}`),
          image: img ? (img.startsWith("http") ? img : `https://cdn.dsmcdn.com${img}`) : null,
          price: Number.isFinite(price) ? price : null,
          priceText: Number.isFinite(price) ? String(price) : null,
          sold: parseCount(String(get(r, "ratingScore.totalCount") ?? get(r, "socialProof.0.count") ?? "")),
          shop: clean(String(get(r, "merchant.name") ?? get(r, "sellerName") ?? "")) || null,
          location: null,
          badges: BADGE_WORDS.filter((w) => JSON.stringify(r).includes(w)),
          text: "",
          currency: "TRY",
          rating: Number(get(r, "ratingScore.averageRating") ?? NaN) || null,
          supplierId: get(r, "merchantId") !== undefined ? String(get(r, "merchantId")) : null,
        });
      }
      if (items.length) return items;
    }
    return extractCards(doc, {
      link: LINK_TRENDYOL,
      titleSelectors: ["[class*='prdct-desc-cntnr-name']", "[class*='product-desc']", "[class*='name']"],
      shopSelectors: ["[class*='merchant']", "[class*='seller']"],
      badgeWords: BADGE_WORDS,
      price: /([\d.]+,\d{2})\s*TL/,
      sold: /\((\d+(?:\.\d{3})*)\)/,
    }).map((c) => ({ ...c, currency: "TRY" }));
  },
  detail(doc) {
    const state = readEmbedded<Record<string, unknown>>(doc, ["window.__PRODUCT_DETAIL_APP_INITIAL_STATE__", "__PRODUCT_DETAIL_APP_INITIAL_STATE__"]);
    const p = get(state, "product") as Record<string, unknown> | undefined;
    if (p) {
      const price = Number(get(p, "price.sellingPrice.value") ?? get(p, "price.discountedPrice.value") ?? NaN);
      const images = ((get(p, "images") ?? []) as string[]).map((i) => (i.startsWith("http") ? i : `https://cdn.dsmcdn.com${i}`));
      return {
        strategy: "embedded",
        title: clean(`${get(p, "brand.name") ?? ""} ${get(p, "name") ?? ""}`),
        price: Number.isFinite(price) ? price : null,
        sold: parseCount(String(get(p, "ratingSummary.totalRatingCount") ?? get(p, "ratingScore.totalCount") ?? "")),
        rating: Number(get(p, "ratingSummary.averageRating") ?? get(p, "ratingScore.averageRating") ?? NaN) || null,
        images,
        shop: clean(String(get(p, "merchant.name") ?? "")),
        shopId: get(p, "merchant.id") !== undefined ? String(get(p, "merchant.id")) : "",
        badges: BADGE_WORDS.filter((w) => JSON.stringify(p).includes(w)),
        attributes: Object.fromEntries((((get(p, "attributes") ?? []) as { key?: { name?: string }; value?: { name?: string } }[]) ?? []).map((a) => [a.key?.name ?? "", a.value?.name ?? ""])),
      };
    }
    const body = doc.body?.textContent ?? "";
    const title = clean(doc.querySelector("h1")?.textContent) || clean(doc.title);
    const priceM = /([\d.]+,\d{2})\s*TL/.exec(body);
    if (!title || !priceM) return null;
    return { strategy: "dom", title, price: parsePrice(priceM[1]), sold: null, rating: null, images: [], shop: clean(doc.querySelector("[class*='merchant'] a,[class*='seller']")?.textContent), shopId: "", badges: [] };
  },
};

export const defTrendyol: RealMarketDef = {
  id: "tr-trendyol",
  meta: { ...META_TRENDYOL, version: "0.1.0" },
  badgeMap: BADGES_TRENDYOL,
  healthQuery: "bluetooth kulaklık",
  searchUrl: (q, page = 1) => `https://www.trendyol.com/sr?q=${encodeURIComponent(q)}${page > 1 ? `&pi=${page}` : ""}`,
  maxPages: 3,
  detailUrl: (id) => `https://www.trendyol.com/p/-p-${id}`,
  resolveLink(url): LinkInfo | null {
    const m = LINK_TRENDYOL.exec(url);
    if (!m || !/trendyol\.com/.test(url)) return null;
    return { market: "tr-trendyol", listingId: m[1]!, canonicalUrl: url.split("?")[0]! };
  },
  extractor: extractorTrendyol,
  toListing(item, fetchedAt): RawListing | null {
    if (!item.id || !item.title || item.price === null) return null;
    return {
      market: "tr-trendyol",
      id: item.id,
      url: item.url,
      title: item.title,
      images: item.image ? [item.image] : [],
      price: { currency: "TRY", tiers: [{ minQty: 1, unitPrice: item.price }] },
      moq: 1,
      ...(item.sold !== null && item.sold !== undefined ? { sold: item.sold } : {}),
      ...(item.rating ? { rating: item.rating } : {}),
      ...(item.shop ? { supplierName: item.shop } : {}),
      ...(item.supplierId ? { supplierId: item.supplierId } : {}),
      badges: item.badges,
      fetchedAt,
    };
  },
  toDetail(d, id, fetchedAt): RawListingDetail | null {
    if (!d["title"] || typeof d["price"] !== "number") return null;
    return {
      market: "tr-trendyol",
      id,
      url: `https://www.trendyol.com/p/-p-${id}`,
      title: String(d["title"]),
      images: (d["images"] as string[]) ?? [],
      price: { currency: "TRY", tiers: [{ minQty: 1, unitPrice: d["price"] as number }] },
      moq: 1,
      ...(typeof d["sold"] === "number" ? { sold: d["sold"] as number } : {}),
      ...(typeof d["rating"] === "number" ? { rating: d["rating"] as number } : {}),
      ...(d["shop"] ? { supplierName: String(d["shop"]) } : {}),
      ...(d["shopId"] ? { supplierId: String(d["shopId"]) } : {}),
      badges: (d["badges"] as string[]) ?? [],
      fetchedAt,
      ...(d["attributes"] ? { attributes: d["attributes"] as Record<string, string> } : {}),
    };
  },
};
