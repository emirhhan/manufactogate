import { REAL_DEF_BY_ID, PORT_NAME, type ExtToWeb, type WebToExt } from "@manufactogate/adapters";
import type { HealthResult, MarketId, SessionState } from "@manufactogate/core";
import { EXT_VERSION, MARKET_HOSTS } from "../shared";
import { captureActiveTab, fetchImageAsDataUrl, runExtract } from "./runner";

/**
 * Background worker: answers popup and web-app requests.
 * - sessions: quick cookie heuristic per market (no tabs)
 * - health:   opens each market's search page and parses it (real check)
 * - run:      runs one ExtractRequest in a background tab
 * - capture:  returns the active tab's HTML for fixture calibration
 */

async function sessionFor(market: MarketId): Promise<SessionState> {
  const cfg = MARKET_HOSTS[market];
  if (!cfg?.loginCookie) return "unknown";
  try {
    const cookies = await chrome.cookies.getAll({ domain: cfg.host });
    return cookies.some((c) => c.name === cfg.loginCookie && c.value) ? "logged-in" : "logged-out";
  } catch {
    return "unknown";
  }
}

async function allSessions(): Promise<Partial<Record<MarketId, SessionState>>> {
  const out: Partial<Record<MarketId, SessionState>> = {};
  await Promise.all((Object.keys(MARKET_HOSTS) as MarketId[]).map(async (m) => (out[m] = await sessionFor(m))));
  return out;
}

async function healthFor(market: MarketId): Promise<HealthResult> {
  const def = REAL_DEF_BY_ID[market];
  const t0 = Date.now();
  if (!def) return { ok: false, checkedAt: new Date().toISOString(), message: "adapter yok" };
  const r = await runExtract({ market, kind: "search", url: def.searchUrl(def.healthQuery), want: 5, timeoutMs: 20000 });
  const checkedAt = new Date().toISOString();
  if (!r.ok) return { ok: false, checkedAt, durationMs: Date.now() - t0, message: `${r.error}: ${r.message}` };
  const d = r.data as { session: SessionState; items: unknown[]; strategy: string };
  const ok = d.session !== "captcha" && d.session !== "logged-out" && d.items.length > 0;
  return { ok, checkedAt, durationMs: Date.now() - t0, message: `${d.session} · ${d.items.length} sonuç · ${d.strategy}` };
}

async function handle(msg: WebToExt): Promise<ExtToWeb> {
  switch (msg.type) {
    case "ping":
      return { type: "pong", version: EXT_VERSION };
    case "sessions":
      return { type: "sessions", sessions: await allSessions() };
    case "health": {
      const markets = msg.market ? [msg.market] : (Object.keys(REAL_DEF_BY_ID) as MarketId[]);
      const health: Partial<Record<MarketId, HealthResult>> = {};
      for (const m of markets) health[m] = await healthFor(m);
      const stored = ((await chrome.storage.local.get("health")).health as Partial<Record<MarketId, HealthResult>> | undefined) ?? {};
      await chrome.storage.local.set({ health: { ...stored, ...health } });
      return { type: "health", health: { ...stored, ...health } };
    }
    case "run":
      return { type: "run:result", result: await runExtract(msg.req) };
    case "image":
      return { type: "image:result", dataUrl: await fetchImageAsDataUrl(msg.url) };
    case "capture": {
      const c = await captureActiveTab();
      return { type: "capture:result", ...c };
    }
  }
}

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== PORT_NAME) return;
  port.onMessage.addListener((msg: { id: string; payload: WebToExt }) => {
    handle(msg.payload)
      .then((payload) => port.postMessage({ id: msg.id, payload }))
      .catch((e: unknown) => port.postMessage({ id: msg.id, payload: { type: "error", message: e instanceof Error ? e.message : String(e) } satisfies ExtToWeb }));
  });
});

chrome.runtime.onMessage.addListener((msg: WebToExt, _sender, sendResponse: (r: ExtToWeb) => void) => {
  handle(msg)
    .then(sendResponse)
    .catch((e: unknown) => sendResponse({ type: "error", message: e instanceof Error ? e.message : String(e) }));
  return true;
});

chrome.runtime.onInstalled.addListener(() => {
  void chrome.storage.local.set({ installedAt: new Date().toISOString(), version: EXT_VERSION });
});
