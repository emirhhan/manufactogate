import { COUNTRY_PROFILES } from "@manufactogate/country-profiles";
import { Card, cn } from "@/components/ui";
import { getRegistry } from "@/lib/registry";
import { useSettings } from "@/store/settings";

export function Settings() {
  const s = useSettings();
  const reg = getRegistry();
  return (
    <div className="mx-auto max-w-[960px] px-4 py-8">
      <h1 className="text-xl font-semibold tracking-tight">Ayarlar</h1>

      <section className="mt-6">
        <h2 className="mb-2 text-[12px] font-medium uppercase tracking-wide text-muted">Pazarlar</h2>
        <Card className="divide-y divide-border">
          {reg.all().map((a) => {
            const on = s.enabledMarkets.includes(a.id);
            return (
              <label key={a.id} className="flex cursor-pointer items-center gap-3 px-3 py-2.5 text-[13px] hover:bg-surface-2">
                <input type="checkbox" checked={on} onChange={() => s.toggleMarket(a.id)} className="accent-[var(--accent)]" />
                <span className="w-28 font-medium">{a.meta.name}</span>
                <span className="text-muted">
                  {a.meta.country.toUpperCase()} · {a.meta.currency} · {a.meta.role === "source" ? "tedarik" : a.meta.role === "target" ? "satış" : "ikisi"}
                </span>
                <span className="ml-auto text-[11px] text-muted">
                  {a.meta.capabilities.imageSearch ? "görsel" : ""} {a.meta.capabilities.textSearch ? "metin" : ""} {a.meta.capabilities.linkResolve ? "link" : ""} · v{a.meta.version}
                </span>
              </label>
            );
          })}
        </Card>
      </section>

      <section className="mt-6">
        <h2 className="mb-2 text-[12px] font-medium uppercase tracking-wide text-muted">Hedef ülke</h2>
        <div className="flex gap-2">
          {Object.values(COUNTRY_PROFILES).map((p) => (
            <button
              key={p.country}
              onClick={() => s.setTargetCountry(p.country)}
              className={cn("rounded-md border px-3 py-1.5 text-[13px]", s.targetCountry === p.country ? "border-accent bg-accent/10 text-accent" : "border-border hover:bg-surface-2")}
              title={`Oranlar ${p.asOf} tarihli`}
            >
              {p.country.toUpperCase()} · {p.currency}
            </button>
          ))}
        </div>
        <p className="mt-2 text-[12px] text-muted">Vergi ve kargo tabloları tarihli ve kaynaklıdır; Sprint 4'te düzenlenebilir hale gelir.</p>
      </section>

      <section className="mt-6">
        <h2 className="mb-2 text-[12px] font-medium uppercase tracking-wide text-muted">Veri</h2>
        <p className="text-[13px] text-muted">Tüm veriler bu tarayıcıda saklanır. Sunucuya hiçbir şey gönderilmez.</p>
      </section>
    </div>
  );
}
