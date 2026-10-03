import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { MarketId, RawListing } from "@manufactogate/core";
import { ClusterCard } from "@/components/ClusterCard";
import { MarketAnalysisCard } from "@/components/MarketAnalysis";
import { MarketPanel } from "@/components/MarketPanel";
import { ResultCard } from "@/components/ResultCard";
import { Button, Card, Empty, cn } from "@/components/ui";
import { analyzeResults } from "@/lib/analysis";
import { download, listingsToCsv, listingsToXls, printPage } from "@/lib/export";
import { toTry } from "@/lib/fx";
import { getRegistry } from "@/lib/registry";
import { relevance } from "@/lib/relevance";
import { useSearch } from "@/store/search";
import { useSettings } from "@/store/settings";

type Sort = "relevance" | "price-asc" | "price-desc" | "sold" | "match";
const SORTS: { key: Sort; label: string }[] = [
  { key: "relevance", label: "Pazar sırası" },
  { key: "match", label: "En yakın eşleşme" },
  { key: "price-asc", label: "Fiyat artan" },
  { key: "price-desc", label: "Fiyat azalan" },
  { key: "sold", label: "En çok satan" },
];
const PAGE = 60;

function minTry(l: RawListing): number {
  const min = Math.min(...l.price.tiers.map((t) => t.unitPrice));
  return toTry(min, l.price.currency) ?? min;
}

export function Results() {
  const { id } = useParams();
  const s = useSearch();
  const [sort, setSort] = useState<Sort>("relevance");
  const [markets, setMarkets] = useState<Set<MarketId>>(new Set());
  const [showClusters, setShowClusters] = useState(false);
  const [closeOnly, setCloseOnly] = useState(false);
  const [priceMax, setPriceMax] = useState<number | null>(null);
  const [withImage, setWithImage] = useState(false);
  const [limit, setLimit] = useState(PAGE);
  const targetCountry = useSettings((x) => x.targetCountry);
  const cost = useSettings((x) => x.cost);

  const currentId = s.current?.id;
  const load = s.load;
  useEffect(() => {
    if (id && currentId !== id) void load(id);
  }, [id, currentId, load]);
  useEffect(() => setLimit(PAGE), [id, sort, markets, closeOnly, priceMax, withImage]);

  const reg = getRegistry();
  const input = s.current?.input;
  const queryText = input?.kind === "text" ? input.query : input?.kind === "image" ? (input.title ?? "") : "";

  const all = useMemo(() => {
    const out: RawListing[] = [];
    const ids = Object.keys(s.listings);
    const max = Math.max(0, ...ids.map((m) => s.listings[m]!.length));
    for (let i = 0; i < max; i++) for (const m of ids) if (s.listings[m]![i]) out.push(s.listings[m]![i]!);
    return out;
  }, [s.listings]);

  const confidence = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of s.clusters) for (const m of c.members) map.set(`${m.listing.market}:${m.listing.id}`, m.match.score);
    return map;
  }, [s.clusters]);
  const rel = useMemo(() => {
    const map = new Map<string, number>();
    if (queryText) for (const l of all) map.set(`${l.market}:${l.id}`, relevance(queryText, l));
    return map;
  }, [all, queryText]);

  const visible = useMemo(() => {
    let v = markets.size ? all.filter((l) => markets.has(l.market)) : all;
    if (closeOnly) v = v.filter((l) => (confidence.get(`${l.market}:${l.id}`) ?? rel.get(`${l.market}:${l.id}`) ?? 1) >= 0.5);
    if (priceMax !== null) v = v.filter((l) => minTry(l) <= priceMax);
    if (withImage) v = v.filter((l) => l.images[0]);
    if (sort === "price-asc") v = [...v].sort((a, b) => minTry(a) - minTry(b));
    else if (sort === "price-desc") v = [...v].sort((a, b) => minTry(b) - minTry(a));
    else if (sort === "sold") v = [...v].sort((a, b) => (b.sold ?? 0) - (a.sold ?? 0));
    else if (sort === "match") v = [...v].sort((a, b) => (confidence.get(`${b.market}:${b.id}`) ?? rel.get(`${b.market}:${b.id}`) ?? 0) - (confidence.get(`${a.market}:${a.id}`) ?? rel.get(`${a.market}:${a.id}`) ?? 0));
    return v;
  }, [all, markets, sort, closeOnly, priceMax, withImage, confidence, rel]);

  const analysis = useMemo(
    () => (all.length ? analyzeResults(all, { targetCountry, fx: cost.fxCnyTry, weightKg: cost.defaultWeightKg, shippingKey: cost.shippingKey, overheadRate: cost.overheadRate }) : null),
    [all, targetCountry, cost],
  );
  const priceBounds = useMemo(() => {
    const ps = all.map(minTry).filter((n) => Number.isFinite(n) && n > 0);
    return ps.length ? { min: Math.min(...ps), max: Math.max(...ps) } : null;
  }, [all]);

  const total = all.length;
  const allDone = !s.running && Object.values(s.markets).every((m) => m.state === "done" || m.state === "error");
  const toggleMarket = (m: MarketId) =>
    setMarkets((prev) => {
      const next = new Set(prev);
      if (next.has(m)) next.delete(m);
      else next.add(m);
      return next;
    });
  const grouped = useMemo(() => {
    const g: Record<"source" | "target", [string, RawListing[]][]> = { source: [], target: [] };
    for (const e of Object.entries(s.listings)) {
      const meta = reg.get(e[0] as MarketId)?.meta;
      g[meta?.country === targetCountry || meta?.role === "target" ? "target" : "source"].push(e);
    }
    return g;
  }, [s.listings, reg, targetCountry]);

  if (!s.current || !input) return <div className="mx-auto max-w-[1440px] px-4 py-10 text-muted">Arama yükleniyor…</div>;
  const marketName = (m: string) => reg.get(m as MarketId)?.meta.name ?? m;
  const title = input.kind === "image" ? (input.title ?? "Görsel araması") : input.kind === "link" ? input.url : input.query;

  return (
    <div className="mx-auto max-w-[1440px] px-4 py-5">
      <div className="flex flex-wrap items-center gap-3 print:hidden">
        {s.current.thumb && <img src={s.current.thumb} alt="" className="h-12 w-12 rounded border border-border object-cover" />}
        <div className="min-w-0">
          <h1 className="truncate text-lg font-semibold tracking-tight">{title}</h1>
          <div className="text-[12px] text-muted tnum">
            {total} sonuç · {Object.keys(s.listings).length} pazar
            {s.durationMs !== undefined ? ` · ${(s.durationMs / 1000).toFixed(1)} sn` : s.running ? " · aranıyor…" : ""}
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Button onClick={() => download(`manufactogate-${Date.now()}.csv`, listingsToCsv(visible, marketName))} disabled={visible.length === 0}>CSV</Button>
          <Button onClick={() => download(`manufactogate-${Date.now()}.xls`, listingsToXls(visible, marketName), "application/vnd.ms-excel")} disabled={visible.length === 0}>Excel</Button>
          <Button onClick={printPage} disabled={visible.length === 0}>PDF</Button>
          {s.running ? <Button onClick={s.cancel}>Durdur</Button> : <Link to="/"><Button variant="primary">Yeni arama</Button></Link>}
        </div>
      </div>

      <div className="mt-3 print:hidden">
        <MarketPanel markets={s.markets} notes={s.notes} onRetry={(m) => void s.retryMarket(m)} running={s.running} />
      </div>

      {analysis && (
        <div className="mt-4">
          <MarketAnalysisCard a={analysis} title={title} />
        </div>
      )}

      {s.clusters.length > 0 && (
        <section className="mt-5 print:hidden">
          <div className="mb-2 flex items-center gap-3">
            <h2 className="text-[12px] font-medium uppercase tracking-wide text-muted">Pazarlar arası eşleşmeler ({s.clusters.length})</h2>
            <button onClick={() => setShowClusters((v) => !v)} className="text-[12px] text-accent hover:underline">{showClusters ? "Gizle" : "Göster"}</button>
          </div>
          {showClusters && <div className="space-y-3">{s.clusters.map((c) => <ClusterCard key={c.id} cluster={c} />)}</div>}
        </section>
      )}

      <div className="mt-5 grid gap-5 lg:grid-cols-[220px_1fr]">
        <aside className="print:hidden">
          <div className="sticky top-16 space-y-5 text-[13px]">
            <div>
              <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted">Sıralama</div>
              <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="h-8 w-full rounded-md border border-border bg-surface px-2 text-[13px]">
                {SORTS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="flex items-center gap-2"><input type="checkbox" checked={closeOnly} onChange={(e) => setCloseOnly(e.target.checked)} /> Sadece yakın eşleşmeler</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={withImage} onChange={(e) => setWithImage(e.target.checked)} /> Sadece görselli</label>
            </div>
            {priceBounds && (
              <div>
                <div className="mb-1.5 flex items-baseline justify-between text-[11px] font-medium uppercase tracking-wide text-muted">
                  <span>En çok ≈ TRY</span>
                  <span className="tnum normal-case">{priceMax === null ? "sınırsız" : priceMax.toFixed(0)}</span>
                </div>
                <input type="range" min={Math.floor(priceBounds.min)} max={Math.ceil(priceBounds.max)} value={priceMax ?? Math.ceil(priceBounds.max)} onChange={(e) => setPriceMax(Number(e.target.value) >= Math.ceil(priceBounds.max) ? null : Number(e.target.value))} className="w-full" />
              </div>
            )}
            {(["source", "target"] as const).map((role) => grouped[role].length > 0 && (
              <div key={role}>
                <div className="mb-1.5 flex items-baseline justify-between text-[11px] font-medium uppercase tracking-wide text-muted">
                  <span>{role === "source" ? "Tedarik pazarları" : "Hedef pazar"}</span>
                  {markets.size > 0 && <button onClick={() => setMarkets(new Set())} className="normal-case text-accent hover:underline">temizle</button>}
                </div>
                <div className="space-y-0.5">
                  {grouped[role].map(([m, ls]) => (
                    <label key={m} className={cn("flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 hover:bg-surface-2", markets.has(m as MarketId) && "bg-accent/10 text-accent")}>
                      <input type="checkbox" checked={markets.has(m as MarketId)} onChange={() => toggleMarket(m as MarketId)} />
                      <span className="min-w-0 flex-1 truncate">{marketName(m)}</span>
                      <span className="text-[12px] text-muted tnum">{ls.length}</span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </aside>

        <section className="min-w-0">
          <div className="flex items-baseline gap-2 text-[12px] text-muted tnum">
            <span>{visible.length} ilan gösteriliyor</span>
            {visible.length !== total && <span>· {total - visible.length} filtrelendi</span>}
          </div>
          {visible.length === 0 && allDone && (
            <div className="mt-4"><Empty title="Sonuç yok" hint="Filtreleri gevşet, hatalı pazarları yeniden dene ya da aramayı farklı bir dilde yaz." /></div>
          )}
          {visible.length === 0 && !allDone && (
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
              {Array.from({ length: 10 }).map((_, i) => <Card key={i} className="aspect-[3/4] animate-pulse bg-surface-2" />)}
            </div>
          )}
          {visible.length > 0 && (
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
              {visible.slice(0, limit).map((l) => (
                <ResultCard key={`${l.market}:${l.id}`} listing={l} confidence={confidence.get(`${l.market}:${l.id}`)} highlight={s.current?.sourceKey === `${l.market}:${l.id}`} />
              ))}
            </div>
          )}
          {visible.length > limit && (
            <div className="mt-4 flex justify-center print:hidden">
              <Button onClick={() => setLimit((n) => n + PAGE)}>Daha fazla göster ({visible.length - limit})</Button>
            </div>
          )}
          <p className="mt-3 text-[11px] text-muted">Fiyatlar pazarın kendi para birimindedir; ≈ TRY değeri yalnızca karşılaştırma için gösterge kurla hesaplanır.</p>
        </section>
      </div>
    </div>
  );
}
