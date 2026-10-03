/**
 * Bridge between the web app and the browser extension.
 * The extension's content script marks the document and relays envelopes to its background worker.
 */
import { EXT_MARKER_ATTR, EXT_SOURCE, WEB_SOURCE, type ExtractFailure, type ExtractRequest, type ExtractResult, type ExtToWeb, type PageRunner, type WebToExt } from "@manufactogate/adapters";
import type { MarketId, SessionState } from "@manufactogate/core";

export interface ExtensionInfo {
  installed: boolean;
  version?: string;
  sessions: Partial<Record<MarketId, SessionState>>;
}

export function extensionVersion(): string | null {
  if (typeof document === "undefined") return null;
  return document.documentElement.getAttribute(EXT_MARKER_ATTR);
}

/** Sends one envelope to the extension and resolves with its reply. */
export function sendToExtension<T extends ExtToWeb = ExtToWeb>(payload: WebToExt, timeoutMs = 60000): Promise<T> {
  return new Promise((resolve, reject) => {
    if (!extensionVersion()) return reject(new Error("extension not installed"));
    const id = crypto.randomUUID();
    const timer = setTimeout(() => {
      window.removeEventListener("message", onMsg);
      reject(new Error("extension timeout"));
    }, timeoutMs);
    function onMsg(ev: MessageEvent) {
      const d = ev.data as { source?: string; replyTo?: string; payload?: ExtToWeb } | undefined;
      if (ev.source !== window || !d || d.source !== EXT_SOURCE || d.replyTo !== id) return;
      clearTimeout(timer);
      window.removeEventListener("message", onMsg);
      if (d.payload?.type === "error") {
        const m = d.payload.message;
        reject(new Error(/context invalidated|disconnected|Receiving end does not exist/i.test(m) ? "Eklenti güncellendi; bu sekmeyi yenile (⌘R) ve aramayı tekrar başlat." : m));
      }
      else resolve(d.payload as T);
    }
    window.addEventListener("message", onMsg);
    window.postMessage({ source: WEB_SOURCE, id, payload }, "*");
  });
}

export async function detectExtension(): Promise<ExtensionInfo> {
  const version = extensionVersion();
  if (!version) return { installed: false, sessions: {} };
  try {
    const r = await sendToExtension<ExtToWeb & { type: "sessions" }>({ type: "sessions" }, 1500);
    return { installed: true, version, sessions: r.sessions };
  } catch {
    return { installed: true, version, sessions: {} };
  }
}

/** PageRunner that executes extraction requests through the extension. */
export class ExtensionRunner implements PageRunner {
  async run<T = unknown>(req: ExtractRequest): Promise<ExtractResult<T> | ExtractFailure> {
    try {
      const r = await sendToExtension<ExtToWeb & { type: "run:result" }>({ type: "run", req }, (req.timeoutMs ?? 25000) + 160000);
      return r.result as ExtractResult<T> | ExtractFailure;
    } catch (e) {
      return { ok: false, error: "Network", message: e instanceof Error ? e.message : String(e) };
    }
  }
}
