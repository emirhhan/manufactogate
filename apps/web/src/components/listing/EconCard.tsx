import { Link } from "react-router-dom";
import type { CountryProfile } from "@manufactogate/core";
import { PriceChain } from "@/components/PriceChain";
import { Card, cn } from "@/components/ui";
import { money, pct } from "@/lib/format";
import type { Economics } from "@/lib/listingEconomics";

/** "Fiyat zinciri" card: source → landed → sell → net with the VAT/commission note, or the opportunity placeholder. */
export function EconCard({ econ, isSource, comparing, profile, countryName, marketName }: { econ: Economics | null; isSource: boolean; comparing: boolean; profile: CountryProfile; countryName: string; marketName: (m: string) => string | undefined }) {
  const cur = profile.currency;
  if (econ && econ.chain.length > 1) {
    return (
      <Card className="mt-5 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-[11px] font-medium uppercase tracking-wide text-muted">
            Fiyat zinciri · {countryName} · {econ.qty} adet
            {profile.sources.includes("user") && <span className="ml-2 normal-case tracking-normal text-accent" title="KDV, gümrük veya komisyon oranlarını Ayarlar'da düzenledin">senin oranların</span>}
          </div>
          <Link to="/settings" className="text-[11px] text-accent hover:underline">ayarlar</Link>
        </div>
        <PriceChain steps={econ.chain} className="mt-3" />
        <div className="mt-3 text-[12px] text-muted">
          {isSource ? (
            econ.sellFrom ? (
              <>
                Satış fiyatı: <Link to={`/l/${econ.sellFrom.market}/${econ.sellFrom.id}`} className="text-accent hover:underline">{marketName(econ.sellFrom.market)} en ucuz yakın eşleşme</Link> ({money(econ.sell ?? 0, cur)}), komisyon {econ.marketplaceId || "—"}.
              </>
            ) : comparing ? (
              "Hedef pazarda yakın bir eşleşme bulununca satış fiyatı ve marj gelir."
            ) : (
              "Marj için “Diğer pazarlarda bul ve karşılaştır” ile hedef pazardaki fiyatı bul."
            )
          ) : (
            <>
              Kaynak: <Link to={`/l/${econ.sourceListing.market}/${econ.sourceListing.id}`} className="text-accent hover:underline">{marketName(econ.sourceListing.market)} en ucuz yakın eşleşme</Link> · bu ilanın fiyatından satışta, komisyon {econ.marketplaceId}.
            </>
          )}
          {econ.margin && (
            <span className={cn("ml-2 font-medium", econ.margin.netPerUnit > 0 ? "text-success" : "text-danger")} title={`KDV %${Math.round((profile.salesVatRate ?? 0) * 100)} ve komisyon %${Math.round(econ.margin.commissionRate * 100)} sonrası; ithalat KDV'si indirilebilir sayıldı`}>
              net {money(econ.margin.netPerUnit, cur)} ({pct(econ.margin.marginRate)})
            </span>
          )}
        </div>
      </Card>
    );
  }
  if (!isSource && !econ) {
    return (
      <Card className="mt-5 p-4 text-[12px] text-muted">
        <div className="text-[11px] font-medium uppercase tracking-wide text-muted">Fırsat kartı</div>
        <p className="mt-1">{comparing ? "Tedarik pazarlarında yakın bir eşleşme bulununca indirilmiş maliyet ve bu fiyattan net marj burada görünür." : "“Diğer pazarlarda bul ve karşılaştır” tedarik kaynağını bulur; indirilmiş maliyet ve bu ilanın fiyatından marj burada görünür."}</p>
      </Card>
    );
  }
  return null;
}
