/** Parses the bulk-research input: one query per line (or ;-separated), CSV first column, with a header skipped. Pure. */
export function parseQueries(text: string, max = 200): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]!;
    for (const piece of raw.split(";")) {
      let q = piece.trim();
      if (!q) continue;
      // CSV row: take the first cell, unquoted.
      if (q.includes(",") && !/\s/.test(q.split(",")[0] ?? "x y")) q = q.split(",")[0]!.trim();
      else if (/^"[^"]*",/.test(q)) q = q.slice(1, q.indexOf('"', 1)).trim();
      if (i === 0 && /^(ürün|urun|sorgu|query|keyword|anahtar kelime|product|name|ad)$/i.test(q)) continue;
      q = q.replace(/^"|"$/g, "").trim();
      const k = q.toLowerCase();
      if (!q || seen.has(k)) continue;
      seen.add(k);
      out.push(q);
      if (out.length >= max) return out;
    }
  }
  return out;
}
