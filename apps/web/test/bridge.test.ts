import { EXT_MARKER_ATTR, EXT_SOURCE, WEB_SOURCE } from "@manufactogate/adapters";
import { detectExtension, ensureAlive, ExtensionRunner, isOrphaned, NOT_INSTALLED_MESSAGE, ORPHAN_MESSAGE, ping, resetBridgeState, withHeartbeat } from "../src/lib/bridge";
import { computeEffective, isStaleHealth } from "../src/store/extension";

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
