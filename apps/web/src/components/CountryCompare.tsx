import { useMemo, useState } from "react";
import { computeLandedCost, computeMargin, dutyRateFor, type PriceTier, type RawListing } from "@manufactogate/core";
import { COUNTRY_NAMES_TR, COUNTRY_PROFILES } from "@manufactogate/country-profiles";
import { marketplaceFor, pickQty, rateFor, shippingKeyFor } from "@/lib/analysis";
import { COPY } from "@/lib/copy";
import { money, pct } from "@/lib/format";
import { convert, getDisplayCurrency, minOf } from "@/lib/fx";
import { getRegistry } from "@/lib/registry";
import { effectiveProfile, useSettings } from "@/store/settings";
import { Card, cn } from "./ui";

const MODES = [
  { key: "express", label: "Ekspres" },
  { key: "air", label: "Hava" },
  { key: "rail", label: "Demiryolu" },
  { key: "sea", label: "Deniz" },
] as const;

/**
 * "Which country is this worth selling in?" Landed cost per target country from the source price
 * ladder at a quantity the user controls, and net margin against the cheapest comparable found on
 * that country's markets (commission of the market the price came from) or a typed sell price.
 */
export function CountryCompare({ tiers, currency, weightKg, moq, found, hsCode }: { tiers: PriceTier[]; currency: string; weightKg: number; moq?: number | undefined; found: Record<string, RawListing | undefined>; hsCode?: string | undefined }) {
  const cost = useSettings((s) => s.cost);
  const overrides = useSettings((s) => s.countryOverrides);
  const [sell, setSell] = useState<Record<string, string>>({});
  const [qtyText, setQtyText] = useState("");
  const [mode, setMode] = useState<string>(cost.shippingKey);
  const reg = getRegistry();
  const disp = getDisplayCurrency();
  const qty = pickQty(tiers, moq, Number(qtyText) || null);

  const rows = useMemo(() => {
    // Every country runs with the user's own figures when they edited that country in Settings.
    return Object.keys(COUNTRY_PROFILES).map((c) => effectiveProfile(c, overrides)).map((p) => {
      const fx = rateFor(currency, p.currency, cost.fxCnyTry);
      const shippingKey = shippingKeyFor(p, mode);
      const ship = p.shipping.find((s) => s.key === shippingKey)!;
      if (fx === null || !tiers.length) return { p, qty, fx: null, landed: null, sellPrice: null, margin: null, source: null as string | null, shippingKey, ship, marketplaceId: "", deMinimis: false };
      const landed = computeLandedCost(p, { quantity: qty, tiers, fxRate: fx, unitWeightKg: weightKg, shippingKey, ...(hsCode ? { hsCode } : {}) });
      const goods = landed.lines.find((l) => l.key === "goods")?.amount ?? 0;
      const deMinimis = p.deMinimis !== undefined && goods <= p.deMinimis;
      // Cheapest comparable on this country's markets, remembering which market it came from.
      const marketIds = Object.keys(p.commissions);
      let foundBest: { price: number; market: string } | null = null;
      for (const m of marketIds) {
        const l = found[m];
        if (!l) continue;
        const mn = minOf(l);
        if (mn === null) continue;
        const v = convert(mn, l.price.currency, p.currency);
        if (v === null) continue;
        if (!foundBest || v < foundBest.price) foundBest = { price: v, market: m };
      }
      const typed = Number(sell[p.country]);
      const sellPrice = typed > 0 ? typed : foundBest ? foundBest.price : null;
      const marketplaceId = marketplaceFor(p, foundBest?.market);
      const margin = sellPrice ? computeMargin(p, landed.perUnit, { sellPrice, marketplaceId, overheadRate: cost.overheadRate }) : null;
      const source = typed > 0 ? "girilen" : foundBest ? (reg.get(foundBest.market as never)?.meta.name ?? "bulunan") : null;
      return { p, qty, fx, landed, sellPrice, margin, source, shippingKey, ship, marketplaceId, deMinimis, edited: p.sources.includes("user") };
    });
  }, [tiers, currency, weightKg, found, cost, sell, reg, qty, mode, hsCode, overrides]);

  const best = rows.filter((r) => r.margin).sort((a, b) => (b.margin?.marginRate ?? -1) - (a.margin?.marginRate ?? -1))[0];

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2">
        <div>
          <div className="text-[11px] font-medium uppercase tracking-wide text-muted">{COPY.countryCompare.title}</div>
          <div className="text-[11px] text-muted">{COPY.countryCompare.sub}</div>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[12px]">
          <label className="flex items-center gap-1 text-muted">
            adet
            <input type="number" min={1} value={qtyText} placeholder={String(qty)} onChange={(e) => setQtyText(e.target.value)} className="h-7 w-20 rounded border border-border bg-bg px-2 text-right tnum outline-none focus:border-accent" />
          </label>
          <select value={mode} onChange={(e) => setMode(e.target.value)} className="h-7 rounded border border-border bg-bg px-2 text-[12px]" aria-label="Kargo yolu">
            {MODES.map((m) => (
              <option key={m.key} value={m.key}>{m.label}</option>
            ))}
          </select>
          {best?.margin && (
            <div>
              En kârlı: <span className="font-medium text-success">{COUNTRY_NAMES_TR[best.p.country]} {pct(best.margin.marginRate)}</span>
            </div>
          )}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead className="text-left text-[11px] uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-2 font-medium">Ülke</th>
              <th className="py-2 font-medium">Birim maliyet</th>
              <th className="py-2 font-medium">≈ {disp}</th>
              <th className="py-2 font-medium">Satış fiyatı</th>
              <th className="py-2 font-medium">Kaynak</th>
              <th className="py-2 pr-4 text-right font-medium">Net marj</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const duty = dutyRateFor(r.p, hsCode);
              const assumptions = [
                `${r.qty} adet · ${r.ship.label} (${r.ship.transitDays[0]}-${r.ship.transitDays[1]} gün)`,
                `gümrük %${Math.round(duty * 100)}${hsCode ? ` (GTİP ${hsCode})` : " (varsayılan)"}`,
                ...r.p.taxes.map((t) => `${t.label} %${Math.round(t.rate * 100)}`),
                `müşavir ${money(r.p.brokerFee, r.p.currency)} / sevkiyat`,
                r.p.deMinimis !== undefined ? `de minimis ${money(r.p.deMinimis, r.p.currency)}` : "de minimis yok",
                r.marketplaceId ? `komisyon ${r.marketplaceId} %${Math.round((r.p.commissions[r.marketplaceId] ?? 0) * 100)}` : "",
                r.fx !== null ? `kur 1 ${currency} = ${r.fx.toFixed(4)} ${r.p.currency}` : "",
                `oranlar ${r.p.asOf} tarihli`,
              ].filter(Boolean);
              return (
                <tr key={r.p.country} className={cn("border-t border-border", best?.p.country === r.p.country && r.margin ? "bg-success/5" : "")}>
                  <td className="px-4 py-2 font-medium" title={assumptions.join("\n")}>
                    {COUNTRY_NAMES_TR[r.p.country] ?? r.p.country.toUpperCase()}
                    <span className="ml-1 text-[11px] font-normal text-muted">{r.qty} adet · {r.ship.label}</span>
                    {r.deMinimis && <span className="ml-1 text-[11px] font-normal text-success" title="Sevkiyat değeri de minimis eşiğinin altında: vergi uygulanmadı">· de minimis altı</span>}
                    {r.edited && <span className="ml-1 text-[11px] font-normal text-accent" title="Bu ülkenin oranlarını Ayarlar'da düzenledin">· senin oranların</span>}
                  </td>
                  {r.landed ? (
                    <>
                      <td className="py-2 tnum">{money(r.landed.perUnit, r.p.currency)}</td>
                      <td className="py-2 tnum text-muted">{(() => { const v = convert(r.landed.perUnit, r.p.currency, disp); return v === null ? "—" : money(v, disp); })()}</td>
                      <td className="py-2">
                        <input
                          type="number"
                          value={sell[r.p.country] ?? ""}
                          placeholder={r.sellPrice ? r.sellPrice.toFixed(2) : "—"}
                          onChange={(e) => setSell((s) => ({ ...s, [r.p.country]: e.target.value }))}
                          aria-label={`${COUNTRY_NAMES_TR[r.p.country] ?? r.p.country} satış fiyatı`}
                          className="h-7 w-28 rounded border border-border bg-bg px-2 text-right tnum outline-none focus:border-accent"
                        />
                        <span className="ml-1 text-[11px] text-muted">{r.p.currency}</span>
                      </td>
                      <td className="py-2 text-[12px] text-muted">{r.source ?? "fiyat gir"}</td>
                      <td className={cn("py-2 pr-4 text-right tnum", r.margin ? (r.margin.netPerUnit > 0 ? "text-success" : "text-danger") : "text-muted")}>
                        {r.margin ? <span title={`KDV %${Math.round((r.p.salesVatRate ?? 0) * 100)} ve komisyon %${Math.round(r.margin.commissionRate * 100)} sonrası`}>{money(r.margin.netPerUnit, r.p.currency)} ({pct(r.margin.marginRate)})</span> : "—"}
                      </td>
                    </>
                  ) : (
                    <td colSpan={5} className="py-2 pr-4 text-[12px] text-muted">
                      {tiers.length ? COPY.noRate(`${currency} → ${r.p.currency}`) : "fiyat teklif üzerine; maliyet hesaplanamaz"}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="px-4 py-2 text-[11px] text-muted">Oranlar yaklaşık ve tarihli varsayımlardır; satır üzerinde bekleyince varsayımlar görünür. Satış fiyatı o ülkenin pazarlarında bulunan en ucuz benzerden gelir (komisyon o pazara göre), elle de girilebilir.</p>
    </Card>
  );
}
