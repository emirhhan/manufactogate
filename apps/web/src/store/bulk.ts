import { create } from "zustand";
import { runSearch, type MarketId, type RawListing } from "@manufactogate/core";
import { db, persistListings, type ListingBatchItem, type SearchRecord } from "@/lib/db";
import { browserFingerprinter } from "@/lib/fingerprinter";
import { minDisplay } from "@/lib/fx";
import { getRegistry } from "@/lib/registry";
import { enrichInput } from "@/store/search";
import { useSettings } from "@/store/settings";

export type BulkRowStatus = "bekliyor" | "aranıyor" | "bitti" | "hata" | "durduruldu";

export interface BulkRow {
  query: string;
  status: BulkRowStatus;
  count: number;
  /** Lowest price in the display currency across every market. */
  minDisplay: number | null;
  perMarket: Record<string, number>;
  searchId?: string | undefined;
  listings: RawListing[];
  error?: string | undefined;
}

interface BulkState {
  rows: BulkRow[];
  markets: MarketId[];
  running: boolean;
  paused: boolean;
  /** Index of the row being searched. */
  current: number;
  abort?: AbortController | undefined;
  /** Pause between two queries, ms. */
  spacingMs: number;
  setQueries(queries: string[]): void;
  start(markets: MarketId[]): Promise<void>;
  pause(): void;
  resume(): void;
  stop(): void;
  /** Resets failed and stopped rows to pending and runs again. */
  retryFailed(markets: MarketId[]): Promise<void>;
  clear(): void;
}

/** Row transition helpers, pure so the state machine is testable. */
export function pendingRows(queries: string[]): BulkRow[] {
  return queries.map((query) => ({ query, status: "bekliyor", count: 0, minDisplay: null, perMarket: {}, listings: [] }));
}
export function resetFailed(rows: BulkRow[]): BulkRow[] {
  return rows.map((r) => (r.status === "hata" || r.status === "durduruldu" ? { ...r, status: "bekliyor", error: undefined } : r));
}
export function summarize(listings: RawListing[]): { count: number; minDisplay: number | null; perMarket: Record<string, number> } {
  const perMarket: Record<string, number> = {};
  let min: number | null = null;
  for (const l of listings) {
    perMarket[l.market] = (perMarket[l.market] ?? 0) + 1;
    const p = minDisplay(l);
    if (p !== null && (min === null || p < min)) min = p;
  }
  return { count: listings.length, minDisplay: min, perMarket };
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(t);
      resolve();
    }, { once: true });
  });

export const useBulk = create<BulkState>((set, get) => {
  const update = (i: number, patch: Partial<BulkRow>) => set((s) => ({ rows: s.rows.map((r, j) => (j === i ? { ...r, ...patch } : r)) }));
  const waitWhilePaused = async (signal: AbortSignal) => {
    while (get().paused && !signal.aborted) await sleep(250, signal);
  };
  const runRows = async (markets: MarketId[]) => {
    if (get().running) return;
    const abort = new AbortController();
    set({ running: true, paused: false, abort, markets });
    const reg = getRegistry();
    const adapters = markets.map((m) => reg.get(m)).filter((a): a is NonNullable<typeof a> => !!a);
    const maxPerMarket = useSettings.getState().search.maxPerMarket;
    try {
      for (let i = 0; i < get().rows.length; i++) {
        if (abort.signal.aborted) break;
        await waitWhilePaused(abort.signal);
        if (abort.signal.aborted) break;
        const row = get().rows[i]!;
        if (row.status !== "bekliyor") continue;
        set({ current: i });
        update(i, { status: "aranıyor", error: undefined });
        const input = enrichInput({ kind: "text", query: row.query }, adapters);
        const id = crypto.randomUUID();
        const record: SearchRecord = { id, input, markets: adapters.map((a) => a.id), startedAt: new Date().toISOString(), clusterCount: 0 };
        const got: RawListing[] = [];
        const batch: ListingBatchItem[] = [];
        try {
          await db.searches.put(record).catch(() => undefined);
          if (!adapters.length) throw new Error("Hiç pazar seçili değil");
          let marketStatus: SearchRecord["marketStatus"] = {};
          for await (const ev of runSearch(input, adapters, browserFingerprinter, { maxPerMarket, signal: abort.signal })) {
            if (ev.type === "listing") {
              got.push(ev.listing);
              batch.push({ listing: ev.listing, order: batch.length });
              if (batch.length % 25 === 0) update(i, { count: got.length });
            } else if (ev.type === "market") marketStatus = { ...marketStatus, [ev.market]: ev.status };
          }
          await persistListings(id, batch).catch(() => undefined);
          const cancelled = abort.signal.aborted;
          await db.searches.put({ ...record, finishedAt: new Date().toISOString(), resultCount: got.length, status: cancelled ? "cancelled" : "done", marketStatus }).catch(() => undefined);
          update(i, { ...summarize(got), status: cancelled ? "durduruldu" : "bitti", searchId: id, listings: got });
        } catch (e) {
          await persistListings(id, batch).catch(() => undefined);
          update(i, { ...summarize(got), status: "hata", error: e instanceof Error ? e.message : String(e), listings: got, searchId: got.length ? id : undefined });
        }
        if (i < get().rows.length - 1 && !abort.signal.aborted) await sleep(get().spacingMs + Math.random() * get().spacingMs, abort.signal);
      }
    } finally {
      set((s) => ({ running: false, paused: false, abort: undefined, rows: s.rows.map((r) => (r.status === "aranıyor" ? { ...r, status: "durduruldu" } : r)) }));
    }
  };
  return {
    rows: [],
    markets: [],
    running: false,
    paused: false,
    current: -1,
    spacingMs: 2500,
    setQueries: (queries) => set({ rows: pendingRows(queries), current: -1 }),
    start: (markets) => runRows(markets),
    pause: () => set({ paused: true }),
    resume: () => set({ paused: false }),
    stop: () => {
      get().abort?.abort();
      set({ paused: false });
    },
    async retryFailed(markets) {
      set((s) => ({ rows: resetFailed(s.rows) }));
      await runRows(markets);
    },
    clear: () => set({ rows: [], current: -1 }),
  };
});
