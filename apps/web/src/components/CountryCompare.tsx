import { useMemo, useState } from "react";
import { computeLandedCost, computeMargin, type PriceTier, type RawListing } from "@manufactogate/core";
import { COUNTRY_NAMES_TR, COUNTRY_PROFILES } from "@manufactogate/country-profiles";
import { money, pct } from "@/lib/format";
import { convert, getDisplayCurrency } from "@/lib/fx";
import { getRegistry } from "@/lib/registry";
import { useSettings } from "@/store/settings";
import { Card, cn } from "./ui";

/**
 * "Which country is this worth selling in?" Landed cost per target country from the source
 * price ladder, and net margin against the cheapest comparable found on that country's
 * markets (or a sell price the user types).
 */
export function CountryCompare({ tiers, currency, weightKg, found }: { tiers: PriceTier[]; currency: string; weightKg: number; found: Record<string, RawListing | undefined> }) {
  const cost = useSettings((s) => s.cost);
  const [sell, setSell] = useState<Record<string, string>>({});
  const reg = getRegistry();
  const disp = getDisplayCurrency();

  const rows = useMemo(() => {
    return Object.values(COUNTRY_PROFILES).map((p) => {
      const fx = convert(1, currency, p.currency) ?? 1;
      const qty = tiers[1]?.minQty ?? 100;
      const shippingKey = p.shipping.some((s) => s.key === cost.shippingKey) ? cost.shippingKey : p.shipping[0]!.key;
      const landed = computeLandedCost(p, { quantity: qty, tiers, fxRate: fx, unitWeightKg: weightKg, shippingKey });
      // Best sell price: user input, else the cheapest listing found on a market of this country.
      const marketIds = Object.keys(p.commissions);
      const candidates = marketIds.map((m) => found[m]).filter((l): l is RawListing => !!l);
      const foundBest = candidates.length
        ? Math.min(...candidates.map((l) => convert(Math.min(...l.price.tiers.map((t) => t.unitPrice)), l.price.currency, p.currency) ?? Infinity))
        : null;
      const typed = Number(sell[p.country]);
      const sellPrice = typed > 0 ? typed : foundBest && Number.isFinite(foundBest) ? foundBest : null;
      const marketplaceId = marketIds[0] ?? "";
      const margin = sellPrice ? computeMargin(p, landed.perUnit, { sellPrice, marketplaceId, overheadRate: cost.overheadRate }) : null;
      return { p, qty, landed, sellPrice, margin, source: typed > 0 ? "girilen" : foundBest ? (reg.get(marketIds.find((m) => found[m]) as never)?.meta.name ?? "bulunan") : null, shippingKey };
    });
  }, [tiers, currency, weightKg, found, cost, sell, reg]);

  const best = rows.filter((r) => r.margin).sort((a, b) => (b.margin?.marginRate ?? -1) - (a.margin?.marginRate ?? -1))[0];

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2">
        <div className="text-[11px] font-medium uppercase tracking-wide text-muted">Hangi ülkeye satmak kârlı · ülke başına indirilmiş maliyet</div>
        {best?.margin && <div className="text-[12px]">En kârlı: <span className="font-medium text-success">{COUNTRY_NAMES_TR[best.p.country]} {pct(best.margin.marginRate)}</span></div>}
      </div>
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
          {rows.map((r) => (
            <tr key={r.p.country} className={cn("border-t border-border", best?.p.country === r.p.country && r.margin ? "bg-success/5" : "")}>
              <td className="px-4 py-2 font-medium">
                {COUNTRY_NAMES_TR[r.p.country] ?? r.p.country.toUpperCase()}
                <span className="ml-1 text-[11px] text-muted">{r.qty} adet · {r.p.shipping.find((s) => s.key === r.shippingKey)?.label}</span>
              </td>
              <td className="py-2 tnum">{money(r.landed.perUnit, r.p.currency)}</td>
              <td className="py-2 tnum text-muted">{money(convert(r.landed.perUnit, r.p.currency, disp) ?? 0, disp)}</td>
              <td className="py-2">
                <input
                  type="number"
                  value={sell[r.p.country] ?? ""}
                  placeholder={r.sellPrice ? r.sellPrice.toFixed(2) : "—"}
                  onChange={(e) => setSell((s) => ({ ...s, [r.p.country]: e.target.value }))}
                  className="h-7 w-28 rounded border border-border bg-bg px-2 text-right tnum outline-none focus:border-accent"
                />
                <span className="ml-1 text-[11px] text-muted">{r.p.currency}</span>
              </td>
              <td className="py-2 text-[12px] text-muted">{r.source ?? "fiyat gir"}</td>
              <td className={cn("py-2 pr-4 text-right tnum", r.margin ? (r.margin.netPerUnit > 0 ? "text-success" : "text-danger") : "text-muted")}>
                {r.margin ? `${money(r.margin.netPerUnit, r.p.currency)} (${pct(r.margin.marginRate)})` : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="px-4 py-2 text-[11px] text-muted">Oranlar yaklaşık ve tarihli varsayımlardır; GTİP bazlı kesin vergi için ülke profilini düzenle. Satış fiyatı o ülkenin pazarlarında bulunan en ucuz benzerden gelir, elle de girilebilir.</p>
    </Card>
  );
}
