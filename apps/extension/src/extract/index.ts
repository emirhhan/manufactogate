/**
 * Extract bundle: injected into market tabs by the background worker (chrome.scripting, files).
 * Exposes window.__mgx so follow-up executeScript({func}) calls can run extraction in the same
 * isolated world. Only DOM access; no network.
 */
import { PAGE_EXTRACTORS } from "@manufactogate/adapters";
import type { MarketId } from "@manufactogate/core";

type Kind = "search" | "detail" | "supplier" | "health";

interface Mgx {
  run(market: MarketId, kind: Kind): unknown;
  setImage(market: MarketId, dataUrl: string): "ok" | "ok-paste" | "no-input";
  typeQuery(query: string): Promise<"ok" | "no-input">;
  scrollStep(step: number): void;
  capture(): string;
}

function run(market: MarketId, kind: Kind): unknown {
  const ex = PAGE_EXTRACTORS[market];
  if (!ex) return { session: "unknown", items: [], strategy: "none", pageTitle: document.title, error: "no extractor" };
  const session = ex.session(document);
  if (kind === "health") return { session, pageTitle: document.title };
  if (kind === "search") {
    const items = (ex.search?.(document) ?? []) as { text?: string }[];
    const strategy = items.length === 0 ? "none" : items[0]?.text === "" ? "embedded" : "cards";
    return { session, items, strategy, pageTitle: document.title };
  }
  if (kind === "detail") {
    const detail = (ex.detail?.(document) ?? null) as Record<string, unknown> | null;
    return { session, strategy: detail?.["strategy"] ?? "none", detail };
  }
  const supplier = (ex.supplier?.(document) ?? null) as Record<string, unknown> | null;
  return { session, strategy: supplier ? "dom" : "none", supplier };
}

function dataUrlToFile(dataUrl: string, name = "query.jpg"): File {
  const [head, b64] = dataUrl.split(",");
  const mime = /data:([^;]+)/.exec(head ?? "")?.[1] ?? "image/jpeg";
  const bin = atob(b64 ?? "");
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new File([bytes], name, { type: mime });
}

function findTrigger(): HTMLElement | null {
  const bySelector = document.querySelector<HTMLElement>(
    "[class*='camera'], [class*='Camera'], [class*='imgsearch'], [class*='imageSearch'], [class*='image-search'], [class*='ImageSearch'], [class*='picSearch'], [class*='photo'], [class*='visual'], [class*='Visual'], [data-testid*='visual'], [data-testid*='camera'], [title*='图'], [aria-label*='图'], [aria-label*='örsel'], [title*='örsel'], [data-spm*='img'], [class*='upload']",
  );
  if (bySelector) return bySelector;
  for (const el of document.querySelectorAll<HTMLElement>("button, a, span, div, label")) {
    const t = (el.textContent ?? "").trim();
    if (t.length <= 12 && /上传图片|按图片搜索|图搜|拍照|以图搜|Görselle ara|görsel/i.test(t)) return el;
  }
  return null;
}

function setImage(market: MarketId, dataUrl: string): "ok" | "ok-paste" | "no-input" {
  const ex = PAGE_EXTRACTORS[market];
  const file = dataUrlToFile(dataUrl);
  const dt = new DataTransfer();
  dt.items.add(file);

  // 1) A file input on the page (possibly hidden), optionally after clicking the camera/upload trigger.
  let input = ex?.imageInput?.(document) ?? null;
  if (!input) {
    findTrigger()?.click();
    input = document.querySelector<HTMLInputElement>("input[type=file]");
  }
  if (input) {
    input.files = dt.files;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    return "ok";
  }
  // 2) Taobao and 1688 accept a pasted image in the search box ("Ctrl+V 粘贴图片快速图搜").
  const box =
    document.querySelector<HTMLElement>("input[type=search], input[name='q'], input[name='keywords'], input[placeholder*='搜'], input[placeholder*='Ara'], [contenteditable='true']") ??
    document.activeElement as HTMLElement | null;
  const targets = [box, document.body].filter((t): t is HTMLElement => !!t);
  for (const t of targets) {
    try {
      t.focus?.();
      const ev = new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: dt });
      t.dispatchEvent(ev);
      return "ok-paste";
    } catch {
      /* try next target */
    }
  }
  return "no-input";
}

function findSearchBox(): HTMLInputElement | HTMLTextAreaElement | null {
  const sels = [
    "input[type=search]",
    "input[name='q']", "input[name='keywords']", "input[name='keyword']", "input[name='search_key']", "input[name='SearchText']", "input[name='searchkey']", "input[name='k']", "input[name='_nkw']", "input[name='text']", "input[name='search']", "input[name='p']",
    "input[name='ss']", "#search-input", "#searchInput", "#GlobalNavSearchInput", "#form__search-keyword", "input[aria-label*='Search' i]", "input[aria-label*='ara' i]", "input[aria-label*='looking for' i]", "input[data-testid*='search' i]",
    "input[id*='search' i]", "input[class*='search' i]", "input[placeholder*='搜' i]", "input[placeholder*='ara' i]", "input[placeholder*='search' i]", "input[placeholder*='cari' i]", "input[placeholder*='検索' i]", "input[placeholder*='검색' i]", "input[placeholder*='поиск' i]",
  ];
  for (const sel of sels) {
    const el = document.querySelector<HTMLInputElement>(sel);
    if (el && el.offsetParent !== null && !el.disabled) return el;
  }
  return null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Types a query with human-like pacing and submits with Enter (plus form submit as a fallback). */
async function typeQuery(query: string): Promise<"ok" | "no-input"> {
  const box = findSearchBox();
  if (!box) return "no-input";
  box.focus();
  box.click();
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(box), "value")?.set;
  const setValue = (v: string) => {
    if (setter) setter.call(box, v);
    else box.value = v;
    box.dispatchEvent(new Event("input", { bubbles: true }));
  };
  setValue("");
  await sleep(200 + Math.random() * 200);
  let cur = "";
  for (const ch of query) {
    cur += ch;
    box.dispatchEvent(new KeyboardEvent("keydown", { key: ch, bubbles: true }));
    setValue(cur);
    box.dispatchEvent(new KeyboardEvent("keyup", { key: ch, bubbles: true }));
    await sleep(50 + Math.random() * 90);
  }
  await sleep(300 + Math.random() * 300);
  const enter = { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true, cancelable: true } as KeyboardEventInit;
  const prevented = !box.dispatchEvent(new KeyboardEvent("keydown", enter));
  box.dispatchEvent(new KeyboardEvent("keypress", enter));
  box.dispatchEvent(new KeyboardEvent("keyup", enter));
  if (!prevented) {
    const form = box.closest("form");
    if (form) {
      await sleep(150);
      if (typeof form.requestSubmit === "function") form.requestSubmit();
      else form.submit();
    } else {
      const btn = document.querySelector<HTMLElement>("button[type=submit], [class*='search'] button, [class*='search-btn'], [class*='searchBtn'], [class*='btn-search']");
      btn?.click();
    }
  }
  return "ok";
}

/** One scroll step of a human-like pass: down by a viewport, back to top on the final step. */
function scrollStep(step: number): void {
  try {
    const vh = window.innerHeight || 800;
    const max = Math.max(0, document.body.scrollHeight - vh);
    if (step < 0) window.scrollTo({ top: 0, behavior: "auto" });
    else window.scrollTo({ top: Math.min(max, vh * step), behavior: "auto" });
  } catch {
    /* ignore */
  }
}

/** Page HTML for calibration fixtures. Inline scripts are kept (they hold embedded state); cookies are never in HTML. */
function capture(): string {
  const clone = document.documentElement.cloneNode(true) as HTMLElement;
  clone.querySelectorAll("script[src], link[rel=stylesheet], style, iframe, svg").forEach((n) => n.remove());
  return `<!doctype html>\n` + clone.outerHTML;
}

(window as unknown as { __mgx: Mgx }).__mgx = { run, setImage, typeQuery, scrollStep, capture };
