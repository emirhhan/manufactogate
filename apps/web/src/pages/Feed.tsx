import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { TAXONOMY } from "@manufactogate/adapters";
import { COUNTRY_NAMES_TR } from "@manufactogate/country-profiles";
import { HomeReal } from "@/components/HomeReal";
import { Onboarding } from "@/components/Onboarding";
import { Pagination } from "@/components/Pagination";
import { ProductCard } from "@/components/ProductCard";
import { ResultCard } from "@/components/ResultCard";
import { SearchBox } from "@/components/SearchBox";
import { Button, Empty, Input, Select, SkeletonGrid, cn, usePageTitle } from "@/components/ui";
import { groupOf, leafOf, leavesOf, queryFeed, type SortKey } from "@/lib/catalog";
import { listingsWriteVersion } from "@/lib/db";
import { money } from "@/lib/format";
import { getRegistry } from "@/lib/registry";
import { loadRealCatalog, queryRealCatalog, type Classified, type RealFeedPage } from "@/lib/realCatalog";
import { useExtension } from "@/store/extension";
import { useSearch } from "@/store/search";
import { useSettings } from "@/store/settings";

const SORTS: { key: SortKey; label: string }[] = [
  { key: "popular", label: "Popüler" },
  { key: "price-asc", label: "Fiyat artan" },
  { key: "price-desc", label: "Fiyat azalan" },
  { key: "margin", label: "Marj potansiyeli" },
];

/** Hero facts derived from the registry instead of hardcoded copy. */
function heroFacts(enabledIds: string[], targetCountry: string) {
  const reg = getRegistry();
  const all = reg.all();
  const beta = all.filter((a) => a.meta.version.includes("beta")).length;
  const img = all.filter((a) => a.meta.capabilities.imageSearch && !a.meta.version.includes("beta")).map((a) => a.meta.name);
  const enabled = enabledIds.map((id) => reg.get(id as never)?.meta.name).filter((n): n is string => !!n);
  const country = COUNTRY_NAMES_TR[targetCountry] ?? targetCountry.toUpperCase();
  return { total: all.length, beta, img, enabled, country };
}

/**
 * Catalog feed: 30 products per page, filtered by group or leaf category and free text.
 * Routes: "/", "/c/:group", "/c/:group/:leaf". Query: ?q=&sort=&page=&market=
 */
export function Feed() {
  const { group: groupKey, leaf: leafKey } = useParams();
  const [sp, setSp] = useSearchParams();
  const nav = useNavigate();
  const start = useSearch((s) => s.start);
  const running = useSearch((s) => s.running);
  const enabled = useSettings((s) => s.enabledMarkets);
  const targetCountry = useSettings((s) => s.targetCountry);
  const dataSource = useExtension((s) => s.dataSource);
  const real = dataSource === "extension";

  const q = sp.get("q") ?? "";
  const market = sp.get("market") ?? "";
  const sort = (sp.get("sort") as SortKey | null) ?? "popular";
  const page = Number(sp.get("page") ?? "1") || 1;
  const [draft, setDraft] = useState(q);
  useEffect(() => setDraft(q), [q]);

  const group = groupKey ? groupOf(groupKey) : undefined;
  const leaf = leafKey ? leafOf(leafKey) : undefined;
  const fq = useMemo(() => {
    const o: Parameters<typeof queryFeed>[0] = { sort, page };
    if (q) o.q = q;
    if (groupKey) o.group = groupKey;
    if (leafKey) o.leaf = leafKey;
    return o;
  }, [q, sort, page, groupKey, leafKey]);
  const feed = useMemo(() => (real ? null : queryFeed(fq)), [fq, real]);

  const setParam = (k: string, v: string | null, resetPage = true) => {
    const next = new URLSearchParams(sp);
    if (v === null || v === "") next.delete(k);
    else next.set(k, v);
    if (resetPage) next.delete("page");
    setSp(next);
  };
  const onPage = (p: number) => {
    setParam("page", String(p), false);
    window.scrollTo({ top: 0 });
  };

  usePageTitle(leaf ? leaf.tr : group ? group.tr : q ? `“${q}”` : undefined);

  // Real-data mode: the catalog is every listing pulled so far, classified into the taxonomy on this device.
  const [realItems, setRealItems] = useState<Classified[] | null>(null);
  const [realLoading, setRealLoading] = useState(false);
  const writeVersion = listingsWriteVersion();
  useEffect(() => {
    if (!real) return;
    let alive = true;
    setRealLoading(true);
    void loadRealCatalog(targetCountry)
      .then((it) => alive && setRealItems(it))
      .finally(() => alive && setRealLoading(false));
    return () => {
      alive = false;
    };
    // Re-classify when listings were written (a finished search bumps the version) and when the target changes.
  }, [real, running, writeVersion, targetCountry]);
  const realFeed: RealFeedPage | null = useMemo(() => {
    if (!real || !realItems) return null;
    const items = market ? realItems.filter((it) => it.listing.market === market) : realItems;
    return queryRealCatalog(items, fq);
  }, [real, realItems, fq, market]);
  const liveSearch = async () => {
    if (running || !enabled.length) return;
    const query = q || leaf?.tr || group?.tr;
    if (!query) return;
    const id = await start({ kind: "text", query }, enabled);
    nav(`/search/${id}`);
  };
  const total = realFeed ? realFeed.total : (feed?.total ?? 0);
  const pageNo = realFeed ? realFeed.page : (feed?.page ?? 1);
  const pages = realFeed ? realFeed.pages : (feed?.pages ?? 1);
  const facts = useMemo(() => heroFacts(enabled, targetCountry), [enabled, targetCountry]);
  const showHero = !groupKey && !q;
  const sorts = real && realFeed && realFeed.withMargin === 0 ? SORTS.filter((s) => s.key !== "margin") : SORTS;
  const marketName = market ? (getRegistry().get(market as never)?.meta.name ?? market) : "";

  return (
    <div className="mx-auto max-w-[1440px] px-4 py-5">
      {showHero && (
        <div className="hero mb-5 rounded-2xl border border-border p-6 sm:p-8">
          <div className="relative max-w-[760px]">
            <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-accent">Çok pazarlı tedarik araştırması</div>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Ürünü bul, kaynağına in, maliyetini gör.</h1>
            <p className="mt-2 text-muted">
              Bir görsel, bir ürün linki ya da ürün adı. {facts.enabled.length ? `${facts.enabled.slice(0, 4).join(", ")}${facts.enabled.length > 4 ? ` ve ${facts.enabled.length - 4} pazar daha` : ""}` : "Seçili pazarlar"}
              {"'"}da aynı ürün aranır; fiyatlar, tedarikçiler ve {facts.country}{"'"}ye indirilmiş maliyet yan yana gelir.
            </p>
          </div>
          <div className="relative mt-5">
            <SearchBox
              busy={running}
              marketCount={enabled.length}
              onLink={(url) => nav(`/l/resolve/${encodeURIComponent(url)}?compare=1`)}
              onSubmit={async (input, thumb) => {
                const id = await start(input, enabled, thumb);
                nav(`/search/${id}`);
              }}
            />
          </div>
          <div className="relative mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[12px] text-muted">
            <span>● Kendi oturumunla, sunucusuz</span>
            <span>● {facts.total} pazar ({facts.beta} beta) · <Link to="/settings" className="text-accent hover:underline">{enabled.length} açık</Link></span>
            <span>● Görselle arama: {facts.img.join(", ")}</span>
          </div>
        </div>
      )}
      {showHero && <Onboarding className="mb-5" />}
      {real && showHero && <HomeReal />}
      {/* Category rail */}
      <div className="-mx-4 mb-4 overflow-x-auto border-b border-border px-4 pb-3">
        <div className="flex gap-1.5 whitespace-nowrap text-[13px]">
          <Link to="/categories" className="chip font-medium">
            ☰ Tüm kategoriler
          </Link>
          <Link to="/" className={cn("chip", !groupKey && "chip-on")}>
            Hepsi
          </Link>
          {TAXONOMY.map((g) => (
            <Link key={g.key} to={`/c/${g.key}`} className={cn("chip", groupKey === g.key && "chip-on")}>
              {g.tr}
            </Link>
          ))}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
        {/* Sidebar */}
        <aside className="space-y-5 text-[13px]">
          {real && (
            <div className="rounded-lg border border-accent/30 bg-accent/5 p-3 text-[12px]">
              <div className="font-medium text-accent">Gerçek veri modu</div>
              <p className="mt-1 text-muted">Katalog, pazarlardan çektiğin {realItems ? realItems.length.toLocaleString("tr-TR") : "…"} gerçek ilandan oluşur ve kategoriye göre süzülür. Daha fazlası için canlı arama başlat.</p>
              {market && (
                <button type="button" onClick={() => setParam("market", null)} className="mt-2 text-accent hover:underline">
                  Pazar süzgecini kaldır ({marketName}) ✕
                </button>
              )}
            </div>
          )}
          {group ? (
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <Link to={`/c/${group.key}`} className="font-medium hover:underline">
                  {group.tr}
                </Link>
                <span className="text-[11px] text-muted">{group.zh}</span>
              </div>
              <ul className="max-h-[70vh] space-y-0.5 overflow-y-auto pr-1">
                {leavesOf(group.key).map((l) => (
                  <li key={l.key}>
                    <Link
                      to={`/c/${group.key}/${l.key}${q ? `?q=${encodeURIComponent(q)}` : ""}`}
                      className={cn("block rounded-md px-2 py-1", leafKey === l.key ? "bg-surface-2 font-medium" : "text-muted hover:bg-surface-2 hover:text-text")}
                    >
                      <span className="flex justify-between gap-2"><span>{l.tr}</span>{realFeed && realFeed.leafCounts[l.key] ? <span className="text-[11px] text-muted tnum">{realFeed.leafCounts[l.key]}</span> : null}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div>
              <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted">Kategoriler</div>
              <ul className="space-y-0.5">
                {TAXONOMY.map((g) => (
                  <li key={g.key}>
                    <Link to={`/c/${g.key}`} className="flex justify-between rounded-md px-2 py-1 text-muted hover:bg-surface-2 hover:text-text">
                      <span>{g.tr}</span>
                      <span className="text-[11px] tnum">{realFeed ? (realFeed.groupCounts[g.key] ?? 0) : g.leaves.length}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>

        {/* Main */}
        <main>
          <div className="flex flex-wrap items-center gap-3">
            <div className="min-w-0">
              <h1 className="text-lg font-semibold tracking-tight">
                {leaf ? leaf.tr : group ? group.tr : "Katalog"}
                {q && <span className="text-muted"> · “{q}”</span>}
                {market && <span className="text-muted"> · {marketName}</span>}
              </h1>
              <div className="text-[12px] text-muted tnum">
                {realLoading && !realFeed ? "gerçek ilanlar sınıflandırılıyor…" : `${total.toLocaleString("tr-TR")} ürün · sayfa ${pageNo}/${pages}${realFeed ? " · gerçek ilanlar" : ""}`}
              </div>
            </div>
            <form
              className="ml-auto flex flex-wrap items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                setParam("q", draft.trim());
              }}
            >
              <Input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                aria-label="Katalogda ara"
                placeholder={leaf ? `${leaf.tr} içinde ara` : group ? `${group.tr} içinde ara` : "Ürün, model veya kategori ara"}
                className="w-56 sm:w-64"
              />
              {real && (leaf || group || q) && (
                <Button variant="primary" type="button" onClick={() => void liveSearch()} disabled={running || !enabled.length} title={!enabled.length ? "Önce Ayarlar'dan pazar aç" : undefined}>
                  {running ? "Aranıyor…" : `Pazarlarda canlı ara`}
                </Button>
              )}
              <Select value={sorts.some((s) => s.key === sort) ? sort : "popular"} onChange={(e) => setParam("sort", e.target.value)} aria-label="Sıralama" className="w-auto">
                {sorts.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </Select>
            </form>
          </div>

          {real ? (
            !realFeed ? (
              <div className="mt-4">
                <SkeletonGrid count={10} />
              </div>
            ) : realFeed.items.length === 0 ? (
              <div className="mt-6">
                <Empty
                  title={realItems && realItems.length === 0 ? "Henüz gerçek ilan yok" : "Bu kategoride henüz gerçek ilan yok"}
                  hint={enabled.length ? "“Pazarlarda canlı ara” ile seçili pazarlardan çek; sonuçlar buraya da düşer." : "Önce Ayarlar'dan en az bir pazar aç."}
                  action={(leaf || group || q) && enabled.length ? <Button variant="primary" onClick={() => void liveSearch()} disabled={running}>Pazarlarda canlı ara</Button> : undefined}
                />
              </div>
            ) : (
              <div className="mt-4 grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3 sm:grid-cols-[repeat(auto-fill,minmax(190px,1fr))]">
                {realFeed.items.map((l) => {
                  const m = realFeed.margins[`${l.market}:${l.id}`];
                  return (
                    <div key={`${l.market}:${l.id}`} className="relative">
                      <ResultCard listing={l} />
                      {m && sort === "margin" && (
                        <span className="pointer-events-none absolute right-2 top-2 rounded-md bg-success px-1.5 py-0.5 text-[11px] font-semibold text-white tnum" title={`Hedef pazarda ${money(m.targetPrice, m.targetCurrency)} · eşleşme %${Math.round(m.matchScore * 100)}`}>
                          ×{m.ratio.toFixed(1)}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )
          ) : !feed || feed.items.length === 0 ? (
            <div className="mt-6">
              <Empty title="Bu filtrelerle ürün yok" hint="Arama terimini kısalt veya üst kategoriye dön." />
            </div>
          ) : (
            <div className="mt-4 grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3 sm:grid-cols-[repeat(auto-fill,minmax(190px,1fr))]">
              {feed.items.map((it) => (
                <ProductCard key={it.product.id} item={it} />
              ))}
            </div>
          )}
          <div className="mt-6">
            <Pagination page={pageNo} pages={pages} onPage={onPage} />
          </div>
        </main>
      </div>
    </div>
  );
}
