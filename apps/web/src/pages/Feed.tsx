import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { TAXONOMY } from "@manufactogate/adapters";
import { Pagination } from "@/components/Pagination";
import { ProductCard } from "@/components/ProductCard";
import { SearchBox } from "@/components/SearchBox";
import { Empty, cn } from "@/components/ui";
import { groupOf, leafOf, leavesOf, queryFeed, type SortKey } from "@/lib/catalog";
import { useSearch } from "@/store/search";
import { useSettings } from "@/store/settings";
import { getDataSource } from "@/lib/registry";
import { HomeReal } from "@/components/HomeReal";

const SORTS: { key: SortKey; label: string }[] = [
  { key: "popular", label: "Popüler" },
  { key: "price-asc", label: "Fiyat artan" },
  { key: "price-desc", label: "Fiyat azalan" },
  { key: "margin", label: "Marj potansiyeli" },
];

/**
 * Catalog feed: 30 products per page, filtered by group or leaf category and free text.
 * Routes: "/", "/c/:group", "/c/:group/:leaf". Query: ?q=&sort=&page=
 */
export function Feed() {
  const { group: groupKey, leaf: leafKey } = useParams();
  const [sp, setSp] = useSearchParams();
  const nav = useNavigate();
  const start = useSearch((s) => s.start);
  const running = useSearch((s) => s.running);
  const enabled = useSettings((s) => s.enabledMarkets);

  const q = sp.get("q") ?? "";
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
  const feed = useMemo(() => queryFeed(fq), [fq]);

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

  useEffect(() => {
    document.title = leaf ? `${leaf.tr} · Manufactogate` : group ? `${group.tr} · Manufactogate` : "Manufactogate";
  }, [leaf, group]);

  const real = getDataSource() === "extension";
  // In real-data mode a category is a live search across the enabled markets, not a mock catalog page.
  useEffect(() => {
    if (!real || !leaf || running) return;
    const q = leaf.tr;
    void start({ kind: "text", query: q }, enabled).then((id) => nav(`/search/${id}`, { replace: true }));
  }, [real, leafKey]);

  return (
    <div className="mx-auto max-w-[1440px] px-4 py-5">
      {/* Hero search: image, link or text across the enabled markets */}
      {!groupKey && !q && (
        <div className="mb-5 overflow-hidden rounded-2xl border border-border bg-[linear-gradient(135deg,var(--surface)_0%,var(--surface-2)_100%)] p-6 sm:p-8">
          <div className="max-w-[760px]">
            <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-accent">Çok pazarlı tedarik araştırması</div>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Ürünü bul, kaynağına in, maliyetini gör.</h1>
            <p className="mt-2 text-muted">Bir görsel, bir ürün linki ya da ürün adı. 1688, Taobao, Pinduoduo ve Trendyol'da aynı ürün aranır; fiyatlar, tedarikçiler ve Türkiye'ye indirilmiş maliyet yan yana gelir.</p>
          </div>
          <div className="mt-5">
            <SearchBox
              busy={running}
              onSubmit={async (input, thumb) => {
                const id = await start(input, enabled, thumb);
                nav(`/search/${id}`);
              }}
            />
          </div>
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[12px] text-muted">
            <span>● Kendi oturumunla, sunucusuz</span>
            <span>● 430 kategori, 4 pazar, 5 beta pazar</span>
            <span>● Görselle arama: 1688, Taobao, Trendyol</span>
          </div>
        </div>
      )}
      {real && !groupKey && !q && <HomeReal />}
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
              <p className="mt-1 text-muted">Bir kategori seçmek seçili pazarlarda canlı arama başlatır. Aşağıdaki katalog yalnızca örnektir.</p>
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
                      {l.tr}
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
                      <span className="text-[11px] tnum">{g.leaves.length}</span>
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
              </h1>
              <div className="text-[12px] text-muted tnum">
                {feed.total.toLocaleString("tr-TR")} ürün · sayfa {feed.page}/{feed.pages}
              </div>
            </div>
            <form
              className="ml-auto flex items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                setParam("q", draft.trim());
              }}
            >
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={leaf ? `${leaf.tr} içinde ara` : group ? `${group.tr} içinde ara` : "Ürün, model veya kategori ara"}
                className="h-9 w-64 rounded-md border border-border bg-bg px-3 text-[13px] outline-none placeholder:text-muted focus:border-accent"
              />
              <select value={sort} onChange={(e) => setParam("sort", e.target.value)} className="h-9 rounded-md border border-border bg-surface px-2 text-[13px]">
                {SORTS.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </select>
            </form>
          </div>

          {feed.items.length === 0 ? (
            <div className="mt-6">
              <Empty title="Bu filtrelerle ürün yok" hint="Arama terimini kısalt veya üst kategoriye dön." />
            </div>
          ) : (
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
              {feed.items.map((it) => (
                <ProductCard key={it.product.id} item={it} />
              ))}
            </div>
          )}
          <div className="mt-6">
            <Pagination page={feed.page} pages={feed.pages} onPage={onPage} />
          </div>
        </main>
      </div>
    </div>
  );
}
