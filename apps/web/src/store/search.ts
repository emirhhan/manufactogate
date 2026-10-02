import { create } from "zustand";
import {
  runSearch,
  type Cluster,
  type MarketId,
  type MarketStatus,
  type RawListing,
  type ScoredListing,
  type SearchInput,
} from "@manufactogate/core";
import { db, type SearchRecord } from "@/lib/db";
import { browserFingerprinter } from "@/lib/fingerprinter";
import { getRegistry } from "@/lib/registry";

export interface SearchState {
  current?: SearchRecord;
  input?: SearchInput;
  markets: Record<string, MarketStatus>;
  listings: Record<string, RawListing[]>;
  clusters: Cluster[];
  similar: ScoredListing[];
  running: boolean;
  durationMs?: number;
  abort?: AbortController;

  start(input: SearchInput, marketIds: MarketId[], thumb?: string): Promise<string>;
  retryMarket(market: MarketId): Promise<void>;
  cancel(): void;
  load(searchId: string): Promise<void>;
}

export const useSearch = create<SearchState>((set, get) => ({
  markets: {},
  listings: {},
  clusters: [],
  similar: [],
  running: false,

  async start(input, marketIds, thumb) {
    get().abort?.abort();
    const abort = new AbortController();
    const id = crypto.randomUUID();
    const record: SearchRecord = {
      id,
      input,
      ...(thumb ? { thumb } : {}),
      markets: marketIds,
      startedAt: new Date().toISOString(),
      clusterCount: 0,
    };
    await db.searches.put(record);
    set({ current: record, input, markets: {}, listings: {}, clusters: [], similar: [], running: true, abort });

    const adapters = marketIds.map((m) => getRegistry().get(m)).filter((a): a is NonNullable<typeof a> => !!a);
    void (async () => {
      for await (const ev of runSearch(input, adapters, browserFingerprinter, { signal: abort.signal, maxPerMarket: 40 })) {
        if (abort.signal.aborted) return;
        if (ev.type === "market") set((s) => ({ markets: { ...s.markets, [ev.market]: ev.status } }));
        else if (ev.type === "listing") {
          set((s) => ({ listings: { ...s.listings, [ev.market]: [...(s.listings[ev.market] ?? []), ev.listing] } }));
          void db.listings.put({ ...ev.listing, key: `${ev.market}:${ev.listing.id}`, searchId: id });
        } else if (ev.type === "clusters") {
          set({ clusters: ev.clusters, similar: ev.similar });
        } else if (ev.type === "finished") {
          const finished = { ...record, finishedAt: new Date().toISOString(), clusterCount: get().clusters.length };
          await db.searches.put(finished);
          await db.clusters.bulkPut(get().clusters.map((c) => ({ key: `${id}:${c.id}`, searchId: id, cluster: c })));
          set({ running: false, durationMs: ev.durationMs, current: finished });
        }
      }
    })();
    return id;
  },

  async retryMarket(market) {
    const { input, current } = get();
    if (!input || !current) return;
    const adapter = getRegistry().get(market);
    if (!adapter) return;
    set((s) => ({ markets: { ...s.markets, [market]: { state: "pending" } }, listings: { ...s.listings, [market]: [] } }));
    for await (const ev of runSearch(input, [adapter], browserFingerprinter, { maxPerMarket: 40 })) {
      if (ev.type === "market") set((s) => ({ markets: { ...s.markets, [ev.market]: ev.status } }));
      else if (ev.type === "listing")
        set((s) => ({ listings: { ...s.listings, [ev.market]: [...(s.listings[ev.market] ?? []), ev.listing] } }));
    }
  },

  cancel() {
    get().abort?.abort();
    set({ running: false });
  },

  async load(searchId) {
    const rec = await db.searches.get(searchId);
    if (!rec) return;
    const listings = await db.listings.where("searchId").equals(searchId).toArray();
    const clusters = await db.clusters.where("searchId").equals(searchId).toArray();
    const byMarket: Record<string, RawListing[]> = {};
    for (const l of listings) (byMarket[l.market] ??= []).push(l);
    const markets: Record<string, MarketStatus> = {};
    for (const m of rec.markets) markets[m] = { state: "done", received: byMarket[m]?.length ?? 0, durationMs: 0 };
    set({ current: rec, input: rec.input, listings: byMarket, clusters: clusters.map((c) => c.cluster), similar: [], markets, running: false });
  },
}));
