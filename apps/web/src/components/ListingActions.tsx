import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import type { RawListing } from "@manufactogate/core";
import { COPY } from "@/lib/copy";
import { db } from "@/lib/db";
import { useProjects } from "@/store/projects";
import { toast } from "@/store/toast";
import { useWatch } from "@/store/watch";
import { Button, cn } from "./ui";

/** Copies text to the clipboard; false when the browser refuses (no permission, insecure context). */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) return false;
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * "Projeye ekle", "İzle" and "Bağlantıyı kopyala" controls for a listing. State resets per listing;
 * the menu closes on outside click and Escape; every action confirms itself with a toast.
 */
export function ListingActions({ listing }: { listing: RawListing }) {
  const p = useProjects();
  const w = useWatch();
  const [open, setOpen] = useState(false);
  const [added, setAdded] = useState<string | null>(null);
  const [inProjects, setInProjects] = useState<Set<string>>(new Set());
  const key = `${listing.market}:${listing.id}`;
  const wrap = useRef<HTMLDivElement>(null);
  const loadP = p.load;
  const loadW = w.load;

  useEffect(() => {
    void loadP();
    void loadW();
  }, [loadP, loadW]);

  useEffect(() => {
    setOpen(false);
    setAdded(null);
    let alive = true;
    void db.projectItems
      .where("listingKey")
      .equals(key)
      .toArray()
      .then((rows) => {
        if (alive) setInProjects(new Set(rows.map((r) => r.projectId)));
      });
    return () => {
      alive = false;
    };
  }, [key]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const watching = w.has(key);
  const add = async (projectId: string, name: string) => {
    await p.addListing(projectId, listing);
    setInProjects((s) => new Set([...s, projectId]));
    setAdded(name);
    setOpen(false);
    toast(COPY.toasts.addedToProject(name), { tone: "success", action: { label: COPY.toasts.openProject, to: `/projects/${projectId}` } });
  };
  const toggleWatch = async () => {
    const on = await w.toggle(listing);
    toast(on ? COPY.toasts.watched : COPY.toasts.unwatched, { tone: on ? "success" : "neutral", action: on ? { label: COPY.toasts.watchlist, to: "/watchlist" } : undefined });
  };
  const copy = async () => {
    const ok = await copyText(listing.url);
    toast(ok ? COPY.toasts.copied : COPY.toasts.copyFailed, { tone: ok ? "success" : "warning" });
  };
  const label = added ? `Eklendi ✓ ${added}` : inProjects.size ? `${inProjects.size} projede ✓` : "Projeye ekle";

  return (
    <div ref={wrap} className="relative flex gap-2">
      <Button size="sm" onClick={() => setOpen((v) => !v)} aria-haspopup="menu" aria-expanded={open}>
        {label}
      </Button>
      <Button size="sm" variant={watching ? "primary" : "secondary"} onClick={() => void toggleWatch()} aria-pressed={watching}>
        {watching ? "İzleniyor ✓" : "İzle"}
      </Button>
      <Button size="sm" variant="ghost" onClick={() => void copy()} title={listing.url} aria-label="Bağlantıyı kopyala">
        Kopyala
      </Button>
      {open && (
        <div role="menu" className="absolute left-0 top-9 z-10 w-64 rounded-md border border-border bg-surface p-2 shadow-md">
          {p.projects.length === 0 && <div className="px-1 py-1 text-[12px] text-muted">Proje yok.</div>}
          {p.projects.map((pr) => {
            const has = inProjects.has(pr.id);
            return (
              <button key={pr.id} role="menuitem" onClick={() => void add(pr.id, pr.name)} className={cn("flex w-full items-center justify-between rounded px-2 py-1 text-left text-[13px] hover:bg-surface-2", has && "text-muted")}>
                <span className="truncate">{pr.name}</span>
                {has && <span className="text-[11px] text-success">ekli ✓</span>}
              </button>
            );
          })}
          <form
            className="mt-1 flex gap-1 border-t border-border pt-2"
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              const name = String(f.get("name") ?? "").trim();
              if (!name) return;
              const pr = await p.create(name);
              await add(pr.id, pr.name);
            }}
          >
            <input name="name" placeholder="Yeni proje…" aria-label="Yeni proje adı" className="h-7 flex-1 rounded border border-border bg-bg px-2 text-[12px] outline-none focus:border-accent" />
            <Button size="sm" type="submit">+</Button>
          </form>
          <Link to="/projects" className="mt-1 block px-1 text-[11px] text-accent hover:underline">Projeleri yönet →</Link>
        </div>
      )}
    </div>
  );
}
