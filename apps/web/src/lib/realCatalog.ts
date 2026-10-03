import type { RawListing } from "@manufactogate/core";
import { foldTr, stemVariantsTr, termVariants } from "@manufactogate/core";
import { getLeaves, type Leaf } from "@manufactogate/adapters";
import { ACCESSORY_WORDS_FOLDED, LEAF_SYNONYMS } from "./categorySynonyms";
import { db, listingsWriteVersion } from "./db";
import { compareDisplayAsc, minDisplay } from "./fx";
import { pairsFromMatches, type MarginPair } from "./margin";
import { getRegistry } from "./registry";
import type { SortKey } from "./catalog";

/** Real-data catalog: every listing pulled so far, classified into the taxonomy once and cached. */
export interface Classified {
  listing: RawListing;
  leaf: Leaf | null;
  /** Best retail-to-source ratio from stored matches, for the "Marj potansiyeli" sort and badge. */
  margin?: MarginPair | undefined;
}

/* ------------------------------------------------------------------------------------------ */
/* Classification index: labels folded and tokenised once per module, not once per listing.    */

interface Entry {
  leaf: Leaf;
  /** Variants per Turkish term ("kablosuz" → ["kablosuz"], "kulaklik" → ["kulaklik", "kulakligi", ...]). */
  trTerms: string[][];
  /** Padded Latin/Cyrillic forms matched as whole words on the folded title (" wireless earbuds "). */
  wordForms: string[];
  /** Chinese/Japanese/Korean forms matched as substrings. */
  cjkForms: string[];
  accessoryLeaf: boolean;
  specificity: number;
}

interface Index {
  byToken: Map<string, Entry[]>;
  cjk: Entry[];
}

const CJK_RE = /[㐀-鿿ぁ-ヿ가-힣]/;
const WITH_WORDS = new Set(["with", "ile", "dahil", "incl", "including", "ve", "and", "plus", "birlikte", "mit", "с", "set"]);
const CJK_ANY = /[㐀-鿿ぁ-ヿ가-힣]/;
const SPLIT_RE = /[^\p{L}\p{N}]+/u;

let INDEX: Index | null = null;

function isAccessoryLabel(folded: string, en: string): boolean {
  const words = folded.split(" ");
  if (words.some((w) => ACCESSORY_WORDS_FOLDED.has(w))) return true;
  return /\b(case|cover|holder|mount|strap|protector|stand|bag|cable|charger|band|insole|lace|rack|organizer|filter|pad|bulb|adapter)\b/.test(en.toLowerCase());
}

function buildIndex(): Index {
  if (INDEX) return INDEX;
  const byToken = new Map<string, Entry[]>();
  const cjk: Entry[] = [];
  const add = (tok: string, e: Entry) => {
    const arr = byToken.get(tok);
    if (arr) {
      if (!arr.includes(e)) arr.push(e);
    } else byToken.set(tok, [e]);
  };
  for (const leaf of getLeaves()) {
    const folded = foldTr(leaf.tr).replace(SPLIT_RE, " ").trim();
    const terms = folded.split(" ").filter(Boolean);
    const trTerms = terms.map((t) => termVariants(t));
    const forms = [leaf.en, ...(LEAF_SYNONYMS[leaf.key] ?? [])];
    const wordForms: string[] = [];
    const cjkForms: string[] = [];
    if (leaf.zh) cjkForms.push(leaf.zh);
    for (const f of forms) {
      if (!f) continue;
      if (CJK_RE.test(f)) cjkForms.push(f.toLowerCase());
      else {
        const ff = foldTr(f).replace(SPLIT_RE, " ").trim();
        if (ff) wordForms.push(` ${ff} `);
      }
    }
    const e: Entry = {
      leaf,
      trTerms,
      wordForms,
      cjkForms,
      accessoryLeaf: isAccessoryLabel(folded, leaf.en),
      specificity: terms.length * 100 + folded.length,
    };
    for (const v of trTerms[0] ?? []) add(v, e);
    for (const f of wordForms) {
      const first = f.trim().split(" ")[0];
      if (first) add(first, e);
    }
    if (cjkForms.length) cjk.push(e);
  }
  INDEX = { byToken, cjk };
  return INDEX;
}

function wordMatches(word: string, variants: string[], stems: string[]): boolean {
  for (const v of variants) {
    if (word === v) return true;
    if (v.length >= 4 && word.length - v.length <= 4 && word.startsWith(v)) return true;
  }
  for (const s of stems) if (variants.includes(s)) return true;
  return false;
}

/**
 * The taxonomy leaf a title belongs to, or null. Chinese labels match as substrings, Turkish
 * labels as stemmed whole words, English and other synonyms as whole words; the most specific
 * (multi-word, longest) label wins, and a leaf that names a main product loses to one that
 * names the accessory when the title is an accessory ("kask askısı" is not a helmet). Pure.
 */
export function classifyTitle(title: string): Leaf | null {
  const idx = buildIndex();
  const folded = foldTr(title).replace(SPLIT_RE, " ").trim();
  if (!folded && !CJK_ANY.test(title)) return null;
  const words = folded ? folded.split(" ") : [];
  const stems = new Map<string, string[]>();
  const stemsOf = (w: string) => {
    let s = stems.get(w);
    if (!s) {
      s = /^[a-z]+$/.test(w) ? stemVariantsTr(w) : [];
      stems.set(w, s);
    }
    return s;
  };
  const hay = ` ${folded} `;
  const candidates = new Set<Entry>();
  for (const w of words) {
    const direct = idx.byToken.get(w);
    if (direct) for (const e of direct) candidates.add(e);
    for (const s of stemsOf(w)) {
      const hit = idx.byToken.get(s);
      if (hit) for (const e of hit) candidates.add(e);
    }
    // "kulakligi" → "kulak…" prefixes of indexed tokens: covered by the entry's own variants below.
  }
  const hasCjk = CJK_ANY.test(title);
  const lowerTitle = hasCjk ? title.toLowerCase() : "";
  if (hasCjk) for (const e of idx.cjk) if (e.cjkForms.some((f) => lowerTitle.includes(f))) candidates.add(e);
  if (!candidates.size) return null;

  const accessoryIdx = words.map((w, i) => (ACCESSORY_WORDS_FOLDED.has(w) ? i : -1)).filter((i) => i !== -1);
  // "with charging case" / "kılıf dahil" describe a bundled extra, not the product itself.
  const bundled = (k: number) => words.slice(Math.max(0, k - 2), k).some((w) => WITH_WORDS.has(w));
  const accessoryAfter = (matchedAt: number) => accessoryIdx.some((k) => k > matchedAt && k <= matchedAt + 2 && !bundled(k));
  let best: Entry | null = null;
  let bestScore = -Infinity;
  let bestAt = Infinity;
  for (const e of candidates) {
    let matchedAt = -1;
    let firstAt = Infinity;
    let score = -Infinity;
    // Chinese/Japanese/Korean: the longest matching form wins (无线蓝牙耳机 beats 耳机).
    if (hasCjk) {
      for (const f of e.cjkForms) {
        const at = lowerTitle.indexOf(f);
        if (at === -1) continue;
        score = Math.max(score, 1000 + f.length * 100);
        firstAt = Math.min(firstAt, at);
      }
    }
    // Turkish: every term as a (stemmed) whole word.
    if (e.trTerms.length) {
      let ok = true;
      let last = -1;
      let first = Infinity;
      for (const variants of e.trTerms) {
        const i = words.findIndex((w) => wordMatches(w, variants, stemsOf(w)));
        if (i === -1) {
          ok = false;
          break;
        }
        last = Math.max(last, i);
        first = Math.min(first, i);
      }
      if (ok) {
        score = Math.max(score, e.specificity);
        matchedAt = Math.max(matchedAt, last);
        firstAt = Math.min(firstAt, first);
      }
    }
    // English and other Latin/Cyrillic forms: whole-word phrase; more words and longer phrases are more specific.
    for (const f of e.wordForms) {
      const at = hay.indexOf(f);
      if (at === -1) continue;
      const wordsBefore = hay.slice(0, at + 1).trim().split(" ").filter(Boolean).length;
      const formWords = f.trim().split(" ").length;
      score = Math.max(score, formWords * 100 + f.length);
      matchedAt = Math.max(matchedAt, wordsBefore + formWords - 1);
      firstAt = Math.min(firstAt, wordsBefore);
    }
    if (score === -Infinity) continue;
    if (!e.accessoryLeaf && matchedAt !== -1 && accessoryAfter(matchedAt)) score -= 10_000;
    if (score > bestScore || (score === bestScore && firstAt < bestAt)) {
      bestScore = score;
      bestAt = firstAt;
      best = e;
    }
  }
  if (!best || bestScore < 0) return null;
  return best.leaf;
}

/** Test hook. */
export function resetClassifierIndex(): void {
  INDEX = null;
}

/* ------------------------------------------------------------------------------------------ */

let cache: { version: number; count: number; targetCountry: string; items: Classified[] } | null = null;
let inflight: Promise<Classified[]> | null = null;

const yieldToMain = () => new Promise<void>((r) => setTimeout(r, 0));

/** Newest copy of every listing (rows are already canonical; this also drops exact duplicates). */
export function latestByKey(all: RawListing[]): Map<string, RawListing> {
  const latest = new Map<string, RawListing>();
  for (const l of all) {
    const k = `${l.market}:${l.id}`;
    const prev = latest.get(k);
    if (!prev || prev.fetchedAt < l.fetchedAt) latest.set(k, l);
  }
  return latest;
}

/** Classifies in chunks so a large catalog never blocks input for long. */
export async function classifyAll(listings: RawListing[], chunk = 400): Promise<Classified[]> {
  const out: Classified[] = [];
  for (let i = 0; i < listings.length; i++) {
    const listing = listings[i]!;
    out.push({ listing, leaf: classifyTitle(listing.title) });
    if (i > 0 && i % chunk === 0 && listings.length > chunk) await yieldToMain();
  }
  return out;
}

/** Forgets the cached classification (tests, imports). */
export function invalidateRealCatalog(): void {
  cache = null;
}

export async function loadRealCatalog(targetCountry = "tr"): Promise<Classified[]> {
  const version = listingsWriteVersion();
  const count = await db.listings.count();
  if (cache && cache.version === version && cache.count === count && cache.targetCountry === targetCountry) return cache.items;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const all = await db.listings.orderBy("fetchedAt").reverse().toArray();
      const latest = latestByKey(all);
      const items = await classifyAll([...latest.values()]);
      // Margin ratios from the last 30 searches' matches.
      const reg = getRegistry();
      const isTarget = (m: string) => reg.get(m as RawListing["market"])?.meta.country === targetCountry;
      const isSource = (m: string) => reg.get(m as RawListing["market"])?.meta.role !== "target";
      const recent = await db.searches.orderBy("startedAt").reverse().limit(30).primaryKeys();
      const matches = recent.length ? await db.matches.where("searchId").anyOf(recent as string[]).toArray() : [];
      const pairs = pairsFromMatches(matches, latest, isTarget, isSource);
      for (const it of items) {
        const p = pairs.get(`${it.listing.market}:${it.listing.id}`);
        if (p) it.margin = p;
      }
      cache = { version, count, targetCountry, items };
      return items;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

export interface CatalogCounts {
  groupCounts: Record<string, number>;
  leafCounts: Record<string, number>;
  classified: number;
  total: number;
}

/** How many listings fall into each group / leaf. Pure. */
export function countsOf(items: Pick<Classified, "leaf">[]): CatalogCounts {
  const groupCounts: Record<string, number> = {};
  const leafCounts: Record<string, number> = {};
  let classified = 0;
  for (const it of items) {
    if (!it.leaf) continue;
    classified++;
    groupCounts[it.leaf.group] = (groupCounts[it.leaf.group] ?? 0) + 1;
    leafCounts[it.leaf.key] = (leafCounts[it.leaf.key] ?? 0) + 1;
  }
  return { groupCounts, leafCounts, classified, total: items.length };
}

export interface RealFeedPage {
  items: RawListing[];
  /** Margin pair per listing key on this page, when known. */
  margins: Record<string, MarginPair>;
  total: number;
  page: number;
  pages: number;
  /** How many listings fall into each group / leaf, for the sidebar. */
  groupCounts: Record<string, number>;
  leafCounts: Record<string, number>;
  /** How many listings carry a margin ratio (the "Marj potansiyeli" sort is hidden when zero). */
  withMargin: number;
}

export function queryRealCatalog(items: Classified[], fq: { q?: string; group?: string; leaf?: string; sort?: SortKey; page?: number; perPage?: number }): RealFeedPage {
  const { groupCounts, leafCounts } = countsOf(items);
  let v = items;
  if (fq.leaf) v = v.filter((it) => it.leaf?.key === fq.leaf);
  else if (fq.group) v = v.filter((it) => it.leaf?.group === fq.group);
  if (fq.q) {
    const q = foldTr(fq.q).trim();
    const raw = fq.q.toLowerCase();
    v = v.filter((it) => foldTr(it.listing.title).includes(q) || it.listing.title.toLowerCase().includes(raw) || (it.leaf !== null && foldTr(it.leaf.tr).includes(q)));
  }
  const withMargin = v.reduce((n, it) => n + (it.margin ? 1 : 0), 0);
  const sort = fq.sort ?? "popular";
  let sorted = v;
  if (sort === "price-asc") sorted = [...v].sort((a, b) => compareDisplayAsc(minDisplay(a.listing), minDisplay(b.listing)));
  else if (sort === "price-desc") sorted = [...v].sort((a, b) => compareDisplayAsc(minDisplay(b.listing), minDisplay(a.listing)));
  else if (sort === "margin") sorted = [...v].sort((a, b) => (b.margin?.ratio ?? -1) - (a.margin?.ratio ?? -1) || (a.listing.fetchedAt < b.listing.fetchedAt ? 1 : -1));
  else sorted = [...v].sort((a, b) => (b.listing.sold ?? 0) * (b.listing.rating ?? 4) - (a.listing.sold ?? 0) * (a.listing.rating ?? 4) || (a.listing.fetchedAt < b.listing.fetchedAt ? 1 : -1));
  const perPage = fq.perPage ?? 30;
  const pages = Math.max(1, Math.ceil(sorted.length / perPage));
  const page = Math.min(Math.max(1, fq.page ?? 1), pages);
  const slice = sorted.slice((page - 1) * perPage, page * perPage);
  const margins: Record<string, MarginPair> = {};
  for (const it of slice) if (it.margin) margins[`${it.listing.market}:${it.listing.id}`] = it.margin;
  return { items: slice.map((it) => it.listing), margins, total: sorted.length, page, pages, groupCounts, leafCounts, withMargin };
}
