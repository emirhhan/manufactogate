// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { MarketId } from "@manufactogate/core";
import { createRealAdapter, enrichListing, PAGE_EXTRACTORS, REAL_DEF_BY_ID, type SearchItem } from "../src";

/** Pages captured from live markets on 2026-10-02 with the extension's "Fixture yakala". */
function load(market: string, name: string, url: string): Document {
  const html = readFileSync(join(__dirname, "..", "src", market, "fixtures", `${name}.html`), "utf8");
  const doc = new DOMParser().parseFromString(html, "text/html");
  Object.defineProperty(doc, "location", { value: new URL(url), configurable: true });
  return doc;
}
const X = (id: MarketId) => PAGE_EXTRACTORS[id]!;

describe("1688 live pages", () => {
  it("search (i18n grid UI) yields cards with id, price, MOQ and image", () => {
    const doc = load("cn-1688", "real-search-i18n", "https://s.1688.com/selloffer/offer_search.htm?keywords=%E5%A4%B4%E7%9B%94");
    expect(X("cn-1688").session(doc)).not.toBe("logged-out");
    const items = X("cn-1688").search!(doc) as SearchItem[];
    expect(items.length).toBeGreaterThanOrEqual(20);
    const withPrice = items.filter((i) => i.price !== null);
    expect(withPrice.length).toBeGreaterThanOrEqual(items.length * 0.9);
    const first = items.find((i) => i.id === "1077078153178")!;
    expect(first).toBeDefined();
    expect(first.price).toBe(16.9);
    expect(first.moq).toBe(1);
    expect(first.image).toMatch(/^https:\/\/cbu01\.alicdn\.com\//);
    expect(first.url).toBe("https://detail.1688.com/offer/1077078153178.html");
    expect(items.some((i) => i.id === "697187375710")).toBe(true);
    expect(items.every((i) => i.title.length > 0)).toBe(true);
  });
  it("detail reads title, price ladder, gallery, company and attributes", async () => {
    const a = createRealAdapter(REAL_DEF_BY_ID["cn-1688"]!, {
      async run(req) {
        const doc = load("cn-1688", "real-detail", req.url);
        return { ok: true, data: { session: X("cn-1688").session(doc), strategy: "embedded", detail: X("cn-1688").detail!(doc) } as never, finalUrl: req.url, tookMs: 1 };
      },
    });
    const d = await a.fetchListing("770445590409");
    expect(d.title).toContain("kask");
    expect(d.price.tiers).toEqual([{ minQty: 1, unitPrice: 14.8 }]);
    expect(d.moq).toBe(1);
    expect(d.supplierName).toBe("永康市匠派户外休闲用品有限公司");
    expect(d.supplierId).toBe("b2b-2217012421452582c7");
    expect(d.location).toContain("浙江");
    expect(d.sold).toBe(6204);
    expect(d.images.length).toBeGreaterThanOrEqual(5);
    expect(d.images[0]).toMatch(/^https:\/\/cbu01\.alicdn\.com\//);
    expect(Object.keys(d.attributes ?? {}).length).toBeGreaterThan(0);
    // Unit the price is quoted per ("unit":"个"), one skuMap entry per variant, location = shipping origin, supplier identity seed.
    expect(d.unitLabel).toBe("个");
    expect(d.variantCount).toBe(12);
    expect(d.shippingFrom).toBe("浙江省金华市");
    expect(d.shipFrom).toBe("cn");
    expect(d.packQty).toBeUndefined();
    expect(d.supplier).toMatchObject({ key: "cn:永康市匠派户外休闲用品" });
  });
  it("search grid cells carry no unit, pack, ship-from or variant text (i18n UI); the fields stay unset", () => {
    const doc = load("cn-1688", "real-search-i18n", "https://s.1688.com/selloffer/offer_search.htm?keywords=%E5%A4%B4%E7%9B%94");
    const items = X("cn-1688").search!(doc) as SearchItem[];
    expect(items.some((i) => i.unitLabel || i.shipFrom || i.variantCount || i.packQty)).toBe(false);
    const l = enrichListing(REAL_DEF_BY_ID["cn-1688"]!, items[0]!, REAL_DEF_BY_ID["cn-1688"]!.toListing(items[0]!, "2026-10-03T00:00:00Z")!);
    expect(l.unitLabel).toBeUndefined();
    expect(l.shipFrom).toBeUndefined();
  });
});

describe("taobao live page", () => {
  it("search cards read split prices, sales, shop and city", () => {
    const doc = load("cn-taobao", "real-search", "https://s.taobao.com/search?page=1&q=%E5%A4%B4%E7%9B%94&tab=all");
    const items = X("cn-taobao").search!(doc) as SearchItem[];
    expect(items.length).toBeGreaterThanOrEqual(40);
    const it = items.find((i) => i.id === "1059411076915")!;
    expect(it.price).toBe(88.72);
    expect(it.sold).toBe(100);
    expect(it.shop).toBe("苏苏骑行侠");
    expect(it.location).toBe("广东 佛山");
    expect(it.title).toContain("头盔");
    const tm = items.find((i) => i.id === "940096239701")!;
    expect(tm.url).toContain("detail.tmall.com");
    expect(tm.badges).toContain("天猫");
    expect(items.every((i) => i.price !== null && i.price > 1)).toBe(true);
    // procity ("广东 佛山") is the seller's shipping origin: every card maps to "cn"; no unit or variant text on the card.
    expect(it.shipFrom).toBe("cn");
    expect(items.every((i) => i.shipFrom === "cn")).toBe(true);
    expect(it.unitLabel).toBeUndefined();
    expect(it.variantCount).toBeUndefined();
    const l = enrichListing(REAL_DEF_BY_ID["cn-taobao"]!, it, REAL_DEF_BY_ID["cn-taobao"]!.toListing(it, "2026-10-03T00:00:00Z")!);
    expect(l.shipFrom).toBe("cn");
    expect(l.supplier).toMatchObject({ key: "cn:苏苏骑行侠" });
  });
});

describe("pinduoduo live page", () => {
  it("search reads rawData list with coupon prices and sales tips", () => {
    const doc = load("cn-pinduoduo", "real-search", "https://mobile.yangkeduo.com/search_result.html?search_key=%E5%A4%B4%E7%9B%94");
    expect(X("cn-pinduoduo").session(doc)).toBe("logged-in");
    const items = X("cn-pinduoduo").search!(doc) as SearchItem[];
    expect(items.length).toBe(20);
    const it = items.find((i) => i.id === "842164999674")!;
    expect(it.title).toContain("头盔");
    expect(it.price).toBe(127);
    expect(it.sold).toBe(1_700_000);
    expect(it.image).toMatch(/^https:\/\/img\.pddpic\.com\//);
    expect(it.supplierId).toBe("241276537");
  });
  it("rawData list items carry no unit, pack, ship-from or variant fields; the DOM has no product anchors to read a second page from", () => {
    const doc = load("cn-pinduoduo", "real-search", "https://mobile.yangkeduo.com/search_result.html?search_key=%E5%A4%B4%E7%9B%94");
    const items = X("cn-pinduoduo").search!(doc) as SearchItem[];
    expect(items.some((i) => i.unitLabel || i.shipFrom || i.variantCount || i.packQty)).toBe(false);
    // The scroll-driven list is appended by XHR (flip cursor) into anchor-less React cards: nothing for the card heuristic.
    expect(doc.querySelectorAll("a[href]").length).toBe(0);
    expect(REAL_DEF_BY_ID["cn-pinduoduo"]!.maxPages).toBe(1);
    // List items name no mall (only mall_id): without a name there is no identity key; the detail page supplies it.
    expect(items.every((i) => i.shop === null)).toBe(true);
    const l = enrichListing(REAL_DEF_BY_ID["cn-pinduoduo"]!, items[0]!, REAL_DEF_BY_ID["cn-pinduoduo"]!.toListing(items[0]!, "2026-10-03T00:00:00Z")!);
    expect(l.supplier).toBeUndefined();
  });
});

describe("pinduoduo live detail", () => {
  it("reads title, coupon price, sales, shop, gallery and attributes from the rendered page", async () => {
    const a = createRealAdapter(REAL_DEF_BY_ID["cn-pinduoduo"]!, {
      async run(req) {
        const doc = load("cn-pinduoduo", "real-detail", req.url);
        return { ok: true, data: { session: X("cn-pinduoduo").session(doc), strategy: "dom", detail: X("cn-pinduoduo").detail!(doc) } as never, finalUrl: req.url, tookMs: 1 };
      },
    });
    const d = await a.fetchListing("842164999674");
    expect(d.title).toContain("摩托车头盔");
    expect(d.price.tiers[0]!.unitPrice).toBe(127);
    expect(d.sold).toBe(4753);
    expect(d.supplierName).toBe("玛莎玛莎玛莎");
    expect(d.images.length).toBeGreaterThan(0);
    expect(d.attributes?.["外壳材质"]).toBe("ABS");
    // SKU picker: 39 colour options × 4 sizes; the quantity input says "当前数量为1件".
    expect(d.variantCount).toBe(156);
    expect(d.unitLabel).toBe("件");
    expect(d.shipFrom).toBeUndefined();
    expect(d.supplier).toMatchObject({ key: "cn:玛莎玛莎玛莎" });
  });
});

describe("trendyol live search", () => {
  it("reads products from the single-search-result props", () => {
    const doc = load("tr-trendyol", "real-search", "https://www.trendyol.com/sr?q=kask");
    const items = X("tr-trendyol").search!(doc) as SearchItem[];
    expect(items.length).toBeGreaterThanOrEqual(20);
    const it = items.find((i) => i.id === "963258390")!;
    expect(it.title).toBe("ENDRO ThunderBolt Mat Siyah Kask");
    expect(it.price).toBe(2549);
    // socialProof orderCount ("100+") is the sales signal; the 844 ratings are kept separately.
    expect(it.sold).toBe(100);
    expect(it.ratingCount).toBe(844);
    expect(it.rating).toBeCloseTo(4.56, 1);
    expect(it.url).toBe("https://www.trendyol.com/endro/thunderbolt-mat-siyah-kask-p-963258390?boutiqueId=61&merchantId=1033437");
    expect(it.image).toMatch(/^https:\/\/cdn\.dsmcdn\.com\//);
    expect(it.supplierId).toBe("1033437");
    expect(items.every((i) => i.price !== null && i.price > 0)).toBe(true);
    // The capture has no "variants" arrays and no cross-border tags: variantCount stays null, no "Yurt Dışından" badge.
    expect(it.variantCount).toBeNull();
    expect(items.some((i) => i.variantCount !== null && i.variantCount !== undefined)).toBe(false);
    expect(items.some((i) => i.badges.includes("Yurt Dışından"))).toBe(false);
    const l = enrichListing(REAL_DEF_BY_ID["tr-trendyol"]!, it, REAL_DEF_BY_ID["tr-trendyol"]!.toListing(it, "2026-10-03T00:00:00Z")!);
    expect(l.variantCount).toBeUndefined();
    expect(l.shipFrom).toBeUndefined();
    // Search props carry merchantId but no merchant name: no identity key from the card (the product page names the seller).
    expect(it.shop).toBeNull();
    expect(l.supplier).toBeUndefined();
  });
});

describe("taobao live detail", () => {
  it("reads item, seller and sku prices from the inline state", async () => {
    const a = createRealAdapter(REAL_DEF_BY_ID["cn-taobao"]!, {
      async run(req) {
        const doc = load("cn-taobao", "real-detail", req.url);
        return { ok: true, data: { session: X("cn-taobao").session(doc), strategy: "embedded", detail: X("cn-taobao").detail!(doc) } as never, finalUrl: req.url, tookMs: 1 };
      },
    });
    const d = await a.fetchListing("1046610876030");
    expect(d.title).toContain("KASK");
    expect(d.price.tiers[0]!.unitPrice).toBe(49);
    expect(d.sold).toBe(600);
    expect(d.images).toHaveLength(5);
    expect(d.supplierName).toBe("KASK运动户外旗舰店");
    expect(d.supplierId).toBe("197944619");
    // skuBase.skus has two combinations; deliveryVO.deliveryFromAddr is the shipping origin.
    expect(d.variantCount).toBe(2);
    expect(d.shippingFrom).toBe("陕西西安");
    expect(d.shipFrom).toBe("cn");
    expect(d.supplier).toMatchObject({ key: "cn:kask运动户外" });
  });
});
