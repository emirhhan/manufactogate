import type { MarketAdapter } from "@manufactogate/core";
import { BADGES_1688, BADGES_PINDUODUO, BADGES_TAOBAO, BADGES_TRENDYOL } from "./badges";
import { META_1688, META_PINDUODUO, META_TAOBAO, META_TRENDYOL } from "./markets";
import { createMockAdapter, type MockOptions } from "./mock/mockAdapter";
import { AdapterRegistry } from "./registry";

export * from "./registry";
export * from "./badges";
export * from "./markets";
export * from "./mock/mockAdapter";
export { MOCK_PRODUCTS } from "./mock/data";

/** Sprint 0: all four wave-1 markets backed by the mock adapter. */
export function createMockRegistry(opts: Partial<Record<string, MockOptions>> = {}): AdapterRegistry {
  const r = new AdapterRegistry();
  const mk = (id: MarketAdapter["id"], meta: typeof META_1688, badges: typeof BADGES_1688) =>
    r.register(createMockAdapter(id, meta, badges, opts[id] ?? {}));
  mk("cn-1688", META_1688, BADGES_1688);
  mk("cn-taobao", META_TAOBAO, BADGES_TAOBAO);
  mk("cn-pinduoduo", META_PINDUODUO, BADGES_PINDUODUO);
  mk("tr-trendyol", META_TRENDYOL, BADGES_TRENDYOL);
  return r;
}
