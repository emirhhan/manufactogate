import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { normalizeBadges } from "@manufactogate/core";
import { BADGE_LABELS_TR } from "@manufactogate/adapters";
import { getCountryProfile } from "@manufactogate/country-profiles";
import { scenario, shippingKeyFor } from "@/lib/analysis";
import { COMPARE_MAX, compareStore, useCompareItems, useCompareOpen } from "@/lib/compareStore";
import { compareToCsv, download } from "@/lib/export";
import { money, priceRange, soldText } from "@/lib/format";
import { getDisplayCurrency, minDisplay, minOf } from "@/lib/fx";
import { marketTone } from "@/lib/markets";
import { getRegistry } from "@/lib/registry";
import { useSettings } from "@/store/settings";
import { MarketImage } from "./MarketImage";
import { Badge, Button, cn } from "./ui";

/**
 * Side-by-side compare drawer: up to four listings across markets with landed cost at one quantity.
 * Collapsed, it is a thin bar at the bottom; expanded, a table with one column per listing.
 */
export function CompareDrawer({ score }: { score?: ((l: { market: string; id: string }) => number | undefined) | undefined }) {
  const items = useCompareItems();
  const open = useCompareOpen();
  const cost = useSettings((s) => s.cost);
  const targetCountry = useSettings((s) => s.targetCountry);
  const [qtyText, setQtyText] = useState("");
  const reg = getRegistry();
  const disp = getDisplayCurrency();
  const profile = getCountryProfile(targetCountry) ?? getCountryProfile("tr")!;
  const qty = Number(qtyText) || null;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") compareStore.setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const rows = useMemo(
    () =>
      items.map((l) => {
        const sc = scenario(profile, l, { qty, shippingKey: shippingKeyFor(profile, cost.shippingKey), weightKg: cost.defaultWeightKg, cnyTry: cost.fxCnyTry });
        const a = reg.get(l.market);
        return { listing: l, adapter: a, marketName: a?.meta.name ?? l.market, sc, approx: minDisplay(l), badges: a ? normalizeBadges(a, l.badges) : [], score: score?.(l) };
      }),
    [items, profile, qty, cost, reg, score],
  );
  if (!items.length) return null;
  const cheapestLanded = rows.reduce<number | null>((m, r) => (r.sc && (m === null || r.sc.cost.perUnit < m) ? r.sc.cost.perUnit : m), null);
  const cheapestApprox = rows.reduce<number | null>((m, r) => (r.approx !== null && (m === null || r.approx < m) ? r.approx : m), null);

  const exportCsv = () =>
    download(
      `manufactogate-karsilastirma-${Date.now()}.csv`,
      compareToCsv(
        rows.map((r) => ({ listing: r.listing, marketName: r.marketName, landedPerUnit: r.sc?.cost.perUnit ?? null, landedCurrency: profile.currency, qty: r.sc?.qty ?? null, score: r.score })),
        { extra: { adet: String(rows[0]?.sc?.qty ?? qty ?? ""), hedef: targetCountry } },
      ),
    );

  return (
    <div className={cn("fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface shadow-md print:hidden", open ? "max-h-[70vh] overflow-y-auto" : "")} role="region" aria-label="Karşılaştırma">
      <div className="mx-auto flex max-w-[1440px] flex-wrap items-center gap-3 px-4 py-2">
        <button onClick={() => compareStore.setOpen(!open)} className="flex items-center gap-2 text-[13px] font-medium" aria-expanded={open}>
          <span className="inline-block transition-transform" style={{ transform: open ? "rotate(180deg)" : "none" }}>▴</span>
          Karşılaştır ({items.length}/{COMPARE_MAX})
        </button>
        <div className="flex items-center gap-1.5">
          {items.map((l) => (
            <div key={`${l.market}:${l.id}`} className="relative h-9 w-9 overflow-hidden rounded border border-border bg-surface-2" title={l.title}>
              <MarketImage src={l.images[0]} label={reg.get(l.market)?.meta.name ?? ""} eager className="h-full w-full object-cover" />
              <button onClick={() => compareStore.remove(l)} className="absolute right-0 top-0 h-4 w-4 rounded-bl bg-surface/90 text-[10px] leading-4 text-danger" aria-label="Kaldır">
                ×
              </button>
            </div>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2 text-[12px]">
          <label className="flex items-center gap-1 text-muted">
            adet
            <input type="number" min={1} value={qtyText} placeholder={String(rows[0]?.sc?.qty ?? 100)} onChange={(e) => setQtyText(e.target.value)} className="h-7 w-20 rounded border border-border bg-bg px-2 text-right tnum outline-none focus:border-accent" />
          </label>
          <Button size="sm" onClick={exportCsv}>CSV</Button>
          <Button size="sm" variant="ghost" onClick={() => compareStore.clear()}>Temizle</Button>
        </div>
      </div>
      {open && (
        <div className="mx-auto max-w-[1440px] overflow-x-auto px-4 pb-4">
          <table className="w-full min-w-[720px] text-[13px]">
            <tbody>
              <Row label="">
                {rows.map((r) => (
                  <td key={r.listing.id} className="py-2 pr-3 align-top">
                    <Link to={`/l/${r.listing.market}/${r.listing.id}`} className="block aspect-square w-32 overflow-hidden rounded-md border border-border bg-surface-2">
                      <MarketImage src={r.listing.images[0]} label={r.marketName} eager className="h-full w-full object-cover" />
                    </Link>
                    <span className={cn("mt-1 inline-block rounded px-1.5 py-0.5 text-[10px] font-medium text-white", marketTone(r.listing.market))}>{r.marketName}</span>
                  </td>
                ))}
              </Row>
              <Row label="Başlık">
                {rows.map((r) => (
                  <td key={r.listing.id} className="max-w-[260px] py-1.5 pr-3 align-top">
                    <Link to={`/l/${r.listing.market}/${r.listing.id}`} className="line-clamp-3 hover:underline" title={r.listing.title}>{r.listing.title}</Link>
                  </td>
                ))}
              </Row>
              <Row label="Fiyat">
                {rows.map((r) => (
                  <td key={r.listing.id} className="py-1.5 pr-3 tnum">
                    <div className="font-medium">{priceRange(r.listing.price)}</div>
                    {r.approx !== null && (
                      <div className={cn("text-[12px]", r.approx === cheapestApprox ? "text-success" : "text-muted")}>≈ {money(r.approx, disp)}{r.approx === cheapestApprox ? " · en düşük" : ""}</div>
                    )}
                  </td>
                ))}
              </Row>
              <Row label="Fiyat merdiveni">
                {rows.map((r) => (
                  <td key={r.listing.id} className="py-1.5 pr-3 text-[12px] text-muted tnum">{r.listing.price.tiers.length > 1 ? r.listing.price.tiers.map((t) => `${t.minQty}+ → ${money(t.unitPrice, r.listing.price.currency)}`).join(" · ") : "—"}</td>
                ))}
              </Row>
              <Row label="MOQ">{rows.map((r) => <td key={r.listing.id} className="py-1.5 pr-3 tnum">{r.listing.moq ?? "—"}</td>)}</Row>
              <Row label={`İndirilmiş maliyet (${profile.currency})`}>
                {rows.map((r) => (
                  <td key={r.listing.id} className={cn("py-1.5 pr-3 tnum", r.sc && r.sc.cost.perUnit === cheapestLanded ? "font-medium text-success" : "")}>
                    {r.sc ? `${money(r.sc.cost.perUnit, r.sc.cost.currency)} / adet · ${r.sc.qty} adet` : minOf(r.listing) === null ? "teklif iste" : "kur yok"}
                  </td>
                ))}
              </Row>
              <Row label="Sayaç">{rows.map((r) => <td key={r.listing.id} className="py-1.5 pr-3 tnum">{soldText(r.listing) || "—"}</td>)}</Row>
              <Row label="Puan">{rows.map((r) => <td key={r.listing.id} className="py-1.5 pr-3 tnum">{r.listing.rating?.toFixed(1) ?? "—"}</td>)}</Row>
              <Row label="Satıcı">
                {rows.map((r) => (
                  <td key={r.listing.id} className="py-1.5 pr-3">
                    <div className="truncate">{r.listing.supplierName ?? (r.listing.supplierId ? `Mağaza #${r.listing.supplierId}` : "—")}</div>
                    {r.listing.location && <div className="text-[11px] text-muted">{r.listing.location}</div>}
                  </td>
                ))}
              </Row>
              <Row label="Etiketler">
                {rows.map((r) => (
                  <td key={r.listing.id} className="py-1.5 pr-3">
                    <div className="flex flex-wrap gap-1">{r.badges.length ? r.badges.map((b) => <Badge key={b} tone={b === "verified-factory" ? "success" : "neutral"}>{BADGE_LABELS_TR[b]}</Badge>) : <span className="text-muted">—</span>}</div>
                  </td>
                ))}
              </Row>
              {rows.some((r) => r.score !== undefined) && (
                <Row label="Eşleşme">{rows.map((r) => <td key={r.listing.id} className="py-1.5 pr-3 tnum">{r.score !== undefined ? `%${Math.round(r.score * 100)}` : "—"}</td>)}</Row>
              )}
              <Row label="">
                {rows.map((r) => (
                  <td key={r.listing.id} className="py-1.5 pr-3 text-[12px]">
                    <a href={r.listing.url} target="_blank" rel="noreferrer noopener" className="mr-3 text-accent hover:underline">Pazarda aç ↗</a>
                    <button onClick={() => compareStore.remove(r.listing)} className="text-muted hover:underline">kaldır</button>
                  </td>
                ))}
              </Row>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <tr className="border-t border-border first:border-t-0">
      <th scope="row" className="w-40 py-1.5 pr-3 text-left text-[11px] font-medium uppercase tracking-wide text-muted">{label}</th>
      {children}
    </tr>
  );
}
