import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { normalizeBadges, type MarketId, type RawListing } from "@manufactogate/core";
import { ClusterCard } from "@/components/ClusterCard";
import { CompareDrawer } from "@/components/CompareDrawer";
import { MarketAnalysisCard } from "@/components/MarketAnalysis";
import { MarketPanel } from "@/components/MarketPanel";
import { PriceHistogram } from "@/components/PriceHistogram";
import { ResultCard } from "@/components/ResultCard";
import { SellerList } from "@/components/SellerList";
import { AnalysisSkeleton, CardGridSkeleton } from "@/components/Skeletons";
import { Button, Card, Empty, Kbd, cn } from "@/components/ui";
import { analyzeResults, histogram, roleOf, sellersOf } from "@/lib/analysis";
import { COMPARE_CAP, getCompareMarkets, setCompareMarkets, withoutMarkets } from "@/lib/comparePrefs";
import { COPY, relBand } from "@/lib/copy";
import { download, listingsToCsv, listingsToXls, printPage } from "@/lib/export";
import { money, soldText } from "@/lib/format";
import { compareDisplayAsc, getDisplayCurrency, minDisplay, minOf } from "@/lib/fx";
import { describeError, summarizeMarkets } from "@/lib/marketErrors";
import { isBeta, sellerDisplayName } from "@/lib/markets";
import { getRegistry } from "@/lib/registry";
import { relevance } from "@/lib/relevance";
import { moveFocus, useShortcuts } from "@/lib/shortcuts";
import { useFxOverrides } from "@/lib/useFx";
import { marketQueries, remainingMarkets, useSearch } from "@/store/search";
import { useSettings } from "@/store/settings";

type Sort = "relevance" | "match" | "price-asc" | "price-desc" | "sold" | "moq" | "rating";
const SORTS: Sort[] = ["relevance", "match", "price-asc", "price-desc", "sold", "moq", "rating"];
type Band = "exact" | "close" | "loose";
const PAGE = 60;

interface Filters {
  sort: Sort;
  markets: Set<MarketId>;
  close: boolean;
  img: boolean;
  pmin: number | null;
  pmax: number | null;
  moq: number | null;
  badged: boolean;
  seller: boolean;
  bands: Set<Band>;
  rating: number | null;
  sold: boolean;
}

/** Filters live in the URL so a /search/:id link can be reloaded or shared with its state. */
function readFilters(sp: URLSearchParams, defaultSort: Sort = "relevance"): Filters {
  const num = (k: string) => {
    const v = Number(sp.get(k));
    return sp.has(k) && Number.isFinite(v) && v > 0 ? v : null;
  };
  const sort = sp.get("sort") as Sort | null;
  return {
    sort: sort && SORTS.includes(sort) ? sort : defaultSort,
    markets: new Set((sp.get("m") ?? "").split(",").filter(Boolean) as MarketId[]),
    close: sp.get("close") === "1",
    img: sp.get("img") === "1",
    pmin: num("pmin"),
    pmax: num("pmax"),
    moq: num("moq"),
    badged: sp.get("badged") === "1",
    seller: sp.get("seller") === "1",
    bands: new Set((sp.get("band") ?? "").split(",").filter((b): b is Band => b === "exact" || b === "close" || b === "loose")),
    rating: num("rating"),
    sold: sp.get("sold") === "1",
  };
}
function countActive(f: Filters): number {
  return [f.markets.size > 0, f.close, f.img, f.pmin !== null, f.pmax !== null, f.moq !== null, f.badged, f.seller, f.bands.size > 0, f.rating !== null, f.sold].filter(Boolean).length;
}

export function Results() {
  const { id } = useParams();
  const s = useSearch();
  const [sp, setSp] = useSearchParams();
  // A photo search lists the closest look-alikes first; other searches keep the markets' own order.
  const defaultSort: Sort = (s.effective ?? s.current?.input)?.kind === "image" ? "match" : "relevance";
  const f = useMemo(() => readFilters(sp, defaultSort), [sp, defaultSort]);
  const [showClusters, setShowClusters] = useState(false);
  const [showSimilar, setShowSimilar] = useState(false);
  const [limit, setLimit] = useState(PAGE);
  const [help, setHelp] = useState(false);
  const [atTop, setAtTop] = useState(true);
  const targetCountry = useSettings((x) => x.targetCountry);
  const cost = useSettings((x) => x.cost);
  const enabled = useSettings((x) => x.enabledMarkets);
  const fxVersion = useFxOverrides();
  const disp = getDisplayCurrency();
  const gridRef = useRef<HTMLDivElement>(null);
  const relCache = useRef(new Map<string, number>());

  const currentId = s.current?.id;
  const load = s.load;
  useEffect(() => {
    if (id && currentId !== id) void load(id);
  }, [id, currentId, load]);
  const filterKey = sp.toString();
  useEffect(() => setLimit(PAGE), [id, filterKey]);
  useEffect(() => {
    const onScroll = () => setAtTop(window.scrollY < 600);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const setParam = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(sp);
      for (const [k, v] of Object.entries(patch)) {
        if (v === null || v === "" || v === "0") next.delete(k);
        else next.set(k, v);
      }
      setSp(next, { replace: true });
    },
    [sp, setSp],
  );
  const clearFilters = () => setSp(new URLSearchParams(f.sort !== defaultSort ? { sort: f.sort } : {}), { replace: true });

  const reg = getRegistry();
  const input = s.current?.input;
  /** What the markets were really asked: the resolved listing's title/image for a link search. */
  const effective = s.effective ?? (input?.kind === "link" ? undefined : input);
  const queryText = effective?.kind === "text" ? effective.query : effective?.kind === "image" ? (effective.title ?? "") : "";
  const deferredListings = useDeferredValue(s.listings);

  const all = useMemo(() => {
    const out: RawListing[] = [];
    const ids = Object.keys(deferredListings);
    const max = Math.max(0, ...ids.map((m) => deferredListings[m]!.length));
    for (let i = 0; i < max; i++) for (const m of ids) if (deferredListings[m]![i]) out.push(deferredListings[m]![i]!);
    return out;
  }, [deferredListings]);

  const confidence = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of s.clusters) for (const m of c.members) map.set(`${m.listing.market}:${m.listing.id}`, m.match.score);
    for (const m of s.similar) if (!map.has(`${m.listing.market}:${m.listing.id}`)) map.set(`${m.listing.market}:${m.listing.id}`, m.match.score);
    return map;
  }, [s.clusters, s.similar]);
  const relOf = useCallback(
    (l: RawListing): number | undefined => {
      if (!queryText) return undefined;
      const k = `${queryText}|${l.market}:${l.id}`;
      let v = relCache.current.get(k);
      if (v === undefined) {
        v = relevance(queryText, l);
        if (relCache.current.size > 30000) relCache.current.clear();
        relCache.current.set(k, v);
      }
      return v;
    },
    [queryText],
  );
  /** Best available match signal: cluster confidence when known, else title relevance. */
  const scoreOf = useCallback(
    (l: RawListing): number | undefined => {
      const c = confidence.get(`${l.market}:${l.id}`);
      const r = relOf(l);
      if (c !== undefined && r !== undefined) return Math.max(c, r);
      return c ?? r;
    },
    [confidence, relOf],
  );

  const visible = useMemo(() => {
    let v = f.markets.size ? all.filter((l) => f.markets.has(l.market)) : all;
    if (f.close) v = v.filter((l) => (scoreOf(l) ?? 1) >= 0.5);
    if (f.bands.size) v = v.filter((l) => f.bands.has(relBand(scoreOf(l)) as Band));
    if (f.pmin !== null) v = v.filter((l) => { const p = minDisplay(l); return p !== null && p >= f.pmin!; });
    if (f.pmax !== null) v = v.filter((l) => { const p = minDisplay(l); return p !== null && p <= f.pmax!; });
    if (f.moq !== null) v = v.filter((l) => (l.moq ?? 1) <= f.moq!);
    if (f.img) v = v.filter((l) => l.images[0]);
    if (f.badged) v = v.filter((l) => { const a = reg.get(l.market); return a ? normalizeBadges(a, l.badges).length > 0 : false; });
    if (f.seller) v = v.filter((l) => !!sellerDisplayName(l));
    if (f.rating !== null) v = v.filter((l) => (l.rating ?? 0) >= f.rating!);
    if (f.sold) v = v.filter((l) => l.sold !== undefined || l.reviewCount !== undefined);
    if (f.sort === "price-asc") v = [...v].sort((a, b) => compareDisplayAsc(minDisplay(a), minDisplay(b)));
    else if (f.sort === "price-desc") v = [...v].sort((a, b) => compareDisplayAsc(minDisplay(a), minDisplay(b))).reverse().sort((a, b) => (minDisplay(a) === null ? 1 : 0) - (minDisplay(b) === null ? 1 : 0));
    else if (f.sort === "sold") v = [...v].sort((a, b) => (b.sold ?? b.reviewCount ?? 0) - (a.sold ?? a.reviewCount ?? 0));
    else if (f.sort === "moq") v = [...v].sort((a, b) => (a.moq ?? 1) - (b.moq ?? 1));
    else if (f.sort === "rating") v = [...v].sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
    else if (f.sort === "match") v = [...v].sort((a, b) => (scoreOf(b) ?? 0) - (scoreOf(a) ?? 0));
    return v;
  }, [all, f, scoreOf, reg, fxVersion]);

  const analysis = useMemo(
    () => (all.length ? analyzeResults(all, { targetCountry, fx: cost.fxCnyTry, weightKg: cost.defaultWeightKg, shippingKey: cost.shippingKey, overheadRate: cost.overheadRate, relevanceOf: scoreOf }) : null),
    [all, targetCountry, cost, scoreOf, fxVersion],
  );
  const sellers = useMemo(() => sellersOf(all.filter((l) => roleOf(reg.get(l.market), targetCountry) === "target"), { relevanceOf: scoreOf }), [all, reg, targetCountry, scoreOf]);
  const hist = useMemo(() => histogram(all.map(minDisplay).filter((n): n is number => n !== null && n > 0)), [all, fxVersion]);

  const total = all.length;
  const allDone = !s.running;
  const marketIds = useMemo(() => [...new Set([...(s.current?.markets ?? []), ...Object.keys(s.markets), ...Object.keys(s.listings)])], [s.current?.markets, s.markets, s.listings]);
  const grouped = useMemo(() => {
    const g: Record<"source" | "target", { id: MarketId; n: number; state: string }[]> = { source: [], target: [] };
    for (const m of marketIds) {
      const a = reg.get(m as MarketId);
      const st = s.markets[m];
      g[roleOf(a, targetCountry)].push({ id: m as MarketId, n: s.listings[m]?.length ?? 0, state: st?.state ?? "pending" });
    }
    for (const k of ["source", "target"] as const) g[k].sort((a, b) => b.n - a.n);
    return g;
  }, [marketIds, reg, targetCountry, s.markets, s.listings]);
  const summary = useMemo(() => summarizeMarkets(s.markets, s.listings, { running: s.running, beta: (m) => isBeta(reg.get(m as MarketId)) }), [s.markets, s.listings, s.running, reg]);
  const runningNames = Object.entries(s.markets).filter(([, st]) => st.state === "running" || st.state === "pending").map(([m]) => reg.get(m as MarketId)?.meta.name ?? m);
  const retryingNames = s.retrying.map((m) => reg.get(m as MarketId)?.meta.name ?? m);
  const remaining = useMemo(() => (s.cancelled || !s.running ? remainingMarkets(s.markets) : []), [s.markets, s.cancelled, s.running]);
  const retryingAny = s.retrying.length > 0;

  const marketName = (m: string) => reg.get(m as MarketId)?.meta.name ?? m;
  const title = !input ? "" : input.kind === "image" ? (input.title ?? "Görsel araması") : input.kind === "link" ? (s.resolved?.listing.title ?? input.url) : input.query;
  const queryRows = useMemo(() => {
    if (!effective || (effective.kind === "text" && !effective.perMarket) || (effective.kind === "image" && !effective.titles)) return [];
    return marketIds.map((m) => ({ market: m, ...marketQueries(effective, m, s.trace[m]) })).filter((r) => r.tried.length + r.untried.length > 0);
  }, [effective, marketIds, s.trace]);
  useEffect(() => {
    if (title) document.title = `${title} · ${total} sonuç · Manufactogate`;
    return () => {
      document.title = "Manufactogate";
    };
  }, [title, total]);

  const duration = (() => {
    const c = s.current;
    if (!c) return null;
    if (c.finishedAt) return (new Date(c.finishedAt).getTime() - new Date(c.startedAt).getTime()) / 1000;
    if (s.running && s.durationMs === undefined) return null;
    return s.running ? null : (s.durationMs !== undefined ? s.durationMs / 1000 : null);
  })();

  useShortcuts({
    j: () => moveFocus(gridRef.current, "[data-card] a", 1),
    k: () => moveFocus(gridRef.current, "[data-card] a", -1),
    c: () => setParam({ close: f.close ? null : "1" }),
    i: () => setParam({ img: f.img ? null : "1" }),
    g: () => setShowClusters((v) => !v),
    t: () => window.scrollTo({ top: 0, behavior: "smooth" }),
    s: () => setParam({ sort: SORTS[(SORTS.indexOf(f.sort) + 1) % SORTS.length]! }),
    "?": () => setHelp((v) => !v),
    escape: () => setHelp(false),
  });

  if (!s.current || !input) return <div className="mx-auto max-w-[1440px] px-4 py-5"><AnalysisSkeleton /><div className="mt-5"><CardGridSkeleton count={10} /></div></div>;
  const exportMeta = { query: title, markets: marketIds.map(marketName), extra: { hedef_ulke: targetCountry, filtre: countActive(f) ? sp.toString() : "yok" } };
  const skipProblem = async (ids: MarketId[]) => {
    const stored = await getCompareMarkets();
    const auto = [...new Set([...marketIds.filter((m) => !isBeta(reg.get(m as MarketId))), ...enabled])].slice(0, COMPARE_CAP) as MarketId[];
    await setCompareMarkets(withoutMarkets(stored, auto, ids));
  };
  const priceInput = (k: "pmin" | "pmax", v: number | null) => setParam({ [k]: v === null ? null : String(Math.round(v)) });

  return (
    <div className="mx-auto max-w-[1440px] px-4 py-5 pb-24">
      <div className="hidden print:block">
        <h1 className="text-lg font-semibold">{title}</h1>
        <div className="text-[12px]">{new Date().toLocaleString("tr-TR")} · {total} sonuç · {marketIds.length} pazar · hedef {targetCountry.toUpperCase()} · ≈ {disp} gösterge kurla</div>
      </div>
      <div className="flex flex-wrap items-center gap-3 print:hidden">
        {s.current.thumb && <img src={s.current.thumb} alt="" className="h-12 w-12 rounded border border-border object-cover" />}
        <div className="min-w-0">
          <h1 className="truncate text-lg font-semibold tracking-tight">{title}</h1>
          <div className="text-[12px] text-muted tnum">
            {total} sonuç · {summary.withResults}/{marketIds.length} pazar sonuç verdi
            {duration !== null ? ` · ${duration.toFixed(1)} sn` : s.running ? " · aranıyor…" : ""}
            {retryingAny && <span className="text-accent"> · {COPY.search.retryingMarkets}: {retryingNames.join(", ")}</span>}
            {s.fingerprintPending > 0 && <span> · {COPY.search.fingerprinting(s.fingerprintPending)}</span>}
            {s.current.sourceKey && (
              <>
                {" · "}
                <Link to={`/l/${s.current.sourceKey.split(":")[0]}/${s.current.sourceKey.split(":").slice(1).join(":")}`} className="text-accent hover:underline">kaynak ilana dön</Link>
              </>
            )}
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Button onClick={() => download(`manufactogate-${Date.now()}.csv`, listingsToCsv(visible, marketName, { score: scoreOf, meta: exportMeta }))} disabled={visible.length === 0}>CSV</Button>
          <Button onClick={() => download(`manufactogate-${Date.now()}.xls`, listingsToXls(visible, marketName, { score: scoreOf, meta: exportMeta }), "application/vnd.ms-excel")} disabled={visible.length === 0}>Excel</Button>
          <Button onClick={printPage} disabled={visible.length === 0}>PDF</Button>
          {s.running ? <Button onClick={s.cancel}>Durdur</Button> : <Link to="/"><Button variant="primary">{COPY.search.newSearch}</Button></Link>}
          <button onClick={() => setHelp((v) => !v)} className="text-[11px] text-accent hover:underline" aria-expanded={help}><Kbd>?</Kbd></button>
        </div>
      </div>
      {help && (
        <Card className="mt-2 flex flex-wrap gap-x-5 gap-y-1 px-3 py-2 text-[12px] print:hidden">
          <span><Kbd>j</Kbd> / <Kbd>k</Kbd> kartlarda gez</span>
          <span><Kbd>c</Kbd> sadece yakın eşleşmeler</span>
          <span><Kbd>i</Kbd> sadece görselli</span>
          <span><Kbd>s</Kbd> sıralamayı değiştir</span>
          <span><Kbd>g</Kbd> kümeleri göster/gizle</span>
          <span><Kbd>t</Kbd> başa dön</span>
          <span><Kbd>?</Kbd> bu yardım</span>
        </Card>
      )}

      {s.error && (
        <div role="alert" data-banner="error" className="mt-3 flex flex-wrap items-center gap-2 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-[13px] text-danger print:hidden">
          <span className="font-medium">{COPY.search.failed}:</span>
          <span>{s.error}</span>
          <Link to="/" className="ml-auto text-accent hover:underline">{COPY.search.newSearch}</Link>
        </div>
      )}
      {s.cancelled && !s.running && (
        <div role="status" data-banner="cancelled" className="mt-3 flex flex-wrap items-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-[13px] print:hidden">
          <span>{COPY.search.cancelled}</span>
          {remaining.length > 0 && <span className="text-muted">{COPY.search.remaining(remaining.length)}</span>}
          {remaining.length > 0 && (
            <Button size="sm" className="ml-auto" onClick={() => void s.retryRemaining()} disabled={retryingAny}>
              {retryingAny ? COPY.search.retrying : COPY.search.retryRemaining(remaining.length)}
            </Button>
          )}
        </div>
      )}
      {s.warning && (
        <div role="status" data-banner="warning" className="mt-3 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-[12px] text-warning print:hidden">{s.warning}</div>
      )}
      {s.storageNote && (
        <div role="status" data-banner="storage" className="mt-3 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-[12px] text-warning print:hidden">{s.storageNote}</div>
      )}
      <div className="mt-3 print:hidden">
        <MarketPanel markets={s.markets} notes={s.notes} listings={s.listings} query={queryText} onRetry={(m) => void s.retryMarket(m)} onSkipProblem={skipProblem} running={s.running} retrying={s.retrying} trace={s.trace} input={effective} />
      </div>
      {queryRows.length > 0 || s.resolved ? (
        <details className="mt-2 text-[12px] text-muted print:hidden" data-what-searched>
          <summary className="cursor-pointer select-none">{COPY.search.whatSearched}</summary>
          {s.resolved && (
            <div className="mt-1">
              {COPY.search.resolved}: <span className="text-text">{marketName(s.resolved.market)}</span> · {s.resolved.listing.title}
            </div>
          )}
          {queryRows.length > 0 && (
            <>
              <ul className="mt-1 grid gap-x-6 gap-y-0.5 sm:grid-cols-2 lg:grid-cols-3">
                {queryRows.map((r) => (
                  <li key={r.market} className="truncate" data-query-row={r.market} title={[...r.tried, ...r.untried].join(" → ")}>
                    <span className="text-text">{marketName(r.market)}</span>:{" "}
                    {r.tried.map((q, i) => (
                      <span key={`t${i}`} className="text-text" data-tried>{i > 0 ? " → " : ""}{q}</span>
                    ))}
                    {r.untried.map((q, i) => (
                      <span key={`u${i}`} className="opacity-60" data-untried>{r.tried.length + i > 0 ? " → " : ""}{q}</span>
                    ))}
                  </li>
                ))}
              </ul>
              <div className="mt-1 text-[11px]">{COPY.search.whatSearchedHint}</div>
            </>
          )}
        </details>
      ) : null}

      {analysis ? (
        <div className="mt-4">
          <MarketAnalysisCard a={analysis} title={title}>
            {sellers.length > 0 && <SellerList rows={sellers} query={queryText} compact />}
          </MarketAnalysisCard>
        </div>
      ) : s.running ? (
        <div className="mt-4"><AnalysisSkeleton /></div>
      ) : null}

      {!s.running && summary.errors > 0 && total > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-[12px] text-warning print:hidden">
          <span>{summary.errors} pazar sorun verdi{summary.zero ? `, ${summary.zero} pazar boş döndü` : ""}.</span>
          {summary.suggestions[0] && <span className="text-muted">{summary.suggestions[0]}</span>}
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

      <div className="mt-5 grid gap-5 lg:grid-cols-[232px_1fr]">
        <aside className="print:hidden">
          <div className="sticky top-16 max-h-[calc(100vh-80px)] space-y-4 overflow-y-auto pr-1 text-[13px]">
            <div className="flex items-baseline justify-between">
              <div className="text-[11px] font-medium uppercase tracking-wide text-muted">Filtreler{countActive(f) ? ` · ${countActive(f)}` : ""}</div>
              {countActive(f) > 0 && <button onClick={clearFilters} className="text-[12px] text-accent hover:underline">Filtreleri temizle</button>}
            </div>
            <div>
              <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted">Sıralama</div>
              <select value={f.sort} onChange={(e) => setParam({ sort: e.target.value === defaultSort ? null : e.target.value })} className="h-8 w-full rounded-md border border-border bg-surface px-2 text-[13px]">
                {SORTS.map((o) => <option key={o} value={o}>{COPY.sorts[o]}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="flex items-center gap-2"><input type="checkbox" checked={f.close} onChange={(e) => setParam({ close: e.target.checked ? "1" : null })} /> Sadece yakın eşleşmeler</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={f.img} onChange={(e) => setParam({ img: e.target.checked ? "1" : null })} /> Sadece görselli</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={f.badged} onChange={(e) => setParam({ badged: e.target.checked ? "1" : null })} /> Doğrulama etiketi olan</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={f.seller} onChange={(e) => setParam({ seller: e.target.checked ? "1" : null })} /> Satıcısı bilinen</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={f.sold} onChange={(e) => setParam({ sold: e.target.checked ? "1" : null })} /> Satış/değerlendirme sayacı olan</label>
            </div>
            {queryText && (
              <div>
                <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted">{COPY.relevance}</div>
                <div className="flex flex-wrap gap-1">
                  {(["exact", "close", "loose"] as Band[]).map((b) => {
                    const on = f.bands.has(b);
                    return (
                      <button key={b} onClick={() => { const n = new Set(f.bands); if (on) n.delete(b); else n.add(b); setParam({ band: [...n].join(",") }); }} className={cn("chip h-7", on && "chip-on")} aria-pressed={on}>
                        {COPY.relBands[b]}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            {hist && (
              <div>
                <div className="mb-1.5 flex items-baseline justify-between text-[11px] font-medium uppercase tracking-wide text-muted">
                  <span>Fiyat ≈ {disp}</span>
                  {(f.pmin !== null || f.pmax !== null) && <button onClick={() => setParam({ pmin: null, pmax: null })} className="normal-case text-accent hover:underline">temizle</button>}
                </div>
                <PriceHistogram h={hist} currency={disp} range={{ min: f.pmin, max: f.pmax }} onPick={(a, b) => { priceInput("pmin", Math.floor(a)); priceInput("pmax", Math.ceil(b)); }} />
                <div className="mt-1.5 flex items-center gap-1 text-[12px]">
                  <input type="number" min={0} placeholder={String(Math.floor(hist.min))} value={f.pmin ?? ""} onChange={(e) => priceInput("pmin", e.target.value ? Number(e.target.value) : null)} aria-label="En az fiyat" className="h-7 w-full rounded border border-border bg-bg px-1.5 tnum" />
                  <span className="text-muted">–</span>
                  <input type="number" min={0} placeholder={String(Math.ceil(hist.max))} value={f.pmax ?? ""} onChange={(e) => priceInput("pmax", e.target.value ? Number(e.target.value) : null)} aria-label="En çok fiyat" className="h-7 w-full rounded border border-border bg-bg px-1.5 tnum" />
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-2 text-[12px]">
              <label className="flex flex-col gap-0.5 text-muted">
                MOQ ≤
                <input type="number" min={1} value={f.moq ?? ""} placeholder="∞" onChange={(e) => setParam({ moq: e.target.value || null })} className="h-7 rounded border border-border bg-bg px-1.5 text-text tnum" />
              </label>
              <label className="flex flex-col gap-0.5 text-muted">
                Puan ≥
                <input type="number" min={1} max={5} step={0.5} value={f.rating ?? ""} placeholder="—" onChange={(e) => setParam({ rating: e.target.value || null })} className="h-7 rounded border border-border bg-bg px-1.5 text-text tnum" />
              </label>
            </div>
            {(["source", "target"] as const).map((role) => grouped[role].length > 0 && (
              <div key={role}>
                <div className="mb-1.5 flex items-baseline justify-between text-[11px] font-medium uppercase tracking-wide text-muted">
                  <span>{role === "source" ? "Tedarik pazarları" : "Hedef pazar"}</span>
                  {f.markets.size > 0 && <button onClick={() => setParam({ m: null })} className="normal-case text-accent hover:underline">temizle</button>}
                </div>
                <div className="space-y-0.5">
                  {grouped[role].map((g) => {
                    const st = s.markets[g.id];
                    const errTitle = st?.state === "error" ? describeError(st.type, st.message, g.id).title : null;
                    return (
                      <label key={g.id} className={cn("flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 hover:bg-surface-2", f.markets.has(g.id) && "bg-accent/10 text-accent", g.n === 0 && "text-muted")} title={errTitle ?? undefined}>
                        <input type="checkbox" checked={f.markets.has(g.id)} onChange={() => { const n = new Set(f.markets); if (n.has(g.id)) n.delete(g.id); else n.add(g.id); setParam({ m: [...n].join(",") }); }} />
                        <span className="min-w-0 flex-1 truncate">{marketName(g.id)}</span>
                        <span className="text-[12px] tnum">{g.state === "running" || g.state === "pending" ? <span className="text-accent">…</span> : errTitle ? <span className="text-danger">!</span> : g.n}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </aside>

        <section className="min-w-0" ref={gridRef}>
          <div className="flex flex-wrap items-baseline gap-2 text-[12px] text-muted tnum print:hidden">
            <span>{visible.length} ilan gösteriliyor</span>
            {visible.length !== total && <span>· {total - visible.length} filtrelendi</span>}
            {s.running && runningNames.length > 0 && <span className="text-accent">· {runningNames.length} pazar aranıyor: {runningNames.slice(0, 4).join(", ")}{runningNames.length > 4 ? "…" : ""}</span>}
          </div>
          {visible.length === 0 && allDone && (
            <div className="mt-4 space-y-3">
              {total > 0 ? (
                <Empty title="Filtreye uyan ilan yok" hint={`${total} ilan filtrelendi.`} action={<Button size="sm" onClick={clearFilters}>Filtreleri temizle</Button>} />
              ) : (
                <Card className="p-5">
                  <div className="font-medium">{COPY.emptyResults.title} · neden boş?</div>
                  <ul className="mt-2 grid gap-1 text-[13px] sm:grid-cols-2">
                    <li>Sonuç veren pazar: <b className="tnum">{summary.withResults}</b> / {summary.total}</li>
                    <li>Boş dönen: <b className="tnum">{summary.zero}</b>{summary.zeroMarkets.length ? ` (${summary.zeroMarkets.slice(0, 6).map(marketName).join(", ")}${summary.zeroMarkets.length > 6 ? "…" : ""})` : ""}</li>
                    {Object.entries(summary.byType).map(([t, ms]) => (
                      <li key={t}>{describeError(t, undefined, ms[0] ?? "").title}: <b className="tnum">{ms.length}</b> ({ms.map(marketName).join(", ")})</li>
                    ))}
                    {summary.pending + summary.running > 0 && <li>Durduruldu: <b className="tnum">{summary.pending + summary.running}</b></li>}
                  </ul>
                  {summary.suggestions.length > 0 && (
                    <ul className="mt-3 list-disc space-y-0.5 pl-5 text-[13px] text-muted">
                      {summary.suggestions.map((t, i) => <li key={i}>{t}</li>)}
                    </ul>
                  )}
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {summary.retryable.length > 0 && (
                      <Button size="sm" onClick={async () => { for (const m of summary.retryable) { void s.retryMarket(m as MarketId); await new Promise((r) => setTimeout(r, 1500)); } }}>Sorunluları yeniden dene ({summary.retryable.length})</Button>
                    )}
                    {summary.needsUser.map((m) => {
                      const st = s.markets[m];
                      const d = st?.state === "error" ? describeError(st.type, st.message, m, queryText) : null;
                      return d?.action ? (
                        <a key={m} href={d.action.href} target="_blank" rel="noreferrer noopener" className="chip h-8 text-accent">{marketName(m)}: {d.action.label} ↗</a>
                      ) : null;
                    })}
                    {summary.zeroMarkets.length > 0 && queryText && (
                      <Link to={`/?q=${encodeURIComponent(queryText)}`} className="chip h-8">Sorguyu düzenle</Link>
                    )}
                    <Link to="/settings" className="chip h-8">Pazarları ayarla</Link>
                  </div>
                </Card>
              )}
            </div>
          )}
          {visible.length === 0 && !allDone && (
            <div className="mt-4"><CardGridSkeleton count={10} labels={runningNames.slice(0, 10)} /></div>
          )}
          {visible.length > 0 && (
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 print:hidden">
              {visible.slice(0, limit).map((l) => (
                <ResultCard key={`${l.market}:${l.id}`} listing={l} confidence={confidence.get(`${l.market}:${l.id}`)} relevance={relOf(l)} highlight={s.current?.sourceKey === `${l.market}:${l.id}`} />
              ))}
            </div>
          )}
          {visible.length > limit && (
            <div className="mt-4 flex justify-center gap-2 print:hidden">
              <Button onClick={() => setLimit((n) => n + PAGE)}>Daha fazla göster ({visible.length - limit})</Button>
            </div>
          )}
          {s.similar.length > 0 && (
            <section className="mt-6 print:hidden">
              <div className="mb-2 flex items-center gap-3">
                <h2 className="text-[12px] font-medium uppercase tracking-wide text-muted">{COPY.bands.similar} ({s.similar.length})</h2>
                <button onClick={() => setShowSimilar((v) => !v)} className="text-[12px] text-accent hover:underline">{showSimilar ? "Gizle" : "Göster"}</button>
                <span className="text-[11px] text-muted">güven %35–60: ana sonuca karışmaz</span>
              </div>
              {showSimilar && (
                <div className="grid grid-cols-2 gap-3 opacity-90 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
                  {s.similar.slice(0, 40).map((m) => (
                    <ResultCard key={`${m.listing.market}:${m.listing.id}`} listing={m.listing} confidence={m.match.score} reason={m.match.reasons.join(" · ")} />
                  ))}
                </div>
              )}
            </section>
          )}
          <table className="mt-3 hidden w-full text-[11px] print:table">
            <thead><tr className="text-left"><th>Pazar</th><th>Başlık</th><th>Fiyat</th><th>≈ {disp}</th><th>MOQ</th><th>Sayaç</th><th>Satıcı</th><th>Eşleşme</th></tr></thead>
            <tbody>
              {visible.slice(0, 200).map((l) => {
                const m = minOf(l);
                const d = minDisplay(l);
                const sc = scoreOf(l);
                return (
                  <tr key={`${l.market}:${l.id}`} className="border-t border-border align-top">
                    <td className="pr-2">{marketName(l.market)}</td>
                    <td className="pr-2">{l.title}<br /><span className="text-muted">{l.url}</span></td>
                    <td className="pr-2 tnum">{m === null ? "teklif" : money(m, l.price.currency)}</td>
                    <td className="pr-2 tnum">{d === null ? "—" : money(d, disp)}</td>
                    <td className="pr-2 tnum">{l.moq ?? ""}</td>
                    <td className="pr-2 tnum">{soldText(l)}</td>
                    <td className="pr-2">{sellerDisplayName(l) ?? ""}</td>
                    <td className="tnum">{sc === undefined ? "" : `%${Math.round(sc * 100)}`}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="mt-3 text-[11px] text-muted">Fiyatlar pazarın kendi para birimindedir; ≈ {disp} değeri yalnızca karşılaştırma için gösterge kurla hesaplanır{disp === "TRY" ? ` (CNY için Ayarlar'daki kur: ${cost.fxCnyTry})` : ""}.</p>
        </section>
      </div>
      {!atTop && (
        <button onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} className="fixed bottom-20 right-4 z-30 rounded-full border border-border bg-surface px-3 py-2 text-[12px] shadow-md hover:bg-surface-2 print:hidden" aria-label="Başa dön">
          ↑ Başa dön
        </button>
      )}
      <CompareDrawer score={(l) => confidence.get(`${l.market}:${l.id}`) ?? (queryText ? relCache.current.get(`${queryText}|${l.market}:${l.id}`) : undefined)} />
    </div>
  );
}
