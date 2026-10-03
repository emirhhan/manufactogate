import { REAL_DEF_BY_ID, TIMING, WAVE1_IDS, type ExtractFailure, type ExtractRequest, type ExtractResult, type RealMarketDef } from "@manufactogate/adapters";
import type { AdapterErrorType, MarketId, SessionState } from "@manufactogate/core";
import { extVersion, hostMatches, loadSettings, marketForUrl, type RunnerStatus, type RunStage, type Settings } from "../shared";
import { TR, translateChromeError } from "./errors";
import { cooldownMessage, MarketLimiter, type Cooldown } from "./limiter";
import { SlotQueue } from "./queue";
import { TabRegistry } from "./tabs";

/**
 * Opens a market page in a background tab inside the user's own session, injects the
 * extract bundle and polls it until results settle. One tab per request; closed afterwards
 * unless the user has to act in it (login, captcha), in which case one tab per market is kept.
 *
 * Request life cycle: cooldown/hourly checks → priority queue (bounded wait) → pacing →
 * open tab → load with retry/fallback → inject → session probe → type/upload → settle.
 */

export interface RunOpts {
  /** Identifies the connection that asked; its disconnect cancels the request. */
  owner?: string;
  /** Envelope id of the request on that connection; `{ type: "cancel", id }` from the page stops exactly this one. */
  requestId?: string;
  signal?: AbortSignal;
  progress?: (stage: RunStage) => void;
  /** Wait in the foreground for the user to solve a visible captcha (default true; health checks pass false). */
  waitForCaptcha?: boolean;
}

type Light = { sig: string; count: number; ready: DocumentReadyState; href: string };
type Payload = Record<string, unknown>;
type LoadOutcome = "ok" | "error-page" | "closed" | "no-permission";

class Cancelled extends Error {
  constructor() {
    super("cancelled");
  }
}

interface Active {
  market: MarketId;
  kind: string;
  stage: RunStage;
  tabId: number | null;
  startedAt: number;
  owner: string | null;
  abort: AbortController;
}

interface Ctx {
  req: ExtractRequest;
  def: RealMarketDef;
  market: MarketId;
  tabId: number;
  signal: AbortSignal;
  settings: Settings;
  timeoutMs: number;
  hardCap: number;
  t0: number;
  active: Active;
  progress: (s: RunStage) => void;
  waitForCaptcha: boolean;
  /** The captcha text marker fired but nothing is on screen: report the page as "unknown" instead. */
  captchaInvisible: boolean;
  keepTab: boolean;
  note?: string;
}

const limiter = new MarketLimiter();
const queue = new SlotQueue(3);
const registry = new TabRegistry();
const actives = new Set<Active>();
/** Abort handles of queued and in-flight requests by `${owner}/${requestId}` (per-request cancel from the page). */
const requests = new Map<string, AbortController>();
const queued: { market: MarketId; kind: string; enqueuedAt: number; owner: string | null }[] = [];
const notified = new Map<string, number>();
const LIMITER_KEY = "mgLimiter";
const TICK_ALARM = "mg-tick";
/** Non-kept tabs older than this with no request attached are leaks and get closed on the next tick. */
const SWEEP_AGE_MS = 10 * 60000;

let initialised: Promise<void> | null = null;

/** Restores mirrored state after a worker (re)start and wires tab/window/alarm listeners. Idempotent. */
export function initRunner(): Promise<void> {
  if (initialised) return initialised;
  initialised = (async () => {
    try {
      const { [LIMITER_KEY]: snap } = await chrome.storage.session.get(LIMITER_KEY);
      limiter.restore(snap as Parameters<MarketLimiter["restore"]>[0]);
    } catch {
      /* no session storage */
    }
    await registry.restore().catch(() => undefined);
    chrome.tabs.onRemoved.addListener((tabId) => registry.onRemoved(tabId));
    chrome.windows.onRemoved.addListener((windowId) => registry.onWindowRemoved(windowId));
    try {
      await chrome.alarms.create(TICK_ALARM, { periodInMinutes: 0.5 });
      chrome.alarms.onAlarm.addListener((a) => {
        if (a.name === TICK_ALARM) void tick();
      });
    } catch {
      /* alarms unavailable */
    }
  })();
  return initialised;
}

/** Periodic housekeeping: mirror the limiter, sweep leaked tabs. Also keeps the worker alive during long waits. */
async function tick(): Promise<void> {
  persistLimiter();
  const inUse = new Set<number>();
  for (const a of actives) if (a.tabId !== null) inUse.add(a.tabId);
  await registry.sweep(SWEEP_AGE_MS, inUse).catch(() => undefined);
}

function persistLimiter(): void {
  void chrome.storage.session.set({ [LIMITER_KEY]: limiter.snapshot() }).catch(() => undefined);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function checkAbort(signal: AbortSignal): void {
  if (signal.aborted) throw new Cancelled();
}

/** Sleeps in short chunks (each with a cheap chrome call to keep the worker alive) and throws on abort. */
async function sleepAbortable(ms: number, signal: AbortSignal): Promise<void> {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    checkAbort(signal);
    const chunk = Math.min(5000, until - Date.now());
    await sleep(chunk);
    if (chunk >= 5000) await chrome.storage.session.get("keepalive").catch(() => undefined);
  }
  checkAbort(signal);
}

async function exec<T>(tabId: number, func: (...args: never[]) => T, args: unknown[] = []): Promise<T> {
  const injection = { target: { tabId }, func, args } as unknown as chrome.scripting.ScriptInjection<[], T>;
  const [r] = await chrome.scripting.executeScript(injection);
  return r?.result as T;
}

type MgxWindow = Window & {
  __mgx?: {
    run: (m: MarketId, k: string) => Payload;
    runLight: (m: MarketId, k: string) => Light;
    typeQuery: (q: string, maxWaitMs?: number, selectors?: string[]) => Promise<string>;
    setImage: (m: MarketId, d: string) => Promise<string>;
    captchaVisible: () => boolean;
    scrollStep: (n: number) => void;
    scrollTop: () => void;
    capture: (m?: string) => string;
  };
};

const fnRun = ((m: MarketId, k: string) => (window as MgxWindow).__mgx?.run(m, k) ?? null) as never;
const fnRunLight = ((m: MarketId, k: string) => (window as MgxWindow).__mgx?.runLight(m, k) ?? null) as never;
const fnType = ((q: string, sels: string[]) => (window as MgxWindow).__mgx?.typeQuery(q, 6000, sels) ?? "no-input") as never;
const fnImage = ((m: MarketId, d: string) => (window as MgxWindow).__mgx?.setImage(m, d) ?? "no-input") as never;
const fnCaptcha = (() => (window as MgxWindow).__mgx?.captchaVisible() ?? false) as never;
const fnScroll = ((n: number) => (window as MgxWindow).__mgx?.scrollStep(n)) as never;
const fnScrollTop = (() => (window as MgxWindow).__mgx?.scrollTop()) as never;
const fnReady = (() => document.readyState) as never;

async function inject(tabId: number, retries = 2): Promise<void> {
  let last: unknown;
  for (let i = 0; i <= retries; i++) {
    try {
      await chrome.scripting.executeScript({ target: { tabId }, files: ["extract.js"] });
      return;
    } catch (e) {
      last = e;
      await sleep(400);
    }
  }
  throw last instanceof Error ? last : new Error(String(last));
}

function classifyExecError(e: unknown): LoadOutcome | "unknown" {
  const m = e instanceof Error ? e.message : String(e);
  if (/showing error page|chrome-error:/i.test(m)) return "error-page";
  if (/No tab with id|tab was closed|Frame with ID \d+ was removed|No frame with id/i.test(m)) return "closed";
  if (/Cannot access|must request permission/i.test(m)) return "no-permission";
  return "unknown";
}

function hostOf(url: string | undefined): string {
  try {
    return url ? new URL(url).hostname : "";
  } catch {
    return "";
  }
}

function isDevHost(host: string): boolean {
  return host === "localhost" || host === "127.0.0.1";
}

/**
 * Waits for the tab to finish loading. Heavy market pages may never report "complete", so after
 * `softMs` an interactive document is accepted. A Chrome error page also reports "complete";
 * it is detected by probing the document, so both the first load and later navigations share it.
 */
async function waitForLoad(tabId: number, timeoutMs: number, signal: AbortSignal, softMs = 6000): Promise<LoadOutcome> {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    checkAbort(signal);
    const tab = await chrome.tabs.get(tabId).catch(() => null);
    if (!tab) return "closed";
    const soft = Date.now() - t0 > softMs;
    if (tab.status === "complete" || soft) {
      try {
        const ready = await exec<string>(tabId, fnReady);
        if (tab.status === "complete" || ready === "interactive" || ready === "complete") return "ok";
      } catch (e) {
        const c = classifyExecError(e);
        if (c !== "unknown") return c;
      }
    }
    await sleep(150);
  }
  return "ok"; // proceed anyway; extraction will report what it finds
}

/** After tabs.update({url}) the old page may still report "complete"; wait for the navigation to start. */
async function awaitNavigationStart(tabId: number, before: string | undefined, ms: number): Promise<void> {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    const tab = await chrome.tabs.get(tabId).catch(() => null);
    if (!tab) return;
    if (tab.status === "loading" || (tab.url && tab.url !== before) || tab.pendingUrl) return;
    await sleep(100);
  }
}

/** Load with bounded retries (1.5 s, 4 s) on Chrome error pages (DNS hiccup, transient failure). */
async function loadWithRetry(ctx: Ctx, url: string, alreadyNavigating: boolean): Promise<LoadOutcome> {
  const backoff = [1500, 4000];
  const budget = () => Math.max(4000, Math.min(20000, ctx.hardCap - Date.now()));
  if (!alreadyNavigating) {
    const before = (await chrome.tabs.get(ctx.tabId).catch(() => null))?.url;
    await chrome.tabs.update(ctx.tabId, { url });
    await awaitNavigationStart(ctx.tabId, before, 1500);
  }
  let outcome = await waitForLoad(ctx.tabId, budget(), ctx.signal);
  for (let i = 0; outcome === "error-page" && i < backoff.length; i++) {
    await sleepAbortable(backoff[i]!, ctx.signal);
    const before = (await chrome.tabs.get(ctx.tabId).catch(() => null))?.url;
    await chrome.tabs.update(ctx.tabId, { url }).catch(() => undefined);
    await awaitNavigationStart(ctx.tabId, before, 1500);
    outcome = await waitForLoad(ctx.tabId, budget(), ctx.signal);
  }
  return outcome;
}

function failure(error: AdapterErrorType, message: string, finalUrl?: string, extra: Record<string, unknown> = {}): ExtractFailure {
  return { ok: false, error, message, ...(finalUrl ? { finalUrl } : {}), ...extra } as ExtractFailure;
}

function loginUrlOf(def: RealMarketDef): string {
  return def.meta.loginUrl ?? def.humanSearchHome ?? `https://${(def.meta.hosts[0] ?? "").replace(/^\*\./, "www.")}/`;
}

/** Instant reply for a market on cooldown; mirrors the shape of the original outcome so the web UI behaves the same. */
function cooldownReply(def: RealMarketDef, cd: Cooldown): ExtractResult | ExtractFailure {
  const msg = cooldownMessage(def.meta.name, cd);
  if (cd.kind === "logged-out" || cd.kind === "captcha") {
    const kept = registry.keptFor(def.id);
    const url = cd.url ?? kept?.url ?? loginUrlOf(def);
    return {
      ok: true,
      data: { session: cd.kind, items: [], strategy: "none", loginUrl: loginUrlOf(def), cooldownUntil: cd.until, note: msg, ...(kept ? { keptTabId: kept.tabId } : {}) },
      finalUrl: url,
      tookMs: 0,
    };
  }
  return failure(cd.kind === "rate" ? "RateLimited" : "Network", msg, undefined, { cooldownUntil: cd.until });
}

function notify(key: string, message: string, settings: Settings, tabId?: number): void {
  if (!settings.notifications) return;
  const last = notified.get(key) ?? 0;
  if (Date.now() - last < 10 * 60000) return;
  notified.set(key, Date.now());
  try {
    chrome.notifications?.create(`mg:${key}:${tabId ?? 0}`, { type: "basic", iconUrl: "icons/128.png", title: "Manufactogate", message }, () => void chrome.runtime.lastError);
  } catch {
    /* no notifications permission */
  }
}

async function probeSession(ctx: Ctx): Promise<SessionState> {
  const d = await exec<Payload | null>(ctx.tabId, fnRun, [ctx.market, "health"]).catch(() => null);
  const s = d?.["session"];
  return s === "logged-in" || s === "logged-out" || s === "captcha" ? s : "unknown";
}

async function currentUrl(ctx: Ctx): Promise<string> {
  return (await chrome.tabs.get(ctx.tabId).catch(() => null))?.url ?? ctx.req.url;
}

/** Is the user looking at this tab (active tab of a focused window that is not the runner's own)? */
async function userWatching(tab: chrome.tabs.Tab): Promise<boolean> {
  if (!tab.active) return false;
  if (tab.windowId === undefined) return true;
  if (registry.windowId !== null && tab.windowId === registry.windowId) {
    const w = await chrome.windows.get(tab.windowId).catch(() => null);
    return !!w?.focused && (w.state !== "minimized");
  }
  const w = await chrome.windows.get(tab.windowId).catch(() => null);
  return w ? !!w.focused : true;
}

async function scrollToTop(tabId: number): Promise<void> {
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  if (!tab || (await userWatching(tab))) return;
  await exec<void>(tabId, fnScrollTop).catch(() => undefined);
}

/**
 * Login and captcha walls. Logged-out: keep the tab in the background (no focus steal), put the
 * market on cooldown, tell the user once. Captcha: only when something is actually on screen; then
 * bring the tab forward and wait for the user, continuing as soon as the wall disappears.
 * Returns the reply to send, or null when extraction may continue.
 */
async function handleWall(ctx: Ctx, session: SessionState): Promise<ExtractResult | null> {
  const { def, market } = ctx;
  const name = def.meta.name;
  if (session === "logged-out") {
    const url = await currentUrl(ctx);
    await scrollToTop(ctx.tabId);
    await registry.keep(ctx.tabId, market, "logged-out", url);
    ctx.keepTab = true;
    limiter.setCooldown(market, "logged-out", undefined, url);
    persistLimiter();
    notify(`login:${market}`, TR.loginNotification(name), ctx.settings, ctx.tabId);
    return { ok: true, data: { session: "logged-out", items: [], strategy: "none", loginUrl: loginUrlOf(def), keptTabId: ctx.tabId }, finalUrl: url, tookMs: Date.now() - ctx.t0 };
  }
  if (session !== "captcha") return null;
  const visible = await exec<boolean>(ctx.tabId, fnCaptcha).catch(() => false);
  if (!visible) {
    ctx.captchaInvisible = true;
    return null;
  }
  ctx.captchaInvisible = false;
  const waitMs = ctx.waitForCaptcha ? ctx.settings.captchaWaitMs : 0;
  if (waitMs > 0) {
    ctx.progress("captcha");
    ctx.active.stage = "captcha";
    await scrollToTop(ctx.tabId);
    const backTo = await registry.focus(ctx.tabId);
    notify(`captcha:${market}`, TR.captchaNotification(name), ctx.settings, ctx.tabId);
    const until = Date.now() + waitMs;
    ctx.hardCap = Math.max(ctx.hardCap, until + ctx.timeoutMs + 10000);
    while (Date.now() < until) {
      await sleepAbortable(1500, ctx.signal);
      const d = await exec<Payload | null>(ctx.tabId, fnRun, [market, "health"]).catch(() => null);
      if (d === null) {
        await inject(ctx.tabId, 0).catch(() => undefined);
        continue;
      }
      if (d["session"] !== "captcha") {
        // Solved: send the user back to ManufactoGate; the market tab keeps working in the background.
        await registry.back(backTo);
        // The settle budget restarts from now, not from the fixed wait mark.
        ctx.hardCap = Date.now() + ctx.timeoutMs + 30000;
        ctx.progress("settling");
        ctx.active.stage = "settling";
        return null;
      }
      const stillVisible = await exec<boolean>(ctx.tabId, fnCaptcha).catch(() => true);
      if (!stillVisible) {
        await registry.back(backTo);
        ctx.captchaInvisible = true;
        ctx.hardCap = Date.now() + ctx.timeoutMs + 30000;
        return null;
      }
    }
  }
  const url = await currentUrl(ctx);
  await registry.keep(ctx.tabId, market, "captcha", url);
  ctx.keepTab = true;
  limiter.setCooldown(market, "captcha", undefined, url);
  persistLimiter();
  return { ok: true, data: { session: "captcha", items: [], strategy: "none", keptTabId: ctx.tabId }, finalUrl: url, tookMs: Date.now() - ctx.t0 };
}

/** Polls the page until results settle; adaptive scroll pass for infinite grids; fast exit on genuinely empty pages. */
async function settle(ctx: Ctx): Promise<ExtractResult | ExtractFailure> {
  const { req, market, tabId, def } = ctx;
  const start = Date.now();
  let deadline = Math.min(start + ctx.timeoutMs, ctx.hardCap);
  const want = req.want ?? 30;
  const maxScroll = 12;
  let lastSig = "";
  let stable = 0;
  let full: Payload | null = null;
  let nullStreak = 0;
  let scrollIdx = 0;
  let lastScrollCount = -1;
  let scrollStalls = 0;
  let completeAt: number | null = null;
  let captchaChecked = false;
  ctx.progress("settling");
  ctx.active.stage = "settling";

  const ok = (data: Payload, finalUrl: string): ExtractResult => {
    if (data["session"] === "captcha" && ctx.captchaInvisible) data = { ...data, session: "unknown" };
    if (ctx.note) data = { ...data, note: ctx.note };
    return { ok: true, data, finalUrl, tookMs: Date.now() - ctx.t0 };
  };

  while (Date.now() < deadline) {
    checkAbort(ctx.signal);
    const tab = await chrome.tabs.get(tabId).catch(() => null);
    if (!tab) return failure("Network", TR.tabClosed, req.url);
    const finalUrl = tab.url ?? req.url;
    const watched = await userWatching(tab);
    let light: Light | null = null;
    let execErr: unknown = null;
    try {
      light = await exec<Light | null>(tabId, fnRunLight, [market, req.kind]);
    } catch (e) {
      execErr = e;
    }
    if (light == null) {
      nullStreak++;
      const c = execErr ? classifyExecError(execErr) : "unknown";
      if (c === "closed") return failure("Network", TR.tabClosed, finalUrl);
      if (c === "error-page") return failure("Network", TR.pageLoad, finalUrl);
      if (c === "no-permission") {
        const host = hostOf(finalUrl);
        if (!isDevHost(host) && !def.meta.hosts.some((h) => hostMatches(host, h))) return failure("Network", TR.noPermission(host), finalUrl);
      }
      if (nullStreak >= 6) return failure("Network", TR.injectFailed, finalUrl);
      await inject(tabId, 0).catch(() => undefined);
      await sleepAbortable(500, ctx.signal);
      continue;
    }
    nullStreak = 0;
    if (light.ready === "complete" && completeAt === null) completeAt = Date.now();
    const changed = light.sig !== lastSig;
    if (changed || !full) {
      full = await exec<Payload | null>(tabId, fnRun, [market, req.kind]).catch(() => null);
      if (!full) {
        await sleepAbortable(400, ctx.signal);
        continue;
      }
    }
    const data = full;
    const session = data["session"] as SessionState | undefined;
    const items = (data["items"] as unknown[] | undefined) ?? [];
    const detail = data["detail"] ?? data["supplier"];
    const usable = items.length > 0 || !!detail;

    if (session === "logged-out") {
      const wall = await handleWall(ctx, "logged-out");
      if (wall) return wall;
    }
    if (session === "captcha" && !captchaChecked) {
      captchaChecked = true;
      if (usable) {
        // Evidence of a working page beats a text marker; only a captcha on screen is a wall.
        const visible = await exec<boolean>(tabId, fnCaptcha).catch(() => false);
        if (!visible) ctx.captchaInvisible = true;
      } else {
        const wall = await handleWall(ctx, "captcha");
        if (wall) return wall;
        deadline = Math.min(Date.now() + ctx.timeoutMs, ctx.hardCap);
        lastSig = "";
        full = null;
        continue;
      }
    }
    if (req.kind === "health" && (usable || light.ready === "complete" || Date.now() - start > 2500)) return ok(data, finalUrl);
    if (req.quick && (usable || (light.ready === "complete" && stable >= 1) || Date.now() - start > 4000)) return ok(data, finalUrl);
    // A DOM-fallback detail reading may precede the page's embedded state; give it a moment to arrive.
    const detailStrategy = detail ? (detail as Record<string, unknown>)["strategy"] : null;
    const detailReady = !detail || (detailStrategy !== "dom" ? true : light.ready === "complete" && stable >= 2 && Date.now() - start >= 4000);
    if (req.kind !== "search" && detail && detailReady) return ok(data, finalUrl);
    if (req.kind === "search" && items.length >= want) return ok(data, finalUrl);

    // Adaptive scroll pass (background tab only): keep stepping while cards keep appearing.
    if (req.kind === "search" && !req.quick && !watched && items.length > 0 && scrollIdx < maxScroll && scrollStalls < 2) {
      if (items.length > lastScrollCount) scrollStalls = 0;
      else scrollStalls++;
      lastScrollCount = items.length;
      if (scrollStalls < 2) {
        await exec<void>(tabId, fnScroll, [scrollIdx + 1]).catch(() => undefined);
        scrollIdx++;
      }
    }
    stable = changed ? 0 : stable + 1;
    lastSig = light.sig;
    const scrollDone = req.kind !== "search" || req.quick === true || watched || scrollStalls >= 2 || scrollIdx >= maxScroll;
    if (usable && stable >= 2 && scrollDone && detailReady) return ok(data, finalUrl);
    // Genuinely empty page: the document is complete and nothing has changed for a while.
    if (!usable && completeAt !== null && stable >= 3 && Date.now() - completeAt >= 6000) return ok(data, finalUrl);
    const elapsed = Date.now() - start;
    await sleepAbortable(elapsed < 3000 ? 500 : elapsed < 10000 ? 1000 : 1500, ctx.signal);
  }
  await inject(tabId, 0).catch(() => undefined);
  const data = (await exec<Payload | null>(tabId, fnRun, [market, req.kind]).catch(() => null)) ?? full ?? { session: "unknown", items: [], strategy: "none" };
  return ok(data, await currentUrl(ctx));
}

/** Types the query into the site's own search box; falls back to the search URL when the box or the submit does not work. */
async function typePhase(ctx: Ctx, query: string): Promise<ExtractResult | ExtractFailure | null> {
  const { def, tabId } = ctx;
  ctx.progress("typing");
  ctx.active.stage = "typing";
  await sleepAbortable(500 + Math.random() * 500, ctx.signal);
  const before = await currentUrl(ctx);
  // executeScript resolves `undefined` (or rejects) when the page navigates while the typing routine is still pending.
  const r = (await exec<string | undefined>(tabId, fnType, [query, ctx.req.searchBox ?? []]).catch((e: unknown) => (/navigat|frame|removed|context|destroyed|closed/i.test(String(e)) ? "ok-nav" : "no-input"))) ?? "ok";
  let navigated = r === "ok-nav";
  if (!navigated && r !== "no-input") {
    for (let i = 0; i < 16 && !navigated; i++) {
      await sleepAbortable(500, ctx.signal);
      const now = (await chrome.tabs.get(tabId).catch(() => null))?.url;
      if (now && now !== before) navigated = true;
    }
  }
  let load: LoadOutcome;
  if (navigated) {
    load = await loadWithRetry(ctx, before, true);
    // The market told us what a results URL looks like: a home/interstitial page after Enter is not one.
    const expect = ctx.req.expectUrl ? safeRegex(ctx.req.expectUrl) : null;
    const landed = await currentUrl(ctx);
    if (load === "ok" && expect && !expect.test(landed)) {
      const alt = def.searchUrl(query);
      if (alt !== landed) {
        ctx.note = TR.searchNotNavigated;
        load = await loadWithRetry(ctx, alt, false);
      }
    }
  } else {
    // Not submitted (no box, or the site swallowed Enter): the search URL is the human-independent path.
    const alt = def.searchUrl(query);
    if (r === "no-input") ctx.note = TR.searchBoxMissing;
    if (alt === before) return null;
    load = await loadWithRetry(ctx, alt, false);
  }
  if (load === "closed") return failure("Network", TR.tabClosed, before);
  if (load === "no-permission") return failure("Network", TR.noPermission(hostOf(await currentUrl(ctx))), before);
  if (load === "error-page") return failure("Network", TR.pageLoad, before);
  await inject(tabId);
  return handleWall(ctx, await probeSession(ctx));
}

/** Downscales the query image once per request so repeated injections do not push a multi-MB string around. */
async function downscaleDataUrl(dataUrl: string, max = 1024): Promise<string> {
  try {
    if (dataUrl.length < 400000) return dataUrl;
    const blob = await (await fetch(dataUrl)).blob();
    const bmp = await createImageBitmap(blob);
    const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
    if (scale >= 1) return dataUrl;
    const w = Math.round(bmp.width * scale);
    const h = Math.round(bmp.height * scale);
    const canvas = new OffscreenCanvas(w, h);
    canvas.getContext("2d")?.drawImage(bmp, 0, 0, w, h);
    const out = await canvas.convertToBlob({ type: "image/jpeg", quality: 0.88 });
    return await blobToDataUrl(out);
  } catch {
    return dataUrl;
  }
}

async function imagePhase(ctx: Ctx, dataUrl: string): Promise<ExtractResult | ExtractFailure | null> {
  const { market, tabId } = ctx;
  ctx.progress("image");
  ctx.active.stage = "image";
  const img = await downscaleDataUrl(dataUrl);
  const before = await currentUrl(ctx);
  const r = await exec<string>(tabId, fnImage, [market, img]).catch((e: unknown) => (/navigat|frame|removed|context|destroyed|closed/i.test(String(e)) ? "ok" : "no-input"));
  if (r === "no-input") return failure("NotFound", TR.imageInputMissing, before);
  if (r === "no-reaction") return failure("NotFound", TR.imageNoReaction, before);
  // Uploads take a moment; pasted images usually trigger a navigation to the result page.
  await sleepAbortable(r === "ok-paste" ? 2500 : 1500, ctx.signal);
  for (let i = 0; i < 10; i++) {
    const now = (await chrome.tabs.get(tabId).catch(() => null))?.url;
    if (now && now !== before) break;
    await sleepAbortable(500, ctx.signal);
  }
  const load = await loadWithRetry(ctx, before, true);
  if (load === "closed") return failure("Network", TR.tabClosed, before);
  await inject(tabId).catch(() => undefined);
  return handleWall(ctx, await probeSession(ctx));
}

function safeRegex(src: string): RegExp | null {
  try {
    return new RegExp(src, "i");
  } catch {
    return null;
  }
}

function priorityOf(req: ExtractRequest): number {
  if (req.kind === "detail" || req.kind === "supplier") return 0;
  if (WAVE1_IDS.has(req.market) || req.kind === "health") return 1;
  return 2;
}

export async function runExtract(req: ExtractRequest, opts: RunOpts = {}): Promise<ExtractResult | ExtractFailure> {
  await initRunner();
  const market = req.market;
  const def = REAL_DEF_BY_ID[market];
  if (!def) return failure("NotFound", TR.noAdapter, req.url);
  const name = def.meta.name;
  const settings = await loadSettings();
  queue.setMax(settings.maxParallelTabs);
  const progress = opts.progress ?? (() => undefined);

  const cd = limiter.cooldown(market);
  if (cd) return cooldownReply(def, cd);
  const maxPerHour = settings.rateLimit[market]?.maxPerHour ?? def.meta.rateLimit.maxPerHour;
  const block = limiter.hourlyBlock(market, maxPerHour);
  if (block) {
    limiter.setCooldown(market, "rate", block.retryInMs);
    persistLimiter();
    return failure("RateLimited", TR.hourlyCap(name, block.count, maxPerHour, formatMs(block.retryInMs)));
  }

  const ac = new AbortController();
  if (opts.signal) {
    if (opts.signal.aborted) ac.abort();
    else opts.signal.addEventListener("abort", () => ac.abort(), { once: true });
  }
  // Budgets come from the shared TIMING table so the web bridge and the core deadline agree with them.
  const timeoutMs = req.timeoutMs ?? TIMING.settleMs[req.kind] ?? TIMING.settleMs.search;
  const owner = opts.owner ?? null;
  const requestKey = owner !== null && opts.requestId ? `${owner}/${opts.requestId}` : null;
  if (requestKey) requests.set(requestKey, ac);
  const qEntry = { market, kind: req.kind, enqueuedAt: Date.now(), owner };
  queued.push(qEntry);
  progress("queued");
  let got: Awaited<ReturnType<SlotQueue["acquire"]>>;
  try {
    got = await queue.acquire({ priority: priorityOf(req), budgetMs: TIMING.queueBudgetMs, signal: ac.signal, label: owner ?? "" });
  } finally {
    queued.splice(queued.indexOf(qEntry), 1);
  }
  if (got !== "ok") {
    if (requestKey) requests.delete(requestKey);
    progress("done");
    if (got === "aborted") return failure("Network", TR.cancelled, req.url);
    return failure("RateLimited", TR.queueFull(name), req.url);
  }

  const active: Active = { market, kind: req.kind, stage: "opening", tabId: null, startedAt: Date.now(), owner, abort: ac };
  actives.add(active);
  const t0 = Date.now();
  let tabId: number | undefined;
  let ctx: Ctx | null = null;
  try {
    const minInterval = (settings.rateLimit[market]?.minIntervalMs ?? def.meta.rateLimit.minIntervalMs) * settings.tempo;
    const wait = limiter.intervalWait(market, minInterval);
    if (wait > 0) await sleepAbortable(wait, ac.signal);
    checkAbort(ac.signal);
    limiter.stamp(market);
    persistLimiter();
    progress("opening");
    tabId = await registry.open(req.url, market, req.kind, { separateWindow: settings.separateWindow, owner });
    active.tabId = tabId;
    ctx = {
      req,
      def,
      market,
      tabId,
      signal: ac.signal,
      settings,
      timeoutMs,
      hardCap: t0 + timeoutMs + TIMING.runSlackMs,
      t0,
      active,
      progress,
      waitForCaptcha: req.quick ? false : (opts.waitForCaptcha ?? true),
      captchaInvisible: false,
      keepTab: false,
    };
    progress("loading");
    active.stage = "loading";
    let url = req.url;
    let typeQuery = req.typeQuery;
    let load = await loadWithRetry(ctx, url, true);
    if (load === "error-page" && typeQuery) {
      // The human-like home page failed to load; the market's search URL is a different host path and may work.
      const alt = def.searchUrl(typeQuery);
      if (alt !== url) {
        url = alt;
        typeQuery = undefined;
        load = await loadWithRetry(ctx, url, false);
      }
    }
    if (load === "closed") return failure("Network", TR.tabClosed, url);
    if (load === "no-permission") return failure("Network", TR.noPermission(hostOf(await currentUrl(ctx))), url);
    if (load === "error-page") return failure("Network", TR.pageLoad, url);
    await inject(tabId);
    const wall = await handleWall(ctx, await probeSession(ctx));
    if (wall) return wall;
    if (typeQuery) {
      const r = await typePhase(ctx, typeQuery);
      if (r) return r;
    }
    if (req.imageDataUrl) {
      const r = await imagePhase(ctx, req.imageDataUrl);
      if (r) return r;
    }
    return await settle(ctx);
  } catch (e) {
    if (e instanceof Cancelled || ac.signal.aborted) return failure("Network", TR.cancelled, req.url, { stage: active.stage });
    const t = translateChromeError(e instanceof Error ? e.message : String(e));
    return failure(t.type, t.text, req.url, { stage: active.stage });
  } finally {
    actives.delete(active);
    if (requestKey) requests.delete(requestKey);
    queue.release();
    progress("done");
    if (tabId !== undefined && !(ctx?.keepTab ?? false)) await registry.close(tabId);
  }
}

function formatMs(ms: number): string {
  const m = Math.ceil(ms / 60000);
  return m >= 1 ? `${m} dk` : `${Math.ceil(ms / 1000)} sn`;
}

/** Wraps runExtract so outcomes feed the cooldown bookkeeping (success clears, network failures accumulate). */
export async function runTracked(req: ExtractRequest, opts: RunOpts = {}): Promise<ExtractResult | ExtractFailure> {
  const r = await runExtract(req, opts);
  const market = req.market;
  if (r.ok) {
    const s = (r.data as Payload)["session"];
    if (s !== "logged-out" && s !== "captcha") limiter.success(market);
  } else if (r.error === "Network" && r.message !== TR.cancelled && !/cooldownUntil/.test(JSON.stringify(r))) {
    limiter.networkFailure(market);
    persistLimiter();
  }
  return r;
}

/** Cancels every queued and in-flight request of a connection (the web page closed or refreshed). */
export function cancelOwner(owner: string): number {
  let n = queue.cancelWhere((l) => l === owner);
  for (const a of actives) {
    if (a.owner === owner) {
      a.abort.abort();
      n++;
    }
  }
  return n;
}

/** Cancels one request of a connection (the page's AbortSignal fired); false when it is not running any more. */
export function cancelRequest(owner: string, requestId: string): boolean {
  const ac = requests.get(`${owner}/${requestId}`);
  if (!ac) return false;
  ac.abort();
  return true;
}

export function cancelAll(): number {
  let n = queue.cancelWhere(() => true);
  for (const a of actives) {
    a.abort.abort();
    n++;
  }
  return n;
}

/** "I logged in / solved it, try now": clears the cooldown; the kept tab is released to the user. */
export function clearCooldown(market: MarketId): boolean {
  const had = limiter.clearCooldown(market);
  persistLimiter();
  return had;
}

/** A login cookie appeared: clear the cooldown and let go of the kept tab (closed when it is in the background). */
export async function markLoggedIn(market: MarketId): Promise<boolean> {
  const had = limiter.clearCooldown(market);
  persistLimiter();
  const kept = registry.keptFor(market);
  if (kept) {
    const tab = await chrome.tabs.get(kept.tabId).catch(() => null);
    if (tab?.active) registry.release(kept.tabId);
    else await registry.close(kept.tabId);
  }
  return had || !!kept;
}

/** A kept tab navigated: probe it; when the wall is gone the market is free again. */
export async function keptTabUpdated(tabId: number): Promise<MarketId | null> {
  const rec = registry.get(tabId);
  if (!rec?.kept) return null;
  try {
    await inject(tabId, 0);
    const d = await exec<Payload | null>(tabId, fnRun, [rec.market, "health"]);
    const s = d?.["session"];
    if (s === "logged-out" || s === "captcha") return null;
    if (s === "unknown" && rec.session === "logged-out") {
      // Still unsure; only a visible captcha going away counts for captcha walls, login walls need a clearer signal.
      const url = (await chrome.tabs.get(tabId).catch(() => null))?.url ?? "";
      if (/login|signin|passport|giris|auth/i.test(url)) return null;
    }
  } catch {
    return null;
  }
  limiter.clearCooldown(rec.market);
  persistLimiter();
  registry.release(tabId);
  return rec.market;
}

export function isRunnerTab(tabId: number): boolean {
  return registry.has(tabId);
}

export async function closeRunnerTabs(): Promise<number> {
  cancelAll();
  return registry.closeAll({ includeKept: true });
}

export async function focusTab(tabId: number): Promise<void> {
  await registry.focus(tabId);
}

/** Opens (or focuses) one login tab per market that is logged-out or on a login cooldown. */
export async function openLoginTabs(markets: MarketId[]): Promise<MarketId[]> {
  const settings = await loadSettings();
  const opened: MarketId[] = [];
  for (const m of markets) {
    const def = REAL_DEF_BY_ID[m];
    if (!def) continue;
    const kept = registry.keptFor(m);
    if (kept) {
      await registry.focus(kept.tabId);
      opened.push(m);
      continue;
    }
    const tabId = await registry.open(loginUrlOf(def), m, "login", { separateWindow: settings.separateWindow }).catch(() => undefined);
    if (tabId === undefined) continue;
    await registry.keep(tabId, m, "logged-out", loginUrlOf(def));
    opened.push(m);
  }
  return opened;
}

export function runnerStatus(): RunnerStatus {
  const now = Date.now();
  const cooldowns: RunnerStatus["cooldowns"] = {};
  for (const [m, cd] of limiter.allCooldowns()) {
    const def = REAL_DEF_BY_ID[m];
    cooldowns[m] = { kind: cd.kind, until: cd.until, message: cooldownMessage(def?.meta.name ?? m, cd, now) };
  }
  const keptTabs: RunnerStatus["keptTabs"] = {};
  for (const r of registry.keptAll()) keptTabs[r.market] = { tabId: r.tabId, url: r.url, session: r.session ?? "unknown" };
  return {
    version: extVersion(),
    maxParallelTabs: queue.getMax(),
    windowId: registry.windowId,
    queued: queued.map((q) => ({ market: q.market, kind: q.kind, waitedMs: now - q.enqueuedAt })),
    active: [...actives].map((a) => ({ market: a.market, kind: a.kind, stage: a.stage, tabId: a.tabId, elapsedMs: now - a.startedAt })),
    cooldowns,
    keptTabs,
    runnerTabs: registry.count(),
  };
}

const HOSTS_BY_ID: Record<string, string[]> = Object.fromEntries(Object.values(REAL_DEF_BY_ID).map((d) => [d.id, d.meta.hosts]));

/** Captures the HTML of the currently active tab for calibration fixtures. */
export async function captureActiveTab(): Promise<{ html: string; url: string; market: MarketId | null }> {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab?.id || !tab.url) throw new Error("Aktif sekme yok");
  const market = marketForUrl(tab.url, HOSTS_BY_ID);
  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["extract.js"] });
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    if (/Cannot access|must request permission/i.test(m)) throw new Error(`Bu sayfaya erişim izni yok; ${hostOf(tab.url)} eklenti izin listesinde değil`);
    throw new Error(translateChromeError(m).text);
  }
  const html = await exec<string>(tab.id, ((m?: string) => (window as MgxWindow).__mgx?.capture(m) ?? "") as never, [market ?? "unknown"]);
  return { html, url: tab.url, market };
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let bin = "";
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return `data:${blob.type || "image/jpeg"};base64,${btoa(bin)}`;
}

/** Fetches a market image with the extension's host permissions and returns it as a data URL. */
export async function fetchImageAsDataUrl(url: string): Promise<string> {
  const res = await fetch(url, { credentials: "omit", cache: "force-cache" });
  if (!res.ok) throw new Error(`Görsel alınamadı (${res.status})`);
  return blobToDataUrl(await res.blob());
}
