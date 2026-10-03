import { PORT_NAME, REAL_DEF_BY_ID, type ExtEvent, type ExtToWeb, type RunProgress, type WebToExt } from "@manufactogate/adapters";
import type { HealthResult, MarketId, SessionState } from "@manufactogate/core";
import { APP_ORIGIN_PATTERNS, extVersion, hostMatches, loadSettings, MARKET_HOSTS, type AnyReply, type AnyRequest, type HealthMap, type RunStage } from "../shared";
import { TR } from "./errors";
import { healthRequestFor, healthResultFrom } from "./health";
import * as runner from "./runner";
import { mergeSnapshot, type SnapshotStore } from "./snapshots";

/**
 * Background worker: answers popup, overlay and web-app requests.
 * - sessions: quick cookie heuristic per market (no tabs)
 * - health:   opens each market's search page the way a real search does and parses it
 * - run:      runs one ExtractRequest in a background tab (cancelled when the asking page goes away or sends cancel)
 * - cancel:   stops one request (by its envelope id) or every request of the connection
 * - snapshot: stores a price snapshot for the overlay (chrome.storage.local.snapshots)
 * - image:    fetches a market image with the extension's host permissions
 * - capture:  returns the active tab's HTML for fixture calibration
 * - status/retry/closeTabs/openLogins/focusTab: popup controls over the runner
 * - resolve:  overlay asks whether the current page is a known product page
 */

self.addEventListener("unhandledrejection", (e) => console.warn("[mg] unhandled rejection", (e as PromiseRejectionEvent).reason));
self.addEventListener("error", (e) => console.warn("[mg] error", (e as ErrorEvent).message));

void runner.initRunner();

/* ------------------------------------------------------------------------------------------------
 * Sessions (cookie heuristics)
 * ---------------------------------------------------------------------------------------------- */

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
  const status = runner.runnerStatus();
  await Promise.all(
    (Object.keys(REAL_DEF_BY_ID) as MarketId[]).map(async (m) => {
      let s = await sessionFor(m);
      // The runner's own evidence (a kept login/captcha tab) beats a missing cookie heuristic.
      const kept = status.keptTabs[m];
      if (kept && s !== "logged-in") s = kept.session;
      else if (status.cooldowns[m]?.kind === "captcha") s = "captcha";
      out[m] = s;
    }),
  );
  return out;
}

/* ------------------------------------------------------------------------------------------------
 * Health
 * ---------------------------------------------------------------------------------------------- */

const healthRuns = new Map<string, Promise<HealthMap>>();

async function storedHealth(): Promise<HealthMap> {
  try {
    return ((await chrome.storage.local.get("health")).health as HealthMap | undefined) ?? {};
  } catch {
    return {};
  }
}

async function writeHealth(market: MarketId, h: HealthResult): Promise<void> {
  const stored = await storedHealth();
  await chrome.storage.local.set({ health: { ...stored, [market]: h } }).catch(() => undefined);
}

/**
 * Mirrors the real search path (typed query on the home page when the adapter uses it), so "healthy"
 * means "a search works". `quick` is the 8 s probe the web's health round uses: search URL, first
 * reading, no captcha wait, no scrolling.
 */
async function healthFor(market: MarketId, owner?: string, quick = false): Promise<HealthResult> {
  const def = REAL_DEF_BY_ID[market];
  const t0 = Date.now();
  if (!def) return { ok: false, checkedAt: new Date().toISOString(), message: TR.noAdapter };
  const req = healthRequestFor(def, quick);
  const r = await runner.runTracked(req, { waitForCaptcha: false, ...(owner ? { owner } : {}) });
  return healthResultFrom(def, r, Date.now() - t0);
}

/** Runs a health round once even when several callers ask at the same time; results are stored per market as they arrive. */
function healthRound(markets: MarketId[], key: string, owner?: string, quick = false): Promise<HealthMap> {
  const existing = healthRuns.get(key);
  if (existing) return existing;
  const p = (async () => {
    const out: HealthMap = {};
    for (const m of markets) {
      try {
        out[m] = await healthFor(m, owner, quick);
      } catch (e) {
        out[m] = { ok: false, checkedAt: new Date().toISOString(), message: e instanceof Error ? e.message : String(e) };
      }
      await writeHealth(m, out[m]!);
    }
    return { ...(await storedHealth()), ...out };
  })().finally(() => healthRuns.delete(key));
  healthRuns.set(key, p);
  return p;
}

/* ------------------------------------------------------------------------------------------------
 * Request handling
 * ---------------------------------------------------------------------------------------------- */

interface HandleCtx {
  owner?: string;
  /** Envelope id of the request (web connections), so a later `cancel` can name it. */
  requestId?: string;
  progress?: (market: MarketId, stage: RunStage) => void;
  senderTabId?: number;
}

async function storeSnapshot(snapshot: Parameters<typeof mergeSnapshot>[1]): Promise<void> {
  const { snapshots } = await chrome.storage.local.get("snapshots").catch(() => ({ snapshots: undefined }));
  const next = mergeSnapshot((snapshots as SnapshotStore | undefined) ?? {}, snapshot);
  await chrome.storage.local.set({ snapshots: next }).catch(() => undefined);
}

async function handle(msg: AnyRequest, ctx: HandleCtx = {}): Promise<AnyReply> {
  switch (msg.type) {
    case "ping":
      return { type: "pong", version: extVersion() };
    case "sessions":
      return { type: "sessions", sessions: await allSessions() };
    case "health": {
      const markets = msg.market ? [msg.market] : (Object.keys(REAL_DEF_BY_ID) as MarketId[]).filter((m) => !REAL_DEF_BY_ID[m]?.meta.version.includes("beta"));
      const quick = msg.quick === true;
      const health = await healthRound(markets, `${msg.market ?? "*"}${quick ? ":quick" : ""}`, ctx.owner, quick);
      return { type: "health", health };
    }
    case "run": {
      const progress = ctx.progress;
      const result = await runner.runTracked(msg.req, {
        ...(ctx.owner ? { owner: ctx.owner } : {}),
        ...(ctx.requestId ? { requestId: ctx.requestId } : {}),
        ...(progress ? { progress: (stage: RunStage) => progress(msg.req.market, stage) } : {}),
      });
      return { type: "run:result", result };
    }
    case "snapshot":
      await storeSnapshot(msg.snapshot);
      return { type: "ok" };
    case "image":
      return { type: "image:result", dataUrl: await runner.fetchImageAsDataUrl(msg.url) };
    case "capture": {
      const c = await runner.captureActiveTab();
      return { type: "capture:result", ...c };
    }
    case "status":
      return { type: "status", status: runner.runnerStatus() };
    case "cancel":
      // Explicit cancel from the asking connection: one request by id, or all of its requests.
      // The disconnect path covers closed pages; a popup (no owner) cancels everything.
      if (ctx.owner && msg.id) runner.cancelRequest(ctx.owner, msg.id);
      else if (ctx.owner) runner.cancelOwner(ctx.owner);
      else runner.cancelAll();
      return { type: "ok" };
    case "retry": {
      runner.clearCooldown(msg.market);
      broadcast({ type: "sessions:changed", market: msg.market, session: "unknown" });
      return { type: "ok" };
    }
    case "closeTabs":
      await runner.closeRunnerTabs();
      return { type: "ok" };
    case "openLogins": {
      const sessions = await allSessions();
      const status = runner.runnerStatus();
      const failing = (Object.keys(REAL_DEF_BY_ID) as MarketId[]).filter((m) => sessions[m] === "logged-out" || status.cooldowns[m]?.kind === "logged-out" || status.cooldowns[m]?.kind === "captcha");
      return { type: "openLogins:result", opened: await runner.openLoginTabs(failing) };
    }
    case "focusTab":
      await runner.focusTab(msg.tabId);
      return { type: "ok" };
    case "resolve": {
      const runnerTab = ctx.senderTabId !== undefined && runner.isRunnerTab(ctx.senderTabId);
      let link: { market: MarketId; listingId: string; canonicalUrl: string; name: string } | null = null;
      for (const def of Object.values(REAL_DEF_BY_ID)) {
        const l = def.resolveLink(msg.url);
        if (l) {
          link = { ...l, name: def.meta.name };
          break;
        }
      }
      return { type: "resolve:result", link, runnerTab };
    }
    default:
      return { type: "error", message: TR.unknownRequest };
  }
}

/* ------------------------------------------------------------------------------------------------
 * Ports (web app via content script, popup for long operations)
 * ---------------------------------------------------------------------------------------------- */

const ports = new Map<chrome.runtime.Port, string>();

function safePost(port: chrome.runtime.Port, payload: unknown): void {
  try {
    port.postMessage(payload);
  } catch {
    /* port gone */
  }
}

/** Unsolicited events for every connected page (sent under `event`, never as a reply). */
function broadcast(event: ExtEvent): void {
  for (const port of ports.keys()) safePost(port, { event });
}

chrome.runtime.onConnect.addListener((port) => {
  if (!(port.name === PORT_NAME || port.name.startsWith(`${PORT_NAME}@`))) return;
  const owner = crypto.randomUUID();
  const theirVersion = port.name.includes("@") ? port.name.slice(port.name.indexOf("@") + 1) : null;
  const mismatch = theirVersion !== null && theirVersion !== extVersion();
  ports.set(port, owner);
  port.onMessage.addListener((msg: { id: string; payload: WebToExt }) => {
    if (!msg || typeof msg.id !== "string") return;
    if (mismatch) {
      safePost(port, { id: msg.id, payload: { type: "error", message: TR.versionMismatch } satisfies ExtToWeb });
      return;
    }
    const progress = (market: MarketId, stage: RunStage) => safePost(port, { id: msg.id, progress: { type: "run:progress", market, stage } satisfies RunProgress });
    handle(msg.payload, { owner, requestId: msg.id, progress })
      .then((payload) => safePost(port, { id: msg.id, payload }))
      .catch((e: unknown) => safePost(port, { id: msg.id, payload: { type: "error", message: e instanceof Error ? e.message : String(e) } satisfies ExtToWeb }));
  });
  port.onDisconnect.addListener(() => {
    ports.delete(port);
    const n = runner.cancelOwner(owner);
    if (n) console.info(`[mg] ${n} istek iptal edildi (bağlantı kapandı)`);
  });
});

chrome.runtime.onMessage.addListener((msg: AnyRequest, sender, sendResponse: (r: AnyReply) => void) => {
  handle(msg, sender.tab?.id !== undefined ? { senderTabId: sender.tab.id } : {})
    .then(sendResponse)
    .catch((e: unknown) => sendResponse({ type: "error", message: e instanceof Error ? e.message : String(e) }));
  return true;
});

/* ------------------------------------------------------------------------------------------------
 * Lifecycle: install/update, cookies, kept tabs, notifications
 * ---------------------------------------------------------------------------------------------- */

/** After an update the old content script is orphaned; inject the new one into open app tabs so the page recovers. */
async function reinjectContentScript(): Promise<void> {
  const settings = await loadSettings();
  const patterns = new Set<string>([...APP_ORIGIN_PATTERNS, `${settings.appOrigin}/*`]);
  const tabs = await chrome.tabs.query({ url: [...patterns] }).catch(() => []);
  for (const t of tabs) {
    if (t.id === undefined) continue;
    await chrome.scripting.executeScript({ target: { tabId: t.id }, files: ["content.js"] }).catch(() => undefined);
  }
}

chrome.runtime.onInstalled.addListener(() => {
  void chrome.storage.local.set({ installedAt: new Date().toISOString(), version: extVersion() });
  void reinjectContentScript();
});

chrome.cookies.onChanged.addListener((change) => {
  const c = change.cookie;
  for (const [id, cfg] of Object.entries(MARKET_HOSTS)) {
    if (!cfg?.loginCookie || cfg.loginCookie !== c.name) continue;
    if (!hostMatches(c.domain.replace(/^\./, ""), cfg.host)) continue;
    const market = id as MarketId;
    if (!change.removed && c.value) {
      void runner.markLoggedIn(market).then(() => broadcast({ type: "sessions:changed", market, session: "logged-in" }));
    } else if (change.removed && change.cause !== "overwrite") {
      broadcast({ type: "sessions:changed", market, session: "logged-out" });
    }
  }
});

chrome.tabs.onUpdated.addListener((tabId, info) => {
  if (info.status !== "complete" || !runner.isRunnerTab(tabId)) return;
  void runner.keptTabUpdated(tabId).then((market) => {
    if (market) broadcast({ type: "sessions:changed", market, session: "logged-in" });
  });
});

try {
  chrome.notifications?.onClicked.addListener((id) => {
    const tabId = Number(id.split(":").pop());
    if (Number.isFinite(tabId) && tabId > 0) void runner.focusTab(tabId);
    chrome.notifications.clear(id, () => void chrome.runtime.lastError);
  });
} catch {
  /* no notifications permission */
}
