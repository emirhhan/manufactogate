import type { Histogram } from "@/lib/analysis";
import { money } from "@/lib/format";
import { cn } from "./ui";

/** Inline SVG price distribution; log-spaced bins when the range is wide. Clicking a bar narrows the price filter. */
export function PriceHistogram({ h, currency, range, onPick, className }: { h: Histogram; currency: string; range?: { min: number | null; max: number | null } | undefined; onPick?: ((from: number, to: number) => void) | undefined; className?: string }) {
  const W = 200;
  const H = 44;
  const n = h.bins.length;
  const max = Math.max(1, ...h.bins.map((b) => b.count));
  const bw = W / n;
  const fmt = (v: number) => (v >= 1000 ? money(Math.round(v), currency) : money(v, currency));
  return (
    <div className={cn("select-none", className)}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label="Fiyat dağılımı" className="block">
        {h.bins.map((b, i) => {
          const bh = Math.max(1, (b.count / max) * (H - 4));
          const inRange = (range?.min === null || range?.min === undefined || b.to >= range.min) && (range?.max === null || range?.max === undefined || b.from <= range.max);
          return (
            <g key={i} onClick={() => onPick?.(b.from, b.to)} className={onPick ? "cursor-pointer" : ""}>
              <title>{`${fmt(b.from)} – ${fmt(b.to)}: ${b.count} ilan`}</title>
              <rect x={i * bw + 1} y={H - bh} width={Math.max(1, bw - 2)} height={bh} rx={1} className={cn(inRange ? "fill-accent" : "fill-border", "transition-opacity hover:opacity-80")} />
            </g>
          );
        })}
      </svg>
      <div className="flex justify-between text-[10px] text-muted tnum">
        <span>{fmt(h.min)}</span>
        {h.log && <span title="Logaritmik ölçek">log</span>}
        <span>{fmt(h.max)}</span>
      </div>
    </div>
  );
}
