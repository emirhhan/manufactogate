import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { RawListing } from "@manufactogate/core";
import { ResultCard } from "@/components/ResultCard";
import { Button, Card, Empty } from "@/components/ui";
import { download, listingsToCsv } from "@/lib/export";
import { relTime } from "@/lib/format";
import { getRegistry } from "@/lib/registry";
import type { ProjectItemRecord } from "@/lib/db";
import { useProjects } from "@/store/projects";

export function Projects() {
  const { id } = useParams();
  const nav = useNavigate();
  const p = useProjects();
  const [name, setName] = useState("");
  const [items, setItems] = useState<(ProjectItemRecord & { listing: RawListing | undefined })[]>([]);
  const project = p.projects.find((x) => x.id === id);

  useEffect(() => {
    void p.load();
  }, []);
  useEffect(() => {
    if (id) void p.items(id).then(setItems);
    else setItems([]);
  }, [id, p.projects]);

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
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Yeni proje adı, ör. Motosiklet kaskı 2026" className="h-9 flex-1 rounded-md border border-border bg-bg px-3 text-[13px] outline-none focus:border-accent" />
          <Button variant="primary" type="submit">Oluştur</Button>
        </form>
        <div className="mt-5">
          {p.loaded && p.projects.length === 0 ? (
            <Empty title="Henüz proje yok" hint="Bir ürün sayfasında “Projeye ekle” ile ilanları toplayıp not alabilir, CSV olarak dışa aktarabilirsin." />
          ) : (
            <Card className="divide-y divide-border">
              {p.projects.map((pr) => (
                <Link key={pr.id} to={`/projects/${pr.id}`} className="flex items-center gap-3 px-3 py-2.5 text-[13px] hover:bg-surface-2">
                  <span className="font-medium">{pr.name}</span>
                  <span className="ml-auto text-muted">{relTime(pr.updatedAt)}</span>
                </Link>
              ))}
            </Card>
          )}
        </div>
      </div>
    );
  }

  if (!project) return <div className="mx-auto max-w-[960px] px-4 py-8 text-muted">Proje yükleniyor…</div>;
  const listings = items.map((i) => i.listing).filter((l): l is RawListing => !!l);
  const reg = getRegistry();
  return (
    <div className="mx-auto max-w-[1440px] px-4 py-6">
      <nav className="text-[12px] text-muted">
        <Link to="/projects" className="hover:underline">Projeler</Link> / {project.name}
      </nav>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <input
          defaultValue={project.name}
          onBlur={(e) => e.target.value.trim() && e.target.value !== project.name && void p.rename(project.id, e.target.value.trim())}
          className="h-9 min-w-[280px] rounded-md border border-transparent bg-transparent px-2 text-xl font-semibold tracking-tight outline-none hover:border-border focus:border-accent"
        />
        <div className="ml-auto flex gap-2">
          <Button onClick={() => download(`${project.name}.csv`, listingsToCsv(listings, (m) => reg.get(m as never)?.meta.name ?? m))} disabled={listings.length === 0}>
            CSV indir
          </Button>
          <Button variant="danger" onClick={async () => { if (confirm("Proje silinsin mi?")) { await p.remove(project.id); nav("/projects"); } }}>
            Sil
          </Button>
        </div>
      </div>
      <textarea
        defaultValue={project.notes}
        onBlur={(e) => e.target.value !== project.notes && void p.setNotes(project.id, e.target.value)}
        placeholder="Notlar: hedef fiyat, konuşulan tedarikçiler, numune durumu…"
        rows={3}
        className="mt-3 w-full rounded-md border border-border bg-surface px-3 py-2 text-[13px] outline-none focus:border-accent"
      />
      <h2 className="mt-5 text-[12px] font-medium uppercase tracking-wide text-muted">İlanlar ({items.length})</h2>
      {items.length === 0 ? (
        <div className="mt-2">
          <Empty title="Bu projede ilan yok" hint="Bir ürün sayfasındaki “Projeye ekle” düğmesini kullan." />
        </div>
      ) : (
        <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
          {items.map((it) =>
            it.listing ? (
              <div key={it.key} className="relative">
                <ResultCard listing={it.listing} />
                <button
                  onClick={async () => { await p.removeItem(it.key); setItems(await p.items(project.id)); }}
                  className="absolute right-2 top-2 rounded bg-surface/95 px-1.5 text-[11px] text-muted hover:text-danger"
                  title="Projeden çıkar"
                >
                  ✕
                </button>
              </div>
            ) : null,
          )}
        </div>
      )}
    </div>
  );
}
