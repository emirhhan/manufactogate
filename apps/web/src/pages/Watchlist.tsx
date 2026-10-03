import { useEffect } from "react";
import { Link } from "react-router-dom";
import { Button, Card, Empty } from "@/components/ui";
import { money, relTime } from "@/lib/format";
import { getRegistry } from "@/lib/registry";
import { useWatch } from "@/store/watch";

export function Watchlist() {
  const w = useWatch();
  useEffect(() => {
    void w.load();
  }, []);
  const reg = getRegistry();
  return (
    <div className="mx-auto max-w-[960px] px-4 py-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">İzleme listesi</h1>
          <div className="text-[12px] text-muted">İzlenen ilanlar yenilenince fiyat geçmişi burada birikir. Eklenti varken pazardan güncel fiyat çekilir.</div>
        </div>
        <Button onClick={() => void w.refresh()} disabled={w.checking || w.watches.length === 0}>
          {w.checking ? "Kontrol ediliyor…" : "Fiyatları yenile"}
        </Button>
      </div>
      <div className="mt-4">
        {w.watches.length === 0 ? (
          <Empty title="İzlenen ilan yok" hint="Bir ürün sayfasında “İzle” düğmesine bas." />
        ) : (
          <Card className="divide-y divide-border">
            {w.watches.map((x) => {
              const delta = x.lastPrice - x.firstPrice;
              return (
                <div key={x.listingKey} className="flex items-center gap-3 px-3 py-2 text-[13px]">
                  <div className="h-10 w-10 shrink-0 overflow-hidden rounded border border-border bg-surface-2">{x.image && <img src={x.image} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover" />}</div>
                  <div className="min-w-0 flex-1">
                    <Link to={`/l/${x.market}/${x.listingId}`} className="block truncate hover:underline" title={x.title}>{x.title}</Link>
                    <div className="text-[12px] text-muted">{reg.get(x.market as never)?.meta.name ?? x.market} · son kontrol {relTime(x.lastCheckedAt)} · {x.history.length} kayıt</div>
                  </div>
                  <div className="text-right tnum">
                    <div className="font-medium">{money(x.lastPrice, x.currency)}</div>
                    <div className={delta < 0 ? "text-[12px] text-success" : delta > 0 ? "text-[12px] text-danger" : "text-[12px] text-muted"}>
                      {delta === 0 ? "değişmedi" : `${delta > 0 ? "+" : ""}${money(delta, x.currency)}`}
                    </div>
                  </div>
                  <button onClick={() => void w.toggle({ market: x.market as never, id: x.listingId, url: "", title: x.title, images: [], price: { currency: x.currency, tiers: [{ minQty: 1, unitPrice: x.lastPrice }] }, badges: [], fetchedAt: "" })} className="text-[12px] text-muted hover:text-danger" title="İzlemeyi bırak">✕</button>
                </div>
              );
            })}
          </Card>
        )}
      </div>
    </div>
  );
}
