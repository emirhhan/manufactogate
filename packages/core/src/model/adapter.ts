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

export interface SearchOptions {
  maxResults?: number;
  signal?: AbortSignal;
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
  | "Network";

export class AdapterError extends Error {
  constructor(
    public readonly type: AdapterErrorType,
    public readonly market: MarketId,
    message?: string,
    public readonly retryable = type === "RateLimited" || type === "Network",
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

  fetchListing(id: string): Promise<RawListingDetail>;
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
