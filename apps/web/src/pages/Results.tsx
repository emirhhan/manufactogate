import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { MarketId } from "@manufactogate/core";
import { ClusterCard } from "@/components/ClusterCard";
import { MarketStrip } from "@/components/MarketStrip";
import { Button, Card, Empty, cn } from "@/components/ui";
import { getRegistry } from "@/lib/registry";
import { priceRange } from "@/lib/format";
import { useSearch } from "@/store/search";

export function Results() {
  const { id } = useParams();
  const s = useSearch();
  const [band, setBand] = useState<"all" | "same">("all");
  const [marketFilter, setMarketFilter] = useState<MarketId | "all">("all");

  const currentId = s.current?.id;
  const load = s.load;
  useEffect(() => {
    if (id && currentId !== id) void load(id);
  }, [id, currentId, load]);

  const clusters = useMemo(
    () =>
      s.clusters.filter((c) => (band === "all" || c.band === "same") && (marketFilter === "all" || c.markets.includes(marketFilter))),
    [s.clusters, band, marketFilter],
  );
  const total = Object.values(s.listings).reduce((n, l) => n + l.length, 0);
  const anyError = Object.values(s.markets).some((m) => m.state === "error");
  const allDone = !s.running && Object.values(s.markets).every((m) => m.state === "done" || m.state === "error");
  const reg = getRegistry();

  if (!s.current) return <div className="mx-auto max-w-[1440px] px-4 py-10 text-muted">Arama yükleniyor…</div>;

  return (
    <div className="mx-auto max-w-[1440px] px-4 py-6">
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-3">
          {s.current.thumb && <img src={s.current.thumb} alt="" className="h-10 w-10 rounded border border-border object-cover" />}
          <div>
            <div className="text-[12px] text-muted">
              {s.current.input.kind === "image" ? "Görsel araması" : s.current.input.kind === "link" ? "Link araması" : "Metin araması"}
            </div>
            <div className="max-w-[520px] truncate font-medium">
              {s.current.input.kind === "image" ? (s.current.input.title ?? "—") : s.current.input.kind === "link" ? s.current.input.url : s.current.input.query}
            </div>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {s.running ? (
            <Button onClick={s.cancel}>Durdur</Button>
          ) : (
            <Link to="/">
              <Button>Yeni arama</Button>
            </Link>
          )}
        </div>
      </div>

      <div className="mt-4">
        <MarketStrip markets={s.markets} onRetry={(m) => void s.retryMarket(m)} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[260px_1fr]">
        <aside className="space-y-5 text-[13px]">
          <div>
            <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted">Güven</div>
            <div className="flex gap-1">
              {(["all", "same"] as const).map((b) => (
                <button
                  key={b}
                  onClick={() => setBand(b)}
                  className={cn("rounded-md border px-2 py-1", band === b ? "border-accent bg-accent/10 text-accent" : "border-border hover:bg-surface-2")}
                >
                  {b === "all" ? "Tümü" : "Sadece aynı ürün"}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted">Pazar</div>
            <div className="flex flex-col gap-1">
              <button onClick={() => setMarketFilter("all")} className={cn("rounded-md px-2 py-1 text-left", marketFilter === "all" ? "bg-surface-2" : "hover:bg-surface-2")}>
                Tüm pazarlar <span className="text-muted tnum">({total})</span>
              </button>
              {Object.entries(s.listings).map(([m, ls]) => (
                <button
                  key={m}
                  onClick={() => setMarketFilter(m as MarketId)}
                  className={cn("rounded-md px-2 py-1 text-left", marketFilter === m ? "bg-surface-2" : "hover:bg-surface-2")}
                >
                  {reg.get(m as MarketId)?.meta.name ?? m} <span className="text-muted tnum">({ls.length})</span>
                </button>
              ))}
            </div>
          </div>
          <div className="text-[12px] text-muted">
            {s.durationMs !== undefined && <div className="tnum">Süre {(s.durationMs / 1000).toFixed(1)} sn</div>}
            <div className="tnum">{s.clusters.length} küme · {s.similar.length} benzer</div>
          </div>
        </aside>

        <main className="space-y-3">
          {clusters.length === 0 && allDone && (
            <Empty
              title={anyError ? "Bazı pazarlar yanıt vermedi" : "Güvenilir eşleşme bulunamadı"}
              hint={
                anyError
                  ? "Hatalı pazarları yeniden dene veya diğer pazarlarla devam et."
                  : "Daha net bir görsel, ürün adı veya model numarası ekleyerek yeniden dene. Benzer ürünler aşağıda listelenir."
              }
            />
          )}
          {clusters.length === 0 && !allDone && (
            <div className="space-y-3">
              {[0, 1, 2].map((i) => (
                <Card key={i} className="h-40 animate-pulse bg-surface-2" />
              ))}
            </div>
          )}
          {clusters.map((c) => (
            <ClusterCard key={c.id} cluster={c} />
          ))}

          {s.similar.length > 0 && (
            <section className="pt-4">
              <h2 className="mb-2 text-[12px] font-medium uppercase tracking-wide text-muted">Benzer olabilir ({s.similar.length})</h2>
              <Card className="divide-y divide-border">
                {s.similar.map((r) => (
                  <div key={`${r.listing.market}:${r.listing.id}`} className="flex items-center gap-3 px-3 py-2 text-[13px]">
                    <div className="h-8 w-8 shrink-0 overflow-hidden rounded border border-border bg-surface-2">
                      {r.listing.images[0] && <img src={r.listing.images[0]} alt="" className="h-full w-full object-cover" loading="lazy" />}
                    </div>
                    <div className="w-20 shrink-0 text-muted">{reg.get(r.listing.market)?.meta.name}</div>
                    <div className="min-w-0 flex-1 truncate" title={r.listing.title}>
                      {r.listing.title}
                    </div>
                    <div className="tnum">{priceRange(r.listing.price)}</div>
                    <div className="w-12 text-right text-muted tnum">%{Math.round(r.match.score * 100)}</div>
                    <a href={r.listing.url} target="_blank" rel="noreferrer noopener" className="text-accent hover:underline">
                      Aç ↗
                    </a>
                  </div>
                ))}
              </Card>
            </section>
          )}
        </main>
      </div>
    </div>
  );
}
