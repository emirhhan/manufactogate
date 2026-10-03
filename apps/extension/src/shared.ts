import type { HealthResult, MarketId, SessionState } from "@manufactogate/core";
import type { ExtToWeb, RunStage as ProtocolRunStage, WebToExt } from "@manufactogate/adapters";

/**
 * Shared helpers and types for the extension's module contexts (background, popup).
 * Classic scripts (content, overlay) cannot import; they duplicate the few constants they need.
 */

/** Version comes from the manifest so it lives in exactly one place. */
export function extVersion(): string {
  try {
    return chrome.runtime.getManifest().version;
  } catch {
    return "0.0.0";
  }
}

/** Does `host` fall under a market host pattern such as "*.auctions.yahoo.co.jp" or "1688.com"? */
export function hostMatches(host: string, pattern: string): boolean {
  const base = pattern.replace(/^\*\./, "").toLowerCase();
  const h = host.toLowerCase().replace(/:\d+$/, "");
  return h === base || h.endsWith("." + base);
}

/** Finds the market whose declared hosts cover the URL, or null. */
export function marketForUrl(url: string, hostsById: Record<string, string[]>): MarketId | null {
  let host = "";
  try {
    host = new URL(url).hostname;
  } catch {
    return null;
  }
  for (const [id, hosts] of Object.entries(hostsById)) {
    if (hosts.some((h) => hostMatches(host, h))) return id as MarketId;
  }
  return null;
}

/**
 * Login-cookie heuristics for quick session display in the popup (no tab needed).
 * `loginCookie` names are heuristics observed in logged-in browsers; a missing cookie never
 * blocks a search, it only drives the popup dot and the cookie-change listener.
 */
export const MARKET_HOSTS: Partial<Record<MarketId, { host: string; loginCookie?: string }>> = {
  "cn-1688": { host: "1688.com", loginCookie: "cookie2" },
  "cn-taobao": { host: "taobao.com", loginCookie: "cookie2" },
  "cn-pinduoduo": { host: "yangkeduo.com", loginCookie: "PDDAccessToken" },
  "tr-trendyol": { host: "trendyol.com" },
  "cn-alibaba": { host: "alibaba.com", loginCookie: "xman_us_t" },
  "cn-aliexpress": { host: "aliexpress.com", loginCookie: "xman_us_t" },
  "tr-hepsiburada": { host: "hepsiburada.com" },
  "tr-n11": { host: "n11.com" },
  "tr-amazon": { host: "amazon.com.tr", loginCookie: "x-main" },
  "de-amazon": { host: "amazon.de", loginCookie: "x-main" },
  "us-amazon": { host: "amazon.com", loginCookie: "x-main" },
  "gb-amazon": { host: "amazon.co.uk", loginCookie: "x-main" },
  "id-shopee": { host: "shopee.co.id", loginCookie: "SPC_U" },
};

/** Local origins the app may run on (vite dev 5173, vite preview 4173); must match manifest.json. */
export const APP_ORIGIN_PATTERNS: readonly string[] = ["http://localhost:5173/*", "http://127.0.0.1:5173/*", "http://localhost:4173/*", "http://127.0.0.1:4173/*"];

/** Bare host for a market: the stored heuristic host, else the first declared host without its wildcard. */
export function marketHost(id: MarketId, hosts: string[]): string {
  return MARKET_HOSTS[id]?.host ?? (hosts[0] ?? "").replace(/^\*\./, "");
}

export interface Settings {
  /** How many market tabs may be open at once (1-6). */
  maxParallelTabs: number;
  /** Open market tabs in a dedicated, unfocused window instead of the user's current one. */
  separateWindow: boolean;
  /** How long to wait for the user to solve a visible captcha (ms). */
  captchaWaitMs: number;
  /** Where the Manufactogate web app lives; used by the overlay and the popup. */
  appOrigin: string;
  /** Multiplier applied to every market's minimum interval (1 = normal, 2 = gentle, 4 = very gentle). */
  tempo: number;
  /** Per-market overrides for the rate limit. */
  rateLimit: Partial<Record<MarketId, { minIntervalMs?: number; maxPerHour?: number }>>;
  /** Show the overlay button on market product pages (global switch). */
  overlay: boolean;
  /** Per-site overlay switch keyed by bare market host ("trendyol.com"); missing means on. */
  overlaySites: Partial<Record<string, boolean>>;
  /** Show a system notification when a market needs the user (captcha, login). */
  notifications: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  maxParallelTabs: 3,
  separateWindow: true,
  captchaWaitMs: 300000,
  appOrigin: "http://localhost:5173",
  tempo: 1,
  rateLimit: {},
  overlay: true,
  overlaySites: {},
  notifications: true,
};

/** Sanitises a per-market rate-limit override: positive finite numbers only, empty entries dropped. */
export function normalizeRateLimit(raw: unknown): Settings["rateLimit"] {
  const out: Settings["rateLimit"] = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [market, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!v || typeof v !== "object") continue;
    const o = v as { minIntervalMs?: unknown; maxPerHour?: unknown };
    const entry: { minIntervalMs?: number; maxPerHour?: number } = {};
    if (typeof o.minIntervalMs === "number" && Number.isFinite(o.minIntervalMs) && o.minIntervalMs >= 0) entry.minIntervalMs = Math.min(600000, Math.round(o.minIntervalMs));
    if (typeof o.maxPerHour === "number" && Number.isFinite(o.maxPerHour) && o.maxPerHour >= 1) entry.maxPerHour = Math.min(10000, Math.round(o.maxPerHour));
    if (Object.keys(entry).length) out[market as MarketId] = entry;
  }
  return out;
}

/** Sanitises per-site overlay switches: only explicit `false` entries are kept (on is the default). */
export function normalizeOverlaySites(raw: unknown): Settings["overlaySites"] {
  const out: Settings["overlaySites"] = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [host, v] of Object.entries(raw as Record<string, unknown>)) if (v === false && /^[a-z0-9.-]+$/i.test(host)) out[host.toLowerCase()] = false;
  return out;
}

/** Whether the overlay may mount on `hostname` (global switch and per-site switches). Pure. */
export function overlayAllowed(hostname: string, settings: Pick<Settings, "overlay" | "overlaySites">): boolean {
  if (!settings.overlay) return false;
  const h = hostname.toLowerCase();
  for (const [site, on] of Object.entries(settings.overlaySites)) if (on === false && hostMatches(h, site)) return false;
  return true;
}

export function normalizeSettings(raw: unknown): Settings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<Settings>;
  const num = (v: unknown, d: number, min: number, max: number) => {
    const n = typeof v === "number" && Number.isFinite(v) ? v : d;
    return Math.min(max, Math.max(min, n));
  };
  return {
    maxParallelTabs: Math.round(num(r.maxParallelTabs, DEFAULT_SETTINGS.maxParallelTabs, 1, 6)),
    separateWindow: typeof r.separateWindow === "boolean" ? r.separateWindow : DEFAULT_SETTINGS.separateWindow,
    captchaWaitMs: num(r.captchaWaitMs, DEFAULT_SETTINGS.captchaWaitMs, 0, 600000),
    appOrigin: typeof r.appOrigin === "string" && /^https?:\/\//.test(r.appOrigin) ? r.appOrigin.replace(/\/$/, "") : DEFAULT_SETTINGS.appOrigin,
    tempo: [1, 2, 4].includes(r.tempo as number) ? (r.tempo as number) : DEFAULT_SETTINGS.tempo,
    rateLimit: normalizeRateLimit(r.rateLimit),
    overlay: typeof r.overlay === "boolean" ? r.overlay : DEFAULT_SETTINGS.overlay,
    overlaySites: normalizeOverlaySites(r.overlaySites),
    notifications: typeof r.notifications === "boolean" ? r.notifications : DEFAULT_SETTINGS.notifications,
  };
}

export async function loadSettings(): Promise<Settings> {
  try {
    const { settings } = await chrome.storage.local.get("settings");
    return normalizeSettings(settings);
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const cur = await loadSettings();
  const next = normalizeSettings({ ...cur, ...patch });
  await chrome.storage.local.set({ settings: next });
  return next;
}

/** Stage of a request as the runner reports it (popup status and web progress envelopes); the protocol owns the vocabulary. */
export type RunStage = ProtocolRunStage;

export interface RunnerStatus {
  version: string;
  maxParallelTabs: number;
  windowId: number | null;
  queued: { market: MarketId; kind: string; waitedMs: number }[];
  active: { market: MarketId; kind: string; stage: RunStage; tabId: number | null; elapsedMs: number }[];
  cooldowns: Partial<Record<MarketId, { kind: CooldownKind; until: number; message: string }>>;
  keptTabs: Partial<Record<MarketId, { tabId: number; url: string; session: SessionState }>>;
  runnerTabs: number;
}

export type CooldownKind = "captcha" | "logged-out" | "rate" | "network";

/** Popup/overlay-only requests that travel over chrome.runtime.sendMessage or the port, never the web page. */
export type PopupMsg =
  | { type: "status" }
  | { type: "retry"; market: MarketId }
  | { type: "closeTabs" }
  | { type: "openLogins" }
  | { type: "focusTab"; tabId: number }
  | { type: "resolve"; url: string };

export type PopupReply =
  | { type: "status"; status: RunnerStatus }
  | { type: "ok" }
  | { type: "openLogins:result"; opened: MarketId[] }
  | { type: "resolve:result"; link: { market: MarketId; listingId: string; canonicalUrl: string; name: string } | null; runnerTab: boolean };

export type AnyRequest = WebToExt | PopupMsg;
export type AnyReply = ExtToWeb | PopupReply;

export type HealthMap = Partial<Record<MarketId, HealthResult>>;

/** "4 dk" / "35 sn" for countdowns in Turkish. */
export function formatRemaining(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  if (s < 60) return `${s} sn`;
  const m = Math.ceil(s / 60);
  if (m < 60) return `${m} dk`;
  return `${Math.floor(m / 60)} sa ${m % 60} dk`;
}

/** "az önce" / "3 dk önce" / "2 sa önce" for timestamps in the popup. */
export function formatAge(iso: string, now = Date.now()): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 60) return "az önce";
  if (s < 3600) return `${Math.round(s / 60)} dk önce`;
  if (s < 86400) return `${Math.round(s / 3600)} sa önce`;
  return `${Math.round(s / 86400)} gün önce`;
}
