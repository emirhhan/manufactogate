/**
 * Runs on the Manufactogate web app. Marks the extension as installed and relays
 * requests between the page and the background worker over a runtime port.
 * No runtime imports: content scripts are classic scripts.
 */
const EXT_VERSION = "0.6.0";
const WEB_SOURCE = "manufactogate-web";
const EXT_SOURCE = "manufactogate-ext";
const PORT_NAME = "mg";

document.documentElement.setAttribute("data-manufactogate-ext", EXT_VERSION);

let port: chrome.runtime.Port | null = null;
function getPort(): chrome.runtime.Port {
  if (port) return port;
  port = chrome.runtime.connect({ name: PORT_NAME });
  port.onMessage.addListener((msg: { id: string; payload: unknown }) => {
    window.postMessage({ source: EXT_SOURCE, replyTo: msg.id, payload: msg.payload }, "*");
  });
  port.onDisconnect.addListener(() => {
    port = null;
  });
  return port;
}

window.addEventListener("message", (ev) => {
  const d = ev.data as { source?: string; id?: string; payload?: unknown; type?: string } | undefined;
  if (ev.source !== window || !d || d.source !== WEB_SOURCE || !d.id) return;
  // Backwards compatibility with the Sprint 0 shape { type: "sessions" }.
  const payload = d.payload ?? { type: d.type };
  try {
    getPort().postMessage({ id: d.id, payload });
  } catch (e) {
    window.postMessage({ source: EXT_SOURCE, replyTo: d.id, payload: { type: "error", message: e instanceof Error ? e.message : String(e) } }, "*");
  }
});
