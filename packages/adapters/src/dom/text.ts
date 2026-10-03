/** Text and number parsing shared by all market parsers. Pure, no DOM. */

/** "¥12.50", "12.5元", "₺1.299,90", "1,299.00", "12.5-18.9" (first), "¥ 1,2万" */
export function parsePrice(text: string | null | undefined): number | null {
  if (!text) return null;
  const t = text.replace(/\s+/g, " ").trim();
  const m = /(\d{1,3}(?:[.,]\d{3})+|\d+)(?:[.,](\d{1,2}))?\s*(万)?/.exec(t);
  if (!m) return null;
  let intPart = m[1]!;
  const frac = m[2];
  // Turkish/European style "1.299,90": thousands with dots, decimals with comma.
  if (/^\d{1,3}(\.\d{3})+$/.test(intPart) && (frac === undefined || t.includes(","))) intPart = intPart.replace(/\./g, "");
  else if (/^\d{1,3}(,\d{3})+$/.test(intPart)) intPart = intPart.replace(/,/g, "");
  else if (intPart.includes(".") || intPart.includes(",")) {
    // ambiguous "1.299" with no decimals: treat as thousands when followed by nothing
    intPart = intPart.replace(/[.,]/g, "");
  }
  let n = Number(intPart) + (frac ? Number(`0.${frac}`) : 0);
  if (m[3]) n *= 10000;
  return Number.isFinite(n) ? n : null;
}

/** "1.2万+人付款", "已售 3000+", "成交 1.5万件", "(12.4K)", "2.345 Değerlendirme" → number */
export function parseCount(text: string | null | undefined): number | null {
  if (!text) return null;
  const t = text.replace(/\s+/g, "");
  const m = /(\d{1,3}(?:[.,]\d{3})+|\d+(?:[.,]\d+)?)(万|K|k|B|M)?/.exec(t);
  if (!m) return null;
  const raw = m[1]!;
  // "1,200" / "2.345" are thousands groups; "1.2" / "4,5" are decimals.
  const grouped = /^\d{1,3}([.,]\d{3})+$/.test(raw);
  let n = grouped ? Number(raw.replace(/[.,]/g, "")) : Number(raw.replace(",", "."));
  if (!Number.isFinite(n)) return null;
  const unit = m[2];
  if (unit === "万") n *= 10000;
  else if (unit === "K" || unit === "k" || unit === "B") n *= 1000;
  else if (unit === "M") n *= 1_000_000;
  return Math.round(n);
}

/** Extracts a balanced JSON object/array that starts at the first '{' or '[' after `marker`. */
export function extractJsonAfter(source: string, marker: string | RegExp): string | null {
  const idx = typeof marker === "string" ? source.indexOf(marker) : (source.search(marker) ?? -1);
  if (idx < 0) return null;
  const startFrom = idx + (typeof marker === "string" ? marker.length : (source.slice(idx).match(marker)?.[0].length ?? 0));
  let i = startFrom;
  while (i < source.length && source[i] !== "{" && source[i] !== "[") {
    if (source[i] === ";" || source[i] === "\n") return null;
    i++;
  }
  if (i >= source.length) return null;
  const open = source[i]!;
  const close = open === "{" ? "}" : "]";
  let depth = 0;
  let inStr: string | null = null;
  for (let j = i; j < source.length; j++) {
    const c = source[j]!;
    if (inStr) {
      if (c === "\\") j++;
      else if (c === inStr) inStr = null;
      continue;
    }
    if (c === '"' || c === "'") inStr = c;
    else if (c === open) depth++;
    else if (c === close) {
      depth--;
      if (depth === 0) return source.slice(i, j + 1);
    }
  }
  return null;
}

export function tryJson<T = unknown>(s: string | null): T | null {
  if (!s) return null;
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}

/** Safe deep get: get(obj, "a.b.0.c") */
export function get(obj: unknown, path: string): unknown {
  let cur: unknown = obj;
  for (const k of path.split(".")) {
    if (cur === null || cur === undefined) return undefined;
    cur = (cur as Record<string, unknown>)[k];
  }
  return cur;
}

export function absUrl(href: string, base: string): string {
  try {
    return new URL(href.startsWith("//") ? `https:${href}` : href, base).toString();
  } catch {
    return href;
  }
}

export function clean(s: string | null | undefined): string {
  return (s ?? "").replace(/\s+/g, " ").trim();
}
