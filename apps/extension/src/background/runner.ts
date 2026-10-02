import { REAL_DEF_BY_ID, type ExtractFailure, type ExtractRequest, type ExtractResult } from "@manufactogate/adapters";
import type { AdapterErrorType, MarketId, SessionState } from "@manufactogate/core";

/**
 * Opens a market page in a background tab inside the user's own session, injects the
 * extract bundle and polls it until results settle. One tab per request; closed afterwards.
 */

const lastRun = new Map<MarketId, number>();
const inflight = new Map<MarketId, Promise<unknown>>();

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitForLoad(tabId: number, timeoutMs: number): Promise<void> {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const tab = await chrome.tabs.get(tabId).catch(() => null);
    if (!tab) throw new Error("tab closed");
    if (tab.status === "complete") return;
    await sleep(150);
  }
  throw new Error("page load timeout");
}

async function exec<T>(tabId: number, func: (...args: never[]) => T, args: unknown[] = []): Promise<T> {
  const injection = { target: { tabId }, func, args } as unknown as chrome.scripting.ScriptInjection<[], T>;
  const [r] = await chrome.scripting.executeScript(injection);
  return r?.result as T;
}

async function rateLimit(market: MarketId) {
  const def = REAL_DEF_BY_ID[market];
  const min = def?.meta.rateLimit.minIntervalMs ?? 2000;
  const prev = inflight.get(market);
  if (prev) await prev.catch(() => undefined);
  const wait = min - (Date.now() - (lastRun.get(market) ?? 0));
  if (wait > 0) await sleep(wait);
  lastRun.set(market, Date.now());
}

function failure(error: AdapterErrorType, message: string, finalUrl?: string): ExtractFailure {
  return { ok: false, error, message, ...(finalUrl ? { finalUrl } : {}) };
}

export async function runExtract(req: ExtractRequest): Promise<ExtractResult | ExtractFailure> {
  const market = req.market;
  const task = (async () => {
    await rateLimit(market);
    const t0 = Date.now();
    const timeoutMs = req.timeoutMs ?? (req.kind === "search" ? 25000 : 15000);
    let tabId: number | undefined;
    let keepTab = false;
    try {
      const tab = await chrome.tabs.create({ url: req.url, active: false });
      tabId = tab.id;
      if (tabId === undefined) return failure("Network", "tab could not be created");
      await waitForLoad(tabId, Math.min(timeoutMs, 20000));
      await chrome.scripting.executeScript({ target: { tabId }, files: ["extract.js"] });

      const settle = async (): Promise<ExtractResult | ExtractFailure> => {
        let last = "";
        let stable = 0;
        const deadline = t0 + timeoutMs;
        while (Date.now() < deadline) {
          const data = await exec<Record<string, unknown>>(tabId!, ((m: MarketId, k: string) => (window as unknown as { __mgx: { run: (m: MarketId, k: string) => unknown } }).__mgx.run(m, k)) as never, [market, req.kind]);
          const session = data?.["session"] as SessionState | undefined;
          const current = await chrome.tabs.get(tabId!).catch(() => null);
          const finalUrl = current?.url ?? req.url;
          if (session === "logged-out" || session === "captcha") {
            // Hand the tab to the user so they can log in or solve the challenge, then retry.
            keepTab = true;
            await chrome.tabs.update(tabId!, { active: true }).catch(() => undefined);
            return { ok: true, data: { ...data, items: [] }, finalUrl, tookMs: Date.now() - t0 };
          }
          if (req.kind === "health") return { ok: true, data, finalUrl, tookMs: Date.now() - t0 };
          const items = (data?.["items"] as unknown[] | undefined) ?? [];
          const detail = data?.["detail"] ?? data?.["supplier"];
          if (req.kind !== "search" && detail) return { ok: true, data, finalUrl, tookMs: Date.now() - t0 };
          if (req.kind === "search" && items.length >= (req.want ?? 30)) return { ok: true, data, finalUrl, tookMs: Date.now() - t0 };
          const sig = `${items.length}:${JSON.stringify(detail ?? null).length}`;
          stable = sig === last && items.length > 0 ? stable + 1 : 0;
          last = sig;
          if (stable >= 2) return { ok: true, data, finalUrl, tookMs: Date.now() - t0 };
          await sleep(700);
        }
        const data = await exec<Record<string, unknown>>(tabId!, ((m: MarketId, k: string) => (window as unknown as { __mgx: { run: (m: MarketId, k: string) => unknown } }).__mgx.run(m, k)) as never, [market, req.kind]);
        const current = await chrome.tabs.get(tabId!).catch(() => null);
        return { ok: true, data, finalUrl: current?.url ?? req.url, tookMs: Date.now() - t0 };
      };

      if (req.imageDataUrl) {
        // Give the page a moment to mount its upload widget, then feed the file.
        await sleep(800);
        const r = await exec<string>(tabId, ((m: MarketId, d: string) => (window as unknown as { __mgx: { setImage: (m: MarketId, d: string) => string } }).__mgx.setImage(m, d)) as never, [market, req.imageDataUrl]);
        if (r !== "ok") return failure("SelectorBroken", "görsel yükleme girişi bulunamadı", req.url);
        await sleep(1500);
        // After upload the page usually navigates or re-renders; re-inject if the world was reset.
        await waitForLoad(tabId, 10000).catch(() => undefined);
        await chrome.scripting.executeScript({ target: { tabId }, files: ["extract.js"] }).catch(() => undefined);
      }
      return await settle();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return failure(/timeout/.test(msg) ? "Network" : "Network", msg, req.url);
    } finally {
      if (tabId !== undefined && !keepTab) void chrome.tabs.remove(tabId).catch(() => undefined);
    }
  })();
  inflight.set(market, task);
  try {
    return await task;
  } finally {
    if (inflight.get(market) === task) inflight.delete(market);
  }
}

/** Captures the HTML of the currently active tab for calibration fixtures. */
export async function captureActiveTab(): Promise<{ html: string; url: string; market: MarketId | null }> {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab?.id || !tab.url) throw new Error("aktif sekme yok");
  await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["extract.js"] });
  const html = await exec<string>(tab.id, (() => (window as unknown as { __mgx: { capture: () => string } }).__mgx.capture()) as never);
  const market = (Object.keys(REAL_DEF_BY_ID) as MarketId[]).find((m) => REAL_DEF_BY_ID[m]!.meta.hosts.some((h) => new RegExp(h.replace(/\./g, "\\.").replace(/\*/g, ".*")).test(new URL(tab.url!).host))) ?? null;
  return { html, url: tab.url, market };
}

/** Fetches a market image with the extension's host permissions and returns it as a data URL. */
export async function fetchImageAsDataUrl(url: string): Promise<string> {
  const res = await fetch(url, { credentials: "omit", cache: "force-cache" });
  if (!res.ok) throw new Error(`image ${res.status}`);
  const blob = await res.blob();
  const buf = new Uint8Array(await blob.arrayBuffer());
  let bin = "";
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return `data:${blob.type || "image/jpeg"};base64,${btoa(bin)}`;
}
