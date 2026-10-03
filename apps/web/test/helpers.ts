import { AdapterRegistry } from "@manufactogate/adapters";
import type { HealthResult, MarketAdapter, MarketId, RawListing, RawListingDetail, RawSupplier, SessionState } from "@manufactogate/core";
import { db } from "../src/lib/db";

export const listing = (market: string, id: string, extra: Partial<RawListing> = {}): RawListing => ({
  market: market as MarketId,
  id,
  url: `https://x/${id}`,
  title: `title ${id}`,
  images: [],
  price: { currency: "CNY", tiers: [{ minQty: 1, unitPrice: 10 }] },
  badges: [],
  fetchedAt: "2026-10-01T00:00:00Z",
  ...extra,
});

export interface FakeOptions {
  results?: RawListing[];
  fail?: Error;
  delayMs?: number;
  detail?: (id: string) => RawListingDetail;
  country?: string;
  role?: "source" | "target" | "both";
  language?: string;
  name?: string;
}

/** Minimal adapter for store tests: yields `results` for any query, optionally failing. */
export function fakeAdapter(id: MarketId, opts: FakeOptions = {}): MarketAdapter & { calls: string[] } {
  const calls: string[] = [];
  const results = opts.results ?? [listing(id, "1"), listing(id, "2")];
  async function* search(q: string): AsyncIterable<RawListing> {
    calls.push(q);
    if (opts.delayMs) await new Promise((r) => setTimeout(r, opts.delayMs));
    if (opts.fail) throw opts.fail;
    for (const l of results) yield l;
  }
  return {
    id,
    calls,
    meta: {
      name: opts.name ?? id,
      country: opts.country ?? "cn",
      currency: "CNY",
      language: opts.language ?? "zh",
      role: opts.role ?? "source",
      capabilities: { imageSearch: false, textSearch: true, linkResolve: false, supplierProfile: false, priceTiers: true },
      rateLimit: { minIntervalMs: 0, maxPerHour: 1000 },
      version: "1.0.0",
      hosts: [],
    },
    badgeMap: {},
    session: async (): Promise<SessionState> => "logged-in",
    resolveLink: () => null,
    searchByImage: () => search("image"),
    searchByText: (q) => search(q),
    fetchListing: async (lid) => opts.detail?.(lid) ?? { ...listing(id, lid), attributes: {} },
    fetchSupplier: async (sid): Promise<RawSupplier> => ({ market: id, id: sid, url: "", name: sid, badges: [] }),
    healthCheck: async (): Promise<HealthResult> => ({ ok: true, checkedAt: new Date().toISOString() }),
  };
}

export function registryOf(...adapters: MarketAdapter[]): AdapterRegistry {
  const r = new AdapterRegistry();
  for (const a of adapters) r.register(a);
  return r;
}

export async function clearDb(): Promise<void> {
  await Promise.all(db.tables.map((t) => t.clear()));
}

export const flush = (ms = 0) => new Promise((r) => setTimeout(r, ms));

/** Waits until `pred` holds or the timeout passes. */
export async function waitFor(pred: () => boolean, timeoutMs = 4000): Promise<void> {
  const t0 = Date.now();
  while (!pred()) {
    if (Date.now() - t0 > timeoutMs) throw new Error("waitFor timeout");
    await flush(10);
  }
}
