import type { MarketId, MarketStatus } from "@manufactogate/core";
import { getRegistry } from "@/lib/registry";
import { Button, cn } from "./ui";

const ERROR_TEXT: Record<string, { title: string; hint: string }> = {
  LoggedOut: { title: "Giriş yok", hint: "Bu pazara tarayıcıda giriş yapıp yeniden dene." },
  Captcha: { title: "Doğrulama", hint: "Eklenti pazar sekmesini açık bıraktı. O sekmedeki doğrulamayı tamamla, sonra yeniden dene." },
  SelectorBroken: { title: "Pazar güncellendi", hint: "Adapter düzeltme bekliyor. Sağlık kaydına yazıldı." },
  RateLimited: { title: "Hız sınırı", hint: "Kısa bir bekleme sonrası otomatik denenecek." },
  NotFound: { title: "Bulunamadı", hint: "Bu pazarda sonuç yok." },
  Network: { title: "Ağ hatası", hint: "Bağlantıyı kontrol edip yeniden dene." },
};

export function MarketStrip({ markets, notes = {}, onRetry }: { markets: Record<string, MarketStatus>; notes?: Record<string, string>; onRetry: (m: MarketId) => void }) {
  const reg = getRegistry();
  const problems = Object.entries(markets)
    .map(([id, st]) => ({ id, text: st.state === "error" ? `${ERROR_TEXT[st.type]?.title ?? st.type}: ${st.message}` : notes[id] }))
    .filter((x): x is { id: string; text: string } => !!x.text);
  return (
    <div>
    <div className="flex flex-wrap gap-2">
      {Object.entries(markets).map(([id, st]) => {
        const name = reg.get(id as MarketId)?.meta.name ?? id;
        const dot =
          st.state === "done" ? "bg-success" : st.state === "error" ? "bg-danger" : st.state === "running" ? "bg-accent animate-pulse" : "bg-border";
        const label =
          st.state === "pending"
            ? "sırada"
            : st.state === "running"
              ? `aranıyor · ${st.received}`
              : st.state === "done"
                ? `${st.received} sonuç · ${(st.durationMs / 1000).toFixed(1)} sn`
                : (ERROR_TEXT[st.type]?.title ?? st.type);
        return (
          <div
            key={id}
            title={[st.state === "error" ? `${ERROR_TEXT[st.type]?.hint ?? ""}\n${st.message}` : "", notes[id] ?? ""].filter(Boolean).join("\n") || undefined}
            className={cn("flex items-center gap-2 rounded-md border border-border bg-surface px-2.5 py-1.5 text-[12px]", st.state === "error" && "border-danger/40")}
          >
            <span className={cn("inline-block h-2 w-2 rounded-full", dot)} />
            <span className="font-medium">{name}</span>
            <span className="text-muted tnum">{label}</span>
            {notes[id] && <span className="text-[11px] text-warning" title={notes[id]}>ⓘ</span>}
            {st.state === "error" && (
              <>
                {(st.type === "LoggedOut" || st.type === "Captcha") && (
                  <a
                    href={/^https?:/.test(st.message) ? st.message : (reg.get(id as MarketId)?.meta.loginUrl ?? "#")}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="text-accent hover:underline"
                  >
                    {st.type === "LoggedOut" ? "Giriş yap ↗" : "Doğrulamayı çöz ↗"}
                  </a>
                )}
                <Button size="sm" variant="ghost" onClick={() => onRetry(id as MarketId)}>
                  Yeniden dene
                </Button>
              </>
            )}
          </div>
        );
      })}
    </div>
    {problems.length > 0 && (
      <details className="mt-2 text-[12px] text-muted">
        <summary className="cursor-pointer select-none">Tanı ({problems.length})</summary>
        <ul className="mt-1 space-y-0.5 font-mono text-[11px]">
          {problems.map((p) => (
            <li key={p.id}>
              <span className="text-text">{reg.get(p.id as MarketId)?.meta.name ?? p.id}</span>: {p.text}
            </li>
          ))}
        </ul>
      </details>
    )}
    </div>
  );
}
