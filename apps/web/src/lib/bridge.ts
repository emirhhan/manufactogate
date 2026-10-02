/**
 * Bridge between the web app and the browser extension.
 * Sprint 0: detects the extension via a DOM marker it injects and exposes session states.
 * Searches still run through the in-page mock registry; Sprint 1 routes them through the extension.
 */
import type { MarketId, SessionState } from "@manufactogate/core";

export interface ExtensionInfo {
  installed: boolean;
  version?: string;
  sessions: Partial<Record<MarketId, SessionState>>;
}

const MARKER = "data-manufactogate-ext";

export async function detectExtension(timeoutMs = 400): Promise<ExtensionInfo> {
  if (typeof window === "undefined") return { installed: false, sessions: {} };
  const el = document.documentElement;
  const version = el.getAttribute(MARKER);
  if (!version) return { installed: false, sessions: {} };

  return new Promise((resolve) => {
    const id = crypto.randomUUID();
    const timer = setTimeout(() => {
      window.removeEventListener("message", onMsg);
      resolve({ installed: true, version, sessions: {} });
    }, timeoutMs);
    function onMsg(ev: MessageEvent) {
      const d = ev.data;
      if (ev.source !== window || !d || d.source !== "manufactogate-ext" || d.replyTo !== id) return;
      clearTimeout(timer);
      window.removeEventListener("message", onMsg);
      resolve({ installed: true, version: version!, sessions: (d.sessions ?? {}) as ExtensionInfo["sessions"] });
    }
    window.addEventListener("message", onMsg);
    window.postMessage({ source: "manufactogate-web", type: "sessions", id }, "*");
  });
}
