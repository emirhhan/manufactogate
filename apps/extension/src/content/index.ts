/**
 * Runs on the Manufactogate web app. Marks the extension as installed and relays
 * requests between the page and the background worker over a runtime port.
 * No runtime imports: content scripts are classic scripts.
 *
 * Resilience: pending requests are tracked, so when the port drops they are resent once
 * (worker restart) or answered with an error (extension reloaded) instead of waiting for the
 * page's own timeout. A newly injected copy retires older copies through a DOM event.
 */
// Everything lives inside the IIFE: after an extension update the background injects this file
// again into tabs that still hold the old copy, and a top-level `const` would then throw
// "Identifier has already been declared" and leave the page without a bridge.
(() => {
  const WEB_SOURCE = "manufactogate-web";
  const EXT_SOURCE = "manufactogate-ext";
  const PORT_NAME = "mg";
  const MARKER = "data-manufactogate-ext";
  const TEARDOWN_EVENT = "manufactogate-ext-teardown";
  const READY_EVENT = "manufactogate-ext-ready";
  const MSG_DISCONNECTED = "Eklenti bağlantısı koptu; sayfayı yenile";

  const version = (() => {
    try {
      return chrome.runtime.getManifest().version;
    } catch {
      return "0.0.0";
    }
  })();

  // Retire any older copy of this script (left behind by an extension update) before taking over.
  document.dispatchEvent(new CustomEvent(TEARDOWN_EVENT));

  let alive = true;
  let port: chrome.runtime.Port | null = null;
  let reconnected = false;
  const pending = new Map<string, { payload: unknown; progressed: boolean }>();

  const reply = (id: string, payload: unknown) => window.postMessage({ source: EXT_SOURCE, replyTo: id, payload }, "*");

  function contextAlive(): boolean {
    try {
      return !!chrome.runtime?.id;
    } catch {
      return false;
    }
  }

  function failAll(message: string): void {
    for (const id of [...pending.keys()]) reply(id, { type: "error", message });
    pending.clear();
  }

  function teardown(): void {
    if (!alive) return;
    alive = false;
    window.removeEventListener("message", onPageMessage);
    document.removeEventListener(TEARDOWN_EVENT, teardown);
    if (document.documentElement.getAttribute(MARKER) === version) document.documentElement.removeAttribute(MARKER);
    failAll(MSG_DISCONNECTED);
    try {
      port?.disconnect();
    } catch {
      /* already gone */
    }
    port = null;
  }

  function getPort(): chrome.runtime.Port {
    if (port) return port;
    const p = chrome.runtime.connect({ name: `${PORT_NAME}@${version}` });
    port = p;
    p.onMessage.addListener((msg: { id?: string; payload?: unknown; progress?: unknown; event?: unknown }) => {
      if (msg.event) {
        window.postMessage({ source: EXT_SOURCE, event: msg.event }, "*");
        return;
      }
      if (!msg.id) return;
      if (msg.progress) {
        const entry = pending.get(msg.id);
        if (entry) entry.progressed = true;
        window.postMessage({ source: EXT_SOURCE, progressFor: msg.id, payload: msg.progress }, "*");
        return;
      }
      pending.delete(msg.id);
      reconnected = false;
      reply(msg.id, msg.payload);
    });
    p.onDisconnect.addListener(() => {
      if (port === p) port = null;
      if (!contextAlive()) {
        // Extension reloaded/updated: this copy is orphaned for good.
        teardown();
        return;
      }
      if (pending.size === 0) return;
      if (reconnected) {
        failAll(MSG_DISCONNECTED);
        reconnected = false;
        return;
      }
      // The worker restarted: resend what is still pending, except runs that were already in flight.
      reconnected = true;
      for (const [id, entry] of [...pending]) {
        const type = (entry.payload as { type?: string } | null)?.type;
        if (type === "run" && entry.progressed) {
          pending.delete(id);
          reply(id, { type: "error", message: MSG_DISCONNECTED });
          continue;
        }
        try {
          getPort().postMessage({ id, payload: entry.payload });
        } catch (e) {
          pending.delete(id);
          reply(id, { type: "error", message: e instanceof Error ? e.message : String(e) });
        }
      }
    });
    return p;
  }

  function onPageMessage(ev: MessageEvent): void {
    const d = ev.data as { source?: string; id?: string; payload?: unknown; type?: string } | undefined;
    if (ev.source !== window || !d || d.source !== WEB_SOURCE || !d.id) return;
    // Backwards compatibility with the Sprint 0 shape { type: "sessions" }.
    const payload = d.payload ?? { type: d.type };
    if (!contextAlive()) {
      reply(d.id, { type: "error", message: MSG_DISCONNECTED });
      teardown();
      return;
    }
    pending.set(d.id, { payload, progressed: false });
    try {
      getPort().postMessage({ id: d.id, payload });
    } catch (e) {
      pending.delete(d.id);
      reply(d.id, { type: "error", message: e instanceof Error ? e.message : String(e) });
    }
  }

  document.addEventListener(TEARDOWN_EVENT, teardown);
  window.addEventListener("message", onPageMessage);
  document.documentElement.setAttribute(MARKER, version);
  window.dispatchEvent(new CustomEvent(READY_EVENT, { detail: { version } }));
})();
