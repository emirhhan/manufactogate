/**
 * Bridge between the web app and the browser extension.
 * The extension's content script marks the document and relays envelopes to its background worker.
 *
 * Liveness: the marker attribute survives an extension reload while the content script that set
 * it is dead ("orphaned"). Every market request therefore first pings the extension (cached for a
 * few seconds, so a 33-market search pays once) and long requests keep a heartbeat so a port that
 * dies mid-search fails within seconds instead of after the three-minute deadline.
 */
import { EXT_MARKER_ATTR, EXT_SOURCE, WEB_SOURCE, type ExtractFailure, type ExtractRequest, type ExtractResult, type ExtToWeb, type PageRunner, type WebToExt } from "@manufactogate/adapters";
import type { MarketId, SessionState } from "@manufactogate/core";

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
/** Test hook. */
export function resetBridgeState(): void {
  orphaned = false;
  aliveCache = null;
  lastSeenAt = undefined;
}

/** Sends one envelope to the extension and resolves with its reply. */
export function sendToExtension<T extends ExtToWeb = ExtToWeb>(payload: WebToExt, timeoutMs = 60000): Promise<T> {
  return new Promise((resolve, reject) => {
    const version = extensionVersion();
    if (!version) return reject(new Error(NOT_INSTALLED_MESSAGE));
    const id = crypto.randomUUID();
    const timer = setTimeout(() => {
      window.removeEventListener("message", onMsg);
      reject(new Error("extension timeout"));
    }, timeoutMs);
    function onMsg(ev: MessageEvent) {
      const d = ev.data as { source?: string; replyTo?: string; payload?: ExtToWeb } | undefined;
      // Same-origin only: the content script posts from this very window; a foreign frame cannot pass.
      if (ev.origin !== window.location.origin || !d || d.source !== EXT_SOURCE || d.replyTo !== id) return;
      clearTimeout(timer);
      window.removeEventListener("message", onMsg);
      if (d.payload?.type === "error") {
        const m = d.payload.message;
        if (isOrphanMessage(m)) {
          markOrphaned();
          reject(new Error(ORPHAN_MESSAGE));
        } else reject(new Error(m));
        return;
      }
      markAlive(version!);
      resolve(d.payload as T);
    }
    window.addEventListener("message", onMsg);
    window.postMessage({ source: WEB_SOURCE, id, payload }, "*");
  });
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

/** PageRunner that executes extraction requests through the extension. */
export class ExtensionRunner implements PageRunner {
  constructor(private readonly opts: { heartbeatMs?: number } = {}) {}
  async run<T = unknown>(req: ExtractRequest): Promise<ExtractResult<T> | ExtractFailure> {
    if (!extensionVersion()) return { ok: false, error: "Network", message: NOT_INSTALLED_MESSAGE };
    if (!(await ensureAlive())) return { ok: false, error: "Network", message: ORPHAN_MESSAGE };
    try {
      const request = sendToExtension<ExtToWeb & { type: "run:result" }>({ type: "run", req }, (req.timeoutMs ?? 25000) + 160000);
      const r = await withHeartbeat(request, () => ping(2500).then((v) => v !== null), this.opts.heartbeatMs ?? 10_000);
      return r.result as ExtractResult<T> | ExtractFailure;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return { ok: false, error: "Network", message: isOrphanMessage(message) ? ORPHAN_MESSAGE : message };
    }
  }
}
