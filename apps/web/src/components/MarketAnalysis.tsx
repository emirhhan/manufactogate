import type { MarketAnalysis as Analysis } from "@/lib/analysis";
import { money } from "@/lib/format";
import { Card, cn } from "./ui";

/** "Pazarda satılır mı?" card: cheapest supply, local competition, margin and a 0..100 score. */
export function MarketAnalysisCard({ a, title }: { a: Analysis; title: string }) {
  const tone = a.score >= 65 ? "text-success" : a.score >= 40 ? "text-warning" : "text-danger";
  const ring = a.score >= 65 ? "stroke-success" : a.score >= 40 ? "stroke-warning" : "stroke-danger";
  const r = 26;
  const c = 2 * Math.PI * r;
  return (
    <Card className="overflow-hidden">
      <div className="grid gap-4 p-4 md:grid-cols-[auto_1fr_1fr_1fr]">
        <div className="flex items-center gap-3">
          <svg width="72" height="72" viewBox="0 0 72 72" className="shrink-0">
            <circle cx="36" cy="36" r={r} fill="none" className="stroke-border" strokeWidth="6" />
            <circle cx="36" cy="36" r={r} fill="none" className={ring} strokeWidth="6" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - a.score / 100)} transform="rotate(-90 36 36)" />
            <text x="36" y="40" textAnchor="middle" className={cn("fill-current text-[16px] font-semibold tnum", tone)}>{a.score}</text>
          </svg>
          <div>
            <div className="text-[11px] font-medium uppercase tracking-wide text-muted">Satılabilirlik</div>
            <div className="text-[13px] font-medium">{title}</div>
            <div className="text-[11px] text-muted">marj · talep · bulunabilirlik · rekabet</div>
          </div>
        </div>
        <Stat label={a.source.label} big={a.source.min !== null ? money(a.source.min, a.source.currency) : "—"} sub={`${a.source.count} ilan · ${a.source.markets.slice(0, 3).join(", ")}${a.source.markets.length > 3 ? "…" : ""}`} />
        <Stat label={a.target.label} big={a.target.median !== null ? money(a.target.median, a.target.currency) : "—"} sub={a.target.count ? `${a.target.count} ilan · ${a.target.sellers} satıcı · medyan` : "ilan yok"} />
        <Stat
          label="Tahmini net marj"
          big={a.marginAtMedian ? `${(a.marginAtMedian.rate * 100).toFixed(0)}%` : "—"}
          sub={a.landedPerUnit !== null ? `indirilmiş maliyet ${money(a.landedPerUnit, a.target.currency)}/adet` : "tedarik fiyatı yok"}
          tone={a.marginAtMedian ? (a.marginAtMedian.rate > 0.25 ? "text-success" : a.marginAtMedian.rate > 0 ? "text-warning" : "text-danger") : ""}
        />
      </div>
      <ul className="flex flex-wrap gap-1.5 border-t border-border px-4 py-2.5">
        {a.verdicts.map((v, i) => (
          <li key={i} className={cn("rounded-full border px-2.5 py-0.5 text-[12px]", v.tone === "success" ? "border-success/40 bg-success/10 text-success" : v.tone === "warning" ? "border-warning/40 bg-warning/10 text-warning" : v.tone === "danger" ? "border-danger/40 bg-danger/10 text-danger" : "border-border bg-surface-2 text-muted")}>
            {v.text}
          </li>
        ))}
      </ul>
    </Card>
  );
}

function Stat({ label, big, sub, tone = "" }: { label: string; big: string; sub: string; tone?: string }) {
  return (
    <div>
      <div className="text-[11px] font-medium uppercase tracking-wide text-muted">{label}</div>
      <div className={cn("text-xl font-semibold tnum", tone)}>{big}</div>
      <div className="text-[11px] text-muted">{sub}</div>
    </div>
  );
}
