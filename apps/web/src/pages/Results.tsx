import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { MarketId, RawListing } from "@manufactogate/core";
import { ClusterCard } from "@/components/ClusterCard";
import { MarketStrip } from "@/components/MarketStrip";
import { ResultCard } from "@/components/ResultCard";
import { Button, Card, Empty, cn } from "@/components/ui";
import { toTry } from "@/lib/fx";
import { getRegistry } from "@/lib/registry";
import { useSearch } from "@/store/search";

type Sort = "relevance" | "price-asc" | "price-desc" | "sold";
const SORTS: { key: Sort; label: string }[] = [
  { key: "relevance", label: "Pazar sırası" },
  { key: "price-asc", label: "Fiyat artan" },
  { key: "price-desc", label: "Fiyat azalan" },
  { key: "sold", label: "En çok satan" },
];

function minTry(l: RawListing): number {
  const min = Math.min(...l.price.tiers.map((t) => t.unitPrice));
  return toTry(min, l.price.currency) ?? min;
}

export function Results() {
  const { id } = useParams();
  const s = useSearch();
  const [sort, setSort] = useState<Sort>("relevance");
  const [markets, setMarkets] = useState<Set<MarketId>>(new Set());
  const [showClusters, setShowClusters] = useState(true);

  const currentId = s.current?.id;
  const load = s.load;
  useEffect(() => {
    if (id && currentId !== id) void load(id);
  }, [id, currentId, load]);

  const reg = getRegistry();
  const all = useMemo(() => {
    const out: RawListing[] = [];
    const ids = Object.keys(s.listings);
    // Interleave markets so "pazar sırası" shows every market from the first row.
    const max = Math.max(0, ...ids.map((m) => s.listings[m]!.length));
    for (let i = 0; i < max; i++) for (const m of ids) if (s.listings[m]![i]) out.push(s.listings[m]![i]!);
    return out;
  }, [s.listings]);

  const confidence = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of s.clusters) for (const m of c.members) map.set(`${m.listing.market}:${m.listing.id}`, m.match.score);
    return map;
  }, [s.clusters]);

  const visible = useMemo(() => {
    let v = markets.size ? all.filter((l) => markets.has(l.market)) : all;
    if (sort === "price-asc") v = [...v].sort((a, b) => minTry(a) - minTry(b));
    else if (sort === "price-desc") v = [...v].sort((a, b) => minTry(b) - minTry(a));
    else if (sort === "sold") v = [...v].sort((a, b) => (b.sold ?? 0) - (a.sold ?? 0));
    return v;
  }, [all, markets, sort]);

  const total = all.length;
  const allDone = !s.running && Object.values(s.markets).every((m) => m.state === "done" || m.state === "error");
  const toggleMarket = (m: MarketId) =>
    setMarkets((prev) => {
      const next = new Set(prev);
      if (next.has(m)) next.delete(m);
      else next.add(m);
      return next;
    });

  if (!s.current) return <div className="mx-auto max-w-[1440px] px-4 py-10 text-muted">Arama yükleniyor…</div>;
  const input = s.current.input;

  return (
    <div className="mx-auto max-w-[1440px] px-4 py-5">
      <div className="flex flex-wrap items-center gap-3">
        {s.current.thumb && <img src={s.current.thumb} alt="" className="h-12 w-12 rounded border border-border object-cover" />}
        <div className="min-w-0">
          <h1 className="truncate text-lg font-semibold tracking-tight">
            {input.kind === "image" ? (input.title ?? "Görsel araması") : input.kind === "link" ? input.url : input.query}
          </h1>
          <div className="text-[12px] text-muted tnum">
            {total} sonuç · {Object.keys(s.listings).length} pazar
            {s.durationMs !== undefined ? ` · ${(s.durationMs / 1000).toFixed(1)} sn` : s.running ? " · aranıyor…" : ""}
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

      <div className="mt-3">
        <MarketStrip markets={s.markets} onRetry={(m) => void s.retryMarket(m)} />
      </div>

      {s.clusters.length > 0 && (
        <section className="mt-5">
          <div className="mb-2 flex items-center gap-3">
            <h2 className="text-[12px] font-medium uppercase tracking-wide text-muted">Pazarlar arası eşleşmeler ({s.clusters.length})</h2>
            <button onClick={() => setShowClusters((v) => !v)} className="text-[12px] text-accent hover:underline">
              {showClusters ? "Gizle" : "Göster"}
            </button>
          </div>
          {showClusters && (
            <div className="space-y-3">
              {s.clusters.map((c) => (
                <ClusterCard key={c.id} cluster={c} />
              ))}
            </div>
          )}
        </section>
      )}

      <section className="mt-5">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="mr-1 text-[12px] font-medium uppercase tracking-wide text-muted">Tüm sonuçlar</h2>
          <button
            onClick={() => setMarkets(new Set())}
            className={cn("rounded-full border px-2.5 py-0.5 text-[12px]", markets.size === 0 ? "border-accent bg-accent/10 text-accent" : "border-border hover:bg-surface-2")}
          >
            Tümü <span className="tnum">({total})</span>
          </button>
          {Object.entries(s.listings).map(([m, ls]) => (
            <button
              key={m}
              onClick={() => toggleMarket(m as MarketId)}
              className={cn("rounded-full border px-2.5 py-0.5 text-[12px]", markets.has(m as MarketId) ? "border-accent bg-accent/10 text-accent" : "border-border hover:bg-surface-2")}
            >
              {reg.get(m as MarketId)?.meta.name ?? m} <span className="tnum">({ls.length})</span>
            </button>
          ))}
          <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="ml-auto h-8 rounded-md border border-border bg-surface px-2 text-[13px]">
            {SORTS.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        {visible.length === 0 && allDone && (
          <div className="mt-4">
            <Empty title="Sonuç yok" hint="Hatalı pazarları yeniden dene ya da aramayı farklı bir dilde yaz. Çin pazarları için Çince, Trendyol için Türkçe daha iyi sonuç verir." />
          </div>
        )}
        {visible.length === 0 && !allDone && (
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
            {Array.from({ length: 10 }).map((_, i) => (
              <Card key={i} className="aspect-[3/4] animate-pulse bg-surface-2" />
            ))}
          </div>
        )}
        {visible.length > 0 && (
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
            {visible.map((l) => (
              <ResultCard key={`${l.market}:${l.id}`} listing={l} confidence={confidence.get(`${l.market}:${l.id}`)} />
            ))}
          </div>
        )}
        <p className="mt-3 text-[11px] text-muted">Fiyatlar pazarın kendi para birimindedir; ≈ TRY değeri yalnızca karşılaştırma için gösterge kurla hesaplanır.</p>
      </section>
    </div>
  );
}
