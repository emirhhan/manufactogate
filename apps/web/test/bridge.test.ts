import { EXT_MARKER_ATTR, EXT_SOURCE, WEB_SOURCE } from "@manufactogate/adapters";
import { CANCELLED_MESSAGE, cancelExtensionRuns, detectExtension, ensureAlive, ExtensionRunner, isOrphaned, NOT_INSTALLED_MESSAGE, onProgress, onSessionsChanged, ORPHAN_MESSAGE, pendingRequestIds, ping, resetBridgeState, sendSnapshot, sendToExtension, withHeartbeat } from "../src/lib/bridge";
import { applyLiveProgress, computeEffective, isStaleHealth, runLimited, useExtension } from "../src/store/extension";

type Envelope = { source: string; id: string; payload: { type: string } };

/** Installs a fake content script that answers envelopes (or stays silent when `silent`). */
function responder(opts: { silent?: boolean; error?: string } = {}) {
  const seen: string[] = [];
  const onMsg = (ev: MessageEvent) => {
    const d = ev.data as Envelope | undefined;
    if (!d || d.source !== WEB_SOURCE) return;
    seen.push(d.payload.type);
    if (opts.silent) return;
    const payload = opts.error ? { type: "error", message: opts.error } : d.payload.type === "ping" ? { type: "pong", version: "9.9.9" } : d.payload.type === "sessions" ? { type: "sessions", sessions: { "cn-1688": "logged-in" } } : { type: "run:result", result: { ok: true, items: [] } };
    window.postMessage({ source: EXT_SOURCE, replyTo: d.id, payload }, "*");
  };
  window.addEventListener("message", onMsg);
  return { seen, stop: () => window.removeEventListener("message", onMsg) };
}

beforeEach(() => {
  resetBridgeState();
  document.documentElement.removeAttribute(EXT_MARKER_ATTR);
});

describe("detectExtension", () => {
  it("reports not installed without the marker", async () => {
    expect(await detectExtension()).toEqual({ installed: false, sessions: {} });
    expect(await ping()).toBeNull();
  });
  it("reports installed with sessions when the content script answers", async () => {
    document.documentElement.setAttribute(EXT_MARKER_ATTR, "1.0.0");
    const r = responder();
    const info = await detectExtension();
    r.stop();
    expect(info.installed).toBe(true);
    expect(info.orphaned).toBe(false);
    expect(info.version).toBe("9.9.9");
    expect(info.sessions).toEqual({ "cn-1688": "logged-in" });
    expect(info.lastSeenAt).toBeTruthy();
  });
  it("reports orphaned when the marker is there but nothing answers", async () => {
    document.documentElement.setAttribute(EXT_MARKER_ATTR, "1.0.0");
    const r = responder({ silent: true });
    const t0 = Date.now();
    const info = await detectExtension();
    r.stop();
    expect(info.installed).toBe(true);
    expect(info.orphaned).toBe(true);
    expect(isOrphaned()).toBe(true);
    expect(Date.now() - t0).toBeLessThan(3000);
  });
  it("maps Chrome's invalidated-context error to the Turkish hint", async () => {
    document.documentElement.setAttribute(EXT_MARKER_ATTR, "1.0.0");
    const r = responder({ error: "Extension context invalidated." });
    await expect(ping()).resolves.toBeNull();
    const info = await detectExtension();
    r.stop();
    expect(info.orphaned).toBe(true);
  });
});

describe("ExtensionRunner", () => {
  it("fails fast without the extension and when orphaned, instead of waiting minutes", async () => {
    const runner = new ExtensionRunner();
    const req = { market: "cn-1688" as const, kind: "search" as never, url: "https://x" };
    expect(await runner.run(req)).toEqual({ ok: false, error: "Network", message: NOT_INSTALLED_MESSAGE });
    document.documentElement.setAttribute(EXT_MARKER_ATTR, "1.0.0");
    const r = responder({ silent: true });
    const t0 = Date.now();
    const res = await runner.run(req);
    r.stop();
    expect(res).toEqual({ ok: false, error: "Network", message: ORPHAN_MESSAGE });
    expect(Date.now() - t0).toBeLessThan(3000);
  });
  it("runs through a live extension and caches the liveness ping per window", async () => {
    document.documentElement.setAttribute(EXT_MARKER_ATTR, "1.0.0");
    const r = responder();
    const runner = new ExtensionRunner();
    const req = { market: "cn-1688" as const, kind: "search" as never, url: "https://x" };
    const a = await runner.run(req);
    const b = await runner.run(req);
    r.stop();
    expect(a.ok && b.ok).toBe(true);
    expect(r.seen.filter((t) => t === "ping")).toHaveLength(1);
    expect(await ensureAlive()).toBe(true);
  });
});

describe("withHeartbeat", () => {
  it("rejects after consecutive probe failures and resolves otherwise", async () => {
    vi.useFakeTimers();
    const never = new Promise<never>(() => undefined);
    const p = withHeartbeat(never, async () => false, 100, 2);
    const caught = p.catch((e: Error) => e.message);
    await vi.advanceTimersByTimeAsync(250);
    expect(await caught).toBe(ORPHAN_MESSAGE);
    const ok = withHeartbeat(Promise.resolve(42), async () => true, 100, 2);
    await expect(ok).resolves.toBe(42);
    vi.useRealTimers();
  });
});

describe("extension store helpers", () => {
  it("computeEffective never claims real data without the extension", () => {
    expect(computeEffective("extension", false)).toEqual({ dataSource: "mock", wanted: true });
    expect(computeEffective("extension", true)).toEqual({ dataSource: "extension", wanted: false });
    expect(computeEffective("auto", false)).toEqual({ dataSource: "mock", wanted: false });
    expect(computeEffective("mock", true)).toEqual({ dataSource: "mock", wanted: false });
  });
  it("isStaleHealth flags results older than a day", () => {
    const now = Date.parse("2026-10-03T00:00:00Z");
    expect(isStaleHealth({ ok: true, checkedAt: "2026-10-02T12:00:00Z" }, now)).toBe(false);
    expect(isStaleHealth({ ok: true, checkedAt: "2026-10-01T00:00:00Z" }, now)).toBe(true);
    expect(isStaleHealth(undefined, now)).toBe(false);
  });
});

/** Fake content script for the cancel/progress/event paths: runs stay open until cancelled. */
function liveResponder() {
  const seen: { id: string; payload: { type: string; id?: string; quick?: boolean; market?: string; snapshot?: unknown } }[] = [];
  let open = 0;
  let peak = 0;
  const onMsg = (ev: MessageEvent) => {
    const d = ev.data as { source: string; id: string; payload: { type: string; id?: string; quick?: boolean; market?: string; snapshot?: unknown } } | undefined;
    if (!d || d.source !== WEB_SOURCE) return;
    seen.push({ id: d.id, payload: d.payload });
    const reply = (payload: unknown) => window.postMessage({ source: EXT_SOURCE, replyTo: d.id, payload }, "*");
    switch (d.payload.type) {
      case "ping":
        return reply({ type: "pong", version: "9.9.9" });
      case "sessions":
        return reply({ type: "sessions", sessions: { "cn-1688": "logged-in" } });
      case "run":
        window.postMessage({ source: EXT_SOURCE, progressFor: d.id, payload: { type: "run:progress", market: "cn-1688", stage: "queued" } }, "*");
        window.postMessage({ source: EXT_SOURCE, progressFor: d.id, payload: { type: "run:progress", market: "cn-1688", stage: "settling" } }, "*");
        return; // never answers: only a cancel ends it
      case "cancel":
        return reply({ type: "ok" });
      case "snapshot":
        return reply({ type: "ok" });
      case "health": {
        open++;
        peak = Math.max(peak, open);
        setTimeout(() => {
          open--;
          reply({ type: "health", health: { [d.payload.market!]: { ok: true, checkedAt: new Date().toISOString(), message: "q" } } });
        }, 20);
        return;
      }
      default:
        return reply({ type: "error", message: "unknown" });
    }
  };
  window.addEventListener("message", onMsg);
  return { seen, peak: () => peak, stop: () => window.removeEventListener("message", onMsg) };
}

describe("cancel, progress and events", () => {
  it("sends a cancel for the request the moment its signal fires and rejects with the Turkish message", async () => {
    document.documentElement.setAttribute(EXT_MARKER_ATTR, "1.0.0");
    const r = liveResponder();
    const ac = new AbortController();
    const stages: string[] = [];
    const req = sendToExtension({ type: "run", req: { market: "cn-1688", kind: "search", url: "https://x" } }, 60000, { signal: ac.signal, onProgress: (p) => stages.push(p.stage) });
    await new Promise((res) => setTimeout(res, 20));
    expect(stages).toEqual(["queued", "settling"]);
    const runId = r.seen.find((m) => m.payload.type === "run")!.id;
    expect(pendingRequestIds()).toContain(runId);
    ac.abort();
    await expect(req).rejects.toThrow(CANCELLED_MESSAGE);
    await new Promise((res) => setTimeout(res, 10));
    r.stop();
    expect(r.seen.some((m) => m.payload.type === "cancel" && m.payload.id === runId)).toBe(true);
    expect(pendingRequestIds()).not.toContain(runId);
  });
  it("ExtensionRunner forwards the signal and progress and answers a cancelled failure instead of waiting", async () => {
    document.documentElement.setAttribute(EXT_MARKER_ATTR, "1.0.0");
    const r = liveResponder();
    const ac = new AbortController();
    const stages: string[] = [];
    const runner = new ExtensionRunner();
    const p = runner.run({ market: "cn-1688", kind: "search", url: "https://x" }, { signal: ac.signal, onProgress: (x) => stages.push(x.stage) });
    await new Promise((res) => setTimeout(res, 20));
    ac.abort();
    const res = await p;
    await new Promise((res) => setTimeout(res, 10));
    r.stop();
    expect(res).toEqual({ ok: false, error: "Network", message: CANCELLED_MESSAGE });
    expect(stages).toEqual(["queued", "settling"]);
    expect(r.seen.filter((m) => m.payload.type === "cancel")).toHaveLength(1);
  });
  it("global progress subscribers see every run's stage with its request id; cancelExtensionRuns drops the whole connection", async () => {
    document.documentElement.setAttribute(EXT_MARKER_ATTR, "1.0.0");
    const r = liveResponder();
    const got: { requestId: string; stage: string; market: string }[] = [];
    const off = onProgress((p) => got.push({ requestId: p.requestId, stage: p.stage, market: p.market }));
    const ac = new AbortController();
    const req = sendToExtension({ type: "run", req: { market: "cn-1688", kind: "search", url: "https://x" } }, 60000, { signal: ac.signal });
    await new Promise((res) => setTimeout(res, 20));
    expect(got.map((g) => g.stage)).toEqual(["queued", "settling"]);
    expect(got[0]!.requestId).toBe(r.seen.find((m) => m.payload.type === "run")!.id);
    expect(await cancelExtensionRuns()).toBe(true);
    expect(r.seen.some((m) => m.payload.type === "cancel" && m.payload.id === undefined)).toBe(true);
    ac.abort();
    await req.catch(() => undefined);
    off();
    r.stop();
  });
  it("session events reach subscribers and the store applies them, then refreshes the whole map", async () => {
    document.documentElement.setAttribute(EXT_MARKER_ATTR, "1.0.0");
    const r = liveResponder();
    const seen: string[] = [];
    const off = onSessionsChanged((m, s) => seen.push(`${m}:${s}`));
    useExtension.setState({ info: { installed: true, sessions: {} } });
    window.postMessage({ source: EXT_SOURCE, event: { type: "sessions:changed", market: "tr-trendyol", session: "logged-in" } }, "*");
    await new Promise((res) => setTimeout(res, 10));
    expect(seen).toEqual(["tr-trendyol:logged-in"]);
    expect(useExtension.getState().info.sessions["tr-trendyol"]).toBe("logged-in");
    await new Promise((res) => setTimeout(res, 1600));
    expect(r.seen.some((m) => m.payload.type === "sessions")).toBe(true);
    expect(useExtension.getState().info.sessions["cn-1688"]).toBe("logged-in");
    off();
    r.stop();
  });
  it("sendSnapshot pushes the overlay snapshot and is a no-op without the extension", async () => {
    expect(await sendSnapshot({ market: "tr-trendyol", listingId: "1" }, [{ market: "cn-1688", price: 10, currency: "CNY" }])).toBe(false);
    document.documentElement.setAttribute(EXT_MARKER_ATTR, "1.0.0");
    const r = liveResponder();
    expect(await sendSnapshot({ market: "tr-trendyol", listingId: "123", title: "Kask" }, [{ market: "cn-1688", name: "1688", price: 25.8, currency: "CNY", url: "https://detail.1688.com/offer/9.html" }], "2026-10-03T00:00:00Z")).toBe(true);
    r.stop();
    const snap = r.seen.find((m) => m.payload.type === "snapshot")!.payload.snapshot as { key: string; offers: unknown[]; seenAt: string; title: string };
    expect(snap).toMatchObject({ key: "tr-trendyol:123", title: "Kask", seenAt: "2026-10-03T00:00:00Z" });
    expect(snap.offers).toHaveLength(1);
  });
});

describe("live phase map and health round", () => {
  it("applyLiveProgress replaces the stage, clears on done and ignores a stale request's done", () => {
    let live = applyLiveProgress({}, { market: "cn-1688", stage: "queued", requestId: "a" }, 1);
    expect(live["cn-1688"]).toEqual({ stage: "queued", requestId: "a", at: 1 });
    live = applyLiveProgress(live, { market: "cn-1688", stage: "settling", requestId: "b" }, 2);
    expect(live["cn-1688"]?.stage).toBe("settling");
    expect(applyLiveProgress(live, { market: "cn-1688", stage: "done", requestId: "a" }, 3)["cn-1688"]?.stage).toBe("settling");
    expect(applyLiveProgress(live, { market: "cn-1688", stage: "done", requestId: "b" }, 3)["cn-1688"]).toBeUndefined();
  });
  it("runLimited keeps at most `concurrency` in flight and stops handing out work once aborted", async () => {
    let open = 0;
    let peak = 0;
    const done: number[] = [];
    const ac = new AbortController();
    await runLimited(
      [1, 2, 3, 4, 5, 6],
      2,
      async (n) => {
        open++;
        peak = Math.max(peak, open);
        await new Promise((r) => setTimeout(r, 5));
        open--;
        done.push(n);
        if (n === 4) ac.abort();
      },
      ac.signal,
    );
    expect(peak).toBe(2);
    expect(done.length).toBeLessThan(6);
    expect(done).toContain(4);
  });
  it("runRound quick-probes markets three at a time and reports progress", async () => {
    document.documentElement.setAttribute(EXT_MARKER_ATTR, "1.0.0");
    const r = liveResponder();
    const ids = ["cn-1688", "cn-taobao", "cn-pinduoduo", "tr-trendyol", "us-ebay", "de-amazon", "us-temu"] as const;
    const seenProgress: string[] = [];
    const unsub = useExtension.subscribe((s) => seenProgress.push(s.progress));
    await useExtension.getState().runRound([...ids]);
    unsub();
    r.stop();
    const health = r.seen.filter((m) => m.payload.type === "health");
    expect(health).toHaveLength(ids.length);
    expect(health.every((m) => m.payload.quick === true)).toBe(true);
    expect(r.peak()).toBe(3);
    expect(seenProgress.some((p) => /^3\/7/.test(p))).toBe(true);
    const st = useExtension.getState();
    expect(st.checking).toBe(false);
    expect(st.round).toBeUndefined();
    expect(Object.keys(st.health)).toEqual(expect.arrayContaining([...ids]));
  }, 15000);
});
