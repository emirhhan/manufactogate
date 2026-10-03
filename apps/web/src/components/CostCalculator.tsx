import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { CountryProfile, RawListing } from "@manufactogate/core";
import { COUNTRY_NAMES_TR } from "@manufactogate/country-profiles";
import { HS_OPTIONS, hsSuggest, scenario, shippingKeyFor, type Scenario } from "@/lib/analysis";
import { money } from "@/lib/format";
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
 * weight, HS/GTİP code, insurance and extra per-unit costs. Reports the scenario upward so the
 * margin line and the price chain follow the same numbers.
 */
export function CostCalculator({ listing, profile, groupKey, onScenario }: { listing: RawListing; profile: CountryProfile; groupKey?: string | undefined; onScenario?: ((s: Scenario | null, state: CalculatorState) => void) | undefined }) {
  const cost = useSettings((x) => x.cost);
  const projects = useProjects();
  const suggested = hsSuggest(groupKey);
  const [state, setState] = useState<CalculatorState>(() => ({ qty: null, shippingKey: shippingKeyFor(profile, cost.shippingKey), weightKg: cost.defaultWeightKg, hsCode: suggested?.hs ?? "", insuranceRate: 0.005, extraPerUnit: 0 }));
  const [noteDone, setNoteDone] = useState("");
  const key = `${listing.market}:${listing.id}`;
  useEffect(() => {
    setState({ qty: null, shippingKey: shippingKeyFor(profile, cost.shippingKey), weightKg: cost.defaultWeightKg, hsCode: suggested?.hs ?? "", insuranceRate: 0.005, extraPerUnit: 0 });
    setNoteDone("");
    // Only when the listing or the profile changes; settings are the initial values.
  }, [key, profile.country]);

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

  const summary = sc
    ? `${listing.title.slice(0, 60)} · ${sc.qty} adet · ${sc.shippingLabel} · ${state.weightKg} kg · GTİP ${state.hsCode || "-"} · birim maliyet ${money(sc.cost.perUnit, sc.cost.currency)} · toplam ${money(sc.cost.total, sc.cost.currency)} (kur ${sc.fx.toFixed(4)})`
    : "";

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-[11px] font-medium uppercase tracking-wide text-muted">{country}'ye indirilmiş maliyet · senaryo</div>
        <Link to="/settings" className="text-[11px] text-accent hover:underline">varsayılanları ayarla</Link>
      </div>

      {!listing.price.tiers.length ? (
        <p className="mt-2 text-[12px] text-muted">Bu ilan fiyatı teklif üzerine veriyor; tedarikçiden fiyat alınca adet ve maliyet hesaplanır.</p>
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
                <div className="mt-2 text-[12px] text-muted tnum">Tek fiyat: {money(tiers[0]!.unitPrice, listing.price.currency)}{listing.moq && listing.moq > 1 ? ` · MOQ ${listing.moq}` : ""}</div>
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
                <label className="flex flex-col gap-0.5 text-muted">
                  GTİP / HS
                  <input list="hs-options" value={state.hsCode} onChange={(e) => set("hsCode", e.target.value.replace(/[^0-9.]/g, ""))} placeholder={suggested ? `${suggested.hs} önerildi` : "örn. 8517"} className="h-7 rounded border border-border bg-bg px-2 text-text tnum" />
                  <datalist id="hs-options">
                    {HS_OPTIONS.map((o) => (
                      <option key={o.group} value={o.hs}>{o.label}</option>
                    ))}
                  </datalist>
                </label>
                <label className="flex flex-col gap-0.5 text-muted">
                  Sigorta oranı (%)
                  <input type="number" step="0.1" min={0} value={Math.round(state.insuranceRate * 1000) / 10} onChange={(e) => set("insuranceRate", Math.max(0, Number(e.target.value) || 0) / 100)} className="h-7 rounded border border-border bg-bg px-2 text-right text-text tnum" />
                </label>
                <label className="col-span-2 flex flex-col gap-0.5 text-muted">
                  Ek birim maliyet ({profile.currency}; etiket, paket, test)
                  <input type="number" step="1" min={0} value={state.extraPerUnit} onChange={(e) => set("extraPerUnit", Math.max(0, Number(e.target.value) || 0))} className="h-7 rounded border border-border bg-bg px-2 text-right text-text tnum" />
                </label>
              </div>
            </div>
            <div>
              <div className="grid gap-x-6 gap-y-1 text-[13px]">
                {sc.cost.lines.map((l) => (
                  <div key={l.key} className="flex justify-between tnum">
                    <span className="text-muted">{l.label}</span>
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
              <div className="flex justify-between text-[12px] text-muted tnum">
                <span>Sevkiyat toplamı</span>
                <span>{money(sc.cost.total, sc.cost.currency)}</span>
              </div>
              <div className="mt-1 text-[11px] text-muted tnum">
                Kur 1 {listing.price.currency} = {sc.fx.toFixed(4)} {sc.cost.currency} · {sc.shippingLabel}{sc.transitDays ? ` ${sc.transitDays[0]}-${sc.transitDays[1]} gün` : ""} · gümrük {state.hsCode ? `GTİP ${state.hsCode}` : "varsayılan oran"} · oranlar {profile.asOf}
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
