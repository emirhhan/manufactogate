import { useEffect, useState } from "react";
import type { ProductIdentity } from "@manufactogate/core";
import { Button } from "@/components/ui";

const LANG_LABEL: Record<string, string> = { tr: "Türkçe", zh: "Çince", en: "İngilizce", ja: "Japonca", ko: "Korece", ru: "Rusça", de: "Almanca", id: "Endonezce", th: "Tayca" };

/**
 * What a photo-only search took the product to be, with the queries the text markets got. "Düzenle"
 * lets the user correct a wrong guess and run the search again with their own name for it.
 */
export function IdentityChip({ identity, busy, onSearch }: { identity: ProductIdentity; busy: boolean; onSearch: (title: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(identity.title);
  useEffect(() => setText(identity.title), [identity.title]);
  const source = identity.source === "claude" ? "Claude ile tanındı" : identity.fromResults ? "görsel arama sonuçlarından bulundu" : "ücretsiz modelle tanındı";
  const sure = identity.confidence !== undefined && !identity.fromResults ? ` · %${Math.round(identity.confidence * 100)} emin` : "";
  const queries = Object.entries(identity.queries ?? {})
    .filter(([, q]) => q)
    .map(([lang, q]) => `${LANG_LABEL[lang] ?? lang}: ${q}`)
    .join("\n");

  if (editing) {
    return (
      <form
        className="mt-1 flex flex-wrap items-center gap-2 text-[12px]"
        onSubmit={(e) => {
          e.preventDefault();
          const t = text.trim();
          if (!t) return;
          setEditing(false);
          onSearch(t);
        }}
      >
        <span className="text-muted">Ürünün adı:</span>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          autoFocus
          aria-label="Ürünün adı"
          className="h-7 w-72 max-w-full rounded-md border border-border bg-surface px-2 text-[13px]"
        />
        <Button size="sm" variant="primary" type="submit" disabled={busy || !text.trim()}>
          Bu adla ara
        </Button>
        <Button size="sm" type="button" onClick={() => setEditing(false)}>
          Vazgeç
        </Button>
      </form>
    );
  }
  if (identity.guess) {
    // Only the photo was looked at and the image results did not confirm it: a suggestion, not a search.
    return (
      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px]" data-testid="identity">
        <span className="text-muted">Görsel aramalar ürünü adlandıramadı. Tahmin:</span>
        <span className="rounded-full border border-border bg-surface-2 px-2 py-0.5 font-medium">{identity.title}</span>
        <span className="text-warning">emin değil</span>
        <Button size="sm" variant="primary" type="button" disabled={busy} onClick={() => onSearch(identity.title)}>
          Bu adla ara
        </Button>
        <Button size="sm" type="button" onClick={() => setEditing(true)}>
          Doğru adı yaz
        </Button>
      </div>
    );
  }
  return (
    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px]" data-testid="identity">
      <span className="text-muted">Fotoğraftaki ürün:</span>
      <span className="rounded-full border border-accent/40 bg-accent/10 px-2 py-0.5 font-medium text-accent" title={queries ? `Pazarlara giden aramalar:\n${queries}` : undefined}>
        {identity.title}
      </span>
      <span className="text-muted">
        {source}
        {sure}
      </span>
      <button type="button" className="text-accent hover:underline" onClick={() => setEditing(true)}>
        Düzenle
      </button>
    </div>
  );
}
