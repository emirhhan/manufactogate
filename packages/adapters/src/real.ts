import type { MarketAdapter, MarketId } from "@manufactogate/core";
import { def1688 } from "./cn-1688";
import { defPinduoduo } from "./cn-pinduoduo";
import { defTaobao } from "./cn-taobao";
import { AdapterRegistry } from "./registry";
import { createRealAdapter, type PageExtractor, type PageRunner, type RealMarketDef } from "./runtime";
import { defTrendyol } from "./tr-trendyol";
import { WAVE2_DEFS } from "./wave2";
import { WAVE3_DEFS } from "./wave3";

/** Wave-1 markets are calibrated against live pages; wave-2 markets are beta (generic card extraction). */
export const REAL_DEFS: RealMarketDef[] = [def1688, defTaobao, defPinduoduo, defTrendyol, ...WAVE2_DEFS, ...WAVE3_DEFS];
export const WAVE1_IDS = new Set<MarketId>(["cn-1688", "cn-taobao", "cn-pinduoduo", "tr-trendyol"]);

/** Page-side extractors keyed by market, bundled into the extension's extract script. */
export const PAGE_EXTRACTORS: Record<MarketId, PageExtractor> = Object.fromEntries(REAL_DEFS.map((d) => [d.id, d.extractor])) as Record<MarketId, PageExtractor>;

/** Market definitions keyed by id (URLs, link resolvers, mappers). */
export const REAL_DEF_BY_ID: Record<MarketId, RealMarketDef> = Object.fromEntries(REAL_DEFS.map((d) => [d.id, d])) as Record<MarketId, RealMarketDef>;

/** Hosts the extension needs permission for. */
export const REAL_HOSTS: string[] = [...new Set(REAL_DEFS.flatMap((d) => d.meta.hosts))];

/** Registry of real adapters driven by a PageRunner (the extension). */
export function createRealRegistry(runner: PageRunner): AdapterRegistry {
  const r = new AdapterRegistry();
  for (const def of REAL_DEFS) r.register(createRealAdapter(def, runner));
  return r;
}

export function createRealAdapterFor(id: MarketId, runner: PageRunner): MarketAdapter | undefined {
  const def = REAL_DEF_BY_ID[id];
  return def ? createRealAdapter(def, runner) : undefined;
}
