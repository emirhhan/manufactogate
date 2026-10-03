import { db, listingsForSearch } from "../src/lib/db";
import { setRegistryForTests } from "../src/lib/registry";
import { enrichInput, NO_MARKETS_MESSAGE, resetSearchSession, STORAGE_NOTE, useSearch } from "../src/store/search";
import { clearDb, fakeAdapter, flush, listing, registryOf, waitFor } from "./helpers";

beforeEach(async () => {
  await clearDb();
  resetSearchSession();
  useSearch.setState({ current: undefined, input: undefined, markets: {}, notes: {}, listings: {}, clusters: [], similar: [], running: false, cancelled: false, retrying: [], error: undefined, storageNote: undefined, abort: undefined });
  vi.restoreAllMocks();
});
afterEach(() => setRegistryForTests(null));

describe("enrichInput", () => {
  it("adds Chinese translations per market and keeps the Turkish query as a fallback", () => {
    const zh = fakeAdapter("cn-1688", { language: "zh" });
    const tr = fakeAdapter("tr-trendyol", { language: "tr", country: "tr", role: "target" });
    const out = enrichInput({ kind: "text", query: "kablosuz kulaklık" }, [zh, tr]);
    expect(out.kind).toBe("text");
    if (out.kind !== "text") return;
    expect(out.perMarket?.["cn-1688"]?.length).toBe(2);
    expect(out.perMarket?.["cn-1688"]?.[1]).toBe("kablosuz kulaklık");
    expect(out.perMarket?.["tr-trendyol"]).toBeUndefined();
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
