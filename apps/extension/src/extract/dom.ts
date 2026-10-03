/**
 * Pure DOM helpers for the page-side extract bundle. No chrome APIs, no network, so they run
 * unchanged under happy-dom in unit tests. Visibility uses getClientRects(), which is also true
 * for position:fixed elements (offsetParent is null there), and falls back to attribute checks
 * when the document has no layout engine (tests).
 */

export type SearchBox = HTMLInputElement | HTMLTextAreaElement | HTMLElement;

/** Explicit selectors for hosts whose box the generic heuristic misses or ranks wrongly. */
const KNOWN_BOX_SELECTORS = [
  "#twotabsearchtextbox", // Amazon family
  "input.el-input__inner[label='Search' i]", // Global Sources home (Element UI)
  "#searchInput", // Wildberries, Temu
  "#search-input", // Noon
  "input[name='q']",
  "input[name='keywords']",
  "input[name='keyword']",
  "input[name='SearchText']",
  "input[name='search_key']",
  "input[name='searchkey']",
  "input[name='k']",
  "input[name='_nkw']",
  "input[name='text']",
  "input[name='search']",
  "input[name='p']",
  "input[name='ss']",
  "input[name='site-search']",
  "#GlobalNavSearchInput",
  "#form__search-keyword",
  "input[type=search]",
  "input[role=combobox]",
];

const SEARCH_WORDS = /搜|ara\b|arama|search|cari|検索|검색|поиск|найти|looking for|buscar|suche|bul/i;
const NOT_SEARCH = /mail|pass|phone|tel\b|zip|postal|code|otp|coupon|price|min\b|max\b|quantity|qty|promo|voucher|card|cvv|iban|birth|name|address|adres|captcha/i;

function hasLayout(doc: Document): boolean {
  try {
    // A real layout engine gives the root a width; happy-dom reports zero-sized rects for everything.
    return doc.documentElement.getBoundingClientRect().width > 0;
  } catch {
    return false;
  }
}

/** Visible enough to type into or click. */
export function isVisible(el: Element | null | undefined): el is HTMLElement {
  if (!el || !(el instanceof HTMLElement)) return false;
  if (el.hidden || el.getAttribute("aria-hidden") === "true") return false;
  if (el instanceof HTMLInputElement && (el.type === "hidden" || el.disabled || el.readOnly)) return false;
  const doc = el.ownerDocument;
  const view = doc.defaultView;
  if (view) {
    for (let n: Element | null = el; n && n !== doc.body; n = n.parentElement) {
      const cs = view.getComputedStyle(n);
      if (cs.display === "none" || cs.visibility === "hidden") return false;
    }
  }
  if (!hasLayout(doc)) return true;
  const rects = el.getClientRects();
  if (rects.length === 0) return false;
  const r = rects[0]!;
  return r.width > 0 && r.height > 0;
}

export function widthOf(el: Element): number {
  try {
    const r = el.getBoundingClientRect();
    return r.width || Number(el.getAttribute("size") ?? 0) * 8 || 0;
  } catch {
    return 0;
  }
}

function widestVisible(nodes: Iterable<Element>): HTMLElement | null {
  let best: HTMLElement | null = null;
  let bestW = -1;
  for (const n of nodes) {
    if (!isVisible(n)) continue;
    const w = widthOf(n);
    if (w > bestW) {
      best = n;
      bestW = w;
    }
  }
  return best;
}

function inSearchContext(el: Element): boolean {
  return !!el.closest("header, nav, form[role=search], [role=search], [class*='search' i], [id*='search' i], [class*='header' i], [class*='Header'], [class*='top-bar' i], [class*='topbar' i]");
}

function describes(el: Element): string {
  return [el.getAttribute("placeholder"), el.getAttribute("aria-label"), el.getAttribute("title"), el.getAttribute("name"), el.id, el.getAttribute("class")].filter(Boolean).join(" ");
}

/**
 * Finds the site's main search box: explicit selectors for known hosts first (widest visible match),
 * then the widest visible text input that looks like a search field, preferring header/form context.
 */
export function findSearchBox(doc: Document, extraSelectors: readonly string[] = []): SearchBox | null {
  for (const sel of [...extraSelectors, ...KNOWN_BOX_SELECTORS]) {
    let list: NodeListOf<Element>;
    try {
      list = doc.querySelectorAll(sel);
    } catch {
      continue;
    }
    if (!list.length) continue;
    const el = widestVisible(list);
    if (el && !NOT_SEARCH.test(el.getAttribute("name") ?? "") && !(el instanceof HTMLInputElement && /^(?:password|email|tel|number|hidden|checkbox|radio|file|submit|button)$/i.test(el.type))) return el;
  }
  const candidates = doc.querySelectorAll("input:not([type]), input[type=text], input[type=search], textarea, [contenteditable='true'], [role=combobox]");
  let best: HTMLElement | null = null;
  let bestScore = -Infinity;
  for (const c of candidates) {
    if (!isVisible(c)) continue;
    const d = describes(c);
    if (NOT_SEARCH.test(d) && !SEARCH_WORDS.test(d)) continue;
    let score = widthOf(c) / 100;
    if (inSearchContext(c)) score += 3;
    if (SEARCH_WORDS.test(d)) score += 2;
    if (c.closest("form")) score += 0.5;
    if (score > bestScore) {
      best = c;
      bestScore = score;
    }
  }
  return best && bestScore >= 2 ? best : null;
}

/** The submit control for a search box: the form's submit button or the nearest button in its search container. */
export function findSubmitFor(box: Element): HTMLElement | null {
  const form = box.closest("form");
  const fromForm = form?.querySelector<HTMLElement>("button[type=submit], input[type=submit], button:not([type]), [role=button][class*='search' i]");
  if (fromForm && isVisible(fromForm)) return fromForm;
  const scope = box.closest("form, [class*='search' i], [id*='search' i], [role=search], header") ?? box.parentElement;
  if (!scope) return null;
  for (const b of scope.querySelectorAll<HTMLElement>("button, [role=button], a[class*='search' i], [class*='search-btn' i], [class*='searchBtn'], [class*='btn-search' i], [class*='search-button' i], [class*='submit' i]")) {
    if (!isVisible(b)) continue;
    const d = describes(b) + " " + (b.textContent ?? "").trim().slice(0, 40);
    if (NOT_SEARCH.test(d) && !SEARCH_WORDS.test(d)) continue;
    return b;
  }
  return null;
}

const CAPTCHA_SEL =
  "[id*='captcha' i], [class*='captcha' i], iframe[src*='captcha' i], iframe[src*='recaptcha' i], iframe[src*='hcaptcha' i], .nc_wrapper, .nc-container, #px-captcha, #nocaptcha, [class*='slider-verify' i], [class*='verify-wrap' i], [class*='verifywrap' i], #baxia-dialog, .baxia-dialog, [class*='challenge-form'], [id*='challenge' i], [class*='punish' i]";
/** Markup present on usable pages (invisible reCAPTCHA plumbing) that must not count as a wall. */
const CAPTCHA_IGNORE = /grecaptcha-badge|g-recaptcha-response|captcha-script|captcha-loader/i;

/** True only when a captcha element actually occupies screen space, so invisible reCAPTCHA markup never blocks a usable page. */
export function captchaVisible(doc: Document): boolean {
  const layout = hasLayout(doc);
  for (const el of doc.querySelectorAll<HTMLElement>(CAPTCHA_SEL)) {
    if (CAPTCHA_IGNORE.test(`${el.id} ${el.className}`)) continue;
    if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) continue;
    if (!isVisible(el)) continue;
    if (!layout) return true;
    const r = el.getBoundingClientRect();
    if (r.width >= 40 && r.height >= 40) return true;
  }
  return false;
}

const TRIGGER_SEL =
  "[class*='camera' i], [class*='imgsearch' i], [class*='imagesearch' i], [class*='image-search' i], [class*='picsearch' i], [class*='pic-search' i], [class*='visual-search' i], [class*='visualsearch' i], [class*='image-upload' i], [class*='search-image' i], [class*='searchimage' i], [data-testid*='visual' i], [data-testid*='camera' i], [data-testid*='image-search' i], [aria-label*='image' i], [aria-label*='görsel' i], [title*='görsel' i], [title*='图'], [aria-label*='图'], [class*='upload' i], [class*='photo' i]";
const TRIGGER_TEXT = /上传图片|按图片搜索|图搜|拍照|以图搜|Görselle ara|görsel|search by image|image search|visual search/i;

/**
 * Finds the camera/upload trigger of the site's search bar. Scoped to search/header containers so
 * promo blocks and review photos elsewhere on the page never get clicked.
 */
export function findImageTrigger(doc: Document): HTMLElement | null {
  const scopes = [...doc.querySelectorAll<HTMLElement>("form[role=search], [role=search], header, [class*='search-bar' i], [class*='searchbar' i], [class*='search-box' i], [class*='searchbox' i], [class*='search-wrap' i], [class*='search-form' i], [id*='search' i]")];
  for (const scope of scopes) {
    for (const el of scope.querySelectorAll<HTMLElement>(TRIGGER_SEL)) {
      if (!isVisible(el)) continue;
      if (widthOf(el) > 160) continue; // triggers are icons/buttons, not banners
      if (el.closest("[class*='review' i], [class*='comment' i], [class*='product' i]")) continue;
      return el;
    }
    for (const el of scope.querySelectorAll<HTMLElement>("button, a, span, div, label")) {
      const t = (el.textContent ?? "").trim();
      if (t.length > 0 && t.length <= 16 && TRIGGER_TEXT.test(t) && isVisible(el)) return el;
    }
  }
  return null;
}

/** A file input that accepts images (hidden ones count: pages often keep them off-screen). */
export function findFileInput(doc: Document): HTMLInputElement | null {
  return (
    doc.querySelector<HTMLInputElement>("input[type=file][accept*='image' i]") ??
    doc.querySelector<HTMLInputElement>("input[type=file]:not([accept]), input[type=file][accept*='*']") ??
    null
  );
}

/** Cheap signature of page activity (element and image counts) for settle detection without serialising HTML. */
export function activitySignature(doc: Document): string {
  return `${doc.getElementsByTagName("*").length}:${doc.querySelectorAll("img").length}:${doc.readyState}`;
}

/** Whether the page advertises pasting an image into the search box (Taobao/1688 style). */
export function supportsPaste(doc: Document, box: Element | null): boolean {
  const d = box ? [box.getAttribute("placeholder"), box.getAttribute("title"), box.parentElement?.textContent?.slice(0, 200)].join(" ") : "";
  return /粘贴|Ctrl\s*\+\s*V|yapıştır/i.test(d);
}
