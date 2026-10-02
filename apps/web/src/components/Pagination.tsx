import { pageWindow } from "@/lib/catalog";
import { cn } from "./ui";

export function Pagination({ page, pages, onPage }: { page: number; pages: number; onPage: (p: number) => void }) {
  if (pages <= 1) return null;
  const btn = "min-w-8 h-8 px-2 rounded-md border text-[13px] tnum";
  return (
    <nav className="flex flex-wrap items-center justify-center gap-1" aria-label="Sayfalama">
      <button className={cn(btn, "border-border hover:bg-surface-2 disabled:opacity-40")} disabled={page <= 1} onClick={() => onPage(page - 1)}>
        ‹ Önceki
      </button>
      {pageWindow(page, pages).map((p, i) =>
        p === null ? (
          <span key={`gap-${i}`} className="px-1 text-muted">
            …
          </span>
        ) : (
          <button
            key={p}
            aria-current={p === page ? "page" : undefined}
            onClick={() => onPage(p)}
            className={cn(btn, p === page ? "border-accent bg-accent text-accent-fg" : "border-border hover:bg-surface-2")}
          >
            {p}
          </button>
        ),
      )}
      <button className={cn(btn, "border-border hover:bg-surface-2 disabled:opacity-40")} disabled={page >= pages} onClick={() => onPage(page + 1)}>
        Sonraki ›
      </button>
    </nav>
  );
}
