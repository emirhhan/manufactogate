/**
 * Extract bundle: injected into market tabs by the background worker (chrome.scripting, files).
 * Exposes window.__mgx so follow-up executeScript({func}) calls can run extraction in the same
 * isolated world. Only DOM access; no network. Every entry point catches its own errors and
 * returns a payload, because executeScript resolves `undefined` (not a rejection) when the
 * injected function throws.
 */
import { PAGE_EXTRACTORS } from "@manufactogate/adapters";
import type { MarketId, SessionState } from "@manufactogate/core";
import { activitySignature, captchaVisible as captchaVisibleIn, findFileInput, findImageConfirm, findImageTrigger, findSearchBox, findSubmitFor, isVisible, supportsPaste } from "./dom";

type Kind = "search" | "detail" | "supplier" | "health";

export type TypeOutcome = "ok" | "ok-nav" | "no-input";
export type ImageOutcome = "ok" | "ok-paste" | "no-input" | "no-reaction";

interface Light {
  sig: string;
  count: number;
  ready: DocumentReadyState;
  href: string;
}

interface Mgx {
  run(market: MarketId, kind: Kind): Record<string, unknown>;
  runLight(market: MarketId, kind: Kind): Light;
  setImage(market: MarketId, dataUrl: string): Promise<ImageOutcome>;
  typeQuery(query: string, maxWaitMs?: number, selectors?: string[]): Promise<TypeOutcome>;
  captchaVisible(): boolean;
  scrollStep(step: number): void;
  scrollTop(): void;
  capture(market?: string): string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Session detection serialises the whole document; memoise it per URL for a few seconds. */
let sessCache: { href: string; at: number; value: SessionState } | null = null;
const SESSION_MEMO_MS = 3000;

function sessionOf(market: MarketId): SessionState {
  const ex = PAGE_EXTRACTORS[market];
  if (!ex) return "unknown";
  const href = location.href;
  const now = Date.now();
  if (sessCache && sessCache.href === href && now - sessCache.at < SESSION_MEMO_MS) return sessCache.value;
  let value: SessionState = "unknown";
  try {
    value = ex.session(document);
  } catch {
    value = "unknown";
  }
  sessCache = { href, at: now, value };
  return value;
}

function extract(market: MarketId, kind: Kind): Record<string, unknown> {
  const ex = PAGE_EXTRACTORS[market];
  if (!ex) return { items: [], strategy: "none", pageTitle: document.title, error: "no extractor" };
  if (kind === "health" || kind === "search") {
    const items = (ex.search?.(document) ?? []) as { text?: string }[];
    const strategy = items.length === 0 ? "none" : items.every((i) => (i.text ?? "") === "") ? "embedded" : "cards";
    let probe: Record<string, unknown> = {};
    try {
      probe = (ex.probe?.(document) as Record<string, unknown> | undefined) ?? {};
    } catch {
      probe = {};
    }
    return { items, strategy, pageTitle: document.title, ...probe };
  }
  if (kind === "detail") {
    const detail = (ex.detail?.(document) ?? null) as Record<string, unknown> | null;
    return { strategy: detail?.["strategy"] ?? "none", detail };
  }
  const supplier = (ex.supplier?.(document) ?? null) as Record<string, unknown> | null;
  return { strategy: supplier ? "dom" : "none", supplier };
}

function run(market: MarketId, kind: Kind): Record<string, unknown> {
  const session = sessionOf(market);
  try {
    return { session, ...extract(market, kind) };
  } catch (e) {
    return { session, items: [], strategy: "none", pageTitle: document.title, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Extraction without session detection; the runner polls this and asks for the full payload only when it changes. */
function runLight(market: MarketId, kind: Kind): Light {
  let count = 0;
  let extra = "";
  try {
    const d = extract(market, kind);
    if (kind === "search" || kind === "health") count = (d["items"] as unknown[]).length;
    else if (kind === "detail" || kind === "supplier") {
      const obj = d["detail"] ?? d["supplier"];
      count = obj ? 1 : 0;
      extra = obj ? String(JSON.stringify(obj).length) : "0";
    }
  } catch {
    extra = "err";
  }
  return { sig: `${count}:${extra}:${activitySignature(document)}`, count, ready: document.readyState, href: location.href };
}

function dataUrlToFile(dataUrl: string): File {
  const [head, b64] = dataUrl.split(",");
  const mime = /data:([^;]+)/.exec(head ?? "")?.[1] ?? "image/jpeg";
  // Sites read the type from the extension: a PNG named .jpg uploads as a broken image.
  const ext = ({ "image/png": "png", "image/webp": "webp", "image/gif": "gif" } as Record<string, string>)[mime] ?? "jpg";
  const name = `query.${ext}`;
  const bin = atob(b64 ?? "");
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new File([bytes], name, { type: mime });
}

/** Watches the page for a reaction (navigation or DOM churn) for up to `ms`. */
async function reacted(ms: number, minMutations = 5): Promise<boolean> {
  const href = location.href;
  let mutations = 0;
  const mo = new MutationObserver((list) => (mutations += list.length));
  try {
    mo.observe(document.documentElement, { childList: true, subtree: true });
  } catch {
    /* no observer: rely on href */
  }
  const until = Date.now() + ms;
  try {
    while (Date.now() < until) {
      await sleep(250);
      if (location.href !== href) return true;
      if (mutations >= minMutations) return true;
    }
    return false;
  } finally {
    mo.disconnect();
  }
}

/**
 * Feeds the query image into the page's own upload path. Order: the adapter's calibrated hook,
 * a file input already on the page, the search bar's camera trigger (scoped), then paste on markets
 * that advertise it. Returns "no-reaction" when nothing on the page changed afterwards, so the
 * caller can fall back to a text search quickly instead of reading the wrong page.
 */
async function setImage(market: MarketId, dataUrl: string): Promise<ImageOutcome> {
  const ex = PAGE_EXTRACTORS[market];
  const file = dataUrlToFile(dataUrl);
  const dt = new DataTransfer();
  dt.items.add(file);

  let input: HTMLInputElement | null = null;
  try {
    input = ex?.imageInput?.(document) ?? null;
  } catch {
    input = null;
  }
  if (!input) input = findFileInput(document);
  if (!input) {
    const trigger = findImageTrigger(document);
    if (trigger) {
      trigger.click();
      const until = Date.now() + 2500;
      while (!input && Date.now() < until) {
        await sleep(250);
        input = findFileInput(document);
      }
    }
  }
  if (input) {
    try {
      input.files = dt.files;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    } catch {
      return "no-input";
    }
    const href = location.href;
    const changed = await reacted(3500);
    if (location.href !== href) return "ok";
    // Upload showed a preview but did not navigate: press the panel's own search button.
    const until = Date.now() + 4000;
    const confirm = () => {
      try {
        const own = ex?.imageConfirm?.(document);
        if (own) return own;
      } catch {
        /* calibrated hook broke: use the generic finder */
      }
      const generic = findImageConfirm(document);
      if (generic) return generic;
      // 1688 puts the uploaded image into the search bar itself; its own search button starts the image search.
      if (market === "cn-1688") {
        const box = findSearchBox(document);
        return box ? findSubmitFor(box) : null;
      }
      return null;
    };
    let btn = confirm();
    while (!btn && Date.now() < until) {
      await sleep(300);
      btn = confirm();
    }
    if (btn) {
      btn.click();
      // The click may navigate synchronously, before `reacted` starts watching.
      if (location.href !== href) return "ok";
      return (await reacted(3500)) || location.href !== href ? "ok" : "no-reaction";
    }
    return changed ? "ok" : "no-reaction";
  }
  // Paste fallback: only where the page says so (Taobao/1688 "Ctrl+V 粘贴图片").
  const box = findSearchBox(document);
  if (!box || !(supportsPaste(document, box) || market === "cn-taobao" || market === "cn-1688")) return "no-input";
  try {
    (box as HTMLElement).focus?.();
    box.dispatchEvent(new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: dt }));
  } catch {
    return "no-input";
  }
  return (await reacted(3500)) ? "ok-paste" : "no-reaction";
}

function setNativeValue(box: HTMLElement, v: string): void {
  const proto = Object.getPrototypeOf(box) as object;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  if (box.isContentEditable && !(box instanceof HTMLInputElement) && !(box instanceof HTMLTextAreaElement)) {
    box.textContent = v;
  } else if (setter) setter.call(box, v);
  else (box as HTMLInputElement).value = v;
  box.dispatchEvent(new Event("input", { bubbles: true }));
}

/**
 * Types a query with human-like pacing and submits it. Waits for a late-mounted search box
 * (SPA hydration) for up to `maxWaitMs`, then Enter, then the submit button when nothing navigated.
 */
async function typeQuery(query: string, maxWaitMs = 6000, selectors: string[] = []): Promise<TypeOutcome> {
  let box = findSearchBox(document, selectors);
  const until = Date.now() + maxWaitMs;
  while (!box && Date.now() < until) {
    await sleep(300);
    box = findSearchBox(document, selectors);
  }
  if (!box) return "no-input";
  const href = location.href;
  const el = box as HTMLElement;
  el.focus();
  el.click();
  setNativeValue(el, "");
  await sleep(200 + Math.random() * 200);
  let cur = "";
  for (const ch of query) {
    cur += ch;
    el.dispatchEvent(new KeyboardEvent("keydown", { key: ch, bubbles: true }));
    setNativeValue(el, cur);
    el.dispatchEvent(new KeyboardEvent("keyup", { key: ch, bubbles: true }));
    await sleep(45 + Math.random() * 80);
  }
  await sleep(300 + Math.random() * 300);
  const enter = { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true, cancelable: true } as KeyboardEventInit;
  const prevented = !el.dispatchEvent(new KeyboardEvent("keydown", enter));
  el.dispatchEvent(new KeyboardEvent("keypress", enter));
  el.dispatchEvent(new KeyboardEvent("keyup", enter));
  if (!prevented) {
    const form = el.closest("form");
    if (form) {
      await sleep(150);
      try {
        if (typeof form.requestSubmit === "function") form.requestSubmit();
        else form.submit();
      } catch {
        /* a submit handler may have navigated already */
      }
    }
  }
  await sleep(800);
  if (location.href !== href) return "ok-nav";
  // Nothing navigated: press the site's own search button, if any.
  const btn = findSubmitFor(el);
  if (btn && isVisible(btn)) {
    btn.click();
    await sleep(700);
  }
  return location.href !== href ? "ok-nav" : "ok";
}

function captchaVisible(): boolean {
  try {
    return captchaVisibleIn(document);
  } catch {
    return false;
  }
}

/** One scroll step of a human-like pass: down by a viewport, back to top on a negative step. */
function scrollStep(step: number): void {
  try {
    const vh = window.innerHeight || 800;
    const max = Math.max(0, document.documentElement.scrollHeight - vh);
    if (step < 0) window.scrollTo({ top: 0, behavior: "auto" });
    else window.scrollTo({ top: Math.min(max, vh * step), behavior: "auto" });
  } catch {
    /* ignore */
  }
}

function scrollTop(): void {
  scrollStep(-1);
}

/** Page HTML for calibration fixtures. Inline scripts are kept (they hold embedded state); cookies are never in HTML. */
function capture(market?: string): string {
  const clone = document.documentElement.cloneNode(true) as HTMLElement;
  clone.querySelectorAll("script[src], link[rel=stylesheet], style, iframe, svg, #mg-overlay").forEach((n) => n.remove());
  const header = `<!-- market: ${market ?? "unknown"}; url: ${location.href}; capturedAt: ${new Date().toISOString()} -->`;
  return `${header}\n<!doctype html>\n` + clone.outerHTML;
}

(window as unknown as { __mgx: Mgx }).__mgx = { run, runLight, setImage, typeQuery, captchaVisible, scrollStep, scrollTop, capture };
