/** Text signals used for matching: normalized tokens and model-number candidates. */

const STOP = new Set([
  "the", "and", "for", "with", "new", "hot", "sale", "free", "shipping", "wholesale",
  "ve", "ile", "için", "yeni", "ücretsiz", "kargo", "toptan",
  "批发", "新款", "包邮", "厂家", "直销", "热卖", "爆款",
]);

export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[【】[\]()（）,，.。!！?？:：;；/\\|"'“”‘’]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokens(title: string): string[] {
  const norm = normalizeTitle(title);
  // Split latin words on spaces; CJK into bigrams.
  const out: string[] = [];
  for (const chunk of norm.split(" ")) {
    if (!chunk) continue;
    if (/[㐀-鿿]/.test(chunk)) {
      const chars = [...chunk];
      for (let i = 0; i < chars.length - 1; i++) out.push(chars[i]! + chars[i + 1]!);
      if (chars.length === 1) out.push(chars[0]!);
    } else if (!STOP.has(chunk)) {
      out.push(chunk);
    }
  }
  return out;
}

/** Model-number candidates: alphanumeric codes with digits and letters, length 4+. */
export function modelNumbers(title: string): string[] {
  const found = new Set<string>();
  const re = /\b(?=[a-z0-9-]*\d)(?=[a-z0-9-]*[a-z])[a-z0-9]{2,}(?:-[a-z0-9]+)*\b/gi;
  for (const m of title.matchAll(re)) {
    const s = m[0].toUpperCase();
    if (s.length >= 4) found.add(s);
  }
  return [...found];
}

export function jaccard(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 0;
  const sa = new Set(a);
  const sb = new Set(b);
  let inter = 0;
  for (const x of sa) if (sb.has(x)) inter++;
  return inter / (sa.size + sb.size - inter);
}
