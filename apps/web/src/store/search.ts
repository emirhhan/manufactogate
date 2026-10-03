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
  type MarketPhase,
  type MarketStatus,
  type NoteCode,
  type RawListing,
  type RawListingDetail,
  type ScoredListing,
  type SearchEvent,
  type SearchInput,
  type SearchRunOptions,
  type ProductIdentity,
} from "@manufactogate/core";
import { categoryKey, localizeQueryLadder, queryLadder, TIMING } from "@manufactogate/adapters";
import { cancelExtensionRuns } from "@/lib/bridge";
import { db, getSetting, listingsForSearch, persistClusters, persistListings, setSetting, type ListingBatchItem, type SearchRecord } from "@/lib/db";
import { browserFingerprinter } from "@/lib/fingerprinter";
import { identifyFromResultsOrNull, identifyProduct } from "@/lib/identify";
import { imageToDataUrl } from "@/lib/images";
import { getRegistry } from "@/lib/registry";
import { useSettings, VERIFIED_MARKETS, WAVE1_MARKETS } from "@/store/settings";

export const NO_MARKETS_MESSAGE = "Hiç pazar seçili değil. Ayarlar'dan en az bir pazar aç.";
export const STORAGE_NOTE = "Yerel kayıt başarısız: sonuçlar bu sekmede görünür ama geçmişe yazılamadı.";

/** Flush the listing buffer after this many items or this delay, whichever first. */
const FLUSH_EVERY = 40;
const FLUSH_DELAY_MS = 400;

/** Settings key of the capability memo (markets whose image search failed recently). */
export const CAPABILITY_MEMO_KEY = "capabilityMemo";
/** An image-search failure is remembered this long; afterwards the market gets another chance. */
export const CAPABILITY_MEMO_TTL_MS = 7 * 24 * 3600 * 1000;

/** What a market's image search did last time: `false` means "failed, go straight to the title ladder". */
export interface CapabilityMemoEntry {
  imageSearch: false;
  /** ISO time of the failure. */
  at: string;
  reason?: string;
}
export type CapabilityMemo = Partial<Record<MarketId, CapabilityMemoEntry>>;

/** What the orchestrator actually tried on one market: phases, deepest text rung and note codes. */
export interface MarketTrace {
  /** Phases in the order they ran ("image" then "text" when the image search fell back). */
  phases: MarketPhase[];
  /** Deepest text-ladder rung reached (0-based), when a text phase ran. */
  rung?: number;
  /** Orchestrator note codes, deduplicated, in order of arrival. */
  codes: NoteCode[];
}

/** The queries a market received, split into the ones already sent and the rungs that were not needed. */
export interface MarketQueries {
  /** Queries sent, in order ("(görsel)" first when the image search ran). */
  tried: string[];
  /** Remaining rungs of the ladder (the market had enough results before them). */
  untried: string[];
}

export const IMAGE_QUERY_LABEL = "(görsel)";

export interface SearchState {
  current?: SearchRecord | undefined;
  input?: SearchInput | undefined;
  /** The input actually fanned out to markets: same as `input` unless a link was resolved first. */
  effective?: SearchInput | undefined;
  /** Link inputs: the listing the link resolved to. */
  resolved?: { market: MarketId; listing: RawListingDetail } | undefined;
  markets: Record<string, MarketStatus>;
  notes: Record<string, string>;
  /** Code of the last orchestrator note per market (the text is in `notes`). */
  noteCodes: Record<string, NoteCode>;
  /** Per-market trace of phases and ladder rungs, for "Ne arandı?". */
  trace: Record<string, MarketTrace>;
  listings: Record<string, RawListing[]>;
  clusters: Cluster[];
  similar: ScoredListing[];
  running: boolean;
  /** Image fingerprints still being computed in the background (0 when idle). */
  fingerprintPending: number;
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
  /** Markets whose image search failed recently; they skip the upload on the next search. */
  capabilityMemo: CapabilityMemo;
  /** Photo-only search: the product as named from the photo (free model or Claude). */
  identity?: ProductIdentity | undefined;

  start(input: SearchInput, marketIds: MarketId[], thumb?: string, sourceKey?: string): Promise<string>;
  retryMarket(market: MarketId): Promise<void>;
  /** Retries every market that was cancelled or failed with a retryable error, one after another. */
  retryRemaining(): Promise<void>;
  cancel(): void;
  load(searchId: string): Promise<void>;
}

/**
 * Adds the per-market query ladder (native rendering first, English second where the market
 * indexes it; the raw Turkish query only when the ladder itself keeps it as the last resort) and
 * the title ladder for image searches, plus the taxonomy category when one is recognised. Done
 * once, before the record is written, so retries and history reuse the same enriched input. Pure.
 */
export function enrichInput(input: SearchInput, adapters: Pick<MarketAdapter, "id" | "meta">[]): SearchInput {
  if (input.kind === "text") {
    const perMarket: Partial<Record<MarketId, string[]>> = {};
    for (const a of adapters) {
      const { rungs } = localizeQueryLadder(input.query, a.meta.language);
      if (rungs.length && !(rungs.length === 1 && rungs[0] === input.query.trim())) perMarket[a.id] = rungs;
    }
    const category = input.category ?? categoryKey(input.query);
    return { ...input, ...(Object.keys(perMarket).length ? { perMarket } : {}), ...(category ? { category } : {}) };
  }
  if (input.kind === "image" && input.title) {
    const titles: Partial<Record<MarketId, string[]>> = {};
    for (const a of adapters) titles[a.id] = queryLadder(input.title, a.meta.language);
    const category = input.category ?? categoryKey(input.title);
    return { ...input, titles, ...(category ? { category } : {}) };
  }
  return input;
}

/** Run order: wave-1 markets first, then the verified beta markets, then everything else. Pure. */
export function marketPriority(adapter: Pick<MarketAdapter, "id">): number {
  if (WAVE1_MARKETS.includes(adapter.id)) return 0;
  if (VERIFIED_MARKETS.includes(adapter.id)) return 1;
  return 2;
}

/** Capability overrides for the orchestrator from the memo, dropping expired entries. Pure. */
export function capabilityOverridesFrom(memo: CapabilityMemo, now = Date.now()): Partial<Record<MarketId, { imageSearch: boolean }>> {
  const out: Partial<Record<MarketId, { imageSearch: boolean }>> = {};
  for (const [m, e] of Object.entries(memo)) {
    if (!e) continue;
    if (now - new Date(e.at).getTime() > CAPABILITY_MEMO_TTL_MS) continue;
    out[m as MarketId] = { imageSearch: e.imageSearch };
  }
  return out;
}

/** The ladder a market was given by the input (text rungs or image titles). Pure. */
export function ladderOf(input: SearchInput | undefined, market: string): string[] {
  if (!input) return [];
  const raw = input.kind === "text" ? (input.perMarket?.[market as MarketId] ?? input.query) : input.kind === "image" ? (input.titles?.[market as MarketId] ?? input.title) : undefined;
  const list = (Array.isArray(raw) ? raw : raw ? [raw] : []).map((s) => s.trim()).filter(Boolean);
  return [...new Set(list)];
}

/** Folds a market/note event into the per-market trace. Pure. */
export function applyTrace(trace: Record<string, MarketTrace>, ev: SearchEvent): Record<string, MarketTrace> {
  if (ev.type !== "market" && ev.type !== "note") return trace;
  const cur: MarketTrace = trace[ev.market] ?? { phases: [], codes: [] };
  let next: MarketTrace | null = null;
  if (ev.type === "market") {
    if (ev.status.state !== "running" || !ev.status.phase) return trace;
    const phase = ev.status.phase;
    const phases = cur.phases[cur.phases.length - 1] === phase ? cur.phases : [...cur.phases, phase];
    const rung = phase === "text" && ev.status.rung !== undefined ? Math.max(cur.rung ?? -1, ev.status.rung) : cur.rung;
    if (phases === cur.phases && rung === cur.rung) return trace;
    next = { ...cur, phases, ...(rung !== undefined ? { rung } : {}) };
  } else {
    if (cur.codes.includes(ev.code)) return trace;
    next = { ...cur, codes: [...cur.codes, ev.code] };
  }
  return { ...trace, [ev.market]: next };
}

/**
 * Which queries a market actually received, from the input's ladder and the trace. Without a
 * trace (a search loaded from history) everything is reported as untried. Pure.
 */
export function marketQueries(input: SearchInput | undefined, market: string, trace?: MarketTrace | undefined): MarketQueries {
  const ladder = ladderOf(input, market);
  const tried: string[] = [];
  if (trace?.phases.includes("image")) tried.push(IMAGE_QUERY_LABEL);
  const upTo = trace?.phases.includes("text") ? (trace.rung ?? 0) : -1;
  tried.push(...ladder.slice(0, upTo + 1));
  return { tried, untried: ladder.slice(upTo + 1) };
}

/** Markets `retryRemaining` would retry: cancelled ones and retryable errors. Pure. */
export function remainingMarkets(markets: Record<string, MarketStatus>): MarketId[] {
  return Object.entries(markets)
    .filter(([, st]) => (st.state === "done" && st.cancelled) || (st.state === "error" && st.retryable))
    .map(([m]) => m as MarketId);
}

/** Loads a market listing's first image for an image search; null means "search by title". */
async function loadListingImage(detail: RawListingDetail) {
  const first = detail.images[0];
  if (!first) return null;
  const dataUrl = await imageToDataUrl(first);
  return dataUrl ? { dataUrl, sourceUrl: first } : null;
}

/**
 * Orchestrator options shared by `start` and `retryMarket`: run order, the health memo, the
 * timing budgets the extension agreed on, and the link hooks (ladder, image loader, category).
 */
export function searchRunOptions(adapters: Pick<MarketAdapter, "id" | "meta">[], memo: CapabilityMemo, maxPerMarket: number): SearchRunOptions {
  const overrides = capabilityOverridesFrom(memo);
  const canImage = adapters.some((a) => overrides[a.id]?.imageSearch ?? a.meta.capabilities.imageSearch);
  return {
    maxPerMarket,
    priority: marketPriority,
    perMarketTimeoutMs: TIMING.perMarketActiveMs,
    perMarketHardCapMs: TIMING.perMarketHardCapMs,
    categorize: categoryKey,
    ladder: (title, adapter) => queryLadder(title, adapter.meta.language),
    ...(Object.keys(overrides).length ? { capabilityOverrides: overrides } : {}),
    ...(canImage ? { imageLoader: loadListingImage } : {}),
    identify: (input, queryFp, signal) => {
      const { search, claude } = useSettings.getState();
      return identifyProduct(input.image, queryFp, { local: search.visualAi, claude: claude.apiKey.trim() ? claude : undefined }, signal);
    },
    refineIdentity: identifyFromResultsOrNull,
  };
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

/** Markets that will run an image search for this input (used to flag their candidates). */
function imageMarketsFor(input: SearchInput, adapters: Pick<MarketAdapter, "id" | "meta">[], memo: CapabilityMemo): Set<string> {
  if (input.kind !== "image") return new Set();
  const overrides = capabilityOverridesFrom(memo);
  return new Set(adapters.filter((a) => (ladderOf(input, a.id).length ? overrides[a.id]?.imageSearch : undefined) ?? a.meta.capabilities.imageSearch).map((a) => a.id));
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

let memoLoaded: Promise<void> | null = null;

export const useSearch = create<SearchState>((set, get) => {
  /** Reads the capability memo once per page load; later changes go through `rememberCapability`. */
  const ensureMemo = () => {
    if (!memoLoaded) {
      memoLoaded = getSetting<CapabilityMemo>(CAPABILITY_MEMO_KEY, {})
        // Entries written in this session (a failure seen a moment ago) win over the stored copy.
        .then((memo) => set((s) => ({ capabilityMemo: { ...(memo && typeof memo === "object" ? memo : {}), ...s.capabilityMemo } })))
        .catch(() => undefined);
    }
    return memoLoaded;
  };
  const rememberCapability = (market: MarketId, entry: CapabilityMemoEntry | null) => {
    const memo = { ...get().capabilityMemo };
    if (entry) memo[market] = entry;
    else delete memo[market];
    set({ capabilityMemo: memo });
    void setSetting(CAPABILITY_MEMO_KEY, memo).catch(() => undefined);
  };
  /** Folds the events both `start` and `retryMarket` handle the same way. */
  const applyCommon = (ev: SearchEvent, imageMarkets: Set<string>) => {
    if (ev.type === "market") {
      set((s) => ({ markets: { ...s.markets, [ev.market]: ev.status }, trace: applyTrace(s.trace, ev) }));
      // An image search that ran through and returned something proves the capability: forget an old failure.
      if (ev.status.state === "done" && !ev.status.cancelled && ev.status.received > 0 && get().capabilityMemo[ev.market]) {
        const t = get().trace[ev.market];
        if (t?.phases.includes("image") && !t.codes.includes("image-fallback")) rememberCapability(ev.market, null);
      }
    } else if (ev.type === "note") {
      set((s) => ({ notes: { ...s.notes, [ev.market]: ev.note }, noteCodes: { ...s.noteCodes, [ev.market]: ev.code }, trace: applyTrace(s.trace, ev) }));
      if (ev.code === "image-fallback") {
        imageMarkets.delete(ev.market);
        rememberCapability(ev.market, { imageSearch: false, at: new Date().toISOString(), reason: ev.note });
      }
    } else if (ev.type === "fingerprinting") {
      set({ fingerprintPending: ev.pending });
    } else if (ev.type === "warning") {
      set({ warning: ev.text });
    }
  };

  return {
    markets: {},
    notes: {},
    noteCodes: {},
    trace: {},
    listings: {},
    clusters: [],
    similar: [],
    running: false,
    fingerprintPending: 0,
    cancelled: false,
    retrying: [],
    capabilityMemo: {},

    async start(rawInput, marketIds, thumb, sourceKey) {
      get().abort?.abort();
      const abort = new AbortController();
      const id = crypto.randomUUID();
      const reg = getRegistry();
      const adapters = marketIds.map((m) => reg.get(m)).filter((a): a is NonNullable<typeof a> => !!a);
      const input = enrichInput(rawInput, adapters);
      let record: SearchRecord = {
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
      set({
        current: record,
        input,
        effective: input.kind === "link" ? undefined : input,
        resolved: undefined,
        markets: {},
        notes: {},
        noteCodes: {},
        trace: {},
        listings: {},
        clusters: [],
        similar: [],
        running: true,
        fingerprintPending: 0,
        abort,
        error: undefined,
        storageNote: undefined,
        warning: undefined,
        cancelled: false,
        durationMs: undefined,
        retrying: [],
        identity: undefined,
      });

      const noteStorage = () => set({ storageNote: STORAGE_NOTE });
      const save = async (rec: SearchRecord) => {
        try {
          await db.searches.put(rec);
        } catch {
          noteStorage();
        }
      };
      await Promise.all([save(record), ensureMemo()]);

      if (!adapters.length) {
        const failed: SearchRecord = { ...record, finishedAt: new Date().toISOString(), status: "error", error: NO_MARKETS_MESSAGE, resultCount: 0 };
        set({ running: false, abort: undefined, error: NO_MARKETS_MESSAGE, current: failed, durationMs: 0 });
        await save(failed);
        return id;
      }

      const maxPerMarket = useSettings.getState().search.maxPerMarket;
      const memo = get().capabilityMemo;
      const imageMarkets = imageMarketsFor(input, adapters, memo);
      const fp = wrapFingerprinter(sess, imageMarkets);
      const batcher = createBatcher(id, noteStorage);
      sess.flush = batcher.flush;
      let order = 0;
      const mine = () => session === sess && get().current?.id === id;

      void (async () => {
        try {
          for await (const ev of runSearch(input, adapters, fp, { ...searchRunOptions(adapters, memo, maxPerMarket), signal: abort.signal })) {
            if (abort.signal.aborted || !mine()) return;
            if (ev.type === "listing") {
              set((s) => ({ listings: { ...s.listings, [ev.market]: [...(s.listings[ev.market] ?? []), ev.listing] } }));
              batcher.push({ listing: ev.listing, order: order++ });
            } else if (ev.type === "clusters") {
              set({ clusters: ev.clusters, similar: ev.similar });
            } else if (ev.type === "resolved") {
              // The link became an image/text search: remember what the markets were really asked.
              for (const m of imageMarketsFor(ev.input, adapters, memo)) imageMarkets.add(m);
              const firstImage = ev.listing.images[0];
              if (!record.thumb && firstImage) record = { ...record, thumb: firstImage };
              set({ effective: ev.input, resolved: { market: ev.market, listing: ev.listing }, current: record });
            } else if (ev.type === "identity") {
              record = { ...record, identity: ev.identity };
              set({ identity: ev.identity, current: record });
              void save(record);
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
              set({ running: false, durationMs: ev.durationMs, current: finished, abort: undefined, cancelled: !!ev.cancelled, markets: finished.marketStatus!, fingerprintPending: 0 });
              await save(finished);
              try {
                await persistClusters(id, s.clusters);
              } catch {
                noteStorage();
              }
            } else {
              applyCommon(ev, imageMarkets);
            }
          }
        } catch (e) {
          if (!mine()) return;
          const message = errMsg(e);
          const s = get();
          const failed: SearchRecord = { ...record, finishedAt: new Date().toISOString(), status: "error", error: message, resultCount: countListings(s.listings), clusterCount: s.clusters.length, marketStatus: cancelledStatuses(s.markets, s.listings) };
          set({ running: false, error: message, abort: undefined, current: failed, markets: failed.marketStatus!, fingerprintPending: 0 });
          await save(failed);
        } finally {
          if (mine() && get().running) set({ running: false, abort: undefined, fingerprintPending: 0 });
        }
      })();
      return id;
    },

    async retryMarket(market) {
      const { current } = get();
      const input = get().effective ?? get().input;
      if (!input || !current) return;
      if (get().retrying.includes(market)) return;
      const adapter = getRegistry().get(market);
      if (!adapter) return;
      const sess = session && session.id === current.id ? session : (session = { id: current.id, candidates: [], flush: () => Promise.resolve() });
      const searchId = current.id;
      const mine = () => get().current?.id === searchId;
      sess.candidates = sess.candidates.filter((c) => c.listing.market !== market);
      set((s) => {
        const trace = { ...s.trace };
        delete trace[market];
        const noteCodes = { ...s.noteCodes };
        delete noteCodes[market];
        return { retrying: [...s.retrying, market], markets: { ...s.markets, [market]: { state: "pending" } }, listings: { ...s.listings, [market]: [] }, notes: { ...s.notes, [market]: "" }, noteCodes, trace, error: undefined };
      });
      const maxPerMarket = useSettings.getState().search.maxPerMarket;
      // A retry is explicit: give the market's image search another chance regardless of the memo.
      const memo: CapabilityMemo = {};
      const imageMarkets = imageMarketsFor(input, [adapter], memo);
      const fp = wrapFingerprinter(sess, imageMarkets);
      const batch: ListingBatchItem[] = [];
      // A photo search keeps the name it already got: a retry must not pay for (or re-guess) it again.
      const known = get().identity;
      const runOpts: SearchRunOptions = { ...searchRunOptions([adapter], memo, maxPerMarket), ...(known ? { identify: async () => known } : {}) };
      try {
        for await (const ev of runSearch(input, [adapter], fp, runOpts)) {
          if (!mine()) return;
          if (ev.type === "listing") {
            set((s) => ({ listings: { ...s.listings, [ev.market]: [...(s.listings[ev.market] ?? []), ev.listing] } }));
            batch.push({ listing: ev.listing, order: batch.length });
          } else if (ev.type === "identity") {
            if (!get().identity) set({ identity: ev.identity });
          } else if (ev.type !== "clusters" && ev.type !== "finished" && ev.type !== "resolved") {
            applyCommon(ev, imageMarkets);
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
        set((s) => ({ retrying: s.retrying.filter((m) => m !== market), fingerprintPending: 0 }));
      }
    },

    async retryRemaining() {
      const targets = remainingMarkets(get().markets);
      for (let i = 0; i < targets.length; i++) {
        await get().retryMarket(targets[i]!);
        if (i < targets.length - 1) await new Promise((r) => setTimeout(r, 1500));
      }
    },

    cancel() {
      const { abort, current, markets, listings, clusters, running } = get();
      abort?.abort();
      // The extension keeps its tabs working after the port is idle: tell it to stop this tab's runs too.
      void cancelExtensionRuns().catch(() => false);
      if (!current || !running) {
        set({ running: false, abort: undefined, fingerprintPending: 0 });
        return;
      }
      const marketStatus = cancelledStatuses(markets, listings);
      const durationMs = Math.max(0, Date.now() - new Date(current.startedAt).getTime());
      const finished: SearchRecord = { ...current, finishedAt: new Date().toISOString(), status: "cancelled", marketStatus, resultCount: countListings(listings), clusterCount: clusters.length, durationMs };
      set({ running: false, abort: undefined, cancelled: true, markets: marketStatus, current: finished, durationMs, fingerprintPending: 0 });
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
        effective: rec.input.kind === "link" ? undefined : rec.input,
        resolved: undefined,
        listings: byMarket,
        clusters,
        similar: [],
        markets,
        notes: {},
        noteCodes: {},
        trace: {},
        running: false,
        fingerprintPending: 0,
        abort: undefined,
        durationMs: rec.durationMs,
        cancelled: rec.status === "cancelled",
        error: rec.error,
        storageNote: undefined,
        warning: undefined,
        retrying: [],
        identity: rec.identity,
      });
    },
  };
});

/** Test hook: forgets the in-memory session of the running search and the memo cache. */
export function resetSearchSession(): void {
  session = null;
  memoLoaded = null;
}
