import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { getLeaves } from "@manufactogate/adapters";
import { buildFeed, type FeedSections } from "@/lib/feed";
import { db, type SearchRecord } from "@/lib/db";
import { money, relTime } from "@/lib/format";
import { useSearch } from "@/store/search";
import { useSettings } from "@/store/settings";
import { useWatch } from "@/store/watch";
import { ResultCard } from "./ResultCard";
import { Card, cn } from "./ui";

/** Home in real-data mode: an algorithmic discover feed over everything pulled so far. */
export function HomeReal() {
  const [feed, setFeed] = useState<FeedSections | null>(null);
  const [recent, setRecent] = useState<SearchRecord[]>([]);
  const w = useWatch();
  const nav = useNavigate();
  const start = useSearch((s) => s.start);
  const running = useSearch((s) => s.running);
  const enabled = useSettings((s) => s.enabledMarkets);
  const targetCountry = useSettings((s) => s.targetCountry);

  useEffect(() => {
    void (async () => {
      setFeed(await buildFeed(targetCountry));
      setRecent(await db.searches.orderBy("startedAt").reverse().limit(8).toArray());
      await w.load();
    })();
  }, [targetCountry]);

  const describe = (r: SearchRecord) => (r.input.kind === "image" ? (r.input.title ?? "Görsel araması") : r.input.kind === "link" ? r.input.url : r.input.query);
  const go = async (q: string) => {
    if (running) return;
    const id = await start({ kind: "text", query: q }, enabled);
    nav(`/search/${id}`);
  };

  if (!feed) return null;
  if (feed.stats.listings === 0) {
    const starters = ["kablosuz kulaklık", "motosiklet kaskı", "airfryer", "akıllı saat", "yoga matı", "köpek tasması"];
    return (
      <Card className="mb-6 p-6">
        <div className="text-lg font-semibold tracking-tight">Feed'in henüz boş</div>
        <p className="mt-1 text-muted">İlk aramandan sonra burası dolar: öne çıkanlar, marj adayları, çok satanlar. Hemen başlamak için bir fikir seç:</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {starters.map((s) => (
            <button key={s} onClick={() => void go(s)} className="chip">{s}</button>
          ))}
        </div>
      </Card>
    );
  }

  return (
    <div className="mb-8 space-y-8">
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-[12px] text-muted">
        <span><b className="text-text tnum">{feed.stats.listings.toLocaleString("tr-TR")}</b> gerçek ilan</span>
        <span><b className="text-text tnum">{feed.stats.markets}</b> pazar</span>
        <span><b className="text-text tnum">{feed.stats.searches}</b> arama</span>
        <span><b className="text-text tnum">{w.watches.length}</b> izlenen</span>
      </div>

      {feed.marginPicks.length > 0 && (
        <Section title="Marj adayları" hint="Tedarik fiyatı ile hedef pazardaki benzerin fiyatı arasında en az 2× fark" to="/search">
          {feed.marginPicks.map((m) => (
            <div key={`${m.listing.market}:${m.listing.id}`} className="relative">
              <ResultCard listing={m.listing} />
              <span className="absolute right-2 top-2 rounded-md bg-success px-1.5 py-0.5 text-[11px] font-semibold text-white tnum">×{m.ratio.toFixed(1)} · {money(m.targetPrice, "TRY")}</span>
            </div>
          ))}
        </Section>
      )}

      <Section title="Öne çıkanlar" hint="Tazelik, satış, puan ve pazar çeşitliliğine göre">
        {feed.featured.map((l) => (
          <ResultCard key={`${l.market}:${l.id}`} listing={l} />
        ))}
      </Section>

      {feed.categories.length > 0 && (
        <div>
          <h2 className="mb-2 text-[12px] font-medium uppercase tracking-wide text-muted">Senin kategorilerin</h2>
          <div className="flex flex-wrap gap-2">
            {feed.categories.map((c) => (
              <button key={c.key} onClick={() => void go(getLeaves().find((l) => l.key === c.key)?.tr ?? c.tr)} className="chip">
                {c.tr} <span className="ml-1 text-muted tnum">{c.count}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {feed.bestSellers.length > 0 && (
        <Section title="Çok satanlar" hint="Pazarın bildirdiği satış adedine göre">
          {feed.bestSellers.map((l) => (
            <ResultCard key={`${l.market}:${l.id}`} listing={l} />
          ))}
        </Section>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <section>
          <h2 className="mb-2 text-[12px] font-medium uppercase tracking-wide text-muted">Son aramalar</h2>
          <Card className="divide-y divide-border">
            {recent.map((r) => (
              <Link key={r.id} to={`/search/${r.id}`} className="flex items-center gap-3 px-3 py-2 text-[13px] hover:bg-surface-2">
                <div className="h-8 w-8 shrink-0 overflow-hidden rounded border border-border bg-surface-2">{r.thumb && <img src={r.thumb} alt="" className="h-full w-full object-cover" />}</div>
                <span className="min-w-0 flex-1 truncate">{describe(r)}</span>
                <span className="text-[12px] text-muted">{relTime(r.startedAt)}</span>
              </Link>
            ))}
          </Card>
        </section>
        <section>
          <div className="mb-2 flex items-baseline justify-between">
            <h2 className="text-[12px] font-medium uppercase tracking-wide text-muted">İzlenenler</h2>
            <Link to="/watchlist" className="text-[12px] text-accent hover:underline">İzleme listesi →</Link>
          </div>
          <Card className="divide-y divide-border">
            {w.watches.length === 0 && <div className="px-3 py-2 text-[13px] text-muted">Bir ürün sayfasında “İzle” de, fiyatı burada takip et.</div>}
            {w.watches.slice(0, 6).map((x) => {
              const d = x.lastPrice - x.firstPrice;
              return (
                <Link key={x.listingKey} to={`/l/${x.market}/${x.listingId}`} className="flex items-center gap-3 px-3 py-2 text-[13px] hover:bg-surface-2">
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

function Section({ title, hint, children }: { title: string; hint?: string; to?: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-2 flex items-baseline gap-3">
        <h2 className="text-base font-semibold tracking-tight">{title}</h2>
        {hint && <span className="text-[12px] text-muted">{hint}</span>}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">{children}</div>
    </section>
  );
}
