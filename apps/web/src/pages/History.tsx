import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { MarketId } from "@manufactogate/core";
import { Badge, Button, Card, Empty, IconButton, Input, Select, cn, usePageTitle } from "@/components/ui";
import { db, deleteSearches, listingsForSearch, type SearchRecord } from "@/lib/db";
import { relTime } from "@/lib/format";
import { getRegistry } from "@/lib/registry";
import { useProjects } from "@/store/projects";
import { useSearch } from "@/store/search";
import { toast } from "@/store/toast";

const PAGE = 50;
type Kind = "all" | "text" | "image" | "link";

export function describeSearch(r: SearchRecord): string {
  return r.input.kind === "image" ? (r.input.title ?? "Görsel araması") : r.input.kind === "link" ? r.input.url : r.input.query;
}

/** Status label and tone for a record. Pure. */
export function statusOf(r: SearchRecord): { label: string; tone: "neutral" | "success" | "warning" | "danger" } {
  if (r.status === "error") return { label: "hata", tone: "danger" };
  if (r.status === "cancelled") return { label: "durduruldu", tone: "warning" };
  if (r.status === "done" || r.finishedAt) return { label: "bitti", tone: "success" };
  return { label: "yarım kaldı", tone: "neutral" };
}

/** Applies the kind / market / text filters. Pure. */
export function filterSearches(rows: SearchRecord[], f: { kind: Kind; market: string; text: string }): SearchRecord[] {
  const t = f.text.trim().toLowerCase();
  return rows.filter((r) => (f.kind === "all" || r.input.kind === f.kind) && (!f.market || r.markets.includes(f.market)) && (!t || describeSearch(r).toLowerCase().includes(t)));
}

export function History() {
  usePageTitle("Geçmiş");
  const nav = useNavigate();
  const start = useSearch((s) => s.start);
  const running = useSearch((s) => s.running);
  const projects = useProjects();
  const [rows, setRows] = useState<SearchRecord[]>([]);
  const [kind, setKind] = useState<Kind>("all");
  const [market, setMarket] = useState("");
  const [text, setText] = useState("");
  const [page, setPage] = useState(1);
  const refresh = () => void db.searches.orderBy("startedAt").reverse().toArray().then(setRows).catch(() => setRows([]));
  useEffect(refresh, []);
  useEffect(() => {
    void projects.load();
  }, []);
  const reg = getRegistry();
  const marketsSeen = useMemo(() => [...new Set(rows.flatMap((r) => r.markets))].sort(), [rows]);
  const filtered = useMemo(() => filterSearches(rows, { kind, market, text }), [rows, kind, market, text]);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const pageRows = filtered.slice((page - 1) * PAGE, page * PAGE);
  useEffect(() => setPage(1), [kind, market, text]);

  const clearAll = async () => {
    if (!confirm("Tüm arama geçmişi silinsin mi? Projelerdeki ve izlenen ilanlar korunur.")) return;
    const r = await deleteSearches("all");
    toast(`${r.searches} arama ve ${r.listings} ilan silindi`, { tone: "success" });
    refresh();
  };
  const remove = async (r: SearchRecord) => {
    await deleteSearches([r.id]);
    refresh();
  };
  const again = async (r: SearchRecord) => {
    if (running) return;
    const id = await start(r.input, r.markets as MarketId[], r.thumb, r.sourceKey);
    nav(`/search/${id}`);
  };
  const toProject = async (r: SearchRecord) => {
    const listings = await listingsForSearch(r.id);
    if (!listings.length) {
      toast("Bu aramanın kayıtlı ilanı yok", { tone: "warning" });
      return;
    }
    let target = projects.projects[0];
    const name = prompt(`${listings.length} ilan hangi projeye eklensin? Var olan proje adı yaz ya da yeni ad gir.`, target?.name ?? describeSearch(r));
    if (name === null) return;
    target = projects.projects.find((p) => p.name.toLowerCase() === name.trim().toLowerCase()) ?? (await projects.create(name));
    const n = await projects.addListings(target.id, listings);
    toast(`${n} ilan “${target.name}” projesine eklendi`, { tone: "success", action: { label: "Aç", to: `/projects/${target.id}` } });
  };

  const KINDS: [Kind, string][] = [["all", "Hepsi"], ["text", "Metin"], ["image", "Görsel"], ["link", "Link"]];
  return (
    <div className="mx-auto max-w-[1100px] px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Geçmiş</h1>
          <div className="text-[12px] text-muted tnum">{rows.length} arama · bu cihazda saklanır</div>
        </div>
        {rows.length > 0 && (
          <Button variant="danger" size="sm" onClick={() => void clearAll()}>
            Geçmişi temizle
          </Button>
        )}
      </div>
      {rows.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <div className="flex gap-1" role="group" aria-label="Arama türü">
            {KINDS.map(([k, label]) => (
              <button key={k} type="button" onClick={() => setKind(k)} className={cn("chip", kind === k && "chip-on")} aria-pressed={kind === k}>
                {label}
              </button>
            ))}
          </div>
          <Select value={market} onChange={(e) => setMarket(e.target.value)} aria-label="Pazar" className="w-auto" size="sm">
            <option value="">Tüm pazarlar</option>
            {marketsSeen.map((m) => (
              <option key={m} value={m}>{reg.get(m as MarketId)?.meta.name ?? m}</option>
            ))}
          </Select>
          <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Geçmişte ara" aria-label="Geçmişte ara" size="sm" className="w-48" />
          <span className="ml-auto text-[12px] text-muted tnum">{filtered.length} sonuç</span>
        </div>
      )}
      <div className="mt-4">
        {rows.length === 0 ? (
          <Empty title="Henüz arama yok" hint="Aramalar bu cihazda saklanır, sunucuya gönderilmez." action={<Link to="/" className="text-accent hover:underline">Ana sayfadan ara →</Link>} />
        ) : filtered.length === 0 ? (
          <Empty title="Süzgeçle eşleşen arama yok" />
        ) : (
          <Card className="divide-y divide-border">
            {pageRows.map((r) => {
              const st = statusOf(r);
              return (
                <div key={r.id} className="flex items-center gap-3 px-3 py-2 text-[13px]">
                  <Link to={`/search/${r.id}`} className="flex min-w-0 flex-1 items-center gap-3 hover:underline">
                    <div className="h-8 w-8 shrink-0 overflow-hidden rounded border border-border bg-surface-2">
                      {r.thumb && <img src={r.thumb} alt="" className="h-full w-full object-cover" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate">{describeSearch(r)}</div>
                      <div className="truncate text-[11px] text-muted">
                        {r.input.kind === "image" ? "görsel" : r.input.kind === "link" ? "link" : "metin"} · {r.markets.length} pazar · {r.markets.slice(0, 4).map((m) => reg.get(m as MarketId)?.meta.name ?? m).join(", ")}{r.markets.length > 4 ? "…" : ""}
                      </div>
                    </div>
                  </Link>
                  <Badge tone={st.tone}>{st.label}</Badge>
                  <div className="hidden w-20 text-right text-muted tnum sm:block">{r.resultCount !== undefined ? `${r.resultCount} sonuç` : `${r.clusterCount} küme`}</div>
                  <div className="hidden w-20 text-right text-muted sm:block">{relTime(r.startedAt)}</div>
                  <div className="flex items-center gap-0.5">
                    <IconButton label="Tekrar ara" onClick={() => void again(r)} disabled={running}>↻</IconButton>
                    <IconButton label="Sonuçları projeye ekle" onClick={() => void toProject(r)}>＋</IconButton>
                    <IconButton label="Bu aramayı sil" onClick={() => void remove(r)} className="hover:text-danger">✕</IconButton>
                  </div>
                </div>
              );
            })}
          </Card>
        )}
        {pages > 1 && (
          <div className="mt-3 flex items-center justify-center gap-2 text-[13px]">
            <Button size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>‹ Önceki</Button>
            <span className="text-muted tnum">{page}/{pages}</span>
            <Button size="sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>Sonraki ›</Button>
          </div>
        )}
      </div>
    </div>
  );
}
