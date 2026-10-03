import {
  AdapterError,
  type HealthResult,
  type ImageInput,
  type LinkInfo,
  type MarketAdapter,
  type MarketId,
  type MarketMeta,
  type NormalizedBadge,
  type RawListing,
  type RawListingDetail,
  type RawSupplier,
  type SearchOptions,
  type SessionState,
} from "@manufactogate/core";
import { inlineScriptText, parseCount, visibleText, type CardData } from "../dom";
import type { ExtractFailure, ExtractRequest, ExtractResult, PageExtractor, PageProbe, PageRunner } from "./runner";

/** What a market's page-side search extractor returns per item. Must be JSON-serializable. */
export interface SearchItem extends CardData {
  currency?: string;
  moq?: number | null;
  tiers?: { minQty: number; unitPrice: number }[];
  rating?: number | null;
  supplierId?: string | null;
  /** Supplier intelligence read from the card/JSON when the market shows it. */
  supplierYears?: number | null;
  supplierVerified?: boolean;
  businessType?: "factory" | "trading" | "unknown";
  supplierRating?: number | null;
  ratingCount?: number | null;
  /** B2B listing without a list price ("Ask for a Quote", "Negotiable"). */
  priceOnRequest?: boolean;
  /** Language the title is written in on the page (markets localise titles for the browser language). */
  titleLang?: string | null;
}

export type SearchStrategy = "embedded" | "cards" | "none";

export interface SearchPayload extends Partial<PageProbe> {
  session: SessionState;
  items: SearchItem[];
  /** Which strategy produced the items: "embedded" (page JSON) or "cards" (DOM heuristic). */
  strategy: SearchStrategy;
  pageTitle: string;
}

/** Payload of a `kind: "health"` run. Items are optional: a light probe may only carry the session. */
export interface HealthPayload extends Partial<PageProbe> {
  session: SessionState;
  pageTitle?: string;
  items?: SearchItem[];
  strategy?: SearchStrategy;
}

export interface DetailPayload {
  session: SessionState;
  strategy: "embedded" | "dom" | "none";
  detail: Record<string, unknown> | null;
}

export interface SupplierPayload {
  session: SessionState;
  strategy: "embedded" | "dom" | "none";
  supplier: Record<string, unknown> | null;
}

export type CalibrationStatus = "live" | "fixture" | "synthetic" | "none";

export interface RealMarketDef {
  id: MarketId;
  meta: MarketMeta;
  badgeMap: Record<string, NormalizedBadge>;
  searchUrl(query: string, page?: number): string;
  /** How many result pages a text search may walk (default 1). */
  maxPages?: number;
  /** Home page of the market (session probes, human-like searches). */
  homeUrl?: string;
  /** When set, the first page is searched by typing into this page's search box (human-like) instead of a URL. */
  humanSearchHome?: string;
  /** Market-specific search box selectors, tried by the extension before its generic list. */
  searchBoxSelectors?: string[];
  /** A page URL must match this to count as a results page (home/interstitial pages do not). */
  resultsUrlPattern?: RegExp;
  /** Visible-text markers of a legitimate "no results" page. */
  noResultsMarkers?: string[];
  /** Captures the advertised total result count from visible text (group 1). */
  resultCountRegex?: RegExp;
  /** Page for image search. `upload: false` means the URL already carries the image (no file injection). */
  imageSearchUrl?: (input: ImageInput) => { url: string; upload: boolean };
  detailUrl(id: string): string;
  supplierUrl?: (id: string) => string;
  resolveLink(url: string): LinkInfo | null;
  /** Page-side routines, bundled into the extension. */
  extractor: PageExtractor;
  toListing(item: SearchItem, fetchedAt: string): RawListing | null;
  toDetail(detail: Record<string, unknown>, id: string, fetchedAt: string): RawListingDetail | null;
  toSupplier?: (supplier: Record<string, unknown>, id: string) => RawSupplier | null;
  /** Known-good query for health checks. */
  healthQuery: string;
  /** How the selectors were verified. */
  calibration?: CalibrationStatus;
}

function fail(def: RealMarketDef, r: ExtractFailure): never {
  throw new AdapterError(r.error, def.id, r.message);
}

function assertSession(def: RealMarketDef, s: SessionState, url?: string) {
  if (s === "logged-out") throw new AdapterError("LoggedOut", def.id, url);
  if (s === "captcha") throw new AdapterError("Captcha", def.id, url);
}

/** True/false when the def has a results pattern, null when it has none. */
export function isResultsUrl(def: Pick<RealMarketDef, "resultsUrlPattern">, url: string | undefined): boolean | null {
  if (!def.resultsUrlPattern || !url) return null;
  return def.resultsUrlPattern.test(url);
}

/** Strategy label for a list of items: embedded items carry no card text. */
export function strategyOf(items: readonly { text?: string }[]): SearchStrategy {
  if (items.length === 0) return "none";
  return items.every((i) => (i.text ?? "") === "") ? "embedded" : "cards";
}

/** Builds the full search payload (items + page probe) from an extractor; the extension calls this per poll. */
export function searchPayloadFor(ex: PageExtractor, doc: Document): SearchPayload {
  const session = ex.session(doc);
  const items = (ex.search?.(doc) ?? []) as SearchItem[];
  const probe = ex.probe?.(doc);
  return { session, items, strategy: strategyOf(items), pageTitle: doc.title, ...(probe ?? {}) };
}

/** Builds a light health payload: session + page probe, items only when they are cheap (already rendered). */
export function healthPayloadFor(ex: PageExtractor, doc: Document, withItems = true): HealthPayload {
  const session = ex.session(doc);
  const probe = ex.probe?.(doc);
  const items = withItems && session !== "captcha" && session !== "logged-out" ? ((ex.search?.(doc) ?? []) as SearchItem[]) : undefined;
  return { session, pageTitle: doc.title, ...(items ? { items, strategy: strategyOf(items) } : {}), ...(probe ?? {}) };
}

/** Below this share of new ids a page is treated as "the same page again" (wrong pagination parameter). */
const MIN_NEW_SHARE = 0.3;

/** Builds a MarketAdapter from a market definition and a PageRunner (the extension). */
export function createRealAdapter(def: RealMarketDef, runner: PageRunner): MarketAdapter {
  const now = () => new Date().toISOString();

  interface PageRead {
    listings: RawListing[];
    got: number;
    fresh: number;
    noResults: boolean;
    total: number | null;
  }

  function readItems(r: ExtractResult<SearchPayload>, seen: Set<string>, o?: SearchOptions): PageRead {
    const fetchedAt = now();
    const listings: RawListing[] = [];
    let fresh = 0;
    for (const item of r.data.items) {
      if (o?.signal?.aborted) break;
      if (!item.id || seen.has(item.id)) continue;
      seen.add(item.id);
      fresh++;
      const l = def.toListing(item, fetchedAt);
      if (l) listings.push(l);
    }
    return { listings, got: r.data.items.length, fresh, noResults: r.data.noResults === true, total: typeof r.data.total === "number" ? r.data.total : null };
  }

  async function runSearch(req: ExtractRequest): Promise<ExtractResult<SearchPayload>> {
    const r = await runner.run<SearchPayload>(req);
    if (!r.ok) fail(def, r);
    assertSession(def, r.data.session, r.finalUrl);
    return r;
  }

  /** Opens page `page` of a text query; the human path (typed query) falls back to the search URL. */
  async function searchTextPage(query: string, page: number, want: number): Promise<ExtractResult<SearchPayload>> {
    const urlReq: ExtractRequest = { market: def.id, kind: "search", url: def.searchUrl(query, page), want, ...(def.resultsUrlPattern ? { expectUrl: def.resultsUrlPattern.source } : {}) };
    if (page === 1 && def.humanSearchHome) {
      const humanReq: ExtractRequest = {
        ...urlReq,
        url: def.humanSearchHome,
        typeQuery: query,
        ...(def.searchBoxSelectors ? { searchBox: def.searchBoxSelectors } : {}),
      };
      const r = await runner.run<SearchPayload>(humanReq);
      if (!r.ok) {
        // The search box was not found (late-mounted, renamed, login wall): the search URL still works.
        if (r.error === "SelectorBroken" && /arama kutusu/i.test(r.message)) return runSearch(urlReq);
        fail(def, r);
      }
      assertSession(def, r.data.session, r.finalUrl);
      // Typed query did not navigate: the home page's promo cards are not results.
      if (isResultsUrl(def, r.finalUrl) === false) return runSearch(urlReq);
      return r;
    }
    const r = await runSearch(urlReq);
    if (isResultsUrl(def, r.finalUrl) === false) {
      throw new AdapterError("Network", def.id, `arama sayfasına yönlendirmedi: ${r.finalUrl}`);
    }
    return r;
  }

  async function* search(url: string, imageDataUrl: string | undefined, o?: SearchOptions): AsyncIterable<RawListing> {
    const max = o?.maxResults ?? 30;
    const seen = new Set<string>();
    const r = await runSearch({ market: def.id, kind: "search", url, want: Math.min(max, 60), ...(imageDataUrl ? { imageDataUrl } : {}) });
    const page = readItems(r, seen, o);
    let n = 0;
    for (const l of page.listings) {
      yield l;
      if (++n >= max) return;
    }
  }

  async function* searchText(query: string, o?: SearchOptions): AsyncIterable<RawListing> {
    const max = o?.maxResults ?? 30;
    const pages = Math.max(1, def.maxPages ?? 1);
    const seen = new Set<string>();
    let n = 0;
    for (let page = 1; page <= pages && n < max; page++) {
      if (o?.signal?.aborted) return;
      const r = await searchTextPage(query, page, Math.min(max - n, 60));
      if (r.data.items.length === 0 && r.data.blocked) throw new AdapterError("RateLimited", def.id, r.data.blocked);
      const read = readItems(r, seen, o);
      for (const l of read.listings) {
        yield l;
        if (++n >= max) return;
      }
      if (read.noResults && read.fresh === 0) return;
      // Nothing new, or mostly repeats: the pagination parameter did not move the page.
      if (read.fresh === 0 || read.fresh < read.got * MIN_NEW_SHARE) return;
      if (read.total !== null && seen.size >= read.total) return;
    }
  }

  return {
    id: def.id,
    meta: def.meta,
    badgeMap: def.badgeMap,

    async session(): Promise<SessionState> {
      const url = def.homeUrl ?? def.humanSearchHome ?? def.searchUrl(def.healthQuery);
      const r = await runner.run<{ session: SessionState }>({ market: def.id, kind: "health", url, timeoutMs: 8000, quick: true });
      return r.ok ? r.data.session : "unknown";
    },

    resolveLink: def.resolveLink,

    searchByImage(input: ImageInput, o?: SearchOptions) {
      if (!def.imageSearchUrl || !def.meta.capabilities.imageSearch) throw new AdapterError("NotFound", def.id, "bu pazar görselle arama desteklemiyor");
      const target = def.imageSearchUrl(input);
      return search(target.url, target.upload ? input.dataUrl : undefined, o);
    },
    searchByText(query: string, o?: SearchOptions) {
      return searchText(query, o);
    },

    async fetchListing(id: string): Promise<RawListingDetail> {
      const r = await runner.run<DetailPayload>({ market: def.id, kind: "detail", url: def.detailUrl(id) });
      if (!r.ok) fail(def, r);
      assertSession(def, r.data.session, r.finalUrl);
      const d = r.data.detail && def.toDetail(r.data.detail, id, now());
      if (!d) throw new AdapterError("SelectorBroken", def.id, `detail not parsed on ${r.finalUrl}`);
      return d;
    },

    async fetchSupplier(id: string): Promise<RawSupplier> {
      if (!def.supplierUrl || !def.toSupplier) throw new AdapterError("NotFound", def.id, "tedarikçi profili desteklenmiyor");
      const r = await runner.run<SupplierPayload>({ market: def.id, kind: "supplier", url: def.supplierUrl(id) });
      if (!r.ok) fail(def, r);
      assertSession(def, r.data.session, r.finalUrl);
      const s = r.data.supplier && def.toSupplier(r.data.supplier, id);
      if (!s) throw new AdapterError("SelectorBroken", def.id, `supplier not parsed on ${r.finalUrl}`);
      return s;
    },

    /** Quick probe (≤ 8 s, no captcha wait, no scrolling): session + results-page + whatever items are already rendered. */
    async healthCheck(): Promise<HealthResult> {
      const t0 = Date.now();
      try {
        const url = def.searchUrl(def.healthQuery);
        const r = await runner.run<HealthPayload>({ market: def.id, kind: "health", url, want: 5, timeoutMs: 8000, quick: true, ...(def.resultsUrlPattern ? { expectUrl: def.resultsUrlPattern.source } : {}) });
        if (!r.ok) return { ok: false, checkedAt: now(), durationMs: Date.now() - t0, message: `${r.error}: ${r.message}` };
        const d = r.data;
        const resultsPage = d.resultsPage ?? isResultsUrl(def, r.finalUrl);
        const n = d.items?.length;
        const sessionOk = d.session !== "captcha" && d.session !== "logged-out";
        const parts: string[] = [d.session];
        if (resultsPage === false) parts.push("sonuç sayfası açılmadı");
        else if (n !== undefined) parts.push(`${n} sonuç`, `strateji ${d.strategy ?? strategyOf(d.items ?? [])}`);
        else parts.push("sonuç sayfası açıldı");
        if (d.noResults) parts.push("pazar: sonuç yok");
        if (typeof d.total === "number") parts.push(`toplam ${d.total}`);
        const ok = sessionOk && resultsPage !== false && (n === undefined || n > 0 || d.noResults === true);
        return { ok, checkedAt: now(), durationMs: Date.now() - t0, message: parts.join("; ") };
      } catch (e) {
        return { ok: false, checkedAt: now(), durationMs: Date.now() - t0, message: e instanceof Error ? e.message : String(e) };
      }
    },
  };
}

/* ------------------------------------------------------------------------------------------------
 * Session detection
 * ---------------------------------------------------------------------------------------------- */

export interface SessionProbeOptions {
  /** URL patterns of login pages. */
  loginHosts: RegExp;
  /** URL patterns of verification / captcha pages. */
  captchaHosts?: RegExp;
  /** Visible-text / title phrases that only a captcha wall shows. */
  captchaMarkers: string[];
  /** Selectors that only a captcha wall renders (added to the generic list). */
  captchaSelectors?: string[];
  loggedInMarkers: string[];
  loggedInSelectors?: string[];
  loggedOutMarkers?: string[];
  loggedOutSelectors?: string[];
  /** Markers matched against inline script text (page state), not the visible text. */
  scriptMarkers?: { loggedIn?: string[]; loggedOut?: string[] };
}

/** Captcha walls across markets: Amazon, PerimeterX, hCaptcha, Cloudflare, Alibaba/Taobao slider, DataDome, Shopee. */
export const GENERIC_CAPTCHA_SELECTORS: readonly string[] = [
  "form[action*='validateCaptcha']",
  "#captchacharacters",
  "#px-captcha",
  "iframe[src*='hcaptcha.com']",
  "iframe[src*='captcha-delivery']",
  "iframe[src*='geo.captcha-delivery']",
  "iframe[src*='challenges.cloudflare.com']",
  "#challenge-running",
  "#cf-challenge-running",
  ".captcha-container",
  "[class*='slider-verify']",
  "#nocaptcha",
  ".nc_wrapper",
  "#baxia-punish",
  "[class*='baxia-dialog']",
  "#captcha-box",
  "[class*='captcha-box']",
  "[data-testid='captcha']",
];

/** Title phrases that only a wall shows (product titles containing "robot" are not walls). */
const CAPTCHA_TITLE = /\bcaptcha\b|robot check|robot or human|are you a human|verify you are human|just a moment|security verification|access denied|доступ ограничен|安全验证|验证码|请完成验证|滑动验证|human verification/i;

interface PageSignals {
  at: number;
  /** Cheap fingerprint (element count + title + href) so a re-rendered page is re-read. */
  key: string;
  href: string;
  title: string;
  text: string;
  scripts: string | null;
}

const signalCache = new WeakMap<Document, PageSignals>();
const SIGNAL_TTL_MS = 1500;

/** Visible text, title and href of a page, computed at most once per 1.5 s per unchanged document. */
export function pageSignals(doc: Document): PageSignals {
  const href = doc.location?.href ?? "";
  const title = doc.title ?? "";
  const key = `${doc.body?.getElementsByTagName("*").length ?? 0}|${title}|${href}`;
  const cached = signalCache.get(doc);
  const nowMs = Date.now();
  if (cached && cached.key === key && nowMs - cached.at < SIGNAL_TTL_MS) return cached;
  const s: PageSignals = { at: nowMs, key, href, title, text: visibleText(doc, 200_000), scripts: null };
  signalCache.set(doc, s);
  return s;
}

function scriptsOf(doc: Document, s: PageSignals): string {
  if (s.scripts === null) s.scripts = inlineScriptText(doc, 400_000);
  return s.scripts;
}

function anySelector(doc: Document, selectors: readonly string[] | undefined): boolean {
  for (const sel of selectors ?? []) {
    try {
      if (doc.querySelector(sel)) return true;
    } catch {
      /* invalid selector in a market def: ignore */
    }
  }
  return false;
}

/**
 * Shared session heuristics for page extractors. Works on the page's URL, title, visible text and
 * selector probes; never on raw HTML, so reCAPTCHA badges, CSP metas and tracking scripts do not
 * count as walls.
 */
export function detectSession(doc: Document, opts: SessionProbeOptions): SessionState {
  const s = pageSignals(doc);
  if (opts.loginHosts.test(s.href)) return "logged-out";
  if (opts.captchaHosts?.test(s.href)) return "captcha";
  if (CAPTCHA_TITLE.test(s.title)) return "captcha";
  if (anySelector(doc, GENERIC_CAPTCHA_SELECTORS) || anySelector(doc, opts.captchaSelectors)) return "captcha";
  const hay = `${s.title}\n${s.text}`;
  if (opts.captchaMarkers.some((m) => m && hay.includes(m))) return "captcha";
  if (anySelector(doc, opts.loggedOutSelectors) || opts.loggedOutMarkers?.some((m) => m && hay.includes(m))) return "logged-out";
  if (opts.scriptMarkers?.loggedOut?.length && opts.scriptMarkers.loggedOut.some((m) => scriptsOf(doc, s).includes(m))) return "logged-out";
  if (anySelector(doc, opts.loggedInSelectors) || opts.loggedInMarkers.some((m) => m && hay.includes(m))) return "logged-in";
  if (opts.scriptMarkers?.loggedIn?.length && opts.scriptMarkers.loggedIn.some((m) => scriptsOf(doc, s).includes(m))) return "logged-in";
  return "unknown";
}

/** Page-level probe shared by extractors: "no results" wording, advertised total, results-URL match. */
export function pageProbe(doc: Document, opts: { noResultsMarkers?: string[]; resultCountRegex?: RegExp; resultsUrlPattern?: RegExp; blocked?: (doc: Document) => string | null }): PageProbe {
  const s = pageSignals(doc);
  const hay = `${s.title}\n${s.text}`;
  const noResults = (opts.noResultsMarkers ?? []).some((m) => m && hay.includes(m));
  const m = opts.resultCountRegex?.exec(hay);
  const total = m ? parseCount(m[1] ?? m[0]) : null;
  const resultsPage = opts.resultsUrlPattern ? opts.resultsUrlPattern.test(s.href) : null;
  const blocked = opts.blocked?.(doc) ?? null;
  return { noResults, total, resultsPage, ...(blocked ? { blocked } : {}) };
}
