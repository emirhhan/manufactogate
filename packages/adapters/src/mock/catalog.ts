import { matchesTr, type MarketId, type PriceTier, type RawListing } from "@manufactogate/core";

/**
 * Deterministic catalog of 1000+ products across 12 categories. Every product exists on
 * every wave-1 market with market-specific pricing, so the feed, clustering and the
 * price-chain views have realistic data until real adapters land.
 */

import { getLeaves, TAXONOMY } from "./taxonomy";

export { TAXONOMY, getLeaves, getLeaf, slug } from "./taxonomy";
export type { CategoryGroup, Leaf } from "./taxonomy";

export interface Category {
  key: string;
  tr: string;
  zh: string;
}

/** Top-level groups, for compatibility with callers that only need the coarse split. */
export const CATEGORIES: Category[] = TAXONOMY.map((g) => ({ key: g.key, tr: g.tr, zh: g.zh }));

/** Price and weight bands per group, CNY and kg; products inside a leaf are spread within the band. */
const BANDS: Record<string, [minCny: number, maxCny: number, minKg: number, maxKg: number]> = {
  electronics: [4, 160, 0.03, 0.9],
  computer: [8, 420, 0.1, 6],
  home: [5, 90, 0.1, 2.5],
  kitchen: [25, 260, 0.4, 4],
  appliances: [40, 480, 0.6, 8],
  "fashion-women": [9, 95, 0.1, 0.9],
  "fashion-men": [11, 120, 0.15, 1],
  shoes: [8, 140, 0.2, 1.2],
  bags: [3, 160, 0.05, 3.5],
  accessories: [2, 60, 0.02, 0.4],
  beauty: [6, 110, 0.05, 0.9],
  health: [12, 220, 0.1, 2],
  sports: [8, 320, 0.1, 12],
  motorcycle: [12, 420, 0.1, 9],
  auto: [6, 380, 0.05, 12],
  tools: [6, 360, 0.1, 10],
  garden: [5, 240, 0.1, 9],
  toys: [6, 160, 0.1, 3],
  baby: [8, 300, 0.1, 7],
  pet: [6, 120, 0.1, 2.5],
  office: [5, 450, 0.1, 28],
  industrial: [4, 900, 0.1, 40],
};

const STYLES: { zh: string; tr: string; en: string; mult: number }[] = [
  { zh: "", tr: "", en: "", mult: 1 },
  { zh: "升级款", tr: "Pro", en: "Pro", mult: 1.3 },
  { zh: "套装", tr: "Set", en: "Set", mult: 1.7 },
];
const VARIANTS: { zh: string; tr: string; en: string; mult: number }[] = [
  { zh: "", tr: "", en: "", mult: 1 },
  { zh: "黑色", tr: "Siyah", en: "Black", mult: 1 },
  { zh: "白色", tr: "Beyaz", en: "White", mult: 1.03 },
];

export interface CatalogProduct {
  id: string;
  /** Leaf category key. */
  category: string;
  /** Group key. */
  group: string;
  templateKey: string;
  /** Leaf category names, for display and supplier naming. */
  leafTr: string;
  leafZh: string;
  model: string;
  titles: { zh: string; tr: string; en: string };
  image: string;
  baseCny: number;
  weightKg: number;
  /** Deterministic popularity 0..1, drives sold counts and default sort. */
  popularity: number;
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967296;
}

let cache: CatalogProduct[] | null = null;

export function getCatalog(): CatalogProduct[] {
  if (cache) return cache;
  const out: CatalogProduct[] = [];
  for (const leaf of getLeaves()) {
    const [minC, maxC, minKg, maxKg] = BANDS[leaf.group] ?? [5, 100, 0.1, 1];
    const h = hash(leaf.key);
    const base = Math.round((minC + (maxC - minC) * h ** 1.6) * 100) / 100;
    const kg = Math.round((minKg + (maxKg - minKg) * h ** 1.4) * 100) / 100;
    const prefix = leaf.tr
      .split(" ")
      .map((w) => slugFirst(w))
      .join("")
      .slice(0, 3)
      .toUpperCase();
    let i = 0;
    for (const st of STYLES) {
      for (const v of VARIANTS) {
        i++;
        const id = `${leaf.key}-${i}`;
        const model = `${prefix}-${100 + ((h * 900) | 0)}${i > 1 ? `-${i}` : ""}`;
        const sfx = (a: string, b: string) => `${a ? ` ${a}` : ""}${b ? ` ${b}` : ""}`;
        out.push({
          id,
          category: leaf.key,
          group: leaf.group,
          templateKey: leaf.key,
          leafTr: leaf.tr,
          leafZh: leaf.zh,
          model,
          titles: {
            zh: `${model} ${leaf.zh}${sfx(st.zh, v.zh)}`,
            tr: `${model} ${leaf.tr}${sfx(st.tr, v.tr)}`,
            en: `${model} ${leaf.tr}${sfx(st.en, v.en)}`,
          },
          image: `https://picsum.photos/seed/${id}/480/480`,
          baseCny: Math.round(base * st.mult * v.mult * 100) / 100,
          weightKg: kg,
          popularity: hash(id + "pop"),
        });
      }
    }
  }
  cache = out;
  return out;
}

function slugFirst(w: string): string {
  const m: Record<string, string> = { ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u", İ: "i", Ç: "c", Ğ: "g", Ö: "o", Ş: "s", Ü: "u" };
  return (w[0] ?? "").replace(/[çğıöşüİÇĞÖŞÜ]/g, (c) => m[c] ?? c);
}

export function productsInLeaf(leafKey: string): CatalogProduct[] {
  return getCatalog().filter((p) => p.category === leafKey);
}

export function productsInGroup(groupKey: string): CatalogProduct[] {
  return getCatalog().filter((p) => p.group === groupKey);
}

export function leafCounts(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of getCatalog()) out[p.category] = (out[p.category] ?? 0) + 1;
  return out;
}

export function getProduct(id: string): CatalogProduct | undefined {
  return getCatalog().find((p) => p.id === id);
}

export const MARKET_PROFILE: Record<string, { lang: "zh" | "tr" | "en"; currency: string; mult: number; moq: number; tiers: boolean }> = {
  "cn-1688": { lang: "zh", currency: "CNY", mult: 1, moq: 50, tiers: true },
  "cn-taobao": { lang: "zh", currency: "CNY", mult: 1.9, moq: 1, tiers: false },
  "cn-pinduoduo": { lang: "zh", currency: "CNY", mult: 1.5, moq: 1, tiers: false },
  "tr-trendyol": { lang: "tr", currency: "TRY", mult: 5 * 3.2, moq: 1, tiers: false },
  "cn-alibaba": { lang: "en", currency: "USD", mult: 0.16, moq: 100, tiers: true },
  "cn-aliexpress": { lang: "en", currency: "USD", mult: 0.3, moq: 1, tiers: false },
  "tr-hepsiburada": { lang: "tr", currency: "TRY", mult: 5 * 3.3, moq: 1, tiers: false },
  "tr-n11": { lang: "tr", currency: "TRY", mult: 5 * 3.1, moq: 1, tiers: false },
  "tr-amazon": { lang: "tr", currency: "TRY", mult: 5 * 3.4, moq: 1, tiers: false },
  "cn-dhgate": { lang: "en", currency: "USD", mult: 0.28, moq: 2, tiers: true },
  "cn-madeinchina": { lang: "en", currency: "USD", mult: 0.17, moq: 100, tiers: true },
  "cn-globalsources": { lang: "en", currency: "USD", mult: 0.18, moq: 100, tiers: true },
  "cn-yiwugo": { lang: "zh", currency: "CNY", mult: 0.95, moq: 10, tiers: true },
  "in-indiamart": { lang: "en", currency: "INR", mult: 14, moq: 50, tiers: false },
  "in-tradeindia": { lang: "en", currency: "INR", mult: 15, moq: 50, tiers: false },
  "id-tokopedia": { lang: "en", currency: "IDR", mult: 2300, moq: 1, tiers: false },
  "id-shopee": { lang: "en", currency: "IDR", mult: 2200, moq: 1, tiers: false },
  "th-lazada": { lang: "en", currency: "THB", mult: 5.2, moq: 1, tiers: false },
  "jp-rakuten": { lang: "en", currency: "JPY", mult: 24, moq: 1, tiers: false },
  "us-mercari": { lang: "en", currency: "USD", mult: 0.42, moq: 1, tiers: false },
  "jp-yahooauctions": { lang: "en", currency: "JPY", mult: 14, moq: 1, tiers: false },
  "kr-coupang": { lang: "en", currency: "KRW", mult: 210, moq: 1, tiers: false },
  "kr-gmarket": { lang: "en", currency: "KRW", mult: 200, moq: 1, tiers: false },
  "de-amazon": { lang: "en", currency: "EUR", mult: 0.42, moq: 1, tiers: false },
  "us-amazon": { lang: "en", currency: "USD", mult: 0.48, moq: 1, tiers: false },
  "us-ebay": { lang: "en", currency: "USD", mult: 0.4, moq: 1, tiers: false },
  "us-walmart": { lang: "en", currency: "USD", mult: 0.45, moq: 1, tiers: false },
  "us-temu": { lang: "en", currency: "USD", mult: 0.3, moq: 1, tiers: false },
  "ae-noon": { lang: "en", currency: "AED", mult: 1.7, moq: 1, tiers: false },
  "ru-ozon": { lang: "en", currency: "RUB", mult: 40, moq: 1, tiers: false },
  "ru-wildberries": { lang: "en", currency: "RUB", mult: 38, moq: 1, tiers: false },
  "gb-amazon": { lang: "en", currency: "GBP", mult: 0.36, moq: 1, tiers: false },
};

const round = (n: number) => Math.round(n * 100) / 100;

function tiersFor(base: number, moq: number, withTiers: boolean): PriceTier[] {
  if (!withTiers) return [{ minQty: moq, unitPrice: round(base) }];
  return [
    { minQty: moq, unitPrice: round(base) },
    { minQty: moq * 10, unitPrice: round(base * 0.88) },
    { minQty: moq * 40, unitPrice: round(base * 0.78) },
  ];
}

/** The listing of a catalog product on a given market. Deterministic. */
export function listingFor(p: CatalogProduct, market: MarketId, fetchedAt = "2026-10-01T00:00:00Z"): RawListing | null {
  const mp = MARKET_PROFILE[market];
  if (!mp) return null;
  const h = hash(p.id + market);
  const price = p.baseCny * mp.mult * (0.92 + h * 0.16);
  const isFactory = market === "cn-1688" && h < 0.45;
  const strong = h > 0.3;
  const badges =
    market === "cn-1688"
      ? [...(isFactory ? ["源头工厂", "深度验厂"] : []), ...(strong ? ["实力商家"] : []), ...(h > 0.7 ? ["跨境专供"] : [])]
      : market === "cn-taobao"
        ? h > 0.6 ? ["旗舰店"] : h > 0.4 ? ["金牌卖家"] : []
        : market === "cn-pinduoduo"
          ? h > 0.5 ? ["百亿补贴"] : []
          : h > 0.5 ? ["Hızlı Teslimat"] : [];
  return {
    market,
    id: p.id,
    url: `https://${market}.example/item/${p.id}`,
    title: p.titles[mp.lang],
    images: [p.image],
    price: { currency: mp.currency, tiers: tiersFor(price, mp.moq, mp.tiers) },
    moq: mp.moq,
    sold: Math.round(p.popularity * (market === "cn-pinduoduo" ? 20000 : market === "cn-taobao" ? 8000 : market === "tr-trendyol" ? 3000 : 1500)),
    rating: round(4.3 + h * 0.7),
    supplierId: `${market}-sup-${p.templateKey}-${isFactory ? "f" : "t"}`,
    supplierName: isFactory
      ? `深圳市${p.leafZh}实业有限公司`
      : market === "tr-trendyol"
        ? `${p.leafTr.split(" ")[0]} Store`
        : `义乌市${p.leafZh}商贸有限公司`,
    location: isFactory ? "广东 深圳" : market === "tr-trendyol" ? "İstanbul" : "浙江 义乌",
    badges,
    fetchedAt,
  };
}

/** Search the catalog by text across all languages, id and model. */
export function searchCatalog(query: string, opts: { leaf?: string; group?: string } = {}): CatalogProduct[] {
  const q = query.trim();
  const leafByKey = new Map(getLeaves().map((l) => [l.key, l]));
  return getCatalog().filter((p) => {
    if (opts.leaf && p.category !== opts.leaf) return false;
    if (opts.group && p.group !== opts.group) return false;
    if (!q) return true;
    const leaf = leafByKey.get(p.category);
    return matchesTr(`${p.id} ${p.model} ${p.titles.zh} ${p.titles.tr} ${p.titles.en} ${leaf?.tr ?? ""} ${leaf?.zh ?? ""}`, q);
  });
}
