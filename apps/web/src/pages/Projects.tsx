import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { MarketId, RawListing } from "@manufactogate/core";
import { ResultCard } from "@/components/ResultCard";
import { Badge, Button, Card, Empty, IconButton, Input, Select, Textarea, cn, usePageTitle } from "@/components/ui";
import { csvCell, download, listingsToCsv } from "@/lib/export";
import { money, relTime } from "@/lib/format";
import { minDisplay, minOf } from "@/lib/fx";
import { getRegistry } from "@/lib/registry";
import type { ProjectItemStatus, ProjectRecord } from "@/lib/db";
import { ITEM_STATUSES, ITEM_STATUS_TR, useProjects, type ProjectItem } from "@/store/projects";
import { useSettings } from "@/store/settings";
import { toast } from "@/store/toast";

const STATUS_TONE: Record<ProjectItemStatus, "neutral" | "accent" | "success" | "danger"> = { aday: "neutral", numune: "accent", secildi: "success", elendi: "danger" };

/** CSV of a project's items with notes and status. Pure. */
export function projectToCsv(items: ProjectItem[], marketName: (m: string) => string, displayCurrency: string): string {
  const head = ["pazar", "baslik", "fiyat", "para_birimi", `fiyat_${displayCurrency}`, "moq", "satici", "durum", "not", "url"];
  const lines = [head.join(",")];
  for (const it of items) {
    const l = it.listing;
    if (!l) continue;
    const d = minDisplay(l);
    lines.push([marketName(l.market), l.title, minOf(l) ?? "", l.price.currency, d !== null ? d.toFixed(2) : "", l.moq ?? "", l.supplierName ?? l.supplierId ?? "", it.status ?? "", it.note, l.url].map(csvCell).join(","));
  }
  return lines.join("\n");
}

export function Projects() {
  const { id } = useParams();
  const nav = useNavigate();
  const p = useProjects();
  const [name, setName] = useState("");
  const project = p.projects.find((x) => x.id === id);
  usePageTitle(project ? project.name : "Projeler");

  useEffect(() => {
    void p.load();
  }, []);

  if (!id) {
    return (
      <div className="mx-auto max-w-[960px] px-4 py-8">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold tracking-tight">Projeler</h1>
        </div>
        <form
          className="mt-4 flex gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            const created = await p.create(name);
            setName("");
            nav(`/projects/${created.id}`);
          }}
        >
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Yeni proje adı, ör. Motosiklet kaskı 2026" aria-label="Yeni proje adı" className="flex-1" />
          <Button variant="primary" type="submit">Oluştur</Button>
        </form>
        <div className="mt-5">
          {p.loaded && p.projects.length === 0 ? (
            <Empty title="Henüz proje yok" hint="Bir ürün sayfasında “Projeye ekle” ile ilanları toplayıp not alabilir, durum verebilir, CSV olarak dışa aktarabilirsin." />
          ) : (
            <Card className="divide-y divide-border">
              {p.projects.map((pr) => (
                <Link key={pr.id} to={`/projects/${pr.id}`} className="flex items-center gap-3 px-3 py-2.5 text-[13px] hover:bg-surface-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{pr.name}</span>
                      <span className="text-[11px] text-muted tnum">{p.counts[pr.id] ?? 0} ilan</span>
                      {pr.decision && <Badge tone="accent" title={pr.decision}>karar: {pr.decision.length > 24 ? `${pr.decision.slice(0, 24)}…` : pr.decision}</Badge>}
                    </div>
                    {pr.notes && <div className="truncate text-[12px] text-muted">{pr.notes}</div>}
                  </div>
                  <span className="shrink-0 text-muted">{relTime(pr.updatedAt)}</span>
                </Link>
              ))}
            </Card>
          )}
        </div>
      </div>
    );
  }

  if (!project) return <div className="mx-auto max-w-[960px] px-4 py-8 text-muted">{p.loaded ? "Proje bulunamadı." : "Proje yükleniyor…"}</div>;
  return <ProjectDetail key={project.id} project={project} />;
}

/** Keyed by project id, so switching projects never shows the previous one's text in the fields. */
function ProjectDetail({ project }: { project: ProjectRecord }) {
  const nav = useNavigate();
  const p = useProjects();
  const displayCurrency = useSettings((s) => s.displayCurrency);
  const [items, setItems] = useState<ProjectItem[]>([]);
  const [view, setView] = useState<"grid" | "table">("table");
  const [nameDraft, setNameDraft] = useState(project.name);
  const [notesDraft, setNotesDraft] = useState(project.notes);
  const [decisionDraft, setDecisionDraft] = useState(project.decision ?? "");
  useEffect(() => {
    let alive = true;
    void p.items(project.id).then((xs) => alive && setItems(xs));
    return () => {
      alive = false;
    };
    // Reload on every store write (version), not on the projects array identity.
  }, [project.id, p.version]);
  const listings = items.map((i) => i.listing).filter((l): l is RawListing => !!l);
  const reg = getRegistry();
  const marketName = (m: string) => reg.get(m as MarketId)?.meta.name ?? m;
  const missing = items.length - listings.length;
  const counts = ITEM_STATUSES.map((s) => [s, items.filter((i) => i.status === s).length] as const).filter(([, n]) => n > 0);
  return (
    <div className="mx-auto max-w-[1440px] px-4 py-6">
      <nav className="text-[12px] text-muted">
        <Link to="/projects" className="hover:underline">Projeler</Link> / {project.name}
      </nav>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <Input
          value={nameDraft}
          onChange={(e) => setNameDraft(e.target.value)}
          onBlur={() => nameDraft.trim() && nameDraft.trim() !== project.name && void p.rename(project.id, nameDraft.trim())}
          aria-label="Proje adı"
          className="field-ghost h-9 min-w-[280px] max-w-[560px] text-xl font-semibold tracking-tight"
        />
        <div className="ml-auto flex flex-wrap gap-2">
          <div className="flex items-center rounded-md border border-border p-0.5 text-[12px]" role="group" aria-label="Görünüm">
            {(["table", "grid"] as const).map((v) => (
              <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)} className={cn("rounded px-2 py-1", view === v ? "bg-surface-2" : "text-muted hover:text-text")}>{v === "table" ? "Tablo" : "Kartlar"}</button>
            ))}
          </div>
          <Button onClick={() => download(`${project.name}.csv`, projectToCsv(items, marketName, displayCurrency))} disabled={listings.length === 0}>
            CSV (notlarla)
          </Button>
          <Button onClick={() => download(`${project.name}-ilanlar.csv`, listingsToCsv(listings, marketName))} disabled={listings.length === 0}>
            CSV (ilanlar)
          </Button>
          <Button variant="danger" onClick={async () => { if (confirm("Proje silinsin mi?")) { await p.remove(project.id); nav("/projects"); } }}>
            Sil
          </Button>
        </div>
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-[1fr_320px]">
        <Textarea
          value={notesDraft}
          onChange={(e) => setNotesDraft(e.target.value)}
          onBlur={() => notesDraft !== project.notes && void p.setNotes(project.id, notesDraft)}
          placeholder="Notlar: hedef fiyat, konuşulan tedarikçiler, numune durumu…"
          aria-label="Proje notları"
          rows={3}
        />
        <div>
          <Input
            value={decisionDraft}
            onChange={(e) => setDecisionDraft(e.target.value)}
            onBlur={() => decisionDraft !== (project.decision ?? "") && void p.setDecision(project.id, decisionDraft)}
            placeholder="Karar: ör. Tedarikçi A ile numune, 500 adet"
            aria-label="Karar"
          />
          <div className="mt-1 text-[11px] text-muted">Projenin sonucu; listede rozet olarak görünür. Son güncelleme {relTime(project.updatedAt)}.</div>
        </div>
      </div>
      <div className="mt-5 flex flex-wrap items-center gap-2">
        <h2 className="text-[12px] font-medium uppercase tracking-wide text-muted">İlanlar ({items.length})</h2>
        {counts.map(([s, n]) => (
          <Badge key={s} tone={STATUS_TONE[s]}>{ITEM_STATUS_TR[s]} {n}</Badge>
        ))}
        {missing > 0 && <Badge tone="warning" title="İlan kaydı geçmişle birlikte silinmiş; yeniden ara ve ekle">{missing} ilan kaydı eksik</Badge>}
      </div>
      {items.length === 0 ? (
        <div className="mt-2">
          <Empty title="Bu projede ilan yok" hint="Bir ürün sayfasındaki “Projeye ekle” düğmesini ya da Geçmiş'teki “＋”yı kullan." />
        </div>
      ) : view === "grid" ? (
        <div className="mt-2 grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3 sm:grid-cols-[repeat(auto-fill,minmax(190px,1fr))]">
          {items.map((it) =>
            it.listing ? (
              <div key={it.key} className="relative">
                <ResultCard listing={it.listing} />
                {it.status && <Badge tone={STATUS_TONE[it.status]} className="absolute left-2 top-2">{ITEM_STATUS_TR[it.status]}</Badge>}
                <IconButton label="Projeden çıkar" onClick={() => void p.removeItem(it.key)} className="absolute right-1 top-1 h-7 w-7 bg-overlay text-overlay-fg hover:text-danger">✕</IconButton>
              </div>
            ) : null,
          )}
        </div>
      ) : (
        <div className="mt-2 overflow-x-auto rounded-lg border border-border bg-surface">
          <table className="w-full text-[13px]">
            <thead className="text-left text-[11px] uppercase tracking-wide text-muted">
              <tr className="border-b border-border">
                <th className="px-3 py-2 font-medium">İlan</th>
                <th className="px-3 py-2 font-medium">Pazar</th>
                <th className="px-3 py-2 text-right font-medium">Fiyat</th>
                <th className="px-3 py-2 text-right font-medium">≈ {displayCurrency}</th>
                <th className="px-3 py-2 text-right font-medium">MOQ</th>
                <th className="px-3 py-2 font-medium">Satıcı</th>
                <th className="px-3 py-2 font-medium">Durum</th>
                <th className="px-3 py-2 font-medium">Not</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {items.map((it) => (
                <ItemRow key={it.key} item={it} marketName={marketName} displayCurrency={displayCurrency} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ItemRow({ item, marketName, displayCurrency }: { item: ProjectItem; marketName: (m: string) => string; displayCurrency: string }) {
  const p = useProjects();
  const [note, setNote] = useState(item.note);
  useEffect(() => setNote(item.note), [item.note]);
  const l = item.listing;
  const d = l ? minDisplay(l) : null;
  const min = l ? minOf(l) : null;
  return (
    <tr className="align-top">
      <td className="max-w-[320px] px-3 py-2">
        {l ? (
          <Link to={`/l/${l.market}/${encodeURIComponent(l.id)}`} className="line-clamp-2 hover:underline" title={l.title}>{l.title}</Link>
        ) : (
          <span className="text-muted">İlan kaydı yok · {item.listingKey}</span>
        )}
        <div className="text-[11px] text-muted">{relTime(item.addedAt)} eklendi</div>
      </td>
      <td className="whitespace-nowrap px-3 py-2">{l ? marketName(l.market) : "—"}</td>
      <td className="whitespace-nowrap px-3 py-2 text-right tnum">{l && min !== null ? money(min, l.price.currency) : "—"}</td>
      <td className="whitespace-nowrap px-3 py-2 text-right text-muted tnum">{d !== null ? money(d, displayCurrency) : "—"}</td>
      <td className="px-3 py-2 text-right tnum">{l?.moq ?? "—"}</td>
      <td className="max-w-[160px] truncate px-3 py-2">{l?.supplierName ?? (l?.supplierId ? `#${l.supplierId}` : "—")}</td>
      <td className="px-3 py-2">
        <Select size="sm" value={item.status ?? ""} onChange={(e) => void p.setItemStatus(item.key, (e.target.value || null) as ProjectItemStatus | null)} aria-label="Durum" className="w-auto">
          <option value="">—</option>
          {ITEM_STATUSES.map((s) => (
            <option key={s} value={s}>{ITEM_STATUS_TR[s]}</option>
          ))}
        </Select>
      </td>
      <td className="min-w-[200px] px-3 py-2">
        <Input size="sm" value={note} onChange={(e) => setNote(e.target.value)} onBlur={() => note !== item.note && void p.setItemNote(item.key, note)} placeholder="Not ekle" aria-label="Not" />
      </td>
      <td className="px-2 py-2">
        <IconButton label="Projeden çıkar" onClick={() => void p.removeItem(item.key).then(() => toast("Projeden çıkarıldı"))} className="hover:text-danger">✕</IconButton>
      </td>
    </tr>
  );
}
