import { beforeEach, describe, expect, it } from "vitest";
import { TabRegistry } from "./tabs";

/** Minimal fake of the chrome tab/window/storage.session APIs the registry touches. */
function fakeChrome() {
  let nextTab = 100;
  let nextWin = 10;
  const tabs = new Map<number, { id: number; url: string; windowId: number }>();
  const windows = new Set<number>();
  const session: Record<string, unknown> = {};
  const api = {
    tabs: {
      create: async (p: { url: string; windowId?: number }) => {
        const id = nextTab++;
        const t = { id, url: p.url, windowId: p.windowId ?? 1 };
        tabs.set(id, t);
        return t;
      },
      get: async (id: number) => {
        const t = tabs.get(id);
        if (!t) throw new Error(`No tab with id: ${id}.`);
        return t;
      },
      remove: async (id: number) => {
        tabs.delete(id);
      },
      query: async (q: { windowId?: number }) => [...tabs.values()].filter((t) => q.windowId === undefined || t.windowId === q.windowId),
      update: async (id: number, p: { url?: string }) => {
        const t = tabs.get(id);
        if (!t) throw new Error(`No tab with id: ${id}.`);
        if (p.url) t.url = p.url;
        return t;
      },
    },
    windows: {
      create: async (p: { url: string }) => {
        const id = nextWin++;
        windows.add(id);
        const tab = await api.tabs.create({ url: p.url, windowId: id });
        return { id, tabs: [tab] };
      },
      get: async (id: number) => {
        if (!windows.has(id)) throw new Error("no window");
        return { id };
      },
      update: async () => undefined,
    },
    storage: {
      session: {
        get: async (keys: string[]) => Object.fromEntries(keys.map((k) => [k, session[k]])),
        set: async (v: Record<string, unknown>) => {
          Object.assign(session, v);
        },
      },
    },
  };
  return { api, tabs, windows, session };
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("TabRegistry", () => {
  let fx: ReturnType<typeof fakeChrome>;
  beforeEach(() => {
    fx = fakeChrome();
    (globalThis as unknown as { chrome: unknown }).chrome = fx.api;
  });

  it("opens tabs in one dedicated window and reuses it", async () => {
    const r = new TabRegistry();
    const a = await r.open("https://a/", "cn-1688", "search", { separateWindow: true });
    const b = await r.open("https://b/", "cn-taobao", "search", { separateWindow: true });
    expect(fx.windows.size).toBe(1);
    expect(fx.tabs.get(a)?.windowId).toBe(r.windowId);
    expect(fx.tabs.get(b)?.windowId).toBe(r.windowId);
    expect(r.count()).toBe(2);
    await r.close(a);
    expect(fx.tabs.has(a)).toBe(false);
    expect(r.count()).toBe(1);
  });

  it("parks the last tab of the dedicated window and reuses it for the next request", async () => {
    const r = new TabRegistry();
    const a = await r.open("https://a/", "cn-1688", "search", { separateWindow: true });
    await r.close(a);
    expect(fx.tabs.has(a)).toBe(true); // parked on about:blank, window survives
    expect(fx.tabs.get(a)?.url).toBe("about:blank");
    expect(r.count()).toBe(0);
    const b = await r.open("https://b/", "cn-taobao", "search", { separateWindow: true });
    expect(b).toBe(a); // reused
    expect(fx.tabs.get(b)?.url).toBe("https://b/");
    expect(fx.windows.size).toBe(1);
    await r.close(b);
    r.get(b)!.openedAt = Date.now() - 4 * 60000;
    await r.sweep(10 * 60000, new Set());
    expect(fx.tabs.has(b)).toBe(false); // idle placeholder removed
  });

  it("opens in the current window when the setting is off", async () => {
    const r = new TabRegistry();
    await r.open("https://a/", "cn-1688", "search", { separateWindow: false });
    expect(fx.windows.size).toBe(0);
    expect(r.windowId).toBeNull();
  });

  it("keeps one tab per market and closes the previous kept one", async () => {
    const r = new TabRegistry();
    const a = await r.open("https://a/", "id-shopee", "search", { separateWindow: false });
    await r.keep(a, "id-shopee", "logged-out", "https://a/login");
    const b = await r.open("https://b/", "id-shopee", "search", { separateWindow: false });
    await r.keep(b, "id-shopee", "logged-out", "https://b/login");
    expect(fx.tabs.has(a)).toBe(false);
    expect(r.keptFor("id-shopee")?.tabId).toBe(b);
    r.release(b);
    expect(r.keptFor("id-shopee")).toBeUndefined();
    expect(fx.tabs.has(b)).toBe(true);
  });

  it("restores from the session mirror: closes orphans, keeps kept tabs", async () => {
    const r = new TabRegistry();
    const orphan = await r.open("https://a/", "cn-1688", "search", { separateWindow: true });
    const kept = await r.open("https://b/", "cn-taobao", "search", { separateWindow: true });
    await r.keep(kept, "cn-taobao", "captcha", "https://b/");
    await wait(80); // persist debounce
    const fresh = new TabRegistry();
    const res = await fresh.restore();
    expect(res).toEqual({ closed: 1, kept: 1 });
    expect(fx.tabs.has(orphan)).toBe(false);
    expect(fx.tabs.has(kept)).toBe(true);
    expect(fresh.windowId).toBe(r.windowId);
  });

  it("sweeps old unused tabs and forgets tabs the user closed", async () => {
    const r = new TabRegistry();
    const old = await r.open("https://a/", "cn-1688", "search", { separateWindow: false });
    const busy = await r.open("https://b/", "cn-1688", "search", { separateWindow: false });
    r.get(old)!.openedAt = Date.now() - 20 * 60000;
    r.get(busy)!.openedAt = Date.now() - 20 * 60000;
    const gone = await r.open("https://c/", "cn-1688", "search", { separateWindow: false });
    fx.tabs.delete(gone); // closed by the user
    const n = await r.sweep(10 * 60000, new Set([busy]));
    expect(n).toBe(1);
    expect(r.has(old)).toBe(false);
    expect(r.has(busy)).toBe(true);
    expect(r.has(gone)).toBe(false);
  });
});
