import type { LinkInfo, RawListing, RawListingDetail } from "@manufactogate/core";
import { BADGES_TRENDYOL } from "../badges";
import { clean, extractCards, get, parseCount, parsePrice, readEmbedded, readJsonLd, visibleText } from "../dom";
import { META_TRENDYOL } from "../markets";
import { detectSession, pageProbe, type PageExtractor, type RealMarketDef, type SearchItem } from "../runtime";

/**
 * Trendyol. Target market for price comparison. No web image search.
 *  - search: https://www.trendyol.com/sr?q=<q>&pi=<page>  (embeds window["__single-search-result__PROPS"];
 *            older pages window.__SEARCH_APP_INITIAL_STATE__)
 *  - detail: https://www.trendyol.com/<brand>/<slug>-p-<id>?boutiqueId=&merchantId=  (micro-frontend
 *            window["__…__PROPS"] objects, legacy __PRODUCT_DETAIL_APP_INITIAL_STATE__, JSON-LD Product)
 * The merchantId query parameter selects the seller; without it Trendyol serves the buy-box winner.
 */

export const LINK_TRENDYOL = /(?:trendyol\.com)?\/[^?#]*-p-(\d+)(?:[?#]|$)/;

const BADGE_WORDS = Object.keys(BADGES_TRENDYOL);
/** Trendyol renders "2.549 TL" (whole lira) and "199,99 TL"; both are prices. */
export const PRICE_TL = /(\d{1,3}(?:\.\d{3})*(?:,\d{2})?)\s*TL\b/;

function merchantOf(url: string): string | null {
  const m = /[?&]merchantId=(\d+)/.exec(url);
  return m ? m[1]! : null;
}

/** Collects every `window["__<name>__PROPS"] = {...}` object on a micro-frontend page. */
function mfeProps(doc: Document): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  for (const s of doc.querySelectorAll("script:not([src])")) {
    const src = s.textContent ?? "";
    const re = /window\[\s*["']__([\w-]+)__PROPS["']\s*\]\s*=/g;
    for (const m of src.matchAll(re)) {
      const obj = readEmbedded<Record<string, unknown>>(doc, [`"__${m[1]}__PROPS"]`]);
      if (obj) out.push(obj);
    }
  }
  return out;
}

export const extractorTrendyol: PageExtractor = {
  session(doc) {
    return detectSession(doc, {
      loginHosts: /trendyol\.com\/giris|\/login\b/,
      captchaMarkers: ["Erişim engellendi", "Robot olmadığınızı", "Güvenlik kontrolü"],
      captchaSelectors: ["#cf-challenge-running", ".cf-challenge", "[class*='cf-challenge']"],
      loggedInMarkers: ["Hesabım", "Siparişlerim"],
      loggedInSelectors: ["[class*='account-user']", "a[href*='/hesabim']", "a[href*='/Hesabim']"],
    });
  },
  probe(doc) {
    return pageProbe(doc, {
      noResultsMarkers: ["Aradığınız ürün bulunamadı", "sonuç bulunamadı", "ürün bulunamadı"],
      resultCountRegex: /([\d.]+)\s*(?:sonuç|ürün)\s*(?:listeleniyor|bulundu)/i,
      resultsUrlPattern: /trendyol\.com\/sr\b|trendyol\.com\/[^?#]*-x-c\d+/i,
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
        const rawUrl = String(get(r, "url") ?? "");
        const url = rawUrl.startsWith("http") ? rawUrl : `https://www.trendyol.com${rawUrl}`;
        const img = (get(r, "image") as string) ?? (get(r, "images.0") as string) ?? "";
        const brand = get(r, "brand");
        const brandName = typeof brand === "string" ? brand : ((get(r, "brand.name") as string) ?? "");
        const social = (get(r, "socialProof") ?? []) as { key?: string; value?: string; count?: string | number; orderCount?: string }[];
        const orderCount = (social.find((s) => /order|sipariş/i.test(String(s.key ?? "")))?.value ?? (get(r, "socialProof.0.orderCount") as string) ?? (get(r, "socialProof.0.count") as string | number) ?? "") as string | number;
        const ratingCount = parseCount(String(get(r, "ratingScore.totalCount") ?? ""));
        const sold = parseCount(String(orderCount)) ?? ratingCount;
        const badges = new Set(BADGE_WORDS.filter((w) => JSON.stringify(r).includes(w)));
        if (get(r, "freeCargo") === true || get(r, "isFreeCargo") === true) badges.add("Kargo Bedava");
        for (const t of ((get(r, "tagDetails") ?? get(r, "tags") ?? []) as unknown[]) ?? []) {
          const text = typeof t === "string" ? t : clean(String((t as Record<string, unknown>)?.["text"] ?? (t as Record<string, unknown>)?.["name"] ?? ""));
          for (const w of BADGE_WORDS) if (text.includes(w)) badges.add(w);
        }
        const merchantName = clean(String(get(r, "merchant.name") ?? get(r, "sellerName") ?? get(r, "merchantName") ?? ""));
        const merchantId = get(r, "merchantId") ?? get(r, "merchant.id") ?? merchantOf(rawUrl);
        items.push({
          id,
          url,
          title: clean(`${brandName} ${get(r, "name") ?? ""}`),
          image: img ? (img.startsWith("http") ? img : `https://cdn.dsmcdn.com${img}`) : null,
          price: Number.isFinite(price) ? price : null,
          priceText: Number.isFinite(price) ? String(price) : null,
          priceCurrency: "TRY",
          sold,
          shop: merchantName || null,
          location: null,
          badges: [...badges],
          text: "",
          currency: "TRY",
          rating: Number(get(r, "ratingScore.averageRating") ?? NaN) || null,
          ...(ratingCount !== null ? { ratingCount } : {}),
          supplierId: merchantId !== undefined && merchantId !== null ? String(merchantId) : null,
        });
      }
      if (items.length) return items;
    }
    return extractCards(doc, {
      link: LINK_TRENDYOL,
      titleSelectors: ["[class*='prdct-desc-cntnr-name']", "[class*='product-desc']", "[class*='name']"],
      shopSelectors: ["[class*='merchant']", "[class*='seller']"],
      badgeWords: BADGE_WORDS,
      price: PRICE_TL,
      priceSelectors: ["[class*='prc-box-dscntd']", "[class*='prc-box-sllng']", "[class*='price']"],
      sold: /\((\d+(?:\.\d{3})*)\)/,
      currency: "TRY",
    }).map((c) => ({ ...c, currency: "TRY" }));
  },
  detail(doc) {
    // Only a product page counts; the search page also renders prices and an h1.
    const where = `${doc.location?.href ?? ""} ${doc.querySelector("link[rel='canonical']")?.getAttribute("href") ?? ""}`;
    if (!/-p-\d+/.test(where)) return null;
    // Legacy state, then any micro-frontend props object that carries a product, then JSON-LD Product.
    const legacy = readEmbedded<Record<string, unknown>>(doc, ["window.__PRODUCT_DETAIL_APP_INITIAL_STATE__", "__PRODUCT_DETAIL_APP_INITIAL_STATE__"]);
    let p = get(legacy, "product") as Record<string, unknown> | undefined;
    if (!p) {
      for (const props of mfeProps(doc)) {
        const cand = (get(props, "product") ?? get(props, "data.product") ?? get(props, "productDetail") ?? get(props, "data.productDetail")) as Record<string, unknown> | undefined;
        if (cand && (get(cand, "name") || get(cand, "id"))) {
          p = cand;
          break;
        }
      }
    }
    if (p) {
      const price = Number(get(p, "price.sellingPrice.value") ?? get(p, "price.discountedPrice.value") ?? get(p, "price.sellingPrice") ?? get(p, "price.discountedPrice") ?? NaN);
      const images = ((get(p, "images") ?? []) as unknown[]).map((i) => (typeof i === "string" ? i : String((i as Record<string, unknown>)?.["url"] ?? ""))).filter(Boolean).map((i) => (i.startsWith("http") ? i : `https://cdn.dsmcdn.com${i}`));
      return {
        strategy: "embedded",
        title: clean(`${get(p, "brand.name") ?? ""} ${get(p, "name") ?? ""}`),
        price: Number.isFinite(price) ? price : null,
        sold: parseCount(String(get(p, "ratingSummary.totalRatingCount") ?? get(p, "ratingScore.totalCount") ?? "")),
        rating: Number(get(p, "ratingSummary.averageRating") ?? get(p, "ratingScore.averageRating") ?? NaN) || null,
        images,
        shop: clean(String(get(p, "merchant.name") ?? get(p, "merchant.merchantName") ?? "")),
        shopId: get(p, "merchant.id") !== undefined ? String(get(p, "merchant.id")) : (merchantOf(doc.location?.href ?? "") ?? ""),
        badges: BADGE_WORDS.filter((w) => JSON.stringify(p).includes(w)),
        attributes: Object.fromEntries((((get(p, "attributes") ?? []) as { key?: { name?: string }; value?: { name?: string } }[]) ?? []).map((a) => [a.key?.name ?? "", a.value?.name ?? ""])),
      };
    }
    const ld = readJsonLd(doc, "Product")[0];
    const text = visibleText(doc, 120_000);
    const title = clean(doc.querySelector("h1")?.textContent) || clean(typeof ld?.["name"] === "string" ? (ld["name"] as string) : "") || clean(doc.title.replace(/\s*-\s*Trendyol.*$/i, ""));
    const ldOffer = ld && ((Array.isArray(ld["offers"]) ? ld["offers"][0] : ld["offers"]) as Record<string, unknown> | undefined);
    const ldPrice = ldOffer && (typeof ldOffer["price"] === "number" || typeof ldOffer["price"] === "string") ? parsePrice(String(ldOffer["price"])) : null;
    const priceM = PRICE_TL.exec(clean(doc.querySelector("[class*='prc-dsc'], [class*='price-view'], [class*='product-price']")?.textContent)) ?? PRICE_TL.exec(text);
    const price = ldPrice ?? (priceM ? parsePrice(priceM[1]) : null);
    if (!title || price === null) return null;
    // Seller: the "Satıcı" label, a store link, or the merchant id from the URL.
    const sellerLink = doc.querySelector("a[href*='/magaza/'], a[href*='/sr?mid='], [class*='merchant-box'] a, [class*='seller-name'] a, [class*='seller'] a");
    const sellerLabel = /Satıcı:?\s+([^\n|·]{2,60}?)(?:\s{2,}|\s*(?:Puan|\d[.,]\d)|$)/.exec(text)?.[1];
    const shop = clean(sellerLink?.textContent) || clean(sellerLabel);
    const images = [...new Set([...doc.querySelectorAll<HTMLImageElement>("img")].map((i) => i.getAttribute("src") ?? "").filter((u) => /cdn\.dsmcdn\.com\/.*\/prod\//.test(u)))].slice(0, 8);
    const ratingM = /(\d[.,]\d)\s*(?:\(|\d+\s*Değerlendirme)/.exec(text);
    return {
      strategy: "dom",
      title,
      price,
      sold: parseCount(/(\d[\d.]*)\s*Değerlendirme/i.exec(text)?.[1]) ?? null,
      rating: ratingM ? Number(ratingM[1]!.replace(",", ".")) : null,
      images,
      shop,
      shopId: merchantOf(doc.location?.href ?? "") ?? "",
      badges: BADGE_WORDS.filter((w) => text.includes(w)),
    };
  },
};

export const defTrendyol: RealMarketDef = {
  id: "tr-trendyol",
  // Trendyol has no web image search; the app falls back to the listing title for this market.
  meta: { ...META_TRENDYOL, version: "0.3.0", capabilities: { ...META_TRENDYOL.capabilities, imageSearch: false } },
  badgeMap: BADGES_TRENDYOL,
  healthQuery: "bluetooth kulaklık",
  homeUrl: "https://www.trendyol.com/",
  searchUrl: (q, page = 1) => `https://www.trendyol.com/sr?q=${encodeURIComponent(q)}${page > 1 ? `&pi=${page}` : ""}`,
  maxPages: 3,
  resultsUrlPattern: /trendyol\.com\/sr\b|trendyol\.com\/[^?#]*-x-c\d+/i,
  noResultsMarkers: ["Aradığınız ürün bulunamadı", "sonuç bulunamadı"],
  calibration: "live",
  detailUrl: (id) => `https://www.trendyol.com/p/-p-${id}`,
  resolveLink(url): LinkInfo | null {
    const m = LINK_TRENDYOL.exec(url);
    if (!m || !/trendyol\.com/.test(url)) return null;
    // Keep merchantId/boutiqueId: they identify the seller whose offer the listing shows.
    let canonical = url.split("#")[0]!;
    try {
      const u = new URL(url);
      const keep = new URLSearchParams();
      for (const k of ["boutiqueId", "merchantId"]) {
        const v = u.searchParams.get(k);
        if (v) keep.set(k, v);
      }
      canonical = `${u.origin}${u.pathname}${keep.toString() ? `?${keep.toString()}` : ""}`;
    } catch {
      canonical = url.split("?")[0]!;
    }
    return { market: "tr-trendyol", listingId: m[1]!, canonicalUrl: canonical };
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
      url: d["shopId"] ? `https://www.trendyol.com/p/-p-${id}?merchantId=${String(d["shopId"])}` : `https://www.trendyol.com/p/-p-${id}`,
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
      ...(d["attributes"] && Object.keys(d["attributes"] as object).length ? { attributes: d["attributes"] as Record<string, string> } : {}),
    };
  },
};
