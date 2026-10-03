import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { RawListing } from "@manufactogate/core";
import { useProjects } from "@/store/projects";
import { useWatch } from "@/store/watch";
import { Button } from "./ui";

/** "Projeye ekle" and "İzle" controls for a listing. */
export function ListingActions({ listing }: { listing: RawListing }) {
  const p = useProjects();
  const w = useWatch();
  const [open, setOpen] = useState(false);
  const [added, setAdded] = useState<string | null>(null);
  const key = `${listing.market}:${listing.id}`;
  useEffect(() => {
    void p.load();
    void w.load();
  }, []);
  const watching = w.has(key);
  return (
    <div className="relative flex gap-2">
      <Button size="sm" onClick={() => setOpen((v) => !v)}>
        {added ? "Eklendi ✓" : "Projeye ekle"}
      </Button>
      <Button size="sm" variant={watching ? "primary" : "secondary"} onClick={() => void w.toggle(listing)}>
        {watching ? "İzleniyor ✓" : "İzle"}
      </Button>
      {open && (
        <div className="absolute left-0 top-9 z-10 w-64 rounded-md border border-border bg-surface p-2 shadow-md">
          {p.projects.length === 0 && <div className="px-1 py-1 text-[12px] text-muted">Proje yok.</div>}
          {p.projects.map((pr) => (
            <button
              key={pr.id}
              onClick={async () => {
                await p.addListing(pr.id, listing);
                setAdded(pr.name);
                setOpen(false);
              }}
              className="block w-full rounded px-2 py-1 text-left text-[13px] hover:bg-surface-2"
            >
              {pr.name}
            </button>
          ))}
          <form
            className="mt-1 flex gap-1 border-t border-border pt-2"
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              const name = String(f.get("name") ?? "").trim();
              if (!name) return;
              const pr = await p.create(name);
              await p.addListing(pr.id, listing);
              setAdded(pr.name);
              setOpen(false);
            }}
          >
            <input name="name" placeholder="Yeni proje…" className="h-7 flex-1 rounded border border-border bg-bg px-2 text-[12px] outline-none focus:border-accent" />
            <Button size="sm" type="submit">+</Button>
          </form>
          <Link to="/projects" className="mt-1 block px-1 text-[11px] text-accent hover:underline">Projeleri yönet →</Link>
        </div>
      )}
    </div>
  );
}
