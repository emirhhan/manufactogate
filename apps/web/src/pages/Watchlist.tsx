import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { MarketId } from "@manufactogate/core";
import { MarketImage } from "@/components/MarketImage";
import { Badge, Button, Card, Empty, IconButton, Input, Sparkline, cn, usePageTitle } from "@/components/ui";
import { money, relTime } from "@/lib/format";
import { getRegistry } from "@/lib/registry";
import { useExtension } from "@/store/extension";
import { computeAlerts, previousPrice, useWatch } from "@/store/watch";

function TargetInput({ listingKey, value, currency }: { listingKey: string; value: number | undefined; currency: string }) {
  const setTarget = useWatch((s) => s.setTarget);
  const [draft, setDraft] = useState(value !== undefined ? String(value) : "");
  useEffect(() => setDraft(value !== undefined ? String(value) : ""), [value]);
  const commit = () => {
    const n = draft.trim() === "" ? null : Number(draft.replace(",", "."));
    if (n !== null && !Number.isFinite(n)) return;
    if ((n ?? undefined) !== value) void setTarget(listingKey, n);
  };
  return (
    <label className="flex items-center gap-1 text-[11px] text-muted">
      hedef
      <Input value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === "Enter" && commit()} inputMode="decimal" placeholder={currency} aria-label="Hedef fiyat" size="sm" className="w-24 text-right tnum" />
    </label>
  );
}

export function Watchlist() {
  usePageTitle("İzleme listesi");
  const w = useWatch();
  const dataSource = useExtension((s) => s.dataSource);
  useEffect(() => {
    void w.load();
  }, []);
  const reg = getRegistry();
  const alerts = useMemo(() => computeAlerts(w.watches), [w.watches]);
  const alertKeys = useMemo(() => new Set(alerts.map((a) => a.watch.listingKey)), [alerts]);
  const sorted = useMemo(() => [...w.watches].sort((a, b) => Number(alertKeys.has(b.listingKey)) - Number(alertKeys.has(a.listingKey)) || (a.lastCheckedAt < b.lastCheckedAt ? 1 : -1)), [w.watches, alertKeys]);
  return (
    <div className="mx-auto max-w-[1100px] px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">İzleme listesi</h1>
          <div className="text-[12px] text-muted">Fiyat yalnızca değiştiğinde kaydedilir. Uygulama açılınca 12 saatten eski kayıtlar arka planda yenilenir (eklenti varken).</div>
        </div>
        <div className="flex items-center gap-2">
          {w.progress && <span className="text-[12px] text-muted tnum">{w.progress}</span>}
          {w.checking ? (
            <Button onClick={w.stop}>Durdur</Button>
          ) : (
            <Button onClick={() => void w.refresh()} disabled={w.watches.length === 0 || dataSource !== "extension"} title={dataSource !== "extension" ? "Eklenti gerekli" : undefined}>
              Fiyatları yenile
            </Button>
          )}
        </div>
      </div>
      {w.notice && <div className="mt-3 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-[13px] text-warning">{w.notice}</div>}
      {alerts.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-md border border-success/40 bg-success/10 px-3 py-2 text-[13px] text-success">
          <span className="font-medium">{alerts.length} fiyat alarmı</span>
          <span>{alerts.filter((a) => a.kind === "drop").length} düşüş · {alerts.filter((a) => a.kind === "target").length} hedefe ulaştı</span>
          <Button size="sm" className="ml-auto" onClick={() => alerts.forEach((a) => void w.markSeen(a.watch.listingKey))}>Hepsini gördüm</Button>
        </div>
      )}
      <div className="mt-4">
        {w.watches.length === 0 ? (
          <Empty title="İzlenen ilan yok" hint="Bir ürün sayfasında “İzle” düğmesine bas." />
        ) : (
          <Card className="divide-y divide-border">
            {sorted.map((x) => {
              const delta = x.lastPrice - x.firstPrice;
              const prev = previousPrice(x);
              const alert = alertKeys.has(x.listingKey);
              return (
                <div key={x.listingKey} className={cn("grid grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-1 px-3 py-2 text-[13px] sm:grid-cols-[auto_1fr_auto_auto_auto]", alert && "bg-success/5")}>
                  <div className="h-10 w-10 shrink-0 overflow-hidden rounded border border-border bg-surface-2">{x.image && <MarketImage src={x.image} className="h-full w-full object-cover" />}</div>
                  <div className="min-w-0">
                    <Link to={`/l/${x.market}/${encodeURIComponent(x.listingId)}`} className="block truncate hover:underline" title={x.title}>{x.title}</Link>
                    <div className="flex flex-wrap items-center gap-x-2 text-[12px] text-muted">
                      <span>{reg.get(x.market as MarketId)?.meta.name ?? x.market}</span>
                      <span>· son kontrol {relTime(x.lastCheckedAt)}</span>
                      <span>· {x.history.length} nokta</span>
                      {x.lastError && <Badge tone="danger" title={x.lastError}>{x.lastOkAt ? `hata · son başarılı ${relTime(x.lastOkAt)}` : "hata"}</Badge>}
                      {alert && <Badge tone="success">{x.targetPrice !== undefined && x.lastPrice <= x.targetPrice ? "hedefe ulaştı" : "fiyat düştü"}</Badge>}
                    </div>
                  </div>
                  <div className="hidden sm:block"><Sparkline points={x.history.map((h) => h.price)} label={`${x.history.length} fiyat noktası`} /></div>
                  <div className="text-right tnum">
                    <div className="font-medium">{money(x.lastPrice, x.currency)}</div>
                    <div className={delta < 0 ? "text-[12px] text-success" : delta > 0 ? "text-[12px] text-danger" : "text-[12px] text-muted"} title={prev !== null ? `önceki ${money(prev, x.currency)}` : undefined}>
                      {delta === 0 ? "değişmedi" : `${delta > 0 ? "+" : ""}${money(delta, x.currency)}`}
                    </div>
                  </div>
                  <div className="col-span-3 flex items-center justify-end gap-2 sm:col-span-1">
                    <TargetInput listingKey={x.listingKey} value={x.targetPrice} currency={x.currency} />
                    {alert && <Button size="sm" onClick={() => void w.markSeen(x.listingKey)}>Gördüm</Button>}
                    <IconButton label="İzlemeyi bırak" onClick={() => void w.remove(x.listingKey)} className="hover:text-danger">✕</IconButton>
                  </div>
                </div>
              );
            })}
          </Card>
        )}
      </div>
    </div>
  );
}
