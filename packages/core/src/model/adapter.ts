import type { CountryCode, CurrencyCode, LanguageCode, MarketId } from "./ids";
import type { NormalizedBadge, RawListing, RawListingDetail, RawSupplier } from "./listing";

export type SessionState = "logged-in" | "logged-out" | "captcha" | "unknown";

export interface MarketCapabilities {
  imageSearch: boolean;
  textSearch: boolean;
  linkResolve: boolean;
  supplierProfile: boolean;
  priceTiers: boolean;
}

export interface MarketMeta {
  name: string;
  country: CountryCode;
  currency: CurrencyCode;
  language: LanguageCode;
  role: "source" | "target" | "both";
  capabilities: MarketCapabilities;
  rateLimit: { minIntervalMs: number; maxPerHour: number };
  version: string;
  /** Hosts on which the extension's content script may act for this market. */
  hosts: string[];
  /** Where the user logs in, when the market needs a session. */
  loginUrl?: string;
}

export interface ImageInput {
  /** Data URL or object URL the adapter can load. */
  dataUrl: string;
  /** Where the image came from, when it is already hosted (lets markets search by URL without an upload). */
  sourceUrl?: string;
  /** Optional crop region as fractions of the full image. */
  region?: { x: number; y: number; w: number; h: number };
}

/**
 * Stage of a request inside the page runner (the extension), reported live while a search runs.
 * "queued" means the runner has not opened a tab yet (waiting for a free slot): the orchestrator
 * pauses the market's deadline while a request is queued, so a tab cap of 3 never produces a
 * spurious Timeout for the markets behind it.
 */
export type AdapterStage = "queued" | "opening" | "loading" | "typing" | "image" | "settling" | "captcha" | "done";

export interface AdapterProgress {
  stage: AdapterStage;
  /** Result page being read (1-based) when the adapter walks several pages. */
  page?: number;
}

export interface SearchOptions {
  maxResults?: number;
  /** Aborting cancels the in-flight page request as well (the runner is told to stop), not only the loop between pages. */
  signal?: AbortSignal;
  /** Live stage of the request (queued/opening/loading/typing/settling/…), when the adapter runs through a page runner. */
  onProgress?: (progress: AdapterProgress) => void;
}

/** Hints that let an adapter fetch the exact offer the user saw (seller-specific page, original URL). */
export interface ListingHint {
  /** The URL the listing was found at; adapters keep seller parameters from it (Trendyol merchantId). */
  url?: string;
  /** Seller whose offer should be shown when the market serves one page per seller. */
  supplierId?: string;
}

export interface LinkInfo {
  market: MarketId;
  listingId: string;
  canonicalUrl: string;
}

export type AdapterErrorType =
  | "LoggedOut"
  | "Captcha"
  | "SelectorBroken"
  | "RateLimited"
  | "NotFound"
  | "Network"
  /** The market did not answer within the orchestrator's per-market deadline. */
  | "Timeout"
  /** A bug on our side (TypeError, RangeError, decode failure), not the market's. */
  | "Internal";

export class AdapterError extends Error {
  constructor(
    public readonly type: AdapterErrorType,
    public readonly market: MarketId,
    message?: string,
    public readonly retryable = type === "RateLimited" || type === "Network" || type === "Timeout",
  ) {
    super(message ?? `${market}: ${type}`);
    this.name = "AdapterError";
  }
}

export interface HealthResult {
  ok: boolean;
  checkedAt: string;
  message?: string;
  durationMs?: number;
}

export interface MarketAdapter {
  id: MarketId;
  meta: MarketMeta;
  /** Maps a market's raw badge label to a normalized badge, when known. */
  badgeMap: Record<string, NormalizedBadge>;

  session(): Promise<SessionState>;
  resolveLink(url: string): LinkInfo | null;

  searchByImage(input: ImageInput, opts?: SearchOptions): AsyncIterable<RawListing>;
  searchByText(query: string, opts?: SearchOptions): AsyncIterable<RawListing>;

  /** Detail of a listing; `hint` lets the adapter open the seller-specific page instead of the buy-box winner. */
  fetchListing(id: string, hint?: ListingHint): Promise<RawListingDetail>;
  fetchSupplier(id: string): Promise<RawSupplier>;

  healthCheck(): Promise<HealthResult>;
}

export function normalizeBadges(adapter: MarketAdapter, raw: string[]): NormalizedBadge[] {
  const out = new Set<NormalizedBadge>();
  for (const b of raw) {
    const n = adapter.badgeMap[b];
    if (n) out.add(n);
  }
  return [...out];
}
