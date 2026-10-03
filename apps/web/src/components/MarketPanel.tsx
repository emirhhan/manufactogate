import { useState } from "react";
import type { MarketId, MarketStatus, SearchInput } from "@manufactogate/core";
import { COPY } from "@/lib/copy";
import { describeError } from "@/lib/marketErrors";
import { isBeta } from "@/lib/markets";
import { getRegistry } from "@/lib/registry";
import { STAGE_LABELS_TR, useExtension, type LiveMarketPhase } from "@/store/extension";
import { marketQueries, type MarketTrace } from "@/store/search";
import { Button, cn } from "./ui";

/**
 * One line of status for a market row. The orchestrator mirrors the extension's stage into the
 * running status; the live map from the extension store fills in while the market is still queued
 * (the orchestrator has not started it yet, but the extension already reports it). Pure.
 */
export function marketRowLabel(st: MarketStatus, n: number, opts: { live?: LiveMarketPhase | undefined; retrying?: boolean; errorTitle?: string } = {}): string {
  if (opts.retrying && st.state !== "error") return COPY.search.retryingMarkets;
  if (st.state === "pending") return opts.live && opts.live.stage !== "done" ? STAGE_LABELS_TR[opts.live.stage] : COPY.market.queued;
  if (st.state === "running") {
    const stage = st.stage ?? (opts.live && opts.live.stage !== "done" ? opts.live.stage : undefined);
    const parts: string[] = [];
    if (st.phase === "image") parts.push(COPY.market.byImage);
    parts.push(stage ? STAGE_LABELS_TR[stage] : st.phase === "detail" ? COPY.market.detail : COPY.market.searching);
    if (st.page !== undefined && st.page > 1) parts.push(COPY.market.page(st.page));
    if (st.phase === "text" && st.rung !== undefined && st.rung > 0) parts.push(COPY.market.rung(st.rung + 1));
    if (st.received > 0) parts.push(String(st.received));
    return parts.join(" · ");
  }
  if (st.state === "done") return `${COPY.market.results(n)} · ${(st.durationMs / 1000).toFixed(0)} sn${st.cancelled ? ` · ${COPY.market.stopped}` : ""}`;
  return opts.errorTitle ?? st.message;
}

/**
 * Compact market progress: one summary line, details on demand. Every market the search asked for
 * appears here, including the ones that produced nothing, with an actionable hint per failure.
 */
export function MarketPanel({
  markets,
  notes = {},
  listings = {},
  query,
  onRetry,
  onSkipProblem,
  running,
  retrying = [],
  trace,
  input,
  defaultOpen = false,
}: {
  markets: Record<string, MarketStatus>;
  notes?: Record<string, string>;
  /** Listings per market, to tell "0 sonuç" from "sorun". */
  listings?: Record<string, unknown[]>;
  /** Query text, used to build "Pazarda aç" links. */
  query?: string | undefined;
  onRetry: (m: MarketId) => void;
  /** Writes the "skip these next time" preference; hidden when absent. */
  onSkipProblem?: ((ids: MarketId[]) => void | Promise<void>) | undefined;
  running: boolean;
  /** Markets the store is retrying right now (rows read "yeniden deneniyor", buttons are disabled). */
  retrying?: string[] | undefined;
  /** Per-market trace from the search store; with `input` the row tooltip lists the queries sent. */
  trace?: Record<string, MarketTrace> | undefined;
  input?: SearchInput | undefined;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [skipped, setSkipped] = useState(false);
  const [retryingAll, setRetryingAll] = useState(false);
  const live = useExtension((s) => s.live);
  const reg = getRegistry();
  const entries = Object.entries(markets);
  const done = entries.filter(([, s]) => s.state === "done").length;
  const withResults = entries.filter(([m, s]) => s.state === "done" && (listings[m]?.length ?? s.received) > 0).length;
  const errors = entries.filter(([, s]) => s.state === "error");
  const retryable = errors.filter(([m, s]) => s.state === "error" && describeError(s.type, s.message, m).retryable).map(([m]) => m as MarketId);
  const broken = errors.filter(([, s]) => s.state === "error" && (s.type === "SelectorBroken" || s.type === "Internal")).map(([m]) => m as MarketId);
  const active = entries.filter(([, s]) => s.state === "running").map(([m]) => reg.get(m as MarketId)?.meta.name ?? m);
  const queued = entries.filter(([, s]) => s.state === "pending").length;
  const stopped = entries.filter(([, s]) => s.state === "done" && s.cancelled).length;
  const total = entries.length;
  const pctDone = total ? Math.round(((done + errors.length) / total) * 100) : 0;
  const busy = running || retrying.length > 0;

  const retryAll = async () => {
    setRetryingAll(true);
    try {
      for (let i = 0; i < retryable.length; i++) {
        onRetry(retryable[i]!);
        // Stagger so the extension's tab queue is not hit with every market at once.
        if (i < retryable.length - 1) await new Promise((r) => setTimeout(r, 1500));
      }
    } finally {
      setRetryingAll(false);
    }
  };
  const problemIds = [...new Set([...broken, ...entries.filter(([m, s]) => s.state === "done" && (listings[m]?.length ?? s.received) === 0 && isBeta(reg.get(m as MarketId))).map(([m]) => m as MarketId)])];

  return (
    <div className="rounded-xl border border-border bg-surface">
      <button onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-[13px]">
        <div className="h-2 w-40 overflow-hidden rounded-full bg-surface-2">
          <div className={cn("h-full rounded-full transition-all", busy ? "bg-accent" : errors.length ? "bg-warning" : "bg-success")} style={{ width: `${pctDone}%` }} />
        </div>
        <span className="tnum">
          {withResults}/{total} pazar sonuç verdi
          {done - withResults > 0 && <span className="text-muted"> · {done - withResults} boş</span>}
          {errors.length > 0 && <span className="text-danger"> · {errors.length} sorun</span>}
          {stopped > 0 && <span className="text-muted"> · {stopped} {COPY.market.stopped}</span>}
          {queued > 0 && <span className="text-muted"> · {queued} sırada</span>}
          {retrying.length > 0 && <span className="text-accent"> · {retrying.length} {COPY.search.retryingMarkets}</span>}
        </span>
        {active.length > 0 && (
          <span className="truncate text-muted">
            şu an: {active.slice(0, 3).join(", ")}
            {active.length > 3 ? "…" : ""}
          </span>
        )}
        <span className="ml-auto text-[12px] text-accent">{open ? "Gizle" : "Ayrıntı"}</span>
      </button>
      {open && (
        <div className="border-t border-border px-4 py-3">
          <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
            {entries
              .sort(([, a], [, b]) => (a.state === "error" ? 0 : 1) - (b.state === "error" ? 0 : 1))
              .map(([id, st]) => {
                const name = reg.get(id as MarketId)?.meta.name ?? id;
                const n = listings[id]?.length ?? (st.state === "done" ? st.received : st.state === "running" ? st.received : 0);
                const desc = st.state === "error" ? describeError(st.type, st.message, id, query) : null;
                const isRetrying = retrying.includes(id);
                const dot = isRetrying ? "bg-accent animate-pulse" : st.state === "done" ? (st.cancelled ? "bg-border" : n > 0 ? "bg-success" : "bg-warning") : st.state === "error" ? "bg-danger" : st.state === "running" ? "bg-accent animate-pulse" : "bg-border";
                const label = marketRowLabel(st, n, { live: live[id as MarketId], retrying: isRetrying, ...(desc ? { errorTitle: desc.title } : {}) });
                const q = trace ? marketQueries(input, id, trace[id]) : null;
                const queryLine = q && q.tried.length ? `sorgu: ${q.tried.join(" → ")}` : "";
                const title = [desc ? `${desc.hint}\n${st.state === "error" ? st.message : ""}` : "", notes[id] ?? "", queryLine].filter(Boolean).join("\n") || undefined;
                return (
                  <div key={id} data-market-row={id} className="flex items-center gap-2 rounded-md px-2 py-1 text-[12px] hover:bg-surface-2" title={title}>
                    <span className={cn("inline-block h-2 w-2 shrink-0 rounded-full", dot)} />
                    <span className="w-28 truncate font-medium">{name}</span>
                    <span className="truncate text-muted tnum" data-market-label>{label}</span>
                    {notes[id] && (
                      <span className="text-warning" title={notes[id]}>
                        ⓘ
                      </span>
                    )}
                    {desc?.action && (
                      <a href={desc.action.href} target="_blank" rel="noreferrer noopener" className="text-accent hover:underline">
                        {desc.action.label} ↗
                      </a>
                    )}
                    {(st.state === "error" || (st.state === "done" && st.cancelled)) && !isRetrying && (
                      <Button size="sm" variant="ghost" onClick={() => onRetry(id as MarketId)} disabled={running} className="ml-auto h-6 px-1.5 text-[11px]">
                        yeniden
                      </Button>
                    )}
                  </div>
                );
              })}
          </div>
          {(errors.length > 0 || problemIds.length > 0) && (
            <div className="mt-3 flex flex-wrap items-center gap-2 text-[12px]">
              {retryable.length > 1 && (
                <Button size="sm" onClick={() => void retryAll()} disabled={retryingAll || busy}>
                  {retryingAll || retrying.length > 0 ? COPY.search.retrying : `Sorunluları yeniden dene (${retryable.length})`}
                </Button>
              )}
              {onSkipProblem && problemIds.length > 0 && (
                <label className="flex items-center gap-1.5 text-muted">
                  <input
                    type="checkbox"
                    checked={skipped}
                    onChange={(e) => {
                      setSkipped(e.target.checked);
                      if (e.target.checked) void onSkipProblem(problemIds);
                    }}
                  />
                  Bir sonraki karşılaştırmada bu pazarları atla ({problemIds.map((m) => reg.get(m)?.meta.name ?? m).join(", ")})
                </label>
              )}
            </div>
          )}
          {(errors.length > 0 || Object.values(notes).some(Boolean)) && (
            <details className="mt-2 text-[12px] text-muted">
              <summary className="cursor-pointer select-none">Tanı ({errors.length + Object.values(notes).filter(Boolean).length})</summary>
              <ul className="mt-1 space-y-0.5 font-mono text-[11px]">
                {errors.map(
                  ([id, st]) =>
                    st.state === "error" && (
                      <li key={id}>
                        <span className="text-text">{reg.get(id as MarketId)?.meta.name ?? id}</span>: {st.type}: {st.message}
                      </li>
                    ),
                )}
                {Object.entries(notes)
                  .filter(([, n]) => !!n)
                  .map(([id, n]) => (
                    <li key={`n-${id}`}>
                      <span className="text-text">{reg.get(id as MarketId)?.meta.name ?? id}</span>: {n}
                    </li>
                  ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
