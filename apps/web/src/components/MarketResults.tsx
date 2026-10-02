import { useState } from "react";
import type { MarketId, RawListing } from "@manufactogate/core";
import { getRegistry } from "@/lib/registry";
import { placeholder } from "@/lib/catalog";
import { priceRange } from "@/lib/format";
import { Card, cn } from "./ui";

/**
 * Raw results per market, exactly as the market returned them. Always shown, so a search
 * never looks empty when markets did answer but no cross-market cluster could be proven.
 */
export function MarketResults({ listings }: { listings: Record<string, RawListing[]> }) {
  const reg = getRegistry();
  const markets = Object.entries(listings).filter(([, ls]) => ls.length > 0);
  const [active, setActive] = useState<string>(markets[0]?.[0] ?? "");
  if (markets.length === 0) return null;
  const current = listings[active] ?? markets[0]![1];
  return (
    <section>
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <h2 className="mr-2 text-[12px] font-medium uppercase tracking-wide text-muted">Pazar sonuçları</h2>
        {markets.map(([m, ls]) => (
          <button
            key={m}
            onClick={() => setActive(m)}
            className={cn("rounded-full border px-2.5 py-0.5 text-[12px]", (active || markets[0]![0]) === m ? "border-accent bg-accent/10 text-accent" : "border-border hover:bg-surface-2")}
          >
            {reg.get(m as MarketId)?.meta.name ?? m} <span className="tnum">({ls.length})</span>
          </button>
        ))}
      </div>
      <Card className="divide-y divide-border">
        {current.map((l) => (
          <div key={`${l.market}:${l.id}`} className="flex items-center gap-3 px-3 py-2 text-[13px]">
            <div className="h-12 w-12 shrink-0 overflow-hidden rounded border border-border bg-surface-2">
              <img
                src={l.images[0] ?? placeholder("")}
                alt=""
                className="h-full w-full object-cover"
                loading="lazy"
                referrerPolicy="no-referrer"
                onError={(e) => {
                  const el = e.currentTarget;
                  if (!el.dataset["fallback"]) {
                    el.dataset["fallback"] = "1";
                    el.src = placeholder("");
                  }
                }}
              />
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate" title={l.title}>
                {l.title}
              </div>
              <div className="truncate text-[12px] text-muted">
                {l.supplierName ?? "—"}
                {l.location ? ` · ${l.location}` : ""}
                {l.badges.length ? ` · ${l.badges.join(" · ")}` : ""}
              </div>
            </div>
            <div className="w-36 text-right tnum">{priceRange(l.price)}</div>
            <div className="w-20 text-right text-[12px] text-muted tnum">{l.moq && l.moq > 1 ? `MOQ ${l.moq}` : ""}</div>
            <div className="w-24 text-right text-[12px] text-muted tnum">{l.sold !== undefined ? `${l.sold.toLocaleString("tr-TR")} satış` : ""}</div>
            <a href={l.url} target="_blank" rel="noreferrer noopener" className="text-accent hover:underline">
              Aç ↗
            </a>
          </div>
        ))}
      </Card>
    </section>
  );
}
