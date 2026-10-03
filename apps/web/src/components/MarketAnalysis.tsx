import type { ReactNode } from "react";
import type { MarketAnalysis as Analysis } from "@/lib/analysis";
import { COPY } from "@/lib/copy";
import { money } from "@/lib/format";
import { PriceChain } from "./PriceChain";
import { Card, cn } from "./ui";

/** "Pazarda satılır mı?" card: cheapest supply, local competition, margin, a 0..100 score with its parts. */
export function MarketAnalysisCard({ a, title, children }: { a: Analysis; title: string; children?: ReactNode }) {
  const tone = a.score >= 55 ? "text-success" : a.score >= 35 ? "text-warning" : "text-danger";
  const ring = a.score >= 55 ? "stroke-success" : a.score >= 35 ? "stroke-warning" : "stroke-danger";
  const r = 26;
  const c = 2 * Math.PI * r;
  const sellerTxt = a.target.count
    ? a.target.sellersUnknownListings > 0
      ? `≥${a.target.sellers} satıcı (${a.target.sellersUnknownListings} ilanda okunamadı)`
      : `${a.target.sellers} satıcı`
    : "";
  const parts: { key: keyof Analysis["sub"]; label: string; max: number }[] = [
    { key: "margin", label: "Marj", max: 50 },
    { key: "demand", label: "Talep", max: 25 },
    { key: "availability", label: "Bulunabilirlik", max: 15 },
    { key: "competition", label: "Rekabet", max: 10 },
  ];
  return (
    <Card className="overflow-hidden">
      <div className="grid gap-4 p-4 md:grid-cols-[auto_1fr_1fr_1fr]">
        <div className="flex items-center gap-3">
          <svg width="72" height="72" viewBox="0 0 72 72" className="shrink-0" role="img" aria-label={`Satılabilirlik ${a.score}/100`}>
            <circle cx="36" cy="36" r={r} fill="none" className="stroke-border" strokeWidth="6" />
            <circle cx="36" cy="36" r={r} fill="none" className={ring} strokeWidth="6" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - a.score / 100)} transform="rotate(-90 36 36)" />
            <text x="36" y="40" textAnchor="middle" className={cn("fill-current text-[16px] font-semibold tnum", tone)}>
              {a.score}
            </text>
          </svg>
          <div className="min-w-0">
            <div className="text-[11px] font-medium uppercase tracking-wide text-muted">{COPY.sellability.title}</div>
            <div className="truncate text-[13px] font-medium" title={title}>
              {title}
            </div>
            <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-[11px] text-muted tnum">
              {parts.map((p) => (
                <span key={p.key} title={`${p.label}: ${a.sub[p.key]} / ${p.max}`}>
                  {p.label} <span className="text-text">{Math.round(a.sub[p.key])}</span>/{p.max}
                </span>
              ))}
            </div>
          </div>
        </div>
        <Stat label={a.source.label} big={a.source.min !== null ? money(a.source.min, a.source.currency) : "—"} sub={`${a.source.count} ilan · ${a.source.markets.slice(0, 3).join(", ")}${a.source.markets.length > 3 ? "…" : ""}`} />
        <Stat label={a.target.label} big={a.target.median !== null ? money(a.target.median, a.target.currency) : "—"} sub={a.target.count ? `${a.target.count} ilan · ${sellerTxt} · medyan` : "ilan yok"} />
        <Stat
          label="Tahmini net marj"
          big={a.marginAtMedian ? `%${(a.marginAtMedian.rate * 100).toFixed(0)}` : "—"}
          sub={a.landedPerUnit !== null ? `indirilmiş maliyet ${money(a.landedPerUnit, a.target.currency)}/adet${a.landedQty ? ` · ${a.landedQty} adet` : ""}` : "tedarik fiyatı yok"}
          tone={a.marginAtMedian ? (a.marginAtMedian.rate > 0.25 ? "text-success" : a.marginAtMedian.rate > 0 ? "text-warning" : "text-danger") : ""}
        />
      </div>
      {a.chain && (
        <div className="border-t border-border px-4 py-3">
          <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted">Fiyat zinciri</div>
          <PriceChain steps={a.chain} compact />
        </div>
      )}
      <ul className="flex flex-wrap gap-1.5 border-t border-border px-4 py-2.5">
        {a.verdicts.map((v, i) => (
          <li key={i} className={cn("rounded-full border px-2.5 py-0.5 text-[12px]", v.tone === "success" ? "border-success/40 bg-success/10 text-success" : v.tone === "warning" ? "border-warning/40 bg-warning/10 text-warning" : v.tone === "danger" ? "border-danger/40 bg-danger/10 text-danger" : "border-border bg-surface-2 text-muted")}>
            {v.text}
          </li>
        ))}
        {a.basedOn.filtered && (
          <li className="rounded-full border border-border bg-surface-2 px-2.5 py-0.5 text-[12px] text-muted" title="Başlık benzerliği %50'nin altındaki ilanlar hesaba katılmadı">
            {a.basedOn.used}/{a.basedOn.total} ilan temel alındı
          </li>
        )}
      </ul>
      {children}
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
