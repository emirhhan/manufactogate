// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { MarketId } from "@manufactogate/core";
import { createRealAdapter, PAGE_EXTRACTORS, REAL_DEF_BY_ID, type SearchItem } from "../src";

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
    expect(it.sold).toBe(844);
    expect(it.rating).toBeCloseTo(4.56, 1);
    expect(it.url).toBe("https://www.trendyol.com/endro/thunderbolt-mat-siyah-kask-p-963258390?boutiqueId=61&merchantId=1033437");
    expect(it.image).toMatch(/^https:\/\/cdn\.dsmcdn\.com\//);
    expect(it.supplierId).toBe("1033437");
    expect(items.every((i) => i.price !== null && i.price > 0)).toBe(true);
  });
});
