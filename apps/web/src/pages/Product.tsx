import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { BADGE_LABELS_TR, getProduct, listingFor } from "@manufactogate/adapters";
import { computeMargin, normalizeBadges, type MarketId, type RawListing } from "@manufactogate/core";
import { COUNTRY_NAMES_TR } from "@manufactogate/country-profiles";
import { PriceChain } from "@/components/PriceChain";
import { Badge, Button, Card, Empty } from "@/components/ui";
import { buildChain, hsSuggest, marketplaceFor, pickQty, scenario } from "@/lib/analysis";
import { groupOf, leafOf, placeholder, SOURCE_MARKETS, TARGET_MARKET } from "@/lib/catalog";
import { money, pct, soldText } from "@/lib/format";
import { maxOf, minOf } from "@/lib/fx";
import { imageToDataUrl } from "@/lib/images";
import { getMockRegistry as getRegistry } from "@/lib/registry";
import { useFxOverrides } from "@/lib/useFx";
import { useSearch } from "@/store/search";
import { useCostProfile, useSettings } from "@/store/settings";

/** Copy for listings without a price (B2B "fiyat teklifle" cards have `tiers: []`). */
export const PRICE_ON_REQUEST = "Fiyat teklifle";

/**
 * Price range text of a listing in its own currency: a single figure, "min – max", or
 * "Fiyat teklifle" when the listing has no tiers (never `Math.min()` → Infinity). Pure.
 */
export function priceRangeText(price: RawListing["price"]): string {
  const l = { price };
  const min = minOf(l);
  const max = maxOf(l);
  if (min === null || max === null) return PRICE_ON_REQUEST;
  return min === max ? money(min, price.currency) : `${money(min, price.currency)} – ${money(max, price.currency)}`;
}

/** Mock catalog product page: price chain across markets, 1688 ladder, landed cost and margin from Settings. */
export function Product() {
  const { id } = useParams();
  const nav = useNavigate();
  const start = useSearch((s) => s.start);
  const running = useSearch((s) => s.running);
  const enabled = useSettings((s) => s.enabledMarkets);
  const cost = useSettings((s) => s.cost);
  const profile = useCostProfile();
  useFxOverrides();
  const [preparing, setPreparing] = useState(false);
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
  // A source without tiers (price on request) cannot be costed: prefer 1688, then any priced source.
  const priced = rows.filter((r) => r.listing.price.tiers.length > 0);
  const source = priced.find((r) => r.market === "cn-1688")?.listing ?? priced.find((r) => r.market !== TARGET_MARKET)?.listing ?? rows.find((r) => r.market !== TARGET_MARKET)?.listing;
  const target = rows.find((r) => r.market === TARGET_MARKET)?.listing;
  const countryName = COUNTRY_NAMES_TR[profile.country] ?? profile.country.toUpperCase();
  const hs = hsSuggest(leaf?.group);
  const sc = source ? scenario(profile, source, { qty: pickQty(source.price.tiers, source.moq), shippingKey: cost.shippingKey, weightKg: product.weightKg || cost.defaultWeightKg, cnyTry: cost.fxCnyTry, ...(hs ? { hsCode: hs.hs } : {}) }) : null;
  const sellPrice = target ? minOf(target) : null; // null for price-on-request targets
  const marketplaceId = marketplaceFor(profile, target?.market);
  const margin = sc && sellPrice ? computeMargin(profile, sc.cost.perUnit, { sellPrice, marketplaceId, overheadRate: cost.overheadRate }) : null;
  const chain = sc && source ? buildChain({ sourceLabel: `${reg.get(source.market)?.meta.name ?? source.market} birim (${sc.qty} adet)`, sourceUnit: sc.cost.tierUsed.unitPrice, sourceCurrency: source.price.currency, landedPerUnit: sc.cost.perUnit, sell: sellPrice && target ? { label: `${reg.get(target.market)?.meta.name ?? target.market} satış`, price: sellPrice } : null, net: margin?.netPerUnit ?? null, currency: profile.currency, cnyTry: cost.fxCnyTry }) : [];

  const searchAll = async () => {
    setPreparing(true);
    try {
      const dataUrl = (await imageToDataUrl(product.image)) ?? product.image;
      const sid = await start({ kind: "image", image: { dataUrl, sourceUrl: product.image }, title: product.titles.tr }, enabled, dataUrl);
      nav(`/search/${sid}`);
    } finally {
      setPreparing(false);
    }
  };

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
          <Button variant="primary" className="mt-3 w-full justify-center" onClick={() => void searchAll()} disabled={preparing || running}>
            {preparing ? "Görsel hazırlanıyor…" : running ? "Başka bir arama sürüyor…" : "Bu ürünü tüm pazarlarda ara"}
          </Button>
        </div>

        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight">{product.titles.tr}</h1>
          <div className="mt-0.5 text-muted">{product.titles.zh}</div>
          <div className="mt-2 flex flex-wrap gap-1.5 text-[12px] text-muted">
            <span>Model {product.model}</span>
            <span>· {product.weightKg} kg</span>
            <span>· {leaf?.tr}</span>
            {hs && <span title={hs.label}>· GTİP {hs.hs}</span>}
          </div>

          {chain.length > 1 && (
            <Card className="mt-4 p-4">
              <div className="text-[11px] font-medium uppercase tracking-wide text-muted">Fiyat zinciri · {countryName}</div>
              <PriceChain steps={chain} className="mt-3" />
            </Card>
          )}

          <Card className="mt-4 overflow-hidden">
            <div className="border-b border-border px-4 py-2 text-[12px] font-medium uppercase tracking-wide text-muted">Pazar başına fiyat</div>
            <table className="w-full text-[13px]">
              <thead className="text-left text-[11px] uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-2 font-medium">Pazar</th>
                  <th className="py-2 font-medium">Birim fiyat</th>
                  <th className="py-2 font-medium">MOQ</th>
                  <th className="py-2 font-medium">Sayaç</th>
                  <th className="py-2 font-medium">Satıcı</th>
                  <th className="py-2 pr-4 text-right font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ market, listing }) => {
                  const a = reg.get(market);
                  const badges = a ? normalizeBadges(a, listing.badges) : [];
                  const noPrice = listing.price.tiers.length === 0;
                  return (
                    <tr key={market} className="border-t border-border">
                      <td className="px-4 py-2 font-medium">{a?.meta.name ?? market}</td>
                      <td className={noPrice ? "py-2 text-muted" : "py-2 tnum"}>{priceRangeText(listing.price)}</td>
                      <td className="py-2 tnum">{listing.moq}</td>
                      <td className="py-2 tnum">{soldText(listing)}</td>
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
                        <Link to={`/l/${market}/${listing.id}`} className="mr-2 text-accent hover:underline">İncele</Link>
                        <a href={listing.url} target="_blank" rel="noreferrer noopener" className="text-accent hover:underline">Aç ↗</a>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>

          {!source ? (
            <div className="mt-4"><Empty title="Tedarik ilanı yok" hint="Bu katalog ürünü için kaynak pazar ilanı bulunmuyor; maliyet hesaplanamaz." /></div>
          ) : (
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <Card className="p-4">
                <div className="text-[12px] font-medium uppercase tracking-wide text-muted">{reg.get(source.market)?.meta.name} fiyat merdiveni</div>
                {source.price.tiers.length === 0 && <p className="mt-2 text-[13px] text-muted">{PRICE_ON_REQUEST}: bu ilan fiyat merdiveni yayınlamıyor; teklif iste.</p>}
                <ul className="mt-2 space-y-1 text-[13px]">
                  {[...source.price.tiers].sort((a, b) => a.minQty - b.minQty).map((t, i) => (
                    <li key={t.minQty} className={`flex justify-between tnum ${sc && i === sc.tierIndex ? "text-accent" : ""}`}>
                      <span className="text-muted">{t.minQty}+ adet{sc && i === sc.tierIndex ? " · seçili" : ""}</span>
                      <span>{money(t.unitPrice, source.price.currency)}</span>
                    </li>
                  ))}
                </ul>
              </Card>
              <Card className="p-4">
                <div className="flex items-center justify-between">
                  <div className="text-[12px] font-medium uppercase tracking-wide text-muted">{countryName}'ye indirilmiş maliyet · {sc?.qty ?? "—"} adet · {sc?.shippingLabel ?? cost.shippingKey}</div>
                  <Link to="/settings" className="text-[11px] text-accent hover:underline">ayarla</Link>
                </div>
                {sc ? (
                  <ul className="mt-2 space-y-1 text-[13px]">
                    {sc.cost.lines.map((l) => (
                      <li key={l.key} className="flex justify-between tnum">
                        <span className="text-muted">{l.label}</span>
                        <span>{money(l.perUnit, sc.cost.currency)}</span>
                      </li>
                    ))}
                    <li className="flex justify-between border-t border-border pt-1 font-medium tnum">
                      <span>Birim maliyet</span>
                      <span>{money(sc.cost.perUnit, sc.cost.currency)}</span>
                    </li>
                    {margin && target && sellPrice && (
                      <li className="flex justify-between tnum">
                        <span className="text-muted">{reg.get(target.market)?.meta.name} {money(sellPrice, target.price.currency)} satışta net</span>
                        <span className={margin.netPerUnit > 0 ? "text-success" : "text-danger"}>
                          {money(margin.netPerUnit, profile.currency)} ({pct(margin.marginRate)})
                        </span>
                      </li>
                    )}
                  </ul>
                ) : (
                  <p className="mt-2 text-[12px] text-muted">{source.price.tiers.length === 0 ? `${PRICE_ON_REQUEST}: fiyat olmadan indirilmiş maliyet hesaplanamaz.` : `${source.price.currency} için kur yok.`}</p>
                )}
                <p className="mt-2 text-[11px] text-muted">Kur 1 {source.price.currency} = {sc ? sc.fx.toFixed(4) : "—"} {profile.currency} (Ayarlar); oranlar {profile.asOf} tarihli{profile.sources.includes("user") ? ", KDV/gümrük/komisyon senin düzenlediğin değerler" : ""}{hs ? `; gümrük GTİP ${hs.hs} (${hs.label})` : ""}. Ayarlar'dan kur, kargo, ağırlık ve ülke oranları değiştirilebilir.</p>
              </Card>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
