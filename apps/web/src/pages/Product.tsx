import { useMemo } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { BADGE_LABELS_TR, getProduct, listingFor } from "@manufactogate/adapters";
import { computeLandedCost, computeMargin, normalizeBadges, type MarketId } from "@manufactogate/core";
import { getCountryProfile } from "@manufactogate/country-profiles";
import { Badge, Button, Card, Empty } from "@/components/ui";
import { groupOf, leafOf, placeholder, SOURCE_MARKETS, TARGET_MARKET } from "@/lib/catalog";
import { money, pct } from "@/lib/format";
import { getMockRegistry as getRegistry } from "@/lib/registry";
import { useSearch } from "@/store/search";
import { useSettings } from "@/store/settings";

const FX_CNY_TRY = 4.7;

export function Product() {
  const { id } = useParams();
  const nav = useNavigate();
  const start = useSearch((s) => s.start);
  const enabled = useSettings((s) => s.enabledMarkets);
  const product = id ? getProduct(id) : undefined;
  const reg = getRegistry();

  const rows = useMemo(() => {
    if (!product) return [];
    return [...SOURCE_MARKETS, TARGET_MARKET]
      .map((m) => ({ market: m as MarketId, listing: listingFor(product, m as MarketId) }))
      .filter((r): r is { market: MarketId; listing: NonNullable<typeof r.listing> } => !!r.listing);
  }, [product]);

  if (!product) {
    return (
      <div className="mx-auto max-w-[960px] px-4 py-10">
        <Empty title="Ürün bulunamadı" action={<Link to="/" className="text-accent hover:underline">Feed'e dön</Link>} />
      </div>
    );
  }
  const leaf = leafOf(product.category);
  const source = rows.find((r) => r.market === "cn-1688")!.listing;
  const target = rows.find((r) => r.market === TARGET_MARKET)?.listing;
  const profile = getCountryProfile("tr")!;
  const qty = source.price.tiers[1]?.minQty ?? source.moq ?? 100;
  const cost = computeLandedCost(profile, {
    quantity: qty,
    tiers: source.price.tiers,
    fxRate: FX_CNY_TRY,
    unitWeightKg: product.weightKg,
    shippingKey: "air",
  });
  const margin = target ? computeMargin(profile, cost.perUnit, { sellPrice: target.price.tiers[0]!.unitPrice, marketplaceId: "tr-trendyol", overheadRate: 0.08 }) : null;

  return (
    <div className="mx-auto max-w-[1440px] px-4 py-6">
      <nav className="text-[12px] text-muted">
        <Link to="/" className="hover:underline">Ürünler</Link>
        {leaf && (
          <>
            {" / "}
            <Link to={`/c/${leaf.group}`} className="hover:underline">{groupOf(leaf.group)?.tr ?? leaf.group}</Link>
            {" / "}
            <Link to={`/c/${leaf.group}/${leaf.key}`} className="hover:underline">{leaf.tr}</Link>
          </>
        )}
      </nav>

      <div className="mt-3 grid gap-6 lg:grid-cols-[420px_1fr]">
        <div>
          <div className="aspect-square overflow-hidden rounded-lg border border-border bg-surface-2">
            <img
              src={product.image}
              alt=""
              className="h-full w-full object-cover"
              onError={(e) => {
                const el = e.currentTarget;
                if (!el.dataset["fallback"]) {
                  el.dataset["fallback"] = "1";
                  el.src = placeholder(leaf?.tr ?? product.category);
                }
              }}
            />
          </div>
          <Button
            variant="primary"
            className="mt-3 w-full justify-center"
            onClick={async () => {
              const sid = await start({ kind: "image", image: { dataUrl: product.image }, title: product.titles.tr }, enabled, product.image);
              nav(`/search/${sid}`);
            }}
          >
            Bu ürünü tüm pazarlarda ara
          </Button>
        </div>

        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight">{product.titles.tr}</h1>
          <div className="mt-0.5 text-muted">{product.titles.zh}</div>
          <div className="mt-2 flex flex-wrap gap-1.5 text-[12px] text-muted">
            <span>Model {product.model}</span>
            <span>· {product.weightKg} kg</span>
            <span>· {leaf?.tr}</span>
          </div>

          <Card className="mt-5 overflow-hidden">
            <div className="border-b border-border px-4 py-2 text-[12px] font-medium uppercase tracking-wide text-muted">Fiyat zinciri</div>
            <table className="w-full text-[13px]">
              <thead className="text-left text-[11px] uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-2 font-medium">Pazar</th>
                  <th className="py-2 font-medium">Birim fiyat</th>
                  <th className="py-2 font-medium">MOQ</th>
                  <th className="py-2 font-medium">Satış</th>
                  <th className="py-2 font-medium">Satıcı</th>
                  <th className="py-2 pr-4 text-right font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ market, listing }) => {
                  const a = reg.get(market);
                  const badges = a ? normalizeBadges(a, listing.badges) : [];
                  const min = Math.min(...listing.price.tiers.map((t) => t.unitPrice));
                  const max = Math.max(...listing.price.tiers.map((t) => t.unitPrice));
                  return (
                    <tr key={market} className="border-t border-border">
                      <td className="px-4 py-2 font-medium">{a?.meta.name ?? market}</td>
                      <td className="py-2 tnum">{min === max ? money(min, listing.price.currency) : `${money(min, listing.price.currency)} – ${money(max, listing.price.currency)}`}</td>
                      <td className="py-2 tnum">{listing.moq}</td>
                      <td className="py-2 tnum">{listing.sold?.toLocaleString("tr-TR")}</td>
                      <td className="py-2">
                        <div>{listing.supplierName}</div>
                        <div className="flex flex-wrap gap-1">
                          {badges.map((b) => (
                            <Badge key={b} tone={b === "verified-factory" ? "success" : "neutral"}>
                              {BADGE_LABELS_TR[b]}
                            </Badge>
                          ))}
                        </div>
                      </td>
                      <td className="py-2 pr-4 text-right">
                        <a href={listing.url} target="_blank" rel="noreferrer noopener" className="text-accent hover:underline">Aç ↗</a>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <Card className="p-4">
              <div className="text-[12px] font-medium uppercase tracking-wide text-muted">1688 fiyat merdiveni</div>
              <ul className="mt-2 space-y-1 text-[13px]">
                {source.price.tiers.map((t) => (
                  <li key={t.minQty} className="flex justify-between tnum">
                    <span className="text-muted">{t.minQty}+ adet</span>
                    <span>{money(t.unitPrice, "CNY")}</span>
                  </li>
                ))}
              </ul>
            </Card>
            <Card className="p-4">
              <div className="text-[12px] font-medium uppercase tracking-wide text-muted">Türkiye'ye indirilmiş maliyet · {qty} adet · hava kargo</div>
              <ul className="mt-2 space-y-1 text-[13px]">
                {cost.lines.map((l) => (
                  <li key={l.key} className="flex justify-between tnum">
                    <span className="text-muted">{l.label}</span>
                    <span>{money(l.perUnit, "TRY")}</span>
                  </li>
                ))}
                <li className="flex justify-between border-t border-border pt-1 font-medium tnum">
                  <span>Birim maliyet</span>
                  <span>{money(cost.perUnit, "TRY")}</span>
                </li>
                {margin && target && (
                  <li className="flex justify-between tnum">
                    <span className="text-muted">Trendyol {money(target.price.tiers[0]!.unitPrice, "TRY")} satışta net</span>
                    <span className={margin.netPerUnit > 0 ? "text-success" : "text-danger"}>
                      {money(margin.netPerUnit, "TRY")} ({pct(margin.marginRate)})
                    </span>
                  </li>
                )}
              </ul>
              <p className="mt-2 text-[11px] text-muted">Kur 1 CNY = {FX_CNY_TRY} TRY varsayımı; oranlar {profile.asOf} tarihli. Sprint 4'te düzenlenebilir.</p>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
