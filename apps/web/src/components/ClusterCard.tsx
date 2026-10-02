import { useState } from "react";
import { normalizeBadges, type Cluster, type ScoredListing } from "@manufactogate/core";
import { BADGE_LABELS_TR } from "@manufactogate/adapters";
import { getRegistry } from "@/lib/registry";
import { money, pct, priceRange } from "@/lib/format";
import { Badge, Card, cn } from "./ui";

function ConfidenceBadge({ s }: { s: ScoredListing }) {
  const tone = s.band === "same" ? "success" : s.band === "likely" ? "warning" : "neutral";
  const label = s.band === "same" ? "Aynı ürün" : s.band === "likely" ? "Büyük olasılıkla aynı" : "Benzer olabilir";
  return (
    <Badge tone={tone} title={s.match.reasons.join(" · ") || "sinyal yok"}>
      {label} · {pct(s.match.score)}
    </Badge>
  );
}

function bestPerMarket(members: ScoredListing[]): ScoredListing[] {
  const best = new Map<string, ScoredListing>();
  for (const m of members) {
    const cur = best.get(m.listing.market);
    const price = Math.min(...m.listing.price.tiers.map((t) => t.unitPrice));
    const curPrice = cur ? Math.min(...cur.listing.price.tiers.map((t) => t.unitPrice)) : Infinity;
    if (!cur || price < curPrice) best.set(m.listing.market, m);
  }
  return [...best.values()];
}

export function ClusterCard({ cluster }: { cluster: Cluster }) {
  const [open, setOpen] = useState(false);
  const reg = getRegistry();
  const rep = cluster.representative;
  const rows = open ? cluster.members : bestPerMarket(cluster.members);

  return (
    <Card className="overflow-hidden">
      <div className="flex gap-4 p-4">
        <div className="h-28 w-28 shrink-0 overflow-hidden rounded-md border border-border bg-surface-2">
          {rep.listing.images[0] && <img src={rep.listing.images[0]} alt="" className="h-full w-full object-cover" loading="lazy" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="truncate font-medium" title={rep.listing.title}>
                {rep.listing.title}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[12px] text-muted">
                <ConfidenceBadge s={rep} />
                <span>
                  {cluster.members.length} ilan · {cluster.markets.length} pazar
                </span>
              </div>
            </div>
            <button onClick={() => setOpen((o) => !o)} className="shrink-0 text-[12px] text-accent hover:underline">
              {open ? "Pazar başına en iyi" : "Tüm ilanlar"}
            </button>
          </div>

          <table className="mt-3 w-full text-[13px]">
            <thead className="text-left text-[11px] uppercase tracking-wide text-muted">
              <tr>
                <th className="py-1 font-medium">Pazar</th>
                <th className="py-1 font-medium">Birim fiyat</th>
                <th className="py-1 font-medium">MOQ</th>
                <th className="py-1 font-medium">Satış</th>
                <th className="py-1 font-medium">Tedarikçi</th>
                <th className="py-1 font-medium">Güven</th>
                <th className="py-1 text-right font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const a = reg.get(r.listing.market);
                const badges = a ? normalizeBadges(a, r.listing.badges) : [];
                return (
                  <tr key={`${r.listing.market}:${r.listing.id}`} className="border-t border-border">
                    <td className="py-1.5 pr-3 font-medium">{a?.meta.name ?? r.listing.market}</td>
                    <td className="py-1.5 pr-3 tnum">{priceRange(r.listing.price)}</td>
                    <td className="py-1.5 pr-3 tnum">{r.listing.moq ?? "—"}</td>
                    <td className="py-1.5 pr-3 tnum">{r.listing.sold?.toLocaleString("tr-TR") ?? "—"}</td>
                    <td className="max-w-[220px] py-1.5 pr-3">
                      <div className="truncate" title={r.listing.supplierName}>
                        {r.listing.supplierName ?? "—"}
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
                    <td className="py-1.5 text-right">
                      <a href={r.listing.url} target="_blank" rel="noreferrer noopener" className="text-accent hover:underline">
                        Aç ↗
                      </a>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {open && rep.listing.price.tiers.length > 1 && (
            <div className="mt-2 text-[12px] text-muted">
              Fiyat merdiveni ({reg.get(rep.listing.market)?.meta.name}):{" "}
              {rep.listing.price.tiers.map((t) => `${t.minQty}+ → ${money(t.unitPrice, rep.listing.price.currency)}`).join(" · ")}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
