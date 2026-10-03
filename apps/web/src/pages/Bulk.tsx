import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { MarketId } from "@manufactogate/core";
import { Badge, Button, Card, Empty, Select, Textarea, cn, usePageTitle } from "@/components/ui";
import { parseQueries } from "@/lib/csv";
import { download, listingsToCsv } from "@/lib/export";
import { money } from "@/lib/format";
import { marketShort } from "@/lib/markets";
import { getRegistry } from "@/lib/registry";
import { useBulk, type BulkRowStatus } from "@/store/bulk";
import { useProjects } from "@/store/projects";
import { useSettings } from "@/store/settings";
import { toast } from "@/store/toast";

const TONE: Record<BulkRowStatus, "neutral" | "accent" | "success" | "danger" | "warning"> = { bekliyor: "neutral", aranıyor: "accent", bitti: "success", hata: "danger", durduruldu: "warning" };

/** Bulk research: paste or upload one query per line; searched one after another with pauses, in a store that survives navigation. */
export function Bulk() {
  usePageTitle("Toplu araştırma");
  const [text, setText] = useState("");
  const b = useBulk();
  const enabled = useSettings((s) => s.enabledMarkets);
  const displayCurrency = useSettings((s) => s.displayCurrency);
  const maxPerMarket = useSettings((s) => s.search.maxPerMarket);
  const projects = useProjects();
  const [projectId, setProjectId] = useState("");
  const reg = getRegistry();
  useEffect(() => {
    void projects.load();
  }, []);
  const queries = useMemo(() => parseQueries(text), [text]);
  const marketCols = (b.rows.length ? b.markets : enabled).slice(0, 8);
  const all = b.rows.flatMap((r) => r.listings);
  const done = b.rows.filter((r) => r.status === "bitti").length;
  const failed = b.rows.filter((r) => r.status === "hata" || r.status === "durduruldu").length;

  const startRun = () => {
    if (!queries.length || !enabled.length) return;
    b.setQueries(queries);
    void b.start(enabled);
  };
  const addAll = async () => {
    if (!all.length) return;
    let target = projects.projects.find((p) => p.id === projectId);
    if (!target) {
      const name = prompt("Yeni proje adı", `Toplu araştırma ${new Date().toLocaleDateString("tr-TR")}`);
      if (!name) return;
      target = await projects.create(name);
      setProjectId(target.id);
    }
    const n = await projects.addListings(target.id, all);
    toast(`${n} ilan “${target.name}” projesine eklendi`, { tone: "success", action: { label: "Aç", to: `/projects/${target.id}` } });
  };

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-8">
      <h1 className="text-xl font-semibold tracking-tight">Toplu araştırma</h1>
      <p className="mt-1 text-muted">Her satıra bir ürün (CSV'nin ilk sütunu da olur). Sırayla, aralarında bekleyerek aranır; sayfadan ayrılsan da sürer. Sonuçlar geçmişe yazılır ve bir projeye eklenebilir.</p>
      <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto]">
        <div>
          <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={6} placeholder={"motosiklet kaskı\nkablosuz kulaklık\nairfryer 5L"} aria-label="Sorgular" disabled={b.running} />
          <div className="mt-1 flex flex-wrap gap-x-4 text-[12px] text-muted tnum">
            <span>{queries.length} sorgu{queries.length >= 200 ? " (en çok 200)" : ""}</span>
            <span>{enabled.length} pazar · pazar başına en çok {maxPerMarket}</span>
            {!enabled.length && <Link to="/settings" className="text-warning underline">Önce pazar aç</Link>}
          </div>
        </div>
        <div className="flex flex-col gap-2">
          {!b.running ? (
            <Button variant="primary" onClick={startRun} disabled={!queries.length || !enabled.length}>Başlat</Button>
          ) : b.paused ? (
            <Button variant="primary" onClick={b.resume}>Devam et</Button>
          ) : (
            <Button onClick={b.pause}>Duraklat</Button>
          )}
          {b.running && <Button variant="danger" onClick={b.stop}>Durdur</Button>}
          {!b.running && failed > 0 && <Button onClick={() => void b.retryFailed(enabled)}>Başarısızları yeniden dene ({failed})</Button>}
          <label className="chip cursor-pointer justify-center">
            CSV yükle
            <input type="file" accept=".csv,.txt" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; if (f) setText(await f.text()); }} />
          </label>
          <Button onClick={() => download(`toplu-${Date.now()}.csv`, listingsToCsv(all, (m) => reg.get(m as MarketId)?.meta.name ?? m))} disabled={all.length === 0}>Tümünü CSV indir</Button>
          {!b.running && b.rows.length > 0 && <Button variant="ghost" onClick={b.clear}>Listeyi temizle</Button>}
        </div>
      </div>
      {b.rows.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-3 text-[13px]">
          <span className="text-muted tnum">{done}/{b.rows.length} bitti · {all.length} ilan{failed ? ` · ${failed} sorunlu` : ""}{b.paused ? " · duraklatıldı" : b.running ? " · sürüyor" : ""}</span>
          <div className="ml-auto flex items-center gap-2">
            <Select size="sm" value={projectId} onChange={(e) => setProjectId(e.target.value)} aria-label="Proje" className="w-auto">
              <option value="">Yeni proje…</option>
              {projects.projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </Select>
            <Button size="sm" onClick={() => void addAll()} disabled={all.length === 0}>Hepsini projeye ekle</Button>
          </div>
        </div>
      )}
      <div className="mt-3">
        {b.rows.length === 0 ? (
          <Empty title="Henüz liste yok" hint="Ürün adlarını yapıştır ve Başlat'a bas." />
        ) : (
          <Card className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead className="text-left text-[11px] uppercase tracking-wide text-muted">
                <tr className="border-b border-border">
                  <th className="px-3 py-2 font-medium">#</th>
                  <th className="px-3 py-2 font-medium">Sorgu</th>
                  <th className="px-3 py-2 font-medium">Durum</th>
                  {marketCols.map((m) => (
                    <th key={m} className="px-2 py-2 text-right font-medium" title={reg.get(m)?.meta.name ?? m}>{marketShort(m)}</th>
                  ))}
                  <th className="px-3 py-2 text-right font-medium">Toplam</th>
                  <th className="px-3 py-2 text-right font-medium">En düşük ≈ {displayCurrency}</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {b.rows.map((r, i) => (
                  <tr key={i} className={cn(b.current === i && b.running && "bg-accent/5")}>
                    <td className="px-3 py-2 text-muted tnum">{i + 1}</td>
                    <td className="max-w-[280px] truncate px-3 py-2" title={r.error ?? r.query}>{r.query}{r.error && <span className="ml-2 text-[11px] text-danger">{r.error}</span>}</td>
                    <td className="px-3 py-2"><Badge tone={TONE[r.status]}>{r.status}</Badge></td>
                    {marketCols.map((m) => (
                      <td key={m} className="px-2 py-2 text-right text-muted tnum">{r.perMarket[m] ?? (r.status === "bitti" ? 0 : "")}</td>
                    ))}
                    <td className="px-3 py-2 text-right tnum">{r.count || ""}</td>
                    <td className="px-3 py-2 text-right tnum">{r.minDisplay !== null ? money(r.minDisplay, displayCurrency) : ""}</td>
                    <td className="px-3 py-2">{r.searchId ? <Link to={`/search/${r.searchId}`} className="text-accent hover:underline">Aç →</Link> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </div>
    </div>
  );
}
