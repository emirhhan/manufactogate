import type { RawListing } from "@manufactogate/core";
import { toTry } from "./fx";

function csvCell(v: unknown): string {
  const s = v === undefined || v === null ? "" : String(v);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function listingsToCsv(listings: RawListing[], marketName: (m: string) => string): string {
  const head = ["pazar", "ilan_id", "baslik", "para_birimi", "min_fiyat", "max_fiyat", "yaklasik_try", "moq", "satis", "puan", "satici", "konum", "etiketler", "url"];
  const rows = listings.map((l) => {
    const prices = l.price.tiers.map((t) => t.unitPrice);
    const min = Math.min(...prices);
    return [
      marketName(l.market), l.id, l.title, l.price.currency, min, Math.max(...prices), toTry(min, l.price.currency)?.toFixed(2) ?? "",
      l.moq ?? "", l.sold ?? "", l.rating ?? "", l.supplierName ?? "", l.location ?? "", l.badges.join("|"), l.url,
    ].map(csvCell).join(";");
  });
  return "\ufeff" + [head.join(";"), ...rows].join("\n");
}

export function download(name: string, content: string, type = "text/csv;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
