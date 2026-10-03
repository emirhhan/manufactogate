// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { AdapterError, type MarketId } from "@manufactogate/core";
import { createRealAdapter, PAGE_EXTRACTORS, REAL_DEF_BY_ID, REAL_DEFS, type ExtractFailure, type ExtractRequest, type ExtractResult, type PageRunner, type SearchItem, type SearchPayload } from "../src";

const D = (id: MarketId) => REAL_DEF_BY_ID[id]!;
const X = (id: MarketId) => PAGE_EXTRACTORS[id]!;

function load(market: string, name: string, url: string): Document {
  const html = readFileSync(join(__dirname, "..", "src", market, "fixtures", `${name}.html`), "utf8");
  const doc = new DOMParser().parseFromString(html, "text/html");
  Object.defineProperty(doc, "location", { value: new URL(url), configurable: true });
  return doc;
}

/** A PageRunner that serves fixtures instead of opening tabs. */
function fixtureRunner(map: Record<string, string>): PageRunner {
  return {
    async run<T>(req: ExtractRequest): Promise<ExtractResult<T> | ExtractFailure> {
      const name = map[req.kind] ?? "missing";
      const ex = X(req.market);
      const doc = load(req.market, name, req.url);
      const session = ex.session(doc);
      let data: unknown;
      if (req.kind === "search") {
        const items = (ex.search?.(doc) ?? []) as SearchItem[];
        data = { session, items, strategy: items.length ? "cards" : "none", pageTitle: doc.title } satisfies SearchPayload;
      } else if (req.kind === "detail") data = { session, strategy: "embedded", detail: ex.detail?.(doc) ?? null };
      else data = { session };
      return { ok: true, data: data as T, finalUrl: req.url, tookMs: 1 };
    },
  };
}

async function collect<T>(it: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const x of it) out.push(x);
  return out;
}

describe("real adapter definitions", () => {
  it("cover all four wave-1 markets with link resolvers", () => {
    expect(REAL_DEFS.filter((d) => !d.meta.version.includes("beta")).map((d) => d.id).sort()).toEqual(["cn-1688", "cn-pinduoduo", "cn-taobao", "tr-trendyol"]);
    expect(D("cn-1688").resolveLink("https://detail.1688.com/offer/123.html?spm=x")?.listingId).toBe("123");
    expect(D("cn-taobao").resolveLink("https://item.taobao.com/item.htm?spm=a&id=456")?.listingId).toBe("456");
    expect(D("cn-taobao").resolveLink("https://detail.tmall.com/item.htm?id=789")?.listingId).toBe("789");
    expect(D("cn-pinduoduo").resolveLink("https://mobile.yangkeduo.com/goods.html?goods_id=99")?.listingId).toBe("99");
    expect(D("tr-trendyol").resolveLink("https://www.trendyol.com/marka/urun-adi-p-4001?boutiqueId=1")?.listingId).toBe("4001");
    expect(D("tr-trendyol").resolveLink("https://www.hepsiburada.com/x-p-1")).toBeNull();
  });
});

describe("1688", () => {
  it("parses embedded search data", () => {
    const items = X("cn-1688").search!(load("cn-1688", "search-embedded", "https://s.1688.com/selloffer/offer_search.htm?keywords=x")) as SearchItem[];
    expect(items.map((i) => i.id)).toEqual(["7001", "7002"]);
    expect(items[0]!.price).toBe(28.5);
    expect(items[0]!.sold).toBe(12000);
    expect(items[0]!.moq).toBe(2);
    expect(items[0]!.badges).toEqual(["源头工厂", "实力商家"]);
    expect(items[0]!.shop).toBe("深圳市星耀电子有限公司");
  });
  it("falls back to DOM cards", () => {
    const items = X("cn-1688").search!(load("cn-1688", "search-cards", "https://s.1688.com/selloffer/offer_search.htm?keywords=x")) as SearchItem[];
    expect(items.map((i) => i.id)).toEqual(["8001", "8002"]);
    expect(items[0]!.title).toBe("TWS蓝牙耳机 批发");
    expect(items[0]!.price).toBe(25.8);
    expect(items[0]!.sold).toBe(8600);
    expect(items[0]!.moq).toBe(2);
    expect(items[0]!.image).toBe("https://cbu01.alicdn.com/img/c.jpg");
    expect(items[0]!.badges).toContain("源头工厂");
    expect(items[1]!.sold).toBe(11000);
  });
  it("parses detail with price ladder and maps to a listing", async () => {
    const a = createRealAdapter(D("cn-1688"), fixtureRunner({ detail: "detail-embedded" }));
    const d = await a.fetchListing("7001");
    expect(d.title).toContain("TWS");
    expect(d.price.tiers).toEqual([
      { minQty: 2, unitPrice: 28.5 },
      { minQty: 100, unitPrice: 25 },
      { minQty: 1000, unitPrice: 22.8 },
    ]);
    expect(d.moq).toBe(2);
    expect(d.supplierName).toBe("深圳市星耀电子有限公司");
    expect(d.attributes?.["型号"]).toBe("X15");
    expect(d.badges).toContain("深度验厂");
  });
  it("surfaces logged-out as a typed error", async () => {
    const a = createRealAdapter(D("cn-1688"), fixtureRunner({ search: "logged-out" }));
    await expect(collect(a.searchByText("x"))).rejects.toMatchObject({ type: "LoggedOut" } satisfies Partial<AdapterError>);
  });
  it("streams listings through the adapter", async () => {
    const a = createRealAdapter(D("cn-1688"), fixtureRunner({ search: "search-embedded" }));
    const ls = await collect(a.searchByText("蓝牙耳机", { maxResults: 1 }));
    expect(ls).toHaveLength(1);
    expect(ls[0]!.market).toBe("cn-1688");
    expect(ls[0]!.url).toBe("https://detail.1688.com/offer/7001.html");
    expect(ls[0]!.price.tiers[0]).toEqual({ minQty: 2, unitPrice: 28.5 });
  });
});

describe("taobao", () => {
  it("parses g_page_config auctions", () => {
    const items = X("cn-taobao").search!(load("cn-taobao", "search-embedded", "https://s.taobao.com/search?q=x")) as SearchItem[];
    expect(items.map((i) => i.id)).toEqual(["6001", "6002"]);
    expect(items[0]!.price).toBe(59);
    expect(items[0]!.sold).toBe(20000);
    expect(items[0]!.shop).toBe("星耀旗舰店");
    expect(items[0]!.badges).toContain("旗舰店");
  });
  it("falls back to cards and reads tmall links", () => {
    const items = X("cn-taobao").search!(load("cn-taobao", "search-cards", "https://s.taobao.com/search?q=x")) as SearchItem[];
    expect(items.map((i) => i.id)).toEqual(["6101", "6102"]);
    expect(items[1]!.price).toBe(129);
    expect(items[1]!.sold).toBe(3000);
    expect(items[0]!.sold).toBe(10000);
  });
  it("reports logged-out on the login page", async () => {
    const doc = load("cn-taobao", "logged-out", "https://login.taobao.com/member/login.jhtml");
    expect(X("cn-taobao").session(doc)).toBe("logged-out");
  });
});

describe("pinduoduo", () => {
  it("parses rawData goods with fen prices", () => {
    const items = X("cn-pinduoduo").search!(load("cn-pinduoduo", "search-embedded", "https://mobile.yangkeduo.com/search_result.html?search_key=x")) as SearchItem[];
    expect(items.map((i) => i.id)).toEqual(["5001", "5002"]);
    expect(items[0]!.price).toBe(29.9);
    expect(items[0]!.sold).toBe(100000);
    expect(items[0]!.badges).toEqual(["百亿补贴"]);
  });
  it("parses detail", async () => {
    const a = createRealAdapter(D("cn-pinduoduo"), fixtureRunner({ detail: "detail-embedded" }));
    const d = await a.fetchListing("5001");
    expect(d.price.tiers[0]!.unitPrice).toBe(29.9);
    expect(d.images).toHaveLength(2);
    expect(d.supplierName).toBe("星耀数码专营店");
  });
  it("detects captcha walls", async () => {
    const a = createRealAdapter(D("cn-pinduoduo"), fixtureRunner({ search: "captcha" }));
    await expect(collect(a.searchByText("x"))).rejects.toMatchObject({ type: "Captcha" });
  });
  it("has no image search", () => {
    const a = createRealAdapter(D("cn-pinduoduo"), fixtureRunner({}));
    expect(() => a.searchByImage({ dataUrl: "data:," })).toThrow(AdapterError);
  });
});

describe("trendyol", () => {
  it("parses embedded search state", () => {
    const items = X("tr-trendyol").search!(load("tr-trendyol", "search-embedded", "https://www.trendyol.com/sr?q=x")) as SearchItem[];
    expect(items.map((i) => i.id)).toEqual(["4001", "4002"]);
    expect(items[0]!.title).toBe("Xingyao TWS Kablosuz Bluetooth Kulaklık ANC");
    expect(items[0]!.price).toBe(349.9);
    expect(items[0]!.sold).toBe(2345);
    expect(items[0]!.url).toBe("https://www.trendyol.com/xingyao/tws-kablosuz-bluetooth-kulaklik-p-4001");
    expect(items[0]!.image).toBe("https://cdn.dsmcdn.com/ty100/product/media/images/a.jpg");
    expect(items[0]!.badges).toEqual(["Hızlı Teslimat"]);
    expect(items[0]!.currency).toBe("TRY");
  });
  it("falls back to cards with Turkish prices", () => {
    const items = X("tr-trendyol").search!(load("tr-trendyol", "search-cards", "https://www.trendyol.com/sr?q=x")) as SearchItem[];
    expect(items.map((i) => i.id)).toEqual(["4101", "4102"]);
    expect(items[0]!.price).toBe(349.9);
    expect(items[1]!.price).toBe(1299);
    expect(items[0]!.sold).toBe(2345);
  });
  it("parses product detail state", async () => {
    const a = createRealAdapter(D("tr-trendyol"), fixtureRunner({ detail: "detail-embedded" }));
    const d = await a.fetchListing("4001");
    expect(d.price).toEqual({ currency: "TRY", tiers: [{ minQty: 1, unitPrice: 349.9 }] });
    expect(d.supplierId).toBe("77");
    expect(d.rating).toBe(4.4);
    expect(d.attributes?.["Renk"]).toBe("Siyah");
  });
});

describe("page extractors are serializable-only", () => {
  it("every market has session+search; detail where supported", () => {
    for (const id of Object.keys(PAGE_EXTRACTORS) as MarketId[]) {
      expect(typeof X(id).session).toBe("function");
      expect(typeof X(id).search).toBe("function");
    }
  });
});
