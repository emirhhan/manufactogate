import { useEffect, useMemo, useRef, useState } from "react";
import { COUNTRY_NAMES_TR, COUNTRY_PROFILES, marketplacesOf } from "@manufactogate/country-profiles";
import { REAL_DEF_BY_ID } from "@manufactogate/adapters";
import { hasCountryOverrides, referenceOverrides, type HealthResult, type MarketAdapter, type MarketId, type SessionState } from "@manufactogate/core";
import { ProductNamingSettings } from "@/components/ProductNamingSettings";
import { Badge, Button, Card, Input, Select, cn, usePageTitle } from "@/components/ui";
import { clearData, exportAll, importAll, parseBackup, storageEstimate, tableCounts, type BackupTable } from "@/lib/db";
import { download } from "@/lib/export";
import { relTime } from "@/lib/format";
import { DISPLAY_CURRENCIES, FX_AS_OF, FX_TO_TRY } from "@/lib/fx";
import { getRegistry, REGION_LABELS_TR, REGION_ORDER, regionOf, type Region } from "@/lib/registry";
import { isStaleHealth, useExtension } from "@/store/extension";
import { EDITABLE_FX, MAX_PER_MARKET_OPTIONS, VERIFIED_MARKETS, useSettings, type CountryOverridesPatch, type DataSourcePref, type MaxPerMarket } from "@/store/settings";
import { toast } from "@/store/toast";
import { formatBytes } from "./Dashboard";

/** Session label: "unknown" is only "giriş gerekmez" when the market has no login at all. Pure. */
export function sessionLabel(state: SessionState | undefined, hasLogin: boolean): string {
  switch (state) {
    case "logged-in":
      return "giriş yapıldı";
    case "logged-out":
      return "giriş yok";
    case "captcha":
      return "doğrulama bekliyor";
    default:
      return hasLogin ? "bilinmiyor" : "giriş gerekmez";
  }
}

/** Market presets. Pure. */
export function presetMarkets(kind: "working" | "verified" | "target" | "all" | "none", all: Pick<MarketAdapter, "id" | "meta">[], health: Partial<Record<string, HealthResult>>, targetCountry: string): MarketId[] {
  switch (kind) {
    case "working": {
      const ok = all.filter((a) => health[a.id]?.ok).map((a) => a.id);
      return ok.length ? ok : VERIFIED_MARKETS.filter((id) => all.some((a) => a.id === id));
    }
    case "verified":
      return all.filter((a) => !a.meta.version.includes("beta")).map((a) => a.id);
    case "target":
      return all.filter((a) => a.meta.country === targetCountry && a.meta.role !== "source").map((a) => a.id);
    case "all":
      return all.map((a) => a.id);
    default:
      return [];
  }
}

const ROLE_TR = { source: "tedarik", target: "satış", both: "ikisi" } as const;

/** Percent input value → rate fraction patch value: empty or invalid clears the override. Pure. */
export function pctToRate(raw: string): number | null {
  const n = Number(raw.replace(",", "."));
  if (raw.trim() === "" || !Number.isFinite(n) || n < 0 || n >= 100) return null;
  return Math.round(n * 100) / 10000;
}
/** Amount input value → non-negative number patch value; empty or invalid clears the override. Pure. */
export function amountOrNull(raw: string): number | null {
  const n = Number(raw.replace(",", "."));
  return raw.trim() === "" || !Number.isFinite(n) || n < 0 ? null : n;
}
const pctText = (r: number) => String(Math.round(r * 10000) / 100);

interface FieldProps {
  label: string;
  /** The user's override, undefined when the reference applies. */
  value: number | undefined;
  /** Reference figure shown when there is no override and restored by "varsayılan". */
  def: number;
  onChange: (raw: string) => void;
  hint?: string;
}
/** Percent field for a rate override; module-level so React keeps the input mounted (and focused) between keystrokes. */
function RateField({ label, value, def, onChange, hint }: FieldProps) {
  return (
    <label className="flex items-center justify-between gap-3" title={hint}>
      <span>
        {label}
        {value !== undefined && (
          <button type="button" className="ml-2 text-[11px] text-accent hover:underline" onClick={() => onChange("")}>
            varsayılan {pctText(def)}%
          </button>
        )}
      </span>
      <span className="flex items-center gap-1">
        <Input type="number" step="0.5" min="0" max="99" value={pctText(value ?? def)} onChange={(e) => onChange(e.target.value)} className="w-24 text-right tnum" size="sm" aria-label={label} />
        <span className="text-muted">%</span>
      </span>
    </label>
  );
}
/** Amount field (profile currency) for a fee override. */
function AmountField({ label, value, def, onChange, hint, currency }: FieldProps & { currency: string }) {
  return (
    <label className="flex items-center justify-between gap-3" title={hint}>
      <span>
        {label}
        {value !== undefined && (
          <button type="button" className="ml-2 text-[11px] text-accent hover:underline" onClick={() => onChange("")}>
            varsayılan {def.toLocaleString("tr-TR")}
          </button>
        )}
      </span>
      <span className="flex items-center gap-1">
        <Input type="number" step="1" min="0" value={value ?? def} onChange={(e) => onChange(e.target.value)} className="w-28 text-right tnum" size="sm" aria-label={label} />
        <span className="text-muted">{currency}</span>
      </span>
    </label>
  );
}

export function Settings() {
  usePageTitle("Ayarlar");
  const s = useSettings();
  const ext = useExtension();
  const reg = getRegistry();
  const all = reg.all();
  const enabledSet = useMemo(() => new Set(s.enabledMarkets), [s.enabledMarkets]);
  const groups = useMemo(() => {
    const m = new Map<Region, MarketAdapter[]>();
    for (const a of all) {
      const r = regionOf(a.meta.country);
      (m.get(r) ?? m.set(r, []).get(r)!).push(a);
    }
    return REGION_ORDER.filter((r) => m.has(r)).map((r) => ({ region: r, adapters: m.get(r)!.sort((a, b) => Number(a.meta.version.includes("beta")) - Number(b.meta.version.includes("beta")) || a.meta.name.localeCompare(b.meta.name)) }));
  }, [all.length]);
  const toggleGroup = (ids: MarketId[], on: boolean) => s.setEnabledMarkets(on ? [...new Set([...s.enabledMarkets, ...ids])] : s.enabledMarkets.filter((m) => !ids.includes(m)));
  const applyPreset = (kind: Parameters<typeof presetMarkets>[0]) => s.setEnabledMarkets(presetMarkets(kind, all, ext.health, s.targetCountry));

  // Data section
  const [storage, setStorage] = useState<{ usage: number; quota: number } | null>(null);
  const [counts, setCounts] = useState<Record<BackupTable, number> | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [importMode, setImportMode] = useState<"merge" | "replace">("merge");
  const [busy, setBusy] = useState(false);
  const refreshStorage = () => {
    void storageEstimate().then(setStorage);
    void tableCounts().then(setCounts).catch(() => setCounts(null));
  };
  useEffect(refreshStorage, []);
  const doExport = async () => {
    setBusy(true);
    try {
      download(`manufactogate-yedek-${new Date().toISOString().slice(0, 10)}.json`, await exportAll(), "application/json");
      toast("Yedek indirildi", { tone: "success" });
    } catch (e) {
      toast(`Yedek alınamadı: ${e instanceof Error ? e.message : String(e)}`, { tone: "danger" });
    } finally {
      setBusy(false);
    }
  };
  const doImport = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      const backup = parseBackup(await file.text());
      if (importMode === "replace" && !confirm("Mevcut veriler silinip yedekle değiştirilecek. Devam?")) return;
      const r = await importAll(backup, importMode);
      toast(`${r.rows.toLocaleString("tr-TR")} satır yüklendi (${importMode === "replace" ? "değiştirildi" : "birleştirildi"})`, { tone: "success" });
      await s.hydrate();
      refreshStorage();
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), { tone: "danger" });
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };
  const doClear = async (kind: Parameters<typeof clearData>[0], label: string) => {
    if (!confirm(`${label} silinsin mi? Bu işlem geri alınamaz.`)) return;
    setBusy(true);
    try {
      await clearData(kind);
      toast(`${label} silindi`, { tone: "success" });
      if (kind === "settings") await s.hydrate();
      refreshStorage();
    } finally {
      setBusy(false);
    }
  };

  const healthRow = (a: MarketAdapter) => {
    const h = ext.health[a.id];
    const sess = ext.info.sessions[a.id];
    const def = REAL_DEF_BY_ID[a.id];
    const dot = h ? (h.ok ? "bg-success" : "bg-danger") : sess === "logged-in" ? "bg-success" : sess === "logged-out" || sess === "captcha" ? "bg-warning" : "bg-border";
    return { h, sess, def, dot };
  };

  return (
    <div className="mx-auto max-w-[1100px] px-4 py-8">
      <h1 className="text-xl font-semibold tracking-tight">Ayarlar</h1>

      {/* ---- Data source ---- */}
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
              <button key={k} type="button" aria-pressed={s.dataSource === k} onClick={() => s.setDataSource(k)} className={cn("rounded-md border px-3 py-1.5 text-[13px]", s.dataSource === k ? "border-accent bg-accent/10 text-accent" : "border-border hover:bg-surface-2")}>
                {label}
              </button>
            ))}
            <span className="ml-auto text-[12px] text-muted">
              {ext.info.installed ? (ext.info.orphaned ? "Eklenti bağlantısı koptu · sayfayı yenile" : `Eklenti v${ext.info.version} bağlı${ext.info.lastSeenAt ? ` · ${relTime(ext.info.lastSeenAt)}` : ""}`) : ext.detecting ? "Eklenti aranıyor…" : "Eklenti bulunamadı"}
              {!ext.info.installed && <Button size="sm" variant="ghost" className="ml-2" onClick={() => void ext.detect({ retries: 2 })}>Yeniden ara</Button>}
            </span>
          </div>
          <p className="mt-2 text-[12px] text-muted">
            Gerçek pazar aramaları eklenti üzerinden, senin oturumunla, arka planda açılan sekmelerde çalışır. Eklenti yoksa katalog ve aramalar sahte veriyle sürer.
            {ext.wanted && <span className="text-warning"> Şu an “gerçek pazarlar” seçili ama eklenti yok: sahte veri gösteriliyor.</span>}
          </p>
          {!ext.info.installed && (
            <div className="mt-3 rounded-md border border-border bg-surface-2 p-3 text-[13px]">
              <div className="font-medium">Eklentiyi kurmak için</div>
              <ol className="mt-1 list-decimal space-y-0.5 pl-5 text-muted">
                <li>Depoda <code className="rounded bg-surface px-1">pnpm --filter @manufactogate/extension build</code> çalıştır; <code className="rounded bg-surface px-1">apps/extension/dist</code> oluşur.</li>
                <li>Chrome'da <code className="rounded bg-surface px-1">chrome://extensions</code> → sağ üstte “Geliştirici modu”nu aç.</li>
                <li>“Paketlenmemiş öğe yükle” → <code className="rounded bg-surface px-1">dist</code> klasörünü seç.</li>
                <li>Bu sayfayı yenile; sağ üstteki nokta yeşile döner. Eklentiyi her güncellediğinde bu sekmeyi de yenile.</li>
              </ol>
            </div>
          )}
          {ext.info.installed && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-[12px] font-medium uppercase tracking-wide text-muted">Sağlık kontrolü</span>
              {ext.progress && <span className="text-[12px] text-muted tnum">{ext.progress}</span>}
              <span className="ml-auto flex flex-wrap gap-2">
                {ext.checking ? (
                  <Button size="sm" variant="danger" onClick={ext.stop}>Durdur</Button>
                ) : (
                  <>
                    <Button size="sm" onClick={() => void ext.runHealth()}>Ana 4 pazar</Button>
                    <Button size="sm" variant="primary" onClick={() => void ext.runRound(s.enabledMarkets)} disabled={!s.enabledMarkets.length}>
                      Kalibrasyon turu ({s.enabledMarkets.length} açık pazar, sırayla)
                    </Button>
                  </>
                )}
              </span>
              <p className="w-full text-[12px] text-muted">Sonuçlar bu cihazda saklanır; pazar satırlarında ve Panel'de görünür. 24 saatten eski sonuçlar “eski” olarak işaretlenir.</p>
            </div>
          )}
        </Card>
      </section>

      {/* ---- Markets ---- */}
      <section className="mt-6">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <h2 className="text-[12px] font-medium uppercase tracking-wide text-muted">Pazarlar</h2>
          <span className="text-[12px] text-muted tnum">{s.enabledMarkets.length}/{all.length} açık</span>
          <div className="ml-auto flex flex-wrap gap-1" role="group" aria-label="Hazır seçimler">
            <button type="button" className="chip" onClick={() => applyPreset("working")} title="Son sağlık kontrolünde sonuç veren pazarlar; kontrol yoksa tarayıcıda doğrulanan 9 pazar">Çalışanlar</button>
            <button type="button" className="chip" onClick={() => applyPreset("verified")} title="Beta olmayan, kalibre edilmiş pazarlar">Doğrulananlar</button>
            <button type="button" className="chip" onClick={() => applyPreset("target")}>Hedef ülke pazarları</button>
            <button type="button" className="chip" onClick={() => applyPreset("all")}>Hepsi</button>
            <button type="button" className="chip" onClick={() => applyPreset("none")}>Hiçbiri</button>
          </div>
        </div>
        <p className="mb-2 text-[12px] text-muted">Beta pazarlar genel kart okuma ile çalışır; bir pazar boş dönerse arama sayfasını “Fixture yakala” ile kaydet, kalibre edelim.</p>
        <div className="space-y-3">
          {groups.map(({ region, adapters }) => {
            const ids = adapters.map((a) => a.id);
            const on = ids.filter((id) => enabledSet.has(id)).length;
            return (
              <Card key={region}>
                <div className="flex items-center gap-2 border-b border-border px-3 py-2 text-[13px]">
                  <span className="market-dot" data-region={region} aria-hidden />
                  <span className="font-medium">{REGION_LABELS_TR[region]}</span>
                  <span className="text-[12px] text-muted tnum">{on}/{ids.length}</span>
                  <span className="ml-auto flex gap-2 text-[12px]">
                    <button type="button" className="text-accent hover:underline" onClick={() => toggleGroup(ids, true)}>tümü</button>
                    <button type="button" className="text-muted hover:underline" onClick={() => toggleGroup(ids, false)}>hiçbiri</button>
                  </span>
                </div>
                <ul className="divide-y divide-border">
                  {adapters.map((a) => {
                    const { h, sess, def, dot } = healthRow(a);
                    const beta = a.meta.version.includes("beta");
                    const checked = enabledSet.has(a.id);
                    const searchUrl = def ? def.searchUrl(def.healthQuery) : null;
                    return (
                      <li key={a.id} className={cn("grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-1 px-3 py-2 text-[13px] sm:grid-cols-[auto_10rem_1fr_auto]", checked ? "" : "text-muted")}>
                        <input type="checkbox" checked={checked} onChange={() => s.toggleMarket(a.id)} className="accent-[var(--accent)]" aria-label={`${a.meta.name} pazarını aç/kapat`} />
                        <span className="flex min-w-0 items-center gap-2">
                          <span className={cn("inline-block h-2 w-2 shrink-0 rounded-full", dot)} title={h ? h.message : sessionLabel(sess, !!a.meta.loginUrl)} />
                          <span className="truncate font-medium text-text">{a.meta.name}</span>
                          {beta && <Badge tone="warning">beta</Badge>}
                        </span>
                        <span className="col-span-2 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] text-muted sm:col-span-1">
                          <span>{a.meta.country.toUpperCase()} · {a.meta.currency} · {ROLE_TR[a.meta.role]}</span>
                          <span className="hidden sm:inline">· {[a.meta.capabilities.imageSearch && "görsel", a.meta.capabilities.textSearch && "metin", a.meta.capabilities.linkResolve && "link"].filter(Boolean).join(" ")}</span>
                          <span>· {sessionLabel(sess, !!a.meta.loginUrl)}</span>
                          {h && (
                            <span className={cn("truncate", h.ok ? "text-success" : "text-danger")} title={h.message}>
                              · {h.ok ? "sağlıklı" : "sorun"}{h.message ? ` · ${h.message}` : ""} · {relTime(h.checkedAt)}
                              {isStaleHealth(h) && <Badge tone="warning" className="ml-1">eski</Badge>}
                            </span>
                          )}
                        </span>
                        <span className="col-span-2 flex items-center gap-3 text-[12px] sm:col-span-1 sm:justify-end">
                          {ext.info.installed && (
                            <button type="button" className="text-accent hover:underline disabled:opacity-50" disabled={ext.checking} onClick={() => void ext.checkMarket(a.id)}>kontrol et</button>
                          )}
                          {(sess === "logged-out" || sess === "captcha" || (!h?.ok && a.meta.loginUrl && sess !== "logged-in")) && a.meta.loginUrl && (
                            <a href={a.meta.loginUrl} target="_blank" rel="noreferrer noopener" className="text-accent hover:underline">Giriş yap ↗</a>
                          )}
                          {searchUrl && (
                            <a href={searchUrl} target="_blank" rel="noreferrer noopener" className="text-muted hover:text-text hover:underline" title="Pazarın arama sayfasını yeni sekmede aç: giriş yapmak ya da fixture yakalamak için">Arama sayfası ↗</a>
                          )}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </Card>
            );
          })}
        </div>
        <Card className="mt-3 p-4 text-[13px]">
          <div className="font-medium">Fixture yakala: boş dönen bir pazarı kalibre etmek için</div>
          <ol className="mt-1 list-decimal space-y-0.5 pl-5 text-muted">
            <li>Yukarıdaki “Arama sayfası ↗” ile pazarın arama sonuçlarını kendi hesabınla aç; gerekiyorsa giriş yap.</li>
            <li>Sonuçlar görünürken eklenti simgesine tıkla → “Fixture yakala”. Sayfa HTML'i İndirilenler klasörüne iner.</li>
            <li>Dosyayı paylaş; seçiciler buna göre kalibre edilir ve pazar bir sonraki sürümde doğrulanmış olur.</li>
          </ol>
        </Card>
      </section>

      {/* ---- Target country ---- */}
      <section className="mt-6">
        <h2 className="mb-2 text-[12px] font-medium uppercase tracking-wide text-muted">Hedef ülke</h2>
        <div className="flex flex-wrap gap-2">
          {Object.values(COUNTRY_PROFILES).map((p) => (
            <button
              key={p.country}
              type="button"
              aria-pressed={s.targetCountry === p.country}
              onClick={() => s.setTargetCountry(p.country)}
              className={cn("rounded-md border px-3 py-1.5 text-[13px]", s.targetCountry === p.country ? "border-accent bg-accent/10 text-accent" : "border-border hover:bg-surface-2")}
              title={`Oranlar ${p.asOf} tarihli`}
            >
              {COUNTRY_NAMES_TR[p.country] ?? p.country.toUpperCase()} · {p.currency}
            </button>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-[13px]">
          <span className="text-muted">Gösterge para birimi</span>
          {DISPLAY_CURRENCIES.map((c) => (
            <button key={c} type="button" aria-pressed={s.displayCurrency === c} onClick={() => s.setDisplayCurrency(c)} className={cn("rounded-md border px-2.5 py-1", s.displayCurrency === c ? "border-accent bg-accent/10 text-accent" : "border-border hover:bg-surface-2")}>
              {c}
            </button>
          ))}
        </div>
        <p className="mt-2 text-[12px] text-muted">Vergi ve kargo tabloları tarihli ve kaynaklıdır. Hedef ülkede satan en az bir pazar açık tutulur; aksi halde “satılır mı” analizi boş kalır.</p>
      </section>

      {/* ---- Search depth ---- */}
      <section className="mt-6">
        <h2 className="mb-2 text-[12px] font-medium uppercase tracking-wide text-muted">Arama derinliği</h2>
        <Card className="p-4 text-[13px]">
          <div className="flex flex-wrap items-center gap-2">
            <span>Pazar başına en çok</span>
            {MAX_PER_MARKET_OPTIONS.map((n) => (
              <button key={n} type="button" aria-pressed={s.search.maxPerMarket === n} onClick={() => s.setSearch({ maxPerMarket: n as MaxPerMarket })} className={cn("rounded-md border px-2.5 py-1 tnum", s.search.maxPerMarket === n ? "border-accent bg-accent/10 text-accent" : "border-border hover:bg-surface-2")}>
                {n}
              </button>
            ))}
            <span>sonuç</span>
          </div>
          <label className="mt-3 flex items-start gap-2">
            <input type="checkbox" className="mt-0.5" checked={s.search.visualAi} onChange={(e) => s.setSearch({ visualAi: e.target.checked })} />
            <span>
              <span className="font-medium">Görsel yapay zekâ</span>
              <span className="block text-[12px] text-muted">Sonuçları ürünün görünüşüne göre karşılaştırır ve fotoğraftaki ürünü tanır (CLIP modeli, tarayıcında çalışır, ücretsiz). İlk açılışta bir kez ~90 MB indirilir, sonra önbellekten gelir.</span>
            </span>
          </label>
          <p className="mt-2 text-[12px] text-muted">Daha fazla sonuç = pazar başına daha fazla sayfa ve daha uzun açık kalan sekmeler. 600 ile 33 pazarda bir arama dakikalar sürebilir ve bazı pazarlar hız sınırı uygular; sorun çıkarsa 150'ye dön.</p>
        </Card>
      </section>

      <ProductNamingSettings />

      {/* ---- Cost assumptions ---- */}
      <section className="mt-6">
        <h2 className="mb-2 text-[12px] font-medium uppercase tracking-wide text-muted">Maliyet varsayımları</h2>
        <Card className="grid gap-3 p-4 text-[13px] sm:grid-cols-2">
          <label className="flex items-center justify-between gap-3">
            <span>Varsayılan ürün ağırlığı (kg)</span>
            <Input type="number" step="0.05" value={s.cost.defaultWeightKg} onChange={(e) => s.setCost({ defaultWeightKg: Number(e.target.value) || 0 })} className="w-28 text-right tnum" size="sm" />
          </label>
          <label className="flex items-center justify-between gap-3">
            <span>Kargo yöntemi</span>
            <Select value={s.cost.shippingKey} onChange={(e) => s.setCost({ shippingKey: e.target.value })} className="w-auto" size="sm">
              {(COUNTRY_PROFILES[s.targetCountry]?.shipping ?? []).map((o) => (
                <option key={o.key} value={o.key}>{o.label} · {o.transitDays[0]}-{o.transitDays[1]} gün</option>
              ))}
            </Select>
          </label>
          <label className="flex items-center justify-between gap-3">
            <span>Reklam ve iade payı (satış fiyatının %)</span>
            <Input type="number" step="1" value={Math.round(s.cost.overheadRate * 100)} onChange={(e) => s.setCost({ overheadRate: (Number(e.target.value) || 0) / 100 })} className="w-28 text-right tnum" size="sm" />
          </label>
        </Card>
        {(() => {
          const ref = COUNTRY_PROFILES[s.targetCountry] ?? COUNTRY_PROFILES["tr"]!;
          const own = s.countryOverrides[ref.country] ?? {};
          const defaults = referenceOverrides(ref);
          const edited = hasCountryOverrides(own);
          const patch = (p: CountryOverridesPatch) => s.setCountryOverrides(ref.country, p);
          return (
            <>
              <h3 className="mb-2 mt-4 flex flex-wrap items-center gap-2 text-[12px] font-medium uppercase tracking-wide text-muted">
                <span>Ülke oranları · {COUNTRY_NAMES_TR[ref.country] ?? ref.country.toUpperCase()}</span>
                {edited && <Badge tone="warning">düzenlendi</Badge>}
                {edited && (
                  <button type="button" className="ml-auto normal-case tracking-normal text-accent hover:underline" onClick={() => s.resetCountryOverrides(ref.country)}>
                    Referansa dön ({ref.asOf})
                  </button>
                )}
              </h3>
              <Card className="grid gap-3 p-4 text-[13px] sm:grid-cols-2" data-testid="country-rates">
                <RateField label="KDV" value={own.vatRate} def={defaults.vatRate} onChange={(v) => patch({ vatRate: pctToRate(v) })} hint="İthalat ve satış KDV'si. Girdiğin oran her ürüne uygulanır; referansın GTİP'e göre indirimli oranları devre dışı kalır." />
                <RateField label="Gümrük vergisi (GTİP eşleşmeyen ürünler)" value={own.dutyDefaultRate} def={defaults.dutyDefaultRate} onChange={(v) => patch({ dutyDefaultRate: pctToRate(v) })} hint="GTİP faslı tanınmayan ürünler için varsayılan oran; tanınan fasıllar referans tabloyu kullanır." />
                <AmountField label="Gümrük müşaviri ve işlem (gönderi başına)" value={own.brokerFee} def={defaults.brokerFee} onChange={(v) => patch({ brokerFee: amountOrNull(v) })} currency={ref.currency} />
                <AmountField label="Yurt içi kargo (adet başına)" value={own.domesticShippingPerUnit} def={defaults.domesticShippingPerUnit} onChange={(v) => patch({ domesticShippingPerUnit: amountOrNull(v) })} currency={ref.currency} />
                {marketplacesOf(ref).map((id) => (
                  <RateField
                    key={id}
                    label={`${getRegistry().get(id)?.meta.name ?? REAL_DEF_BY_ID[id]?.meta.name ?? id} komisyonu`}
                    value={own.commissions?.[id]}
                    def={defaults.commissions[id] ?? 0}
                    onChange={(v) => patch({ commissions: { [id]: pctToRate(v) } })}
                    hint="Satış fiyatı üzerinden pazar yeri komisyonu. Girdiğin oran kategori tablosunun yerine geçer."
                  />
                ))}
                <p className="text-[12px] text-muted sm:col-span-2">
                  Referans oranlar {ref.asOf} tarihli ve yaklaşıktır; kesin oran GTİP'e göre değişir. Düzenlediğin değerler yalnız bu ülke için saklanır; ürün sayfası, karşılaştırma ve analiz kartı aynı değerleri kullanır. Kargo yöntemi de ülke başına hatırlanır.
                </p>
              </Card>
            </>
          );
        })()}
        <h3 className="mb-2 mt-4 text-[12px] font-medium uppercase tracking-wide text-muted">Kurlar · 1 birim = ? TRY</h3>
        <Card className="grid gap-3 p-4 text-[13px] sm:grid-cols-2 lg:grid-cols-4">
          {EDITABLE_FX.map((code) => {
            const own = s.fxRates[code];
            return (
              <label key={code} className="flex items-center justify-between gap-3">
                <span>
                  {code}
                  {own !== undefined && own !== FX_TO_TRY[code] && <button type="button" className="ml-2 text-[11px] text-accent hover:underline" onClick={() => s.setFxRate(code, null)}>varsayılan</button>}
                </span>
                <Input type="number" step="0.01" min="0" value={own ?? FX_TO_TRY[code] ?? ""} onChange={(e) => s.setFxRate(code, Number(e.target.value) || null)} className="w-28 text-right tnum" size="sm" aria-label={`${code} kuru`} />
              </label>
            );
          })}
          <p className="text-[12px] text-muted sm:col-span-2 lg:col-span-4">Kartlardaki “≈” tutarlar, analiz kartı ve indirilmiş maliyet aynı tabloyu kullanır. Varsayılan tablo {FX_AS_OF} tarihli göstergedir; canlı kur yoktur.</p>
        </Card>
      </section>

      {/* ---- Data ---- */}
      <section className="mt-6">
        <h2 className="mb-2 text-[12px] font-medium uppercase tracking-wide text-muted">Veri</h2>
        <Card className="p-4 text-[13px]">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-muted">
            <span>Tüm veriler bu tarayıcıda saklanır; sunucuya hiçbir şey gönderilmez.</span>
            {storage && <span className="tnum">{formatBytes(storage.usage)} kullanılıyor{storage.quota ? ` · ${formatBytes(storage.quota)} kota` : ""}</span>}
            {counts && <span className="tnum">{counts.listings} ilan · {counts.searches} arama · {counts.watches} izleme · {counts.projects} proje</span>}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button onClick={() => void doExport()} disabled={busy}>Yedeği indir</Button>
            <Select size="sm" value={importMode} onChange={(e) => setImportMode(e.target.value as "merge" | "replace")} aria-label="Yükleme biçimi" className="w-auto">
              <option value="merge">Birleştir</option>
              <option value="replace">Değiştir</option>
            </Select>
            <Button onClick={() => fileRef.current?.click()} disabled={busy}>Yedek yükle</Button>
            <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => void doImport(e.target.files?.[0])} />
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-muted">Sil:</span>
            <Button size="sm" variant="danger" disabled={busy} onClick={() => void doClear("history", "Arama geçmişi (projeler ve izlenenler korunur)")}>geçmiş</Button>
            <Button size="sm" variant="danger" disabled={busy} onClick={() => void doClear("watches", "İzleme listesi")}>izleme</Button>
            <Button size="sm" variant="danger" disabled={busy} onClick={() => void doClear("projects", "Projeler")}>projeler</Button>
            <Button size="sm" variant="danger" disabled={busy} onClick={() => void doClear("settings", "Ayarlar")}>ayarlar</Button>
          </div>
        </Card>
      </section>
    </div>
  );
}
