import { Link } from "react-router-dom";
import { normalizeBadges } from "@manufactogate/core";
import { BADGE_LABELS_TR } from "@manufactogate/adapters";
import type { FeedItem } from "@/lib/catalog";
import { placeholder } from "@/lib/catalog";
import { money } from "@/lib/format";
import { getMockRegistry as getRegistry } from "@/lib/registry";
import { Badge } from "./ui";

export function ProductCard({ item }: { item: FeedItem }) {
  const { product, source, target, leaf } = item;
  const adapter = getRegistry().get("cn-1688");
  const badges = adapter ? normalizeBadges(adapter, source.badges) : [];
  const factory = badges.includes("verified-factory");
  return (
    <Link
      to={`/p/${product.id}`}
      className="group flex flex-col overflow-hidden rounded-lg border border-border bg-surface transition-shadow hover:shadow-md focus-visible:shadow-md"
    >
      <div className="relative aspect-square w-full overflow-hidden bg-surface-2">
        <img
          src={product.image}
          alt=""
          loading="lazy"
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          onError={(e) => {
            const el = e.currentTarget;
            if (!el.dataset["fallback"]) {
              el.dataset["fallback"] = "1";
              el.src = placeholder(leaf?.tr ?? product.templateKey);
            }
          }}
        />
        {factory && (
          <span className="absolute left-2 top-2 rounded bg-success px-1.5 py-0.5 text-[11px] font-medium text-white">Kaynak fabrika</span>
        )}
        {item.priceRatio !== null && item.priceRatio >= 3 && (
          <span className="absolute right-2 top-2 rounded bg-surface/95 px-1.5 py-0.5 text-[11px] font-medium text-accent tnum">×{item.priceRatio.toFixed(1)} marj</span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-3">
        <div className="text-[11px] text-muted">{leaf?.tr ?? product.category}</div>
        <div className="line-clamp-2 min-h-[2.6em] text-[13px] font-medium leading-snug" title={product.titles.tr}>
          {product.titles.tr}
        </div>
        <div className="mt-auto flex items-end justify-between gap-2">
          <div>
            <div className="text-[11px] text-muted">1688 · MOQ {source.moq}</div>
            <div className="text-[15px] font-semibold tnum">{money(item.sourceMinCny, "CNY")}</div>
          </div>
          {target && (
            <div className="text-right">
              <div className="text-[11px] text-muted">Trendyol</div>
              <div className="text-[13px] text-muted tnum">{money(target.price.tiers[0]!.unitPrice, "TRY")}</div>
            </div>
          )}
        </div>
        <div className="flex items-center justify-between text-[11px] text-muted">
          <span className="tnum">{item.sold.toLocaleString("tr-TR")} satış</span>
          <div className="flex gap-1">
            {badges
              .filter((b) => b !== "verified-factory")
              .slice(0, 1)
              .map((b) => (
                <Badge key={b}>{BADGE_LABELS_TR[b]}</Badge>
              ))}
          </div>
        </div>
      </div>
    </Link>
  );
}
