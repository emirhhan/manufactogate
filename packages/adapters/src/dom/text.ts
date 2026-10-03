/** Text and number parsing shared by all market parsers. Pure, no DOM. */

/** Collapses NBSP / thin / narrow spaces into a plain space so regexes can rely on " ". */
export function normalizeSpaces(text: string): string {
  return text.replace(/[\u00a0\u2009\u202f\u2007\u2008\u200a\u3000]/g, " ");
}

/** Joins "2 325" / "12 500 000" style thousands groups (space-separated) into "2325" / "12500000". */
function joinSpacedThousands(t: string): string {
  // Only join when the group after the space is exactly three digits and not followed by more digits,
  // so "12 €" stays 12 and "15 pack" is untouched.
  let prev = "";
  let cur = t;
  while (cur !== prev) {
    prev = cur;
    cur = cur.replace(/(\d) (?=\d{3}(?!\d))/g, "$1");
  }
  return cur;
}

/** "¥12.50", "12.5元", "₺1.299,90", "1,299.00", "12.5-18.9" (first), "¥ 1,2万", "2 325 ₽", "1 299,00 ₽" */
export function parsePrice(text: string | null | undefined): number | null {
  if (!text) return null;
  const t = joinSpacedThousands(normalizeSpaces(text).replace(/\s+/g, " ").trim());
  const m = /(\d{1,3}(?:[.,]\d{3})+|\d+)(?:[.,](\d{1,2}))?\s*(万|Lakh|lakh|Cr|Crore|crore)?/.exec(t);
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
  const unit = m[3];
  if (unit === "万") n *= 10000;
  else if (unit === "Lakh" || unit === "lakh") n *= 100000;
  else if (unit) n *= 10_000_000;
  return Number.isFinite(n) ? n : null;
}

/** Count multipliers seen on marketplaces, by suffix. Order matters: longer suffixes first. */
const COUNT_UNITS: [RegExp, number][] = [
  [/^(?:万|萬|만|หมื่น)/u, 10000],
  [/^(?:亿|억)/u, 100_000_000],
  [/^(?:千|천|พัน)/u, 1000],
  // Latin/Cyrillic units must not be the start of a longer word ("Bewertungen", "Beğeni", "Mio").
  [/^(?:тыс\.?|ribu|rb|bin|K|k|B)(?!\p{L})/u, 1000],
  [/^(?:แสน)/u, 100000],
  [/^(?:ล้าน)/u, 1_000_000],
  [/^(?:млн\.?|juta|jt|mn|M)(?!\p{L})/u, 1_000_000],
];

/** "1.2万+人付款", "已售 3000+", "(12.4K)", "2.345 Değerlendirme", "2.3천", "1,2 тыс.", "1.2 พัน", "10rb+" → number */
export function parseCount(text: string | null | undefined): number | null {
  if (!text) return null;
  const t = normalizeSpaces(text).replace(/\s+/g, " ").trim();
  const m = /(\d{1,3}(?:[.,]\d{3})+|\d+(?:[.,]\d+)?)\s?([^\d\s+()]{0,6})/.exec(t);
  if (!m) return null;
  const raw = m[1]!;
  // "1,200" / "2.345" are thousands groups; "1.2" / "4,5" are decimals.
  const grouped = /^\d{1,3}([.,]\d{3})+$/.test(raw);
  let n = grouped ? Number(raw.replace(/[.,]/g, "")) : Number(raw.replace(",", "."));
  if (!Number.isFinite(n)) return null;
  const suffix = m[2] ?? "";
  for (const [re, mult] of COUNT_UNITS) {
    if (re.test(suffix)) {
      n *= mult;
      break;
    }
  }
  return Math.round(n);
}

export interface Money {
  amount: number;
  /** ISO 4217 code when the text carried a recognisable symbol or code; null otherwise. */
  currency: string | null;
  /** Upper bound of a "US$ 14.49 - 14.99" style range. */
  max?: number;
}

/** Currency marks in order of specificity (longer / unambiguous ones first). */
const CURRENCY_MARKS: [RegExp, string][] = [
  [/US\s?\$|USD\b|\$US/i, "USD"],
  [/C\$|CAD\b/, "CAD"],
  [/A\$|AUD\b/, "AUD"],
  [/HK\$|HKD\b/, "HKD"],
  [/S\$|SGD\b/, "SGD"],
  [/R\$|BRL\b/, "BRL"],
  [/TRY\b|₺|\bTL\b/, "TRY"],
  [/EUR\b|€/, "EUR"],
  [/GBP\b|£/, "GBP"],
  [/INR\b|₹|\bRs\.?\s?\d/, "INR"],
  [/IDR\b|\bRp\s?\d/, "IDR"],
  [/THB\b|฿|บาท/, "THB"],
  [/JPY\b|円|\bYEN\b/i, "JPY"],
  [/KRW\b|원/, "KRW"],
  [/RUB\b|₽|руб/, "RUB"],
  [/AED\b|د\.إ|درهم/, "AED"],
  [/SAR\b|ر\.س|ريال/, "SAR"],
  [/CNY\b|RMB\b|元|¥|￥/, "CNY"],
  [/PLN\b|zł/, "PLN"],
  [/MXN\b/, "MXN"],
  [/VND\b|₫/, "VND"],
  [/PHP\b|₱/, "PHP"],
  [/MYR\b|\bRM\s?\d/, "MYR"],
  [/\$/, "USD"],
];

/**
 * Parses an amount and the currency it is written in. "¥" is reported as CNY unless the
 * caller passes `yenAs: "JPY"`; "$" alone is USD. Returns null when no number is present.
 */
export function parseMoney(text: string | null | undefined, opts: { yenAs?: "CNY" | "JPY"; fallback?: string } = {}): Money | null {
  if (!text) return null;
  const t = normalizeSpaces(text).replace(/\s+/g, " ").trim();
  const amount = parsePrice(t);
  if (amount === null) return null;
  let currency: string | null = null;
  for (const [re, code] of CURRENCY_MARKS) {
    if (re.test(t)) {
      currency = code;
      break;
    }
  }
  if (currency === "CNY" && /[¥￥]/.test(t) && !/CNY|RMB|元/.test(t) && opts.yenAs === "JPY") currency = "JPY";
  if (!currency && opts.fallback) currency = opts.fallback;
  const range = /(\d[\d.,\s]*)\s*[-–~]\s*(\d[\d.,\s]*)/.exec(t);
  const max = range ? parsePrice(range[2]) : null;
  return max !== null && max > amount ? { amount, currency, max } : { amount, currency };
}

/** Rough script-based language guess for a product title (used to flag machine-translated titles). */
export function detectLang(text: string | null | undefined): string | null {
  const t = (text ?? "").trim();
  if (!t) return null;
  const letters = t.replace(/[\d\s\p{P}\p{S}]/gu, "");
  if (!letters) return null;
  const count = (re: RegExp) => (letters.match(re) ?? []).length;
  const n = letters.length;
  if (count(/\p{Script=Han}/gu) / n > 0.3) return count(/\p{Script=Hiragana}|\p{Script=Katakana}/gu) > 0 ? "ja" : "zh";
  if (count(/\p{Script=Hiragana}|\p{Script=Katakana}/gu) > 0) return "ja";
  if (count(/\p{Script=Hangul}/gu) / n > 0.3) return "ko";
  if (count(/\p{Script=Cyrillic}/gu) / n > 0.5) return "ru";
  if (count(/\p{Script=Arabic}/gu) / n > 0.5) return "ar";
  if (count(/\p{Script=Thai}/gu) / n > 0.5) return "th";
  if (count(/\p{Script=Devanagari}/gu) / n > 0.5) return "hi";
  if (/[ğĞşŞıİçÇöÖüÜ]/.test(letters) || /\b(?:ve|için|ile|ürün|kadın|erkek|set)\b/i.test(t)) return "tr";
  if (/[äöüß]/.test(letters) && /\b(?:und|für|mit)\b/i.test(t)) return "de";
  return "en";
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
  return normalizeSpaces(s ?? "").replace(/\s+/g, " ").trim();
}

/** Strips a leading badge/label fragment ("Popüler seçimler", "Rollback,") from a product title. */
export function stripTitlePrefix(title: string, prefixes: readonly string[]): string {
  let t = clean(title);
  let changed = true;
  while (changed) {
    changed = false;
    for (const p of prefixes) {
      if (!p) continue;
      if (t.toLowerCase().startsWith(p.toLowerCase())) {
        t = t.slice(p.length).replace(/^[\s,:|·\-–]+/, "");
        changed = true;
      }
    }
  }
  return t;
}
