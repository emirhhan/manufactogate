import type { AdapterErrorType, MarketId } from "@manufactogate/core";

/**
 * The PageRunner is what the extension provides to real adapters: it opens a market
 * page in the user's own browser session and runs an extraction routine there.
 * Adapters never touch the network themselves.
 */

export type ExtractKind = "search" | "detail" | "supplier" | "health";

export interface ExtractRequest {
  market: MarketId;
  kind: ExtractKind;
  /** Page to open. */
  url: string;
  /** Optional image to feed into the page's own file input (data URL). */
  imageDataUrl?: string;
  /** Type this query into the page's search box and submit it like a person would, instead of a search URL. */
  typeQuery?: string;
  /** Market-specific search box selectors to try before the generic list (used with `typeQuery`). */
  searchBox?: string[];
  /** Regex source the final URL must match to count as a results page (used with `typeQuery`). */
  expectUrl?: string;
  /** Milliseconds to wait for results to settle. */
  timeoutMs?: number;
  /** How many results satisfy the request. */
  want?: number;
  /** Quick probe: never wait for the user to solve a captcha, never scroll; return the first reading. */
  quick?: boolean;
}

export interface ExtractResult<T = unknown> {
  ok: true;
  data: T;
  /** Page the data was read from, after redirects. */
  finalUrl: string;
  tookMs: number;
}
export interface ExtractFailure {
  ok: false;
  error: AdapterErrorType;
  message: string;
  finalUrl?: string;
}

export interface PageRunner {
  run<T = unknown>(req: ExtractRequest): Promise<ExtractResult<T> | ExtractFailure>;
}

/** What a page-side probe reports about the page as a whole (beyond the items). */
export interface PageProbe {
  /** The page says there are no results for the query (distinct from "selector broken"). */
  noResults: boolean;
  /** Total result count the page advertises, when it prints one. */
  total: number | null;
  /** Whether the current location looks like a results page; null when the market has no pattern. */
  resultsPage: boolean | null;
  /** The market served an intentionally empty page to this session (risk control); Turkish hint for the user. */
  blocked?: string | null;
}

/**
 * Pure page-side extraction routine. It runs inside the market tab (content world) and
 * must only use the DOM. It is bundled separately into the extension's extract script.
 */
export interface PageExtractor {
  /** Detect login/captcha walls. */
  session(doc: Document): "logged-in" | "logged-out" | "captcha" | "unknown";
  search?(doc: Document): unknown[];
  /** Page-level signals for search pages: "no results" text, advertised total, results-URL match. */
  probe?(doc: Document): PageProbe;
  detail?(doc: Document): unknown | null;
  supplier?(doc: Document): unknown | null;
  /** Finds the file input for image search; returns null when the page has none. */
  imageInput?(doc: Document): HTMLInputElement | null;
}
