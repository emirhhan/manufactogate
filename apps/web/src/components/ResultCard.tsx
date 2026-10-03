import { memo } from "react";
import { normalizeBadges, type RawListing } from "@manufactogate/core";
import { BADGE_LABELS_TR } from "@manufactogate/adapters";
import { Link } from "react-router-dom";
import { MarketImage } from "./MarketImage";
import { COPY } from "@/lib/copy";
import { compareStore, useCompareItems } from "@/lib/compareStore";
import { money, priceRange, soldText } from "@/lib/format";
import { getDisplayCurrency, minDisplay, minOf } from "@/lib/fx";
import { marketTone } from "@/lib/markets";
import { getRegistry } from "@/lib/registry";
import { Badge, cn } from "./ui";

/**
 * Result card. The whole card is one link (stretched-link pattern), secondary controls sit above it,
 * so there are no nested interactive elements and keyboard users get one tab stop per card.
 *
 * `confidence` is the cross-market cluster confidence (image + title + model number);
 * `relevance` is title-only similarity to the query. They are labelled differently on purpose.
 */
function ResultCardInner({
  listing,
  confidence,
  relevance,
  highlight = false,
  reason,
}: {
  listing: RawListing;
  confidence?: number | undefined;
  relevance?: number | undefined;
  highlight?: boolean;
  /** Short explanation shown as tooltip on the score badge. */
  reason?: string | undefined;
}) {
  const reg = getRegistry();
  const adapter = reg.get(listing.market);
  const badges = adapter ? normalizeBadges(adapter, listing.badges) : [];
  const min = minOf(listing);
  const disp = getDisplayCurrency();
  const approx = listing.price.currency === disp ? null : minDisplay(listing);
  const items = useCompareItems();
  const selected = items.some((x) => x.market === listing.market && x.id === listing.id);
  const sold = soldText(listing);
  const score = confidence !== undefined ? { v: confidence, label: COPY.match, tone: "text-accent" } : relevance !== undefined ? { v: relevance, label: COPY.relevance, tone: "text-muted" } : null;
  return (
    <div data-card className={cn("card-lift group relative flex flex-col overflow-hidden rounded-xl border bg-surface", highlight ? "border-accent ring-2 ring-accent/40" : selected ? "border-accent/60" : "border-border")}>
      <div className="relative aspect-square w-full overflow-hidden bg-surface-2">
        <MarketImage src={listing.images[0]} label={adapter?.meta.name ?? ""} loading="lazy" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
        <span className={cn("absolute left-2 top-2 rounded px-1.5 py-0.5 text-[11px] font-medium text-white", marketTone(listing.market))}>{adapter?.meta.name ?? listing.market}</span>
        {badges.includes("verified-factory") && <span className="absolute right-2 top-2 rounded bg-success px-1.5 py-0.5 text-[11px] font-medium text-white">Kaynak fabrika</span>}
        {score && (
          <span className={cn("absolute bottom-2 right-2 rounded bg-surface/95 px-1.5 py-0.5 text-[11px] font-medium tnum", score.tone)} title={reason ?? (confidence !== undefined ? "Görsel + başlık + model numarası eşleşmesi" : "Başlık benzerliği")}>
            %{Math.round(score.v * 100)} {score.label}
          </span>
        )}
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (!compareStore.toggle(listing)) compareStore.setOpen(true);
          }}
          aria-pressed={selected}
          title={selected ? "Karşılaştırmadan çıkar" : "Yan yana karşılaştır"}
          className={cn(
            "absolute bottom-2 left-2 z-10 h-7 rounded-md border px-2 text-[11px] font-medium transition-opacity",
            selected ? "border-accent bg-accent text-accent-fg opacity-100" : "border-border bg-surface/95 text-text opacity-0 group-hover:opacity-100 focus-visible:opacity-100",
          )}
        >
          {selected ? "✓ Karşılaştır" : "+ Karşılaştır"}
        </button>
      </div>
      <div className="flex flex-1 flex-col gap-1 p-3">
        <Link to={`/l/${listing.market}/${listing.id}`} className="line-clamp-2 min-h-[2.6em] text-[13px] font-medium leading-snug after:absolute after:inset-0 after:content-['']" title={listing.title}>
          {listing.title}
        </Link>
        <div className="mt-auto flex items-end justify-between gap-2">
          <div>
            <div className="text-[15px] font-semibold tnum">{min === null ? "Teklif iste" : money(min, listing.price.currency)}</div>
            {approx !== null ? (
              <div className="text-[11px] text-muted tnum">≈ {money(approx, disp)}</div>
            ) : min !== null && listing.price.currency !== disp ? (
              <div className="text-[11px] text-muted" title={COPY.noRate(listing.price.currency)}>≈ —</div>
            ) : null}
            {listing.price.tiers.length > 1 && <div className="text-[10px] text-muted tnum" title={priceRange(listing.price)}>{listing.price.tiers.length} kademe</div>}
          </div>
          <div className="text-right text-[11px] text-muted tnum">
            {listing.moq && listing.moq > 1 ? <div>MOQ {listing.moq}</div> : null}
            {sold ? <div>{sold}</div> : null}
            {listing.rating ? <div>★ {listing.rating.toFixed(1)}</div> : null}
          </div>
        </div>
        <div className="flex items-center justify-between gap-2 text-[11px] text-muted">
          <span className="truncate">{listing.supplierName ?? (listing.supplierId ? `Mağaza #${listing.supplierId}` : "")}</span>
          <span className="relative z-10 flex shrink-0 items-center gap-1.5">
            {badges.filter((b) => b !== "verified-factory").slice(0, 1).map((b) => (
              <Badge key={b}>{BADGE_LABELS_TR[b]}</Badge>
            ))}
            <a href={listing.url} target="_blank" rel="noreferrer noopener" className="text-accent hover:underline" title="Pazarda aç">
              ↗
            </a>
          </span>
        </div>
      </div>
    </div>
  );
}

/** Memoised: a results grid of hundreds of cards must not re-render every card when one market streams in. */
export const ResultCard = memo(ResultCardInner);
