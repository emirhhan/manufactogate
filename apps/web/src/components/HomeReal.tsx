import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { getLeaves } from "@manufactogate/adapters";
import { buildFeed, EMPTY_FEED, feedLimitFor, whenIdle, type FeedSections } from "@/lib/feed";
import { db, type SearchRecord } from "@/lib/db";
import { money, relTime } from "@/lib/format";
import { toDisplay, getDisplayCurrency } from "@/lib/fx";
import { useSearch } from "@/store/search";
import { useSettings } from "@/store/settings";
import { computeAlerts, useWatch } from "@/store/watch";
import { ResultCard } from "./ResultCard";
import { Card, SectionHeader, SkeletonGrid, cn } from "./ui";

/** Home in real-data mode: an algorithmic discover feed over everything pulled so far. */
export function HomeReal() {
  const [feed, setFeed] = useState<FeedSections | null>(null);
  const [recent, setRecent] = useState<SearchRecord[]>([]);
  const watches = useWatch((s) => s.watches);
  const loadWatches = useWatch((s) => s.load);
  const nav = useNavigate();
  const start = useSearch((s) => s.start);
  const running = useSearch((s) => s.running);
  const enabled = useSettings((s) => s.enabledMarkets);
  const targetCountry = useSettings((s) => s.targetCountry);
  const displayCurrency = useSettings((s) => s.displayCurrency);
  const limit = typeof window === "undefined" ? 12 : feedLimitFor(window.innerWidth);
  const alerts = useMemo(() => computeAlerts(watches), [watches]);

  useEffect(() => {
    let alive = true;
    // Let the page paint first; the feed is computed when the browser is idle.
    void whenIdle(async () => {
      try {
        const f = await buildFeed(targetCountry, limit);
        if (alive) setFeed(f);
      } catch (e) {
        console.error("feed", e);
        if (alive) setFeed(EMPTY_FEED);
      }
      try {
        const rows = await db.searches.orderBy("startedAt").reverse().limit(8).toArray();
        if (alive) setRecent(rows);
      } catch {
        /* storage unavailable */
      }
      await loadWatches();
    });
    return () => {
      alive = false;
    };
  }, [targetCountry, limit, running, loadWatches]);

  const describe = (r: SearchRecord) => (r.input.kind === "image" ? (r.input.title ?? "Görsel araması") : r.input.kind === "link" ? r.input.url : r.input.query);
  const go = async (q: string) => {
    if (running || !enabled.length) return;
    const id = await start({ kind: "text", query: q }, enabled);
    nav(`/search/${id}`);
  };

  if (!feed) {
    return (
      <div className="mb-8 space-y-4">
        <div className="skeleton h-4 w-64" />
        <SkeletonGrid count={6} className="xl:grid-cols-6" />
      </div>
    );
  }
  if (feed.stats.listings === 0) {
    const starters = ["kablosuz kulaklık", "motosiklet kaskı", "airfryer", "akıllı saat", "yoga matı", "köpek tasması"];
    return (
      <Card className="mb-6 p-6">
        <div className="text-lg font-semibold tracking-tight">Feed'in henüz boş</div>
        <p className="mt-1 text-muted">İlk aramandan sonra burası dolar: öne çıkanlar, marj adayları, çok satanlar, pazar rayları. Hemen başlamak için bir fikir seç:</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {starters.map((s) => (
            <button key={s} type="button" onClick={() => void go(s)} disabled={running || !enabled.length} className="chip disabled:opacity-50">{s}</button>
          ))}
        </div>
      </Card>
    );
  }

  const approx = (amount: number, currency: string) => {
    const d = toDisplay(amount, currency);
    return d !== null && currency !== getDisplayCurrency() ? ` ≈ ${money(d, displayCurrency)}` : "";
  };

  return (
    <div className="mb-8 space-y-8">
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-[12px] text-muted">
        <span><b className="text-text tnum">{feed.stats.listings.toLocaleString("tr-TR")}</b> gerçek ilan</span>
        <span><b className="text-text tnum">{feed.stats.markets}</b> pazar</span>
        <span><b className="text-text tnum">{feed.stats.searches}</b> arama</span>
        <span><b className="text-text tnum">{feed.stats.thisWeek.toLocaleString("tr-TR")}</b> bu hafta</span>
        <span><b className="text-text tnum">{watches.length}</b> izlenen</span>
        <Link to="/dashboard" className="ml-auto text-accent hover:underline">Panel →</Link>
      </div>

      {alerts.length > 0 && (
        <Section title="Fiyat düştü" hint="İzlediğin ilanlarda son kontrolde fiyat geriledi veya hedefine ulaştı" to="/watchlist" toLabel="İzleme listesi">
          {alerts.slice(0, limit).map((a) => (
            <Link key={a.watch.listingKey} to={`/l/${a.watch.market}/${encodeURIComponent(a.watch.listingId)}`} className="card-lift flex gap-3 rounded-xl border border-border bg-surface p-3 text-[13px]">
              <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-surface-2">{a.watch.image && <img src={a.watch.image} alt="" className="h-full w-full object-cover" loading="lazy" />}</div>
              <div className="min-w-0">
                <div className="line-clamp-2 leading-snug">{a.watch.title}</div>
                <div className="mt-1 font-medium tnum">{money(a.watch.lastPrice, a.watch.currency)} <span className="text-success">{money(a.delta, a.watch.currency)}</span></div>
                <div className="text-[11px] text-muted">{a.kind === "target" ? `hedef ${money(a.reference, a.watch.currency)}` : `önceki ${money(a.reference, a.watch.currency)}`}</div>
              </div>
            </Link>
          ))}
        </Section>
      )}

      {feed.marginPicks.length > 0 && (
        <Section title="Marj adayları" hint="Aynı ürün (görsel eşleşmesi ≥%85 veya güçlü başlık örtüşmesi) hedef pazarda en az 2× fiyata satılıyor">
          {feed.marginPicks.map((m) => (
            <div key={`${m.listing.market}:${m.listing.id}`} className="relative">
              <ResultCard listing={m.listing} />
              <Link
                to={`/l/${m.target.market}/${encodeURIComponent(m.target.id)}`}
                className="absolute right-2 top-2 rounded-md bg-success px-1.5 py-0.5 text-[11px] font-semibold text-white tnum hover:opacity-90"
                title={`Eşleşme %${Math.round(m.matchScore * 100)} · hedef pazarda ${money(m.targetPrice, m.targetCurrency)}${approx(m.targetPrice, m.targetCurrency)} · ×${m.ratio.toFixed(1)}`}
              >
                ×{m.ratio.toFixed(1)} · {money(m.targetPrice, m.targetCurrency)}
              </Link>
            </div>
          ))}
        </Section>
      )}

      {feed.featured.length > 0 && (
        <Section title="Öne çıkanlar" hint="Tazelik, satış, puan ve pazar çeşitliliğine göre">
          {feed.featured.map((f) => (
            <div key={`${f.listing.market}:${f.listing.id}`} className="relative">
              <ResultCard listing={f.listing} />
              <span className="pointer-events-none absolute left-2 top-2 max-w-[85%] truncate rounded-md bg-overlay px-1.5 py-0.5 text-[11px] font-medium text-overlay-fg" title={f.reason}>{f.reason}</span>
            </div>
          ))}
        </Section>
      )}

      {feed.categories.length > 0 && (
        <div>
          <h2 className="mb-2 text-[12px] font-medium uppercase tracking-wide text-muted">Senin kategorilerin</h2>
          <div className="flex flex-wrap gap-2">
            {feed.categories.map((c) => (
              <button key={c.key} type="button" onClick={() => void go(getLeaves().find((l) => l.key === c.key)?.tr ?? c.tr)} className="chip" disabled={running || !enabled.length}>
                {c.tr} <span className="ml-1 text-muted tnum">{c.count}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {feed.supplyDeals.length > 0 && (
        <Section title="Tedarik fırsatları" hint="MOQ ≤ 10, fabrika rozeti ya da kademeli fiyat">
          {feed.supplyDeals.map((l) => (
            <ResultCard key={`${l.market}:${l.id}`} listing={l} />
          ))}
        </Section>
      )}

      {feed.targetBestSellers.length > 0 && (
        <Section title="Hedef pazarda çok satanlar" hint="Satış ve değerlendirme sayısına göre, hedef ülke pazarlarından">
          {feed.targetBestSellers.map((l) => (
            <ResultCard key={`${l.market}:${l.id}`} listing={l} />
          ))}
        </Section>
      )}

      {feed.bestSellers.length > 0 && (
        <Section title="Çok satanlar" hint="Pazarın bildirdiği satış adedine göre">
          {feed.bestSellers.map((l) => (
            <ResultCard key={`${l.market}:${l.id}`} listing={l} />
          ))}
        </Section>
      )}

      {feed.fresh.length > 0 && (
        <Section title="Bu hafta" hint={feed.stats.thisWeek ? `${feed.stats.thisWeek.toLocaleString("tr-TR")} yeni ilan` : "En son çekilenler"}>
          {feed.fresh.map((l) => (
            <ResultCard key={`${l.market}:${l.id}`} listing={l} />
          ))}
        </Section>
      )}

      {feed.rails.map((r) => (
        <section key={r.market}>
          <SectionHeader title={r.name} hint={`${r.count.toLocaleString("tr-TR")} ilan`} to={`/?q=&market=${r.market}`} toLabel="Katalogda" />
          <div className="rail">
            {r.items.map((l) => (
              <ResultCard key={`${l.market}:${l.id}`} listing={l} />
            ))}
          </div>
        </section>
      ))}

      <div className="grid gap-4 md:grid-cols-2">
        <section>
          <SectionHeader title="Son aramalar" to="/history" toLabel="Geçmiş" />
          <Card className="divide-y divide-border">
            {recent.length === 0 && <div className="px-3 py-2 text-[13px] text-muted">Henüz arama yok.</div>}
            {recent.map((r) => (
              <Link key={r.id} to={`/search/${r.id}`} className="flex items-center gap-3 px-3 py-2 text-[13px] hover:bg-surface-2">
                <div className="h-8 w-8 shrink-0 overflow-hidden rounded border border-border bg-surface-2">{r.thumb && <img src={r.thumb} alt="" className="h-full w-full object-cover" />}</div>
                <span className="min-w-0 flex-1 truncate">{describe(r)}</span>
                {r.resultCount !== undefined && <span className="text-[12px] text-muted tnum">{r.resultCount} sonuç</span>}
                <span className="w-20 text-right text-[12px] text-muted">{relTime(r.startedAt)}</span>
              </Link>
            ))}
          </Card>
        </section>
        <section>
          <SectionHeader title="İzlenenler" to="/watchlist" toLabel="İzleme listesi" />
          <Card className="divide-y divide-border">
            {watches.length === 0 && <div className="px-3 py-2 text-[13px] text-muted">Bir ürün sayfasında “İzle” de, fiyatı burada takip et.</div>}
            {watches.slice(0, 6).map((x) => {
              const d = x.lastPrice - x.firstPrice;
              return (
                <Link key={x.listingKey} to={`/l/${x.market}/${encodeURIComponent(x.listingId)}`} className="flex items-center gap-3 px-3 py-2 text-[13px] hover:bg-surface-2">
                  <span className="min-w-0 flex-1 truncate">{x.title}</span>
                  <span className={cn("tnum", d < 0 ? "text-success" : d > 0 ? "text-danger" : "")}>{money(x.lastPrice, x.currency)}</span>
                </Link>
              );
            })}
          </Card>
        </section>
      </div>
    </div>
  );
}

function Section({ title, hint, to, toLabel, children }: { title: string; hint?: string; to?: string; toLabel?: string; children: React.ReactNode }) {
  return (
    <section>
      <SectionHeader title={title} hint={hint} to={to} toLabel={toLabel} />
      <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3 sm:grid-cols-[repeat(auto-fill,minmax(180px,1fr))]">{children}</div>
    </section>
  );
}
