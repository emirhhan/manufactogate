import type { AdapterStage, HealthResult, MarketId, SessionState } from "@manufactogate/core";
import type { ExtractFailure, ExtractKind, ExtractRequest, ExtractResult } from "./runner";

/**
 * Messages between the web app and the extension.
 * Web → content script: window.postMessage({ source: "manufactogate-web", id, payload: WebToExt })
 * Content script → web, three envelope shapes (see `ExtEnvelope`):
 *   - reply:    { source: "manufactogate-ext", replyTo: id, payload: ExtToWeb }
 *   - progress: { source: "manufactogate-ext", progressFor: id, payload: RunProgress }   (live stage of a `run`)
 *   - event:    { source: "manufactogate-ext", event: ExtEvent }                           (unsolicited, e.g. a login)
 * The content script relays to the background worker over a runtime port named "mg".
 */

export const WEB_SOURCE = "manufactogate-web";
export const EXT_SOURCE = "manufactogate-ext";
export const EXT_MARKER_ATTR = "data-manufactogate-ext";
export const PORT_NAME = "mg";

/** Stage of a request inside the extension's runner (same vocabulary as the core's AdapterStage). */
export type RunStage = AdapterStage;

/** One offer of a listing on another market, as the overlay shows it on the market's own product page. */
export interface SnapshotOffer {
  market: MarketId;
  /** Market display name, so the overlay does not need the adapter catalogue. */
  name?: string;
  price: number;
  currency: string;
  url?: string;
}

/** Price snapshot the web app pushes for a listing; stored in chrome.storage.local.snapshots[key]. */
export interface PriceSnapshot {
  /** `${market}:${listingId}` of the listing the overlay will be shown on. */
  key: string;
  market: MarketId;
  listingId: string;
  title?: string;
  offers: SnapshotOffer[];
  /** ISO time the offers were seen. */
  seenAt: string;
}

export type WebToExt =
  | { type: "ping" }
  | { type: "sessions" }
  /** `quick`: 8 s probe (no captcha wait, no scrolling), the budget the web's health round uses. */
  | { type: "health"; market?: MarketId; quick?: boolean }
  | { type: "run"; req: ExtractRequest }
  /** Stops a request: the one whose envelope id is `id`, or every request of this connection when omitted. */
  | { type: "cancel"; id?: string }
  | { type: "image"; url: string }
  | { type: "capture" }
  | { type: "snapshot"; snapshot: PriceSnapshot };

export type ExtToWeb =
  | { type: "pong"; version: string }
  | { type: "sessions"; sessions: Partial<Record<MarketId, SessionState>> }
  | { type: "health"; health: Partial<Record<MarketId, HealthResult>> }
  | { type: "run:result"; result: ExtractResult | ExtractFailure }
  | { type: "image:result"; dataUrl: string }
  | { type: "capture:result"; html: string; url: string; market: MarketId | null }
  /** Acknowledgement of cancel/snapshot. */
  | { type: "ok" }
  | { type: "error"; message: string };

/** Live progress of one `run` request (sent under `progressFor`, never as a reply). */
export interface RunProgress {
  type: "run:progress";
  market: MarketId;
  stage: RunStage;
}

/** Unsolicited events from the background worker to every connected app tab. */
export type ExtEvent = { type: "sessions:changed"; market: MarketId; session: SessionState };

export type ExtEnvelope =
  | { source: typeof EXT_SOURCE; replyTo: string; payload: ExtToWeb }
  | { source: typeof EXT_SOURCE; progressFor: string; payload: RunProgress }
  | { source: typeof EXT_SOURCE; event: ExtEvent };

export interface Envelope<T> {
  source: typeof WEB_SOURCE | typeof EXT_SOURCE;
  id?: string;
  replyTo?: string;
  payload: T;
}

/**
 * One timing budget shared by every layer, so the numbers cannot disagree:
 *
 *   extension request  ≤ queue wait (queueBudgetMs) + settle (settleMs[kind]) + slack (runSlackMs) + captcha (captchaWaitMs + settle + 10 s)
 *   web bridge wait    = requestBudgetMs(req)  ≥ the extension's worst case (plus a margin), with a heartbeat for a dead port
 *   core per market    = perMarketActiveMs of *active* time (queued time is paused) and perMarketHardCapMs in all
 *
 * Rule: the core's clock only runs while the extension works on the request (stage ≠ "queued"), so with
 * 3 parallel tabs and 33 markets the markets at the back of the queue never time out just for waiting.
 */
export const TIMING = {
  /** Settle budget per request kind inside the market tab. */
  settleMs: { search: 25_000, detail: 20_000, supplier: 20_000, health: 8_000 } as Record<ExtractKind, number>,
  /** Load retries, scrolling and tab bookkeeping on top of the settle budget. */
  runSlackMs: 45_000,
  /** Longest a request may wait for a free tab slot before the extension gives up on it. */
  queueBudgetMs: 240_000,
  /** Default captcha wait (the user may raise it to 5 min in the popup). */
  captchaWaitMs: 120_000,
  /** Quick probe (health, session): first reading, no captcha wait, no scrolling. */
  quickProbeMs: 8_000,
  /** Core: active-time budget per market and the absolute cap including queue time. */
  perMarketActiveMs: 120_000,
  perMarketHardCapMs: 600_000,
  /** Health round on the web: markets probed at the same time, pause between probes of one worker. */
  healthConcurrency: 3,
  healthPauseMs: 600,
} as const;

/** Worst-case wall time the extension may take for `req`; the web bridge waits this long (plus margin) before giving up. */
export function requestBudgetMs(req: Pick<ExtractRequest, "kind" | "timeoutMs" | "quick">, captchaWaitMs = TIMING.captchaWaitMs): number {
  const settle = req.timeoutMs ?? TIMING.settleMs[req.kind] ?? TIMING.settleMs.search;
  const captcha = req.quick || req.kind === "health" ? 0 : captchaWaitMs + settle + 10_000;
  return TIMING.queueBudgetMs + settle + TIMING.runSlackMs + captcha + 15_000;
}
