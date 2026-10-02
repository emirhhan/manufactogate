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

export function SearchBox({ onSubmit, busy }: { onSubmit: (input: SearchInput, thumb?: string) => void; busy?: boolean }) {
  const [text, setText] = useState("");
  const [image, setImage] = useState<{ dataUrl: string; name: string } | null>(null);
  const [drag, setDrag] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const takeFile = useCallback(async (file: File | undefined) => {
    if (!file || !file.type.startsWith("image/")) return;
    setImage({ dataUrl: await fileToDataUrl(file), name: file.name });
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

  const submit = () => {
    if (busy) return;
    if (image) {
      const titleHint = text.trim();
      onSubmit({ kind: "image", image: { dataUrl: image.dataUrl }, ...(titleHint ? { title: titleHint } : {}) }, image.dataUrl);
      return;
    }
    if (!text.trim()) return;
    const d = detect(text);
    if (d.kind === "link") {
      const hit = getRegistry().resolve(d.url);
      if (!hit) {
        onSubmit({ kind: "text", query: d.url });
        return;
      }
      onSubmit({ kind: "link", url: d.url });
    } else if (d.kind === "text") onSubmit({ kind: "text", query: d.query });
  };

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={onDrop}
      className={cn("rounded-xl border bg-surface p-3 shadow-sm transition-colors", drag ? "border-accent" : "border-border")}
    >
      <div className="flex gap-3">
        {image ? (
          <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-md border border-border">
            <img src={image.dataUrl} alt={image.name} className="h-full w-full object-cover" />
            <button
              onClick={() => setImage(null)}
              className="absolute right-1 top-1 rounded bg-surface/90 px-1 text-[11px] text-muted hover:text-text"
              aria-label="Görseli kaldır"
            >
              ✕
            </button>
          </div>
        ) : (
          <button
            onClick={() => fileRef.current?.click()}
            className="flex h-24 w-24 shrink-0 flex-col items-center justify-center rounded-md border border-dashed border-border text-[12px] text-muted hover:bg-surface-2"
          >
            <span className="text-lg leading-none">+</span>
            Görsel
          </button>
        )}
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => void takeFile(e.target.files?.[0])} />
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onPaste={onPaste}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            rows={3}
            placeholder={image ? "İsteğe bağlı: ürün adı veya model numarası (eşleşmeyi güçlendirir)" : "Görsel sürükle veya yapıştır, ürün linki yapıştır ya da ürün adı yaz…"}
            className="w-full resize-none rounded-md border border-border bg-bg px-3 py-2 outline-none placeholder:text-muted focus:border-accent"
          />
          <div className="flex items-center justify-between text-[12px] text-muted">
            <span>
              <Kbd>Enter</Kbd> ara · <Kbd>Shift</Kbd>+<Kbd>Enter</Kbd> yeni satır · görsel yapıştırmak için <Kbd>Ctrl</Kbd>+<Kbd>V</Kbd>
            </span>
            <Button variant="primary" onClick={submit} disabled={busy || (!image && !text.trim())}>
              {busy ? "Aranıyor…" : "Ara"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
