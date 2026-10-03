import type { RawListing } from "@manufactogate/core";
import { FX_AS_OF, getDisplayCurrency, getRate, minOf, maxOf, toDisplay } from "./fx";
import { soldLabel } from "./format";
import type { SellerRow } from "./analysis";

/**
 * CSV cell: quoted when needed, and formula-safe. Market titles are untrusted; a title starting with
 * "=", "+", "-" or "@" would otherwise execute as a formula in Excel/Sheets.
 */
export function csvCell(v: unknown): string {
  let s = v === undefined || v === null ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(?:[.,]\d+)?$/.test(s)) s = `'${s}`;
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export interface ExportMeta {
  query?: string;
  markets?: string[];
  date?: string;
  /** Extra "key: value" lines. */
  extra?: Record<string, string>;
}
export interface ExportOptions {
  /** Match/relevance score per listing (0..1). */
  score?: (l: RawListing) => number | undefined;
  meta?: ExportMeta;
}

/** Comment lines at the top of a CSV: query, date, markets, FX used. Starts with "#". */
export function metaLines(meta: ExportMeta | undefined, currencies: string[]): string[] {
  const disp = getDisplayCurrency();
  const lines = [`# Manufactogate dışa aktarma · ${meta?.date ?? new Date().toISOString().slice(0, 10)}`];
  if (meta?.query) lines.push(`# sorgu: ${meta.query.replace(/\r?\n/g, " ")}`);
  if (meta?.markets?.length) lines.push(`# pazarlar: ${meta.markets.join(", ")}`);
  const rates = [...new Set(currencies)]
    .filter((c) => c !== disp)
    .map((c) => {
      const r = getRate(c);
      const d = getRate(disp);
      return r && d ? `1 ${c} = ${(r / d).toFixed(4)} ${disp}` : `${c}: kur yok`;
    });
  lines.push(`# kur (${FX_AS_OF}, gösterge): ${rates.join("; ") || "—"}`);
  for (const [k, v] of Object.entries(meta?.extra ?? {})) lines.push(`# ${k}: ${v}`);
  return lines;
}

function row(l: RawListing, marketName: (m: string) => string, score: ((l: RawListing) => number | undefined) | undefined) {
  const min = minOf(l);
  const max = maxOf(l);
  const disp = min === null ? null : toDisplay(min, l.price.currency);
  const sc = score?.(l);
  return [
    marketName(l.market),
    l.id,
    l.title,
    l.price.currency,
    min ?? "",
    max ?? "",
    disp === null ? "" : Number(disp.toFixed(2)),
    l.moq ?? "",
    l.sold ?? "",
    l.sold !== undefined ? soldLabel(l.market, l.soldPeriod) : "",
    l.rating ?? "",
    l.supplierName ?? (l.supplierId ? `#${l.supplierId}` : ""),
    l.location ?? "",
    l.badges.join("|"),
    sc === undefined ? "" : Math.round(sc * 100),
    l.url,
  ];
}
const HEAD_TR = (disp: string) => ["Pazar", "İlan ID", "Başlık", "Para birimi", "Min fiyat", "Max fiyat", `≈ ${disp}`, "MOQ", "Sayaç", "Sayaç türü", "Puan", "Satıcı", "Konum", "Etiketler", "Eşleşme %", "URL"];
const HEAD_CSV = (disp: string) => ["pazar", "ilan_id", "baslik", "para_birimi", "min_fiyat", "max_fiyat", `yaklasik_${disp.toLowerCase()}`, "moq", "sayac", "sayac_turu", "puan", "satici", "konum", "etiketler", "eslesme_yuzde", "url"];

export function listingsToCsv(listings: RawListing[], marketName: (m: string) => string, opts: ExportOptions = {}): string {
  const disp = getDisplayCurrency();
  const rows = listings.map((l) => row(l, marketName, opts.score).map(csvCell).join(";"));
  return "﻿" + [...metaLines(opts.meta, listings.map((l) => l.price.currency)), HEAD_CSV(disp).join(";"), ...rows].join("\n");
}

export function download(name: string, content: string, type = "text/csv;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const esc = (v: unknown) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const xcell = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? `<Cell><Data ss:Type="Number">${v}</Data></Cell>` : `<Cell><Data ss:Type="String">${esc(v)}</Data></Cell>`);
function workbook(sheets: { name: string; rows: unknown[][] }[]): string {
  const xml = [`<?xml version="1.0"?><?mso-application progid="Excel.Sheet"?>`, `<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">`];
  for (const s of sheets) {
    xml.push(`<Worksheet ss:Name="${esc(s.name).slice(0, 31)}"><Table>`);
    for (const r of s.rows) xml.push(`<Row>${r.map(xcell).join("")}</Row>`);
    xml.push(`</Table></Worksheet>`);
  }
  xml.push(`</Workbook>`);
  return xml.join("");
}

/** Excel-openable SpreadsheetML (.xls) without a dependency; a second sheet carries the assumptions. */
export function listingsToXls(listings: RawListing[], marketName: (m: string) => string, opts: ExportOptions = {}): string {
  const disp = getDisplayCurrency();
  const rows = listings.map((l) => row(l, marketName, opts.score));
  const meta = metaLines(opts.meta, listings.map((l) => l.price.currency)).map((line) => [line.replace(/^# ?/, "")]);
  return workbook([
    { name: "Manufactogate", rows: [HEAD_TR(disp), ...rows] },
    { name: "Varsayımlar", rows: meta },
  ]);
}

export interface CompareRow {
  listing: RawListing;
  marketName: string;
  landedPerUnit: number | null;
  landedCurrency: string;
  qty: number | null;
  score?: number | undefined;
}

/** Side-by-side comparison export: one column per listing, one row per attribute. */
export function compareToCsv(rows: CompareRow[], meta?: ExportMeta): string {
  const disp = getDisplayCurrency();
  const attrs: [string, (r: CompareRow) => unknown][] = [
    ["Pazar", (r) => r.marketName],
    ["Başlık", (r) => r.listing.title],
    ["Para birimi", (r) => r.listing.price.currency],
    ["Min fiyat", (r) => minOf(r.listing) ?? ""],
    [`≈ ${disp}`, (r) => { const m = minOf(r.listing); const d = m === null ? null : toDisplay(m, r.listing.price.currency); return d === null ? "" : Number(d.toFixed(2)); }],
    ["Fiyat merdiveni", (r) => r.listing.price.tiers.map((t) => `${t.minQty}+ → ${t.unitPrice}`).join(" | ")],
    ["MOQ", (r) => r.listing.moq ?? ""],
    ["Adet (senaryo)", (r) => r.qty ?? ""],
    ["İndirilmiş maliyet / adet", (r) => (r.landedPerUnit === null ? "" : `${r.landedPerUnit.toFixed(2)} ${r.landedCurrency}`)],
    ["Sayaç", (r) => (r.listing.sold !== undefined ? `${r.listing.sold} ${soldLabel(r.listing.market, r.listing.soldPeriod)}` : "")],
    ["Puan", (r) => r.listing.rating ?? ""],
    ["Satıcı", (r) => r.listing.supplierName ?? (r.listing.supplierId ? `#${r.listing.supplierId}` : "")],
    ["Konum", (r) => r.listing.location ?? ""],
    ["Etiketler", (r) => r.listing.badges.join("|")],
    ["Eşleşme %", (r) => (r.score === undefined ? "" : Math.round(r.score * 100))],
    ["URL", (r) => r.listing.url],
  ];
  const lines = [...metaLines(meta, rows.map((r) => r.listing.price.currency)), ["Alan", ...rows.map((_, i) => `İlan ${i + 1}`)].map(csvCell).join(";")];
  for (const [label, f] of attrs) lines.push([label, ...rows.map(f)].map(csvCell).join(";"));
  return "﻿" + lines.join("\n");
}

/** Seller list export ("satan var mı"). */
export function sellersToCsv(rows: SellerRow[], meta?: ExportMeta): string {
  const head = ["pazar", "satici", "satici_id", "ilan_sayisi", "min_fiyat", "para_birimi", "degerlendirme", "puan", "etiketler", "magaza_url", "en_ucuz_ilan_url"];
  const lines = rows.map((r) => [r.marketName, r.name, r.id ?? "", r.listings, r.minPrice ?? "", r.currency, r.reviews ?? "", r.rating ?? "", r.badges.join("|"), r.url ?? "", r.cheapest.url].map(csvCell).join(";"));
  return "﻿" + [...metaLines(meta, rows.map((r) => r.currency)), head.join(";"), ...lines].join("\n");
}

/** Prints the current page using the print stylesheet (save as PDF from the dialog). */
export function printPage() {
  window.print();
}
