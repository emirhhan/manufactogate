import type { MarketAdapter, MarketId } from "@manufactogate/core";
import { REAL_DEFS } from "@manufactogate/adapters";

/**
 * Visual identity per market: one chip colour per marketplace so a grid mixing Alibaba, eBay,
 * Amazon and Noon reads at a glance. Classes are Tailwind palette utilities (not theme tokens)
 * because these are brand-ish identities, not state colours. Unknown markets get the accent.
 */
const TONE: Record<string, string> = {
  "cn-1688": "bg-orange-600",
  "cn-taobao": "bg-amber-500",
  "cn-pinduoduo": "bg-red-600",
  "cn-alibaba": "bg-orange-500",
  "cn-aliexpress": "bg-rose-600",
  "cn-dhgate": "bg-yellow-600",
  "cn-yiwugo": "bg-red-500",
  "cn-madeinchina": "bg-red-700",
  "cn-globalsources": "bg-blue-700",
  "tr-trendyol": "bg-orange-500",
  "tr-hepsiburada": "bg-orange-400",
  "tr-n11": "bg-purple-600",
  "tr-amazon": "bg-slate-700",
  "de-amazon": "bg-slate-600",
  "gb-amazon": "bg-slate-600",
  "us-amazon": "bg-slate-700",
  "us-ebay": "bg-blue-600",
  "us-temu": "bg-orange-600",
  "us-walmart": "bg-blue-500",
  "ae-noon": "bg-yellow-500",
  "ru-ozon": "bg-sky-600",
  "ru-wildberries": "bg-fuchsia-700",
  "in-indiamart": "bg-emerald-700",
  "in-tradeindia": "bg-emerald-600",
  "id-tokopedia": "bg-green-600",
  "id-shopee": "bg-orange-500",
  "th-lazada": "bg-indigo-600",
  "jp-rakuten": "bg-red-600",
  "us-mercari": "bg-rose-500",
  "jp-yahooauctions": "bg-red-500",
  "kr-coupang": "bg-pink-600",
  "kr-gmarket": "bg-lime-600",
};

export function marketTone(id: string): string {
  return TONE[id] ?? "bg-accent";
}

/** Short label for dense cells ("1688", "HB", "AMZ TR"). */
const SHORT: Record<string, string> = {
  "cn-1688": "1688",
  "cn-taobao": "Taobao",
  "cn-pinduoduo": "PDD",
  "cn-alibaba": "Alibaba",
  "cn-aliexpress": "AliExp",
  "cn-dhgate": "DHgate",
  "cn-yiwugo": "Yiwugo",
  "cn-madeinchina": "MIC",
  "cn-globalsources": "GS",
  "tr-trendyol": "TY",
  "tr-hepsiburada": "HB",
  "tr-n11": "n11",
  "tr-amazon": "AMZ TR",
  "de-amazon": "AMZ DE",
  "gb-amazon": "AMZ UK",
  "us-amazon": "AMZ US",
  "us-ebay": "eBay",
  "us-temu": "Temu",
  "us-walmart": "Walmart",
  "ae-noon": "Noon",
  "ru-ozon": "Ozon",
  "ru-wildberries": "WB",
  "in-indiamart": "IndiaMART",
  "in-tradeindia": "TradeIndia",
  "id-tokopedia": "Tokopedia",
  "id-shopee": "Shopee",
  "th-lazada": "Lazada",
  "jp-rakuten": "Rakuten",
  "us-mercari": "Mercari",
  "jp-yahooauctions": "Yahoo",
  "kr-coupang": "Coupang",
  "kr-gmarket": "Gmarket",
};
export function marketShort(id: string): string {
  return SHORT[id] ?? id.split("-").slice(1).join("-").toUpperCase();
}

/** Beta adapters: generic card extraction, not yet verified live. */
export function isBeta(a: Pick<MarketAdapter, "meta"> | undefined): boolean {
  return !!a && a.meta.version.includes("beta");
}

/** Store/seller page templates per market, for the "satan var mı" seller list. */
const STORE_URL: Record<string, (id: string) => string> = {
  "tr-trendyol": (id) => `https://www.trendyol.com/magaza/-m-${encodeURIComponent(id)}`,
  "tr-hepsiburada": (id) => `https://www.hepsiburada.com/magaza/${encodeURIComponent(id)}`,
  "tr-n11": (id) => `https://www.n11.com/magaza/${encodeURIComponent(id)}`,
  "cn-1688": (id) => `https://${encodeURIComponent(id)}.1688.com/`,
  "cn-taobao": (id) => `https://shop${encodeURIComponent(id)}.taobao.com/`,
  "cn-alibaba": (id) => `https://${encodeURIComponent(id)}.en.alibaba.com/`,
  "cn-aliexpress": (id) => `https://www.aliexpress.com/store/${encodeURIComponent(id)}`,
  "us-ebay": (id) => `https://www.ebay.com/usr/${encodeURIComponent(id)}`,
  "us-amazon": (id) => `https://www.amazon.com/s?me=${encodeURIComponent(id)}`,
  "tr-amazon": (id) => `https://www.amazon.com.tr/s?me=${encodeURIComponent(id)}`,
  "de-amazon": (id) => `https://www.amazon.de/s?me=${encodeURIComponent(id)}`,
  "gb-amazon": (id) => `https://www.amazon.co.uk/s?me=${encodeURIComponent(id)}`,
  "id-tokopedia": (id) => `https://www.tokopedia.com/${encodeURIComponent(id)}`,
  "ru-ozon": (id) => `https://www.ozon.ru/seller/${encodeURIComponent(id)}`,
  "ru-wildberries": (id) => `https://www.wildberries.ru/seller/${encodeURIComponent(id)}`,
};

/** URL of a seller's store page when the market has a known template and we know the seller id. */
export function storeUrl(market: MarketId | string, supplierId: string | undefined): string | null {
  if (!supplierId) return null;
  const f = STORE_URL[market];
  return f ? f(supplierId) : null;
}

/** "Mağaza #1234" style fallback name for sellers whose name the market hides on search cards. */
export function sellerDisplayName(l: { supplierName?: string | undefined; supplierId?: string | undefined }): string | null {
  if (l.supplierName) return l.supplierName;
  if (l.supplierId) return `Mağaza #${l.supplierId}`;
  return null;
}

/**
 * Market ids that were renamed; stored settings (enabled markets, compare sets) are mapped on
 * load so a rename never silently drops a market the user had turned on.
 * `jp-mercari` → `us-mercari`: the Mercari adapter has always been the US site (USD, English).
 */
export const LEGACY_MARKET_IDS: Record<string, MarketId> = { "jp-mercari": "us-mercari" };

/** Current id of a possibly legacy market id. Pure. */
export function migrateMarketId(id: string): MarketId {
  return LEGACY_MARKET_IDS[id] ?? (id as MarketId);
}

/** Maps legacy ids in a list, dropping duplicates the rename produced. Pure. */
export function migrateMarketIds(ids: readonly string[]): MarketId[] {
  const out: MarketId[] = [];
  for (const id of ids) {
    const m = migrateMarketId(id);
    if (!out.includes(m)) out.push(m);
  }
  return out;
}

/**
 * Recognises a listing URL with the live registry first and the real market definitions second,
 * so a link handed over before the extension is detected (overlay → `/?link=`) still routes to the
 * listing page instead of a text search. Pure apart from the registry read.
 */
export function resolveAnyMarket(url: string, reg: { resolve(u: string): { adapter: Pick<MarketAdapter, "id"> } | null }): { adapter: { id: MarketId } } | null {
  const live = reg.resolve(url);
  if (live) return { adapter: { id: live.adapter.id } };
  const def = REAL_DEFS.find((d) => !!d.resolveLink(url));
  return def ? { adapter: { id: def.id } } : null;
}

export type LinkRoute = { kind: "listing"; to: string; market: MarketId } | { kind: "text"; query: string };

/**
 * Where a URL handed to the app (extension overlay `/?link=`, pasted links) should go: a listing
 * the registry recognises opens through `/l/resolve/<url>?compare=1` (the Listing page fetches the
 * detail and starts the comparison); anything else becomes a plain text search with the URL as
 * the query, like the search box does. Pure; `resolve` is `getRegistry().resolve`.
 */
export function linkRoute(raw: string, resolve: (url: string) => { adapter: Pick<MarketAdapter, "id"> } | null): LinkRoute | null {
  const url = raw.trim();
  if (!/^https?:\/\/\S+$/i.test(url)) return null;
  const hit = resolve(url);
  if (hit) return { kind: "listing", to: `/l/resolve/${encodeURIComponent(url)}?compare=1`, market: hit.adapter.id };
  return { kind: "text", query: url };
}
