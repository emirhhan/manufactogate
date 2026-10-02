import { absUrl, clean, parseCount, parsePrice } from "./text";

/**
 * Generic "card" extraction. Market result pages change their class names often but keep
 * one invariant: each product card contains a link to a product URL. We find those links,
 * walk up to a container that holds exactly one such product id, and read fields from it.
 */

export interface CardSpec {
  /** Matches a product href and captures the product id in group 1. */
  link: RegExp;
  /** Max ancestor levels to climb when looking for the card container. */
  climb?: number;
  /** Regex that locates the price inside the card text; default: currency marks. */
  price?: RegExp;
  /** Regex that locates the sold/count text inside the card text. */
  sold?: RegExp;
  /** Candidate selectors for the title, tried in order inside the card. */
  titleSelectors?: string[];
  /** Candidate selectors for the supplier/shop name inside the card. */
  shopSelectors?: string[];
  /** Candidate selectors for location text. */
  locationSelectors?: string[];
  /** Text badges to look for (exact substrings of card text). */
  badgeWords?: string[];
}

export interface CardData {
  id: string;
  url: string;
  title: string;
  image: string | null;
  price: number | null;
  priceText: string | null;
  sold: number | null;
  shop: string | null;
  location: string | null;
  badges: string[];
  /** Full card text, for debugging and secondary parsing. */
  text: string;
}

const DEFAULT_PRICE = /(?:¥|￥|₺|TL|CNY|RMB)\s*([\d.,]+(?:\s*[-~]\s*[\d.,]+)?)|([\d.,]+)\s*(?:元|TL|₺)/;
const NUM = String.raw`((?:\d+(?:[.,]\d+)?)(?:万|K|k)?\+?)`;
const DEFAULT_SOLD = new RegExp(
  `(?:成交|已售|已拼|已出售|sold)\\s*${NUM}|${NUM}\\s*(?:人付款|人收货|人已买|sold|Satıldı|değerlendirme)`,
  "i",
);

function firstText(root: Element, selectors: string[] | undefined): string | null {
  for (const sel of selectors ?? []) {
    const el = root.querySelector(sel);
    const t = clean(el?.getAttribute("title") || textOf(el));
    if (t) return t;
  }
  return null;
}

function bestImage(card: Element, base: string): string | null {
  const imgs = [...card.querySelectorAll("img")];
  for (const img of imgs) {
    const src = img.getAttribute("data-src") || img.getAttribute("data-lazy-src") || img.getAttribute("src") || "";
    if (!src || src.startsWith("data:image/gif") || /spacer|blank|placeholder/i.test(src)) continue;
    const w = Number(img.getAttribute("width") || 0);
    if (w && w < 40) continue;
    return absUrl(src, base);
  }
  const bg = card.querySelector<HTMLElement>("[style*='background-image']");
  const m = /url\(["']?([^"')]+)["']?\)/.exec(bg?.getAttribute("style") ?? "");
  return m ? absUrl(m[1]!, base) : null;
}

/** Text content with a space between text nodes, so "¥129.00" and "3000+" from sibling elements do not fuse. */
export function textOf(el: Element | null | undefined): string {
  if (!el) return "";
  const parts: string[] = [];
  const walker = el.ownerDocument.createTreeWalker(el, 4 /* NodeFilter.SHOW_TEXT */);
  let n = walker.nextNode();
  while (n) {
    const t = n.textContent ?? "";
    if (t.trim()) parts.push(t.trim());
    n = walker.nextNode();
  }
  return parts.join(" ");
}

export function extractCards(doc: Document, spec: CardSpec, base = doc.location?.href || "https://example.com/"): CardData[] {
  const climb = spec.climb ?? 8;
  const anchors = [...doc.querySelectorAll<HTMLAnchorElement>("a[href]")];
  const byId = new Map<string, { anchor: HTMLAnchorElement; card: Element }>();

  for (const a of anchors) {
    const href = a.getAttribute("href") ?? "";
    const m = spec.link.exec(href);
    if (!m || !m[1]) continue;
    const id = m[1];
    if (byId.has(id)) continue;
    // Climb while the ancestor still contains exactly this one product id.
    let card: Element = a;
    for (let i = 0; i < climb && card.parentElement; i++) {
      const parent = card.parentElement;
      const ids = new Set<string>();
      for (const inner of parent.querySelectorAll<HTMLAnchorElement>("a[href]")) {
        const mm = spec.link.exec(inner.getAttribute("href") ?? "");
        if (mm?.[1]) ids.add(mm[1]);
        if (ids.size > 1) break;
      }
      if (ids.size > 1) break;
      card = parent;
    }
    byId.set(id, { anchor: a, card });
  }

  const out: CardData[] = [];
  for (const [id, { anchor, card }] of byId) {
    const text = textOf(card);
    const title =
      firstText(card, spec.titleSelectors) ||
      clean(anchor.getAttribute("title")) ||
      clean(card.querySelector("img")?.getAttribute("alt")) ||
      textOf(anchor).slice(0, 120);
    const priceM = (spec.price ?? DEFAULT_PRICE).exec(text);
    const priceText = priceM ? priceM[0] : null;
    const price = priceM ? parsePrice(priceM[1] ?? priceM[2] ?? priceM[0]) : null;
    const soldM = (spec.sold ?? DEFAULT_SOLD).exec(text);
    const badges = (spec.badgeWords ?? []).filter((w) => text.includes(w));
    out.push({
      id,
      url: absUrl(anchor.getAttribute("href")!, base),
      title,
      image: bestImage(card, base),
      price,
      priceText,
      sold: soldM ? parseCount(soldM[1] ?? soldM[2]) : null,
      shop: firstText(card, spec.shopSelectors),
      location: firstText(card, spec.locationSelectors),
      badges,
      text,
    });
  }
  return out;
}

/** Reads `window.NAME = {...}` style embedded state from inline scripts. */
export function readEmbedded<T = unknown>(doc: Document, names: string[]): T | null {
  const scripts = [...doc.querySelectorAll("script:not([src])")];
  for (const name of names) {
    for (const s of scripts) {
      const src = s.textContent ?? "";
      const idx = src.indexOf(name);
      if (idx < 0) continue;
      const after = src.slice(idx + name.length);
      const eq = after.search(/=\s*/);
      if (eq < 0 || eq > 20) continue;
      // Lazy import to keep this file DOM-only; extractJsonAfter is pure.
      const json = extractJsonAfterLocal(after.slice(eq + 1));
      if (!json) continue;
      try {
        return JSON.parse(json) as T;
      } catch {
        continue;
      }
    }
  }
  return null;
}

function extractJsonAfterLocal(s: string): string | null {
  let i = 0;
  while (i < s.length && s[i] !== "{" && s[i] !== "[") {
    if (!/\s/.test(s[i]!)) return null;
    i++;
  }
  const open = s[i];
  if (!open) return null;
  const close = open === "{" ? "}" : "]";
  let depth = 0;
  let inStr: string | null = null;
  for (let j = i; j < s.length; j++) {
    const c = s[j]!;
    if (inStr) {
      if (c === "\\") j++;
      else if (c === inStr) inStr = null;
      continue;
    }
    if (c === '"' || c === "'") inStr = c;
    else if (c === open) depth++;
    else if (c === close && --depth === 0) return s.slice(i, j + 1);
  }
  return null;
}
