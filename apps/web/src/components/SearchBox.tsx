import { useCallback, useRef, useState, type ClipboardEvent, type DragEvent } from "react";
import { Link } from "react-router-dom";
import type { SearchInput } from "@manufactogate/core";
import { warmLabelBank } from "@/lib/identify";
import { prepareImage, type PreparedImage } from "@/lib/imageResize";
import { getRegistry } from "@/lib/registry";
import { useSettings } from "@/store/settings";
import { Button, Kbd, cn } from "./ui";

export type Detected = { kind: "image"; dataUrl: string; name: string } | { kind: "link"; url: string } | { kind: "text"; query: string };

export function detect(text: string): Detected {
  const t = text.trim();
  if (/^https?:\/\/\S+$/i.test(t)) return { kind: "link", url: t };
  return { kind: "text", query: t };
}

/** The search box's state machine: what a submit would do for the given text and image. Pure. */
export function modeOf(text: string, hasImage: boolean, resolvable: (url: string) => boolean): "image" | "link" | "unknown-link" | "text" | "empty" {
  if (hasImage) return "image";
  const t = text.trim();
  if (!t) return "empty";
  const d = detect(t);
  if (d.kind === "link") return resolvable(d.url) ? "link" : "unknown-link";
  return "text";
}

export function SearchBox({
  onSubmit,
  onLink,
  busy,
  compact = false,
  marketCount,
}: {
  onSubmit: (input: SearchInput, thumb?: string) => void;
  /** When given, a recognised listing URL opens the listing page (compare flow) instead of a one-result search. */
  onLink?: (url: string) => void;
  busy?: boolean;
  compact?: boolean;
  /** Enabled markets; zero disables the button with a hint. */
  marketCount?: number;
}) {
  const [text, setText] = useState("");
  const [image, setImage] = useState<PreparedImage | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [drag, setDrag] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  const takeFile = useCallback(async (file: File | undefined) => {
    if (!file || !file.type.startsWith("image/")) return;
    // A photo search is coming: get the free product namer ready while the photo is prepared.
    if (useSettings.getState().search.visualAi) warmLabelBank();
    setPreparing(true);
    try {
      setImage(await prepareImage(file));
    } finally {
      setPreparing(false);
    }
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
  const mode = modeOf(text, !!image, (u) => !!getRegistry().resolve(u));
  const linkMarket = mode === "link" && d.kind === "link" ? getRegistry().resolve(d.url)?.adapter.meta.name : undefined;
  const noMarkets = marketCount === 0;

  const submit = () => {
    if (busy || preparing || noMarkets) return;
    if (image) {
      const titleHint = text.trim();
      onSubmit({ kind: "image", image: { dataUrl: image.dataUrl }, ...(titleHint ? { title: titleHint } : {}) }, image.thumb || undefined);
      return;
    }
    if (!text.trim()) return;
    if (d.kind === "link") {
      if (!getRegistry().resolve(d.url)) onSubmit({ kind: "text", query: d.url });
      else if (onLink) onLink(d.url);
      else onSubmit({ kind: "link", url: d.url });
    } else if (d.kind === "text") onSubmit({ kind: "text", query: d.query });
  };

  const examples = ["motosiklet kaskı", "kablosuz kulaklık", "airfryer 5L", "yoga matı", "köpek tasması", "güneş gözlüğü"];
  const label = busy ? "Aranıyor…" : preparing ? "Görsel hazırlanıyor…" : mode === "image" ? "Görselle ara" : mode === "link" ? "İlanı aç" : "Ara";

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
          "flex items-stretch gap-2 rounded-2xl border bg-surface p-2 shadow-[var(--shadow-md)] transition-all",
          drag ? "border-accent ring-4 ring-accent/15" : "border-border focus-within:border-accent focus-within:ring-4 focus-within:ring-accent/10",
        )}
      >
        {image ? (
          <div className="relative h-14 w-14 shrink-0 self-center overflow-hidden rounded-xl border border-border">
            <img src={image.thumb || image.dataUrl} alt={image.name} className="h-full w-full object-cover" />
            <button type="button" onClick={() => setImage(null)} aria-label="Görseli kaldır" className="absolute right-0 top-0 grid h-5 w-5 place-items-center rounded-bl-md bg-black/60 text-[11px] text-white hover:bg-black/80">
              ✕
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            title="Görselle ara"
            aria-label="Görsel seç"
            className="flex h-14 w-14 shrink-0 flex-col items-center justify-center gap-0.5 self-center rounded-xl border border-dashed border-border text-muted hover:border-accent hover:bg-accent/5 hover:text-accent"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden><rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="9" cy="10" r="1.6" /><path d="m21 16-5-5-8 8" /></svg>
            <span className="text-[10px] leading-none">{preparing ? "…" : "Görsel"}</span>
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
            aria-label="Ürün adı, link veya görsel"
            placeholder={image ? "İsteğe bağlı: ürün adı veya model numarası" : "Ürün adı yaz, ürün linki yapıştır ya da görsel bırak…"}
            className="w-full resize-none bg-transparent px-2 py-2 text-[15px] leading-snug outline-none placeholder:text-muted"
          />
        </div>

        <Button variant="primary" onClick={submit} disabled={busy || preparing || noMarkets || (!image && !text.trim())} className="h-auto min-w-[96px] self-stretch rounded-xl px-5 text-[14px]" title={noMarkets ? "Önce Ayarlar'dan en az bir pazar aç" : undefined}>
          {label}
        </Button>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 px-1 text-[12px] text-muted">
        {noMarkets ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-warning/40 bg-warning/10 px-2 py-0.5 text-warning">
            Hiç pazar seçili değil · <Link to="/settings" className="underline">Ayarlar'dan aç</Link>
          </span>
        ) : (
          <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5", mode === "empty" ? "border-border" : "border-accent/40 bg-accent/10 text-accent")}>
            <span className={cn("h-1.5 w-1.5 rounded-full", mode === "empty" ? "bg-border" : "bg-accent")} />
            {mode === "image"
              ? `Görsel eşleştirme: pazarların görselle arama özelliği + pHash${image && image.width ? ` · ${image.width}×${image.height}` : ""}`
              : mode === "link"
                ? `${linkMarket} ilanı açılır, diğer pazarlarda otomatik karşılaştırılır`
                : mode === "unknown-link"
                  ? "Link tanınmadı; metin olarak aranır"
                  : mode === "text"
                    ? `Metin: Türkçe → Çince çeviri ile ${marketCount ?? "seçili"} pazarda`
                    : "Metin, link veya görsel"}
          </span>
        )}
        {mode === "empty" && !compact && (
          <span className="flex flex-wrap items-center gap-1.5">
            <span>Dene:</span>
            {examples.map((x) => (
              <button key={x} type="button" onClick={() => { setText(x); taRef.current?.focus(); }} className="rounded-full border border-border px-2 py-0.5 hover:border-accent hover:text-accent">
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
