/**
 * Bridge between the web app and the browser extension.
 * The extension's content script marks the document and relays envelopes to its background worker.
 *
 * Envelopes from the extension come in three shapes (see protocol.ts): replies (`replyTo`), live
 * progress of a run (`progressFor`) and unsolicited events (`event`, e.g. a login detected). One
 * window listener dispatches all three: replies settle their request, progress reaches the request's
 * `onProgress` and the global `onProgress` subscribers, events reach `onExtensionEvent` subscribers.
 *
 * Cancel: a request started with an AbortSignal sends `{ type: "cancel", id }` the moment the signal
 * fires, so the extension stops the queued/in-flight tab instead of running until the port dies.
 *
 * Liveness: the marker attribute survives an extension reload while the content script that set
 * it is dead ("orphaned"). Every market request therefore first pings the extension (cached for a
 * few seconds, so a 33-market search pays once) and long requests keep a heartbeat so a port that
 * dies mid-search fails within seconds instead of after the full request budget.
 */
import {
  EXT_MARKER_ATTR,
  EXT_SOURCE,
  requestBudgetMs,
  WEB_SOURCE,
  type ExtEvent,
  type ExtractFailure,
  type ExtractRequest,
  type ExtractResult,
  type ExtToWeb,
  type PageRunner,
  type PriceSnapshot,
  type RunnerOptions,
  type RunProgress,
  type SnapshotOffer,
  type WebToExt,
} from "@manufactogate/adapters";
import type { AdapterProgress, MarketId, SessionState } from "@manufactogate/core";

export interface ExtensionInfo {
  installed: boolean;
  version?: string;
  sessions: Partial<Record<MarketId, SessionState>>;
  /** The marker is present but the content script no longer answers (extension reloaded or updated). */
  orphaned?: boolean;
  /** Last time the extension answered a message. */
  lastSeenAt?: string;
}

export const ORPHAN_MESSAGE = "Eklenti yenilendi; bu sekmeyi yenile (F5 / ⌘R) ve aramayı tekrar başlat.";
export const NOT_INSTALLED_MESSAGE = "Eklenti kurulu değil; gerçek pazarlar için Manufactogate eklentisini yükle.";
export const CANCELLED_MESSAGE = "İstek iptal edildi";

/** Chrome's wording when a content script outlives its extension. */
export function isOrphanMessage(m: string): boolean {
  return /context invalidated|disconnected|Receiving end does not exist|extension timeout|message port closed/i.test(m);
}

export function extensionVersion(): string | null {
  if (typeof document === "undefined") return null;
  return document.documentElement.getAttribute(EXT_MARKER_ATTR);
}

export type BridgeEvent = { type: "orphaned"; message: string } | { type: "alive"; version: string };
const bridgeListeners = new Set<(e: BridgeEvent) => void>();
let orphaned = false;
let lastSeenAt: string | undefined;

/** Subscribe to liveness changes (the extension store mirrors them into React state). */
export function onBridgeEvent(cb: (e: BridgeEvent) => void): () => void {
  bridgeListeners.add(cb);
  return () => bridgeListeners.delete(cb);
}
export function isOrphaned(): boolean {
  return orphaned;
}
export function lastSeen(): string | undefined {
  return lastSeenAt;
}
function markOrphaned(message = ORPHAN_MESSAGE) {
  aliveCache = null;
  if (orphaned) return;
  orphaned = true;
  for (const cb of bridgeListeners) cb({ type: "orphaned", message });
}
function markAlive(version: string) {
  lastSeenAt = new Date().toISOString();
  if (!orphaned) return;
  orphaned = false;
  for (const cb of bridgeListeners) cb({ type: "alive", version });
}

/* ------------------------------------------------------------------------------------------------
 * Central dispatcher: replies, progress, events
 * ---------------------------------------------------------------------------------------------- */

/** Progress of one run as the app sees it: the extension's stage plus the request id it belongs to. */
export interface ProgressEvent extends RunProgress {
  requestId: string;
}

interface Pending {
  resolve: (p: ExtToWeb) => void;
  reject: (e: Error) => void;
  onProgress?: ((p: RunProgress) => void) | undefined;
}

const pending = new Map<string, Pending>();
const progressListeners = new Set<(p: ProgressEvent) => void>();
const eventListeners = new Set<(e: ExtEvent) => void>();
let listening = false;

function onWindowMessage(ev: MessageEvent): void {
  // Same-origin only: the content script posts from this very window; a foreign frame cannot pass.
  if (ev.origin !== window.location.origin) return;
  const d = ev.data as { source?: string; replyTo?: string; progressFor?: string; event?: ExtEvent; payload?: unknown } | undefined;
  if (!d || d.source !== EXT_SOURCE) return;
  if (typeof d.replyTo === "string") {
    const p = pending.get(d.replyTo);
    if (!p) return;
    pending.delete(d.replyTo);
    p.resolve(d.payload as ExtToWeb);
    return;
  }
  if (typeof d.progressFor === "string") {
    const prog = d.payload as RunProgress | undefined;
    if (!prog || prog.type !== "run:progress") return;
    pending.get(d.progressFor)?.onProgress?.(prog);
    const pe: ProgressEvent = { ...prog, requestId: d.progressFor };
    for (const cb of progressListeners) cb(pe);
    return;
  }
  if (d.event && typeof d.event === "object" && typeof (d.event as { type?: unknown }).type === "string") {
    for (const cb of eventListeners) cb(d.event);
  }
}

function ensureListening(): void {
  if (listening || typeof window === "undefined") return;
  listening = true;
  window.addEventListener("message", onWindowMessage);
}

/** Live stage of every run the extension is working on for this tab (all requests, not only one). */
export function onProgress(cb: (p: ProgressEvent) => void): () => void {
  ensureListening();
  progressListeners.add(cb);
  return () => progressListeners.delete(cb);
}

/** Unsolicited extension events: a login/logout detected by cookie or by a kept tab navigating. */
export function onExtensionEvent(cb: (e: ExtEvent) => void): () => void {
  ensureListening();
  eventListeners.add(cb);
  return () => eventListeners.delete(cb);
}

/** Subset of `onExtensionEvent` for session changes. */
export function onSessionsChanged(cb: (market: MarketId, session: SessionState) => void): () => void {
  return onExtensionEvent((e) => {
    if (e.type === "sessions:changed") cb(e.market, e.session);
  });
}

/** Test hook. */
export function resetBridgeState(): void {
  orphaned = false;
  aliveCache = null;
  lastSeenAt = undefined;
  for (const p of pending.values()) p.reject(new Error("reset"));
  pending.clear();
}

/** Test hook: ids of requests still waiting for a reply. */
export function pendingRequestIds(): string[] {
  return [...pending.keys()];
}

/* ------------------------------------------------------------------------------------------------
 * Requests
 * ---------------------------------------------------------------------------------------------- */

export interface SendOptions {
  /** Aborting sends a cancel for this request to the extension and rejects with CANCELLED_MESSAGE. */
  signal?: AbortSignal | undefined;
  /** Live progress of a `run` request. */
  onProgress?: ((p: RunProgress) => void) | undefined;
}

function post(id: string, payload: WebToExt): void {
  window.postMessage({ source: WEB_SOURCE, id, payload }, "*");
}

/** Sends one envelope to the extension and resolves with its reply. */
export function sendToExtension<T extends ExtToWeb = ExtToWeb>(payload: WebToExt, timeoutMs = 60000, opts: SendOptions = {}): Promise<T> {
  return new Promise((resolve, reject) => {
    const version = extensionVersion();
    if (!version) return reject(new Error(NOT_INSTALLED_MESSAGE));
    if (opts.signal?.aborted) return reject(new Error(CANCELLED_MESSAGE));
    ensureListening();
    const id = crypto.randomUUID();
    const signal = opts.signal;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const cleanup = () => {
      if (timer) clearTimeout(timer);
      timer = null;
      pending.delete(id);
      signal?.removeEventListener("abort", onAbort);
    };
    const onAbort = () => {
      cleanup();
      // Tell the extension to drop the queued/in-flight tab; the ack is not awaited.
      try {
        post(crypto.randomUUID(), { type: "cancel", id });
      } catch {
        /* page going away */
      }
      reject(new Error(CANCELLED_MESSAGE));
    };
    timer = setTimeout(() => {
      cleanup();
      reject(new Error("extension timeout"));
    }, timeoutMs);
    pending.set(id, {
      resolve: (p) => {
        cleanup();
        if (p?.type === "error") {
          const m = p.message;
          if (isOrphanMessage(m)) {
            markOrphaned();
            reject(new Error(ORPHAN_MESSAGE));
          } else reject(new Error(m));
          return;
        }
        markAlive(version);
        resolve(p as T);
      },
      reject: (e) => {
        cleanup();
        reject(e);
      },
      onProgress: opts.onProgress,
    });
    signal?.addEventListener("abort", onAbort, { once: true });
    post(id, payload);
  });
}

/** Stops every queued and in-flight request of this tab inside the extension (the "Durdur" button path). */
export async function cancelExtensionRuns(): Promise<boolean> {
  if (!extensionVersion()) return false;
  try {
    await sendToExtension<ExtToWeb & { type: "ok" }>({ type: "cancel" }, 2000);
    return true;
  } catch {
    return false;
  }
}

/**
 * Pushes a price snapshot for a listing so the extension's overlay can show "bu ürün şu pazarlarda
 * şu fiyattan var" on the market's own product page. Fire-and-forget; false when the extension is absent.
 */
export async function sendSnapshot(listing: { market: MarketId; listingId: string; title?: string | undefined }, offers: SnapshotOffer[], seenAt = new Date().toISOString()): Promise<boolean> {
  if (!extensionVersion() || !offers.length) return false;
  const snapshot: PriceSnapshot = {
    key: `${listing.market}:${listing.listingId}`,
    market: listing.market,
    listingId: listing.listingId,
    ...(listing.title ? { title: listing.title } : {}),
    offers: offers.slice(0, 12),
    seenAt,
  };
  try {
    await sendToExtension<ExtToWeb & { type: "ok" }>({ type: "snapshot", snapshot }, 3000);
    return true;
  } catch {
    return false;
  }
}

/** Round trip to the background worker; null when the extension is absent or does not answer. */
export async function ping(timeoutMs = 1500): Promise<string | null> {
  if (!extensionVersion()) return null;
  try {
    const r = await sendToExtension<ExtToWeb & { type: "pong" }>({ type: "ping" }, timeoutMs);
    return r.version;
  } catch {
    markOrphaned();
    return null;
  }
}

let aliveCache: { at: number; p: Promise<boolean> } | null = null;
/** Cached ping: one round trip per `ttlMs` window, shared by every market of a search. */
export function ensureAlive(ttlMs = 5000, timeoutMs = 1500): Promise<boolean> {
  if (!extensionVersion()) return Promise.resolve(false);
  const now = Date.now();
  if (aliveCache && now - aliveCache.at < ttlMs) return aliveCache.p;
  const p = ping(timeoutMs).then((v) => v !== null);
  aliveCache = { at: now, p };
  void p.then((ok) => {
    if (!ok) aliveCache = null;
  });
  return p;
}

export async function detectExtension(): Promise<ExtensionInfo> {
  const version = extensionVersion();
  if (!version) return { installed: false, sessions: {} };
  const alive = await ping(1500);
  if (alive === null) return { installed: true, version, sessions: {}, orphaned: true, ...(lastSeenAt ? { lastSeenAt } : {}) };
  try {
    const r = await sendToExtension<ExtToWeb & { type: "sessions" }>({ type: "sessions" }, 2500);
    return { installed: true, version: alive, sessions: r.sessions, orphaned: false, lastSeenAt: lastSeenAt ?? new Date().toISOString() };
  } catch {
    return { installed: true, version: alive, sessions: {}, orphaned: false, lastSeenAt: lastSeenAt ?? new Date().toISOString() };
  }
}

/**
 * Resolves with `p`, or rejects early when `probe` fails `failuresToTrip` times in a row
 * (polled every `intervalMs`). Pure wiring; the runner uses it with `ping`.
 */
export function withHeartbeat<T>(p: Promise<T>, probe: () => Promise<boolean>, intervalMs = 10_000, failuresToTrip = 2, message = ORPHAN_MESSAGE): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let done = false;
    let failures = 0;
    const timer = setInterval(() => {
      if (done) return;
      void probe().then((ok) => {
        if (done) return;
        failures = ok ? 0 : failures + 1;
        if (failures >= failuresToTrip) {
          done = true;
          clearInterval(timer);
          reject(new Error(message));
        }
      });
    }, intervalMs);
    p.then(
      (v) => {
        if (done) return;
        done = true;
        clearInterval(timer);
        resolve(v);
      },
      (e: unknown) => {
        if (done) return;
        done = true;
        clearInterval(timer);
        reject(e instanceof Error ? e : new Error(String(e)));
      },
    );
  });
}

/**
 * PageRunner that executes extraction requests through the extension. The wait per request is the
 * shared budget (`requestBudgetMs`: queue + settle + slack + captcha), so it never gives up before the
 * extension does; a dead port is caught by the heartbeat; an aborted signal cancels inside the extension.
 */
export class ExtensionRunner implements PageRunner {
  constructor(private readonly opts: { heartbeatMs?: number } = {}) {}
  async run<T = unknown>(req: ExtractRequest, ro: RunnerOptions = {}): Promise<ExtractResult<T> | ExtractFailure> {
    if (!extensionVersion()) return { ok: false, error: "Network", message: NOT_INSTALLED_MESSAGE };
    if (ro.signal?.aborted) return { ok: false, error: "Network", message: CANCELLED_MESSAGE };
    if (!(await ensureAlive())) return { ok: false, error: "Network", message: ORPHAN_MESSAGE };
    const onProgress = ro.onProgress ? (p: RunProgress) => ro.onProgress?.({ stage: p.stage } satisfies AdapterProgress) : undefined;
    try {
      const request = sendToExtension<ExtToWeb & { type: "run:result" }>({ type: "run", req }, requestBudgetMs(req), { signal: ro.signal, onProgress });
      const r = await withHeartbeat(request, () => ping(2500).then((v) => v !== null), this.opts.heartbeatMs ?? 10_000);
      return r.result as ExtractResult<T> | ExtractFailure;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return { ok: false, error: "Network", message: isOrphanMessage(message) ? ORPHAN_MESSAGE : message };
    }
  }
}
