import { COUNTRY_NAMES_TR, COUNTRY_PROFILES } from "@manufactogate/country-profiles";
import { DISPLAY_CURRENCIES } from "@/lib/fx";
import { Button, Card, cn } from "@/components/ui";
import { sendToExtension } from "@/lib/bridge";
import { getRegistry } from "@/lib/registry";
import { useExtension } from "@/store/extension";
import { useSettings, type DataSourcePref } from "@/store/settings";
import { useState } from "react";
import type { ExtToWeb } from "@manufactogate/adapters";
import type { HealthResult, MarketId } from "@manufactogate/core";

const SESSION_TR: Record<string, string> = { "logged-in": "giriş yapıldı", "logged-out": "giriş yok", captcha: "doğrulama bekliyor", unknown: "giriş gerekmez" };

export function Settings() {
  const s = useSettings();
  const ext = useExtension((x) => x.info);
  const refreshExt = useExtension((x) => x.set);
  const reg = getRegistry();
  const [health, setHealth] = useState<Partial<Record<MarketId, HealthResult>>>({});
  const [checking, setChecking] = useState(false);
  const [progress, setProgress] = useState<string>("");
  /** Checks every enabled market one after another with a pause, like a person opening each site. */
  const runRound = async () => {
    setChecking(true);
    try {
      const targets = reg.all().filter((a) => s.enabledMarkets.includes(a.id) || !a.meta.version.includes("beta"));
      for (let i = 0; i < targets.length; i++) {
        const a = targets[i]!;
        setProgress(`${i + 1}/${targets.length} · ${a.meta.name}`);
        try {
          const r = await sendToExtension<ExtToWeb & { type: "health" }>({ type: "health", market: a.id }, 120000);
          setHealth((prev) => ({ ...prev, ...r.health }));
        } catch (e) {
          setHealth((prev) => ({ ...prev, [a.id]: { ok: false, checkedAt: new Date().toISOString(), message: e instanceof Error ? e.message : String(e) } }));
        }
        await new Promise((r) => setTimeout(r, 3000 + Math.random() * 2000));
      }
      const sess = await sendToExtension<ExtToWeb & { type: "sessions" }>({ type: "sessions" }, 3000);
      refreshExt({ ...ext, sessions: sess.sessions });
    } finally {
      setChecking(false);
      setProgress("");
    }
  };
  const runHealth = async () => {
    setChecking(true);
    try {
      const r = await sendToExtension<ExtToWeb & { type: "health" }>({ type: "health" }, 180000);
      setHealth(r.health);
      const sess = await sendToExtension<ExtToWeb & { type: "sessions" }>({ type: "sessions" }, 3000);
      refreshExt({ ...ext, sessions: sess.sessions });
    } finally {
      setChecking(false);
    }
  };
  return (
    <div className="mx-auto max-w-[960px] px-4 py-8">
      <h1 className="text-xl font-semibold tracking-tight">Ayarlar</h1>

      <section className="mt-6">
        <h2 className="mb-2 text-[12px] font-medium uppercase tracking-wide text-muted">Veri kaynağı</h2>
        <Card className="p-4">
          <div className="flex flex-wrap items-center gap-2">
            {(
              [
                ["auto", "Otomatik"],
                ["extension", "Gerçek pazarlar (eklenti)"],
                ["mock", "Sahte veri"],
              ] as [DataSourcePref, string][]
            ).map(([k, label]) => (
              <button
                key={k}
                onClick={() => s.setDataSource(k)}
                className={cn("rounded-md border px-3 py-1.5 text-[13px]", s.dataSource === k ? "border-accent bg-accent/10 text-accent" : "border-border hover:bg-surface-2")}
              >
                {label}
              </button>
            ))}
            <span className="ml-auto text-[12px] text-muted">{ext.installed ? `Eklenti v${ext.version} bağlı` : "Eklenti bulunamadı"}</span>
          </div>
          <p className="mt-2 text-[12px] text-muted">
            Gerçek pazar aramaları eklenti üzerinden, senin oturumunla, arka planda açılan sekmelerde çalışır. Eklenti yoksa katalog ve aramalar sahte veriyle sürer.
          </p>
          {ext.installed && (
            <div className="mt-3">
              <div className="flex items-center justify-between">
                <div className="text-[12px] font-medium uppercase tracking-wide text-muted">Pazar oturumları ve sağlık</div>
                <div className="flex items-center gap-2">
                  {progress && <span className="text-[12px] text-muted tnum">{progress}</span>}
                  <Button size="sm" onClick={() => void runHealth()} disabled={checking}>
                    {checking ? "Kontrol ediliyor…" : "Ana 4 pazar"}
                  </Button>
                  <Button size="sm" variant="primary" onClick={() => void runRound()} disabled={checking}>
                    Kalibrasyon turu (açık pazarlar, sırayla)
                  </Button>
                </div>
              </div>
              <ul className="mt-2 divide-y divide-border text-[13px]">
                {reg.all().map((a) => {
                  const sess = ext.sessions[a.id] ?? "unknown";
                  const h = health[a.id];
                  return (
                    <li key={a.id} className="flex items-center gap-3 py-2">
                      <span className={cn("inline-block h-2 w-2 rounded-full", h ? (h.ok ? "bg-success" : "bg-danger") : sess === "logged-in" ? "bg-success" : sess === "logged-out" ? "bg-warning" : "bg-border")} />
                      <span className="w-24 font-medium">{a.meta.name}</span>
                      <span className="text-muted">{h ? h.message : SESSION_TR[sess]}</span>
                      {a.meta.version.includes("beta") && (
                        <button
                          className="text-[12px] text-accent hover:underline"
                          disabled={checking}
                          onClick={async () => {
                            setChecking(true);
                            try {
                              const r = await sendToExtension<ExtToWeb & { type: "health" }>({ type: "health", market: a.id }, 90000);
                              setHealth((prev) => ({ ...prev, ...r.health }));
                            } finally {
                              setChecking(false);
                            }
                          }}
                        >
                          kontrol et
                        </button>
                      )}
                      {sess === "logged-out" && a.meta.loginUrl && (
                        <a href={a.meta.loginUrl} target="_blank" rel="noreferrer noopener" className="ml-auto text-accent hover:underline">
                          Giriş yap ↗
                        </a>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </Card>
      </section>

      <section className="mt-6">
        <h2 className="mb-2 text-[12px] font-medium uppercase tracking-wide text-muted">Pazarlar</h2>
        <p className="mb-2 text-[12px] text-muted">Beta pazarlar genel kart okuma ile çalışır; bir pazar boş dönerse o pazarın arama sayfasını "Fixture yakala" ile gönder, kalibre edelim.</p>
        <Card className="divide-y divide-border">
          {[...reg.all()].sort((a, b) => Number(a.meta.version.includes("beta")) - Number(b.meta.version.includes("beta"))).map((a) => {
            const on = s.enabledMarkets.includes(a.id);
            return (
              <label key={a.id} className="flex cursor-pointer items-center gap-3 px-3 py-2.5 text-[13px] hover:bg-surface-2">
                <input type="checkbox" checked={on} onChange={() => s.toggleMarket(a.id)} className="accent-[var(--accent)]" />
                <span className="w-28 font-medium">{a.meta.name}</span>
                <span className="text-muted">
                  {a.meta.country.toUpperCase()} · {a.meta.currency} · {a.meta.role === "source" ? "tedarik" : a.meta.role === "target" ? "satış" : "ikisi"}
                </span>
                <span className="ml-auto flex items-center gap-2 text-[11px] text-muted">
                  {a.meta.version.includes("beta") && <span className="rounded border border-warning/40 bg-warning/10 px-1 text-warning">beta</span>}
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
              {COUNTRY_NAMES_TR[p.country] ?? p.country.toUpperCase()} · {p.currency}
            </button>
          ))}
        </div>
        <div className="mt-3 flex items-center gap-2 text-[13px]">
          <span className="text-muted">Gösterge para birimi</span>
          {DISPLAY_CURRENCIES.map((c) => (
            <button key={c} onClick={() => s.setDisplayCurrency(c)} className={cn("rounded-md border px-2.5 py-1", s.displayCurrency === c ? "border-accent bg-accent/10 text-accent" : "border-border hover:bg-surface-2")}>
              {c}
            </button>
          ))}
        </div>
        <p className="mt-2 text-[12px] text-muted">Vergi ve kargo tabloları tarihli ve kaynaklıdır; Sprint 4'te düzenlenebilir hale gelir.</p>
      </section>

      <section className="mt-6">
        <h2 className="mb-2 text-[12px] font-medium uppercase tracking-wide text-muted">Maliyet varsayımları</h2>
        <Card className="grid gap-3 p-4 text-[13px] sm:grid-cols-2">
          <label className="flex items-center justify-between gap-3">
            <span>Kur · 1 CNY = ? TRY</span>
            <input type="number" step="0.01" value={s.cost.fxCnyTry} onChange={(e) => s.setCost({ fxCnyTry: Number(e.target.value) || 0 })} className="h-8 w-28 rounded-md border border-border bg-bg px-2 text-right tnum outline-none focus:border-accent" />
          </label>
          <label className="flex items-center justify-between gap-3">
            <span>Varsayılan ürün ağırlığı (kg)</span>
            <input type="number" step="0.05" value={s.cost.defaultWeightKg} onChange={(e) => s.setCost({ defaultWeightKg: Number(e.target.value) || 0 })} className="h-8 w-28 rounded-md border border-border bg-bg px-2 text-right tnum outline-none focus:border-accent" />
          </label>
          <label className="flex items-center justify-between gap-3">
            <span>Kargo yöntemi</span>
            <select value={s.cost.shippingKey} onChange={(e) => s.setCost({ shippingKey: e.target.value })} className="h-8 rounded-md border border-border bg-surface px-2">
              {(COUNTRY_PROFILES[s.targetCountry]?.shipping ?? []).map((o) => (
                <option key={o.key} value={o.key}>{o.label} · {o.transitDays[0]}-{o.transitDays[1]} gün</option>
              ))}
            </select>
          </label>
          <label className="flex items-center justify-between gap-3">
            <span>Reklam ve iade payı (satış fiyatının %)</span>
            <input type="number" step="1" value={Math.round(s.cost.overheadRate * 100)} onChange={(e) => s.setCost({ overheadRate: (Number(e.target.value) || 0) / 100 })} className="h-8 w-28 rounded-md border border-border bg-bg px-2 text-right tnum outline-none focus:border-accent" />
          </label>
        </Card>
      </section>

      <section className="mt-6">
        <h2 className="mb-2 text-[12px] font-medium uppercase tracking-wide text-muted">Veri</h2>
        <p className="text-[13px] text-muted">Tüm veriler bu tarayıcıda saklanır. Sunucuya hiçbir şey gönderilmez.</p>
      </section>
    </div>
  );
}
