import { useState } from "react";
import type { MarketId, MarketStatus } from "@manufactogate/core";
import { getRegistry } from "@/lib/registry";
import { Button, cn } from "./ui";

const ERROR_TEXT: Record<string, { title: string; hint: string }> = {
  LoggedOut: { title: "Giriş yok", hint: "Bu pazara tarayıcıda giriş yapıp yeniden dene." },
  Captcha: { title: "Doğrulama", hint: "Eklenti pazar sekmesini açık bıraktı; doğrulamayı tamamla, arama kendiliğinden sürer." },
  SelectorBroken: { title: "Okunamadı", hint: "Pazar sayfası beklenen yapıda değil; Ayarlar'dan fixture yakalayıp gönder." },
  RateLimited: { title: "Hız sınırı", hint: "Kısa bir bekleme sonrası otomatik denenecek." },
  NotFound: { title: "Bulunamadı", hint: "Bu pazarda sonuç yok." },
  Network: { title: "Bağlantı", hint: "Sayfa açılamadı veya zaman aşımı." },
};

/** Compact market progress: one summary line, details on demand. Replaces the chip wall. */
export function MarketPanel({ markets, notes = {}, onRetry, running }: { markets: Record<string, MarketStatus>; notes?: Record<string, string>; onRetry: (m: MarketId) => void; running: boolean }) {
  const [open, setOpen] = useState(false);
  const reg = getRegistry();
  const entries = Object.entries(markets);
  const done = entries.filter(([, s]) => s.state === "done").length;
  const errors = entries.filter(([, s]) => s.state === "error");
  const active = entries.filter(([, s]) => s.state === "running").map(([m]) => reg.get(m as MarketId)?.meta.name ?? m);
  const queued = entries.filter(([, s]) => s.state === "pending").length;
  const total = entries.length;
  const pct = total ? Math.round(((done + errors.length) / total) * 100) : 0;

  return (
    <div className="rounded-xl border border-border bg-surface">
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-[13px]">
        <div className="h-2 w-40 overflow-hidden rounded-full bg-surface-2">
          <div className={cn("h-full rounded-full transition-all", running ? "bg-accent" : errors.length ? "bg-warning" : "bg-success")} style={{ width: `${pct}%` }} />
        </div>
        <span className="tnum">
          {done}/{total} pazar yanıt verdi
          {errors.length > 0 && <span className="text-danger"> · {errors.length} sorun</span>}
          {queued > 0 && <span className="text-muted"> · {queued} sırada</span>}
        </span>
        {active.length > 0 && <span className="truncate text-muted">şu an: {active.slice(0, 3).join(", ")}{active.length > 3 ? "…" : ""}</span>}
        <span className="ml-auto text-[12px] text-accent">{open ? "Gizle" : "Ayrıntı"}</span>
      </button>
      {open && (
        <div className="border-t border-border px-4 py-3">
          <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
            {entries
              .sort(([, a], [, b]) => (a.state === "error" ? 0 : 1) - (b.state === "error" ? 0 : 1))
              .map(([id, st]) => {
                const name = reg.get(id as MarketId)?.meta.name ?? id;
                const dot = st.state === "done" ? "bg-success" : st.state === "error" ? "bg-danger" : st.state === "running" ? "bg-accent animate-pulse" : "bg-border";
                const label =
                  st.state === "pending" ? "sırada" : st.state === "running" ? `aranıyor · ${st.received}` : st.state === "done" ? `${st.received} sonuç · ${(st.durationMs / 1000).toFixed(0)} sn` : (ERROR_TEXT[st.type]?.title ?? st.type);
                return (
                  <div key={id} className="flex items-center gap-2 rounded-md px-2 py-1 text-[12px] hover:bg-surface-2" title={[st.state === "error" ? `${ERROR_TEXT[st.type]?.hint ?? ""}\n${st.message}` : "", notes[id] ?? ""].filter(Boolean).join("\n") || undefined}>
                    <span className={cn("inline-block h-2 w-2 shrink-0 rounded-full", dot)} />
                    <span className="w-28 truncate font-medium">{name}</span>
                    <span className="truncate text-muted tnum">{label}</span>
                    {notes[id] && <span className="text-warning" title={notes[id]}>ⓘ</span>}
                    {st.state === "error" && (st.type === "LoggedOut" || st.type === "Captcha") && (
                      <a href={/^https?:/.test(st.message) ? st.message : (reg.get(id as MarketId)?.meta.loginUrl ?? "#")} target="_blank" rel="noreferrer noopener" className="text-accent hover:underline">
                        {st.type === "LoggedOut" ? "giriş" : "doğrula"} ↗
                      </a>
                    )}
                    {st.state === "error" && (
                      <Button size="sm" variant="ghost" onClick={() => onRetry(id as MarketId)} className="ml-auto h-6 px-1.5 text-[11px]">
                        yeniden
                      </Button>
                    )}
                  </div>
                );
              })}
          </div>
          {(errors.length > 0 || Object.keys(notes).length > 0) && (
            <details className="mt-2 text-[12px] text-muted">
              <summary className="cursor-pointer select-none">Tanı ({errors.length + Object.keys(notes).length})</summary>
              <ul className="mt-1 space-y-0.5 font-mono text-[11px]">
                {errors.map(([id, st]) => st.state === "error" && (
                  <li key={id}><span className="text-text">{reg.get(id as MarketId)?.meta.name ?? id}</span>: {st.type}: {st.message}</li>
                ))}
                {Object.entries(notes).map(([id, n]) => (
                  <li key={`n-${id}`}><span className="text-text">{reg.get(id as MarketId)?.meta.name ?? id}</span>: {n}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
