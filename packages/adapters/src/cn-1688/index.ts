import type { LinkInfo, RawListing, RawListingDetail, RawSupplier } from "@manufactogate/core";
import { BADGES_1688 } from "../badges";
import { extractCards, get, parseCount, parsePrice, readEmbedded, clean } from "../dom";
import { META_1688 } from "../markets";
import { detectSession, type RealMarketDef, type SearchItem, type SearchPayload, type DetailPayload, type SupplierPayload } from "../runtime";
import type { PageExtractor } from "../runtime";

/**
 * 1688 (阿里巴巴批发网). Wholesale source market with MOQ price ladders and factory badges.
 * Pages used:
 *  - search:   https://s.1688.com/selloffer/offer_search.htm?keywords=<q>
 *  - image:    https://s.1688.com/youyuan/index.htm?tab=imageSearch  (page hosts a file input)
 *  - detail:   https://detail.1688.com/offer/<id>.html  (embeds window.__INIT_DATA)
 *  - supplier: https://<member>.1688.com/ (winport); we read it from the detail page instead.
 */

export const LINK_1688 = /(?:^|\/\/)detail\.1688\.com\/offer\/(\d+)\.html/;

const BADGE_WORDS = Object.keys(BADGES_1688);

export const extractor1688: PageExtractor = {
  session(doc) {
    return detectSession(doc, {
      loginHosts: /login\.1688\.com|login\.taobao\.com|passport/,
      captchaMarkers: ["punish", "nocaptcha", "_____tmd_____", "滑动验证", "验证码"],
      loggedOutMarkers: ["id=\"login-form\"", "密码登录", "扫码登录", "fm-login-id"],
      loggedInMarkers: ["\"loginId\"", "memberId", "退出", "我的阿里"],
    });
  },

  search(doc): SearchItem[] {
    // Strategy 1: embedded result data (several historical variable names).
    const embedded = readEmbedded<Record<string, unknown>>(doc, ["window.__INIT_DATA__", "window.__INIT_DATA", "window.__INITIAL_STATE__", "__INIT_DATA"]);
    const offers = (get(embedded, "data.offerList") ?? get(embedded, "offerList") ?? get(embedded, "data.data.offerList")) as unknown[] | undefined;
    if (Array.isArray(offers) && offers.length) {
      const items: SearchItem[] = [];
      for (const o of offers) {
        const r = o as Record<string, unknown>;
        const id = String(get(r, "id") ?? get(r, "offerId") ?? get(r, "information.id") ?? "");
        if (!/^\d+$/.test(id)) continue;
        const title = clean(String(get(r, "information.subject") ?? get(r, "subject") ?? get(r, "title") ?? ""));
        const price = parsePrice(String(get(r, "tradePrice.offerPrice.valueString") ?? get(r, "tradePrice.offerPrice.value") ?? get(r, "price") ?? ""));
        items.push({
          id,
          url: `https://detail.1688.com/offer/${id}.html`,
          title,
          image: (get(r, "image.imgUrl") as string) ?? (get(r, "imgUrl") as string) ?? null,
          price,
          priceText: price !== null ? String(price) : null,
          sold: parseCount(String(get(r, "tradeQuantity.number") ?? get(r, "saleQuantity") ?? get(r, "tradeQuantity.quantity") ?? "")),
          shop: clean(String(get(r, "company.name") ?? get(r, "companyName") ?? "")) || null,
          location: clean(String(get(r, "company.province") ?? "")) || null,
          badges: BADGE_WORDS.filter((w) => JSON.stringify(r).includes(w)),
          text: "",
          currency: "CNY",
          moq: parseCount(String(get(r, "tradePrice.quantityBegin") ?? get(r, "quantityBegin") ?? "")),
          supplierId: (get(r, "company.loginId") as string) ?? null,
        });
      }
      if (items.length) return items;
    }
    // Strategy 2: DOM cards.
    return extractCards(doc, {
      link: LINK_1688,
      titleSelectors: [".offer-title", ".title a", ".title", "[class*='title']"],
      shopSelectors: [".company-name", "[class*='company']", "[class*='shop-name']", "[class*='seller']"],
      locationSelectors: ["[class*='location']", "[class*='address']"],
      badgeWords: BADGE_WORDS,
      sold: /(?:成交|已售)\s*((?:\d+(?:[.,]\d+)?)(?:万)?\+?)/,
    }).map((c) => {
      const moqM = /(\d+)\s*(?:件|个|套|双|条|台|只|箱)\s*起批/.exec(c.text);
      return { ...c, currency: "CNY", moq: moqM ? Number(moqM[1]) : null };
    });
  },

  detail(doc) {
    const data = readEmbedded<Record<string, unknown>>(doc, ["window.__INIT_DATA", "window.__INIT_DATA__", "__INIT_DATA"]);
    if (data) {
      const g = (p: string) => get(data, p);
      const title = clean(String(g("tempModel.offerTitle") ?? g("globalData.tempModel.offerTitle") ?? g("data.tempModel.offerTitle") ?? doc.title));
      const ranges = (g("globalData.orderParamModel.orderParam.skuParam.skuRangePrices") ??
        g("globalData.skuModel.skuRangePrices") ??
        g("data.globalData.orderParamModel.orderParam.skuParam.skuRangePrices")) as { beginAmount?: number; price?: number | string }[] | undefined;
      const tiers = Array.isArray(ranges)
        ? ranges.map((t) => ({ minQty: Number(t.beginAmount ?? 1), unitPrice: parsePrice(String(t.price ?? "")) ?? 0 })).filter((t) => t.unitPrice > 0)
        : [];
      const images = ((g("images") ?? g("globalData.images") ?? g("data.images") ?? []) as { fullPathImageURI?: string; originalImageURI?: string }[])
        .map((i) => i.fullPathImageURI ?? i.originalImageURI ?? "")
        .filter(Boolean);
      return {
        strategy: "embedded",
        title,
        tiers,
        images,
        companyName: clean(String(g("tempModel.companyName") ?? g("globalData.tempModel.companyName") ?? "")),
        memberId: String(g("tempModel.sellerMemberId") ?? g("globalData.tempModel.sellerMemberId") ?? g("tempModel.sellerLoginId") ?? ""),
        location: clean(String(g("tempModel.provinceCity") ?? g("globalData.tempModel.location") ?? "")),
        sold: parseCount(String(g("tempModel.saleCount") ?? g("globalData.tempModel.saleCount") ?? "")),
        moq: Number(g("tempModel.minOrderQuantity") ?? g("globalData.orderParamModel.orderParam.skuParam.minOrderQuantity") ?? 0) || null,
        badges: BADGE_WORDS.filter((w) => (doc.body?.textContent ?? "").includes(w)),
        attributes: Object.fromEntries(
          (((g("productAttributes") ?? g("globalData.productAttributes") ?? []) as { name?: string; value?: string }[]) ?? []).map((a) => [a.name ?? "", a.value ?? ""]),
        ),
      };
    }
    // DOM fallback: title, price ladder from text, images.
    const body = doc.body?.textContent ?? "";
    const tierRe = /(\d+)\s*[-~]?\s*(?:\d+)?\s*(?:件|个|套|双|条|台|只)[^¥￥]{0,12}[¥￥]\s*([\d.]+)/g;
    const tiers: { minQty: number; unitPrice: number }[] = [];
    for (const m of body.matchAll(tierRe)) tiers.push({ minQty: Number(m[1]), unitPrice: Number(m[2]) });
    const images = [...doc.querySelectorAll<HTMLImageElement>("img")].map((i) => i.getAttribute("src") ?? "").filter((s) => /cbu01\.alicdn\.com|img\.alicdn\.com/.test(s));
    const title = clean(doc.querySelector("h1")?.textContent) || clean(doc.title.replace(/-阿里巴巴.*$/, ""));
    if (!title) return null;
    return { strategy: "dom", title, tiers, images: images.slice(0, 8), companyName: clean(doc.querySelector("[class*='company']")?.textContent), badges: BADGE_WORDS.filter((w) => body.includes(w)) };
  },

  imageInput(doc) {
    return doc.querySelector<HTMLInputElement>("input[type=file][accept*='image'], input[type=file]");
  },
};

export const def1688: RealMarketDef = {
  id: "cn-1688",
  meta: { ...META_1688, version: "0.1.0" },
  badgeMap: BADGES_1688,
  healthQuery: "蓝牙耳机",
  searchUrl: (q) => `https://s.1688.com/selloffer/offer_search.htm?keywords=${encodeURIComponent(q)}`,
  imageSearchUrl: () => "https://s.1688.com/youyuan/index.htm?tab=imageSearch",
  detailUrl: (id) => `https://detail.1688.com/offer/${id}.html`,
  resolveLink(url): LinkInfo | null {
    const m = LINK_1688.exec(url);
    return m ? { market: "cn-1688", listingId: m[1]!, canonicalUrl: `https://detail.1688.com/offer/${m[1]}.html` } : null;
  },
  extractor: extractor1688,
  toListing(item, fetchedAt): RawListing | null {
    if (!item.id || !item.title) return null;
    const tiers = item.tiers?.length ? item.tiers : item.price !== null ? [{ minQty: item.moq ?? 1, unitPrice: item.price }] : [];
    if (!tiers.length) return null;
    return {
      market: "cn-1688",
      id: item.id,
      url: `https://detail.1688.com/offer/${item.id}.html`,
      title: item.title,
      images: item.image ? [item.image] : [],
      price: { currency: "CNY", tiers },
      ...(item.moq ? { moq: item.moq } : {}),
      ...(item.sold !== null && item.sold !== undefined ? { sold: item.sold } : {}),
      ...(item.supplierId ? { supplierId: item.supplierId } : {}),
      ...(item.shop ? { supplierName: item.shop } : {}),
      ...(item.location ? { location: item.location } : {}),
      badges: item.badges,
      fetchedAt,
    };
  },
  toDetail(d, id, fetchedAt): RawListingDetail | null {
    const tiers = (d["tiers"] as { minQty: number; unitPrice: number }[]) ?? [];
    if (!d["title"] || !tiers.length) return null;
    const moq = (d["moq"] as number | null) ?? tiers[0]?.minQty;
    return {
      market: "cn-1688",
      id,
      url: `https://detail.1688.com/offer/${id}.html`,
      title: String(d["title"]),
      images: (d["images"] as string[]) ?? [],
      price: { currency: "CNY", tiers },
      ...(moq ? { moq } : {}),
      ...(typeof d["sold"] === "number" ? { sold: d["sold"] as number } : {}),
      ...(d["memberId"] ? { supplierId: String(d["memberId"]) } : {}),
      ...(d["companyName"] ? { supplierName: String(d["companyName"]) } : {}),
      ...(d["location"] ? { location: String(d["location"]) } : {}),
      badges: (d["badges"] as string[]) ?? [],
      fetchedAt,
      ...(d["attributes"] ? { attributes: d["attributes"] as Record<string, string> } : {}),
    };
  },
  toSupplier(s, id): RawSupplier | null {
    if (!s["name"]) return null;
    return { market: "cn-1688", id, url: `https://${id}.1688.com/`, name: String(s["name"]), badges: (s["badges"] as string[]) ?? [] };
  },
};

export type { SearchPayload, DetailPayload, SupplierPayload };
