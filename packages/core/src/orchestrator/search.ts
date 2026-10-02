import type { Fingerprint } from "../fingerprint";
import { clusterCandidates, type Cluster, type ScoredListing } from "../match";
import {
  AdapterError,
  type AdapterErrorType,
  type ImageInput,
  type MarketAdapter,
  type MarketId,
  type RawListing,
  type SearchOptions,
} from "../model";

export type SearchInput =
  | { kind: "image"; image: ImageInput; title?: string }
  | { kind: "text"; query: string }
  | { kind: "link"; url: string };

export type MarketStatus =
  | { state: "pending" }
  | { state: "running"; received: number }
  | { state: "done"; received: number; durationMs: number }
  | { state: "error"; type: AdapterErrorType; message: string; retryable: boolean };

export type SearchEvent =
  | { type: "market"; market: MarketId; status: MarketStatus }
  | { type: "listing"; market: MarketId; listing: RawListing }
  | { type: "clusters"; clusters: Cluster[]; similar: ScoredListing[] }
  | { type: "finished"; durationMs: number };

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
}

/**
 * Runs one search across the given adapters in parallel, emitting progress and
 * progressively re-clustered results. Pure orchestration: no UI, no storage.
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
    queue.push(e);
    wake?.();
  };
  const candidates: { listing: RawListing; fingerprint: Fingerprint }[] = [];
  const reclusterEvery = opts.reclusterEvery ?? 5;

  for (const a of adapters) emit({ type: "market", market: a.id, status: { state: "pending" } });

  const queryFp = await fp.forQuery(input);

  let sinceCluster = 0;
  const recluster = () => {
    const { clusters, similar } = clusterCandidates(queryFp, candidates);
    emit({ type: "clusters", clusters, similar });
    sinceCluster = 0;
  };

  const tasks = adapters.map(async (adapter) => {
    const t0 = Date.now();
    let received = 0;
    emit({ type: "market", market: adapter.id, status: { state: "running", received } });
    try {
      const so: SearchOptions = {};
      if (opts.maxPerMarket !== undefined) so.maxResults = opts.maxPerMarket;
      if (opts.signal) so.signal = opts.signal;
      const iter =
        input.kind === "image"
          ? adapter.searchByImage(input.image, so)
          : input.kind === "text"
            ? adapter.searchByText(input.query, so)
            : linkSearch(adapter, input.url);
      for await (const listing of iter) {
        if (opts.signal?.aborted) break;
        received++;
        emit({ type: "listing", market: adapter.id, listing });
        emit({ type: "market", market: adapter.id, status: { state: "running", received } });
        const fingerprint = await fp.forListing(listing);
        candidates.push({ listing, fingerprint });
        if (++sinceCluster >= reclusterEvery) recluster();
      }
      emit({
        type: "market",
        market: adapter.id,
        status: { state: "done", received, durationMs: Date.now() - t0 },
      });
    } catch (err) {
      const e =
        err instanceof AdapterError
          ? err
          : new AdapterError("Network", adapter.id, err instanceof Error ? err.message : String(err));
      emit({
        type: "market",
        market: adapter.id,
        status: { state: "error", type: e.type, message: e.message, retryable: e.retryable },
      });
    }
  });

  const all = Promise.all(tasks).then(() => {
    recluster();
    emit({ type: "finished", durationMs: Date.now() - started });
  });

  let finished = false;
  void all.finally(() => {
    finished = true;
    wake?.();
  });

  while (true) {
    while (queue.length) yield queue.shift()!;
    if (finished) break;
    await new Promise<void>((r) => (wake = r));
    wake = null;
  }
}

async function* linkSearch(adapter: MarketAdapter, url: string): AsyncIterable<RawListing> {
  const info = adapter.resolveLink(url);
  if (!info) return;
  yield await adapter.fetchListing(info.listingId);
}
