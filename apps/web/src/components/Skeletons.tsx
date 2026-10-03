import { cn } from "./ui";

/** Loading placeholders built from theme tokens only; `animate-pulse` is disabled globally under reduced motion. */
export function Line({ w = "w-full", h = "h-3", className }: { w?: string; h?: string; className?: string }) {
  return <div aria-hidden className={cn("motion-safe:animate-pulse rounded bg-surface-2", w, h, className)} />;
}

export function CardSkeleton({ label }: { label?: string | undefined }) {
  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-border bg-surface" aria-busy="true" aria-label={label}>
      <div className="relative aspect-square w-full bg-surface-2 motion-safe:animate-pulse">
        {label && <span className="absolute left-2 top-2 rounded bg-surface/80 px-1.5 py-0.5 text-[11px] text-muted">{label}</span>}
      </div>
      <div className="space-y-2 p-3">
        <Line />
        <Line w="w-3/4" />
        <div className="flex justify-between pt-1">
          <Line w="w-16" h="h-4" />
          <Line w="w-10" />
        </div>
      </div>
    </div>
  );
}

/** Grid of card placeholders, optionally one per market still running (named). */
export function CardGridSkeleton({ count = 10, labels = [] }: { count?: number; labels?: string[] }) {
  const n = Math.max(count, labels.length);
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
      {Array.from({ length: n }).map((_, i) => (
        <CardSkeleton key={i} label={labels[i]} />
      ))}
    </div>
  );
}

export function TableSkeleton({ rows = 5, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-surface" aria-busy="true">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className={cn("flex gap-4 px-4 py-2.5", r > 0 && "border-t border-border")}>
          {Array.from({ length: cols }).map((_, c) => (
            <Line key={c} w={c === 0 ? "w-32" : "flex-1"} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function AnalysisSkeleton() {
  return (
    <div className="rounded-lg border border-border bg-surface p-4" aria-busy="true">
      <div className="grid gap-4 md:grid-cols-[auto_1fr_1fr_1fr]">
        <div className="flex items-center gap-3">
          <div className="h-[72px] w-[72px] rounded-full border-[6px] border-surface-2 motion-safe:animate-pulse" />
          <div className="space-y-2">
            <Line w="w-20" h="h-2" />
            <Line w="w-40" />
          </div>
        </div>
        {[0, 1, 2].map((i) => (
          <div key={i} className="space-y-2">
            <Line w="w-24" h="h-2" />
            <Line w="w-28" h="h-6" />
            <Line w="w-32" h="h-2" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function ListingSkeleton() {
  return (
    <div className="mx-auto max-w-[1440px] px-4 py-6" aria-busy="true">
      <Line w="w-56" h="h-3" />
      <div className="mt-3 grid gap-6 lg:grid-cols-[460px_1fr]">
        <div>
          <div className="aspect-square rounded-lg border border-border bg-surface-2 motion-safe:animate-pulse" />
          <div className="mt-2 flex gap-1.5">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-14 w-14 rounded border border-border bg-surface-2 motion-safe:animate-pulse" />
            ))}
          </div>
          <Line className="mt-3" h="h-9" />
        </div>
        <div className="space-y-3">
          <Line w="w-20" h="h-5" />
          <Line h="h-6" />
          <Line w="w-2/3" h="h-6" />
          <Line w="w-40" h="h-8" />
          <div className="pt-4">
            <TableSkeleton rows={4} cols={3} />
          </div>
        </div>
      </div>
    </div>
  );
}

export function DetailSkeleton() {
  return (
    <div className="mt-4 space-y-1.5" aria-busy="true" aria-label="Detay çekiliyor">
      <Line w="w-28" h="h-2" />
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="flex gap-4">
          <Line w="w-24" />
          <Line w="w-48" />
        </div>
      ))}
    </div>
  );
}
