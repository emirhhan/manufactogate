import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { computeMargin, type CountryProfile, type RawListing } from "@manufactogate/core";
import { COUNTRY_NAMES_TR } from "@manufactogate/country-profiles";
import { marketplaceFor, scenario, shippingKeyFor, type Scenario } from "@/lib/analysis";
import { money, pct } from "@/lib/format";
import { HS_GROUP_OPTIONS, hsMemoryKey, hsSourceLabel, loadHsOverrides, rememberHs, suggestHsForTitle, type HsOverrides } from "@/lib/hs";
import { useFxStaleness } from "@/lib/useFx";
import { useProjects } from "@/store/projects";
import { useSettings } from "@/store/settings";
import { Button, Card, cn } from "./ui";

export interface CalculatorState {
  qty: number | null;
  shippingKey: string;
  weightKg: number;
  hsCode: string;
  insuranceRate: number;
  extraPerUnit: number;
}

/**
 * Per-listing landed-cost calculator: quantity slider with tier highlighting, shipping mode, unit
 * weight, product-level GTİP suggestion (core HS table; corrections remembered), insurance and
 * extra per-unit costs, import VAT split, FX table age, and a VAT-aware margin preview at a sell
 * price. Reports the scenario upward so the margin line and the price chain follow the same numbers.
 */
export function CostCalculator({ listing, profile, groupKey, onScenario }: { listing: RawListing; profile: CountryProfile; groupKey?: string | undefined; onScenario?: ((s: Scenario | null, state: CalculatorState) => void) | undefined }) {
  const cost = useSettings((x) => x.cost);
  const projects = useProjects();
  const fx = useFxStaleness();
  const [hsOverrides, setHsOverrides] = useState<HsOverrides | null>(null);
  const suggested = useMemo(() => suggestHsForTitle(listing.title, groupKey, hsOverrides ?? undefined), [listing.title, groupKey, hsOverrides]);
  const [state, setState] = useState<CalculatorState>(() => ({ qty: null, shippingKey: shippingKeyFor(profile, cost.shippingKey), weightKg: cost.defaultWeightKg, hsCode: suggested?.hs ?? "", insuranceRate: 0.005, extraPerUnit: 0 }));
  const [noteDone, setNoteDone] = useState("");
  const [sellText, setSellText] = useState("");
  const [marketplace, setMarketplace] = useState(() => marketplaceFor(profile, undefined));
  const key = `${listing.market}:${listing.id}`;

  useEffect(() => {
    let alive = true;
    void loadHsOverrides().then((o) => alive && setHsOverrides(o));
    return () => {
      alive = false;
    };
  }, [key]);
  useEffect(() => {
    setState({ qty: null, shippingKey: shippingKeyFor(profile, cost.shippingKey), weightKg: cost.defaultWeightKg, hsCode: suggested?.hs ?? "", insuranceRate: 0.005, extraPerUnit: 0 });
    setNoteDone("");
    setSellText("");
    setMarketplace(marketplaceFor(profile, undefined));
    // Only when the listing or the profile changes; settings are the initial values.
  }, [key, profile.country]);
  // The remembered correction (or the leaf suggestion) arrives after the first paint: adopt it while the field is untouched.
  useEffect(() => {
    if (suggested && (state.hsCode === "" || suggested.source === "user")) setState((s) => (s.hsCode === suggested.hs ? s : { ...s, hsCode: suggested.hs }));
  }, [suggested?.hs, suggested?.source]);

  const sc = useMemo(
    () => scenario(profile, listing, { qty: state.qty, shippingKey: state.shippingKey, weightKg: state.weightKg, cnyTry: cost.fxCnyTry, hsCode: state.hsCode || undefined, insuranceRate: state.insuranceRate, extraPerUnit: state.extraPerUnit } as Parameters<typeof scenario>[2]),
    [profile, listing, state, cost.fxCnyTry],
  );
  useEffect(() => {
    onScenario?.(sc, state);
  }, [sc, state, onScenario]);

  const tiers = useMemo(() => [...listing.price.tiers].sort((a, b) => a.minQty - b.minQty), [listing.price.tiers]);
  const sliderMax = Math.max(1000, (tiers[tiers.length - 1]?.minQty ?? 100) * 3, listing.moq ?? 1);
  const qty = sc?.qty ?? state.qty ?? 100;
  const set = <K extends keyof CalculatorState>(k: K, v: CalculatorState[K]) => setState((s) => ({ ...s, [k]: v }));
  const country = COUNTRY_NAMES_TR[profile.country] ?? profile.country.toUpperCase();
  const edited = profile.sources.includes("user");
  const fxPinned = fx.pinned.includes(listing.price.currency.toUpperCase());

  // Margin preview (VAT-aware): consumer price includes KDV, commission on the gross, import VAT inside the landed cost is recovered.
  const sell = Number(sellText.replace(",", "."));
  const margin = useMemo(() => (sc && sell > 0 ? computeMargin(profile, sc.cost, { sellPrice: sell, marketplaceId: marketplace, overheadRate: cost.overheadRate }) : null), [sc, sell, profile, marketplace, cost.overheadRate]);
  const marketplaces = Object.keys(profile.commissions);

  const rememberCode = (code: string) => {
    if (!suggested && !listing.title) return;
    const memKey = hsMemoryKey(listing.title, suggested?.leafKey);
    void rememberHs(memKey, code).then(setHsOverrides).catch(() => undefined);
  };

  const summary = sc
    ? `${listing.title.slice(0, 60)} · ${sc.qty} adet · ${sc.shippingLabel} · ${state.weightKg} kg · GTİP ${state.hsCode || "-"} · birim maliyet ${money(sc.cost.perUnit, sc.cost.currency)} (KDV hariç ${money(sc.cost.landedExVatPerUnit, sc.cost.currency)}) · toplam ${money(sc.cost.total, sc.cost.currency)} (kur ${sc.fx.toFixed(4)}, tablo ${fx.asOf})`
    : "";

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-[11px] font-medium uppercase tracking-wide text-muted">
          {country}'ye indirilmiş maliyet · senaryo
          {edited && <span className="ml-2 normal-case tracking-normal text-accent" title="KDV, gümrük, komisyon veya müşavir ücretini Ayarlar'da düzenledin">senin oranların</span>}
        </div>
        <Link to="/settings" className="text-[11px] text-accent hover:underline">varsayılanları ayarla</Link>
      </div>

      {!listing.price.tiers.length ? (
        <p className="mt-2 text-[12px] text-muted">{listing.priceOnRequest ? "Bu ilan fiyatı teklifle veriyor" : "Bu ilan fiyatı teklif üzerine veriyor"}; tedarikçiden fiyat alınca adet ve maliyet hesaplanır.</p>
      ) : !sc ? (
        <p className="mt-2 text-[12px] text-muted">{listing.price.currency} için kur yok; maliyet hesaplanamıyor.</p>
      ) : (
        <>
          <div className="mt-3 grid gap-3 md:grid-cols-[1fr_1fr]">
            <div>
              <div className="flex items-center justify-between text-[12px]">
                <label htmlFor="cc-qty" className="text-muted">Adet</label>
                <input id="cc-qty" type="number" min={1} value={qty} onChange={(e) => set("qty", Math.max(1, Number(e.target.value) || 1))} className="h-7 w-24 rounded border border-border bg-bg px-2 text-right tnum outline-none focus:border-accent" />
              </div>
              <input type="range" min={1} max={sliderMax} value={Math.min(qty, sliderMax)} onChange={(e) => set("qty", Number(e.target.value))} className="mt-1 w-full" aria-label="Adet" />
              {tiers.length > 1 ? (
                <ul className="mt-2 flex flex-wrap gap-1.5 text-[12px]">
                  {tiers.map((t, i) => (
                    <li key={t.minQty} className={cn("rounded border px-2 py-1 tnum", i === sc.tierIndex ? "border-accent bg-accent/10 text-accent" : "border-border text-muted")} title={i === sc.tierIndex ? "bu adette geçerli kademe" : undefined}>
                      {t.minQty}+ · {money(t.unitPrice, listing.price.currency)}
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="mt-2 text-[12px] text-muted tnum">
                  Tek fiyat: {money(tiers[0]!.unitPrice, listing.price.currency)}
                  {listing.moq && listing.moq > 1 ? ` · MOQ ${listing.moq}` : ""}
                  {listing.packQty && listing.packQty > 1 ? ` · ${listing.packQty} adetlik paket (birim fiyata bölündü)` : ""}
                </div>
              )}
              <div className="mt-3 grid grid-cols-2 gap-2 text-[12px]">
                <label className="flex flex-col gap-0.5 text-muted">
                  Kargo
                  <select value={state.shippingKey} onChange={(e) => set("shippingKey", e.target.value)} className="h-7 rounded border border-border bg-bg px-2 text-text">
                    {profile.shipping.map((s) => (
                      <option key={s.key} value={s.key}>{s.label} · {s.transitDays[0]}-{s.transitDays[1]} gün</option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-0.5 text-muted">
                  Birim ağırlık (kg)
                  <input type="number" step="0.05" min={0.01} value={state.weightKg} onChange={(e) => set("weightKg", Math.max(0.01, Number(e.target.value) || 0.01))} className="h-7 rounded border border-border bg-bg px-2 text-right text-text tnum" />
                </label>
                <label className="col-span-2 flex flex-col gap-0.5 text-muted">
                  GTİP / HS
                  <input
                    list="hs-options"
                    value={state.hsCode}
                    onChange={(e) => set("hsCode", e.target.value.replace(/[^0-9.]/g, ""))}
                    onBlur={(e) => {
                      const code = e.target.value.replace(/\D/g, "");
                      if (code !== (suggested?.hs ?? "") || suggested?.source === "user") rememberCode(code);
                    }}
                    placeholder={suggested ? `${suggested.display} önerildi` : "örn. 8517"}
                    className="h-7 rounded border border-border bg-bg px-2 text-text tnum"
                    aria-describedby="hs-hint"
                  />
                  <datalist id="hs-options">
                    {suggested && <option value={suggested.hs}>{suggested.label}</option>}
                    {HS_GROUP_OPTIONS.map((o) => (
                      <option key={o.group} value={o.hs}>{o.label}</option>
                    ))}
                  </datalist>
                  <span id="hs-hint" className="text-[11px]">
                    {suggested ? (
                      <>
                        Öneri {suggested.display} · {suggested.label} · {hsSourceLabel(suggested.source)}
                        {suggested.source !== "user" ? ` (güven %${Math.round(suggested.confidence * 100)})` : ""}
                        {state.hsCode.replace(/\D/g, "") !== suggested.hs && (
                          <button type="button" onClick={() => set("hsCode", suggested.hs)} className="ml-1 text-accent hover:underline">öneriyi kullan</button>
                        )}
                        {" · düzelttiğin kod bu ürün için hatırlanır"}
                      </>
                    ) : (
                      "Başlıktan öneri çıkmadı; kodu girersen bu ürün için hatırlanır."
                    )}
                  </span>
                </label>
                <label className="flex flex-col gap-0.5 text-muted">
                  Sigorta oranı (%)
                  <input type="number" step="0.1" min={0} value={Math.round(state.insuranceRate * 1000) / 10} onChange={(e) => set("insuranceRate", Math.max(0, Number(e.target.value) || 0) / 100)} className="h-7 rounded border border-border bg-bg px-2 text-right text-text tnum" />
                </label>
                <label className="flex flex-col gap-0.5 text-muted">
                  Ek birim maliyet ({profile.currency})
                  <input type="number" step="1" min={0} value={state.extraPerUnit} onChange={(e) => set("extraPerUnit", Math.max(0, Number(e.target.value) || 0))} className="h-7 rounded border border-border bg-bg px-2 text-right text-text tnum" title="etiket, paket, test" />
                </label>
              </div>
            </div>
            <div>
              <div className="grid gap-x-6 gap-y-1 text-[13px]">
                {sc.cost.lines.map((l) => (
                  <div key={l.key} className="flex justify-between tnum">
                    <span className="text-muted">
                      {l.label}
                      {l.approximate && <span title="yaklaşık oran"> ≈</span>}
                    </span>
                    <span>
                      {money(l.perUnit, sc.cost.currency)} <span className="text-[11px] text-muted">/ adet</span>
                    </span>
                  </div>
                ))}
              </div>
              <div className="mt-2 flex justify-between border-t border-border pt-2 font-medium tnum">
                <span>Birim maliyet · {sc.qty} adet</span>
                <span>{money(sc.cost.perUnit, sc.cost.currency)}</span>
              </div>
              {sc.cost.vatPerUnit > 0 && (
                <div className="flex justify-between text-[12px] text-muted tnum" title="İthalat KDV'si KDV mükellefi satıcı için indirilebilir; marj hesabı KDV hariç maliyeti kullanır">
                  <span>KDV hariç birim maliyet (ithalat KDV'si {money(sc.cost.vatPerUnit, sc.cost.currency)} indirilebilir)</span>
                  <span>{money(sc.cost.landedExVatPerUnit, sc.cost.currency)}</span>
                </div>
              )}
              <div className="flex justify-between text-[12px] text-muted tnum">
                <span>Sevkiyat toplamı</span>
                <span>{money(sc.cost.total, sc.cost.currency)}</span>
              </div>
              {sc.cost.warnings.length > 0 && <div className="mt-1 text-[11px] text-warning">{sc.cost.warnings.join(" · ")}</div>}
              <div className="mt-1 text-[11px] text-muted tnum">
                Kur 1 {listing.price.currency} = {sc.fx.toFixed(4)} {sc.cost.currency}
                {fxPinned ? " (senin kurun)" : ` (tablo ${fx.asOf}, ${fx.ageDays} gün önce)`}
                {!fxPinned && fx.stale && <span className="text-warning" title="Kur tablosu bir haftadan eski; Ayarlar'dan kuru sabitleyebilirsin"> · kur güncel olmayabilir</span>}
                {" · "}
                {sc.shippingLabel}
                {sc.transitDays ? ` ${sc.transitDays[0]}-${sc.transitDays[1]} gün` : ""} · gümrük {state.hsCode ? `GTİP ${state.hsCode} (%${Math.round(sc.cost.dutyRate * 100)})` : `varsayılan oran (%${Math.round(sc.cost.dutyRate * 100)})`} · oranlar {profile.asOf}
              </div>

              <div className="mt-3 rounded-md border border-border bg-surface-2/40 p-2.5 text-[12px]">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">Satış fiyatı dene</span>
                  <input
                    type="number"
                    min={0}
                    step="1"
                    value={sellText}
                    onChange={(e) => setSellText(e.target.value)}
                    placeholder={`${profile.currency}, KDV dahil`}
                    aria-label="Satış fiyatı"
                    className="h-7 w-32 rounded border border-border bg-bg px-2 text-right tnum outline-none focus:border-accent"
                  />
                  {marketplaces.length > 1 && (
                    <select value={marketplace} onChange={(e) => setMarketplace(e.target.value)} className="h-7 rounded border border-border bg-bg px-2 text-[12px]" aria-label="Pazar yeri">
                      {marketplaces.map((m) => (
                        <option key={m} value={m}>{m} · %{Math.round((profile.commissions[m] ?? 0) * 100)}</option>
                      ))}
                    </select>
                  )}
                </div>
                {margin ? (
                  <div className="mt-2 grid gap-x-6 gap-y-0.5 tnum">
                    <Line label={`Satış fiyatı (KDV dahil)`} v={money(margin.lines.grossPrice, profile.currency)} />
                    {margin.lines.outputVat > 0 && <Line label={`KDV (%${Math.round((profile.salesVatRate ?? 0) * 100)})`} v={`−${money(margin.lines.outputVat, profile.currency)}`} muted />}
                    <Line label={`Komisyon ${marketplace} (%${Math.round(margin.commissionRate * 100)})`} v={`−${money(margin.commission, profile.currency)}`} muted />
                    {margin.overhead > 0 && <Line label={`Reklam ve iade payı (%${Math.round(cost.overheadRate * 100)})`} v={`−${money(margin.overhead, profile.currency)}`} muted />}
                    <Line label="İndirilmiş maliyet (KDV hariç)" v={`−${money(margin.lines.landedExVat, profile.currency)}`} muted />
                    <div className={cn("flex justify-between border-t border-border pt-1 font-medium", margin.netPerUnit > 0 ? "text-success" : "text-danger")}>
                      <span>Net kazanç / adet</span>
                      <span>
                        {money(margin.netPerUnit, profile.currency)} ({pct(margin.marginRate)})
                      </span>
                    </div>
                  </div>
                ) : (
                  <p className="mt-1 text-muted">Hedef pazardaki satış fiyatını yaz: KDV, komisyon ve gider sonrası net kazanç burada görünür.</p>
                )}
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Button size="sm" onClick={() => void navigator.clipboard?.writeText(summary).then(() => setNoteDone("copied")).catch(() => undefined)}>
                  {noteDone === "copied" ? "Kopyalandı ✓" : "Senaryoyu kopyala"}
                </Button>
                {projects.projects.length > 0 && (
                  <select
                    className="h-7 rounded border border-border bg-bg px-2 text-[12px]"
                    value=""
                    aria-label="Projeye not olarak ekle"
                    onChange={async (e) => {
                      const id = e.target.value;
                      if (!id) return;
                      const pr = projects.projects.find((x) => x.id === id);
                      if (!pr) return;
                      await projects.setNotes(id, `${pr.notes ? pr.notes + "\n" : ""}[${new Date().toISOString().slice(0, 10)}] ${summary}`);
                      setNoteDone(pr.name);
                    }}
                  >
                    <option value="">{noteDone && noteDone !== "copied" ? `Nota eklendi: ${noteDone} ✓` : "Projeye not olarak ekle…"}</option>
                    {projects.projects.map((pr) => (
                      <option key={pr.id} value={pr.id}>{pr.name}</option>
                    ))}
                  </select>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </Card>
  );
}

function Line({ label, v, muted = false }: { label: string; v: string; muted?: boolean }) {
  return (
    <div className={cn("flex justify-between", muted && "text-muted")}>
      <span>{label}</span>
      <span>{v}</span>
    </div>
  );
}
