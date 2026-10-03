import type { ChainStep } from "@/lib/analysis";
import { money } from "@/lib/format";
import { cn } from "./ui";

/**
 * "Fiyat zinciri": source price → landed cost → target sell price → net, side by side with the
 * change at each step. Compact mode fits inside the analysis card.
 */
export function PriceChain({ steps, compact = false, className }: { steps: ChainStep[]; compact?: boolean; className?: string }) {
  if (!steps.length) return null;
  const max = Math.max(...steps.map((s) => Math.abs(s.amount)), 1);
  return (
    <ol className={cn("flex flex-wrap items-stretch gap-2", className)} aria-label="Fiyat zinciri">
      {steps.map((s, i) => {
        const tone = s.key === "net" ? (s.amount > 0 ? "text-success" : "text-danger") : s.key === "sell" ? "text-accent" : "";
        const bar = Math.max(4, Math.round((Math.abs(s.amount) / max) * 100));
        return (
          <li key={s.key} className="flex items-stretch gap-2">
            {i > 0 && (
              <div className="flex flex-col items-center justify-center text-[11px] text-muted tnum" aria-hidden>
                <span>→</span>
                {s.delta !== undefined && <span className={cn(s.key === "net" ? (s.delta > 0 ? "text-success" : "text-danger") : "")}>{s.key === "net" ? `%${Math.round(s.delta * 100)} marj` : `${s.delta >= 0 ? "+" : ""}${Math.round(s.delta * 100)}%`}</span>}
              </div>
            )}
            <div className={cn("min-w-[120px] rounded-md border border-border bg-surface-2/50", compact ? "px-2.5 py-1.5" : "px-3 py-2")} title={s.note}>
              <div className="text-[10px] font-medium uppercase tracking-wide text-muted">{s.label}</div>
              <div className={cn("font-semibold tnum", compact ? "text-[13px]" : "text-[15px]", tone)}>{money(s.amount, s.currency)}</div>
              {!compact && s.note && <div className="text-[10px] text-muted tnum">{s.note}</div>}
              <div className="mt-1 h-1 w-full overflow-hidden rounded bg-border">
                <div className={cn("h-full rounded", s.key === "net" ? (s.amount > 0 ? "bg-success" : "bg-danger") : s.key === "sell" ? "bg-accent" : "bg-muted")} style={{ width: `${bar}%` }} />
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
