import type { MarketAdapter, MarketStatus, RawListing, SearchEvent } from "@manufactogate/core";
import { localizeQueryLadder, queryLadder } from "@manufactogate/adapters";
import { db, getSetting, listingsForSearch, setSetting } from "../src/lib/db";
import { browserFingerprinter } from "../src/lib/fingerprinter";
import { setRegistryForTests } from "../src/lib/registry";
import {
  applyTrace,
  CAPABILITY_MEMO_KEY,
  CAPABILITY_MEMO_TTL_MS,
  capabilityOverridesFrom,
  enrichInput,
  IMAGE_QUERY_LABEL,
  ladderOf,
  marketPriority,
  marketQueries,
  NO_MARKETS_MESSAGE,
  remainingMarkets,
  resetSearchSession,
  searchRunOptions,
  STORAGE_NOTE,
  useSearch,
  type CapabilityMemo,
  type MarketTrace,
} from "../src/store/search";
import { clearDb, fakeAdapter, flush, listing, registryOf, waitFor } from "./helpers";

const TR = /[çğıöşüÇĞİÖŞÜ]/;

beforeEach(async () => {
  await clearDb();
  resetSearchSession();
  useSearch.setState({ current: undefined, input: undefined, effective: undefined, resolved: undefined, markets: {}, notes: {}, noteCodes: {}, trace: {}, listings: [] as never, clusters: [], similar: [], running: false, cancelled: false, retrying: [], error: undefined, storageNote: undefined, abort: undefined, fingerprintPending: 0, capabilityMemo: {} });
  useSearch.setState({ listings: {} });
  vi.restoreAllMocks();
});
afterEach(() => setRegistryForTests(null));

/** Adapter with an image search that fails (or works) so the fallback/memo path can be driven. */
function imageAdapter(id: Parameters<typeof fakeAdapter>[0], opts: { imageFails?: boolean; results?: RawListing[]; language?: string } = {}): MarketAdapter & { calls: string[]; imageCalls: number } {
  const base = fakeAdapter(id, { ...(opts.results ? { results: opts.results } : {}), ...(opts.language ? { language: opts.language } : {}) });
  const a = base as MarketAdapter & { calls: string[]; imageCalls: number };
  a.imageCalls = 0;
  a.meta = { ...a.meta, capabilities: { ...a.meta.capabilities, imageSearch: true } };
  a.searchByImage = () => {
    a.imageCalls++;
    if (!opts.imageFails) return base.searchByText("image");
    // Real adapters fail inside the stream (the upload happens on first pull), not when called.
    return (async function* (): AsyncIterable<RawListing> {
      yield* [] as RawListing[];
      throw new Error("upload failed");
    })();
  };
  return a;
}

describe("enrichInput (translation ladder)", () => {
  it("builds the per-market ladder from localizeQueryLadder and never adds raw Turkish as a rung for non-Turkish markets", () => {
    const zh = fakeAdapter("cn-1688", { language: "zh" });
    const ja = fakeAdapter("jp-rakuten", { language: "ja", country: "jp" });
    const de = fakeAdapter("de-amazon", { language: "de", country: "de", role: "target" });
    const tr = fakeAdapter("tr-trendyol", { language: "tr", country: "tr", role: "target" });
    const out = enrichInput({ kind: "text", query: "kablosuz kulaklık" }, [zh, ja, de, tr]);
    expect(out.kind).toBe("text");
    if (out.kind !== "text") return;
    for (const a of [zh, ja, de]) {
      const rungs = out.perMarket?.[a.id];
      expect(rungs, a.id).toEqual(localizeQueryLadder("kablosuz kulaklık", a.meta.language).rungs);
      expect(rungs!.length).toBeGreaterThan(0);
      expect(rungs, `${a.id} got raw Turkish`).not.toContain("kablosuz kulaklık");
    }
    // Japanese and German markets get an English rung after the native one.
    expect(out.perMarket?.["jp-rakuten"]!.length).toBeGreaterThanOrEqual(2);
    expect(out.perMarket?.["de-amazon"]!.length).toBeGreaterThanOrEqual(2);
    // Turkish markets search the query as typed: no ladder entry.
    expect(out.perMarket?.["tr-trendyol"]).toBeUndefined();
    // Taxonomy category travels with the input so clustering can use it.
    expect(typeof out.category).toBe("string");
  });
  it("keeps the raw query only when the ladder itself falls back to it (untranslatable, no Turkish letters)", () => {
    const en = fakeAdapter("us-ebay", { language: "en", country: "us" });
    const out = enrichInput({ kind: "text", query: "HD9252/90" }, [en]);
    if (out.kind !== "text") return;
    expect(out.perMarket?.["us-ebay"] ?? ["HD9252/90"]).toContain("HD9252/90");
  });
  it("image inputs get the title ladder per market language", () => {
    const zh = fakeAdapter("cn-1688", { language: "zh" });
    const out = enrichInput({ kind: "image", image: { dataUrl: "data:," }, title: "Stanley termos 1 lt" }, [zh]);
    if (out.kind !== "image") return;
    expect(out.titles?.["cn-1688"]).toEqual(queryLadder("Stanley termos 1 lt", "zh"));
  });
});

describe("pure helpers", () => {
  it("marketPriority: wave-1 first, verified beta next, the rest last", () => {
    expect(marketPriority({ id: "cn-1688" })).toBe(0);
    expect(marketPriority({ id: "tr-trendyol" })).toBe(0);
    expect(marketPriority({ id: "us-ebay" })).toBe(1);
    expect(marketPriority({ id: "jp-rakuten" })).toBe(2);
    const order = [fakeAdapter("jp-rakuten"), fakeAdapter("us-ebay"), fakeAdapter("cn-1688")].map((a) => ({ a, p: marketPriority(a) })).sort((x, y) => x.p - y.p).map((x) => x.a.id);
    expect(order).toEqual(["cn-1688", "us-ebay", "jp-rakuten"]);
  });
  it("capabilityOverridesFrom drops expired memo entries", () => {
    const now = Date.now();
    const memo: CapabilityMemo = {
      "cn-1688": { imageSearch: false, at: new Date(now - 1000).toISOString() },
      "cn-taobao": { imageSearch: false, at: new Date(now - CAPABILITY_MEMO_TTL_MS - 1).toISOString() },
    };
    expect(capabilityOverridesFrom(memo, now)).toEqual({ "cn-1688": { imageSearch: false } });
  });
  it("searchRunOptions carries priority, the memo, the extension's timing budgets and the link hooks", () => {
    const a = imageAdapter("cn-1688");
    const o = searchRunOptions([a], { "cn-1688": { imageSearch: false, at: new Date().toISOString() } }, 150);
    expect(o.maxPerMarket).toBe(150);
    expect(o.priority).toBe(marketPriority);
    expect(o.capabilityOverrides).toEqual({ "cn-1688": { imageSearch: false } });
    expect(o.perMarketTimeoutMs).toBe(420_000);
    expect(o.perMarketHardCapMs).toBe(900_000);
    expect(o.ladder!("kablosuz kulaklık", a)).toEqual(queryLadder("kablosuz kulaklık", "zh"));
    expect(typeof o.categorize).toBe("function");
    // Image search disabled for every adapter: no image loader (the link would be searched by title).
    expect(o.imageLoader).toBeUndefined();
    expect(searchRunOptions([a], {}, 150).imageLoader).toBeTypeOf("function");
    expect(searchRunOptions([fakeAdapter("cn-1688")], {}, 150).imageLoader).toBeUndefined();
  });
  it("applyTrace folds phases, the deepest rung and note codes; marketQueries splits tried from untried", () => {
    const input = { kind: "text" as const, query: "kablosuz kulaklık", perMarket: { "cn-1688": ["无线 耳机", "wireless earbuds", "kablosuz kulaklık"] } };
    let t: Record<string, MarketTrace> = {};
    const ev = (status: MarketStatus): SearchEvent => ({ type: "market", market: "cn-1688", status });
    t = applyTrace(t, ev({ state: "pending" }));
    expect(t).toEqual({});
    t = applyTrace(t, ev({ state: "running", received: 0, phase: "image" }));
    t = applyTrace(t, ev({ state: "running", received: 0, phase: "text", rung: 0 }));
    t = applyTrace(t, { type: "note", market: "cn-1688", code: "ladder-next", rung: 1, note: "…" });
    t = applyTrace(t, { type: "note", market: "cn-1688", code: "ladder-next", rung: 1, note: "…" });
    t = applyTrace(t, ev({ state: "running", received: 3, phase: "text", rung: 1 }));
    t = applyTrace(t, ev({ state: "running", received: 9, phase: "text", rung: 1 }));
    expect(t["cn-1688"]).toEqual({ phases: ["image", "text"], rung: 1, codes: ["ladder-next"] });
    expect(marketQueries(input, "cn-1688", t["cn-1688"])).toEqual({ tried: [IMAGE_QUERY_LABEL, "无线 耳机", "wireless earbuds"], untried: ["kablosuz kulaklık"] });
    // No trace (history): nothing is claimed as sent.
    expect(marketQueries(input, "cn-1688")).toEqual({ tried: [], untried: ["无线 耳机", "wireless earbuds", "kablosuz kulaklık"] });
    expect(ladderOf(input, "tr-trendyol")).toEqual(["kablosuz kulaklık"]);
    expect(ladderOf(undefined, "x")).toEqual([]);
    // Unrelated events leave the object untouched (referential equality keeps React memos warm).
    expect(applyTrace(t, { type: "finished", durationMs: 1 })).toBe(t);
  });
  it("remainingMarkets lists cancelled markets and retryable errors only", () => {
    expect(
      remainingMarkets({
        a: { state: "done", received: 0, durationMs: 0, cancelled: true },
        b: { state: "error", type: "Network", message: "", retryable: true },
        c: { state: "error", type: "Captcha", message: "", retryable: false },
        d: { state: "done", received: 3, durationMs: 1 },
      }),
    ).toEqual(["a", "b"]);
  });
});

describe("useSearch.start", () => {
  it("streams listings, persists them through searchItems and finishes with status/durations", async () => {
    const a = fakeAdapter("cn-1688", { results: [listing("cn-1688", "x"), listing("cn-1688", "y")] });
    const b = fakeAdapter("tr-trendyol", { country: "tr", role: "target", language: "tr", results: [listing("tr-trendyol", "t1", { price: { currency: "TRY", tiers: [{ minQty: 1, unitPrice: 300 }] } })] });
    setRegistryForTests(registryOf(a, b));
    const id = await useSearch.getState().start({ kind: "text", query: "kulaklık" }, ["cn-1688", "tr-trendyol"]);
    expect(useSearch.getState().running).toBe(true);
    await waitFor(() => !useSearch.getState().running);
    const s = useSearch.getState();
    expect(s.error).toBeUndefined();
    expect(s.listings["cn-1688"]?.map((l) => l.id)).toEqual(["x", "y"]);
    expect(s.current?.status).toBe("done");
    expect(s.current?.resultCount).toBe(3);
    expect(s.current?.marketStatus?.["cn-1688"]?.state).toBe("done");
    expect(typeof s.durationMs).toBe("number");
    // The Chinese market was asked with the translated query first.
    expect(a.calls[0]).not.toBe("kulaklık");
    await flush(50);
    expect((await listingsForSearch(id)).length).toBe(3);
    expect(await db.listings.count()).toBe(3);
  });

  it("refuses an empty market list with a visible error instead of an empty results page", async () => {
    setRegistryForTests(registryOf());
    const id = await useSearch.getState().start({ kind: "text", query: "x" }, []);
    const s = useSearch.getState();
    expect(s.running).toBe(false);
    expect(s.error).toBe(NO_MARKETS_MESSAGE);
    expect((await db.searches.get(id))?.status).toBe("error");
  });

  it("a storage failure does not leave running=true and is surfaced as a note", async () => {
    setRegistryForTests(registryOf(fakeAdapter("cn-1688")));
    vi.spyOn(db.searches, "put").mockRejectedValue(new Error("QuotaExceededError"));
    await useSearch.getState().start({ kind: "text", query: "x" }, ["cn-1688"]);
    await waitFor(() => !useSearch.getState().running);
    const s = useSearch.getState();
    expect(s.storageNote).toBe(STORAGE_NOTE);
    expect(s.listings["cn-1688"]?.length).toBe(2);
  });

  it("cancel finalises the record and marks unfinished markets as cancelled", async () => {
    setRegistryForTests(registryOf(fakeAdapter("cn-1688", { delayMs: 500 })));
    const id = await useSearch.getState().start({ kind: "text", query: "x" }, ["cn-1688"]);
    await flush(20);
    useSearch.getState().cancel();
    const s = useSearch.getState();
    expect(s.running).toBe(false);
    expect(s.cancelled).toBe(true);
    const st = s.markets["cn-1688"];
    expect(st?.state === "done" && st.cancelled).toBe(true);
    await flush(50);
    expect((await db.searches.get(id))?.status).toBe("cancelled");
  });

  it("retryMarket reuses the enriched input, persists listings and re-clusters", async () => {
    const flaky = fakeAdapter("cn-1688", { fail: new Error("boom") });
    setRegistryForTests(registryOf(flaky));
    const id = await useSearch.getState().start({ kind: "text", query: "kulaklık" }, ["cn-1688"]);
    await waitFor(() => !useSearch.getState().running);
    expect(useSearch.getState().markets["cn-1688"]?.state).toBe("error");
    // Now the market works.
    flaky.calls.length = 0;
    delete (flaky as unknown as { fail?: Error }).fail;
    const ok = fakeAdapter("cn-1688", { results: [listing("cn-1688", "r1")] });
    setRegistryForTests(registryOf(ok));
    await useSearch.getState().retryMarket("cn-1688");
    const s = useSearch.getState();
    expect(s.markets["cn-1688"]?.state).toBe("done");
    expect(s.listings["cn-1688"]?.map((l) => l.id)).toEqual(["r1"]);
    expect(ok.calls[0]).not.toBe("kulaklık"); // translated query, not the raw Turkish one
    expect((await listingsForSearch(id)).map((l) => l.id)).toEqual(["r1"]);
    expect(s.retrying).toEqual([]);
  });

  it("load restores market order, statuses and duration from the record", async () => {
    setRegistryForTests(registryOf(fakeAdapter("cn-1688", { results: [listing("cn-1688", "z"), listing("cn-1688", "a")] })));
    const id = await useSearch.getState().start({ kind: "text", query: "x" }, ["cn-1688"]);
    await waitFor(() => !useSearch.getState().running);
    await flush(50);
    useSearch.setState({ current: undefined, listings: {}, markets: {}, durationMs: 999 });
    await useSearch.getState().load(id);
    const s = useSearch.getState();
    expect(s.listings["cn-1688"]?.map((l) => l.id)).toEqual(["z", "a"]);
    expect(s.markets["cn-1688"]?.state).toBe("done");
    expect(s.durationMs).not.toBe(999);
    expect(s.current?.id).toBe(id);
  });

  it("sends the ladder rungs in order and records the rung actually used per market", async () => {
    // Needs a second rung: the first query returns too little, so the orchestrator walks the ladder.
    const calls: string[] = [];
    const ja = fakeAdapter("jp-rakuten", { language: "ja", country: "jp", results: [listing("jp-rakuten", "r1")] });
    ja.searchByText = (q) => {
      calls.push(q);
      return (async function* () {
        if (calls.length === 1) yield listing("jp-rakuten", "r1");
        else for (let i = 0; i < 6; i++) yield listing("jp-rakuten", `r${i + 10}`);
      })();
    };
    setRegistryForTests(registryOf(ja));
    await useSearch.getState().start({ kind: "text", query: "kablosuz kulaklık" }, ["jp-rakuten"]);
    await waitFor(() => !useSearch.getState().running);
    const s = useSearch.getState();
    const expected = localizeQueryLadder("kablosuz kulaklık", "ja").rungs;
    expect(expected.length).toBeGreaterThanOrEqual(2);
    expect(calls).toEqual(expected.slice(0, 2));
    expect(calls.some((q) => TR.test(q))).toBe(false);
    expect(s.trace["jp-rakuten"]?.rung).toBe(1);
    expect(s.trace["jp-rakuten"]?.codes).toContain("ladder-next");
    expect(s.noteCodes["jp-rakuten"]).toBe("ladder-next");
    expect(marketQueries(s.effective, "jp-rakuten", s.trace["jp-rakuten"]).tried).toEqual(expected.slice(0, 2));
    expect(s.effective).toEqual(s.input);
  });

  it("runs wave-1 markets before verified and other markets", async () => {
    const order: string[] = [];
    const mk = (id: Parameters<typeof fakeAdapter>[0]) => {
      const a = fakeAdapter(id, { results: [listing(id, "1")] });
      const inner = a.searchByText;
      a.searchByText = (q, o) => {
        order.push(id);
        return inner(q, o);
      };
      return a;
    };
    setRegistryForTests(registryOf(mk("jp-rakuten"), mk("us-ebay"), mk("cn-1688")));
    await useSearch.getState().start({ kind: "text", query: "kulaklık" }, ["jp-rakuten", "us-ebay", "cn-1688"]);
    await waitFor(() => !useSearch.getState().running);
    expect(order).toEqual(["cn-1688", "us-ebay", "jp-rakuten"]);
  });

  it("remembers a failed image search in the memo and skips the upload next time; a retry gives it another chance", async () => {
    const flaky = imageAdapter("cn-1688", { imageFails: true });
    setRegistryForTests(registryOf(flaky));
    const img = { kind: "image" as const, image: { dataUrl: "data:," }, title: "Stanley termos" };
    await useSearch.getState().start(img, ["cn-1688"]);
    await waitFor(() => !useSearch.getState().running);
    let s = useSearch.getState();
    expect(flaky.imageCalls).toBe(1);
    expect(s.trace["cn-1688"]?.codes).toContain("image-fallback");
    expect(s.capabilityMemo["cn-1688"]?.imageSearch).toBe(false);
    expect(s.trace["cn-1688"]?.phases).toEqual(["image", "text"]);
    expect(s.markets["cn-1688"]?.state).toBe("done");
    expect((await getSetting<CapabilityMemo>(CAPABILITY_MEMO_KEY, {}))["cn-1688"]?.imageSearch).toBe(false);

    // Second search: the memo turns into capabilityOverrides and the market goes straight to the title ladder.
    await useSearch.getState().start(img, ["cn-1688"]);
    await waitFor(() => !useSearch.getState().running);
    s = useSearch.getState();
    expect(flaky.imageCalls).toBe(1);
    expect(s.trace["cn-1688"]?.codes[0]).toBe("no-image-search");
    expect(s.trace["cn-1688"]?.codes).not.toContain("image-fallback");
    expect(s.trace["cn-1688"]?.phases).toEqual(["text"]);
    expect(s.listings["cn-1688"]?.length).toBe(2);

    // An explicit retry ignores the memo; a working image search clears it.
    const fixed = imageAdapter("cn-1688", { results: [listing("cn-1688", "i1")] });
    setRegistryForTests(registryOf(fixed));
    await useSearch.getState().retryMarket("cn-1688");
    s = useSearch.getState();
    expect(fixed.imageCalls).toBe(1);
    expect(s.trace["cn-1688"]?.phases).toEqual(["image"]);
    expect(s.capabilityMemo["cn-1688"]).toBeUndefined();
    expect(s.listings["cn-1688"]?.map((l) => l.id)).toEqual(["i1"]);
  });

  it("loads the persisted memo before the first search", async () => {
    await setSetting(CAPABILITY_MEMO_KEY, { "cn-1688": { imageSearch: false, at: new Date().toISOString() } });
    const a = imageAdapter("cn-1688");
    setRegistryForTests(registryOf(a));
    await useSearch.getState().start({ kind: "image", image: { dataUrl: "data:," }, title: "termos" }, ["cn-1688"]);
    await waitFor(() => !useSearch.getState().running);
    expect(a.imageCalls).toBe(0);
    expect(useSearch.getState().capabilityMemo["cn-1688"]?.imageSearch).toBe(false);
  });

  it("link input: resolves on the owning market, fans out the title ladder and exposes resolved/effective", async () => {
    const owner = fakeAdapter("tr-trendyol", { language: "tr", country: "tr", role: "target", results: [] });
    owner.resolveLink = (url) => (url.includes("trendyol") ? { market: "tr-trendyol", listingId: "963258390", canonicalUrl: url } : null);
    owner.fetchListing = async (lid) => ({ ...listing("tr-trendyol", lid, { title: "Stanley termos 1 lt", images: ["https://img/x.jpg"], price: { currency: "TRY", tiers: [{ minQty: 1, unitPrice: 900 }] } }), attributes: {} });
    const zh = fakeAdapter("cn-1688", { results: [listing("cn-1688", "c1")] });
    setRegistryForTests(registryOf(owner, zh));
    // The resolved listing has an image; keep the fingerprint pool off the network.
    vi.spyOn(browserFingerprinter, "forListing").mockResolvedValue({ title: "Stanley termos 1 lt" });
    const url = "https://www.trendyol.com/x/kask-p-963258390";
    const id = await useSearch.getState().start({ kind: "link", url }, ["tr-trendyol", "cn-1688"]);
    await waitFor(() => !useSearch.getState().running);
    const s = useSearch.getState();
    expect(s.input?.kind).toBe("link");
    expect(s.resolved?.market).toBe("tr-trendyol");
    expect(s.resolved?.listing.title).toBe("Stanley termos 1 lt");
    expect(s.effective?.kind).toBe("text");
    if (s.effective?.kind !== "text") return;
    expect(s.effective.query).toBe("Stanley termos 1 lt");
    expect(s.effective.perMarket?.["cn-1688"]).toEqual(queryLadder("Stanley termos 1 lt", "zh"));
    expect(zh.calls[0]).toBe(queryLadder("Stanley termos 1 lt", "zh")[0]);
    expect(s.current?.thumb).toBe("https://img/x.jpg");
    expect(s.markets["tr-trendyol"]?.state).toBe("done");
    expect(s.listings["cn-1688"]?.length).toBe(1);
    expect((await db.searches.get(id))?.input.kind).toBe("link");
  });

  it("the compare flow from a listing (own market list, image input) keeps priority and overrides", async () => {
    useSearch.setState({ capabilityMemo: { "cn-taobao": { imageSearch: false, at: new Date().toISOString() } } });
    const taobao = imageAdapter("cn-taobao");
    const ali = imageAdapter("cn-1688", { results: [listing("cn-1688", "a1")] });
    const tr = fakeAdapter("tr-trendyol", { language: "tr", country: "tr", role: "target" });
    setRegistryForTests(registryOf(taobao, ali, tr));
    await useSearch.getState().start({ kind: "image", image: { dataUrl: "data:," }, title: "Stanley termos" }, ["cn-taobao", "cn-1688", "tr-trendyol"], "data:,", "tr-trendyol:1");
    await waitFor(() => !useSearch.getState().running);
    const s = useSearch.getState();
    expect(taobao.imageCalls).toBe(0);
    expect(ali.imageCalls).toBe(1);
    expect(s.current?.sourceKey).toBe("tr-trendyol:1");
    expect(s.current?.markets).toEqual(["cn-taobao", "cn-1688", "tr-trendyol"]);
    expect(Object.keys(s.markets).sort()).toEqual(["cn-1688", "cn-taobao", "tr-trendyol"]);
    expect(s.fingerprintPending).toBe(0);
  });

  it("retryRemaining retries cancelled and retryable-error markets only", async () => {
    setRegistryForTests(registryOf(fakeAdapter("cn-1688")));
    await useSearch.getState().start({ kind: "text", query: "x" }, ["cn-1688"]);
    await waitFor(() => !useSearch.getState().running);
    useSearch.setState({ markets: { "cn-1688": { state: "done", received: 0, durationMs: 0, cancelled: true }, "cn-taobao": { state: "error", type: "Captcha", message: "", retryable: false } } });
    await useSearch.getState().retryRemaining();
    const s = useSearch.getState();
    expect(s.markets["cn-1688"]?.state).toBe("done");
    expect(s.markets["cn-taobao"]?.state).toBe("error");
  });
});
