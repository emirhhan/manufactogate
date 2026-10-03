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

/** Page HTML for calibration fixtures. Inline scripts are kept (they hold embedded state); cookies are never in HTML. */
function capture(): string {
  const clone = document.documentElement.cloneNode(true) as HTMLElement;
  clone.querySelectorAll("script[src], link[rel=stylesheet], style, iframe, svg").forEach((n) => n.remove());
  return `<!doctype html>\n` + clone.outerHTML;
}

(window as unknown as { __mgx: Mgx }).__mgx = { run, setImage, capture };
