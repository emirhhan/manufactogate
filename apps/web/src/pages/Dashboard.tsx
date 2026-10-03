import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { MarketId } from "@manufactogate/core";
import { Badge, Button, Card, Empty, Meter, SectionHeader, SkeletonLine, Stat, cn, usePageTitle } from "@/components/ui";
import { db, storageEstimate, tableCounts, type SearchRecord } from "@/lib/db";
import { leafLabel, marketReliability, type MarketReliability } from "@/lib/feed";
import { relTime } from "@/lib/format";
import { countsOf, loadRealCatalog } from "@/lib/realCatalog";
import { getRegistry, regionOf } from "@/lib/registry";
import { getLeaf } from "@manufactogate/adapters";
import { isStaleHealth, useExtension } from "@/store/extension";
import { useProjects } from "@/store/projects";
import { useSettings } from "@/store/settings";
import { computeAlerts, useWatch } from "@/store/watch";

interface Overview {
  listings: number;
  searches: number;
  recent: SearchRecord[];
  storage: { usage: number; quota: number } | null;
  counts: Record<string, number>;
  categories: { key: string; count: number }[];
  classified: number;
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

/** Response rate across the markets that were asked at least once. Pure. */
export function responseRate(rows: MarketReliability[]): number | null {
  const runs = rows.reduce((n, r) => n + r.runs, 0);
  if (!runs) return null;
  return rows.reduce((n, r) => n + r.ok, 0) / runs;
}

export function Dashboard() {
  usePageTitle("Panel");
  const [ov, setOv] = useState<Overview | null>(null);
  const health = useExtension((s) => s.health);
  const checking = useExtension((s) => s.checking);
  const checkMarket = useExtension((s) => s.checkMarket);
  const installed = useExtension((s) => s.info.installed);
  const real = useExtension((s) => s.dataSource) === "extension";
  const targetCountry = useSettings((s) => s.targetCountry);
  const enabled = useSettings((s) => s.enabledMarkets);
  const watches = useWatch((s) => s.watches);
  const loadWatches = useWatch((s) => s.load);
  const projects = useProjects();
  useEffect(() => {
    void loadWatches();
    void projects.load();
    let alive = true;
    void (async () => {
      const [listings, searches, recent, storage, counts] = await Promise.all([db.listings.count(), db.searches.count(), db.searches.orderBy("startedAt").reverse().limit(40).toArray(), storageEstimate(), tableCounts()]);
      let categories: Overview["categories"] = [];
      let classified = 0;
      if (real) {
        const c = countsOf(await loadRealCatalog(targetCountry));
        classified = c.classified;
        categories = Object.entries(c.leafCounts).map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count).slice(0, 10);
      }
      if (alive) setOv({ listings, searches, recent, storage, counts, categories, classified });
    })().catch(() => alive && setOv({ listings: 0, searches: 0, recent: [], storage: null, counts: {} as Record<string, number>, categories: [], classified: 0 }));
    return () => {
      alive = false;
    };
  }, [real, targetCountry]);
  const reg = getRegistry();
  const reliability = useMemo(() => (ov ? marketReliability(ov.recent.slice(0, 20), health) : []), [ov, health]);
  const rate = responseRate(reliability);
  const alerts = useMemo(() => computeAlerts(watches), [watches]);
  const enabledSet = new Set(enabled);
  const rows = useMemo(() => {
    const seen = new Set(reliability.map((r) => r.market));
    const extra: MarketReliability[] = reg.all().filter((a) => enabledSet.has(a.id) && !seen.has(a.id)).map((a) => ({ market: a.id, runs: 0, ok: 0, errors: {} }));
    return [...reliability, ...extra];
  }, [reliability, enabled]);
  const maxCat = ov?.categories[0]?.count ?? 1;

  return (
    <div className="mx-auto max-w-[1440px] px-4 py-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Panel</h1>
          <div className="text-[12px] text-muted">Bu cihazdaki veriler, pazar güvenilirliği ve kategori dağılımı.</div>
        </div>
        <Link to="/settings" className="text-[13px] text-accent hover:underline">Ayarlar →</Link>
      </div>

      {!ov ? (
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="p-4"><SkeletonLine w="w-20" h="h-2" /><SkeletonLine w="w-16" h="h-7" className="mt-2" /></Card>
          ))}
        </div>
      ) : (
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <Stat label="Gerçek ilan" value={ov.listings.toLocaleString("tr-TR")} hint={real ? `${ov.classified.toLocaleString("tr-TR")} sınıflandırıldı` : "sahte veri modu"} to="/" />
          <Stat label="Arama" value={ov.searches.toLocaleString("tr-TR")} hint={ov.recent[0] ? `son: ${relTime(ov.recent[0].startedAt)}` : "henüz yok"} to="/history" />
          <Stat label="Pazar yanıt oranı" value={rate === null ? "—" : `%${Math.round(rate * 100)}`} hint={rate === null ? "son 20 aramadan" : `${reliability.length} pazar · son 20 arama`} tone={rate === null ? "neutral" : rate >= 0.7 ? "success" : rate >= 0.4 ? "warning" : "danger"} />
          <Stat label="İzlenen" value={watches.length} hint={alerts.length ? `${alerts.length} fiyat alarmı` : "alarm yok"} tone={alerts.length ? "success" : "neutral"} to="/watchlist" />
          <Stat label="Proje" value={projects.projects.length} hint={`${Object.values(projects.counts).reduce((a, b) => a + b, 0)} kayıtlı ilan`} to="/projects" />
          <Stat label="Depolama" value={ov.storage ? formatBytes(ov.storage.usage) : "—"} hint={ov.storage && ov.storage.quota ? `%${Math.max(0, Math.round((ov.storage.usage / ov.storage.quota) * 100))} · ${formatBytes(ov.storage.quota)} kota` : `${ov.counts.listings ?? 0} ilan satırı`} />
        </div>
      )}

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_380px]">
        <section className="min-w-0">
          <SectionHeader title="Pazar sağlığı" hint="Son 20 aramadaki durum ve kayıtlı sağlık kontrolü" to="/settings" toLabel="Pazarlar" />
          {rows.length === 0 ? (
            <Empty title="Henüz pazar verisi yok" hint="Bir arama yap ya da Ayarlar'da kalibrasyon turu çalıştır." />
          ) : (
            <Card className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead className="text-left text-[11px] uppercase tracking-wide text-muted">
                  <tr className="border-b border-border">
                    <th className="px-3 py-2 font-medium">Pazar</th>
                    <th className="px-3 py-2 font-medium">Başarı</th>
                    <th className="px-3 py-2 font-medium">Son başarılı</th>
                    <th className="px-3 py-2 font-medium">Son hata</th>
                    <th className="px-3 py-2 font-medium">Sağlık</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map((r) => {
                    const a = reg.get(r.market as MarketId);
                    const h = r.health;
                    const ratio = r.runs ? r.ok / r.runs : null;
                    const dot = h ? (h.ok ? "bg-success" : "bg-danger") : ratio === null ? "bg-border" : ratio >= 0.7 ? "bg-success" : ratio > 0 ? "bg-warning" : "bg-danger";
                    return (
                      <tr key={r.market}>
                        <td className="whitespace-nowrap px-3 py-2">
                          <span className="flex items-center gap-2">
                            <span className={cn("inline-block h-2 w-2 rounded-full", dot)} />
                            <span className="market-dot" data-region={a ? regionOf(a.meta.country) : "global"} aria-hidden />
                            <span className="font-medium">{a?.meta.name ?? r.market}</span>
                            {!enabledSet.has(r.market as MarketId) && <Badge>kapalı</Badge>}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          {ratio === null ? (
                            <span className="text-muted">—</span>
                          ) : (
                            <span className="flex items-center gap-2"><span className="w-20"><Meter value={ratio} tone={ratio >= 0.7 ? "success" : ratio > 0 ? "warning" : "danger"} label={`${r.ok}/${r.runs}`} /></span><span className="text-muted tnum">{r.ok}/{r.runs}</span></span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-muted">{r.lastOkAt ? relTime(r.lastOkAt) : "—"}</td>
                        <td className="max-w-[260px] truncate px-3 py-2 text-muted" title={r.lastErrorMessage}>{r.lastErrorType ? `${r.lastErrorType}${r.lastErrorMessage ? ` · ${r.lastErrorMessage}` : ""}` : "—"}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-muted">
                          {h ? (
                            <span className="flex items-center gap-1.5">
                              <span>{h.ok ? "sağlıklı" : "sorunlu"} · {relTime(h.checkedAt)}</span>
                              {isStaleHealth(h) && <Badge tone="warning">eski</Badge>}
                            </span>
                          ) : "—"}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {installed && <Button size="sm" variant="ghost" disabled={checking} onClick={() => void checkMarket(r.market as MarketId)}>kontrol et</Button>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Card>
          )}
        </section>
        <div className="min-w-0 space-y-6">
          <section>
            <SectionHeader title="Kategori dağılımı" hint="ilk 10" to="/categories" toLabel="Kategoriler" />
            {!ov ? (
              <Card className="space-y-3 p-4">{[0, 1, 2, 3].map((i) => <SkeletonLine key={i} />)}</Card>
            ) : ov.categories.length === 0 ? (
              <Empty title={real ? "Henüz sınıflandırılmış ilan yok" : "Gerçek veri modunda görünür"} />
            ) : (
              <Card className="space-y-2 p-4 text-[13px]">
                {ov.categories.map((c) => (
                  <Link key={c.key} to={`/c/${getLeaf(c.key)?.group ?? ""}/${c.key}`} className="block rounded px-1 hover:bg-surface-2">
                    <div className="flex justify-between"><span>{leafLabel(c.key)}</span><span className="text-muted tnum">{c.count}</span></div>
                    <Meter value={c.count / maxCat} label={`${leafLabel(c.key)}: ${c.count}`} />
                  </Link>
                ))}
              </Card>
            )}
          </section>
          <section>
            <SectionHeader title="Son etkinlik" to="/history" toLabel="Geçmiş" />
            <Card className="divide-y divide-border text-[13px]">
              {!ov || ov.recent.length === 0 ? (
                <div className="px-3 py-2 text-muted">Henüz etkinlik yok.</div>
              ) : (
                ov.recent.slice(0, 8).map((r) => (
                  <Link key={r.id} to={`/search/${r.id}`} className="flex items-center gap-3 px-3 py-2 hover:bg-surface-2">
                    <span className="min-w-0 flex-1 truncate">{r.input.kind === "image" ? (r.input.title ?? "Görsel araması") : r.input.kind === "link" ? r.input.url : r.input.query}</span>
                    <span className="text-muted tnum">{r.resultCount ?? r.clusterCount}</span>
                    <span className="w-16 text-right text-muted">{relTime(r.startedAt)}</span>
                  </Link>
                ))
              )}
              {watches.slice(0, 4).map((x) => (
                <div key={x.listingKey} className="flex items-center gap-3 px-3 py-2">
                  <span className="min-w-0 flex-1 truncate text-muted">izleme · {x.title}</span>
                  <span className="w-16 text-right text-muted">{relTime(x.lastCheckedAt)}</span>
                </div>
              ))}
            </Card>
          </section>
        </div>
      </div>
    </div>
  );
}
