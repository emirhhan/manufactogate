import type { BgRequest, BgResponse } from "../shared";

const EXT_VERSION = "0.1.0"; // keep in sync with shared.ts; content scripts must not import runtime modules

/**
 * Runs on the Manufactogate web app. Marks the extension as installed and relays
 * session queries from the page to the background worker.
 */
document.documentElement.setAttribute("data-manufactogate-ext", EXT_VERSION);

window.addEventListener("message", (ev) => {
  const d = ev.data;
  if (ev.source !== window || !d || d.source !== "manufactogate-web") return;
  if (d.type === "sessions") {
    chrome.runtime.sendMessage({ type: "sessions" } satisfies BgRequest, (r: BgResponse) => {
      window.postMessage({ source: "manufactogate-ext", replyTo: d.id, sessions: r?.type === "sessions" ? r.sessions : {} }, "*");
    });
  }
});
