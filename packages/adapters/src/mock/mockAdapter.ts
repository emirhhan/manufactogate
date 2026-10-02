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
import { mockListings, mockSupplier } from "./data";

export interface MockOptions {
  /** Simulated per-listing latency in ms. */
  latencyMs?: number;
  /** Force a session state. */
  session?: SessionState;
  /** Throw this error type on search, to exercise error UI. */
  failWith?: AdapterError["type"];
}

export function createMockAdapter(
  id: MarketId,
  meta: MarketMeta,
  badgeMap: Record<string, NormalizedBadge>,
  opts: MockOptions = {},
): MarketAdapter {
  const latency = opts.latencyMs ?? 120;
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  async function* emit(query: string | null, o?: SearchOptions): AsyncIterable<RawListing> {
    if (opts.failWith) throw new AdapterError(opts.failWith, id);
    if ((opts.session ?? "logged-in") !== "logged-in")
      throw new AdapterError(opts.session === "captcha" ? "Captcha" : "LoggedOut", id);
    const all = mockListings(id, query ?? undefined);
    const max = o?.maxResults ?? Math.min(all.length, 30);
    for (const l of all.slice(0, max)) {
      if (o?.signal?.aborted) return;
      await sleep(latency);
      yield l;
    }
  }

  return {
    id,
    meta,
    badgeMap,
    async session() {
      return opts.session ?? "logged-in";
    },
    resolveLink(url: string): LinkInfo | null {
      const m = new RegExp(`^https?://${id}\\.example/item/([a-z0-9-]+)`).exec(url);
      return m ? { market: id, listingId: m[1]!, canonicalUrl: url } : null;
    },
    searchByImage(_input: ImageInput, o?: SearchOptions) {
      return emit(null, o);
    },
    searchByText(query: string, o?: SearchOptions) {
      return emit(query, o);
    },
    async fetchListing(listingId: string): Promise<RawListingDetail> {
      await sleep(latency);
      const l = mockListings(id).find((x) => x.id === listingId);
      if (!l) throw new AdapterError("NotFound", id, `listing ${listingId}`);
      return { ...l, stock: 5000, shippingFrom: l.location ?? "", variants: [{ name: "Renk", options: ["Siyah", "Beyaz"] }] };
    },
    async fetchSupplier(supplierId: string): Promise<RawSupplier> {
      await sleep(latency);
      return mockSupplier(id, supplierId);
    },
    async healthCheck(): Promise<HealthResult> {
      const t0 = Date.now();
      await sleep(10);
      return { ok: !opts.failWith, checkedAt: new Date().toISOString(), durationMs: Date.now() - t0 };
    },
  };
}
