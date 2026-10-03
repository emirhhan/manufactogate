import { useCallback, useRef, useState, type ClipboardEvent, type DragEvent } from "react";
import type { SearchInput } from "@manufactogate/core";
import { getRegistry } from "@/lib/registry";
import { Button, Kbd, cn } from "./ui";

export type Detected = { kind: "image"; dataUrl: string; name: string } | { kind: "link"; url: string } | { kind: "text"; query: string };

function detect(text: string): Detected {
  const t = text.trim();
  if (/^https?:\/\/\S+$/i.test(t)) return { kind: "link", url: t };
  return { kind: "text", query: t };
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

export function SearchBox({ onSubmit, busy, compact = false }: { onSubmit: (input: SearchInput, thumb?: string) => void; busy?: boolean; compact?: boolean }) {
  const [text, setText] = useState("");
  const [image, setImage] = useState<{ dataUrl: string; name: string } | null>(null);
  const [drag, setDrag] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  const takeFile = useCallback(async (file: File | undefined) => {
    if (!file || !file.type.startsWith("image/")) return;
    setImage({ dataUrl: await fileToDataUrl(file), name: file.name });
    taRef.current?.focus();
  }, []);

  const onPaste = (e: ClipboardEvent) => {
    const f = [...e.clipboardData.files][0];
    if (f) {
      e.preventDefault();
      void takeFile(f);
    }
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDrag(false);
    void takeFile(e.dataTransfer.files[0]);
  };

  const d = detect(text);
  const mode: "image" | "link" | "text" | "empty" = image ? "image" : !text.trim() ? "empty" : d.kind === "link" ? "link" : "text";
  const linkMarket = mode === "link" && d.kind === "link" ? getRegistry().resolve(d.url)?.adapter.meta.name : undefined;

  const submit = () => {
    if (busy) return;
    if (image) {
      const titleHint = text.trim();
      onSubmit({ kind: "image", image: { dataUrl: image.dataUrl }, ...(titleHint ? { title: titleHint } : {}) }, image.dataUrl);
      return;
    }
    if (!text.trim()) return;
    if (d.kind === "link") {
      if (!getRegistry().resolve(d.url)) onSubmit({ kind: "text", query: d.url });
      else onSubmit({ kind: "link", url: d.url });
    } else if (d.kind === "text") onSubmit({ kind: "text", query: d.query });
  };

  const examples = ["motosiklet kaskı", "kablosuz kulaklık", "airfryer 5L", "yoga matı", "köpek tasması", "güneş gözlüğü"];

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={onDrop}
      className="relative"
    >
      <div
        className={cn(
          "flex items-stretch gap-2 rounded-2xl border bg-surface p-2 shadow-[0_8px_30px_-12px_rgba(0,0,0,.25)] transition-all",
          drag ? "border-accent ring-4 ring-accent/15" : "border-border focus-within:border-accent focus-within:ring-4 focus-within:ring-accent/10",
        )}
      >
        {/* Image slot */}
        {image ? (
          <div className="relative h-14 w-14 shrink-0 self-center overflow-hidden rounded-xl border border-border">
            <img src={image.dataUrl} alt={image.name} className="h-full w-full object-cover" />
            <button onClick={() => setImage(null)} aria-label="Görseli kaldır" className="absolute right-0 top-0 grid h-5 w-5 place-items-center rounded-bl-md bg-black/60 text-[11px] text-white hover:bg-black/80">
              ✕
            </button>
          </div>
        ) : (
          <button
            onClick={() => fileRef.current?.click()}
            title="Görselle ara"
            className="flex h-14 w-14 shrink-0 flex-col items-center justify-center gap-0.5 self-center rounded-xl border border-dashed border-border text-muted hover:border-accent hover:bg-accent/5 hover:text-accent"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="9" cy="10" r="1.6" /><path d="m21 16-5-5-8 8" /></svg>
            <span className="text-[10px] leading-none">Görsel</span>
          </button>
        )}
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => void takeFile(e.target.files?.[0])} />

        <div className="flex min-w-0 flex-1 items-center">
          <textarea
            ref={taRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onPaste={onPaste}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            rows={compact ? 1 : 2}
            placeholder={image ? "İsteğe bağlı: ürün adı veya model numarası" : "Ürün adı yaz, ürün linki yapıştır ya da görsel bırak…"}
            className="w-full resize-none bg-transparent px-2 py-2 text-[15px] leading-snug outline-none placeholder:text-muted"
          />
        </div>

        <Button variant="primary" onClick={submit} disabled={busy || (!image && !text.trim())} className="h-auto min-w-[96px] self-stretch rounded-xl px-5 text-[14px]">
          {busy ? "Aranıyor…" : mode === "image" ? "Görselle ara" : mode === "link" ? "Linki çöz" : "Ara"}
        </Button>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 px-1 text-[12px] text-muted">
        <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5", mode === "empty" ? "border-border" : "border-accent/40 bg-accent/10 text-accent")}>
          <span className={cn("h-1.5 w-1.5 rounded-full", mode === "empty" ? "bg-border" : "bg-accent")} />
          {mode === "image" ? "Görsel eşleştirme: pazarların görselle arama özelliği + pHash" : mode === "link" ? (linkMarket ? `${linkMarket} linki: ürün okunur, diğer pazarlarda aranır` : "Link tanınmadı; metin olarak aranır") : mode === "text" ? "Metin: Türkçe → Çince çeviri ile tüm seçili pazarlar" : "Metin, link veya görsel"}
        </span>
        {mode === "empty" && !compact && (
          <span className="flex flex-wrap items-center gap-1.5">
            <span>Dene:</span>
            {examples.map((x) => (
              <button key={x} onClick={() => { setText(x); taRef.current?.focus(); }} className="rounded-full border border-border px-2 py-0.5 hover:border-accent hover:text-accent">
                {x}
              </button>
            ))}
          </span>
        )}
        <span className="ml-auto hidden sm:inline">
          <Kbd>Enter</Kbd> ara · <Kbd>Ctrl</Kbd>+<Kbd>V</Kbd> görsel yapıştır
        </span>
      </div>
    </div>
  );
}
