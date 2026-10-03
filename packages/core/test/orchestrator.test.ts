import {
  AdapterError,
  runSearch,
  slugFromUrl,
  toAdapterError,
  type Fingerprinter,
  type MarketAdapter,
  type MarketId,
  type RawListing,
  type RawListingDetail,
  type SearchEvent,
} from "../src";

const mk = (market: MarketId, id: string, title: string): RawListing => ({
  market,
  id,
  url: `https://${market}/${id}`,
  title,
  images: [],
  price: { currency: "CNY", tiers: [{ minQty: 1, unitPrice: 10 }] },
  badges: [],
  fetchedAt: "2026-01-01T00:00:00Z",
});

interface FakeOpts {
  id: MarketId;
  language?: string;
  imageSearch?: boolean;
  /** Query → listings (missing query → []). */
  results?: Record<string, RawListing[]>;
  imageResults?: RawListing[] | Error;
  throwOn?: Record<string, Error>;
  delayMs?: number;
  hang?: boolean;
  owns?: string;
  detail?: RawListingDetail | Error;
  log?: string[];
}

function fakeAdapter(o: FakeOpts): MarketAdapter & { calls: string[] } {
  const calls: string[] = o.log ?? [];
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  return {
    calls,
    id: o.id,
    meta: {
      name: o.id,
      country: o.id.split("-")[0]!,
      currency: "CNY",
      language: o.language ?? "zh",
      role: "source",
      capabilities: { imageSearch: o.imageSearch ?? false, textSearch: true, linkResolve: !!o.owns, supplierProfile: false, priceTiers: false },
      rateLimit: { minIntervalMs: 0, maxPerHour: 1000 },
      version: "test",
      hosts: [],
    },
    badgeMap: {},
    session: async () => "logged-in",
    resolveLink: (url) => (o.owns && url.includes(o.owns) ? { market: o.id, listingId: "L1", canonicalUrl: url } : null),
    async *searchByImage() {
      calls.push("image");
      if (o.hang) await new Promise(() => undefined);
      if (o.imageResults instanceof Error) throw o.imageResults;
      for (const l of o.imageResults ?? []) yield l;
    },
    async *searchByText(query) {
      calls.push(`text:${query}`);
      if (o.hang) await new Promise(() => undefined);
      if (o.throwOn?.[query]) throw o.throwOn[query];
      for (const l of o.results?.[query] ?? []) {
        if (o.delayMs) await sleep(o.delayMs);
        yield l;
      }
    },
    async fetchListing() {
      calls.push("detail");
      if (o.detail instanceof Error) throw o.detail;
      if (o.detail) return o.detail;
      throw new AdapterError("NotFound", o.id);
    },
    async fetchSupplier() {
      throw new Error("no");
    },
    async healthCheck() {
      return { ok: true, checkedAt: "" };
    },
  };
}

const fp: Fingerprinter = {
  forQuery: async (input, resolvedTitle) => {
    const title = input.kind === "text" ? input.query : input.kind === "image" ? input.title : resolvedTitle;
    return title ? { title } : {};
  },
  forListing: async (l) => ({ title: l.title }),
};

async function collect(gen: AsyncGenerator<SearchEvent>, stopAfter?: (e: SearchEvent) => boolean): Promise<SearchEvent[]> {
  const out: SearchEvent[] = [];
  for await (const e of gen) {
    out.push(e);
    if (stopAfter?.(e)) break;
  }
  return out;
}
const statuses = (events: SearchEvent[], market: MarketId) => events.filter((e): e is Extract<SearchEvent, { type: "market" }> => e.type === "market" && e.market === market).map((e) => e.status);
const notes = (events: SearchEvent[], market?: MarketId) => events.filter((e): e is Extract<SearchEvent, { type: "note" }> => e.type === "note" && (!market || e.market === market));
const quick = { reclusterIntervalMs: 0, fingerprintGraceMs: 50 };

describe("runSearch", () => {
  it("(a) starts with pending for every market and ends with exactly one finished", async () => {
    const a = fakeAdapter({ id: "cn-a", results: { q: [mk("cn-a", "1", "q one")] } });
    const b = fakeAdapter({ id: "cn-b", results: { q: [] } });
    const events = await collect(runSearch({ kind: "text", query: "q" }, [a, b], fp, quick));
    expect(events.slice(0, 2).map((e) => e.type)).toEqual(["market", "market"]);
    expect(events.slice(0, 2).every((e) => e.type === "market" && e.status.state === "pending")).toBe(true);
    expect(events.filter((e) => e.type === "finished")).toHaveLength(1);
    expect(events.at(-1)!.type).toBe("finished");
    expect(statuses(events, "cn-a").at(-1)).toMatchObject({ state: "done", received: 1 });
    expect(statuses(events, "cn-b").at(-1)).toMatchObject({ state: "done", received: 0 });
    expect(events.filter((e) => e.type === "clusters").length).toBeGreaterThanOrEqual(1);
  });

  it("(b) walks the ladder when a rung returns too little, dedupes across rungs and notes it", async () => {
    const a = fakeAdapter({ id: "cn-a", results: { r0: [], r1: [mk("cn-a", "1", "x"), mk("cn-a", "2", "y"), mk("cn-a", "3", "z")], r2: [mk("cn-a", "3", "z"), mk("cn-a", "4", "w")] } });
    const events = await collect(runSearch({ kind: "text", query: "q", perMarket: { "cn-a": ["r0", "r1", "r2"] } }, [a], fp, { ...quick, ladderMinResults: 5 }));
    expect(a.calls).toEqual(["text:r0", "text:r1", "text:r2"]);
    expect(events.filter((e) => e.type === "listing")).toHaveLength(4);
    const n = notes(events, "cn-a");
    expect(n.map((x) => x.code)).toEqual(["ladder-next", "ladder-next"]);
    expect(n[0]!.note).toBe('"r0" sonuç vermedi, "r1" ile arandı');
    expect(n[1]!.rung).toBe(2);
    expect(statuses(events, "cn-a").some((s) => s.state === "running" && s.phase === "text" && s.rung === 1)).toBe(true);
  });

  it("(b2) stops the ladder once enough results arrived", async () => {
    const a = fakeAdapter({ id: "cn-a", results: { r0: [mk("cn-a", "1", "x"), mk("cn-a", "2", "y")], r1: [mk("cn-a", "3", "z")] } });
    await collect(runSearch({ kind: "text", query: "q", perMarket: { "cn-a": ["r0", "r1"] } }, [a], fp, { ...quick, ladderMinResults: 2 }));
    expect(a.calls).toEqual(["text:r0"]);
  });

  it("(c) image search failures fall back to the title ladder; LoggedOut/Captcha are not swallowed", async () => {
    const broken = fakeAdapter({ id: "cn-a", imageSearch: true, imageResults: new AdapterError("SelectorBroken", "cn-a", "no upload widget"), results: { t: [mk("cn-a", "1", "x")] } });
    const out = fakeAdapter({ id: "cn-b", imageSearch: true, imageResults: new AdapterError("LoggedOut", "cn-b"), results: { t: [mk("cn-b", "1", "x")] } });
    const empty = fakeAdapter({ id: "cn-c", imageSearch: true, imageResults: [], results: { t: [mk("cn-c", "1", "x")] } });
    const input = { kind: "image" as const, image: { dataUrl: "data:," }, title: "t" };
    const events = await collect(runSearch(input, [broken, out, empty], fp, quick));
    expect(broken.calls).toEqual(["image", "text:t"]);
    expect(notes(events, "cn-a")[0]).toMatchObject({ code: "image-fallback" });
    expect(statuses(events, "cn-a").at(-1)).toMatchObject({ state: "done", received: 1 });
    expect(out.calls).toEqual(["image"]);
    expect(statuses(events, "cn-b").at(-1)).toMatchObject({ state: "error", type: "LoggedOut" });
    expect(empty.calls).toEqual(["image", "text:t"]);
    expect(notes(events, "cn-c")[0]).toMatchObject({ code: "image-empty" });
    expect(statuses(events, "cn-c").some((s) => s.state === "running" && s.phase === "image")).toBe(true);
  });

  it("(c2) markets without image search and health overrides use the title ladder with a structured note", async () => {
    const none = fakeAdapter({ id: "tr-a", language: "tr", results: { t: [mk("tr-a", "1", "x")] } });
    const memo = fakeAdapter({ id: "cn-b", imageSearch: true, imageResults: [mk("cn-b", "9", "img")], results: { t: [mk("cn-b", "1", "x")] } });
    const events = await collect(runSearch({ kind: "image", image: { dataUrl: "data:," }, title: "t" }, [none, memo], fp, { ...quick, capabilityOverrides: { "cn-b": { imageSearch: false } } }));
    expect(none.calls).toEqual(["text:t"]);
    expect(notes(events, "tr-a")[0]).toMatchObject({ code: "no-image-search", note: "görselle arama yok, başlıkla arandı" });
    expect(memo.calls).toEqual(["text:t"]);
    expect(notes(events, "cn-b")[0]!.note).toContain("çalışmıyor");
  });

  it("(c4) a photo-only search gives markets without image search the image result's title", async () => {
    const img = fakeAdapter({ id: "cn-b", imageSearch: true, imageResults: [mk("cn-b", "9", "保温杯")] });
    const tr = fakeAdapter({ id: "tr-a", language: "tr", results: { 保温杯: [mk("tr-a", "1", "termos")] } });
    const events = await collect(runSearch({ kind: "image", image: { dataUrl: "data:," } }, [tr, img], fp, { ...quick, ladder: (t) => [t] }));
    expect(tr.calls).toEqual(["text:保温杯"]);
    expect(notes(events, "tr-a")[0]).toMatchObject({ code: "image-title" });
    expect(statuses(events, "tr-a").at(-1)).toMatchObject({ state: "done", received: 1 });
  });

  it("(c5) the borrowed title is the one most image results agree on", async () => {
    const img = fakeAdapter({ id: "cn-b", imageSearch: true, imageResults: [mk("cn-b", "1", "SKT STY 2026"), mk("cn-b", "2", "hermes kelly leather bag"), mk("cn-b", "3", "hermes kelly bag 28")] });
    const tr = fakeAdapter({ id: "tr-a", language: "tr", results: {} });
    await collect(runSearch({ kind: "image", image: { dataUrl: "data:," } }, [tr, img], fp, { ...quick, ladder: (t) => [t] }));
    expect(tr.calls[0]).toMatch(/hermes kelly/);
  });

  it("(c6) a named product feeds text markets at once, in their language first, and is announced", async () => {
    const tr = fakeAdapter({ id: "tr-a", language: "tr", results: { "Hermes çanta": [mk("tr-a", "1", "Hermes çanta")] } });
    const zh = fakeAdapter({ id: "cn-z", language: "zh", results: { "爱马仕 包": [mk("cn-z", "2", "爱马仕 包")] } });
    const identify = async () => ({ title: "Hermes çanta", queries: { zh: "爱马仕 包" }, source: "local" as const, confidence: 0.8 });
    const events = await collect(runSearch({ kind: "image", image: { dataUrl: "data:," } }, [tr, zh], fp, { ...quick, ladder: (t) => [t], identify }));
    expect(tr.calls).toEqual(["text:Hermes çanta"]);
    expect(zh.calls[0]).toBe("text:爱马仕 包");
    expect(events.find((e) => e.type === "identity")).toMatchObject({ identity: { title: "Hermes çanta", source: "local" } });
    expect(notes(events, "tr-a")[0]).toMatchObject({ code: "image-title" });
    expect(notes(events, "tr-a")[0]!.note).toContain("tanındı");
  });

  it("(c7) an image market whose image search finds nothing searches by the named product", async () => {
    const img = fakeAdapter({ id: "cn-b", imageSearch: true, imageResults: [], results: { termos: [mk("cn-b", "1", "termos")] } });
    const identify = async () => ({ title: "termos", source: "local" as const });
    const events = await collect(runSearch({ kind: "image", image: { dataUrl: "data:," } }, [img], fp, { ...quick, ladder: (t) => [t], identify }));
    expect(img.calls).toEqual(["image", "text:termos"]);
    expect(statuses(events, "cn-b").at(-1)).toMatchObject({ state: "done", received: 1 });
  });

  it("(c8) without a name (null, error or timeout) text markets fall back to the image results' titles", async () => {
    for (const identify of [async () => null, async () => Promise.reject(new Error("model")), () => new Promise<never>(() => undefined)]) {
      const img = fakeAdapter({ id: "cn-b", imageSearch: true, imageResults: [mk("cn-b", "9", "hermes kelly bag"), mk("cn-b", "8", "hermes kelly bag 28")] });
      const tr = fakeAdapter({ id: "tr-a", language: "tr", results: {} });
      const events = await collect(runSearch({ kind: "image", image: { dataUrl: "data:," } }, [tr, img], fp, { ...quick, ladder: (t) => [t], identify, identifyTimeoutMs: 50 }));
      expect(tr.calls[0]).toMatch(/hermes kelly/);
      expect(events.some((e) => e.type === "identity")).toBe(false);
    }
  });

  it("(c9) a title from the user is never replaced by a guess", async () => {
    let asked = false;
    const tr = fakeAdapter({ id: "tr-a", language: "tr", results: { termos: [mk("tr-a", "1", "termos")] } });
    const identify = async () => {
      asked = true;
      return { title: "kupa", source: "local" as const };
    };
    await collect(runSearch({ kind: "image", image: { dataUrl: "data:," }, title: "termos" }, [tr], fp, { ...quick, ladder: (t) => [t], identify }));
    expect(asked).toBe(false);
    expect(tr.calls).toEqual(["text:termos"]);
  });

  it("(c3) a remembered image failure does not block a photo-only search", async () => {
    const memo = fakeAdapter({ id: "cn-b", imageSearch: true, imageResults: [mk("cn-b", "9", "img")] });
    const events = await collect(runSearch({ kind: "image", image: { dataUrl: "data:," } }, [memo], fp, { ...quick, capabilityOverrides: { "cn-b": { imageSearch: false } } }));
    expect(memo.calls).toEqual(["image"]);
    expect(statuses(events, "cn-b").at(-1)).toMatchObject({ state: "done", received: 1 });
  });

  it("(d) abort ends every market as cancelled and finishes within 50 ms", async () => {
    const slow = fakeAdapter({ id: "cn-a", results: { q: [mk("cn-a", "1", "x"), mk("cn-a", "2", "y"), mk("cn-a", "3", "z")] }, delayMs: 30 });
    const hung = fakeAdapter({ id: "cn-b", hang: true });
    const queued = fakeAdapter({ id: "cn-c", results: { q: [mk("cn-c", "1", "x")] } });
    const ac = new AbortController();
    const gen = runSearch({ kind: "text", query: "q" }, [slow, hung, queued], fp, { ...quick, signal: ac.signal, concurrency: 2 });
    const events: SearchEvent[] = [];
    let abortedAt = 0;
    for await (const e of gen) {
      events.push(e);
      if (e.type === "listing" && !abortedAt) {
        abortedAt = Date.now();
        ac.abort();
      }
    }
    const fin = events.at(-1)!;
    expect(fin).toMatchObject({ type: "finished", cancelled: true });
    expect(Date.now() - abortedAt).toBeLessThan(50);
    for (const m of ["cn-a", "cn-b", "cn-c"] as MarketId[]) expect(statuses(events, m).at(-1)).toMatchObject({ state: "done", cancelled: true });
    expect(events.filter((e) => e.type === "listing").length).toBeLessThan(3);
  });

  it("(e) a hanging market times out while the others finish", async () => {
    const hung = fakeAdapter({ id: "cn-a", hang: true });
    const ok = fakeAdapter({ id: "cn-b", results: { q: [mk("cn-b", "1", "x")] } });
    const events = await collect(runSearch({ kind: "text", query: "q" }, [hung, ok], fp, { ...quick, perMarketTimeoutMs: 40 }));
    expect(statuses(events, "cn-a").at(-1)).toMatchObject({ state: "error", type: "Timeout", retryable: true });
    expect(statuses(events, "cn-b").at(-1)).toMatchObject({ state: "done", received: 1 });
    expect(events.at(-1)!.type).toBe("finished");
  });

  it("(f) TypeErrors are Internal, not Network; fingerprint failures do not fail the market", async () => {
    const bug = fakeAdapter({ id: "cn-a", throwOn: { q: new TypeError("Cannot read properties of undefined") } });
    const net = fakeAdapter({ id: "cn-b", throwOn: { q: new Error("fetch failed") } });
    const ok = fakeAdapter({ id: "cn-c", results: { q: [mk("cn-c", "1", "x"), mk("cn-c", "2", "y")] } });
    const badFp: Fingerprinter = { ...fp, forListing: async () => { throw new TypeError("decode"); } };
    const events = await collect(runSearch({ kind: "text", query: "q" }, [bug, net, ok], badFp, quick));
    expect(statuses(events, "cn-a").at(-1)).toMatchObject({ state: "error", type: "Internal" });
    expect(statuses(events, "cn-b").at(-1)).toMatchObject({ state: "error", type: "Network" });
    expect(statuses(events, "cn-c").at(-1)).toMatchObject({ state: "done", received: 2 });
    expect(notes(events, "cn-c").filter((n) => n.code === "fingerprint-failed")).toHaveLength(1);
    expect(toAdapterError(new RangeError("x"), "cn-z").type).toBe("Internal");
  });

  it("(f2) a failing query fingerprint degrades to text matching instead of killing the search", async () => {
    const ok = fakeAdapter({ id: "cn-c", results: { q: [mk("cn-c", "1", "q item")] } });
    const badFp: Fingerprinter = { ...fp, forQuery: async () => { throw new Error("image decode"); } };
    const events = await collect(runSearch({ kind: "text", query: "q" }, [ok], badFp, quick));
    expect(events.find((e) => e.type === "warning")).toMatchObject({ code: "query-fingerprint-failed" });
    expect(statuses(events, "cn-c").at(-1)).toMatchObject({ state: "done", received: 1 });
    const clusters = events.filter((e): e is Extract<SearchEvent, { type: "clusters" }> => e.type === "clusters").at(-1)!;
    expect(clusters.clusters.length + clusters.similar.length).toBeGreaterThan(0);
  });

  it("(g) respects maxPerMarket and dedupes listings", async () => {
    const many = fakeAdapter({ id: "cn-a", results: { q: Array.from({ length: 10 }, (_, i) => mk("cn-a", String(i), `item ${i}`)).concat([mk("cn-a", "0", "dup")]) } });
    const events = await collect(runSearch({ kind: "text", query: "q" }, [many], fp, { ...quick, maxPerMarket: 4 }));
    expect(events.filter((e) => e.type === "listing")).toHaveLength(4);
    expect(statuses(events, "cn-a").at(-1)).toMatchObject({ state: "done", received: 4 });
  });

  it("(h) a link resolves on its owner and fans out to the other markets with the ladder hook", async () => {
    const detail: RawListingDetail = { ...mk("cn-own", "L1", "Arai RX7 摩托车头盔"), images: ["https://img/1.jpg"] };
    const owner = fakeAdapter({ id: "cn-own", owns: "1688.com", detail });
    const other = fakeAdapter({ id: "tr-x", language: "tr", results: { "Arai RX7 Motosiklet Kaskı": [mk("tr-x", "1", "Arai RX7 kask")] } });
    const events = await collect(
      runSearch({ kind: "link", url: "https://detail.1688.com/offer/123.html" }, [owner, other], fp, {
        ...quick,
        ladder: (title, a) => (a.meta.language === "tr" ? ["Arai RX7 Motosiklet Kaskı", "Motosiklet Kaskı"] : [title]),
      }),
    );
    expect(owner.calls).toEqual(["detail"]);
    expect(statuses(events, "cn-own").some((s) => s.state === "running" && s.phase === "detail")).toBe(true);
    expect(statuses(events, "cn-own").at(-1)).toMatchObject({ state: "done", received: 1 });
    const resolved = events.find((e): e is Extract<SearchEvent, { type: "resolved" }> => e.type === "resolved")!;
    expect(resolved.listing.id).toBe("L1");
    expect(resolved.input).toMatchObject({ kind: "text", query: "Arai RX7 摩托车头盔" });
    expect(other.calls[0]).toBe("text:Arai RX7 Motosiklet Kaskı");
    expect(statuses(events, "tr-x").at(-1)).toMatchObject({ state: "done", received: 1 });
    // The owner listing and the target hit end up in one cluster.
    const clusters = events.filter((e): e is Extract<SearchEvent, { type: "clusters" }> => e.type === "clusters").at(-1)!;
    expect(clusters.clusters[0]!.members.map((m) => m.listing.market).sort()).toEqual(["cn-own", "tr-x"]);
  });

  it("(h2) uses the image loader when it yields an image, and degrades to the URL slug when the detail fails", async () => {
    const detail: RawListingDetail = { ...mk("cn-own", "L1", "Arai RX7 摩托车头盔"), images: ["https://img/1.jpg"] };
    const owner = fakeAdapter({ id: "cn-own", owns: "1688.com", detail });
    const img = fakeAdapter({ id: "cn-img", imageSearch: true, imageResults: [mk("cn-img", "1", "x")] });
    const ev1 = await collect(runSearch({ kind: "link", url: "https://detail.1688.com/offer/123.html" }, [owner, img], fp, { ...quick, imageLoader: async () => ({ dataUrl: "data:," }) }));
    expect(ev1.find((e) => e.type === "resolved")).toMatchObject({ input: { kind: "image", title: "Arai RX7 摩托车头盔" } });
    expect(img.calls).toEqual(["image"]);

    const failing = fakeAdapter({ id: "cn-own", owns: "1688.com", detail: new AdapterError("SelectorBroken", "cn-own") });
    const other = fakeAdapter({ id: "us-x", language: "en", results: { "arai rx7 helmet": [mk("us-x", "1", "x")] } });
    const ev2 = await collect(runSearch({ kind: "link", url: "https://detail.1688.com/offer/arai-rx7-helmet-123456.html" }, [failing, other], fp, quick));
    expect(statuses(ev2, "cn-own").at(-1)).toMatchObject({ state: "error", type: "SelectorBroken" });
    expect(notes(ev2, "cn-own")[0]).toMatchObject({ code: "link-degraded" });
    expect(other.calls).toEqual(["text:arai rx7 helmet"]);

    const nobody = fakeAdapter({ id: "us-y", language: "en", results: { "some product": [] } });
    const ev3 = await collect(runSearch({ kind: "link", url: "https://unknown.example/p/some-product" }, [nobody], fp, quick));
    expect(ev3.find((e) => e.type === "warning")).toMatchObject({ code: "link-unresolved" });
    expect(nobody.calls).toEqual(["text:some product"]);
    expect(slugFromUrl("https://www.trendyol.com/ls2/rapid-2-kask-p-12345678")).toBe("rapid 2 kask p");
  });

  it("(i) runs at most `concurrency` markets at once, in priority order", async () => {
    let running = 0;
    let peak = 0;
    const order: string[] = [];
    const mkSlow = (id: MarketId) => {
      const a = fakeAdapter({ id });
      a.searchByText = async function* () {
        order.push(id);
        running++;
        peak = Math.max(peak, running);
        await new Promise((r) => setTimeout(r, 15));
        running--;
        yield mk(id, "1", "x");
      };
      return a;
    };
    const adapters = (["cn-e", "cn-d", "cn-c", "cn-b", "cn-a"] as MarketId[]).map(mkSlow);
    const prio: Record<string, number> = { "cn-a": 0, "cn-b": 0, "cn-c": 1, "cn-d": 2, "cn-e": 2 };
    const events = await collect(runSearch({ kind: "text", query: "q" }, adapters, fp, { ...quick, concurrency: 2, priority: (a) => prio[a.id] ?? 9 }));
    expect(peak).toBe(2);
    expect(order.slice(0, 2).sort()).toEqual(["cn-a", "cn-b"]);
    expect(order[2]).toBe("cn-c");
    expect(events.filter((e) => e.type === "listing")).toHaveLength(5);
  });

  it("(j) skips the raw Turkish rung on non-Turkish markets and notes untranslated queries", async () => {
    const en = fakeAdapter({ id: "us-a", language: "en", results: { "wireless earbuds": [] } });
    const tr = fakeAdapter({ id: "tr-b", language: "tr", results: { "kablosuz kulaklık": [mk("tr-b", "1", "x")] } });
    const raw = fakeAdapter({ id: "us-c", language: "en", results: {} });
    const events = await collect(
      runSearch({ kind: "text", query: "kablosuz kulaklık", perMarket: { "us-a": ["wireless earbuds", "kablosuz kulaklık"], "tr-b": ["kablosuz kulaklık"] } }, [en, tr, raw], fp, quick),
    );
    expect(en.calls).toEqual(["text:wireless earbuds"]);
    expect(notes(events, "us-a")[0]).toMatchObject({ code: "rung-skipped" });
    expect(tr.calls).toEqual(["text:kablosuz kulaklık"]);
    expect(raw.calls).toEqual(["text:kablosuz kulaklık"]);
    expect(notes(events, "us-c")[0]).toMatchObject({ code: "untranslated" });
  });

  it("(j2) fills pack quantities from titles and category keys from the categorize hook", async () => {
    const a = fakeAdapter({ id: "cn-a", results: { "usb kablo": [mk("cn-a", "1", "10 adet usb kablo"), mk("cn-a", "2", "usb kablo")] } });
    const events = await collect(runSearch({ kind: "text", query: "usb kablo" }, [a], fp, { ...quick, categorize: (t) => (/kablo/.test(t) ? "sarj-kablosu" : undefined) }));
    const listings = events.filter((e): e is Extract<SearchEvent, { type: "listing" }> => e.type === "listing");
    expect(listings[0]!.listing.packQty).toBe(10);
    expect(listings[1]!.listing.packQty).toBeUndefined();
    const clusters = events.filter((e): e is Extract<SearchEvent, { type: "clusters" }> => e.type === "clusters").at(-1)!;
    const all = [...clusters.clusters.flatMap((c) => c.members), ...clusters.similar];
    expect(all.every((m) => m.fingerprint.category === "sarj-kablosu")).toBe(true);
    expect(all.every((m) => m.match.signals.categoryMatch === true)).toBe(true);
  });

  it("(k) emits text-only candidates immediately, fingerprints in the background and coalesces snapshots", async () => {
    const a = fakeAdapter({ id: "cn-a", results: { q: Array.from({ length: 12 }, (_, i) => mk("cn-a", String(i), `q item ${i}`)) } });
    let resolveFp: (() => void) | null = null;
    const slowFp: Fingerprinter = { ...fp, forListing: (l) => new Promise((r) => { resolveFp = () => r({ title: l.title, phash: "ffff0000ffff0000" }); }) };
    const gen = runSearch({ kind: "text", query: "q" }, [a], slowFp, { ...quick, fingerprintConcurrency: 1, fingerprintGraceMs: 30 });
    const events: SearchEvent[] = [];
    for await (const e of gen) {
      events.push(e);
      if (e.type === "market" && e.status.state === "done") {
        // Market is done before any image fingerprint resolved.
        expect(resolveFp).not.toBeNull();
        expect(events.filter((x) => x.type === "clusters").length).toBeGreaterThan(0);
      }
    }
    const pend = events.filter((e): e is Extract<SearchEvent, { type: "fingerprinting" }> => e.type === "fingerprinting");
    expect(pend.length).toBeGreaterThan(0);
    expect(pend[0]!.pending).toBeGreaterThan(0);
    expect(events.at(-1)!.type).toBe("finished");
  });

  it("(l) pauses the active-time deadline while the runner reports the request as queued, and surfaces stage/page", async () => {
    // A fake runner-backed adapter: queued for 120 ms (tab cap reached), then 60 ms of real work.
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const a = fakeAdapter({ id: "cn-a" });
    a.searchByText = async function* (_q, o) {
      o?.onProgress?.({ stage: "queued" });
      await sleep(120);
      o?.onProgress?.({ stage: "opening" });
      await sleep(30);
      o?.onProgress?.({ stage: "settling", page: 2 });
      await sleep(30);
      yield mk("cn-a", "1", "x");
      o?.onProgress?.({ stage: "done" });
    };
    const events = await collect(runSearch({ kind: "text", query: "q" }, [a], fp, { ...quick, perMarketTimeoutMs: 100, perMarketHardCapMs: 2000 }));
    const st = statuses(events, "cn-a");
    expect(st.at(-1)).toMatchObject({ state: "done", received: 1 });
    expect(st.some((s) => s.state === "running" && s.stage === "queued")).toBe(true);
    expect(st.some((s) => s.state === "running" && s.stage === "settling" && s.page === 2)).toBe(true);
    // Without the pause the same market times out: the queue wait alone exceeds the active budget.
    const b = fakeAdapter({ id: "cn-b" });
    b.searchByText = async function* () {
      await sleep(120);
      yield mk("cn-b", "1", "x");
    };
    const events2 = await collect(runSearch({ kind: "text", query: "q" }, [b], fp, { ...quick, perMarketTimeoutMs: 100 }));
    expect(statuses(events2, "cn-b").at(-1)).toMatchObject({ state: "error", type: "Timeout" });
  });

  it("(l2) a request stuck in the runner's queue hits the hard cap with a queue-specific message", async () => {
    const a = fakeAdapter({ id: "cn-a" });
    a.searchByText = async function* (_q, o) {
      o?.onProgress?.({ stage: "queued" });
      await new Promise(() => undefined);
      yield mk("cn-a", "never", "x");
    };
    const events = await collect(runSearch({ kind: "text", query: "q" }, [a], fp, { ...quick, perMarketTimeoutMs: 30, perMarketHardCapMs: 120 }));
    const last = statuses(events, "cn-a").at(-1);
    expect(last).toMatchObject({ state: "error", type: "Timeout" });
    expect(last && last.state === "error" ? last.message : "").toContain("sırada");
  });
});
