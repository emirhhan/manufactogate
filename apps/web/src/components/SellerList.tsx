import { useState } from "react";
import { Link } from "react-router-dom";
import { BADGE_LABELS_TR } from "@manufactogate/adapters";
import type { SellerRow } from "@/lib/analysis";
import { download, sellersToCsv } from "@/lib/export";
import { money } from "@/lib/format";
import { getDisplayCurrency, toDisplay } from "@/lib/fx";
import { marketTone } from "@/lib/markets";
import { Badge, Button, cn } from "./ui";

/** "Satan var mı": who sells it in the target market, at what price, with how many reviews, and a store link. */
export function SellerList({ rows, title = "Satan var mı · hedef pazar satıcıları", query, compact = false }: { rows: SellerRow[]; title?: string; query?: string | undefined; compact?: boolean }) {
  const [all, setAll] = useState(false);
  const disp = getDisplayCurrency();
  if (!rows.length) return null;
  const shown = all || rows.length <= 8 ? rows : rows.slice(0, 8);
  return (
    <div className={cn(compact ? "" : "rounded-lg border border-border bg-surface")}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2">
        <div className="text-[11px] font-medium uppercase tracking-wide text-muted">
          {title} · {rows.length}
        </div>
        <Button size="sm" variant="ghost" onClick={() => download(`manufactogate-saticilar-${Date.now()}.csv`, sellersToCsv(rows, query ? { query } : undefined))}>
          CSV
        </Button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead className="text-left text-[11px] uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-1.5 font-medium">Satıcı</th>
              <th className="py-1.5 font-medium">Pazar</th>
              <th className="py-1.5 font-medium">En düşük</th>
              <th className="py-1.5 font-medium">≈ {disp}</th>
              <th className="py-1.5 font-medium">İlan</th>
              <th className="py-1.5 font-medium">Değerlendirme</th>
              <th className="py-1.5 font-medium">Puan</th>
              <th className="py-1.5 pr-4 text-right font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => {
              const d = r.minPrice !== null ? toDisplay(r.minPrice, r.currency) : null;
              return (
                <tr key={r.key} className="border-t border-border">
                  <td className="max-w-[260px] px-4 py-1.5">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate font-medium" title={r.name}>{r.name}</span>
                      {r.badges.slice(0, 1).map((b) => (
                        <Badge key={b} tone={b === "verified-factory" || b === "official-store" ? "success" : "neutral"}>{BADGE_LABELS_TR[b]}</Badge>
                      ))}
                    </div>
                  </td>
                  <td className="py-1.5">
                    <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-medium text-white", marketTone(r.market))}>{r.marketName}</span>
                  </td>
                  <td className="py-1.5 tnum">{r.minPrice !== null ? money(r.minPrice, r.currency) : "teklif"}</td>
                  <td className="py-1.5 tnum text-muted">{d !== null && r.currency !== disp ? money(d, disp) : d !== null ? "" : "—"}</td>
                  <td className="py-1.5 tnum">{r.listings}</td>
                  <td className="py-1.5 tnum">{r.reviews !== null ? r.reviews.toLocaleString("tr-TR") : "—"}</td>
                  <td className="py-1.5 tnum">{r.rating !== null ? r.rating.toFixed(1) : "—"}</td>
                  <td className="whitespace-nowrap py-1.5 pr-4 text-right">
                    <Link to={`/l/${r.cheapest.market}/${r.cheapest.id}`} className="mr-2 text-accent hover:underline">İlan</Link>
                    {r.url && (
                      <a href={r.url} target="_blank" rel="noreferrer noopener" className="text-accent hover:underline">Mağaza ↗</a>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {rows.length > 8 && (
        <div className="border-t border-border px-4 py-1.5 text-[12px]">
          <button onClick={() => setAll((v) => !v)} className="text-accent hover:underline">{all ? "Daha az göster" : `Tümünü göster (${rows.length})`}</button>
        </div>
      )}
    </div>
  );
}
