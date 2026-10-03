import { AdapterError, type AdapterProgress, type MarketId } from "@manufactogate/core";
import { createRealAdapter, detailUrlFor, enrichListing, REAL_DEF_BY_ID, requestBudgetMs, strategyOf, TIMING, type ExtractFailure, type ExtractRequest, type ExtractResult, type PageRunner, type RunnerOptions, type SearchItem, type SearchPayload } from "../src";

/** A scripted PageRunner: each call is answered by `script(req, callIndex)`; every request and its options are recorded. */
function scripted(script: (req: ExtractRequest, n: number, opts: RunnerOptions) => ExtractResult<unknown> | ExtractFailure | Promise<ExtractResult<unknown> | ExtractFailure>) {
  const calls: ExtractRequest[] = [];
  const options: RunnerOptions[] = [];
  const runner: PageRunner = {
    async run<T>(req: ExtractRequest, opts: RunnerOptions = {}) {
      calls.push(req);
      options.push(opts);
      return (await script(req, calls.length - 1, opts)) as ExtractResult<T> | ExtractFailure;
    },
  };
  return { runner, calls, options };
}

function card(id: string, title = `Ürün ${id}`, price = 10): SearchItem {
  return { id, url: `https://www.ebay.com/itm/${id}`, title, image: null, price, priceText: `$${price}`, sold: null, shop: null, location: null, badges: [], text: "card" };
}

function ok(items: SearchItem[], finalUrl: string, extra: Partial<SearchPayload> = {}): ExtractResult<SearchPayload> {
  return { ok: true, data: { session: "unknown", items, strategy: strategyOf(items), pageTitle: "t", ...extra }, finalUrl, tookMs: 1 };
}

async function collect<T>(it: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const x of it) out.push(x);
  return out;
}

const D = (id: MarketId) => REAL_DEF_BY_ID[id]!;

describe("human-like search path", () => {
  it("falls back to the search URL when the search box is not found", async () => {
    const def = D("us-temu");
    const { runner, calls } = scripted((req) => (req.typeQuery ? { ok: false, error: "SelectorBroken", message: "arama kutusu bulunamadı" } : ok([card("601104084352283", "Uç seti", 333.86)], def.searchUrl("kask", 1))));
    const ls = await collect(createRealAdapter(def, runner).searchByText("kask"));
    expect(calls).toHaveLength(2);
    expect(calls[0]!.typeQuery).toBe("kask");
    expect(calls[0]!.url).toBe(def.humanSearchHome);
    expect(calls[0]!.searchBox).toEqual(def.searchBoxSelectors);
    expect(calls[1]!.typeQuery).toBeUndefined();
    expect(calls[1]!.url).toBe(def.searchUrl("kask", 1));
    expect(calls[1]!.expectUrl).toBe(def.resultsUrlPattern!.source);
    expect(ls.map((l) => l.id)).toEqual(["601104084352283"]);
  });
  it("discards home-page promo cards when the typed query did not navigate and retries via URL", async () => {
    const def = D("us-temu");
    const promo = Array.from({ length: 30 }, (_, i) => card(`9000${i}`, `Promo ${i}`));
    const { runner, calls } = scripted((req) => (req.typeQuery ? ok(promo, "https://www.temu.com/") : ok([card("1", "Gerçek sonuç")], "https://www.temu.com/search_result.html?search_key=kask")));
    const ls = await collect(createRealAdapter(def, runner).searchByText("kask", { maxResults: 60 }));
    expect(calls).toHaveLength(2);
    expect(ls.map((l) => l.title)).toEqual(["Gerçek sonuç"]);
  });
  it("still surfaces login walls and captchas from the typed run as typed errors", async () => {
    const def = D("id-shopee");
    const { runner } = scripted(() => ok([], "https://shopee.co.id/buyer/login", { session: "logged-out" }));
    await expect(collect(createRealAdapter(def, runner).searchByText("x"))).rejects.toMatchObject({ type: "LoggedOut" });
  });
});

describe("URL search path", () => {
  it("rejects with a Network error when the search URL lands on a non-results page", async () => {
    const def = D("tr-hepsiburada");
    const { runner } = scripted(() => ok([card("1")], "https://www.hepsiburada.com/"));
    await expect(collect(createRealAdapter(def, runner).searchByText("kask"))).rejects.toMatchObject({ type: "Network", message: expect.stringContaining("yönlendirmedi") } satisfies Partial<AdapterError>);
  });
  it("stops paging when the next page repeats the previous ids (ignored page parameter)", async () => {
    const def = D("us-ebay");
    const page = Array.from({ length: 10 }, (_, i) => card(`10000000${i}`));
    const { runner, calls } = scripted((req) => ok(page, req.url));
    const ls = await collect(createRealAdapter(def, runner).searchByText("earbuds", { maxResults: 100 }));
    expect(ls).toHaveLength(10);
    expect(calls).toHaveLength(2);
    expect(calls[1]!.url).toBe(def.searchUrl("earbuds", 2));
  });
  it("walks further pages while they bring new ids and stops at maxPages", async () => {
    const def = D("us-ebay");
    const { runner, calls } = scripted((_req, n) => ok(Array.from({ length: 10 }, (_, i) => card(`${n}0000000${i}`)), _req.url));
    const ls = await collect(createRealAdapter(def, runner).searchByText("earbuds", { maxResults: 100 }));
    expect(calls).toHaveLength(def.maxPages!);
    expect(ls).toHaveLength(10 * def.maxPages!);
  });
  it("stops when the advertised total is reached", async () => {
    const def = D("us-ebay");
    const { runner, calls } = scripted((req) => ok([card("100000001"), card("100000002")], req.url, { total: 2 }));
    const ls = await collect(createRealAdapter(def, runner).searchByText("earbuds", { maxResults: 100 }));
    expect(ls).toHaveLength(2);
    expect(calls).toHaveLength(1);
  });
  it("treats a 'no results' page as an empty result, not an error", async () => {
    const def = D("us-ebay");
    const { runner, calls } = scripted((req) => ok([], req.url, { noResults: true }));
    const ls = await collect(createRealAdapter(def, runner).searchByText("qwertyuiop"));
    expect(ls).toEqual([]);
    expect(calls).toHaveLength(1);
  });
  it("reports a risk-controlled empty list as RateLimited with the market's hint", async () => {
    const def = D("cn-pinduoduo");
    const { runner } = scripted((req) => ok([], req.url, { blocked: "Pinduoduo bu oturuma boş liste döndürdü" }));
    await expect(collect(createRealAdapter(def, runner).searchByText("头盔"))).rejects.toMatchObject({ type: "RateLimited", message: expect.stringContaining("boş liste") });
  });
  it("maps per-listing currency from the page (Temu TR prices in TL)", async () => {
    const def = D("us-temu");
    const { runner } = scripted((req) => (req.typeQuery ? { ok: false, error: "SelectorBroken", message: "arama kutusu bulunamadı" } : ok([{ ...card("1", "x", 333.86), priceCurrency: "TRY", currency: "TRY" }], def.searchUrl("x", 1))));
    const [l] = await collect(createRealAdapter(def, runner).searchByText("x"));
    expect(l!.price).toEqual({ currency: "TRY", tiers: [{ minQty: 1, unitPrice: 333.86 }] });
  });
});

describe("health and session probes", () => {
  it("health is a quick probe (kind health, 8 s, no captcha wait) and accepts a session-only payload", async () => {
    const def = D("tr-hepsiburada");
    const { runner, calls } = scripted((req) => ({ ok: true, data: { session: "unknown", pageTitle: "Arama" }, finalUrl: req.url, tookMs: 5 }));
    const h = await createRealAdapter(def, runner).healthCheck();
    expect(calls[0]).toMatchObject({ kind: "health", quick: true, timeoutMs: 8000, url: def.searchUrl(def.healthQuery) });
    expect(h.ok).toBe(true);
    expect(h.message).toContain("sonuç sayfası açıldı");
  });
  it("health fails when the search page was not reached, when the session is a wall, and reports counts when present", async () => {
    const def = D("tr-hepsiburada");
    const home = scripted(() => ({ ok: true, data: { session: "unknown" }, finalUrl: "https://www.hepsiburada.com/", tookMs: 5 }));
    expect((await createRealAdapter(def, home.runner).healthCheck()).ok).toBe(false);
    const captcha = scripted((req) => ({ ok: true, data: { session: "captcha", items: [] }, finalUrl: req.url, tookMs: 5 }));
    expect((await createRealAdapter(def, captcha.runner).healthCheck()).ok).toBe(false);
    const counted = scripted((req) => ({ ok: true, data: { session: "logged-in", items: [card("1"), card("2")], strategy: "cards", total: 120 }, finalUrl: req.url, tookMs: 5 }));
    const h = await createRealAdapter(def, counted.runner).healthCheck();
    expect(h.ok).toBe(true);
    expect(h.message).toContain("2 sonuç");
    expect(h.message).toContain("toplam 120");
    const empty = scripted((req) => ({ ok: true, data: { session: "logged-in", items: [], strategy: "none" }, finalUrl: req.url, tookMs: 5 }));
    expect((await createRealAdapter(def, empty.runner).healthCheck()).ok).toBe(false);
  });
  it("session probes open the market home with a quick health run", async () => {
    const def = D("tr-trendyol");
    const { runner, calls } = scripted((req) => ({ ok: true, data: { session: "logged-in" }, finalUrl: req.url, tookMs: 5 }));
    expect(await createRealAdapter(def, runner).session()).toBe("logged-in");
    expect(calls[0]).toMatchObject({ kind: "health", quick: true, url: "https://www.trendyol.com/" });
  });
  it("image search is refused for markets without it, before any tab is opened", () => {
    const { runner, calls } = scripted((req) => ok([], req.url));
    expect(() => createRealAdapter(D("tr-trendyol"), runner).searchByImage({ dataUrl: "data:," })).toThrow(AdapterError);
    expect(calls).toHaveLength(0);
  });
});

describe("cancel and live progress through the runner", () => {
  it("forwards the caller's AbortSignal to every page request and reports an abort, not a market error", async () => {
    const def = D("us-ebay");
    const ac = new AbortController();
    const { runner, options } = scripted(async (req, _n, opts) => {
      // The runner stops as soon as the signal fires and answers with a cancelled failure, like the extension does.
      await new Promise<void>((r) => opts.signal?.addEventListener("abort", () => r(), { once: true }));
      return { ok: false, error: "Network", message: "İstek iptal edildi", finalUrl: req.url } satisfies ExtractFailure;
    });
    const it = createRealAdapter(def, runner).searchByText("earbuds", { signal: ac.signal })[Symbol.asyncIterator]();
    const next = it.next();
    await new Promise((r) => setTimeout(r, 5));
    ac.abort();
    await expect(next).rejects.toMatchObject({ name: "AbortError" });
    expect(options[0]!.signal).toBe(ac.signal);
    const e = await next.catch((x: unknown) => x);
    expect(e).not.toBeInstanceOf(AdapterError);
  });
  it("stamps progress of later pages with the page number and passes page 1 through untouched", async () => {
    const def = D("us-ebay");
    const seen: AdapterProgress[] = [];
    const { runner } = scripted((req, n, opts) => {
      opts.onProgress?.({ stage: "queued" });
      opts.onProgress?.({ stage: "settling" });
      return ok(Array.from({ length: 10 }, (_, i) => card(`${n}0000000${i}`)), req.url);
    });
    await collect(createRealAdapter(def, runner).searchByText("earbuds", { maxResults: 100, onProgress: (p) => seen.push(p) }));
    expect(seen.slice(0, 2)).toEqual([{ stage: "queued" }, { stage: "settling" }]);
    expect(seen.filter((p) => p.page === 2)).toEqual([{ stage: "queued", page: 2 }, { stage: "settling", page: 2 }]);
  });
});

describe("detail hints", () => {
  it("opens the seller-specific Trendyol page from the listing URL or supplier id", () => {
    const def = D("tr-trendyol");
    expect(detailUrlFor(def, "123456")).toBe("https://www.trendyol.com/p/-p-123456");
    expect(detailUrlFor(def, "123456", { url: "https://www.trendyol.com/marka/urun-p-123456?boutiqueId=61&merchantId=98765&x=1" })).toBe("https://www.trendyol.com/marka/urun-p-123456?boutiqueId=61&merchantId=98765");
    expect(detailUrlFor(def, "123456", { supplierId: "98765" })).toBe("https://www.trendyol.com/p/-p-123456?merchantId=98765");
    // A URL of another listing is ignored; markets without a seller parameter keep their plain detail URL.
    expect(detailUrlFor(def, "123456", { url: "https://www.trendyol.com/marka/urun-p-999?merchantId=1" })).toBe("https://www.trendyol.com/p/-p-123456");
    expect(detailUrlFor(D("cn-1688"), "777", { supplierId: "b2b-1" })).toBe("https://detail.1688.com/offer/777.html");
  });
  it("fetchListing(id, hint) opens the hinted URL and keeps it on the detail when the page did not name the seller", async () => {
    const def = D("tr-trendyol");
    const { runner, calls } = scripted((req) => ({ ok: true, data: { session: "logged-in", strategy: "embedded", detail: { title: "Kask", price: 1200, images: [] } }, finalUrl: req.url, tookMs: 1 }));
    const d = await createRealAdapter(def, runner).fetchListing("123456", { supplierId: "98765" });
    expect(calls[0]).toMatchObject({ kind: "detail", url: "https://www.trendyol.com/p/-p-123456?merchantId=98765" });
    expect(d.url).toBe("https://www.trendyol.com/p/-p-123456?merchantId=98765");
  });
});

describe("listing enrichment from card fields", () => {
  it("maps Trendyol ratingCount to reviewCount and marks a review-derived sold counter", async () => {
    const def = D("tr-trendyol");
    const item: SearchItem = { ...card("1", "Kask", 1200), url: "https://www.trendyol.com/x/y-p-1", sold: 844, ratingCount: 844, rating: 4.6, currency: "TRY", text: "" };
    const { runner } = scripted((req) => ok([item], req.url));
    const [l] = await collect(createRealAdapter(def, runner).searchByText("kask"));
    expect(l).toMatchObject({ reviewCount: 844, sold: 844, soldPeriod: "reviews", rating: 4.6 });
    expect(l!.ratingMax).toBeUndefined();
  });
  it("keeps supplier signals, price ranges and price-on-request from B2B cards", () => {
    const def = D("in-tradeindia");
    const item: SearchItem = { ...card("55555", "Bluetooth earphones", 100), priceMax: 150, supplierYears: 12, supplierVerified: true, businessType: "factory", supplierRating: 4.2, ratingCount: 31, titleLang: "en", text: "" };
    const l = enrichListing(def, item, def.toListing(item, "2026-10-03T00:00:00Z")!);
    expect(l.priceMax).toBe(150);
    expect(l.reviewCount).toBe(31);
    expect(l.titleLang).toBe("en");
    expect(l.supplier).toEqual({ years: 12, verified: true, businessType: "factory", rating: 4.2, ratingCount: 31 });
    const quote: SearchItem = { ...card("55556", "Custom earphones", 0), price: null, priceOnRequest: true, text: "" };
    const q = enrichListing(def, quote, def.toListing(quote, "2026-10-03T00:00:00Z")!);
    expect(q.price.tiers).toEqual([]);
    expect(q.priceOnRequest).toBe(true);
    expect(q.supplier).toBeUndefined();
  });
  it("tags 1688 sold counters as 30-day and percent ratings as out of 100", () => {
    const def = D("cn-1688");
    const item: SearchItem = { ...card("9", "耳机", 25.8), sold: 1200, rating: 98, text: "" };
    const l = enrichListing(def, item, { ...def.toListing(item, "2026-10-03T00:00:00Z")!, rating: 98 });
    expect(l.soldPeriod).toBe("30d");
    expect(l.ratingMax).toBe(100);
  });
});

describe("timing budget", () => {
  it("the bridge wait covers the extension's worst case for every request kind", () => {
    const worst = (kind: ExtractRequest["kind"], captcha: number) => TIMING.queueBudgetMs + TIMING.settleMs[kind] + TIMING.runSlackMs + captcha;
    expect(requestBudgetMs({ kind: "search" })).toBeGreaterThan(worst("search", TIMING.captchaWaitMs + TIMING.settleMs.search + 10_000));
    expect(requestBudgetMs({ kind: "health", quick: true })).toBeGreaterThan(worst("health", 0));
    expect(requestBudgetMs({ kind: "search", timeoutMs: 40_000 })).toBeGreaterThan(requestBudgetMs({ kind: "search" }));
    // Core: active budget below the bridge wait, hard cap above the whole extension worst case.
    expect(TIMING.perMarketActiveMs).toBeLessThan(requestBudgetMs({ kind: "search" }));
    expect(TIMING.perMarketHardCapMs).toBeGreaterThan(requestBudgetMs({ kind: "search" }));
  });
});
