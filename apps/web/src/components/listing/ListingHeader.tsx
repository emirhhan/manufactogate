import type { MarketAdapter, NormalizedBadge, RawListing, RawListingDetail } from "@manufactogate/core";
import { BADGE_LABELS_TR, CALIBRATION_STATUS } from "@manufactogate/adapters";
import { ListingActions } from "@/components/ListingActions";
import { Badge, cn } from "@/components/ui";
import { COPY } from "@/lib/copy";
import { money } from "@/lib/format";
import { getDisplayCurrency } from "@/lib/fx";
import { counterLines, priceText, ratingText, supplierSignals, titleLangNote, unitText } from "@/lib/listingFields";
import { marketTone, sellerDisplayName, storeUrl } from "@/lib/markets";

export interface ListingHeaderProps {
  listing: RawListing | RawListingDetail;
  adapter: MarketAdapter | undefined;
  isSource: boolean;
  countryName: string;
  /** Lowest price in the display currency (null: same currency or no rate). */
  approx: number | null;
  min: number | null;
  badges: NormalizedBadge[];
  gloss: string;
  category: string;
  /** Tier highlighted by the cost scenario, when any. */
  tierIndex: number | undefined;
}

/**
 * Title block of the listing page: market chip, role, title gloss, price (range / "Fiyat teklifle"),
 * pack and unit notes, sales and review counters from the real fields, rating, stock, origin, tier
 * ladder and the seller line with the card-level supplier signals (years, verified, business type).
 */
export function ListingHeader({ listing, adapter, isSource, countryName, approx, min, badges, gloss, category, tierIndex }: ListingHeaderProps) {
  const detail = listing as RawListingDetail;
  const disp = getDisplayCurrency();
  const market = listing.market;
  const sellerName = sellerDisplayName(listing);
  const sellerUrl = storeUrl(market, listing.supplierId);
  const counters = counterLines(listing);
  const rating = ratingText(listing);
  const unit = unitText(listing);
  const signals = supplierSignals(listing);
  const langNote = titleLangNote(listing, adapter?.meta.language);
  const onRequest = !!listing.priceOnRequest || !listing.price.tiers.length;
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className={cn("inline-block rounded px-1.5 py-0.5 text-[11px] font-medium text-white", marketTone(market))}>{adapter?.meta.name ?? market}</span>
          <Badge tone={isSource ? "accent" : "warning"}>{isSource ? "tedarik pazarı" : `hedef pazar · ${countryName}`}</Badge>
          {adapter && CALIBRATION_STATUS[adapter.id] && CALIBRATION_STATUS[adapter.id] !== "live" && <Badge title="Bu pazarın okuyucusu canlıda doğrulanmadı">beta okuma</Badge>}
        </div>
        <ListingActions listing={listing} />
      </div>
      <h1 className="mt-2 text-xl font-semibold leading-snug tracking-tight">{listing.title}</h1>
      {(gloss && gloss !== listing.title) || category || langNote ? (
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[12px] text-muted">
          {gloss && gloss !== listing.title && <span title="Başlığın Türkçe özeti (marka/model + kategori)">≈ {gloss}</span>}
          {category && <Badge>{category}</Badge>}
          {langNote && <span title="Pazar başlıkları tarayıcı diline göre gösterir; sorgu merdiveni pazar dilini kullanır">{langNote}</span>}
        </div>
      ) : null}
      <div className="mt-3 flex items-end gap-4">
        <div>
          <div className={cn("text-2xl font-semibold tnum", onRequest && "text-muted")}>{priceText(listing)}</div>
          {onRequest ? (
            <div className="text-[12px] text-muted">Liste fiyatı yok; tedarikçiden teklif iste (mesaj taslakları aşağıda).</div>
          ) : approx !== null ? (
            <div className="text-[12px] text-muted tnum">≈ {money(approx, disp)}{listing.priceMax !== undefined && min !== null && listing.priceMax > min ? " (en düşük)" : ""}</div>
          ) : min !== null && listing.price.currency !== disp ? (
            <div className="text-[12px] text-muted" title={COPY.noRate(listing.price.currency)}>≈ — <span className="text-[11px]">({COPY.noRate(listing.price.currency)})</span></div>
          ) : null}
          {unit && <div className="text-[11px] text-muted">{unit}</div>}
        </div>
        <div className="text-[12px] text-muted tnum">
          {listing.moq && listing.moq > 1 ? <div>MOQ {listing.moq}</div> : null}
          {counters.map((c) => (
            <div key={c.key}>{c.text}</div>
          ))}
          {rating ? <div>{rating}</div> : null}
          {detail.stock !== undefined ? <div>Stok {detail.stock.toLocaleString("tr-TR")}</div> : null}
          {(detail.shippingFrom ?? listing.shipFrom) ? <div>Gönderim {detail.shippingFrom ?? listing.shipFrom?.toUpperCase()}</div> : null}
        </div>
      </div>
      {listing.price.tiers.length > 1 && (
        <ul className="mt-3 flex flex-wrap gap-2 text-[12px]">
          {[...listing.price.tiers].sort((a, b) => a.minQty - b.minQty).map((t, i) => (
            <li key={t.minQty} className={cn("rounded border px-2 py-1 tnum", i === tierIndex ? "border-accent bg-accent/10 text-accent" : "border-border")}>
              {t.minQty}+ adet · {money(t.unitPrice, listing.price.currency)}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-4 text-[13px]">
        <div className="text-[11px] font-medium uppercase tracking-wide text-muted">Satıcı</div>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          {sellerName ? (
            sellerUrl ? (
              <a href={sellerUrl} target="_blank" rel="noreferrer noopener" className="font-medium text-accent hover:underline">{sellerName} ↗</a>
            ) : (
              <span className="font-medium">{sellerName}</span>
            )
          ) : (
            <span className="text-muted" title="Arama kartı satıcı adını taşımıyor; detay çekilince gelir">—</span>
          )}
          {listing.location && <span className="text-muted">· {listing.location}</span>}
          {signals.map((x) => (
            <Badge key={x.key} tone={x.tone === "success" ? "success" : x.tone === "warning" ? "warning" : "neutral"}>{x.label}</Badge>
          ))}
          {badges.map((b) => (
            <Badge key={b} tone={b === "verified-factory" ? "success" : "neutral"}>{BADGE_LABELS_TR[b]}</Badge>
          ))}
        </div>
      </div>
    </>
  );
}
