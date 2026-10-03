import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { computeLandedCost, computeMargin, normalizeBadges, type MarketAdapter, type MarketId, type RawListing, type RawListingDetail } from "@manufactogate/core";
import { BADGE_LABELS_TR, CALIBRATION_STATUS, WAVE1_IDS, categoryIn, queryLadder, translateTitleToTr } from "@manufactogate/adapters";
import { COUNTRY_NAMES_TR, getCountryProfile } from "@manufactogate/country-profiles";
import { CompareDrawer } from "@/components/CompareDrawer";
import { CostCalculator, type CalculatorState } from "@/components/CostCalculator";
import { CountryCompare } from "@/components/CountryCompare";
import { Gallery } from "@/components/Gallery";
import { ListingActions } from "@/components/ListingActions";
import { MarketPanel } from "@/components/MarketPanel";
import { PriceChain } from "@/components/PriceChain";
import { ResultCard } from "@/components/ResultCard";
import { SellerList } from "@/components/SellerList";
import { DetailSkeleton, ListingSkeleton, TableSkeleton } from "@/components/Skeletons";
import { SupplierPanel } from "@/components/SupplierPanel";
import { Badge, Button, Card, Empty, Kbd, cn } from "@/components/ui";
import { buildChain, marketplaceFor, pickQty, rateFor, sellersOf, shippingKeyFor, type Scenario } from "@/lib/analysis";
import { COMPARE_CAP, defaultCompareSet, getCompareMarkets, provenMarkets, setCompareMarkets, withoutMarkets } from "@/lib/comparePrefs";
import { compareStore } from "@/lib/compareStore";
import { COPY, relBand } from "@/lib/copy";
import { db } from "@/lib/db";
import { money, pct, priceRange, shortId, soldText } from "@/lib/format";
import { getDisplayCurrency, minDisplay, minOf } from "@/lib/fx";
import { imageToDataUrl } from "@/lib/images";
import { describeError } from "@/lib/marketErrors";
import { isBeta, marketTone, sellerDisplayName, storeUrl } from "@/lib/markets";
import { getDataSource, getRegistry } from "@/lib/registry";
import { pickBest, relevance, relevanceDetail } from "@/lib/relevance";
import { moveFocus, useShortcuts } from "@/lib/shortcuts";
import { useFxOverrides } from "@/lib/useFx";
import { useSearch } from "@/store/search";
import { useSettings } from "@/store/settings";

type DetailStatus = "idle" | "loading" | "done" | "error";

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
          const d = await hit.adapter.fetchListing(hit.listingId);
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
      const d = await adapter.fetchListing(id);
      const base = listing ?? {};
      const merged: RawListingDetail = { ...base, ...d, images: d.images.length ? d.images : (listing?.images ?? []), attributes: d.attributes ?? {} };
      if (!merged.supplierName && listing?.supplierName) merged.supplierName = listing.supplierName;
      if (!merged.supplierId && listing?.supplierId) merged.supplierId = listing.supplierId;
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
  return <ListingView key={key} listingKey={key} listing={listing} adapter={adapter} setListing={setListing} loadDetail={loadDetail} detailState={detailState} detailError={detailError} />;
}

function DetailErrorLine({ market, message }: { market: MarketId | undefined; message: string }) {
  const m = /^(LoggedOut|Captcha|SelectorBroken|RateLimited|NotFound|Network|Timeout|Internal)\b/.exec(message);
  const d = market ? describeError(m?.[1] ?? "Network", message, market) : null;
  return (
    <div className="mt-2 text-[12px] text-danger">
      {d ? `${d.title}: ${d.hint}` : message}
      {d?.action && (
        <a href={d.action.href} target="_blank" rel="noreferrer noopener" className="ml-2 text-accent hover:underline">
          {d.action.label} ↗
        </a>
      )}
      <details className="mt-0.5 text-muted">
        <summary className="cursor-pointer select-none">teknik ayrıntı</summary>
        <code className="font-mono text-[11px]">{message}</code>
      </details>
    </div>
  );
}

interface MarketRow {
  market: MarketId;
  count: number;
  strongCount: number;
  best: RawListing | undefined;
  bestScore: number | undefined;
  top: RawListing[];
  weak: RawListing[];
  status: ReturnType<typeof useSearch.getState>["markets"][string] | undefined;
  note: string | undefined;
}

function ListingView({
  listingKey,
  listing,
  adapter,
  loadDetail,
  detailState,
  detailError,
}: {
  listingKey: string;
  listing: RawListing | RawListingDetail;
  adapter: MarketAdapter | undefined;
  setListing: (l: RawListing | RawListingDetail) => void;
  loadDetail: () => Promise<void>;
  detailState: DetailStatus;
  detailError: string;
}) {
  const reg = getRegistry();
  const market = listing.market;
  const id = listing.id;
  const s = useSearch();
  const [sp, setSp] = useSearchParams();
  const enabled = useSettings((x) => x.enabledMarkets);
  const costSettings = useSettings((x) => x.cost);
  const targetCountry = useSettings((x) => x.targetCountry);
  const fxVersion = useFxOverrides();
  const disp = getDisplayCurrency();

  // Per-listing state (reset by the `key` on <ListingView>).
  const [compareId, setCompareId] = useState<string | null>(() => (s.current?.sourceKey === listingKey ? s.current.id : null));
  const [showFiltered, setShowFiltered] = useState<Record<string, boolean>>({});
  const [preparing, setPreparing] = useState(false);
  const [calc, setCalc] = useState<{ sc: Scenario | null; state: CalculatorState | null }>({ sc: null, state: null });
  const [pickerOpen, setPickerOpen] = useState(false);
  const [help, setHelp] = useState(false);
  const [lastCompare, setLastCompare] = useState<{ id: string; at: string } | null>(null);
  const autoFetched = useRef(new Set<string>());
  const autoCompared = useRef(false);
  const scoreCache = useRef(new Map<string, number>());
  const rootRef = useRef<HTMLDivElement>(null);

  const detail = listing as RawListingDetail;
  const fetched = detail.attributes !== undefined;
  const role = adapter?.meta.role === "target" || adapter?.meta.country === targetCountry ? "target" : "source";
  const isSource = role === "source";
  const profile = getCountryProfile(targetCountry) ?? getCountryProfile("tr")!;
  const countryName = COUNTRY_NAMES_TR[targetCountry] ?? targetCountry.toUpperCase();
  const min = minOf(listing);
  const approx = useMemo(() => (listing.price.currency === disp ? null : minDisplay(listing)), [listing, disp, fxVersion]);
  const badges = adapter ? normalizeBadges(adapter, listing.badges) : [];
  const gloss = useMemo(() => (/[㐀-鿿]/.test(listing.title) ? translateTitleToTr(listing.title) : ""), [listing.title]);
  const category = useMemo(() => categoryIn(listing.title, "tr"), [listing.title]);
  const sellerName = sellerDisplayName(listing);
  const sellerUrl = storeUrl(market, listing.supplierId);

  // Compare market selection (B05): stored preference or an automatic, capped default; "Kanıtlı" markets counted once.
  const wave1 = useMemo(() => reg.all().filter((a) => WAVE1_IDS.has(a.id) || !isBeta(a)).map((a) => a.id), [reg]);
  const [proven, setProven] = useState<Map<MarketId, number>>(new Map());
  const [compareMarkets, setCompareMarketsState] = useState<MarketId[] | null>(null);
  const [customSet, setCustomSet] = useState(false);
  useEffect(() => {
    let alive = true;
    void (async () => {
      const ids = reg.all().map((a) => a.id);
      const [pv, stored] = await Promise.all([provenMarkets(ids), getCompareMarkets()]);
      if (!alive) return;
      setProven(pv);
      const auto = defaultCompareSet({ wave1, enabled, proven: pv.keys(), source: market });
      if (stored && stored.length) {
        setCompareMarketsState([...new Set([market, ...stored.filter((m) => reg.get(m))])].slice(0, COMPARE_CAP));
        setCustomSet(true);
      } else setCompareMarketsState(auto);
    })();
    return () => {
      alive = false;
    };
  }, [reg, wave1, enabled, market]);
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
    const auto = defaultCompareSet({ wave1, enabled, proven: proven.keys(), source: market });
    setCompareMarketsState(auto);
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
    setShowFiltered({});
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
      return {
        market: m,
        count: list.length,
        strongCount: strong.length,
        best,
        bestScore: best ? scoreOf(best) : undefined,
        top: pool.slice(0, 8).map((x) => x.l),
        weak: weak.map((x) => x.l),
        status: deferredMarkets[m],
        note: s.notes[m],
      };
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

  // Cost + margin + chain (B01). Source listing: this listing → landed → best target match. Target listing: best source match → landed → this price.
  const cur = profile.currency;
  const bestTarget = useMemo(() => pickBest(strongByRole.target.map((l) => ({ item: l, score: scoreOf(l), price: minDisplay(l) }))), [strongByRole.target, scoreOf]);
  const bestSource = useMemo(() => pickBest(strongByRole.source.map((l) => ({ item: l, score: scoreOf(l), price: minDisplay(l) }))), [strongByRole.source, scoreOf]);
  const econ = useMemo(() => {
    const toCur = (l: RawListing) => {
      const m = minOf(l);
      const r = m === null ? null : rateFor(l.price.currency, cur, costSettings.fxCnyTry);
      return m !== null && r !== null ? m * r : null;
    };
    if (isSource) {
      const sc = calc.sc;
      if (!sc) return null;
      const sell = bestTarget ? toCur(bestTarget) : null;
      const mp = marketplaceFor(profile, bestTarget?.market);
      const margin = sell ? computeMargin(profile, sc.cost.perUnit, { sellPrice: sell, marketplaceId: mp, overheadRate: costSettings.overheadRate }) : null;
      const chain = buildChain({ sourceLabel: `${adapter?.meta.name ?? market} birim (${sc.qty} adet)`, sourceUnit: sc.cost.tierUsed.unitPrice, sourceCurrency: listing.price.currency, landedPerUnit: sc.cost.perUnit, sell: sell && bestTarget ? { label: `${reg.get(bestTarget.market)?.meta.name ?? bestTarget.market} en ucuz benzer`, price: sell } : null, net: margin?.netPerUnit ?? null, currency: cur, cnyTry: costSettings.fxCnyTry });
      return { landed: sc.cost.perUnit, qty: sc.qty, sell, sellFrom: bestTarget, margin, chain, sourceListing: listing as RawListing, marketplaceId: mp };
    }
    // Target listing (Journey B): landed cost from the best source match, margin at this listing's price.
    if (!bestSource) return null;
    const m = minOf(bestSource);
    const fx = rateFor(bestSource.price.currency, cur, costSettings.fxCnyTry);
    if (m === null || fx === null) return null;
    const qty = pickQty(bestSource.price.tiers, bestSource.moq, calc.state?.qty ?? null);
    const shipKey = shippingKeyFor(profile, calc.state?.shippingKey ?? costSettings.shippingKey);
    const landedRes = computeLandedCost(profile, { quantity: qty, tiers: bestSource.price.tiers, fxRate: fx, unitWeightKg: calc.state?.weightKg ?? costSettings.defaultWeightKg, shippingKey: shipKey, ...(calc.state?.hsCode ? { hsCode: calc.state.hsCode } : {}) });
    const sell = toCur(listing);
    const mp = marketplaceFor(profile, market);
    const margin = sell ? computeMargin(profile, landedRes.perUnit, { sellPrice: sell, marketplaceId: mp, overheadRate: costSettings.overheadRate }) : null;
    const chain = buildChain({ sourceLabel: `${reg.get(bestSource.market)?.meta.name ?? bestSource.market} birim (${qty} adet)`, sourceUnit: landedRes.tierUsed.unitPrice, sourceCurrency: bestSource.price.currency, landedPerUnit: landedRes.perUnit, sell: sell ? { label: `${adapter?.meta.name ?? market} bu ilan`, price: sell } : null, net: margin?.netPerUnit ?? null, currency: cur, cnyTry: costSettings.fxCnyTry });
    return { landed: landedRes.perUnit, qty, sell, sellFrom: listing as RawListing, margin, chain, sourceListing: bestSource, marketplaceId: mp };
  }, [isSource, calc, bestTarget, bestSource, profile, costSettings, listing, adapter, market, reg, cur, fxVersion]);

  const imageMarkets = (compareMarkets ?? []).filter((m) => reg.get(m)?.meta.capabilities.imageSearch).map((m) => reg.get(m)!.meta.name);
  const titleMarkets = (compareMarkets ?? []).filter((m) => !reg.get(m)?.meta.capabilities.imageSearch).length;
  const onScenario = useCallback((sc: Scenario | null, state: CalculatorState) => setCalc({ sc, state }), []);

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
  const detailStatus: "idle" | "loading" | "done" | "empty" | "error" = detailState === "loading" ? "loading" : detailState === "error" ? "error" : fetched ? (Object.keys(detail.attributes ?? {}).length ? "done" : "empty") : "idle";

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
              {customSet ? " · seçimin" : " · otomatik"}
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
            <MarketPicker reg={reg} selected={compareMarkets} proven={proven} wave1={wave1} source={market} onToggle={toggleCompareMarket} onReset={resetCompareMarkets} />
          )}
          <p className="mt-2 text-[11px] text-muted">
            {imageMarkets.length ? `Görselle arama ${imageMarkets.slice(0, 4).join(", ")}${imageMarkets.length > 4 ? ` +${imageMarkets.length - 4}` : ""} motorunda çalışır` : "Seçili pazarlarda görselle arama yok"}
            {titleMarkets ? `; ${titleMarkets} pazarda başlıkla (marka + model + kategori) aranır.` : "."}
          </p>
        </div>

        <div className="min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className={cn("inline-block rounded px-1.5 py-0.5 text-[11px] font-medium text-white", marketTone(listing.market))}>{adapter?.meta.name ?? listing.market}</span>
              <Badge tone={isSource ? "accent" : "warning"}>{isSource ? "tedarik pazarı" : `hedef pazar · ${countryName}`}</Badge>
              {adapter && CALIBRATION_STATUS[adapter.id] && CALIBRATION_STATUS[adapter.id] !== "live" && <Badge title="Bu pazarın okuyucusu canlıda doğrulanmadı">beta okuma</Badge>}
            </div>
            <ListingActions listing={listing} />
          </div>
          <h1 className="mt-2 text-xl font-semibold leading-snug tracking-tight">{listing.title}</h1>
          {(gloss && gloss !== listing.title) || category ? (
            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[12px] text-muted">
              {gloss && gloss !== listing.title && <span title="Başlığın Türkçe özeti (marka/model + kategori)">≈ {gloss}</span>}
              {category && <Badge>{category}</Badge>}
            </div>
          ) : null}
          <div className="mt-3 flex items-end gap-4">
            <div>
              <div className="text-2xl font-semibold tnum">{priceRange(listing.price)}</div>
              {approx !== null ? (
                <div className="text-[12px] text-muted tnum">≈ {money(approx, disp)}</div>
              ) : min !== null && listing.price.currency !== disp ? (
                <div className="text-[12px] text-muted" title={COPY.noRate(listing.price.currency)}>≈ — <span className="text-[11px]">({COPY.noRate(listing.price.currency)})</span></div>
              ) : null}
            </div>
            <div className="text-[12px] text-muted tnum">
              {listing.moq && listing.moq > 1 ? <div>MOQ {listing.moq}</div> : null}
              {soldText(listing) ? <div>{soldText(listing)}</div> : null}
              {listing.rating ? <div>Puan {listing.rating.toFixed(1)}</div> : null}
              {detail.stock !== undefined ? <div>Stok {detail.stock.toLocaleString("tr-TR")}</div> : null}
              {(detail.shippingFrom ?? listing.shipFrom) ? <div>Gönderim {detail.shippingFrom ?? listing.shipFrom}</div> : null}
            </div>
          </div>
          {listing.price.tiers.length > 1 && (
            <ul className="mt-3 flex flex-wrap gap-2 text-[12px]">
              {[...listing.price.tiers].sort((a, b) => a.minQty - b.minQty).map((t, i) => (
                <li key={t.minQty} className={cn("rounded border px-2 py-1 tnum", calc.sc && i === calc.sc.tierIndex ? "border-accent bg-accent/10 text-accent" : "border-border")}>
                  {t.minQty}+ adet · {money(t.unitPrice, listing.price.currency)}
                </li>
              ))}
            </ul>
          )}
          <div className="mt-4 text-[13px]">
            <div className="text-[11px] font-medium uppercase tracking-wide text-muted">Satıcı</div>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              {sellerName ? (
                sellerUrl ? (
                  <a href={sellerUrl} target="_blank" rel="noreferrer noopener" className="font-medium text-accent hover:underline">{sellerName} ↗</a>
                ) : (
                  <span className="font-medium">{sellerName}</span>
                )
              ) : (
                <span className="text-muted" title="Arama kartı satıcı adını taşımıyor; detay çekilince gelir">—</span>
              )}
              {listing.location && <span className="text-muted">· {listing.location}</span>}
              {badges.map((b) => (
                <Badge key={b} tone={b === "verified-factory" ? "success" : "neutral"}>{BADGE_LABELS_TR[b]}</Badge>
              ))}
            </div>
          </div>

          {detail.variants && detail.variants.length > 0 && (
            <div className="mt-4">
              <div className="text-[11px] font-medium uppercase tracking-wide text-muted">Varyantlar</div>
              <dl className="mt-1 space-y-1 text-[13px]">
                {detail.variants.map((v) => (
                  <div key={v.name} className="flex flex-wrap items-baseline gap-2">
                    <dt className="text-muted">{v.name}</dt>
                    <dd className="flex flex-wrap gap-1">
                      {v.options.slice(0, 24).map((o) => (
                        <span key={o} className="rounded border border-border px-1.5 py-0.5 text-[12px]">{o}</span>
                      ))}
                      {v.options.length > 24 && <span className="text-[12px] text-muted">+{v.options.length - 24}</span>}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          )}

          {detailStatus === "loading" && <DetailSkeleton />}
          {detailStatus === "done" && <AttributeTable attrs={detail.attributes!} />}
          {detailStatus === "empty" && adapter && <div className="mt-4 text-[12px] text-muted">{COPY.detail.empty}</div>}
          {detailStatus === "idle" && adapter && (
            <div className="mt-4 text-[12px] text-muted">
              {COPY.detail.idle}{" "}
              <button onClick={() => void loadDetail()} className="text-accent hover:underline">Detayı çek</button>
            </div>
          )}
          {detailStatus === "error" && (
            <div className="mt-4 text-[12px]">
              <DetailErrorLine market={adapter?.id} message={detailError} />
              <button onClick={() => void loadDetail()} className="text-accent hover:underline">Yeniden dene</button>
            </div>
          )}
          {detail.description && (
            <details className="mt-4 text-[13px]">
              <summary className="cursor-pointer select-none text-[11px] font-medium uppercase tracking-wide text-muted">Açıklama</summary>
              <p className="mt-1 whitespace-pre-line leading-relaxed text-muted">{detail.description.slice(0, 4000)}</p>
            </details>
          )}

          {econ && econ.chain.length > 1 && (
            <Card className="mt-5 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-[11px] font-medium uppercase tracking-wide text-muted">
                  Fiyat zinciri · {countryName} · {econ.qty} adet
                </div>
                <Link to="/settings" className="text-[11px] text-accent hover:underline">ayarlar</Link>
              </div>
              <PriceChain steps={econ.chain} className="mt-3" />
              <div className="mt-3 text-[12px] text-muted">
                {isSource ? (
                  econ.sellFrom ? (
                    <>
                      Satış fiyatı: <Link to={`/l/${econ.sellFrom.market}/${econ.sellFrom.id}`} className="text-accent hover:underline">{reg.get(econ.sellFrom.market)?.meta.name} en ucuz yakın eşleşme</Link> ({money(econ.sell ?? 0, cur)}), komisyon {econ.marketplaceId || "—"}.
                    </>
                  ) : comparing ? (
                    "Hedef pazarda yakın bir eşleşme bulununca satış fiyatı ve marj gelir."
                  ) : (
                    "Marj için “Diğer pazarlarda bul ve karşılaştır” ile hedef pazardaki fiyatı bul."
                  )
                ) : (
                  <>
                    Kaynak: <Link to={`/l/${econ.sourceListing.market}/${econ.sourceListing.id}`} className="text-accent hover:underline">{reg.get(econ.sourceListing.market)?.meta.name} en ucuz yakın eşleşme</Link> · bu ilanın fiyatından satışta, komisyon {econ.marketplaceId}.
                  </>
                )}
                {econ.margin && (
                  <span className={cn("ml-2 font-medium", econ.margin.netPerUnit > 0 ? "text-success" : "text-danger")}>
                    net {money(econ.margin.netPerUnit, cur)} ({pct(econ.margin.marginRate)})
                  </span>
                )}
              </div>
            </Card>
          )}
          {!isSource && !bestSource && (
            <Card className="mt-5 p-4 text-[12px] text-muted">
              <div className="text-[11px] font-medium uppercase tracking-wide text-muted">Fırsat kartı</div>
              <p className="mt-1">{comparing ? "Tedarik pazarlarında yakın bir eşleşme bulununca indirilmiş maliyet ve bu fiyattan net marj burada görünür." : "“Diğer pazarlarda bul ve karşılaştır” tedarik kaynağını bulur; indirilmiş maliyet ve bu ilanın fiyatından marj burada görünür."}</p>
            </Card>
          )}
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

      {comparing && (
        <section className="mt-8">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-lg font-semibold tracking-tight">Diğer pazarlarda</h2>
            <Link to={`/search/${compareId}`} className="text-[13px] text-accent hover:underline">
              Tüm sonuçları gör →
            </Link>
          </div>
          <div className="mt-3">
            <MarketPanel
              markets={s.markets}
              notes={s.notes}
              listings={s.listings}
              query={listing.title}
              onRetry={(m) => void s.retryMarket(m)}
              running={s.running}
              onSkipProblem={async (ids) => {
                const stored = await getCompareMarkets();
                const auto = defaultCompareSet({ wave1, enabled, proven: proven.keys(), source: market });
                const next = withoutMarkets(stored, auto, ids);
                await setCompareMarkets(next);
                setCompareMarketsState([...new Set([market, ...next])]);
                setCustomSet(true);
              }}
            />
          </div>
          <details className="mt-2 text-[12px] text-muted">
            <summary className="cursor-pointer select-none">Ne arandı? Pazar başına sorgu merdiveni</summary>
            <ul className="mt-1 grid gap-x-6 gap-y-0.5 sm:grid-cols-2 lg:grid-cols-3">
              {(compareMarkets ?? []).map((m) => {
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
                    <td className="py-2 tnum">{min === null ? "teklif iste" : money(min, listing.price.currency)}</td>
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
      )}
      <CompareDrawer score={(l) => confidence.get(`${l.market}:${l.id}`) ?? scoreCache.current.get(`${listing.title}|${l.market}:${l.id}`)} />
    </div>
  );
}

function AttributeTable({ attrs }: { attrs: Record<string, string> }) {
  const [all, setAll] = useState(false);
  const entries = Object.entries(attrs);
  const shown = all ? entries : entries.slice(0, 24);
  return (
    <div className="mt-4">
      <div className="text-[11px] font-medium uppercase tracking-wide text-muted">Ürün özellikleri · {entries.length}</div>
      <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5 text-[13px]">
        {shown.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-muted">{k}</dt>
            <dd className="break-words">{v}</dd>
          </div>
        ))}
      </dl>
      {entries.length > 24 && (
        <button onClick={() => setAll((v) => !v)} className="mt-1 text-[12px] text-accent hover:underline">{all ? "Daha az göster" : `Tümünü göster (${entries.length})`}</button>
      )}
    </div>
  );
}

function MarketPicker({ reg, selected, proven, wave1, source, onToggle, onReset }: { reg: ReturnType<typeof getRegistry>; selected: MarketId[]; proven: Map<MarketId, number>; wave1: MarketId[]; source: MarketId; onToggle: (m: MarketId) => void; onReset: () => void }) {
  const all = reg.all();
  const groups: { label: string; hint: string; ids: MarketId[] }[] = [
    { label: "Kanıtlı", hint: "bu cihazda daha önce sonuç verdi", ids: all.filter((a) => proven.has(a.id) && a.id !== source).map((a) => a.id) },
    { label: "Ana pazarlar", hint: "canlıda doğrulanmış okuyucular", ids: all.filter((a) => wave1.includes(a.id) && !proven.has(a.id) && a.id !== source).map((a) => a.id) },
    { label: "Beta", hint: "genel kart okuma, doğrulanmadı", ids: all.filter((a) => !wave1.includes(a.id) && !proven.has(a.id) && a.id !== source).map((a) => a.id) },
  ];
  const full = selected.length >= COMPARE_CAP;
  return (
    <Card className="mt-2 p-3 text-[12px]">
      <div className="flex items-center justify-between">
        <span className="text-muted">
          {selected.length}/{COMPARE_CAP} pazar · kaynak pazar her zaman dahil
        </span>
        <button onClick={onReset} className="text-accent hover:underline">otomatiğe dön</button>
      </div>
      {groups.map((g) =>
        g.ids.length ? (
          <div key={g.label} className="mt-2">
            <div className="text-[11px] font-medium uppercase tracking-wide text-muted" title={g.hint}>{g.label}</div>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {g.ids.map((m) => {
                const on = selected.includes(m);
                return (
                  <button key={m} onClick={() => onToggle(m)} disabled={!on && full} className={cn("chip h-7", on && "chip-on", !on && full && "opacity-50")} aria-pressed={on} title={proven.get(m) ? `${proven.get(m)} ilan kayıtlı` : undefined}>
                    {reg.get(m)?.meta.name ?? m}
                    {proven.get(m) ? <span className="ml-1 text-[10px] text-muted">{proven.get(m)}</span> : null}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null,
      )}
    </Card>
  );
}
