import type { HealthResult, MarketId, SessionState } from "@manufactogate/core";
import { EXT_VERSION, MARKET_HOSTS, type BgRequest, type BgResponse } from "../shared";

/**
 * Sprint 0 background worker:
 * - answers "sessions": logged-in heuristic from login cookies per market host
 * - answers "health": last stored health per adapter, refreshed by an alarm
 * - answers "ping": version
 * Real searches are routed through here from Sprint 1 on.
 */

async function sessionFor(market: MarketId): Promise<SessionState> {
  const cfg = MARKET_HOSTS[market];
  if (!cfg) return "unknown";
  try {
    if (!cfg.loginCookie) return "unknown";
    const cookies = await chrome.cookies.getAll({ domain: cfg.host });
    return cookies.some((c) => c.name === cfg.loginCookie && c.value) ? "logged-in" : "logged-out";
  } catch {
    return "unknown";
  }
}

async function allSessions(): Promise<Partial<Record<MarketId, SessionState>>> {
  const out: Partial<Record<MarketId, SessionState>> = {};
  await Promise.all(
    (Object.keys(MARKET_HOSTS) as MarketId[]).map(async (m) => {
      out[m] = await sessionFor(m);
    }),
  );
  return out;
}

async function recordHealth(): Promise<Partial<Record<MarketId, HealthResult>>> {
  // Sprint 0: health = session reachable. Sprint 1 runs each adapter's healthCheck().
  const sessions = await allSessions();
  const health: Partial<Record<MarketId, HealthResult>> = {};
  for (const [m, s] of Object.entries(sessions) as [MarketId, SessionState][]) {
    health[m] = { ok: s !== "unknown", checkedAt: new Date().toISOString(), message: s };
  }
  await chrome.storage.local.set({ health });
  return health;
}

chrome.runtime.onInstalled.addListener(() => {
  void chrome.alarms.create("health", { periodInMinutes: 60 });
  void recordHealth();
});
chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === "health") void recordHealth();
});

chrome.runtime.onMessage.addListener((msg: BgRequest, _sender, sendResponse: (r: BgResponse) => void) => {
  (async () => {
    if (msg.type === "ping") sendResponse({ type: "pong", version: EXT_VERSION });
    else if (msg.type === "sessions") sendResponse({ type: "sessions", sessions: await allSessions() });
    else if (msg.type === "health") {
      const stored = (await chrome.storage.local.get("health")).health as Partial<Record<MarketId, HealthResult>> | undefined;
      sendResponse({ type: "health", health: stored ?? (await recordHealth()) });
    }
  })();
  return true;
});
