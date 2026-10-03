import { useEffect, useState } from "react";
import { MarketImage } from "./MarketImage";
import { cn } from "./ui";

/** Product gallery: main image, thumbnail strip and a keyboard-navigable lightbox. */
export function Gallery({ images, label, resetKey }: { images: string[]; label: string; resetKey: string }) {
  const [i, setI] = useState(0);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    setI(0);
    setOpen(false);
  }, [resetKey]);
  const n = images.length;
  const cur = images[Math.min(i, Math.max(0, n - 1))];
  const prev = () => setI((x) => (n ? (x - 1 + n) % n : 0));
  const next = () => setI((x) => (n ? (x + 1) % n : 0));

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
      else if (e.key === "ArrowLeft") prev();
      else if (e.key === "ArrowRight") next();
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, n]);

  return (
    <div>
      <button type="button" onClick={() => n && setOpen(true)} className="block aspect-square w-full cursor-zoom-in overflow-hidden rounded-lg border border-border bg-surface-2" aria-label="Görseli büyüt">
        <MarketImage src={cur} label={label} eager className="h-full w-full object-contain" />
      </button>
      {n > 1 && (
        <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1" role="tablist" aria-label="Galeri">
          {images.map((u, k) => (
            <button key={`${k}:${u}`} role="tab" aria-selected={k === i} onClick={() => setI(k)} className={cn("h-14 w-14 shrink-0 overflow-hidden rounded border", k === i ? "border-accent" : "border-border")}>
              <MarketImage src={u} label={label} className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}
      {n > 1 && <div className="mt-1 text-[11px] text-muted tnum">{i + 1} / {n}</div>}
      {open && (
        <div role="dialog" aria-modal="true" aria-label="Görsel" className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={() => setOpen(false)}>
          <button type="button" className="absolute right-4 top-4 rounded-md bg-surface px-3 py-1.5 text-[13px]" onClick={() => setOpen(false)}>
            Kapat (Esc)
          </button>
          {n > 1 && (
            <>
              <button type="button" className="absolute left-4 top-1/2 -translate-y-1/2 rounded-md bg-surface px-3 py-2 text-lg" onClick={(e) => { e.stopPropagation(); prev(); }} aria-label="Önceki">
                ‹
              </button>
              <button type="button" className="absolute right-4 top-1/2 -translate-y-1/2 rounded-md bg-surface px-3 py-2 text-lg" onClick={(e) => { e.stopPropagation(); next(); }} aria-label="Sonraki">
                ›
              </button>
            </>
          )}
          <div className="max-h-full max-w-[1200px]" onClick={(e) => e.stopPropagation()}>
            <MarketImage src={cur} label={label} eager className="max-h-[85vh] w-auto rounded-md object-contain" />
            {n > 1 && <div className="mt-2 text-center text-[12px] text-white/80 tnum">{i + 1} / {n} · ← → ile gez</div>}
          </div>
        </div>
      )}
    </div>
  );
}
