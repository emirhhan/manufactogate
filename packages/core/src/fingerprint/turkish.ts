/** Turkish-aware text folding for search: diacritics to ASCII and final-consonant softening. */

const FOLD: Record<string, string> = { ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u", â: "a", î: "i", û: "u" };

export function foldTr(s: string): string {
  return s
    .replace(/İ/g, "i")
    .replace(/I/g, "ı")
    .toLowerCase()
    .replace(/[çğıöşüâîû]/g, (c) => FOLD[c] ?? c);
}

/**
 * Variants of a query term that should also match: "gözlük" must find "gözlüğü",
 * "kitap" must find "kitabı". Returns folded forms.
 */
export function termVariants(term: string): string[] {
  const t = foldTr(term);
  const out = new Set([t]);
  const soft: Record<string, string> = { k: "g", p: "b", t: "d", c: "c" };
  const last = t.at(-1);
  if (last && soft[last]) out.add(t.slice(0, -1) + soft[last]);
  if (t.length > 4) out.add(t.slice(0, -1));
  return [...out];
}

/** True when every term (or one of its variants) occurs in the folded haystack. */
export function matchesTr(haystack: string, query: string): boolean {
  const hay = foldTr(haystack);
  return query
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .every((term) => termVariants(term).some((v) => hay.includes(v)));
}
