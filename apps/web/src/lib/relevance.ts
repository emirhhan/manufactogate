import { foldTr, type RawListing } from "@manufactogate/core";
import { getLeaves } from "@manufactogate/adapters";

/**
 * How closely a result resembles the source listing, from titles alone (0..1).
 * Signals: brand/model tokens shared, the same product category named in both titles,
 * and an accessory penalty (mounts, spoilers, stickers, cases are not the product).
 */
const ACCESSORY = /配件|支架|尾翼|贴纸|贴膜|保护壳|保护套|镜片|内衬|改装|零件|aparat|aksesuar|kılıf|yedek|parça|vizör|sticker|tutucu|bağlantı|spoiler|iç astar|lens|cam\b/i;

function latinTokens(s: string): string[] {
  return (foldTr(s).match(/[a-z][a-z0-9-]{1,}/g) ?? []).filter((w) => w.length >= 2 && !["ve", "ile", "for", "the", "and", "new", "pro"].includes(w));
}
function categories(s: string): Set<string> {
  const out = new Set<string>();
  for (const l of getLeaves()) if (s.includes(l.zh) || foldTr(s).includes(foldTr(l.tr))) out.add(l.key);
  return out;
}

export function relevance(sourceTitle: string, candidate: RawListing): number {
  const a = latinTokens(sourceTitle);
  const b = new Set(latinTokens(candidate.title));
  const shared = a.filter((t) => b.has(t)).length;
  const tokenScore = a.length ? shared / a.length : 0;
  const ca = categories(sourceTitle);
  const cb = categories(candidate.title);
  let catScore = 0;
  if (ca.size && cb.size) catScore = [...ca].some((k) => cb.has(k)) ? 1 : 0;
  else if (!ca.size || !cb.size) catScore = 0.5;
  let score = 0.55 * tokenScore + 0.45 * catScore;
  if (ACCESSORY.test(candidate.title) && !ACCESSORY.test(sourceTitle)) score *= 0.35;
  return Math.max(0, Math.min(1, score));
}
