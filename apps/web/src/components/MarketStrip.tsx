import type { MarketId, MarketStatus } from "@manufactogate/core";
import { getRegistry } from "@/lib/registry";
import { Button, cn } from "./ui";

const ERROR_TEXT: Record<string, { title: string; hint: string }> = {
  LoggedOut: { title: "Giriş yok", hint: "Bu pazara tarayıcıda giriş yapıp yeniden dene." },
  Captcha: { title: "Doğrulama", hint: "Pazar sayfasındaki doğrulamayı tamamla, sonra yeniden dene." },
  SelectorBroken: { title: "Pazar güncellendi", hint: "Adapter düzeltme bekliyor. Sağlık kaydına yazıldı." },
  RateLimited: { title: "Hız sınırı", hint: "Kısa bir bekleme sonrası otomatik denenecek." },
  NotFound: { title: "Bulunamadı", hint: "Bu pazarda sonuç yok." },
  Network: { title: "Ağ hatası", hint: "Bağlantıyı kontrol edip yeniden dene." },
};

export function MarketStrip({ markets, onRetry }: { markets: Record<string, MarketStatus>; onRetry: (m: MarketId) => void }) {
  const reg = getRegistry();
  return (
    <div className="flex flex-wrap gap-2">
      {Object.entries(markets).map(([id, st]) => {
        const name = reg.get(id as MarketId)?.meta.name ?? id;
        const dot =
          st.state === "done" ? "bg-success" : st.state === "error" ? "bg-danger" : st.state === "running" ? "bg-accent animate-pulse" : "bg-border";
        const label =
          st.state === "pending"
            ? "bekliyor"
            : st.state === "running"
              ? `aranıyor · ${st.received}`
              : st.state === "done"
                ? `${st.received} sonuç · ${(st.durationMs / 1000).toFixed(1)} sn`
                : (ERROR_TEXT[st.type]?.title ?? st.type);
        return (
          <div
            key={id}
            title={st.state === "error" ? ERROR_TEXT[st.type]?.hint : undefined}
            className={cn("flex items-center gap-2 rounded-md border border-border bg-surface px-2.5 py-1.5 text-[12px]", st.state === "error" && "border-danger/40")}
          >
            <span className={cn("inline-block h-2 w-2 rounded-full", dot)} />
            <span className="font-medium">{name}</span>
            <span className="text-muted tnum">{label}</span>
            {st.state === "error" && (
              <>
                {(st.type === "LoggedOut" || st.type === "Captcha") && reg.get(id as MarketId)?.meta.loginUrl && (
                  <a href={reg.get(id as MarketId)!.meta.loginUrl} target="_blank" rel="noreferrer noopener" className="text-accent hover:underline">
                    {st.type === "LoggedOut" ? "Giriş yap ↗" : "Sayfayı aç ↗"}
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
  );
}
