import { useState } from "react";
import type { MarketId, MarketStatus } from "@manufactogate/core";
import { describeError } from "@/lib/marketErrors";
import { isBeta } from "@/lib/markets";
import { getRegistry } from "@/lib/registry";
import { Button, cn } from "./ui";

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
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [skipped, setSkipped] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const reg = getRegistry();
  const entries = Object.entries(markets);
  const done = entries.filter(([, s]) => s.state === "done").length;
  const withResults = entries.filter(([m, s]) => s.state === "done" && (listings[m]?.length ?? s.received) > 0).length;
  const errors = entries.filter(([, s]) => s.state === "error");
  const retryable = errors.filter(([m, s]) => s.state === "error" && describeError(s.type, s.message, m).retryable).map(([m]) => m as MarketId);
  const broken = errors.filter(([, s]) => s.state === "error" && (s.type === "SelectorBroken" || s.type === "Internal")).map(([m]) => m as MarketId);
  const active = entries.filter(([, s]) => s.state === "running").map(([m]) => reg.get(m as MarketId)?.meta.name ?? m);
  const queued = entries.filter(([, s]) => s.state === "pending").length;
  const total = entries.length;
  const pctDone = total ? Math.round(((done + errors.length) / total) * 100) : 0;

  const retryAll = async () => {
    setRetrying(true);
    try {
      for (let i = 0; i < retryable.length; i++) {
        onRetry(retryable[i]!);
        // Stagger so the extension's tab queue is not hit with every market at once.
        if (i < retryable.length - 1) await new Promise((r) => setTimeout(r, 1500));
      }
    } finally {
      setRetrying(false);
    }
  };
  const problemIds = [...new Set([...broken, ...entries.filter(([m, s]) => s.state === "done" && (listings[m]?.length ?? s.received) === 0 && isBeta(reg.get(m as MarketId))).map(([m]) => m as MarketId)])];

  return (
    <div className="rounded-xl border border-border bg-surface">
      <button onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-[13px]">
        <div className="h-2 w-40 overflow-hidden rounded-full bg-surface-2">
          <div className={cn("h-full rounded-full transition-all", running ? "bg-accent" : errors.length ? "bg-warning" : "bg-success")} style={{ width: `${pctDone}%` }} />
        </div>
        <span className="tnum">
          {withResults}/{total} pazar sonuç verdi
          {done - withResults > 0 && <span className="text-muted"> · {done - withResults} boş</span>}
          {errors.length > 0 && <span className="text-danger"> · {errors.length} sorun</span>}
          {queued > 0 && <span className="text-muted"> · {queued} sırada</span>}
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
                const dot = st.state === "done" ? (n > 0 ? "bg-success" : "bg-warning") : st.state === "error" ? "bg-danger" : st.state === "running" ? "bg-accent animate-pulse" : "bg-border";
                const label = st.state === "pending" ? "sırada" : st.state === "running" ? `aranıyor · ${st.received}` : st.state === "done" ? `${n} sonuç · ${(st.durationMs / 1000).toFixed(0)} sn` : desc!.title;
                return (
                  <div key={id} className="flex items-center gap-2 rounded-md px-2 py-1 text-[12px] hover:bg-surface-2" title={[desc ? `${desc.hint}\n${st.state === "error" ? st.message : ""}` : "", notes[id] ?? ""].filter(Boolean).join("\n") || undefined}>
                    <span className={cn("inline-block h-2 w-2 shrink-0 rounded-full", dot)} />
                    <span className="w-28 truncate font-medium">{name}</span>
                    <span className="truncate text-muted tnum">{label}</span>
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
                    {st.state === "error" && (
                      <Button size="sm" variant="ghost" onClick={() => onRetry(id as MarketId)} className="ml-auto h-6 px-1.5 text-[11px]">
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
                <Button size="sm" onClick={() => void retryAll()} disabled={retrying || running}>
                  {retrying ? "Yeniden deneniyor…" : `Sorunluları yeniden dene (${retryable.length})`}
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
          {(errors.length > 0 || Object.keys(notes).length > 0) && (
            <details className="mt-2 text-[12px] text-muted">
              <summary className="cursor-pointer select-none">Tanı ({errors.length + Object.keys(notes).length})</summary>
              <ul className="mt-1 space-y-0.5 font-mono text-[11px]">
                {errors.map(
                  ([id, st]) =>
                    st.state === "error" && (
                      <li key={id}>
                        <span className="text-text">{reg.get(id as MarketId)?.meta.name ?? id}</span>: {st.type}: {st.message}
                      </li>
                    ),
                )}
                {Object.entries(notes).map(([id, n]) => (
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
