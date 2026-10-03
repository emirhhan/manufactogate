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

/** Excel-openable SpreadsheetML (.xls) without a dependency; cells are typed numbers where possible. */
export function listingsToXls(listings: RawListing[], marketName: (m: string) => string): string {
  const head = ["Pazar", "İlan ID", "Başlık", "Para birimi", "Min fiyat", "Max fiyat", "≈ TRY", "MOQ", "Satış", "Puan", "Satıcı", "Konum", "Etiketler", "URL"];
  const esc = (v: unknown) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const cell = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? `<Cell><Data ss:Type="Number">${v}</Data></Cell>` : `<Cell><Data ss:Type="String">${esc(v)}</Data></Cell>`);
  const rows = listings.map((l) => {
    const prices = l.price.tiers.map((t) => t.unitPrice);
    const min = Math.min(...prices);
    return [marketName(l.market), l.id, l.title, l.price.currency, min, Math.max(...prices), toTry(min, l.price.currency) ?? "", l.moq ?? "", l.sold ?? "", l.rating ?? "", l.supplierName ?? "", l.location ?? "", l.badges.join("|"), l.url];
  });
  const xml = [`<?xml version="1.0"?><?mso-application progid="Excel.Sheet"?>`, `<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet ss:Name="Manufactogate"><Table>`, `<Row>${head.map(cell).join("")}</Row>`, ...rows.map((r) => `<Row>${r.map(cell).join("")}</Row>`), `</Table></Worksheet></Workbook>`];
  return xml.join("");
}

/** Prints the current page using the print stylesheet (save as PDF from the dialog). */
export function printPage() {
  window.print();
}
