// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { MarketId } from "@manufactogate/core";
import { hostMatches, isResultsUrl, PAGE_EXTRACTORS, REAL_DEF_BY_ID, REAL_DEFS, searchPayloadFor, WAVE3_DEFS, type SearchItem } from "../src";

/** Pages captured from the user's browser on 2026-10-03 with "Fixture yakala", trimmed and sanitised. */
function load(market: string, name: string, url: string): Document {
  const html = readFileSync(join(__dirname, "..", "src", market, "fixtures", `${name}.html`), "utf8");
  const doc = new DOMParser().parseFromString(html, "text/html");
  Object.defineProperty(doc, "location", { value: new URL(url), configurable: true });
  return doc;
}
const X = (id: MarketId) => PAGE_EXTRACTORS[id]!;
const D = (id: MarketId) => REAL_DEF_BY_ID[id]!;
const items = (id: MarketId, name: string, url: string) => X(id).search!(load(id, name, url)) as SearchItem[];
const by = (xs: SearchItem[], id: string) => {
  const it = xs.find((i) => i.id === id);
  expect(it, `item ${id}`).toBeDefined();
  return it!;
};

describe("market definitions are consistent", () => {
  it("human-like search is opt-in and its home host is one of the market's hosts", () => {
    const human = REAL_DEFS.filter((d) => d.humanSearchHome).map((d) => d.id).sort();
    expect(human).toEqual(["id-shopee", "kr-coupang", "us-temu"]);
    for (const d of REAL_DEFS) {
      if (!d.humanSearchHome) continue;
      const host = new URL(d.humanSearchHome).hostname;
      expect(d.meta.hosts.some((h) => hostMatches(host, h)), `${d.id} home ${host}`).toBe(true);
    }
  });
  it("every def has a home URL on its own hosts and a results pattern that accepts its search URL but not its home", () => {
    for (const d of REAL_DEFS) {
      expect(d.homeUrl, d.id).toBeDefined();
      expect(d.meta.hosts.some((h) => hostMatches(new URL(d.homeUrl!).hostname, h)), `${d.id} home host`).toBe(true);
      expect(isResultsUrl(d, d.searchUrl("kask", 1)), `${d.id} search url`).toBe(true);
      expect(isResultsUrl(d, d.searchUrl("kask", 2)), `${d.id} page 2`).toBe(true);
      expect(isResultsUrl(d, d.homeUrl!), `${d.id} home`).toBe(false);
    }
  });
  it("image search is advertised only by markets with a verified upload page (1688, Taobao)", () => {
    const withImage = REAL_DEFS.filter((d) => d.meta.capabilities.imageSearch).map((d) => d.id).sort();
    expect(withImage).toEqual(["cn-1688", "cn-taobao"]);
    for (const d of REAL_DEFS) if (d.meta.capabilities.imageSearch) expect(d.imageSearchUrl, d.id).toBeDefined();
    expect(D("tr-trendyol").imageSearchUrl).toBeUndefined();
  });
  it("Yahoo Auctions lives on the bare host and Mercari is the US site in USD", () => {
    const y = D("jp-yahooauctions");
    expect(y.homeUrl).toBe("https://auctions.yahoo.co.jp/");
    expect(y.meta.hosts).toContain("auctions.yahoo.co.jp");
    expect(y.resolveLink("https://auctions.yahoo.co.jp/jp/auction/g1246860963")?.listingId).toBe("g1246860963");
    const m = D("us-mercari");
    expect(m.meta.currency).toBe("USD");
    expect(m.meta.country).toBe("us");
    expect(m.resolveLink("https://www.mercari.com/us/item/m29966601812/")?.listingId).toBe("m29966601812");
  });
  it("link resolution is host-exact: amazon.com does not claim amazon.com.tr links", () => {
    expect(D("us-amazon").resolveLink("https://www.amazon.com.tr/dp/B0ABCDEFGH")).toBeNull();
    expect(D("tr-amazon").resolveLink("https://www.amazon.com.tr/dp/B0ABCDEFGH")?.listingId).toBe("B0ABCDEFGH");
    expect(D("us-amazon").resolveLink("https://www.amazon.com/dp/B0ABCDEFGH/ref=x")?.listingId).toBe("B0ABCDEFGH");
    expect(D("id-tokopedia").resolveLink("https://www.tokopedia.com/discovery/guncang")).toBeNull();
    expect(D("id-tokopedia").resolveLink("https://www.tokopedia.com/yiqii/yiqii-lemari-plastik")?.listingId).toBe("yiqii/yiqii-lemari-plastik");
    expect(D("tr-trendyol").resolveLink("https://www.trendyol.com/endro/kask-p-963258390?boutiqueId=61&merchantId=1033437&x=1")?.canonicalUrl).toBe("https://www.trendyol.com/endro/kask-p-963258390?boutiqueId=61&merchantId=1033437");
  });
  it("beta defs expose badge dictionaries whose values are normalized badges", () => {
    for (const d of WAVE3_DEFS) {
      expect(Object.keys(d.badgeMap).length, d.id).toBeGreaterThan(0);
      for (const v of Object.values(d.badgeMap)) expect(typeof v).toBe("string");
    }
  });
});

describe("home pages are not captcha walls (reCAPTCHA badges, CSP metas)", () => {
  it.each([
    ["us-mercari", "real-home", "https://www.mercari.com/"],
    ["ae-noon", "real-home", "https://www.noon.com/uae-en/"],
    ["us-walmart", "real-home", "https://www.walmart.com/"],
  ] as const)("%s", (market, name, url) => {
    const doc = load(market, name, url);
    expect(X(market).session(doc)).not.toBe("captcha");
    expect(X(market).session(doc)).not.toBe("logged-out");
    expect(X(market).probe!(doc).resultsPage).toBe(false);
  });
  it("still recognises real walls and login pages", () => {
    expect(X("cn-pinduoduo").session(load("cn-pinduoduo", "captcha", "https://mobile.yangkeduo.com/search_result.html?search_key=x"))).toBe("captcha");
    expect(X("cn-1688").session(load("cn-1688", "logged-out", "https://s.1688.com/selloffer/offer_search.htm?keywords=x"))).toBe("logged-out");
    expect(X("cn-taobao").session(load("cn-taobao", "logged-out", "https://login.taobao.com/member/login.jhtml"))).toBe("logged-out");
    expect(X("cn-pinduoduo").session(load("cn-pinduoduo", "real-search", "https://mobile.yangkeduo.com/psnl_verification.html?from=x"))).toBe("captcha");
    const amazon = new DOMParser().parseFromString(`<html><head><title>Amazon.de</title></head><body><form action="/errors/validateCaptcha"><h4>Geben Sie die angezeigten Zeichen ein</h4><input id="captchacharacters"></form></body></html>`, "text/html");
    Object.defineProperty(amazon, "location", { value: new URL("https://www.amazon.de/s?k=x"), configurable: true });
    expect(X("de-amazon").session(amazon)).toBe("captcha");
    const robot = new DOMParser().parseFromString(`<html><head><title>Robot Vacuum Cleaner - Amazon.de</title></head><body><h1>Robot vacuum</h1><a href="/gp/flex/sign-out.html">Abmelden</a></body></html>`, "text/html");
    Object.defineProperty(robot, "location", { value: new URL("https://www.amazon.de/s?k=robot"), configurable: true });
    expect(X("de-amazon").session(robot)).not.toBe("captcha");
  });
});

describe("Global Sources search page", () => {
  it("reads title, price range, MOQ, supplier, verified badges and the result total; skips sidebar tiles", () => {
    const doc = load("cn-globalsources", "real-search", "https://www.globalsources.com/searchList/products?keyWord=smartwatch");
    const xs = X("cn-globalsources").search!(doc) as SearchItem[];
    expect(xs.length).toBeGreaterThanOrEqual(5);
    expect(xs.every((i) => /^\d{8,}$/.test(i.id))).toBe(true);
    const it = by(xs, "1234164535");
    expect(it.title).toContain("NSQ16");
    expect(it.title).not.toMatch(/^US\$/);
    expect(it.price).toBe(14.49);
    expect(it.priceMax).toBe(14.99);
    expect(it.priceCurrency).toBe("USD");
    expect(it.moq).toBe(200);
    expect(it.shop).toBe("Shenzhen N+1 Intelligent Technology Co. Ltd");
    expect(it.badges).toContain("Verified Maufacturer");
    expect(it.badges).toContain("Premier Supplier");
    const payload = searchPayloadFor(X("cn-globalsources"), doc);
    expect(payload.strategy).toBe("cards");
    expect(payload.total).toBe(43655);
    expect(payload.noResults).toBe(false);
    expect(payload.resultsPage).toBe(true);
    const l = D("cn-globalsources").toListing(it, "2026-10-03T00:00:00Z")!;
    expect(l.price.tiers[0]).toEqual({ minQty: 200, unitPrice: 14.49 });
    expect(l.badges).toContain("Verified Maufacturer");
  });
});

describe("Yiwugo search page", () => {
  it("joins highlighted titles, reads split prices, MOQ, stall address, years and member badge", () => {
    const xs = items("cn-yiwugo", "real-search", "https://www.yiwugo.com/search?q=smartwatch");
    expect(xs).toHaveLength(5);
    const it = by(xs, "967840030");
    expect(it.title).toContain("SmartWatch9");
    expect(it.title).not.toMatch(/S m a r t/);
    expect(it.price).toBe(58);
    expect(it.priceCurrency).toBe("CNY");
    expect(it.moq).toBe(500);
    expect(it.shop).toBe("英煌电子百货");
    expect(it.supplierYears).toBe(2);
    expect(it.badges).toContain("高级会员");
    expect(it.location).toContain("义乌");
    const l = D("cn-yiwugo").toListing(it, "2026-10-03T00:00:00Z")!;
    expect(l.moq).toBe(500);
    expect(l.badges).toContain("2 yıl");
  });
});

describe("IndiaMART export search (RSC flight payload)", () => {
  it("reads products with prices, MOQ, company, state, years, verification flags", () => {
    const doc = load("in-indiamart", "real-search", "https://export.indiamart.com/search.php?ss=watch");
    const xs = X("in-indiamart").search!(doc) as SearchItem[];
    expect(xs.length).toBeGreaterThanOrEqual(5);
    const it = by(xs, "2852116206130");
    expect(it.price).toBe(48000);
    expect(it.priceCurrency).toBe("INR");
    expect(it.moq).toBe(1);
    expect(it.shop).toBe("Pramukh Impex");
    expect(it.location).toBe("Gujarat");
    expect(it.supplierYears).toBe(7);
    expect(it.supplierVerified).toBe(true);
    expect(it.supplierRating).toBe(4.8);
    expect(it.ratingCount).toBe(195);
    expect(it.badges).toEqual(expect.arrayContaining(["TrustSEAL", "Verified Exporter", "GST Verified"]));
    expect(it.url).toMatch(/^https:\/\/www\.indiamart\.com\/proddetail\/.*-2852116206130\.html$/);
    expect(searchPayloadFor(X("in-indiamart"), doc).strategy).toBe("embedded");
    // Lakh prices parse as full numbers.
    expect(xs.every((i) => i.price === null || i.price >= 100)).toBe(true);
    const l = D("in-indiamart").toListing(it, "2026-10-03T00:00:00Z")!;
    expect(l.rating).toBe(4.8);
    expect(l.badges).toContain("7 yıl");
  });
});

describe("TradeIndia manufacturers page (__NEXT_DATA__)", () => {
  it("reads listings with INR prices, MOQ, member years, factory flag and the product image (not the Made-in-India badge)", () => {
    const doc = load("in-tradeindia", "real-search", "https://www.tradeindia.com/manufacturers/wooden-wall-clock.html");
    const xs = X("in-tradeindia").search!(doc) as SearchItem[];
    expect(xs.length).toBeGreaterThanOrEqual(5);
    const it = by(xs, "1609286");
    expect(it.title).toContain("Wooden Wall Clock");
    expect(it.price).toBe(150);
    expect(it.priceCurrency).toBe("INR");
    expect(it.moq).toBe(50);
    expect(it.supplierYears).toBe(16);
    expect(it.shop).toBe("GIFTMART");
    expect(it.location).toBe("Mumbai, Maharashtra");
    expect(it.businessType).toBe("factory");
    expect(it.badges).toEqual(expect.arrayContaining(["Trusted Seller", "Manufacturer"]));
    expect(it.image).toMatch(/cpimg\.tistatic\.com/);
    expect(it.url).toBe("https://www.tradeindia.com/products/wooden-wall-clock-c1609286.html");
    expect(D("in-tradeindia").resolveLink(it.url)?.listingId).toBe("1609286");
    expect(X("in-tradeindia").probe!(doc).resultsPage).toBe(true);
    const l = D("in-tradeindia").toListing(it, "2026-10-03T00:00:00Z")!;
    expect(l.badges).toContain("Manufacturer");
    expect(l.badges).toContain("16 yıl");
  });
  it("keeps price-less B2B rows as price-on-request listings", () => {
    const def = D("in-tradeindia");
    const l = def.toListing({ id: "1", url: "https://www.tradeindia.com/products/x-c1.html", title: "Ask me", image: null, price: null, priceText: null, sold: null, shop: "Co", location: null, badges: [], text: "", priceOnRequest: true }, "2026-10-03T00:00:00Z");
    expect(l?.price.tiers).toEqual([]);
    // Retail markets still drop price-less cards.
    expect(D("us-ebay").toListing({ id: "1", url: "https://www.ebay.com/itm/1", title: "x", image: null, price: null, priceText: null, sold: null, shop: null, location: null, badges: [], text: "promo" }, "2026-10-03T00:00:00Z")).toBeNull();
  });
});

describe("home-page captures (promo cards) parse with correct prices and titles", () => {
  it("Noon: bare amount next to a CSS-drawn currency", () => {
    const xs = items("ae-noon", "real-home", "https://www.noon.com/uae-en/");
    expect(xs).toHaveLength(3);
    const it = by(xs, "N70371876V");
    expect(it.title).toMatch(/^Google Fitbit Air/);
    expect(it.price).toBe(509);
    expect(it.priceCurrency).toBe("AED");
  });
  it("Mercari US: USD prices, titles from the thumb alt/title", () => {
    const xs = items("us-mercari", "real-home", "https://www.mercari.com/");
    expect(xs).toHaveLength(3);
    const it = by(xs, "m29966601812");
    expect(it.price).toBe(120);
    expect(it.priceCurrency).toBe("USD");
    expect(it.title).toBe("15 pack of Mewtwo promo");
    expect(it.sold).toBeNull();
  });
  it("Walmart: price from the aria-label, badge prefix stripped from the title", () => {
    const xs = items("us-walmart", "real-home", "https://www.walmart.com/");
    expect(xs).toHaveLength(3);
    expect(by(xs, "19395472114").price).toBe(10.99);
    expect(by(xs, "19395472114").title).toMatch(/^Kiss Core Halloween/);
    const libby = by(xs, "10306750");
    expect(libby.price).toBe(1.97);
    expect(libby.title).toMatch(/^Libby/);
    expect(libby.badges).toContain("Rollback");
  });
  it("Gmarket: product name (not the coupon label) and the sale price (not the struck one)", () => {
    const xs = items("kr-gmarket", "real-home", "https://www.gmarket.co.kr/");
    expect(xs).toHaveLength(3);
    const it = by(xs, "4823233229");
    expect(it.title).toMatch(/^\(옵션\) 하리보/);
    expect(it.price).toBe(16480);
    expect(it.priceCurrency).toBe("KRW");
    expect(it.badges).toContain("무료배송");
  });
  it("Ozon: title from the second anchor, rating, RUB price", () => {
    const xs = items("ru-ozon", "real-home", "https://www.ozon.ru/");
    expect(xs).toHaveLength(3);
    const it = by(xs, "3660840746");
    expect(it.title).toBe("Капсулы для стирки белья FRESH X , Свежесть Океана, 52 шт");
    expect(it.price).toBe(396);
    expect(it.priceCurrency).toBe("RUB");
    expect(it.rating).toBe(4.8);
    expect(xs.every((i) => i.title.length > 5)).toBe(true);
  });
  it("Wildberries: NBSP thousands, current price over strike-through, aria-label title", () => {
    const xs = items("ru-wildberries", "real-home", "https://www.wildberries.ru/");
    expect(xs).toHaveLength(3);
    expect(by(xs, "1290278718").price).toBe(795);
    expect(by(xs, "1290278718").title).toContain("Обогреватель");
    expect(by(xs, "1354389476").price).toBe(2325);
  });
  it("Temu TR: localised TL prices and titles without the 'Popüler seçimler' badge", () => {
    const xs = items("us-temu", "real-home", "https://www.temu.com/tr");
    expect(xs).toHaveLength(3);
    const it = by(xs, "601104084352283");
    expect(it.price).toBe(333.86);
    expect(it.priceCurrency).toBe("TRY");
    expect(it.title).toMatch(/^15'li K5/);
    const l = D("us-temu").toListing(it, "2026-10-03T00:00:00Z")!;
    expect(l.price.currency).toBe("TRY");
  });
  it("Tokopedia: category/discovery links are not products; sold counts with 'rb'", () => {
    const xs = items("id-tokopedia", "real-home", "https://www.tokopedia.com/");
    expect(xs).toHaveLength(3);
    expect(xs.every((i) => !/^(?:discovery|p|find|s)\//.test(i.id))).toBe(true);
    const it = xs.find((i) => i.id.startsWith("shier-tools-house/"))!;
    expect(it.price).toBe(102599);
    expect(it.sold).toBe(10000);
    expect(it.title).toMatch(/^SHIER Pressure Sprayer/);
    expect(xs.every((i) => !i.image || /^https?:/.test(i.image))).toBe(true);
  });
  it("Lazada TH: flash-sale price, not the original", () => {
    const xs = items("th-lazada", "real-home", "https://www.lazada.co.th/");
    expect(xs).toHaveLength(3);
    expect(by(xs, "2372134989").price).toBe(22.84);
    expect(by(xs, "2372134989").priceCurrency).toBe("THB");
  });
  it("eBay: current price, not the strike-through", () => {
    const xs = items("us-ebay", "real-home", "https://www.ebay.com/");
    expect(xs).toHaveLength(3);
    expect(by(xs, "277472732832").price).toBe(179.99);
    expect(by(xs, "277472732832").title).toBe("Dyson V8 Origin Cordless Vacuum | Red | Refurbished");
  });
  it("Yahoo Auctions: JPY prices, bare host links", () => {
    const xs = items("jp-yahooauctions", "real-home", "https://auctions.yahoo.co.jp/");
    expect(xs).toHaveLength(3);
    const it = by(xs, "g1246860963");
    expect(it.price).toBe(1000);
    expect(it.priceCurrency).toBe("JPY");
    expect(it.title).toContain("CASIO");
    expect(it.url).toBe("https://auctions.yahoo.co.jp/jp/auction/g1246860963");
  });
});

describe("generic detail reader", () => {
  it("returns null on a page that is not the product page (home / redirect)", () => {
    expect(X("us-walmart").detail!(load("us-walmart", "real-home", "https://www.walmart.com/"))).toBeNull();
    expect(X("ru-ozon").detail!(load("ru-ozon", "real-home", "https://www.ozon.ru/"))).toBeNull();
    expect(X("cn-pinduoduo").detail!(load("cn-pinduoduo", "real-search", "https://mobile.yangkeduo.com/search_result.html?search_key=x"))).toBeNull();
    expect(X("tr-trendyol").detail!(load("tr-trendyol", "real-search", "https://www.trendyol.com/sr?q=kask"))).toBeNull();
  });
  it("reads a product page via JSON-LD and h1", () => {
    const doc = new DOMParser().parseFromString(
      `<html><head><title>x</title><link rel="canonical" href="https://www.ebay.com/itm/277472732832"><script type="application/ld+json">{"@type":"Product","name":"Dyson V8","image":["https://i.ebayimg.com/a.jpg"],"offers":{"@type":"Offer","price":"179.99","priceCurrency":"USD"}}</script></head><body><h1>Dyson V8 Origin</h1></body></html>`,
      "text/html",
    );
    Object.defineProperty(doc, "location", { value: new URL("https://www.ebay.com/itm/277472732832"), configurable: true });
    const d = X("us-ebay").detail!(doc) as Record<string, unknown>;
    expect(d["title"]).toBe("Dyson V8 Origin");
    expect(d["price"]).toBe(179.99);
    expect(d["images"]).toEqual(["https://i.ebayimg.com/a.jpg"]);
  });
});
