import { normalizeBadges, type RawListing } from "@manufactogate/core";
import { BADGE_LABELS_TR } from "@manufactogate/adapters";
import { placeholder } from "@/lib/catalog";
import { money } from "@/lib/format";
import { toTry } from "@/lib/fx";
import { getRegistry } from "@/lib/registry";
import { Badge, cn } from "./ui";

const MARKET_TONE: Record<string, string> = {
  "cn-1688": "bg-orange-600",
  "cn-taobao": "bg-amber-500",
  "cn-pinduoduo": "bg-red-600",
  "tr-trendyol": "bg-orange-500",
};

export function ResultCard({ listing, confidence }: { listing: RawListing; confidence?: number | undefined }) {
  const reg = getRegistry();
  const adapter = reg.get(listing.market);
  const badges = adapter ? normalizeBadges(adapter, listing.badges) : [];
  const min = Math.min(...listing.price.tiers.map((t) => t.unitPrice));
  const tryPrice = listing.price.currency === "TRY" ? null : toTry(min, listing.price.currency);
  return (
    <a
      href={listing.url}
      target="_blank"
      rel="noreferrer noopener"
      className="group flex flex-col overflow-hidden rounded-lg border border-border bg-surface transition-shadow hover:shadow-md"
    >
      <div className="relative aspect-square w-full overflow-hidden bg-surface-2">
        <img
          src={listing.images[0] ?? placeholder("")}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          onError={(e) => {
            const el = e.currentTarget;
            if (!el.dataset["fallback"]) {
              el.dataset["fallback"] = "1";
              el.src = placeholder(adapter?.meta.name ?? "");
            }
          }}
        />
        <span className={cn("absolute left-2 top-2 rounded px-1.5 py-0.5 text-[11px] font-medium text-white", MARKET_TONE[listing.market] ?? "bg-accent")}>
          {adapter?.meta.name ?? listing.market}
        </span>
        {badges.includes("verified-factory") && (
          <span className="absolute right-2 top-2 rounded bg-success px-1.5 py-0.5 text-[11px] font-medium text-white">Kaynak fabrika</span>
        )}
        {confidence !== undefined && (
          <span className="absolute bottom-2 right-2 rounded bg-surface/95 px-1.5 py-0.5 text-[11px] font-medium text-accent tnum">%{Math.round(confidence * 100)} eşleşme</span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-3">
        <div className="line-clamp-2 min-h-[2.6em] text-[13px] font-medium leading-snug" title={listing.title}>
          {listing.title}
        </div>
        <div className="mt-auto flex items-end justify-between gap-2">
          <div>
            <div className="text-[15px] font-semibold tnum">{money(min, listing.price.currency)}</div>
            {tryPrice !== null && <div className="text-[11px] text-muted tnum">≈ {money(tryPrice, "TRY")}</div>}
          </div>
          <div className="text-right text-[11px] text-muted tnum">
            {listing.moq && listing.moq > 1 ? <div>MOQ {listing.moq}</div> : null}
            {listing.sold !== undefined ? <div>{listing.sold.toLocaleString("tr-TR")} satış</div> : null}
          </div>
        </div>
        {(listing.supplierName || badges.length > 0) && (
          <div className="flex items-center justify-between gap-2 text-[11px] text-muted">
            <span className="truncate">{listing.supplierName ?? ""}</span>
            {badges.filter((b) => b !== "verified-factory").slice(0, 1).map((b) => (
              <Badge key={b}>{BADGE_LABELS_TR[b]}</Badge>
            ))}
          </div>
        )}
      </div>
    </a>
  );
}
