import { useState } from "react";
import { Link } from "react-router-dom";
import type { MarketAdapter, MarketId, RawListing } from "@manufactogate/core";
import { queryLadder } from "@manufactogate/adapters";
import { MarketPanel } from "@/components/MarketPanel";
import { ResultCard } from "@/components/ResultCard";
import { SellerList } from "@/components/SellerList";
import { TableSkeleton } from "@/components/Skeletons";
import { cn } from "@/components/ui";
import type { SellerRow } from "@/lib/analysis";
import { COPY, relBand } from "@/lib/copy";
import { money } from "@/lib/format";
import { getDisplayCurrency, minDisplay, minOf } from "@/lib/fx";
import { priceText } from "@/lib/listingFields";
import { describeError } from "@/lib/marketErrors";
import { isBeta } from "@/lib/markets";
import type { getRegistry } from "@/lib/registry";
import { relevanceDetail } from "@/lib/relevance";
import type { useSearch } from "@/store/search";

type SearchState = ReturnType<typeof useSearch.getState>;

export interface MarketRow {
  market: MarketId;
  count: number;
  strongCount: number;
  best: RawListing | undefined;
  bestScore: number | undefined;
  top: RawListing[];
  weak: RawListing[];
  status: SearchState["markets"][string] | undefined;
  note: string | undefined;
}

export interface CompareSectionProps {
  reg: ReturnType<typeof getRegistry>;
  listing: RawListing;
  adapter: MarketAdapter | undefined;
  search: SearchState;
  compareId: string;
  compareMarkets: MarketId[];
  rows: MarketRow[];
  rowsSorted: MarketRow[];
  sellers: SellerRow[];
  confidence: Map<string, number>;
  scoreOf: (l: RawListing) => number;
  onSkipProblem: (ids: MarketId[]) => Promise<void>;
}

/** "Diğer pazarlarda": live market panel, the per-market query ladder, the best-match table, target sellers and result cards. */
export function CompareSection({ reg, listing, adapter, search: s, compareId, compareMarkets, rows, rowsSorted, sellers, confidence, scoreOf, onSkipProblem }: CompareSectionProps) {
  const [showFiltered, setShowFiltered] = useState<Record<string, boolean>>({});
  const disp = getDisplayCurrency();
  const min = minOf(listing);
  const approx = listing.price.currency === disp ? null : minDisplay(listing);
  return (
    <section className="mt-8">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-semibold tracking-tight">Diğer pazarlarda</h2>
        <Link to={`/search/${compareId}`} className="text-[13px] text-accent hover:underline">
          Tüm sonuçları gör →
        </Link>
      </div>
      <div className="mt-3">
        <MarketPanel markets={s.markets} notes={s.notes} listings={s.listings} query={listing.title} onRetry={(m) => void s.retryMarket(m)} running={s.running} onSkipProblem={onSkipProblem} retrying={s.retrying} trace={s.trace} input={s.effective ?? s.input} />
      </div>
      <details className="mt-2 text-[12px] text-muted">
        <summary className="cursor-pointer select-none">Ne arandı? Pazar başına sorgu merdiveni</summary>
        <ul className="mt-1 grid gap-x-6 gap-y-0.5 sm:grid-cols-2 lg:grid-cols-3">
          {compareMarkets.map((m) => {
            const a = reg.get(m);
            if (!a) return null;
            const ladder = queryLadder(listing.title, a.meta.language);
            return (
              <li key={m} className="truncate" title={ladder.join(" → ")}>
                <span className="text-text">{a.meta.name}</span>: {ladder.join(" → ") || listing.title}
              </li>
            );
          })}
        </ul>
      </details>

      {rows.length === 0 ? (
        <div className="mt-4"><TableSkeleton rows={4} cols={6} /></div>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-lg border border-border bg-surface">
          <table className="w-full text-[13px]">
            <thead className="text-left text-[11px] uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-2 font-medium">Pazar</th>
                <th className="py-2 font-medium">Durum</th>
                <th className="py-2 font-medium">En düşük fiyat</th>
                <th className="py-2 font-medium">≈ {disp}</th>
                <th className="py-2 font-medium">Yakın / toplam</th>
                <th className="py-2 font-medium">En ucuz yakın ilan</th>
                <th className="py-2 pr-4 text-right font-medium">{COPY.match}</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t-2 border-accent bg-accent/15 text-accent">
                <td className="px-4 py-2 font-semibold">{adapter?.meta.name} · bu ilan</td>
                <td className="py-2 text-[12px]">kaynak</td>
                <td className="py-2 tnum">{min === null ? priceText(listing) : money(min, listing.price.currency)}</td>
                <td className="py-2 tnum">{approx !== null ? money(approx, disp) : min !== null && listing.price.currency === disp ? money(min, disp) : "—"}</td>
                <td className="py-2">—</td>
                <td className="max-w-[420px] truncate py-2" title={listing.title}>{listing.title}</td>
                <td className="py-2 pr-4 text-right">—</td>
              </tr>
              {rowsSorted.map((o) => {
                const a = reg.get(o.market);
                const st = o.status;
                const err = st?.state === "error" ? describeError(st.type, st.message, o.market, listing.title) : null;
                const bestMin = o.best ? minOf(o.best) : null;
                const bestDisp = o.best ? minDisplay(o.best) : null;
                const band = relBand(o.bestScore);
                return (
                  <tr key={o.market} className={cn("border-t border-border", !o.best && "text-muted")}>
                    <td className="px-4 py-2 font-medium">
                      <span className={cn("mr-1.5 inline-block h-2 w-2 rounded-full align-middle", !st ? "bg-border" : st.state === "done" ? (o.count ? "bg-success" : "bg-warning") : st.state === "error" ? "bg-danger" : "bg-accent animate-pulse")} />
                      <span className="text-text">{a?.meta.name ?? o.market}</span>
                      {isBeta(a) && <span className="ml-1 text-[10px] text-muted">beta</span>}
                    </td>
                    <td className="py-2 text-[12px]" title={err ? `${err.hint}\n${st?.state === "error" ? st.message : ""}` : o.note}>
                      {!st || st.state === "pending" ? "sırada" : st.state === "running" ? `aranıyor · ${st.received}` : st.state === "done" ? (o.count ? `${o.count} sonuç` : "0 sonuç") : <span className="text-danger">{err?.title}</span>}
                      {o.note && <span className="ml-1 text-warning" title={o.note}>ⓘ</span>}
                      {err?.action && (
                        <a href={err.action.href} target="_blank" rel="noreferrer noopener" className="ml-1 text-accent hover:underline">{err.action.label} ↗</a>
                      )}
                      {st?.state === "error" && (
                        <button onClick={() => void s.retryMarket(o.market)} className="ml-1 text-accent hover:underline">yeniden</button>
                      )}
                    </td>
                    <td className="py-2 tnum">{o.best && bestMin !== null ? money(bestMin, o.best.price.currency) : o.best ? "teklif" : "—"}</td>
                    <td className="py-2 tnum">{bestDisp !== null ? money(bestDisp, disp) : o.best ? <span title={COPY.noRate(o.best.price.currency)}>—</span> : "—"}</td>
                    <td className="py-2 tnum" title="başlık benzerliği ≥ %50 olan / toplam">{o.count ? `${o.strongCount} / ${o.count}` : "—"}</td>
                    <td className="max-w-[420px] truncate py-2" title={o.best?.title}>
                      {o.best ? (
                        <Link to={`/l/${o.best.market}/${o.best.id}`} className="text-accent hover:underline">{o.best.title}</Link>
                      ) : o.count ? (
                        <span className="text-[12px]">yakın eşleşme yok ({o.count} ilan benzer değil)</span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="py-2 pr-4 text-right tnum">
                      {o.bestScore !== undefined ? (
                        <span className={cn(band === "exact" ? "text-success" : band === "close" ? "text-accent" : "")} title={o.best ? relevanceDetail(listing.title, o.best.title).reasons.join(" · ") : undefined}>
                          %{Math.round(o.bestScore * 100)} · {COPY.relBands[band]}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {sellers.length > 0 && (
        <div className="mt-4">
          <SellerList rows={sellers} query={listing.title} />
        </div>
      )}

      {rows.some((o) => o.top.length) && (
        <div className="mt-4 space-y-5">
          {rowsSorted.filter((o) => o.top.length).map((o) => (
            <details key={o.market} open={!isBeta(reg.get(o.market)) || o.strongCount > 0} className="group">
              <summary className="mb-2 flex cursor-pointer list-none items-center gap-3">
                <div className="text-[12px] font-medium uppercase tracking-wide text-muted">
                  <span className="mr-1 inline-block transition-transform group-open:rotate-90">▸</span>
                  {reg.get(o.market)?.meta.name} · {o.strongCount ? `en yakın ${o.top.length}` : `yakın eşleşme yok · ilk ${o.top.length}`}
                </div>
                {o.weak.length > 0 && (
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      setShowFiltered((v) => ({ ...v, [o.market]: !v[o.market] }));
                    }}
                    className="text-[12px] text-accent hover:underline"
                  >
                    {showFiltered[o.market] ? "Filtrelenenleri gizle" : `Filtrelenenleri göster (${o.weak.length})`}
                  </button>
                )}
              </summary>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-6">
                {o.top.map((l) => (
                  <ResultCard key={`${l.market}:${l.id}`} listing={l} confidence={confidence.get(`${l.market}:${l.id}`)} relevance={scoreOf(l)} reason={relevanceDetail(listing.title, l.title).reasons.join(" · ")} />
                ))}
              </div>
              {showFiltered[o.market] && (
                <div className="mt-2 grid grid-cols-2 gap-3 opacity-80 sm:grid-cols-4 xl:grid-cols-6">
                  {o.weak.map((l) => (
                    <ResultCard key={`${l.market}:${l.id}`} listing={l} confidence={confidence.get(`${l.market}:${l.id}`)} relevance={scoreOf(l)} reason={relevanceDetail(listing.title, l.title).reasons.join(" · ")} />
                  ))}
                </div>
              )}
            </details>
          ))}
        </div>
      )}
    </section>
  );
}
