import type { LinkInfo, RawListing, RawListingDetail } from "@manufactogate/core";
import { BADGES_TAOBAO } from "../badges";
import { clean, extractCards, extractJsonAfter, get, inlineScriptText, parseCount, parsePrice, readEmbedded, textOf, tryJson } from "../dom";
import { META_TAOBAO } from "../markets";
import { detectSession, type PageExtractor, type RealMarketDef, type SearchItem } from "../runtime";

/**
 * Taobao / Tmall. Retail reference market.
 *  - search: https://s.taobao.com/search?q=<q>&tab=all
 *  - image:  https://s.taobao.com/search?tab=all  (camera icon opens a file input)
 *  - detail: https://item.taobao.com/item.htm?id=<id>  or  https://detail.tmall.com/item.htm?id=<id>
 */

export const LINK_TAOBAO = /(?:item\.taobao\.com|detail\.tmall\.com|detail\.tmall\.hk|item\.tmall\.com)\/item\.htm\?(?:[^#]*&)?id=(\d+)/;

const BADGE_WORDS = Object.keys(BADGES_TAOBAO);

export const extractorTaobao: PageExtractor = {
  session(doc) {
    return detectSession(doc, {
      loginHosts: /login\.taobao\.com|login\.tmall\.com|passport/,
      captchaMarkers: ["punish", "nocaptcha", "_____tmd_____", "滑动验证"],
      loggedOutMarkers: ["id=\"login\"", "密码登录", "扫码登录", "fm-login-id"],
      loggedInMarkers: ["退出", "我的淘宝", "\"nick\""],
    });
  },
  search(doc): SearchItem[] {
    // Strategy 1: older pages embed g_page_config.mods.itemlist.data.auctions; newer ones embed __NEXT_DATA__-like state.
    const embedded = readEmbedded<Record<string, unknown>>(doc, ["g_page_config", "window.__INITIAL_STATE__", "__NEXT_DATA__"]);
    const auctions = (get(embedded, "mods.itemlist.data.auctions") ??
      get(embedded, "props.pageProps.itemsArray") ??
      get(embedded, "itemsArray")) as unknown[] | undefined;
    if (Array.isArray(auctions) && auctions.length) {
      const items: SearchItem[] = [];
      for (const a of auctions) {
        const r = a as Record<string, unknown>;
        const id = String(get(r, "nid") ?? get(r, "item_id") ?? get(r, "id") ?? "");
        if (!/^\d+$/.test(id)) continue;
        const price = parsePrice(String(get(r, "view_price") ?? get(r, "price") ?? get(r, "priceShow.price") ?? ""));
        const sold = parseCount(String(get(r, "view_sales") ?? get(r, "realSales") ?? get(r, "sold") ?? ""));
        items.push({
          id,
          url: `https://item.taobao.com/item.htm?id=${id}`,
          title: clean(String(get(r, "raw_title") ?? get(r, "title") ?? "")).replace(/<[^>]+>/g, ""),
          image: (get(r, "pic_url") as string) ?? (get(r, "pic_path") as string) ?? null,
          price,
          priceText: price !== null ? String(price) : null,
          sold,
          shop: clean(String(get(r, "nick") ?? get(r, "shopInfo.shopName") ?? "")) || null,
          location: clean(String(get(r, "item_loc") ?? get(r, "procity") ?? "")) || null,
          badges: BADGE_WORDS.filter((w) => JSON.stringify(r).includes(w)),
          text: "",
          currency: "CNY",
          rating: null,
        });
      }
      if (items.length) return items;
    }
    // Current card UI: split price (priceInt + priceFloat), realSales, shopNameText, procity.
    const cards = [...doc.querySelectorAll<HTMLElement>("a[id^='item_id_'], [class*='doubleCardWrapper']")];
    if (cards.length) {
      const items: SearchItem[] = [];
      const seen = new Set<string>();
      for (const card of cards) {
        const href = card.getAttribute("href") ?? card.querySelector("a[href]")?.getAttribute("href") ?? "";
        const m = LINK_TAOBAO.exec(href) ?? /item_id_(\d+)/.exec(card.id);
        const id = m?.[1];
        if (!id || seen.has(id)) continue;
        seen.add(id);
        // Nested anchors (item link + shop link) get split by the HTML parser: shop info lands in a sibling.
        const scope = card.closest<HTMLElement>("[class*='search-content-col'], [class*='Content--contentInner'] > *") ?? card.parentElement ?? card;
        const int = clean(card.querySelector("[class*='priceInt']")?.textContent);
        const frac = clean(card.querySelector("[class*='priceFloat']")?.textContent);
        const priceM = /[¥￥]\s*([\d.]+)/.exec(textOf(scope));
        const price = int ? parsePrice(`${int}${frac}`) : priceM ? parsePrice(priceM[1]) : null;
        const titleEl = card.querySelector<HTMLElement>("[class*='title']");
        const title = clean(titleEl?.getAttribute("title") || titleEl?.textContent);
        const img = card.querySelector<HTMLImageElement>("[class*='mainPic'] img, img[class*='mainPic'], img");
        const sold = parseCount(clean(scope.querySelector("[class*='realSales']")?.textContent));
        const shop = clean(scope.querySelector("[class*='shopNameText'], [class*='shopName']")?.textContent);
        const location = [...scope.querySelectorAll("[class*='procity']")].map((e) => clean(e.textContent)).filter(Boolean).join(" ");
        const text = textOf(scope);
        const isTmall = /tmall\.com/.test(href) || text.includes("天猫");
        items.push({
          id,
          url: isTmall ? `https://detail.tmall.com/item.htm?id=${id}` : `https://item.taobao.com/item.htm?id=${id}`,
          title,
          image: img?.getAttribute("src") || img?.getAttribute("data-src") || null,
          price,
          priceText: price !== null ? String(price) : null,
          sold,
          shop: shop || null,
          location: location || null,
          badges: [...new Set([...(isTmall ? ["天猫"] : []), ...BADGE_WORDS.filter((w) => text.includes(w))])],
          text,
          currency: "CNY",
        });
      }
      if (items.length) return items;
    }
    return extractCards(doc, {
      link: LINK_TAOBAO,
      titleSelectors: ["[class*='title']", ".Title--title", "a[title]"],
      shopSelectors: ["[class*='shopNameText']", "[class*='shopName']", "[class*='ShopInfo']", "[class*='shop']"],
      locationSelectors: ["[class*='procity']", "[class*='location']", "[class*='Loc']"],
      badgeWords: BADGE_WORDS,
      sold: /((?:\d+(?:[.,]\d+)?)(?:万)?\+?)\s*(?:人付款|人收货|已售)/,
    }).map((c) => ({ ...c, currency: "CNY" }));
  },
  detail(doc) {
    // Current item page: inline state with "item", "seller", "skuCore" and "props" objects.
    const text = inlineScriptText(doc);
    const item = tryJson<Record<string, unknown>>(extractJsonAfter(text, '"item":'));
    if (item && typeof item["title"] === "string" && Array.isArray(item["images"])) {
      const seller = tryJson<Record<string, unknown>>(extractJsonAfter(text, '"seller":')) ?? {};
      const skuCore = tryJson<Record<string, unknown>>(extractJsonAfter(text, '"skuCore":')) ?? {};
      const infos = Object.values((get(skuCore, "sku2info") as Record<string, unknown>) ?? {}) as Record<string, unknown>[];
      const prices = infos
        .map((i) => parsePrice(String(get(i, "subPrice.priceText") ?? get(i, "price.priceText") ?? "")))
        .filter((n): n is number => n !== null && n > 0);
      const price = prices.length ? Math.min(...prices) : null;
      const props = tryJson<unknown>(extractJsonAfter(text, '"props":'));
      const attrs: Record<string, string> = {};
      const walk = (o: unknown) => {
        if (Array.isArray(o)) o.forEach(walk);
        else if (o && typeof o === "object") {
          const r = o as Record<string, unknown>;
          if (typeof r["name"] === "string" && typeof r["value"] === "string") attrs[r["name"]] = r["value"];
          else if (typeof r["key"] === "string" && typeof r["value"] === "string") attrs[r["key"]] = r["value"];
          else Object.values(r).forEach(walk);
        }
      };
      walk(props);
      const bodyText = doc.body ? textOf(doc.body) : "";
      const sold = parseCount(String(item["vagueSellCount"] ?? "")) ?? parseCount(/已售\s*([\d.]+万?\+?)/.exec(bodyText)?.[1]);
      if (price !== null) {
        return {
          strategy: "embedded",
          title: clean(String(item["title"])),
          price,
          sold,
          images: (item["images"] as string[]).filter((u) => typeof u === "string"),
          shop: clean(String(seller["shopName"] ?? seller["sellerNick"] ?? "")),
          shopId: String(seller["shopId"] ?? seller["sellerId"] ?? ""),
          badges: BADGE_WORDS.filter((w) => bodyText.includes(w) || /tmall\.com/.test(doc.location?.href ?? "")),
          attributes: attrs,
        };
      }
    }
    const body = doc.body?.textContent ?? "";
    const title = clean(doc.querySelector("h1")?.textContent) || clean(doc.querySelector("[class*='ItemTitle'],[class*='mainTitle'],.tb-main-title")?.textContent) || clean(doc.title.replace(/-淘宝网|-tmall\.com.*$/g, ""));
    const priceM = /[¥￥]\s*([\d.]+)/.exec(body);
    const soldM = /((?:\d+(?:[.,]\d+)?)(?:万)?\+?)\s*(?:人付款|已售|人收货)/.exec(body);
    const images = [...doc.querySelectorAll<HTMLImageElement>("img")].map((i) => i.getAttribute("src") ?? "").filter((s) => /img\.alicdn\.com|gw\.alicdn\.com/.test(s) && !/\d+x\d+q\d+\.jpg_\.webp$/.test(s)).slice(0, 8);
    const shop = clean(doc.querySelector("[class*='shopName'],[class*='ShopHeader'] a,.shop-name,.slogo-shopname")?.textContent);
    if (!title || !priceM) return null;
    return { strategy: "dom", title, price: Number(priceM[1]), sold: soldM ? parseCount(soldM[1]) : null, images, shop, badges: BADGE_WORDS.filter((w) => body.includes(w)) };
  },
  imageInput(doc) {
    // The camera icon is wired to a hidden file input on the search page.
    return doc.querySelector<HTMLInputElement>("input[type=file][accept*='image'], input[type=file]");
  },
};

export const defTaobao: RealMarketDef = {
  id: "cn-taobao",
  meta: { ...META_TAOBAO, version: "0.1.0" },
  badgeMap: BADGES_TAOBAO,
  healthQuery: "蓝牙耳机",
  searchUrl: (q) => `https://s.taobao.com/search?q=${encodeURIComponent(q)}&tab=all`,
  imageSearchUrl: () => "https://s.taobao.com/search?tab=all",
  detailUrl: (id) => `https://item.taobao.com/item.htm?id=${id}`,
  resolveLink(url): LinkInfo | null {
    const m = LINK_TAOBAO.exec(url);
    return m ? { market: "cn-taobao", listingId: m[1]!, canonicalUrl: `https://item.taobao.com/item.htm?id=${m[1]}` } : null;
  },
  extractor: extractorTaobao,
  toListing(item, fetchedAt): RawListing | null {
    if (!item.id || !item.title || item.price === null) return null;
    return {
      market: "cn-taobao",
      id: item.id,
      url: `https://item.taobao.com/item.htm?id=${item.id}`,
      title: item.title,
      images: item.image ? [item.image] : [],
      price: { currency: "CNY", tiers: [{ minQty: 1, unitPrice: item.price }] },
      moq: 1,
      ...(item.sold !== null && item.sold !== undefined ? { sold: item.sold } : {}),
      ...(item.shop ? { supplierName: item.shop, supplierId: item.shop } : {}),
      ...(item.location ? { location: item.location } : {}),
      badges: item.badges,
      fetchedAt,
    };
  },
  toDetail(d, id, fetchedAt): RawListingDetail | null {
    if (!d["title"] || typeof d["price"] !== "number") return null;
    return {
      market: "cn-taobao",
      id,
      url: `https://item.taobao.com/item.htm?id=${id}`,
      title: String(d["title"]),
      images: (d["images"] as string[]) ?? [],
      price: { currency: "CNY", tiers: [{ minQty: 1, unitPrice: d["price"] as number }] },
      moq: 1,
      ...(typeof d["sold"] === "number" ? { sold: d["sold"] as number } : {}),
      ...(d["shop"] ? { supplierName: String(d["shop"]), supplierId: String(d["shopId"] || d["shop"]) } : {}),
      badges: (d["badges"] as string[]) ?? [],
      fetchedAt,
      ...(d["attributes"] && Object.keys(d["attributes"] as object).length ? { attributes: d["attributes"] as Record<string, string> } : {}),
    };
  },
};
