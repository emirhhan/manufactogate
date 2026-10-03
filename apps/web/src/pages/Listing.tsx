import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { computeLandedCost, computeMargin, normalizeBadges, type MarketId, type RawListing, type RawListingDetail } from "@manufactogate/core";
import { BADGE_LABELS_TR } from "@manufactogate/adapters";
import { getCountryProfile } from "@manufactogate/country-profiles";
import { ListingActions } from "@/components/ListingActions";
import { MarketStrip } from "@/components/MarketStrip";
import { ResultCard } from "@/components/ResultCard";
import { Badge, Button, Card, cn } from "@/components/ui";
import { MarketImage } from "@/components/MarketImage";
import { relevance } from "@/lib/relevance";
import { db } from "@/lib/db";
import { money, pct } from "@/lib/format";
import { toTry } from "@/lib/fx";
import { imageToDataUrl } from "@/lib/images";
import { getRegistry } from "@/lib/registry";
import { useSearch } from "@/store/search";
import { useSettings } from "@/store/settings";

const MARKET_TONE: Record<string, string> = { "cn-1688": "bg-orange-600", "cn-taobao": "bg-amber-500", "cn-pinduoduo": "bg-red-600", "tr-trendyol": "bg-orange-500" };

/** Product page for a real market listing: details, landed cost and "same product on other markets". */
export function Listing() {
  const { market, id } = useParams<{ market: MarketId; id: string }>();
  const key = `${market}:${id}`;
  const reg = getRegistry();
  const adapter = market ? reg.get(market) : undefined;
  const [listing, setListing] = useState<RawListing | RawListingDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailState, setDetailState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [detailError, setDetailError] = useState("");
  const [img, setImg] = useState(0);
  const [compareId, setCompareId] = useState<string | null>(null);
  const s = useSearch();
  const enabled = useSettings((x) => x.enabledMarkets);
  const costSettings = useSettings((x) => x.cost);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    void db.listings.get(key).then((rec) => {
      if (!alive) return;
      setListing(rec ?? null);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [key]);

  const loadDetail = async () => {
    if (!adapter || !id) return;
    setDetailState("loading");
    try {
      const d = await adapter.fetchListing(id);
      const merged: RawListingDetail = { ...(listing ?? {}), ...d, images: d.images.length ? d.images : (listing?.images ?? []) };
      setListing(merged);
      await db.listings.put({ ...merged, key, searchId: (await db.listings.get(key))?.searchId ?? "detail" });
      setDetailState("done");
    } catch (e) {
      setDetailError(e instanceof Error ? e.message : String(e));
      setDetailState("error");
    }
  };

  const compare = async () => {
    if (!listing || !market) return;
    const markets = enabled.includes(market) ? enabled : [...enabled, market];
    const first = listing.images[0];
    const dataUrl = first ? await imageToDataUrl(first) : null;
    const input = dataUrl
      ? ({ kind: "image", image: { dataUrl, ...(first ? { sourceUrl: first } : {}) }, title: listing.title } as const)
      : ({ kind: "text", query: listing.title } as const);
    const sid = await s.start(input, markets, dataUrl ?? undefined, key);
    setCompareId(sid);
  };

  const comparing = compareId !== null && s.current?.id === compareId;
  const [showFiltered, setShowFiltered] = useState<Record<string, boolean>>({});
  const others = useMemo(() => {
    if (!comparing || !listing) return [];
    return Object.entries(s.listings).map(([m, ls]) => {
      const list = ls.filter((l) => !(l.market === market && l.id === id));
      const scored = list.map((l) => ({ l, r: relevance(listing.title, l) })).sort((a, b) => b.r - a.r || minTry(a.l) - minTry(b.l));
      const strong = scored.filter((x) => x.r >= 0.5);
      const weak = scored.filter((x) => x.r < 0.5);
      const pool = strong.length ? strong : scored.slice(0, 5);
      const best = [...pool].sort((a, b) => minTry(a.l) - minTry(b.l))[0]?.l;
      return { market: m as MarketId, count: list.length, best, top: pool.slice(0, 8).map((x) => x.l), weak: weak.map((x) => x.l), strongCount: strong.length };
    });
  }, [comparing, s.listings, market, id, listing]);
  const confidence = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of s.clusters) for (const m of c.members) map.set(`${m.listing.market}:${m.listing.id}`, m.match.score);
    return map;
  }, [s.clusters]);

  if (loading) return <div className="mx-auto max-w-[1440px] px-4 py-10 text-muted">Ürün yükleniyor…</div>;
  if (!listing) {
    return (
      <div className="mx-auto max-w-[960px] px-4 py-10">
        <Card className="p-6">
          <div className="font-medium">Bu ilan yerel kayıtlarda yok</div>
          <p className="mt-1 text-muted">İlanlar arama sonuçlarından açıldığında burada görünür. {adapter ? "Pazardan doğrudan çekmeyi deneyebilirsin." : ""}</p>
          {adapter && (
            <Button className="mt-3" variant="primary" onClick={() => void loadDetail()} disabled={detailState === "loading"}>
              {detailState === "loading" ? "Çekiliyor…" : "Pazardan çek"}
            </Button>
          )}
          {detailState === "error" && <div className="mt-2 text-[12px] text-danger">{detailError}</div>}
        </Card>
      </div>
    );
  }

  const badges = adapter ? normalizeBadges(adapter, listing.badges) : [];
  const min = Math.min(...listing.price.tiers.map((t) => t.unitPrice));
  const tryPrice = listing.price.currency === "TRY" ? null : toTry(min, listing.price.currency);
  const detail = listing as RawListingDetail;
  const isSource = adapter?.meta.role !== "target";
  const profile = getCountryProfile("tr")!;
  const qty = listing.price.tiers[1]?.minQty ?? Math.max(listing.moq ?? 1, 100);
  const cost =
    isSource && listing.price.currency === "CNY"
      ? computeLandedCost(profile, { quantity: qty, tiers: listing.price.tiers, fxRate: costSettings.fxCnyTry, unitWeightKg: costSettings.defaultWeightKg, shippingKey: costSettings.shippingKey })
      : null;
  const shippingLabel = profile.shipping.find((o) => o.key === costSettings.shippingKey)?.label ?? costSettings.shippingKey;
  const trendyolBest = others.find((o) => o.market === "tr-trendyol")?.best;
  const margin = cost && trendyolBest ? computeMargin(profile, cost.perUnit, { sellPrice: minTry(trendyolBest), marketplaceId: "tr-trendyol", overheadRate: costSettings.overheadRate }) : null;

  return (
    <div className="mx-auto max-w-[1440px] px-4 py-6">
      <nav className="text-[12px] text-muted">
        <Link to="/" className="hover:underline">Ürünler</Link> / <span>{adapter?.meta.name ?? market}</span> / <span className="text-text">{listing.id}</span>
      </nav>

      <div className="mt-3 grid gap-6 lg:grid-cols-[460px_1fr]">
        <div>
          <div className="aspect-square overflow-hidden rounded-lg border border-border bg-surface-2">
            <MarketImage src={listing.images[img] ?? listing.images[0]} label={adapter?.meta.name ?? ""} className="h-full w-full object-contain" />
          </div>
          {listing.images.length > 1 && (
            <div className="mt-2 flex gap-1.5 overflow-x-auto">
              {listing.images.slice(0, 10).map((u, i) => (
                <button key={u} onClick={() => setImg(i)} className={cn("h-14 w-14 shrink-0 overflow-hidden rounded border", i === img ? "border-accent" : "border-border")}>
                  <MarketImage src={u} className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          )}
          <div className="mt-3 flex gap-2">
            <Button variant="primary" className="flex-1 justify-center" onClick={() => void compare()} disabled={s.running}>
              {s.running && comparing ? "Diğer pazarlarda aranıyor…" : "Diğer pazarlarda bul ve karşılaştır"}
            </Button>
            <a href={listing.url} target="_blank" rel="noreferrer noopener">
              <Button>Pazarda aç ↗</Button>
            </a>
          </div>
          <p className="mt-2 text-[11px] text-muted">Görselle arama 1688 ve Taobao'nun kendi motorunda çalışır; Pinduoduo ve Trendyol'da başlıkla aranır.</p>
        </div>

        <div className="min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className={cn("inline-block rounded px-1.5 py-0.5 text-[11px] font-medium text-white", MARKET_TONE[listing.market] ?? "bg-accent")}>{adapter?.meta.name ?? listing.market}</span>
            <ListingActions listing={listing} />
          </div>
          <h1 className="mt-2 text-xl font-semibold leading-snug tracking-tight">{listing.title}</h1>
          <div className="mt-3 flex items-end gap-4">
            <div>
              <div className="text-2xl font-semibold tnum">{listing.price.tiers.length > 1 ? `${money(min, listing.price.currency)} – ${money(Math.max(...listing.price.tiers.map((t) => t.unitPrice)), listing.price.currency)}` : money(min, listing.price.currency)}</div>
              {tryPrice !== null && <div className="text-[12px] text-muted tnum">≈ {money(tryPrice, "TRY")}</div>}
            </div>
            <div className="text-[12px] text-muted tnum">
              {listing.moq && listing.moq > 1 ? <div>MOQ {listing.moq}</div> : null}
              {listing.sold !== undefined ? <div>{listing.sold.toLocaleString("tr-TR")} satış</div> : null}
              {listing.rating ? <div>Puan {listing.rating.toFixed(1)}</div> : null}
            </div>
          </div>
          {listing.price.tiers.length > 1 && (
            <ul className="mt-3 flex flex-wrap gap-2 text-[12px]">
              {listing.price.tiers.map((t) => (
                <li key={t.minQty} className="rounded border border-border px-2 py-1 tnum">
                  {t.minQty}+ adet · {money(t.unitPrice, listing.price.currency)}
                </li>
              ))}
            </ul>
          )}
          <div className="mt-4 text-[13px]">
            <div className="text-[11px] font-medium uppercase tracking-wide text-muted">Satıcı</div>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <span className="font-medium">{listing.supplierName ?? "—"}</span>
              {listing.location && <span className="text-muted">· {listing.location}</span>}
              {badges.map((b) => (
                <Badge key={b} tone={b === "verified-factory" ? "success" : "neutral"}>{BADGE_LABELS_TR[b]}</Badge>
              ))}
            </div>
          </div>

          {detail.attributes && Object.keys(detail.attributes).length > 0 ? (
            <div className="mt-4">
              <div className="text-[11px] font-medium uppercase tracking-wide text-muted">Ürün özellikleri</div>
              <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5 text-[13px]">
                {Object.entries(detail.attributes).slice(0, 24).map(([k, v]) => (
                  <div key={k} className="contents">
                    <dt className="text-muted">{k}</dt>
                    <dd>{v}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ) : (
            adapter && (
              <div className="mt-4 text-[12px] text-muted">
                Detay (özellikler, tam galeri, fiyat merdiveni) pazardan çekilmedi.{" "}
                <button onClick={() => void loadDetail()} disabled={detailState === "loading"} className="text-accent hover:underline">
                  {detailState === "loading" ? "Çekiliyor…" : "Detayı çek"}
                </button>
                {detailState === "error" && <span className="text-danger"> {detailError}</span>}
              </div>
            )
          )}

          {cost && (
            <Card className="mt-5 p-4">
              <div className="flex items-center justify-between">
                <div className="text-[11px] font-medium uppercase tracking-wide text-muted">Türkiye'ye indirilmiş maliyet · {qty} adet · {shippingLabel} · {costSettings.defaultWeightKg} kg · kur {costSettings.fxCnyTry}</div>
                <Link to="/settings" className="text-[11px] text-accent hover:underline">ayarla</Link>
              </div>
              <div className="mt-2 grid gap-x-6 gap-y-1 text-[13px] sm:grid-cols-2">
                {cost.lines.map((l) => (
                  <div key={l.key} className="flex justify-between tnum">
                    <span className="text-muted">{l.label}</span>
                    <span>{money(l.perUnit, "TRY")}</span>
                  </div>
                ))}
              </div>
              <div className="mt-2 flex justify-between border-t border-border pt-2 font-medium tnum">
                <span>Birim maliyet</span>
                <span>{money(cost.perUnit, "TRY")}</span>
              </div>
              {margin && trendyolBest && (
                <div className="mt-1 flex justify-between text-[13px] tnum">
                  <span className="text-muted">Trendyol'daki en ucuz benzer ({money(minTry(trendyolBest), "TRY")}) fiyatına satışta net</span>
                  <span className={margin.netPerUnit > 0 ? "text-success" : "text-danger"}>
                    {money(margin.netPerUnit, "TRY")} ({pct(margin.marginRate)})
                  </span>
                </div>
              )}
            </Card>
          )}
        </div>
      </div>

      {comparing && (
        <section className="mt-8">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-lg font-semibold tracking-tight">Diğer pazarlarda</h2>
            <Link to={`/search/${compareId}`} className="text-[13px] text-accent hover:underline">
              Tüm sonuçları gör →
            </Link>
          </div>
          <div className="mt-3">
            <MarketStrip markets={s.markets} notes={s.notes} onRetry={(m) => void s.retryMarket(m)} />
          </div>
          <div className="mt-4 overflow-hidden rounded-lg border border-border bg-surface">
            <table className="w-full text-[13px]">
              <thead className="text-left text-[11px] uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-2 font-medium">Pazar</th>
                  <th className="py-2 font-medium">En düşük fiyat</th>
                  <th className="py-2 font-medium">≈ TRY</th>
                  <th className="py-2 font-medium">Yakın / toplam</th>
                  <th className="py-2 font-medium">En ucuz ilan</th>
                  <th className="py-2 pr-4 font-medium text-right">Güven</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t-2 border-accent bg-accent/15 text-accent">
                  <td className="px-4 py-2 font-semibold">{adapter?.meta.name} · bu ilan (kaynak)</td>
                  <td className="py-2 tnum">{money(min, listing.price.currency)}</td>
                  <td className="py-2 tnum">{tryPrice !== null ? money(tryPrice, "TRY") : money(min, "TRY")}</td>
                  <td className="py-2">—</td>
                  <td className="max-w-[420px] truncate py-2" title={listing.title}>{listing.title}</td>
                  <td className="py-2 pr-4 text-right">—</td>
                </tr>
                {others.map((o) => (
                  <tr key={o.market} className="border-t border-border">
                    <td className="px-4 py-2 font-medium">{reg.get(o.market)?.meta.name ?? o.market}</td>
                    <td className="py-2 tnum">{o.best ? money(Math.min(...o.best.price.tiers.map((t) => t.unitPrice)), o.best.price.currency) : "—"}</td>
                    <td className="py-2 tnum">{o.best ? money(minTry(o.best), "TRY") : "—"}</td>
                    <td className="py-2 tnum" title="en yakın / toplam">{o.strongCount} / {o.count}</td>
                    <td className="max-w-[420px] truncate py-2" title={o.best?.title}>
                      {o.best ? (
                        <Link to={`/l/${o.best.market}/${o.best.id}`} className="text-accent hover:underline">
                          {o.best.title}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="py-2 pr-4 text-right tnum">{o.best && confidence.has(`${o.best.market}:${o.best.id}`) ? `%${Math.round(confidence.get(`${o.best.market}:${o.best.id}`)! * 100)}` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {others.some((o) => o.top.length) && (
            <div className="mt-4 space-y-5">
              {others.filter((o) => o.top.length).map((o) => (
                <div key={o.market}>
                  <div className="mb-2 flex items-center gap-3">
                    <div className="text-[12px] font-medium uppercase tracking-wide text-muted">
                      {reg.get(o.market)?.meta.name} · en yakın {o.top.length}
                    </div>
                    {o.weak.length > 0 && (
                      <button onClick={() => setShowFiltered((v) => ({ ...v, [o.market]: !v[o.market] }))} className="text-[12px] text-accent hover:underline">
                        {showFiltered[o.market] ? "Filtrelenenleri gizle" : `Filtrelenenleri göster (${o.weak.length})`}
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {o.top.map((l) => (
                      <ResultCard key={`${l.market}:${l.id}`} listing={l} confidence={confidence.get(`${l.market}:${l.id}`)} />
                    ))}
                  </div>
                  {showFiltered[o.market] && (
                    <div className="mt-2 grid grid-cols-2 gap-3 opacity-80 sm:grid-cols-4 xl:grid-cols-6">
                      {o.weak.map((l) => (
                        <ResultCard key={`${l.market}:${l.id}`} listing={l} confidence={confidence.get(`${l.market}:${l.id}`)} />
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function minTry(l: RawListing): number {
  const min = Math.min(...l.price.tiers.map((t) => t.unitPrice));
  return toTry(min, l.price.currency) ?? min;
}
