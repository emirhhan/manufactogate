/** Turkish-aware text folding for search: diacritics to ASCII, light stemming and word-boundary matching. */

const FOLD: Record<string, string> = { ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u", â: "a", î: "i", û: "u" };

export function foldTr(s: string): string {
  return s
    .replace(/İ/g, "i")
    .replace(/I/g, "ı")
    .toLowerCase()
    .replace(/[çğıöşüâîû]/g, (c) => FOLD[c] ?? c);
}

/** Remainders that may follow a query term inside a longer haystack word ("kulak" + "lik"). */
const PREFIX_SUFFIX = /^(l[iu]k|l[iu]g[iu]|l[iu]|lar|ler|lar[iu]|ler[iu]|lar[iu]n|ler[iu]n|c[iu]|c[ae]|s[iu]|[iu]|[iu]n|n[iu]n|[ae]|d[ae]|t[ae]|y[ae]|y[iu]|d[ae]n|t[ae]n|l[ae]|k[iu]|s[iu]n[iu])$/;
const HARDEN: Record<string, string> = { g: "k", b: "p", d: "t" };
const SOFTEN: Record<string, string> = { k: "g", p: "b", t: "d" };

/**
 * Plausible light stems of an already folded word: strips one plural/possessive/accusative
 * suffix. Where "-sI" and "-I" are both possible ("termosu" = termos+u, "kapısı" = kapı+sı) both
 * readings are returned. Softened final consonants are hardened back ("gozlug" → "gozluk").
 * Never shorter than 3 characters; words with digits are returned as they are.
 */
export function stemCandidatesTr(word: string): string[] {
  if (/\d/.test(word) || word.length < 4) return [word];
  const out: string[] = [];
  const add = (w: string) => {
    if (w.length < 3) return;
    if (!out.includes(w)) out.push(w);
    const last = w.at(-1);
    if (last && HARDEN[last] && w !== word) {
      const h = w.slice(0, -1) + HARDEN[last];
      if (!out.includes(h)) out.push(h);
    }
  };
  const step = (w: string): string[] => {
    const res: string[] = [];
    if (/(lari|leri)$/.test(w) && w.length - 4 >= 3) res.push(w.slice(0, -4));
    else if (/(lar|ler)$/.test(w) && w.length - 3 >= 3) res.push(w.slice(0, -3));
    else {
      if (/[aeiou](si|su|yi|yu|ni|nu)$/.test(w) && w.length - 2 >= 3) res.push(w.slice(0, -2));
      if (/[^aeiou](i|u)$/.test(w) && w.length - 1 >= 3) res.push(w.slice(0, -1));
      if (/[aeiou](si|su)$/.test(w) && w.length - 1 >= 3) res.push(w.slice(0, -1)); // termos+u reading
    }
    return res;
  };
  const first = step(word);
  if (!first.length) return [word];
  for (const f of first) {
    add(f);
    // Possessive followed by accusative: "kapisini" → "kapisi" → "kapi".
    for (const g of step(f)) if (/[aeiou](si|su|yi|yu|ni|nu)$/.test(f) || /(lari|leri)$/.test(word)) add(g);
  }
  return out.length ? out : [word];
}

/** The first (most likely) light stem of a folded word. */
export function stemTr(word: string): string {
  return stemCandidatesTr(word)[0] ?? word;
}

/** Stem candidates with hardened final consonants, deduplicated (alias of stemCandidatesTr). */
export function stemVariantsTr(word: string): string[] {
  return stemCandidatesTr(word);
}

/**
 * Variants of a query term that should also match: "gözlük" must find "gözlüğü",
 * "kitap" must find "kitabı". Returns folded forms (whole words, never truncations).
 */
export function termVariants(term: string): string[] {
  const t = foldTr(term);
  const out = new Set([t]);
  const last = t.at(-1);
  if (last && SOFTEN[last] && t.length >= 3) out.add(t.slice(0, -1) + SOFTEN[last]);
  for (const s of stemVariantsTr(t)) out.add(s);
  return [...out].filter((v) => v.length >= 2);
}

/** Folded words of a text (letters and digits only). */
export function wordsTr(text: string): string[] {
  return foldTr(text).split(/[^a-z0-9]+/).filter(Boolean);
}

function wordMatches(word: string, variants: string[]): boolean {
  for (const v of variants) {
    if (word === v) return true;
    // Prefix match only for substantial terms followed by a Turkish suffix: "kulak" finds "kulaklik",
    // but "mat" never hits "matkap" and "kablo" never hits "kablosuz".
    if (v.length >= 4 && word.startsWith(v) && PREFIX_SUFFIX.test(word.slice(v.length))) return true;
  }
  // The haystack word may carry a suffix the query lacks: "kaski" vs "kask".
  for (const s of stemVariantsTr(word)) if (variants.includes(s)) return true;
  return false;
}

/**
 * True when every query term (or one of its variants) occurs as a whole word in the folded
 * haystack. An empty query matches nothing.
 */
export function matchesTr(haystack: string, query: string): boolean {
  const terms = query.trim().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return false;
  const words = wordsTr(haystack);
  if (words.length === 0) return false;
  const hay = foldTr(haystack);
  return terms.every((term) => {
    const variants = termVariants(term);
    // Non-latin terms (Chinese, Japanese, …) have no word boundaries: substring match.
    if (!/^[a-z0-9]+$/.test(foldTr(term))) return hay.includes(foldTr(term));
    return words.some((w) => wordMatches(w, variants));
  });
}

/** Number of query terms that occur in the haystack (same rules as matchesTr). */
export function countMatchesTr(haystack: string, query: string): number {
  const terms = query.trim().split(/\s+/).filter(Boolean);
  const words = wordsTr(haystack);
  const hay = foldTr(haystack);
  let n = 0;
  for (const term of terms) {
    if (!/^[a-z0-9]+$/.test(foldTr(term))) {
      if (hay.includes(foldTr(term))) n++;
      continue;
    }
    const variants = termVariants(term);
    if (words.some((w) => wordMatches(w, variants))) n++;
  }
  return n;
}
