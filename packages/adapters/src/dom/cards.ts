import { absUrl, clean, normalizeSpaces, parseCount, parseMoney, parsePrice } from "./text";

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
  /** Regex that locates the price inside the card text; default: currency marks. All capture groups are concatenated. */
  price?: RegExp;
  /** Selectors tried (in order) for the price element before the whole-card text is scanned. */
  priceSelectors?: string[];
  /** Currency assumed for prices that carry no recognisable symbol. */
  currency?: string;
  /** How a bare "¥" is interpreted. */
  yenAs?: "CNY" | "JPY";
  /** Regex that locates the sold/count text inside the card text. */
  sold?: RegExp;
  /** Selectors tried for the sold count before the regex. */
  soldSelectors?: string[];
  /** Regex that locates the minimum order quantity (group 1 or 2). */
  moq?: RegExp;
  /** Candidate selectors for the title, tried in order inside the card. */
  titleSelectors?: string[];
  /** Candidate selectors for the supplier/shop name inside the card. */
  shopSelectors?: string[];
  /** Candidate selectors for location text. */
  locationSelectors?: string[];
  /** Candidate selectors for a rating value ("4.8"). */
  ratingSelectors?: string[];
  /** Regex for the number of ratings/reviews ("(345)", "1.234 Değerlendirme"); group 1 is the number. Not a sales count. */
  ratingCount?: RegExp;
  /** Candidate selectors for the product image (before the heuristic). */
  imageSelectors?: string[];
  /** Regex for years on the platform ("16 Years", "7+ yrs", "2年"); group 1 is the number. */
  years?: RegExp;
  /** Text badges to look for (substrings of card text, image alt/title attributes). */
  badgeWords?: string[];
  /** Label fragments to strip from the start of a title ("Popüler seçimler", "Rollback,"). */
  titlePrefixes?: string[];
  /** Drops a card before fields are read (e.g. sidebar promo tiles). */
  cardFilter?: (card: Element, text: string) => boolean;
}

export interface CardData {
  id: string;
  url: string;
  title: string;
  image: string | null;
  price: number | null;
  priceText: string | null;
  /** Currency the price was written in, when recognisable (may differ from the market default). */
  priceCurrency?: string | null;
  /** Upper bound of a price range ("US$ 14.49 - 14.99"). */
  priceMax?: number | null;
  sold: number | null;
  shop: string | null;
  location: string | null;
  badges: string[];
  moq?: number | null;
  rating?: number | null;
  ratingCount?: number | null;
  supplierYears?: number | null;
  /** Full card text, for debugging and secondary parsing. Empty for embedded (JSON) items. */
  text: string;
}

const DEFAULT_PRICE = /(?:¥|￥|₺|TL|CNY|RMB)\s*([\d.,]+(?:\s*[-~]\s*[\d.,]+)?)|([\d.,]+)\s*(?:元|TL|₺)/;
const NUM = String.raw`((?:\d+(?:[.,]\d+)?)(?:万|K|k)?\+?)`;
/** Only sold/paid wordings; rating counts ("değerlendirme") are not sales. */
const DEFAULT_SOLD = new RegExp(`(?:成交|已售|已拼|已出售|已拼成)\\s*${NUM}|${NUM}\\s*(?:人付款|人收货|人已买|件已售|sold\\b|satıldı|terjual|ขายแล้ว|купили|판매)`, "iu");
const DEFAULT_MOQ = /(?:Min\.?\s*(?:Order|order)\.?:?\s*|MOQ:?\s*|最小起订量?:?\s*)([\d,]+)|(\d+)\s*[个件套双条台只箱盒包副对卷]\s*起(?:批|购|订|售)/;
/** Strike-through / old prices are never the current price. */
const STRIKE_SEL = "del, s, strike, [class*='strike' i], [class*='oldPrice' i], [class*='old-price' i], [class*='origin-price' i], [class*='originPrice' i], [class*='originalPrice' i], [class*='original-price' i], [class*='wasPrice' i]";
/** Title candidates must not be price/badge/a11y labels. */
const TITLE_EXCLUDE = /price|badge|\btag\b|a11y|sr-only|visually-hidden|label|rating|review|delivery|coupon|discount|promo/i;
/** Images that are badges, flags, placeholders or icons rather than the product. */
const IMAGE_SKIP = /sprite|blank|placeholder|spacer|icon|logo|badge|flag|rating|star|nudge|made-in-india|verified|tag\/|\/tags?\/|supplierTag|\.svg(?:[?#]|$)|pp_video|ic_promo/i;
const ALT_SKIP = /^(?:icon|logo|badge|rating|nudge|product-image|image|img|photo)$|icon|logo|badge|rating|nudge icon|verified|trusted|made in india/i;

const INLINE_JOIN = new Set(["FONT", "B", "I", "EM", "STRONG", "MARK", "U", "S", "SUB", "SUP", "SMALL", "ABBR", "BDI", "WBR"]);
const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE", "SVG", "IFRAME", "HEAD"]);

function isInlineJoin(el: Element | null): boolean {
  if (!el) return false;
  if (INLINE_JOIN.has(el.tagName)) return true;
  if (el.tagName === "SPAN") {
    const cls = el.getAttribute("class") ?? "";
    return /highlight|\bhl\b|keyword|\bem\b|\bmark\b|\bkw\b/i.test(cls);
  }
  return false;
}

/**
 * Text content with a space between text chunks, so "¥129.00" and "3000+" from sibling
 * elements do not fuse. Text split only by inline formatting (`<font>`, `<b>`, highlight spans)
 * is joined back together ("S<font>m</font>art" → "Smart").
 */
export function textOf(el: Element | null | undefined, opts: { skip?: string } = {}): string {
  if (!el) return "";
  const parts: string[] = [];
  let glue = false;
  let sawSpace = false;
  const visit = (node: Node): void => {
    if (node.nodeType === 3) {
      const raw = normalizeSpaces(node.textContent ?? "");
      if (!raw.trim()) {
        if (raw) sawSpace = true;
        return;
      }
      const inline = isInlineJoin(node.parentElement);
      if (parts.length && (inline || glue) && !sawSpace && !/^\s/.test(raw) && !/\s$/.test(parts[parts.length - 1]!)) parts[parts.length - 1] += raw;
      else parts.push(raw);
      glue = inline;
      sawSpace = false;
      return;
    }
    if (node.nodeType !== 1) return;
    const e = node as Element;
    if (SKIP_TAGS.has(e.tagName)) return;
    if (opts.skip && e.matches(opts.skip)) return;
    const inline = isInlineJoin(e);
    if (!inline) {
      glue = false;
      sawSpace = false;
    }
    for (const c of e.childNodes) visit(c);
    if (!inline) {
      glue = false;
      sawSpace = false;
    }
  };
  for (const c of el.childNodes) visit(c);
  return parts.map((p) => p.trim()).filter(Boolean).join(" ").replace(/\s+/g, " ");
}

/** Visible text of a page (scripts, styles, hidden elements skipped), capped. Used for session probes. */
export function visibleText(doc: Document, cap = 200_000): string {
  const root = doc.body;
  if (!root) return "";
  const out: string[] = [];
  let size = 0;
  const visit = (node: Node): boolean => {
    if (size >= cap) return false;
    if (node.nodeType === 3) {
      const t = (node.textContent ?? "").trim();
      if (t) {
        out.push(t);
        size += t.length + 1;
      }
      return true;
    }
    if (node.nodeType !== 1) return true;
    const e = node as Element;
    if (SKIP_TAGS.has(e.tagName)) return true;
    if (e.hasAttribute("hidden")) return true;
    const style = e.getAttribute("style") ?? "";
    if (/display\s*:\s*none|visibility\s*:\s*hidden/i.test(style)) return true;
    for (const c of e.childNodes) if (!visit(c)) return false;
    return true;
  };
  visit(root);
  return normalizeSpaces(out.join(" "));
}

function firstText(root: Element, selectors: string[] | undefined, exclude?: RegExp): string | null {
  for (const sel of selectors ?? []) {
    let els: Element[];
    try {
      els = [...root.querySelectorAll(sel)];
    } catch {
      continue;
    }
    for (const el of els) {
      if (exclude) {
        const cls = el.getAttribute("class") ?? "";
        if (exclude.test(cls)) continue;
        // A title inside a price/badge box ("box__price--coupon > .text__item--title") is a label.
        const box = el.parentElement?.closest("[class*='price' i], [class*='badge' i], [class*='coupon' i]");
        if (box && box !== root && root.contains(box)) continue;
      }
      const t = clean(el.getAttribute("title") || el.getAttribute("aria-label") || textOf(el));
      if (t) return t;
    }
  }
  return null;
}

/** Tries selectors in order; returns the element's label text (aria-label / content / title / text). */
function selectorText(root: Element, selectors: string[] | undefined, skip?: string): string | null {
  for (const sel of selectors ?? []) {
    let el: Element | null;
    try {
      el = root.querySelector(sel);
    } catch {
      continue;
    }
    if (!el) continue;
    const t = clean(el.getAttribute("aria-label") || el.getAttribute("content") || textOf(el, skip ? { skip } : {}) || el.getAttribute("title"));
    if (t) return t;
  }
  return null;
}

function imageUrlOf(img: Element): string {
  const srcset = img.getAttribute("srcset") || img.getAttribute("data-srcset") || "";
  const fromSet = srcset.split(",")[0]?.trim().split(/\s+/)[0] ?? "";
  for (const u of [img.getAttribute("data-src"), img.getAttribute("data-lazy-src"), img.getAttribute("data-original"), img.getAttribute("data-src-pb"), img.getAttribute("src"), fromSet]) {
    if (u && !u.startsWith("data:") && !/^\s*$/.test(u)) return u.trim();
  }
  return "";
}

function usableImage(img: Element): string | null {
  const src = imageUrlOf(img);
  if (!src || IMAGE_SKIP.test(src)) return null;
  const alt = img.getAttribute("alt") ?? "";
  if (alt && ALT_SKIP.test(alt) && alt.length < 40) return null;
  const w = Number(img.getAttribute("width") || 0);
  const h = Number(img.getAttribute("height") || 0);
  if ((w && w < 40) || (h && h < 40)) return null;
  return src;
}

function bestImage(card: Element, base: string, anchors: Element[], selectors?: string[]): string | null {
  for (const sel of selectors ?? []) {
    const el = card.querySelector(sel);
    const src = el ? usableImage(el) : null;
    if (src) return absUrl(src, base);
  }
  // Prefer an image inside one of the product links, then any usable image in the card.
  for (const a of anchors) {
    for (const img of a.querySelectorAll("img")) {
      const src = usableImage(img);
      if (src) return absUrl(src, base);
    }
  }
  for (const img of card.querySelectorAll("img")) {
    const src = usableImage(img);
    if (src) return absUrl(src, base);
  }
  const bg = card.querySelector<HTMLElement>("[style*='background-image']");
  const m = /url\(["']?([^"')]+)["']?\)/.exec(bg?.getAttribute("style") ?? "");
  const u = m?.[1] ?? "";
  return u && !u.startsWith("data:") ? absUrl(u, base) : null;
}

function groupsJoined(m: RegExpExecArray): string {
  const g = m.slice(1).filter((x): x is string => typeof x === "string" && x.length > 0);
  return g.length ? g.join("") : m[0];
}

export function extractCards(doc: Document, spec: CardSpec, base = doc.location?.href || "https://example.com/"): CardData[] {
  const climb = spec.climb ?? 8;
  const anchors = [...doc.querySelectorAll<HTMLAnchorElement>("a[href]")];
  const byId = new Map<string, { anchors: HTMLAnchorElement[]; card: Element }>();

  for (const a of anchors) {
    const href = a.getAttribute("href") ?? "";
    const m = spec.link.exec(href);
    if (!m || !m[1]) continue;
    const id = m[1];
    const known = byId.get(id);
    if (known) {
      known.anchors.push(a);
      continue;
    }
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
    byId.set(id, { anchors: [a], card });
  }

  const out: CardData[] = [];
  for (const [id, { anchors: links, card }] of byId) {
    const text = textOf(card);
    if (spec.cardFilter && !spec.cardFilter(card, text)) continue;
    const priceScope = textOf(card, { skip: STRIKE_SEL });
    const first = links[0]!;

    // Title: selectors, then link title/aria-label, then image alt, then the longest link text.
    const linkLabels = links.map((a) => clean(a.getAttribute("title") || a.getAttribute("aria-label"))).filter((t) => t.length > 2);
    const linkTexts = links.map((a) => textOf(a)).filter((t) => t.length > 2 && t.length <= 300);
    const longest = (xs: string[]) => xs.sort((x, y) => y.length - x.length)[0] ?? "";
    const altCandidates = [...card.querySelectorAll("img")]
      .filter((i) => usableImage(i) !== null)
      .map((i) => clean(i.getAttribute("alt")))
      .filter((t) => t.length >= 10 && !ALT_SKIP.test(t));
    // Leaf texts (no element children) that read like a name: longer than a label, not a price or a count.
    const leafCandidates = [...card.querySelectorAll("span, div, p, h1, h2, h3, h4, a, strong")]
      .filter((e) => e.children.length === 0 && !TITLE_EXCLUDE.test(e.getAttribute("class") ?? ""))
      .map((e) => clean(e.textContent))
      .filter((t) => t.length >= 10 && t.length <= 300 && !/^[\d\s.,%+€$£¥₺₽₹฿원円-]+$/.test(t) && !(spec.price ?? DEFAULT_PRICE).test(t) && !/^\d/.test(t));
    // Fallback ranking: the candidate that shares the most words with the product URL slug wins (promo lines share none).
    const slugTokens = new Set(decodeURIComponent(first.getAttribute("href") ?? "").toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((t) => t.length >= 3 && !/^\d+$/.test(t)));
    const slugScore = (t: string) => {
      if (!slugTokens.size) return 0;
      let n = 0;
      for (const w of t.toLowerCase().split(/[^\p{L}\p{N}]+/u)) if (w.length >= 3 && slugTokens.has(w)) n++;
      return n;
    };
    const bySlug = (xs: string[]) => [...xs].sort((x, y) => slugScore(y) - slugScore(x) || y.length - x.length)[0] ?? "";
    const ranked = bySlug([...linkLabels, ...leafCandidates, ...altCandidates]);
    let title = firstText(card, spec.titleSelectors, TITLE_EXCLUDE) || (slugScore(ranked) > 0 ? ranked : "") || longest(linkLabels) || longest(leafCandidates) || longest(altCandidates) || longest(linkTexts).slice(0, 160);
    if (spec.titlePrefixes?.length) {
      for (const p of spec.titlePrefixes) {
        if (p && title.toLowerCase().startsWith(p.toLowerCase())) title = clean(title.slice(p.length).replace(/^[\s,:|·\-–]+/, ""));
      }
    }

    // Price: selector hit first (regex, then bare number), then regex over the strike-free card text.
    const priceRe = spec.price ?? DEFAULT_PRICE;
    let priceText: string | null = null;
    let price: number | null = null;
    const selText = selectorText(card, spec.priceSelectors, STRIKE_SEL);
    if (selText) {
      const pm = priceRe.exec(selText);
      if (pm) {
        priceText = pm[0];
        price = parsePrice(groupsJoined(pm));
      } else if (selText.length <= 40 && /\d/.test(selText)) {
        priceText = selText;
        price = parsePrice(selText);
      }
    }
    if (price === null) {
      const pm = priceRe.exec(priceScope) ?? priceRe.exec(text);
      if (pm) {
        priceText = pm[0];
        price = parsePrice(groupsJoined(pm));
      }
    }
    // Ranges ("US$ 14.49 - 14.99") live in the selector text as a whole, not in the regex match.
    const moneyText = priceText && selText && selText.length <= 60 && selText.includes(priceText) ? selText : priceText;
    const money = moneyText ? parseMoney(moneyText, { ...(spec.yenAs ? { yenAs: spec.yenAs } : {}) }) : null;
    const priceCurrency = money?.currency ?? spec.currency ?? null;

    const soldText = selectorText(card, spec.soldSelectors);
    const soldRe = spec.sold ?? DEFAULT_SOLD;
    const soldM = soldRe.exec(soldText ?? "") ?? soldRe.exec(text);
    const sold = soldText && !soldM ? parseCount(soldText) : soldM ? parseCount(soldM[1] ?? soldM[2]) : null;

    const moqM = (spec.moq ?? DEFAULT_MOQ).exec(text);
    const moq = moqM ? parseCount(moqM[1] ?? moqM[2]) : null;

    const attrText = [...card.querySelectorAll("[alt], [title]")].map((e) => `${e.getAttribute("alt") ?? ""} ${e.getAttribute("title") ?? ""}`).join(" ");
    const hit = (spec.badgeWords ?? []).filter((w) => text.includes(w) || attrText.includes(w));
    // "Verified" inside "Verified Supplier" is the same badge: keep the most specific word only.
    const badges = hit.filter((w) => !hit.some((o) => o !== w && o.includes(w)));

    const ratingText = selectorText(card, spec.ratingSelectors);
    const ratingM = ratingText ? /(\d(?:[.,]\d{1,2})?)/.exec(ratingText) : null;
    const rating = ratingM ? Number(ratingM[1]!.replace(",", ".")) : null;
    const yearsM = spec.years ? spec.years.exec(text) : null;
    const ratingCountM = spec.ratingCount ? spec.ratingCount.exec(text) : null;

    out.push({
      id,
      url: absUrl(first.getAttribute("href")!, base),
      title,
      image: bestImage(card, base, links, spec.imageSelectors),
      price,
      priceText,
      priceCurrency,
      priceMax: money?.max ?? null,
      sold,
      shop: firstText(card, spec.shopSelectors, /price|rating|badge/i),
      location: firstText(card, spec.locationSelectors),
      badges,
      moq,
      rating: rating !== null && rating >= 0 && rating <= 5 ? rating : null,
      ratingCount: ratingCountM ? parseCount(ratingCountM[1] ?? ratingCountM[0]) : null,
      supplierYears: yearsM ? Number(yearsM[1]) : null,
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

/** Reads a `<script type="application/json">` (Next.js `#__NEXT_DATA__`, Nuxt, JSON-LD) by selector. */
export function readJsonScript<T = unknown>(doc: Document, selector: string): T | null {
  const el = doc.querySelector(selector);
  if (!el) return null;
  try {
    return JSON.parse(el.textContent ?? "") as T;
  } catch {
    return null;
  }
}

/** All JSON-LD blocks of a given @type (e.g. "Product", "ItemList"). */
export function readJsonLd(doc: Document, type?: string): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  for (const s of doc.querySelectorAll("script[type='application/ld+json']")) {
    try {
      const v = JSON.parse(s.textContent ?? "") as unknown;
      const list = Array.isArray(v) ? v : v && typeof v === "object" && Array.isArray((v as { "@graph"?: unknown[] })["@graph"]) ? (v as { "@graph": unknown[] })["@graph"] : [v];
      for (const o of list) {
        if (o && typeof o === "object") {
          const r = o as Record<string, unknown>;
          const t = r["@type"];
          if (!type || t === type || (Array.isArray(t) && t.includes(type))) out.push(r);
        }
      }
    } catch {
      /* not JSON */
    }
  }
  return out;
}

/**
 * Concatenates the React Server Components flight payload (`self.__next_f.push([1,"…"])`)
 * into one decoded string. The chunks are JS string literals, so each is JSON.parse'd first.
 */
export function readNextFlight(doc: Document): string {
  const parts: string[] = [];
  for (const s of doc.querySelectorAll("script:not([src])")) {
    const src = s.textContent ?? "";
    if (!src.includes("__next_f.push")) continue;
    const re = /__next_f\.push\(\[\d+\s*,\s*("(?:[^"\\]|\\.)*")\s*\]\)/g;
    for (const m of src.matchAll(re)) {
      try {
        parts.push(JSON.parse(m[1]!) as string);
      } catch {
        /* skip malformed chunk */
      }
    }
  }
  return parts.join("");
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

/** Concatenated text of all inline scripts; for pages whose embedded state is not valid JSON. */
export function inlineScriptText(doc: Document, cap?: number): string {
  const parts: string[] = [];
  let size = 0;
  for (const s of doc.querySelectorAll("script:not([src])")) {
    const t = s.textContent ?? "";
    parts.push(t);
    size += t.length;
    if (cap && size >= cap) break;
  }
  const all = parts.join("\n");
  return cap ? all.slice(0, cap) : all;
}

/** Reads `"key":"string"` or `"key":123` from raw script text. */
export function scriptField(text: string, key: string): string | null {
  const m = new RegExp(`"${key}"\\s*:\\s*(?:"((?:[^"\\\\]|\\\\.)*)"|(-?\\d+(?:\\.\\d+)?))`).exec(text);
  if (!m) return null;
  if (m[1] !== undefined) {
    try {
      return JSON.parse(`"${m[1]}"`) as string;
    } catch {
      return m[1];
    }
  }
  return m[2] ?? null;
}

/** First canonical / og:url of a page, for "is this the product page I asked for" checks. */
export function canonicalUrl(doc: Document): string {
  return (
    doc.querySelector("link[rel='canonical']")?.getAttribute("href") ||
    doc.querySelector("meta[property='og:url']")?.getAttribute("content") ||
    doc.location?.href ||
    ""
  );
}
