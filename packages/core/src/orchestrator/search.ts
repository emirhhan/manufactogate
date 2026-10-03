import { attributes, enrichFingerprint, type Fingerprint } from "../fingerprint";
import { IncrementalClusterer, keyOf, type Cluster, type ScoredListing } from "../match";
import {
  AdapterError,
  type AdapterErrorType,
  type AdapterProgress,
  type AdapterStage,
  type ImageInput,
  type MarketAdapter,
  type MarketId,
  type RawListing,
  type RawListingDetail,
  type SearchOptions,
} from "../model";

export type SearchInput =
  | { kind: "image"; image: ImageInput; title?: string; titles?: Partial<Record<MarketId, string | string[]>>; category?: string }
  | { kind: "text"; query: string; perMarket?: Partial<Record<MarketId, string | string[]>>; category?: string }
  | { kind: "link"; url: string };

export type MarketPhase = "image" | "text" | "detail";

export type MarketStatus =
  | { state: "pending" }
  /** `stage`/`page` mirror the page runner's live progress (queued, typing, settling, page 2…) when the adapter reports it. */
  | { state: "running"; received: number; phase?: MarketPhase; rung?: number; stage?: AdapterStage; page?: number }
  | { state: "done"; received: number; durationMs: number; cancelled?: boolean }
  | { state: "error"; type: AdapterErrorType; message: string; retryable: boolean };

export type NoteCode =
  | "image-fallback"
  | "image-empty"
  | "ladder-next"
  | "no-image-search"
  | "image-title"
  | "rung-skipped"
  | "untranslated"
  | "link-degraded"
  | "fingerprint-failed";

export type SearchEvent =
  | { type: "market"; market: MarketId; status: MarketStatus }
  | { type: "listing"; market: MarketId; listing: RawListing }
  | { type: "note"; market: MarketId; note: string; code: NoteCode; rung?: number }
  | { type: "clusters"; clusters: Cluster[]; similar: ScoredListing[]; similarByCategory: Record<string, ScoredListing[]> }
  /** Image fingerprints still being computed in the background. */
  | { type: "fingerprinting"; pending: number }
  /** A link input was resolved to a listing and fanned out as `input`. */
  | { type: "resolved"; market: MarketId; listing: RawListingDetail; input: SearchInput }
  | { type: "warning"; code: "query-fingerprint-failed" | "link-unresolved" | "internal"; text: string }
  | { type: "finished"; durationMs: number; cancelled?: boolean };

export interface Fingerprinter {
  /** Fingerprint the query (image, text or resolved link). */
  forQuery(input: SearchInput, resolvedTitle?: string): Promise<Fingerprint>;
  /** Fingerprint a candidate listing (its first image and title). */
  forListing(listing: RawListing): Promise<Fingerprint>;
}

export interface SearchRunOptions {
  maxPerMarket?: number;
  signal?: AbortSignal;
  /** Re-cluster after this many new listings; keeps the UI progressive. */
  reclusterEvery?: number;
  /** Never emit cluster snapshots closer together than this. */
  reclusterIntervalMs?: number;
  /** Markets searched at the same time. */
  concurrency?: number;
  /** Lower runs first; ties keep the given order. */
  priority?: (adapter: MarketAdapter) => number;
  /**
   * Active-time budget per market: a market that has not finished within this much *active* time is
   * reported as Timeout. Time the page runner spends with the request queued (waiting for a tab slot,
   * reported through `SearchOptions.onProgress` as stage "queued") does not count, so the budget
   * agrees with the extension's own per-request budget whatever the tab cap is.
   */
  perMarketTimeoutMs?: number;
  /** Absolute cap per market, queue time included; protects against a runner that never starts. */
  perMarketHardCapMs?: number;
  /** Parallel image fingerprints. */
  fingerprintConcurrency?: number;
  /** How long `finished` waits for outstanding image fingerprints after the last market. */
  fingerprintGraceMs?: number;
  /** Keep walking the query ladder until a market has at least this many results. */
  ladderMinResults?: number;
  /** Running status is emitted at most this often (or every 10 listings). */
  statusIntervalMs?: number;
  /** Health memo: markets whose image search is known to fail skip the upload and go to the title ladder. */
  capabilityOverrides?: Partial<Record<MarketId, { imageSearch?: boolean }>>;
  /** Builds the per-market query ladder for a resolved link title (keeps core adapter-free). */
  ladder?: (title: string, adapter: MarketAdapter) => string[];
  /** Loads the resolved listing's image for an image search; null means fall back to text. */
  imageLoader?: (listing: RawListingDetail) => Promise<ImageInput | null>;
  /** Language-neutral category key (taxonomy leaf) for a title; used for the query and every listing. */
  categorize?: (title: string) => string | undefined;
}

class TimeoutError extends Error {
  constructor(ms: number, message?: string) {
    super(message ?? `pazar ${Math.round(ms / 1000)} sn içinde yanıt vermedi`);
    this.name = "TimeoutError";
  }
}
class AbortedError extends Error {
  constructor() {
    super("aborted");
    this.name = "AbortedError";
  }
}

const TURKISH_LETTERS = /[çğıöşüÇĞİÖŞÜ]/;

/** Converts any thrown value into a typed AdapterError for a market. */
export function toAdapterError(err: unknown, market: MarketId): AdapterError {
  if (err instanceof AdapterError) return err;
  if (err instanceof TimeoutError) return new AdapterError("Timeout", market, err.message);
  if (err instanceof TypeError || err instanceof RangeError || err instanceof SyntaxError || err instanceof ReferenceError) {
    return new AdapterError("Internal", market, `${err.name}: ${err.message}`);
  }
  return new AdapterError("Network", market, err instanceof Error ? err.message : String(err));
}

/** Human-readable text from a URL's last path segment, for degraded link searches. */
export function slugFromUrl(url: string): string {
  try {
    const u = new URL(url);
    const segs = u.pathname.split("/").filter(Boolean);
    const last = [...segs].reverse().find((s) => /[a-z]{3,}/i.test(s)) ?? "";
    return decodeURIComponent(last)
      .replace(/\.(html?|php|aspx?)$/i, "")
      .replace(/[-_+]+/g, " ")
      .replace(/\b[a-z]?\d{5,}\b/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
  } catch {
    return "";
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Iterates `iter`, failing with TimeoutError past `deadline()` and AbortedError when the signal fires.
 * The deadline is read again whenever the timer fires, so a deadline that moved forward meanwhile
 * (queued time credited back) simply re-arms instead of timing out early.
 */
async function* withDeadline<T>(iter: AsyncIterable<T>, deadline: () => number, signal?: AbortSignal, timeoutMessage?: () => string): AsyncGenerator<T> {
  const it = iter[Symbol.asyncIterator]();
  const expired = (ms: number) => new TimeoutError(ms, timeoutMessage?.());
  let onAbort: (() => void) | null = null;
  const abortP = signal
    ? new Promise<never>((_, rej) => {
        onAbort = () => rej(new AbortedError());
        if (signal.aborted) onAbort();
        else signal.addEventListener("abort", onAbort, { once: true });
      })
    : null;
  abortP?.catch(() => undefined);
  try {
    while (true) {
      const startedAt = Date.now();
      if (deadline() - startedAt <= 0) throw expired(0);
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<never>((_, rej) => {
        const arm = () => {
          const remaining = deadline() - Date.now();
          if (remaining <= 0) {
            rej(expired(Date.now() - startedAt));
            return;
          }
          timer = setTimeout(arm, remaining);
        };
        arm();
      });
      let res: IteratorResult<T>;
      try {
        res = await Promise.race([it.next(), timeout, ...(abortP ? [abortP] : [])]);
      } finally {
        clearTimeout(timer);
      }
      if (res.done) return;
      yield res.value;
    }
  } finally {
    if (signal && onAbort) signal.removeEventListener("abort", onAbort);
    // Do not await: a hung adapter would hold the finally block.
    try {
      void Promise.resolve(it.return?.(undefined)).catch(() => undefined);
    } catch {
      /* ignore */
    }
  }
}

function withTimeout<T>(p: Promise<T>, ms: number, signal?: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new TimeoutError(ms)), ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new AbortedError());
    };
    if (signal?.aborted) onAbort();
    signal?.addEventListener("abort", onAbort, { once: true });
    p.then(
      (v) => {
        clearTimeout(timer);
        signal?.removeEventListener("abort", onAbort);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        signal?.removeEventListener("abort", onAbort);
        reject(e);
      },
    );
  });
}

function ladderFor(input: SearchInput, adapter: MarketAdapter): string[] {
  const raw = input.kind === "text" ? (input.perMarket?.[adapter.id] ?? input.query) : input.kind === "image" ? (input.titles?.[adapter.id] ?? input.title) : undefined;
  const list = (Array.isArray(raw) ? raw : raw ? [raw] : []).map((s) => s.trim()).filter(Boolean);
  return [...new Set(list)];
}

/**
 * Runs one search across the given adapters, emitting progress and progressively
 * re-clustered results. Pure orchestration: no UI, no storage.
 *
 * - markets run under a concurrency limit in priority order, each with a deadline;
 * - a link input is resolved on its owning market and fanned out as an image/text search;
 * - image searches that fail or return nothing fall back to the title ladder;
 * - listings are clustered immediately on text, image fingerprints arrive from a bounded pool;
 * - aborting ends every market as `done { cancelled: true }` and emits `finished { cancelled: true }`.
 */
export async function* runSearch(
  input: SearchInput,
  adapters: MarketAdapter[],
  fp: Fingerprinter,
  opts: SearchRunOptions = {},
): AsyncGenerator<SearchEvent> {
  const started = Date.now();
  const queue: SearchEvent[] = [];
  let wake: (() => void) | null = null;
  const emit = (e: SearchEvent) => {
    if (e.type === "clusters" || e.type === "fingerprinting") {
      const i = queue.findIndex((q) => q.type === e.type);
      if (i >= 0) {
        queue[i] = e;
        wake?.();
        return;
      }
    }
    queue.push(e);
    wake?.();
  };
  const signal = opts.signal;
  const aborted = () => signal?.aborted === true;
  const maxPerMarket = opts.maxPerMarket ?? Infinity;
  const reclusterEvery = opts.reclusterEvery ?? 5;
  const reclusterIntervalMs = opts.reclusterIntervalMs ?? 250;
  const concurrency = Math.max(1, opts.concurrency ?? 6);
  const perMarketTimeoutMs = opts.perMarketTimeoutMs ?? 120_000;
  const perMarketHardCapMs = Math.max(perMarketTimeoutMs, opts.perMarketHardCapMs ?? 600_000);
  const fingerprintConcurrency = Math.max(1, opts.fingerprintConcurrency ?? 4);
  const fingerprintGraceMs = opts.fingerprintGraceMs ?? 20_000;
  const ladderMinResults = opts.ladderMinResults ?? 5;
  const statusIntervalMs = opts.statusIntervalMs ?? 250;

  for (const a of adapters) emit({ type: "market", market: a.id, status: { state: "pending" } });

  const timers = new Set<ReturnType<typeof setTimeout>>();
  const later = (fn: () => void, ms: number) => {
    const t = setTimeout(() => {
      timers.delete(t);
      fn();
    }, ms);
    timers.add(t);
    return t;
  };

  // ---- Fingerprint pool -------------------------------------------------------------
  let clusterer: IncrementalClusterer | null = null;
  let derivedTitle: Promise<string | undefined> | undefined;
  let resolveDerived: ((t: string | undefined) => void) | undefined;
  let imageDone: (() => void) | undefined;
  let candidateCount = 0;
  const poolQueue: (() => Promise<void>)[] = [];
  let poolActive = 0;
  const poolIdleWaiters: (() => void)[] = [];
  const poolPending = () => poolQueue.length + poolActive;
  const pump = () => {
    while (poolActive < fingerprintConcurrency && poolQueue.length) {
      const job = poolQueue.shift()!;
      poolActive++;
      void job().finally(() => {
        poolActive--;
        emit({ type: "fingerprinting", pending: poolPending() });
        pump();
        if (poolPending() === 0) for (const w of poolIdleWaiters.splice(0)) w();
      });
    }
  };
  const poolIdle = () => (poolPending() === 0 ? Promise.resolve() : new Promise<void>((r) => poolIdleWaiters.push(r)));

  // ---- Clustering cadence -------------------------------------------------------------
  let sinceCluster = 0;
  let lastCluster = 0;
  let clusterTimer: ReturnType<typeof setTimeout> | null = null;
  const recluster = () => {
    if (!clusterer) return;
    if (clusterTimer) {
      clearTimeout(clusterTimer);
      timers.delete(clusterTimer);
      clusterTimer = null;
    }
    const snap = clusterer.snapshot();
    emit({ type: "clusters", clusters: snap.clusters, similar: snap.similar, similarByCategory: snap.similarByCategory });
    sinceCluster = 0;
    lastCluster = Date.now();
  };
  const scheduleRecluster = () => {
    sinceCluster++;
    const elapsed = Date.now() - lastCluster;
    if (sinceCluster >= reclusterEvery && elapsed >= reclusterIntervalMs) recluster();
    else if (!clusterTimer) {
      clusterTimer = later(() => {
        clusterTimer = null;
        if (sinceCluster > 0) recluster();
      }, Math.max(0, reclusterIntervalMs - elapsed));
    }
  };

  const fingerprintFailed = new Set<MarketId>();
  const addCandidate = (listing: RawListing, viaImageSearch: boolean) => {
    const category = opts.categorize?.(listing.title);
    const fingerprint: Fingerprint = enrichFingerprint({ title: listing.title, imagePending: true, ...(viaImageSearch ? { viaImageSearch: true } : {}), ...(category ? { category } : {}) });
    const index = candidateCount++;
    clusterer?.add({ listing, fingerprint }, index);
    scheduleRecluster();
    poolQueue.push(async () => {
      if (aborted()) {
        delete fingerprint.imagePending;
        return;
      }
      try {
        const got = await fp.forListing(listing);
        for (const [k, v] of Object.entries(got)) if (v !== undefined) (fingerprint as Record<string, unknown>)[k] = v;
        if (viaImageSearch) fingerprint.viaImageSearch = true;
      } catch (err) {
        if (!fingerprintFailed.has(listing.market)) {
          fingerprintFailed.add(listing.market);
          emit({ type: "note", market: listing.market, code: "fingerprint-failed", note: `görsel karşılaştırma yapılamadı (${err instanceof Error ? err.message : String(err)}); başlıkla eşleştirildi` });
        }
      } finally {
        delete fingerprint.imagePending;
      }
      clusterer?.markDirty(index);
      scheduleRecluster();
    });
    emit({ type: "fingerprinting", pending: poolPending() });
    pump();
  };

  // ---- Orchestration ------------------------------------------------------------------
  const run = async () => {
    let effective: SearchInput = input;
    let resolvedTitle: string | undefined;
    let toRun = adapters;
    let ownerListing: RawListingDetail | null = null;

    if (input.kind === "link") {
      const owner = adapters.find((a) => a.resolveLink(input.url));
      const slug = slugFromUrl(input.url);
      const buildLadders = (title: string, others: MarketAdapter[]) => {
        const out: Partial<Record<MarketId, string[]>> = {};
        for (const a of others) out[a.id] = opts.ladder ? opts.ladder(title, a) : [title];
        return out;
      };
      if (owner) {
        const info = owner.resolveLink(input.url)!;
        const others = adapters.filter((a) => a !== owner);
        toRun = others;
        emit({ type: "market", market: owner.id, status: { state: "running", received: 0, phase: "detail" } });
        const t0 = Date.now();
        try {
          const detail = await withTimeout(owner.fetchListing(info.listingId), perMarketTimeoutMs, signal);
          ownerListing = detail;
          resolvedTitle = detail.title;
          emit({ type: "listing", market: owner.id, listing: detail });
          emit({ type: "market", market: owner.id, status: { state: "done", received: 1, durationMs: Date.now() - t0 } });
          let image: ImageInput | null = null;
          if (opts.imageLoader) {
            try {
              image = await opts.imageLoader(detail);
            } catch {
              image = null;
            }
          }
          const ladders = buildLadders(detail.title, others);
          effective = image ? { kind: "image", image, title: detail.title, titles: ladders } : { kind: "text", query: detail.title, perMarket: ladders };
          emit({ type: "resolved", market: owner.id, listing: detail, input: effective });
        } catch (err) {
          if (err instanceof AbortedError) {
            emit({ type: "market", market: owner.id, status: { state: "done", received: 0, durationMs: Date.now() - t0, cancelled: true } });
          } else {
            const e = toAdapterError(err, owner.id);
            emit({ type: "market", market: owner.id, status: { state: "error", type: e.type, message: e.message, retryable: e.retryable } });
          }
          if (slug) {
            emit({ type: "note", market: owner.id, code: "link-degraded", note: `ilan detayı alınamadı, bağlantıdaki başlık ("${slug}") ile arandı` });
            resolvedTitle = slug;
            effective = { kind: "text", query: slug, perMarket: buildLadders(slug, others) };
          } else {
            effective = { kind: "text", query: input.url, perMarket: {} };
            toRun = [];
          }
        }
      } else {
        if (slug) {
          emit({ type: "warning", code: "link-unresolved", text: `bağlantı tanınan bir pazara ait değil; bağlantıdaki başlık ("${slug}") ile arandı` });
          resolvedTitle = slug;
          effective = { kind: "text", query: slug, perMarket: buildLadders(slug, adapters) };
        } else {
          emit({ type: "warning", code: "link-unresolved", text: "bağlantı tanınan bir pazara ait değil ve başlık çıkarılamadı" });
          toRun = [];
        }
      }
    }

    // Query fingerprint: never lets an image decode failure kill the search.
    let queryFp: Fingerprint;
    try {
      queryFp = await fp.forQuery(effective, resolvedTitle);
    } catch (err) {
      queryFp = {};
      emit({ type: "warning", code: "query-fingerprint-failed", text: `sorgu parmak izi çıkarılamadı (${err instanceof Error ? err.message : String(err)}); başlıkla eşleştiriliyor` });
    }
    const mainTitle = effective.kind === "image" ? effective.title : effective.kind === "text" ? effective.query : resolvedTitle;
    if (!queryFp.title && mainTitle) queryFp.title = mainTitle;
    const alts = new Set<string>();
    const ladders = effective.kind === "text" ? effective.perMarket : effective.kind === "image" ? effective.titles : undefined;
    for (const v of Object.values(ladders ?? {})) for (const s of Array.isArray(v) ? v : v ? [v] : []) if (s && s !== queryFp.title) alts.add(s);
    if (alts.size) queryFp.altTitles = [...new Set([...(queryFp.altTitles ?? []), ...alts])];
    if (effective.kind !== "link" && effective.category && !queryFp.category) queryFp.category = effective.category;
    if (!queryFp.category && queryFp.title && opts.categorize) {
      const c = opts.categorize(queryFp.title);
      if (c) queryFp.category = c;
    }
    enrichFingerprint(queryFp);
    clusterer = new IncrementalClusterer(queryFp);
    if (ownerListing) addCandidate(ownerListing, false);

    const runMarket = async (adapter: MarketAdapter) => {
      const t0 = Date.now();
      // Deadline on active time: while the runner reports the request as queued the clock is paused
      // (the queued span is credited back when the request starts); the hard cap bounds the whole wait.
      let deadline = t0 + perMarketTimeoutMs;
      const hardCap = t0 + perMarketHardCapMs;
      let queuedAt: number | null = null;
      const deadlineNow = () => (queuedAt !== null ? hardCap : Math.min(deadline, hardCap));
      const timeoutMessage = () =>
        queuedAt !== null
          ? `pazar ${Math.round(perMarketHardCapMs / 60000)} dk boyunca sırada bekledi (eklenti sekme açamadı)`
          : `pazar ${Math.round(perMarketTimeoutMs / 1000)} sn etkin süre içinde yanıt vermedi`;
      let received = 0;
      let phase: MarketPhase = "text";
      let rung: number | undefined;
      let stage: AdapterStage | undefined;
      let page: number | undefined;
      let lastStatus = 0;
      let sinceStatus = 0;
      const seen = new Set<string>();
      const status = (force: boolean) => {
        if (!force && sinceStatus < 10 && Date.now() - lastStatus < statusIntervalMs) return;
        emit({
          type: "market",
          market: adapter.id,
          status: { state: "running", received, phase, ...(rung !== undefined ? { rung } : {}), ...(stage ? { stage } : {}), ...(page !== undefined ? { page } : {}) },
        });
        lastStatus = Date.now();
        sinceStatus = 0;
      };
      const onProgress = (p: AdapterProgress) => {
        if (p.stage === "queued") {
          if (queuedAt === null) queuedAt = Date.now();
        } else if (queuedAt !== null) {
          deadline += Date.now() - queuedAt;
          queuedAt = null;
        }
        stage = p.stage === "done" ? undefined : p.stage;
        page = p.stage === "done" ? undefined : p.page;
        status(true);
      };
      const so: SearchOptions = { onProgress };
      if (Number.isFinite(maxPerMarket)) so.maxResults = maxPerMarket;
      if (signal) so.signal = signal;
      const finishDone = () =>
        emit({ type: "market", market: adapter.id, status: { state: "done", received, durationMs: Date.now() - t0, ...(aborted() ? { cancelled: true } : {}) } });
      try {
        let ladder = ladderFor(effective, adapter);
        const lang = adapter.meta.language;
        if (effective.kind === "text" && lang !== "tr" && ladder.length > 1) {
          const kept = ladder.filter((r) => !(r === effective.query && TURKISH_LETTERS.test(r)));
          if (kept.length && kept.length < ladder.length) {
            emit({ type: "note", market: adapter.id, code: "rung-skipped", note: `Türkçe sorgu bu pazarda atlandı, "${kept[0]}" ile arandı` });
            ladder = kept;
          }
        }
        if (effective.kind === "text" && lang !== "tr" && lang !== "zh" && ladder.length === 1 && ladder[0] === effective.query && TURKISH_LETTERS.test(effective.query)) {
          emit({ type: "note", market: adapter.id, code: "untranslated", note: "sorgu bu pazarın diline çevrilemedi, Türkçe haliyle arandı" });
        }
        /** Consumes an iterator into listings; returns true when the market cap is reached. */
        const consume = async (iter: AsyncIterable<RawListing>, ph: MarketPhase, r?: number): Promise<boolean> => {
          phase = ph;
          rung = r;
          status(true);
          for await (const l of withDeadline(iter, deadlineNow, signal, timeoutMessage)) {
            if (aborted()) return true;
            if (received >= maxPerMarket) return true;
            const key = keyOf(l);
            if (seen.has(key)) continue;
            seen.add(key);
            received++;
            sinceStatus++;
            if (l.packQty === undefined) {
              const pq = attributes(l.title).packQty;
              if (pq) l.packQty = pq;
            }
            emit({ type: "listing", market: adapter.id, listing: l });
            status(false);
            addCandidate(l, ph === "image");
            if (ph === "image" && l.title.trim()) resolveDerived?.(l.title);
          }
          return received >= maxPerMarket;
        };
        const textLadder = async () => {
          for (let i = 0; i < ladder.length; i++) {
            if (aborted()) return;
            const before = received;
            const full = await consume(adapter.searchByText(ladder[i]!, so), "text", i);
            if (full) return;
            if (received >= ladderMinResults) return;
            const got = received - before;
            if (i + 1 < ladder.length) {
              emit({
                type: "note",
                market: adapter.id,
                code: "ladder-next",
                rung: i + 1,
                note: got === 0 ? `"${ladder[i]}" sonuç vermedi, "${ladder[i + 1]}" ile arandı` : `"${ladder[i]}" yalnız ${got} sonuç verdi, "${ladder[i + 1]}" ile de arandı`,
              });
            }
          }
        };
        if (effective.kind === "image") {
          // A remembered failure only reroutes to the title ladder; with no title there is nothing to
          // reroute to, so a market that can search by image still tries it.
          const override = ladder.length ? opts.capabilityOverrides?.[adapter.id]?.imageSearch : undefined;
          const canImage = override ?? adapter.meta.capabilities.imageSearch;
          if (canImage) {
            let failed = false;
            try {
              await consume(adapter.searchByImage(effective.image, so), "image");
            } catch (err) {
              if (err instanceof AbortedError) throw err;
              const e = err instanceof AdapterError ? err : null;
              if (e && (e.type === "LoggedOut" || e.type === "Captcha")) throw err;
              if (!ladder.length) throw err;
              failed = true;
              emit({ type: "note", market: adapter.id, code: "image-fallback", note: `görselle arama başarısız (${err instanceof Error ? err.message : String(err)}), başlıkla arandı` });
            }
            if (received === 0 && ladder.length && !aborted()) {
              if (!failed) emit({ type: "note", market: adapter.id, code: "image-empty", note: "görselle arama sonuç vermedi, başlıkla arandı" });
              await textLadder();
            }
          } else {
            if (!ladder.length && derivedTitle && opts.ladder) {
              const t = await derivedTitle;
              if (t && !aborted()) {
                ladder = opts.ladder(t, adapter).map((r) => r.trim()).filter(Boolean);
                if (ladder.length) emit({ type: "note", market: adapter.id, code: "image-title", note: `görselle bulunan ürünün başlığıyla arandı: "${ladder[0]}"` });
              }
            }
            if (!ladder.length) {
              emit({ type: "note", market: adapter.id, code: "no-image-search", note: "bu pazarda görselle arama yok ve başlık bilinmiyor" });
              finishDone();
              return;
            }
            emit({ type: "note", market: adapter.id, code: "no-image-search", note: opts.capabilityOverrides?.[adapter.id]?.imageSearch === false ? "görselle arama bu pazarda çalışmıyor, başlıkla arandı" : "görselle arama yok, başlıkla arandı" });
            await textLadder();
          }
        } else if (effective.kind === "text") {
          if (!ladder.length) ladder = [effective.query];
          await textLadder();
        }
        finishDone();
      } catch (err) {
        if (err instanceof AbortedError || (aborted() && !(err instanceof AdapterError))) {
          finishDone();
          return;
        }
        const e = toAdapterError(err, adapter.id);
        emit({ type: "market", market: adapter.id, status: { state: "error", type: e.type, message: e.message, retryable: e.retryable } });
      }
    };

    // Photo-only search: markets without image search borrow the title of the first listing an
    // image-search market finds. They wait outside a concurrency slot so image markets can run.
    const imageMarkets = effective.kind === "image" ? toRun.filter((a) => a.meta.capabilities.imageSearch) : [];
    const waitsForTitle = (a: MarketAdapter) =>
      effective.kind === "image" && !!opts.ladder && imageMarkets.length > 0 && !imageMarkets.includes(a) && ladderFor(effective, a).length === 0;
    if (toRun.some(waitsForTitle)) {
      derivedTitle = new Promise<string | undefined>((r) => (resolveDerived = r));
      let left = imageMarkets.length;
      imageDone = () => {
        if (--left === 0) resolveDerived?.(undefined);
      };
      signal?.addEventListener("abort", () => resolveDerived?.(undefined), { once: true });
    }

    // Concurrency + priority.
    const ordered = toRun
      .map((a, i) => ({ a, i, p: opts.priority?.(a) ?? 0 }))
      .sort((x, y) => x.p - y.p || x.i - y.i)
      .map((x) => x.a);
    let active = 0;
    const waiters: (() => void)[] = [];
    const acquire = () =>
      new Promise<void>((r) => {
        if (active < concurrency) {
          active++;
          r();
        } else waiters.push(r);
      });
    const release = () => {
      const w = waiters.shift();
      if (w) w();
      else active--;
    };
    const tasks = ordered.map(async (adapter) => {
      if (derivedTitle && waitsForTitle(adapter)) await derivedTitle;
      await acquire();
      try {
        if (aborted()) {
          emit({ type: "market", market: adapter.id, status: { state: "done", received: 0, durationMs: 0, cancelled: true } });
          return;
        }
        await runMarket(adapter);
      } finally {
        if (imageMarkets.includes(adapter)) imageDone?.();
        release();
      }
    });
    await Promise.all(tasks);
    if (!aborted() && poolPending() > 0) await Promise.race([poolIdle(), sleep(fingerprintGraceMs)]);
    recluster();
  };

  let finished = false;
  const all = run().catch((err: unknown) => {
    emit({ type: "warning", code: "internal", text: err instanceof Error ? `${err.name}: ${err.message}` : String(err) });
  });
  void all.finally(() => {
    for (const t of timers) clearTimeout(t);
    timers.clear();
    finished = true;
    emit({ type: "finished", durationMs: Date.now() - started, ...(aborted() ? { cancelled: true } : {}) });
    wake?.();
  });

  while (true) {
    while (queue.length) yield queue.shift()!;
    if (finished) break;
    await new Promise<void>((r) => (wake = r));
    wake = null;
  }
}
