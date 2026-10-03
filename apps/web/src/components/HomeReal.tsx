import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { RawListing } from "@manufactogate/core";
import { db, type SearchRecord } from "@/lib/db";
import { relTime } from "@/lib/format";
import { useWatch } from "@/store/watch";
import { ResultCard } from "./ResultCard";
import { Card } from "./ui";

/** Home content in real-data mode: the user's latest real results, watched items and recent searches. */
export function HomeReal() {
  const [recent, setRecent] = useState<SearchRecord[]>([]);
  const [latest, setLatest] = useState<RawListing[]>([]);
  const w = useWatch();
  useEffect(() => {
    void (async () => {
      const searches = await db.searches.orderBy("startedAt").reverse().limit(8).toArray();
      setRecent(searches);
      const last = searches.find((s) => s.clusterCount >= 0);
      if (last) {
        const ls = await db.listings.where("searchId").equals(last.id).toArray();
        setLatest(ls.slice(0, 12));
      }
      await w.load();
    })();
  }, []);
  const describe = (r: SearchRecord) => (r.input.kind === "image" ? (r.input.title ?? "Görsel araması") : r.input.kind === "link" ? r.input.url : r.input.query);
  if (recent.length === 0) {
    return (
      <Card className="mb-5 p-5 text-[13px]">
        <div className="font-medium">Henüz gerçek arama yok</div>
        <p className="mt-1 text-muted">Yukarıdan bir ürün adı yaz, görsel bırak ya da bir Trendyol linki yapıştır. Sonuçlar burada birikir; ilanları projeye ekleyip izleyebilirsin.</p>
      </Card>
    );
  }
  return (
    <div className="mb-6 space-y-6">
      {latest.length > 0 && (
        <section>
          <div className="mb-2 flex items-baseline justify-between">
            <h2 className="text-[12px] font-medium uppercase tracking-wide text-muted">Son aramandan · {describe(recent[0]!)}</h2>
            <Link to={`/search/${recent[0]!.id}`} className="text-[12px] text-accent hover:underline">Tümünü gör →</Link>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
            {latest.map((l) => (
              <ResultCard key={`${l.market}:${l.id}`} listing={l} />
            ))}
          </div>
        </section>
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
            {w.watches.slice(0, 6).map((x) => (
              <Link key={x.listingKey} to={`/l/${x.market}/${x.listingId}`} className="flex items-center gap-3 px-3 py-2 text-[13px] hover:bg-surface-2">
                <span className="min-w-0 flex-1 truncate">{x.title}</span>
                <span className="tnum">{x.lastPrice.toLocaleString("tr-TR")} {x.currency}</span>
              </Link>
            ))}
          </Card>
        </section>
      </div>
    </div>
  );
}
