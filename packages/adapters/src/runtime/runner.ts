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
  /** Milliseconds to wait for results to settle. */
  timeoutMs?: number;
  /** How many results satisfy the request. */
  want?: number;
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

/**
 * Pure page-side extraction routine. It runs inside the market tab (content world) and
 * must only use the DOM. It is bundled separately into the extension's extract script.
 */
export interface PageExtractor {
  /** Detect login/captcha walls. */
  session(doc: Document): "logged-in" | "logged-out" | "captcha" | "unknown";
  search?(doc: Document): unknown[];
  detail?(doc: Document): unknown | null;
  supplier?(doc: Document): unknown | null;
  /** Finds the file input for image search; returns null when the page has none. */
  imageInput?(doc: Document): HTMLInputElement | null;
}
