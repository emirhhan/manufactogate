import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { normalizeBadges, type MarketAdapter, type MarketId, type RawListing, type RawListingDetail } from "@manufactogate/core";
import { WAVE1_IDS, categoryIn, translateTitleToTr } from "@manufactogate/adapters";
import { COUNTRY_NAMES_TR } from "@manufactogate/country-profiles";
import { CompareDrawer } from "@/components/CompareDrawer";
import { CostCalculator, type CalculatorState } from "@/components/CostCalculator";
import { CountryCompare } from "@/components/CountryCompare";
import { Gallery } from "@/components/Gallery";
import { CompareSection, type MarketRow } from "@/components/listing/CompareSection";
import { EconCard } from "@/components/listing/EconCard";
import { DetailBlock, DetailErrorLine, VariantList, type DetailStatus, type DetailView } from "@/components/listing/ListingDetails";
import { ListingHeader } from "@/components/listing/ListingHeader";
import { MarketPicker } from "@/components/listing/MarketPicker";
import { ListingSkeleton } from "@/components/Skeletons";
import { SupplierPanel } from "@/components/SupplierPanel";
import { Button, Card, Empty, Kbd } from "@/components/ui";
import { sellersOf, type Scenario } from "@/lib/analysis";
import { COMPARE_CAP, defaultCompareSet, getCompareMarkets, provenMarkets, setCompareMarkets, withoutMarkets } from "@/lib/comparePrefs";
import { compareStore } from "@/lib/compareStore";
import { db } from "@/lib/db";
import { shortId } from "@/lib/format";
import { getDisplayCurrency, minDisplay, minOf } from "@/lib/fx";
import { imageToDataUrl } from "@/lib/images";
import { listingEconomics } from "@/lib/listingEconomics";
import { listingHint } from "@/lib/listingFields";
import { isBeta } from "@/lib/markets";
import { getDataSource, getRegistry } from "@/lib/registry";
import { pickBest, relevance } from "@/lib/relevance";
import { moveFocus, useShortcuts } from "@/lib/shortcuts";
import { offersFromBest, pushListingSnapshot } from "@/lib/snapshots";
import { useFxOverrides } from "@/lib/useFx";
import { useSearch } from "@/store/search";
import { useCostProfile, useSettings, VERIFIED_MARKETS } from "@/store/settings";

/** Product page for a real market listing: details, landed cost, margin and "same product on other markets". */
export function Listing() {
  const { market, id } = useParams<{ market: string; id: string }>();
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const key = `${market}:${id}`;
  const reg = getRegistry();
  const isResolve = market === "resolve";
  const adapter = market && !isResolve ? reg.get(market as MarketId) : undefined;
  const [listing, setListing] = useState<RawListing | RawListingDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [detailState, setDetailState] = useState<DetailStatus>("idle");
  const [detailError, setDetailError] = useState("");

  // Sentinel route `/l/resolve/<encoded url>`: the extension overlay and pasted links land here (B19).
  useEffect(() => {
    if (!isResolve || !id) return;
    let alive = true;
    setLoading(true);
    setResolveError(null);
    void (async () => {
      let url = "";
      try {
        url = decodeURIComponent(id);
      } catch {
        url = id;
      }
      const hit = reg.resolve(url);
      if (!hit) {
        if (alive) {
          setResolveError(getDataSource() === "extension" ? `Bu bağlantı tanınan bir pazara ait değil: ${url}` : "Pazar bağlantılarını çözmek için eklenti gerekli.");
          setLoading(false);
        }
        return;
      }
      const k = `${hit.adapter.id}:${hit.listingId}`;
      try {
        const existing = await db.listings.get(k);
        if (!existing) {
          // The pasted URL may carry the seller (Trendyol merchantId): pass it on so the detail is that seller's offer.
          const d = await hit.adapter.fetchListing(hit.listingId, { url });
          const rec: RawListingDetail = { ...d, attributes: d.attributes ?? {} };
          await db.listings.put({ ...rec, key: k, searchId: "detail" });
        }
        if (alive) nav(`/l/${hit.adapter.id}/${encodeURIComponent(hit.listingId)}${sp.get("compare") === "1" || sp.get("compare") === null ? "?compare=1" : ""}`, { replace: true });
      } catch (e) {
        if (alive) {
          setResolveError(e instanceof Error ? e.message : String(e));
          setLoading(false);
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [isResolve, id]);

  useEffect(() => {
    if (isResolve) return;
    let alive = true;
    setLoading(true);
    setDetailState("idle");
    setDetailError("");
    void db.listings.get(key).then((rec) => {
      if (!alive) return;
      setListing(rec ?? null);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [key, isResolve]);

  const loadDetail = useCallback(async () => {
    if (!adapter || !id) return;
    setDetailState("loading");
    setDetailError("");
    try {
      const d = await adapter.fetchListing(id, listing ? listingHint(listing) : undefined);
      const base = listing ?? {};
      const merged: RawListingDetail = { ...base, ...d, images: d.images.length ? d.images : (listing?.images ?? []), attributes: d.attributes ?? {} };
      if (!merged.supplierName && listing?.supplierName) merged.supplierName = listing.supplierName;
      if (!merged.supplierId && listing?.supplierId) merged.supplierId = listing.supplierId;
      if (!merged.supplier && listing?.supplier) merged.supplier = listing.supplier;
      setListing(merged);
      const prev = await db.listings.get(key);
      await db.listings.put({ ...merged, key, searchId: prev?.searchId ?? "detail" });
      setDetailState("done");
    } catch (e) {
      setDetailError(e instanceof Error ? e.message : String(e));
      setDetailState("error");
    }
  }, [adapter, id, listing, key]);

  if (loading) return <ListingSkeleton />;
  if (isResolve) {
    return (
      <div className="mx-auto max-w-[960px] px-4 py-10">
        <Empty title={getDataSource() === "extension" ? "Bağlantı çözülemedi" : "Eklenti gerekli"} hint={resolveError ?? "Bağlantı çözülemedi."} action={<Link to="/" className="text-accent hover:underline">Ana sayfaya dön</Link>} />
      </div>
    );
  }
  if (!listing) {
    return (
      <div className="mx-auto max-w-[960px] px-4 py-10">
        <Card className="p-6">
          <div className="font-medium">Bu ilan yerel kayıtlarda yok</div>
          <p className="mt-1 text-muted">İlanlar arama sonuçlarından açıldığında burada görünür. {adapter ? "Pazardan doğrudan çekmeyi deneyebilirsin." : "Bu pazar kimliği tanınmıyor."}</p>
          {adapter && (
            <Button className="mt-3" variant="primary" onClick={() => void loadDetail()} disabled={detailState === "loading"}>
              {detailState === "loading" ? "Çekiliyor…" : "Pazardan çek"}
            </Button>
          )}
          {detailState === "error" && <DetailErrorLine market={adapter?.id} message={detailError} />}
        </Card>
      </div>
    );
  }
  return <ListingView key={key} listingKey={key} listing={listing} adapter={adapter} loadDetail={loadDetail} detailState={detailState} detailError={detailError} />;
}

function ListingView({ listingKey, listing, adapter, loadDetail, detailState, detailError }: { listingKey: string; listing: RawListing | RawListingDetail; adapter: MarketAdapter | undefined; loadDetail: () => Promise<void>; detailState: DetailStatus; detailError: string }) {
  const reg = getRegistry();
  const market = listing.market;
  const id = listing.id;
  const s = useSearch();
  const [sp, setSp] = useSearchParams();
  const enabled = useSettings((x) => x.enabledMarkets);
  const costSettings = useSettings((x) => x.cost);
  const targetCountry = useSettings((x) => x.targetCountry);
  // Target country profile with the user's KDV / duty / commission overrides applied (Settings).
  const profile = useCostProfile();
  const fxVersion = useFxOverrides();
  const disp = getDisplayCurrency();

  // Per-listing state (reset by the `key` on <ListingView>).
  const [compareId, setCompareId] = useState<string | null>(() => (s.current?.sourceKey === listingKey ? s.current.id : null));
  const [preparing, setPreparing] = useState(false);
  const [calc, setCalc] = useState<{ sc: Scenario | null; state: CalculatorState | null }>({ sc: null, state: null });
  const [pickerOpen, setPickerOpen] = useState(false);
  const [help, setHelp] = useState(false);
  const [lastCompare, setLastCompare] = useState<{ id: string; at: string } | null>(null);
  const autoFetched = useRef(new Set<string>());
  const autoCompared = useRef(false);
  const snapshotSent = useRef<string | null>(null);
  const scoreCache = useRef(new Map<string, number>());
  const rootRef = useRef<HTMLDivElement>(null);

  const detail = listing as RawListingDetail;
  const fetched = detail.attributes !== undefined;
  const role = adapter?.meta.role === "target" || adapter?.meta.country === targetCountry ? "target" : "source";
  const isSource = role === "source";
  const countryName = COUNTRY_NAMES_TR[targetCountry] ?? targetCountry.toUpperCase();
  const min = minOf(listing);
  const approx = useMemo(() => (listing.price.currency === disp ? null : minDisplay(listing)), [listing, disp, fxVersion]);
  const badges = adapter ? normalizeBadges(adapter, listing.badges) : [];
  const gloss = useMemo(() => (/[㐀-鿿]/.test(listing.title) ? translateTitleToTr(listing.title) : ""), [listing.title]);
  const category = useMemo(() => categoryIn(listing.title, "tr"), [listing.title]);

  // Compare market selection (B05): stored preference or an automatic, capped default of wave-1 +
  // verified beta + target-country markets (+ proven on this device); "Kanıtlı" markets counted once.
  const wave1 = useMemo(() => reg.all().filter((a) => WAVE1_IDS.has(a.id) || !isBeta(a)).map((a) => a.id), [reg]);
  const targetMarkets = useMemo(() => reg.all().filter((a) => a.meta.country === targetCountry && a.meta.role !== "source").map((a) => a.id), [reg, targetCountry]);
  const [proven, setProven] = useState<Map<MarketId, number>>(new Map());
  const [compareMarkets, setCompareMarketsState] = useState<MarketId[] | null>(null);
  const [customSet, setCustomSet] = useState(false);
  const autoSet = useCallback((pv: Iterable<MarketId>) => defaultCompareSet({ wave1, enabled, proven: pv, source: market, verified: VERIFIED_MARKETS, targetMarkets }), [wave1, enabled, market, targetMarkets]);
  useEffect(() => {
    let alive = true;
    void (async () => {
      const ids = reg.all().map((a) => a.id);
      const [pv, stored] = await Promise.all([provenMarkets(ids), getCompareMarkets()]);
      if (!alive) return;
      setProven(pv);
      if (stored && stored.length) {
        setCompareMarketsState([...new Set([market, ...stored.filter((m) => reg.get(m))])].slice(0, COMPARE_CAP));
        setCustomSet(true);
      } else setCompareMarketsState(autoSet(pv.keys()));
    })();
    return () => {
      alive = false;
    };
  }, [reg, market, autoSet]);
  const toggleCompareMarket = (m: MarketId) => {
    setCompareMarketsState((cur) => {
      const base = cur ?? [];
      const next = base.includes(m) ? base.filter((x) => x !== m) : base.length >= COMPARE_CAP ? base : [...base, m];
      void setCompareMarkets(next);
      setCustomSet(true);
      return next;
    });
  };
  const resetCompareMarkets = () => {
    setCompareMarketsState(autoSet(proven.keys()));
    setCustomSet(false);
    void setCompareMarkets(null);
  };

  // Last comparison started from this listing (History), for a quick link when nothing is live.
  useEffect(() => {
    let alive = true;
    void db.searches
      .orderBy("startedAt")
      .reverse()
      .limit(60)
      .filter((r) => r.sourceKey === listingKey)
      .first()
      .then((r) => {
        if (alive && r) setLastCompare({ id: r.id, at: r.startedAt });
      });
    return () => {
      alive = false;
    };
  }, [listingKey]);

  // Auto-fetch detail once per key when the extension is live and no search is running (B04).
  useEffect(() => {
    if (fetched || !adapter || detailState !== "idle") return;
    if (getDataSource() !== "extension" || s.running) return;
    if (autoFetched.current.has(listingKey)) return;
    autoFetched.current.add(listingKey);
    void loadDetail();
  }, [fetched, adapter, detailState, s.running, listingKey, loadDetail]);

  // Overlay price snapshot (P1-5): on open, from stored matches; fire-and-forget, extension mode only.
  useEffect(() => {
    if (getDataSource() !== "extension" || snapshotSent.current === listingKey) return;
    snapshotSent.current = listingKey;
    void pushListingSnapshot(listing);
  }, [listingKey, listing]);

  const compare = useCallback(async () => {
    if (!compareMarkets || s.running) return;
    const markets = [...new Set([market, ...compareMarkets])];
    const first = listing.images[0];
    let dataUrl: string | null = null;
    if (first && markets.some((m) => reg.get(m)?.meta.capabilities.imageSearch)) {
      setPreparing(true);
      try {
        dataUrl = await imageToDataUrl(first);
      } finally {
        setPreparing(false);
      }
    }
    const input = dataUrl
      ? ({ kind: "image", image: { dataUrl, ...(first ? { sourceUrl: first } : {}) }, title: listing.title } as const)
      : ({ kind: "text", query: listing.title } as const);
    const sid = await s.start(input, markets, dataUrl ?? undefined, listingKey);
    setCompareId(sid);
  }, [compareMarkets, s, market, listing, reg, listingKey]);

  // `?compare=1` auto-run once the listing and the market set are ready and nothing else is running (B05/B19).
  useEffect(() => {
    if (sp.get("compare") !== "1" || autoCompared.current || !compareMarkets || s.running) return;
    autoCompared.current = true;
    const next = new URLSearchParams(sp);
    next.delete("compare");
    setSp(next, { replace: true });
    void compare();
  }, [sp, setSp, compareMarkets, s.running, compare]);

  const comparing = compareId !== null && s.current?.id === compareId;
  const deferredListings = useDeferredValue(s.listings);
  const deferredMarkets = useDeferredValue(s.markets);
  const confidence = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of s.clusters) for (const m of c.members) map.set(`${m.listing.market}:${m.listing.id}`, m.match.score);
    return map;
  }, [s.clusters]);
  const scoreOf = useCallback(
    (l: RawListing): number => {
      const k = `${listing.title}|${l.market}:${l.id}`;
      let v = scoreCache.current.get(k);
      if (v === undefined) {
        v = relevance(listing.title, l);
        if (scoreCache.current.size > 20000) scoreCache.current.clear();
        scoreCache.current.set(k, v);
      }
      const c = confidence.get(`${l.market}:${l.id}`);
      return c !== undefined ? Math.max(c, v) : v;
    },
    [listing.title, confidence],
  );

  const rows = useMemo<MarketRow[]>(() => {
    if (!comparing) return [];
    const ids = [...new Set([...Object.keys(deferredMarkets), ...Object.keys(deferredListings)])] as MarketId[];
    return ids.map((m) => {
      const list = (deferredListings[m] ?? []).filter((l) => !(l.market === market && l.id === id));
      const scored = list.map((l) => ({ l, r: scoreOf(l), p: minDisplay(l) })).sort((a, b) => b.r - a.r || (a.p ?? Infinity) - (b.p ?? Infinity));
      const strong = scored.filter((x) => x.r >= 0.5);
      const weak = scored.filter((x) => x.r < 0.5);
      const pool = strong.length ? strong : scored.slice(0, 5);
      const best = pickBest(strong.map((x) => ({ item: x.l, score: x.r, price: x.p })));
      return { market: m, count: list.length, strongCount: strong.length, best, bestScore: best ? scoreOf(best) : undefined, top: pool.slice(0, 8).map((x) => x.l), weak: weak.map((x) => x.l), status: deferredMarkets[m], note: s.notes[m] };
    });
  }, [comparing, deferredListings, deferredMarkets, s.notes, market, id, scoreOf, fxVersion]);
  const rowsSorted = useMemo(() => {
    const order = (r: MarketRow) => (r.best ? 0 : r.status?.state === "running" || r.status?.state === "pending" ? 1 : r.count ? 2 : r.status?.state === "error" ? 3 : 4);
    return [...rows].sort((a, b) => order(a) - order(b) || (minDisplay(a.best ?? listing) ?? Infinity) - (minDisplay(b.best ?? listing) ?? Infinity));
  }, [rows, listing]);
  const found = useMemo(() => Object.fromEntries(rows.map((o) => [o.market, o.best])), [rows]);
  const strongByRole = useMemo(() => {
    const out: { source: RawListing[]; target: RawListing[] } = { source: [], target: [] };
    for (const r of rows) {
      const a = reg.get(r.market);
      const rr = a?.meta.role === "target" || a?.meta.country === targetCountry ? "target" : "source";
      for (const l of r.top) if (scoreOf(l) >= 0.5) out[rr].push(l);
    }
    return out;
  }, [rows, reg, targetCountry, scoreOf]);
  const sellers = useMemo(() => sellersOf(strongByRole.target), [strongByRole.target]);

  // Once a live compare has finished, refresh the overlay snapshot with the best offer per market.
  useEffect(() => {
    if (!comparing || s.running || getDataSource() !== "extension") return;
    const offers = offersFromBest(rows.map((r) => r.best), listing, (m) => reg.get(m)?.meta.name);
    if (!offers.length || snapshotSent.current === `${listingKey}|${compareId}`) return;
    snapshotSent.current = `${listingKey}|${compareId}`;
    void pushListingSnapshot(listing, offers);
  }, [comparing, s.running, rows, listing, reg, listingKey, compareId]);

  // Cost + margin + chain (B01), VAT-aware, with the user's country overrides in `profile`.
  const bestTarget = useMemo(() => pickBest(strongByRole.target.map((l) => ({ item: l, score: scoreOf(l), price: minDisplay(l) }))), [strongByRole.target, scoreOf]);
  const bestSource = useMemo(() => pickBest(strongByRole.source.map((l) => ({ item: l, score: scoreOf(l), price: minDisplay(l) }))), [strongByRole.source, scoreOf]);
  const marketName = useCallback((m: string) => reg.get(m as MarketId)?.meta.name ?? m, [reg]);
  const econ = useMemo(
    () => listingEconomics({ isSource, profile, listing, bestTarget, bestSource, scenario: calc.sc, calc: calc.state, cost: costSettings, marketName }),
    [isSource, profile, listing, bestTarget, bestSource, calc, costSettings, marketName, fxVersion],
  );

  const imageMarkets = (compareMarkets ?? []).filter((m) => reg.get(m)?.meta.capabilities.imageSearch).map((m) => reg.get(m)!.meta.name);
  const titleMarkets = (compareMarkets ?? []).filter((m) => !reg.get(m)?.meta.capabilities.imageSearch).length;
  const onScenario = useCallback((sc: Scenario | null, state: CalculatorState) => setCalc({ sc, state }), []);
  const onSkipProblem = useCallback(
    async (ids: MarketId[]) => {
      const stored = await getCompareMarkets();
      const next = withoutMarkets(stored, autoSet(proven.keys()), ids);
      await setCompareMarkets(next);
      setCompareMarketsState([...new Set([market, ...next])]);
      setCustomSet(true);
    },
    [autoSet, proven, market],
  );

  // Keyboard shortcuts (I07).
  useShortcuts({
    c: () => void compare(),
    o: () => window.open(listing.url, "_blank", "noopener,noreferrer"),
    s: () => {
      if (!compareStore.toggle(listing)) compareStore.setOpen(true);
    },
    j: () => moveFocus(rootRef.current, "[data-card] a", 1),
    k: () => moveFocus(rootRef.current, "[data-card] a", -1),
    "?": () => setHelp((v) => !v),
    escape: () => setHelp(false),
  });

  const compareLabel = preparing ? "Görsel hazırlanıyor…" : s.running && comparing ? "Diğer pazarlarda aranıyor…" : s.running ? "Başka bir arama sürüyor…" : "Diğer pazarlarda bul ve karşılaştır";
  const detailView: DetailView = detailState === "loading" ? "loading" : detailState === "error" ? "error" : fetched ? (Object.keys(detail.attributes ?? {}).length ? "done" : "empty") : "idle";

  return (
    <div ref={rootRef} className="mx-auto max-w-[1440px] px-4 py-6 pb-24">
      <nav className="flex flex-wrap items-center gap-1 text-[12px] text-muted" aria-label="Konum">
        <Link to="/" className="hover:underline">Ürünler</Link>
        <span>/</span>
        <span>{adapter?.meta.name ?? market}</span>
        {category && (
          <>
            <span>/</span>
            <Link to={`/?q=${encodeURIComponent(category)}`} className="hover:underline">{category}</Link>
          </>
        )}
        <span>/</span>
        <span className="text-text" title={listing.id}>{shortId(listing.id)}</span>
        <button onClick={() => setHelp((v) => !v)} className="ml-auto text-[11px] text-accent hover:underline" aria-expanded={help}>
          Kısayollar <Kbd>?</Kbd>
        </button>
      </nav>
      {help && (
        <Card className="mt-2 flex flex-wrap gap-x-5 gap-y-1 px-3 py-2 text-[12px]">
          <span><Kbd>c</Kbd> karşılaştır</span>
          <span><Kbd>o</Kbd> pazarda aç</span>
          <span><Kbd>s</Kbd> yan yana karşılaştırmaya ekle</span>
          <span><Kbd>j</Kbd> / <Kbd>k</Kbd> sonuç kartlarında gez</span>
          <span><Kbd>?</Kbd> bu yardım</span>
        </Card>
      )}

      <div className="mt-3 grid gap-6 lg:grid-cols-[460px_1fr]">
        <div>
          <Gallery images={listing.images} label={adapter?.meta.name ?? ""} resetKey={listingKey} />
          <div className="mt-3 flex gap-2">
            <Button variant="primary" className="flex-1 justify-center" onClick={() => void compare()} disabled={s.running || preparing || !compareMarkets}>
              {compareLabel}
            </Button>
            <a href={listing.url} target="_blank" rel="noreferrer noopener" className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-surface px-3.5 text-sm font-medium hover:bg-surface-2">
              Pazarda aç ↗
            </a>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-2 text-[11px] text-muted">
            <span>
              {compareMarkets ? `${compareMarkets.length} pazar` : "pazarlar yükleniyor"}
              {customSet ? " · seçimin" : " · otomatik (ana + doğrulanmış + hedef ülke)"}
            </span>
            <button onClick={() => setPickerOpen((v) => !v)} className="text-accent hover:underline" aria-expanded={pickerOpen}>
              {pickerOpen ? "kapat" : "pazarları seç"}
            </button>
            {lastCompare && !comparing && (
              <Link to={`/search/${lastCompare.id}`} className="text-accent hover:underline">
                son karşılaştırma ({new Date(lastCompare.at).toLocaleDateString("tr-TR")}) →
              </Link>
            )}
          </div>
          {pickerOpen && compareMarkets && (
            <MarketPicker reg={reg} selected={compareMarkets} proven={proven} wave1={wave1} verified={VERIFIED_MARKETS} targetMarkets={targetMarkets} source={market} onToggle={toggleCompareMarket} onReset={resetCompareMarkets} />
          )}
          <p className="mt-2 text-[11px] text-muted">
            {imageMarkets.length ? `Görselle arama ${imageMarkets.slice(0, 4).join(", ")}${imageMarkets.length > 4 ? ` +${imageMarkets.length - 4}` : ""} motorunda çalışır` : "Seçili pazarlarda görselle arama yok"}
            {titleMarkets ? `; ${titleMarkets} pazarda başlıkla (marka + model + kategori) aranır.` : "."}
          </p>
        </div>

        <div className="min-w-0">
          <ListingHeader listing={listing} adapter={adapter} isSource={isSource} countryName={countryName} approx={approx} min={min} badges={badges} gloss={gloss} category={category} tierIndex={calc.sc?.tierIndex} />
          <VariantList variants={detail.variants} count={listing.variantCount} />
          <DetailBlock status={detailView} market={adapter?.id} attrs={detail.attributes} error={detailError} canFetch={!!adapter} onFetch={() => void loadDetail()} />
          {detail.description && (
            <details className="mt-4 text-[13px]">
              <summary className="cursor-pointer select-none text-[11px] font-medium uppercase tracking-wide text-muted">Açıklama</summary>
              <p className="mt-1 whitespace-pre-line leading-relaxed text-muted">{detail.description.slice(0, 4000)}</p>
            </details>
          )}

          <EconCard econ={econ} isSource={isSource} comparing={comparing} profile={profile} countryName={countryName} marketName={marketName} />
        </div>
      </div>

      {isSource && (
        <section className="mt-8">
          <CostCalculator listing={listing} profile={profile} groupKey={undefined} onScenario={onScenario} />
        </section>
      )}

      {isSource && (
        <section className="mt-8">
          <SupplierPanel listing={listing} peers={strongByRole.source} />
        </section>
      )}

      {isSource && (
        <section className="mt-8">
          <CountryCompare tiers={listing.price.tiers} currency={listing.price.currency} weightKg={calc.state?.weightKg ?? costSettings.defaultWeightKg} moq={listing.moq} found={found} hsCode={calc.state?.hsCode || undefined} />
        </section>
      )}

      {comparing && compareId && (
        <CompareSection reg={reg} listing={listing} adapter={adapter} search={s} compareId={compareId} compareMarkets={compareMarkets ?? []} rows={rows} rowsSorted={rowsSorted} sellers={sellers} confidence={confidence} scoreOf={scoreOf} onSkipProblem={onSkipProblem} />
      )}
      <CompareDrawer score={(l) => confidence.get(`${l.market}:${l.id}`) ?? scoreCache.current.get(`${listing.title}|${l.market}:${l.id}`)} />
    </div>
  );
}
