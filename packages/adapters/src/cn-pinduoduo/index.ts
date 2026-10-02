import type { LinkInfo, RawListing, RawListingDetail } from "@manufactogate/core";
import { BADGES_PINDUODUO } from "../badges";
import { clean, extractCards, get, parseCount, parsePrice, readEmbedded } from "../dom";
import { META_PINDUODUO } from "../markets";
import { detectSession, type PageExtractor, type RealMarketDef, type SearchItem } from "../runtime";

/**
 * Pinduoduo. Web access goes through the mobile site (mobile.yangkeduo.com), which renders
 * for a logged-in browser. No web image search; text and link only.
 *  - search: https://mobile.yangkeduo.com/search_result.html?search_key=<q>
 *  - detail: https://mobile.yangkeduo.com/goods.html?goods_id=<id>  (embeds window.rawData)
 */

export const LINK_PDD = /(?:yangkeduo\.com|pinduoduo\.com)\/(?:goods\d*\.html|goods_detail\.html)\?(?:[^#]*&)?goods_id=(\d+)/;

const BADGE_WORDS = Object.keys(BADGES_PINDUODUO);

export const extractorPinduoduo: PageExtractor = {
  session(doc) {
    return detectSession(doc, {
      loginHosts: /login\.html|\/login\b|passport/,
      captchaMarkers: ["verify", "滑动验证", "安全验证", "风控"],
      loggedInMarkers: ["\"uid\"", "个人中心", "我的订单"],
    });
  },
  search(doc): SearchItem[] {
    const raw = readEmbedded<Record<string, unknown>>(doc, ["window.rawData", "rawData"]);
    const goods = (get(raw, "stores.store.data.ssrListData.list") ??
      get(raw, "stores.store.dataMap.0.list") ??
      get(raw, "stores.store.data.ssrSearchData.goods") ??
      get(raw, "store.data.list") ??
      get(raw, "goodsList") ??
      get(raw, "store.goodsList")) as unknown[] | undefined;
    if (Array.isArray(goods) && goods.length) {
      const items: SearchItem[] = [];
      for (const gItem of goods) {
        const r = gItem as Record<string, unknown>;
        const id = String(get(r, "goods_id") ?? get(r, "goodsID") ?? get(r, "goodsId") ?? "");
        if (!/^\d+$/.test(id)) continue;
        // PDD prices are in fen (1/100 CNY) in raw data; priceInfo is the after-coupon price in yuan.
        const fen = Number(get(r, "price") ?? get(r, "group.price") ?? get(r, "normal_price") ?? NaN);
        const coupon = parsePrice(String(get(r, "priceInfo") ?? ""));
        const price = coupon ?? (Number.isFinite(fen) ? Math.round(fen) / 100 : null);
        const mallId = get(r, "mallEntrance.mall_id") ?? get(r, "mall_id") ?? get(r, "mallId");
        items.push({
          id,
          url: `https://mobile.yangkeduo.com/goods.html?goods_id=${id}`,
          title: clean(String(get(r, "goods_name") ?? get(r, "goodsName") ?? "")),
          image: (get(r, "hd_thumb_url") as string) ?? (get(r, "hdThumbUrl") as string) ?? (get(r, "imgUrl") as string) ?? (get(r, "thumb_url") as string) ?? (get(r, "thumbUrl") as string) ?? null,
          price,
          priceText: price !== null ? String(price) : null,
          sold: parseCount(String(get(r, "sales_tip") ?? get(r, "salesTip") ?? get(r, "cnt") ?? "")),
          shop: clean(String(get(r, "mall_name") ?? get(r, "mallName") ?? "")) || null,
          location: null,
          badges: BADGE_WORDS.filter((w) => JSON.stringify(r).includes(w)),
          text: "",
          currency: "CNY",
          supplierId: mallId !== undefined ? String(mallId) : null,
        });
      }
      if (items.length) return items;
    }
    return extractCards(doc, {
      link: LINK_PDD,
      titleSelectors: ["[class*='goods-name']", "[class*='title']", "[class*='name']"],
      shopSelectors: ["[class*='mall']", "[class*='shop']"],
      badgeWords: BADGE_WORDS,
      sold: /(?:已拼|已售)\s*((?:\d+(?:[.,]\d+)?)(?:万)?\+?)/,
    }).map((c) => ({ ...c, currency: "CNY" }));
  },
  detail(doc) {
    const raw = readEmbedded<Record<string, unknown>>(doc, ["window.rawData", "rawData"]);
    const g = (p: string) => get(raw, `store.initDataObj.goods.${p}`) ?? get(raw, `initDataObj.goods.${p}`);
    if (raw && g("goodsName")) {
      const fen = Number(g("minGroupPrice") ?? g("minOnSaleGroupPrice") ?? g("minNormalPrice") ?? NaN);
      const images = ((g("topGallery") ?? g("gallery") ?? []) as { url?: string }[]).map((x) => x.url ?? "").filter(Boolean);
      return {
        strategy: "embedded",
        title: clean(String(g("goodsName"))),
        price: Number.isFinite(fen) ? fen / 100 : null,
        sold: parseCount(String(g("sideSalesTip") ?? g("salesTip") ?? "")),
        images,
        shop: clean(String(get(raw, "store.initDataObj.mall.mallName") ?? get(raw, "initDataObj.mall.mallName") ?? "")),
        badges: BADGE_WORDS.filter((w) => JSON.stringify(raw).includes(w)),
      };
    }
    const body = doc.body?.textContent ?? "";
    const title = clean(doc.querySelector("[class*='goods-name'],[class*='title'],h1")?.textContent) || clean(doc.title);
    const priceM = /[¥￥]\s*([\d.]+)/.exec(body);
    if (!title || !priceM) return null;
    return { strategy: "dom", title, price: Number(priceM[1]), sold: null, images: [], shop: "", badges: BADGE_WORDS.filter((w) => body.includes(w)) };
  },
};

export const defPinduoduo: RealMarketDef = {
  id: "cn-pinduoduo",
  meta: { ...META_PINDUODUO, version: "0.1.0", hosts: ["*.pinduoduo.com", "*.yangkeduo.com"] },
  badgeMap: BADGES_PINDUODUO,
  healthQuery: "蓝牙耳机",
  searchUrl: (q) => `https://mobile.yangkeduo.com/search_result.html?search_key=${encodeURIComponent(q)}`,
  detailUrl: (id) => `https://mobile.yangkeduo.com/goods.html?goods_id=${id}`,
  resolveLink(url): LinkInfo | null {
    const m = LINK_PDD.exec(url);
    return m ? { market: "cn-pinduoduo", listingId: m[1]!, canonicalUrl: `https://mobile.yangkeduo.com/goods.html?goods_id=${m[1]}` } : null;
  },
  extractor: extractorPinduoduo,
  toListing(item, fetchedAt): RawListing | null {
    if (!item.id || !item.title || item.price === null) return null;
    return {
      market: "cn-pinduoduo",
      id: item.id,
      url: `https://mobile.yangkeduo.com/goods.html?goods_id=${item.id}`,
      title: item.title,
      images: item.image ? [item.image] : [],
      price: { currency: "CNY", tiers: [{ minQty: 1, unitPrice: item.price }] },
      moq: 1,
      ...(item.sold !== null && item.sold !== undefined ? { sold: item.sold } : {}),
      ...(item.shop ? { supplierName: item.shop, supplierId: item.shop } : {}),
      badges: item.badges,
      fetchedAt,
    };
  },
  toDetail(d, id, fetchedAt): RawListingDetail | null {
    if (!d["title"] || typeof d["price"] !== "number") return null;
    return {
      market: "cn-pinduoduo",
      id,
      url: `https://mobile.yangkeduo.com/goods.html?goods_id=${id}`,
      title: String(d["title"]),
      images: (d["images"] as string[]) ?? [],
      price: { currency: "CNY", tiers: [{ minQty: 1, unitPrice: d["price"] as number }] },
      moq: 1,
      ...(typeof d["sold"] === "number" ? { sold: d["sold"] as number } : {}),
      ...(d["shop"] ? { supplierName: String(d["shop"]), supplierId: String(d["shop"]) } : {}),
      badges: (d["badges"] as string[]) ?? [],
      fetchedAt,
    };
  },
};
