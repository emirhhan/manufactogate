import { AdapterError, type MarketId } from "@manufactogate/core";
import { createRealAdapter, REAL_DEF_BY_ID, strategyOf, type ExtractFailure, type ExtractRequest, type ExtractResult, type PageRunner, type SearchItem, type SearchPayload } from "../src";

/** A scripted PageRunner: each call is answered by `script(req, callIndex)`; every request is recorded. */
function scripted(script: (req: ExtractRequest, n: number) => ExtractResult<unknown> | ExtractFailure) {
  const calls: ExtractRequest[] = [];
  const runner: PageRunner = {
    async run<T>(req: ExtractRequest) {
      calls.push(req);
      return script(req, calls.length - 1) as ExtractResult<T> | ExtractFailure;
    },
  };
  return { runner, calls };
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
