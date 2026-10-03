import type { LinkInfo, RawListing, RawListingDetail } from "@manufactogate/core";
import { BADGES_PINDUODUO } from "../badges";
import { clean, extractCards, get, parseCount, parsePrice, readEmbedded, textOf } from "../dom";
import { META_PINDUODUO } from "../markets";
import { detectSession, pageProbe, type PageExtractor, type RealMarketDef, type SearchItem } from "../runtime";

/**
 * Pinduoduo. Web access goes through the mobile site (mobile.yangkeduo.com), which renders
 * for a logged-in browser. No web image search; text and link only.
 *  - search: https://mobile.yangkeduo.com/search_result.html?search_key=<q>  (embeds window.rawData;
 *            further pages load by XHR on scroll, so `page=` is ignored and only page 1 is read)
 *  - detail: https://mobile.yangkeduo.com/goods.html?goods_id=<id>  (embeds window.rawData, or null for
 *            risk-controlled sessions; then the rendered text structure is read)
 *  - verification wall: mobile.yangkeduo.com/psnl_verification.html / verify.html
 */

export const LINK_PDD = /(?:yangkeduo\.com|pinduoduo\.com)\/(?:goods\d*\.html|goods_detail\.html)\?(?:[^#]*&)?goods_id=(\d+)/;

const BADGE_WORDS = Object.keys(BADGES_PINDUODUO);
const EMPTY_LIST_HINT = "Pinduoduo bu oturuma boş liste döndürdü (risk kontrolü). Pazarda kendi hesabınızla bir arama yapıp doğrulamayı geçin, sonra tekrar deneyin.";

function goodsList(raw: Record<string, unknown> | null): unknown[] | undefined {
  return (get(raw, "stores.store.data.ssrListData.list") ??
    get(raw, "stores.store.dataMap.0.list") ??
    get(raw, "stores.store.data.ssrSearchData.goods") ??
    get(raw, "store.data.list") ??
    get(raw, "goodsList") ??
    get(raw, "store.goodsList")) as unknown[] | undefined;
}

/** Badge labels from tagList / propertyTagList / iconList entries (objects with text/name/desc fields). */
function tagBadges(r: Record<string, unknown>): string[] {
  const out = new Set<string>();
  for (const key of ["tagList", "propertyTagList", "iconList", "tag_list", "icon_list", "tags", "icons", "labels"]) {
    const list = r[key];
    if (!Array.isArray(list)) continue;
    for (const t of list) {
      const text = typeof t === "string" ? t : clean(String((t as Record<string, unknown>)?.["text"] ?? (t as Record<string, unknown>)?.["name"] ?? (t as Record<string, unknown>)?.["desc"] ?? ""));
      if (!text) continue;
      for (const w of BADGE_WORDS) if (text.includes(w)) out.add(w);
    }
  }
  const mallName = clean(String(get(r, "mall_name") ?? get(r, "mallName") ?? get(r, "mallEntrance.mall_name") ?? ""));
  if (/旗舰店/.test(mallName)) out.add("旗舰店");
  return [...out];
}

export const extractorPinduoduo: PageExtractor = {
  session(doc) {
    return detectSession(doc, {
      loginHosts: /login\.html|\/login\b|passport|\/auth\b/,
      captchaHosts: /psnl_verification|verify\.html|pdd_verify|\/verification/,
      captchaMarkers: ["滑动验证", "安全验证", "请完成验证", "拖动滑块", "请完成下方验证", "风控验证"],
      loggedOutMarkers: ["手机号登录", "请输入手机号", "登录后查看"],
      loggedOutSelectors: [".login-page", "[class*='login_tip']", "[class*='login-tip']", "input[placeholder*='手机号']"],
      loggedInMarkers: ["个人中心", "我的订单"],
      scriptMarkers: { loggedIn: ['"uid":"', "ssrListData", "\"isLogin\":true", "isLogin:true"] },
    });
  },
  probe(doc) {
    return pageProbe(doc, {
      noResultsMarkers: ["没有搜索到", "没有找到相关商品", "换个关键词试试"],
      resultsUrlPattern: /yangkeduo\.com\/search_result\.html|pinduoduo\.com\/search/,
      blocked(d) {
        // SSR state present but with an empty list and no "no results" wording: the session is distrusted.
        const raw = readEmbedded<Record<string, unknown>>(d, ["window.rawData", "rawData"]);
        const ssr = get(raw, "stores.store.data.ssrListData");
        if (!ssr || typeof ssr !== "object") return null;
        const list = goodsList(raw);
        return Array.isArray(list) && list.length === 0 ? EMPTY_LIST_HINT : null;
      },
    });
  },
  search(doc): SearchItem[] {
    const raw = readEmbedded<Record<string, unknown>>(doc, ["window.rawData", "rawData"]);
    const goods = goodsList(raw);
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
        const salesTip = String(get(r, "sales_tip") ?? get(r, "salesTip") ?? get(r, "cnt") ?? "");
        const shopName = clean(String(get(r, "mall_name") ?? get(r, "mallName") ?? get(r, "mallEntrance.mall_name") ?? get(r, "mallEntrance.mallName") ?? ""));
        items.push({
          id,
          url: `https://mobile.yangkeduo.com/goods.html?goods_id=${id}`,
          title: clean(String(get(r, "goods_name") ?? get(r, "goodsName") ?? "")),
          image: (get(r, "hd_thumb_url") as string) ?? (get(r, "hdThumbUrl") as string) ?? (get(r, "imgUrl") as string) ?? (get(r, "thumb_url") as string) ?? (get(r, "thumbUrl") as string) ?? null,
          price,
          priceText: price !== null ? String(price) : null,
          priceCurrency: "CNY",
          // "本店已拼1.5万件" is the shop's total; "已拼1.2万件" is the item's. Both feed demand, the shop total is weaker evidence.
          sold: parseCount(salesTip),
          shop: shopName || null,
          location: null,
          badges: tagBadges(r),
          text: "",
          currency: "CNY",
          supplierId: mallId !== undefined && mallId !== null ? String(mallId) : null,
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
      currency: "CNY",
    }).map((c) => ({ ...c, currency: "CNY" }));
  },
  detail(doc) {
    const raw = readEmbedded<Record<string, unknown>>(doc, ["window.rawData", "rawData"]);
    const g = (p: string) => get(raw, `store.initDataObj.goods.${p}`) ?? get(raw, `initDataObj.goods.${p}`);
    if (raw && g("goodsName")) {
      const fen = Number(g("minGroupPrice") ?? g("minOnSaleGroupPrice") ?? g("minNormalPrice") ?? NaN);
      const images = ((g("topGallery") ?? g("gallery") ?? []) as { url?: string }[]).map((x) => x.url ?? "").filter(Boolean);
      const mall = (get(raw, "store.initDataObj.mall") ?? get(raw, "initDataObj.mall")) as Record<string, unknown> | undefined;
      const mallId = mall?.["mallId"] ?? mall?.["mall_id"];
      return {
        strategy: "embedded",
        title: clean(String(g("goodsName"))),
        price: Number.isFinite(fen) ? fen / 100 : null,
        sold: parseCount(String(g("sideSalesTip") ?? g("salesTip") ?? "")),
        images,
        shop: clean(String(mall?.["mallName"] ?? "")),
        shopId: mallId !== undefined && mallId !== null ? String(mallId) : "",
        badges: tagBadges((get(raw, "store.initDataObj.goods") ?? get(raw, "initDataObj.goods") ?? {}) as Record<string, unknown>),
      };
    }
    // Only a goods page counts: the search page also carries prices and a "拼多多" title.
    const href = doc.location?.href ?? "";
    if (!/goods_id=\d+/.test(href) && !/goods\d*\.html|goods_detail\.html/.test(href)) return null;
    // Current goods page renders with rawData=null and hashed class names; read it from text structure.
    const body = doc.body ? textOf(doc.body) : "";
    const metaDesc = clean(doc.querySelector("meta[name='description']")?.getAttribute("content"));
    const title =
      clean(doc.querySelector(".enable-select, [class*='enable-select']")?.textContent) ||
      clean(doc.querySelector("meta[property='og:title']")?.getAttribute("content")) ||
      (/件\s+(\S[^\s]{6,80})\s+\d+人下单/.exec(body)?.[1] ?? "") ||
      metaDesc.replace(/^拼多多(?:商城)?[-:：]?\s*/, "");
    const priceM = /券后\s*[¥￥]?\s*(\d+(?:\.\d+)?)/.exec(body) ?? /券后\s*[¥￥]?\s*(\d+(?:\.\d+)?)/.exec(metaDesc) ?? /[¥￥]\s*([\d.]+)/.exec(body);
    if (!title || title === "拼多多商城" || !priceM) return null;
    const soldM = /已拼\s*([\d.]+万?\+?)\s*件/.exec(body);
    const shopM = /(\S{2,40})\s+本店已拼/.exec(body);
    const attrs: Record<string, string> = {};
    for (const el of doc.querySelectorAll<HTMLElement>("[aria-label]")) {
      const kids = [...el.children].filter((c) => c.tagName === "DIV");
      if (kids.length === 2 && el.getAttribute("aria-label") === `${clean(kids[0]!.textContent)}${clean(kids[1]!.textContent)}`) {
        attrs[clean(kids[0]!.textContent)] = clean(kids[1]!.textContent);
      }
    }
    const images = [...new Set([...doc.querySelectorAll("img")].map((i) => i.getAttribute("src") ?? "").filter((u) => /img\.pddpic\.com\/(open-gw|mms-material-img|goods|gaudit)/.test(u)))].slice(0, 10);
    const mallIdM = /mall_id=(\d+)/.exec(doc.documentElement?.innerHTML.slice(0, 200_000) ?? "");
    return {
      strategy: "dom",
      title,
      price: Number(priceM[1]),
      sold: soldM ? parseCount(soldM[1]) : null,
      images,
      shop: shopM?.[1] ?? "",
      shopId: mallIdM?.[1] ?? "",
      badges: BADGE_WORDS.filter((w) => body.includes(w)),
      attributes: attrs,
    };
  },
};

export const defPinduoduo: RealMarketDef = {
  id: "cn-pinduoduo",
  meta: { ...META_PINDUODUO, version: "0.2.0", hosts: ["*.pinduoduo.com", "*.yangkeduo.com"] },
  badgeMap: BADGES_PINDUODUO,
  healthQuery: "蓝牙耳机",
  homeUrl: "https://mobile.yangkeduo.com/",
  searchUrl: (q) => `https://mobile.yangkeduo.com/search_result.html?search_key=${encodeURIComponent(q)}`,
  // search_result.html paginates by XHR on scroll; a page=2 URL re-serves page 1.
  maxPages: 1,
  resultsUrlPattern: /yangkeduo\.com\/search_result\.html|pinduoduo\.com\/search/,
  noResultsMarkers: ["没有搜索到", "没有找到相关商品"],
  calibration: "fixture",
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
      ...(item.shop ? { supplierName: item.shop } : {}),
      ...(item.supplierId ? { supplierId: item.supplierId } : {}),
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
      ...(d["shop"] ? { supplierName: String(d["shop"]) } : {}),
      ...(d["shopId"] ? { supplierId: String(d["shopId"]) } : d["shop"] ? { supplierId: String(d["shop"]) } : {}),
      badges: (d["badges"] as string[]) ?? [],
      fetchedAt,
      ...(d["attributes"] ? { attributes: d["attributes"] as Record<string, string> } : {}),
    };
  },
};
