import { create } from "zustand";
import {
  clusterCandidates,
  runSearch,
  type Candidate,
  type Cluster,
  type Fingerprint,
  type Fingerprinter,
  type MarketAdapter,
  type MarketId,
  type MarketStatus,
  type RawListing,
  type ScoredListing,
  type SearchInput,
} from "@manufactogate/core";
import { localizeQuery, queryLadder } from "@manufactogate/adapters";
import { db, listingsForSearch, persistClusters, persistListings, type ListingBatchItem, type SearchRecord } from "@/lib/db";
import { browserFingerprinter } from "@/lib/fingerprinter";
import { getRegistry } from "@/lib/registry";
import { useSettings } from "@/store/settings";

export const NO_MARKETS_MESSAGE = "Hiç pazar seçili değil. Ayarlar'dan en az bir pazar aç.";
export const STORAGE_NOTE = "Yerel kayıt başarısız: sonuçlar bu sekmede görünür ama geçmişe yazılamadı.";

/** Flush the listing buffer after this many items or this delay, whichever first. */
const FLUSH_EVERY = 40;
const FLUSH_DELAY_MS = 400;

export interface SearchState {
  current?: SearchRecord | undefined;
  input?: SearchInput | undefined;
  markets: Record<string, MarketStatus>;
  notes: Record<string, string>;
  listings: Record<string, RawListing[]>;
  clusters: Cluster[];
  similar: ScoredListing[];
  running: boolean;
  durationMs?: number | undefined;
  abort?: AbortController | undefined;
  /** Why the search could not run or ended abnormally; the UI shows it instead of skeletons. */
  error?: string | undefined;
  /** Non-fatal: the search ran but IndexedDB refused a write. */
  storageNote?: string | undefined;
  /** Orchestrator warning (query image unreadable, link unresolved). */
  warning?: string | undefined;
  /** The user stopped the search; markets that were still running are `done { cancelled: true }`. */
  cancelled: boolean;
  /** Markets being retried right now. */
  retrying: string[];

  start(input: SearchInput, marketIds: MarketId[], thumb?: string, sourceKey?: string): Promise<string>;
  retryMarket(market: MarketId): Promise<void>;
  /** Retries every market that was cancelled or failed with a retryable error, one after another. */
  retryRemaining(): Promise<void>;
  cancel(): void;
  load(searchId: string): Promise<void>;
}

/**
 * Adds per-market query translations (Turkish → Chinese) and the title ladder for image
 * searches. Done once, before the record is written, so retries and history reuse the same
 * enriched input. Pure.
 */
export function enrichInput(input: SearchInput, adapters: Pick<MarketAdapter, "id" | "meta">[]): SearchInput {
  if (input.kind === "text") {
    const perMarket: Partial<Record<MarketId, string[]>> = {};
    for (const a of adapters) {
      const q = localizeQuery(input.query, a.meta.language);
      if (q !== input.query) perMarket[a.id] = [q, input.query];
    }
    return Object.keys(perMarket).length ? { ...input, perMarket } : input;
  }
  if (input.kind === "image" && input.title) {
    const titles: Partial<Record<MarketId, string[]>> = {};
    for (const a of adapters) titles[a.id] = queryLadder(input.title, a.meta.language);
    return { ...input, titles };
  }
  return input;
}

/** Everything the running search keeps outside React state (fingerprints are heavy). */
interface Session {
  id: string;
  queryFp?: Fingerprint;
  candidates: Candidate[];
  flush: () => Promise<void>;
}
let session: Session | null = null;

function wrapFingerprinter(sess: Session, imageMarkets: Set<string>): Fingerprinter {
  return {
    forQuery: async (i, resolvedTitle) => {
      const fp = await browserFingerprinter.forQuery(i, resolvedTitle);
      sess.queryFp = fp;
      return fp;
    },
    forListing: async (l) => {
      const fp: Fingerprint = { ...(await browserFingerprinter.forListing(l)), ...(imageMarkets.has(l.market) ? { viaImageSearch: true } : {}) };
      sess.candidates.push({ listing: l, fingerprint: fp });
      return fp;
    },
  };
}

/** Buffers listing writes into a few transactions per search instead of one per listing. */
function createBatcher(searchId: string, onError: (e: unknown) => void) {
  let buffer: ListingBatchItem[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;
  let inflight: Promise<void> = Promise.resolve();
  const flush = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    const batch = buffer;
    buffer = [];
    if (!batch.length) return inflight;
    inflight = inflight.then(() => persistListings(searchId, batch)).catch(onError);
    return inflight;
  };
  const push = (item: ListingBatchItem) => {
    buffer.push(item);
    if (buffer.length >= FLUSH_EVERY) void flush();
    else if (!timer) timer = setTimeout(() => void flush(), FLUSH_DELAY_MS);
  };
  return { push, flush };
}

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

function cancelledStatuses(markets: Record<string, MarketStatus>, listings: Record<string, RawListing[]>): Record<string, MarketStatus> {
  const out: Record<string, MarketStatus> = {};
  for (const [m, st] of Object.entries(markets)) {
    out[m] = st.state === "pending" || st.state === "running" ? { state: "done", received: listings[m]?.length ?? 0, durationMs: 0, cancelled: true } : st;
  }
  return out;
}

const countListings = (listings: Record<string, RawListing[]>) => Object.values(listings).reduce((n, xs) => n + xs.length, 0);

export const useSearch = create<SearchState>((set, get) => ({
  markets: {},
  notes: {},
  listings: {},
  clusters: [],
  similar: [],
  running: false,
  cancelled: false,
  retrying: [],

  async start(rawInput, marketIds, thumb, sourceKey) {
    get().abort?.abort();
    const abort = new AbortController();
    const id = crypto.randomUUID();
    const reg = getRegistry();
    const adapters = marketIds.map((m) => reg.get(m)).filter((a): a is NonNullable<typeof a> => !!a);
    const input = enrichInput(rawInput, adapters);
    const record: SearchRecord = {
      id,
      input,
      ...(thumb ? { thumb } : {}),
      ...(sourceKey ? { sourceKey } : {}),
      markets: adapters.map((a) => a.id),
      startedAt: new Date().toISOString(),
      clusterCount: 0,
    };
    const sess: Session = { id, candidates: [], flush: () => Promise.resolve() };
    session = sess;
    set({ current: record, input, markets: {}, notes: {}, listings: {}, clusters: [], similar: [], running: true, abort, error: undefined, storageNote: undefined, warning: undefined, cancelled: false, durationMs: undefined, retrying: [] });

    const noteStorage = () => set({ storageNote: STORAGE_NOTE });
    const save = async (rec: SearchRecord) => {
      try {
        await db.searches.put(rec);
      } catch {
        noteStorage();
      }
    };
    await save(record);

    if (!adapters.length) {
      const failed: SearchRecord = { ...record, finishedAt: new Date().toISOString(), status: "error", error: NO_MARKETS_MESSAGE, resultCount: 0 };
      set({ running: false, abort: undefined, error: NO_MARKETS_MESSAGE, current: failed, durationMs: 0 });
      await save(failed);
      return id;
    }

    const maxPerMarket = useSettings.getState().search.maxPerMarket;
    const imageMarkets = new Set<string>(input.kind === "image" ? adapters.filter((a) => a.meta.capabilities.imageSearch).map((a) => a.id) : []);
    const fp = wrapFingerprinter(sess, imageMarkets);
    const batcher = createBatcher(id, noteStorage);
    sess.flush = batcher.flush;
    let order = 0;
    const mine = () => session === sess && get().current?.id === id;

    void (async () => {
      try {
        for await (const ev of runSearch(input, adapters, fp, { signal: abort.signal, maxPerMarket })) {
          if (abort.signal.aborted || !mine()) return;
          if (ev.type === "market") set((s) => ({ markets: { ...s.markets, [ev.market]: ev.status } }));
          else if (ev.type === "note") set((s) => ({ notes: { ...s.notes, [ev.market]: ev.note } }));
          else if (ev.type === "listing") {
            set((s) => ({ listings: { ...s.listings, [ev.market]: [...(s.listings[ev.market] ?? []), ev.listing] } }));
            batcher.push({ listing: ev.listing, order: order++ });
          } else if (ev.type === "clusters") {
            set({ clusters: ev.clusters, similar: ev.similar });
          } else if (ev.type === "warning") {
            set({ warning: ev.text });
          } else if (ev.type === "finished") {
            await batcher.flush();
            const s = get();
            const finished: SearchRecord = {
              ...record,
              finishedAt: new Date().toISOString(),
              clusterCount: s.clusters.length,
              durationMs: ev.durationMs,
              marketStatus: ev.cancelled ? cancelledStatuses(s.markets, s.listings) : s.markets,
              resultCount: countListings(s.listings),
              status: ev.cancelled ? "cancelled" : "done",
            };
            set({ running: false, durationMs: ev.durationMs, current: finished, abort: undefined, cancelled: !!ev.cancelled, markets: finished.marketStatus! });
            await save(finished);
            try {
              await persistClusters(id, s.clusters);
            } catch {
              noteStorage();
            }
          }
        }
      } catch (e) {
        if (!mine()) return;
        const message = errMsg(e);
        const s = get();
        const failed: SearchRecord = { ...record, finishedAt: new Date().toISOString(), status: "error", error: message, resultCount: countListings(s.listings), clusterCount: s.clusters.length, marketStatus: cancelledStatuses(s.markets, s.listings) };
        set({ running: false, error: message, abort: undefined, current: failed, markets: failed.marketStatus! });
        await save(failed);
      } finally {
        if (mine() && get().running) set({ running: false, abort: undefined });
      }
    })();
    return id;
  },

  async retryMarket(market) {
    const { input, current } = get();
    if (!input || !current) return;
    if (get().retrying.includes(market)) return;
    const adapter = getRegistry().get(market);
    if (!adapter) return;
    const sess = session && session.id === current.id ? session : (session = { id: current.id, candidates: [], flush: () => Promise.resolve() });
    const searchId = current.id;
    const mine = () => get().current?.id === searchId;
    sess.candidates = sess.candidates.filter((c) => c.listing.market !== market);
    set((s) => ({ retrying: [...s.retrying, market], markets: { ...s.markets, [market]: { state: "pending" } }, listings: { ...s.listings, [market]: [] }, notes: { ...s.notes, [market]: "" }, error: undefined }));
    const maxPerMarket = useSettings.getState().search.maxPerMarket;
    const imageMarkets = new Set<string>(input.kind === "image" && adapter.meta.capabilities.imageSearch ? [market] : []);
    const fp = wrapFingerprinter(sess, imageMarkets);
    const batch: ListingBatchItem[] = [];
    try {
      for await (const ev of runSearch(input, [adapter], fp, { maxPerMarket })) {
        if (!mine()) return;
        if (ev.type === "market") set((s) => ({ markets: { ...s.markets, [ev.market]: ev.status } }));
        else if (ev.type === "note") set((s) => ({ notes: { ...s.notes, [ev.market]: ev.note } }));
        else if (ev.type === "listing") {
          set((s) => ({ listings: { ...s.listings, [ev.market]: [...(s.listings[ev.market] ?? []), ev.listing] } }));
          batch.push({ listing: ev.listing, order: batch.length });
        }
      }
      try {
        await persistListings(searchId, batch);
      } catch {
        set({ storageNote: STORAGE_NOTE });
      }
      // Re-cluster the whole search with the retried market's candidates.
      if (!sess.queryFp) sess.queryFp = await browserFingerprinter.forQuery(input);
      if (!mine()) return;
      if (sess.candidates.length) {
        const snap = clusterCandidates(sess.queryFp, sess.candidates);
        set({ clusters: snap.clusters, similar: snap.similar });
        try {
          await persistClusters(searchId, snap.clusters);
        } catch {
          set({ storageNote: STORAGE_NOTE });
        }
      }
      const s = get();
      const updated: SearchRecord = { ...(s.current ?? current), marketStatus: s.markets, resultCount: countListings(s.listings), clusterCount: s.clusters.length };
      set({ current: updated });
      await db.searches.put(updated).catch(() => set({ storageNote: STORAGE_NOTE }));
    } catch (e) {
      if (mine()) set((s) => ({ markets: { ...s.markets, [market]: { state: "error", type: "Internal", message: errMsg(e), retryable: true } } }));
    } finally {
      set((s) => ({ retrying: s.retrying.filter((m) => m !== market) }));
    }
  },

  async retryRemaining() {
    const { markets } = get();
    const targets = Object.entries(markets)
      .filter(([, st]) => (st.state === "done" && st.cancelled) || (st.state === "error" && st.retryable))
      .map(([m]) => m as MarketId);
    for (let i = 0; i < targets.length; i++) {
      await get().retryMarket(targets[i]!);
      if (i < targets.length - 1) await new Promise((r) => setTimeout(r, 1500));
    }
  },

  cancel() {
    const { abort, current, markets, listings, clusters, running } = get();
    abort?.abort();
    if (!current || !running) {
      set({ running: false, abort: undefined });
      return;
    }
    const marketStatus = cancelledStatuses(markets, listings);
    const durationMs = Math.max(0, Date.now() - new Date(current.startedAt).getTime());
    const finished: SearchRecord = { ...current, finishedAt: new Date().toISOString(), status: "cancelled", marketStatus, resultCount: countListings(listings), clusterCount: clusters.length, durationMs };
    set({ running: false, abort: undefined, cancelled: true, markets: marketStatus, current: finished, durationMs });
    const sess = session;
    void (async () => {
      try {
        if (sess && sess.id === current.id) await sess.flush();
        await db.searches.put(finished);
        await persistClusters(current.id, clusters);
      } catch {
        set({ storageNote: STORAGE_NOTE });
      }
    })();
  },

  async load(searchId) {
    if (get().current?.id === searchId && get().running) return;
    get().abort?.abort();
    const rec = await db.searches.get(searchId);
    if (!rec) return;
    const rows = await listingsForSearch(searchId);
    const clusterRecs = await db.clusters.where("searchId").equals(searchId).toArray();
    const byMarket: Record<string, RawListing[]> = {};
    for (const l of rows) (byMarket[l.market] ??= []).push(l);
    const markets: Record<string, MarketStatus> = {};
    for (const m of rec.markets) markets[m] = rec.marketStatus?.[m] ?? { state: "done", received: byMarket[m]?.length ?? 0, durationMs: 0 };
    // Statuses saved mid-flight (tab closed during a search) must not look alive.
    for (const [m, st] of Object.entries(markets)) if (st.state === "pending" || st.state === "running") markets[m] = { state: "done", received: byMarket[m]?.length ?? 0, durationMs: 0, cancelled: true };
    const clusters = clusterRecs.map((c) => c.cluster);
    session = { id: searchId, candidates: clusters.flatMap((c) => c.members.map((m) => ({ listing: m.listing, fingerprint: m.fingerprint }))), flush: () => Promise.resolve() };
    set({
      current: rec,
      input: rec.input,
      listings: byMarket,
      clusters,
      similar: [],
      markets,
      notes: {},
      running: false,
      abort: undefined,
      durationMs: rec.durationMs,
      cancelled: rec.status === "cancelled",
      error: rec.error,
      storageNote: undefined,
      warning: undefined,
      retrying: [],
    });
  },
}));

/** Test hook: forgets the in-memory session of the running search. */
export function resetSearchSession(): void {
  session = null;
}
