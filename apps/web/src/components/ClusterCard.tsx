import { useState } from "react";
import { Link } from "react-router-dom";
import { normalizeBadges, type Cluster, type ScoredListing } from "@manufactogate/core";
import { BADGE_LABELS_TR } from "@manufactogate/adapters";
import { MarketImage } from "./MarketImage";
import { COPY } from "@/lib/copy";
import { compareStore, useCompareItems } from "@/lib/compareStore";
import { getDisplayCurrency, minDisplay, minOf } from "@/lib/fx";
import { money, pct, priceRange, soldText } from "@/lib/format";
import { marketTone } from "@/lib/markets";
import { getRegistry } from "@/lib/registry";
import { Badge, Card, cn } from "./ui";

export function ConfidenceBadge({ s }: { s: ScoredListing }) {
  const tone = s.band === "same" ? "success" : s.band === "likely" ? "warning" : "neutral";
  return (
    <Badge tone={tone} title={s.match.reasons.join(" · ") || "sinyal yok"}>
      {COPY.bands[s.band]} · {pct(s.match.score)}
    </Badge>
  );
}

function bestPerMarket(members: ScoredListing[]): ScoredListing[] {
  const best = new Map<string, ScoredListing>();
  for (const m of members) {
    const cur = best.get(m.listing.market);
    const price = minOf(m.listing) ?? Infinity;
    const curPrice = cur ? (minOf(cur.listing) ?? Infinity) : Infinity;
    if (!cur || price < curPrice) best.set(m.listing.market, m);
  }
  return [...best.values()];
}

/** One "same product" cluster: representative image, best offer per market, all listings on demand. */
export function ClusterCard({ cluster }: { cluster: Cluster }) {
  const [open, setOpen] = useState(false);
  const reg = getRegistry();
  const rep = cluster.representative;
  const rows = open ? cluster.members : bestPerMarket(cluster.members);
  const disp = getDisplayCurrency();
  const selected = useCompareItems();
  const approx = rows.map((r) => minDisplay(r.listing));
  const cheapest = approx.reduce<{ i: number; v: number } | null>((acc, v, i) => (v !== null && (acc === null || v < acc.v) ? { i, v } : acc), null);

  return (
    <Card className="overflow-hidden">
      <div className="flex gap-4 p-4">
        <Link to={`/l/${rep.listing.market}/${rep.listing.id}`} className="h-28 w-28 shrink-0 overflow-hidden rounded-md border border-border bg-surface-2">
          <MarketImage src={rep.listing.images[0]} label={reg.get(rep.listing.market)?.meta.name ?? ""} className="h-full w-full object-cover" loading="lazy" />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <Link to={`/l/${rep.listing.market}/${rep.listing.id}`} className="block truncate font-medium hover:underline" title={rep.listing.title}>
                {rep.listing.title}
              </Link>
              <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[12px] text-muted">
                <ConfidenceBadge s={rep} />
                <span>
                  {cluster.members.length} ilan · {cluster.markets.length} pazar
                </span>
                {cheapest && <span>· en düşük ≈ {money(cheapest.v, disp)}</span>}
              </div>
            </div>
            <button onClick={() => setOpen((o) => !o)} className="shrink-0 text-[12px] text-accent hover:underline">
              {open ? "Pazar başına en iyi" : "Tüm ilanlar"}
            </button>
          </div>

          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead className="text-left text-[11px] uppercase tracking-wide text-muted">
                <tr>
                  <th className="py-1 font-medium">Pazar</th>
                  <th className="py-1 font-medium">Birim fiyat</th>
                  <th className="py-1 font-medium">≈ {disp}</th>
                  <th className="py-1 font-medium">MOQ</th>
                  <th className="py-1 font-medium">Sayaç</th>
                  <th className="py-1 font-medium">Tedarikçi</th>
                  <th className="py-1 font-medium">{COPY.match}</th>
                  <th className="py-1 text-right font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const a = reg.get(r.listing.market);
                  const badges = a ? normalizeBadges(a, r.listing.badges) : [];
                  const v = approx[i] ?? null;
                  const isCheapest = cheapest?.i === i;
                  const delta = cheapest && v !== null && !isCheapest ? v / cheapest.v - 1 : null;
                  const inCompare = selected.some((x) => x.market === r.listing.market && x.id === r.listing.id);
                  const sold = soldText(r.listing);
                  return (
                    <tr key={`${r.listing.market}:${r.listing.id}`} className={cn("border-t border-border", isCheapest && "bg-success/5")}>
                      <td className="py-1.5 pr-3">
                        <span className={cn("rounded px-1.5 py-0.5 text-[11px] font-medium text-white", marketTone(r.listing.market))}>{a?.meta.name ?? r.listing.market}</span>
                      </td>
                      <td className="py-1.5 pr-3 tnum">
                        <div>{priceRange(r.listing.price)}</div>
                        {r.listing.price.tiers.length > 1 && (
                          <div className="text-[11px] text-muted">{r.listing.price.tiers.map((t) => `${t.minQty}+ → ${money(t.unitPrice, r.listing.price.currency)}`).join(" · ")}</div>
                        )}
                      </td>
                      <td className="py-1.5 pr-3 tnum">
                        {v !== null ? (
                          <span className="flex items-center gap-1.5">
                            {money(v, disp)}
                            {isCheapest && <Badge tone="success">en düşük</Badge>}
                            {delta !== null && <span className="text-[11px] text-muted">+{Math.round(delta * 100)}%</span>}
                          </span>
                        ) : (
                          <span className="text-muted" title={minOf(r.listing) === null ? "teklif iste" : COPY.noRate(r.listing.price.currency)}>—</span>
                        )}
                      </td>
                      <td className="py-1.5 pr-3 tnum">{r.listing.moq ?? "—"}</td>
                      <td className="py-1.5 pr-3 tnum">{sold || "—"}</td>
                      <td className="max-w-[220px] py-1.5 pr-3">
                        <div className="truncate" title={r.listing.supplierName}>
                          {r.listing.supplierName ?? (r.listing.supplierId ? `Mağaza #${r.listing.supplierId}` : "—")}
                        </div>
                        {badges.length > 0 && (
                          <div className="mt-0.5 flex flex-wrap gap-1">
                            {badges.map((b) => (
                              <Badge key={b} tone={b === "verified-factory" ? "success" : "neutral"} title={r.listing.badges.join(" · ")}>
                                {BADGE_LABELS_TR[b]}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="py-1.5 pr-3">
                        <span className={cn("tnum", r.band === "same" ? "text-success" : r.band === "likely" ? "text-warning" : "text-muted")} title={r.match.reasons.join(" · ")}>
                          {pct(r.match.score)}
                        </span>
                      </td>
                      <td className="whitespace-nowrap py-1.5 text-right">
                        <button
                          onClick={() => {
                            if (!compareStore.toggle(r.listing)) compareStore.setOpen(true);
                          }}
                          aria-pressed={inCompare}
                          className={cn("mr-2 text-[12px] hover:underline", inCompare ? "text-accent" : "text-muted")}
                          title="Yan yana karşılaştır"
                        >
                          {inCompare ? "✓" : "+"}
                        </button>
                        <Link to={`/l/${r.listing.market}/${r.listing.id}`} className="mr-2 text-accent hover:underline">
                          İncele
                        </Link>
                        <a href={r.listing.url} target="_blank" rel="noreferrer noopener" className="text-accent hover:underline">
                          Aç ↗
                        </a>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Card>
  );
}
